import { useEffect, useState } from 'react'
import { LeadHistory } from '@/lib/types'
import { getLeadHistory } from '@/supabase/services/history'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
    Clock,
    UserPlus,
    ArrowsLeftRight,
    CalendarPlus,
    TrendUp,
    Spinner,
    Tag
} from '@phosphor-icons/react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface HistoryTabProps {
    leadId: string
}

export function HistoryTab({ leadId }: HistoryTabProps) {
    const [history, setHistory] = useState<LeadHistory[]>([])
    const [loading, setLoading] = useState(true)

    const loadHistory = async () => {
        setLoading(true)
        try {
            const data = await getLeadHistory(leadId)
            setHistory(data)
        } catch (error) {
            console.error('[HistoryTab] Error:', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (leadId) {
            loadHistory()
        }
    }, [leadId])

    const getIcon = (accion: string) => {
        switch (accion) {
            case 'creacion': return <CalendarPlus size={18} className="text-emerald-500" weight="fill" />
            case 'asignacion': return <UserPlus size={18} className="text-blue-500" weight="fill" />
            case 'reasignacion': return <ArrowsLeftRight size={18} className="text-purple-500" weight="fill" />
            case 'etapa_cambio': return <TrendUp size={18} className="text-amber-500" weight="fill" />
            default: return <Clock size={18} className="text-muted-foreground" />
        }
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Spinner size={32} className="animate-spin text-primary" />
                <p className="text-sm text-muted-foreground font-medium animate-pulse">Cargando historial...</p>
            </div>
        )
    }

    if (history.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                <div className="bg-muted/30 p-6 rounded-full mb-4 ring-1 ring-border/50">
                    <Clock size={48} className="text-muted-foreground/30" weight="duotone" />
                </div>
                <h3 className="text-lg font-bold text-foreground">Sin historial todavía</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-[260px]">
                    Las acciones importantes aparecerán aquí conforme ocurran.
                </p>
            </div>
        )
    }

    return (
        <ScrollArea className="h-full pr-4">
            <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border/50 before:to-transparent pb-10">
                {history.map((entry, idx) => (
                    <div key={entry.id} className="relative flex items-start gap-6 group">
                        {/* Timeline Circle & Icon */}
                        <div className="relative z-10 flex items-center justify-center w-10 h-10 rounded-full bg-background border-2 border-border shadow-sm group-hover:border-primary/30 group-hover:shadow-md transition-all shrink-0">
                            {getIcon(entry.accion)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 space-y-1.5 pt-1.5 min-w-0">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h4 className="text-sm font-bold text-foreground tracking-tight">
                                    {entry.detalle}
                                </h4>
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 bg-muted/30 px-2 py-0.5 rounded-full border border-border/20">
                                    {format(new Date(entry.created_at), "HH:mm '·' dd MMM", { locale: es })}
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                                    Por: <span className="text-foreground/80 font-bold">{entry.usuario_nombre}</span>
                                </span>
                            </div>

                            {entry.metadata && (entry.accion === 'asignacion' || entry.accion === 'reasignacion') && (
                                <div className="mt-2 p-2 rounded-lg bg-primary/5 border border-primary/10 inline-block">
                                    <p className="text-[10px] font-bold text-primary/70 uppercase tracking-wider">
                                        ID Destino: {entry.metadata.new_assigned_to?.slice(0, 8)}...
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </ScrollArea>
    )
}
