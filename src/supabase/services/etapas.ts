import { supabase } from '../client'
import type { EtapaDB, CreateEtapaDTO } from '@/lib/types'

/**
 * Obtiene todas las etapas de un pipeline
 */
export async function getEtapas(pipelineId: string): Promise<EtapaDB[]> {
    const { data, error } = await supabase
        .from('etapas')
        .select('*')
        .eq('pipeline_id', pipelineId)

    if (error) throw error
    return data ?? []
}

/**
 * Crea una nueva etapa
 */
export async function createEtapa(etapa: CreateEtapaDTO): Promise<EtapaDB> {
    const { data, error } = await supabase
        .from('etapas')
        .insert(etapa)
        .select()
        .single()

    if (error) throw error
    return data
}

/**
 * Elimina una etapa
 */
export async function deleteEtapa(id: string): Promise<boolean> {
    const { error } = await supabase
        .from('etapas')
        .delete()
        .eq('id', id)

    if (error) throw error
    return true
}

/**
 * Actualiza el orden de una etapa
 */
export async function updateEtapaOrder(id: string, orden: number): Promise<EtapaDB> {
    const { data, error } = await supabase
        .from('etapas')
        .update({ orden })
        .eq('id', id)
        .select()
        .single()

    if (error) throw error
    return data
}

export async function resetStageSLAs(stageId: string): Promise<boolean> { 
    const now = new Date().toISOString();
    const { error } = await supabase
        .from('lead')
        .update({ 
            stage_entered_at: now, 
            sla_custom_limit_minutes: null 
        })
        .eq('etapa_id', stageId)
        .eq('archived', false);
        
    if (error) {
        console.error('Error in resetStageSLAs:', error);
        throw error;
    }
    return true; 
}

export async function syncStageSLALimits(stageId: string, limitMinutes: number | null): Promise<boolean> { const { error } = await supabase.from('lead').update({ sla_custom_limit_minutes: limitMinutes }).eq('etapa_id', stageId).eq('archived', false); if (error) { console.error('Error sync limit', error); throw error; } return true; }
