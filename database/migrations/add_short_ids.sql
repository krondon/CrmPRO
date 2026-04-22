-- ============================================================
-- Short IDs para pipeline y etapas
-- Números cortos (1, 2, 3…) únicos por tabla, para que la IA
-- pueda referenciarlos sin necesidad de UUIDs largos.
-- ============================================================

-- ── pipeline ─────────────────────────────────────────────────

alter table pipeline
  add column if not exists short_id integer;

create sequence if not exists pipeline_short_id_seq start 1;

-- Backfill filas existentes
update pipeline
set short_id = nextval('pipeline_short_id_seq')
where short_id is null;

-- Default para filas nuevas
alter table pipeline
  alter column short_id set default nextval('pipeline_short_id_seq');

-- Unicidad global
alter table pipeline
  drop constraint if exists pipeline_short_id_unique;
alter table pipeline
  add constraint pipeline_short_id_unique unique (short_id);

-- ── etapas ───────────────────────────────────────────────────

alter table etapas
  add column if not exists short_id integer;

create sequence if not exists etapas_short_id_seq start 1;

-- Backfill filas existentes
update etapas
set short_id = nextval('etapas_short_id_seq')
where short_id is null;

-- Default para filas nuevas
alter table etapas
  alter column short_id set default nextval('etapas_short_id_seq');

-- Unicidad global
alter table etapas
  drop constraint if exists etapas_short_id_unique;
alter table etapas
  add constraint etapas_short_id_unique unique (short_id);
