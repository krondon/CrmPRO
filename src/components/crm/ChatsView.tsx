import { useState, useEffect } from 'react'
import type { Lead } from '@/lib/types'
import { subscribeToAllMessages, getUnreadMessagesCount } from '@/supabase/services/mensajes'
import { ChatSettingsDialog } from './ChatSettingsDialog'
import { useLeadsList } from '@/hooks/useLeadsList'
import { useLeadsRealtime } from '@/hooks/useLeadsRealtime'
import { MessageInput, ChatList, ChatWindow } from './chats'
import { usePersistentState } from '@/hooks/usePersistentState'

interface User {
  id: string
  email: string
  businessName: string
}

interface ChatsViewProps {
  companyId: string
  onNavigateToPipeline?: (lead: Lead) => void
  canDeleteLead?: boolean
}

// NOTA: safeFormatDate ahora viene de useDateFormat hook como safeFormatDate

export function ChatsView({ companyId, onNavigateToPipeline, canDeleteLead = false }: ChatsViewProps) {
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
    searchTerm,
    setSearchTerm,
    isSearching
  } = useLeadsList({ companyId })

  const [currentUser] = usePersistentState<User | null>('current-user', null)

  // Estados UI locales (no relacionados con datos de leads)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [showChatSettings, setShowChatSettings] = useState(false)




  // NOTA: Los filtros (channelFilter, unreadFilter, searchTerm), sortedLeads, rowVirtualizer,
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
      // Only update if in list
      handleLeadUpdate(updatedLead)
    },
    onInsert: (newLead) => {
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
    const ch = subscribeToAllMessages(async (msg) => {
      // 1. Verificar si el lead ya está en la lista
      const leadExists = leads.some(l => l.id === msg.lead_id)

      if (leadExists) {
        updateLeadListOrder(msg.lead_id, msg)
        if (msg.sender === 'lead') {
          if (selectedLeadId !== msg.lead_id) {
            const currentCount = unreadCounts[msg.lead_id] || 0
            updateUnreadCount(msg.lead_id, currentCount + 1)
          }
        }
      } else {
        // 2. Si no existe, es un lead NUEVO (o archivado que no tenemos cargado).
        // Intentar buscarlo y agregarlo a la lista.
        // Solo si el scope es 'active' (no queremos resucitar leads archivados en la vista de activos automáticamente
        // a menos que la lógica de negocio lo dicte, pero por ahora solo nuevos).
        if (chatScope === 'active') {
          try {
            // Import dinámico para evitar dependencias circulares si las hubiera, 
            // o simplemente usar la función importada arriba si ya la tenemos.
            // Necesitamos importar getLeadById de services/leads
            const { getLeadById } = await import('@/supabase/services/leads')
            const newLeadDB = await getLeadById(msg.lead_id)

            if (newLeadDB && newLeadDB.empresa_id === companyId && !newLeadDB.archived) {
              // Mapear y agregar
              const { mapDBToLead } = await import('@/hooks/useLeadsList')
              const newLead = mapDBToLead(newLeadDB)

              // Asegurar que el último mensaje esté sincronizado con el que acabamos de recibir
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
        // Respuesta del equipo/IA: actualizar desde servidor
        setTimeout(async () => {
          try {
            const counts = await getUnreadMessagesCount([msg.lead_id])
            updateUnreadCount(msg.lead_id, counts[msg.lead_id] ?? 0)
          } catch { }
        }, 1000)
      }
    })
    return () => { try { ch.unsubscribe() } catch { } }
  }, [leads, selectedLeadId, updateLeadListOrder, updateUnreadCount, unreadCounts, companyId, chatScope, addLead])

  // Handlers para archivar/eliminar leads (ahora usan funciones del hook)
  async function handleArchiveToggle(lead: Lead | undefined, nextState: boolean) {
    if (!lead) return
    try {
      const actorNombre = currentUser?.businessName || (currentUser as any)?.nombre || currentUser?.email
      await toggleArchive(lead, nextState, currentUser?.id, actorNombre)
      if (selectedLeadId === lead.id && ((nextState && chatScope === 'active') || (!nextState && chatScope === 'archived'))) {
        setSelectedLeadId(null)
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
      if (selectedLeadId === lead.id) {
        setSelectedLeadId(null)
      }
    } catch (err) {
      // Error handling done in hook
    }
  }

  // NOTA: Las funciones removePendingImage, clearPendingImages, handlePasteClipboard,
  // handleSendMessage ahora están en el componente MessageInput.
  // Se eliminaron ~70 líneas de código duplicado.

  const selectedLead = leads.find(l => l.id === selectedLeadId)



  return (
    <div className="flex flex-1 min-h-0 bg-background rounded-tl-2xl border-t border-l shadow-sm overflow-hidden w-full">
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
        onSelectLead={setSelectedLeadId}
        onScopeChange={handleScopeChange}
        onLoadMore={fetchMoreLeads}
        onRefresh={loadLeads}
        onOpenSettings={() => setShowChatSettings(true)}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        isSearching={isSearching}
      />
      <ChatWindow
        lead={selectedLead || null}
        companyId={companyId}
        canDeleteLead={canDeleteLead}
        onBack={() => setSelectedLeadId(null)}
        onArchive={handleArchiveToggle}
        onDelete={handleDeleteLead}
        onNavigateToPipeline={onNavigateToPipeline}
        updateLeadListOrder={updateLeadListOrder}
        updateUnreadCount={updateUnreadCount}
        onLeadUpdate={(updatedLead) => handleLeadUpdate(updatedLead)}
      />
      <ChatSettingsDialog open={showChatSettings} onClose={() => setShowChatSettings(false)} empresaId={companyId} />
    </div >
  )
}
