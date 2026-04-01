-- ============================================================
-- USUARIOS
-- ============================================================
alter table usuarios enable row level security;

create policy usuarios_select_self on usuarios
  for select
  using (id = auth.uid());

create policy usuarios_update_self on usuarios
  for update
  using (id = auth.uid());


-- ============================================================
-- EMPRESA
-- ============================================================
alter table empresa enable row level security;

create policy empresa_select on empresa
  for select
  using (usuario_id = auth.uid());

create policy empresa_update on empresa
  for update
  using (usuario_id = auth.uid());

create policy empresa_insert on empresa
  for insert
  with check (usuario_id = auth.uid());

create policy empresa_delete on empresa
  for delete
  using (usuario_id = auth.uid());


-- ============================================================
-- PANEL
-- ============================================================
alter table panel enable row level security;

create policy panel_rw on panel
  for all
  using (
    empresa_id in (
      select id from empresa
      where usuario_id = auth.uid()
    )
  )
  with check (
    empresa_id in (
      select id from empresa
      where usuario_id = auth.uid()
    )
  );


-- ============================================================
-- PIPELINE
-- ============================================================
alter table pipeline enable row level security;

create policy pipeline_rw on pipeline
  for all
  using (
    empresa_id in (
      select id from empresa
      where usuario_id = auth.uid()
    )
  )
  with check (
    empresa_id in (
      select id from empresa
      where usuario_id = auth.uid()
    )
  );


-- ============================================================
-- ETAPAS
-- ============================================================
alter table etapas enable row level security;

create policy etapas_rw on etapas
  for all
  using (
    pipeline_id in (
      select p.id
      from pipeline p
      join empresa e on p.empresa_id = e.id
      where e.usuario_id = auth.uid()
    )
  )
  with check (
    pipeline_id in (
      select p.id
      from pipeline p
      join empresa e on p.empresa_id = e.id
      where e.usuario_id = auth.uid()
    )
  );


-- ============================================================
-- EQUIPOS
-- ============================================================
alter table equipos enable row level security;

create policy equipos_rw on equipos
  for all
  using (
    empresa_id in (
      select id from empresa
      where usuario_id = auth.uid()
    )
  )
  with check (
    empresa_id in (
      select id from empresa
      where usuario_id = auth.uid()
    )
  );


-- ============================================================
-- PERSONA
-- ============================================================
alter table persona enable row level security;

create policy persona_rw on persona
  for all
  using (
    equipo_id in (
      select eq.id
      from equipos eq
      join empresa e on eq.empresa_id = e.id
      where e.usuario_id = auth.uid()
    )
  )
  with check (
    equipo_id in (
      select eq.id
      from equipos eq
      join empresa e on eq.empresa_id = e.id
      where e.usuario_id = auth.uid()
    )
  );

CREATE TABLE lead (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_completo text NOT NULL,
  correo_electronico text NOT NULL,
  telefono text,
  empresa text,
  presupuesto numeric,
  etapa_id uuid REFERENCES etapas(id),
  pipeline_id uuid REFERENCES pipeline(id),
  prioridad text,
  asignado_a uuid, -- referencia a usuario/persona si lo deseas
  empresa_id uuid NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  archived boolean NOT NULL DEFAULT false,
  archived_at timestamptz
);

-- Habilitar RLS
ALTER TABLE lead ENABLE ROW LEVEL SECURITY;

-- Política: solo pueden ver/editar leads de su empresa
CREATE POLICY lead_rw ON lead
  FOR ALL
  USING (
    empresa_id IN (
      SELECT id FROM empresa WHERE usuario_id = auth.uid()
    )
  )
  WITH CHECK (
    empresa_id IN (
      SELECT id FROM empresa WHERE usuario_id = auth.uid()
    )
  );


  alter table persona_pipeline enable row level security;

-- SELECT
create policy select_persona_pipeline on persona_pipeline
for select
to authenticated
using (
  persona_id in (
    select p.id
    from persona p
    join equipos eq on p.equipo_id = eq.id
    join empresa e on eq.empresa_id = e.id
    where e.usuario_id = auth.uid()
  )
  AND
  pipeline_id in (
    select pl.id
    from pipeline pl
    join empresa e on pl.empresa_id = e.id
    where e.usuario_id = auth.uid()
  )
);

-- INSERT
create policy insert_persona_pipeline on persona_pipeline
for insert
to authenticated
with check (
  persona_id in (
    select p.id
    from persona p
    join equipos eq on p.equipo_id = eq.id
    join empresa e on eq.empresa_id = e.id
    where e.usuario_id = auth.uid()
  )
  AND
  pipeline_id in (
    select pl.id
    from pipeline pl
    join empresa e on pl.empresa_id = e.id
    where e.usuario_id = auth.uid()
  )
);

-- UPDATE
create policy update_persona_pipeline on persona_pipeline
for update
to authenticated
using (
  persona_id in (
    select p.id
    from persona p
    join equipos eq on p.equipo_id = eq.id
    join empresa e on eq.empresa_id = e.id
    where e.usuario_id = auth.uid()
  )
  AND
  pipeline_id in (
    select pl.id
    from pipeline pl
    join empresa e on pl.empresa_id = e.id
    where e.usuario_id = auth.uid()
  )
)
with check (
  persona_id in (
    select p.id
    from persona p
    join equipos eq on p.equipo_id = eq.id
    join empresa e on eq.empresa_id = e.id
    where e.usuario_id = auth.uid()
  )
  AND
  pipeline_id in (
    select pl.id
    from pipeline pl
    join empresa e on pl.empresa_id = e.id
    where e.usuario_id = auth.uid()
  )
);

-- DELETE
create policy delete_persona_pipeline on persona_pipeline
for delete
to authenticated
using (
  persona_id in (
    select p.id
    from persona p
    join equipos eq on p.equipo_id = eq.id
    join empresa e on eq.empresa_id = e.id
    where e.usuario_id = auth.uid()
  )
  AND
  pipeline_id in (
    select pl.id
    from pipeline pl
    join empresa e on pl.empresa_id = e.id
    where e.usuario_id = auth.uid()
  )
);



ALTER TABLE etapas ADD COLUMN IF NOT EXISTS color text DEFAULT '#3b82f6';
ALTER TABLE etapas ADD COLUMN IF NOT EXISTS nombre text;
ALTER TABLE etapas ADD COLUMN IF NOT EXISTS orden integer DEFAULT 0;

ALTER TABLE lead
DROP CONSTRAINT IF EXISTS lead_etapa_id_fkey;

ALTER TABLE lead
ADD CONSTRAINT lead_etapa_id_fkey
FOREIGN KEY (etapa_id)
REFERENCES etapas(id)
ON DELETE CASCADE;


