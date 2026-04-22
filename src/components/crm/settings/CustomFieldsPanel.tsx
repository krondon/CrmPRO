import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { PlusIcon, TrashIcon, TextTIcon, HashIcon, ListIcon, WarningIcon } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useCustomFields } from '@/hooks/useCustomFields'
import { toFieldKey } from '@/lib/customFieldUtils'
import type { CustomFieldDefinition } from '@/lib/types'

interface CustomFieldsPanelProps {
  empresaId: string
}

const TYPE_LABELS: Record<CustomFieldDefinition['tipo'], string> = {
  text: 'Texto',
  number: 'Número',
  select: 'Selección',
}

const TYPE_ICONS: Record<CustomFieldDefinition['tipo'], React.ElementType> = {
  text: TextTIcon,
  number: HashIcon,
  select: ListIcon,
}

const EMPTY_FORM = {
  nombre: '',
  tipo: 'text' as CustomFieldDefinition['tipo'],
  opciones: '',
  requerido: false,
}

export function CustomFieldsPanel({ empresaId }: CustomFieldsPanelProps) {
  const { fields, loading, addField, removeField } = useCustomFields(empresaId)

  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const previewKey = form.nombre.trim() ? toFieldKey(form.nombre) : ''

  const isDuplicateKey = !!previewKey && fields.some(f => f.clave === previewKey)

  const handleSave = async () => {
    if (!form.nombre.trim()) {
      toast.error('El nombre del campo es requerido')
      return
    }
    if (!previewKey) {
      toast.error('El nombre no genera una clave válida')
      return
    }
    if (isDuplicateKey) {
      toast.error('Ya existe un campo con ese nombre')
      return
    }
    if (form.tipo === 'select') {
      const opts = parseOptions(form.opciones)
      if (opts.length < 2) {
        toast.error('El campo de selección necesita al menos 2 opciones')
        return
      }
    }

    setSaving(true)
    try {
      await addField({
        empresa_id: empresaId,
        nombre: form.nombre.trim(),
        clave: previewKey,
        tipo: form.tipo,
        opciones: form.tipo === 'select' ? parseOptions(form.opciones) : null,
        requerido: form.requerido,
        orden: fields.length,
      })
      toast.success('Campo creado')
      setForm(EMPTY_FORM)
      setShowForm(false)
    } catch (e: any) {
      toast.error(`Error al crear: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar el campo "${nombre}"? Los valores guardados en leads existentes se perderán.`)) return
    setDeletingId(id)
    try {
      await removeField(id)
      toast.success('Campo eliminado')
    } catch (e: any) {
      toast.error(`Error al eliminar: ${e.message}`)
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground py-12 text-center animate-pulse">Cargando campos…</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Campos personalizados</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Agrega campos extra al formulario de oportunidades. Los campos existentes no se modifican.
          </p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)} size="sm" className="rounded-xl gap-1.5">
            <PlusIcon size={14} weight="bold" />
            Nuevo campo
          </Button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <Card className="border-dashed border-2 border-primary/30 rounded-2xl shadow-none">
          <CardContent className="pt-5 space-y-4">
            <p className="text-xs font-semibold text-primary uppercase tracking-wider">Nuevo campo</p>

            {/* Name */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Nombre del campo</Label>
              <Input
                placeholder="Ej. Número de invitados"
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                className="rounded-xl"
                autoFocus
              />
              {previewKey && (
                <p className={`text-xs font-mono ${isDuplicateKey ? 'text-destructive' : 'text-muted-foreground'}`}>
                  clave: <span className="font-bold">{previewKey}</span>
                  {isDuplicateKey && ' — ya existe un campo con esta clave'}
                </p>
              )}
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Tipo de campo</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v as any }))}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto libre</SelectItem>
                  <SelectItem value="number">Número</SelectItem>
                  <SelectItem value="select">Selección (lista de opciones)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Options — only for select */}
            {form.tipo === 'select' && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Opciones</Label>
                <Input
                  placeholder="Ej. Opción A, Opción B, Opción C"
                  value={form.opciones}
                  onChange={e => setForm(f => ({ ...f, opciones: e.target.value }))}
                  className="rounded-xl"
                />
                <p className="text-xs text-muted-foreground">Separa las opciones con comas</p>
                {form.opciones.trim() && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {parseOptions(form.opciones).map(o => (
                      <Badge key={o} variant="secondary" className="text-xs">{o}</Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Required */}
            <div className="flex items-center gap-3">
              <Switch
                id="cf-required"
                checked={form.requerido}
                onCheckedChange={v => setForm(f => ({ ...f, requerido: v }))}
              />
              <Label htmlFor="cf-required" className="text-sm cursor-pointer">Campo requerido</Label>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button onClick={handleSave} disabled={saving || isDuplicateKey} size="sm" className="rounded-xl">
                {saving ? 'Guardando…' : 'Guardar campo'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-xl"
                onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }}
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Field list */}
      {fields.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 opacity-50">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
            <ListIcon size={28} weight="thin" className="text-muted-foreground" />
          </div>
          <p className="font-bold">Sin campos personalizados</p>
          <p className="text-xs text-muted-foreground max-w-[260px]">
            Crea campos extra que aparecerán en el formulario de oportunidades
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {fields.map(field => {
            const Icon = TYPE_ICONS[field.tipo]
            return (
              <div
                key={field.id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border/40 bg-background hover:border-border/70 transition-colors"
              >
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Icon size={15} className="text-muted-foreground" weight="bold" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{field.nombre}</p>
                  <p className="text-xs text-muted-foreground font-mono">{field.clave}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-xs capitalize">
                    {TYPE_LABELS[field.tipo]}
                  </Badge>
                  {field.requerido && (
                    <Badge variant="destructive" className="text-xs">Requerido</Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    disabled={deletingId === field.id}
                    onClick={() => handleDelete(field.id, field.nombre)}
                  >
                    <TrashIcon size={14} weight="bold" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {fields.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3">
          <WarningIcon size={14} className="text-amber-500 shrink-0" weight="bold" />
          Eliminar un campo no borra los valores ya guardados en oportunidades existentes, pero dejará de mostrarse.
        </div>
      )}
    </div>
  )
}

function parseOptions(raw: string): string[] {
  return raw
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)
}
