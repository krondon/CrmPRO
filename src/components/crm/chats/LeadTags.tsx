import { useState, useEffect } from 'react'
import { Tag } from '@/lib/types'
import { getAllUniqueTags, getSavedTags, addTagToLead, removeTagFromLead, saveTag, deleteSavedTag } from '@/supabase/services/tags'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { Plus, X, Tag as TagIcon, Check, BookmarkSimple, Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface LeadTagsProps {
    leadId: string
    currentTags: Tag[]
    companyId: string
    onUpdate: (newTags: Tag[]) => void
}

const PRESET_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#10b981',
    '#06b6d4', '#3b82f6', '#6366f1', '#d946ef', '#ec4899', '#64748b'
]

export function LeadTags({ leadId, currentTags, companyId, onUpdate }: LeadTagsProps) {
    const [availableTags, setAvailableTags] = useState<Tag[]>([])
    const [savedTagIds, setSavedTagIds] = useState<Set<string>>(new Set())
    const [open, setOpen] = useState(false)
    const [inputValue, setInputValue] = useState('')

    // Cargar tags disponibles (saved_tags + tags en leads)
    useEffect(() => {
        if (open) {
            Promise.all([
                getAllUniqueTags(companyId),
                getSavedTags(companyId)
            ]).then(([allTags, saved]) => {
                setAvailableTags(allTags)
                setSavedTagIds(new Set(saved.map(t => t.id)))
            })
        }
    }, [open, companyId])

    const handleSelectTag = async (tag: Tag) => {
        if (currentTags.some(t => t.id === tag.id)) return

        try {
            const updated = await addTagToLead(leadId, currentTags, tag, companyId)
            if (updated) {
                onUpdate(updated)
                toast.success('Etiqueta agregada')
            }
        } catch (error) {
            console.error(error)
            toast.error('Error agregando etiqueta')
        }
    }

    const handleCreateTag = async () => {
        if (!inputValue.trim()) return

        const newTag: Tag = {
            id: crypto.randomUUID(),
            name: inputValue.trim(),
            color: PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]
        }

        try {
            // Guardar en saved_tags primero para que persista
            const persisted = await saveTag(companyId, newTag)
            const updated = await addTagToLead(leadId, currentTags, persisted, companyId)
            if (updated) {
                onUpdate(updated)
                toast.success('Etiqueta creada y guardada')
                setInputValue('')
                setOpen(false)
            }
        } catch (error) {
            console.error(error)
            toast.error('Error creando etiqueta')
        }
    }

    const handleSaveTagToPersist = async (tag: Tag) => {
        try {
            await saveTag(companyId, tag)
            setSavedTagIds(prev => new Set([...prev, tag.id]))
            toast.success(`"${tag.name}" guardada en biblioteca`)
        } catch (error) {
            console.error(error)
            toast.error('Error guardando etiqueta')
        }
    }

    const handleDeleteSavedTag = async (tag: Tag) => {
        try {
            await deleteSavedTag(tag.id)
            setSavedTagIds(prev => {
                const next = new Set(prev)
                next.delete(tag.id)
                return next
            })
            toast.success(`"${tag.name}" eliminada de biblioteca`)
        } catch (error) {
            console.error(error)
            toast.error('Error eliminando etiqueta')
        }
    }

    const handleRemoveTag = async (tagId: string) => {
        try {
            const updated = await removeTagFromLead(leadId, currentTags, tagId)
            if (updated) {
                onUpdate(updated)
            }
        } catch (error) {
            console.error(error)
            toast.error('Error eliminando etiqueta')
        }
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Etiquetas</span>
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full hover:bg-primary/10 hover:text-primary">
                            <Plus size={14} weight="bold" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-56" align="end">
                        <Command>
                            <CommandInput
                                placeholder="Buscar o crear..."
                                value={inputValue}
                                onValueChange={setInputValue}
                            />
                            <CommandList>
                                <CommandEmpty className="p-2">
                                    <div className="text-xs text-muted-foreground mb-2">No existe "{inputValue}"</div>
                                    <Button size="sm" className="w-full text-xs h-7" onClick={handleCreateTag}>
                                        Crear y guardar "{inputValue}"
                                    </Button>
                                </CommandEmpty>
                                {/* Etiquetas guardadas (persistentes) */}
                                {availableTags.filter(t => savedTagIds.has(t.id)).length > 0 && (
                                    <CommandGroup heading="📌 Guardadas">
                                        {availableTags.filter(t => savedTagIds.has(t.id)).map(tag => {
                                            const isSelected = currentTags.some(t => t.id === tag.id)
                                            return (
                                                <CommandItem
                                                    key={tag.id}
                                                    onSelect={() => handleSelectTag(tag)}
                                                    disabled={isSelected}
                                                    className="text-xs group/item"
                                                >
                                                    <div className="w-3 h-3 rounded-full mr-2 shrink-0" style={{ backgroundColor: tag.color }} />
                                                    <span className="truncate">{tag.name}</span>
                                                    {isSelected && <Check className="ml-auto w-3 h-3 opacity-50 shrink-0" />}
                                                    {!isSelected && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteSavedTag(tag) }}
                                                            className="ml-auto opacity-0 group-hover/item:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
                                                            title="Quitar de biblioteca"
                                                        >
                                                            <Trash size={12} />
                                                        </button>
                                                    )}
                                                </CommandItem>
                                            )
                                        })}
                                    </CommandGroup>
                                )}
                                {/* Etiquetas no guardadas (solo en leads) */}
                                {availableTags.filter(t => !savedTagIds.has(t.id)).length > 0 && (
                                    <>
                                        <CommandSeparator />
                                        <CommandGroup heading="En uso">
                                            {availableTags.filter(t => !savedTagIds.has(t.id)).map(tag => {
                                                const isSelected = currentTags.some(t => t.id === tag.id)
                                                return (
                                                    <CommandItem
                                                        key={tag.id}
                                                        onSelect={() => handleSelectTag(tag)}
                                                        disabled={isSelected}
                                                        className="text-xs group/item"
                                                    >
                                                        <div className="w-3 h-3 rounded-full mr-2 shrink-0" style={{ backgroundColor: tag.color }} />
                                                        <span className="truncate">{tag.name}</span>
                                                        {isSelected && <Check className="ml-auto w-3 h-3 opacity-50 shrink-0" />}
                                                        {!isSelected && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleSaveTagToPersist(tag) }}
                                                                className="ml-auto opacity-0 group-hover/item:opacity-100 text-muted-foreground hover:text-primary transition-opacity shrink-0"
                                                                title="Guardar en biblioteca"
                                                            >
                                                                <BookmarkSimple size={12} />
                                                            </button>
                                                        )}
                                                    </CommandItem>
                                                )
                                            })}
                                        </CommandGroup>
                                    </>
                                )}
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
            </div>

            <div className="flex flex-wrap gap-1.5">
                {currentTags && currentTags.length > 0 ? (
                    currentTags.map(tag => (
                        <Badge
                            key={tag.id}
                            className="text-[10px] font-medium px-2 py-0.5 h-6 gap-1 pr-1 group hover:ring-1 hover:ring-offset-1 transition-all cursor-default"
                            style={{ backgroundColor: tag.color + '20', color: tag.color, borderColor: tag.color + '40' }}
                            variant="outline"
                        >
                            {tag.name}
                            <button
                                onClick={() => handleRemoveTag(tag.id)}
                                className="hover:bg-red-500 hover:text-white rounded-full p-0.5 transition-colors opacity-0 group-hover:opacity-100"
                            >
                                <X size={10} weight="bold" />
                            </button>
                        </Badge>
                    ))
                ) : (
                    <div className="text-xs text-muted-foreground italic opacity-60">Sin etiquetas</div>
                )}
            </div>
        </div>
    )
}