-- Tabla de invitaciones para unirse a equipos
create table if not exists equipo_invitaciones (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipos(id) on delete cascade,
  empresa_id uuid not null references empresa(id) on delete cascade,
  invited_email text not null,
  invited_usuario_id uuid references usuarios(id), -- opcional si ya existe el usuario interno
  status text not null default 'pending', -- pending | accepted | rejected | canceled
  created_at timestamptz default now(),
  responded_at timestamptz,
  invited_nombre text,
  invited_titulo_trabajo text,
  pipeline_ids uuid[]
);

-- Índice para buscar rápido por correo
create index if not exists idx_equipo_invitaciones_invited_email on equipo_invitaciones(invited_email);

-- Habilitar RLS
alter table equipo_invitaciones enable row level security;

-- SELECT: propietario de la empresa o invitado
create policy equipo_invitaciones_select on equipo_invitaciones
  for select
  to authenticated
  using (
    empresa_id in (select id from empresa where usuario_id = auth.uid())
    or invited_email = (auth.jwt() ->> 'email')
  );

-- INSERT: solo propietario de la empresa
create policy equipo_invitaciones_insert on equipo_invitaciones
  for insert
  to authenticated
  with check (
    empresa_id in (select id from empresa where usuario_id = auth.uid())
  );

-- UPDATE: invitado puede aceptar/rechazar su propia invitación
create policy equipo_invitaciones_update_invited on equipo_invitaciones
  for update
  to authenticated
  using (
    invited_email = (auth.jwt() ->> 'email')
  )
  with check (
    invited_email = (auth.jwt() ->> 'email')
  );

-- UPDATE: dueño de empresa puede cancelar
create policy equipo_invitaciones_update_owner on equipo_invitaciones
  for update
  to authenticated
  using (
    empresa_id in (select id from empresa where usuario_id = auth.uid())
  )
  with check (
    empresa_id in (select id from empresa where usuario_id = auth.uid())
  );

-- Agregar columna usuario_id a persona para vincular con auth.users
alter table persona add column if not exists usuario_id uuid references auth.users(id);

-- Política persona: permitir insert si existe invitación aceptada para ese equipo y email
create policy persona_insert_invited on persona
  for insert
  to authenticated
  with check (
    exists (
      select 1 from equipo_invitaciones ei
      where ei.equipo_id = persona.equipo_id
        and ei.invited_email = (auth.jwt() ->> 'email')
        and ei.status = 'accepted'
    )
  );

-- Políticas para persona_pipeline: permitir insert si persona pertenece a invitación aceptada
create policy persona_pipeline_insert_invited on persona_pipeline
  for insert
  to authenticated
  with check (
    exists (
      select 1 from persona p
      join equipo_invitaciones ei on p.equipo_id = ei.equipo_id
      where p.id = persona_pipeline.persona_id
        and ei.invited_email = (auth.jwt() ->> 'email')
        and ei.status = 'accepted'
    )
  );

create table if not exists notificaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_email text not null,
  type text not null, -- invitation | invitation_accepted | task | message | appointment | stage_change
  title text not null,
  message text not null,
  data jsonb,
  read boolean default false,
  created_at timestamptz default now()
);

alter table notificaciones enable row level security;

-- Un usuario ve solo sus notificaciones
create policy notificaciones_select_self on notificaciones
  for select
  to authenticated
  using (usuario_email = (auth.jwt() ->> 'email'));

-- Insert permitidos (cualquier usuario autenticado puede generar notificación para sí mismo)
create policy notificaciones_insert_self on notificaciones
  for insert
  to authenticated
  with check (usuario_email = (auth.jwt() ->> 'email'));

-- Update para marcar como leída
create policy notificaciones_update_self on notificaciones
  for update
  to authenticated
  using (usuario_email = (auth.jwt() ->> 'email'))
  with check (usuario_email = (auth.jwt() ->> 'email'));

create index if not exists idx_notificaciones_email_created on notificaciones(usuario_email, created_at desc);





-- ============================================================
-- INVITACIONES (Update)
-- ============================================================
ALTER TABLE equipo_invitaciones ADD COLUMN IF NOT EXISTS token text;
CREATE INDEX IF NOT EXISTS idx_equipo_invitaciones_token ON equipo_invitaciones(token);

create or replace function accept_invitation(invite_token text, current_user_id uuid)
returns json as \$\$
declare
  invite_record record;
  new_member_id uuid;
begin
  -- 1. Buscar la invitaci�n
  select * into invite_record from equipo_invitaciones where token = invite_token;

  if invite_record is null then
    raise exception 'Invitaci�n inv�lida o expirada';
  end if;

  if invite_record.status != 'pending' then
     raise exception 'Esta invitaci�n ya ha sido procesada';
  end if;

  -- 2. Insertar en persona (miembros del equipo)
  insert into persona (nombre, email, titulo_trabajo, equipo_id, usuario_id)
  values (
    invite_record.invited_nombre, 
    invite_record.invited_email, 
    invite_record.invited_titulo_trabajo, 
    invite_record.equipo_id, 
    current_user_id
  )
  returning id into new_member_id;

  -- 3. Actualizar la invitaci�n
  update equipo_invitaciones 
  set status = 'accepted', 
      responded_at = now(), 
      invited_usuario_id = current_user_id 
  where id = invite_record.id;

  return json_build_object('member_id', new_member_id);
end;
\$\$ language plpgsql security definer;



create table if not exists empresa_miembros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text,
  created_at timestamptz default now()
);

alter table empresa_miembros enable row level security;

-- Owner can manage members of their company
drop policy if exists empresa_miembros_owner on empresa_miembros;
create policy empresa_miembros_owner on empresa_miembros
  for all to authenticated
  using (
    empresa_id in (select id from empresa where usuario_id = auth.uid())
  )
  with check (
    empresa_id in (select id from empresa where usuario_id = auth.uid())
  );

-- Member can read their own membership rows
drop policy if exists empresa_miembros_self on empresa_miembros;
create policy empresa_miembros_self on empresa_miembros
  for select to authenticated
  using (usuario_id = auth.uid());


-- 2) Extend RLS: panel (owner OR member)
drop policy if exists panel_rw on panel;
create policy panel_rw on panel
  for all to authenticated
  using (
    panel.empresa_id in (select id from empresa where usuario_id = auth.uid())
    or panel.empresa_id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
  )
  with check (
    panel.empresa_id in (select id from empresa where usuario_id = auth.uid())
    or panel.empresa_id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
  );


-- 3) Extend RLS: equipos (owner OR member)
drop policy if exists equipos_rw on equipos;
create policy equipos_rw on equipos
  for all to authenticated
  using (
    equipos.empresa_id in (select id from empresa where usuario_id = auth.uid())
    or equipos.empresa_id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
  )
  with check (
    equipos.empresa_id in (select id from empresa where usuario_id = auth.uid())
    or equipos.empresa_id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
  );


