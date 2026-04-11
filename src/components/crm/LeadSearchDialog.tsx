import { useState, useEffect, useRef } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Lead, Pipeline } from '@/lib/types'
import { MagnifyingGlass, User, Phone, Buildings, Trash, Spinner, Tag, MapPin, Funnel } from '@phosphor-icons/react'
import { toast } from 'sonner'

interface LeadSearchDialogProps {
    leads?: Lead[]
    pipelines?: Pipeline[]
    onSelectLead: (lead: Lead) => void
    canDelete?: boolean
    onDeleteLeads?: (ids: string[]) => Promise<void>
    onSearch?: (term: string) => Promise<Lead[]>
    onNavigateToLead?: (lead: Lead) => void
}

export function LeadSearchDialog({ leads = [], pipelines = [], onSelectLead, canDelete, onDeleteLeads, onSearch, onNavigateToLead }: LeadSearchDialogProps) {
    const [open, setOpen] = useState(false)
    // ...

    // Helper to get pipeline info
    const getPipelineInfo = (lead: Lead) => {
        if (!pipelines.length) return null

        // Find pipeline
        const pipeline = pipelines.find(p => p.id === lead.pipeline || p.type === lead.pipeline)
        if (!pipeline) return null

        // Find stage
        const stage = pipeline.stages.find(s => s.id === lead.stage)

        return {
            pipelineName: pipeline.name,
            stageName: stage?.name || 'Unknown Stage',
            stageColor: stage?.color
        }
    }

    // ... (inside map)

    const [searchTerm, setSearchTerm] = useState('')
    const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set())
    const [isDeleting, setIsDeleting] = useState(false)
    const [searchResults, setSearchResults] = useState<Lead[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // Filtro local por campos principales (cuando no hay onSearch)
    const localFilteredLeads = leads.filter(lead => {
        if (!searchTerm.trim() || onSearch) return false

        const search = searchTerm.toLowerCase()
        const tagsArr = (lead.tags || [])
        const hasTagMatch = Array.isArray(tagsArr) && tagsArr.some((tag: any) => {
            const name = typeof tag === 'string' ? tag : (tag?.name || '')
            return (name || '').toLowerCase().includes(search)
        })

        return (
            (lead.name || '').toLowerCase().includes(search) ||
            (lead.email || '').toLowerCase().includes(search) ||
            (lead.phone || '').toLowerCase().includes(search) ||
            (lead.company || '').toLowerCase().includes(search) ||
            hasTagMatch
        )
    })

    // Siempre intentar agregar coincidencias locales por etiquetas
    const localTagMatches = leads.filter(lead => {
        if (!searchTerm.trim()) return false
        const search = searchTerm.toLowerCase()
        const tagsArr = (lead.tags || [])
        if (!Array.isArray(tagsArr) || tagsArr.length === 0) return false
        return tagsArr.some((tag: any) => {
            const name = typeof tag === 'string' ? tag : (tag?.name || '')
            return (name || '').toLowerCase().includes(search)
        })
    })

    // Unir resultados remotos (si existen) con coincidencias locales por etiquetas
    const displayLeads = (() => {
        if (onSearch) {
            const byId = new Map<string, Lead>()
                ; (searchResults || []).forEach(l => byId.set(l.id, l))
            localTagMatches.forEach(l => byId.set(l.id, l))
            return Array.from(byId.values())
        }
        return localFilteredLeads
    })()

    useEffect(() => {
        if (!onSearch) return

        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current)
        }

        if (!searchTerm.trim()) {
            setSearchResults([])
            return
        }

        setIsSearching(true)
        searchTimeoutRef.current = setTimeout(async () => {
            try {
                const results = await onSearch(searchTerm)
                setSearchResults(results)
            } catch (error) {
                console.error("Error searching leads:", error)
            } finally {
                setIsSearching(false)
            }
        }, 500)

        return () => {
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
        }
    }, [searchTerm, onSearch])


    const handleSelectLead = (lead: Lead) => {
        setOpen(false)
        setSearchTerm('')
        setSearchResults([])
        onSelectLead(lead)
    }

    const toggleSelection = (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        const next = new Set(selectedLeads)
        if (next.has(id)) {
            next.delete(id)
        } else {
            next.add(id)
        }
        setSelectedLeads(next)
    }

    const handleSelectAll = () => {
        const allFilteredIds = displayLeads.map(l => l.id)
        const allSelected = allFilteredIds.every(id => selectedLeads.has(id))

        const next = new Set(selectedLeads)
        if (allSelected) {
            allFilteredIds.forEach(id => next.delete(id))
        } else {
            allFilteredIds.forEach(id => next.add(id))
        }
        setSelectedLeads(next)
    }

    const handleDeleteSelected = async () => {
        if (selectedLeads.size === 0 || !onDeleteLeads) return

        if (!confirm(`¿Estás seguro de que deseas eliminar ${selectedLeads.size} oportunidades seleccionadas? Esta acción no se puede deshacer.`)) {
            return
        }

        setIsDeleting(true)
        try {
            await onDeleteLeads(Array.from(selectedLeads))
            setSelectedLeads(new Set())
            // If local, filtered list updates automatically via parent props triggering re-render
            // If remote, we should remove them from results manually to feel responsive
            if (onSearch) {
                setSearchResults(prev => prev.filter(l => !selectedLeads.has(l.id)))
            }
            toast.success(`Se eliminaron ${selectedLeads.size} oportunidades`)
        } catch (error) {
            console.error(error)
            toast.error('Error al eliminar oportunidades')
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <>
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(true)}
                className="gap-1.5 text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted/80 font-medium transition-all h-9 px-4 rounded-full border border-border/50"
            >
                <MagnifyingGlass size={16} className="text-muted-foreground" />
                <span className="hidden sm:inline text-sm">Buscar Oportunidad</span>
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Buscar Oportunidades</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="relative">
                            <MagnifyingGlass className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por nombre, email, teléfono, empresa o etiqueta..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                                autoFocus
                            />
                            {isSearching && (
                                <div className="absolute right-3 top-3">
                                    <Spinner className="animate-spin h-4 w-4 text-primary" />
                                </div>
                            )}
                        </div>

                        {canDelete && displayLeads.length > 0 && (
                            <div className="flex items-center justify-between px-2 py-2 bg-muted/50 rounded-md">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        checked={displayLeads.length > 0 && displayLeads.every(l => selectedLeads.has(l.id))}
                                        onCheckedChange={handleSelectAll}
                                        id="select-all"
                                    />
                                    <label htmlFor="select-all" className="text-sm text-muted-foreground cursor-pointer select-none">
                                        Seleccionar todos ({displayLeads.length})
                                    </label>
                                </div>
                                {selectedLeads.size > 0 && (
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        className="h-7 text-xs px-2"
                                        onClick={handleDeleteSelected}
                                        disabled={isDeleting}
                                    >
                                        <Trash className="mr-1.5 w-3.5 h-3.5" />
                                        Eliminar ({selectedLeads.size})
                                    </Button>
                                )}
                            </div>
                        )}

                        <div className="max-h-[400px] overflow-y-auto space-y-2">
                            {searchTerm.trim() === '' ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <MagnifyingGlass size={48} className="mx-auto mb-3 opacity-50" />
                                    <p>Escribe para buscar oportunidades</p>
                                </div>
                            ) : displayLeads.length === 0 && !isSearching ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <p>No se encontraron resultados</p>
                                    <p className="text-sm mt-1">Prueba con otro término de búsqueda</p>
                                </div>
                            ) : (
                                displayLeads.map(lead => (
                                    <div
                                        key={lead.id}
                                        onClick={() => handleSelectLead(lead)}
                                        className="w-full text-left p-4 rounded-lg border border-border hover:border-primary hover:bg-muted/50 transition-all overflow-hidden group cursor-pointer"
                                    >
                                        <div className="flex items-start gap-3">
                                            {canDelete && (
                                                <div
                                                    className="pt-1 pr-2 flex items-center justify-center shrink-0"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <Checkbox
                                                        checked={selectedLeads.has(lead.id)}
                                                        onCheckedChange={(checked) => {
                                                            const next = new Set(selectedLeads)
                                                            if (checked) next.add(lead.id)
                                                            else next.delete(lead.id)
                                                            setSelectedLeads(next)
                                                        }}
                                                    />
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0 space-y-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <User size={16} className="text-muted-foreground shrink-0" />
                                                    <span className="font-semibold line-clamp-2 text-balance-any flex-1 min-w-0" title={lead.name}>{lead.name}</span>
                                                    <Badge variant={
                                                        lead.priority === 'high' ? 'destructive' :
                                                            lead.priority === 'medium' ? 'default' : 'secondary'
                                                    } className="shrink-0 text-xs">
                                                        {lead.priority === 'high' ? 'Alta' : lead.priority === 'medium' ? 'Media' : 'Baja'}
                                                    </Badge>
                                                </div>

                                                {lead.company && (
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                                                        <Buildings size={14} className="shrink-0" />
                                                        <span className="line-clamp-1 text-balance-any flex-1 min-w-0" title={lead.company}>{lead.company}</span>
                                                    </div>
                                                )}

                                                {lead.phone && (
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                        <Phone size={14} className="shrink-0" />
                                                        <span>{lead.phone}</span>
                                                    </div>
                                                )}

                                                {lead.budget && lead.budget > 0 && (
                                                    <div className="text-sm font-medium text-green-600">
                                                        💰 ${lead.budget.toLocaleString()}
                                                    </div>
                                                )}

                                                {/* Pipeline Context - NEW */}
                                                {(() => {
                                                    const info = getPipelineInfo(lead)
                                                    if (info) {
                                                        return (
                                                            <div className="flex items-center gap-1.5 mt-1">
                                                                <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-black/10 bg-muted/50 text-muted-foreground gap-1">
                                                                    <Funnel size={10} weight="fill" />
                                                                    {info.pipelineName}
                                                                </Badge>
                                                                <span className="text-[10px] text-muted-foreground">›</span>
                                                                <Badge
                                                                    className="text-[10px] h-5 px-1.5 border-0 text-white"
                                                                    style={{ backgroundColor: info.stageColor || '#94a3b8' }}
                                                                >
                                                                    {info.stageName}
                                                                </Badge>
                                                            </div>
                                                        )
                                                    }
                                                    return null
                                                })()}

                                                {/* Mostrar etiquetas */}
                                                {lead.tags && lead.tags.length > 0 && (
                                                    <div className="flex items-center gap-1 flex-wrap">
                                                        <Tag size={14} className="text-muted-foreground shrink-0" />
                                                        {lead.tags.slice(0, 3).map(tag => (
                                                            <Badge
                                                                key={tag.id}
                                                                variant="outline"
                                                                className="text-xs h-5 px-1.5"
                                                                style={{ borderColor: tag.color, color: tag.color }}
                                                            >
                                                                {tag.name}
                                                            </Badge>
                                                        ))}
                                                        {lead.tags.length > 3 && (
                                                            <Badge variant="outline" className="text-xs h-5 px-1.5">
                                                                +{lead.tags.length - 3}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Botón Ver en Pipeline */}
                                                {onNavigateToLead && (
                                                    <div className="pt-2">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-7 text-xs w-full gap-1.5"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                setOpen(false)
                                                                setSearchTerm('')
                                                                setSearchResults([])
                                                                onNavigateToLead(lead)
                                                            }}
                                                        >
                                                            <MapPin size={14} />
                                                            Ver ubicación oportunidad
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {displayLeads.length > 0 && (
                            <div className="text-xs text-center text-muted-foreground pt-2 border-t">
                                {displayLeads.length} resultado{displayLeads.length !== 1 ? 's' : ''} encontrado{displayLeads.length !== 1 ? 's' : ''}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
