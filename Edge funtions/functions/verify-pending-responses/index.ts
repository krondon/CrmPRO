import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

/**
 * verify-pending-responses
 *
 * Recorre las oportunidades de una empresa marcadas como
 * "pendientes de respuesta humana" (is_pending_human_response=true)
 * y consulta a SuperAPI si el chat fue "bloqueado" (= un asesor
 * humano respondió manualmente). Si SuperAPI confirma el lock,
 * limpia la columna en BD.
 *
 * Llamado por el frontend cada 60s mientras la feature está activa
 * para la empresa (pending_response_enabled=true en chat_settings).
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, Authorization, x-supabase-authorization, X-Supabase-Authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function extractBearerToken(rawHeader: string | null): string | null {
  if (!rawHeader) return null;
  const normalized = rawHeader.trim();
  if (!normalized) return null;
  if (/^bearer\s+/i.test(normalized)) {
    return normalized.replace(/^bearer\s+/i, '').trim() || null;
  }
  return normalized;
}

function buildChatId(phone: string | null | undefined, platform: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  // Para WhatsApp, SuperAPI espera el formato `<digits>@c.us`.
  // Otros canales no implementan este endpoint todavía, así que solo WhatsApp.
  if (platform === 'whatsapp' || platform === 'wws') {
    return `${digits}@c.us`;
  }
  return null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Faltan variables de entorno de Supabase');
    }

    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    const proxied = req.headers.get('x-supabase-authorization') || req.headers.get('X-Supabase-Authorization');
    const accessToken = extractBearerToken(authHeader) || extractBearerToken(proxied);
    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json().catch(() => ({}));
    const empresaId = (body as any).empresa_id as string | undefined;
    if (!empresaId) {
      return new Response(JSON.stringify({ error: 'empresa_id es obligatorio' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verificar que el usuario pertenezca a la empresa.
    const { data: membership } = await supabase
      .from('empresa_miembros')
      .select('empresa_id')
      .eq('empresa_id', empresaId)
      .eq('usuario_id', user.id)
      .maybeSingle();

    const { data: ownedEmpresa } = await supabase
      .from('empresa')
      .select('id')
      .eq('id', empresaId)
      .eq('usuario_id', user.id)
      .maybeSingle();

    if (!membership && !ownedEmpresa) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Si la feature no está activa para la empresa, no hacemos nada.
    // Esto evita peticiones inútiles a SuperAPI si el frontend pollea sin saber.
    const { data: settings } = await supabase
      .from('chat_settings')
      .select('pending_response_enabled')
      .eq('empresa_id', empresaId)
      .maybeSingle();

    if (!settings?.pending_response_enabled) {
      return new Response(JSON.stringify({
        success: true,
        skipped: 'feature_disabled',
        checked: 0,
        cleared: 0
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Leads pendientes de esta empresa.
    const { data: pendingLeads, error: leadsErr } = await supabase
      .from('lead')
      .select('id, telefono, preferred_instance_id')
      .eq('empresa_id', empresaId)
      .eq('is_pending_human_response', true);

    if (leadsErr) {
      console.error('[verify-pending] error leyendo leads:', leadsErr);
      throw leadsErr;
    }

    if (!pendingLeads || pendingLeads.length === 0) {
      return new Response(JSON.stringify({ success: true, checked: 0, cleared: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Cargar instancias WhatsApp de la empresa.
    const { data: instancias } = await supabase
      .from('empresa_instancias')
      .select('id, plataforma, client_id, api_url, api_token, active')
      .eq('empresa_id', empresaId)
      .eq('plataforma', 'whatsapp')
      .eq('active', true);

    if (!instancias || instancias.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        skipped: 'no_active_instances',
        checked: 0,
        cleared: 0
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const instancesById = new Map(instancias.map((i: any) => [i.id, i]));
    const defaultInstance = instancias[0];

    let checked = 0;
    let cleared = 0;
    const toClearIds: string[] = [];

    // Iteramos secuencialmente para no saturar el endpoint de SuperAPI.
    // Si hay muchos leads pendientes (>50), el polling cada 60s sigue siendo
    // sostenible porque cada lead se chequea con una request rápida.
    for (const lead of pendingLeads as any[]) {
      const instance = (lead.preferred_instance_id && instancesById.get(lead.preferred_instance_id))
        || defaultInstance;
      if (!instance?.api_token) continue;

      const chatId = buildChatId(lead.telefono, instance.plataforma);
      if (!chatId) continue;

      const baseUrl = (instance.api_url && instance.api_url.length > 5 && instance.api_url !== '.')
        ? instance.api_url
        : 'https://v4.iasuperapi.com';

      try {
        checked++;
        const url = `${baseUrl}/api/v1/chats/locked?chatId=${encodeURIComponent(chatId)}`;
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${instance.api_token}`,
            'Content-Type': 'application/json'
          }
        });

        // El endpoint /chats/locked siempre responde 200 OK si la petición
        // se procesó, así que NO podemos confiar en res.ok como "está bloqueado".
        // El estado real viene en el cuerpo. Aceptamos varias formas comunes:
        //   { locked: true }
        //   { isLocked: true }
        //   { is_locked: true }
        //   { data: { locked: true } }
        // y consideramos "bloqueado=true" SOLO si se afirma explícitamente.
        let isLocked = false;
        let bodyForLog: unknown = null;
        try {
          const text = await res.text();
          bodyForLog = text;
          if (text) {
            const json = JSON.parse(text);
            bodyForLog = json;
            const inner = (json && typeof json === 'object' && 'data' in json) ? (json as any).data : json;
            const candidate =
              inner?.locked ??
              inner?.isLocked ??
              inner?.is_locked;
            // Aceptamos true (boolean) o cadena 'true'/'1'
            if (candidate === true || candidate === 'true' || candidate === 1 || candidate === '1') {
              isLocked = true;
            }
          }
        } catch (parseErr) {
          console.warn(`[verify-pending] lead ${lead.id}: no se pudo parsear body:`, parseErr, 'raw:', bodyForLog);
        }

        console.log(`[verify-pending] lead=${lead.id} chatId=${chatId} status=${res.status} locked=${isLocked} body=${JSON.stringify(bodyForLog)}`);

        if (isLocked) {
          toClearIds.push(lead.id);
        }
      } catch (err) {
        console.warn(`[verify-pending] error chequeando lead ${lead.id}:`, err);
      }
    }

    if (toClearIds.length > 0) {
      const { error: updErr } = await supabase
        .from('lead')
        .update({ is_pending_human_response: false })
        .in('id', toClearIds);

      if (updErr) {
        console.error('[verify-pending] error actualizando leads:', updErr);
        throw updErr;
      }
      cleared = toClearIds.length;
    }

    return new Response(JSON.stringify({
      success: true,
      checked,
      cleared,
      total_pending: pendingLeads.length
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('[verify-pending] error:', err);
    return new Response(JSON.stringify({ error: err?.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
