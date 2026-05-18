import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null = (supabaseUrl && supabaseAnonKey)
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
        },
    })
    : null

export const isSupabaseConfigured = supabase !== null

export function requireSupabase(): SupabaseClient {
    if (!supabase) {
        throw new Error('CrmPRO: Supabase no está configurado. Esta funcionalidad requiere conexión a la nube.')
    }
    return supabase
}
