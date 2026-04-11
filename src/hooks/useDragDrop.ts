/**
 * useDragDrop Hook
 * 
 * Maneja la lógica de Drag & Drop para mover leads entre stages.
 * 
 * **Patrón de Arquitectura: Optimistic UI**
 * 1. Actualiza el estado local INMEDIATAMENTE (sin esperar BD)
 * 2. Envía la petición a la BD en background
 * 3. Si falla, REVIERTE el cambio local (rollback)
 * 
 * Esto evita el "flickeo" visual donde el lead salta de vuelta
 * a su columna original mientras espera la respuesta del servidor.
 * 
 * **Inyección de Dependencias:**
 * Este hook recibe `setLeads` y `setStageCounts` como argumentos
 * para actualizar el estado que vive en `usePipelineData`.
 * 
 * **Testing requerido:**
 * 1. Arrastrar un lead de una columna a otra → debe quedarse en la nueva
 * 2. Simular error de red → el lead debe volver a su columna original
 * 3. Verificar que los conteos se actualizan correctamente
 */

import { useRef, useCallback, Dispatch, SetStateAction } from 'react'
import { Lead } from '@/lib/types'
import { updateLead } from '@/supabase/services/leads'
import { evaluateAndApplyRules } from '@/supabase/helpers/automationEngine'
import { toast } from 'sonner'


// ============================================
// TIPOS
// ============================================

export interface UseDragDropOptions {
    /** Función para actualizar leads (viene de usePipelineData) */
    setLeads: Dispatch<SetStateAction<Lead[]>>
    /** Función para actualizar conteos (viene de usePipelineData) */
    setStageCounts: Dispatch<SetStateAction<Record<string, number>>>
    /** ¿El usuario puede editar leads? */
    canEditLeads: boolean
    /** ID del usuario actual para auditoría */
    currentUserId?: string
    /** Nombre del usuario actual para auditoría (historial) */
    actorNombre?: string
}

export interface UseDragDropReturn {
    /** Ref al lead siendo arrastrado (para acceso síncrono) */
    draggedLeadRef: React.MutableRefObject<Lead | null>
    /** Handler para inicio de arrastre */
    handleDragStart: (e: React.DragEvent, lead: Lead) => void
    /** Handler para arrastre sobre zona válida */
    handleDragOver: (e: React.DragEvent) => void
    /** Handler para soltar lead en nueva columna */
    handleDrop: (e: React.DragEvent, targetStageId: string) => void
    /** Mover lead programáticamente (para diálogos de mover) */
    moveLead: (lead: Lead, targetStageId: string) => Promise<void>
}

// ============================================
// HOOK PRINCIPAL
// ============================================
export function useDragDrop(options: UseDragDropOptions): UseDragDropReturn {
    const { setLeads, setStageCounts, canEditLeads, currentUserId, actorNombre } = options

    // Ref para el lead siendo arrastrado (evita re-renders durante drag)
    const draggedLeadRef = useRef<Lead | null>(null)

    /**
     * Actualiza el estado optimísticamente y sincroniza con BD
     * @param lead Lead original (antes del movimiento)
     * @param targetStageId ID de la etapa destino
     */
    const moveLead = useCallback(async (lead: Lead, targetStageId: string) => {
        if (!canEditLeads) {
            toast.error('No tienes permisos para mover leads')
            return
        }

        // Si no hay cambio, no hacer nada
        if (lead.stage === targetStageId) {
            return
        }

        const originalStageId = lead.stage
        const updatedLead = { ...lead, stage: targetStageId, stageEnteredAt: new Date(), slaCustomLimitMinutes: null }

        // 1. OPTIMISTIC UPDATE: Actualizar UI inmediatamente
        setLeads((current) =>
            (current || []).map(l => l.id === lead.id ? updatedLead : l)
        )

        // Actualizar conteos optimísticamente
        setStageCounts(prev => ({
            ...prev,
            [originalStageId]: Math.max(0, (prev[originalStageId] || 0) - 1),
            [targetStageId]: (prev[targetStageId] || 0) + 1
        }))

        // 2. SYNC CON BD: Si es UUID válido, actualizar en servidor
        const isValidUUID = lead.id.length > 20
        if (isValidUUID) {
            try {
                await updateLead(lead.id, { etapa_id: targetStageId, stage_entered_at: new Date().toISOString(), sla_custom_limit_minutes: null }, currentUserId, actorNombre)
                toast.success('Lead movido a nueva etapa')

                // 🤖 Automation: fire stage_change trigger (non-blocking)
                // We pass the lead with the NEW stage so the engine can match rules for that stage
                const leadWithNewStage = { ...lead, stage: targetStageId, etapa_id: targetStageId } as any
                evaluateAndApplyRules('stage_change', leadWithNewStage, { fromStageId: originalStageId }).catch(
                    (err: any) => console.warn('[useDragDrop] Automation eval error:', err)
                )

            } catch (err: any) {
                console.error('[useDragDrop] Error updating lead stage:', err)
                toast.error(`Error al mover lead: ${err.message || 'Error desconocido'}`)

                // 3. ROLLBACK: Revertir cambio local si falla
                setLeads((current) =>
                    (current || []).map(l => l.id === lead.id ? lead : l)
                )
                setStageCounts(prev => ({
                    ...prev,
                    [originalStageId]: (prev[originalStageId] || 0) + 1,
                    [targetStageId]: Math.max(0, (prev[targetStageId] || 0) - 1)
                }))
            }
        } else {
            toast.success('Lead movido a nueva etapa (local)')
        }
    }, [canEditLeads, setLeads, setStageCounts])

    /**
     * Handler para inicio del arrastre
     */
    const handleDragStart = useCallback((e: React.DragEvent, lead: Lead) => {
        if (!canEditLeads) {
            e.preventDefault()
            return
        }
        draggedLeadRef.current = lead
        e.dataTransfer.effectAllowed = 'move'
    }, [canEditLeads])

    /**
     * Handler para drag over (permite drop)
     */
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
    }, [])

    /**
     * Handler para drop en una columna
     */
    const handleDrop = useCallback((e: React.DragEvent, targetStageId: string) => {
        e.preventDefault()

        const lead = draggedLeadRef.current
        if (!lead) return

        draggedLeadRef.current = null

        // Delegar a moveLead para lógica centralizada
        moveLead(lead, targetStageId)
    }, [moveLead])

    return {
        draggedLeadRef,
        handleDragStart,
        handleDragOver,
        handleDrop,
        moveLead
    }
}
