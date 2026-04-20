import { supabase } from '../client'

/**
 * Obtener todas las notas de un lead
 */
export async function getNotasByLead(leadId: string) {
    const { data, error } = await supabase
        .from('nota_lead')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
}

/**
 * Crear una nueva nota para un lead
 */
export async function createNota(leadId: string, contenido: string, creadorNombre?: string, empresaId?: string) {
    const { data: { user } } = await supabase.auth.getUser()

    const { data, error } = await supabase
        .from('nota_lead')
        .insert({
            lead_id: leadId,
            contenido,
            creado_por: user?.id || null,
            creador_nombre: creadorNombre || null
        })
        .select()
        .single()

    if (error) throw error

    // Log de auditoría
    if (empresaId) {
        import('./activityLog').then(({ logActivity }) => {
            logActivity({
                empresaId,
                categoria: 'notas',
                accion: 'crear_nota',
                detalle: `Agregó una nota: "${contenido.substring(0, 60)}${contenido.length > 60 ? '...' : ''}"`,
                entidadTipo: 'lead',
                entidadId: leadId,
                actorId: user?.id || undefined,
                actorNombre: creadorNombre
            }).catch(e => console.error('[createNota] log error:', e))
        })
    }

    return data
}

/**
 * Eliminar una nota
 */
export async function deleteNota(notaId: string, empresaId?: string) {
    const { error } = await supabase
        .from('nota_lead')
        .delete()
        .eq('id', notaId)

    if (error) throw error

    if (empresaId) {
        import('./activityLog').then(({ logActivity }) => {
            logActivity({
                empresaId,
                categoria: 'notas',
                accion: 'eliminar_nota',
                detalle: 'Eliminó una nota',
                entidadTipo: 'nota',
                entidadId: notaId
            }).catch(e => console.error('[deleteNota] log error:', e))
        })
    }

    return true
}

/**
 * Actualizar una nota
 */
export async function updateNota(notaId: string, contenido: string) {
    const { data, error } = await supabase
        .from('nota_lead')
        .update({ contenido })
        .eq('id', notaId)
        .select()
        .single()

    if (error) throw error
    return data
}

/**
 * Obtener conteo de notas para múltiples leads
 */
export async function getNotasCountByLeads(leadIds: string[]): Promise<Record<string, number>> {
    if (!leadIds.length) return {}

    const { data, error } = await supabase
        .from('nota_lead')
        .select('lead_id')
        .in('lead_id', leadIds)

    if (error) throw error

    const counts: Record<string, number> = {};
    (data || []).forEach(row => {
        counts[row.lead_id] = (counts[row.lead_id] || 0) + 1
    })
    return counts
}
