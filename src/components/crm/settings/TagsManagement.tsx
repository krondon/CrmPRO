import { useState, useEffect } from 'react'
import { Tag } from '@/lib/types'
import { getSavedTags, bulkUpdateTag, bulkDeleteTag, deleteSavedTag } from '@/supabase/services/tags'
import { supabase } from '@/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { TrashIcon, PencilIcon, PlusIcon, CheckIcon, XIcon, TagIcon } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface TagsManagementProps {
    empresaId: string
}

const PRESET_COLORS = [
    '#ef4444', // red
    '#f97316', // orange
    '#f59e0b', // amber
    '#84cc16', // lime
    '#22c55e', // green
    '#10b981', // emerald
    '#06b6d4', // cyan
    '#3b82f6', // blue
    '#6366f1', // indigo
    '#d946ef', // fuchsia
    '#ec4899', // pink
    '#64748b', // slate
]

export function TagsManagement({ empresaId }: TagsManagementProps) {
    const [tags, setTags] = useState<Tag[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isUpdating, setIsUpdating] = useState(false)

    // Editing State
    const [editingTag, setEditingTag] = useState<Tag | null>(null)
    const [newName, setNewName] = useState('')
    const [newColor, setNewColor] = useState('')

    // Syncing State (removed)
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [createName, setCreateName] = useState('')
    const [createColor, setCreateColor] = useState(PRESET_COLORS[5])

    useEffect(() => {
        loadTags()
    }, [empresaId])

    const loadTags = async () => {
        setIsLoading(true)
        try {
            const data = await getSavedTags(empresaId)
            setTags(data)
        } catch (error) {
            console.error('Error loading tags:', error)
            toast.error('Error cargando etiquetas')
        } finally {
            setIsLoading(false)
        }
    }

    const handleEditStart = (tag: Tag) => {
        setEditingTag(tag)
        setNewName(tag.name)
        setNewColor(tag.color)
    }

    const handleEditCancel = () => {
        setEditingTag(null)
        setNewName('')
        setNewColor('')
    }

    const handleEditSave = async () => {
        if (!editingTag || !newName.trim()) return

        setIsUpdating(true)
        try {
            await bulkUpdateTag(empresaId, editingTag.id, {
                name: newName.trim(),
                color: newColor
            })
            toast.success('Etiqueta actualizada en todos los chats')
            setEditingTag(null)
            loadTags() // Recargar para ver cambios
        } catch (error) {
            console.error(error)
            toast.error('Error actualizando etiqueta')
        } finally {
            setIsUpdating(false)
        }
    }

    const handleDelete = async (tag: Tag) => {
        if (!confirm(`¿Estás seguro de eliminar la etiqueta "${tag.name}" de TODOS los chats? Esta acción no se puede deshacer.`)) return

        setIsUpdating(true)
        try {
            await bulkDeleteTag(empresaId, tag.id)
            await deleteSavedTag(tag.id).catch(() => {})
            toast.success('Etiqueta eliminada de todos los chats')
            loadTags()
        } catch (error) {
            console.error(error)
            toast.error('Error eliminando etiqueta')
        } finally {
            setIsUpdating(false)
        }
    }

    const handleCreate = async () => {
        const trimmed = createName.trim().slice(0, 20)
        if (!trimmed) {
            toast.error('El nombre no puede estar vacío')
            return
        }

        // Check duplicates locally
        if (tags.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) {
            toast.error('Ya existe una etiqueta con ese nombre')
            return
        }

        setIsUpdating(true)
        try {
            const newTag = {
                id: crypto.randomUUID(),
                empresa_id: empresaId,
                name: trimmed,
                color: createColor
            }
            console.log('[handleCreate] Intentando guardar etiqueta:', newTag)
            const { data, error } = await supabase
                .from('saved_tags')
                .insert(newTag)
                .select('id, name, color')
                .single()
            if (error) {
                console.error('[handleCreate] Error completo de Supabase:', JSON.stringify(error, null, 2))
                throw error
            }
            console.log('[handleCreate] ✅ Etiqueta guardada:', data)
            toast.success(`Etiqueta "${trimmed}" creada y guardada`)
            setCreateName('')
            setCreateColor(PRESET_COLORS[5])
            setShowCreateForm(false)
            loadTags()
        } catch (error: any) {
            console.error('[handleCreate] Error creando etiqueta:', error)
            const code = error?.code
            const msg = error?.message || ''
            if (code === '23505') {
                toast.error('Ya existe una etiqueta con ese nombre en esta empresa')
            } else if (code === '42501' || msg.includes('policy') || msg.includes('RLS')) {
                toast.error('Sin permisos para guardar etiquetas. Revisa las políticas RLS de saved_tags en Supabase.')
            } else {
                toast.error(`Error creando etiqueta: ${msg || 'Revisa la consola'}`)
            }
        } finally {
            setIsUpdating(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <TagIcon /> Gestión de Etiquetas
                    </h2>
                    <p className="text-muted-foreground text-sm">
                        Crea, edita o elimina etiquetas. Las etiquetas creadas aquí estarán disponibles para reutilizar en cualquier oportunidad.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        onClick={() => setShowCreateForm(prev => !prev)}
                        size="sm"
                        variant={showCreateForm ? 'secondary' : 'default'}
                        className="shrink-0 gap-1.5"
                    >
                        {showCreateForm ? <XIcon size={14} /> : <PlusIcon size={14} weight="bold" />}
                        {showCreateForm ? 'Cancelar' : 'Crear etiqueta'}
                    </Button>
                </div>
            </div>

            {/* Formulario de crear etiqueta */}
            {showCreateForm && (
                <Card className="border-primary/30 bg-primary/5 animate-in slide-in-from-top-2 duration-200">
                    <CardContent className="p-4 space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="flex-1">
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Nombre</Label>
                                <Input
                                    value={createName}
                                    onChange={e => setCreateName(e.target.value)}
                                    placeholder="Nombre de la etiqueta (máx. 20 car.)"
                                    maxLength={20}
                                    className="mt-1 h-9"
                                    autoFocus
                                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                                />
                            </div>
                            <div>
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Color</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <div
                                            className="mt-1 w-9 h-9 rounded-lg cursor-pointer border shadow-sm hover:scale-105 transition-transform"
                                            style={{ backgroundColor: createColor }}
                                        />
                                    </PopoverTrigger>
                                    <PopoverContent className="w-64 p-3">
                                        <div className="grid grid-cols-6 gap-2">
                                            {PRESET_COLORS.map(c => (
                                                <div
                                                    key={c}
                                                    className={`w-8 h-8 rounded-full cursor-pointer hover:scale-110 transition-transform ${createColor === c ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                                                    style={{ backgroundColor: c }}
                                                    onClick={() => setCreateColor(c)}
                                                />
                                            ))}
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                        {createName.trim() && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Vista previa:</span>
                                <Badge className="text-sm font-medium text-white shadow-sm" style={{ backgroundColor: createColor }}>
                                    {createName.trim().slice(0, 20)}
                                </Badge>
                            </div>
                        )}
                        <Button onClick={handleCreate} disabled={isUpdating || !createName.trim()} className="w-full gap-1.5">
                            <CheckIcon size={14} />
                            {isUpdating ? 'Guardando...' : 'Crear y guardar etiqueta'}
                        </Button>
                    </CardContent>
                </Card>
            )}

            {isLoading ? (
                <div className="flex items-center justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            ) : tags.length === 0 ? (
                <Card className="bg-muted/30 border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <TagIcon className="h-12 w-12 text-muted-foreground/50 mb-4" />
                        <h3 className="font-medium text-lg">No hay etiquetas aún</h3>
                        <p className="text-muted-foreground text-sm max-w-sm mt-2">
                            Usa el botón "Crear etiqueta" de arriba para empezar, o crea etiquetas directamente desde una oportunidad.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {tags.map(tag => (
                        <Card key={tag.id} className="overflow-hidden group hover:border-primary/50 transition-colors">
                            <CardContent className="p-4 flex items-center justify-between gap-3">
                                {editingTag?.id === tag.id ? (
                                    <div className="flex-1 flex flex-col gap-3 animate-in fade-in duration-200">
                                        <div className="flex items-center gap-2">
                                            <Input
                                                value={newName}
                                                onChange={e => setNewName(e.target.value)}
                                                className="h-8 text-sm"
                                                placeholder="Nombre etiqueta"
                                                autoFocus
                                            />
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <div
                                                        className="w-8 h-8 rounded-full cursor-pointer border shadow-sm shrink-0"
                                                        style={{ backgroundColor: newColor }}
                                                    />
                                                </PopoverTrigger>
                                                <PopoverContent className="w-64 p-3">
                                                    <div className="grid grid-cols-6 gap-2">
                                                        {PRESET_COLORS.map(c => (
                                                            <div
                                                                key={c}
                                                                className={`w-8 h-8 rounded-full cursor-pointer hover:scale-110 transition-transform ${newColor === c ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                                                                style={{ backgroundColor: c }}
                                                                onClick={() => setNewColor(c)}
                                                            />
                                                        ))}
                                                    </div>
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                        <div className="flex justify-end gap-2">
                                            <Button size="sm" variant="ghost" onClick={handleEditCancel} disabled={isUpdating} className="h-7 text-xs">
                                                Cancelar
                                            </Button>
                                            <Button size="sm" variant="default" onClick={handleEditSave} disabled={isUpdating} className="h-7 text-xs">
                                                {isUpdating ? 'Guardando...' : 'Guardar'}
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex flex-col gap-2 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <Badge
                                                    className="px-3 py-1 text-sm font-medium text-white shadow-sm"
                                                    style={{ backgroundColor: tag.color }}
                                                >
                                                    {tag.name}
                                                </Badge>
                                                {tag.short_id != null && (
                                                    <Badge
                                                        variant="outline"
                                                        className="text-xs bg-sky-500/10 text-sky-700 border-sky-300 font-bold"
                                                    >
                                                        #{tag.short_id}
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-8 w-8 text-muted-foreground hover:text-primary"
                                                onClick={() => handleEditStart(tag)}
                                            >
                                                <PencilIcon size={16} />
                                            </Button>
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                onClick={() => handleDelete(tag)}
                                            >
                                                <TrashIcon size={16} />
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
