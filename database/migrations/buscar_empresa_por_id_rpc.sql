-- =============================================
-- MIGRACIÓN: RPC buscar_empresa_por_id
-- Fecha: 2026-03-12
-- Descripción: Permite buscar una empresa por su UUID (id) de forma segura
-- usando SECURITY DEFINER, similar al existente buscar_empresa_por_codigo.
-- Usado por JoinCRMView para que empleados puedan solicitar unirse por ID.
-- =============================================

-- RPC segura: buscar empresa por ID (UUID)
CREATE OR REPLACE FUNCTION buscar_empresa_por_id(p_id UUID)
RETURNS TABLE(id UUID, nombre_empresa TEXT, logo_url TEXT)
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT e.id, e.nombre_empresa, e.logo_url
  FROM empresa e
  WHERE e.id = p_id;
END;
$$ LANGUAGE plpgsql;

-- Revocar acceso público y otorgar solo a usuarios autenticados
REVOKE ALL ON FUNCTION buscar_empresa_por_id(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION buscar_empresa_por_id(UUID) TO authenticated;
