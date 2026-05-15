import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, Authorization, x-supabase-authorization, X-Supabase-Authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const GRAPH_VERSION = 'v21.0'

function extractBearerToken(rawHeader: string | null): string | null {
  if (!rawHeader) return null
  const normalized = rawHeader.trim()
  if (!normalized) return null
  if (/^bearer\s+/i.test(normalized)) {
    return normalized.replace(/^bearer\s+/i, '').trim() || null
  }
  return normalized
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let currentStep = 'Inicio'
  try {
    currentStep = 'Validar Entorno'
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseServiceKey) throw new Error('Faltan variables de Supabase')

    currentStep = 'Verificar Autenticación'
    const authorizationHeader = req.headers.get('Authorization') || req.headers.get('authorization')
    const proxiedAuthorization = req.headers.get('x-supabase-authorization') || req.headers.get('X-Supabase-Authorization')
    const accessToken = extractBearerToken(authorizationHeader) || extractBearerToken(proxiedAuthorization)

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)

    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'Unauthorized - missing access token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(accessToken)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized - user not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    currentStep = 'Parsear body'
    const body = await req.json()
    const { lead_id, template_id, to } = body as {
      lead_id: string
      template_id: string
      to?: string
    }
    if (!lead_id || !template_id) throw new Error('lead_id y template_id son requeridos')

    currentStep = 'Buscar lead'
    const { data: lead, error: leadErr } = await supabaseClient
      .from('lead')
      .select('id, telefono, empresa_id')
      .eq('id', lead_id)
      .single()
    if (leadErr || !lead) throw new Error('Lead no encontrado')

    const phone = (to || lead.telefono || '').replace(/\D/g, '')
    if (!phone) throw new Error('Lead sin teléfono')

    currentStep = 'Buscar plantilla'
    const { data: template, error: tplErr } = await supabaseClient
      .from('meta_follow_up_templates')
      .select('*, meta_configs!inner(*)')
      .eq('id', template_id)
      .eq('empresa_id', lead.empresa_id)
      .eq('active', true)
      .single()
    if (tplErr || !template) throw new Error('Plantilla no encontrada o inactiva')

    const config = (template as any).meta_configs
    if (!config?.active) throw new Error('La configuración Meta asociada está inactiva')

    currentStep = 'Llamar Meta Cloud API'
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${config.phone_number_id}/messages`
    const payload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: template.meta_template_name,
        language: { code: template.meta_template_language },
      },
    }

    const metaRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const metaJson: any = await metaRes.json()
    if (!metaRes.ok) {
      throw new Error(metaJson?.error?.message || `Meta API HTTP ${metaRes.status}`)
    }
    const wamid = metaJson?.messages?.[0]?.id || null

    currentStep = 'Guardar mensaje saliente'
    const { data: savedMsg, error: msgErr } = await supabaseClient
      .from('mensajes')
      .insert({
        lead_id,
        sender: 'team',
        channel: 'whatsapp',
        content: template.body_preview || `[Plantilla: ${template.meta_template_name}]`,
        metadata: {
          meta_template_name: template.meta_template_name,
          meta_template_language: template.meta_template_language,
          meta_config_id: config.id,
          phone_number_id: config.phone_number_id,
          wamid,
          source: 'meta-template',
        },
      })
      .select('*')
      .single()
    if (msgErr) {
      console.error('[send-meta-template] error guardando mensaje', msgErr)
    }

    return new Response(
      JSON.stringify({ ok: true, wamid, message: savedMsg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e: any) {
    console.error(`[send-meta-template] step=${currentStep} error:`, e?.message || e)
    return new Response(
      JSON.stringify({ ok: false, step: currentStep, error: e?.message || String(e) }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
