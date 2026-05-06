-- Nuevas columnas para configuración de segundo plano
ALTER TABLE ai_automation_config
  ADD COLUMN IF NOT EXISTS background_time_window    text,
  ADD COLUMN IF NOT EXISTS background_message_limit  integer,
  ADD COLUMN IF NOT EXISTS execution_interval_hours  numeric,
  ADD COLUMN IF NOT EXISTS last_execution_at         timestamptz;

-- Migrar message_limit existente a background_message_limit donde no esté seteado
UPDATE ai_automation_config
SET background_message_limit = message_limit
WHERE message_limit IS NOT NULL
  AND background_message_limit IS NULL;
