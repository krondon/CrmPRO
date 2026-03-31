import { supabase } from "../client"
import type { Pipeline, Stage, AssignmentType } from '@/lib/types'

interface PipelineDB {
    id: string
    nombre: string
    empresa_id: string
    assignment_type?: string
    last_assigned_persona_id?: string | null
    created_at: string
    etapas?: EtapaDB[]
}

interface EtapaDB {
    id: string
    nombre: string
    pipeline_id: string
    orden: number
    color: string
    created_at: string
}

interface CreatePipelineWithStagesDTO {
    name: string
    stages: Array<{
        name: string
        order: number
        color: string
    }>
    empresa_id: string
    assignment_type?: AssignmentType
}

/**
 * Obtiene todos los pipelines de una empresa con sus etapas
 */
export const getPipelines = (empresa_id: string) =>
    supabase.from("pipeline").select("*, etapas(*)").eq("empresa_id", empresa_id)

/**
 * Crea un nuevo pipeline
 */
export const createPipeline = (payload: { nombre: string; empresa_id: string; assignment_type?: AssignmentType }) =>
    supabase.from("pipeline").insert(payload).select().single()

/**
 * Actualiza un pipeline existente
 */
export const updatePipeline = (id: string, payload: Partial<{ nombre: string; assignment_type: AssignmentType }>) =>
    supabase.from("pipeline").update(payload).eq("id", id).select().single()

/**
 * Elimina un pipeline
 */
export const deletePipeline = (id: string) =>
    supabase.from("pipeline").delete().eq("id", id)

/**
 * Obtiene el siguiente asignado para auto-asignación (round_robin o random).
 * 
 * Retorna el usuario_id del miembro seleccionado, o null si no hay miembros disponibles.
 * Actualiza `last_assigned_persona_id` en la tabla pipeline para round robin.
 */
export const getNextAssignee = async (pipelineId: string): Promise<{ userId: string; personaId: string } | null> => {
    // 1. Leer configuración del pipeline
    const { data: pipeline, error: pErr } = await supabase
        .from('pipeline')
        .select('assignment_type, last_assigned_persona_id')
        .eq('id', pipelineId)
        .single()

    if (pErr || !pipeline) {
        console.error('[getNextAssignee] Error leyendo pipeline:', pErr)
        return null
    }

    const assignmentType = pipeline.assignment_type as AssignmentType
    if (!assignmentType || assignmentType === 'manual') return null

    // 2. Obtener miembros del pipeline con su usuario_id
    const { data: members, error: mErr } = await supabase
        .from('persona_pipeline')
        .select('persona_id, persona:persona!inner(id, usuario_id)')
        .eq('pipeline_id', pipelineId)

    if (mErr || !members || members.length === 0) {
        console.warn('[getNextAssignee] No hay miembros en el pipeline:', pipelineId)
        return null
    }

    // Filtrar solo miembros con usuario_id válido
    const validMembers = members
        .map((m: any) => ({
            personaId: m.persona_id as string,
            userId: (m.persona?.usuario_id || null) as string | null
        }))
        .filter(m => m.userId != null) as { personaId: string; userId: string }[]

    if (validMembers.length === 0) {
        console.warn('[getNextAssignee] Ningún miembro tiene usuario_id vinculado')
        return null
    }

    let selected: { personaId: string; userId: string }

    if (assignmentType === 'round_robin') {
        // Ordenar por personaId para consistencia
        validMembers.sort((a, b) => a.personaId.localeCompare(b.personaId))

        const lastId = pipeline.last_assigned_persona_id
        let nextIndex = 0

        if (lastId) {
            const lastIndex = validMembers.findIndex(m => m.personaId === lastId)
            nextIndex = lastIndex === -1 ? 0 : (lastIndex + 1) % validMembers.length
        }

        selected = validMembers[nextIndex]

        // Actualizar el puntero de round robin
        await supabase
            .from('pipeline')
            .update({ last_assigned_persona_id: selected.personaId })
            .eq('id', pipelineId)

    } else if (assignmentType === 'random') {
        const randomIndex = Math.floor(Math.random() * validMembers.length)
        selected = validMembers[randomIndex]
    } else {
        return null
    }

    return selected
}

/**
 * Crea un pipeline con sus etapas en una sola operación
 */
export const createPipelineWithStages = async (pipelineData: CreatePipelineWithStagesDTO): Promise<Pipeline> => {
    const { name, stages, empresa_id, assignment_type } = pipelineData

    // 1. Insertar el pipeline
    const insertPayload: any = { nombre: name, empresa_id }
    if (assignment_type) insertPayload.assignment_type = assignment_type

    const { data: pipeline, error: pipelineError } = await supabase
        .from('pipeline')
        .insert(insertPayload)
        .select('id')
        .single()

    if (pipelineError) {
        console.error('Error creating pipeline:', pipelineError)
        throw new Error(`Error creating pipeline: ${pipelineError.message}`)
    }

    if (!pipeline) {
        throw new Error('Failed to create pipeline, no ID returned.')
    }

    const pipelineId = pipeline.id

    // 2. Preparar las etapas para la inserción
    const stagesToInsert = stages.map(stage => ({
        nombre: stage.name,
        pipeline_id: pipelineId,
        orden: stage.order,
        color: stage.color,
    }))

    // 3. Insertar las etapas
    const { data: insertedStages, error: stagesError } = await supabase
        .from('etapas')
        .insert(stagesToInsert)
        .select()

    if (stagesError) {
        console.error('Error creating stages:', stagesError)
        console.warn('Stages creation failed, but pipeline was created.')
    }

    // 4. Devolver el pipeline completo
    const { data: newPipelineWithStages } = await supabase
        .from('pipeline')
        .select(`*`)
        .eq('id', pipelineId)
        .single()

    if (!newPipelineWithStages) {
        throw new Error('Failed to retrieve created pipeline')
    }

    // Mapear etapas insertadas
    const mappedStages: Stage[] = (insertedStages || []).map((s: EtapaDB) => ({
        id: s.id,
        name: s.nombre,
        order: s.orden,
        color: s.color,
        pipelineType: newPipelineWithStages.nombre.toLowerCase().trim().replace(/\s+/g, '-')
    }))

    return {
        id: newPipelineWithStages.id,
        name: newPipelineWithStages.nombre,
        type: newPipelineWithStages.nombre.toLowerCase().trim().replace(/\s+/g, '-'),
        stages: mappedStages,
        assignment_type: (newPipelineWithStages.assignment_type as AssignmentType) || 'manual'
    }
}


export const updatePipelinesOrder = async (updates: { id: string; orden: number }[]) => { const promises = updates.map(u => supabase.from('pipeline').update({ orden: u.orden }).eq('id', u.id)); return Promise.all(promises); }
