-- ============================================================
-- AI Analytics Query
-- Tabla de auditoría de consultas y función segura que recibe
-- un "plan" JSON generado por la IA y devuelve métricas
-- siempre acotadas por empresa_id (multi-tenant safe).
--
-- La IA NUNCA escribe SQL. Solo produce un JSON con un metric
-- whitelisteado y filtros tipados; esta función traduce ese
-- plan a SELECTs pre-escritos.
-- ============================================================

-- ─── Audit log ──────────────────────────────────────────────
create table if not exists ai_analytics_query_log (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresa(id) on delete cascade,
  usuario_id  uuid references auth.users(id) on delete set null,
  question    text not null,
  plan        jsonb not null,
  result_meta jsonb,
  error       text,
  created_at  timestamptz not null default now()
);

alter table ai_analytics_query_log enable row level security;

drop policy if exists "Company members can view ai_analytics_query_log"
  on ai_analytics_query_log;
create policy "Company members can view ai_analytics_query_log"
  on ai_analytics_query_log
  for select
  using (
    empresa_id in (
      select empresa_id from empresa_miembros where usuario_id = auth.uid()
      union
      select id from empresa where usuario_id = auth.uid()
    )
  );

create index if not exists idx_ai_analytics_query_log_empresa_id
  on ai_analytics_query_log (empresa_id);
create index if not exists idx_ai_analytics_query_log_created_at
  on ai_analytics_query_log (created_at desc);


