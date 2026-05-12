import { supabase } from '@/supabase/client'
import { Meeting, MeetingParticipant } from '@/lib/types'

type Nullable<T> = T | null | undefined

interface LeadMeetingParticipantRow {
  id: string
  reunion_id: string
  nombre: string
  tipo: Nullable<'internal' | 'external'>
  created_at: string
  updated_at: Nullable<string>
}

interface LeadMeetingRow {
  id: string
  lead_id: string
  empresa_id: string
  created_by?: string | null
  titulo: string
  fecha: string
  duracion_minutos: number | null
  notas: string | null
  created_at: string
  updated_at: string | null
  participantes?: LeadMeetingParticipantRow[] | null
}

export interface CreateLeadMeetingParticipantInput {
  name: string
  type?: 'internal' | 'external'
}

export interface CreateLeadMeetingInput {
  leadId: string
  empresaId: string
  title: string
  date: string | Date
  duration: number
  participants: Array<string | CreateLeadMeetingParticipantInput>
  notes?: string
  createdBy?: string | null
}

const mapParticipant = (row: LeadMeetingParticipantRow): MeetingParticipant => ({
  id: row.id,
  meetingId: row.reunion_id,
  name: row.nombre,
  type: row.tipo ?? null,
  createdAt: new Date(row.created_at),
  updatedAt: row.updated_at ? new Date(row.updated_at) : undefined
})

const mapLeadMeeting = (row: LeadMeetingRow): Meeting => ({
  id: row.id,
  leadId: row.lead_id,
  title: row.titulo,
  date: new Date(row.fecha),
  duration: row.duracion_minutos ?? 30,
  participants: (row.participantes ?? []).map(mapParticipant),
  notes: row.notas ?? '',
  createdAt: new Date(row.created_at),
  updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
  empresaId: row.empresa_id,
  createdBy: row.created_by ?? null
})

export async function getLeadMeetings(leadId: string): Promise<Meeting[]> {
  const { data, error } = await supabase
    .from('lead_reuniones')
    .select(`
      id,
      lead_id,
      empresa_id,
      created_by,
      titulo,
      fecha,
      duracion_minutos,
      notas,
      created_at,
      updated_at,
      participantes:lead_reunion_participantes (
        id,
        reunion_id,
        nombre,
        tipo,
        created_at,
        updated_at
      )
    `)
    .eq('lead_id', leadId)
    .order('fecha', { ascending: true })

  if (error) throw error
  return (data || []).map(mapLeadMeeting)
}

export async function createLeadMeeting(input: CreateLeadMeetingInput): Promise<Meeting> {
  const isoDate = new Date(input.date).toISOString()
  let createdBy = input.createdBy ?? null

  const normalizedParticipants = (input.participants || []).map((participant) => {
    if (typeof participant === 'string') {
      return {
        name: participant,
        type: 'external' as const
      }
    }

    return {
      name: participant.name,
      type: participant.type ?? 'external'
    }
  })

  if (!createdBy) {
    const { data } = await supabase.auth.getUser()
    createdBy = data.user?.id ?? null
  }

  const { data: meetingRow, error: meetingError } = await supabase
    .from('lead_reuniones')
    .insert({
      lead_id: input.leadId,
      empresa_id: input.empresaId,
      titulo: input.title,
      fecha: isoDate,
      duracion_minutos: input.duration,
      notas: input.notes,
      created_by: createdBy
    })
    .select()
    .single()

  if (meetingError) throw meetingError

  let participantRows: LeadMeetingParticipantRow[] = []

  if (normalizedParticipants.length > 0) {
    const { data: insertedParticipants, error: participantsError } = await supabase
      .from('lead_reunion_participantes')
      .insert(
        normalizedParticipants.map((participant) => ({
          reunion_id: meetingRow.id,
          nombre: participant.name,
          tipo: participant.type
        }))
      )
      .select()

    if (participantsError) throw participantsError
    participantRows = insertedParticipants || []
  }

  // Log de auditoría (owner)
  if (input.empresaId) {
    import('./activityLog').then(({ logActivity }) => {
      logActivity({
        empresaId: input.empresaId,
        categoria: 'reuniones',
        accion: 'crear_reunion',
        detalle: `Creó la reunión "${input.title}"`,
        entidadTipo: 'reunion',
        entidadId: meetingRow.id,
        entidadNombre: input.title,
        actorId: createdBy || undefined
      }).catch(e => console.error('[createLeadMeeting] log error:', e))
    })
  }

  // Historial de la oportunidad
  import('./history').then(({ logLeadEvent }) => {
    logLeadEvent({
      leadId: input.leadId,
      accion: 'reunion_creada',
      detalle: `Agendó la reunión "${input.title}"`,
      actorId: createdBy,
      metadata: {
        reunion_id: meetingRow.id,
        titulo: input.title,
        fecha: isoDate,
        duracion_minutos: input.duration
      }
    })
  })

  return mapLeadMeeting({
    ...meetingRow,
    participantes: participantRows
  })
}
export async function deleteLeadMeeting(meetingId: string, empresaId?: string, meetingTitle?: string): Promise<void> {
  // Obtener lead_id y título ANTES de borrar (para el historial)
  const { data: meeting } = await supabase
    .from('lead_reuniones')
    .select('lead_id, titulo')
    .eq('id', meetingId)
    .maybeSingle()

  const { error } = await supabase
    .from('lead_reuniones')
    .delete()
    .eq('id', meetingId)

  if (error) throw error

  const titulo = meetingTitle || meeting?.titulo || 'sin título'

  if (empresaId) {
    import('./activityLog').then(({ logActivity }) => {
      logActivity({
        empresaId,
        categoria: 'reuniones',
        accion: 'eliminar_reunion',
        detalle: `Eliminó la reunión "${titulo}"`,
        entidadTipo: 'reunion',
        entidadId: meetingId,
        entidadNombre: titulo
      }).catch(e => console.error('[deleteLeadMeeting] log error:', e))
    })
  }

  // Historial de la oportunidad
  if (meeting?.lead_id) {
    import('./history').then(({ logLeadEvent }) => {
      logLeadEvent({
        leadId: meeting.lead_id,
        accion: 'reunion_eliminada',
        detalle: `Eliminó la reunión "${titulo}"`,
        metadata: { reunion_id: meetingId, titulo }
      })
    })
  }
}

export async function getCompanyMeetings(empresaId: string): Promise<Meeting[]> {
  const { data, error } = await supabase
    .from('lead_reuniones')
    .select(`
      id,
      lead_id,
      empresa_id,
      created_by,
      titulo,
      fecha,
      duracion_minutos,
      notas,
      created_at,
      updated_at,
      participantes:lead_reunion_participantes (
        id,
        reunion_id,
        nombre,
        tipo,
        created_at,
        updated_at
      )
    `)
    .eq('empresa_id', empresaId)
    .order('fecha', { ascending: true })

  if (error) throw error
  return (data || []).map(mapLeadMeeting)
}

export async function getReunionesCountByLeads(leadIds: string[]): Promise<Record<string, number>> {
  if (!leadIds.length) return {}

  const { data, error } = await supabase
    .from('lead_reuniones')
    .select('lead_id')
    .in('lead_id', leadIds)

  if (error) {
    console.error('Error fetching meetings count:', error)
    return {}
  }

  const counts: Record<string, number> = {}
  data?.forEach((row: any) => {
    counts[row.lead_id] = (counts[row.lead_id] || 0) + 1
  })

  return counts
}
