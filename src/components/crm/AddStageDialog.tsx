import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus } from '@phosphor-icons/react'
import { Stage, PipelineType } from '@/lib/types'
import { useTranslation } from '@/lib/i18n'
import { toast } from 'sonner'
import { PremiumSwitch, useUpgradeModal } from '@/components/premium'
import { useEdition } from '@/hooks/useEdition'

interface AddStageDialogProps {
  pipelineType: PipelineType
  currentStagesCount: number
  onAdd: (stage: Stage) => void
  trigger?: React.ReactNode
}

export function AddStageDialog({ pipelineType, currentStagesCount, onAdd, trigger }: AddStageDialogProps) {
  const t = useTranslation('es')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#3b82f6')
  const [isSlaEnabled, setIsSlaEnabled] = useState(false)
  const [slaValue, setSlaValue] = useState(30)
  const [slaUnit, setSlaUnit] = useState<"minutes" | "hours" | "days">("minutes")

  const { isLocked } = useEdition()
  const { open: openUpgrade } = useUpgradeModal()
  const semaforoLocked = isLocked('semaforo')
  const handleSemaforoLabelClick = () => {
    if (semaforoLocked) {
      openUpgrade({ type: 'feature', feature: 'semaforo' })
      return
    }
    setIsSlaEnabled(!isSlaEnabled)
  }

  const predefinedColors = [
    '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', 
    '#10b981', '#06b6d4', '#6366f1', '#ef4444'
  ]

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error(t.messages.enterStageName)
      return
    }

    let slaLimitMinutes: number | null = null;
    if (isSlaEnabled) {
      if (slaUnit === 'days') slaLimitMinutes = slaValue * 1440;
      else if (slaUnit === 'hours') slaLimitMinutes = slaValue * 60;
      else slaLimitMinutes = slaValue;
    }

    const newStage: Stage = {
      id: Date.now().toString(),
      name: name.trim(),
      order: currentStagesCount,
      color,
      pipelineType,
      is_sla_enabled: isSlaEnabled,
      sla_limit_minutes: slaLimitMinutes
    }

    onAdd(newStage)
    setName('')
    setColor('#3b82f6')
    setIsSlaEnabled(false)
    setSlaValue(30)
    setSlaUnit("minutes")
    setOpen(false)
    toast.success(t.messages.stageAdded)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm">
            <Plus size={16} />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.stage.addStage}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="stage-name">{t.stage.stageName} *</Label>
            <Input
              id="stage-name"
              value={name}
              onChange={(e) => {
                if (e.target.value.length <= 30) setName(e.target.value)
              }}
              placeholder="ej: Calificado, Negociación"
            />
          </div>
          <div>
            <Label>{t.stage.color}</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {predefinedColors.map(c => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  className={`w-9 h-9 rounded-full border-2 transition-all shrink-0 ${
                    color === c ? 'border-foreground scale-110' : 'border-border'
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
              <Input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-9 h-9 p-0 border-0 shrink-0"
                aria-label="Color personalizado"
              />
            </div>
          </div>

          <div className="flex flex-col gap-4 border p-4 rounded-md mt-4">
            <div className="flex items-center justify-between">
              <Label className="cursor-pointer" onClick={handleSemaforoLabelClick}>
                Semaforo de tiempo
              </Label>
              <PremiumSwitch feature="semaforo" checked={isSlaEnabled} onCheckedChange={setIsSlaEnabled} />
            </div>
            <p className="text-xs text-muted-foreground">
              Establece un tiempo limite para esta etapa. Las tarjetas cambiaran de color segun el tiempo restante: verde (a tiempo), amarillo (poco tiempo) y rojo (vencido).
            </p>

            {isSlaEnabled && (
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div className="flex flex-col gap-1">
                  <Label>Tiempo límite por defecto</Label>
                  <Input 
                    type="number" 
                    min={1}
                    value={slaValue} 
                    onChange={(e) => setSlaValue(Number(e.target.value))} 
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Unidad</Label>
                  <Select value={slaUnit} onValueChange={(val: any) => setSlaUnit(val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Unidad" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">Minutos</SelectItem>
                      <SelectItem value="hours">Horas</SelectItem>
                      <SelectItem value="days">Días</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground col-span-2">
                  Las oportunidades cambiarán a naranja cuando quede el 20% del tiempo.
                </p>
              </div>
            )}
          </div>

          <Button onClick={handleSubmit} className="w-full">{t.buttons.add}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
