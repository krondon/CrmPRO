import { useEffect, useMemo, useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import { useLeadsRealtime } from '@/hooks/useLeadsRealtime'
import { usePipelineData } from '@/hooks/usePipelineData'
import { usePipelineLeadActions } from '@/hooks/usePipelineLeadActions'
import { useDragDrop } from '@/hooks/useDragDrop'
import { useStageDragDrop } from '@/hooks/useStageDragDrop'
import { Lead, Pipeline, PipelineType, TeamMember, Stage } from '@/lib/types'
// import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, Funnel, Trash, CaretLeft, CaretRight, Download, GearSix, ArrowsClockwise, Shuffle } from '@phosphor-icons/react'
import { LeadDetailSheet } from './LeadDetailSheet'
import { AddStageDialog } from './AddStageDialog'
import { AddLeadDialog } from './AddLeadDialog'
import { AddPipelineDialog } from './AddPipelineDialog'
import { EditPipelineDialog } from './EditPipelineDialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useTranslation } from '@/lib/i18n'
import { toast } from 'sonner'
import { deletePipeline, getPipelines, updatePipelinesOrder } from '@/supabase/helpers/pipeline'
import { deleteLead, getLeads, getLeadsPaged, updateLead, searchLeads } from '@/supabase/services/leads'
import { getEquipos } from '@/supabase/services/equipos'
import { getPersonas } from '@/supabase/services/persona'
import { getPipelinesForPersona } from '@/supabase/helpers/personaPipeline'
import { createEtapa, deleteEtapa, updateEtapa } from '@/supabase/helpers/etapas'
import { getUnreadMessagesCount, subscribeToAllMessages, markMessagesAsRead } from '@/supabase/services/mensajes'
import { getNotasCountByLeads } from '@/supabase/services/notas'
import { supabase } from '@/lib/supabase'

import { Building } from '@phosphor-icons/react'
import { PipelineBoard } from './pipeline/PipelineBoard'
import { Company } from './CompanyManagement'
import { LeadSearchDialog } from './LeadSearchDialog'
import { ExportLeadsDialog } from './leads/ExportLeadsDialog'
import { useIsMobile } from '@/hooks/use-mobile'

interface User {
  id: string
  email: string
  businessName: string
}

export function PipelineView({ companyId, companies = [], user }: { companyId?: string; companies?: Company[]; user?: User | null }) {
  const t = useTranslation('es')

  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="bg-muted/50 p-6 rounded-full mb-4">
          <Building size={64} className="text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold mb-2">No hay empresa seleccionada</h2>
        <p className="text-muted-foreground max-w-md mb-6">
          Debes crear o seleccionar una empresa para gestionar pipelines y oportunidades.
        </p>
      </div>
    )
  }

  // ==========================================
  // HOOK: Datos del pipeline (pipelines, leads, paginación)
  // ==========================================
  const {
    pipelines,
    leads,
    activePipeline,
    setActivePipeline,
    currentPipeline,
    stageCounts,
    stagePages,
    unreadLeads,
    notasCounts,
    meetingsCounts,
    isLoadingMore: isLoadingMoreAll,
    hasMore: pipelineHasMore,
    loadMoreStage: handleLoadMoreStage,
    loadMoreAll: handleLoadMoreAll,
    setLeads,
    setStageCounts,
    setPipelines,
    setUnreadLeads,
    setNotasCounts,
    setMeetingsCounts
  } = usePipelineData({
    companyId,
    userId: user?.id,
    canViewAllLeads: true // Cambiar según permisos
  })

  // Estados UI locales (no manejados por hooks)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [filterByMember, setFilterByMember] = useState<string>('all')
  const isMobile = useIsMobile()
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [moveDialogLead, setMoveDialogLead] = useState<Lead | null>(null)
  const [highlightedLeadId, setHighlightedLeadId] = useState<string | null>(null)
  const [showAddPipelineDialog, setShowAddPipelineDialog] = useState(false)
  const [draggedPipelineId, setDraggedPipelineId] = useState<string | null>(null)
  const tabsScrollRef = useRef<HTMLDivElement>(null)
  const [showEditPipelineDialog, setShowEditPipelineDialog] = useState(false)

  // Ref para acceso síncrono a leads (usado por realtime)
  const leadsRef = useRef(leads)
  useEffect(() => {
    leadsRef.current = leads
  }, [leads])

  // Estado para gestionar la navegación pendiente a un lead (Global Search)
  // Stages: 'init' -> 'switching_pipeline' -> 'waiting_load' -> 'checking_lead' -> 'scrolling'
  const [pendingNavigation, setPendingNavigation] = useState<{
    leadId: string,
    leadData: Lead, // Guardamos copia del lead para re-inyección
    pipelineType: string,
    stage: 'init' | 'switching_pipeline' | 'waiting_load' | 'checking_lead' | 'scrolling',
    attempt: number
  } | null>(null)

  // EFECTO: Máquina de estados para la navegación robusta
  useEffect(() => {
    if (!pendingNavigation) return

    const { stage, leadId, leadData, pipelineType, attempt } = pendingNavigation

    // 1. INICIO: Cambiar pipeline si es necesario
    if (stage === 'init') {
      if (activePipeline !== pipelineType) {
        console.log('[PipelineView] Cambiando pipeline a:', pipelineType)
        setActivePipeline(pipelineType as PipelineType)
        setPendingNavigation(prev => prev ? { ...prev, stage: 'switching_pipeline' } : null)
      } else {
        // Ya estamos en el pipeline, pasamos directo a verificar
        setPendingNavigation(prev => prev ? { ...prev, stage: 'checking_lead' } : null)
      }
      return
    }

    // 2. SWITCHING: Dar tiempo a que decante el cambio de estado del tab
    if (stage === 'switching_pipeline') {
      const timer = setTimeout(() => {
        setPendingNavigation(prev => prev ? { ...prev, stage: 'waiting_load' } : null)
      }, 500) // Pequeña pausa inicial
      return () => clearTimeout(timer)
    }

    // 3. WAITING LOAD: Esperar a que el fetch traiga datos (segundos explícitos)
    if (stage === 'waiting_load') {
      // El usuario pidió esperar unos segundos.
      const timer = setTimeout(() => {
        setPendingNavigation(prev => prev ? { ...prev, stage: 'checking_lead' } : null)
      }, 1500)
      return () => clearTimeout(timer)
    }

    // 4. CHECKING LEAD: Verificar si existe y re-inyectar si falta
    if (stage === 'checking_lead') {
      const exists = leads.some(l => l.id === leadId)

      if (!exists) {
        console.warn('[PipelineView] Lead no visible tras carga. Re-inyectando:', leadId)
        setLeads(current => {
          const alreadyThere = current.some(l => l.id === leadId)
          if (alreadyThere) return current
          return [...current, leadData]
        })

        // NUEVO: Verificar si la etapa del lead existe siquiera en este pipeline
        const currentPipelineData = pipelines.find(p => p.type === activePipeline)
        const stageExists = currentPipelineData?.stages.some(s => s.id === leadData.stage)

        if (!stageExists) {
          console.warn('[PipelineView] La etapa del lead no existe en el pipeline activo. Abriendo detalles sin scroll.', leadData.stage)
          setPendingNavigation(null)
          setSelectedLead(leadData)
          toast.warning('El lead no pertenece a ninguna etapa visible de este pipeline, pero se abrieron sus detalles.')
          return
        }

        // Dar tiempo al render
        const timer = setTimeout(() => {
          setPendingNavigation(prev => prev ? { ...prev, stage: 'scrolling' } : null)
        }, 200)
        return () => clearTimeout(timer)
      } else {
        // Ya existe, scrollear
        setPendingNavigation(prev => prev ? { ...prev, stage: 'scrolling' } : null)
      }
      return
    }

    // 5. SCROLLING: Realizar el scroll final
    if (stage === 'scrolling') {
      const leadCard = document.getElementById(`lead-card-${leadId}`)

      if (leadCard) {
        console.log('[PipelineView] Scroll final al lead:', leadId)
        leadCard.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
        setHighlightedLeadId(leadId)

        // IMPORTANTE: Quitar el overlay DE INMEDIATO para que el usuario vea el lead resaltado
        setPendingNavigation(null)

        // NUEVO: Abrir detalles automáticamente cuando navega desde el global
        setSelectedLead(leadData)

        // Mantener el highlight visible por 4 segundos para llamar la atención
        setTimeout(() => {
          setHighlightedLeadId(null)
        }, 4000)
      } else {
        // Reintentos cortos por si el DOM aun no pinta
        if (attempt < 10) {
          const timer = setTimeout(() => {
            setPendingNavigation(prev => prev ? { ...prev, attempt: prev.attempt + 1 } : null)
          }, 200)
          return () => clearTimeout(timer)
        } else {
          console.error('[PipelineView] Falló scroll visual al lead:', leadId)
          setPendingNavigation(null)
          // NUEVO: Forzar apertura aunque falló el UI de la tarjeta
          setSelectedLead(leadData)
          toast.warning('No se pudo ubicar visualmente, pero se abrieron los detalles del lead')
        }
      }
    }

  }, [pendingNavigation, leads, activePipeline, pipelines])

  // EFECTO: Leer navegación pendiente desde sessionStorage (Chats/Dashboard)
  useEffect(() => {
    const pendingNav = sessionStorage.getItem('pendingLeadNavigation')
    if (pendingNav && pipelines.length > 0) {
      sessionStorage.removeItem('pendingLeadNavigation')
      try {
        const { leadId, leadData, pipelineId } = JSON.parse(pendingNav)
        const leadPipeline = pipelines.find(p => p.id === pipelineId || p.type === pipelineId)

        console.log('[PipelineView] Navegación desde externa:', { leadId, pipelineId, leadPipeline })

        setPendingNavigation({
          leadId,
          leadData,
          pipelineType: leadPipeline?.type || 'sales',
          stage: 'init',
          attempt: 0
        })
      } catch (err) {
        console.error('[PipelineView] Error parsing pending navigation:', err)
      }
    }
  }, [pipelines])

  const currentCompany = companies.find(c => c.id === companyId)
  const userRole = currentCompany?.role || 'viewer'

  /**
   * VISIBILIDAD DE LEADS SEGÚN ROL
   * 
   * Opciones de configuración (modificar canViewAllLeads):
   * 
   * 1. TODOS VEN TODO (configuración actual):
   *    const canViewAllLeads = true
   * 
   * 2. SOLO ADMIN/OWNER VEN TODO (viewers solo ven sus leads asignados):
   *    const canViewAllLeads = userRole === 'admin' || userRole === 'owner'
   * 
   * 3. ADMIN VE TODO, VIEWER VE SUS LEADS + LOS DE "TODOS":
   *    const canViewAllLeads = userRole === 'admin' || userRole === 'owner'
   *    (El servicio leads.ts ya filtra por asignado_a cuando isAdminOrOwner=false)
   * 
   * 4. ROL ESPECÍFICO CON VISTA COMPLETA:
   *    const canViewAllLeads = ['admin', 'owner', 'lector_completo'].includes(userRole)
   */
  const canViewAllLeads = true // Cambiar a la opción deseada arriba

  const isAdminOrOwner = userRole === 'admin' || userRole === 'owner'
  // Viewers ahora pueden crear y editar leads, pero no eliminar ni gestionar pipelines
  const canEditLeads = true

  // ==========================================
  // HOOK: Acciones del Pipeline (CRUD leads/stages)
  // ==========================================
  const {
    handleAddStage,
    handleImportLeads,
    handleDeleteLead
  } = usePipelineLeadActions({
    companyId: companyId || '',
    activePipeline,
    pipelines,
    setPipelines,
    setLeads,
    setStageCounts,
    user,
    isAdminOrOwner
  })

  // ==========================================
  // HOOK: Drag & Drop con Optimistic UI
  // ==========================================
  const {
    draggedLeadRef,
    handleDragStart,
    handleDragOver,
    handleDrop,
    moveLead: handleMoveLead
  } = useDragDrop({
    setLeads,
    setStageCounts,
    canEditLeads,
    currentUserId: user?.id,
    actorNombre: user?.businessName || (user as any)?.nombre || user?.email,
    companyId,
    stagesById: useMemo(() => {
      const map: Record<string, string> = {}
      pipelines.forEach(p => p.stages.forEach(s => { map[s.id] = s.name }))
      return map
    }, [pipelines])
  })

  // Drag & Drop de Etapas (reordenar columnas)
  const {
    draggedStageRef,
    handleStageDragStart,
    handleStageDragOverHeader,
    handleStageDropOnHeader
  } = useStageDragDrop({
    pipelines,
    activePipeline,
    setPipelines,
    canEditStages: isAdminOrOwner
  })

  // Drag & drop handlers for Pipeline tabs
  const handlePipelineDragStart = (e: React.DragEvent, id: string) => {
    if (!isAdminOrOwner) {
      e.preventDefault()
      return
    }
    setDraggedPipelineId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/x-pipeline-id', id)
  }

  const handlePipelineDragOver = (e: React.DragEvent) => {
    if (!draggedPipelineId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handlePipelineDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    e.stopPropagation()

    if (!isAdminOrOwner) return
    const draggedId = e.dataTransfer.getData('application/x-pipeline-id') || draggedPipelineId
    if (!draggedId || draggedId === targetId) {
      setDraggedPipelineId(null)
      return
    }

    const newPipelines = [...(pipelines || [])]
    const draggedIdx = newPipelines.findIndex(p => p.id === draggedId)
    const targetIdx = newPipelines.findIndex(p => p.id === targetId)

    if (draggedIdx === -1 || targetIdx === -1) {
      setDraggedPipelineId(null)
      return
    }

    const [draggedItem] = newPipelines.splice(draggedIdx, 1)
    newPipelines.splice(targetIdx, 0, draggedItem)

    const reordered = newPipelines.map((p, index) => ({ ...p, order: index }))

    // Optimistic UI
    setPipelines(reordered)
    setDraggedPipelineId(null)

    try {
      const updates = reordered.map(p => ({ id: p.id, orden: p.order || 0 }))
      await updatePipelinesOrder(updates)
      // No toast needed for smooth UX
    } catch (error) {
      console.error("Error saving pipeline order", error)
      toast.error("Error al guardar el orden de los pipelines")
    }
  }

  // Sincronización en tiempo real de leads
  useLeadsRealtime({
    companyId: companyId || '',
    onInsert: (lead) => {
      let added = false
      setLeads((current) => {
        // Evitar duplicados
        if (current.find(l => l.id === lead.id)) return current
        added = true
        return [...current, lead]
      })
      if (!added) return
      setStageCounts(prev => ({
        ...prev,
        [lead.stage]: (prev[lead.stage] || 0) + 1
      }))
    },
    onUpdate: (lead) => {
      const oldLead = leadsRef.current.find(l => l.id === lead.id)
      if (oldLead && oldLead.stage !== lead.stage) {
        setStageCounts(prev => ({
          ...prev,
          [oldLead.stage]: Math.max(0, (prev[oldLead.stage] || 0) - 1),
          [lead.stage]: (prev[lead.stage] || 0) + 1
        }))
      }
      // Preservar customFields del estado local si el evento realtime no los trae
      const merged = { ...lead, customFields: lead.customFields && Object.keys(lead.customFields).length ? lead.customFields : (oldLead?.customFields ?? {}) }
      setLeads((current) => current.map(l => l.id === lead.id ? merged : l));
    },
    onDelete: (leadId) => {
      const leadToDelete = leadsRef.current.find(l => l.id === leadId)
      if (leadToDelete) {
        setStageCounts(prev => ({
          ...prev,
          [leadToDelete.stage]: Math.max(0, (prev[leadToDelete.stage] || 0) - 1)
        }))
      }
      setLeads((current) => current.filter(l => l.id !== leadId));
      toast.error(`Oportunidad eliminada`);
    }
  });

  // Cargar miembros del equipo desde BD para tener pipelines actualizados
  useEffect(() => {
    if (!companyId) return
    let cancelled = false

      ; (async () => {
        try {
          const equipos = await getEquipos(companyId)
          if (cancelled) return

          const equiposIds = equipos.map(e => e.id)
          const allPersonas = await Promise.all(equiposIds.map(id => getPersonas(id)))
          if (cancelled) return

          const personas = allPersonas.flat()

          const mapped = await Promise.all(personas.map(async p => {
            let memberPipelines: string[] = []
            try {
              const { data: pPipelines } = await getPipelinesForPersona(p.id)
              if (pPipelines) {
                // Aquí obtenemos los IDs de los pipelines asignados
                memberPipelines = pPipelines.map((pp: any) => pp.pipeline_id)
              }
            } catch (err) {
              console.error('Error loading pipelines for persona', p.id, err)
            }

            return {
              id: p.id,
              name: p.nombre || 'Sin Nombre',
              email: p.email,
              avatar: '',
              role: p.titulo_trabajo || '',
              teamId: p.equipo_id || undefined,
              pipelines: memberPipelines,
              userId: p.usuario_id || undefined
            }
          }))

          // Deduplicar miembros por email (o id)
          const uniqueMap = new Map()
          for (const m of mapped) {
            const key = m.email ? m.email.toLowerCase() : m.id
            if (!uniqueMap.has(key)) {
              uniqueMap.set(key, m)
            }
          }
          if (!cancelled) setTeamMembers(Array.from(uniqueMap.values()))
        } catch (e) {
          console.error('Error loading team members in PipelineView', e)
        }
      })()

    return () => { cancelled = true }
  }, [companyId])

  // ==========================================
  // NOTA: loadPipelines, loadLeads, handleLoadMoreStage, handleLoadMoreAll,
  // y la subscripción a mensajes no leídos ahora viven en usePipelineData.
  // Se eliminaron ~340 líneas de código duplicado.
  // ==========================================


  // LOGICA DE FILTRADO ROBUSTA
  const allPipelineLeads = leads.filter(l => {
    // Comparamos con el ID real (UUID) del pipeline actual
    if (l.pipeline === currentPipeline?.id) return true
    // También permitimos coincidencia por tipo si el lead tiene el string (ej: 'sales')
    if (currentPipeline?.type && l.pipeline === currentPipeline.type) return true
    return false
  })

  const eligibleMembers = (teamMembers || []).filter(m => {
    if (!m.pipelines || m.pipelines.length === 0) return false

    return m.pipelines.some(p => {
      // Coincidencia exacta (UUID o slug)
      if (p === activePipeline) return true
      // Coincidencia por nombre del pipeline custom (si se guardó nombre en vez de ID)
      if (currentPipeline && p === currentPipeline.name) return true
      // Coincidencia por ID del pipeline actual (si es custom y tiene ID)
      if (currentPipeline && currentPipeline.id && p === currentPipeline.id) return true

      return false
    })
  })

  const teamMemberNames = eligibleMembers.map(m => m.name)
  const NIL_UUID = '00000000-0000-0000-0000-000000000000'
  const pipelineLeads = filterByMember === 'all'
    ? allPipelineLeads
    : allPipelineLeads.filter(l => {
      if (filterByMember === 'me') {
        if (user && (l.assignedTo === user.id || l.assignedTo === user.businessName || l.assignedTo === user.email)) return true
        return false
      }
      if (filterByMember === 'me+todos') {
        if (user && (l.assignedTo === user.id || l.assignedTo === user.businessName || l.assignedTo === user.email)) return true
        if (l.assignedTo === NIL_UUID || l.assignedTo == null) return true
        return false
      }
      if (filterByMember === 'todos') {
        return l.assignedTo === NIL_UUID || l.assignedTo == null
      }
      if (l.assignedTo === filterByMember) return true
      const member = teamMembers.find(m => m.id === filterByMember)
      if (member && l.assignedTo === member.name) return true
      return false
    })

  useEffect(() => {
    const allowed = ['all', 'me', 'me+todos', 'todos']
    if (allowed.includes(filterByMember)) return
    if (!eligibleMembers.find(m => m.id === filterByMember)) {
      setFilterByMember('all')
    }
  }, [activePipeline, teamMembers, filterByMember, eligibleMembers])

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-destructive'
      case 'medium': return 'bg-warning'
      case 'low': return 'bg-muted-foreground'
      default: return 'bg-muted-foreground'
    }
  }









  const handleDeleteMultipleLeads = async (ids: string[]) => {
    // Optimistic delete or parallel delete
    await Promise.all(ids.map(id => deleteLead(id)))

    setLeads((current) => {
      const leadsToDelete = current.filter(l => ids.includes(l.id))

      if (leadsToDelete.length > 0) {
        setStageCounts(prev => {
          const next = { ...prev }
          leadsToDelete.forEach(l => {
            next[l.stage] = Math.max(0, (next[l.stage] || 0) - 1)
          })
          return next
        })
      }
      return current.filter(l => !ids.includes(l.id))
    })

    // Si el seleccionado fue eliminado, cerrarlo
    setSelectedLead((current) => current && ids.includes(current.id) ? null : current)
  }

  const handleDeleteStage = async (stageId: string) => {
    if (!isAdminOrOwner) {
      toast.error('No tienes permisos para eliminar etapas')
      return
    }

    if (!window.confirm('¿Quieres eliminar la etapa? Se eliminarán todos los leads en ella.')) {
      return
    }

    // Check if it's a UUID (DB stage)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stageId)

    if (isUUID) {
      try {
        const { error } = await deleteEtapa(stageId)
        if (error) throw error
      } catch (err: any) {
        console.error('Error deleting stage:', err)
        toast.error(`Error al eliminar etapa de BD: ${err.message || err.details || 'Error desconocido'}`)
        return
      }
    }

    setPipelines((current) => {
      const pipelines = current || []
      const pipelineIndex = pipelines.findIndex(p => p.type === activePipeline)

      if (pipelineIndex === -1) return pipelines

      const updatedPipelines = [...pipelines]
      updatedPipelines[pipelineIndex] = {
        ...updatedPipelines[pipelineIndex],
        stages: updatedPipelines[pipelineIndex].stages.filter(s => s.id !== stageId)
      }

      return updatedPipelines
    })
    toast.success('Etapa eliminada')
  }

  const handleResetSLA = async (stageId: string) => {
    if (!isAdminOrOwner) return
    const isConfirmed = window.confirm('¿Estás seguro de reiniciar los semáforos de esta etapa? Todos los leads iniciarán su contador desde 0 ahora mismo.')
    if (!isConfirmed) return

    try {
      const { resetStageSLAs } = await import('@/supabase/services/etapas')
      await resetStageSLAs(stageId)
      
      const now = new Date()
      setLeads(current =>
        (current || []).map(l =>
          l.stage === stageId
            ? { ...l, stageEnteredAt: now, slaCustomLimitMinutes: null }
            : l
        )
      )
      toast.success('Semáforos reiniciados con éxito')
    } catch (err: any) {
      console.error('Error resetting SLAs:', err)
      toast.error('Error al reiniciar los semáforos')
    }
  }

  const handleEditStage = async (stageId: string, updates: { name?: string; color?: string; is_sla_enabled?: boolean; sla_limit_minutes?: number | null }) => {
    if (!isAdminOrOwner) {
      toast.error('No tienes permisos para editar etapas')
      return
    }

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stageId)

    if (isUUID) {
      try {
        const payload: Record<string, any> = {}
        if (updates.name !== undefined) payload.nombre = updates.name
        if (updates.color !== undefined) payload.color = updates.color
        if (updates.is_sla_enabled !== undefined) payload.is_sla_enabled = updates.is_sla_enabled
        if (updates.sla_limit_minutes !== undefined) payload.sla_limit_minutes = updates.sla_limit_minutes

        const { error } = await updateEtapa(stageId, payload)
        if (error) throw error
      } catch (err: any) {
        console.error('Error updating stage:', err)
        toast.error(`Error al actualizar etapa: ${err.message || 'Error desconocido'}`)
        return
      }
    }

    // Only clear time if SLA is completely disabled. Otherwise, keep the entered time but update their limits
    const slaDisabled = updates.is_sla_enabled === false
    const slaTimeChanged = updates.sla_limit_minutes !== undefined
    const slaReEnabled = updates.is_sla_enabled === true

    if (slaDisabled || slaTimeChanged || slaReEnabled) {
      // Update leads locally
      setLeads(current =>
        (current || []).map(l =>
          l.stage === stageId
            ? { ...l, stageEnteredAt: slaDisabled ? null : l.stageEnteredAt, slaCustomLimitMinutes: updates.sla_limit_minutes ?? null }
            : l
        )
      )

      // Update leads in DB (non-blocking)
      if (!slaDisabled) {
        import('@/supabase/services/etapas').then(({ syncStageSLALimits }) => {
           syncStageSLALimits(stageId, updates.sla_limit_minutes ?? null)
            .catch(err => console.error('[handleEditStage] Error syncing SLA limits:', err))
        })
      }
    }

    setPipelines((current) => {
      const pipelines = current || []
      const pipelineIndex = pipelines.findIndex(p => p.type === activePipeline)
      if (pipelineIndex === -1) return pipelines

      const updatedPipelines = [...pipelines]
      updatedPipelines[pipelineIndex] = {
        ...updatedPipelines[pipelineIndex],
        stages: updatedPipelines[pipelineIndex].stages.map(s =>
          s.id === stageId
            ? {
                ...s,
                ...(updates.name !== undefined ? { name: updates.name } : {}),
                ...(updates.color !== undefined ? { color: updates.color } : {}),
                ...(updates.is_sla_enabled !== undefined ? { is_sla_enabled: updates.is_sla_enabled } : {}),
                ...(updates.sla_limit_minutes !== undefined ? { sla_limit_minutes: updates.sla_limit_minutes } : {})
              }
            : s
        )
      }
      return updatedPipelines
    })
    toast.success('Etapa actualizada')
  }

  const handleDeletePipeline = async () => {
    if (!isAdminOrOwner) {
      toast.error('No tienes permisos para eliminar pipelines')
      return
    }
    if (['sales', 'support', 'administrative'].includes(activePipeline)) return

    try {
      // Si el pipeline tiene un ID (es decir, está guardado en BD), lo eliminamos
      if (currentPipeline?.id && !currentPipeline.id.startsWith('pipeline-')) {
        const { error } = await deletePipeline(currentPipeline.id)
        if (error) {
          console.error('Error deleting pipeline from DB:', error)
          // Si el error es por violación de llave foránea (leads asociados)
          if (error.code === '23503' || error.message?.includes('foreign key constraint')) {
            toast.error('No se puede eliminar el pipeline porque tiene oportunidades (leads) adentro. Por favor, mueve o elimina los leads primero.')
          } else {
            toast.error(`Error al eliminar pipeline: ${error.message || 'Error desconocido'}`)
          }
          return
        }
      }

      setPipelines((current) => (current || []).filter(p => p.type !== activePipeline))
      setActivePipeline('sales')
      toast.success('Pipeline eliminado correctamente')
    } catch (error: any) {
      console.error('Error deleting pipeline:', error)
      toast.error(`Error al eliminar pipeline: ${error.message || 'Error desconocido'}`)
    }
  }

  // ==========================================
  // NOTA: handleMoveLead, handleDragStart, handleDragOver, handleDrop
  // ahora viven en useDragDrop hook.
  // Se eliminaron ~110 líneas de código duplicado.
  // ==========================================

  // ... existing code ...

  // Optimistic UI update helper (to avoid double creation)
  const handleLeadAddedToState = (lead: Lead) => {
    let added = false
    setLeads((current) => {
      if (current.some(l => l.id === lead.id)) return current
      added = true
      return [...current, lead]
    })

    if (added) {
      setStageCounts(prev => ({
        ...prev,
        [lead.stage]: (prev[lead.stage] || 0) + 1
      }))
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-4 md:p-6 border-b border-border/50 bg-gradient-to-r from-background via-background to-muted/10">

        {/* Loading Overlay for Global Navigation */}
        {pendingNavigation && (
          <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-300">
            <div className="flex flex-col items-center gap-4 p-8 bg-card rounded-xl shadow-2xl border border-border">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <div className="flex flex-col items-center gap-1">
                <p className="text-base font-semibold">Navegando a la oportunidad...</p>
                <p className="text-xs text-muted-foreground">Cargando pipeline {pendingNavigation.pipelineType}...</p>
              </div>
            </div>
          </div>
        )}

        {/* Header Row - Title and Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <div className="h-8 w-1.5 rounded-full bg-gradient-to-b from-primary via-primary/60 to-primary/20" />
            <h1 className="text-2xl md:text-3xl font-black text-foreground tracking-tighter">{t.pipeline.title}</h1>
            
            {/* Indicador de Auto-asignación para el pipeline activo */}
            {currentPipeline?.assignment_type === 'round_robin' && (
              <Badge variant="outline" className="ml-2 text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                <ArrowsClockwise size={14} weight="bold" />
                Auto-asignación (Round Robin)
              </Badge>
            )}
            {currentPipeline?.assignment_type === 'random' && (
              <Badge variant="outline" className="ml-2 text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Shuffle size={14} weight="bold" />
                Auto-asignación (Aleatorio)
              </Badge>
            )}
          </div>

          {/* Action Buttons - Modern Compact Pill Design */}
          <div className="flex items-center gap-2">
            {/* Search Button */}
            <LeadSearchDialog
              leads={leads}
              pipelines={pipelines}
              onSelectLead={(lead) => setSelectedLead(lead)}
              canDelete={isAdminOrOwner}
              onDeleteLeads={handleDeleteMultipleLeads}
              onSearch={async (term) => {
                const currentPipelineObj = pipelines.find(p => p.type === activePipeline)
                const currentPipelineId = currentPipelineObj?.id
                try {
                  const results = await searchLeads(companyId!, term, {
                    archived: false,
                    limit: 100,
                    order: 'desc'
                  })
                  return (results || []).map((l: any) => ({
                    id: l.id,
                    name: l.nombre_completo,
                    email: l.correo_electronico,
                    phone: l.telefono,
                    company: l.empresa,
                    location: l.ubicacion,
                    budget: l.presupuesto,
                    stage: l.etapa_id,
                    pipeline: l.pipeline_id || 'sales',
                    priority: l.prioridad,
                    assignedTo: l.asignado_a,
                    tags: l.tags || [],
                    createdAt: new Date(l.created_at),
                    lastContact: new Date(l.created_at),
                    stageEnteredAt: l.stage_entered_at ? new Date(l.stage_entered_at) : null,
                    slaCustomLimitMinutes: l.sla_custom_limit_minutes ?? null
                  }))
                } catch (err) {
                  console.error('[PipelineView] Error searching leads:', err)
                  return []
                }
              }}
              onNavigateToLead={(lead) => {
                const leadPipeline = pipelines.find(p => p.id === lead.pipeline || p.type === lead.pipeline)
                setPendingNavigation({
                  leadId: lead.id,
                  leadData: lead,
                  pipelineType: leadPipeline?.type || 'sales',
                  stage: 'init',
                  attempt: 0
                })
              }}
            />

            {/* Pipeline Context Actions - Circular Buttons */}
            {currentPipeline && (
              <div className="hidden sm:flex items-center gap-1 bg-muted/40 rounded-full p-1 border border-border/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]">
                <ExportLeadsDialog
                  leads={pipelineLeads}
                  stages={currentPipeline?.stages || []}
                  teamMembers={teamMembers}
                  companyName={currentCompany?.name}
                  trigger={
                    <Button
                      variant="ghost"
                      className="h-8 w-8 p-0 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background hover:shadow-sm transition-all"
                      title="Exportar Leads"
                    >
                      <Download size={16} />
                    </Button>
                  }
                />

                {canEditLeads && isAdminOrOwner && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        className="h-8 w-8 p-0 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                        title="Eliminar Pipeline"
                      >
                        <Trash size={16} />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta acción no se puede deshacer. Se eliminará el pipeline "{currentPipeline?.name}" y toda su configuración.
                          Los leads asociados podrían dejar de ser visibles.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeletePipeline} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Eliminar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                {/* Settings (Assignment Config) Button */}
                {isAdminOrOwner && (
                  <Button
                    variant="ghost"
                    className="h-8 w-8 p-0 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background hover:shadow-sm transition-all"
                    title="Configurar asignación"
                    onClick={() => setShowEditPipelineDialog(true)}
                  >
                    <GearSix size={16} />
                  </Button>
                )}

                {canEditLeads && (
                  <AddStageDialog
                    pipelineType={activePipeline}
                    currentStagesCount={currentPipeline?.stages.length || 0}
                    onAdd={handleAddStage}
                    trigger={
                      <Button
                        variant="ghost"
                        className="h-8 w-8 p-0 rounded-full flex items-center justify-center text-blue-600 hover:text-blue-700 hover:bg-blue-50 hover:shadow-sm transition-all"
                        title="Agregar Etapa"
                      >
                        <Plus size={16} weight="bold" />
                      </Button>
                    }
                  />
                )}
              </div>
            )}

            {currentPipeline && canEditLeads && (
              <div className="ml-1">
                <AddLeadDialog
                  pipelineType={activePipeline}
                  pipelineId={currentPipeline?.id}
                  stages={currentPipeline?.stages || []}
                  teamMembers={teamMembers}
                  onAdd={handleLeadAddedToState}
                  onImport={handleImportLeads}
                  companies={companies}
                  currentUser={user}
                  companyName={currentCompany?.name}
                  companyId={companyId}
                  assignmentType={currentPipeline?.assignment_type}
                />
              </div>
            )}
          </div>
        </div>

        {/* Pipeline Tabs - Horizontal scroll with arrows */}
        <Tabs value={activePipeline} onValueChange={(v) => setActivePipeline(v as PipelineType)}>
          <div className="relative group">
            <div
              ref={tabsScrollRef}
              className="overflow-x-auto pb-2 -mx-1 pl-1 pr-20 md:pr-24 scrollbar-none hover:scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent transition-all"
            >
              <TabsList className="inline-flex flex-nowrap h-11 items-center justify-start gap-1.5 bg-muted/20 p-1 rounded-xl w-max min-w-full border border-border/30">
                  {(pipelines || []).map(p => (
                    <TabsTrigger
                      key={p.id}
                      value={p.type}
                      onDragStart={(e) => handlePipelineDragStart(e, p.id)}
                      onDragOver={handlePipelineDragOver}
                      onDrop={(e) => handlePipelineDrop(e, p.id)}
                      draggable={isAdminOrOwner}
                      className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-lg px-5 py-2 text-sm font-semibold ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm data-[state=active]:border-b-2 data-[state=active]:border-primary hover:bg-background/60 hover:text-foreground",
                        draggedPipelineId === p.id && "opacity-50"
                      )}
                    >
                      {p.name}
                    </TabsTrigger>
                  ))}

                {/* Botón Crear Pipeline inline */}
                <button
                  type="button"
                  onClick={() => setShowAddPipelineDialog(true)}
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-primary hover:bg-background/60 transition-all gap-1.5"
                  title="Crear nuevo pipeline"
                >
                  <Plus size={16} weight="bold" />
                  <span className="hidden sm:inline">Nuevo</span>
                </button>
              </TabsList>
            </div>
            {/* Gradient fade indicators for scroll */}
            <div className="absolute right-0 top-0 bottom-2 w-12 bg-gradient-to-l from-background via-background/80 to-transparent pointer-events-none" />
            <div className="absolute left-0 top-0 bottom-2 w-12 bg-gradient-to-r from-background via-background/80 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-1">
              <button
                type="button"
                className="hidden md:flex h-9 w-9 items-center justify-center rounded-full bg-background shadow-sm border border-border/60 text-muted-foreground hover:text-foreground hover:shadow-md transition-all active:scale-95"
                onClick={() => tabsScrollRef.current?.scrollBy({ left: -((tabsScrollRef.current?.clientWidth || 200) * 0.8), behavior: 'smooth' })}
                aria-label="Desplazar pipelines a la izquierda"
              >
                <CaretLeft size={18} weight="bold" />
              </button>
              <button
                type="button"
                className="h-9 w-9 flex items-center justify-center rounded-full bg-background shadow-sm border border-border/60 text-muted-foreground hover:text-foreground hover:shadow-md transition-all active:scale-95"
                onClick={() => tabsScrollRef.current?.scrollBy({ left: (tabsScrollRef.current?.clientWidth || 200) * 0.8, behavior: 'smooth' })}
                aria-label="Desplazar pipelines a la derecha"
              >
                <CaretRight size={18} weight="bold" />
              </button>
            </div>
          </div>
        </Tabs>

        {/* Filter Section */}
        <div className="flex items-center gap-3 mt-3">
          <Select value={filterByMember} onValueChange={setFilterByMember}>
            <SelectTrigger className="w-auto min-w-[200px] h-9 px-3 bg-muted/30 border border-border/30 rounded-xl text-sm hover:bg-muted/50 transition-colors shadow-sm">
              <div className="flex items-center gap-2">
                <Funnel size={15} className="text-muted-foreground/70 shrink-0" />
                <SelectValue placeholder="Filtrar por miembro" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los miembros</SelectItem>
              {user && <SelectItem value="me">{currentCompany ? `${currentCompany.name} (Yo)` : 'Yo'}</SelectItem>}
              {user && <SelectItem value="me+todos">Yo + Todos</SelectItem>}
              <SelectItem value="todos">Solo Todos</SelectItem>
              {eligibleMembers.map(member => (
                <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filterByMember !== 'all' && (
            <Badge variant="secondary" className="bg-primary/10 text-primary border border-primary/20 text-xs font-semibold rounded-full px-3">
              {pipelineLeads.length} de {allPipelineLeads.length} oportunidades
            </Badge>
          )}
        </div>
      </div>

      <PipelineBoard
        currentPipeline={currentPipeline}
        pipelines={pipelines}
        pipelineLeads={pipelineLeads}
        allPipelineLeads={allPipelineLeads}
        stageCounts={stageCounts}
        stagePages={stagePages}
        unreadLeads={unreadLeads}
        notasCounts={notasCounts}
        meetingsCounts={meetingsCounts}
        highlightedLeadId={highlightedLeadId}
        isAdminOrOwner={isAdminOrOwner}
        canEditLeads={canEditLeads}
        isMobile={isMobile}
        activePipeline={activePipeline}
        teamMembers={teamMembers}
        currentCompany={currentCompany}
        user={user}
        companies={companies}
        companyId={companyId}
        onAddStage={handleAddStage}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDeleteStage={handleDeleteStage}
        onEditStage={handleEditStage} onResetSLA={handleResetSLA}
        onAddLead={handleLeadAddedToState}
        onImportLeads={handleImportLeads}
        onLoadMore={handleLoadMoreStage}
        onDragStart={handleDragStart}
        onLeadClick={(lead) => setSelectedLead(lead)}
        onDeleteLead={handleDeleteLead}
        onMoveToStage={handleMoveLead}
        onOpenMoveDialog={(lead) => {
          setMoveDialogLead(lead)
          setMoveDialogOpen(true)
        }}
        t={t}
        // Stage DnD
        onStageDragStart={handleStageDragStart}
        onStageDragOverHeader={handleStageDragOverHeader}
        onStageDropOnHeader={handleStageDropOnHeader}
      />


      {/* Botón inferior eliminado: ahora hay botones arriba y por etapa */}

      {
        selectedLead && (
          <LeadDetailSheet
            lead={selectedLead}
            open={!!selectedLead}
            onClose={() => setSelectedLead(null)}
            onCountsChange={(leadId, type, delta) => {
              if (type === 'notes') {
                setNotasCounts(prev => ({ ...prev, [leadId]: Math.max(0, (prev[leadId] || 0) + delta) }))
              } else if (type === 'meetings') {
                setMeetingsCounts(prev => ({ ...prev, [leadId]: Math.max(0, (prev[leadId] || 0) + delta) }))
              }
            }}
            onUpdate={async (updated) => {
              if (!canEditLeads) {
                toast.error('No tienes permisos para editar leads')
                return
              }

              // Optimistic update: actualizar UI inmediatamente
              setLeads((current) =>
                (current || []).map(l => l.id === updated.id ? updated : l)
              )
              const prevSelected = selectedLead
              setSelectedLead(updated)

              // Guardar en BD en segundo plano
              try {
                const NIL_UUID = '00000000-0000-0000-0000-000000000000'
                const actorNombre = user?.businessName || (user as any)?.nombre || user?.email
                await updateLead(updated.id, {
                  nombre_completo: updated.name,
                  empresa: updated.company,
                  correo_electronico: updated.email,
                  telefono: updated.phone,
                  ubicacion: updated.location,
                  prioridad: updated.priority,
                  presupuesto: updated.budget,
                  sla_custom_limit_minutes: updated.slaCustomLimitMinutes,
                  asignado_a: updated.assignedTo === 'todos' ? NIL_UUID : updated.assignedTo || NIL_UUID
                }, user?.id, actorNombre)

                // Si cambió la asignación y aplica, enviar notificación
                const assignmentChanged = prevSelected && prevSelected.assignedTo !== updated.assignedTo
                const newAssignedId = (updated.assignedTo === 'todos' ? NIL_UUID : updated.assignedTo) || NIL_UUID
                if (assignmentChanged && isAdminOrOwner && newAssignedId && newAssignedId !== NIL_UUID) {
                  const recipient = teamMembers.find(m => m.id === newAssignedId || m.userId === newAssignedId)
                  // Si no lo encontramos en teamMembers, enviamos igual con el id crudo;
                  // send-lead-assigned resuelve el email desde auth.admin.getUserById como fallback.
                  try {
                    await supabase.functions.invoke('send-lead-assigned', {
                      body: {
                        leadId: updated.id,
                        leadName: updated.name,
                        empresaId: companyId,
                        empresaNombre: currentCompany?.name,
                        assignedUserId: recipient?.userId || newAssignedId,
                        assignedUserEmail: recipient?.email,
                        assignedByEmail: user?.email,
                        assignedByNombre: user?.businessName || currentCompany?.name || user?.email
                      }
                    })
                  } catch (e) {
                    console.error('[PipelineView] Error enviando notificación de asignación', e)
                  }
                }
              } catch (error: any) {
                console.error('Error updating lead:', error)
                toast.error('Error al guardar cambios')
                // Opcionalmente podrías revertir el optimistic update aquí
              }
            }}
            onMarkAsRead={(leadId) => {
              // Marcar mensajes como leídos y actualizar UI localmente
              // La actualización en BD se hace dentro de LeadDetailSheet o podríamos llamarla aquí
              setUnreadLeads(prev => {
                const newSet = new Set(prev)
                newSet.delete(leadId)
                return newSet
              })
            }}
            teamMembers={teamMembers}
            canEdit={canEditLeads}
            currentUser={user}
            companyId={companyId}
            canDeleteLead={isAdminOrOwner}
            onDeleteLead={(id) => handleDeleteLead(id, () => setSelectedLead(null))}
          />
        )
      }

      {/* Mobile: Move to Stage dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mover a Etapa</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            {(currentPipeline?.stages || []).map((s) => (
              <Button
                key={s.id}
                variant={moveDialogLead?.stage === s.id ? 'secondary' : 'outline'}
                className="justify-start"
                disabled={!moveDialogLead || moveDialogLead.stage === s.id}
                onClick={() => {
                  if (!moveDialogLead) return
                  handleMoveLead(moveDialogLead, s.id)
                  setMoveDialogOpen(false)
                  setMoveDialogLead(null)
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}
                </span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog para crear nuevo pipeline desde la vista principal */}
      <AddPipelineDialog
        open={showAddPipelineDialog}
        onClose={() => setShowAddPipelineDialog(false)}
        onAdd={(pipeline) => {
          setPipelines((current) => [...(current || []), pipeline])
          setActivePipeline(pipeline.type as PipelineType)
          setShowAddPipelineDialog(false)
        }}
        empresaId={companyId}
      />

      {/* Dialog para editar configuración de asignación del pipeline */}
      {currentPipeline && (
        <EditPipelineDialog
          open={showEditPipelineDialog}
          onClose={() => setShowEditPipelineDialog(false)}
          pipeline={currentPipeline}
          onUpdate={(updated) => {
            setPipelines((current) =>
              (current || []).map(p => p.id === updated.id ? { ...p, assignment_type: updated.assignment_type } : p)
            )
          }}
        />
      )}
    </div >
  )
}