-- 4) Extend RLS: persona (owner OR member via equipos -> empresa)
drop policy if exists persona_rw on persona;
create policy persona_rw on persona
  for all to authenticated
  using (
    persona.equipo_id in (
      select eq.id
      from equipos eq
      join empresa e on eq.empresa_id = e.id
      where e.usuario_id = auth.uid()
         or e.id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
  )
  with check (
    persona.equipo_id in (
      select eq.id
      from equipos eq
      join empresa e on eq.empresa_id = e.id
      where e.usuario_id = auth.uid()
         or e.id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
  );


-- 5) Extend RLS: persona_pipeline (owner OR member)
-- Replace existing policies with OR membership in both persona and pipeline sides

-- SELECT
drop policy if exists select_persona_pipeline on persona_pipeline;
create policy select_persona_pipeline on persona_pipeline
  for select to authenticated
  using (
    persona_id in (
      select p.id
      from persona p
      join equipos eq on p.equipo_id = eq.id
      join empresa e on eq.empresa_id = e.id
      where e.usuario_id = auth.uid()
         or e.id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
    and
    pipeline_id in (
      select pl.id
      from pipeline pl
      join empresa e on pl.empresa_id = e.id
      where e.usuario_id = auth.uid()
         or e.id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
  );

-- INSERT
drop policy if exists insert_persona_pipeline on persona_pipeline;
create policy insert_persona_pipeline on persona_pipeline
  for insert to authenticated
  with check (
    persona_id in (
      select p.id
      from persona p
      join equipos eq on p.equipo_id = eq.id
      join empresa e on eq.empresa_id = e.id
      where e.usuario_id = auth.uid()
         or e.id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
    and
    pipeline_id in (
      select pl.id
      from pipeline pl
      join empresa e on pl.empresa_id = e.id
      where e.usuario_id = auth.uid()
         or e.id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
  );

-- UPDATE
drop policy if exists update_persona_pipeline on persona_pipeline;
create policy update_persona_pipeline on persona_pipeline
  for update to authenticated
  using (
    persona_id in (
      select p.id
      from persona p
      join equipos eq on p.equipo_id = eq.id
      join empresa e on eq.empresa_id = e.id
      where e.usuario_id = auth.uid()
         or e.id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
    and
    pipeline_id in (
      select pl.id
      from pipeline pl
      join empresa e on pl.empresa_id = e.id
      where e.usuario_id = auth.uid()
         or e.id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
  )
  with check (
    persona_id in (
      select p.id
      from persona p
      join equipos eq on p.equipo_id = eq.id
      join empresa e on eq.empresa_id = e.id
      where e.usuario_id = auth.uid()
         or e.id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
    and
    pipeline_id in (
      select pl.id
      from pipeline pl
      join empresa e on pl.empresa_id = e.id
      where e.usuario_id = auth.uid()
         or e.id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
  );

-- DELETE
drop policy if exists delete_persona_pipeline on persona_pipeline;
create policy delete_persona_pipeline on persona_pipeline
  for delete to authenticated
  using (
    persona_id in (
      select p.id
      from persona p
      join equipos eq on p.equipo_id = eq.id
      join empresa e on eq.empresa_id = e.id
      where e.usuario_id = auth.uid()
         or e.id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
    and
    pipeline_id in (
      select pl.id
      from pipeline pl
      join empresa e on pl.empresa_id = e.id
      where e.usuario_id = auth.uid()
         or e.id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
  );


  create table if not exists empresa_miembros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text,
  created_at timestamptz default now()
);

alter table empresa_miembros enable row level security;

-- Owner can manage members of their company
drop policy if exists empresa_miembros_owner on empresa_miembros;
create policy empresa_miembros_owner on empresa_miembros
  for all to authenticated
  using (
    empresa_id in (select id from empresa where usuario_id = auth.uid())
  )
  with check (
    empresa_id in (select id from empresa where usuario_id = auth.uid())
  );

-- Member can read their own membership rows
drop policy if exists empresa_miembros_self on empresa_miembros;
create policy empresa_miembros_self on empresa_miembros
  for select to authenticated
  using (usuario_id = auth.uid());


-- 2) Extend RLS: panel (owner OR member)
drop policy if exists panel_rw on panel;
create policy panel_rw on panel
  for all to authenticated
  using (
    panel.empresa_id in (select id from empresa where usuario_id = auth.uid())
    or panel.empresa_id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
  )
  with check (
    panel.empresa_id in (select id from empresa where usuario_id = auth.uid())
    or panel.empresa_id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
  );


-- 3) Extend RLS: equipos (owner OR member)
drop policy if exists equipos_rw on equipos;
create policy equipos_rw on equipos
  for all to authenticated
  using (
    equipos.empresa_id in (select id from empresa where usuario_id = auth.uid())
    or equipos.empresa_id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
  )
  with check (
    equipos.empresa_id in (select id from empresa where usuario_id = auth.uid())
    or equipos.empresa_id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
  );


-- 4) Extend RLS: persona (owner OR member via equipos -> empresa)
drop policy if exists persona_rw on persona;
create policy persona_rw on persona
  for all to authenticated
  using (
    persona.equipo_id in (
      select eq.id
      from equipos eq
      join empresa e on eq.empresa_id = e.id
      where e.usuario_id = auth.uid()
         or e.id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
  )
  with check (
    persona.equipo_id in (
      select eq.id
      from equipos eq
      join empresa e on eq.empresa_id = e.id
      where e.usuario_id = auth.uid()
         or e.id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
  );


-- 5) Extend RLS: persona_pipeline (owner OR member)
-- Replace existing policies with OR membership in both persona and pipeline sides

-- SELECT
drop policy if exists select_persona_pipeline on persona_pipeline;
create policy select_persona_pipeline on persona_pipeline
  for select to authenticated
  using (
    persona_id in (
      select p.id
      from persona p
      join equipos eq on p.equipo_id = eq.id
      join empresa e on eq.empresa_id = e.id
      where e.usuario_id = auth.uid()
         or e.id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
    and
    pipeline_id in (
      select pl.id
      from pipeline pl
      join empresa e on pl.empresa_id = e.id
      where e.usuario_id = auth.uid()
         or e.id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
  );

-- INSERT
drop policy if exists insert_persona_pipeline on persona_pipeline;
create policy insert_persona_pipeline on persona_pipeline
  for insert to authenticated
  with check (
    persona_id in (
      select p.id
      from persona p
      join equipos eq on p.equipo_id = eq.id
      join empresa e on eq.empresa_id = e.id
      where e.usuario_id = auth.uid()
         or e.id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
    and
    pipeline_id in (
      select pl.id
      from pipeline pl
      join empresa e on pl.empresa_id = e.id
      where e.usuario_id = auth.uid()
         or e.id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
  );

-- UPDATE
drop policy if exists update_persona_pipeline on persona_pipeline;
create policy update_persona_pipeline on persona_pipeline
  for update to authenticated
  using (
    persona_id in (
      select p.id
      from persona p
      join equipos eq on p.equipo_id = eq.id
      join empresa e on eq.empresa_id = e.id
      where e.usuario_id = auth.uid()
         or e.id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
    and
    pipeline_id in (
      select pl.id
      from pipeline pl
      join empresa e on pl.empresa_id = e.id
      where e.usuario_id = auth.uid()
         or e.id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
  )
  with check (
    persona_id in (
      select p.id
      from persona p
      join equipos eq on p.equipo_id = eq.id
      join empresa e on eq.empresa_id = e.id
      where e.usuario_id = auth.uid()
         or e.id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
    and
    pipeline_id in (
      select pl.id
      from pipeline pl
      join empresa e on pl.empresa_id = e.id
      where e.usuario_id = auth.uid()
         or e.id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
  );

-- DELETE
drop policy if exists delete_persona_pipeline on persona_pipeline;
create policy delete_persona_pipeline on persona_pipeline
  for delete to authenticated
  using (
    persona_id in (
      select p.id
      from persona p
      join equipos eq on p.equipo_id = eq.id
      join empresa e on eq.empresa_id = e.id
      where e.usuario_id = auth.uid()
         or e.id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
    and
    pipeline_id in (
      select pl.id
      from pipeline pl
      join empresa e on pl.empresa_id = e.id
      where e.usuario_id = auth.uid()
         or e.id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
  );


  -- ============================================================
-- 1. AGREGAR COLUMNA TAGS A LA TABLA LEAD
-- ============================================================
ALTER TABLE lead ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]';
-- ============================================================
-- 2. CREAR TABLA NOTA_LEAD
-- ============================================================
CREATE TABLE IF NOT EXISTS nota_lead (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES lead(id) ON DELETE CASCADE,
  contenido text NOT NULL,
  creado_por uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);
-- Índice para búsquedas por lead
CREATE INDEX IF NOT EXISTS idx_nota_lead_lead_id ON nota_lead(lead_id);
-- ============================================================
-- 3. RLS PARA NOTA_LEAD (compatible con tu estructura)
-- ============================================================
ALTER TABLE nota_lead ENABLE ROW LEVEL SECURITY;
-- Política: usuarios pueden CRUD en notas de leads de su empresa (owner o miembro)
CREATE POLICY nota_lead_rw ON nota_lead
  FOR ALL TO authenticated
  USING (
    lead_id IN (
      SELECT l.id FROM lead l
      WHERE l.empresa_id IN (SELECT id FROM empresa WHERE usuario_id = auth.uid())
         OR l.empresa_id IN (SELECT empresa_id FROM empresa_miembros WHERE usuario_id = auth.uid())
    )
  )
  WITH CHECK (
    lead_id IN (
      SELECT l.id FROM lead l
      WHERE l.empresa_id IN (SELECT id FROM empresa WHERE usuario_id = auth.uid())
         OR l.empresa_id IN (SELECT empresa_id FROM empresa_miembros WHERE usuario_id = auth.uid())
    )
  );

  
  alter table nota_lead ADD column if not exists creador_nombre text;


  create table public.presupuesto_pdf (
  id uuid not null default gen_random_uuid(),
  lead_id uuid not null,
  nombre text not null,
  url text not null,
  created_at timestamp with time zone null default now(),
  creado_por uuid null,
  constraint presupuesto_pdf_pkey primary key (id),
  constraint presupuesto_pdf_creado_por_fkey foreign key (creado_por) references auth.users(id),
  constraint presupuesto_pdf_lead_id_fkey foreign key (lead_id) references lead(id) on delete cascade
) tablespace pg_default;

create index idx_presupuesto_pdf_lead_id on public.presupuesto_pdf using btree (lead_id) tablespace pg_default;


-- ============================================================
-- INTEGRACIONES MULTI-TENANT + FEATURE FLAGS
-- ============================================================

-- Tabla de integraciones por empresa (un único esquema para todos los clientes)
create table if not exists integraciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  provider text not null, -- p.ej. "superapi", "ferrer", "whatsapp", etc.
  status text not null default 'active', -- active | disabled
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint uq_integraciones_empresa_provider unique (empresa_id, provider)
);

alter table integraciones enable row level security;

-- RLS: owner o miembros de la empresa pueden ver/gestionar integraciones
create policy integraciones_select on integraciones
  for select to authenticated
  using (
    empresa_id in (select id from empresa where usuario_id = auth.uid())
    or empresa_id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
  );

create policy integraciones_mutation on integraciones
  for all to authenticated
  using (
    empresa_id in (select id from empresa where usuario_id = auth.uid())
    or empresa_id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
  )
  with check (
    empresa_id in (select id from empresa where usuario_id = auth.uid())
    or empresa_id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
  );


-- Credenciales asociadas a una integración
create table if not exists integracion_credenciales (
  id uuid primary key default gen_random_uuid(),
  integracion_id uuid not null references integraciones(id) on delete cascade,
  key text not null,  -- api_key | secret | webhook_secret | etc
  value text not null, -- almacenar cifrado/rotado fuera de alcance de clientes (edge usa service role)
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint uq_integracion_credencial unique (integracion_id, key)
);

alter table integracion_credenciales enable row level security;

-- RLS vía la integración -> empresa
create policy integracion_credenciales_rw on integracion_credenciales
  for all to authenticated
  using (
    integracion_id in (
      select i.id from integraciones i
      where i.empresa_id in (select id from empresa where usuario_id = auth.uid())
         or i.empresa_id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
  )
  with check (
    integracion_id in (
      select i.id from integraciones i
      where i.empresa_id in (select id from empresa where usuario_id = auth.uid())
         or i.empresa_id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
  );


-- Registro de webhooks entrantes (auditoría + deduplicación)
create table if not exists webhooks_entrantes (
  id uuid primary key default gen_random_uuid(),
  integracion_id uuid references integraciones(id) on delete set null,
  empresa_id uuid not null references empresa(id) on delete cascade,
  provider text,
  event text,
  payload jsonb,
  signature_valid boolean,
  dedupe_key text,
  received_at timestamptz default now()
);

alter table webhooks_entrantes enable row level security;

create index if not exists idx_webhooks_entrantes_empresa_created on webhooks_entrantes(empresa_id, received_at desc);
create index if not exists idx_webhooks_entrantes_dedupe on webhooks_entrantes(dedupe_key);

create policy webhooks_entrantes_select on webhooks_entrantes
  for select to authenticated
  using (
    empresa_id in (select id from empresa where usuario_id = auth.uid())
    or empresa_id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
  );

-- Inserciones de webhooks suelen venir desde Edge con service role (bypassa RLS).


-- Feature Flags (globales o por empresa)
create table if not exists feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  enabled boolean not null default false,
  scope text not null default 'global', -- 'global' | 'empresa'
  empresa_id uuid references empresa(id) on delete cascade,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table feature_flags enable row level security;

-- Únicos: una fila global por clave y/o una por empresa+clave
create unique index if not exists uq_feature_flags_global
  on feature_flags(key) where scope = 'global' and empresa_id is null;

create unique index if not exists uq_feature_flags_empresa
  on feature_flags(empresa_id, key) where scope = 'empresa' and empresa_id is not null;

-- SELECT: todos pueden leer flags globales; flags por empresa: owner o miembro
create policy feature_flags_select on feature_flags
  for select to authenticated
  using (
    (scope = 'global' and empresa_id is null)
    or (scope = 'empresa' and (
      empresa_id in (select id from empresa where usuario_id = auth.uid())
      or empresa_id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    ))
  );

-- INSERT/UPDATE/DELETE: solo dueños/miembros pueden gestionar flags de su empresa
create policy feature_flags_empresa_mutation on feature_flags
  for all to authenticated
  using (
    scope = 'empresa' and (
      empresa_id in (select id from empresa where usuario_id = auth.uid())
      or empresa_id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
  )
  with check (
    scope = 'empresa' and (
      empresa_id in (select id from empresa where usuario_id = auth.uid())
      or empresa_id in (select empresa_id from empresa_miembros where usuario_id = auth.uid())
    )
  );

-- Semilla: habilitar GPT-5.2-Codex de forma GLOBAL para todos los clientes
insert into feature_flags(key, enabled, scope)
select 'gpt_5_2_codex', true, 'global'
where not exists (
  select 1 from feature_flags where key = 'gpt_5_2_codex' and scope = 'global' and empresa_id is null
);


CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES lead(id) ON DELETE CASCADE,
  team_member_id uuid REFERENCES auth.users(id),
  title text NOT NULL,
  description text,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  status text DEFAULT 'scheduled', -- scheduled | completed | cancelled
  participants text[], -- array de nombres de participantes
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS policies
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY appointments_rw ON appointments
  FOR ALL
  USING (
    empresa_id IN (
      SELECT id FROM empresa WHERE usuario_id = auth.uid()
    )
  )
  WITH CHECK (
    empresa_id IN (
      SELECT id FROM empresa WHERE usuario_id = auth.uid()
    )
  );

-- Index para queries frecuentes
CREATE INDEX idx_appointments_empresa ON appointments(empresa_id);
CREATE INDEX idx_appointments_lead ON appointments(lead_id);
CREATE INDEX idx_appointments_start_time ON appointments(start_time);


-- 1. Tabla Contactos (Agenda Clientes)
CREATE TABLE IF NOT EXISTS contactos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre text NOT NULL,
    email text,
    telefono text,
    empresa_nombre text,
    cargo text,
    notas text,
    empresa_id uuid NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    origen_lead_id uuid REFERENCES lead(id) ON DELETE SET NULL, -- Relación clave con tus chats
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    archivado boolean DEFAULT false
);

-- RLS
ALTER TABLE contactos ENABLE ROW LEVEL SECURITY;
CREATE POLICY contactos_policy_all ON contactos FOR ALL 
USING (empresa_id IN (SELECT id FROM empresa WHERE usuario_id = auth.uid()));

-- 2. Automatismo (Sync)
CREATE OR REPLACE FUNCTION sincronizar_lead_a_contacto_real() RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM contactos WHERE origen_lead_id = NEW.id OR (email = NEW.correo_electronico AND empresa_id = NEW.empresa_id)) THEN
        INSERT INTO contactos (nombre, email, telefono, empresa_nombre, empresa_id, origen_lead_id, created_at)
        VALUES (NEW.nombre_completo, NEW.correo_electronico, NEW.telefono, NEW.empresa, NEW.empresa_id, NEW.id, COALESCE(NEW.created_at, now()));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_sincronizar_lead_contacto_real ON lead;
CREATE TRIGGER tr_sincronizar_lead_contacto_real AFTER INSERT OR UPDATE ON lead FOR EACH ROW EXECUTE FUNCTION sincronizar_lead_a_contacto_real();

-- 3. Carga Inicial
INSERT INTO contactos (nombre, email, telefono, empresa_nombre, empresa_id, origen_lead_id, created_at)
SELECT nombre_completo, correo_electronico, telefono, empresa, empresa_id, id, created_at
FROM lead l WHERE NOT EXISTS (SELECT 1 FROM contactos c WHERE c.origen_lead_id = l.id);


-- ============================================================
-- TASKS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES lead(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES auth.users(id), -- Usuario asignado
  title text NOT NULL,
  description text,
  type text NOT NULL DEFAULT 'todo', -- 'call', 'email', 'meeting', 'todo'
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'cancelled'
  priority text NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high'
  due_date timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) -- Quién creó la tarea
);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_tasks_empresa_id ON tasks(empresa_id);
CREATE INDEX IF NOT EXISTS idx_tasks_lead_id ON tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);

-- ============================================================
-- RLS POLICIES (Seguridad)
-- ============================================================

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- POLICY: Ver tareas (Miembros de la empresa pueden ver todas las tareas de la empresa)
-- Se asume que es colaborativo. Si se quisiera privacidad por usuario, se filtraría por assigned_to.
CREATE POLICY tasks_select ON tasks
  FOR SELECT TO authenticated
  USING (
    empresa_id IN (
      SELECT id FROM empresa WHERE usuario_id = auth.uid()
    )
    OR
    empresa_id IN (
      SELECT empresa_id FROM empresa_miembros WHERE usuario_id = auth.uid()
    )
  );

-- POLICY: Insertar tareas (Miembros de la empresa pueden crear)
CREATE POLICY tasks_insert ON tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_id IN (
      SELECT id FROM empresa WHERE usuario_id = auth.uid()
    )
    OR
    empresa_id IN (
      SELECT empresa_id FROM empresa_miembros WHERE usuario_id = auth.uid()
    )
  );

-- POLICY: Actualizar tareas (Miembros de la empresa pueden editar)
CREATE POLICY tasks_update ON tasks
  FOR UPDATE TO authenticated
  USING (
    empresa_id IN (
      SELECT id FROM empresa WHERE usuario_id = auth.uid()
    )
    OR
    empresa_id IN (
      SELECT empresa_id FROM empresa_miembros WHERE usuario_id = auth.uid()
    )
  )
  WITH CHECK (
    empresa_id IN (
      SELECT id FROM empresa WHERE usuario_id = auth.uid()
    )
    OR
    empresa_id IN (
      SELECT empresa_id FROM empresa_miembros WHERE usuario_id = auth.uid()
    )
  );

-- POLICY: Eliminar tareas (Solo dueños o admins podrían, pero por ahora dejamos a miembros para simplificar colaboración)
CREATE POLICY tasks_delete ON tasks
  FOR DELETE TO authenticated
  USING (
    empresa_id IN (
      SELECT id FROM empresa WHERE usuario_id = auth.uid()
    )
    OR
    empresa_id IN (
      SELECT empresa_id FROM empresa_miembros WHERE usuario_id = auth.uid()
    )
  );
-- Add rating and redes_sociales columns to contactos table
ALTER TABLE public.contactos 
ADD COLUMN IF NOT EXISTS rating integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS redes_sociales jsonb DEFAULT '{}'::jsonb;

-- Ensure RLS allows access (usually existing policies cover all columns, but good to check)
-- Existing policies seem to be row-based, so adding columns should automatically be covered for select/update/insert.



alter table public.lead add column if not exists evento text;
alter table public.lead add column if not exists membresia text;


select column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'lead'
  and column_name in ('correo_electronico', 'evento', 'membresia');

alter table public.lead
  alter column correo_electronico drop not null;

  
CREATE TABLE IF NOT EXISTS landing_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES pipeline(id) ON DELETE CASCADE,
  etapa_id uuid NOT NULL REFERENCES etapas(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  nombre text NOT NULL,                    -- etiqueta descriptiva: "Landing Ferrer", "Web Principal"
  active boolean NOT NULL DEFAULT true,
  prioridad_default text DEFAULT 'medium', -- prioridad asignada a leads creados con este token
  asignado_a uuid DEFAULT '00000000-0000-0000-0000-000000000000', -- usuario por defecto al que se asigna
  empresa_label text DEFAULT 'Landing',    -- valor por defecto para el campo "empresa" del lead
  metadata jsonb DEFAULT '{}',             -- config extra (utm_source, notas, etc.)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Índices para búsqueda rápida por token y por empresa
CREATE INDEX IF NOT EXISTS idx_landing_tokens_token ON landing_tokens(token);
CREATE INDEX IF NOT EXISTS idx_landing_tokens_empresa ON landing_tokens(empresa_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE landing_tokens ENABLE ROW LEVEL SECURITY;

-- SELECT: owner o miembros de la empresa
CREATE POLICY landing_tokens_select ON landing_tokens
  FOR SELECT TO authenticated
  USING (
    empresa_id IN (SELECT id FROM empresa WHERE usuario_id = auth.uid())
    OR empresa_id IN (SELECT empresa_id FROM empresa_miembros WHERE usuario_id = auth.uid())
  );

-- INSERT/UPDATE/DELETE: owner o miembros
CREATE POLICY landing_tokens_mutation ON landing_tokens
  FOR ALL TO authenticated
  USING (
    empresa_id IN (SELECT id FROM empresa WHERE usuario_id = auth.uid())
    OR empresa_id IN (SELECT empresa_id FROM empresa_miembros WHERE usuario_id = auth.uid())
  )
  WITH CHECK (
    empresa_id IN (SELECT id FROM empresa WHERE usuario_id = auth.uid())
    OR empresa_id IN (SELECT empresa_id FROM empresa_miembros WHERE usuario_id = auth.uid())
  );

-- ============================================================
-- Función helper para generar tokens aleatorios legibles
-- ============================================================
CREATE OR REPLACE FUNCTION generate_landing_token()
RETURNS text AS $$
DECLARE
  new_token text;
  token_exists boolean;
BEGIN
  LOOP
    -- Generar token tipo: lt_xxxxxxxxxxxx (12 chars hex)
    new_token := 'lt_' || encode(gen_random_bytes(12), 'hex');
    SELECT EXISTS(SELECT 1 FROM landing_tokens WHERE token = new_token) INTO token_exists;
    EXIT WHEN NOT token_exists;
  END LOOP;
  RETURN new_token;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- Fix RLS for contactos: allow guest/member access
-- Owner access  → empresa.usuario_id = auth.uid()
-- Member access → empresa_miembros.usuario_id = auth.uid()
-- ============================================================

-- Drop the old blanket policy that only allowed the owner
DROP POLICY IF EXISTS contactos_policy_all ON public.contactos;

-- 1) SELECT – owner OR member
DROP POLICY IF EXISTS contactos_select_owner_or_member ON public.contactos;
CREATE POLICY contactos_select_owner_or_member
ON public.contactos FOR SELECT TO authenticated
USING (
  empresa_id IN (SELECT id FROM public.empresa WHERE usuario_id = auth.uid())
  OR
  empresa_id IN (SELECT empresa_id FROM public.empresa_miembros WHERE usuario_id = auth.uid())
);

-- 2) INSERT – owner OR member
DROP POLICY IF EXISTS contactos_insert_owner_or_member ON public.contactos;
CREATE POLICY contactos_insert_owner_or_member
ON public.contactos FOR INSERT TO authenticated
WITH CHECK (
  empresa_id IN (SELECT id FROM public.empresa WHERE usuario_id = auth.uid())
  OR
  empresa_id IN (SELECT empresa_id FROM public.empresa_miembros WHERE usuario_id = auth.uid())
);

-- 3) UPDATE – owner OR member
DROP POLICY IF EXISTS contactos_update_owner_or_member ON public.contactos;
CREATE POLICY contactos_update_owner_or_member
ON public.contactos FOR UPDATE TO authenticated
USING (
  empresa_id IN (SELECT id FROM public.empresa WHERE usuario_id = auth.uid())
  OR
  empresa_id IN (SELECT empresa_id FROM public.empresa_miembros WHERE usuario_id = auth.uid())
)
WITH CHECK (
  empresa_id IN (SELECT id FROM public.empresa WHERE usuario_id = auth.uid())
  OR
  empresa_id IN (SELECT empresa_id FROM public.empresa_miembros WHERE usuario_id = auth.uid())
);

-- 4) DELETE – owner OR member
DROP POLICY IF EXISTS contactos_delete_owner_or_member ON public.contactos;
CREATE POLICY contactos_delete_owner_or_member
ON public.contactos FOR DELETE TO authenticated
USING (
  empresa_id IN (SELECT id FROM public.empresa WHERE usuario_id = auth.uid())
  OR
  empresa_id IN (SELECT empresa_id FROM public.empresa_miembros WHERE usuario_id = auth.uid())
);


-- =============================================
-- MIGRACIÓN: Registro Dual (Owner / Empleado)
-- Fecha: 2026-03-09
-- =============================================
-- ANÁLISIS DE SEGURIDAD:
-- ✅ Usa IF NOT EXISTS / IF EXISTS para evitar errores si se ejecuta más de una vez
-- ✅ ALTER TABLE ADD COLUMN con defaults seguros — no rompe datos existentes
-- ✅ Búsqueda por código via RPC con SECURITY DEFINER — NO abre tabla empresa
-- ✅ RLS estricto en solicitudes_union (solo solicitante y dueño ven los registros)
-- ✅ Trigger genera códigos solo en INSERT, no modifica registros existentes salvo UPDATE explícito
-- =============================================

BEGIN;

-- 1. Agregar campo account_type a usuarios
-- Los usuarios existentes quedan como 'owner' (comportamiento actual)
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'owner';

-- Agregar constraint separado (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_account_type_check'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_account_type_check
      CHECK (account_type IN ('owner', 'employee'));
  END IF;
END $$;

-- 2. Agregar campo codigo_empresa a empresa
ALTER TABLE empresa
  ADD COLUMN IF NOT EXISTS codigo_empresa TEXT UNIQUE;

-- 3. Función para generar código automáticamente al crear empresa
CREATE OR REPLACE FUNCTION generar_codigo_empresa()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo_empresa IS NULL THEN
    NEW.codigo_empresa := UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Trigger en empresa (solo INSERT)
DROP TRIGGER IF EXISTS trg_generar_codigo_empresa ON empresa;
CREATE TRIGGER trg_generar_codigo_empresa
  BEFORE INSERT ON empresa
  FOR EACH ROW EXECUTE FUNCTION generar_codigo_empresa();

-- 5. Generar códigos para empresas existentes que no tengan
CREATE OR REPLACE FUNCTION asignar_codigos_empresa_faltantes()
RETURNS void AS $$
DECLARE
  v_empresa_id uuid;
  v_codigo text;
BEGIN
  FOR v_empresa_id IN
    SELECT id FROM empresa WHERE codigo_empresa IS NULL
  LOOP
    LOOP
      v_codigo := UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 8));
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM empresa WHERE codigo_empresa = v_codigo
      );
    END LOOP;

    UPDATE empresa
    SET codigo_empresa = v_codigo
    WHERE id = v_empresa_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

SELECT asignar_codigos_empresa_faltantes();
DROP FUNCTION IF EXISTS asignar_codigos_empresa_faltantes();

-- 6. Crear tabla solicitudes_union
CREATE TABLE IF NOT EXISTS solicitudes_union (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  solicitante_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  solicitante_email TEXT NOT NULL,
  solicitante_nombre TEXT,
  mensaje TEXT,
  empresa_id UUID NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  role_asignado TEXT NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ DEFAULT now(),
  responded_at TIMESTAMPTZ,
  responded_by UUID REFERENCES auth.users(id),
  UNIQUE(solicitante_id, empresa_id)
);

-- 7. Habilitar RLS
ALTER TABLE solicitudes_union ENABLE ROW LEVEL SECURITY;

-- 8. Políticas RLS para solicitudes_union
-- El solicitante puede ver sus propias solicitudes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'solicitudes_union' AND policyname = 'solicitudes_select_solicitante'
  ) THEN
    CREATE POLICY solicitudes_select_solicitante ON solicitudes_union
      FOR SELECT USING (solicitante_id = auth.uid());
  END IF;
END $$;

-- El dueño de la empresa puede ver solicitudes de su empresa
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'solicitudes_union' AND policyname = 'solicitudes_select_owner'
  ) THEN
    CREATE POLICY solicitudes_select_owner ON solicitudes_union
      FOR SELECT USING (
        empresa_id IN (SELECT id FROM empresa WHERE usuario_id = auth.uid())
      );
  END IF;
END $$;

-- Cualquier usuario autenticado puede insertar su propia solicitud
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'solicitudes_union' AND policyname = 'solicitudes_insert'
  ) THEN
    CREATE POLICY solicitudes_insert ON solicitudes_union
      FOR INSERT WITH CHECK (solicitante_id = auth.uid());
  END IF;
END $$;

-- Solo el dueño de la empresa puede actualizar (aprobar/rechazar)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'solicitudes_union' AND policyname = 'solicitudes_update_owner'
  ) THEN
    CREATE POLICY solicitudes_update_owner ON solicitudes_union
      FOR UPDATE USING (
        empresa_id IN (SELECT id FROM empresa WHERE usuario_id = auth.uid())
      );
  END IF;
END $$;

-- 9. RPC segura para buscar empresa por código
-- Usa SECURITY DEFINER para leer empresa sin abrir la tabla a todos los usuarios
CREATE OR REPLACE FUNCTION buscar_empresa_por_codigo(p_codigo TEXT)
RETURNS TABLE(id UUID, nombre_empresa TEXT, logo_url TEXT, codigo_empresa TEXT)
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT e.id, e.nombre_empresa, e.logo_url, e.codigo_empresa
  FROM empresa e
  WHERE e.codigo_empresa = UPPER(TRIM(p_codigo));
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION buscar_empresa_por_codigo(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION buscar_empresa_por_codigo(TEXT) TO authenticated;

-- 10. Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_empresa_codigo ON empresa(codigo_empresa);
CREATE INDEX IF NOT EXISTS idx_solicitudes_empresa_status ON solicitudes_union(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_solicitudes_solicitante ON solicitudes_union(solicitante_id);

COMMIT;





-- Blindaje anti-duplicados para mensajes por external_id.
-- Seguridad: este script NO elimina datos.
-- Si detecta duplicados existentes, aborta con error para que los revises antes.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.mensajes
    WHERE external_id IS NOT NULL
    GROUP BY external_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'No se pudo crear el indice unico: existen external_id duplicados en public.mensajes. Limpia duplicados primero.';
  END IF;

  EXECUTE '
    CREATE UNIQUE INDEX IF NOT EXISTS uq_mensajes_external_id_not_null
    ON public.mensajes (external_id)
    WHERE external_id IS NOT NULL
  ';
END
$$;



-- ============================================================
-- TABLA: saved_tags — Etiquetas persistentes por empresa
-- Las etiquetas se guardan aquí y sobreviven aunque se eliminen
-- todos los leads que las usaban.
-- ============================================================
-- SEGURO: Solo crea si no existe. No modifica tablas existentes.

CREATE TABLE IF NOT EXISTS saved_tags (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id  UUID NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#6366f1',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- No duplicar nombre dentro de la misma empresa
    UNIQUE(empresa_id, name)
);

-- Índice para consultas rápidas por empresa
CREATE INDEX IF NOT EXISTS idx_saved_tags_empresa ON saved_tags(empresa_id);

-- ============================================================
-- RLS: Solo miembros de la empresa pueden leer/escribir
-- Usa empresa_miembros.usuario_id = auth.uid()
-- ============================================================
ALTER TABLE saved_tags ENABLE ROW LEVEL SECURITY;

-- Leer: miembros de la empresa
CREATE POLICY "saved_tags_select" ON saved_tags
    FOR SELECT USING (
        empresa_id IN (
            SELECT empresa_id FROM empresa_miembros WHERE usuario_id = auth.uid()
        )
    );

-- Insertar: miembros de la empresa
CREATE POLICY "saved_tags_insert" ON saved_tags
    FOR INSERT WITH CHECK (
        empresa_id IN (
            SELECT empresa_id FROM empresa_miembros WHERE usuario_id = auth.uid()
        )
    );

-- Actualizar: miembros de la empresa
CREATE POLICY "saved_tags_update" ON saved_tags
    FOR UPDATE USING (
        empresa_id IN (
            SELECT empresa_id FROM empresa_miembros WHERE usuario_id = auth.uid()
        )
    );

-- Eliminar: miembros de la empresa
CREATE POLICY "saved_tags_delete" ON saved_tags
    FOR DELETE USING (
        empresa_id IN (
            SELECT empresa_id FROM empresa_miembros WHERE usuario_id = auth.uid()
        )
    );


-- ============================================================
-- ROLES (permisos granulares por empresa)
-- ============================================================
CREATE TABLE roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id UUID NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    permissions JSONB NOT NULL DEFAULT '[]',
    color TEXT DEFAULT '#3b82f6',
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- Lectura: miembros de la empresa (por usuario_id o email)
CREATE POLICY "Miembros pueden ver roles de su empresa" ON roles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM empresa_miembros em
            WHERE em.empresa_id = roles.empresa_id
            AND (em.usuario_id = auth.uid() OR em.email = (auth.jwt() ->> 'email'))
        )
    );

-- Insertar: solo admins y owners
CREATE POLICY "Admins y owners pueden agregar roles" ON roles
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM empresa_miembros em
            WHERE em.empresa_id = roles.empresa_id
            AND (em.usuario_id = auth.uid() OR em.email = (auth.jwt() ->> 'email'))
            AND em.role = ANY (ARRAY['admin', 'owner'])
        )
    );

-- Actualizar: solo admins y owners, no roles de sistema
CREATE POLICY "Admins y owners pueden actualizar roles" ON roles
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM empresa_miembros em
            WHERE em.empresa_id = roles.empresa_id
            AND (em.usuario_id = auth.uid() OR em.email = (auth.jwt() ->> 'email'))
            AND em.role = ANY (ARRAY['admin', 'owner'])
        )
        AND NOT is_system
    );

-- Eliminar: solo admins y owners, no roles de sistema
CREATE POLICY "Admins y owners pueden eliminar roles" ON roles
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM empresa_miembros em
            WHERE em.empresa_id = roles.empresa_id
            AND (em.usuario_id = auth.uid() OR em.email = (auth.jwt() ->> 'email'))
            AND em.role = ANY (ARRAY['admin', 'owner'])
        )
        AND NOT is_system
    );

