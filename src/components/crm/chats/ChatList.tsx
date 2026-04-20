/**
 * ChatList Component (Presentational)
 * 
 * Panel izquierdo del chat con:
 * - Barra de búsqueda (filtro local)
 * - Filtros (WhatsApp, Instagram, No leídos, Archivados)
 * - Lista virtualizada de contactos
 * 
 * NOTA: Este es un componente presentacional. Los datos vienen del padre.
 * Los filtros locales (channelFilter, unreadFilter) son internos.
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
    CaretRight,
    Tag as TagIcon,
    ArrowLeft
} from '@phosphor-icons/react'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { safeFormatDate } from '@/hooks/useDateFormat'
import { detectChannel, type ChatScope } from '@/hooks/useLeadsList'

function normalizeSearchToken(value: unknown): string {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
}

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
    onSelectLead: (lead: Lead) => void

    // Acciones del padre
    onScopeChange: (scope: ChatScope) => void
    onLoadMore: () => void
    onRefresh: (forceRefresh?: boolean) => void
    onOpenSettings?: () => void

    // Búsqueda server-side
    searchQuery: string
    onSearchQueryChange: (term: string) => void
    searchLoading: boolean
    searchResults: {
        chatsMatches: Lead[]
        messageMatches: Array<{
            lead: Lead
            snippet: string
            messageId: string
            createdAt: string
        }>
    }
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
    searchQuery,
    onSearchQueryChange,
    searchLoading,
    searchResults
}: ChatListProps) {
    // Estados de filtros LOCALES (solo afectan la vista, no la query)
    const [channelFilter, setChannelFilter] = useState<'all' | 'whatsapp' | 'instagram' | 'facebook'>('all')
    const [unreadFilter, setUnreadFilter] = useState(false)
    const [tagFilter, setTagFilter] = useState<string | null>(null)
    // El searchQuery ahora viene del padre (hook)

    // Ref y estado para el buscador estilo WhatsApp
    const searchInputRef = useRef<HTMLInputElement | null>(null)
    const [searchFocused, setSearchFocused] = useState(false)
    const isSearchActive = searchQuery.length > 0 || searchFocused
    const isSearchMode = searchQuery.trim().length >= 2

    // Función para resaltar texto que coincide con la búsqueda
    const highlightMatch = (text: string, query: string) => {
        if (!query || query.length < 1) return <>{text}</>
        try {
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const regex = new RegExp(`(${escaped})`, 'gi')
            const parts = text.split(regex)
            if (parts.length <= 1) return <>{text}</>
            return (
                <>
                    {parts.map((part, i) =>
                        regex.test(part)
                            ? <mark key={i} className="bg-emerald-400/30 text-foreground rounded-sm px-0.5 font-bold">{part}</mark>
                            : <span key={i}>{part}</span>
                    )}
                </>
            )
        } catch {
            return <>{text}</>
        }
    }

    // Tags únicas de todos los leads
    const uniqueTags = useMemo(() => {
        const tagMap = new Map<string, { name: string; color: string }>()
        for (const lead of leads) {
            if (lead.tags) {
                for (const tag of lead.tags) {
                    if (!tagMap.has(tag.id)) tagMap.set(tag.id, { name: tag.name, color: tag.color })
                }
            }
        }
        return Array.from(tagMap.entries()).map(([id, t]) => ({ id, ...t }))
    }, [leads])

    // Refs
    const listParentRef = useRef<HTMLDivElement | null>(null)
    const filterScrollRef = useRef<HTMLDivElement | null>(null)

    const resolvedSearchChatMatches = useMemo(() => {
        if (!isSearchMode) return searchResults.chatsMatches

        const needle = normalizeSearchToken(searchQuery)
        const dedup = new Map<string, Lead>()

        for (const lead of searchResults.chatsMatches) {
            dedup.set(lead.id, lead)
        }

        // Fallback local para recuperar búsqueda por etiquetas si la búsqueda server-side
        // no retorna algún lead ya cargado en memoria.
        if (needle.length >= 2) {
            for (const lead of leads) {
                const hasTagMatch = (lead.tags || []).some((tag) => {
                    const tagName = normalizeSearchToken(tag?.name)
                    const tagId = normalizeSearchToken(tag?.id)
                    return tagName.includes(needle) || tagId.includes(needle)
                })

                if (hasTagMatch && !dedup.has(lead.id)) {
                    dedup.set(lead.id, lead)
                }
            }
        }

        return Array.from(dedup.values())
    }, [isSearchMode, searchQuery, searchResults.chatsMatches, leads])

    const totalSearchCount = resolvedSearchChatMatches.length + searchResults.messageMatches.length

    const getLeadChannel = (lead: Lead) => channelByLead[lead.id] || detectChannel(lead)

    const renderLeadTags = (lead: Lead, maxVisible = 3) => {
        if (!lead.tags || lead.tags.length === 0) return null

        return (
            <div className="flex flex-wrap gap-1 mt-1.5 min-w-0">
                {lead.tags.slice(0, maxVisible).map((tag: any) => (
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
                {lead.tags.length > maxVisible && (
                    <span className="text-[9px] text-muted-foreground font-bold px-1 py-0.5">
                        +{lead.tags.length - maxVisible}
                    </span>
                )}
            </div>
        )
    }

    // Filtrar y ordenar leads
    const sortedLeads = useMemo(() => {
        let filtered = leads

        // Solo aplicamos filtros locales cuando NO hay búsqueda activa.
        if (!isSearchMode) {
            if (unreadFilter) filtered = filtered.filter(l => (unreadCounts[l.id] || 0) > 0)
            if (channelFilter !== 'all') filtered = filtered.filter(l => (channelByLead[l.id] || 'whatsapp') === channelFilter)
            if (tagFilter) filtered = filtered.filter(l => l.tags?.some(t => t.id === tagFilter))
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
    }, [leads, isSearchMode, channelFilter, unreadFilter, tagFilter, channelByLead, unreadCounts])

    // Virtualizer para lista infinita
    const rowVirtualizer = useVirtualizer({
        count: sortedLeads.length,
        getScrollElement: () => listParentRef.current,
        estimateSize: () => 72,
        overscan: 8
    })

    // Cargar más leads al llegar al final
    useEffect(() => {
        if (isSearchMode) return
        const items = rowVirtualizer.getVirtualItems()
        const last = items[items.length - 1]
        if (!last) return
        if (last.index >= sortedLeads.length - 10) onLoadMore()
    }, [rowVirtualizer.getVirtualItems(), sortedLeads.length, onLoadMore, isSearchMode])

    const handleSearchSelection = (lead: Lead, source: 'chats' | 'messages') => {
        console.log('[chat-search] select-lead', { source, leadId: lead.id })
        onSelectLead(lead)
    }

    return (
        <div className={cn(
            "flex flex-col border-r bg-muted/10 min-h-0 w-full md:w-96 shrink-0 transition-all duration-300",
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
                            {isSearchMode ? totalSearchCount : sortedLeads.length}
                        </Badge>
                        {onOpenSettings && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-muted" onClick={onOpenSettings} title="Configuración">
                                <Gear className="w-4 h-4 text-muted-foreground" />
                            </Button>
                        )}
                    </div>
                </div>

                {/* Barra de búsqueda estilo WhatsApp */}
                <div className="relative group">
                    <div className={cn(
                        "flex items-center gap-2 rounded-xl transition-all duration-200",
                        isSearchActive
                            ? "bg-background ring-1 ring-primary/40 shadow-sm"
                            : "bg-muted/40"
                    )}>
                        <div className="flex items-center pl-3 shrink-0">
                            {isSearchActive ? (
                                <button
                                    type="button"
                                    onClick={() => { onSearchQueryChange(''); setSearchFocused(false); searchInputRef.current?.blur() }}
                                    className="text-primary hover:text-primary/80 transition-colors"
                                >
                                    <ArrowLeft className="h-4 w-4" weight="bold" />
                                </button>
                            ) : searchLoading ? (
                                <Spinner className="h-4 w-4 text-primary animate-spin" />
                            ) : (
                                <MagnifyingGlass className="h-4 w-4 text-muted-foreground" />
                            )}
                        </div>
                        <Input
                            ref={searchInputRef}
                            placeholder="Buscar..."
                            className="h-10 bg-transparent border-none shadow-none focus-visible:ring-0 pl-1 pr-0 text-[15px]"
                            value={searchQuery}
                            onChange={(e) => onSearchQueryChange(e.target.value)}
                            onFocus={() => setSearchFocused(true)}
                            onBlur={() => { if (!searchQuery) setSearchFocused(false) }}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    // Solo en desktop (md+): limpiar búsqueda con Escape
                                    if (window.innerWidth >= 768) {
                                        onSearchQueryChange('')
                                        setSearchFocused(false)
                                        searchInputRef.current?.blur()
                                    }
                                }
                            }}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => { onSearchQueryChange(''); searchInputRef.current?.focus() }}
                                className="flex items-center justify-center h-7 w-7 mr-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-all shrink-0"
                            >
                                <X className="h-3.5 w-3.5" weight="bold" />
                            </button>
                        )}
                        {searchLoading && searchQuery && (
                            <Spinner className="h-4 w-4 text-primary animate-spin mr-3 shrink-0" />
                        )}
                    </div>
                    {isSearchMode && !searchLoading && (
                        <div className="flex items-center gap-1.5 mt-1.5 px-1">
                            <span className="text-[11px] text-muted-foreground font-medium">
                                {resolvedSearchChatMatches.length === 0 && searchResults.messageMatches.length === 0
                                    ? 'Sin resultados'
                                    : `${resolvedSearchChatMatches.length} chat${resolvedSearchChatMatches.length !== 1 ? 's' : ''}${searchResults.messageMatches.length > 0 ? ` · ${searchResults.messageMatches.length} mensaje${searchResults.messageMatches.length !== 1 ? 's' : ''}` : ''}`
                                }
                            </span>
                        </div>
                    )}
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
                            onClick={() => { setUnreadFilter(false); setChannelFilter('all'); setTagFilter(null); onSearchQueryChange(''); onScopeChange('active') }}
                            className={cn(
                                "px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap border shrink-0",
                                !unreadFilter && channelFilter === 'all' && !tagFilter
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
                        {uniqueTags.length > 0 && (
                            <>
                                <div className="w-px h-4 bg-border mx-1 shrink-0" />
                                {uniqueTags.map(tag => (
                                    <button
                                        key={tag.id}
                                        onClick={() => { setTagFilter(tagFilter === tag.id ? null : tag.id); onScopeChange('active') }}
                                        className={cn(
                                            "px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 border shrink-0",
                                            tagFilter === tag.id
                                                ? "text-white shadow-md"
                                                : "bg-background text-muted-foreground border-border hover:bg-muted hover:border-muted-foreground/30"
                                        )}
                                        style={tagFilter === tag.id ? { backgroundColor: tag.color, borderColor: tag.color } : {}}
                                    >
                                        <TagIcon weight="fill" className="h-3 w-3" />
                                        {tag.name}
                                    </button>
                                ))}
                            </>
                        )}
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

                {/* Resultados de búsqueda estilo WhatsApp */}
                {!isInitialLoading && !loadError && isSearchMode && (
                    <div className="pb-2">
                        <div className="px-4 py-2.5 bg-muted/30 border-b border-border/40 sticky top-0 z-10">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                                Chats
                            </span>
                        </div>

                        {resolvedSearchChatMatches.map((lead) => (
                            <button
                                key={`chat-${lead.id}`}
                                onClick={() => handleSearchSelection(lead, 'chats')}
                                className="flex items-center gap-3 px-4 py-3 text-left transition-all duration-200 border-b border-border/40 w-full hover:bg-muted/50 group"
                            >
                                <div className="relative shrink-0">
                                    <Avatar className="h-11 w-11 border-2 border-background shadow-sm ring-1 ring-border/50">
                                        <AvatarImage src={lead.avatar} />
                                        <AvatarFallback className="bg-muted text-muted-foreground font-bold text-xs">
                                            {(lead.name || '??').substring(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5 shadow-sm border border-background">
                                        {getLeadChannel(lead) === 'instagram' ? (
                                            <InstagramLogo weight="fill" className="h-3.5 w-3.5 text-[#E1306C]" />
                                        ) : getLeadChannel(lead) === 'facebook' ? (
                                            <FacebookLogo weight="fill" className="h-3.5 w-3.5 text-[#1877F2]" />
                                        ) : (
                                            <WhatsappLogo weight="fill" className="h-3.5 w-3.5 text-[#25D366]" />
                                        )}
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                    <span className="truncate text-[14px] font-semibold text-foreground/90">
                                        {highlightMatch(lead.name || 'Sin nombre', searchQuery)}
                                    </span>
                                    <span className="truncate text-xs text-muted-foreground">
                                        {highlightMatch(lead.phone || lead.company || 'Sin detalle', searchQuery)}
                                    </span>
                                    {renderLeadTags(lead, 2)}
                                </div>
                            </button>
                        ))}

                        {resolvedSearchChatMatches.length === 0 && (
                            <div className="px-4 py-3 text-xs text-muted-foreground border-b border-border/40">
                                Sin coincidencias en chats
                            </div>
                        )}

                        <div className="px-4 py-2.5 bg-muted/30 border-b border-border/40 sticky top-0 z-10">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
                                Mensajes
                            </span>
                        </div>

                        {searchResults.messageMatches.map((row) => (
                            <button
                                key={`msg-${row.messageId}`}
                                onClick={() => handleSearchSelection(row.lead, 'messages')}
                                className="flex items-center gap-3 px-4 py-3 text-left transition-all duration-200 border-b border-border/40 w-full hover:bg-muted/50 group"
                            >
                                <div className="relative shrink-0">
                                    <Avatar className="h-11 w-11 border-2 border-background shadow-sm ring-1 ring-border/50">
                                        <AvatarImage src={row.lead.avatar} />
                                        <AvatarFallback className="bg-muted text-muted-foreground font-bold text-xs">
                                            {(row.lead.name || '??').substring(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5 shadow-sm border border-background">
                                        {getLeadChannel(row.lead) === 'instagram' ? (
                                            <InstagramLogo weight="fill" className="h-3.5 w-3.5 text-[#E1306C]" />
                                        ) : getLeadChannel(row.lead) === 'facebook' ? (
                                            <FacebookLogo weight="fill" className="h-3.5 w-3.5 text-[#1877F2]" />
                                        ) : (
                                            <WhatsappLogo weight="fill" className="h-3.5 w-3.5 text-[#25D366]" />
                                        )}
                                    </div>
                                </div>

                                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                    <div className="flex justify-between items-baseline">
                                        <span className="truncate text-[14px] font-semibold text-foreground/80 group-hover:text-foreground">
                                            {highlightMatch(row.lead.name || 'Sin nombre', searchQuery)}
                                        </span>
                                        <span className="text-[10px] uppercase tracking-tighter whitespace-nowrap ml-2 font-bold text-muted-foreground">
                                            {safeFormatDate(row.createdAt, 'dd/MM/yyyy', { locale: es })}
                                        </span>
                                    </div>
                                    <p className="text-sm truncate text-muted-foreground group-hover:text-muted-foreground/80">
                                        {highlightMatch(row.snippet, searchQuery)}
                                    </p>
                                    {renderLeadTags(row.lead, 2)}
                                </div>
                            </button>
                        ))}

                        {searchResults.messageMatches.length === 0 && (
                            <div className="px-4 py-3 text-xs text-muted-foreground">
                                Sin coincidencias en mensajes
                            </div>
                        )}
                    </div>
                )}

                {/* Lista virtualizada */}
                {!isInitialLoading && !loadError && !isSearchMode && (
                    <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
                        <div className="absolute top-0 left-0 w-full" style={{ transform: `translateY(${rowVirtualizer.getVirtualItems()[0]?.start || 0}px)` }}>
                            {rowVirtualizer.getVirtualItems().map(vi => {
                                const lead = sortedLeads[vi.index]
                                if (!lead) return null
                                return (
                                    <button
                                        key={lead.id}
                                        onClick={() => onSelectLead(lead)}
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
                                                    )}>{lead.lastMessage || 'Sin mensaje reciente'}
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
