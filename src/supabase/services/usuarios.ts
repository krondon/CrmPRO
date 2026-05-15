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
 * Persiste la última empresa seleccionada por el usuario.
 * Fire-and-forget: errores se loguean pero no se propagan.
 */
export async function updateLastEmpresaId(userId: string, empresaId: string | null): Promise<void> {
    if (!userId) return
    const { error } = await supabase
        .from('usuarios')
        .update({ last_empresa_id: empresaId || null })
        .eq('id', userId)
    if (error) {
        console.warn('[usuarios.updateLastEmpresaId]', error)
    }
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
