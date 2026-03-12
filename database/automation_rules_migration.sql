-- ============================================================
-- MIGRATION: Automation Rules for Auto-Moving Leads
-- Run this in Supabase SQL Editor
-- ============================================================

-- Table: automation_rules
-- Stores user-defined rules that trigger automated stage changes
CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  pipeline_id UUID REFERENCES pipeline(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,

  -- Trigger type: what event activates the rule
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('message_received', 'tag_added', 'stage_change', 'time_in_stage')),

  -- Trigger config (JSONB, structure depends on trigger_type):
  --   message_received: { "from_stage_id": "uuid|null" }   <- null means any stage
  --   tag_added:        { "tag_name": "string", "from_stage_id": "uuid|null" }
  --   stage_change:     { "from_stage_id": "uuid" }         <- entering this stage triggers it
  --   time_in_stage:    { "stage_id": "uuid", "days": 7 }  <- X days without activity
  trigger_config JSONB NOT NULL DEFAULT '{}',

  -- Action type: what happens when the rule fires
  action_type TEXT NOT NULL DEFAULT 'move_stage' CHECK (action_type IN ('move_stage')),

  -- Action config:
  --   move_stage: { "target_stage_id": "uuid", "target_pipeline_id": "uuid|null" }
  action_config JSONB NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by empresa and pipeline
CREATE INDEX IF NOT EXISTS idx_automation_rules_empresa ON automation_rules(empresa_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_pipeline ON automation_rules(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_trigger ON automation_rules(trigger_type, enabled);

-- Table: automation_logs
-- Audit trail for every rule execution
CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES lead(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL,
  trigger_type TEXT NOT NULL,
  action_taken JSONB NOT NULL,
  -- e.g. { "from_stage_id": "uuid", "to_stage_id": "uuid", "rule_name": "..." }
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_logs_lead ON automation_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_rule ON automation_logs(rule_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_empresa ON automation_logs(empresa_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_created ON automation_logs(created_at DESC);

-- Auto-update updated_at on automation_rules
CREATE OR REPLACE FUNCTION update_automation_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_automation_rules_updated_at
  BEFORE UPDATE ON automation_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_automation_rules_updated_at();

-- RLS Policies
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

-- Allow empresa members to read rules for their empresa
CREATE POLICY "empresa_members_read_rules" ON automation_rules
  FOR SELECT USING (
    empresa_id IN (
      SELECT empresa_id FROM empresa_miembros WHERE usuario_id = auth.uid()
    )
  );

-- Allow admins/owners to insert/update/delete rules
CREATE POLICY "empresa_admins_manage_rules" ON automation_rules
  FOR ALL USING (
    empresa_id IN (
      SELECT empresa_id FROM empresa_miembros
      WHERE usuario_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Allow empresa members to read their logs
CREATE POLICY "empresa_members_read_logs" ON automation_logs
  FOR SELECT USING (
    empresa_id IN (
      SELECT empresa_id FROM empresa_miembros WHERE usuario_id = auth.uid()
    )
  );

-- Service role can insert logs (used by edge functions and engine)
CREATE POLICY "service_role_insert_logs" ON automation_logs
  FOR INSERT WITH CHECK (true);

-- Service role can also insert automation_rules (from edge functions)
CREATE POLICY "service_role_insert_rules" ON automation_rules
  FOR INSERT WITH CHECK (true);

