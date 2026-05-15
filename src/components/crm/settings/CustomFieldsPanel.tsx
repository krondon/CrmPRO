import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  PlusIcon,
  TrashIcon,
  TextTIcon,
  HashIcon,
  ListIcon,
  WarningIcon,
  CheckSquareIcon,
  SquareIcon,
  PencilSimpleIcon,
  ArrowCounterClockwiseIcon,
  RobotIcon,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useCustomFields } from '@/hooks/useCustomFields'
import { usePredefinedFieldDescriptions } from '@/hooks/usePredefinedFieldDescriptions'
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
  descripcion: '',
}

export function CustomFieldsPanel({ empresaId }: CustomFieldsPanelProps) {
  const { fields, loading, addField, removeField, removeFields, updateField } = useCustomFields(empresaId)
  const {
    fields: predefinedFields,
    loading: loadingPredefined,
    setDescription: setPredefinedDescription,
    resetDescription: resetPredefinedDescription,
  } = usePredefinedFieldDescriptions(empresaId)

  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // Edición de descripción
  const [editingDescId, setEditingDescId] = useState<string | null>(null)
  const [editingDescValue, setEditingDescValue] = useState('')
  const [savingDesc, setSavingDesc] = useState(false)
  const [editingPredefinedKey, setEditingPredefinedKey] = useState<string | null>(null)
  const [editingPredefinedValue, setEditingPredefinedValue] = useState('')
  const [savingPredefined, setSavingPredefined] = useState(false)

  const allSelected = fields.length > 0 && selectedIds.size === fields.length

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(fields.map(f => f.id)))
  }

  const exitSelectionMode = () => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    const count = selectedIds.size
    if (!confirm(`¿Eliminar ${count} campo${count > 1 ? 's' : ''}? Los valores guardados en oportunidades existentes se perderán.`)) return
    setBulkDeleting(true)
    try {
      await removeFields([...selectedIds])
      toast.success(`${count} campo${count > 1 ? 's eliminados' : ' eliminado'}`)
      exitSelectionMode()
    } catch (e: any) {
      toast.error(`Error al eliminar: ${e.message}`)
    } finally {
      setBulkDeleting(false)
    }
  }

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
        descripcion: form.descripcion.trim() || null,
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

  const startEditDesc = (field: CustomFieldDefinition) => {
    setEditingDescId(field.id)
    setEditingDescValue(field.descripcion ?? '')
  }

  const cancelEditDesc = () => {
    setEditingDescId(null)
    setEditingDescValue('')
  }

  const saveEditDesc = async (id: string) => {
    setSavingDesc(true)
    try {
      await updateField(id, { descripcion: editingDescValue.trim() || null })
      toast.success('Descripción actualizada')
      cancelEditDesc()
    } catch (e: any) {
      toast.error(`Error al guardar: ${e.message}`)
    } finally {
      setSavingDesc(false)
    }
  }

  const startEditPredefined = (key: string, current: string) => {
    setEditingPredefinedKey(key)
    setEditingPredefinedValue(current)
  }

  const cancelEditPredefined = () => {
    setEditingPredefinedKey(null)
    setEditingPredefinedValue('')
  }

  const saveEditPredefined = async (key: string) => {
    setSavingPredefined(true)
    try {
      await setPredefinedDescription(key, editingPredefinedValue)
      toast.success('Descripción actualizada')
      cancelEditPredefined()
    } catch (e: any) {
      toast.error(`Error al guardar: ${e.message}`)
    } finally {
      setSavingPredefined(false)
    }
  }

  const handleResetPredefined = async (key: string, label: string) => {
    if (!confirm(`¿Restaurar la descripción default de "${label}"?`)) return
    try {
      await resetPredefinedDescription(key)
      toast.success('Descripción restaurada')
    } catch (e: any) {
      toast.error(`Error: ${e.message}`)
    }
  }

  if (loading || loadingPredefined) {
    return <div className="text-sm text-muted-foreground py-12 text-center animate-pulse">Cargando campos…</div>
  }

  return (
    <div className="space-y-10">
      {/* ============================================================
          SECCIÓN 1 — Campos predefinidos (nativos del lead)
          ============================================================ */}
      <section className="space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <RobotIcon size={18} weight="bold" className="text-primary" />
            <h2 className="text-xl font-bold">Campos del sistema</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Campos nativos de cada oportunidad. La descripción guía a la IA sobre cuándo leer o llenar el campo a partir de los mensajes del cliente.
          </p>
        </div>

        <div className="space-y-2">
          {predefinedFields.map(field => {
            const isEditing = editingPredefinedKey === field.key
            return (
              <div
                key={field.key}
                className="rounded-xl border border-border/40 bg-background hover:border-border/70 transition-colors"
              >
                <div className="flex items-start gap-3 px-4 py-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <TextTIcon size={15} className="text-primary" weight="bold" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">{field.label}</p>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {TYPE_LABELS[field.tipo]}
                      </Badge>
                      {field.isOverridden && (
                        <Badge variant="secondary" className="text-[10px]">Personalizado</Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono">{field.key}</p>

                    {!isEditing && (
                      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                        {field.descripcion}
                      </p>
                    )}

                    {isEditing && (
                      <div className="mt-2 space-y-2">
                        <Textarea
                          value={editingPredefinedValue}
                          onChange={e => setEditingPredefinedValue(e.target.value)}
                          rows={3}
                          className="rounded-lg text-xs"
                          placeholder="Descripción para la IA…"
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            className="rounded-lg h-7 text-xs"
                            disabled={savingPredefined}
                            onClick={() => saveEditPredefined(field.key)}
                          >
                            {savingPredefined ? 'Guardando…' : 'Guardar'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-lg h-7 text-xs"
                            onClick={cancelEditPredefined}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex items-center gap-1 shrink-0">
                      {field.isOverridden && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
                          onClick={() => handleResetPredefined(field.key, field.label)}
                          title="Restaurar descripción default"
                        >
                          <ArrowCounterClockwiseIcon size={14} weight="bold" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-lg text-muted-foreground hover:text-primary"
                        onClick={() => startEditPredefined(field.key, field.descripcion)}
                        title="Editar descripción"
                      >
                        <PencilSimpleIcon size={14} weight="bold" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ============================================================
          SECCIÓN 2 — Campos personalizados
          ============================================================ */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Campos personalizados</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Agrega campos extra al formulario de oportunidades. La descripción guía a la IA sobre cuándo escribir el valor.
            </p>
          </div>
          {!showForm && !selectionMode && (
            <div className="flex items-center gap-2">
              {fields.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl gap-1.5"
                  onClick={() => setSelectionMode(true)}
                >
                  <CheckSquareIcon size={14} weight="bold" />
                  Seleccionar
                </Button>
              )}
              <Button onClick={() => setShowForm(true)} size="sm" className="rounded-xl gap-1.5">
                <PlusIcon size={14} weight="bold" />
                Nuevo campo
              </Button>
            </div>
          )}
        </div>

        {/* Add form */}
        {showForm && (
          <Card className="border-dashed border-2 border-primary/30 rounded-2xl shadow-none">
            <CardContent className="pt-5 space-y-4">
              <p className="text-xs font-semibold text-primary uppercase tracking-wider">Nuevo campo</p>

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

              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <RobotIcon size={13} weight="bold" className="text-primary" />
                  Descripción para la IA
                </Label>
                <Textarea
                  placeholder="Ej. Cantidad de personas que asistirán al evento. Llénalo cuando el cliente mencione el número de invitados."
                  value={form.descripcion}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  rows={3}
                  className="rounded-xl text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Esta descripción se le pasa a la IA para que sepa cuándo y cómo llenar este campo a partir de los mensajes del cliente. Opcional, pero recomendado.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  id="cf-required"
                  checked={form.requerido}
                  onCheckedChange={v => setForm(f => ({ ...f, requerido: v }))}
                />
                <Label htmlFor="cf-required" className="text-sm cursor-pointer">Campo requerido</Label>
              </div>

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
            {selectionMode && (
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-primary/30 bg-primary/5">
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
                >
                  {allSelected
                    ? <CheckSquareIcon size={18} weight="bold" className="text-primary" />
                    : <SquareIcon size={18} weight="regular" className="text-muted-foreground" />
                  }
                  {allSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
                </button>
                <span className="text-xs text-muted-foreground ml-1">
                  {selectedIds.size > 0 ? `${selectedIds.size} seleccionado${selectedIds.size > 1 ? 's' : ''}` : ''}
                </span>
                <div className="flex items-center gap-2 ml-auto">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="rounded-xl gap-1.5 h-8"
                    disabled={selectedIds.size === 0 || bulkDeleting}
                    onClick={handleBulkDelete}
                  >
                    <TrashIcon size={13} weight="bold" />
                    {bulkDeleting ? 'Eliminando…' : `Eliminar${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-xl h-8"
                    onClick={exitSelectionMode}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {fields.map(field => {
              const Icon = TYPE_ICONS[field.tipo]
              const isSelected = selectedIds.has(field.id)
              const isEditingDesc = editingDescId === field.id
              return (
                <div
                  key={field.id}
                  className={`rounded-xl border transition-colors ${
                    selectionMode
                      ? isSelected
                        ? 'border-primary/50 bg-primary/5 cursor-pointer'
                        : 'border-border/40 bg-background hover:border-border/70 cursor-pointer'
                      : 'border-border/40 bg-background hover:border-border/70'
                  }`}
                  onClick={selectionMode ? () => toggleSelect(field.id) : undefined}
                >
                  <div className="flex items-start gap-3 px-4 py-3">
                    {selectionMode && (
                      <div className="shrink-0 mt-0.5">
                        {isSelected
                          ? <CheckSquareIcon size={18} weight="bold" className="text-primary" />
                          : <SquareIcon size={18} weight="regular" className="text-muted-foreground" />
                        }
                      </div>
                    )}

                    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      <Icon size={15} className="text-muted-foreground" weight="bold" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold truncate">{field.nombre}</p>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {TYPE_LABELS[field.tipo]}
                        </Badge>
                        {field.requerido && (
                          <Badge variant="destructive" className="text-[10px]">Requerido</Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground font-mono">{field.clave}</p>

                      {!isEditingDesc && (
                        <p className="text-xs text-muted-foreground mt-2 leading-relaxed italic">
                          {field.descripcion?.trim() || 'Sin descripción para la IA — la IA no podrá llenar este campo automáticamente.'}
                        </p>
                      )}

                      {isEditingDesc && (
                        <div className="mt-2 space-y-2">
                          <Textarea
                            value={editingDescValue}
                            onChange={e => setEditingDescValue(e.target.value)}
                            rows={3}
                            className="rounded-lg text-xs"
                            placeholder="Descripción para la IA…"
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              className="rounded-lg h-7 text-xs"
                              disabled={savingDesc}
                              onClick={() => saveEditDesc(field.id)}
                            >
                              {savingDesc ? 'Guardando…' : 'Guardar'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="rounded-lg h-7 text-xs"
                              onClick={cancelEditDesc}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    {!selectionMode && !isEditingDesc && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-lg text-muted-foreground hover:text-primary"
                          onClick={() => startEditDesc(field)}
                          title="Editar descripción"
                        >
                          <PencilSimpleIcon size={14} weight="bold" />
                        </Button>
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
                    )}
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
      </section>
    </div>
  )
}

function parseOptions(raw: string): string[] {
  return raw
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)
}