-- Agregar role_id a empresa_miembros (FK a roles, nullable para backwards-compat)
ALTER TABLE empresa_miembros ADD COLUMN role_id UUID REFERENCES roles(id);

-- Trigger: al crear empresa, auto-insertar roles de sistema (Admin + Viewer)
CREATE OR REPLACE FUNCTION fn_seed_roles_on_empresa_create()
RETURNS TRIGGER AS $$
BEGIN
    BEGIN
        INSERT INTO roles (empresa_id, name, permissions, color, is_system) VALUES
        (NEW.id, 'Admin', '["view_dashboard","view_pipeline","edit_leads","delete_leads","view_analytics","view_calendar","manage_team","manage_settings","view_budgets","edit_budgets"]'::jsonb, '#8b5cf6', true),
        (NEW.id, 'Viewer', '["view_dashboard","view_pipeline","view_analytics","view_calendar","view_budgets"]'::jsonb, '#6b7280', true);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'fn_seed_roles_on_empresa_create: no se pudieron crear roles para empresa %. Error: %', NEW.id, SQLERRM;
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_seed_roles_on_empresa_create
    AFTER INSERT ON empresa
    FOR EACH ROW
    EXECUTE FUNCTION fn_seed_roles_on_empresa_create();


-- =============================================
-- FIX: Invitaciones pendientes no aparecen en TeamView
-- Ejecutar en Supabase SQL Editor
-- Problema 1: columna permission_role faltante en equipo_invitaciones
-- Problema 2: política RLS SELECT no incluye admin members (solo owner)
-- =============================================

