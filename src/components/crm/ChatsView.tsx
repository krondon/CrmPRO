import { useState, useEffect, useRef } from 'react'
import type { Lead } from '@/lib/types'
import { subscribeToAllMessages, getUnreadMessagesCount, type Message } from '@/supabase/services/mensajes'
import { ChatSettingsDialog } from './ChatSettingsDialog'
import { useLeadsList } from '@/hooks/useLeadsList'
import { useLeadsRealtime } from '@/hooks/useLeadsRealtime'
import { useUserPipelineAccess } from '@/hooks/useUserPipelineAccess'
import { MessageInput, ChatList, ChatWindow } from './chats'
import { usePersistentState } from '@/hooks/usePersistentState'
import { GuestLock } from '@/components/premium'
import { useGuestMode } from '@/hooks/useGuestMode'
import { ChatsMockup } from './chats/ChatsMockup'

interface User {
  id: string
  email: string
  businessName: string
}

interface ChatsViewProps {
  companyId: string
  onNavigateToPipeline?: (lead: Lead) => void
  canDeleteLead?: boolean
  canDeleteMessages?: boolean
  canManageTags?: boolean
  canUseAi?: boolean
}

// NOTA: safeFormatDate ahora viene de useDateFormat hook como safeFormatDate

export function ChatsView({ companyId, onNavigateToPipeline, canDeleteLead = false, canDeleteMessages = true, canManageTags = true, canUseAi = false }: ChatsViewProps) {
  const { isGuest } = useGuestMode()

  // Restricción admin/viewer + Representante de Ventas → solo se muestran los
  // chats anclados a oportunidades asignadas al usuario en sus pipelines.
  // accessResolved indica si el hook YA terminó su fetch async (sin ese flag
  // useLeadsList cargaría todos los chats antes de saber si hay restricción).
  const { allowedPipelineIds, isRestricted, assignedToIds, accessResolved } = useUserPipelineAccess()

  // ==========================================
  // Hook de leads paginados (antes era ~250 líneas de código duplicado)
  // ==========================================
  const {
    leads,
    isInitialLoading,
    isFetchingMore,
    loadError,
    hasMore,
    unreadCounts,
    channelByLead: lastChannelByLead,
    chatScope,
    setScope: handleScopeChange,
    refresh: loadLeads,
    loadMore: fetchMoreLeads,
    updateLead: handleLeadUpdate,
    toggleArchive,
    removeLead,
    updateLeadOrder: updateLeadListOrder,
    updateUnreadCount,
    addLead,
    searchQuery,
    setSearchQuery,
    searchLoading,
    searchResults,
    allLeads
  } = useLeadsList({
    companyId,
    strictAssignment: isRestricted,
    strictAssignedToIds: assignedToIds,
    allowedPipelineIds,
    accessResolved
  })

  // Predicado local: ¿este lead/mensaje corresponde a una oportunidad visible
  // para el usuario actual bajo la regla activa?
  const isLeadVisibleForCurrentUser = (lead: Pick<Lead, 'assignedTo' | 'pipeline'>): boolean => {
    if (!isRestricted) return true
    if (!lead.assignedTo || !assignedToIds.includes(lead.assignedTo)) return false
    if (Array.isArray(allowedPipelineIds) && !allowedPipelineIds.includes(lead.pipeline as unknown as string)) return false
    return true
  }

  const [currentUser] = usePersistentState<User | null>('current-user', null)

  // Estados UI locales (no relacionados con datos de leads)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [selectedLeadFromSearch, setSelectedLeadFromSearch] = useState<Lead | null>(null)
  const [showChatSettings, setShowChatSettings] = useState(false)

  // Fallback: mensaje entrante propagado desde subscribeToAllMessages hacia ChatWindow
  // Usa timestamp para garantizar que cada mensaje genere una nueva referencia
  const [incomingMessage, setIncomingMessage] = useState<{ msg: Message; ts: number } | null>(null)

  const handleSelectLead = (lead: Lead) => {
    const existsInPaginated = allLeads.some((row) => row.id === lead.id) || leads.some((row) => row.id === lead.id)
    setSelectedLeadId(lead.id)
    setSelectedLeadFromSearch(existsInPaginated ? null : lead)
  }




  // NOTA: Los filtros (channelFilter, unreadFilter, searchQuery), sortedLeads, rowVirtualizer,
  // listParentRef, filterScrollRef ahora viven en el componente ChatList.
  // Se eliminaron ~30 líneas de estados y ~40 líneas de código duplicado.

  // ==========================================
  // NOTA: Toda la lógica de loadLeads, fetchMoreLeads, loadUnreadCountsInBatches,
  // loadLastMessagesInBackground y handleScopeChange ahora viene del hook useLeadsList.
  // Se eliminaron ~280 líneas de código duplicado.
  // ==========================================

  // Scroll automático a nuevos mensajes

  // Realtime subscription for leads (Tags, Status, etc.)
  useLeadsRealtime({
    companyId,
    onUpdate: (updatedLead) => {
      // Si está restringido y este lead deja de pertenecerle, retirarlo de la lista.
      if (isRestricted && !isLeadVisibleForCurrentUser(updatedLead)) {
        const exists = leadsRef.current.some(l => l.id === updatedLead.id)
        if (exists) {
          // Quitar localmente (sin pegarle a BD).
          handleLeadUpdate({ ...updatedLead, archived: true })
        }
        return
      }
      handleLeadUpdate(updatedLead)
    },
    onInsert: (newLead) => {
      // Bajo la regla activa, ignorar inserts que no le pertenecen.
      if (isRestricted && !isLeadVisibleForCurrentUser(newLead)) return
      if (chatScope === 'active' && !newLead.archived) {
        addLead(newLead)
      }
    },
    onDelete: (leadId) => {
      removeLead(leadId)
    }
  })
  useEffect(() => {
    // Escuchar mensajes incluso si la lista está vacía (para recibir el primer lead)
    // Usamos refs para leer el estado actual sin causar re-suscripciones
    const ch = subscribeToAllMessages(async (msg) => {
      // 1. Verificar si el lead ya está en la lista
      const leadExists = leadsRef.current.some(l => l.id === msg.lead_id)

      if (leadExists) {
        updateLeadListOrder(msg.lead_id, msg)
        if (msg.sender === 'lead') {
          if (selectedLeadIdRef.current !== msg.lead_id) {
            const currentCount = unreadCountsRef.current[msg.lead_id] || 0
            updateUnreadCount(msg.lead_id, currentCount + 1)
          }
        }
        // Fallback: si el mensaje es del lead abierto, propagarlo a ChatWindow
        if (msg.lead_id === selectedLeadIdRef.current) {
          setIncomingMessage({ msg, ts: Date.now() })
        }
      } else {
        // 2. Si no existe, es un lead NUEVO (o archivado que no tenemos cargado).
        // Solo si el scope es 'active'
        if (chatScopeRef.current === 'active') {
          try {
            const { getLeadById } = await import('@/supabase/services/leads')
            const newLeadDB = await getLeadById(msg.lead_id)

            if (newLeadDB && newLeadDB.empresa_id === companyId && !newLeadDB.archived) {
              const { mapDBToLead } = await import('@/hooks/useLeadsList')
              const newLead = mapDBToLead(newLeadDB)

              // Bajo la regla activa, ignorar leads que no le pertenecen al usuario.
              if (isRestrictedRef.current && !isLeadVisibleForCurrentUser(newLead)) {
                return
              }

              newLead.lastMessage = msg.content || ''
              newLead.lastMessageAt = new Date(msg.created_at)
              newLead.lastMessageSender = msg.sender as any

              addLead(newLead)

              if (msg.sender === 'lead') {
                updateUnreadCount(newLead.id, 1)
              }
            }
          } catch (err) {
            console.error('Error fetching new lead:', err)
          }
        }
      }

      if (msg.sender !== 'lead') {
        setTimeout(async () => {
          try {
            const counts = await getUnreadMessagesCount([msg.lead_id])
            updateUnreadCount(msg.lead_id, counts[msg.lead_id] ?? 0)
          } catch { }
        }, 1000)
      }
    })
    return () => { try { ch.unsubscribe() } catch { } }
  }, [companyId, updateLeadListOrder, updateUnreadCount, addLead])

  // Handlers para archivar/eliminar leads (ahora usan funciones del hook)
  async function handleArchiveToggle(lead: Lead | undefined, nextState: boolean) {
    if (!lead) return
    try {
      const actorNombre = currentUser?.businessName || (currentUser as any)?.nombre || currentUser?.email
      await toggleArchive(lead, nextState, currentUser?.id, actorNombre)
      if (selectedLeadId === lead.id && ((nextState && chatScope === 'active') || (!nextState && chatScope === 'archived'))) {
        setSelectedLeadId(null)
        setSelectedLeadFromSearch(null)
      }
    } catch (err) {
      // Error handling done in hook
    }
  }

  async function handleDeleteLead(lead: Lead | undefined) {
    if (!lead) return
    const confirmed = window.confirm(`¿Eliminar el lead "${lead.name || lead.phone || lead.id}"? Esta acción no se puede deshacer.`)
    if (!confirmed) return
    try {
      await removeLead(lead.id)
      // No limpiar selectedLeadId: el estado "Chat eliminado" se mostrará automáticamente
    } catch (err) {
      // Error handling done in hook
    }
  }

  // NOTA: Las funciones removePendingImage, clearPendingImages, handlePasteClipboard,
  // handleSendMessage ahora están en el componente MessageInput.
  // Se eliminaron ~70 líneas de código duplicado.

  // Refs para evitar re-suscripciones en el useEffect de realtime
  const leadsRef = useRef(leads)
  leadsRef.current = leads
  const selectedLeadIdRef = useRef(selectedLeadId)
  selectedLeadIdRef.current = selectedLeadId
  const unreadCountsRef = useRef(unreadCounts)
  unreadCountsRef.current = unreadCounts
  const chatScopeRef = useRef(chatScope)
  chatScopeRef.current = chatScope
  const isRestrictedRef = useRef(isRestricted)
  isRestrictedRef.current = isRestricted

  const selectedLead = allLeads.find(l => l.id === selectedLeadId)
    || leads.find(l => l.id === selectedLeadId)
    || (selectedLeadFromSearch?.id === selectedLeadId ? selectedLeadFromSearch : null)

  // Rastrear el último lead seleccionado para detectar eliminación
  const lastSelectedLeadRef = useRef<Lead | null>(null)
  if (selectedLead) {
    lastSelectedLeadRef.current = selectedLead
  }

  // Detectar si el lead seleccionado fue eliminado/archivado (ya no está en la lista)
  // NO detectar eliminación cuando hay búsqueda activa (el lead sigue existiendo, solo no está en los resultados filtrados)
  const isLeadDeleted = selectedLeadId !== null && !selectedLead && searchQuery.trim().length < 2 && lastSelectedLeadRef.current?.id === selectedLeadId
  const deletedLeadInfo = isLeadDeleted ? {
    name: lastSelectedLeadRef.current!.name || lastSelectedLeadRef.current!.phone || 'Lead',
    phone: lastSelectedLeadRef.current!.phone
  } : null

  if (isGuest) {
    return (
      <div className="flex flex-1 min-h-0 bg-background overflow-hidden w-full">
        <GuestLock
          title="Chats omnicanal"
          description="Conecta WhatsApp, Instagram y Facebook en un solo lugar para responder a tus clientes desde el CRM. Escríbenos y te contamos cómo activarla."
        >
          <ChatsMockup />
        </GuestLock>
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 bg-background overflow-hidden w-full">
      <ChatList
        leads={leads}
        isInitialLoading={isInitialLoading}
        isFetchingMore={isFetchingMore}
        loadError={loadError}
        unreadCounts={unreadCounts}
        channelByLead={lastChannelByLead}
        chatScope={chatScope}
        companyId={companyId}
        selectedLeadId={selectedLeadId}
        onSelectLead={handleSelectLead}
        onScopeChange={handleScopeChange}
        onLoadMore={fetchMoreLeads}
        onRefresh={loadLeads}
        onOpenSettings={() => setShowChatSettings(true)}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        searchLoading={searchLoading}
        searchResults={searchResults}
      />
      <ChatWindow
        lead={selectedLead || null}
        companyId={companyId}
        canDeleteLead={canDeleteLead}
        canDeleteMessages={canDeleteMessages}
        canManageTags={canManageTags}
        isAiEnabled={canUseAi}
        onBack={() => { setSelectedLeadId(null); setSelectedLeadFromSearch(null) }}
        onArchive={handleArchiveToggle}
        onDelete={handleDeleteLead}
        onNavigateToPipeline={onNavigateToPipeline}
        updateLeadListOrder={updateLeadListOrder}
        updateUnreadCount={updateUnreadCount}
        onLeadUpdate={(updatedLead) => handleLeadUpdate(updatedLead)}
        deletedLeadInfo={deletedLeadInfo}
        onDismissDeleted={() => { setSelectedLeadId(null); setSelectedLeadFromSearch(null); lastSelectedLeadRef.current = null }}
        incomingMessage={incomingMessage}
      />
      <ChatSettingsDialog open={showChatSettings} onClose={() => setShowChatSettings(false)} empresaId={companyId} />
    </div >
  )
}
