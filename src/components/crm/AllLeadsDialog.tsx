import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Lead } from '@/lib/types'
import { MagnifyingGlass, Spinner, X } from '@phosphor-icons/react'

interface AllLeadsDialogProps {
    memberName: string
    leads: Lead[]
    /**
     * Callback al hacer clic en una oportunidad. Recibe el objeto Lead completo
     * para que el caller pueda usarlo para navegación tipo "buscador global"
     * (guardar leadData en sessionStorage y abrirlo en el pipeline).
     */
    onLeadClick?: (lead: Lead) => void
    trigger?: React.ReactNode
}

// Cuántos leads renderizar inicialmente. Renderizar miles de DOM nodes de golpe
// congela el navegador, así que pintamos en bloques y mostramos "Cargar más".
const PAGE_SIZE = 100
// Cuánto agregar cada vez que el usuario pulsa "Cargar más".
const LOAD_MORE_STEP = 200
// Tope cuando hay búsqueda activa: muestra hasta este número en una sola tanda.
// Si la búsqueda devuelve más que esto, se le pide al usuario que refine.
const SEARCH_RENDER_CAP = 500

export function AllLeadsDialog({ memberName, leads, onLeadClick, trigger }: AllLeadsDialogProps) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const [renderLimit, setRenderLimit] = useState(PAGE_SIZE)
    // `isPreparing` muestra el spinner mientras el modal abre con muchos leads:
    // diferimos el primer render para que el diálogo aparezca al instante.
    const [isPreparing, setIsPreparing] = useState(false)

    const handleLeadClick = (lead: Lead) => {
        setOpen(false)
        if (onLeadClick) {
            onLeadClick(lead)
        }
    }

    // Al abrir: resetear estado + diferir el render de la lista grande.
    useEffect(() => {
        if (!open) return
        setSearch('')
        setRenderLimit(PAGE_SIZE)
        setIsPreparing(true)
        // setTimeout(0) cede el hilo principal para que el modal pinte el header
        // y el spinner antes de empezar a montar 100+ tarjetas.
        const id = window.setTimeout(() => setIsPreparing(false), 0)
        return () => window.clearTimeout(id)
    }, [open])

    // Filtro por buscador. Compara contra name, company, phone y email.
    const filteredLeads = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return leads
        return leads.filter(l => {
            const name = (l.name || '').toLowerCase()
            const company = (l.company || '').toLowerCase()
            const phone = (l.phone || '').toLowerCase()
            const email = (l.email || '').toLowerCase()
            return name.includes(q) || company.includes(q) || phone.includes(q) || email.includes(q)
        })
    }, [leads, search])

    // Cada vez que cambia la búsqueda, volver a la primera "página".
    useEffect(() => {
        setRenderLimit(PAGE_SIZE)
    }, [search])

    const isSearching = search.trim().length > 0

    // Cuando hay búsqueda activa, ignoramos la paginación y mostramos hasta
    // SEARCH_RENDER_CAP resultados en una sola tanda. Si hay más, le pedimos
    // al usuario que refine. Sin búsqueda, paginación normal.
    const effectiveLimit = isSearching ? SEARCH_RENDER_CAP : renderLimit
    const visibleLeads = filteredLeads.slice(0, effectiveLimit)
    const hasMore = !isSearching && filteredLeads.length > renderLimit
    const searchOverflow = isSearching && filteredLeads.length > SEARCH_RENDER_CAP

    return (
        <>
            {trigger ? (
                <div onClick={() => setOpen(true)}>
                    {trigger}
                </div>
            ) : (
                <button
                    onClick={() => setOpen(true)}
                    className="w-full text-xs text-muted-foreground hover:text-foreground text-center py-2 rounded-md hover:bg-muted/50 transition-colors font-medium"
                >
                    +{leads.length - 2} más • Click para ver todos
                </button>
            )}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl lg:max-w-4xl max-h-[92vh] overflow-hidden p-0 flex flex-col">
                    <DialogHeader className="p-4 sm:p-6 border-b border-border flex-none">
                        <DialogTitle className="truncate" title={`Todas las Oportunidades de ${memberName}`}>
                            Todas las Oportunidades de {memberName}
                        </DialogTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                            {isSearching
                                ? `${filteredLeads.length.toLocaleString()} de ${leads.length.toLocaleString()} oportunidad${leads.length === 1 ? '' : 'es'}`
                                : `${leads.length.toLocaleString()} oportunidad${leads.length === 1 ? '' : 'es'} asignada${leads.length === 1 ? '' : 's'}`}
                        </p>

                        {/* Buscador */}
                        {leads.length > 0 && (
                            <div className="mt-3 space-y-1.5">
                                <div className="relative">
                                    <MagnifyingGlass
                                        size={16}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                                    />
                                    <Input
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Buscar por nombre, empresa, teléfono o email..."
                                        className="pl-9 pr-9 h-9"
                                    />
                                    {search && (
                                        <button
                                            type="button"
                                            onClick={() => setSearch('')}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
                                            aria-label="Limpiar búsqueda"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                                {/* Hint para que quede claro que el buscador busca en TODAS */}
                                {isSearching && (
                                    <p className="text-xs text-muted-foreground/80 pl-1">
                                        Buscando en las {leads.length.toLocaleString()} oportunidades del miembro.
                                    </p>
                                )}
                            </div>
                        )}
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                        {leads.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">
                                Este miembro no tiene oportunidades asignadas.
                            </p>
                        ) : isPreparing ? (
                            // Spinner mientras React monta la primera tanda. Con 5k+ leads
                            // sin esto el modal parece colgado por 1-2 segundos.
                            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                                <Spinner size={28} className="animate-spin" />
                                <p className="text-sm font-medium">
                                    Cargando {leads.length.toLocaleString()} oportunidades…
                                </p>
                                <p className="text-xs">Esto puede tardar unos segundos cuando hay muchas.</p>
                            </div>
                        ) : filteredLeads.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">
                                No se encontraron oportunidades para "{search}".
                            </p>
                        ) : (
                            <>
                                <div className="grid gap-3">
                                    {visibleLeads.map(lead => (
                                        <button
                                            key={lead.id}
                                            onClick={() => handleLeadClick(lead)}
                                            className="flex items-start gap-3 p-3 sm:p-4 rounded-lg hover:bg-muted/80 transition-colors border border-border hover:border-primary text-left w-full cursor-pointer"
                                        >
                                            <div className={`w-3 h-3 rounded-full mt-1 shrink-0 ${
                                                lead.priority === 'high' ? 'bg-red-500 shadow-md shadow-red-500/50' :
                                                lead.priority === 'medium' ? 'bg-yellow-500 shadow-md shadow-yellow-500/50' :
                                                'bg-green-500 shadow-md shadow-green-500/50'
                                            }`} />
                                            <div className="flex-1 min-w-0 space-y-1">
                                                <p className="font-semibold truncate" title={lead.name}>{lead.name}</p>
                                                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-y-1 sm:gap-x-3 text-sm text-muted-foreground">
                                                    {lead.company && <span className="truncate" title={lead.company}>🏢 {lead.company}</span>}
                                                    {lead.phone && <span className="truncate">📱 {lead.phone}</span>}
                                                    {lead.email && <span className="truncate" title={lead.email}>✉️ {lead.email}</span>}
                                                </div>
                                                {lead.budget ? (
                                                    <p className="text-sm mt-1 font-medium text-green-600">💰 ${lead.budget.toLocaleString()}</p>
                                                ) : null}
                                            </div>
                                            <Badge variant={
                                                lead.priority === 'high' ? 'destructive' :
                                                lead.priority === 'medium' ? 'default' : 'secondary'
                                            } className="shrink-0 self-start">
                                                {lead.priority === 'high' ? 'Alta' : lead.priority === 'medium' ? 'Media' : 'Baja'}
                                            </Badge>
                                        </button>
                                    ))}
                                </div>

                                {hasMore && (
                                    <div className="flex justify-center mt-4">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setRenderLimit(prev => prev + LOAD_MORE_STEP)}
                                        >
                                            Cargar {Math.min(LOAD_MORE_STEP, filteredLeads.length - renderLimit).toLocaleString()} más
                                            <span className="text-muted-foreground ml-1">
                                                ({(filteredLeads.length - renderLimit).toLocaleString()} restantes)
                                            </span>
                                        </Button>
                                    </div>
                                )}

                                {/* Cuando la búsqueda devuelve más de lo que mostramos en una tanda */}
                                {searchOverflow && (
                                    <div className="mt-4 px-3 py-2 rounded-md border border-yellow-300/60 bg-yellow-50 dark:bg-yellow-950/20 text-xs text-yellow-800 dark:text-yellow-200 text-center">
                                        Mostrando los primeros {SEARCH_RENDER_CAP.toLocaleString()} resultados de {filteredLeads.length.toLocaleString()}. Refina tu búsqueda para acotar.
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