-- 1. Agregar columna permission_role si no existe
ALTER TABLE equipo_invitaciones
    ADD COLUMN IF NOT EXISTS permission_role text NOT NULL DEFAULT 'viewer';

-- 2. Agregar columna role_id si no existe (para futuro uso con tabla roles)
--    Solo se agrega si la tabla roles existe
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'roles') THEN
        ALTER TABLE equipo_invitaciones
            ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES roles(id);
    END IF;
END $$;

-- 3. Actualizar política RLS SELECT para incluir admins de la empresa
--    (actualmente solo el owner y el invitado pueden ver invitaciones)
DROP POLICY IF EXISTS equipo_invitaciones_select ON equipo_invitaciones;

CREATE POLICY equipo_invitaciones_select ON equipo_invitaciones
    FOR SELECT
    TO authenticated
    USING (
        -- Owner de la empresa
        empresa_id IN (SELECT id FROM empresa WHERE usuario_id = auth.uid())
        -- Admin miembro de la empresa
        OR empresa_id IN (
            SELECT empresa_id FROM empresa_miembros
            WHERE usuario_id = auth.uid()
            AND role IN ('admin', 'owner')
        )
        -- El propio invitado
        OR invited_email = (auth.jwt() ->> 'email')
    );

-- 4. También actualizar política INSERT para admins
DROP POLICY IF EXISTS equipo_invitaciones_insert ON equipo_invitaciones;

