/**
 * useLeadsList Hook
 * 
 * Hook reutilizable para carga paginada de leads con caché, conteos de no leídos
 * y detección automática de canal (WhatsApp/Instagram).
 * 
 * **¿Qué hace?**
 * - Carga leads paginados desde Supabase
 * - Maneja caché local para respuesta instantánea
 * - Carga conteos de mensajes no leídos en batches
 * - Detecta canal (WhatsApp vs Instagram) por teléfono
 * - Soporte para leads activos y archivados
 * 
 * **¿Dónde afecta?**
 * - ChatsView.tsx: Vista principal de chats
 * 
 * **Testing requerido:**
 * 1. Ir a Chats → Verificar que cargan los leads
 * 2. Scroll hasta abajo → Verificar paginación infinita
 * 3. Cambiar entre Activos/Archivados
 * 4. Filtrar por WhatsApp/Instagram
 * 5. Verificar que los conteos de no leídos se muestran
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Lead } from '@/lib/types'
import { getLeadsPaged, setLeadArchived, deleteLead, searchLeads } from '@/supabase/services/leads'
import { getLastMessagesForLeadIds, getUnreadMessagesCount } from '@/supabase/services/mensajes'
import type { Message as DbMessage } from '@/supabase/services/mensajes'
import { getCachedLeads, setCachedLeads, updateCachedLeads, invalidateLeadsCache } from '@/lib/chatsCache'
import { toast } from 'sonner'

// Constantes
const PAGE_SIZE = 500
const BATCH_SIZE = 100

export type ChatScope = 'active' | 'archived'
export type ChannelType = 'whatsapp' | 'instagram' | 'facebook'

interface UseLeadsListOptions {
    /** ID de la empresa */
    companyId: string
    /** Si debe cargar automáticamente al montar */
    autoLoad?: boolean
}

interface UseLeadsListReturn {
    /** Lista de leads cargados */
    leads: Lead[]
    /** Si está cargando la primera página */
    isInitialLoading: boolean
    /** Si está cargando más leads (paginación) */
    isFetchingMore: boolean
    /** Error de carga si existe */
    loadError: string | null
    /** Si hay más leads para cargar */
    hasMore: boolean
    /** Conteos de mensajes no leídos por lead */
    unreadCounts: Record<string, number>
    /** Canal detectado por lead (whatsapp/instagram) */
    channelByLead: Record<string, ChannelType>
    /** Scope actual (active/archived) */
    chatScope: ChatScope
    /** Cambiar scope (activos/archivados) */
    setScope: (scope: ChatScope) => void
    /** Recargar leads */
    refresh: (forceRefresh?: boolean) => Promise<void>
    /** Cargar más leads (paginación) */
    loadMore: () => Promise<void>
    /** Actualizar un lead en la lista */
    updateLead: (lead: Lead) => void
    /** Agregar un nuevo lead al inicio de la lista */
    addLead: (lead: Lead) => void
    /** Archivar/Desarchivar un lead */
    toggleArchive: (lead: Lead, archive: boolean, actorId?: string, actorNombre?: string) => Promise<void>
    /** Eliminar un lead */
    removeLead: (leadId: string) => Promise<void>
    /** Actualizar orden de un lead (cuando llega mensaje) */
    updateLeadOrder: (leadId: string, message: DbMessage) => void
    /** Actualizar conteo de no leídos para un lead */
    updateUnreadCount: (leadId: string, count: number) => void
    /** Invalidar caché */
    invalidateCache: () => void
    /** Término de búsqueda actual */
    searchTerm: string
    /** Setter para búsqueda */
    setSearchTerm: (term: string) => void
    /** Si está buscando activamente */
    isSearching: boolean
}

