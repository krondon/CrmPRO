import { supabase } from '../client'
import type {
    LeadDB,
    CreateLeadDTO,
    UpdateLeadDTO,
    PaginatedResponse,
    GetLeadsPagedOptions,
    SearchLeadsOptions
} from '@/lib/types'

export const SHARED_LEAD_COLUMNS = [
    'id',
    'nombre_completo',
    'correo_electronico',
    'telefono',
    'empresa',
    'ubicacion',
    'presupuesto',
    'etapa_id',
    'pipeline_id',
    'prioridad',
    'asignado_a',
    'empresa_id',
    'created_at',
    'archived',
    'archived_at',
    'tags',
    'evento',
    'membresia',
    'channel',
    'instance_id',
    'external_handle',
    'preferred_instance_id',
    'last_message_at',
    'last_message_sender',
    'stage_entered_at',
    'sla_custom_limit_minutes',
    'custom_fields'
].join(',')

/**
 * Obtiene todos los leads de una empresa
 */
export async function getLeads(
    empresaId: string,
    currentUserId?: string,
    isAdminOrOwner: boolean = false,
    includeArchived: boolean = false,
    strictAssignment: boolean = false,
    strictAssignedToIds?: string[]
): Promise<LeadDB[]> {
    let allData: LeadDB[] = []
    let page = 0
    const pageSize = 1000
    let hasMore = true

    while (hasMore) {
        let query = supabase
            .from('lead')
            .select(SHARED_LEAD_COLUMNS)
            .eq('empresa_id', empresaId)
            .range(page * pageSize, (page + 1) * pageSize - 1)

        if (!includeArchived) {
            query = query.eq('archived', false)
        }

        if (strictAssignment) {
            // Modo estricto: solo leads asignados a los IDs explícitos del usuario.
            // `asignado_a` puede ser usuario_id o persona.id según cómo se creó el lead;
            // por eso aceptamos un array.
            const ids = (strictAssignedToIds && strictAssignedToIds.length > 0)
                ? strictAssignedToIds
                : (currentUserId ? [currentUserId] : [])
            if (ids.length === 0) {
                // Sin IDs no hay nada que mostrar.
                return []
            }
            query = query.in('asignado_a', ids)
        } else if (!isAdminOrOwner && currentUserId) {
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
        .select(SHARED_LEAD_COLUMNS)
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
        strictAssignment = false,
        strictAssignedToIds,
        limit = 200,
        offset = 0,
        pipelineId,
        stageId,
        order = 'desc',
        archived = false,
    } = options

    let query = supabase
        .from('lead')
        .select(SHARED_LEAD_COLUMNS, { count: 'exact' })
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

    if (strictAssignment) {
        // Modo estricto: solo leads cuyo `asignado_a` esté en la lista de IDs del usuario
        // (acepta tanto su usuario_id como su persona.id).
        const ids = (strictAssignedToIds && strictAssignedToIds.length > 0)
            ? strictAssignedToIds
            : (currentUserId ? [currentUserId] : [])
        if (ids.length === 0) {
            return { data: [], count: 0 }
        }
        query = query.in('asignado_a', ids)
    } else if (!isAdminOrOwner && currentUserId) {
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
        .select(SHARED_LEAD_COLUMNS)
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

function normalizeSearchText(value: unknown): string {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
}

function collectTagSearchTokens(rawTags: unknown, savedTagNamesById: Map<string, string>): string[] {
    const tokens = new Set<string>()

    let tagEntries: unknown[] = []
    if (Array.isArray(rawTags)) {
        tagEntries = rawTags
    } else if (typeof rawTags === 'string') {
        try {
            const parsed = JSON.parse(rawTags)
            tagEntries = Array.isArray(parsed) ? parsed : [rawTags]
        } catch {
            tagEntries = [rawTags]
        }
    } else if (rawTags && typeof rawTags === 'object') {
        tagEntries = Object.values(rawTags as Record<string, unknown>)
    }

    for (const entry of tagEntries) {
        if (typeof entry === 'string') {
            const idToken = normalizeSearchText(entry)
            if (idToken) tokens.add(idToken)

            const resolvedName = savedTagNamesById.get(entry)
            const resolvedToken = normalizeSearchText(resolvedName)
            if (resolvedToken) tokens.add(resolvedToken)
            continue
        }

        if (!entry || typeof entry !== 'object') continue

        const tagObj = entry as Record<string, unknown>
        const rawId = tagObj.id
        if (typeof rawId === 'string') {
            const idToken = normalizeSearchText(rawId)
            if (idToken) tokens.add(idToken)

            const resolvedName = savedTagNamesById.get(rawId)
            const resolvedToken = normalizeSearchText(resolvedName)
            if (resolvedToken) tokens.add(resolvedToken)
        }

        for (const key of ['name', 'label', 'nombre', 'text', 'value', 'title']) {
            const valueToken = normalizeSearchText(tagObj[key])
            if (valueToken) tokens.add(valueToken)
        }
    }

    return Array.from(tokens)
}

export async function searchLeadsByMeta(
    empresaId: string,
    searchTerm: string,
    archived: boolean
): Promise<LeadDB[]> {
    if (!empresaId) return []

    const normalizedTerm = searchTerm.trim()
    const normalizedNeedle = normalizeSearchText(normalizedTerm)
    if (normalizedNeedle.length < 2) return []

    const metaMatches = await searchLeads(empresaId, normalizedTerm, {
        archived,
        limit: 50,
    })

    const { data: savedTagsData } = await supabase
        .from('saved_tags')
        .select('id, name')
        .eq('empresa_id', empresaId)

    const savedTagNamesById = new Map<string, string>()
    for (const row of ((savedTagsData ?? []) as Array<{ id: string; name?: string | null }>)) {
        const token = normalizeSearchText(row.name)
        if (token) savedTagNamesById.set(row.id, token)
    }

    // PostgREST no ofrece contains parcial/case-insensitive sobre tag.name en arreglos jsonb; se filtra en memoria.
    const { data: tagsCandidates, error: tagsError } = await supabase
        .from('lead')
        .select(SHARED_LEAD_COLUMNS)
        .eq('empresa_id', empresaId)
        .eq('archived', archived)
        .not('tags', 'is', null)
        .limit(2000)

    if (tagsError) {
        throw tagsError
    }

    const tagMatches = (tagsCandidates ?? []).filter((lead) => {
        const tags = (lead as LeadDB & { tags?: unknown }).tags
        const tokens = collectTagSearchTokens(tags, savedTagNamesById)
        return tokens.some((token) => token.includes(normalizedNeedle))
    })

    const dedup = new Map<string, LeadDB>()
    for (const lead of [...metaMatches, ...tagMatches]) {
        if (!dedup.has(lead.id)) dedup.set(lead.id, lead)
    }

    return Array.from(dedup.values()).slice(0, 50)
}

export async function getLeadsByIds(
    empresaId: string,
    leadIds: string[],
    archived: boolean
): Promise<LeadDB[]> {
    if (!empresaId || leadIds.length === 0) return []

    const { data, error } = await supabase
        .from('lead')
        .select(SHARED_LEAD_COLUMNS)
        .eq('empresa_id', empresaId)
        .eq('archived', archived)
        .in('id', leadIds)

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
 * Duplica una oportunidad (lead) a otro pipeline / etapa.
 * Copia los datos comerciales del lead y sus notas. No copia chat, reuniones, ni
 * metadata de canal (instance_id, channel, external_handle, last_message_at) — eso
 * deja al duplicado limpio y evita que webhooks reenruten mensajes al lead nuevo.
 */
export async function duplicateLead(
    sourceLeadId: string,
    targetPipelineId: string,
    targetStageId: string,
    actorId?: string,
    actorNombre?: string
): Promise<LeadDB> {
    // 1. Leer el lead origen
    const { data: sourceRaw, error: sourceErr } = await supabase
        .from('lead')
        .select(SHARED_LEAD_COLUMNS)
        .eq('id', sourceLeadId)
        .single()

    if (sourceErr || !sourceRaw) {
        throw new Error(sourceErr?.message || 'No se encontró la oportunidad original')
    }
    const source = sourceRaw as any

    // 2. Construir payload sin metadatos de canal/cronología (se regeneran)
    const payload: Record<string, any> = {
        nombre_completo: source.nombre_completo,
        correo_electronico: source.correo_electronico,
        telefono: source.telefono,
        empresa: source.empresa,
        empresa_id: source.empresa_id,
        ubicacion: source.ubicacion,
        presupuesto: source.presupuesto,
        prioridad: source.prioridad,
        asignado_a: source.asignado_a,
        evento: source.evento,
        membresia: source.membresia,
        tags: source.tags ?? [],
        custom_fields: source.custom_fields ?? {},
        pipeline_id: targetPipelineId,
        etapa_id: targetStageId,
    }

    // 3. Insertar el duplicado
    const { data: createdRaw, error: insertErr } = await supabase
        .from('lead')
        .insert(payload)
        .select()
        .single()

    if (insertErr || !createdRaw) {
        throw new Error(insertErr?.message || 'No se pudo crear el duplicado')
    }
    const created = createdRaw as LeadDB

    // 4. Copiar notas (best-effort, no fallar si hay error)
    try {
        const { data: notas } = await supabase
            .from('nota_lead')
            .select('contenido, creado_por, creador_nombre, created_at')
            .eq('lead_id', sourceLeadId)

        if (notas && notas.length > 0) {
            const notaInserts = notas.map((n: any) => ({
                lead_id: created.id,
                contenido: n.contenido,
                creado_por: n.creado_por,
                creador_nombre: n.creador_nombre,
                created_at: n.created_at,
            }))
            const { error: notaErr } = await supabase.from('nota_lead').insert(notaInserts)
            if (notaErr) console.warn('[duplicateLead] No se pudieron copiar las notas:', notaErr)
        }
    } catch (e) {
        console.warn('[duplicateLead] Error copiando notas:', e)
    }

    // 5. Log de historial en el lead duplicado (best-effort)
    if (actorId) {
        try {
            await createHistoryEntry({
                lead_id: created.id,
                usuario_id: actorId,
                accion: 'creacion',
                detalle: `Duplicó la oportunidad "${created.nombre_completo}" desde otro pipeline`,
                metadata: {
                    actor_nombre: actorNombre,
                    source_lead_id: sourceLeadId,
                }
            })
        } catch (e) {
            console.error('[duplicateLead] Error logging history:', e)
        }
    }

    return created
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
    // Get current state to compare assignment / priority changes
    const { data: currentLead } = await supabase.from('lead').select('asignado_a, nombre_completo, prioridad').eq('id', id).single()

    const { data, error } = await supabase
        .from('lead')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

    if (error) throw error

    // Log assignment / unassignment change
    const NIL_UUID = '00000000-0000-0000-0000-000000000000'
    if (actorId && data && updates.asignado_a !== undefined && updates.asignado_a !== currentLead?.asignado_a) {
        try {
            const prev = currentLead?.asignado_a
            const next = updates.asignado_a
            const prevIsEmpty = !prev || prev === NIL_UUID
            const nextIsEmpty = !next || next === NIL_UUID

            let accion: string
            let detalle: string
            if (nextIsEmpty && !prevIsEmpty) {
                accion = 'desasignacion'
                detalle = 'Desasignó la oportunidad'
            } else if (prevIsEmpty) {
                accion = 'asignacion'
                detalle = 'Asignó la oportunidad'
            } else {
                accion = 'reasignacion'
                detalle = 'Reasignó la oportunidad'
            }

            await createHistoryEntry({
                lead_id: id,
                usuario_id: actorId,
                accion,
                detalle,
                metadata: {
                    prev_assigned_to: prev,
                    new_assigned_to: next,
                    ...(actorNombre ? { actor_nombre: actorNombre } : {})
                }
            })
        } catch (e) {
            console.error('[updateLead] Error logging history (asignacion):', e)
        }
    }

    // Log priority change
    if (actorId && data && updates.prioridad !== undefined && updates.prioridad !== currentLead?.prioridad) {
        try {
            const labelMap: Record<string, string> = { low: 'BAJA', medium: 'MEDIA', high: 'ALTA' }
            const newLabel = labelMap[updates.prioridad as string] || String(updates.prioridad).toUpperCase()
            await createHistoryEntry({
                lead_id: id,
                usuario_id: actorId,
                accion: 'prioridad_cambio',
                detalle: `Cambió prioridad a ${newLabel}`,
                metadata: {
                    prev_priority: currentLead?.prioridad,
                    new_priority: updates.prioridad,
                    ...(actorNombre ? { actor_nombre: actorNombre } : {})
                }
            })
        } catch (e) {
            console.error('[updateLead] Error logging history (prioridad):', e)
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
    const result = await updateLead(id, updates, actorId, actorNombre)

    // Log de auditoría
    import('./activityLog').then(({ logActivity }) => {
        logActivity({
            empresaId: result.empresa_id,
            categoria: 'leads',
            accion: archived ? 'archivar' : 'desarchivar',
            detalle: archived
                ? `Archivó la oportunidad "${result.nombre_completo}"`
                : `Desarchivó la oportunidad "${result.nombre_completo}"`,
            entidadTipo: 'lead',
            entidadId: id,
            entidadNombre: result.nombre_completo,
            actorId,
            actorNombre
        }).catch(e => console.error('[setLeadArchived] log error:', e))
    })

    return result
}

/**
 * Elimina un lead
 */
export async function deleteLead(id: string): Promise<boolean> {
    // Obtener info del lead ANTES de eliminar (para el log de auditoría)
    const { data: leadInfo } = await supabase
        .from('lead')
        .select('nombre_completo, empresa_id')
        .eq('id', id)
        .maybeSingle()

    // Log ANTES de eliminar (la fila desaparecerá después)
    if (leadInfo?.empresa_id) {
        const { logActivity } = await import('./activityLog')
        await logActivity({
            empresaId: leadInfo.empresa_id,
            categoria: 'leads',
            accion: 'eliminar',
            detalle: `Eliminó la oportunidad "${leadInfo.nombre_completo || 'desconocida'}"`,
            entidadTipo: 'lead',
            entidadId: id,
            entidadNombre: leadInfo.nombre_completo || undefined
        }).catch(e => console.error('[deleteLead] log error:', e))
    }

    // Si en BD no tienen ON DELETE CASCADE, las borramos manualmente
    await supabase.from('mensajes').delete().eq('lead_id', id);
    await supabase.from('lead_historial').delete().eq('lead_id', id);
    await supabase.from('tasks').delete().eq('lead_id', id);
    await supabase.from('nota_lead').delete().eq('lead_id', id);
    await supabase.from('lead_reuniones').delete().eq('lead_id', id);
    await supabase.from('presupuesto_pdf').delete().eq('lead_id', id);

    const { error } = await supabase
        .from('lead')
        .delete()
        .eq('id', id)

    if (error) throw error
    return true
}
