-- ============================================================
-- usuarios.last_empresa_id
-- Persiste la última empresa seleccionada por el usuario, para
-- que al refrescar / cambiar de dispositivo se respete su elección
-- en lugar de caer siempre a la "primera" empresa.
-- ============================================================

alter table usuarios
  add column if not exists last_empresa_id uuid;

alter table usuarios
  drop constraint if exists usuarios_last_empresa_id_fkey;

alter table usuarios
  add constraint usuarios_last_empresa_id_fkey
  foreign key (last_empresa_id) references empresa(id) on delete set null;

create index if not exists idx_usuarios_last_empresa_id
  on usuarios (last_empresa_id);
