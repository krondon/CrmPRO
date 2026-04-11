import { supabase } from '../client'
import type {
    EmpresaDB,
    CreateEmpresaDTO,
    UpdateEmpresaDTO,
    EmpresaMiembro,
    MemberRole,
    UpdateMemberRoleDTO
} from '@/lib/types'

// ==========================================
// CRUD de Empresa
// ==========================================

/**
 * Crea una nueva empresa
 */
export async function createEmpresa({ nombre_empresa, usuario_id, logo_url }: CreateEmpresaDTO): Promise<EmpresaDB> {
    console.log('[EMPRESA] createEmpresa inicio', { nombre_empresa, usuario_id })

    const { data: sessionData } = await supabase.auth.getSession()
    const currentUid = sessionData?.session?.user?.id
    console.log('[EMPRESA] sesión actual UID', currentUid)

    if (!currentUid) {
        throw new Error('No hay sesión activa para crear empresa (UID vacío).')
    }
    if (currentUid !== usuario_id) {
        console.warn('[EMPRESA] UID de sesión y usuario_id difieren', { currentUid, usuario_id })
    }

    const insertPayload: Record<string, unknown> = { nombre_empresa, usuario_id }
    if (logo_url) insertPayload.logo_url = logo_url

    console.log('[EMPRESA] payload insert', insertPayload)

    const { data: inserted, error: insertError } = await supabase
        .from('empresa')
        .insert(insertPayload)
        .select()
        .single()

    if (insertError) {
        console.error('[EMPRESA] error insert empresa', insertError)
        throw insertError
    }

    console.log('[EMPRESA] empresa insertada retorno inmediato', inserted)

    // Fallback: si el trigger fn_seed_roles_on_empresa_create no creó los roles, crearlos manualmente
    if (inserted?.id) {
        try {
            const { data: existingRoles } = await supabase
                .from('roles')
                .select('name')
                .eq('empresa_id', inserted.id)
                .in('name', ['Admin', 'Viewer'])

            const existingNames = new Set((existingRoles || []).map((r: any) => r.name))
            const toInsert = []

            if (!existingNames.has('Admin')) {
                toInsert.push({
                    empresa_id: inserted.id,
                    name: 'Admin',
                    permissions: ['view_dashboard','view_pipeline','edit_leads','delete_leads','view_analytics','view_calendar','manage_team','manage_settings','view_budgets','edit_budgets'],
                    color: '#8b5cf6',
                    is_system: true
                })
            }
            if (!existingNames.has('Viewer')) {
                toInsert.push({
                    empresa_id: inserted.id,
                    name: 'Viewer',
                    permissions: ['view_dashboard','view_pipeline','view_analytics','view_calendar','view_budgets'],
                    color: '#6b7280',
                    is_system: true
                })
            }
            if (toInsert.length > 0) {
                const { error: rolesErr } = await supabase.from('roles').insert(toInsert)
                if (rolesErr) {
                    console.warn('[EMPRESA] no se pudieron crear roles de sistema:', rolesErr.message)
                }
            }
        } catch (e) {
            console.warn('[EMPRESA] error en fallback de roles:', e)
        }
    }

    return inserted
}

/**
 * Actualiza el logo de una empresa
 */
export async function updateEmpresaLogo(empresa_id: string, logo_url: string): Promise<EmpresaDB> {
    if (!empresa_id) throw new Error('empresa_id requerido')
    if (!logo_url) throw new Error('logo_url requerido')

    const { data, error } = await supabase
        .from('empresa')
        .update({ logo_url })
        .eq('id', empresa_id)
        .select('*')
        .single()

    if (error) throw error
    return data
}

/**
 * Actualiza una empresa
 */
export async function updateEmpresa(empresa_id: string, updates: UpdateEmpresaDTO): Promise<EmpresaDB> {
    if (!empresa_id) throw new Error('empresa_id requerido')

    const { data, error } = await supabase
        .from('empresa')
        .update(updates)
        .eq('id', empresa_id)
        .select('*')
        .single()

    if (error) throw error
    return data
}

interface EmpresaWithRole extends EmpresaDB {
    role: MemberRole
}

/**
 * Obtiene las empresas de un usuario (propias + donde es miembro)
 */
