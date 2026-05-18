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
    // Get the JWT from the Authorization header to identify the requester
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing Authorization header')
    }

    const { companyId, email } = await req.json();

    if (!companyId || !email) {
      throw new Error('Missing companyId or email');
    }

    // Create a client with the user's token to check permissions
    const supabaseClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    })

    // Get the user from the token
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) throw new Error('Invalid token')

    // Check if the requester is an Admin or Owner of the company
    // We use the Service Role for this check to ensure we can read the role even if RLS is tricky,
    // but strictly speaking, we should verify the requester's role securely.
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // El owner NO necesariamente está en empresa_miembros — vive en empresa.usuario_id.
    // Por eso autorizamos en dos pasos: primero confirmamos si es owner, y si no, miramos su rol.
    const { data: empresaRow, error: empresaErr } = await supabaseAdmin
      .from('empresa')
      .select('usuario_id')
      .eq('id', companyId)
      .maybeSingle();

    if (empresaErr || !empresaRow) {
      throw new Error('Empresa no encontrada');
    }

    const isOwner = empresaRow.usuario_id === user.id;
    let isAdmin = false;

    if (!isOwner) {
      // Si no es owner, debe estar en empresa_miembros con role=admin
      const { data: memberRow } = await supabaseAdmin
        .from('empresa_miembros')
        .select('role')
        .eq('empresa_id', companyId)
        .eq('usuario_id', user.id)
        .maybeSingle();

      isAdmin = memberRow?.role === 'admin';
    }

    if (!isOwner && !isAdmin) {
      throw new Error('Unauthorized: Only Admins or Owners can remove members');
    }

    // Perform the deletion using Service Role (bypassing RLS)
    console.log(`Removing member ${email} from company ${companyId} requested by ${user.email}`);

    // 1. Remove from empresa_miembros
    const { error: deleteMemberError } = await supabaseAdmin
      .from('empresa_miembros')
      .delete()
      .eq('empresa_id', companyId)
      .ilike('email', email);

    if (deleteMemberError) {
      throw deleteMemberError;
    }

    // 2. Remove from persona (teams)
    // First get all teams for this company
    const { data: teams } = await supabaseAdmin
      .from('equipos')
      .select('id')
      .eq('empresa_id', companyId);

    if (teams && teams.length > 0) {
      const teamIds = teams.map(t => t.id);
      const { error: deletePersonaError } = await supabaseAdmin
        .from('persona')
        .delete()
        .in('equipo_id', teamIds)
        .ilike('email', email);

      if (deletePersonaError) {
        console.error('Error deleting from persona:', deletePersonaError);
        // We don't throw here to avoid failing the whole operation if member was already gone from teams
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Member removed successfully' }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Error in remove-member:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
