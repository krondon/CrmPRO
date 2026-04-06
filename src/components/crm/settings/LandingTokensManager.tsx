import { useEffect, useState } from 'react'
import { listLandingTokens, createLandingToken, updateLandingToken, deleteLandingToken, toggleLandingToken } from '@/supabase/services/landingTokens'
import type { LandingTokenDB, Pipeline } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Trash, PencilSimple, Key, Funnel, Copy, CheckCircle, Link as LinkIcon, Globe, Code, Info } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { getPipelines } from '@/supabase/helpers/pipeline'

interface LandingTokensManagerProps {
  empresaId: string
}

interface TokenForm {
  nombre: string
  pipeline_id: string
  etapa_id: string
  prioridad_default: string
  empresa_label: string
}

const ENDPOINT_BASE = 'https://bjdqjxrwvktfqienbzop.supabase.co/functions/v1/Recived_landing_with_token'

export function LandingTokensManager({ empresaId }: LandingTokensManagerProps) {
  const [tokens, setTokens] = useState<LandingTokenDB[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showExample, setShowExample] = useState<string | null>(null)

  const emptyForm: TokenForm = {
    nombre: '',
    pipeline_id: '',
    etapa_id: '',
    prioridad_default: 'medium',
    empresa_label: 'Landing',
  }

  const [form, setForm] = useState<TokenForm>(emptyForm)

  // Cargar pipelines
  useEffect(() => {
    if (!empresaId) return
    const loadPipelines = async () => {
      const { data, error } = await getPipelines(empresaId)
      if (error) {
        console.error('[LandingTokens] Error loading pipelines:', error)
        return
      }
      const mapped: Pipeline[] = (data || []).map((p: any) => ({
        id: p.id,
        name: p.nombre || 'Sin Nombre',
        type: p.nombre?.toLowerCase().trim().replace(/\s+/g, '-') || 'pipeline',
        stages: (p.etapas || []).map((s: any) => ({
          id: s.id,
          name: s.nombre,
          order: s.orden,
          color: s.color,
          pipelineType: p.nombre?.toLowerCase().trim().replace(/\s+/g, '-') || 'pipeline'
        })).sort((a: any, b: any) => a.order - b.order)
      }))
      setPipelines(mapped)
    }
    loadPipelines()
  }, [empresaId])

  // Cargar tokens
  useEffect(() => {
    if (!empresaId) return
    loadTokens()
  }, [empresaId])

  async function loadTokens() {
    setLoading(true)
    try {
      const data = await listLandingTokens(empresaId)
      setTokens(data)
    } catch (err) {
      console.error('[LandingTokens] Error loading tokens:', err)
      toast.error('Error cargando tokens')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!form.nombre || !form.pipeline_id || !form.etapa_id) {
      toast.error('Nombre, Pipeline y Etapa son obligatorios')
      return
    }
    setCreating(true)
    try {
      await createLandingToken({
        empresa_id: empresaId,
        pipeline_id: form.pipeline_id,
        etapa_id: form.etapa_id,
        nombre: form.nombre,
        prioridad_default: form.prioridad_default,
        empresa_label: form.empresa_label,
      })
      toast.success('Token creado exitosamente')
      setForm(emptyForm)
      loadTokens()
    } catch (err: any) {
      toast.error(err.message || 'Error creando token')
    } finally {
      setCreating(false)
    }
  }

  async function handleUpdate(id: string) {
    if (!form.nombre || !form.pipeline_id || !form.etapa_id) {
      toast.error('Nombre, Pipeline y Etapa son obligatorios')
      return
    }
    try {
      await updateLandingToken(id, {
        nombre: form.nombre,
        pipeline_id: form.pipeline_id,
        etapa_id: form.etapa_id,
        prioridad_default: form.prioridad_default,
        empresa_label: form.empresa_label,
      })
      toast.success('Token actualizado')
      setEditingId(null)
      setForm(emptyForm)
      loadTokens()
    } catch (err: any) {
      toast.error(err.message || 'Error actualizando token')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Estás seguro de eliminar este token? Las landing pages que lo usen dejarán de funcionar.')) return
    try {
      await deleteLandingToken(id)
      toast.success('Token eliminado')
      loadTokens()
    } catch (err: any) {
      toast.error(err.message || 'Error eliminando token')
    }
  }

  async function handleToggle(id: string, active: boolean) {
    try {
      await toggleLandingToken(id, active)
      toast.success(active ? 'Token activado' : 'Token desactivado')
      loadTokens()
    } catch (err: any) {
      toast.error(err.message || 'Error cambiando estado')
    }
  }

  function copyToClipboard(text: string, tokenId: string) {
    navigator.clipboard.writeText(text)
    setCopiedId(tokenId)
    toast.success('Copiado al portapapeles')
    setTimeout(() => setCopiedId(null), 2000)
  }

  function startEdit(token: LandingTokenDB) {
    setEditingId(token.id)
    setForm({
      nombre: token.nombre,
      pipeline_id: token.pipeline_id,
      etapa_id: token.etapa_id,
      prioridad_default: token.prioridad_default || 'medium',
      empresa_label: token.empresa_label || 'Landing',
    })
  }

  function getSelectedPipeline(): Pipeline | undefined {
    return pipelines.find(p => p.id === form.pipeline_id)
  }

  function getPipelineName(pipelineId: string): string {
    return pipelines.find(p => p.id === pipelineId)?.name ?? pipelineId
  }

  function getStageName(pipelineId: string, etapaId: string): string {
    const pipeline = pipelines.find(p => p.id === pipelineId)
    return pipeline?.stages?.find(s => s.id === etapaId)?.name ?? etapaId
  }

  // ── Formulario compartido (crear / editar) ────────────────────────
  function renderForm(mode: 'create' | 'edit', tokenId?: string) {
    const selectedPipeline = getSelectedPipeline()

    return (
      <div className="space-y-4">
        {/* Nombre */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Nombre descriptivo</Label>
          <Input
            placeholder="Ej: Landing Ferrer, Web Principal..."
            value={form.nombre}
            onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
            className="rounded-xl"
          />
        </div>

        {/* Pipeline */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Pipeline destino</Label>
          <Select value={form.pipeline_id} onValueChange={v => setForm(f => ({ ...f, pipeline_id: v, etapa_id: '' }))}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder="Seleccionar pipeline..." />
            </SelectTrigger>
            <SelectContent>
              {pipelines.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  <div className="flex items-center gap-2">
                    <Funnel size={14} weight="duotone" className="text-violet-500" />
                    {p.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Etapa */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Etapa destino</Label>
          <Select
            value={form.etapa_id}
            onValueChange={v => setForm(f => ({ ...f, etapa_id: v }))}
            disabled={!selectedPipeline}
          >
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder={selectedPipeline ? 'Seleccionar etapa...' : 'Primero selecciona pipeline'} />
            </SelectTrigger>
            <SelectContent>
              {(selectedPipeline?.stages ?? []).map(s => (
                <SelectItem key={s.id} value={s.id}>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.color || '#3b82f6' }} />
                    {s.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Prioridad y Empresa label */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Prioridad por defecto</Label>
            <Select value={form.prioridad_default} onValueChange={v => setForm(f => ({ ...f, prioridad_default: v }))}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Baja</SelectItem>
                <SelectItem value="medium">Media</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Label empresa</Label>
            <Input
              placeholder="Landing"
              value={form.empresa_label}
              onChange={e => setForm(f => ({ ...f, empresa_label: e.target.value }))}
              className="rounded-xl"
            />
          </div>
        </div>

        {/* Botón */}
        <div className="flex justify-end gap-2 pt-2">
          {mode === 'edit' && (
            <Button variant="ghost" onClick={() => { setEditingId(null); setForm(emptyForm) }} className="rounded-xl">
              Cancelar
            </Button>
          )}
          <Button
            onClick={() => mode === 'create' ? handleCreate() : handleUpdate(tokenId!)}
            disabled={creating}
            className="rounded-xl"
          >
            {creating ? 'Creando...' : mode === 'create' ? 'Crear Token' : 'Guardar Cambios'}
          </Button>
        </div>
      </div>
    )
  }

  // ── Render principal ──────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Encabezado + Info */}
      <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-amber-500/5 to-transparent pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Key size={20} weight="duotone" className="text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold">Landing Tokens</CardTitle>
              <CardDescription className="text-xs">
                Un solo endpoint para todas tus landing pages. Cada token rutea los leads automáticamente.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
            <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p>
                Crea un token por cada landing page o formulario. Cada token encapsula la
                <strong className="text-foreground"> empresa</strong>,
                <strong className="text-foreground"> pipeline</strong> y
                <strong className="text-foreground"> etapa</strong> destino.
              </p>
              <p>
                Endpoint:{' '}
                <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-[11px]">
                  POST {ENDPOINT_BASE}?token=TU_TOKEN
                </code>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Crear nuevo token */}
      <Dialog>
        <DialogTrigger asChild>
          <Button className="rounded-xl gap-2" onClick={() => setForm(emptyForm)}>
            <Plus size={16} weight="bold" />
            Nuevo Token
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key size={20} weight="duotone" className="text-amber-600" />
              Crear Token de Landing
            </DialogTitle>
          </DialogHeader>
          {renderForm('create')}
        </DialogContent>
      </Dialog>

      {/* Lista de tokens existentes */}
      {loading && <p className="text-sm text-muted-foreground">Cargando tokens...</p>}

      {!loading && tokens.length === 0 && (
        <Card className="border-none shadow-sm rounded-2xl">
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center text-center space-y-3 opacity-60">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Key size={32} className="text-muted-foreground" weight="thin" />
              </div>
              <p className="font-bold text-lg">Sin tokens</p>
              <p className="text-sm text-muted-foreground">Crea tu primer token para comenzar a recibir leads desde landing pages.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {tokens.map(token => (
          <Card key={token.id} className={`border-none shadow-sm rounded-2xl overflow-hidden transition-all ${!token.active ? 'opacity-60' : ''}`}>
            <CardHeader className="pb-3">
              <div className="flex flex-row items-center justify-between gap-2 overflow-hidden">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center ${token.active ? 'bg-amber-500/10' : 'bg-muted'}`}>
                    <Key size={18} weight="duotone" className={token.active ? 'text-amber-600' : 'text-muted-foreground'} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base font-bold truncate pr-2">{token.nombre}</CardTitle>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[10px] py-0 gap-1 whitespace-nowrap">
                        <Funnel size={10} />
                        <span className="truncate max-w-[80px]">{getPipelineName(token.pipeline_id)}</span>
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] py-0 whitespace-nowrap">
                        <span className="truncate max-w-[80px]">{getStageName(token.pipeline_id, token.etapa_id)}</span>
                      </Badge>
                      {token.active ? (
                        <Badge className="text-[10px] py-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/20 whitespace-nowrap">
                          <CheckCircle size={10} className="mr-0.5" /> Activo
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px] py-0 whitespace-nowrap">
                          Inactivo
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={token.active}
                    onCheckedChange={v => handleToggle(token.id, v)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {/* Token value */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex-1 flex items-center gap-2 bg-muted/50 rounded-xl px-3 py-2 border border-border/40">
                  <Key size={14} className="text-muted-foreground shrink-0" />
                  <code className="text-xs font-mono truncate flex-1">{token.token}</code>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 w-full sm:w-10 p-0 rounded-xl"
                  onClick={() => copyToClipboard(token.token, token.id)}
                >
                  {copiedId === token.id ? <CheckCircle size={16} className="text-emerald-500" /> : <Copy size={16} />}
                </Button>
              </div>

              {/* Endpoint URL */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex-1 flex items-center gap-2 bg-muted/50 rounded-xl px-3 py-2 border border-border/40">
                  <LinkIcon size={14} className="text-muted-foreground shrink-0" />
                  <code className="text-[11px] font-mono truncate flex-1">{ENDPOINT_BASE}?token={token.token}</code>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 w-full sm:w-10 p-0 rounded-xl"
                  onClick={() => copyToClipboard(`${ENDPOINT_BASE}?token=${token.token}`, `url_${token.id}`)}
                >
                  {copiedId === `url_${token.id}` ? <CheckCircle size={16} className="text-emerald-500" /> : <Copy size={16} />}
                </Button>
              </div>

              {/* Info chips */}
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-[10px] gap-1">
                  Prioridad: {token.prioridad_default}
                </Badge>
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Globe size={10} /> {token.empresa_label}
                </Badge>
                {token.created_at && (
                  <Badge variant="outline" className="text-[10px] gap-1">
                    Creado: {new Date(token.created_at).toLocaleDateString()}
                  </Badge>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl gap-1.5 text-xs h-10 w-full sm:w-auto"
                  onClick={() => setShowExample(showExample === token.id ? null : token.id)}
                >
                  <Code size={14} />
                  {showExample === token.id ? 'Ocultar ejemplo' : 'Ver ejemplo'}
                </Button>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="rounded-xl gap-1.5 text-xs h-10 w-full sm:w-auto" onClick={() => startEdit(token)}>
                      <PencilSimple size={14} />
                      Editar
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-lg rounded-2xl">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <PencilSimple size={20} weight="duotone" className="text-amber-600" />
                        Editar Token: {token.nombre}
                      </DialogTitle>
                    </DialogHeader>
                    {renderForm('edit', token.id)}
                  </DialogContent>
                </Dialog>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-xl gap-1.5 text-xs text-destructive hover:bg-destructive/10 h-10 w-full sm:w-auto"
                  onClick={() => handleDelete(token.id)}
                >
                  <Trash size={14} />
                  Eliminar
                </Button>
              </div>

              {/* Ejemplo de código */}
              {showExample === token.id && (
                <div className="mt-3 rounded-xl bg-zinc-950 p-4 overflow-x-auto">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-zinc-400 uppercase font-semibold tracking-wider">Ejemplo de uso (fetch)</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] text-zinc-400 hover:text-white"
                      onClick={() => copyToClipboard(getExampleCode(token.token), `code_${token.id}`)}
                    >
                      {copiedId === `code_${token.id}` ? 'Copiado!' : 'Copiar'}
                    </Button>
                  </div>
                  <pre className="text-xs text-emerald-400 font-mono whitespace-pre-wrap leading-relaxed">
                    {getExampleCode(token.token)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Helper: Generar código de ejemplo                                  */
/* ------------------------------------------------------------------ */

function getExampleCode(token: string): string {
  return `// Enviar lead desde tu landing page
fetch("${ENDPOINT_BASE}?token=${token}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    nombre_completo: "Juan Pérez",
    telefono: "584141234567",
    correo_electronico: "juan@email.com",
    empresa: "Mi Empresa",
    ubicacion: "Caracas",
    presupuesto: 5000,
    evento: "Landing Page Principal"
  })
})
.then(res => res.json())
.then(data => console.log(data))
// Respuesta: { success: true, lead_id: "uuid..." }`
}
