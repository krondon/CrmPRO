import { requireSupabase } from '../client'
import type { QuickReply, QuickReplyDB, CreateQuickReplyDTO } from '@/lib/types'

// ============================================================
// Variables soportadas en el contenido del mensaje predeterminado.
// Se reemplazan en el cliente al seleccionar el mensaje (no se
// almacenan reemplazadas en BD). Si la variable no tiene valor en
// el lead, se sustituye por cadena vacía para no dejar "{nombre}"
// visible en el mensaje final.
// ============================================================
export interface QuickReplyLeadVariables {
    name?: string | null
    company?: string | null
    phone?: string | null
}

export const QUICK_REPLY_VARIABLES = [
    { key: 'nombre', label: 'Nombre del contacto' },
    { key: 'empresa', label: 'Empresa del contacto' },
    { key: 'telefono', label: 'Teléfono del contacto' },
] as const

export function renderQuickReply(content: string, vars: QuickReplyLeadVariables): string {
    const map: Record<string, string> = {
        nombre: (vars.name ?? '').trim(),
        empresa: (vars.company ?? '').trim(),
        telefono: (vars.phone ?? '').trim(),
    }
    return content.replace(/\{(nombre|empresa|telefono)\}/gi, (_match, key) => {
        return map[String(key).toLowerCase()] ?? ''
    })
}

function mapDb(row: QuickReplyDB): QuickReply {
    return { id: row.id, title: row.title, content: row.content }
}

export async function listQuickReplies(empresaId: string): Promise<QuickReply[]> {
    const { data, error } = await requireSupabase()
        .from('saved_quick_replies')
        .select('id, empresa_id, title, content, created_by, created_at, updated_at')
        .eq('empresa_id', empresaId)
        .order('title', { ascending: true })

    if (error) {
        console.error('[quickReplies] listQuickReplies error:', error)
        throw error
    }
    return (data || []).map(mapDb)
}

export async function createQuickReply(
    empresaId: string,
    dto: CreateQuickReplyDTO,
    createdBy?: string | null
): Promise<QuickReply> {
    const title = dto.title.trim()
    const content = dto.content.trim()
    if (!title || !content) {
        throw new Error('Título y contenido son obligatorios')
    }

    const { data, error } = await requireSupabase()
        .from('saved_quick_replies')
        .insert({
            empresa_id: empresaId,
            title,
            content,
            created_by: createdBy ?? null
        })
        .select('id, empresa_id, title, content, created_by, created_at, updated_at')
        .single()

    if (error) {
        // 23505 = nombre duplicado (unique constraint empresa_id+title)
        if ((error as any).code === '23505') {
            throw new Error(`Ya existe un mensaje predeterminado con el título "${title}"`)
        }
        console.error('[quickReplies] createQuickReply error:', error)
        throw error
    }
    return mapDb(data as QuickReplyDB)
}

export async function updateQuickReply(
    id: string,
    updates: Partial<CreateQuickReplyDTO>
): Promise<void> {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (updates.title !== undefined) patch.title = updates.title.trim()
    if (updates.content !== undefined) patch.content = updates.content.trim()

    const { error } = await requireSupabase()
        .from('saved_quick_replies')
        .update(patch)
        .eq('id', id)

    if (error) {
        if ((error as any).code === '23505') {
            throw new Error('Ya existe un mensaje predeterminado con ese título')
        }
        console.error('[quickReplies] updateQuickReply error:', error)
        throw error
    }
}

export async function deleteQuickReply(id: string): Promise<void> {
    const { error } = await requireSupabase()
        .from('saved_quick_replies')
        .delete()
        .eq('id', id)

    if (error) {
        console.error('[quickReplies] deleteQuickReply error:', error)
        throw error
    }
}
