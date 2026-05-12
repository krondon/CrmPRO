-- ============================================================
-- Meta WhatsApp Cloud API: credentials + follow-up templates
--
-- meta_configs:         credenciales Cloud API por empresa
-- meta_follow_up_templates: plantillas HSM aprobadas en Meta
--                           que el equipo elige usar como seguimiento
-- ============================================================

create table if not exists meta_configs (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references empresa(id) on delete cascade,
  label           text,
  phone_number_id text not null,
  waba_id         text not null,
  access_token    text not null,
  display_phone   text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  unique (empresa_id, phone_number_id)
);

create index if not exists idx_meta_configs_empresa
  on meta_configs (empresa_id);

alter table meta_configs enable row level security;

create policy "Company members can manage meta_configs"
  on meta_configs
  for all
  using (
    empresa_id in (
      select empresa_id from empresa_miembros where usuario_id = auth.uid()
      union
      select id from empresa where usuario_id = auth.uid()
    )
  );

create table if not exists meta_follow_up_templates (
  id                    uuid primary key default gen_random_uuid(),
  empresa_id            uuid not null references empresa(id) on delete cascade,
  meta_config_id        uuid not null references meta_configs(id) on delete cascade,
  meta_template_name    text not null,
  meta_template_language text not null default 'es',
  meta_template_category text,
  display_label         text,
  body_preview          text,
  has_variables         boolean not null default false,
  active                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz,
  unique (meta_config_id, meta_template_name, meta_template_language)
);

create index if not exists idx_meta_follow_up_templates_empresa
  on meta_follow_up_templates (empresa_id);

create index if not exists idx_meta_follow_up_templates_config
  on meta_follow_up_templates (meta_config_id);

alter table meta_follow_up_templates enable row level security;

create policy "Company members can manage meta_follow_up_templates"
  on meta_follow_up_templates
  for all
  using (
    empresa_id in (
      select empresa_id from empresa_miembros where usuario_id = auth.uid()
      union
      select id from empresa where usuario_id = auth.uid()
    )
  );
