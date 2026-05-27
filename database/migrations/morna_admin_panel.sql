-- ============================================================
-- Morna Admin Panel — Fundación (PR 1)
--
-- Tablas + RLS + RPCs para que el equipo de Morna pueda:
--   - Ver todas las empresas/clientes (panel admin).
--   - Más adelante: impersonar usuarios y ejecutar acciones admin.
--
-- Seguridad clave:
--   - morna_staff es la fuente de verdad de "quién es admin de Morna".
--   - RLS estricta: nadie lee morna_staff desde el cliente. Solo se accede
--     vía RPCs SECURITY DEFINER que devuelven datos sanitizados, o vía
--     edge functions con service_role.
--   - Los logs (impersonation_log, admin_actions_log) son inmutables: no
--     hay políticas de UPDATE/DELETE para nadie en el front.
--
-- Seed: el primer staff se inserta manualmente al pie de este archivo
-- (descomentar con el user_id correspondiente) — chicken-and-egg.
-- ============================================================


-- ============================================================
-- 1) morna_staff
-- ============================================================
create table if not exists morna_staff (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users(id) on delete cascade,
  role        text not null check (role in ('super_admin', 'support')),
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  notes       text
);

create index if not exists idx_morna_staff_user_id on morna_staff(user_id);

alter table morna_staff enable row level security;

-- Sin políticas → ningún rol autenticado puede SELECT/INSERT/UPDATE/DELETE.
-- Service role (edge functions) ignora RLS por diseño. Eso es lo que queremos.


-- ============================================================
-- 2) impersonation_log
--
-- Cada vez que un staff entra como cliente, queda registrado.
-- ended_at = null → sesión de impersonación activa.
-- ============================================================
create table if not exists impersonation_log (
  id                uuid primary key default gen_random_uuid(),
  staff_user_id     uuid not null references auth.users(id) on delete set null,
  target_user_id    uuid not null references auth.users(id) on delete set null,
  target_empresa_id uuid references empresa(id) on delete set null,
  reason            text not null check (char_length(reason) >= 10),
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  ip_address        inet,
  user_agent        text
);

create index if not exists idx_imp_log_target_user_active
  on impersonation_log (target_user_id)
  where ended_at is null;

create index if not exists idx_imp_log_staff_recent
  on impersonation_log (staff_user_id, started_at desc);

alter table impersonation_log enable row level security;
-- Sin políticas → idem morna_staff. Solo service_role escribe/lee.


-- ============================================================
-- 3) admin_actions_log
--
-- Auditoría de acciones administrativas (suspend company, change plan,
-- reset password, etc.) realizadas desde el panel Morna.
-- ============================================================
create table if not exists admin_actions_log (
  id                uuid primary key default gen_random_uuid(),
  staff_user_id     uuid not null references auth.users(id) on delete set null,
  action            text not null,
  target_empresa_id uuid references empresa(id) on delete set null,
  target_user_id    uuid references auth.users(id) on delete set null,
  payload           jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists idx_admin_actions_recent
  on admin_actions_log (created_at desc);

create index if not exists idx_admin_actions_empresa
  on admin_actions_log (target_empresa_id, created_at desc);

alter table admin_actions_log enable row level security;
-- Sin políticas → solo service_role.


-- ============================================================
-- 4) RPC is_morna_staff()
--
-- Devuelve el rol del usuario actual ('super_admin' | 'support') si está
-- en morna_staff, o null si no lo está. Pensada para gating de UI: el
-- cliente puede preguntar "soy staff?" sin necesidad de leer la tabla.
--
-- SECURITY DEFINER → corre con permisos del dueño de la función (postgres),
-- pasando por encima de RLS. El SELECT está acotado a auth.uid() así que
-- el caller solo puede consultar SU PROPIO rol, nunca el de otros.
-- ============================================================
create or replace function is_morna_staff()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role
  from morna_staff
  where user_id = auth.uid()
  limit 1;
$$;

revoke all on function is_morna_staff() from public;
grant execute on function is_morna_staff() to authenticated;


-- ============================================================
-- 5) RPC get_active_impersonation()
--
-- Si el usuario actual está siendo "habitado" por un staff (es decir,
-- existe una fila en impersonation_log donde target_user_id = auth.uid()
-- y ended_at is null), devuelve la metadata mínima para que el front
-- pinte el banner "Estás siendo visto por X".
--
-- Si no hay impersonación activa, devuelve cero filas.
--
-- Esta RPC es la que pega cada página al cargar para saber si mostrar
-- el banner — sin esto, el staff podría cerrar la pestaña y olvidar que
-- estaba impersonando.
-- ============================================================
create or replace function get_active_impersonation()
returns table (
  log_id            uuid,
  staff_user_id     uuid,
  staff_email       text,
  target_user_id    uuid,
  target_empresa_id uuid,
  reason            text,
  started_at        timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    il.id                as log_id,
    il.staff_user_id,
    au.email             as staff_email,
    il.target_user_id,
    il.target_empresa_id,
    il.reason,
    il.started_at
  from impersonation_log il
  left join auth.users au on au.id = il.staff_user_id
  where il.target_user_id = auth.uid()
    and il.ended_at is null
  order by il.started_at desc
  limit 1;
$$;

revoke all on function get_active_impersonation() from public;
grant execute on function get_active_impersonation() to authenticated;


-- ============================================================
-- SEED — Primer staff
--
-- El primer registro hay que insertarlo a mano porque sin él nadie puede
-- entrar al panel. Para sembrar tu propio user:
--
--   1) Logueate en el CRM con la cuenta que va a ser admin Morna.
--   2) Ejecuta:
--        select id, email from auth.users where email = 'raicelysperdomo@morna.studio';
--   3) Reemplaza el uuid de abajo y descomenta el INSERT.
--
-- A partir de ese primer staff, se pueden agregar/quitar otros desde el
-- panel (PR 3 - acción admin-add-staff).
-- ============================================================

-- insert into morna_staff (user_id, role, notes)
-- values (
--   '00000000-0000-0000-0000-000000000000',  -- ← reemplazar
--   'super_admin',
--   'Bootstrap inicial'
-- );
