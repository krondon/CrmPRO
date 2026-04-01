/**
 * usePipelineData Hook
 * 
 * Maneja la carga y gestión de datos del pipeline:
 * - Pipelines y sus stages
 * - Leads paginados
 * - Conteos por stage
 * - Mensajes no leídos
 * - Conteos de notas
 * 
 * **Patrón de Arquitectura:**
 * Este hook expone `setLeads` y `setStageCounts` para que otros hooks
 * (como `useDragDrop` y `usePipelineLeadActions`) puedan actualizar
 * el estado de forma coordinada a través de inyección de dependencias.
 * 
 * **Testing requerido:**
 * 1. Cambiar de pipeline → debe cargar leads correctos
 * 2. "Cargar más" en una columna → debe agregar leads sin duplicados
 * 3. "Cargar más" global → debe cargar de todas las columnas
 */

import { useState, useEffect, useRef, useCallback, Dispatch, SetStateAction } from 'react'
import { Lead, Pipeline, PipelineType } from '@/lib/types'
import { usePersistentState } from '@/hooks/usePersistentState'
import { getPipelines } from '@/supabase/helpers/pipeline'
import { getLeadsPaged } from '@/supabase/services/leads'
import { getUnreadMessagesCount, subscribeToAllMessages } from '@/supabase/services/mensajes'
import { getNotasCountByLeads } from '@/supabase/services/notas'
import { getReunionesCountByLeads } from '@/supabase/services/reuniones'

// ============================================
// TIPOS ESTRICTOS
// ============================================

/** Estado de paginación por stage */
export interface StagePagination {
    offset: number
    hasMore: boolean
}

/** Opciones del hook */
export interface UsePipelineDataOptions {
    companyId: string
    userId?: string
    canViewAllLeads?: boolean
}

/** Return type del hook con setters expuestos para inyección */
export interface UsePipelineDataReturn {
    // Data
    pipelines: Pipeline[]
    leads: Lead[]
    activePipeline: PipelineType
    currentPipeline: Pipeline | undefined
    stageCounts: Record<string, number>
    stagePages: Record<string, StagePagination>
    unreadLeads: Set<string>
    notasCounts: Record<string, number>
    meetingsCounts: Record<string, number>

    // Loading states
    isLoadingMore: boolean
    hasMore: boolean

    // Actions
    setActivePipeline: Dispatch<SetStateAction<PipelineType>>
    loadMoreStage: (stageId: string) => Promise<void>
    loadMoreAll: () => Promise<void>

    // Setters expuestos para inyección de dependencias
    setLeads: Dispatch<SetStateAction<Lead[]>>
    setStageCounts: Dispatch<SetStateAction<Record<string, number>>>
    setPipelines: Dispatch<SetStateAction<Pipeline[]>>
    setUnreadLeads: Dispatch<SetStateAction<Set<string>>>
    setNotasCounts: Dispatch<SetStateAction<Record<string, number>>>
    setMeetingsCounts: Dispatch<SetStateAction<Record<string, number>>>
}

// ============================================
// CONSTANTES
// ============================================
const BASE_STAGE_LIMIT = 100
const STAGE_PAGE_SIZE = 100

// ============================================
// MAPPER: DB → Lead
// ============================================
function mapDbLeadToLead(l: any): Lead {
    return {
        id: l.id,
        name: l.nombre_completo,
        email: l.correo_electronico,
        phone: l.telefono,
        company: l.empresa,
        location: l.ubicacion,
        evento: l.evento,
        membresia: l.membresia,
        budget: l.presupuesto,
        stage: l.etapa_id,
        pipeline: l.pipeline_id || 'sales',
        priority: l.prioridad,
        assignedTo: l.asignado_a,
        tags: l.tags || [],
        createdAt: new Date(l.created_at),
        lastContact: l.last_message_at ? new Date(l.last_message_at) : new Date(l.created_at),
        stageEnteredAt: l.stage_entered_at ? new Date(l.stage_entered_at) : null,
        slaCustomLimitMinutes: l.sla_custom_limit_minutes ?? null
    }
}

