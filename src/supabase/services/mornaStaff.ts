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

// ============================================================
// Impersonación ("entrar como cliente")
// ============================================================

export interface StartImpersonationResult {
    hashedToken: string
    targetUserId: string
    targetEmail: string
    targetName: string
    logId: string
}

export interface StartImpersonationParams {
    targetUserId: string
    empresaId?: string | null
    reason: string
}

// Mensajes amigables para los códigos de error que devuelven las edge functions.
const IMPERSONATION_ERROR_MESSAGES: Record<string, string> = {
    reason_too_short: 'El motivo debe tener al menos 10 caracteres.',
    cannot_impersonate_self: 'No puedes impersonarte a ti mismo.',
    cannot_impersonate_staff: 'No puedes impersonar a otro miembro del staff.',
    cannot_impersonate_anonymous: 'Esta cuenta no se puede impersonar (es anónima).',
    target_has_no_email: 'Esta cuenta no tiene correo, no se puede impersonar.',
    target_not_found: 'No se encontró el usuario objetivo.',
    missing_target: 'Falta indicar a quién impersonar.',
    forbidden: 'No tienes permiso para esta acción.',
    server_misconfigured: 'El servidor no está configurado para impersonación.',
}

/**
 * functions.invoke envuelve las respuestas no-2xx en un FunctionsHttpError cuyo
 * `context` es el Response original. Leemos el código de error del body para dar
 * un mensaje claro al usuario.
 */
async function readFnErrorCode(error: unknown): Promise<string | null> {
    try {
        const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context
        if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json()
            return body?.error ?? null
        }
    } catch {
        // body ya consumido o no-JSON
    }
    return null
}

/**
 * Inicia una sesión de impersonación. Devuelve el hashed_token que el front
 * intercambia por la sesión del objetivo vía verifyOtp.
 */
export async function startImpersonation(
    params: StartImpersonationParams,
): Promise<StartImpersonationResult> {
    const supabase = requireSupabase()
    const { data, error } = await supabase.functions.invoke('admin-start-impersonation', {
        body: {
            targetUserId: params.targetUserId,
            empresaId: params.empresaId ?? null,
            reason: params.reason,
        },
    })
    if (error) {
        const code = await readFnErrorCode(error)
        throw new Error(
            (code && IMPERSONATION_ERROR_MESSAGES[code]) || 'No se pudo iniciar la impersonación',
        )
    }
    if (!data?.hashed_token) throw new Error('Respuesta inválida del servidor')
    return {
        hashedToken: data.hashed_token,
        targetUserId: data.targetUserId,
        targetEmail: data.targetEmail,
        targetName: data.targetName,
        logId: data.logId,
    }
}

/**
 * Termina una sesión de impersonación (cierra ended_at). No lanza si falla: el
 * front debe poder restaurar la sesión del staff aunque el cierre del log falle.
 */
export async function endImpersonation(logId: string): Promise<void> {
    const supabase = requireSupabase()
    const { error } = await supabase.functions.invoke('admin-end-impersonation', {
        body: { logId },
    })
    if (error) {
        console.warn('[mornaStaff] admin-end-impersonation falló:', error)
    }
}

// ============================================================
// Gestión de staff + auditoría (PR 3)
// ============================================================

export interface MornaStaffMember {
    userId: string
    email: string | null
    nombre: string | null
    role: MornaStaffRole
    createdAt: string
    createdByEmail: string | null
    notes: string | null
}

export interface AuditAction {
    id: string
    action: string
    staffEmail: string | null
    targetEmail: string | null
    targetEmpresaId: string | null
    payload: Record<string, unknown> | null
    createdAt: string
}

export interface AuditImpersonation {
    id: string
    staffEmail: string | null
    targetEmail: string | null
    targetEmpresaId: string | null
    reason: string
    startedAt: string
    endedAt: string | null
    active: boolean
}

export interface AuditLogResult {
    actions: AuditAction[]
    impersonations: AuditImpersonation[]
}

const STAFF_ERROR_MESSAGES: Record<string, string> = {
    user_not_found: 'Ese correo no tiene una cuenta en el CRM. La persona debe registrarse primero.',
    invalid_role: 'Rol inválido.',
    missing_email: 'Falta el correo.',
    cannot_remove_self: 'No puedes quitarte a ti mismo del staff.',
    cannot_remove_last_admin: 'No puedes quitar al último super_admin.',
    not_staff: 'Ese usuario no es parte del staff.',
    forbidden: 'Solo un super_admin puede modificar el staff.',
}

/** Lista los miembros del staff Morna (con emails). Cualquier staff puede verla. */
export async function listMornaStaff(): Promise<MornaStaffMember[]> {
    const supabase = requireSupabase()
    const { data, error } = await supabase.functions.invoke('admin-list-staff', { body: {} })
    if (error) {
        const code = await readFnErrorCode(error)
        throw new Error((code && STAFF_ERROR_MESSAGES[code]) || 'No se pudo listar el staff')
    }
    if (!data || !Array.isArray(data.staff)) throw new Error('Respuesta inválida del servidor')
    return data.staff as MornaStaffMember[]
}

/** Agrega (o actualiza el rol de) un miembro del staff por email. Solo super_admin. */
export async function addMornaStaff(email: string, role: MornaStaffRole): Promise<void> {
    const supabase = requireSupabase()
    const { error } = await supabase.functions.invoke('admin-manage-staff', {
        body: { action: 'add', email, role },
    })
    if (error) {
        const code = await readFnErrorCode(error)
        throw new Error((code && STAFF_ERROR_MESSAGES[code]) || 'No se pudo agregar el staff')
    }
}

/** Quita un miembro del staff. Solo super_admin. */
export async function removeMornaStaff(userId: string): Promise<void> {
    const supabase = requireSupabase()
    const { error } = await supabase.functions.invoke('admin-manage-staff', {
        body: { action: 'remove', userId },
    })
    if (error) {
        const code = await readFnErrorCode(error)
        throw new Error((code && STAFF_ERROR_MESSAGES[code]) || 'No se pudo quitar el staff')
    }
}

/** Devuelve el rastro de auditoría: acciones admin + sesiones de impersonación. */
export async function listAuditLog(): Promise<AuditLogResult> {
    const supabase = requireSupabase()
    const { data, error } = await supabase.functions.invoke('admin-list-audit', { body: {} })
    if (error) {
        const code = await readFnErrorCode(error)
        throw new Error((code && STAFF_ERROR_MESSAGES[code]) || 'No se pudo cargar la auditoría')
    }
    if (!data) throw new Error('Respuesta inválida del servidor')
    return {
        actions: (data.actions ?? []) as AuditAction[],
        impersonations: (data.impersonations ?? []) as AuditImpersonation[],
    }
}
