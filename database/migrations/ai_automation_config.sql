-- ============================================================
-- AI Automation Config
-- Stores AI automation configurations per company.
-- Each config defines an activation window and a set of
-- intent→action mappings evaluated per incoming message.
-- ============================================================

create table if not exists ai_automation_config (
  id                    uuid primary key default gen_random_uuid(),
  empresa_id            uuid not null references empresa(id) on delete cascade,
  nombre                text not null,
  pipeline_id           uuid references pipeline(id) on delete set null,
  is_active             boolean not null default false,
  activation_date_start date,
  activation_date_end   date,
  activation_time_start time,
  activation_time_end   time,
  message_limit         integer check (message_limit > 0),
  intent_mappings       jsonb not null default '[]'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Row Level Security
alter table ai_automation_config enable row level security;

-- Company members (owners + employees) can manage their own configs
create policy "Company members can manage ai_automation_config"
  on ai_automation_config
  for all
  using (
    empresa_id in (
      select empresa_id
      from empresa_miembros
      where usuario_id = auth.uid()
      union
      select id
      from empresa
      where usuario_id = auth.uid()
    )
  );

-- Index for fast lookups per company
create index if not exists idx_ai_automation_config_empresa_id
  on ai_automation_config (empresa_id);

-- Auto-update updated_at
create or replace function update_ai_automation_config_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_ai_automation_config_updated_at
  before update on ai_automation_config
  for each row execute function update_ai_automation_config_updated_at();
