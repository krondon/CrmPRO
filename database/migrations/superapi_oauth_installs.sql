-- ============================================================================
-- Migración: superapi_installs
-- ----------------------------------------------------------------------------
-- Guarda los access_token OAuth obtenidos al conectar el CRM con SuperAPI
-- siguiendo el flujo del documento "SuperAPI · OAuth Integration Guide".
--
-- Modelo: una install por empresa. Si el usuario re-autoriza, se actualiza
-- la misma fila (la doc indica "Si el usuario re-autoriza, se actualiza la
-- install existente").
--
-- Webhooks entrantes de SuperAPI se siguen guardando en la tabla existente
-- `webhooks_entrantes` (con provider='superapi'), no en una tabla aparte.
--
-- IMPORTANTE: el access_token queda en texto plano protegido únicamente por
-- RLS. Inserciones/lecturas server-side deben usar service_role. Para una
-- versión endurecida en producción, considerar cifrado a nivel de aplicación
-- antes de insertar (igual que `integracion_credenciales.value`).
-- ============================================================================

create table if not exists superapi_installs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,

  -- Credenciales OAuth obtenidas tras el intercambio code → token
  access_token text not null,
  token_type text not null default 'Bearer',
  scopes text[] not null default '{}',           -- ej: {instances.read, messages.send, messages.receive}
  instance_ids text[] not null default '{}',     -- IDs SuperAPI autorizados en este install

  -- Contexto del usuario que autorizó
  superapi_user_email text,                      -- email pasado al /oauth/authorize

  -- Ciclo de vida del token
  expires_at timestamptz,                        -- null = no expira (la app no pidió ttl)
  revoked_at timestamptz,                        -- null = activo; not null = revocado por usuario o admin
  last_used_at timestamptz,                      -- updated por la edge function en cada llamada

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Una sola install por empresa (re-autorización actualiza la fila existente)
  constraint uq_superapi_install_empresa unique (empresa_id)
);

-- Índice parcial: lookups frecuentes de "install activa de esta empresa"
create index if not exists idx_superapi_installs_active
  on superapi_installs (empresa_id)
  where revoked_at is null;

-- Índice GIN para buscar por instance_id (necesario en el handler de webhooks
-- cuando llega un evento y hay que mapearlo al install correcto)
create index if not exists idx_superapi_installs_instance_ids
  on superapi_installs using gin (instance_ids);

-- ============================================================================
-- Trigger updated_at
-- ============================================================================

create or replace function set_updated_at_superapi_installs()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_superapi_installs_updated_at on superapi_installs;
create trigger trg_superapi_installs_updated_at
  before update on superapi_installs
  for each row execute function set_updated_at_superapi_installs();

-- ============================================================================
-- Row Level Security
-- ----------------------------------------------------------------------------
-- Patrón idéntico al usado en `integraciones` y `integracion_credenciales`:
-- solo el dueño de la empresa o sus miembros pueden ver/gestionar su install.
-- ============================================================================

alter table superapi_installs enable row level security;

create policy superapi_installs_select on superapi_installs
  for select to authenticated
  using (
    empresa_id in (select id from empresa where usuario_id = auth.uid())
    or empresa_id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
  );

create policy superapi_installs_mutation on superapi_installs
  for all to authenticated
  using (
    empresa_id in (select id from empresa where usuario_id = auth.uid())
    or empresa_id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
  )
  with check (
    empresa_id in (select id from empresa where usuario_id = auth.uid())
    or empresa_id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
  );

-- Nota: las edge functions del servidor usan service_role, que bypassa RLS.
-- Las políticas anteriores son para llamadas desde el cliente del CRM (UI).
