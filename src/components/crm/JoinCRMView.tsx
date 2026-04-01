import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { CircleNotch, MagnifyingGlass, Buildings, PaperPlaneTilt, Clock, CheckCircle, XCircle, SignOut } from '@phosphor-icons/react'
import { buscarEmpresaPorId, crearSolicitud, getMisSolicitudes } from '@/supabase/services/solicitudes'
import type { SolicitudUnionDB } from '@/lib/types'
import { supabase } from '@/supabase/client'

interface JoinCRMViewProps {
  onLogout: () => void
}

export function JoinCRMView({ onLogout }: JoinCRMViewProps) {
  const [empresaId, setEmpresaId] = useState('')
  const [searching, setSearching] = useState(false)
  const [empresaEncontrada, setEmpresaEncontrada] = useState<{ id: string; nombre_empresa: string } | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [sending, setSending] = useState(false)
  const [solicitudes, setSolicitudes] = useState<SolicitudUnionDB[]>([])
  const [loadingSolicitudes, setLoadingSolicitudes] = useState(true)

  useEffect(() => {
    loadSolicitudes()
  }, [])

  async function loadSolicitudes() {
    setLoadingSolicitudes(true)
    try {
      const data = await getMisSolicitudes()
      setSolicitudes(data)
    } catch {
      // silently fail
    } finally {
      setLoadingSolicitudes(false)
    }
  }

  async function handleBuscar(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = empresaId.trim()
    if (!trimmed) {
      toast.error('Ingresa el ID de la empresa')
      return
    }

    setSearching(true)
    setEmpresaEncontrada(null)
    try {
      const empresa = await buscarEmpresaPorId(trimmed)
      if (empresa) {
        setEmpresaEncontrada(empresa)
      } else {
        toast.error('No se encontró ninguna empresa con ese ID')
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al buscar la empresa')
    } finally {
      setSearching(false)
    }
  }

  async function handleEnviarSolicitud() {
    if (!empresaEncontrada) return

    setSending(true)
    try {
      // Obtener el nombre real del usuario actual desde la tabla usuarios
      const { data: { user } } = await supabase.auth.getUser()
      let nombreSolicitante = user?.email || 'Usuario'
      if (user) {
        const { data: usuarioRow } = await supabase
          .from('usuarios')
          .select('nombre')
          .eq('id', user.id)
          .maybeSingle()
        if (usuarioRow?.nombre) {
          nombreSolicitante = usuarioRow.nombre
        }
      }
      await crearSolicitud(empresaEncontrada.id, nombreSolicitante, mensaje || undefined)
      toast.success('Solicitud enviada correctamente')
      setEmpresaEncontrada(null)
      setEmpresaId('')
      setMensaje('')
      await loadSolicitudes()
    } catch (err: any) {
      toast.error(err.message || 'Error al enviar la solicitud')
    } finally {
      setSending(false)
    }
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock size={16} className="text-yellow-500" />
      case 'approved': return <CheckCircle size={16} className="text-green-500" />
      case 'rejected': return <XCircle size={16} className="text-red-500" />
      default: return null
    }
  }

  const statusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Pendiente'
      case 'approved': return 'Aprobada'
      case 'rejected': return 'Rechazada'
      default: return status
    }
  }

  return (
    <div className="min-h-screen bg-background p-4 flex flex-col items-center justify-center gap-6">
      {/* Header con logout */}
      <div className="w-full max-w-md flex justify-between items-center">
        <h1 className="text-2xl font-bold text-primary">CRM Pro</h1>
        <Button variant="ghost" size="sm" onClick={onLogout} className="text-muted-foreground">
          <SignOut size={18} className="mr-1" />
          Cerrar sesión
        </Button>
      </div>

      {/* Card de búsqueda */}
      <Card className="w-full max-w-md animate-in fade-in zoom-in-95 duration-300">
        <CardHeader className="text-center">
          <div className="mx-auto bg-blue-100 dark:bg-blue-900/30 w-14 h-14 rounded-full flex items-center justify-center mb-3 text-blue-600 dark:text-blue-400">
            <Buildings size={28} weight="duotone" />
          </div>
          <CardTitle className="text-xl">Unirte a un CRM</CardTitle>
          <CardDescription>
            Ingresa el ID de la empresa que te compartió el administrador para poder solicitar acceso.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleBuscar} className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="empresa-id" className="sr-only">ID de empresa</Label>
              <Input
                id="empresa-id"
                value={empresaId}
                onChange={(e) => setEmpresaId(e.target.value)}
                placeholder="Ej: a1b2c3d4-e5f6-..."
                disabled={searching}
              />
            </div>
            <Button type="submit" disabled={searching} size="default">
              {searching ? (
                <CircleNotch size={18} className="animate-spin" />
              ) : (
                <MagnifyingGlass size={18} />
              )}
            </Button>
          </form>

          {/* Resultado de búsqueda */}
          {empresaEncontrada && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-200 border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Buildings size={20} className="text-primary" />
                <span className="font-semibold text-foreground">{empresaEncontrada.nombre_empresa}</span>
              </div>
              <div>
                <Label htmlFor="mensaje-solicitud">Mensaje (opcional)</Label>
                <Textarea
                  id="mensaje-solicitud"
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  placeholder="Hola, me gustaría unirme al equipo..."
                  rows={2}
                  maxLength={200}
                />
              </div>
              <Button
                onClick={handleEnviarSolicitud}
                disabled={sending}
                className="w-full"
              >
                {sending ? (
                  <>
                    <CircleNotch size={18} className="animate-spin mr-2" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <PaperPlaneTilt size={18} className="mr-2" />
                    Enviar solicitud
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mis solicitudes */}
      <Card className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-300 delay-150">
        <CardHeader>
          <CardTitle className="text-base">Mis solicitudes</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingSolicitudes ? (
            <div className="flex justify-center py-4">
              <CircleNotch size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : solicitudes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Aún no has enviado solicitudes
            </p>
          ) : (
            <div className="space-y-2">
              {solicitudes.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3 rounded-lg border text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Buildings size={16} className="text-muted-foreground" />
                    <span className="font-medium">{s.empresa?.nombre_empresa || 'Empresa'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {statusIcon(s.status)}
                    <span className={`text-xs font-medium ${
                      s.status === 'pending' ? 'text-yellow-600' :
                      s.status === 'approved' ? 'text-green-600' :
                      'text-red-600'
                    }`}>
                      {statusLabel(s.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
