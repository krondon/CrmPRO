import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  WhatsappLogo,
  Key,
  CheckCircle,
  Warning,
  CloudArrowDown,
  FloppyDisk,
  Trash,
  PencilSimple,
  Info,
  Plus,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  listMetaConfigs,
  createMetaConfig,
  updateMetaConfig,
  deleteMetaConfig,
  listFollowUpTemplates,
  upsertFollowUpTemplate,
  updateFollowUpTemplate,
  deleteFollowUpTemplate,
  testMetaConnection,
  fetchApprovedTemplates,
  type MetaTemplateRemote,
} from '@/supabase/services/metaTemplates'
import type { MetaConfigDB, MetaFollowUpTemplateDB } from '@/lib/types'

interface Props {
  empresaId: string
}

interface ConfigForm {
  label: string
  phone_number_id: string
  waba_id: string
  access_token: string
  active: boolean
}

const emptyForm: ConfigForm = {
  label: '',
  phone_number_id: '',
  waba_id: '',
  access_token: '',
  active: true,
}

function maskToken(t: string | null | undefined) {
  if (!t) return '—'
  if (t.length <= 10) return '••••••'
  return t.slice(0, 4) + '••••••' + t.slice(-4)
}

export function MetaTemplatesManager({ empresaId }: Props) {
  const [configs, setConfigs] = useState<MetaConfigDB[]>([])
  const [templates, setTemplates] = useState<MetaFollowUpTemplateDB[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ConfigForm>(emptyForm)
  const [showForm, setShowForm] = useState(false)
  const [testing, setTesting] = useState(false)

  const [syncingConfigId, setSyncingConfigId] = useState<string | null>(null)
  const [remoteTemplates, setRemoteTemplates] = useState<MetaTemplateRemote[]>([])
  const [syncDialogConfig, setSyncDialogConfig] = useState<MetaConfigDB | null>(null)

  // Agregar plantilla manualmente
  const [manualFormConfigId, setManualFormConfigId] = useState<string | null>(null)
  const [manualForm, setManualForm] = useState({
    meta_template_name: '',
    meta_template_language: 'es',
    display_label: '',
    body_preview: '',
  })
  const [manualSaving, setManualSaving] = useState(false)

  useEffect(() => {
    if (!empresaId) return
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        const [c, t] = await Promise.all([
          listMetaConfigs(empresaId),
          listFollowUpTemplates(empresaId),
        ])
        if (!mounted) return
        setConfigs(c)
        setTemplates(t)
      } catch (e: any) {
        console.error('[MetaTemplatesManager] load error', e)
        toast.error('No se pudo cargar la configuración de Meta')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [empresaId])

  const templatesByConfig = useMemo(() => {
    const map = new Map<string, MetaFollowUpTemplateDB[]>()
    for (const t of templates) {
      const arr = map.get(t.meta_config_id) || []
      arr.push(t)
      map.set(t.meta_config_id, arr)
    }
    return map
  }, [templates])

  const handleTestConnection = async () => {
    if (!form.phone_number_id || !form.access_token) {
      toast.error('Phone Number ID y Access Token son requeridos para probar')
      return
    }
    setTesting(true)
    try {
      const res = await testMetaConnection({
        phone_number_id: form.phone_number_id.trim(),
        access_token: form.access_token.trim(),
      })
      if (res.ok) {
        toast.success(`Conexión OK: ${res.display_phone || 'número verificado'}`)
      } else {
        toast.error(`Error: ${res.error}`)
      }
    } finally {
      setTesting(false)
    }
  }

  const handleSaveConfig = async () => {
    if (!form.phone_number_id.trim() || !form.waba_id.trim() || !form.access_token.trim()) {
      toast.error('Phone Number ID, WABA ID y Access Token son obligatorios')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        const updated = await updateMetaConfig(editingId, {
          label: form.label.trim() || null,
          phone_number_id: form.phone_number_id.trim(),
          waba_id: form.waba_id.trim(),
          access_token: form.access_token.trim(),
          active: form.active,
        })
        setConfigs((arr) => arr.map((c) => (c.id === editingId ? updated : c)))
        toast.success('Configuración actualizada')
      } else {
        const created = await createMetaConfig({
          empresa_id: empresaId,
          label: form.label.trim() || null,
          phone_number_id: form.phone_number_id.trim(),
          waba_id: form.waba_id.trim(),
          access_token: form.access_token.trim(),
          display_phone: null,
          active: form.active,
        })
        setConfigs((arr) => [...arr, created])
        toast.success('Configuración guardada')
      }
      setForm(emptyForm)
      setEditingId(null)
      setShowForm(false)
    } catch (e: any) {
      console.error('[MetaTemplatesManager] save error', e)
      toast.error(e?.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (config: MetaConfigDB) => {
    setEditingId(config.id)
    setForm({
      label: config.label || '',
      phone_number_id: config.phone_number_id,
      waba_id: config.waba_id,
      access_token: config.access_token,
      active: config.active,
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta configuración? También se eliminarán sus plantillas asociadas.')) return
    try {
      await deleteMetaConfig(id)
      setConfigs((arr) => arr.filter((c) => c.id !== id))
      setTemplates((arr) => arr.filter((t) => t.meta_config_id !== id))
      toast.success('Configuración eliminada')
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo eliminar')
    }
  }

  const handleToggleConfig = async (config: MetaConfigDB, active: boolean) => {
    try {
      const updated = await updateMetaConfig(config.id, { active })
      setConfigs((arr) => arr.map((c) => (c.id === config.id ? updated : c)))
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo actualizar')
    }
  }

  const openSyncDialog = async (config: MetaConfigDB) => {
    setSyncDialogConfig(config)
    setSyncingConfigId(config.id)
    setRemoteTemplates([])
    try {
      const list = await fetchApprovedTemplates({
        waba_id: config.waba_id,
        access_token: config.access_token,
      })
      setRemoteTemplates(list)
      if (list.length === 0) {
        toast.info('No se encontraron plantillas aprobadas en esta WABA')
      }
    } catch (e: any) {
      console.error('[MetaTemplatesManager] fetch templates error', e)
      toast.error(e?.message || 'No se pudo traer plantillas desde Meta')
      setSyncDialogConfig(null)
    } finally {
      setSyncingConfigId(null)
    }
  }

  const isTemplateActivated = (configId: string, name: string, language: string) =>
    templates.some(
      (t) =>
        t.meta_config_id === configId &&
        t.meta_template_name === name &&
        t.meta_template_language === language
    )

  const openManualForm = (configId: string) => {
    setManualFormConfigId(configId)
    setManualForm({
      meta_template_name: '',
      meta_template_language: 'es',
      display_label: '',
      body_preview: '',
    })
  }

  const handleSaveManualTemplate = async (config: MetaConfigDB) => {
    const name = manualForm.meta_template_name.trim()
    const lang = manualForm.meta_template_language.trim() || 'es'
    if (!name) {
      toast.error('El nombre de la plantilla es obligatorio')
      return
    }
    setManualSaving(true)
    try {
      const created = await upsertFollowUpTemplate({
        empresa_id: empresaId,
        meta_config_id: config.id,
        meta_template_name: name,
        meta_template_language: lang,
        meta_template_category: null,
        display_label: manualForm.display_label.trim() || name,
        body_preview: manualForm.body_preview.trim() || null,
        has_variables: false,
        active: true,
      })
      setTemplates((arr) => {
        const idx = arr.findIndex((t) => t.id === created.id)
        if (idx >= 0) {
          const copy = [...arr]
          copy[idx] = created
          return copy
        }
        return [...arr, created]
      })
      toast.success(`Plantilla "${name}" guardada`)
      setManualFormConfigId(null)
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo guardar la plantilla')
    } finally {
      setManualSaving(false)
    }
  }

  const handleActivateRemote = async (config: MetaConfigDB, remote: MetaTemplateRemote) => {
    try {
      const created = await upsertFollowUpTemplate({
        empresa_id: empresaId,
        meta_config_id: config.id,
        meta_template_name: remote.name,
        meta_template_language: remote.language,
        meta_template_category: remote.category || null,
        display_label: remote.name,
        body_preview: remote.bodyText || null,
        has_variables: remote.hasVariables,
        active: true,
      })
      setTemplates((arr) => {
        const idx = arr.findIndex((t) => t.id === created.id)
        if (idx >= 0) {
          const copy = [...arr]
          copy[idx] = created
          return copy
        }
        return [...arr, created]
      })
      toast.success(`Plantilla "${remote.name}" activada`)
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo activar')
    }
  }

  const handleUpdateLabel = async (template: MetaFollowUpTemplateDB, label: string) => {
    try {
      const updated = await updateFollowUpTemplate(template.id, { display_label: label })
      setTemplates((arr) => arr.map((t) => (t.id === template.id ? updated : t)))
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo actualizar')
    }
  }

  const handleToggleTemplate = async (template: MetaFollowUpTemplateDB, active: boolean) => {
    try {
      const updated = await updateFollowUpTemplate(template.id, { active })
      setTemplates((arr) => arr.map((t) => (t.id === template.id ? updated : t)))
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo actualizar')
    }
  }

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('¿Quitar esta plantilla del CRM? (no afecta a Meta)')) return
    try {
      await deleteFollowUpTemplate(id)
      setTemplates((arr) => arr.filter((t) => t.id !== id))
      toast.success('Plantilla eliminada')
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo eliminar')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center">
          <WhatsappLogo size={20} weight="duotone" className="text-green-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold">WhatsApp Meta — Plantillas</h2>
          <p className="text-xs text-muted-foreground">
            Configura credenciales de Meta Cloud API y elige qué plantillas aprobadas usar como
            seguimiento.
          </p>
        </div>
        {!showForm && (
          <Button
            onClick={() => {
              setForm(emptyForm)
              setEditingId(null)
              setShowForm(true)
            }}
            className="rounded-xl shadow-sm gap-2"
          >
            <Plus size={16} weight="bold" />
            Nueva configuración
          </Button>
        )}
      </div>

      {/* Info card */}
      <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
        <CardContent className="pt-5">
          <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
            <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Las plantillas con variables (<code className="font-mono">{`{{1}}`}</code>,{' '}
              <code className="font-mono">{`{{2}}`}</code>, …) se ocultan por ahora. Solo se usan
              plantillas aprobadas de texto plano.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Form */}
      {showForm && (
        <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-green-500/5 to-transparent pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                <Key size={20} weight="duotone" className="text-green-600" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold">
                  {editingId ? 'Editar configuración' : 'Nueva configuración Meta'}
                </CardTitle>
                <CardDescription className="text-xs">
                  Phone Number ID, WABA ID y Access Token desde Meta Business Manager.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Etiqueta</Label>
                <Input
                  value={form.label}
                  onChange={(e) => setForm((s) => ({ ...s, label: e.target.value }))}
                  placeholder="Ej: Línea principal MX"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Phone Number ID *</Label>
                <Input
                  value={form.phone_number_id}
                  onChange={(e) => setForm((s) => ({ ...s, phone_number_id: e.target.value }))}
                  placeholder="123456789012345"
                  className="rounded-xl font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">WABA ID *</Label>
                <Input
                  value={form.waba_id}
                  onChange={(e) => setForm((s) => ({ ...s, waba_id: e.target.value }))}
                  placeholder="987654321098765"
                  className="rounded-xl font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Access Token *</Label>
                <Input
                  type="password"
                  value={form.access_token}
                  onChange={(e) => setForm((s) => ({ ...s, access_token: e.target.value }))}
                  placeholder="EAAB..."
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border/30">
              <div className="flex items-center gap-3 p-2 rounded-xl bg-muted/30">
                <Switch
                  checked={form.active}
                  onCheckedChange={(v) => setForm((s) => ({ ...s, active: v }))}
                />
                <span className="text-sm font-semibold">Activa</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="rounded-xl"
                >
                  {testing ? 'Probando...' : 'Probar conexión'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowForm(false)
                    setForm(emptyForm)
                    setEditingId(null)
                  }}
                  className="rounded-xl"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSaveConfig}
                  disabled={saving}
                  className="rounded-xl shadow-sm gap-2"
                >
                  <FloppyDisk size={16} weight="bold" />
                  {saving ? 'Guardando...' : 'Guardar'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de configs */}
      {loading ? (
        <Card className="border-none shadow-sm rounded-2xl">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">Cargando…</p>
          </CardContent>
        </Card>
      ) : configs.length === 0 ? (
        <Card className="border-none shadow-sm rounded-2xl">
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center text-center space-y-3 opacity-60">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <WhatsappLogo size={32} className="text-muted-foreground" weight="thin" />
              </div>
              <p className="font-bold text-lg">Sin configuraciones</p>
              <p className="text-sm text-muted-foreground">
                Agrega tus credenciales de Meta Cloud API para empezar.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {configs.map((config) => {
            const configTemplates = templatesByConfig.get(config.id) || []
            return (
              <Card
                key={config.id}
                className="border-none shadow-sm rounded-2xl overflow-hidden"
              >
                <CardHeader className="bg-gradient-to-r from-green-500/5 to-transparent pb-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
                        <WhatsappLogo size={20} weight="duotone" className="text-green-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle className="text-base font-bold">
                            {config.label || 'Sin etiqueta'}
                          </CardTitle>
                          <Badge
                            className={`text-[9px] uppercase tracking-wider font-bold rounded-md border-none ${
                              config.active
                                ? 'bg-emerald-500/10 text-emerald-600'
                                : 'bg-red-500/10 text-red-600'
                            }`}
                          >
                            {config.active ? 'Activa' : 'Inactiva'}
                          </Badge>
                          {config.display_phone && (
                            <Badge variant="outline" className="text-[10px] font-mono">
                              {config.display_phone}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
                          PNID: {config.phone_number_id} · WABA: {config.waba_id}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch
                        checked={config.active}
                        onCheckedChange={(v) => handleToggleConfig(config, v)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 rounded-lg"
                        onClick={() => handleEdit(config)}
                      >
                        <PencilSimple size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 rounded-lg text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(config.id)}
                      >
                        <Trash size={16} />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  {/* Token info */}
                  <div className="flex items-center gap-2 text-[11px]">
                    <Key size={10} className="text-muted-foreground" />
                    <span className="text-muted-foreground">Token:</span>
                    <span className="font-mono font-medium">{maskToken(config.access_token)}</span>
                  </div>

                  {/* Sync / Manual actions */}
                  <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/30 border border-border/30 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">Plantillas aprobadas</p>
                      <p className="text-[11px] text-muted-foreground">
                        Sincroniza desde Meta o agrega manualmente con su nombre e idioma.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        onClick={() => openManualForm(config.id)}
                        disabled={!config.active || manualFormConfigId === config.id}
                        className="rounded-xl gap-2"
                      >
                        <Plus size={16} weight="bold" />
                        Agregar manualmente
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => openSyncDialog(config)}
                        disabled={syncingConfigId === config.id || !config.active}
                        className="rounded-xl gap-2"
                      >
                        <CloudArrowDown size={16} weight="bold" />
                        {syncingConfigId === config.id ? 'Sincronizando…' : 'Sincronizar desde Meta'}
                      </Button>
                    </div>
                  </div>

                  {/* Manual add form */}
                  {manualFormConfigId === config.id && (
                    <div className="space-y-3 p-4 rounded-xl border border-green-500/20 bg-green-500/5">
                      <div className="flex items-center gap-2">
                        <Plus size={14} weight="bold" className="text-green-600" />
                        <span className="text-sm font-bold">Nueva plantilla manual</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        El nombre debe coincidir <strong>exactamente</strong> con el de Meta Business
                        Manager. Solo texto plano (sin variables).
                      </p>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">Nombre en Meta *</Label>
                          <Input
                            value={manualForm.meta_template_name}
                            onChange={(e) =>
                              setManualForm((s) => ({ ...s, meta_template_name: e.target.value }))
                            }
                            placeholder="noti_recolector"
                            className="rounded-xl font-mono text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">Idioma *</Label>
                          <Input
                            value={manualForm.meta_template_language}
                            onChange={(e) =>
                              setManualForm((s) => ({
                                ...s,
                                meta_template_language: e.target.value,
                              }))
                            }
                            placeholder="es"
                            className="rounded-xl font-mono text-sm uppercase"
                          />
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                          <Label className="text-xs font-semibold">Etiqueta visible</Label>
                          <Input
                            value={manualForm.display_label}
                            onChange={(e) =>
                              setManualForm((s) => ({ ...s, display_label: e.target.value }))
                            }
                            placeholder="Notificación al recolector"
                            className="rounded-xl"
                          />
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                          <Label className="text-xs font-semibold">
                            Texto de preview (opcional)
                          </Label>
                          <Input
                            value={manualForm.body_preview}
                            onChange={(e) =>
                              setManualForm((s) => ({ ...s, body_preview: e.target.value }))
                            }
                            placeholder="Texto que se mostrará en el CRM al elegir la plantilla"
                            className="rounded-xl"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          onClick={() => setManualFormConfigId(null)}
                          className="rounded-xl"
                        >
                          Cancelar
                        </Button>
                        <Button
                          onClick={() => handleSaveManualTemplate(config)}
                          disabled={manualSaving}
                          className="rounded-xl shadow-sm gap-2"
                        >
                          <FloppyDisk size={16} weight="bold" />
                          {manualSaving ? 'Guardando…' : 'Guardar plantilla'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Lista plantillas activadas */}
                  {configTemplates.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Plantillas activas ({configTemplates.filter((t) => t.active).length} de{' '}
                        {configTemplates.length})
                      </Label>
                      <div className="space-y-2">
                        {configTemplates.map((t) => (
                          <div
                            key={t.id}
                            className="flex items-start justify-between gap-2 p-3 rounded-xl border border-border/40 hover:bg-muted/20 transition-colors"
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Input
                                  defaultValue={t.display_label || t.meta_template_name}
                                  onBlur={(e) => {
                                    const v = e.target.value.trim()
                                    if (v && v !== (t.display_label || t.meta_template_name)) {
                                      handleUpdateLabel(t, v)
                                    }
                                  }}
                                  className="h-7 text-sm font-bold rounded-lg w-48"
                                />
                                <Badge variant="outline" className="text-[9px] font-mono">
                                  {t.meta_template_name}
                                </Badge>
                                <Badge variant="outline" className="text-[9px] uppercase">
                                  {t.meta_template_language}
                                </Badge>
                                {t.meta_template_category && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] uppercase bg-violet-500/10 text-violet-600 border-violet-500/20"
                                  >
                                    {t.meta_template_category}
                                  </Badge>
                                )}
                              </div>
                              {t.body_preview && (
                                <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                                  {t.body_preview}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Switch
                                checked={t.active}
                                onCheckedChange={(v) => handleToggleTemplate(t, v)}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 rounded-lg text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeleteTemplate(t.id)}
                              >
                                <Trash size={14} />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Sync dialog (inline overlay) */}
      {syncDialogConfig && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSyncDialogConfig(null)}
        >
          <div
            className="bg-background rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-border/40">
              <div className="flex items-center gap-2">
                <CloudArrowDown size={20} weight="duotone" className="text-green-600" />
                <h3 className="text-lg font-bold">Plantillas aprobadas en Meta</h3>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {syncDialogConfig.label || syncDialogConfig.phone_number_id} · Solo se muestran
                plantillas APPROVED.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-2">
              {syncingConfigId === syncDialogConfig.id ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Cargando plantillas…
                </p>
              ) : remoteTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No hay plantillas aprobadas.
                </p>
              ) : (
                remoteTemplates.map((r) => {
                  const activated = isTemplateActivated(
                    syncDialogConfig.id,
                    r.name,
                    r.language
                  )
                  return (
                    <div
                      key={`${r.name}-${r.language}`}
                      className={`p-3 rounded-xl border ${
                        r.hasVariables ? 'border-amber-500/20 bg-amber-500/5' : 'border-border/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-sm font-mono">{r.name}</span>
                            <Badge variant="outline" className="text-[9px] uppercase">
                              {r.language}
                            </Badge>
                            {r.category && (
                              <Badge
                                variant="outline"
                                className="text-[9px] uppercase bg-violet-500/10 text-violet-600 border-violet-500/20"
                              >
                                {r.category}
                              </Badge>
                            )}
                            {r.hasVariables && (
                              <Badge className="text-[9px] uppercase bg-amber-500/10 text-amber-600 border-none gap-1">
                                <Warning size={10} weight="fill" />
                                Tiene variables
                              </Badge>
                            )}
                          </div>
                          {r.bodyText && (
                            <p className="text-xs text-muted-foreground mt-1.5 whitespace-pre-wrap">
                              {r.bodyText}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0">
                          {activated ? (
                            <Badge className="bg-emerald-500/10 text-emerald-600 border-none gap-1">
                              <CheckCircle size={12} weight="fill" />
                              Activada
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={r.hasVariables}
                              onClick={() => handleActivateRemote(syncDialogConfig, r)}
                              className="rounded-lg"
                            >
                              <Plus size={14} weight="bold" className="mr-1" />
                              Activar
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            <div className="p-4 border-t border-border/40 flex justify-end">
              <Button variant="outline" onClick={() => setSyncDialogConfig(null)} className="rounded-xl">
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
