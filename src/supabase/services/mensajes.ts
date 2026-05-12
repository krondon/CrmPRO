import { supabase } from '../client'

export interface Message {
  id: string
  lead_id: string
  content: string
  sender: 'lead' | 'team'
  channel: string
  read: boolean
  created_at: string
  external_id?: string
  metadata?: any
}

export interface MediaPayload {
  downloadUrl: string
  fileName: string
  ptt?: boolean
  mimetype?: string
}

// Subir archivo al bucket de Storage y obtener URL pública
export async function uploadChatAttachment(file: File, leadId: string): Promise<MediaPayload> {
  const ext = file.name.split('.').pop() || 'file'
  const fileName = `${leadId}-${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('Send-message CRM')
    .upload(fileName, file, { upsert: true })

  if (uploadError) {
    console.error('[uploadChatAttachment] Error subiendo archivo:', uploadError)
    throw uploadError
  }

  const { data } = supabase.storage
    .from('Send-message CRM')
    .getPublicUrl(fileName)

  console.log('[uploadChatAttachment] Archivo subido:', { url: data.publicUrl, originalName: file.name })

  return { downloadUrl: data.publicUrl, fileName: file.name }
}

export async function getMessages(leadId: string) {
  const { data, error } = await supabase
    .from('mensajes')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data as Message[]
}

export async function sendMessage(
  leadId: string,
  content: string,
  sender: 'team' | 'lead' = 'team',
  channel: string = 'whatsapp',
  media?: MediaPayload
) {
  // Si es un mensaje del equipo, usamos la Edge Function para que también se envíe a la Super API
  if (sender === 'team') {
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token

    if (!accessToken) {
      throw new Error('Sesion expirada. Inicia sesion de nuevo para enviar mensajes.')
    }

    const edgePayload = {
      lead_id: leadId,
      content: content ?? '',
      channel,
      media,
    }

    const { data, error } = await supabase.functions.invoke('send-message', {
      body: edgePayload,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-supabase-authorization': `Bearer ${accessToken}`,
      },
    })

    if (!error && data) {
      return data as Message
    }

    console.warn('[sendMessage] invoke fallo, intentando fetch directo al endpoint:', error)

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(`Error invoking edge function: ${error?.message || 'missing env vars for fallback call'}`)
    }

    const directResponse = await fetch(`${supabaseUrl}/functions/v1/send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        'x-supabase-authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(edgePayload),
    })

    const directJson = await directResponse.json().catch(() => null)

    if (!directResponse.ok || directJson?.error) {
      const invokeErrorText = error?.message ? `invoke: ${error.message}` : 'invoke: unknown error'
      const directErrorText = directJson?.error || `direct: HTTP ${directResponse.status}`
      throw new Error(`No se pudo enviar por Edge Function (${invokeErrorText}; ${directErrorText})`)
    }

    return directJson as Message
  }

  // Si por alguna razón insertamos un mensaje manual como 'lead' (simulación), va directo a la BD
  const { data, error } = await supabase
    .from('mensajes')
    .insert({
      lead_id: leadId,
      content,
      sender,
      channel
    })
    .select()
    .single()

  if (error) throw error
  return data as Message
}

