-- Add ai_model column to ai_automation_config
alter table ai_automation_config
  add column if not exists ai_model text;
