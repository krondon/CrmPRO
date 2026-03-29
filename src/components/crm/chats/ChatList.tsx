/**
 * ChatList Component (Presentational)
 * 
 * Panel izquierdo del chat con:
 * - Barra de búsqueda (filtro local)
 * - Filtros (WhatsApp, Instagram, No leídos, Archivados)
 * - Lista virtualizada de contactos
 * 
 * NOTA: Este es un componente presentacional. Los datos vienen del padre.
 * Los filtros locales (searchTerm, channelFilter, unreadFilter) son internos.
 */

import { useState, useMemo, useRef, useEffect, memo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Lead } from '@/lib/types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
    MagnifyingGlass,
    WhatsappLogo,
    InstagramLogo,
    FacebookLogo,
    Check,
    ChatCircleDots,
    Spinner,
    X,
    Gear,
    CaretLeft,
    CaretRight
} from '@phosphor-icons/react'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { safeFormatDate } from '@/hooks/useDateFormat'
import type { ChatScope } from '@/hooks/useLeadsList'

interface ChatListProps {
    // Datos del padre
    leads: Lead[]
    isInitialLoading: boolean
    isFetchingMore: boolean
    loadError: string | null
    unreadCounts: Record<string, number>
    channelByLead: Record<string, 'whatsapp' | 'instagram' | 'facebook'>
    chatScope: ChatScope
    companyId: string

    // Estado de selección
    selectedLeadId: string | null
    onSelectLead: (leadId: string) => void

    // Acciones del padre
    onScopeChange: (scope: ChatScope) => void
    onLoadMore: () => void
    onRefresh: (forceRefresh?: boolean) => void
    onOpenSettings?: () => void

    // Búsqueda server-side
    searchTerm: string
    onSearchChange: (term: string) => void
    isSearching: boolean
}

