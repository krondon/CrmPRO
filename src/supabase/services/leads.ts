import { supabase } from '../client'
import type {
    LeadDB,
    CreateLeadDTO,
    UpdateLeadDTO,
    PaginatedResponse,
    GetLeadsPagedOptions,
    SearchLeadsOptions
} from '@/lib/types'

/**
 * Obtiene todos los leads de una empresa
 */
export async function getLeads(
    empresaId: string,
    currentUserId?: string,
    isAdminOrOwner: boolean = false,
    includeArchived: boolean = false
): Promise<LeadDB[]> {
    let allData: LeadDB[] = []
    let page = 0
    const pageSize = 1000
    let hasMore = true

    while (hasMore) {
        let query = supabase
            .from('lead')
            .select('*')
            .eq('empresa_id', empresaId)
            .range(page * pageSize, (page + 1) * pageSize - 1)

        if (!includeArchived) {
            query = query.eq('archived', false)
        }

        if (!isAdminOrOwner && currentUserId) {
            query = query.or(`asignado_a.eq.${currentUserId},asignado_a.eq.00000000-0000-0000-0000-000000000000,asignado_a.is.null`)
        }

        const { data, error } = await query

        if (error) throw error
        
        if (data) {
            allData = [...allData, ...data]
        }
        
        if (!data || data.length < pageSize) {
            hasMore = false
        } else {
            page++
        }
    }

    return allData
}

/**
 * Obtiene un lead por su ID
 */
export async function getLeadById(id: string): Promise<LeadDB | null> {
    const { data, error } = await supabase
        .from('lead')
        .select('*')
        .eq('id', id)
        .single()

    if (error) {
        console.error('[getLeadById] Error:', error)
        return null
    }
    return data
}

/**
 * Obtiene el conteo de leads de una empresa
 */
export async function getLeadsCount(empresaId: string): Promise<number> {
    const { count, error } = await supabase
        .from('lead')
        .select('*', { count: 'exact', head: true })
        .eq('empresa_id', empresaId)
        .eq('archived', false)
        .not('pipeline_id', 'is', null)

    if (error) throw error
    return count ?? 0
}

/**
 * Obtiene leads paginados con filtros opcionales
 */
export async function getLeadsPaged(options: GetLeadsPagedOptions): Promise<PaginatedResponse<LeadDB>> {
    const {
        empresaId,
        currentUserId,
        isAdminOrOwner = false,
        limit = 200,
        offset = 0,
        pipelineId,
        stageId,
        order = 'desc',
        archived = false,
    } = options

    let query = supabase
        .from('lead')
        .select('*', { count: 'exact' })
        .eq('empresa_id', empresaId)

    if (archived === true) {
        query = query.eq('archived', true)
    } else if (archived === false) {
        query = query.eq('archived', false)
    }

    if (pipelineId) {
        query = query.eq('pipeline_id', pipelineId)
    }
    if (stageId) {
        query = query.eq('etapa_id', stageId)
    }

    if (!isAdminOrOwner && currentUserId) {
        query = query.or(`asignado_a.eq.${currentUserId},asignado_a.eq.00000000-0000-0000-0000-000000000000,asignado_a.is.null`)
    }

    query = query
        .order('created_at', { ascending: order === 'asc' })
        .range(offset, Math.max(0, offset + limit - 1))

    const { data, error, count } = await query
    if (error) throw error
    return { data: data ?? [], count }
}

/**
 * Busca leads por término
 */
export async function searchLeads(
    empresaId: string,
    searchTerm: string,
    options: SearchLeadsOptions = {}
): Promise<LeadDB[]> {
    if (!searchTerm || !empresaId) return []

    const {
        pipelineId,
        stageId,
        archived = false,
        limit = 50,
        order = 'desc',
    } = options

    let query = supabase
        .from('lead')
        .select('*')
        .eq('empresa_id', empresaId)

    if (archived === true) {
        query = query.eq('archived', true)
    } else if (archived === false) {
        query = query.eq('archived', false)
    }

    if (pipelineId) {
        query = query.eq('pipeline_id', pipelineId)
    }
    if (stageId) {
        query = query.eq('etapa_id', stageId)
    }

    query = query
        .or(
            `nombre_completo.ilike.%${searchTerm}%,telefono.ilike.%${searchTerm}%,correo_electronico.ilike.%${searchTerm}%,empresa.ilike.%${searchTerm}%`
        )
        .order('created_at', { ascending: order === 'asc' })
        .limit(limit)

    const { data, error } = await query

    if (error) throw error
    return data ?? []
}

