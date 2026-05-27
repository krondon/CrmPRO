/**
 * Vista de callback de SuperAPI OAuth (ruta /superapi/callback).
 *
 * Flujo (paso 3 del documento):
 *  1. SuperAPI redirige aquí con ?code=...&state=... (o ?error=...)
 *  2. Validar state CSRF contra el guardado en localStorage
 *  3. Invocar la edge function `superapi-oauth-exchange` con el code
 *  4. Mostrar resultado y redirigir a /settings
 *
 * Si el usuario llega aquí sin sesión, lo mandamos a /login (el state se
 * pierde, tendría que reiniciar el flujo desde Settings).
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Spinner,
  CheckCircle,
  WarningCircle,
  ArrowRight,
} from '@phosphor-icons/react'
import {
  consumeState,
  getSuperAPIOAuthConfig,
  OAUTH_AUTHORIZE_ERROR_MESSAGES,
  parseCallbackParams,
} from '@/lib/superapi-oauth'
import { exchangeCode } from '@/supabase/services/superapiInstalls'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'

type Status = 'loading' | 'success' | 'error'

export function SuperAPICallbackView() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, isLoading: authLoading } = useAuth()

  const [status, setStatus] = useState<Status>('loading')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [returnTo, setReturnTo] = useState<string>('/settings')

  // Evitar doble ejecución en StrictMode / re-renders
  const ranRef = useRef(false)

  useEffect(() => {
    if (authLoading) return
    if (ranRef.current) return
    ranRef.current = true

    ;(async () => {
      const params = parseCallbackParams(searchParams)

      // ----- Error explícito de SuperAPI -----
      if (params.error) {
        const friendly =
          OAUTH_AUTHORIZE_ERROR_MESSAGES[params.error] ||
          params.errorDescription ||
          `Error: ${params.error}`
        setErrorMsg(friendly)
        setStatus('error')
        return
      }

      if (!params.code || !params.state) {
        setErrorMsg('Faltan parámetros (code o state) en la URL de callback.')
        setStatus('error')
        return
      }

      // ----- Validar CSRF state -----
      const stored = consumeState(params.state)
      if (!stored) {
        setErrorMsg(
          'El token de seguridad (state) no coincide o expiró. Esto puede deberse a que abriste la autorización en otra pestaña o pasaron más de 30 minutos. Reintenta desde Configuración.',
        )
        setStatus('error')
        return
      }

      if (stored.returnTo) setReturnTo(stored.returnTo)

      // ----- Verificar que tenemos sesión -----
      if (!user) {
        setErrorMsg('Necesitas iniciar sesión nuevamente para completar la conexión.')
        setStatus('error')
        return
      }

      // ----- Intercambiar code por access_token -----
      const cfg = getSuperAPIOAuthConfig()
      const result = await exchangeCode({
        code: params.code,
        empresaId: stored.empresaId,
        redirectUri: cfg.redirectUri,
      })

      if (!result.ok) {
        const msg =
          result.error === 'oauth_not_configured'
            ? 'SuperAPI OAuth aún no está configurado en el servidor. Contacta soporte.'
            : result.message || `No se pudo completar la conexión (${result.error}).`
        setErrorMsg(msg)
        setStatus('error')
        return
      }

      setStatus('success')
      toast.success(
        `SuperAPI conectado · ${result.install.instanceIds.length} instancia(s) autorizada(s)`,
      )

      // Pequeño delay para que el usuario vea el checkmark, luego redirige
      setTimeout(() => {
        navigate(stored.returnTo || '/settings', { replace: true })
      }, 1500)
    })().catch(e => {
      console.error('[SuperAPICallbackView] error inesperado', e)
      setErrorMsg(e?.message || 'Error inesperado')
      setStatus('error')
    })
  }, [authLoading, user, searchParams, navigate])

  // ------------------------------------------------------------------------

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-violet-50 via-background to-fuchsia-50 dark:from-violet-950/30 dark:via-background dark:to-fuchsia-950/30">
      <Card className="w-full max-w-md border-none shadow-xl rounded-3xl overflow-hidden">
        <CardContent className="pt-10 pb-8 px-8 text-center space-y-5">
          {status === 'loading' && (
            <>
              <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/40">
                <Spinner size={32} className="animate-spin text-white" />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight">
                  Conectando con SuperAPI…
                </h1>
                <p className="text-sm text-muted-foreground mt-1.5">
                  Validando la autorización y configurando tus instancias.
                </p>
              </div>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/40">
                <CheckCircle size={36} weight="fill" className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight">¡Conectado!</h1>
                <p className="text-sm text-muted-foreground mt-1.5">
                  SuperAPI quedó vinculado a tu empresa. Redirigiendo…
                </p>
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center shadow-lg shadow-rose-500/40">
                <WarningCircle size={36} weight="fill" className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight">No se pudo conectar</h1>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  {errorMsg}
                </p>
              </div>
              <Button
                onClick={() => navigate(returnTo, { replace: true })}
                size="lg"
                className="w-full rounded-xl gap-2 mt-2"
              >
                Volver a Configuración
                <ArrowRight size={16} weight="bold" />
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
