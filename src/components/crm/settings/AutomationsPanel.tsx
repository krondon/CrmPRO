import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Trash, Plus, Lightning, Tag, ArrowRight, Clock, ChatText, PencilSimple } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
    getAutomationRules,
    deleteAutomationRule,
    toggleAutomationRule,
} from '@/supabase/services/automations'
import type { AutomationRule, AutomationTriggerType, Pipeline } from '@/lib/types'
import { AutomationRuleDialog } from './AutomationRuleDialog'

interface AutomationsPanelProps {
    empresaId: string
    pipelines: Pipeline[]
}

const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
    message_received: 'Recibe un mensaje',
    tag_added: 'Se agrega un tag',
    stage_change: 'Entra a una etapa',
    time_in_stage: 'Días sin actividad',
}

const TRIGGER_ICONS: Record<AutomationTriggerType, React.ElementType> = {
    message_received: ChatText,
    tag_added: Tag,
    stage_change: ArrowRight,
    time_in_stage: Clock,
}

function getStageNameById(pipelines: Pipeline[], stageId?: string | null): string {
    if (!stageId) return 'Cualquier etapa'
    for (const p of pipelines) {
        const s = p.stages.find(st => st.id === stageId)
        if (s) return s.name
    }
    return stageId.slice(0, 8) + '...'
}

function getTriggerSummary(rule: AutomationRule, pipelines: Pipeline[]): string {
    const cfg = rule.trigger_config as any
    switch (rule.trigger_type) {
        case 'message_received': {
            const stage = getStageNameById(pipelines, cfg?.from_stage_id)
            return cfg?.from_stage_id ? `Si está en "${stage}"` : 'En cualquier etapa'
        }
        case 'tag_added': {
            const tag = cfg?.tag_name || '(cualquiera)'
            const stage = cfg?.from_stage_id ? ` en "${getStageNameById(pipelines, cfg.from_stage_id)}"` : ''
            return `Tag: "${tag}"${stage}`
        }
        case 'stage_change': {
            const stage = getStageNameById(pipelines, cfg?.from_stage_id)
            return `Al entrar a "${stage}"`
        }
        case 'time_in_stage': {
            const stage = getStageNameById(pipelines, cfg?.stage_id)
            return `${cfg?.days || '?'} días en "${stage}"`
        }
        default:
            return 'Condición configurada'
    }
}

function getActionSummary(rule: AutomationRule, pipelines: Pipeline[]): string {
    const { target_stage_id } = rule.action_config
    const stageName = getStageNameById(pipelines, target_stage_id)
    return `→ Mover a "${stageName}"`
}

export function AutomationsPanel({ empresaId, pipelines }: AutomationsPanelProps) {
    const [rules, setRules] = useState<AutomationRule[]>([])
    const [loading, setLoading] = useState(true)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingRule, setEditingRule] = useState<AutomationRule | null>(null)

    const loadRules = useCallback(async () => {
        if (!empresaId) return
        setLoading(true)
        try {
            const data = await getAutomationRules(empresaId)
            setRules(data)
        } catch (e) {
            console.error('[AutomationsPanel] Error loading rules:', e)
            toast.error('Error al cargar reglas de automatización')
        } finally {
            setLoading(false)
        }
    }, [empresaId])

    useEffect(() => { loadRules() }, [loadRules])

    const handleToggle = async (rule: AutomationRule) => {
        try {
            await toggleAutomationRule(rule.id, !rule.enabled)
            setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r))
            toast.success(rule.enabled ? 'Regla desactivada' : 'Regla activada')
        } catch (e) {
            toast.error('Error cambiando estado de la regla')
        }
    }

    const handleDelete = async (ruleId: string) => {
        if (!confirm('¿Eliminar esta regla de automatización?')) return
        try {
            await deleteAutomationRule(ruleId)
            setRules(prev => prev.filter(r => r.id !== ruleId))
            toast.success('Regla eliminada')
        } catch (e) {
            toast.error('Error eliminando la regla')
        }
    }

    const handleOpenCreate = () => {
        setEditingRule(null)
        setDialogOpen(true)
    }

    const handleOpenEdit = (rule: AutomationRule) => {
        setEditingRule(rule)
        setDialogOpen(true)
    }

    const handleSaved = (rule: AutomationRule) => {
        setRules(prev => {
            const exists = prev.find(r => r.id === rule.id)
            if (exists) return prev.map(r => r.id === rule.id ? rule : r)
            return [...prev, rule]
        })
        setDialogOpen(false)
        setEditingRule(null)
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                        <Lightning size={18} className="text-primary" weight="fill" />
                        Automatizaciones
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Mueve oportunidades automáticamente cuando ocurre un evento
                    </p>
                </div>
                <Button size="sm" onClick={handleOpenCreate} className="gap-1.5">
                    <Plus size={16} weight="bold" />
                    Nueva regla
                </Button>
            </div>

            {loading && (
                <div className="text-sm text-muted-foreground py-8 text-center animate-pulse">
                    Cargando reglas…
                </div>
            )}

            {!loading && rules.length === 0 && (
                <div className="border border-dashed border-border rounded-xl p-8 text-center text-muted-foreground">
                    <Lightning size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">Sin reglas configuradas</p>
                    <p className="text-xs mt-1">Crea tu primera regla de automatización</p>
                </div>
            )}

            <div className="space-y-2">
                {rules.map(rule => {
                    const TriggerIcon = TRIGGER_ICONS[rule.trigger_type] || Lightning
                    return (
                        <div
                            key={rule.id}
                            className={`border rounded-xl p-4 transition-all ${rule.enabled
                                ? 'border-border bg-card'
                                : 'border-border/40 bg-muted/20 opacity-60'
                                }`}
                        >
                            <div className="flex items-start gap-3">
                                {/* Icon */}
                                <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${rule.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                    <TriggerIcon size={18} weight="fill" />
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold text-sm text-foreground truncate">{rule.nombre}</span>
                                        <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider shrink-0">
                                            {TRIGGER_LABELS[rule.trigger_type] || rule.trigger_type}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {getTriggerSummary(rule, pipelines)}
                                        {' · '}
                                        <span className="text-primary font-medium">{getActionSummary(rule, pipelines)}</span>
                                    </p>
                                </div>

                                {/* Controls */}
                                <div className="flex items-center gap-2 shrink-0">
                                    <Switch
                                        checked={rule.enabled}
                                        onCheckedChange={() => handleToggle(rule)}
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                        onClick={() => handleOpenEdit(rule)}
                                    >
                                        <PencilSimple size={15} />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                        onClick={() => handleDelete(rule.id)}
                                    >
                                        <Trash size={15} />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            <AutomationRuleDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                empresaId={empresaId}
                pipelines={pipelines}
                editingRule={editingRule}
                onSaved={handleSaved}
            />
        </div>
    )
}
