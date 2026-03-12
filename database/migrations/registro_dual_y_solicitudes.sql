-- =============================================
-- MIGRACIÓN: Registro Dual (Owner / Empleado)
-- Fecha: 2026-03-09
-- =============================================
-- ANÁLISIS DE SEGURIDAD:
-- ✅ Usa IF NOT EXISTS / IF EXISTS para evitar errores si se ejecuta más de una vez
-- ✅ ALTER TABLE ADD COLUMN con defaults seguros — no rompe datos existentes
-- ✅ Búsqueda por código via RPC con SECURITY DEFINER — NO abre tabla empresa
-- ✅ RLS estricto en solicitudes_union (solo solicitante y dueño ven los registros)
-- ✅ Trigger genera códigos solo en INSERT, no modifica registros existentes salvo UPDATE explícito
-- =============================================

BEGIN;

-- 1. Agregar campo account_type a usuarios
-- Los usuarios existentes quedan como 'owner' (comportamiento actual)
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'owner';

-- Agregar constraint separado (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_account_type_check'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_account_type_check
      CHECK (account_type IN ('owner', 'employee'));
  END IF;
END $$;

-- 2. Agregar campo codigo_empresa a empresa
ALTER TABLE empresa
  ADD COLUMN IF NOT EXISTS codigo_empresa TEXT UNIQUE;

-- 3. Función para generar código automáticamente al crear empresa
CREATE OR REPLACE FUNCTION generar_codigo_empresa()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo_empresa IS NULL THEN
    NEW.codigo_empresa := UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Trigger en empresa (solo INSERT)
DROP TRIGGER IF EXISTS trg_generar_codigo_empresa ON empresa;
CREATE TRIGGER trg_generar_codigo_empresa
  BEFORE INSERT ON empresa
  FOR EACH ROW EXECUTE FUNCTION generar_codigo_empresa();

-- 5. Generar códigos para empresas existentes que no tengan
CREATE OR REPLACE FUNCTION asignar_codigos_empresa_faltantes()
RETURNS void AS $$
DECLARE
  v_empresa_id uuid;
  v_codigo text;
BEGIN
  FOR v_empresa_id IN
    SELECT id FROM empresa WHERE codigo_empresa IS NULL
  LOOP
    LOOP
      v_codigo := UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 8));
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM empresa WHERE codigo_empresa = v_codigo
      );
    END LOOP;

    UPDATE empresa
    SET codigo_empresa = v_codigo
    WHERE id = v_empresa_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

SELECT asignar_codigos_empresa_faltantes();
DROP FUNCTION IF EXISTS asignar_codigos_empresa_faltantes();

-- 6. Crear tabla solicitudes_union
CREATE TABLE IF NOT EXISTS solicitudes_union (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  solicitante_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  solicitante_email TEXT NOT NULL,
  solicitante_nombre TEXT,
  mensaje TEXT,
  empresa_id UUID NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  role_asignado TEXT NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ DEFAULT now(),
  responded_at TIMESTAMPTZ,
  responded_by UUID REFERENCES auth.users(id),
  UNIQUE(solicitante_id, empresa_id)
);

-- 7. Habilitar RLS
ALTER TABLE solicitudes_union ENABLE ROW LEVEL SECURITY;

-- 8. Políticas RLS para solicitudes_union
-- El solicitante puede ver sus propias solicitudes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'solicitudes_union' AND policyname = 'solicitudes_select_solicitante'
  ) THEN
    CREATE POLICY solicitudes_select_solicitante ON solicitudes_union
      FOR SELECT USING (solicitante_id = auth.uid());
  END IF;
END $$;

-- El dueño de la empresa puede ver solicitudes de su empresa
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'solicitudes_union' AND policyname = 'solicitudes_select_owner'
  ) THEN
    CREATE POLICY solicitudes_select_owner ON solicitudes_union
      FOR SELECT USING (
        empresa_id IN (SELECT id FROM empresa WHERE usuario_id = auth.uid())
      );
  END IF;
END $$;

-- Cualquier usuario autenticado puede insertar su propia solicitud
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'solicitudes_union' AND policyname = 'solicitudes_insert'
  ) THEN
    CREATE POLICY solicitudes_insert ON solicitudes_union
      FOR INSERT WITH CHECK (solicitante_id = auth.uid());
  END IF;
END $$;

-- Solo el dueño de la empresa puede actualizar (aprobar/rechazar)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'solicitudes_union' AND policyname = 'solicitudes_update_owner'
  ) THEN
    CREATE POLICY solicitudes_update_owner ON solicitudes_union
      FOR UPDATE USING (
        empresa_id IN (SELECT id FROM empresa WHERE usuario_id = auth.uid())
      );
  END IF;
END $$;

-- 9. RPC segura para buscar empresa por código
-- Usa SECURITY DEFINER para leer empresa sin abrir la tabla a todos los usuarios
CREATE OR REPLACE FUNCTION buscar_empresa_por_codigo(p_codigo TEXT)
RETURNS TABLE(id UUID, nombre_empresa TEXT, logo_url TEXT, codigo_empresa TEXT)
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT e.id, e.nombre_empresa, e.logo_url, e.codigo_empresa
  FROM empresa e
  WHERE e.codigo_empresa = UPPER(TRIM(p_codigo));
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION buscar_empresa_por_codigo(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION buscar_empresa_por_codigo(TEXT) TO authenticated;

-- 10. Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_empresa_codigo ON empresa(codigo_empresa);
CREATE INDEX IF NOT EXISTS idx_solicitudes_empresa_status ON solicitudes_union(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_solicitudes_solicitante ON solicitudes_union(solicitante_id);

COMMIT;












