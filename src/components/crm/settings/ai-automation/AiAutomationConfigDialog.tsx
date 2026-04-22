import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import type { AiAutomationConfig, AiIntentMapping, Pipeline } from '@/lib/types'
import { ActivationRangeForm, type ActivationRangeValues } from './ActivationRangeForm'
import { IntentMappingList } from './IntentMappingList'

interface AiAutomationConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  empresaId: string
  pipelines: Pipeline[]
  editingConfig?: AiAutomationConfig | null
  onSaved: (config: AiAutomationConfig) => void
}

const EMPTY_RANGE: ActivationRangeValues = {
  is_active: true,
  activation_date_start: '',
  activation_date_end: '',
  activation_time_start: '',
  activation_time_end: '',
  message_limit: '',
}

export function AiAutomationConfigDialog({
  open,
  onOpenChange,
  empresaId,
  pipelines,
  editingConfig,
  onSaved,
}: AiAutomationConfigDialogProps) {
  const isEditing = !!editingConfig

  const [saving, setSaving] = useState(false)
  const [nombre, setNombre] = useState('')
  const [pipelineId, setPipelineId] = useState<string>('__all__')
  const [range, setRange] = useState<ActivationRangeValues>(EMPTY_RANGE)
  const [mappings, setMappings] = useState<AiIntentMapping[]>([])

  useEffect(() => {
    if (editingConfig) {
      setNombre(editingConfig.nombre)
      setPipelineId(editingConfig.pipeline_id ?? '__all__')
      setRange({
        is_active: editingConfig.is_active,
        activation_date_start: editingConfig.activation_date_start ?? '',
        activation_date_end: editingConfig.activation_date_end ?? '',
        activation_time_start: editingConfig.activation_time_start ?? '',
        activation_time_end: editingConfig.activation_time_end ?? '',
        message_limit: editingConfig.message_limit != null
          ? String(editingConfig.message_limit)
          : '',
      })
      setMappings(editingConfig.intent_mappings ?? [])
    } else {
      setNombre('')
      setPipelineId('__all__')
      setRange(EMPTY_RANGE)
      setMappings([])
    }
  }, [editingConfig, open])

  const validate = (): string | null => {
    if (!nombre.trim()) return 'El nombre de la configuración es obligatorio'
    for (const m of mappings) {
      if (m.action_type === 'move_stage' && !m.action_config.target_stage_id) {
        return 'Selecciona la etapa destino en todas las intenciones de tipo "Mover a etapa"'
      }
      if (m.action_type === 'add_tag' && !m.action_config.tag_name?.trim()) {
        return 'Escribe el nombre del tag en todas las intenciones de tipo "Agregar etiqueta"'
      }
    }
    if (
      range.activation_date_start &&
      range.activation_date_end &&
      range.activation_date_start > range.activation_date_end
    ) {
      return 'La fecha de inicio no puede ser posterior a la fecha de fin'
    }
    if (
      range.activation_time_start &&
      range.activation_time_end &&
      range.activation_time_start >= range.activation_time_end
    ) {
      return 'La hora de inicio debe ser anterior a la hora de fin'
    }
    return null
  }

  const handleSave = async () => {
    const err = validate()
    if (err) {
      toast.error(err)
      return
    }

    setSaving(true)
    try {
      const payload = {
        empresa_id: empresaId,
        nombre: nombre.trim(),
        pipeline_id: pipelineId === '__all__' ? null : pipelineId,
        is_active: range.is_active,
        activation_date_start: range.activation_date_start || null,
        activation_date_end: range.activation_date_end || null,
        activation_time_start: range.activation_time_start || null,
        activation_time_end: range.activation_time_end || null,
        message_limit: range.message_limit ? parseInt(range.message_limit, 10) : null,
        intent_mappings: mappings,
        ...(isEditing && editingConfig ? { id: editingConfig.id } : {}),
      }

      onSaved(payload as AiAutomationConfig)
      toast.success(isEditing ? 'Configuración actualizada' : 'Configuración creada')
      onOpenChange(false)
    } catch (e: any) {
      console.error('[AiAutomationConfigDialog] Save error:', e)
      toast.error(`Error al guardar: ${e.message || 'Error desconocido'}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEditing ? '✏️ Editar automatización IA' : '🤖 Nueva automatización IA'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Define cuándo está activa la IA y qué acciones tomar al detectar intenciones en los mensajes
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">

          {/* Nombre */}
          <div className="space-y-1.5">
            <Label htmlFor="ai-nombre" className="text-sm font-semibold">
              Nombre de la configuración
            </Label>
            <Input
              id="ai-nombre"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Ej: IA de ventas — Turno mañana"
              className="rounded-xl"
            />
          </div>

          {/* Pipeline scope */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">
              Aplicar en pipeline
            </Label>
            <Select value={pipelineId} onValueChange={setPipelineId}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos los pipelines</SelectItem>
                {pipelines.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              La IA solo actuará en oportunidades que pertenezcan al pipeline seleccionado
            </p>
          </div>

          {/* Rango de activación */}
          <ActivationRangeForm values={range} onChange={setRange} />

          {/* Separador */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex-1 h-px bg-border" />
            Mapeo de intenciones
            <div className="flex-1 h-px bg-border" />
          </div>

          <p className="text-xs text-muted-foreground -mt-2">
            La IA analizará cada mensaje y ejecutará la acción cuando detecte una de estas intenciones
          </p>

          {/* Intent mappings */}
          <IntentMappingList
            mappings={mappings}
            pipelines={pipelines}
            onChange={setMappings}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando…' : isEditing ? 'Actualizar' : 'Crear configuración'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