import { createHistoryEntry } from './history'

/**
 * Crea un nuevo lead
 */
export async function createLead(lead: CreateLeadDTO, actorId?: string, actorNombre?: string): Promise<LeadDB> {
    const { data, error } = await supabase
        .from('lead')
        .insert(lead)
        .select()
        .single()

    if (error) throw error

    // Log creation
    if (actorId && data) {
        try {
            await createHistoryEntry({
                lead_id: data.id,
                usuario_id: actorId,
                accion: 'creacion',
                detalle: `Creó la oportunidad "${data.nombre_completo}"`,
                metadata: actorNombre ? { actor_nombre: actorNombre } : undefined
            })
        } catch (e) {
            console.error('[createLead] Error logging history:', e)
        }
    }

    return data
}

/**
 * Crea múltiples leads en una sola operación
 */
export async function createLeadsBulk(leads: CreateLeadDTO[], actorId?: string, actorNombre?: string): Promise<LeadDB[]> {
    const { data, error } = await supabase
        .from('lead')
        .insert(leads)
        .select()

    if (error) throw error

    // Log creation for each lead if actor provided
    if (actorId && data && data.length > 0) {
        try {
            const historyEntries = data.map(lead => ({
                lead_id: lead.id,
                usuario_id: actorId,
                accion: 'creacion' as const,
                detalle: `Importó la oportunidad "${lead.nombre_completo}"`,
                metadata: actorNombre ? { actor_nombre: actorNombre } : undefined
            }))

            await Promise.all(historyEntries.map(entry => createHistoryEntry(entry)))
        } catch (e) {
            console.error('[createLeadsBulk] Error logging history:', e)
        }
    }

    return data ?? []
}

/**
 * Actualiza un lead
 */
export async function updateLead(id: string, updates: UpdateLeadDTO, actorId?: string, actorNombre?: string): Promise<LeadDB> {
    // Get current state to compare if it's an assignment change
    const { data: currentLead } = await supabase.from('lead').select('asignado_a, nombre_completo').eq('id', id).single()

    const { data, error } = await supabase
        .from('lead')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

    if (error) throw error

    // Log assignment change if applicable
    if (actorId && data && updates.asignado_a !== undefined && updates.asignado_a !== currentLead?.asignado_a) {
        try {
            const isFirstAssignment = !currentLead?.asignado_a || currentLead?.asignado_a === '00000000-0000-0000-0000-000000000000'
            const accion = isFirstAssignment ? 'asignacion' : 'reasignacion'

            await createHistoryEntry({
                lead_id: id,
                usuario_id: actorId,
                accion: accion,
                detalle: isFirstAssignment ? 'Asignó la oportunidad' : 'Reasignó la oportunidad',
                metadata: {
                    prev_assigned_to: currentLead?.asignado_a,
                    new_assigned_to: updates.asignado_a,
                    ...(actorNombre ? { actor_nombre: actorNombre } : {})
                }
            })
        } catch (e) {
            console.error('[updateLead] Error logging history:', e)
        }
    }

    return data as LeadDB
}

/**
 * Archiva o desarchiva un lead
 */
export async function setLeadArchived(id: string, archived: boolean, actorId?: string, actorNombre?: string): Promise<LeadDB> {
    const updates: UpdateLeadDTO = {
        archived,
        archived_at: archived ? new Date().toISOString() : null
    }
    return updateLead(id, updates, actorId, actorNombre)
}

/**
 * Elimina un lead
 */
export async function deleteLead(id: string): Promise<boolean> {
    // Si en BD no tienen ON DELETE CASCADE, las borramos manualmente
    // Limpiamos mensajes del chat
    await supabase.from('mensajes').delete().eq('lead_id', id);
    // Limpiamos historial de la oportunidad
    await supabase.from('lead_historial').delete().eq('lead_id', id);
    // Limpiamos tareas de la oportunidad
    await supabase.from('tasks').delete().eq('lead_id', id);
    // Limpiamos notas
    await supabase.from('nota_lead').delete().eq('lead_id', id);
    // Limpiamos reuniones
    await supabase.from('lead_reuniones').delete().eq('lead_id', id);
    // Limpiamos presupuestos
    await supabase.from('presupuesto_pdf').delete().eq('lead_id', id);

    const { error } = await supabase
        .from('lead')
        .delete()
        .eq('id', id)

    if (error) throw error
    return true
}
