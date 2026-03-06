import { supabase } from '../client'
import type { Role, RolePermission } from '@/lib/types'

/**
 * Obtiene los roles de una empresa.
 * Retorna los roles personalizados de la BD y añade 'admin' y 'viewer' como roles de sistema en memoria.
 */
export async function getRoles(empresaId: string): Promise<Role[]> {
    const { data, error } = await supabase
        .from('roles')
        .select('*')
        .eq('empresa_id', empresaId)

    if (error) throw error

    // Mapear los roles de la base de datos al formato del frontend
    const dbRoles: Role[] = (data || []).map(r => ({
        id: r.id,
        name: r.name,
        color: r.color || '#3b82f6',
        permissions: r.permissions as RolePermission[],
        isSystem: r.is_system
    }))

    return dbRoles
}

/**
 * Crea un nuevo rol en la base de datos
 */
export async function createRole(empresaId: string, role: Omit<Role, 'id' | 'isSystem'>): Promise<Role> {
    const { data, error } = await supabase
        .from('roles')
        .insert({
            empresa_id: empresaId,
            name: role.name,
            color: role.color,
            permissions: role.permissions,
            is_system: false // Solo se pueden crear roles personalizados desde el frontend
        })
        .select()
        .single()

    if (error) throw error

    return {
        id: data.id,
        name: data.name,
        color: data.color,
        permissions: data.permissions as RolePermission[],
        isSystem: data.is_system
    }
}

/**
 * Actualiza un rol existente
 */
export async function updateRole(roleId: string, updates: Partial<Omit<Role, 'id' | 'isSystem'>>): Promise<Role> {
    const { data, error } = await supabase
        .from('roles')
        .update({
            ...(updates.name && { name: updates.name }),
            ...(updates.color && { color: updates.color }),
            ...(updates.permissions && { permissions: updates.permissions })
        })
        .eq('id', roleId)
        .select()
        .single()

    if (error) throw error

    return {
        id: data.id,
        name: data.name,
        color: data.color,
        permissions: data.permissions as RolePermission[],
        isSystem: data.is_system
    }
}

/**
 * Elimina un rol
 */
export async function deleteRole(roleId: string): Promise<boolean> {
    const { error } = await supabase
        .from('roles')
        .delete()
        .eq('id', roleId)

    if (error) throw error
    return true
}
