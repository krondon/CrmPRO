-- ============================================================
-- Custom Fields — Descriptions for AI function calling
-- Adds an editable description per field so the AI knows when
-- and why to read/write it. Covers both:
--   1. User-created custom fields (column on empresa_custom_fields)
--   2. Predefined native lead fields (separate overrides table —
--      defaults live in code so we don't have to seed every empresa)
-- ============================================================

-- 1. Description for user-created custom fields
alter table empresa_custom_fields
  add column if not exists descripcion text;

-- 2. Per-empresa overrides for predefined (native) lead fields.
--    field_key is one of: nombre_completo, telefono, correo_electronico,
--    empresa, ubicacion, evento, membresia, presupuesto, prioridad.
--    Defaults are kept in application code; this table only stores
--    the descriptions a user has explicitly customized.
create table if not exists empresa_predefined_field_descriptions (
  empresa_id   uuid not null references empresa(id) on delete cascade,
  field_key    text not null,
  descripcion  text not null,
  updated_at   timestamptz not null default now(),
  primary key (empresa_id, field_key)
);

alter table empresa_predefined_field_descriptions enable row level security;

create policy "Company members can manage predefined field descriptions"
  on empresa_predefined_field_descriptions
  for all
  using (
    empresa_id in (
      select empresa_id from empresa_miembros where usuario_id = auth.uid()
      union
      select id from empresa where usuario_id = auth.uid()
    )
  );

create index if not exists idx_empresa_predefined_field_descriptions_empresa_id
  on empresa_predefined_field_descriptions (empresa_id);
