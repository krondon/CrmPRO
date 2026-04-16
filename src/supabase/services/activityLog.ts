import { supabase } from '../client'
import type { ActividadCategoria, ActividadCRM } from '@/lib/types'

interface LogActivityParams {
    empresaId: string
    categoria: ActividadCategoria
    accion: string
    detalle: string
    entidadTipo?: string
    entidadId?: string
    entidadNombre?: string
    metadata?: Record<string, unknown>
    actorId?: string
    actorNombre?: string
}

/**
 * Registra una actividad en el log de auditoría.
 * Auto-detecta el usuario si no se proporciona.
 * NUNCA lanza error — es fire-and-forget.
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
    try {
        let userId = params.actorId || null
        let userName = params.actorNombre || null

        // Auto-detectar usuario si no se proporcionó
        if (!userId) {
            const { data: { user } } = await supabase.auth.getUser()
            userId = user?.id || null
        }

        // Intentar resolver nombre si no se proporcionó
        if (!userName && userId) {
            const { data: usuario } = await supabase
                .from('usuarios')
                .select('nombre')
                .eq('id', userId)
                .maybeSingle()
            userName = usuario?.nombre || null

            // Fallback: buscar en empresa_miembros
            if (!userName) {
                const { data: miembro } = await supabase
                    .from('empresa_miembros')
                    .select('email')
                    .eq('usuario_id', userId)
                    .eq('empresa_id', params.empresaId)
                    .maybeSingle()
                userName = miembro?.email?.split('@')[0] || 'Usuario'
            }
        }

        await supabase.from('actividad_crm').insert({
            empresa_id: params.empresaId,
            usuario_id: userId,
            usuario_nombre: userName,
            categoria: params.categoria,
            accion: params.accion,
            detalle: params.detalle,
            entidad_tipo: params.entidadTipo || null,
            entidad_id: params.entidadId || null,
            entidad_nombre: params.entidadNombre || null,
            metadata: params.metadata || {}
        })
    } catch (err) {
        console.error('[logActivity] Error (non-blocking):', err)
    }
}

/**
 * Obtiene la actividad de una empresa (solo accesible por el owner vía RLS).
 */
export async function getCompanyActivity(
    empresaId: string,
    options?: { categoria?: string; limit?: number }
): Promise<ActividadCRM[]> {
    let query = supabase
        .from('actividad_crm')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })
        .limit(options?.limit || 500)

    if (options?.categoria && options.categoria !== 'all') {
        query = query.eq('categoria', options.categoria)
    }

    const { data, error } = await query

    if (error) {
        console.error('[getCompanyActivity] Error:', error)
        throw error
    }

    return (data || []) as ActividadCRM[]
}
