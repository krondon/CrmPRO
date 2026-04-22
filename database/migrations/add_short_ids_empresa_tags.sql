-- ============================================================
-- Short IDs para empresa y saved_tags
-- ============================================================

-- ── empresa ──────────────────────────────────────────────────

alter table empresa
  add column if not exists short_id integer;

create sequence if not exists empresa_short_id_seq start 1;

update empresa
set short_id = nextval('empresa_short_id_seq')
where short_id is null;

alter table empresa
  alter column short_id set default nextval('empresa_short_id_seq');

alter table empresa
  drop constraint if exists empresa_short_id_unique;
alter table empresa
  add constraint empresa_short_id_unique unique (short_id);

-- ── saved_tags ───────────────────────────────────────────────

alter table saved_tags
  add column if not exists short_id integer;

create sequence if not exists saved_tags_short_id_seq start 1;

update saved_tags
set short_id = nextval('saved_tags_short_id_seq')
where short_id is null;

alter table saved_tags
  alter column short_id set default nextval('saved_tags_short_id_seq');

alter table saved_tags
  drop constraint if exists saved_tags_short_id_unique;
alter table saved_tags
  add constraint saved_tags_short_id_unique unique (short_id);
