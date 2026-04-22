-- Fix: el constraint unique en saved_tags debe ser por empresa,
-- no global. Así dos empresas pueden tener etiquetas con el mismo nombre.

-- Eliminar cualquier unique global en name que pueda existir
alter table saved_tags drop constraint if exists saved_tags_name_unique;
alter table saved_tags drop constraint if exists saved_tags_name_key;
alter table saved_tags drop constraint if exists saved_tags_label_unique;
alter table saved_tags drop constraint if exists saved_tags_label_key;

-- Agregar unique por empresa + nombre (permite mismo nombre en distintas empresas)
alter table saved_tags drop constraint if exists saved_tags_empresa_name_unique;
alter table saved_tags add constraint saved_tags_empresa_name_unique unique (empresa_id, name);
