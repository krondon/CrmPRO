import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { CalendarBlank, Clock, ChatDots, Power } from '@phosphor-icons/react'

export interface ActivationRangeValues {
  is_active: boolean
  activation_date_start: string
  activation_date_end: string
  activation_time_start: string
  activation_time_end: string
  message_limit: string
}

interface ActivationRangeFormProps {
  values: ActivationRangeValues
  onChange: (next: ActivationRangeValues) => void
}

export function ActivationRangeForm({ values, onChange }: ActivationRangeFormProps) {
  const set = (key: keyof ActivationRangeValues, val: string | boolean) =>
    onChange({ ...values, [key]: val })

  return (
    <div className="space-y-4 rounded-xl border border-border/50 bg-muted/30 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Power size={15} weight="duotone" className="text-primary" />
          <span className="text-sm font-semibold">Rango de activación</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {values.is_active ? 'Activa' : 'Inactiva'}
          </span>
          <Switch
            checked={values.is_active}
            onCheckedChange={v => set('is_active', v)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <CalendarBlank size={12} />
            Fecha inicio
          </Label>
          <Input
            type="date"
            value={values.activation_date_start}
            onChange={e => set('activation_date_start', e.target.value)}
            className="rounded-xl text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <CalendarBlank size={12} />
            Fecha fin
          </Label>
          <Input
            type="date"
            value={values.activation_date_end}
            onChange={e => set('activation_date_end', e.target.value)}
            className="rounded-xl text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Clock size={12} />
            Hora inicio
          </Label>
          <Input
            type="time"
            value={values.activation_time_start}
            onChange={e => set('activation_time_start', e.target.value)}
            className="rounded-xl text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Clock size={12} />
            Hora fin
          </Label>
          <Input
            type="time"
            value={values.activation_time_end}
            onChange={e => set('activation_time_end', e.target.value)}
            className="rounded-xl text-sm"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
          <ChatDots size={12} />
          Límite de mensajes por día
          <span className="font-normal">(opcional)</span>
        </Label>
        <Input
          type="number"
          min="1"
          max="10000"
          placeholder="Sin límite"
          value={values.message_limit}
          onChange={e => set('message_limit', e.target.value)}
          className="rounded-xl text-sm max-w-[200px]"
        />
      </div>
    </div>
  )
}
