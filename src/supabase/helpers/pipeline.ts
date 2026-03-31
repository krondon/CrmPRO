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
 * Usa la función RPC `get_next_assignee` de PostgreSQL que ejecuta todo de forma
 * atómica con FOR UPDATE, evitando race conditions cuando dos leads se crean al
 * mismo tiempo.
 */
export const getNextAssignee = async (pipelineId: string): Promise<{ userId: string; personaId: string } | null> => {
    const { data, error } = await supabase.rpc('get_next_assignee', { p_pipeline_id: pipelineId })

    if (error) {
        console.error('[getNextAssignee] RPC error:', error)
        return null
    }

    if (!data || data.length === 0) return null

    return {
        userId: data[0].user_id,
        personaId: data[0].persona_id
    }
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


export const updatePipelinesOrder = async (updates: { id: string; orden: number }[]) => {
    const promises = updates.map(async u => {
        const { error } = await supabase.from('pipeline').update({ orden: u.orden }).eq('id', u.id)
        if (error) throw error
    });
    return Promise.all(promises);
}
