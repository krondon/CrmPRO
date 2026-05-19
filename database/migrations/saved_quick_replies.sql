-- ============================================================
-- Saved Quick Replies (Mensajes Predeterminados)
--
-- Biblioteca de mensajes de respuesta rápida compartidos a nivel
-- empresa. Cada miembro del equipo puede ver y usar los mensajes
-- en cualquier canal (WhatsApp, Instagram, Facebook).
--
-- Soporta variables {nombre}, {empresa}, {telefono} que se
-- reemplazan en el cliente al seleccionar el mensaje.
-- ============================================================

create table if not exists saved_quick_replies (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresa(id) on delete cascade,
  title       text not null,
  content     text not null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (empresa_id, title)
);

create index if not exists idx_saved_quick_replies_empresa
  on saved_quick_replies (empresa_id);

alter table saved_quick_replies enable row level security;

-- Lectura: cualquier miembro de la empresa.
create policy "Company members can read saved_quick_replies"
  on saved_quick_replies
  for select
  using (
    empresa_id in (
      select empresa_id from empresa_miembros where usuario_id = auth.uid()
      union
      select id from empresa where usuario_id = auth.uid()
    )
  );

-- Escritura (insert/update/delete): solo admin/owner.
-- Owner = dueño de empresa. Admin = empresa_miembros con role='admin'.
create policy "Admins and owners can write saved_quick_replies"
  on saved_quick_replies
  for all
  using (
    empresa_id in (
      select id from empresa where usuario_id = auth.uid()
      union
      select empresa_id from empresa_miembros
        where usuario_id = auth.uid() and role = 'admin'
    )
  )
  with check (
    empresa_id in (
      select id from empresa where usuario_id = auth.uid()
      union
      select empresa_id from empresa_miembros
        where usuario_id = auth.uid() and role = 'admin'
    )
  );