// Detecta el canal del lead basado en el teléfono y metadata
export function detectChannel(lead: Lead | any): ChannelType {
    // 0. PRIORIDAD MÁXIMA: Campo 'fuente' (source) que el webhook guarda con la plataforma exacta
    const fuente = ((lead as any).fuente || (lead as any).source || '').toLowerCase()
    if (fuente === 'instagram') return 'instagram'
    if (fuente === 'facebook') return 'facebook'
    if (fuente === 'whatsapp') return 'whatsapp'

    const company = (lead.company || (lead as any).empresa || '').toLowerCase()
    const name = (lead.name || (lead as any).nombre_completo || '').toLowerCase()
    const email = (lead.email || (lead as any).correo_electronico || '').toLowerCase()
    const phone = (lead.phone || (lead as any).telefono || '').replace(/\D/g, '')

    // 1. Revisar campo empresa/company (donde el webhook guarda "[Plataforma] Contact" o similar)
    if (company.includes('facebook')) return 'facebook'
    if (company.includes('instagram')) return 'instagram'
    if (company.includes('whatsapp')) return 'whatsapp'

    // 2. Revisar por email (el webhook genera @facebook.com o @instagram.com)
    if (email.includes('@facebook.com')) return 'facebook'
    if (email.includes('@instagram.com')) return 'instagram'

    // 3. Revisar por nombre (el webhook usa "Nuevo Lead [Platform] ...")
    if (name.includes('facebook')) return 'facebook'
    if (name.includes('instagram')) return 'instagram'

    // 4. Fallback: Longitud del teléfono (Instagram/Facebook usan IDs numéricos largos)
    if (phone.length >= 15) return 'instagram'

    // default
    return 'whatsapp'
}

/**
 * Mapea datos de BD a Lead
 */
export function mapDBToLead(d: any): Lead {
    return {
        ...d,
        id: d.id,
        name: d.nombre_completo || d.name || 'Sin Nombre',
        phone: d.telefono || d.phone,
        email: d.correo_electronico || d.email,
        createdAt: d.created_at ? new Date(d.created_at) : new Date(),
        lastMessage: d.last_message || '',
        lastMessageAt: d.last_message_at ? new Date(d.last_message_at) : (d.created_at ? new Date(d.created_at) : undefined),
        lastMessageSender: d.last_message_sender || 'team',
        lastContact: d.last_contact ? new Date(d.last_contact) : undefined,
        avatar: d.avatar || undefined,
        company: d.empresa || d.company || undefined,
        evento: d.evento || undefined,
        membresia: d.membresia || undefined,
        pipeline: d.pipeline_id || d.pipeline || 'sales',
        stage: d.etapa_id || d.stage || '',
        archived: !!d.archived,
        archivedAt: d.archived_at ? new Date(d.archived_at) : undefined,
    }
}

/**
 * Hook para carga paginada de leads
 */
