import { supabase } from '../client'
import { Tag, LeadDB } from '@/lib/types'

// ============================================================
// SAVED TAGS — Etiquetas persistentes a nivel empresa
// ============================================================

/**
 * Obtiene todas las etiquetas guardadas de la empresa (tabla saved_tags)
 */
export async function getSavedTags(empresaId: string): Promise<Tag[]> {
    const { data, error } = await supabase
        .from('saved_tags')
        .select('id, name, color')
        .eq('empresa_id', empresaId)
        .order('name')

    if (error) {
        console.error('Error fetching saved tags:', error)
        return []
    }

    return (data || []).map(row => ({ id: row.id, name: row.name, color: row.color }))
}

/**
 * Guarda una etiqueta nueva en la tabla persistente.
 * Si ya existe una con el mismo nombre (conflicto en empresa_id+name),
 * devuelve la etiqueta existente sin modificar su ID (PK).
 *
 * NOTA: No usamos upsert con onConflict porque PostgreSQL no permite
 * actualizar la primary key (id) en una cláusula ON CONFLICT DO UPDATE.
 */
export async function saveTag(empresaId: string, tag: Tag): Promise<Tag> {
    // 1. Intentar insertar directamente
    const { data: inserted, error: insertError } = await supabase
        .from('saved_tags')
        .insert({ id: tag.id, empresa_id: empresaId, name: tag.name, color: tag.color })
        .select('id, name, color')
        .single()

    if (!insertError && inserted) {
        console.log(`[saveTag] ✅ Etiqueta "${inserted.name}" guardada en saved_tags (id: ${inserted.id})`)
        return { id: inserted.id, name: inserted.name, color: inserted.color }
    }

    // 2. Si el conflicto es por nombre duplicado (unique_violation), devolver la existente
    if (insertError?.code === '23505') {
        console.log(`[saveTag] ℹ️ Nombre "${tag.name}" ya existe, obteniendo etiqueta existente...`)
        const { data: existing, error: fetchError } = await supabase
            .from('saved_tags')
            .select('id, name, color')
            .eq('empresa_id', empresaId)
            .eq('name', tag.name)
            .single()

        if (!fetchError && existing) {
            console.log(`[saveTag] ✅ Etiqueta existente devuelta: "${existing.name}" (id: ${existing.id})`)
            return { id: existing.id, name: existing.name, color: existing.color }
        }
        if (fetchError) throw fetchError
    }

    // 3. Cualquier otro error → propagar
    console.error('[saveTag] Error al guardar etiqueta en saved_tags:', insertError)
    console.error('[saveTag] Datos:', { id: tag.id, empresa_id: empresaId, name: tag.name, color: tag.color })
    console.error('[saveTag] Código:', insertError?.code, '| Mensaje:', insertError?.message)
    throw insertError
}

/**
 * Elimina una etiqueta guardada (solo de la biblioteca, no de los leads)
 */
export async function deleteSavedTag(tagId: string): Promise<void> {
    const { error } = await supabase
        .from('saved_tags')
        .delete()
        .eq('id', tagId)

    if (error) throw error
}

/**
 * Actualiza nombre/color de una etiqueta guardada
 */
export async function updateSavedTag(tagId: string, updates: Partial<Omit<Tag, 'id'>>): Promise<void> {
    const { error } = await supabase
        .from('saved_tags')
        .update(updates)
        .eq('id', tagId)

    if (error) throw error
}

// ============================================================
// VIRTUAL MASTER LIST — Combina saved_tags + tags en leads
// ============================================================

/**
 * Obtiene todas las etiquetas únicas: guardadas + las que están en leads.
 * Prioriza saved_tags como fuente de verdad.
 */
export async function getAllUniqueTags(empresaId: string): Promise<Tag[]> {
    // 1. Tags guardadas (fuente principal)
    const savedTags = await getSavedTags(empresaId)
    const tagMap = new Map<string, Tag>()
    savedTags.forEach(tag => tagMap.set(tag.id, tag))

    // 2. Tags en leads (para capturar las que aún no se han guardado)
    const { data, error } = await supabase
        .from('lead')
        .select('tags')
        .eq('empresa_id', empresaId)
        .not('tags', 'is', null)

    if (!error && data) {
        data.forEach((row: any) => {
            const tags = row.tags as Tag[]
            if (Array.isArray(tags)) {
                tags.forEach(tag => {
                    if (tag.id && !tagMap.has(tag.id)) {
                        tagMap.set(tag.id, tag)
                    }
                })
            }
        })
    }

    return Array.from(tagMap.values())
}

