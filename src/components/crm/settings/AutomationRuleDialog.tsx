import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import {
    createAutomationRule,
    updateAutomationRule,
} from '@/supabase/services/automations'
import type { AutomationRule, AutomationTriggerType, Pipeline } from '@/lib/types'

interface AutomationRuleDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    empresaId: string
    pipelines: Pipeline[]
    editingRule?: AutomationRule | null
    onSaved: (rule: AutomationRule) => void
}

const TRIGGER_OPTIONS: { value: AutomationTriggerType; label: string; description: string }[] = [
    {
        value: 'message_received',
        label: '📨 Recibe un mensaje',
        description: 'Cuando el lead envía un mensaje entrante'
    },
    {
        value: 'tag_added',
        label: '🏷️ Se agrega un tag',
        description: 'Cuando se añade un tag específico al lead'
    },
    {
        value: 'stage_change',
        label: '🔀 Entra a una etapa',
        description: 'Cuando el lead llega a una etapa determinada'
    },
]

function getAllStages(pipelines: Pipeline[]) {
    return pipelines.flatMap(p => p.stages.map(s => ({ ...s, pipelineName: p.name, pipelineId: p.id })))
}

export function AutomationRuleDialog({
    open,
    onOpenChange,
    empresaId,
    pipelines,
    editingRule,
    onSaved,
}: AutomationRuleDialogProps) {
    const isEditing = !!editingRule
    const allStages = getAllStages(pipelines)

    const [saving, setSaving] = useState(false)
    const [nombre, setNombre] = useState('')
    const [enabled, setEnabled] = useState(true)
    const [triggerType, setTriggerType] = useState<AutomationTriggerType>('message_received')

    // Trigger config fields
    const [fromStageId, setFromStageId] = useState<string>('__any__')
    const [tagName, setTagName] = useState('')

    // Action config fields
    const [targetStageId, setTargetStageId] = useState('')

    // Populate form when editing
    useEffect(() => {
        if (editingRule) {
            setNombre(editingRule.nombre)
            setEnabled(editingRule.enabled)
            setTriggerType(editingRule.trigger_type)
            const cfg = editingRule.trigger_config as any
            setFromStageId(cfg?.from_stage_id || cfg?.stage_id || '__any__')
            setTagName(cfg?.tag_name || '')
            setTargetStageId(editingRule.action_config.target_stage_id || '')
        } else {
            setNombre('')
            setEnabled(true)
            setTriggerType('message_received')
            setFromStageId('__any__')
            setTagName('')
            setTargetStageId('')
        }
    }, [editingRule, open])

    const buildTriggerConfig = (): Record<string, any> => {
        const stageId = fromStageId === '__any__' ? null : fromStageId
        switch (triggerType) {
            case 'message_received':
                return { from_stage_id: stageId }
            case 'tag_added':
                return { tag_name: tagName.trim(), from_stage_id: stageId }
            case 'stage_change':
                return { from_stage_id: fromStageId === '__any__' ? null : fromStageId }
            case 'time_in_stage':
                return { stage_id: fromStageId, days: 7 }
            default:
                return {}
        }
    }

    const validate = (): string | null => {
        if (!nombre.trim()) return 'El nombre es obligatorio'
        if (triggerType === 'tag_added' && !tagName.trim()) return 'Escribe el nombre del tag que disparará la regla'
        if (!targetStageId) return 'Selecciona la etapa de destino'
        if (triggerType === 'stage_change' && fromStageId === '__any__') return 'Selecciona la etapa que dispara el cambio'
        return null
    }

    const handleSave = async () => {
        const error = validate()
        if (error) {
            toast.error(error)
            return
        }

        setSaving(true)
        try {
            const payload = {
                empresa_id: empresaId,
                nombre: nombre.trim(),
                enabled,
                trigger_type: triggerType,
                trigger_config: buildTriggerConfig(),
                action_type: 'move_stage' as const,
                action_config: {
                    target_stage_id: targetStageId,
                    target_pipeline_id: null
                },
            }

            let saved: AutomationRule
            if (isEditing && editingRule) {
                saved = await updateAutomationRule(editingRule.id, payload)
                toast.success('Regla actualizada')
            } else {
                saved = await createAutomationRule(payload)
                toast.success('Regla creada')
            }

            onSaved(saved)
        } catch (e: any) {
            console.error('[AutomationRuleDialog] Save error:', e)
            toast.error(`Error al guardar: ${e.message || 'Error desconocido'}`)
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {isEditing ? '✏️ Editar regla' : '⚡ Nueva regla de automatización'}
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        Define cuándo y cómo se mueve automáticamente una oportunidad
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-2">

                    {/* Nombre */}
                    <div className="space-y-1.5">
                        <Label htmlFor="auto-nombre">Nombre de la regla</Label>
                        <Input
                            id="auto-nombre"
                            value={nombre}
                            onChange={e => setNombre(e.target.value)}
                            placeholder="Ej: Mover a contactado al recibir mensaje"
                        />
                    </div>

                    {/* Trigger */}
                    <div className="space-y-1.5">
                        <Label>Cuando ocurra…</Label>
                        <Select value={triggerType} onValueChange={v => setTriggerType(v as AutomationTriggerType)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {TRIGGER_OPTIONS.map(opt => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                        <div>
                                            <div className="font-medium">{opt.label}</div>
                                            <div className="text-xs text-muted-foreground">{opt.description}</div>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Condición: tag name (solo para tag_added) */}
                    {triggerType === 'tag_added' && (
                        <div className="space-y-1.5">
                            <Label htmlFor="auto-tag">Tag que dispara la regla</Label>
                            <Input
                                id="auto-tag"
                                value={tagName}
                                onChange={e => setTagName(e.target.value)}
                                placeholder="Ej: interesado"
                            />
                            <p className="text-xs text-muted-foreground">Debe coincidir exactamente con el nombre del tag</p>
                        </div>
                    )}

                    {/* Condición: etapa origen */}
                    <div className="space-y-1.5">
                        <Label>
                            {triggerType === 'stage_change'
                                ? 'Al entrar a la etapa…'
                                : 'Solo si el lead está en… (opcional)'}
                        </Label>
                        <Select value={fromStageId} onValueChange={setFromStageId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Cualquier etapa" />
                            </SelectTrigger>
                            <SelectContent>
                                {triggerType !== 'stage_change' && (
                                    <SelectItem value="__any__">Cualquier etapa</SelectItem>
                                )}
                                {allStages.map(s => (
                                    <SelectItem key={s.id} value={s.id}>
                                        <span className="text-xs text-muted-foreground mr-2">{s.pipelineName} ›</span>
                                        {s.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Separador visual */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <div className="flex-1 h-px bg-border" />
                        entonces…
                        <div className="flex-1 h-px bg-border" />
                    </div>

                    {/* Acción: etapa destino */}
                    <div className="space-y-1.5">
                        <Label>Mover a la etapa…</Label>
                        <Select value={targetStageId} onValueChange={setTargetStageId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecciona una etapa" />
                            </SelectTrigger>
                            <SelectContent>
                                {allStages.map(s => (
                                    <SelectItem key={s.id} value={s.id}>
                                        <span className="text-xs text-muted-foreground mr-2">{s.pipelineName} ›</span>
                                        {s.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Active toggle */}
                    <div className="flex items-center gap-3 pt-1">
                        <Switch id="auto-enabled" checked={enabled} onCheckedChange={setEnabled} />
                        <Label htmlFor="auto-enabled" className="cursor-pointer">
                            {enabled ? 'Regla activa' : 'Regla desactivada'}
                        </Label>
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? 'Guardando…' : (isEditing ? 'Actualizar' : 'Crear regla')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