export function useLeadsList(options: UseLeadsListOptions): UseLeadsListReturn {
    const { companyId, autoLoad = true } = options

    // Estado principal
    const [leads, setLeads] = useState<Lead[]>([])
    const [isInitialLoading, setIsInitialLoading] = useState(true)
    const [isFetchingMore, setIsFetchingMore] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [hasMore, setHasMore] = useState(true)
    const [offset, setOffset] = useState(0)
    const [chatScope, setChatScope] = useState<ChatScope>('active')

    // Búsqueda server-side
    const [searchTerm, setSearchTerm] = useState('')
    const [isSearching, setIsSearching] = useState(false)
    const [searchResults, setSearchResults] = useState<Lead[] | null>(null)

    // Datos adicionales
    const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
    const [channelByLead, setChannelByLead] = useState<Record<string, ChannelType>>({})

    /**
     * Carga conteos de no leídos en batches para evitar timeouts
     */
    const loadUnreadCountsInBatches = useCallback(async (allIds: string[], scope: ChatScope) => {
        const batches: string[][] = []
        for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
            batches.push(allIds.slice(i, i + BATCH_SIZE))
        }

        let allCounts: Record<string, number> = {}

        for (const batch of batches) {
            try {
                const counts = await getUnreadMessagesCount(batch)
                // Prellenar con ceros para TODOS los ids del batch
                const filled: Record<string, number> = {}
                for (const id of batch) filled[id] = 0
                for (const [id, value] of Object.entries(counts)) filled[id] = value

                allCounts = { ...allCounts, ...filled }
                setUnreadCounts(prev => ({ ...prev, ...filled }))
            } catch (err) {
                console.warn('[useLeadsList] Error en batch de conteos:', err)
            }
        }

        if (scope === 'active') {
            updateCachedLeads(companyId, { unreadCounts: allCounts })
        }
    }, [companyId])

    /**
     * Carga últimos mensajes en segundo plano para leads sin mensaje
     */
    const loadLastMessagesInBackground = useCallback(async (missingIds: string[]) => {
        if (missingIds.length === 0 || missingIds.length > 100) return

        try {
            const lastByLead = await getLastMessagesForLeadIds(missingIds) as Record<string, DbMessage>

            setLeads(prev => prev.map(l => {
                const m = lastByLead[l.id]
                if (m) {
                    return {
                        ...l,
                        lastMessage: m.content || l.lastMessage || '',
                        lastMessageAt: new Date(m.created_at),
                        lastMessageSender: m.sender as any
                    }
                }
                return l
            }))
        } catch (err) {
            console.warn('[useLeadsList] Error cargando últimos mensajes:', err)
        }
    }, [])

    /**
     * Carga inicial de leads
     */
    const loadLeads = useCallback(async (forceRefresh = false) => {
        if (!companyId) return

        setIsInitialLoading(true)
        setLoadError(null)

        try {
            const { data: page } = await getLeadsPaged({
                empresaId: companyId,
                limit: PAGE_SIZE,
                offset: 0,
                archived: chatScope === 'archived'
            })

            const data = page || []
            const mapped: Lead[] = data.map(mapDBToLead)

            // Detectar canales
            const channelMap: Record<string, ChannelType> = {}
            for (const l of mapped) {
                channelMap[l.id] = detectChannel(l)
            }

            setLeads(mapped)
            setChannelByLead(channelMap)
            setUnreadCounts({})
            setOffset(mapped.length)
            setHasMore(mapped.length >= PAGE_SIZE)
            setIsInitialLoading(false)

            // Guardar en caché si es activos
            if (chatScope === 'active') {
                setCachedLeads(companyId, {
                    leads: mapped,
                    lastChannelByLead: channelMap,
                    unreadCounts: {},
                    hasMore: mapped.length >= PAGE_SIZE,
                    offset: mapped.length
                })
            }

            // Cargar datos adicionales en background
            const ids = mapped.map(l => l.id)
            loadUnreadCountsInBatches(ids, chatScope)

            const missingIds = mapped.filter(l => !l.lastMessageAt || !l.lastMessage).map(l => l.id)
            loadLastMessagesInBackground(missingIds)

        } catch (e: any) {
            console.error('[useLeadsList] Error cargando leads:', e)
            setLoadError(e?.message || 'Error desconocido al cargar chats')
            toast.error('Error al cargar los chats: ' + (e?.message || 'Error desconocido'))
            setIsInitialLoading(false)
        }
    }, [companyId, chatScope, loadUnreadCountsInBatches, loadLastMessagesInBackground])

    /**
     * Cargar más leads (paginación)
     */
    const loadMore = useCallback(async () => {
        if (!hasMore || isFetchingMore) return

        setIsFetchingMore(true)
        try {
            const { data: page } = await getLeadsPaged({
                empresaId: companyId,
                limit: PAGE_SIZE,
                offset,
                archived: chatScope === 'archived'
            })

            const data = page || []
            const mapped: Lead[] = data.map(mapDBToLead)

            // Cargar últimos mensajes para los nuevos leads
            const missingIds = mapped.filter(l => !l.lastMessageAt || !l.lastMessage).map(l => l.id)
            if (missingIds.length) {
                const lastByLead = await getLastMessagesForLeadIds(missingIds) as Record<string, DbMessage>
                for (const id of Object.keys(lastByLead)) {
                    const m = lastByLead[id]
                    const l = mapped.find(x => x.id === id)
                    if (l && m) {
                        l.lastMessage = m.content || l.lastMessage || ''
                        l.lastMessageAt = new Date(m.created_at)
                        l.lastMessageSender = m.sender as any
                    }
                }
            }

            // Detectar canales
            setChannelByLead(prev => {
                const next = { ...prev }
                for (const l of mapped) {
                    next[l.id] = next[l.id] || detectChannel(l)
                }
                return next
            })

            // Cargar conteos
            const ids = mapped.map(l => l.id)
            const counts = await getUnreadMessagesCount(ids)
            setUnreadCounts(prev => ({ ...prev, ...counts }))

            const newLeads = [...leads, ...mapped]
            const newOffset = offset + mapped.length
            const newHasMore = mapped.length >= PAGE_SIZE

            setLeads(newLeads)
            setOffset(newOffset)
            setHasMore(newHasMore)

            // Actualizar caché
            if (chatScope === 'active') {
                updateCachedLeads(companyId, {
                    leads: newLeads,
                    unreadCounts: { ...unreadCounts, ...counts },
                    hasMore: newHasMore,
                    offset: newOffset
                })
            }
        } catch (e) {
            console.error('[useLeadsList] Error cargando más leads:', e)
        } finally {
            setIsFetchingMore(false)
        }
    }, [hasMore, isFetchingMore, companyId, offset, chatScope, leads, unreadCounts])

    /**
     * Cambiar scope (activos/archivados)
     */
    const setScope = useCallback((scope: ChatScope) => {
        if (scope === chatScope) return
        setLeads([])
        setUnreadCounts({})
        setChannelByLead({})
        setOffset(0)
        setHasMore(true)
        setLoadError(null)
        setIsInitialLoading(true)
        setChatScope(scope)
    }, [chatScope])

    /**
     * Actualizar un lead en la lista
     */
    const updateLead = useCallback((lead: Lead) => {
        setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, ...lead } : l))

        // Actualizar canal también por si cambió teléfono o nombre
        setChannelByLead(prev => ({
            ...prev,
            [lead.id]: detectChannel(lead)
        }))
    }, [])

    /**
     * Agregar un nuevo lead al inicio de la lista
     */
    const addLead = useCallback((lead: Lead) => {
        setLeads(prev => {
            // Evitar duplicados
            if (prev.some(l => l.id === lead.id)) return prev
            return [lead, ...prev]
        })

        // Registrar canal del nuevo lead
        setChannelByLead(prev => ({
            ...prev,
            [lead.id]: detectChannel(lead)
        }))

        // También actualizar caché si estamos en activos
        if (chatScope === 'active' && !lead.archived) {
            const cached = getCachedLeads(companyId)
            if (cached) {
                const newLeads = [lead, ...cached.leads.filter((l: any) => l.id !== lead.id)]

                // Actualizar map de canales en caché
                const newChannelMap = { ...cached.lastChannelByLead, [lead.id]: detectChannel(lead) }

                updateCachedLeads(companyId, {
                    leads: newLeads,
                    lastChannelByLead: newChannelMap
                })
            }
        }
    }, [companyId, chatScope])

    /**
     * Actualizar orden del lead cuando llega mensaje
     */
    const updateLeadOrder = useCallback((leadId: string, msg: DbMessage) => {
        if (!msg) return
        setLeads(prev => prev.map(l =>
            l.id === leadId
                ? { ...l, lastMessageAt: new Date(msg.created_at), lastMessageSender: msg.sender as any, lastMessage: msg.content }
                : l
        ))
    }, [])

    /**
     * Actualizar conteo de no leídos
     */
    const updateUnreadCount = useCallback((leadId: string, count: number) => {
        setUnreadCounts(prev => ({ ...prev, [leadId]: count }))
    }, [])

    /**
     * Archivar/Desarchivar lead
     */
    const toggleArchive = useCallback(async (lead: Lead, archive: boolean, actorId?: string, actorNombre?: string) => {
        try {
            await setLeadArchived(lead.id, archive, actorId, actorNombre)
            invalidateLeadsCache(companyId)
            toast.success(archive ? 'Chat archivado' : 'Chat restaurado')

            // Remover de la lista si cambia de scope
            if ((archive && chatScope === 'active') || (!archive && chatScope === 'archived')) {
                setLeads(prev => prev.filter(l => l.id !== lead.id))
                setUnreadCounts(prev => {
                    const next = { ...prev }
                    delete next[lead.id]
                    return next
                })
            } else {
                updateLead({ ...lead, archived: archive, archivedAt: archive ? new Date() : undefined })
            }
        } catch (err) {
            console.error('[useLeadsList] Error archivando:', err)
            toast.error('No se pudo actualizar el estado del chat')
        }
    }, [companyId, chatScope, updateLead])

    /**
     * Eliminar lead
     */
    const removeLead = useCallback(async (leadId: string) => {
        try {
            await deleteLead(leadId)
            invalidateLeadsCache(companyId)
            toast.success('Lead eliminado')

            setLeads(prev => prev.filter(l => l.id !== leadId))
            setUnreadCounts(prev => {
                const next = { ...prev }
                delete next[leadId]
                return next
            })
        } catch (err) {
            console.error('[useLeadsList] Error eliminando lead:', err)
            toast.error('No se pudo eliminar el lead')
        }
    }, [companyId])

    /**
     * Invalidar caché
     */
    const invalidateCache = useCallback(() => {
        invalidateLeadsCache(companyId)
    }, [companyId])

    // ==========================================
    // EFECTO: Búsqueda Server-Side (Debounced)
    // ==========================================
    useEffect(() => {
        if (!searchTerm) {
            setSearchResults(null)
            return
        }

        const timer = setTimeout(async () => {
            if (searchTerm.length < 2) return

            setIsSearching(true)
            try {
                // Si estamos en archivados, buscar en archivados. Si no, default (activos).
                const results = await searchLeads(companyId, searchTerm, {
                    archived: chatScope === 'archived',
                    limit: 20
                })

                const mapped = (results || []).map(mapDBToLead)

                // Detectar canales para resultados
                setChannelByLead(prev => {
                    const next = { ...prev }
                    mapped.forEach(l => {
                        if (!next[l.id]) next[l.id] = detectChannel(l)
                    })
                    return next
                })

                setSearchResults(mapped)
            } catch (err) {
                console.error('[useLeadsList] Error buscando:', err)
                toast.error('Error al buscar chats')
            } finally {
                setIsSearching(false)
            }
        }, 500) // Debounce 500ms

        return () => clearTimeout(timer)
    }, [searchTerm, companyId, chatScope])


    // ==========================================
    // Carga inicial y lógica de visualización
    // ==========================================

    // Memoizar leads a mostrar: Resultados de búsqueda + matches locales por tag O Lista normal
    const displayedLeads = useMemo(() => {
        if (searchTerm && searchResults) {
            // Server no busca por tags, agregar matches locales por tag name
            const search = searchTerm.toLowerCase()
            const serverIds = new Set(searchResults.map(l => l.id))
            const tagMatches = leads.filter(l =>
                !serverIds.has(l.id) &&
                l.tags?.some(t => (t.name || '').toLowerCase().includes(search))
            )
            return tagMatches.length > 0 ? [...searchResults, ...tagMatches] : searchResults
        }
        return leads
    }, [searchTerm, searchResults, leads])

    // Carga inicial (solo si NO hay búsqueda)
    useEffect(() => {
        if (!companyId || !autoLoad) return

        if (chatScope === 'archived') {
            void loadLeads()
            return
        }

        // Intentar usar caché primero
        const cached = getCachedLeads(companyId)
        if (cached && cached.leads.length > 0) {
            setLeads(cached.leads as Lead[])

            // Recalcular canales desde caché
            const channelMap: Record<string, ChannelType> = {}
            for (const l of cached.leads) {
                channelMap[l.id] = detectChannel(l as Lead)
            }
            setChannelByLead(channelMap)

            setUnreadCounts(cached.unreadCounts)
            setHasMore(cached.hasMore)
            setOffset(cached.offset)
            setIsInitialLoading(false)
            setLoadError(null)

            // Refrescar conteos en background
            loadUnreadCountsInBatches(cached.leads.map((l: any) => l.id), 'active')
        } else {
            if (!searchTerm) void loadLeads()
        }
    }, [companyId, chatScope, autoLoad, searchTerm])

    // Recargar cuando cambia el scope
    useEffect(() => {
        if (chatScope === 'archived' && leads.length === 0 && !isInitialLoading) {
            void loadLeads()
        }
    }, [chatScope])

    return {
        leads: displayedLeads, // Retornamos la lista filtrada o completa según estado
        isInitialLoading,
        isFetchingMore,
        loadError,
        hasMore,
        unreadCounts,
        channelByLead,
        chatScope,
        setScope,
        refresh: loadLeads,
        loadMore,
        updateLead,
        addLead,
        toggleArchive,
        removeLead,
        updateLeadOrder,
        updateUnreadCount,
        invalidateCache,
        searchTerm,
        setSearchTerm,
        isSearching
    }
}