-- ─── Función segura ─────────────────────────────────────────
-- Llamada únicamente desde la edge function ai-analytics-query,
-- que ya validó la pertenencia del usuario a la empresa antes
-- de invocarla. Aun así, se hace defense-in-depth: si llega un
-- empresa_id que no existe, lanza excepción.
create or replace function run_analytics_query(
  p_empresa_id uuid,
  p_plan       jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metric    text        := p_plan->>'metric';
  v_from      timestamptz := nullif(p_plan->'filters'->>'date_from','')::timestamptz;
  v_to        timestamptz := nullif(p_plan->'filters'->>'date_to','')::timestamptz;
  v_pipeline  uuid        := nullif(p_plan->'filters'->>'pipeline_id','')::uuid;
  v_priority  text        := nullif(p_plan->'filters'->>'priority','');
  v_days      int         := coalesce(nullif(p_plan->'filters'->>'days_threshold','')::int, 7);
  v_limit     int         := least(coalesce(nullif(p_plan->'filters'->>'limit','')::int, 10), 50);
  v_result    jsonb;
begin
  if p_empresa_id is null then
    raise exception 'empresa_id is required';
  end if;

  if not exists (select 1 from empresa where id = p_empresa_id) then
    raise exception 'empresa not found';
  end if;

  case v_metric

    -- ── 1. Suma de presupuesto en etapas ganadoras ──
    when 'closed_revenue' then
      select jsonb_build_object(
        'kind',  'kpi',
        'value', coalesce(sum(l.presupuesto), 0),
        'count', count(*)
      ) into v_result
      from lead l
      join etapas e on e.id = l.etapa_id
      where l.empresa_id = p_empresa_id
        and l.archived = false
        and (v_from is null or l.created_at >= v_from)
        and (v_to   is null or l.created_at <= v_to)
        and (v_pipeline is null or l.pipeline_id = v_pipeline)
        and e.nombre ~* 'ganad|won|cierre|venta|compr';

    -- ── 2. Valor del embudo (todos los activos) ──
    when 'pipeline_value' then
      select jsonb_build_object(
        'kind',  'kpi',
        'value', coalesce(sum(l.presupuesto), 0),
        'count', count(*)
      ) into v_result
      from lead l
      where l.empresa_id = p_empresa_id
        and l.archived = false
        and (v_from is null or l.created_at >= v_from)
        and (v_to   is null or l.created_at <= v_to)
        and (v_pipeline is null or l.pipeline_id = v_pipeline)
        and (v_priority is null or l.prioridad = v_priority);

    -- ── 3. # Leads creados ──
    when 'leads_count' then
      select jsonb_build_object(
        'kind',  'kpi',
        'value', count(*)
      ) into v_result
      from lead l
      where l.empresa_id = p_empresa_id
        and l.archived = false
        and (v_from is null or l.created_at >= v_from)
        and (v_to   is null or l.created_at <= v_to)
        and (v_pipeline is null or l.pipeline_id = v_pipeline);

    -- ── 4. Tasa de conversión ──
    when 'conversion_rate' then
      with base as (
        select l.id, e.nombre as etapa_nombre
        from lead l
        join etapas e on e.id = l.etapa_id
        where l.empresa_id = p_empresa_id
          and l.archived = false
          and (v_from is null or l.created_at >= v_from)
          and (v_to   is null or l.created_at <= v_to)
          and (v_pipeline is null or l.pipeline_id = v_pipeline)
      )
      select jsonb_build_object(
        'kind',  'kpi',
        'value', case when count(*) = 0 then 0
                      else round( (count(*) filter (where etapa_nombre ~* 'ganad|won|cierre|venta|compr')::numeric
                                   / count(*)::numeric) * 100, 1) end,
        'count', count(*)
      ) into v_result
      from base;

    -- ── 5. Top vendedores por leads cerrados ──
    when 'top_users' then
      select jsonb_build_object(
        'kind',  'series',
        'rows',  coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      ) into v_result
      from (
        select coalesce(u.nombre, 'Sin asignar') as label,
               count(*)::int                     as value,
               coalesce(sum(l.presupuesto), 0)   as revenue
        from lead l
        join etapas e on e.id = l.etapa_id
        left join usuarios u on u.id = l.asignado_a
        where l.empresa_id = p_empresa_id
          and l.archived = false
          and (v_from is null or l.created_at >= v_from)
          and (v_to   is null or l.created_at <= v_to)
          and e.nombre ~* 'ganad|won|cierre|venta|compr'
        group by u.nombre
        order by value desc
        limit v_limit
      ) t;

    -- ── 6. Leads agrupados por etapa ──
    when 'leads_by_stage' then
      select jsonb_build_object(
        'kind',  'series',
        'rows',  coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      ) into v_result
      from (
        select e.nombre  as label,
               count(l.id)::int as value
        from etapas e
        join pipeline p on p.id = e.pipeline_id
        left join lead l
          on l.etapa_id = e.id
         and l.archived = false
         and (v_from is null or l.created_at >= v_from)
         and (v_to   is null or l.created_at <= v_to)
        where p.empresa_id = p_empresa_id
          and (v_pipeline is null or p.id = v_pipeline)
        group by e.nombre, e.orden
        order by e.orden asc
      ) t;

    -- ── 7. Leads sin actividad en X días ──
    when 'stale_leads' then
      select jsonb_build_object(
        'kind',  'kpi',
        'value', count(*),
        'days_threshold', v_days
      ) into v_result
      from lead l
      where l.empresa_id = p_empresa_id
        and l.archived = false
        and coalesce(l.last_message_at, l.created_at) < (now() - make_interval(days => v_days));

    -- ── 8. Distribución por prioridad ──
    when 'priority_breakdown' then
      select jsonb_build_object(
        'kind',  'series',
        'rows',  jsonb_build_array(
          jsonb_build_object('label','Alta',  'value', count(*) filter (where l.prioridad = 'high')),
          jsonb_build_object('label','Media', 'value', count(*) filter (where l.prioridad = 'medium')),
          jsonb_build_object('label','Baja',  'value', count(*) filter (where l.prioridad = 'low'))
        )
      ) into v_result
      from lead l
      where l.empresa_id = p_empresa_id
        and l.archived = false
        and (v_from is null or l.created_at >= v_from)
        and (v_to   is null or l.created_at <= v_to);

    else
      raise exception 'Unknown metric: %', v_metric;
  end case;

  return coalesce(v_result, '{}'::jsonb);
end $$;

revoke all on function run_analytics_query(uuid, jsonb) from public;
grant execute on function run_analytics_query(uuid, jsonb) to service_role;
