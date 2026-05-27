import { useEffect, useState } from 'react'
import { listEmpresaInstancias, createEmpresaInstancia, updateEmpresaInstancia, deleteEmpresaInstancia } from '@/supabase/services/instances'
import type { EmpresaInstanciaDB } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Trash, PencilSimple, WhatsappLogo, InstagramLogo, FacebookLogo, Funnel, UserPlus, Key, Globe, LinkSimple, CheckCircle, Clock, Prohibit, ChatText, FloppyDisk, Copy } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { getPipelines } from '@/supabase/helpers/pipeline'
import type { Pipeline } from '@/lib/types'
import { SuperAPIConnectButton } from './SuperAPIConnectButton'

interface InstancesManagerProps {
  empresaId: string
}

interface InstanceForm {
  plataforma: 'whatsapp' | 'instagram' | 'facebook' | ''
  client_id: string
  api_url: string
  label: string
  api_token: string
  webhook_secret: string
  active: boolean
  auto_create_lead: boolean
  default_pipeline_id: string
  default_stage_id: string
  default_lead_name: string
  include_first_message: boolean
}

const platformIcon = (platform: string, size = 20) => {
  switch (platform) {
    case 'whatsapp': return <WhatsappLogo size={size} weight="duotone" className="text-green-600" />
    case 'instagram': return <InstagramLogo size={size} weight="duotone" className="text-pink-600" />
    case 'facebook': return <FacebookLogo size={size} weight="duotone" className="text-blue-600" />
    default: return <Globe size={size} weight="duotone" className="text-muted-foreground" />
  }
}