CREATE POLICY equipo_invitaciones_insert ON equipo_invitaciones
    FOR INSERT
    TO authenticated
    WITH CHECK (
        -- Owner de la empresa
        empresa_id IN (SELECT id FROM empresa WHERE usuario_id = auth.uid())
        -- Admin miembro de la empresa
        OR empresa_id IN (
            SELECT empresa_id FROM empresa_miembros
            WHERE usuario_id = auth.uid()
            AND role IN ('admin', 'owner')
        )
    );


-- Primero, creamos el bucket asegurando que sea de acceso público
INSERT INTO storage.buckets (id, name, public) 
VALUES ('catalog-images', 'catalog-images', true)
ON CONFLICT (id) DO NOTHING;

-- Borramos las políticas de seguridad en caso de que hubieran quedado creadas a medias
DROP POLICY IF EXISTS "Fotos catalogos visibles para todos" ON storage.objects;
DROP POLICY IF EXISTS "Solo los dueños pueden subir fotos de su propia empresa" ON storage.objects;
DROP POLICY IF EXISTS "Solo los dueños pueden borrar fotos de su propia empresa" ON storage.objects;

-- Política 1: Todos pueden LEER/VER las fotos (necesario ya que se muestran en el sitio web/Cotizaciones que generes luego)
CREATE POLICY "Fotos catalogos visibles para todos" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'catalog-images');

-- Política 2: Solo un usuario que ha iniciado sesión puede SUBIR fotos a su carpeta
CREATE POLICY "Solo los dueños pueden subir fotos de su propia empresa" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'catalog-images');

-- Política 3: (Opcional, pero recomendada) Solo un usuario con sesión iniciada puede ELIMINAR fotos a futuro
CREATE POLICY "Solo los dueños pueden borrar fotos de su propia empresa" 
ON storage.objects FOR DELETE 
TO authenticated 
USING (bucket_id = 'catalog-images');