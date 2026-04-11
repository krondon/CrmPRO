import { supabase } from './client'
import type { User, AuthError } from '@supabase/supabase-js'

// Interfaz para errores de autenticación extendidos
interface AuthErrorExtended extends Error {
    original?: AuthError
    code?: string
    status?: number
}

/**
 * Mapea errores de Supabase Auth a mensajes amigables en español
 */
function mapAuthError(error: AuthError | null): string {
    if (!error) return ''
    const msg = (error.message || '').toLowerCase()

    if (msg.includes('database error saving new user')) {
        return 'Error interno creando el usuario. Verifica si el email ya existe o contacta soporte.'
    }
    if (msg.includes('user already registered') || msg.includes('duplicate key value violates unique constraint')) {
        return 'El email ya está registrado. Intenta iniciar sesión.'
    }
    if (msg.includes('invalid email')) {
        return 'El formato de email no es válido.'
    }
    if (msg.includes('password')) {
        return 'La contraseña no cumple los requisitos.'
    }
    if (msg.includes('invalid login credentials')) {
        return 'Email o contraseña incorrectos.'
    }

    return error.message || 'Error de autenticación'
}

/**
 * Registra un nuevo usuario con email y contraseña
 */
export async function register(email: string, password: string, metadata?: Record<string, string>): Promise<User> {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: metadata ? { data: metadata } : undefined
    })

    if (error) {
        const friendly = mapAuthError(error)
        const e: AuthErrorExtended = new Error(friendly)
        e.original = error
        e.code = error.code
        e.status = error.status
        throw e
    }

    // Supabase v2: cuando el usuario ya existe, devuelve user con identities vacío
    // en lugar de un error (por razones de seguridad)
    if (data.user && data.user.identities && data.user.identities.length === 0) {
        throw new Error('El email ya está registrado. Intenta iniciar sesión.')
    }

    if (!data.user) {
        throw new Error('No se pudo crear el usuario')
    }

    return data.user
}

/**
 * Inicia sesión con email y contraseña
 */
export async function login(email: string, password: string): Promise<User> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
        const friendly = mapAuthError(error)
        const e: AuthErrorExtended = new Error(friendly)
        e.original = error
        e.code = error.code
        e.status = error.status
        throw e
    }

    if (!data.user) {
        throw new Error('No se pudo iniciar sesión')
    }

    return data.user
}

/**
 * Cierra la sesión del usuario actual
 */
export async function logout(): Promise<void> {
    const { error } = await supabase.auth.signOut()
    if (error) {
        throw error
    }
}

/**
 * Obtiene el usuario actual de la sesión
 */
export async function getCurrentUser(): Promise<User | null> {
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

/**
 * Obtiene la sesión actual
 */
export async function getSession() {
    const { data: { session } } = await supabase.auth.getSession()
    return session
}

/**
 * Solicita el cambio de email del usuario autenticado.
 * Supabase enviará un correo de confirmación al nuevo email.
 * El cambio se aplica cuando el usuario hace clic en ese link.
 */
export async function updateEmail(newEmail: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ email: newEmail })
    if (error) {
        const friendly = mapAuthError(error)
        const e: AuthErrorExtended = new Error(friendly || error.message)
        e.original = error
        e.code = error.code
        e.status = error.status
        throw e
    }
}