const platformColor = (platform: string) => {
  switch (platform) {
    case 'whatsapp': return { bg: 'bg-green-500/10', border: 'border-green-500/20', text: 'text-green-700 dark:text-green-400', gradient: 'from-green-500/5' }
    case 'instagram': return { bg: 'bg-pink-500/10', border: 'border-pink-500/20', text: 'text-pink-700 dark:text-pink-400', gradient: 'from-pink-500/5' }
    case 'facebook': return { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-700 dark:text-blue-400', gradient: 'from-blue-500/5' }
    default: return { bg: 'bg-muted/50', border: 'border-border', text: 'text-muted-foreground', gradient: 'from-muted/20' }
  }
}

export function InstancesManager({ empresaId }: InstancesManagerProps) {
  const [instances, setInstances] = useState<EmpresaInstanciaDB[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pipelines, setPipelines] = useState<Pipeline[]>([])

  const emptyForm: InstanceForm = {
    plataforma: '',
    client_id: '',
    api_url: '',
    label: '',
    api_token: '',
    webhook_secret: '',
    active: true,
    auto_create_lead: true,
    default_pipeline_id: '',
    default_stage_id: '',
    default_lead_name: 'Nueva oportunidad',
    include_first_message: true
  }

  const [form, setForm] = useState<InstanceForm>(emptyForm)

  // Cargar pipelines
  useEffect(() => {
    if (!empresaId) return
    const loadPipelines = async () => {
      const { data, error } = await getPipelines(empresaId)
      if (error) {
        console.error('[InstancesManager] Error loading pipelines:', error)
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

  // Cargar instancias
  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        setLoading(true)
        const data = await listEmpresaInstancias(empresaId)
        if (mounted) setInstances(data)
      } catch (e) {
        console.error('[InstancesManager] list error', e)
        toast.error('No se pudieron cargar las instancias')
      } finally {
        setLoading(false)
      }
    }
    if (empresaId) load()
    return () => { mounted = false }
  }, [empresaId])

  // Sincronizar etapa cuando cambia el pipeline en el form
  useEffect(() => {
    if (!form.default_pipeline_id || pipelines.length === 0) return
    const pipeline = pipelines.find(p => p.id === form.default_pipeline_id)
    if (pipeline && !pipeline.stages?.some(s => s.id === form.default_stage_id)) {
      setForm(prev => ({ ...prev, default_stage_id: pipeline.stages?.[0]?.id || '' }))
    }
  }, [form.default_pipeline_id, pipelines])

  const handleCreate = async () => {
    if (!form.plataforma) {
      toast.error('Selecciona una plataforma')
      return
    }
    if (!form.api_token) {
      toast.error('El API Token es requerido')
      return
    }
    if (!form.webhook_secret) {
      toast.error('El Webhook Secret es requerido')
      return
    }
    try {
      setCreating(true)
      const created = await createEmpresaInstancia({
        empresa_id: empresaId,
        plataforma: form.plataforma,
        client_id: form.client_id.trim(),
        api_url: form.api_url.trim() || null as any,
        label: form.label.trim() || null as any,
        api_token: form.api_token.trim() || null as any,
        webhook_secret: form.webhook_secret.trim() || null as any,
        active: form.active,
        auto_create_lead: form.auto_create_lead,
        default_pipeline_id: form.default_pipeline_id || null,
        default_stage_id: form.default_stage_id || null,
        default_lead_name: form.default_lead_name || 'Nueva oportunidad',
        include_first_message: form.include_first_message
      } as any)
      setInstances((arr) => [created, ...arr])
      setForm(emptyForm)
      toast.success('Instancia creada correctamente')
    } catch (e: any) {
      console.error('[InstancesManager] create error', e)
      toast.error(e?.message || 'Error al crear instancia')
    } finally {
      setCreating(false)
    }
  }

  const handleEdit = (inst: EmpresaInstanciaDB) => {
    setEditingId(inst.id)
    setForm({
      plataforma: inst.plataforma as any,
      client_id: inst.client_id,
      api_url: inst.api_url || '',
      label: inst.label || '',
      api_token: (inst as any).api_token || '',
      webhook_secret: (inst as any).webhook_secret || '',
      active: inst.active,
      auto_create_lead: inst.auto_create_lead !== false,
      default_pipeline_id: inst.default_pipeline_id || '',
      default_stage_id: inst.default_stage_id || '',
      default_lead_name: inst.default_lead_name || 'Nueva oportunidad',
      include_first_message: inst.include_first_message !== false
    })
  }

  const handleUpdate = async () => {
    if (!editingId) return
    try {
      const updated = await updateEmpresaInstancia(editingId, {
        client_id: form.client_id.trim(),
        api_url: form.api_url.trim() || null as any,
        label: form.label.trim() || null as any,
        api_token: form.api_token.trim() || null as any,
        webhook_secret: form.webhook_secret.trim() || null as any,
        active: form.active,
        auto_create_lead: form.auto_create_lead,
        default_pipeline_id: form.default_pipeline_id || null,
        default_stage_id: form.default_stage_id || null,
        default_lead_name: form.default_lead_name || 'Nueva oportunidad',
        include_first_message: form.include_first_message
      } as any)
      setInstances((arr) => arr.map(i => i.id === editingId ? updated : i))
      setEditingId(null)
      setForm(emptyForm)
      toast.success('Instancia actualizada')
    } catch (e: any) {
      console.error('[InstancesManager] update error', e)
      toast.error(e?.message || 'Error al actualizar')
    }
  }

  const handleToggleActive = async (id: string, active: boolean) => {
    try {
      const updated = await updateEmpresaInstancia(id, { active })
      setInstances((arr) => arr.map(i => i.id === id ? updated : i))
    } catch (e) {
      console.error('[InstancesManager] update error', e)
      toast.error('No se pudo actualizar la instancia')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta instancia?')) return
    try {
      await deleteEmpresaInstancia(id)
      setInstances((arr) => arr.filter(i => i.id !== id))
      toast.success('Instancia eliminada')
    } catch (e) {
      console.error('[InstancesManager] delete error', e)
      toast.error('No se pudo eliminar')
    }
  }

  const maskToken = (token: string | null | undefined) => {
    if (!token) return '-'
    if (token.length <= 8) return '••••••••'
    return token.substring(0, 4) + '••••••••' + token.substring(token.length - 4)
  }

  const getPipelineName = (pipelineId: string | null | undefined) => {
    if (!pipelineId) return null
    return pipelines.find(p => p.id === pipelineId)?.name || null
  }

  const getStageName = (pipelineId: string | null | undefined, stageId: string | null | undefined) => {
    if (!pipelineId || !stageId) return null
    const pipeline = pipelines.find(p => p.id === pipelineId)
    return pipeline?.stages?.find(s => s.id === stageId)?.name || null
  }

  // Componente reutilizable para la sección de pipeline config
  const PipelineConfigSection = ({ isCreate = false }: { isCreate?: boolean }) => (
    <div className="space-y-4 border-t border-border/40 pt-5 mt-5">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-indigo-500/10 flex items-center justify-center">
          <UserPlus size={14} weight="duotone" className="text-indigo-600" />
        </div>
        <span className="text-sm font-bold">Números no registrados</span>
      </div>

      <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-muted/30 border border-border/30">
        <div>
          <Label className="text-sm font-semibold">Crear oportunidad automáticamente</Label>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Cuando llega un mensaje de un número que no existe en el CRM.
          </p>
        </div>
        <Switch checked={form.auto_create_lead} onCheckedChange={(v) => setForm(s => ({ ...s, auto_create_lead: v }))} />
      </div>

      {form.auto_create_lead && (
        <div className="space-y-4 pl-2 border-l-2 border-indigo-500/20 ml-2">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Funnel size={12} className="text-indigo-500" />
                Pipeline destino
              </Label>
              <Select value={form.default_pipeline_id} onValueChange={(v) => setForm(s => ({ ...s, default_pipeline_id: v }))}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Selecciona un pipeline" />
                </SelectTrigger>
                <SelectContent>
                  {pipelines.map(pipeline => (
                    <SelectItem key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Funnel size={12} className="text-indigo-500" />
                Etapa destino
              </Label>
              <Select value={form.default_stage_id} onValueChange={(v) => setForm(s => ({ ...s, default_stage_id: v }))}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Selecciona una etapa" />
                </SelectTrigger>
                <SelectContent>
                  {(pipelines.find(p => p.id === form.default_pipeline_id)?.stages || []).map(stage => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Nombre por defecto de la oportunidad</Label>
            <Input
              value={form.default_lead_name}
              onChange={(e) => setForm(s => ({ ...s, default_lead_name: e.target.value }))}
              placeholder="Nueva oportunidad"
              className="rounded-xl"
            />
          </div>

          <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-muted/30 border border-border/30">
            <div>
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <ChatText size={12} className="text-indigo-500" />
                Guardar mensaje inicial
              </Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Incluye el primer mensaje como nota al crear la oportunidad.
              </p>
            </div>
            <Switch checked={form.include_first_message} onCheckedChange={(v) => setForm(s => ({ ...s, include_first_message: v }))} />
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      {/*
        SuperAPI OAuth — solo se renderiza si el feature flag está prendido
        (VITE_SUPERAPI_OAUTH_ENABLED=true y hay client_id configurado).
        Si está apagado, el componente devuelve null y no aparece nada.
      */}
      <SuperAPIConnectButton empresaId={empresaId} />

      {/* Nueva Instancia */}
      <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-emerald-500/5 to-transparent pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Plus size={20} weight="bold" className="text-emerald-600" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold">Nueva Instancia</CardTitle>
              <CardDescription className="text-xs">
                Configura una nueva instancia de WhatsApp, Instagram o Facebook con Super API
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          {/* Row 1: Platform, Client ID, Label */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Plataforma *</Label>
              <Select value={form.plataforma} onValueChange={(v: any) => setForm(s => ({ ...s, plataforma: v }))}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">
                    <span className="flex items-center gap-2">
                      <WhatsappLogo size={16} weight="duotone" className="text-green-600" />
                      WhatsApp
                    </span>
                  </SelectItem>
                  <SelectItem value="instagram">
                    <span className="flex items-center gap-2">
                      <InstagramLogo size={16} weight="duotone" className="text-pink-600" />
                      Instagram
                    </span>
                  </SelectItem>
                  <SelectItem value="facebook">
                    <span className="flex items-center gap-2">
                      <FacebookLogo size={16} weight="duotone" className="text-blue-600" />
                      Facebook
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                Client ID
                <Badge variant="outline" className="text-[9px] uppercase tracking-wider font-bold rounded-md">Auto</Badge>
              </Label>
              <Input
                value={form.client_id}
                onChange={(e) => setForm(s => ({ ...s, client_id: e.target.value }))}
                placeholder="Se llenará automáticamente"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Etiqueta</Label>
              <Input value={form.label} onChange={(e) => setForm(s => ({ ...s, label: e.target.value }))} placeholder="Ej: Ventas MX" className="rounded-xl" />
            </div>
          </div>

          {/* Row 2: Credentials */}
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Key size={12} className="text-amber-500" />
                API Token *
                <span className="text-[10px] text-muted-foreground font-normal">(Bearer token de Super API)</span>
              </Label>
              <Input
                type="password"
                value={form.api_token}
                onChange={(e) => setForm(s => ({ ...s, api_token: e.target.value }))}
                placeholder="Tu token de autenticación"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Key size={12} className="text-amber-500" />
                Webhook Secret
                <span className="text-[10px] text-muted-foreground font-normal">(Para validar webhooks entrantes)</span>
              </Label>
              <Input
                value={form.webhook_secret}
                onChange={(e) => setForm(s => ({ ...s, webhook_secret: e.target.value }))}
                placeholder="Secret único para esta instancia"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Globe size={12} className="text-violet-500" />
                API URL
                <Badge variant="outline" className="text-[9px] uppercase tracking-wider font-bold rounded-md">Opcional</Badge>
              </Label>
              <Input value={form.api_url} onChange={(e) => setForm(s => ({ ...s, api_url: e.target.value }))} placeholder="https://v4.iasuperapi.com" className="rounded-xl" />
            </div>
          </div>

          {/* Pipeline Config Section */}
          <PipelineConfigSection isCreate />

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-border/30">
            <div className="flex items-center gap-3 p-2 rounded-xl bg-muted/30">
              <Switch checked={form.active} onCheckedChange={(v) => setForm(s => ({ ...s, active: v }))} />
              <span className="text-sm font-semibold">Instancia activa</span>
            </div>
            <Button onClick={handleCreate} disabled={creating} className="rounded-xl shadow-sm gap-2">
              <FloppyDisk size={16} weight="bold" />
              {creating ? 'Guardando...' : 'Guardar Configuración'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Instancias Configuradas */}
      <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-slate-500/5 to-transparent pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-500/10 flex items-center justify-center">
              <LinkSimple size={20} weight="duotone" className="text-slate-600" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold">Instancias Configuradas</CardTitle>
              <CardDescription className="text-xs">
                {instances.length} instancia{instances.length !== 1 ? 's' : ''} configurada{instances.length !== 1 ? 's' : ''}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 opacity-60">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center animate-pulse">
                <Clock size={24} className="text-muted-foreground" weight="thin" />
              </div>
              <p className="text-sm text-muted-foreground font-medium">Cargando instancias...</p>
            </div>
          ) : instances.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 opacity-60">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <LinkSimple size={32} className="text-muted-foreground" weight="thin" />
              </div>
              <div>
                <p className="font-bold text-lg">Sin instancias</p>
                <p className="text-sm text-muted-foreground">No hay instancias configuradas aún.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {instances.map(inst => {
                const pipelineName = getPipelineName(inst.default_pipeline_id)
                const stageName = getStageName(inst.default_pipeline_id, inst.default_stage_id)
                const colors = platformColor(inst.plataforma)

                return (
                  <div key={inst.id} className={`rounded-xl border ${colors.border} bg-gradient-to-r ${colors.gradient} to-transparent p-3 sm:p-4 space-y-3 hover:shadow-sm transition-all`}>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        <div className={`h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-xl ${colors.bg} flex items-center justify-center`}>
                          {platformIcon(inst.plataforma)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                            <span className="font-bold text-sm capitalize">{inst.plataforma}</span>
                            {inst.label && (
                              <Badge variant="outline" className="text-[10px] font-bold rounded-md">{inst.label}</Badge>
                            )}
                            <Badge
                              className={`text-[9px] uppercase tracking-wider font-bold rounded-md border-none ${inst.active
                                ? 'bg-emerald-500/10 text-emerald-600'
                                : 'bg-red-500/10 text-red-600'
                                }`}
                            >
                              {inst.active ? 'Activa' : 'Inactiva'}
                            </Badge>
                          </div>

                          {/* Client ID Status */}
                          <div className="flex items-center gap-2 mt-1">
                            {inst.client_id ? (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                <CheckCircle size={12} weight="fill" />
                                <span className="font-mono text-muted-foreground truncate max-w-[150px] sm:max-w-none">{inst.client_id}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                <Clock size={12} weight="fill" />
                                <span className="hidden sm:inline">Pendiente — se aprenderá automáticamente</span>
                                <span className="sm:hidden">Pendiente</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Switch checked={inst.active} onCheckedChange={(v) => handleToggleActive(inst.id, v)} />
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg" onClick={() => handleEdit(inst)}>
                              <PencilSimple size={16} />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl w-[95vw] sm:w-auto">
                            <DialogHeader>
                              <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                                {platformIcon(inst.plataforma, 22)}
                                Editar Instancia
                                {inst.label && <Badge variant="outline" className="ml-1 text-[10px]">{inst.label}</Badge>}
                              </DialogTitle>
                            </DialogHeader>
                            <div className="space-y-5 pt-2">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                                    Client ID
                                    {inst.client_id ? (
                                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                                        <CheckCircle size={10} weight="fill" /> Aprendido
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                                        <Clock size={10} weight="fill" /> Pendiente
                                      </span>
                                    )}
                                  </Label>
                                  <Input
                                    value={form.client_id}
                                    readOnly
                                    className="bg-muted/50 text-muted-foreground cursor-not-allowed rounded-xl"
                                    placeholder="Se llenará automáticamente"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-sm font-semibold">Etiqueta</Label>
                                  <Input value={form.label} onChange={(e) => setForm(s => ({ ...s, label: e.target.value }))} className="rounded-xl" />
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-sm font-semibold flex items-center gap-1.5">
                                  <Key size={12} className="text-amber-500" />
                                  API Token
                                </Label>
                                <Input type="password" value={form.api_token} onChange={(e) => setForm(s => ({ ...s, api_token: e.target.value }))} className="rounded-xl" />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-sm font-semibold flex items-center gap-1.5">
                                  <Key size={12} className="text-amber-500" />
                                  Webhook Secret
                                </Label>
                                <Input value={form.webhook_secret} onChange={(e) => setForm(s => ({ ...s, webhook_secret: e.target.value }))} className="rounded-xl" />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-sm font-semibold flex items-center gap-1.5">
                                  <Globe size={12} className="text-violet-500" />
                                  API URL
                                </Label>
                                <Input value={form.api_url} onChange={(e) => setForm(s => ({ ...s, api_url: e.target.value }))} className="rounded-xl" />
                              </div>

                              {/* Pipeline Config en edición */}
                              <PipelineConfigSection />

                              <div className="flex justify-end gap-2 pt-2 border-t border-border/30">
                                <Button variant="outline" onClick={() => { setEditingId(null); setForm(emptyForm) }} className="rounded-xl">Cancelar</Button>
                                <Button onClick={handleUpdate} className="rounded-xl shadow-sm">Guardar Cambios</Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg text-destructive hover:bg-destructive/10" onClick={() => handleDelete(inst.id)}>
                          <Trash size={16} />
                        </Button>
                      </div>
                    </div>

                    {/* Status Badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      {inst.auto_create_lead !== false && pipelineName && (
                        <Badge className="text-[10px] font-bold rounded-md border-none bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 gap-1">
                          <Funnel size={10} weight="fill" />
                          {pipelineName} → {stageName || '?'}
                        </Badge>
                      )}
                      {inst.auto_create_lead === false && (
                        <Badge className="text-[10px] font-bold rounded-md border-none bg-gray-500/10 text-gray-600 dark:text-gray-400 gap-1">
                          <Prohibit size={10} weight="bold" />
                          No crea oportunidades automáticamente
                        </Badge>
                      )}
                    </div>

                    {/* Credentials Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] pt-2 border-t border-border/20">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Key size={10} className="text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground shrink-0">Token:</span>
                        <span className="font-mono font-medium truncate">{maskToken((inst as any).api_token)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Key size={10} className="text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground shrink-0">Secret:</span>
                        <span className="font-mono font-medium truncate">{maskToken((inst as any).webhook_secret)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Globe size={10} className="text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground shrink-0">URL:</span>
                        <span className="font-mono font-medium truncate">{inst.api_url || 'v4.iasuperapi.com'}</span>
                      </div>
                    </div>

                    {/* Webhook URL */}
                    {(inst as any).webhook_secret && (
                      <div className="pt-2 border-t border-border/20">
                        <div className="flex items-center gap-2 mb-1.5">
                          <LinkSimple size={12} className="text-muted-foreground" />
                          <span className="text-[11px] font-semibold text-muted-foreground">Webhook URL</span>
                        </div>
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 border border-border/30 min-w-0">
                          <code className="text-[10px] sm:text-[11px] font-mono text-foreground/80 truncate flex-1 select-all">
                            {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-chat?secret=${(inst as any).webhook_secret}`}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 rounded-md shrink-0"
                            onClick={() => {
                              navigator.clipboard.writeText(
                                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-chat?secret=${(inst as any).webhook_secret}`
                              )
                              toast.success('URL copiada al portapapeles')
                            }}
                          >
                            <Copy size={14} />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default InstancesManager
