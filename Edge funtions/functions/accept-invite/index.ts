import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token, userId } = await req.json();

    // Usar Service Role para saltar RLS y ejecutar funciones admin
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Obtener la invitación primero para tener los pipeline_ids y datos de la empresa
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("equipo_invitaciones")
      .select(`
        id,
        status,
        empresa_id,
        equipo_id,
        pipeline_ids,
        invited_nombre,
        invited_email,
        invited_titulo_trabajo,
        permission_role,
        empresa:empresa_id (
          id,
          nombre_empresa,
          usuario_id
        ),
        equipo:equipo_id (
          id,
          nombre_equipo
        )
      `)
      .eq("token", token)
      .single();

    if (inviteError) throw new Error("Invitación no encontrada");

    // Validar que la invitación aún esté pendiente
    if (invite.status && invite.status !== 'pending') {
      throw new Error("Esta invitación ya fue procesada");
    }

    // Validar que el email del usuario auth coincida con invited_email.
    // Evita que un usuario con sesión iniciada en otra cuenta acepte una invitación que no es suya.
    const { data: authUserData, error: authUserErr } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (authUserErr || !authUserData?.user) {
      throw new Error("Usuario no encontrado");
    }
    const authEmail = (authUserData.user.email || '').trim().toLowerCase();
    const invitedEmail = (invite.invited_email || '').trim().toLowerCase();
    if (!authEmail || !invitedEmail || authEmail !== invitedEmail) {
      return new Response(JSON.stringify({
        error: `Esta invitación es para ${invite.invited_email}. Inicia sesión con ese correo para aceptarla.`
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Obtener el nombre real del usuario desde la tabla usuarios
    let realUserName = invite.invited_nombre;
    try {
      const { data: usuarioRow } = await supabaseAdmin
        .from('usuarios')
        .select('nombre')
        .eq('id', userId)
        .maybeSingle();
      if (usuarioRow?.nombre) {
        realUserName = usuarioRow.nombre;
      }
    } catch (e) {
      console.warn('[accept-invite] No se pudo obtener nombre real del usuario:', e);
    }

    // 2. Resolver role_id desde la tabla roles (buscar por nombre del permission_role)
    const permRole = invite.permission_role || 'viewer';
    let resolvedRoleId: string | null = null;
    try {
      const roleName = permRole === 'admin' ? 'Admin' : 'Viewer';
      const { data: roleRow } = await supabaseAdmin
        .from('roles')
        .select('id')
        .eq('empresa_id', invite.empresa_id)
        .eq('name', roleName)
        .eq('is_system', true)
        .maybeSingle();
      if (roleRow) resolvedRoleId = roleRow.id;
    } catch (e) {
      console.warn('[accept-invite] No se pudo resolver role_id:', e);
    }

    // 3. Insertar en empresa_miembros (idempotente: si ya existe, seguimos)
    const memberPayload: Record<string, unknown> = {
      empresa_id: invite.empresa_id,
      usuario_id: userId,
      email: invite.invited_email,
      role: permRole
    };
    if (resolvedRoleId) memberPayload.role_id = resolvedRoleId;

    const { error: memberError } = await supabaseAdmin
      .from('empresa_miembros')
      .insert(memberPayload);

    let alreadyMember = false;
    if (memberError) {
      if ((memberError as any).code === '23505') {
        // Ya era miembro — caso esperado al re-aceptar la invitación. No es un error.
        alreadyMember = true;
        console.log('[accept-invite] Usuario ya era miembro de la empresa, continuando flujo idempotente.');
      } else {
        // Error real de BD: abortar.
        console.error('[accept-invite] Error real creando empresa_miembros:', memberError);
        throw memberError;
      }
    }

    // 4. Persona en el equipo (también idempotente)
    const { data: existingPersona } = await supabaseAdmin
      .from('persona')
      .select('id')
      .eq('usuario_id', userId)
      .eq('equipo_id', invite.equipo_id)
      .maybeSingle();

    let memberId = existingPersona?.id;

    if (!memberId) {
      const { data: newPersona, error: personaError } = await supabaseAdmin
        .from('persona')
        .insert({
          nombre: realUserName,
          email: invite.invited_email,
          titulo_trabajo: invite.invited_titulo_trabajo,
          equipo_id: invite.equipo_id,
          usuario_id: userId,
          permisos: []
        })
        .select()
        .single();

      if (personaError) {
        // Si la persona también ya existe (race condition / duplicate), tratar como idempotente
        if ((personaError as any).code === '23505') {
          console.log('[accept-invite] Persona ya existía, reintentando lookup.');
          const { data: retryPersona } = await supabaseAdmin
            .from('persona')
            .select('id')
            .eq('usuario_id', userId)
            .eq('equipo_id', invite.equipo_id)
            .maybeSingle();
          memberId = retryPersona?.id;
        } else {
          throw personaError;
        }
      } else {
        memberId = newPersona.id;
      }
    }

    // 4. Actualizar estado de la invitación
    const { error: updateError } = await supabaseAdmin
      .from('equipo_invitaciones')
      .update({ 
        status: 'accepted',
        responded_at: new Date()
      })
      .eq('id', invite.id);

    if (updateError) throw updateError;

    // 5. Asignar a pipelines si existen (filtra los que ya están vinculados para no ensuciar logs)
    if (invite.pipeline_ids && invite.pipeline_ids.length > 0 && memberId) {
      const { data: existingLinks } = await supabaseAdmin
        .from('persona_pipeline')
        .select('pipeline_id')
        .eq('persona_id', memberId)
        .in('pipeline_id', invite.pipeline_ids);

      const existingIds = new Set((existingLinks || []).map((r: any) => r.pipeline_id));
      const toInsert = invite.pipeline_ids
        .filter((pid: string) => !existingIds.has(pid))
        .map((pipelineId: string) => ({ persona_id: memberId, pipeline_id: pipelineId }));

      if (toInsert.length > 0) {
        const { error: pipelineError } = await supabaseAdmin
          .from('persona_pipeline')
          .insert(toInsert);

        if (pipelineError) {
          console.error('[accept-invite] Error assigning pipelines:', pipelineError);
        }
      }
    }

    // 6. Crear notificación de bienvenida para el invitado
    const invitedUser = await supabaseAdmin.auth.admin.getUserById(userId);
    await supabaseAdmin
      .from("notificaciones")
      .insert({
        usuario_email: invitedUser.data.user?.email,
        type: 'invitation_accepted',
        title: '¡Bienvenido al equipo!',
        message: `Has aceptado la invitación a ${invite.equipo?.nombre_equipo || 'tu equipo'}.`,
        data: { 
          memberId,
          empresa_nombre: invite.empresa?.nombre_empresa,
          equipo_nombre: invite.equipo?.nombre_equipo,
          invited_nombre: invite.invited_nombre,
          invited_email: invite.invited_email
        }
      });

    // 5. Obtener email del dueño de la empresa y crear notificación
    if (invite.empresa?.usuario_id) {
      const { data: ownerUser } = await supabaseAdmin.auth.admin.getUserById(invite.empresa.usuario_id);

      if (ownerUser?.user?.email) {
        await supabaseAdmin
          .from("notificaciones")
          .insert({
            usuario_email: ownerUser.user.email,
            type: 'invitation_response',
            title: `${invite.invited_nombre || invite.invited_email} aceptó tu invitación`,
            message: `${invite.invited_nombre || invite.invited_email} se ha unido a ${invite.equipo?.nombre_equipo || 'tu equipo'}.`,
            data: {
              response: 'accepted',
              invited_nombre: invite.invited_nombre,
              invited_email: invite.invited_email,
              empresa_nombre: invite.empresa.nombre_empresa,
              equipo_nombre: invite.equipo?.nombre_equipo,
              memberId
            }
          });
      }
    }

    return new Response(JSON.stringify({ success: true, memberId, alreadyMember, empresa_id: invite.empresa_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
