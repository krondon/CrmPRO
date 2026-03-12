import { supabase } from '../client'
import type { UsuarioDB } from '@/lib/types'

interface CreateUsuarioDTO {
    id: string
    email: string
    nombre: string
    account_type?: 'owner' | 'employee'
}

/**
 * Crea un nuevo usuario en la tabla usuarios
 */
export async function createUsuario({ id, email, nombre, account_type = 'owner' }: CreateUsuarioDTO): Promise<UsuarioDB> {
    const { data, error } = await supabase
        .from('usuarios')
        .insert({ id, email, nombre, account_type })
        .select()
        .single()

    if (error) throw error
    return data
}

/**
 * Obtiene un usuario por su ID
 */
export async function getUsuarioById(id: string): Promise<UsuarioDB> {
    const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', id)
        .single()

    if (error) throw error
    return data
}

/**
 * Actualiza un usuario
 */
export async function updateUsuario(id: string, updates: Partial<Omit<UsuarioDB, 'id' | 'created_at'>>): Promise<UsuarioDB> {
    const { data, error } = await supabase
        .from('usuarios')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

    if (error) throw error
    return data
}

/**
 * Actualiza el correo alternativo de un usuario
 */
export async function updateRecoveryEmail(id: string, recoveryEmail: string | null): Promise<UsuarioDB> {
    const { data, error } = await supabase
        .from('usuarios')
        .update({ recovery_email: recoveryEmail ? recoveryEmail.toLowerCase().trim() : null })
        .eq('id', id)
        .select()
        .single()

    if (error) throw error
    return data
}
