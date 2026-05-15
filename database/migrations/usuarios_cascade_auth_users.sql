-- ============================================================
-- usuarios.id -> auth.users(id) ON DELETE CASCADE
--
-- Cuando se borra una fila en auth.users, la fila correspondiente
-- en usuarios queda huerfana y bloquea cualquier registro futuro
-- con el mismo email (constraint UNIQUE en email + RLS que oculta
-- la fila al nuevo Auth user). Esta migracion:
--   1. Limpia huerfanos existentes (filas en usuarios sin auth.users).
--   2. Agrega FK usuarios.id -> auth.users(id) ON DELETE CASCADE.
-- ============================================================

begin;

-- 1. Listar huerfanos antes de borrarlos (informativo en el log).
do $$
declare
  orphan_count int;
begin
  select count(*) into orphan_count
    from usuarios u
    left join auth.users au on au.id = u.id
   where au.id is null;
  raise notice 'Huerfanos a eliminar: %', orphan_count;
end $$;

-- 2. Las invitaciones que apuntan a un usuario huerfano se desligan
--    (invited_usuario_id es nullable y el flujo de aceptacion soporta null).
update equipo_invitaciones ei
   set invited_usuario_id = null
 where ei.invited_usuario_id in (
   select u.id
     from usuarios u
     left join auth.users au on au.id = u.id
    where au.id is null
 );

-- 3. Borrar los huerfanos.
delete from usuarios u
 where not exists (select 1 from auth.users au where au.id = u.id);

-- 4. Si ya existe un FK de usuarios.id hacia auth.users (sin cascade),
--    lo eliminamos para reemplazarlo. El nombre del constraint puede variar
--    segun como se haya creado la tabla, asi que lo buscamos dinamicamente.
do $$
declare
  cname text;
begin
  select conname into cname
    from pg_constraint
   where conrelid = 'public.usuarios'::regclass
     and contype = 'f'
     and confrelid = 'auth.users'::regclass
     and conkey = array[
       (select attnum from pg_attribute
         where attrelid = 'public.usuarios'::regclass and attname = 'id')
     ]
   limit 1;

  if cname is not null then
    execute format('alter table public.usuarios drop constraint %I', cname);
    raise notice 'FK previo eliminado: %', cname;
  end if;
end $$;

-- 5. Crear el FK con ON DELETE CASCADE.
alter table public.usuarios
  add constraint usuarios_id_auth_fkey
  foreign key (id) references auth.users(id) on delete cascade;

commit;