export function subscribeToMessages(leadId: string, onMessage: (msg: Message) => void) {
  // Suscripción sin filtro de servidor para evitar incompatibilidades.
  // Filtramos por lead_id en el cliente y añadimos logs de depuración.
  const channelId = `messages:${leadId}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  
  return supabase
    .channel(channelId)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'mensajes'
      },
      (payload) => {
        try {
          const msg = payload.new as Message
          // Debug: log en consola cada evento recibido
          console.log('[Realtime] INSERT mensajes payload:', payload)
          if ((msg as any)?.lead_id === leadId) {
            onMessage(msg)
          } else {
            // Debug: evento descartado por lead distinto
            console.log('[Realtime] descartado por lead_id distinto:', (msg as any)?.lead_id, '!=', leadId)
          }
        } catch (e) {
          console.error('[Realtime] error procesando payload de mensajes:', e, payload)
        }
      }
    )
    .subscribe()
}

export async function deleteMessage(messageId: string, empresaId?: string) {
  // Log de auditoría antes de eliminar
  if (empresaId) {
    import('./activityLog').then(({ logActivity }) => {
      logActivity({
        empresaId,
        categoria: 'mensajes',
        accion: 'eliminar_mensaje',
        detalle: 'Eliminó un mensaje del chat',
        entidadTipo: 'mensaje',
        entidadId: messageId
      }).catch(e => console.error('[deleteMessage] log error:', e))
    })
  }

  const { error } = await supabase
    .from('mensajes')
    .delete()
    .eq('id', messageId)

  if (error) throw error
}

export async function deleteConversation(leadId: string, empresaId?: string, leadNombre?: string) {
  // Log de auditoría antes de eliminar
  if (empresaId) {
    import('./activityLog').then(({ logActivity }) => {
      logActivity({
        empresaId,
        categoria: 'mensajes',
        accion: 'eliminar_conversacion',
        detalle: `Eliminó toda la conversación de "${leadNombre || 'oportunidad'}"`,
        entidadTipo: 'lead',
        entidadId: leadId,
        entidadNombre: leadNombre
      }).catch(e => console.error('[deleteConversation] log error:', e))
    })
  }

  const { error } = await supabase
    .from('mensajes')
    .delete()
    .eq('lead_id', leadId)

  if (error) throw error
}

// Obtener conteo de mensajes no leídos para múltiples leads
export async function getUnreadMessagesCount(leadIds: string[]): Promise<Record<string, number>> {
  if (leadIds.length === 0) return {}

  const { data, error } = await supabase
    .from('mensajes')
    .select('lead_id')
    .in('lead_id', leadIds)
    .eq('sender', 'lead') // Solo mensajes del lead
    .eq('read', false)

  if (error) {
    console.error('[getUnreadMessagesCount] error:', error)
    return {}
  }

  // Contar mensajes por lead_id
  const counts: Record<string, number> = {}
  data.forEach((msg: any) => {
    counts[msg.lead_id] = (counts[msg.lead_id] || 0) + 1
  })

  return counts
}

// Marcar todos los mensajes de un lead como leídos
export async function markMessagesAsRead(leadId: string) {
  const { error } = await supabase
    .from('mensajes')
    .update({ read: true })
    .eq('lead_id', leadId)
    .eq('sender', 'lead') // Solo marcar mensajes del lead como leídos
    .eq('read', false)

  if (error) {
    console.error('[markMessagesAsRead] error:', error)
    throw error
  }
}

// Suscribirse a nuevos mensajes de lead (sender='lead') para toda la empresa
export function subscribeToAllMessages(callback: (msg: Message) => void) {
  const channelId = `all-messages-${Date.now()}-${Math.random().toString(36).substring(7)}`

  return supabase
    .channel(channelId)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'mensajes'
      },
      (payload) => {
        try {
          const msg = payload.new as Message
          // Notificar todos los nuevos mensajes (lead y team)
          callback(msg)
        } catch (e) {
          console.error('[Realtime] error procesando payload de mensajes:', e, payload)
        }
      }
    )
    .subscribe()
}

// Obtener el último mensaje por cada leadId proporcionado en una sola consulta
export async function getLastMessagesForLeadIds(leadIds: string[]) {
  if (!leadIds || leadIds.length === 0) return {} as Record<string, Message>

  const { data, error } = await supabase
    .from('mensajes')
    .select('*')
    .in('lead_id', leadIds)
    .order('created_at', { ascending: false })

  if (error) throw error

  const latestByLead: Record<string, Message> = {}
  for (const row of (data || []) as any[]) {
    const lid = row.lead_id as string
    if (!latestByLead[lid]) {
      latestByLead[lid] = row as unknown as Message
    }
  }
  return latestByLead
}

/**
 * Busca mensajes por contenido de texto (búsqueda global estilo WhatsApp)
 */
export interface MessageSearchResult {
  id: string
  lead_id: string
  content: string
  sender: 'lead' | 'team'
  created_at: string
  lead_name: string
  lead_phone: string
  lead_avatar?: string
  channel: string
}

export interface MessageSearchMatch {
  leadId: string
  messageId: string
  snippet: string
  createdAt: string
}

export async function searchMessages(
  empresaId: string,
  searchTerm: string,
  archived: boolean
): Promise<MessageSearchMatch[]> {
  const normalizedTerm = searchTerm.trim()
  if (!empresaId || normalizedTerm.length < 2) return []

  // Filtramos primero los leads de la empresa para que el ilike sobre `mensajes`
  // se restrinja vía lead_id (índice FK) en vez de un scan completo de la tabla.
  // El embebido `lead!inner` con filtros sobre la relación no se empuja al join
  // de forma confiable y revienta el statement timeout en empresas grandes.
  const { data: leadRows, error: leadError } = await supabase
    .from('lead')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('archived', archived)

  if (leadError) throw leadError

  const leadIds = (leadRows ?? [])
    .map((row) => String((row as { id?: string }).id || ''))
    .filter(Boolean)

  if (leadIds.length === 0) return []

  // Trocear el IN para evitar URLs gigantes en empresas con miles de leads.
  const CHUNK_SIZE = 200
  const chunks: string[][] = []
  for (let i = 0; i < leadIds.length; i += CHUNK_SIZE) {
    chunks.push(leadIds.slice(i, i + CHUNK_SIZE))
  }

  const chunkResults = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from('mensajes')
        .select('id, lead_id, content, created_at')
        .in('lead_id', chunk)
        .ilike('content', `%${normalizedTerm}%`)
        .not('content', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50)
    )
  )

  type Row = { id?: string; lead_id?: string; content?: string; created_at?: string }
  const allRows: Row[] = []
  for (const result of chunkResults) {
    if (result.error) throw result.error
    allRows.push(...((result.data ?? []) as Row[]))
  }

  allRows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
  const topRows = allRows.slice(0, 50)

  const lowerTerm = normalizedTerm.toLowerCase()

  return topRows.map((row) => {
    const content = String(row.content || '')
    const lowerContent = content.toLowerCase()
    const index = lowerContent.indexOf(lowerTerm)
    const start = index >= 0 ? Math.max(0, index - 30) : 0
    const end = index >= 0 ? Math.min(content.length, index + normalizedTerm.length + 40) : 80

    return {
      leadId: String(row.lead_id || ''),
      messageId: String(row.id || ''),
      snippet: content.slice(start, end).trim() || content.slice(0, 80),
      createdAt: String(row.created_at || ''),
    }
  })
  
}