// ============================================
// HOOK PRINCIPAL
// ============================================
export function usePipelineData(options: UsePipelineDataOptions): UsePipelineDataReturn {
    const { companyId, userId, canViewAllLeads = true } = options

    // Estados principales
    const [leads, setLeads] = useState<Lead[]>([])
    const [pipelines, setPipelinesState] = usePersistentState<Pipeline[]>(`pipelines-${companyId}`, [])
    const [activePipeline, setActivePipeline] = useState<PipelineType>('sales')

    // Estados de paginación
    const [stageCounts, setStageCounts] = useState<Record<string, number>>({})
    const [stagePages, setStagePages] = useState<Record<string, StagePagination>>({})
    const [pipelineOffset, setPipelineOffset] = useState(0)
    const [pipelineHasMore, setPipelineHasMore] = useState(false)
    const [isLoadingMore, setIsLoadingMore] = useState(false)

    // Estados auxiliares
    const [unreadLeads, setUnreadLeads] = useState<Set<string>>(new Set())
    const [notasCounts, setNotasCounts] = useState<Record<string, number>>({})
    const [meetingsCounts, setMeetingsCounts] = useState<Record<string, number>>({})

    // Ref para acceso síncrono a leads
    const leadsRef = useRef(leads)
    useEffect(() => { leadsRef.current = leads }, [leads])

    // Pipeline actual derivado
    const currentPipeline = (pipelines || []).find(p => p.type === activePipeline)

    // ==========================================
    // EFECTO: Cargar pipelines
    // ==========================================
    useEffect(() => {
        if (!companyId) return
        let cancelled = false

        const loadPipelines = async () => {
            try {
                const { data, error } = await getPipelines(companyId)
                if (cancelled) return
                if (error) {
                    console.error('[usePipelineData] Error loading pipelines:', error)
                    return
                }

                if (data) {
                    const dbPipelines: Pipeline[] = data.map((p: any) => ({
                        id: p.id,
                        name: p.nombre || 'Sin Nombre',
                        type: p.nombre.toLowerCase().trim().replace(/\s+/g, '-') as PipelineType,
                        assignment_type: p.assignment_type || 'manual',
                        order: p.orden ?? 0,
                        stages: (p.etapas || []).map((s: any) => ({
                            id: s.id,
                            name: s.nombre,
                            order: s.orden,
                            color: s.color,
                              pipelineType: p.nombre.toLowerCase().trim().replace(/\s+/g, '-'),
                              is_sla_enabled: s.is_sla_enabled,
                              sla_limit_minutes: s.sla_limit_minutes
                        })).sort((a: any, b: any) => a.order - b.order)
                    }))

                    // Deduplicar por ID y nombre
                    const seenIds = new Set<string>()
                    const seenNames = new Set<string>()
                    const uniquePipelines = dbPipelines.filter(p => {
                        if (seenIds.has(p.id)) return false
                        const normalizedName = p.name.toLowerCase().trim()
                        if (seenNames.has(normalizedName)) return false
                        seenIds.add(p.id)
                        seenNames.add(normalizedName)
                        return true
                    }).sort((a, b) => {
                        if (a.order !== undefined && b.order !== undefined) {
                            if (a.order !== b.order) return a.order - b.order
                        }
                        // Fallback to name sorting if no order or same order
                        return a.name.localeCompare(b.name)
                    })

                    setPipelinesState(uniquePipelines)

                    setActivePipeline(current => {
                        const exists = uniquePipelines.find(p => p.type === current)
                        if (!exists && uniquePipelines.length > 0) {
                            return uniquePipelines[0].type
                        }
                        return current
                    })
                }
            } catch (err) {
                console.error('[usePipelineData] Error loading pipelines:', err)
            }
        }

        loadPipelines()
        return () => { cancelled = true }
    }, [companyId])

    // ==========================================
    // EFECTO: Cargar leads iniciales por stage
    // ==========================================
    useEffect(() => {
        if (!companyId || !pipelines || pipelines.length === 0) return
        const currentPipelineObj = pipelines.find(p => p.type === activePipeline)
        if (!currentPipelineObj?.id) return

        let cancelled = false
        const stages = currentPipelineObj.stages || []

        // Reset pagination
        setStagePages({})
        setPipelineOffset(0)
        setPipelineHasMore(false)

        Promise.all(
            stages.map(async (s) => {
                const { data, count } = await getLeadsPaged({
                    empresaId: companyId,
                    currentUserId: userId,
                    isAdminOrOwner: canViewAllLeads,
                    limit: BASE_STAGE_LIMIT,
                    offset: 0,
                    pipelineId: currentPipelineObj.id,
                    stageId: s.id,
                    order: 'desc'
                })
                return { stageId: s.id, data: data || [], count: count || 0 }
            })
        )
            .then((results) => {
                if (cancelled) return

                const mappedAll = results.flatMap(({ data }) => data.map(mapDbLeadToLead))

                // Deduplicar
                const byId = new Map<string, Lead>()
                mappedAll.forEach(l => byId.set(l.id, l))
                const unique = Array.from(byId.values())
                setLeads(unique)

                // Cargar conteos de notas y reuniones en background
                if (unique.length > 0) {
                    const ids = unique.map(l => l.id)
                    Promise.all([
                        getNotasCountByLeads(ids),
                        getReunionesCountByLeads(ids)
                    ])
                        .then(([nCounts, mCounts]) => {
                            if (!cancelled) {
                                setNotasCounts(nCounts)
                                setMeetingsCounts(mCounts)
                            }
                        })
                        .catch(err => console.warn('[usePipelineData] Error cargando metadata:', err))
                }

                // Actualizar paginación por stage
                const nextStagePages: Record<string, StagePagination> = {}
                const nextStageCounts: Record<string, number> = {}
                stages.forEach((s) => {
                    const result = results.find(r => r.stageId === s.id)
                    const fetchedForStage = result?.data?.length || 0
                    nextStagePages[s.id] = {
                        offset: fetchedForStage,
                        hasMore: fetchedForStage === BASE_STAGE_LIMIT,
                    }
                    nextStageCounts[s.id] = result?.count || 0
                })
                setStagePages(nextStagePages)
                setStageCounts(nextStageCounts)

                // Verificar si hay más leads a nivel pipeline
                getLeadsPaged({
                    empresaId: companyId,
                    currentUserId: userId,
                    isAdminOrOwner: canViewAllLeads,
                    limit: 1,
                    offset: 0,
                    pipelineId: currentPipelineObj.id,
                    order: 'desc'
                })
                    .then(({ count }) => {
                        if (cancelled) return
                        if (typeof count === 'number') {
                            setPipelineHasMore(count > unique.length)
                            setPipelineOffset(unique.length)
                        }
                    })
                    .catch((err) => console.error('[usePipelineData] Error counting:', err))
            })
            .catch(err => console.error('[usePipelineData] Error loading leads:', err))

        return () => { cancelled = true }
    }, [companyId, activePipeline, pipelines, canViewAllLeads, userId])

    // ==========================================
    // EFECTO: Cargar mensajes no leídos
    // ==========================================
    useEffect(() => {
        if (!companyId || leads.length === 0) return

        const leadIds = leads.map(l => l.id)
        getUnreadMessagesCount(leadIds)
            .then(counts => {
                const unreadSet = new Set<string>()
                Object.entries(counts).forEach(([leadId, count]) => {
                    if (count > 0) unreadSet.add(leadId)
                })
                setUnreadLeads(unreadSet)
            })
            .catch(err => console.error('[usePipelineData] Error loading unread:', err))
    }, [companyId, leads])

    // ==========================================
    // EFECTO: Suscripción realtime a mensajes
    // ==========================================
    useEffect(() => {
        if (!companyId) return

        const subscription = subscribeToAllMessages((msg) => {
            if (msg.lead_id && msg.sender === 'lead') {
                setUnreadLeads(prev => new Set([...prev, msg.lead_id]))
            }
        })

        return () => { subscription.unsubscribe() }
    }, [companyId])

    // ==========================================
    // FUNCIÓN: Cargar más leads de un stage
    // ==========================================
    const loadMoreStage = useCallback(async (stageId: string) => {
        if (!companyId || !pipelines) return
        const currentPipelineObj = pipelines.find(p => p.type === activePipeline)
        if (!currentPipelineObj?.id) return

        const current = stagePages[stageId] || { offset: 0, hasMore: true }
        if (!current.hasMore) return

        try {
            const { data, count } = await getLeadsPaged({
                empresaId: companyId,
                currentUserId: userId,
                isAdminOrOwner: canViewAllLeads,
                limit: STAGE_PAGE_SIZE,
                offset: current.offset,
                pipelineId: currentPipelineObj.id,
                stageId,
                order: 'desc'
            })

            const mapped = (data || []).map(mapDbLeadToLead)

            setLeads((prev) => {
                const byId = new Set(prev.map(l => l.id))
                const toAdd = mapped.filter(l => !byId.has(l.id))
                return [...prev, ...toAdd]
            })

            const fetched = mapped.length
            setStagePages((prev) => ({
                ...prev,
                [stageId]: { offset: current.offset + fetched, hasMore: fetched === STAGE_PAGE_SIZE }
            }))

            if (typeof count === 'number') {
                setStageCounts((prev) => ({ ...prev, [stageId]: count }))
            }

            setPipelineOffset((prev) => prev + fetched)
        } catch (err) {
            console.error('[usePipelineData] Error loading more:', err)
        }
    }, [companyId, pipelines, activePipeline, stagePages, userId, canViewAllLeads])

    // ==========================================
    // FUNCIÓN: Cargar más leads de TODAS las stages
    // ==========================================
    const loadMoreAll = useCallback(async () => {
        if (!companyId || !pipelines || isLoadingMore) return
        const currentPipelineObj = pipelines.find(p => p.type === activePipeline)
        if (!currentPipelineObj?.id) return

        setIsLoadingMore(true)
        try {
            const stages = currentPipelineObj.stages || []

            const loads = stages.map((s) => {
                const current = stagePages[s.id] || { offset: 0, hasMore: true }
                if (!current.hasMore) return Promise.resolve({ stageId: s.id, data: [] as any[] })

                return getLeadsPaged({
                    empresaId: companyId,
                    currentUserId: userId,
                    isAdminOrOwner: canViewAllLeads,
                    limit: STAGE_PAGE_SIZE,
                    offset: current.offset,
                    pipelineId: currentPipelineObj.id,
                    stageId: s.id,
                    order: 'desc'
                }).then(({ data }) => ({ stageId: s.id, data: data || [] }))
            })

            const results = await Promise.all(loads)
            const mappedAll = results.flatMap(({ data }) => (data || []).map(mapDbLeadToLead))

            setLeads((current) => {
                const byId = new Set(current.map(l => l.id))
                const toAdd = mappedAll.filter(l => !byId.has(l.id))
                return [...current, ...toAdd]
            })

            setStagePages((prev) => {
                const next = { ...prev }
                results.forEach(({ stageId, data }) => {
                    const fetched = (data || []).length
                    const current = prev[stageId] || { offset: 0, hasMore: true }
                    next[stageId] = {
                        offset: current.offset + fetched,
                        hasMore: fetched === STAGE_PAGE_SIZE
                    }
                })
                return next
            })

            const anyHasMore = results.some(({ data }) => (data || []).length === STAGE_PAGE_SIZE)
            setPipelineHasMore(anyHasMore)
        } catch (err) {
            console.error('[usePipelineData] Error loading all:', err)
        } finally {
            setIsLoadingMore(false)
        }
    }, [companyId, pipelines, activePipeline, stagePages, isLoadingMore, userId, canViewAllLeads])

    // ==========================================
    // RETURN
    // ==========================================
    return {
        // Data
        pipelines,
        leads,
        activePipeline,
        currentPipeline,
        stageCounts,
        stagePages,
        unreadLeads,
        notasCounts,
        meetingsCounts,

        // Loading
        isLoadingMore,
        hasMore: pipelineHasMore,

        // Actions
        setActivePipeline,
        loadMoreStage,
        loadMoreAll,

        // Setters expuestos para inyección
        setLeads,
        setStageCounts,
        setPipelines: setPipelinesState,
        setUnreadLeads,
        setNotasCounts,
        setMeetingsCounts
    }
}
