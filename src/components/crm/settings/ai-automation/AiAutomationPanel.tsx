import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { RobotIcon, ClockIcon, ChatDotsIcon, KeyIcon, EyeIcon, EyeSlashIcon, BrainIcon, CaretUpDownIcon, CheckIcon } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useAiAutomation } from '@/hooks/useAiAutomation'
import type { Pipeline } from '@/lib/types'

interface AiAutomationPanelProps {
  empresaId: string
  pipelines: Pipeline[]
}

const AI_MODELS = [
  {
    group: 'Anthropic — API directa (sk-ant-...)',
    models: [
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 · Rápido y económico' },
      { id: 'claude-sonnet-4-6',          label: 'Claude Sonnet 4.6 · Equilibrado' },
      { id: 'claude-opus-4-7',            label: 'Claude Opus 4.7 · Más potente' },
    ],
  },
  {
    group: 'OpenAI — API directa (sk-...)',
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini · Rápido y económico' },
      { id: 'gpt-4o',      label: 'GPT-4o · Equilibrado' },
      { id: 'o1-mini',     label: 'o1 Mini · Razonamiento' },
      { id: 'o3-mini',     label: 'o3 Mini · Razonamiento avanzado' },
    ],
  },
  {
    group: 'OpenRouter — Anthropic (sk-or-...)',
    models: [
      { id: 'anthropic/claude-3-haiku',    label: 'Claude 3 Haiku · Muy rápido' },
      { id: 'anthropic/claude-3.5-haiku',  label: 'Claude 3.5 Haiku · Rápido' },
      { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
      { id: 'anthropic/claude-haiku-4-5',  label: 'Claude Haiku 4.5' },
      { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
      { id: 'anthropic/claude-opus-4.6',   label: 'Claude Opus 4.6' },
      { id: 'anthropic/claude-opus-4.7',   label: 'Claude Opus 4.7 · Más potente' },
    ],
  },
  {
    group: 'OpenRouter — OpenAI (sk-or-...)',
    models: [
      { id: 'openai/gpt-4o-mini',  label: 'GPT-4o Mini · Económico' },
      { id: 'openai/gpt-4o',       label: 'GPT-4o' },
      { id: 'openai/o1-mini',      label: 'o1 Mini · Razonamiento' },
      { id: 'openai/o3-mini',      label: 'o3 Mini · Razonamiento' },
      { id: 'openai/o4-mini',      label: 'o4 Mini · Razonamiento avanzado' },
      { id: 'openai/gpt-5.4-mini', label: 'GPT-5.4 Mini · Rápido' },
      { id: 'openai/gpt-5.4',      label: 'GPT-5.4 · Potente' },
    ],
  },
  {
    group: 'OpenRouter — Google (sk-or-...)',
    models: [
      { id: 'google/gemini-flash-1.5-8b',          label: 'Gemini 1.5 Flash 8B · Muy económico' },
      { id: 'google/gemini-1.5-flash',              label: 'Gemini 1.5 Flash · Muy rápido' },
      { id: 'google/gemini-1.5-pro',                label: 'Gemini 1.5 Pro' },
      { id: 'google/gemini-2.0-flash-001',          label: 'Gemini 2.0 Flash' },
      { id: 'google/gemini-2.5-flash-preview',      label: 'Gemini 2.5 Flash Preview · Rápido' },
      { id: 'google/gemini-2.5-pro-preview',        label: 'Gemini 2.5 Pro Preview' },
      { id: 'google/gemini-3-flash-preview',        label: 'Gemini 3 Flash Preview' },
      { id: 'google/gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite Preview' },
      { id: 'google/gemini-3.1-pro-preview',        label: 'Gemini 3.1 Pro Preview' },
    ],
  },
  {
    group: 'OpenRouter — Meta (sk-or-...)',
    models: [
      { id: 'meta-llama/llama-3.2-3b-instruct',   label: 'Llama 3.2 3B · Muy rápido' },
      { id: 'meta-llama/llama-3.1-8b-instruct',   label: 'Llama 3.1 8B · Rápido' },
      { id: 'meta-llama/llama-3.1-70b-instruct',  label: 'Llama 3.1 70B' },
      { id: 'meta-llama/llama-3.3-70b-instruct',  label: 'Llama 3.3 70B' },
      { id: 'meta-llama/llama-4-scout',            label: 'Llama 4 Scout · Multimodal' },
      { id: 'meta-llama/llama-4-maverick',         label: 'Llama 4 Maverick · Potente' },
    ],
  },
  {
    group: 'OpenRouter — Mistral (sk-or-...)',
    models: [
      { id: 'mistralai/mistral-7b-instruct',       label: 'Mistral 7B · Muy rápido' },
      { id: 'mistralai/mistral-nemo',              label: 'Mistral Nemo 12B' },
      { id: 'mistralai/mistral-small',             label: 'Mistral Small' },
      { id: 'mistralai/mistral-small-2603',        label: 'Mistral Small 4' },
      { id: 'mistralai/mixtral-8x7b-instruct',     label: 'Mixtral 8x7B' },
      { id: 'mistralai/mistral-large',             label: 'Mistral Large' },
      { id: 'mistralai/mistral-medium-3',          label: 'Mistral Medium 3' },
    ],
  },
  {
    group: 'OpenRouter — DeepSeek (sk-or-...)',
    models: [
      { id: 'deepseek/deepseek-chat',                  label: 'DeepSeek Chat V3' },
      { id: 'deepseek/deepseek-r1-distill-qwen-32b',   label: 'DeepSeek R1 Distill Qwen 32B' },
      { id: 'deepseek/deepseek-r1-distill-llama-70b',  label: 'DeepSeek R1 Distill Llama 70B' },
      { id: 'deepseek/deepseek-r1',                    label: 'DeepSeek R1 · Razonamiento' },
    ],
  },
  {
    group: 'OpenRouter — Qwen (sk-or-...)',
    models: [
      { id: 'qwen/qwen-2.5-7b-instruct',  label: 'Qwen 2.5 7B · Muy rápido' },
      { id: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen 2.5 72B' },
      { id: 'qwen/qwq-32b',               label: 'QwQ 32B · Razonamiento' },
      { id: 'qwen/qwen3.5-27b',           label: 'Qwen 3.5 27B' },
      { id: 'qwen/qwen3.6-plus',          label: 'Qwen 3.6 Plus' },
    ],
  },
  {
    group: 'OpenRouter — X.AI / Cohere (sk-or-...)',
    models: [
      { id: 'x-ai/grok-3-mini-beta', label: 'Grok 3 Mini' },
      { id: 'x-ai/grok-3-beta',      label: 'Grok 3' },
      { id: 'x-ai/grok-4.20',        label: 'Grok 4' },
      { id: 'cohere/command-r-plus',  label: 'Command R+' },
    ],
  },
]

const SANDBOX_PLACEHOLDER = `Eres el asistente de IA del CRM. Analiza el mensaje del cliente y decide qué acción tomar.

Ejemplos para este negocio:
- Si el cliente confirma un pago → mover a etapa #3
- Si el cliente cancela → mover a etapa #5
- Si el cliente tiene una queja urgente → notificar al equipo`

export function AiAutomationPanel({ empresaId }: AiAutomationPanelProps) {
  const { configs, isLoading, save, toggle } = useAiAutomation(empresaId)

  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)

  const [isActive, setIsActive] = useState(false)
  const [timeStart, setTimeStart] = useState('')
  const [timeEnd, setTimeEnd] = useState('')
  const [messageLimit, setMessageLimit] = useState('')
  const [sandboxPrompt, setSandboxPrompt] = useState('')
  const [aiApiKey, setAiApiKey] = useState('')
  const [aiModel, setAiModel] = useState('')

  const existing = configs[0] ?? null

  useEffect(() => {
    if (existing) {
      setIsActive(existing.is_active)
      setTimeStart(existing.activation_time_start ?? '')
      setTimeEnd(existing.activation_time_end ?? '')
      setMessageLimit(existing.message_limit != null ? String(existing.message_limit) : '')
      setSandboxPrompt(existing.sandbox_prompt ?? '')
      setAiApiKey(existing.ai_api_key ?? '')
      setAiModel(existing.ai_model ?? '')
    }
  }, [existing])

  const handleSave = async () => {
    if (!sandboxPrompt.trim()) {
      toast.error('El prompt del sandbox es obligatorio')
      return
    }
    if (!aiApiKey.trim()) {
      toast.error('El API Key es obligatorio')
      return
    }
    if (!aiModel) {
      toast.error('Selecciona un modelo de IA')
      return
    }
    if (timeStart && timeEnd && timeStart >= timeEnd) {
      toast.error('La hora de inicio debe ser anterior a la hora de fin')
      return
    }

    setSaving(true)
    try {
      await save({
        ...(existing ? { id: existing.id } : {}),
        empresa_id: empresaId,
        nombre: 'Configuración IA',
        is_active: isActive,
        activation_time_start: timeStart || null,
        activation_time_end: timeEnd || null,
        message_limit: messageLimit ? parseInt(messageLimit, 10) : null,
        sandbox_prompt: sandboxPrompt.trim(),
        ai_api_key: aiApiKey.trim(),
        ai_model: aiModel,
      })
      toast.success('Configuración guardada')
    } catch (e: any) {
      toast.error(`Error al guardar: ${e.message || 'Error desconocido'}`)
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground py-12 text-center animate-pulse">
        Cargando configuración…
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <RobotIcon size={20} weight="duotone" className="text-violet-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Automatización con IA</h2>
            <p className="text-xs text-muted-foreground">
              La IA analiza cada mensaje entrante y ejecuta acciones automáticamente
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">
            {toggling ? 'Guardando…' : isActive ? 'Activa' : 'Inactiva'}
          </span>
          <Switch
            checked={isActive}
            disabled={toggling || !existing}
            onCheckedChange={async (val) => {
              if (!existing) return
              setToggling(true)
              try {
                await toggle(existing.id, val)
                setIsActive(val)
              } catch {
                toast.error('Error al cambiar el estado')
              } finally {
                setToggling(false)
              }
            }}
          />
        </div>
      </div>

      <Card className="border-none shadow-sm rounded-2xl">
        <CardContent className="pt-6 space-y-5">

          {/* Horario de activación */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <ClockIcon size={12} />
              Horario de activación
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ai-time-start" className="text-sm font-medium">Hora inicio</Label>
                <Input
                  id="ai-time-start"
                  type="time"
                  value={timeStart}
                  onChange={e => setTimeStart(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-time-end" className="text-sm font-medium">Hora fin</Label>
                <Input
                  id="ai-time-end"
                  type="time"
                  value={timeEnd}
                  onChange={e => setTimeEnd(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Deja vacío para que la IA esté activa las 24 horas
            </p>
          </div>

          {/* Límite de mensajes */}
          <div className="space-y-1.5">
            <Label htmlFor="ai-limit" className="text-sm font-medium flex items-center gap-1.5">
              <ChatDotsIcon size={14} className="text-muted-foreground" />
              Límite de mensajes por día
            </Label>
            <Input
              id="ai-limit"
              type="number"
              min="1"
              max="10000"
              placeholder="Sin límite"
              value={messageLimit}
              onChange={e => setMessageLimit(e.target.value)}
              className="rounded-xl max-w-[200px]"
            />
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <Label htmlFor="ai-key" className="text-sm font-medium flex items-center gap-1.5">
              <KeyIcon size={14} className="text-muted-foreground" />
              API Key
            </Label>
            <div className="relative">
              <Input
                id="ai-key"
                type={showKey ? 'text' : 'password'}
                placeholder="sk-ant-...  /  sk-or-...  /  sk-..."
                value={aiApiKey}
                onChange={e => setAiApiKey(e.target.value)}
                className="rounded-xl pr-10 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showKey ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Anthropic (<code className="font-mono">sk-ant-</code>), OpenAI (<code className="font-mono">sk-</code>) o OpenRouter (<code className="font-mono">sk-or-</code>)
            </p>
          </div>

          {/* Modelo */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <BrainIcon size={14} className="text-muted-foreground" />
              Modelo de IA
            </Label>
            <Popover open={modelOpen} onOpenChange={setModelOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={modelOpen}
                  className="w-full justify-between rounded-xl font-normal"
                >
                  <span className="truncate">
                    {aiModel
                      ? AI_MODELS.flatMap(g => g.models).find(m => m.id === aiModel)?.label ?? aiModel
                      : 'Selecciona un modelo…'}
                  </span>
                  <CaretUpDownIcon size={14} className="ml-2 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar modelo…" />
                  <CommandList className="max-h-72">
                    <CommandEmpty>No se encontró ningún modelo.</CommandEmpty>
                    {AI_MODELS.map(group => (
                      <CommandGroup key={group.group} heading={group.group}>
                        {group.models.map(m => (
                          <CommandItem
                            key={m.id}
                            value={`${m.label} ${m.id}`}
                            onSelect={() => {
                              setAiModel(m.id)
                              setModelOpen(false)
                            }}
                            className="text-sm"
                          >
                            <CheckIcon
                              size={14}
                              className={`mr-2 shrink-0 ${aiModel === m.id ? 'opacity-100' : 'opacity-0'}`}
                            />
                            {m.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {aiModel && (
              <p className="text-xs text-muted-foreground font-mono">{aiModel}</p>
            )}
          </div>

          {/* Sandbox prompt */}
          <div className="space-y-1.5">
            <Label htmlFor="ai-sandbox" className="text-sm font-medium">
              Prompt / Sandbox
            </Label>
            <Textarea
              id="ai-sandbox"
              rows={10}
              placeholder={SANDBOX_PLACEHOLDER}
              value={sandboxPrompt}
              onChange={e => setSandboxPrompt(e.target.value)}
              className="rounded-xl text-sm font-mono resize-none leading-relaxed"
            />
            <p className="text-xs text-muted-foreground">
              Instrucciones para la IA. Define qué detectar y qué acción tomar en cada caso.
            </p>
          </div>

          {/* Save */}
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl shadow-sm gap-2 min-w-[140px]"
            >
              <RobotIcon size={15} weight="fill" />
              {saving ? 'Guardando…' : existing ? 'Guardar cambios' : 'Activar IA'}
            </Button>
          </div>

        </CardContent>
      </Card>
    </div>
  )
}