export const ChatList = memo(function ChatList({
    leads,
    isInitialLoading,
    isFetchingMore,
    loadError,
    unreadCounts,
    channelByLead,
    chatScope,
    companyId,
    selectedLeadId,
    onSelectLead,
    onScopeChange,
    onLoadMore,
    onRefresh,
    onOpenSettings,
    searchTerm,
    onSearchChange,
    isSearching
}: ChatListProps) {
    // Estados de filtros LOCALES (solo afectan la vista, no la query)
    const [channelFilter, setChannelFilter] = useState<'all' | 'whatsapp' | 'instagram' | 'facebook'>('all')
    const [unreadFilter, setUnreadFilter] = useState(false)
    // El searchTerm ahora viene del padre (hook)

    // Refs
    const listParentRef = useRef<HTMLDivElement | null>(null)
    const filterScrollRef = useRef<HTMLDivElement | null>(null)

    // Filtrar y ordenar leads
    const sortedLeads = useMemo(() => {
        let filtered = leads

        // El hook ya filtra por searchTerm si hay búsqueda server-side.
        // Pero si estamos buscando, NO aplicamos filtros locales de canal/leídos para no confundir resultados.
        if (!searchTerm) {
            if (unreadFilter) filtered = filtered.filter(l => (unreadCounts[l.id] || 0) > 0)
            if (channelFilter !== 'all') filtered = filtered.filter(l => (channelByLead[l.id] || 'whatsapp') === channelFilter)
        }

        return filtered.sort((a, b) => {
            // 1. Prioridad ABSOLUTA: No leídos primero
            // Usar unreadCounts si ya cargó, sino inferir por lastMessageSender mientras carga
            const isUnreadA = (unreadCounts[a.id] || 0) > 0 || (unreadCounts[a.id] === undefined && (a as any).lastMessageSender === 'lead')
            const isUnreadB = (unreadCounts[b.id] || 0) > 0 || (unreadCounts[b.id] === undefined && (b as any).lastMessageSender === 'lead')

            if (isUnreadA !== isUnreadB) return isUnreadA ? -1 : 1

            const dateA = (a.lastMessageAt ? new Date(a.lastMessageAt) : a.createdAt || new Date(0)).getTime()
            const dateB = (b.lastMessageAt ? new Date(b.lastMessageAt) : b.createdAt || new Date(0)).getTime()

            // 2. No leídos: FIFO (el que lleva más tiempo esperando arriba = ASC)
            if (isUnreadA && isUnreadB) return dateA - dateB

            // 3. Leídos: más reciente arriba (DESC)
            return dateB - dateA
        })
    }, [leads, searchTerm, channelFilter, unreadFilter, channelByLead, unreadCounts])

    // Virtualizer para lista infinita
    const rowVirtualizer = useVirtualizer({
        count: sortedLeads.length,
        getScrollElement: () => listParentRef.current,
        estimateSize: () => 72,
        overscan: 8
    })

    // Cargar más leads al llegar al final
    useEffect(() => {
        const items = rowVirtualizer.getVirtualItems()
        const last = items[items.length - 1]
        if (!last) return
        if (last.index >= sortedLeads.length - 10) onLoadMore()
    }, [rowVirtualizer.getVirtualItems(), sortedLeads.length, onLoadMore])

    return (
        <div className={cn(
            "flex flex-col border-r bg-muted/10 h-full w-full md:w-96 shrink-0 transition-all duration-300",
            selectedLeadId ? "hidden md:flex" : "flex"
        )}>
            {/* Header */}
            <div className="p-6 space-y-4 bg-background border-b shrink-0 shadow-[0_4px_12px_rgba(0,0,0,0.02)]">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-primary/10 rounded-lg">
                            <ChatCircleDots size={20} className="text-primary" weight="fill" />
                        </div>
                        <h2 className="font-bold text-xl tracking-tight">Chats</h2>
                    </div>
                    <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="bg-muted text-muted-foreground font-bold px-2 rounded-md">
                            {sortedLeads.length}
                        </Badge>
                        {onOpenSettings && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-muted" onClick={onOpenSettings} title="Configuración">
                                <Gear className="w-4 h-4 text-muted-foreground" />
                            </Button>
                        )}
                    </div>
                </div>

                {/* Barra de búsqueda */}
                <div className="relative group">
                    {isSearching ? (
                        <Spinner className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary animate-spin" />
                    ) : (
                        <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    )}
                    <Input
                        placeholder="Buscar conversación..."
                        className="pl-9 h-10 bg-muted/40 border-none rounded-xl focus-visible:ring-1 focus-visible:ring-primary/30 transition-all"
                        value={searchTerm}
                        onChange={(e) => onSearchChange(e.target.value)}
                    />
                </div>

                {/* Filtros */}
                <div className="relative group">
                    <div
                        ref={filterScrollRef}
                        className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent pr-12"
                    >
                        <button
                            onClick={() => onScopeChange('active')}
                            className={cn(
                                "px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap border shrink-0",
                                chatScope === 'active'
                                    ? "bg-primary text-white border-primary shadow-md shadow-primary/20"
                                    : "bg-background text-muted-foreground border-border hover:bg-muted hover:border-muted-foreground/30"
                            )}
                        >
                            Activos
                        </button>
                        <button
                            onClick={() => onScopeChange('archived')}
                            className={cn(
                                "px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap border shrink-0",
                                chatScope === 'archived'
                                    ? "bg-primary text-white border-primary shadow-md shadow-primary/20"
                                    : "bg-background text-muted-foreground border-border hover:bg-muted hover:border-muted-foreground/30"
                            )}
                        >
                            Archivados
                        </button>
                        <div className="w-px h-4 bg-border mx-1 shrink-0" />
                        <button
                            onClick={() => { setUnreadFilter(false); setChannelFilter('all'); onSearchChange(''); onScopeChange('active') }}
                            className={cn(
                                "px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap border shrink-0",
                                !unreadFilter && channelFilter === 'all'
                                    ? "bg-zinc-900 text-white border-zinc-900 shadow-md shadow-black/10"
                                    : "bg-background text-muted-foreground border-border hover:bg-muted hover:border-muted-foreground/30"
                            )}
                        >
                            Todos
                        </button>
                        <button
                            onClick={() => { setUnreadFilter(!unreadFilter); onScopeChange('active') }}
                            className={cn(
                                "px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap border shrink-0",
                                unreadFilter
                                    ? "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-500/20"
                                    : "bg-background text-muted-foreground border-border hover:bg-muted hover:border-muted-foreground/30"
                            )}
                        >
                            No leídos
                        </button>
                        <button
                            onClick={() => { setChannelFilter(channelFilter === 'whatsapp' ? 'all' : 'whatsapp'); onScopeChange('active') }}
                            className={cn(
                                "px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 border shrink-0",
                                channelFilter === 'whatsapp'
                                    ? "bg-[#25D366] text-white border-[#25D366] shadow-md shadow-[#25D366]/20"
                                    : "bg-background text-muted-foreground border-border hover:bg-muted hover:border-muted-foreground/30"
                            )}
                        >
                            <WhatsappLogo weight="fill" className="h-3.5 w-3.5" />
                            WhatsApp
                        </button>
                        <button
                            onClick={() => { setChannelFilter(channelFilter === 'instagram' ? 'all' : 'instagram'); onScopeChange('active') }}
                            className={cn(
                                "px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 border shrink-0",
                                channelFilter === 'instagram'
                                    ? "bg-[#E1306C] text-white border-[#E1306C] shadow-md shadow-[#E1306C]/20"
                                    : "bg-background text-muted-foreground border-border hover:bg-muted hover:border-muted-foreground/30"
                            )}
                        >
                            <InstagramLogo weight="fill" className="h-3.5 w-3.5" />
                            Instagram
                        </button>
                        <button
                            onClick={() => { setChannelFilter(channelFilter === 'facebook' ? 'all' : 'facebook'); onScopeChange('active') }}
                            className={cn(
                                "px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 border shrink-0",
                                channelFilter === 'facebook'
                                    ? "bg-[#1877F2] text-white border-[#1877F2] shadow-md shadow-[#1877F2]/20"
                                    : "bg-background text-muted-foreground border-border hover:bg-muted hover:border-muted-foreground/30"
                            )}
                        >
                            <FacebookLogo weight="fill" className="h-3.5 w-3.5" />
                            Facebook
                        </button>
                    </div>
                    <div className="hidden md:flex absolute inset-y-0 right-1 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            type="button"
                            className="h-8 w-8 flex items-center justify-center rounded-full bg-background shadow-sm border border-border/60 text-muted-foreground hover:text-foreground hover:shadow-md transition-all active:scale-95"
                            onClick={() => filterScrollRef.current?.scrollBy({ left: -140, behavior: 'smooth' })}
                            aria-label="Desplazar filtros a la izquierda"
                        >
                            <CaretLeft size={16} weight="bold" />
                        </button>
                        <button
                            type="button"
                            className="h-8 w-8 flex items-center justify-center rounded-full bg-background shadow-sm border border-border/60 text-muted-foreground hover:text-foreground hover:shadow-md transition-all active:scale-95"
                            onClick={() => filterScrollRef.current?.scrollBy({ left: 140, behavior: 'smooth' })}
                            aria-label="Desplazar filtros a la derecha"
                        >
                            <CaretRight size={16} weight="bold" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Lista de chats */}
            <div className="flex-1 overflow-y-auto" ref={listParentRef}>
                {/* Estado de carga inicial */}
                {isInitialLoading && (
                    <div className="flex flex-col items-center justify-center p-8 gap-3">
                        <Spinner className="w-8 h-8 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">Cargando chats...</p>
                        <p className="text-xs text-muted-foreground/70">Empresa: {companyId?.slice(0, 8)}...</p>
                    </div>
                )}

                {/* Estado de error */}
                {loadError && !isInitialLoading && (
                    <div className="flex flex-col items-center justify-center p-8 gap-3 text-center">
                        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                            <X className="w-6 h-6 text-destructive" />
                        </div>
                        <p className="text-sm font-medium text-destructive">Error al cargar chats</p>
                        <p className="text-xs text-muted-foreground max-w-xs">{loadError}</p>
                        <Button variant="outline" size="sm" onClick={() => onRefresh(true)}>
                            Reintentar
                        </Button>
                    </div>
                )}

                {/* Lista virtualizada */}
                {!isInitialLoading && !loadError && (
                    <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
                        <div className="absolute top-0 left-0 w-full" style={{ transform: `translateY(${rowVirtualizer.getVirtualItems()[0]?.start || 0}px)` }}>
                            {rowVirtualizer.getVirtualItems().map(vi => {
                                const lead = sortedLeads[vi.index]
                                if (!lead) return null
                                return (
                                    <button
                                        key={lead.id}
                                        onClick={() => onSelectLead(lead.id)}
                                        className={cn(
                                            "flex items-center gap-4 px-4 py-3 text-left transition-all duration-200 border-b border-border/40 h-full w-full group relative",
                                            selectedLeadId === lead.id
                                                ? "bg-primary/10"
                                                : "hover:bg-muted/50"
                                        )}
                                        style={{ height: vi.size }}
                                    >
                                        {selectedLeadId === lead.id && (
                                            <div className="absolute left-0 top-2 bottom-2 w-1 bg-primary rounded-r-full" />
                                        )}

                                        <div className="relative shrink-0">
                                            <Avatar className="h-12 w-12 border-2 border-background shadow-sm ring-1 ring-border/50 group-hover:scale-105 transition-transform duration-200">
                                                <AvatarImage src={lead.avatar} />
                                                <AvatarFallback className="bg-muted text-muted-foreground font-bold">{(lead.name || 'Unknown').substring(0, 2).toUpperCase()}</AvatarFallback>
                                            </Avatar>
                                            <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5 shadow-sm border border-background">
                                                {channelByLead[lead.id] === 'instagram' ? (
                                                    <InstagramLogo weight="fill" className="h-3.5 w-3.5 text-[#E1306C]" />
                                                ) : channelByLead[lead.id] === 'facebook' ? (
                                                    <FacebookLogo weight="fill" className="h-3.5 w-3.5 text-[#1877F2]" />
                                                ) : (
                                                    <WhatsappLogo weight="fill" className="h-3.5 w-3.5 text-[#25D366]" />
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex-1 min-w-0 flex flex-col justify-center h-full gap-0.5">
                                            <div className="flex justify-between items-baseline">
                                                <span className={cn(
                                                    "truncate text-[15px] leading-none transition-colors",
                                                    unreadCounts[lead.id] > 0 ? "font-bold text-foreground" : "font-semibold text-foreground/80 group-hover:text-foreground"
                                                )}>
                                                    {lead.name}
                                                </span>
                                                <span className={cn(
                                                    "text-[10px] uppercase tracking-tighter whitespace-nowrap ml-2 font-bold",
                                                    unreadCounts[lead.id] > 0 ? "text-emerald-500" : "text-muted-foreground"
                                                )}>
                                                    {safeFormatDate(lead.lastMessageAt, 'HH:mm', { locale: es })}
                                                </span>
                                            </div>

                                            <div className="flex justify-between items-center gap-2">
                                                <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                                                    {lead.lastMessageSender === 'team' && <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" weight="bold" />}
                                                    <p className={cn(
                                                        "text-sm truncate leading-tight transition-colors",
                                                        lead.lastMessageSender === 'lead' && unreadCounts[lead.id] > 0
                                                            ? "font-bold text-foreground/90"
                                                            : "text-muted-foreground group-hover:text-muted-foreground/80"
                                                    )}>
                                                        {lead.lastMessage || 'Sin mensaje reciente'}
                                                    </p>
                                                </div>

                                                {unreadCounts[lead.id] > 0 && (
                                                    <span className="min-w-[1.25rem] h-5 flex items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] font-black px-1.5 shrink-0 shadow-lg shadow-emerald-500/20 animate-in zoom-in duration-300">
                                                        {unreadCounts[lead.id]}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Tags Display */}
                                            {lead.tags && lead.tags.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-1.5 min-w-0">
                                                    {lead.tags.slice(0, 3).map((tag: any) => (
                                                        <span
                                                            key={tag.id}
                                                            className="text-[9px] px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wider border opacity-90"
                                                            style={{
                                                                backgroundColor: tag.color + '15',
                                                                color: tag.color,
                                                                borderColor: tag.color + '30'
                                                            }}
                                                        >
                                                            {tag.name}
                                                        </span>
                                                    ))}
                                                    {lead.tags.length > 3 && (
                                                        <span className="text-[9px] text-muted-foreground font-bold px-1 py-0.5">
                                                            +{lead.tags.length - 3}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </button>
                                )
                            })}
                            {sortedLeads.length === 0 && (
                                <div className="p-8 text-center text-muted-foreground hover:text-foreground transition-colors">
                                    {chatScope === 'archived' ? 'No hay chats archivados' : 'No hay chats encontrados'}
                                </div>
                            )}
                            {isFetchingMore && (<div className="p-4 text-center text-muted-foreground flex items-center justify-center gap-2"><Spinner className="w-4 h-4 animate-spin" /> Cargando más...</div>)}
                        </div>
                    </div>
                )}
            </div>
        </div >
    )
})

export type { ChatListProps }
