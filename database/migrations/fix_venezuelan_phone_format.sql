-- ============================================================
-- fix_venezuelan_phone_format.sql
--
-- Backfill puntual: corregir teléfonos de leads que entraron por formulario
-- en formato VE local (0412..., 04125896324) al formato internacional
-- (584..., 584125896324) que espera SuperAPI / WhatsApp con @c.us.
--
-- Origen del problema: el edge function `Recived_landing_with_token`
-- normalizaba teléfonos solo quitando no-dígitos, sin reemplazar el "0"
-- líder por "58". Tras un evento donde muchas personas se registraron con
-- su número local, esos leads quedaron con teléfonos no enviables.
--
-- Este script ya no aplica para nuevos leads (el fix está aplicado en el
-- edge function). Aquí solo corregimos los históricos.
--
-- Operadoras VE consideradas: 412, 414, 416, 424, 426.
-- ============================================================


-- ============================================================
-- 1) INSPECCIÓN PREVIA (read-only)
--
-- Correr estas queries primero para entender el alcance y detectar
-- colisiones con el unique (empresa_id, telefono, pipeline_id).
-- ============================================================

-- Cuántos leads están en formato VE local
-- select count(*) as total_a_corregir
-- from lead
-- where telefono ~ '^0(412|414|416|424|426)[0-9]{7}$';

-- Colisiones: leads en formato local que YA tienen un gemelo internacional
-- en la misma empresa. El unique actual es (empresa_id, telefono) — bloquea
-- duplicados incluso si están en pipelines distintos.
-- select l.id, l.empresa_id, l.pipeline_id, l.telefono as telefono_local,
--        l.nombre_completo, l2.id as id_gemelo_internacional,
--        l2.pipeline_id as pipeline_gemelo
-- from lead l
-- join lead l2
--   on l2.empresa_id = l.empresa_id
--   and l2.telefono = '58' || substring(l.telefono from 2)
--   and l2.id <> l.id
-- where l.telefono ~ '^0(412|414|416|424|426)[0-9]{7}$';


-- ============================================================
-- 2) UPDATE seguro
--
-- Solo actualizamos los teléfonos VE locales que NO colisionan con un gemelo
-- internacional ya existente. Los que colisionen quedan como están y los
-- revisas manualmente con la query de auditoría #3 abajo.
-- ============================================================

update lead l
  set telefono = '58' || substring(l.telefono from 2)
  where l.telefono ~ '^0(412|414|416|424|426)[0-9]{7}$'
    and not exists (
      -- El unique actual en la BD es (empresa_id, telefono), no incluye
      -- pipeline_id. Por eso aquí no filtramos por pipeline — si filtráramos,
      -- el UPDATE colisionaría con un duplicado en otro pipeline de la misma
      -- empresa.
      select 1
      from lead l2
      where l2.empresa_id = l.empresa_id
        and l2.telefono = '58' || substring(l.telefono from 2)
        and l2.id <> l.id
    );


-- ============================================================
-- 3) AUDITORÍA POST-MIGRACIÓN
--
-- Si esto devuelve filas, son leads que quedaron en formato local porque
-- colisionaban con un gemelo internacional. Decide si:
--   - Eliminas el lead local y mantienes el internacional (si ya tiene chat).
--   - Mergeas tags/notas/mensajes del local al internacional.
--   - O al revés según cuál tenga más actividad.
-- ============================================================

-- select id, empresa_id, pipeline_id, telefono, nombre_completo, created_at
-- from lead
-- where telefono ~ '^0(412|414|416|424|426)[0-9]{7}$'
-- order by created_at desc;
