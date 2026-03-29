import { supabase } from "../client"

interface CreateEtapaDTO {
    nombre: string
    pipeline_id: string
    orden: number
    color: string
    is_sla_enabled?: boolean
    sla_limit_minutes?: number | null
}

interface UpdateEtapaDTO {
    nombre?: string
    orden?: number
    color?: string
    is_sla_enabled?: boolean
    sla_limit_minutes?: number | null
}

/**
 * Obtiene las etapas de un pipeline
 */
export const getEtapas = (pipeline_id: string) =>
    supabase.from("etapas").select("*").eq("pipeline_id", pipeline_id)

/**
 * Crea una nueva etapa en un pipeline
 */
export const createEtapa = (payload: CreateEtapaDTO) =>
    supabase.from("etapas").insert(payload).select().single()

/**
 * Actualiza una etapa existente
 */
export const updateEtapa = (id: string, payload: UpdateEtapaDTO) =>
    supabase.from("etapas").update(payload).eq("id", id).select().single()

/**
 * Elimina una etapa
 */
export const deleteEtapa = (id: string) =>
    supabase.from("etapas").delete().eq("id", id)