export async function getEmpresasByUsuario(usuario_id: string): Promise<EmpresaWithRole[]> {
    console.log('[EMPRESA] getEmpresasByUsuario', usuario_id)

    // 1. Empresas propias
    const { data: owned, error: ownedError } = await supabase
        .from('empresa')
        .select('*')
        .eq('usuario_id', usuario_id)

    if (ownedError) {
        console.error('[EMPRESA] error getEmpresasByUsuario (owned)', ownedError)
        throw ownedError
    }

    // 2. Empresas donde soy miembro (via empresa_miembros)
    const { data: memberData, error: memberError } = await supabase
        .from('empresa_miembros')
        .select(`
      empresa_id,
      role,
      empresa (
        id,
        nombre_empresa,
        usuario_id,
        created_at,
        logo_url,
        codigo_empresa
      )
    `)
        .eq('usuario_id', usuario_id)

    if (memberError) {
        console.error('[EMPRESA] error getEmpresasByUsuario (member)', memberError)
    }

    const memberCompanies: EmpresaWithRole[] = memberData
        ? memberData
            .map((m: any) => {
                if (!m.empresa) return null
                return {
                    ...m.empresa,
                    role: (m.role || 'viewer') as MemberRole
                }
            })
            .filter(Boolean)
            .filter((emp: any, index: number, self: any[]) =>
                index === self.findIndex((t) => t.id === emp.id)
            )
        : []

    // Marcar las empresas propias con rol 'owner'
    const ownedWithRole: EmpresaWithRole[] = (owned || []).map((e: any) => ({
        ...e,
        role: 'owner' as MemberRole
    }))

    // Combinar y eliminar duplicados (priorizando 'owner')
    const allCompanies = [...ownedWithRole, ...memberCompanies].filter(
        (emp, index, self) => index === self.findIndex((t) => t.id === emp.id)
    )

    console.log('[EMPRESA] empresas encontradas (propias + miembro)', allCompanies)
    return allCompanies
}

/**
 * Elimina una empresa
 */
export async function deleteEmpresa(id: string): Promise<boolean> {
    console.log('[EMPRESA] deleteEmpresa', id)

    const { error } = await supabase
        .from('empresa')
        .delete()
        .eq('id', id)

    if (error) {
        console.error('[EMPRESA] error delete empresa', error)
        throw error
    }
    return true
}

// ==========================================
// Gestión de Miembros
// ==========================================

/**
 * Obtiene los miembros de una empresa (incluye join con roles si role_id existe)
 */
export async function getCompanyMembers(companyId: string): Promise<EmpresaMiembro[]> {
    const { data, error } = await supabase
        .from('empresa_miembros')
        .select(`
            *,
            roles (
                id,
                name,
                permissions,
                color,
                is_system
            )
        `)
        .eq('empresa_id', companyId)

    if (error) throw error
    return data ?? []
}

/**
 * Actualiza el rol de un miembro (actualiza tanto role string como role_id UUID)
 */
export async function updateCompanyMemberRole(
    companyId: string,
    { usuario_id, email, role, role_id }: UpdateMemberRoleDTO
): Promise<EmpresaMiembro[]> {
    if (!companyId) throw new Error('companyId requerido')
    if (!role) throw new Error('role requerido')

    const updatePayload: Record<string, unknown> = { role }
    if (role_id !== undefined) updatePayload.role_id = role_id

    if (email) {
        const { data, error } = await supabase
            .from('empresa_miembros')
            .update(updatePayload)
            .eq('empresa_id', companyId)
            .ilike('email', email)
            .select('*')

        if (error) throw error
        return data ?? []
    }

    if (usuario_id) {
        const { data, error } = await supabase
            .from('empresa_miembros')
            .update(updatePayload)
            .eq('empresa_id', companyId)
            .eq('usuario_id', usuario_id)
            .select('*')

        if (error) throw error
        return data ?? []
    }

    throw new Error('usuario_id o email requerido para actualizar rol')
}

/**
 * Crea o actualiza el rol de un miembro
 */
export async function upsertCompanyMemberRole(
    companyId: string,
    { email, usuario_id, role }: UpdateMemberRoleDTO & { usuario_id?: string }
): Promise<EmpresaMiembro[]> {
    if (!companyId) throw new Error('companyId requerido')
    if (!role) throw new Error('role requerido')

    const payload: Record<string, unknown> = { empresa_id: companyId, role }
    if (email) payload.email = email
    if (usuario_id) payload.usuario_id = usuario_id

    // Buscar existente
    let found: EmpresaMiembro | null = null

    if (email) {
        const { data: existingByEmail, error: findErr } = await supabase
            .from('empresa_miembros')
            .select('*')
            .eq('empresa_id', companyId)
            .ilike('email', email)

        if (findErr) throw findErr
        found = (existingByEmail || [])[0] || null
    }

    if (!found && usuario_id) {
        const { data: existingByUid, error: findErr2 } = await supabase
            .from('empresa_miembros')
            .select('*')
            .eq('empresa_id', companyId)
            .eq('usuario_id', usuario_id)

        if (findErr2) throw findErr2
        found = (existingByUid || [])[0] || null
    }

    if (found) {
        // Update
        if (email) {
            const { data, error } = await supabase
                .from('empresa_miembros')
                .update({ role })
                .eq('empresa_id', companyId)
                .ilike('email', email)
                .select('*')

            if (error) throw error
            return data ?? []
        }

        const { data, error } = await supabase
            .from('empresa_miembros')
            .update({ role })
            .eq('empresa_id', companyId)
            .eq('usuario_id', usuario_id)
            .select('*')

        if (error) throw error
        return data ?? []
    } else {
        // Insert
        if (!usuario_id) {
            throw new Error('No se puede crear empresa_miembros sin usuario_id (la columna es NOT NULL).')
        }

        const { data, error } = await supabase
            .from('empresa_miembros')
            .insert(payload)
            .select('*')

        if (error) throw error
        return data ?? []
    }
}

