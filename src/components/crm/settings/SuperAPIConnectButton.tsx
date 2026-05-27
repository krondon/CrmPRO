/**
 * SuperAPI · Botón de conexión OAuth.
 *
 * Se muestra arriba del listado clásico de instancias en InstancesManager.
 * Solo aparece si el feature flag `VITE_SUPERAPI_OAUTH_ENABLED` está en `true`
 * y hay `VITE_SUPERAPI_OAUTH_CLIENT_ID` configurado.
 *
 * Estados:
 * - No conectado → botón "Conectar SuperAPI" que redirige al consent.
 * - Conectado → tarjeta con instancias autorizadas + scopes + botón desconectar.
 * - Loading → spinner mientras consulta el estado actual.
 */

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  PlugsConnected,
  CheckCircle,
  Spinner,
  ArrowRight,
  Crown,
  LinkBreak,
  ShieldCheck,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import {
  buildAuthorizeUrl,
  getSuperAPIOAuthConfig,
  isSuperAPIOAuthEnabled,
} from '@/lib/superapi-oauth'
import {
  getActiveInstall,
  markInstallRevokedLocal,
} from '@/supabase/services/superapiInstalls'
import type { SuperAPIInstall, SuperApiScope } from '@/lib/types'

const REQUESTED_SCOPES: SuperApiScope[] = [
  'instances.read',
  'messages.send',
  'messages.receive',
]

interface Props {
  empresaId: string
}

export function SuperAPIConnectButton({ empresaId }: Props) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [install, setInstall] = useState<SuperAPIInstall | null>(null)
  const [redirecting, setRedirecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  // Feature flag — si está apagada, no renderizamos nada (cero ruido en UI)
  if (!isSuperAPIOAuthEnabled()) return null

  useEffect(() => {
    let active = true
    async function load() {
      if (!empresaId) return
      try {
        setLoading(true)
        const data = await getActiveInstall(empresaId)
        if (active) setInstall(data)
      } catch (e) {
        console.error('[SuperAPIConnectButton] load error', e)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [empresaId])

  const handleConnect = () => {
    if (!user?.email) {
      toast.error('No se pudo obtener tu email para autorizar')
      return
    }
    try {
      setRedirecting(true)
      const { url } = buildAuthorizeUrl({
        empresaId,
        email: user.email,
        scopes: REQUESTED_SCOPES,
        returnTo: '/settings',
      })
      // Full-page redirect al consent screen de SuperAPI
      window.location.href = url
    } catch (e: any) {
      console.error('[SuperAPIConnectButton] connect error', e)
      toast.error(e?.message || 'No se pudo iniciar la conexión')
      setRedirecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!install) return
    if (
      !confirm(
        '¿Desconectar SuperAPI? Para revocar también la autorización en SuperAPI, hazlo desde su panel (Integraciones → Apps conectadas). Tus instancias manuales no se ven afectadas.',
      )
    ) {
      return
    }
    try {
      setDisconnecting(true)
      await markInstallRevokedLocal(install.id)
      setInstall(null)
      toast.success('SuperAPI desconectado del CRM')
    } catch (e: any) {
      console.error('[SuperAPIConnectButton] disconnect error', e)
      toast.error(e?.message || 'No se pudo desconectar')
    } finally {
      setDisconnecting(false)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
        <CardContent className="py-6 flex items-center gap-3">
          <Spinner size={18} className="animate-spin text-violet-600" />
          <span className="text-sm text-muted-foreground">
            Verificando conexión con SuperAPI…
          </span>
        </CardContent>
      </Card>
    )
  }

  // ---- Conectado ----------------------------------------------------------
  if (install) {
    return (
      <Card className="border-none shadow-sm rounded-2xl overflow-hidden bg-gradient-to-br from-emerald-500/5 via-transparent to-violet-500/5">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                <CheckCircle size={20} weight="fill" className="text-emerald-600" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base font-bold flex items-center gap-2 flex-wrap">
                  SuperAPI conectado
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400 text-[10px]">
                    OAuth
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Conexión activa con {install.instanceIds.length} instancia{install.instanceIds.length === 1 ? '' : 's'} autorizada{install.instanceIds.length === 1 ? '' : 's'}.
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="rounded-xl gap-1.5 shrink-0"
            >
              {disconnecting ? (
                <Spinner size={14} className="animate-spin" />
              ) : (
                <LinkBreak size={14} weight="duotone" />
              )}
              Desconectar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {install.scopes.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <ShieldCheck size={14} weight="duotone" className="text-violet-600" />
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Permisos:
              </span>
              {install.scopes.map(s => (
                <Badge key={s} variant="secondary" className="text-[10px] font-mono rounded-md">
                  {s}
                </Badge>
              ))}
            </div>
          )}
          {install.expiresAt && (
            <p className="text-[11px] text-muted-foreground">
              Vence el {new Date(install.expiresAt).toLocaleDateString()}
            </p>
          )}
          {install.superapiUserEmail && (
            <p className="text-[11px] text-muted-foreground">
              Autorizado por <span className="font-medium">{install.superapiUserEmail}</span>
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  // ---- No conectado -------------------------------------------------------
  return (
    <Card className="border-none shadow-sm rounded-2xl overflow-hidden bg-gradient-to-br from-violet-500/10 via-fuchsia-500/5 to-indigo-500/10">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/30">
            <PlugsConnected size={20} weight="fill" className="text-white" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base font-bold flex items-center gap-2 flex-wrap">
              Conectar con SuperAPI
              <Badge className="bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white border-0 text-[10px] gap-1">
                <Crown size={10} weight="fill" />
                Recomendado
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Autoriza tus instancias de WhatsApp / Instagram sin copiar tokens manualmente.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <ul className="text-[12px] text-muted-foreground space-y-1.5">
          <li className="flex items-center gap-2">
            <CheckCircle size={12} weight="fill" className="text-emerald-600 shrink-0" />
            Un solo click — sin API tokens manuales
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle size={12} weight="fill" className="text-emerald-600 shrink-0" />
            Recibí mensajes, IA y fallos de entrega en tiempo real
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle size={12} weight="fill" className="text-emerald-600 shrink-0" />
            Podés revocar el acceso cuando quieras desde el panel de SuperAPI
          </li>
        </ul>
        <Button
          onClick={handleConnect}
          disabled={redirecting}
          size="lg"
          className="w-full h-11 rounded-xl gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white font-bold shadow-lg shadow-violet-500/30 border-0"
        >
          {redirecting ? (
            <>
              <Spinner size={16} className="animate-spin" />
              Redirigiendo…
            </>
          ) : (
            <>
              <PlugsConnected size={18} weight="fill" />
              Conectar SuperAPI
              <ArrowRight size={16} weight="bold" />
            </>
          )}
        </Button>
        <p className="text-[10px] text-center text-muted-foreground">
          También podés seguir configurando instancias manualmente abajo.
        </p>
      </CardContent>
    </Card>
  )
}
