import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { supabase } from '@/supabase/client'
import { toast } from 'sonner'
import { Spinner } from '@phosphor-icons/react'

interface Template {
  name: string
  icon: string
  stages: { name: string; color: string }[]
}

const TEMPLATES: Template[] = [
  {
    name: 'Ventas',
    icon: '💼',
    stages: [
      { name: 'Nuevo contacto', color: '#6366f1' },
      { name: 'Calificado', color: '#8b5cf6' },
      { name: 'Propuesta enviada', color: '#f59e0b' },
      { name: 'Negociación', color: '#f97316' },
      { name: 'Ganado', color: '#22c55e' },
      { name: 'Perdido', color: '#ef4444' },
    ],
  },
  {
    name: 'Soporte',
    icon: '🎧',
    stages: [
      { name: 'Nuevo ticket', color: '#6366f1' },
      { name: 'En progreso', color: '#f59e0b' },
      { name: 'Pendiente cliente', color: '#f97316' },
      { name: 'Resuelto', color: '#22c55e' },
    ],
  },
  {
    name: 'E-commerce',
    icon: '🛒',
    stages: [
      { name: 'Interesado', color: '#6366f1' },
      { name: 'Carrito abandonado', color: '#f59e0b' },
      { name: 'Pedido confirmado', color: '#22c55e' },
      { name: 'Enviado', color: '#3b82f6' },
      { name: 'Entregado', color: '#10b981' },
    ],
  },
  {
    name: 'Inmobiliaria',
    icon: '🏠',
    stages: [
      { name: 'Prospecto', color: '#6366f1' },
      { name: 'Visita agendada', color: '#8b5cf6' },
      { name: 'Oferta presentada', color: '#f59e0b' },
      { name: 'Documentación', color: '#f97316' },
      { name: 'Cierre', color: '#22c55e' },
    ],
  },
  {
    name: 'En blanco',
    icon: '✨',
    stages: [],
  },
]

interface Props {
  open: boolean
  onClose: () => void
  companyId: string
}

export function OnboardingTemplatesDialog({ open, onClose, companyId }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleConfirm = async () => {
    if (selected === null) return
    const template = TEMPLATES[selected]
    setIsLoading(true)
    try {
      const { data: pipeline, error: pipelineErr } = await supabase
        .from('pipeline')
        .insert({ nombre: template.name, empresa_id: companyId })
        .select()
        .single()
      if (pipelineErr) throw pipelineErr

      if (template.stages.length > 0) {
        const stages = template.stages.map((s, i) => ({
          nombre: s.name,
          color: s.color,
          orden: i,
          pipeline_id: pipeline.id,
        }))
        const { error: stagesErr } = await supabase.from('etapas').insert(stages)
        if (stagesErr) throw stagesErr
      }

      toast.success(`Pipeline "${template.name}" creado`)
      onClose()
    } catch (e: any) {
      toast.error(e.message || 'Error al crear el pipeline')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>¡Bienvenido a tu CRM!</DialogTitle>
          <DialogDescription>
            Elige una plantilla para empezar rápido, o crea tu propio pipeline desde cero.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TEMPLATES.map((t, i) => (
            <button
              key={t.name}
              onClick={() => setSelected(i)}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${
                selected === i
                  ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/40 ring-1 ring-violet-500'
                  : 'border-border hover:border-violet-300 hover:bg-muted/50'
              }`}
            >
              <span className="text-2xl">{t.icon}</span>
              <span className="text-sm font-medium">{t.name}</span>
              <span className="text-[11px] text-muted-foreground">
                {t.stages.length === 0 ? 'Personalizado' : `${t.stages.length} etapas`}
              </span>
            </button>
          ))}
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} className="flex-1" disabled={isLoading}>
            Después
          </Button>
          <Button
            onClick={handleConfirm}
            className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
            disabled={selected === null || isLoading}
          >
            {isLoading ? <Spinner className="w-4 h-4 animate-spin mr-2" /> : null}
            Crear pipeline
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
