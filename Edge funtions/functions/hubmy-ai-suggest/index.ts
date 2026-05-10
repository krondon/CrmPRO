import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const HUBMY_API_KEY = Deno.env.get('HUBMY_API_KEY')!
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return err('No autorizado', 401)
    const token = authHeader.slice(7)

    const { lead_id, empresa_id } = await req.json()
    if (!lead_id || !empresa_id) return err('lead_id y empresa_id requeridos')

    const db = createClient(SUPABASE_URL, SERVICE_ROLE)

    // 1. Verify user from JWT
    const { data: { user }, error: userErr } = await db.auth.getUser(token)
    if (userErr || !user) return err('Token inválido', 401)
    const userId = user.id

    // 2. Check owner or admin
    const { data: empresa } = await db
      .from('empresa')
      .select('usuario_id')
      .eq('id', empresa_id)
      .maybeSingle()

    const isOwner = empresa?.usuario_id === userId
    if (!isOwner) {
      const { data: member } = await db
        .from('empresa_miembros')
        .select('rol')
        .eq('empresa_id', empresa_id)
        .eq('usuario_id', userId)
        .maybeSingle()
      const isAdmin = member?.rol?.toLowerCase() === 'admin'
      if (!isAdmin) return err('Solo owners o admins pueden usar el asistente IA', 403)
    }

    // 3. Check Hubmy subscription
    const { data: linked } = await db
      .from('hubmy_linked_users')
      .select('hubmy_subscription_active')
      .eq('supabase_user_id', userId)
      .maybeSingle()

    if (!linked?.hubmy_subscription_active) {
      return err('Necesitas una suscripción activa en Hubmy para usar el asistente IA', 403)
    }

    // 4. Fetch last 20 messages from the conversation
    const { data: messages } = await db
      .from('mensajes')
      .select('sender, content, created_at')
      .eq('lead_id', lead_id)
      .not('content', 'is', null)
      .neq('content', '')
      .order('created_at', { ascending: false })
      .limit(20)

    if (!messages || messages.length === 0) {
      return err('No hay mensajes en esta conversación', 400)
    }

    const conversation = [...messages].reverse().map((m: any) => {
      const label = m.sender === 'lead' ? 'Cliente' : 'Agente'
      return `${label}: ${m.content}`
    }).join('\n')

    // 5. Call Hubmy AI
    const aiRes = await fetch('https://apidev.hubmy.app/v1/api/ai/chat', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HUBMY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'Eres un asistente de ventas experto. Analiza la conversación y sugiere la mejor respuesta profesional, empática y orientada a ventas en el mismo idioma del cliente. Responde SOLO con el mensaje sugerido para el agente, sin explicaciones adicionales, sin comillas.',
          },
          {
            role: 'user',
            content: `Conversación:\n${conversation}\n\nSugiere la mejor respuesta para el agente:`,
          },
        ],
      }),
    })

    if (!aiRes.ok) {
      const aiErrText = await aiRes.text()
      console.error('[hubmy-ai-suggest] AI error:', aiErrText)
      return err('Error al generar sugerencia de IA', 500)
    }

    const aiJson = await aiRes.json()
    const suggestion =
      aiJson.data?.content ||
      aiJson.choices?.[0]?.message?.content ||
      aiJson.content ||
      aiJson.message ||
      ''

    if (!suggestion) return err('La IA no generó una respuesta', 500)

    return ok({ suggestion })

  } catch (e: any) {
    console.error('[hubmy-ai-suggest]', e)
    return err(e.message ?? 'Error interno', 500)
  }
})