/**
 * Permite a un usuario abandonar una empresa
 */
export async function leaveCompany(companyId: string, userEmail: string, userId: string): Promise<boolean> {
    console.log('[EMPRESA] leaveCompany', { companyId, userEmail, userId })

    // 1. Get company owner to notify
    let ownerEmail: string | null = null
    let companyName = 'la empresa'

    try {
        const { data: companyData } = await supabase
            .from('empresa')
            .select('nombre_empresa, usuario_id')
            .eq('id', companyId)
            .single()

        if (companyData) {
            companyName = companyData.nombre_empresa
            const { data: ownerData } = await supabase
                .from('usuarios')
                .select('email')
                .eq('id', companyData.usuario_id)
                .single()
            if (ownerData) ownerEmail = ownerData.email
        }
    } catch (e) {
        console.warn('[EMPRESA] could not fetch owner info for notification', e)
    }

    // 2. Delete from persona (team members)
    const { data: teams, error: teamsError } = await supabase
        .from('equipos')
        .select('id')
        .eq('empresa_id', companyId)

    if (!teamsError && teams && teams.length > 0) {
        const teamIds = teams.map(t => t.id)

        const { error: personaErrorId } = await supabase
            .from('persona')
            .delete()
            .in('equipo_id', teamIds)
            .eq('usuario_id', userId)

        if (personaErrorId) {
            console.warn('[EMPRESA] error deleting personas by ID, trying email', personaErrorId)

            const { error: personaErrorEmail } = await supabase
                .from('persona')
                .delete()
                .in('equipo_id', teamIds)
                .eq('email', userEmail)

            if (personaErrorEmail) {
                console.error('[EMPRESA] error deleting personas by email', personaErrorEmail)
            }
        }
    }

    // 3. Delete from empresa_miembros
    const { error: memberError, count } = await supabase
        .from('empresa_miembros')
        .delete({ count: 'exact' })
        .eq('empresa_id', companyId)
        .eq('usuario_id', userId)

    if (memberError) {
        console.error('[EMPRESA] error deleting member', memberError)
        throw memberError
    }

    if (count === 0) {
        console.warn('[EMPRESA] Warning: No empresa_miembros row deleted. Possible RLS permission issue.')
    }

    // 4. Send notification to owner
    if (ownerEmail) {
        try {
            await supabase
                .from('notificaciones')
                .insert({
                    usuario_email: ownerEmail,
                    type: 'message',
                    title: 'Usuario abandonó la empresa',
                    message: `El usuario ${userEmail} ha abandonado la empresa ${companyName}`
                })
        } catch (e) {
            console.error('[EMPRESA] error sending notification', e)
        }
    }

    return true
}

/**
 * Elimina un miembro de una empresa
 */
export async function removeMemberFromCompany(companyId: string, email: string): Promise<boolean> {
    console.log('[EMPRESA] removeMemberFromCompany', { companyId, email })

    // Intentar usar la Edge Function primero
    const { error: funcError } = await supabase.functions.invoke('remove-member', {
        body: { companyId, email }
    })

    if (!funcError) {
        return true
    }

    console.warn('[EMPRESA] Edge Function falló, intentando eliminación directa...', funcError)

    // Fallback: Eliminación directa
    const { data: teams } = await supabase
        .from('equipos')
        .select('id')
        .eq('empresa_id', companyId)

    if (teams && teams.length > 0) {
        const teamIds = teams.map(t => t.id)

        const { error: personaError } = await supabase
            .from('persona')
            .delete()
            .in('equipo_id', teamIds)
            .ilike('email', email)

        if (personaError) {
            console.error('[EMPRESA] error removing persona', personaError)
        }
    }

    const { error: memberError } = await supabase
        .from('empresa_miembros')
        .delete()
        .eq('empresa_id', companyId)
        .ilike('email', email)

    if (memberError) {
        console.error('[EMPRESA] error removing member from company', memberError)
        throw memberError
    }

    return true
}
