import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Pipeline, AssignmentType } from '@/lib/types'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { updatePipeline } from '@/supabase/helpers/pipeline'
import { Shuffle, ArrowsClockwise, Hand } from '@phosphor-icons/react'

interface EditPipelineDialogProps {
  open: boolean
  onClose: () => void
  pipeline: Pipeline
  onUpdate: (updated: Pipeline) => void
}

const ASSIGNMENT_OPTIONS: { value: AssignmentType; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: 'manual',
    label: 'Manual',
    description: 'Asigna manualmente al crear cada oportunidad.',
    icon: <Hand size={20} weight="duotone" className="text-muted-foreground" />
  },
  {
    value: 'round_robin',
    label: 'Por orden (Round Robin)',
    description: 'Asigna a cada miembro en turno rotativo.',
    icon: <ArrowsClockwise size={20} weight="duotone" className="text-blue-500" />
  },
  {
    value: 'random',
    label: 'Aleatorio',
    description: 'Asigna a un miembro al azar.',
    icon: <Shuffle size={20} weight="duotone" className="text-purple-500" />
  }
]

export function EditPipelineDialog({ open, onClose, pipeline, onUpdate }: EditPipelineDialogProps) {
  const [assignmentType, setAssignmentType] = useState<AssignmentType>(pipeline.assignment_type || 'manual')
  const [isSaving, setIsSaving] = useState(false)

  const hasChanges = assignmentType !== (pipeline.assignment_type || 'manual')

  const handleSave = async () => {
    if (!hasChanges) {
      onClose()
      return
    }

    setIsSaving(true)
    try {
      const { data, error } = await updatePipeline(pipeline.id, {
        assignment_type: assignmentType
      })

      if (error) throw error

      onUpdate({
        ...pipeline,
        assignment_type: assignmentType
      })

      toast.success('Configuración de asignación actualizada')
      onClose()
    } catch (err: any) {
      console.error('Error updating pipeline:', err)
      toast.error(`Error al guardar: ${err.message || 'Error desconocido'}`)
    } finally {
      setIsSaving(false)
    }
  }

  const selectedOption = ASSIGNMENT_OPTIONS.find(o => o.value === assignmentType)

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configuración de "{pipeline.name}"</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 pt-2">
          <div className="space-y-2">
            <Label>Asignación automática de oportunidades</Label>
            <p className="text-xs text-muted-foreground">
              Determina cómo se asignan las nuevas oportunidades a los miembros del equipo en este pipeline.
            </p>
          </div>

          <div className="space-y-2">
            {ASSIGNMENT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setAssignmentType(option.value)}
                className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                  assignmentType === option.value
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                    : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30'
                }`}
              >
                <div className="mt-0.5 shrink-0">{option.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{option.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{option.description}</div>
                </div>
                {assignmentType === option.value && (
                  <div className="shrink-0 w-2 h-2 rounded-full bg-primary mt-2" />
                )}
              </button>
            ))}
          </div>

          {assignmentType !== 'manual' && (
            <div className="p-3 bg-muted/50 rounded-lg border border-border mt-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong className="text-foreground font-semibold">Nota:</strong> La asignación automática solo aplica a oportunidades creadas sin un miembro seleccionado. Si asignas manualmente, se respeta tu elección. Los miembros deben estar vinculados a este pipeline para recibir asignaciones.
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleSave}
              className="flex-1"
              disabled={isSaving || !hasChanges}
            >
              {isSaving ? 'Guardando...' : 'Guardar'}
            </Button>
            <Button onClick={onClose} variant="outline">Cancelar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
