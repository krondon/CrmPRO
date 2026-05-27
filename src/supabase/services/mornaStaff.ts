import { requireSupabase } from '../client'

export type MornaStaffRole = 'super_admin' | 'support'

export interface ActiveImpersonation {
    logId: string
    staffUserId: string
    staffEmail: string | null
    targetUserId: string
    targetEmpresaId: string | null
    reason: string
    startedAt: string
}

/**
 * Devuelve el rol del usuario actual en morna_staff, o null si no es staff.
 *
 * Detrás de escena llama a la RPC `is_morna_staff()` que pasa por encima de
 * RLS para consultar la tabla — el cliente nunca lee morna_staff directo.
 */
export async function getMornaStaffRole(): Promise<MornaStaffRole | null> {
    const supabase = requireSupabase()
    const { data, error } = await supabase.rpc('is_morna_staff')
    if (error) {
        // Si la RPC no existe (migración no aplicada) o falla, tratamos como
        // "no es staff" para no romper la app. Logueamos para diagnóstico.
        console.warn('[mornaStaff] is_morna_staff falló:', error.message)
        return null
    }
    if (!data) return null
    return data as MornaStaffRole
}

/**
 * Si el usuario actual está siendo "habitado" por un staff Morna (vía
 * impersonación), devuelve la metadata de esa sesión. Si no, devuelve null.
 *
 * Se llama al cargar la app para decidir si pintar el banner de
 * impersonación. La sesión activa vive en la BD (impersonation_log con
 * ended_at IS NULL), así que sobrevive a refresh de pestaña.
 */
export async function getActiveImpersonation(): Promise<ActiveImpersonation | null> {
    const supabase = requireSupabase()
    const { data, error } = await supabase.rpc('get_active_impersonation')
    if (error) {
        console.warn('[mornaStaff] get_active_impersonation falló:', error.message)
        return null
    }
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return null
    return {
        logId: row.log_id,
        staffUserId: row.staff_user_id,
        staffEmail: row.staff_email ?? null,
        targetUserId: row.target_user_id,
        targetEmpresaId: row.target_empresa_id ?? null,
        reason: row.reason,
        startedAt: row.started_at,
    }
}

export interface AdminCompanyRow {
    id: string
    nombre_empresa: string
    logo_url: string | null
    codigo_empresa: string | null
    created_at: string
    owner_user_id: string
    owner_email: string | null
    users_count: number
    leads_count: number
    messages_30d: number
    last_activity_at: string | null
}

export interface ListCompaniesParams {
    search?: string
    limit?: number
    offset?: number
    sort?: 'name_asc' | 'created_desc' | 'users_desc' | 'leads_desc' | 'activity_desc'
}

export interface ListCompaniesResult {
    companies: AdminCompanyRow[]
    total: number
    limit: number
    offset: number
}

/**
 * Lista empresas con métricas para el panel admin. Edge function gating.
 */
export async function listAdminCompanies(params: ListCompaniesParams = {}): Promise<ListCompaniesResult> {
    const supabase = requireSupabase()
    const { data, error } = await supabase.functions.invoke('admin-list-companies', {
        body: params,
    })
    if (error) {
        console.error('[mornaStaff] admin-list-companies error:', error)
        throw new Error(error.message || 'No se pudo listar empresas')
    }
    if (!data || !Array.isArray((data as any).companies)) {
        throw new Error('Respuesta inválida del servidor')
    }
    return data as ListCompaniesResult
}
