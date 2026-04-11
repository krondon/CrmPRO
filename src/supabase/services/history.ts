import { supabase } from '../client'
import type { LeadHistory, CreateLeadHistoryDTO } from '@/lib/types'

/**
 * Crea una nueva entrada en el historial de la oportunidad
 */
export async function createHistoryEntry(entry: CreateLeadHistoryDTO): Promise<LeadHistory> {
    const { data, error } = await supabase
        .from('lead_historial')
        .insert(entry)
        .select()
        .single()

    if (error) {
        console.error('[createHistoryEntry] Error:', error)
        throw error
    }
    return data
}

/**
 * Obtiene el historial de una oportunidad con los nombres de los usuarios
 */
export async function getLeadHistory(leadId: string): Promise<LeadHistory[]> {
    const { data, error } = await supabase
        .from('lead_historial')
        .select(`
            *,
            usuarios:usuario_id (nombre)
        `)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('[getLeadHistory] Error:', error)
        throw error
    }

    // Mapear el join para facilitar el uso en el frontend
    return (data || []).map(item => ({
        ...item,
        usuario_nombre: item.usuarios?.nombre || 'Sistema'
    }))
}

/**
 * Obtiene el historial global de todas las oportunidades de una empresa.
 * Resuelve nombres de usuario en dos pasos:
 *  1. Tabla `usuarios` (funciona en modo propio)
 *  2. Tabla `empresa_miembros` (accesible en modo invitado, contiene email como fallback)
 */
export async function getCompanyHistory(empresaId: string): Promise<(LeadHistory & { lead_nombre?: string })[]> {
    const { data, error } = await supabase
        .from('lead_historial')
        .select(`
            *,
            leads:lead_id (nombre_completo, empresa_id)
        `)
        .order('created_at', { ascending: false })
        .limit(300)

    if (error) {
        console.error('[getCompanyHistory] Error:', error)
        throw error
    }

    // Filtrar solo los leads de esta empresa
    const filtered = (data || []).filter((item: any) => item.leads?.empresa_id === empresaId)
    if (filtered.length === 0) return []

    // Obtener IDs únicos de usuarios para resolver nombres
    const usuarioIds = [...new Set(filtered.map((item: any) => item.usuario_id).filter(Boolean))] as string[]
    const nombreMap: Record<string, string> = {}

    if (usuarioIds.length > 0) {
        // Paso 1: intentar con tabla `usuarios` (funciona en modo propio)
        const { data: usuarios, error: usuariosError } = await supabase
            .from('usuarios')
            .select('id, nombre')
            .in('id', usuarioIds)

        if (!usuariosError && usuarios) {
            usuarios.forEach((u: any) => {
                if (u.id && u.nombre) {
                    nombreMap[u.id] = u.nombre
                }
            })
        }

        // Paso 2: para IDs sin nombre, usar `empresa_miembros` con join a `usuarios`
        // Esta tabla es accesible en modo invitado (controla el acceso a la empresa)
        const missingIds = usuarioIds.filter(id => !nombreMap[id])
        if (missingIds.length > 0) {
            const { data: miembros, error: miembrosError } = await supabase
                .from('empresa_miembros')
                .select('usuario_id, email, usuarios:usuario_id(nombre)')
                .eq('empresa_id', empresaId)
                .in('usuario_id', missingIds)

            if (!miembrosError && miembros) {
                miembros.forEach((m: any) => {
                    if (m.usuario_id) {
                        // Preferir nombre de usuarios, luego parte del email
                        const nombre = (m.usuarios as any)?.nombre
                        const email = m.email as string | null
                        nombreMap[m.usuario_id] = nombre || (email ? email.split('@')[0] : 'Usuario')
                    }
                })
            }
        }

        // Paso 3: el propietario de la empresa puede no estar en empresa_miembros
        // Lo buscamos directamente desde empresa.usuario_id
        const stillMissingIds = usuarioIds.filter(id => !nombreMap[id])
        if (stillMissingIds.length > 0) {
            const { data: empresa } = await supabase
                .from('empresa')
                .select('usuario_id, nombre_empresa')
                .eq('id', empresaId)
                .single()

            if (empresa && empresa.usuario_id && stillMissingIds.includes(empresa.usuario_id)) {
                // El propietario aún no tiene nombre — usar nombre de empresa como referencia
                // (Solo aplica si no pudimos resolverlo por ningún otro medio)
                nombreMap[empresa.usuario_id] = `Propietario`
            }
        }
    }

    return filtered.map((item: any) => ({
        ...item,
        // Priority: 1) stored at write-time in metadata, 2) runtime join resolution, 3) fallback
        usuario_nombre: item.metadata?.actor_nombre || nombreMap[item.usuario_id] || 'Sistema',
        lead_nombre: item.leads?.nombre_completo || 'Oportunidad eliminada'
    }))
}

