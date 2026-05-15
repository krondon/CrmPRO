import { supabase } from '../client'

const REFRESH_THRESHOLD_SECONDS = 60

export async function getFreshAccessToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession()

    if (!session?.access_token) {
        throw new Error('Sesion expirada. Inicia sesion de nuevo.')
    }

    const nowSeconds = Math.floor(Date.now() / 1000)
    const expiresAt = session.expires_at ?? 0
    const secondsLeft = expiresAt - nowSeconds

    if (secondsLeft > REFRESH_THRESHOLD_SECONDS) {
        return session.access_token
    }

    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()

    if (refreshError || !refreshed.session?.access_token) {
        throw new Error('Sesion expirada. Inicia sesion de nuevo.')
    }

    return refreshed.session.access_token
}
