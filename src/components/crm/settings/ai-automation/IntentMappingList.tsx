import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Trash, Plus, ArrowRight } from '@phosphor-icons/react'
import type { AiIntentMapping, Pipeline } from '@/lib/types'
import { AI_INTENTS, AI_ACTION_TYPES, getIntentMeta } from './aiAutomationConstants'

interface IntentMappingListProps {
  mappings: AiIntentMapping[]
  pipelines: Pipeline[]
  onChange: (next: AiIntentMapping[]) => void
}

function getAllStages(pipelines: Pipeline[]) {
  return pipelines.flatMap(p =>
    p.stages.map(s => ({ ...s, pipelineName: p.name }))
  )
}

export function IntentMappingList({ mappings, pipelines, onChange }: IntentMappingListProps) {
  const allStages = getAllStages(pipelines)

  const addMapping = () => {
    const newMapping: AiIntentMapping = {
      id: crypto.randomUUID(),
      intent: AI_INTENTS[0].value,
      action_type: 'move_stage',
      action_config: {},
      enabled: true,
    }
    onChange([...mappings, newMapping])
  }

  const updateMapping = (id: string, patch: Partial<AiIntentMapping>) => {
    onChange(mappings.map(m => m.id === id ? { ...m, ...patch } : m))
  }

  const removeMapping = (id: string) => {
    onChange(mappings.filter(m => m.id !== id))
  }

  return (
    <div className="space-y-3">
      {mappings.length === 0 && (
        <div className="border border-dashed border-border rounded-xl p-6 text-center text-muted-foreground">
          <p className="text-sm font-medium">Sin intenciones mapeadas</p>
          <p className="text-xs mt-1">Agrega una para que la IA tome acciones automáticas</p>
        </div>
      )}

      {mappings.map((mapping, index) => {
        const meta = getIntentMeta(mapping.intent)
        return (
          <div
            key={mapping.id}
            className={`border rounded-xl p-3 transition-all space-y-3 ${
              mapping.enabled
                ? 'border-border bg-card'
                : 'border-border/40 bg-muted/20 opacity-60'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground w-5 text-center shrink-0">
                {index + 1}
              </span>
              <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                {/* Intent selector */}
                <Select
                  value={mapping.intent}
                  onValueChange={v => updateMapping(mapping.id, { intent: v, action_config: {} })}
                >
                  <SelectTrigger className="rounded-lg text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_INTENTS.map(intent => (
                      <SelectItem key={intent.value} value={intent.value}>
                        <span className="mr-1.5">{intent.emoji}</span>
                        {intent.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <ArrowRight size={14} className="text-muted-foreground shrink-0" />

                {/* Action type selector */}
                <Select
                  value={mapping.action_type}
                  onValueChange={v =>
                    updateMapping(mapping.id, {
                      action_type: v as AiIntentMapping['action_type'],
                      action_config: {},
                    })
                  }
                >
                  <SelectTrigger className="rounded-lg text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_ACTION_TYPES.map(action => (
                      <SelectItem key={action.value} value={action.value}>
                        {action.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Switch
                checked={mapping.enabled}
                onCheckedChange={v => updateMapping(mapping.id, { enabled: v })}
                className="shrink-0"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => removeMapping(mapping.id)}
              >
                <Trash size={13} />
              </Button>
            </div>

            {/* Action config — context-aware */}
            {mapping.action_type === 'move_stage' && (
              <div className="pl-7">
                <Select
                  value={mapping.action_config.target_stage_id ?? ''}
                  onValueChange={v =>
                    updateMapping(mapping.id, {
                      action_config: { target_stage_id: v },
                    })
                  }
                >
                  <SelectTrigger className="rounded-lg text-xs h-8 w-full">
                    <SelectValue placeholder="Selecciona la etapa destino…" />
                  </SelectTrigger>
                  <SelectContent>
                    {allStages.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="text-xs text-muted-foreground mr-2">
                          {s.pipelineName} ›
                        </span>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {mapping.action_type === 'add_tag' && (
              <div className="pl-7">
                <Input
                  placeholder="Nombre del tag a agregar…"
                  value={mapping.action_config.tag_name ?? ''}
                  onChange={e =>
                    updateMapping(mapping.id, {
                      action_config: { tag_name: e.target.value },
                    })
                  }
                  className="rounded-lg text-xs h-8"
                />
              </div>
            )}

            {mapping.action_type === 'notify_team' && (
              <div className="pl-7">
                <Input
                  placeholder="Mensaje de alerta para el equipo…"
                  value={mapping.action_config.message ?? ''}
                  onChange={e =>
                    updateMapping(mapping.id, {
                      action_config: { message: e.target.value },
                    })
                  }
                  className="rounded-lg text-xs h-8"
                />
              </div>
            )}

            <div className="pl-7 flex items-center gap-2">
              <Badge
                variant="outline"
                className="text-[10px] uppercase font-bold tracking-wider rounded-md"
              >
                {meta.emoji} {meta.label}
              </Badge>
            </div>
          </div>
        )
      })}

      <Button
        variant="outline"
        size="sm"
        className="w-full rounded-xl border-dashed gap-1.5 text-xs"
        onClick={addMapping}
      >
        <Plus size={14} weight="bold" />
        Agregar intención
      </Button>
    </div>
  )
}
