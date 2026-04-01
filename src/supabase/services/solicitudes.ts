import { supabase } from '../client'
import type { SolicitudUnionDB } from '@/lib/types'

/**
 * Buscar empresa por ID (UUID) para el flujo de solicitud de unión
 * Usa RPC con SECURITY DEFINER para acceder a la tabla empresa sin exponer otras filas
 */
export async function buscarEmpresaPorId(empresaId: string) {
    const trimmedId = empresaId.trim()
    if (!trimmedId) return null

    // Validar formato UUID antes de enviar a PostgreSQL
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(trimmedId)) {
        throw new Error('El ID de empresa debe ser un UUID válido (ej: a1b2c3d4-e5f6-7890-abcd-ef1234567890)')
    }

    const { data, error } = await supabase
        .rpc('buscar_empresa_por_id', { p_id: trimmedId })

    if (error) throw error
    return data && data.length > 0 ? data[0] : null
}

/**
 * Crear solicitud de unión a una empresa
 */
export async function crearSolicitud(
    empresaId: string,
    solicitanteNombre: string,
    mensaje?: string
): Promise<SolicitudUnionDB> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No autenticado')

    const { data, error } = await supabase
        .from('solicitudes_union')
        .insert({
            solicitante_id: user.id,
            solicitante_email: user.email,
            solicitante_nombre: solicitanteNombre,
            mensaje: mensaje || null,
            empresa_id: empresaId,
        })
        .select()
        .single()

    if (error) {
        if (error.code === '23505') {
            throw new Error('Ya tienes una solicitud pendiente para esta empresa')
        }
        throw error
    }

    // Notificar al dueño de la empresa
    try {
        const { data: empresa } = await supabase
            .from('empresa')
            .select('usuario_id')
            .eq('id', empresaId)
            .single()

        if (empresa?.usuario_id) {
            const { data: owner } = await supabase
                .from('usuarios')
                .select('email')
                .eq('id', empresa.usuario_id)
                .single()

            if (owner?.email) {
                await supabase.from('notificaciones').insert({
                    usuario_email: owner.email,
                    type: 'join_request',
                    title: 'Nueva solicitud de unión',
                    message: `${solicitanteNombre} (${user.email}) quiere unirse a tu CRM.${mensaje ? ` Mensaje: "${mensaje}"` : ''}`,
                    data: { solicitud_id: data.id, solicitante_email: user.email }
                })
            }
        }
    } catch (notifErr) {
        console.warn('[SOLICITUDES] Error creando notificación:', notifErr)
    }

    return data
}

/**
 * Obtener mis solicitudes enviadas
 */
export async function getMisSolicitudes(): Promise<SolicitudUnionDB[]> {
    const { data, error } = await supabase
        .from('solicitudes_union')
        .select(`
            *,
            empresa:empresa_id (nombre_empresa, logo_url)
        `)
        .order('created_at', { ascending: false })

    if (error) throw error
    return data ?? []
}

/**
 * Obtener solicitudes pendientes para una empresa (vista del dueño)
 */
export async function getSolicitudesPendientes(empresaId: string): Promise<SolicitudUnionDB[]> {
    const { data, error } = await supabase
        .from('solicitudes_union')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

    if (error) throw error
    return data ?? []
}

/**
 * Aprobar solicitud — inserta en empresa_miembros, crea persona, asigna pipelines y actualiza status
 */
