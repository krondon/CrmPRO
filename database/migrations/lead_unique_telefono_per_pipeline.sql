-- ============================================================
-- lead_unique_telefono_per_pipeline.sql
--
-- El constraint actual `uq_lead_empresa_telefono_not_null` impide
-- tener dos leads con el mismo teléfono dentro de la misma empresa,
-- aunque estén en pipelines distintos. Esto bloquea la funcionalidad
-- de "copiar oportunidad a otro pipeline".
--
-- Cambiamos el unique a (empresa_id, telefono, pipeline_id) para que:
--   - Sigue bloqueando duplicados accidentales dentro del mismo pipeline
--     (p. ej. webhook que reingresa al mismo lead por WhatsApp).
--   - Permite duplicación intencional del mismo teléfono en otro pipeline
--     (ventas + postventa, etc.).
-- ============================================================

-- 1) Eliminar el constraint/índice antiguo si existen (ambos nombres posibles)
alter table lead drop constraint if exists uq_lead_empresa_telefono_not_null;
drop index if exists uq_lead_empresa_telefono_not_null;

-- 2) Crear el nuevo índice único parcial que incluye pipeline_id
create unique index if not exists uq_lead_empresa_telefono_pipeline_not_null
  on lead (empresa_id, telefono, pipeline_id)
  where telefono is not null;