/**
 * Actualiza una etiqueta en TODOS los leads que la tengan
 * (Renombrar o cambiar color globalmente)
 */
export async function bulkUpdateTag(empresaId: string, tagId: string, updates: Partial<Omit<Tag, 'id'>>): Promise<void> {
    // 1. Obtener leads que tienen esta etiqueta
    // Postgres JSONB operator: tags @> '[{"id": "tagId"}]'
    const { data: leads, error: fetchError } = await supabase
        .from('lead')
        .select('id, tags')
        .eq('empresa_id', empresaId)
        .contains('tags', JSON.stringify([{ id: tagId }]))

    if (fetchError) throw fetchError
    if (!leads || leads.length === 0) return

    // 2. Preparar updates
    // Lamentablemente Supabase/Postgres no tiene un "UPDATE ... SET tags = REPLACE_IN_JSON_ARRAY..." nativo fácil
    // Así que lo hacemos iterativamente (o en batch si son pocos)

    // Para optimizar, procesaremos en paralelo con Promise.all (cuidado con rate limits si son miles)
    const updatePromises = leads.map(async (lead: any) => {
        const currentTags = lead.tags as Tag[]
        const newTags = currentTags.map(t =>
            t.id === tagId ? { ...t, ...updates } : t
        )

        return supabase
            .from('lead')
            .update({ tags: newTags })
            .eq('id', lead.id)
    })

    await Promise.all(updatePromises)
}

/**
 * Elimina una etiqueta de TODOS los leads
 */
export async function bulkDeleteTag(empresaId: string, tagId: string): Promise<void> {
    const { data: leads, error: fetchError } = await supabase
        .from('lead')
        .select('id, tags')
        .eq('empresa_id', empresaId)
        .contains('tags', JSON.stringify([{ id: tagId }]))

    if (fetchError) throw fetchError
    if (!leads || leads.length === 0) return

    const updatePromises = leads.map(async (lead: any) => {
        const currentTags = lead.tags as Tag[]
        const newTags = currentTags.filter(t => t.id !== tagId)

        return supabase
            .from('lead')
            .update({ tags: newTags })
            .eq('id', lead.id)
    })

    await Promise.all(updatePromises)
}

/**
 * Agrega una etiqueta a un lead específico (Helper)
 * @param skipSave  Si true, omite guardar en saved_tags (cuando el llamador ya lo hizo)
 */
export async function addTagToLead(leadId: string, currentTags: Tag[], newTag: Tag, empresaId: string, skipSave = false) {
    // Evitar duplicados por ID
    if (currentTags.some(t => t.id === newTag.id)) return

    const updatedTags = [...currentTags, newTag]

    const { error } = await supabase
        .from('lead')
        .update({ tags: updatedTags })
        .eq('id', leadId)

    if (error) throw error

    // Persistir en saved_tags solo si el llamador no lo hizo ya
    if (!skipSave) {
        await saveTag(empresaId, newTag)
    }

    // Log de auditoría
    import('./activityLog').then(({ logActivity }) => {
        logActivity({
            empresaId,
            categoria: 'tags',
            accion: 'agregar_tag',
            detalle: `Agregó la etiqueta "${newTag.text}" a una oportunidad`,
            entidadTipo: 'lead',
            entidadId: leadId,
            entidadNombre: newTag.text
        }).catch(e => console.error('[addTagToLead] log error:', e))
    })

    return updatedTags
}

/**
 * Remueve una etiqueta de un lead específico (Helper)
 */
