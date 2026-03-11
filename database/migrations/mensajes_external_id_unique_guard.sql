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
