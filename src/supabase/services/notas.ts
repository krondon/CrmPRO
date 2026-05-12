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

    const preview = `${contenido.substring(0, 60)}${contenido.length > 60 ? '...' : ''}`

    // Log de auditoría (owner)
    if (empresaId) {
        import('./activityLog').then(({ logActivity }) => {
            logActivity({
                empresaId,
                categoria: 'notas',
                accion: 'crear_nota',
                detalle: `Agregó una nota: "${preview}"`,
                entidadTipo: 'lead',
                entidadId: leadId,
                actorId: user?.id || undefined,
                actorNombre: creadorNombre
            }).catch(e => console.error('[createNota] log error:', e))
        })
    }

    // Historial de la oportunidad
    import('./history').then(({ logLeadEvent }) => {
        logLeadEvent({
            leadId,
            accion: 'nota_creada',
            detalle: `Agregó una nota: "${preview}"`,
            actorId: user?.id,
            actorNombre: creadorNombre,
            metadata: { nota_id: data?.id, preview }
        })
    })

    return data
}

/**
 * Eliminar una nota
 */
export async function deleteNota(notaId: string, empresaId?: string) {
    // Obtener lead_id y preview ANTES de borrar (para el historial)
    const { data: nota } = await supabase
        .from('nota_lead')
        .select('lead_id, contenido')
        .eq('id', notaId)
        .maybeSingle()

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

    // Historial de la oportunidad
    if (nota?.lead_id) {
        const contenido = (nota.contenido as string) || ''
        const preview = `${contenido.substring(0, 60)}${contenido.length > 60 ? '...' : ''}`
        import('./history').then(({ logLeadEvent }) => {
            logLeadEvent({
                leadId: nota.lead_id,
                accion: 'nota_eliminada',
                detalle: preview ? `Eliminó la nota: "${preview}"` : 'Eliminó una nota',
                metadata: { nota_id: notaId, preview }
            })
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
