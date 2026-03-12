-- ============================================================
-- LANDING TOKENS — Endpoint Multimodal para Landing Pages
-- ============================================================
-- Cada token encapsula empresa_id + pipeline_id + etapa_id
-- para que una landing page solo envíe ?token=xxx + datos del lead
-- sin necesidad de exponer IDs internos.
-- ============================================================

CREATE TABLE IF NOT EXISTS landing_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES pipeline(id) ON DELETE CASCADE,
  etapa_id uuid NOT NULL REFERENCES etapas(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  nombre text NOT NULL,                    -- etiqueta descriptiva: "Landing Ferrer", "Web Principal"
  active boolean NOT NULL DEFAULT true,
  prioridad_default text DEFAULT 'medium', -- prioridad asignada a leads creados con este token
  asignado_a uuid DEFAULT '00000000-0000-0000-0000-000000000000', -- usuario por defecto al que se asigna
  empresa_label text DEFAULT 'Landing',    -- valor por defecto para el campo "empresa" del lead
  metadata jsonb DEFAULT '{}',             -- config extra (utm_source, notas, etc.)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Índices para búsqueda rápida por token y por empresa
CREATE INDEX IF NOT EXISTS idx_landing_tokens_token ON landing_tokens(token);
CREATE INDEX IF NOT EXISTS idx_landing_tokens_empresa ON landing_tokens(empresa_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE landing_tokens ENABLE ROW LEVEL SECURITY;

-- SELECT: owner o miembros de la empresa
CREATE POLICY landing_tokens_select ON landing_tokens
  FOR SELECT TO authenticated
  USING (
    empresa_id IN (SELECT id FROM empresa WHERE usuario_id = auth.uid())
    OR empresa_id IN (SELECT empresa_id FROM empresa_miembros WHERE usuario_id = auth.uid())
  );

-- INSERT/UPDATE/DELETE: owner o miembros
CREATE POLICY landing_tokens_mutation ON landing_tokens
  FOR ALL TO authenticated
  USING (
    empresa_id IN (SELECT id FROM empresa WHERE usuario_id = auth.uid())
    OR empresa_id IN (SELECT empresa_id FROM empresa_miembros WHERE usuario_id = auth.uid())
  )
  WITH CHECK (
    empresa_id IN (SELECT id FROM empresa WHERE usuario_id = auth.uid())
    OR empresa_id IN (SELECT empresa_id FROM empresa_miembros WHERE usuario_id = auth.uid())
  );

-- ============================================================
-- Función helper para generar tokens aleatorios legibles
-- ============================================================
CREATE OR REPLACE FUNCTION generate_landing_token()
RETURNS text AS $$
DECLARE
  new_token text;
  token_exists boolean;
BEGIN
  LOOP
    -- Generar token tipo: lt_xxxxxxxxxxxx (12 chars hex)
    new_token := 'lt_' || encode(gen_random_bytes(12), 'hex');
    SELECT EXISTS(SELECT 1 FROM landing_tokens WHERE token = new_token) INTO token_exists;
    EXIT WHEN NOT token_exists;
  END LOOP;
  RETURN new_token;
END;
$$ LANGUAGE plpgsql;
