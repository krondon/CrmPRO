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
    const { empresa_id, equipo_id, token } = await req.json();
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Modo "por token": resolver la invitación entera (uso público para /invitacion/:token).
    // Solo se devuelven campos no sensibles. No expone el token de vuelta.
    if (token) {
      const { data: invite, error: inviteErr } = await supabaseAdmin
        .from('equipo_invitaciones')
        .select('empresa_id, equipo_id, invited_email, invited_nombre, invited_titulo_trabajo, permission_role, status')
        .eq('token', token)
        .maybeSingle();

      if (inviteErr || !invite) {
        return new Response(JSON.stringify({ error: 'Invitación no encontrada' }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const [{ data: emp }, { data: eq }] = await Promise.all([
        supabaseAdmin.from('empresa').select('nombre_empresa, logo_url').eq('id', invite.empresa_id).maybeSingle(),
        invite.equipo_id
          ? supabaseAdmin.from('equipos').select('nombre_equipo').eq('id', invite.equipo_id).maybeSingle()
          : Promise.resolve({ data: null }) as any,
      ]);

      return new Response(JSON.stringify({
        empresa_id: invite.empresa_id,
        empresa_nombre: emp?.nombre_empresa || null,
        empresa_logo: emp?.logo_url || null,
        equipo_nombre: eq?.nombre_equipo || null,
        invited_email: invite.invited_email,
        invited_nombre: invite.invited_nombre,
        invited_titulo_trabajo: invite.invited_titulo_trabajo,
        permission_role: invite.permission_role,
        status: invite.status,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Modo legacy: empresa_id / equipo_id (usado por NotificationsView)
    let empresa_nombre: string | null = null;
    let equipo_nombre: string | null = null;

    if (empresa_id) {
      const { data: emp } = await supabaseAdmin
        .from('empresa')
        .select('nombre_empresa')
        .eq('id', empresa_id)
        .maybeSingle();
      empresa_nombre = emp?.nombre_empresa || null;
    }

    if (equipo_id) {
      const { data: eq } = await supabaseAdmin
        .from('equipos')
        .select('nombre_equipo')
        .eq('id', equipo_id)
        .maybeSingle();
      equipo_nombre = eq?.nombre_equipo || null;
    }

    return new Response(JSON.stringify({ empresa_nombre, equipo_nombre }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
