import React, { useEffect, useState } from 'react'
import { getCompanyActivity } from '@/supabase/services/activityLog'
import type { ActividadCRM } from '@/lib/types'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
    Clock,
    UserPlus,
    UserMinus,
    ArrowsLeftRight,
    CalendarPlus,
    TrendUp,
    Spinner,
    Funnel,
    MagnifyingGlass,
    ArrowsClockwise,
    Trash,
    Archive,
    ChatCircleDots,
    Users,
    Tag,
    NotePencil,
    CalendarCheck,
    Kanban,
    ShieldCheck
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

type FilterType = 'all' | 'leads' | 'mensajes' | 'equipo' | 'pipeline' | 'tags' | 'notas' | 'reuniones'

const FILTER_OPTIONS: { id: FilterType; label: string; color: string }[] = [
    { id: 'all', label: 'Todo', color: 'bg-muted text-muted-foreground' },
    { id: 'leads', label: 'Oportunidades', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-200' },
    { id: 'mensajes', label: 'Mensajes', color: 'bg-orange-500/10 text-orange-600 border-orange-200' },
    { id: 'equipo', label: 'Equipo', color: 'bg-blue-500/10 text-blue-600 border-blue-200' },
    { id: 'pipeline', label: 'Pipeline', color: 'bg-violet-500/10 text-violet-600 border-violet-200' },
    { id: 'tags', label: 'Etiquetas', color: 'bg-pink-500/10 text-pink-600 border-pink-200' },
    { id: 'notas', label: 'Notas', color: 'bg-amber-500/10 text-amber-600 border-amber-200' },
    { id: 'reuniones', label: 'Reuniones', color: 'bg-teal-500/10 text-teal-600 border-teal-200' },
]

const CATEGORIA_ICON: Record<string, (accion: string) => React.ReactNode> = {
    leads: (accion) => {
        if (accion.includes('eliminar')) return <Trash size={18} className="text-red-500" weight="fill" />
        if (accion.includes('archivar')) return <Archive size={18} className="text-amber-500" weight="fill" />
        if (accion.includes('desarchivar')) return <Archive size={18} className="text-emerald-500" weight="fill" />
        if (accion.includes('mover')) return <TrendUp size={18} className="text-amber-500" weight="fill" />
        if (accion.includes('asigna')) return <UserPlus size={18} className="text-blue-500" weight="fill" />
        return <CalendarPlus size={18} className="text-emerald-500" weight="fill" />
    },
    mensajes: () => <ChatCircleDots size={18} className="text-orange-500" weight="fill" />,
    equipo: (accion) => {
        if (accion.includes('eliminar') || accion.includes('abandonar')) return <UserMinus size={18} className="text-red-500" weight="fill" />
        if (accion.includes('rol')) return <ShieldCheck size={18} className="text-purple-500" weight="fill" />
        return <UserPlus size={18} className="text-blue-500" weight="fill" />
    },
    pipeline: () => <Kanban size={18} className="text-violet-500" weight="fill" />,
    etapas: () => <Kanban size={18} className="text-violet-500" weight="fill" />,
    tags: () => <Tag size={18} className="text-pink-500" weight="fill" />,
    notas: () => <NotePencil size={18} className="text-amber-500" weight="fill" />,
    reuniones: () => <CalendarCheck size={18} className="text-teal-500" weight="fill" />,
}

const CATEGORIA_BADGE: Record<string, string> = {
    leads: 'bg-emerald-500/10 text-emerald-600 border-emerald-200/50',
    mensajes: 'bg-orange-500/10 text-orange-600 border-orange-200/50',
    equipo: 'bg-blue-500/10 text-blue-600 border-blue-200/50',
    pipeline: 'bg-violet-500/10 text-violet-600 border-violet-200/50',
    etapas: 'bg-violet-500/10 text-violet-600 border-violet-200/50',
    tags: 'bg-pink-500/10 text-pink-600 border-pink-200/50',
    notas: 'bg-amber-500/10 text-amber-600 border-amber-200/50',
    reuniones: 'bg-teal-500/10 text-teal-600 border-teal-200/50',
}

const CATEGORIA_LABEL: Record<string, string> = {
    leads: 'Oportunidades',
    mensajes: 'Mensajes',
    equipo: 'Equipo',
    pipeline: 'Pipeline',
    etapas: 'Etapas',
    tags: 'Etiquetas',
    notas: 'Notas',
    reuniones: 'Reuniones',
}

export function HistorialView({ companyId }: HistorialViewProps) {
    const [activity, setActivity] = useState<ActividadCRM[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<FilterType>('all')
    const [search, setSearch] = useState('')

    const loadActivity = async () => {
        if (!companyId) return
        setLoading(true)
        try {
            const data = await getCompanyActivity(companyId)
            setActivity(data)
        } catch (error) {
            console.error('[HistorialView] Error:', error)
            toast.error('No se pudo cargar el historial')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadActivity()
    }, [companyId])

    const getIcon = (entry: ActividadCRM) => {
        const iconFn = CATEGORIA_ICON[entry.categoria]
        if (iconFn) return iconFn(entry.accion)
        return <Clock size={18} className="text-muted-foreground" />
    }

    const filteredActivity = activity.filter(entry => {
        const matchesFilter = filter === 'all' || entry.categoria === filter
        const searchLower = search.toLowerCase()
        const matchesSearch = !search ||
            entry.detalle.toLowerCase().includes(searchLower) ||
            entry.usuario_nombre?.toLowerCase().includes(searchLower) ||
            entry.entidad_nombre?.toLowerCase().includes(searchLower) ||
            entry.accion.toLowerCase().includes(searchLower)
        return matchesFilter && matchesSearch
    })

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden">
            {/* Header */}
            <div className="flex-none px-4 sm:px-6 pt-5 sm:pt-8 pb-4 border-b border-border/50 bg-gradient-to-b from-muted/10 to-transparent">
                <div className="max-w-5xl mx-auto">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-5 sm:mb-6">
                        <div className="space-y-1">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
                                    <Clock size={20} className="text-primary sm:w-[22px] sm:h-[22px]" weight="duotone" />
                                </div>
                                <div>
                                    <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">Historial</h1>
                                    <p className="text-xs text-muted-foreground font-medium">
                                        Registro de toda la actividad en tu empresa
                                    </p>
                                </div>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={loadActivity}
                            disabled={loading}
                            className="gap-2 rounded-xl border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-all h-10 w-full sm:w-auto"
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
                            placeholder="Buscar por acción, usuario o entidad..."
                            className="pl-10 h-10 rounded-xl border-border/50 bg-muted/20 focus:bg-background transition-colors text-sm"
                        />
                    </div>

                    {/* Filters */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                        <Funnel size={14} className="text-muted-foreground/50 shrink-0" />
                        {FILTER_OPTIONS.map(opt => (
                            <button
                                key={opt.id}
                                onClick={() => setFilter(opt.id)}
                                className={cn(
                                    "px-3 py-2 rounded-full text-[11px] font-bold uppercase tracking-wider border transition-all whitespace-nowrap flex-none min-h-9",
                                    filter === opt.id
                                        ? opt.color + " ring-2 ring-current/20 scale-105"
                                        : "bg-muted/30 text-muted-foreground border-border/30 hover:bg-muted/60"
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                        {activity.length > 0 && (
                            <span className="ml-auto text-[11px] font-bold text-muted-foreground/60 bg-muted/30 px-2.5 py-1 rounded-full border border-border/20">
                                {filteredActivity.length} evento{filteredActivity.length !== 1 ? 's' : ''}
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
                ) : filteredActivity.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6">
                        <div className="bg-muted/30 p-8 rounded-full mb-5 ring-1 ring-border/50">
                            <Clock size={52} className="text-muted-foreground/25" weight="duotone" />
                        </div>
                        <h3 className="text-xl font-black text-foreground tracking-tight">
                            {search || filter !== 'all' ? 'Sin resultados' : 'Sin actividad todavía'}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-2 max-w-[300px]">
                            {search || filter !== 'all'
                                ? 'No hay eventos que coincidan con tu búsqueda o filtro.'
                                : 'Las acciones realizadas en el CRM aparecerán aquí.'}
                        </p>
                    </div>
                ) : (
                    <ScrollArea className="h-full">
                        <div className="max-w-5xl mx-auto px-6 py-8">
                            <div className="relative space-y-6 before:absolute before:inset-0 before:ml-[18px] before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border/40 before:to-transparent">
                                {filteredActivity.map((entry) => (
                                    <div key={entry.id} className="relative flex items-start gap-5 group">
                                        {/* Timeline node */}
                                        <div className="relative z-10 flex items-center justify-center w-9 h-9 rounded-full bg-background border-2 border-border shadow-sm group-hover:border-primary/30 group-hover:shadow-md transition-all shrink-0 mt-0.5">
                                            {getIcon(entry)}
                                        </div>

                                        {/* Card */}
                                        <div className="flex-1 min-w-0 bg-card border border-border/50 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-border/80 transition-all group-hover:translate-x-0.5">

                                            <div className="flex flex-col gap-2 mb-3">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Badge
                                                        variant="outline"
                                                        className={cn(
                                                            "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border",
                                                            CATEGORIA_BADGE[entry.categoria] || 'bg-muted text-muted-foreground border-border/50'
                                                        )}
                                                    >
                                                        {CATEGORIA_LABEL[entry.categoria] || entry.categoria}
                                                    </Badge>
                                                    <span className="text-[10px] font-bold text-muted-foreground/50 bg-muted/30 px-2 py-0.5 rounded-full border border-border/20 whitespace-nowrap truncate max-w-full">
                                                        {format(new Date(entry.created_at), "HH:mm · dd MMM yyyy", { locale: es })}
                                                    </span>
                                                </div>

                                                {entry.entidad_nombre && (
                                                    <div className="flex-1 min-w-0 space-y-0.5">
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">
                                                            {entry.entidad_tipo || entry.categoria}
                                                        </p>
                                                        <h3 className="font-bold text-foreground text-sm leading-tight break-words whitespace-normal">
                                                            {entry.entidad_nombre}
                                                        </h3>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Detail */}
                                            <p className="text-sm text-foreground/80 font-medium leading-relaxed mb-3">
                                                {entry.detalle}
                                            </p>

                                            {/* Footer */}
                                            <div className="flex items-center gap-2 pt-2 border-t border-border/30">
                                                <span className="w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" />
                                                <span className="text-xs font-medium text-muted-foreground">
                                                    Por: <span className="text-foreground/80 font-bold">{entry.usuario_nombre || 'Sistema'}</span>
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="h-8" />
                        </div>
                    </ScrollArea>
                )}
            </div>
        </div>
    )
}
