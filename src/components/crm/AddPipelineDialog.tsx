import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Pipeline, PipelineType, Stage, AssignmentType } from '@/lib/types'
import { useTranslation } from '@/lib/i18n'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Plus, X, Hand, ArrowsClockwise, Shuffle } from '@phosphor-icons/react'
import { createPipelineWithStages } from '@/supabase/helpers/pipeline'

interface AddPipelineDialogProps {
  open: boolean
  onClose: () => void
  onAdd: (pipeline: Pipeline) => void
  empresaId: string | undefined
}

export function AddPipelineDialog({ open, onClose, onAdd, empresaId }: AddPipelineDialogProps) {
  const t = useTranslation('es')
  
  const [name, setName] = useState('')
  const [assignmentType, setAssignmentType] = useState<AssignmentType>('manual')
  // Solo mantenemos la etapa inicial por defecto, sin opción a agregar más
  const [stages] = useState<Stage[]>([
    { id: 'stage-1', name: 'Inicial', order: 0, color: '#3b82f6', pipelineType: 'sales' }
  ])

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    // Permitir solo letras, números y espacios, máx 30 caracteres
    if (val.length <= 30 && /^[a-zA-Z0-9 ]*$/.test(val)) {
      setName(val)
    }
  }

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Ingresa un nombre para el pipeline')
      return
    }
    
    if (!empresaId) {
      toast.error('No se ha podido identificar la empresa.')
      return
    }

    try {
      const pipelineData = {
        name: name.trim(),
        stages: stages,
        empresa_id: empresaId,
        assignment_type: assignmentType
      }

      const newPipeline = await createPipelineWithStages(pipelineData)

      // Si la creación en BD fue exitosa, actualizamos el estado local
      // Usamos los stages devueltos por la BD que ya tienen UUIDs reales
      const pipelineForState = {
        ...newPipeline,
        stages: newPipeline.stages && newPipeline.stages.length > 0 ? newPipeline.stages : stages,
        type: newPipeline.type || pipelineData.name.toLowerCase().trim().replace(/\s+/g, '-'),
        assignment_type: assignmentType
      }

      onAdd(pipelineForState)
      resetForm()
      onClose()
      toast.success('Pipeline y etapas guardados en la base de datos')
    } catch (error: any) {
      console.error(error)
      toast.error(`Error al guardar en BD: ${error.message || 'Error desconocido'}`)
    }
  }

  const resetForm = () => {
    setName('')
    setAssignmentType('manual')
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo Pipeline</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div>
            <Label htmlFor="pipeline-name">Nombre del Pipeline</Label>
            <Input
              id="pipeline-name"
              value={name}
              onChange={handleNameChange}
              placeholder="Ej: Ventas B2B"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Máximo 30 caracteres (letras y números).
            </p>
          </div>

          <div>
            <Label>Etapas del Pipeline</Label>
            <div className="mt-2 p-3 border border-border rounded bg-muted/20">
              <div className="flex items-center gap-2">
                <Badge style={{ backgroundColor: '#3b82f6', color: 'white' }}>
                  1
                </Badge>
                <span className="font-medium">Inicial</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Todo nuevo pipeline comienza con una etapa "Inicial". Podrás agregar más etapas después.
              </p>
            </div>
          </div>

          <div>
            <Label>Asignación de oportunidades</Label>
            <Select value={assignmentType} onValueChange={(v) => setAssignmentType(v as AssignmentType)}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">
                  <span className="flex items-center gap-2">
                    <Hand size={16} weight="duotone" /> Manual
                  </span>
                </SelectItem>
                <SelectItem value="round_robin">
                  <span className="flex items-center gap-2">
                    <ArrowsClockwise size={16} weight="duotone" className="text-blue-500" /> Por orden (Round Robin)
                  </span>
                </SelectItem>
                <SelectItem value="random">
                  <span className="flex items-center gap-2">
                    <Shuffle size={16} weight="duotone" className="text-purple-500" /> Aleatorio
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {assignmentType === 'manual' && 'Asignas a quién quieras manualmente al crear cada oportunidad.'}
              {assignmentType === 'round_robin' && 'Asigna automáticamente a los miembros del equipo en turno rotativo.'}
              {assignmentType === 'random' && 'Asigna automáticamente a un miembro del equipo al azar.'}
            </p>
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={handleSubmit} className="flex-1">Crear Pipeline</Button>
            <Button onClick={onClose} variant="outline">Cancelar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

