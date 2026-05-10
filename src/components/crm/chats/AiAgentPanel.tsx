import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sparkle, X, Spinner, ArrowRight, Check } from '@phosphor-icons/react'
import { supabase } from '@/supabase/client'
import { updateLead } from '@/supabase/services/leads'
import { toast } from 'sonner'
import type { Lead } from '@/lib/types'

const AI_AGENT_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hubmy-ai-agent`

interface AgentResponse {
  type: 'suggest_reply' | 'move_stage' | 'set_priority' | 'assign_user' | 'count_leads'
  reply?: string
  stage_id?: string
  stage_name?: string
  priority?: string
  user_id?: string
  user_name?: string
  count?: number
  summary: string
}

interface AiAgentPanelProps {
  lead: Lead
  companyId: string
  onClose: () => void
  onApplySuggestion: (text: string) => void
  onLeadUpdated: () => void
}

const QUICK_ACTIONS = [
  { label: 'Sugerir respuesta', query: undefined },
  { label: 'Siguiente etapa', query: 'mueve este lead a la siguiente etapa del pipeline' },
  { label: 'Alta prioridad', query: 'pon este lead en prioridad alta' },
  { label: 'Leads sin actividad', query: '¿cuántos leads llevan más de 7 días sin actividad?' },
]

export function AiAgentPanel({ lead, companyId, onClose, onApplySuggestion, onLeadUpdated }: AiAgentPanelProps) {
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [response, setResponse] = useState<AgentResponse | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)

  const callAgent = async (q?: string) => {
    setIsLoading(true)
    setResponse(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sin sesión')

      const res = await fetch(AI_AGENT_FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ lead_id: lead.id, empresa_id: companyId, query: q || undefined }),
      })
      const json = await res.json()

      if (!res.ok || json.error) {
        const msg: string = json.error || ''
        if (msg.includes('suscripci') || msg.includes('Hubmy')) {
          toast('✨ Función exclusiva de Hubmy', {
            description: 'Suscríbete a Hubmy para desbloquear el agente IA en tu CRM.',
            action: { label: 'Ir a Hubmy', onClick: () => window.open('https://hubmy.app', '_blank') },
            duration: 6000,
          })
          onClose()
          return
        }
        throw new Error(msg || 'Error al contactar el agente')
      }

      setResponse(json)
    } catch (e: any) {
      toast.error(e.message || 'Error al contactar el agente IA')
    } finally {
      setIsLoading(false)
    }
  }

  const executeAction = async () => {
    if (!response) return
    setIsExecuting(true)
    try {
      if (response.type === 'move_stage' && response.stage_id) {
        await updateLead(lead.id, { etapa_id: response.stage_id, stage_entered_at: new Date().toISOString() })
        toast.success(`Lead movido a "${response.stage_name}"`)
        onLeadUpdated()
      } else if (response.type === 'set_priority' && response.priority) {
        await updateLead(lead.id, { prioridad: response.priority as any })
        toast.success(`Prioridad cambiada a ${response.priority}`)
        onLeadUpdated()
      } else if (response.type === 'assign_user' && response.user_id) {
        await updateLead(lead.id, { asignado_a: response.user_id })
        toast.success(`Lead asignado a ${response.user_name}`)
        onLeadUpdated()
      }
      setResponse(null)
      setQuery('')
    } catch (e: any) {
      toast.error(e.message || 'Error al ejecutar la acción')
    } finally {
      setIsExecuting(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    callAgent(query.trim() || undefined)
  }

  return (
    <div className="border-t border-violet-100 dark:border-violet-900/50 bg-violet-50/60 dark:bg-violet-950/20 px-4 pt-3 pb-2 space-y-3 animate-in slide-in-from-bottom-2 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-violet-600 dark:text-violet-400">
          <Sparkle className="w-4 h-4" weight="fill" />
          <span className="text-xs font-semibold uppercase tracking-wider">Agente IA</span>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ej: mueve a Ganado, asigna a Juan, ¿leads sin actividad?"
          className="text-sm h-9 bg-white dark:bg-background border-violet-200 dark:border-violet-800 focus-visible:ring-violet-400"
          disabled={isLoading}
          autoFocus
        />
        <Button
          type="submit"
          size="sm"
          className="h-9 shrink-0 bg-violet-600 hover:bg-violet-700 text-white px-3"
          disabled={isLoading}
        >
          {isLoading
            ? <Spinner className="w-4 h-4 animate-spin" />
            : <ArrowRight className="w-4 h-4" />
          }
        </Button>
      </form>

      {/* Quick actions (shown when no response) */}
      {!response && !isLoading && (
        <div className="flex gap-1.5 flex-wrap">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.label}
              onClick={() => callAgent(a.query)}
              className="text-xs px-2.5 py-1 rounded-full border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
          <Spinner className="w-3.5 h-3.5 animate-spin text-violet-500" />
          <span>El agente está analizando...</span>
        </div>
      )}

      {/* Response */}
      {response && (
        <div className="bg-white dark:bg-background rounded-xl border border-violet-100 dark:border-violet-900 p-3 space-y-2.5">
          <p className="text-sm text-muted-foreground leading-relaxed">{response.summary}</p>

          {/* Suggested reply */}
          {response.type === 'suggest_reply' && response.reply && (
            <div className="space-y-2">
              <p className="text-sm bg-muted/50 rounded-lg px-3 py-2.5 text-foreground italic leading-relaxed">
                "{response.reply}"
              </p>
              <Button
                size="sm"
                className="h-8 bg-violet-600 hover:bg-violet-700 text-white text-xs"
                onClick={() => { onApplySuggestion(response.reply!); setResponse(null); setQuery('') }}
              >
                <Check className="w-3.5 h-3.5 mr-1" /> Usar respuesta
              </Button>
            </div>
          )}

          {/* Count result */}
          {response.type === 'count_leads' && (
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold text-violet-600">{response.count}</span>
              <span className="text-sm text-muted-foreground">leads</span>
            </div>
          )}

          {/* Action confirmation */}
          {['move_stage', 'set_priority', 'assign_user'].includes(response.type) && (
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-8 bg-violet-600 hover:bg-violet-700 text-white text-xs"
                onClick={executeAction}
                disabled={isExecuting}
              >
                {isExecuting
                  ? <Spinner className="w-3.5 h-3.5 animate-spin mr-1" />
                  : <Check className="w-3.5 h-3.5 mr-1" />
                }
                Confirmar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => setResponse(null)}
              >
                Cancelar
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
