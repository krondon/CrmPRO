-- ============================================================
-- AI Intent Log
-- Audit table: records every intent classification and the
-- actions taken by the ai-intent-detector Edge Function.
-- ============================================================

create table if not exists ai_intent_log (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references empresa(id) on delete cascade,
  lead_id          uuid references lead(id) on delete set null,
  detected_intent  text not null,
  actions_taken    jsonb not null default '[]'::jsonb,
  raw_message      text,
  created_at       timestamptz not null default now()
);

alter table ai_intent_log enable row level security;

create policy "Company members can view ai_intent_log"
  on ai_intent_log
  for select
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

create index if not exists idx_ai_intent_log_empresa_id
  on ai_intent_log (empresa_id);

create index if not exists idx_ai_intent_log_lead_id
  on ai_intent_log (lead_id);

create index if not exists idx_ai_intent_log_created_at
  on ai_intent_log (created_at desc);
