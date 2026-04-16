import { supabase } from '../client'
import { PipelineType } from '@/lib/types'

interface CreateInvitationPayload {
  equipo_id: string | null
  empresa_id?: string
  invited_email: string
  invited_nombre: string
  invited_titulo_trabajo: string
  pipeline_ids: Set<PipelineType>
  permission_role?: string
  role_id?: string | null
}

export async function createInvitation(payload: CreateInvitationPayload) {
  const { data, error } = await supabase.functions.invoke('invite-member', {
    body: {
      email: payload.invited_email,
      teamId: payload.equipo_id,
      companyId: payload.empresa_id,
      name: payload.invited_nombre,
      role: payload.invited_titulo_trabajo,
      pipelineIds: Array.from(payload.pipeline_ids),
      permissionRole: payload.permission_role || 'viewer',
      roleId: payload.role_id || null
    }
  })

  if (error) {
    // Intentar extraer mensaje descriptivo del error del Edge Function
    let errorMessage = error.message || 'Error al enviar invitación'
    try {
      const context = (error as any).context
      if (context && typeof context.json === 'function') {
        const body = await context.json()
        if (body?.error) errorMessage = body.error
      }
    } catch (_) { /* ignore parse errors */ }
    throw new Error(errorMessage)
  }

  // Insertar notificación de invitación para el invitado
  if (payload.empresa_id) {
    try {
      // Obtener nombre de empresa para la notificación
      const { data: empresaData } = await supabase
        .from('empresa')
        .select('nombre_empresa')
        .eq('id', payload.empresa_id)
        .single()

      const empresaNombre = empresaData?.nombre_empresa || 'una empresa'

      // Verificar que no exista notificación duplicada pendiente
      const { data: existing } = await supabase
        .from('notificaciones')
        .select('id')
        .eq('usuario_email', payload.invited_email)
        .eq('type', 'team_invitation')
        .eq('read', false)
        .limit(1)

      const hasDuplicate = (existing || []).some((n: any) => {
        return false // No bloqueamos, solo verificamos existencia general
      })

      await supabase.from('notificaciones').insert({
        usuario_email: payload.invited_email,
        type: 'team_invitation',
        title: `Invitación a ${empresaNombre}`,
        message: `Has sido invitado/a a unirte al equipo de "${empresaNombre}" como ${payload.invited_titulo_trabajo || 'miembro'}.`,
        data: {
          empresa_id: payload.empresa_id,
          empresa_nombre: empresaNombre,
          permission_role: payload.permission_role || 'viewer',
          role_id: payload.role_id || null,
          invited_nombre: payload.invited_nombre
        }
      })
    } catch (notifErr) {
      console.warn('[INVITATIONS] Error creando notificación de invitación:', notifErr)
    }
  }

  // Log de auditoría
  if (payload.empresa_id) {
    import('./activityLog').then(({ logActivity }) => {
      logActivity({
        empresaId: payload.empresa_id!,
        categoria: 'equipo',
        accion: 'invitar_miembro',
        detalle: `Invitó a ${payload.invited_email} como ${payload.permission_role || 'viewer'}`,
        entidadTipo: 'miembro',
        entidadNombre: payload.invited_email,
        metadata: { role: payload.permission_role, nombre: payload.invited_nombre }
      }).catch(e => console.error('[createInvitation] log error:', e))
    })
  }

  return data
}

export async function getPendingInvitations(email: string) {
  // Standard select (will lack names if RLS blocks, but we handle that in the view with Edge Function)
  const { data, error } = await supabase
    .from('equipo_invitaciones')
    .select(`
      *,
      empresa (
        nombre_empresa
      ),
      equipo:equipos (
        nombre_equipo
      )
    `)
    .eq('invited_email', email)
    .eq('status', 'pending')

  if (error) throw error
  return data
}

export async function getPendingInvitationsByCompany(companyId: string) {
  const { data, error } = await supabase
    .from('equipo_invitaciones')
    .select('*')
    .eq('empresa_id', companyId)
    .eq('status', 'pending')

  if (error) throw error
  return data
}

export async function acceptInvitation(token: string, userId: string) {
  const { data, error } = await supabase.functions.invoke('accept-invite', {
    body: {
      token,
      userId
    }
  })

  if (error) throw error
  return data
}

export async function rejectInvitation(invitationId: string) {
  // 1. Primero obtener datos de la invitación para notificar al dueño
  const { data: invitation, error: fetchError } = await supabase
    .from('equipo_invitaciones')
    .select(`
            invited_nombre,
            invited_email,
            empresa:empresa_id (
                nombre_empresa,
                usuario_id
            ),
            equipo:equipo_id (
                nombre_equipo
            )
        `)
    .eq('id', invitationId)
    .single()

  if (fetchError) throw fetchError

  // 2. Actualizar el estado de la invitación
  const { data, error } = await supabase
    .from('equipo_invitaciones')
    .update({ status: 'rejected', responded_at: new Date() })
    .eq('id', invitationId)
    .select()
    .single()

  if (error) throw error

  // 3. Crear notificación para el dueño de la empresa
  if (invitation?.empresa?.usuario_id) {
    // Obtener email del dueño
    const { data: ownerData, error: ownerError } = await supabase
      .from('usuarios')
      .select('email')
      .eq('id', invitation.empresa.usuario_id)
      .single()

    if (!ownerError && ownerData?.email) {
      await supabase
        .from('notificaciones')
        .insert({
          usuario_email: ownerData.email,
          type: 'invitation_response',
          title: `${invitation.invited_nombre || invitation.invited_email} rechazó tu invitación`,
          message: `${invitation.invited_nombre || invitation.invited_email} ha rechazado la invitación a ${invitation.equipo?.nombre_equipo || 'tu equipo'}.`,
          data: {
            response: 'rejected',
            invited_nombre: invitation.invited_nombre,
            invited_email: invitation.invited_email,
            empresa_nombre: invitation.empresa.nombre_empresa,
            equipo_nombre: invitation.equipo?.nombre_equipo
          }
        })
    }
  }

  return data
}

export async function cancelInvitation(invitationId: string) {
  const { data, error } = await supabase
    .from('equipo_invitaciones')
    .update({ status: 'cancelled', responded_at: new Date() })
    .eq('id', invitationId)
    .select()
    .single()

  if (error) throw error
  return data
}