export async function removeTagFromLead(leadId: string, currentTags: Tag[], tagId: string, empresaId?: string) {
    const removedTag = currentTags.find(t => t.id === tagId)
    const updatedTags = currentTags.filter(t => t.id !== tagId)

    const { error } = await supabase
        .from('lead')
        .update({ tags: updatedTags })
        .eq('id', leadId)

    if (error) throw error

    // Log de auditoría
    if (empresaId && removedTag) {
        import('./activityLog').then(({ logActivity }) => {
            logActivity({
                empresaId,
                categoria: 'tags',
                accion: 'eliminar_tag',
                detalle: `Eliminó la etiqueta "${removedTag.text}" de una oportunidad`,
                entidadTipo: 'lead',
                entidadId: leadId,
                entidadNombre: removedTag.text
            }).catch(e => console.error('[removeTagFromLead] log error:', e))
        })
    }

    return updatedTags
}

// ============================================================
// SINCRONIZACIÓN — Migrar etiquetas huérfanas a saved_tags
// ============================================================

export interface SyncTagsResult {
    total: number      // Total de tags únicas encontradas en leads
    saved: number      // Cuántas se guardaron/actualizaron en saved_tags
    skipped: number    // Cuántas ya existían y se saltaron
    errors: number     // Cuántas fallaron
}

/**
 * Escanea todos los leads de la empresa y guarda en saved_tags
 * cualquier etiqueta que aún no esté persistida.
 * Útil para migrar datos existentes.
 */
export async function syncLeadTagsToSavedTags(empresaId: string): Promise<SyncTagsResult> {
    const result: SyncTagsResult = { total: 0, saved: 0, skipped: 0, errors: 0 }

    // 1. Obtener IDs de tags ya guardadas
    const savedTags = await getSavedTags(empresaId)
    const savedIds = new Set(savedTags.map(t => t.id))
    const savedNames = new Set(savedTags.map(t => t.name.toLowerCase()))

    console.log(`[syncTags] saved_tags actuales: ${savedTags.length}`)

    // 2. Obtener todos los leads con tags
    const { data: leads, error } = await supabase
        .from('lead')
        .select('id, tags')
        .eq('empresa_id', empresaId)
        .not('tags', 'is', null)

    if (error) {
        console.error('[syncTags] Error obteniendo leads:', error)
        throw error
    }

    // 3. Recolectar tags únicas no guardadas
    const tagMap = new Map<string, Tag>()

    for (const lead of leads || []) {
        const tags = lead.tags as Tag[]
        if (!Array.isArray(tags)) continue

        for (const tag of tags) {
            if (!tag?.id || !tag?.name) continue
            // Deduplica: un tag por ID (primera aparición gana)
            if (!tagMap.has(tag.id)) {
                tagMap.set(tag.id, tag)
            }
        }
    }

    result.total = tagMap.size
    console.log(`[syncTags] Tags únicas encontradas en leads: ${result.total}`)

    // 4. Upsert de las que no están en saved_tags
    for (const [id, tag] of tagMap.entries()) {
        // Ya está guardada por ID → skip
        if (savedIds.has(id)) {
            result.skipped++
            continue
        }

        // Ya existe una con el mismo nombre → skip (evita error 400 si no hay unique constraint)
        if (savedNames.has(tag.name.toLowerCase())) {
            console.log(`[syncTags] ⚠️ Nombre duplicado, saltando: "${tag.name}" (${tag.id})`)
            result.skipped++
            continue
        }

        try {
            // Usar insert en lugar de upsert para evitar intentar actualizar la PK
            const { error: insertError } = await supabase
                .from('saved_tags')
                .insert({ id: tag.id, empresa_id: empresaId, name: tag.name, color: tag.color || '#64748b' })

            if (!insertError) {
                console.log(`[syncTags] ✅ Guardada: "${tag.name}" (${tag.id})`)
                result.saved++
            } else if (insertError.code === '23505') {
                // Conflicto de nombre duplicado — ya existe con otro ID, saltar
                console.log(`[syncTags] ⚠️ "${tag.name}" ya existe con otro ID, saltando`)
                result.skipped++
            } else {
                console.error(`[syncTags] ❌ Error guardando "${tag.name}" (${tag.id}):`, insertError.message, insertError.code)
                result.errors++
            }
        } catch (err) {
            console.error(`[syncTags] ❌ Excepción guardando "${tag.name}":`, err)
            result.errors++
        }
    }

    console.log(`[syncTags] Resultado: ${result.saved} guardadas, ${result.skipped} ya existían, ${result.errors} errores`)
    return result
}