export async function aprobarSolicitud(
    solicitudId: string,
    roleAsignado: string = 'viewer',
    roleId?: string | null,
    crmConfig?: { equipo_id: string; pipeline_ids: string[] } | null
): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No autenticado')

    // 1. Leer la solicitud
    const { data: solicitud, error: fetchErr } = await supabase
        .from('solicitudes_union')
        .select('*')
        .eq('id', solicitudId)
        .single()

    if (fetchErr) throw fetchErr
    if (solicitud.status !== 'pending') throw new Error('Esta solicitud ya fue procesada')

    // 2. Insertar en empresa_miembros
    const memberPayload: Record<string, unknown> = {
        empresa_id: solicitud.empresa_id,
        usuario_id: solicitud.solicitante_id,
        email: solicitud.solicitante_email,
        role: roleAsignado,
    }
    if (roleId) memberPayload.role_id = roleId

    const { error: memberErr } = await supabase
        .from('empresa_miembros')
        .insert(memberPayload)

    if (memberErr) {
        if (memberErr.code === '23505') {
            console.warn('[SOLICITUDES] Usuario ya es miembro, actualizando solicitud')
        } else {
            throw memberErr
        }
    }

    // 3. Crear persona en el equipo asignado (si se proporcionó configuración CRM)
    if (crmConfig?.equipo_id) {
        const { data: persona, error: personaErr } = await supabase
            .from('persona')
            .insert({
                nombre: solicitud.solicitante_nombre || solicitud.solicitante_email,
                email: solicitud.solicitante_email,
                equipo_id: crmConfig.equipo_id,
                usuario_id: solicitud.solicitante_id,
            })
            .select('id')
            .single()

        if (personaErr) {
            console.error('[SOLICITUDES] Error creando persona:', personaErr)
        } else if (persona && crmConfig.pipeline_ids?.length > 0) {
            // 4. Asignar pipelines
            const pipelineInserts = crmConfig.pipeline_ids.map(pid => ({
                persona_id: persona.id,
                pipeline_id: pid
            }))
            const { error: pipeErr } = await supabase
                .from('persona_pipeline')
                .insert(pipelineInserts)

            if (pipeErr) {
                console.error('[SOLICITUDES] Error asignando pipelines:', pipeErr)
            }
        }
    }

    // 5. Actualizar solicitud
    const { error: updateErr } = await supabase
        .from('solicitudes_union')
        .update({
            status: 'approved',
            role_asignado: roleAsignado,
            responded_at: new Date().toISOString(),
            responded_by: user.id,
        })
        .eq('id', solicitudId)

    if (updateErr) throw updateErr

    // 6. Notificar al solicitante
    try {
        const { data: empresa } = await supabase
            .from('empresa')
            .select('nombre_empresa')
            .eq('id', solicitud.empresa_id)
            .single()

        await supabase.from('notificaciones').insert({
            usuario_email: solicitud.solicitante_email,
            type: 'join_request_approved',
            title: '¡Solicitud aprobada!',
            message: `Tu solicitud para unirte a "${empresa?.nombre_empresa}" ha sido aprobada. Ya puedes acceder al CRM.`,
            data: { empresa_id: solicitud.empresa_id }
        })
    } catch (notifErr) {
        console.warn('[SOLICITUDES] Error notificando aprobación:', notifErr)
    }
}


/**
 * Rechazar solicitud
 */
export async function rechazarSolicitud(solicitudId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No autenticado')

    const { data: solicitud, error: fetchErr } = await supabase
        .from('solicitudes_union')
        .select('*')
        .eq('id', solicitudId)
        .single()

    if (fetchErr) throw fetchErr

    const { error } = await supabase
        .from('solicitudes_union')
        .update({
            status: 'rejected',
            responded_at: new Date().toISOString(),
            responded_by: user.id,
        })
        .eq('id', solicitudId)

    if (error) throw error

    // Notificar al solicitante
    try {
        const { data: empresa } = await supabase
            .from('empresa')
            .select('nombre_empresa')
            .eq('id', solicitud.empresa_id)
            .single()

        await supabase.from('notificaciones').insert({
            usuario_email: solicitud.solicitante_email,
            type: 'join_request_rejected',
            title: 'Solicitud rechazada',
            message: `Tu solicitud para unirte a "${empresa?.nombre_empresa}" ha sido rechazada.`,
            data: { empresa_id: solicitud.empresa_id }
        })
    } catch (notifErr) {
        console.warn('[SOLICITUDES] Error notificando rechazo:', notifErr)
    }
}
