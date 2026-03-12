import { useEffect, useState } from 'react'
import { getCompanyHistory } from '@/supabase/services/history'
import type { LeadHistory } from '@/lib/types'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
    Clock,
    UserPlus,
    ArrowsLeftRight,
    CalendarPlus,
    TrendUp,
    Spinner,
    Funnel,
    MagnifyingGlass,
    ArrowsClockwise
} from '@phosphor-icons/react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface HistorialViewProps {
    companyId?: string
}

type FilterType = 'all' | 'creacion' | 'asignacion' | 'reasignacion' | 'etapa_cambio'

type HistoryEntry = LeadHistory & { lead_nombre?: string }

const FILTER_OPTIONS: { id: FilterType; label: string; color: string }[] = [
    { id: 'all', label: 'Todo', color: 'bg-muted text-muted-foreground' },
    { id: 'creacion', label: 'Creación', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-200' },
    { id: 'asignacion', label: 'Asignación', color: 'bg-blue-500/10 text-blue-600 border-blue-200' },
    { id: 'reasignacion', label: 'Reasignación', color: 'bg-purple-500/10 text-purple-600 border-purple-200' },
    { id: 'etapa_cambio', label: 'Cambio etapa', color: 'bg-amber-500/10 text-amber-600 border-amber-200' },
]

export function HistorialView({ companyId }: HistorialViewProps) {
    const [history, setHistory] = useState<HistoryEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<FilterType>('all')
    const [search, setSearch] = useState('')

    const loadHistory = async () => {
        if (!companyId) return
        setLoading(true)
        try {
            const data = await getCompanyHistory(companyId)
            setHistory(data)
        } catch (error) {
            console.error('[HistorialView] Error:', error)
            toast.error('No se pudo cargar el historial')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadHistory()
    }, [companyId])

    const getIcon = (accion: string) => {
        switch (accion) {
            case 'creacion': return <CalendarPlus size={18} className="text-emerald-500" weight="fill" />
            case 'asignacion': return <UserPlus size={18} className="text-blue-500" weight="fill" />
            case 'reasignacion': return <ArrowsLeftRight size={18} className="text-purple-500" weight="fill" />
            case 'etapa_cambio': return <TrendUp size={18} className="text-amber-500" weight="fill" />
            default: return <Clock size={18} className="text-muted-foreground" />
        }
    }

    const getAccionBadge = (accion: string) => {
        switch (accion) {
            case 'creacion': return 'bg-emerald-500/10 text-emerald-600 border-emerald-200/50'
            case 'asignacion': return 'bg-blue-500/10 text-blue-600 border-blue-200/50'
            case 'reasignacion': return 'bg-purple-500/10 text-purple-600 border-purple-200/50'
            case 'etapa_cambio': return 'bg-amber-500/10 text-amber-600 border-amber-200/50'
            default: return 'bg-muted text-muted-foreground border-border/50'
        }
    }

    const getAccionLabel = (accion: string) => {
        switch (accion) {
            case 'creacion': return 'Creación'
            case 'asignacion': return 'Asignación'
            case 'reasignacion': return 'Reasignación'
            case 'etapa_cambio': return 'Cambio de Etapa'
            default: return accion
        }
    }

    const filteredHistory = history.filter(entry => {
        const matchesFilter = filter === 'all' || entry.accion === filter
        const searchLower = search.toLowerCase()
        const matchesSearch = !search ||
            entry.lead_nombre?.toLowerCase().includes(searchLower) ||
            entry.detalle.toLowerCase().includes(searchLower) ||
            entry.usuario_nombre?.toLowerCase().includes(searchLower)
        return matchesFilter && matchesSearch
    })

    return (
        <div className="flex flex-col h-full bg-background overflow-hidden">
            {/* Header */}
            <div className="flex-none px-6 pt-8 pb-4 border-b border-border/50 bg-gradient-to-b from-muted/10 to-transparent">
                <div className="max-w-5xl mx-auto">
                    <div className="flex items-center justify-between mb-6">
                        <div className="space-y-1">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
                                    <Clock size={22} className="text-primary" weight="duotone" />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-black tracking-tight text-foreground">Historial</h1>
                                    <p className="text-xs text-muted-foreground font-medium">
                                        Registro de actividad de todas las oportunidades
                                    </p>
                                </div>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={loadHistory}
                            disabled={loading}
                            className="gap-2 rounded-xl border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-all"
                        >
                            <ArrowsClockwise
                                size={15}
                                weight="bold"
                                className={cn("text-primary", loading && "animate-spin")}
                            />
                            <span className="text-xs font-bold">Actualizar</span>
                        </Button>
                    </div>

                    {/* Search */}
                    <div className="relative mb-4">
                        <MagnifyingGlass
                            size={16}
                            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50"
                        />
                        <Input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar por oportunidad, usuario o acción..."
                            className="pl-10 h-10 rounded-xl border-border/50 bg-muted/20 focus:bg-background transition-colors text-sm"
                        />
                    </div>

                    {/* Filters */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <Funnel size={14} className="text-muted-foreground/50 shrink-0" />
                        {FILTER_OPTIONS.map(opt => (
                            <button
                                key={opt.id}
                                onClick={() => setFilter(opt.id)}
                                className={cn(
                                    "px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border transition-all",
                                    filter === opt.id
                                        ? opt.color + " ring-2 ring-current/20 scale-105"
                                        : "bg-muted/30 text-muted-foreground border-border/30 hover:bg-muted/60"
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                        {history.length > 0 && (
                            <span className="ml-auto text-[11px] font-bold text-muted-foreground/60 bg-muted/30 px-2.5 py-1 rounded-full border border-border/20">
                                {filteredHistory.length} evento{filteredHistory.length !== 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                        <Spinner size={36} className="animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground font-medium animate-pulse">
                            Cargando historial...
                        </p>
                    </div>
                ) : filteredHistory.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6">
                        <div className="bg-muted/30 p-8 rounded-full mb-5 ring-1 ring-border/50">
                            <Clock size={52} className="text-muted-foreground/25" weight="duotone" />
                        </div>
                        <h3 className="text-xl font-black text-foreground tracking-tight">
                            {search || filter !== 'all' ? 'Sin resultados' : 'Sin historial todavía'}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-2 max-w-[300px]">
                            {search || filter !== 'all'
                                ? 'No hay eventos que coincidan con tu búsqueda o filtro.'
                                : 'Las asignaciones, creaciones y reasignaciones de oportunidades aparecerán aquí.'}
                        </p>
                    </div>
                ) : (
                    <ScrollArea className="h-full">
                        <div className="max-w-5xl mx-auto px-6 py-8">
                            <div className="relative space-y-6 before:absolute before:inset-0 before:ml-[18px] before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border/40 before:to-transparent">
                                {filteredHistory.map((entry) => (
                                    <div key={entry.id} className="relative flex items-start gap-5 group">
                                        {/* Timeline node */}
                                        <div className="relative z-10 flex items-center justify-center w-9 h-9 rounded-full bg-background border-2 border-border shadow-sm group-hover:border-primary/30 group-hover:shadow-md transition-all shrink-0 mt-0.5">
                                            {getIcon(entry.accion)}
                                        </div>

                                        {/* Card */}
                                        <div className="flex-1 bg-card border border-border/50 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-border/80 transition-all group-hover:translate-x-0.5">
                                            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                                                <div className="flex-1 min-w-0 space-y-1">
                                                    {/* Lead name */}
                                                    <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/50">
                                                        Oportunidad
                                                    </p>
                                                    <h3 className="font-bold text-foreground text-sm leading-tight truncate">
                                                        {entry.lead_nombre || 'Oportunidad desconocida'}
                                                    </h3>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <Badge
                                                        variant="outline"
                                                        className={cn(
                                                            "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border",
                                                            getAccionBadge(entry.accion)
                                                        )}
                                                    >
                                                        {getAccionLabel(entry.accion)}
                                                    </Badge>
                                                    <span className="text-[10px] font-bold text-muted-foreground/50 bg-muted/30 px-2 py-0.5 rounded-full border border-border/20 whitespace-nowrap">
                                                        {format(new Date(entry.created_at), "HH:mm · dd MMM yyyy", { locale: es })}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Detail */}
                                            <p className="text-sm text-foreground/80 font-medium leading-relaxed mb-3">
                                                {entry.detalle}
                                            </p>

                                            {/* Footer */}
                                            <div className="flex items-center gap-2 pt-2 border-t border-border/30">
                                                <span className="w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" />
                                                <span className="text-xs font-medium text-muted-foreground">
                                                    Por: <span className="text-foreground/80 font-bold">{entry.usuario_nombre}</span>
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {/* Bottom padding */}
                            <div className="h-8" />
                        </div>
                    </ScrollArea>
                )}
            </div>
        </div>
    )
}
