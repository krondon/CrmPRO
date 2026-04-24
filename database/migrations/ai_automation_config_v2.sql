-- Simplify ai_automation_config: add sandbox_prompt and ai_api_key,
-- drop columns that moved to the prompt-based approach.

alter table ai_automation_config
  add column if not exists sandbox_prompt text,
  add column if not exists ai_api_key     text;

-- Remove columns no longer used by the frontend
alter table ai_automation_config
  drop column if exists pipeline_id,
  drop column if exists activation_date_start,
  drop column if exists activation_date_end,
  drop column if exists intent_mappings;
