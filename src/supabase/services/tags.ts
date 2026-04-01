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
 * Si ya existe una con el mismo nombre, retorna la existente.
 */
export async function saveTag(empresaId: string, tag: Tag): Promise<Tag> {
    // Upsert por (empresa_id, name) — si ya existe, actualizamos color
    const { data, error } = await supabase
        .from('saved_tags')
        .upsert(
            { id: tag.id, empresa_id: empresaId, name: tag.name, color: tag.color },
            { onConflict: 'empresa_id,name' }
        )
        .select('id, name, color')
        .single()

    if (error) {
        console.error('Error saving tag:', error)
        // Si falla el upsert, devolvemos el tag original para no romper el flujo
        return tag
    }

    return { id: data.id, name: data.name, color: data.color }
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
 * También la guarda en saved_tags para que persista.
 */
export async function addTagToLead(leadId: string, currentTags: Tag[], newTag: Tag, empresaId?: string) {
    // Evitar duplicados por ID
    if (currentTags.some(t => t.id === newTag.id)) return

    const updatedTags = [...currentTags, newTag]

    const { error } = await supabase
        .from('lead')
        .update({ tags: updatedTags })
        .eq('id', leadId)

    if (error) throw error

    // Persistir en saved_tags si tenemos empresaId
    if (empresaId) {
        saveTag(empresaId, newTag).catch(err =>
            console.error('Error persisting tag to saved_tags:', err)
        )
    }

    return updatedTags
}

/**
 * Remueve una etiqueta de un lead específico (Helper)
 */
export async function removeTagFromLead(leadId: string, currentTags: Tag[], tagId: string) {
    const updatedTags = currentTags.filter(t => t.id !== tagId)

    const { error } = await supabase
        .from('lead')
        .update({ tags: updatedTags })
        .eq('id', leadId)

    if (error) throw error
    return updatedTags
}
