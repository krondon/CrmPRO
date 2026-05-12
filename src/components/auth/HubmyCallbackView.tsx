import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { LoadingScreen } from '@/components/ui/LoadingScreen'

const HUBMY_AUTH_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hubmy-auth`

export function HubmyCallbackView() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { loginWithSession } = useAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const sessionToken = searchParams.get('session')
    const state = searchParams.get('state')

    // CSRF check
    const savedState = sessionStorage.getItem('hubmy_oauth_state')
    sessionStorage.removeItem('hubmy_oauth_state')
    if (state && savedState && state !== savedState) {
      setError('Error de seguridad: state inválido. Intenta iniciar sesión de nuevo.')
      return
    }

    if (!sessionToken) {
      navigate('/login', { replace: true })
      return
    }

    const doAuth = async () => {
      try {
        // 1. Validate Hubmy token → get Supabase hashed_token
        const res = await fetch(HUBMY_AUTH_FN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: sessionToken }),
        })
        const json = await res.json()
        if (!res.ok || json.error) {
          throw new Error(json.error || 'Error al validar sesión de Hubmy')
        }

        // 2. Exchange hashed_token → Supabase session
        const { error: otpErr } = await supabase.auth.verifyOtp({
          token_hash: json.hashed_token,
          type: 'email',
        })
        if (otpErr) throw new Error(otpErr.message)

        // 3. Get the established session to retrieve the user ID
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('No se pudo obtener la sesión')

        // 4. Load user profile + companies into React state
        await loginWithSession(session.user.id, json.email, json.name)

        navigate('/dashboard', { replace: true })
      } catch (e: any) {
        console.error('[HubmyCallback]', e)
        setError(e.message || 'Error al iniciar sesión con Hubmy')
      }
    }

    doAuth()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-4xl">⚠️</div>
          <p className="text-destructive font-medium">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="text-primary underline text-sm hover:opacity-80 transition-opacity"
          >
            Volver al inicio de sesión
          </button>
        </div>
      </div>
    )
  }

  return <LoadingScreen />
}
