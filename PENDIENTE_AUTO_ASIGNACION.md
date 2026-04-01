# Pendientes: Auto-Asignación (Base de Datos)

## 1. Función RPC para Round Robin atómico (Recomendado)

Actualmente la lógica de round robin se ejecuta client-side con múltiples queries:
1. Lee `last_assigned_persona_id` del pipeline
2. Consulta miembros de `persona_pipeline`
3. Calcula el siguiente
4. Actualiza `last_assigned_persona_id`

Si dos usuarios crean leads al mismo tiempo, ambos pueden leer el mismo `last_assigned_persona_id` y asignar al mismo miembro (race condition).

### Solución: crear una función RPC en PostgreSQL

```sql
CREATE OR REPLACE FUNCTION get_next_assignee(p_pipeline_id UUID)
RETURNS TABLE(user_id UUID, persona_id UUID) AS $$
DECLARE
    v_assignment_type TEXT;
    v_last_persona_id UUID;
    v_selected_persona_id UUID;
    v_selected_user_id UUID;
    v_count INT;
BEGIN
    -- Bloquear fila del pipeline para evitar race conditions
    SELECT assignment_type, last_assigned_persona_id
    INTO v_assignment_type, v_last_persona_id
    FROM pipeline
    WHERE id = p_pipeline_id
    FOR UPDATE;

    IF v_assignment_type IS NULL OR v_assignment_type = 'manual' THEN
        RETURN;
    END IF;

    -- Contar miembros válidos
    SELECT COUNT(*) INTO v_count
    FROM persona_pipeline pp
    JOIN persona p ON p.id = pp.persona_id
    WHERE pp.pipeline_id = p_pipeline_id
      AND p.usuario_id IS NOT NULL;

    IF v_count = 0 THEN
        RETURN;
    END IF;

    IF v_assignment_type = 'round_robin' THEN
        -- Obtener el siguiente miembro después del último asignado
        SELECT p.usuario_id, pp.persona_id
        INTO v_selected_user_id, v_selected_persona_id
        FROM persona_pipeline pp
        JOIN persona p ON p.id = pp.persona_id
        WHERE pp.pipeline_id = p_pipeline_id
          AND p.usuario_id IS NOT NULL
          AND (v_last_persona_id IS NULL OR pp.persona_id > v_last_persona_id)
        ORDER BY pp.persona_id ASC
        LIMIT 1;

        -- Si no encontró (estamos al final), volver al primero
        IF v_selected_persona_id IS NULL THEN
            SELECT p.usuario_id, pp.persona_id
            INTO v_selected_user_id, v_selected_persona_id
            FROM persona_pipeline pp
            JOIN persona p ON p.id = pp.persona_id
            WHERE pp.pipeline_id = p_pipeline_id
              AND p.usuario_id IS NOT NULL
            ORDER BY pp.persona_id ASC
            LIMIT 1;
        END IF;

        -- Actualizar puntero
        UPDATE pipeline
        SET last_assigned_persona_id = v_selected_persona_id
        WHERE id = p_pipeline_id;

    ELSIF v_assignment_type = 'random' THEN
        -- Seleccionar miembro aleatorio
        SELECT p.usuario_id, pp.persona_id
        INTO v_selected_user_id, v_selected_persona_id
        FROM persona_pipeline pp
        JOIN persona p ON p.id = pp.persona_id
        WHERE pp.pipeline_id = p_pipeline_id
          AND p.usuario_id IS NOT NULL
        ORDER BY random()
        LIMIT 1;
    END IF;

    IF v_selected_user_id IS NOT NULL THEN
        user_id := v_selected_user_id;
        persona_id := v_selected_persona_id;
        RETURN NEXT;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Cómo usarla después de crearla

Reemplazar la lógica en `src/supabase/helpers/pipeline.ts` (`getNextAssignee`):

```typescript
export const getNextAssignee = async (pipelineId: string): Promise<{ userId: string; personaId: string } | null> => {
    const { data, error } = await supabase.rpc('get_next_assignee', { p_pipeline_id: pipelineId })

    if (error || !data || data.length === 0) {
        if (error) console.error('[getNextAssignee] RPC error:', error)
        return null
    }

    return { userId: data[0].user_id, personaId: data[0].persona_id }
}
```

Y en el webhook-chat, reemplazar el bloque de auto-asignación inline por:

```typescript
const { data: assigneeData } = await supabase.rpc('get_next_assignee', { p_pipeline_id: targetPipelineId });
if (assigneeData && assigneeData.length > 0) {
    autoAssignedTo = assigneeData[0].user_id;
}
```

## 2. Verificar columnas en la tabla `pipeline`

Confirmar que existen estas columnas (ya deberían estar según el schema):

```sql
-- Verificar
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'pipeline'
  AND column_name IN ('assignment_type', 'last_assigned_persona_id');
```

Si no existen:

```sql
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS assignment_type TEXT DEFAULT 'manual';
ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS last_assigned_persona_id UUID REFERENCES persona(id) ON DELETE SET NULL;
```

## 3. Permisos RLS para persona_pipeline (lectura desde Edge Function)

Las Edge Functions usan `service_role` key, así que bypasean RLS. No se necesitan cambios de permisos para el webhook.

Para el cliente (AddLeadDialog), verificar que la política RLS de `persona_pipeline` permita lectura a miembros de la empresa. Si `getNextAssignee` falla silenciosamente en producción, este es el primer lugar donde mirar.
