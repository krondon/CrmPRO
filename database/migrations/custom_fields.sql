-- ============================================================
-- Custom Fields for Leads
-- Allows each company to define extra fields (text/number/select)
-- that appear in the lead creation form and detail view.
-- Values are stored in lead.custom_fields (JSONB).
-- ============================================================

-- 1. Add custom_fields column to lead
alter table lead
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

-- 2. Field definitions per company
create table if not exists empresa_custom_fields (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresa(id) on delete cascade,
  nombre      text not null,
  clave       text not null,
  tipo        text not null check (tipo in ('text', 'number', 'select')),
  opciones    jsonb,
  requerido   boolean not null default false,
  orden       integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (empresa_id, clave)
);

-- RLS
alter table empresa_custom_fields enable row level security;

create policy "Company members can manage empresa_custom_fields"
  on empresa_custom_fields
  for all
  using (
    empresa_id in (
      select empresa_id from empresa_miembros where usuario_id = auth.uid()
      union
      select id from empresa where usuario_id = auth.uid()
    )
  );

create index if not exists idx_empresa_custom_fields_empresa_id
  on empresa_custom_fields (empresa_id);
