import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const HUBMY_API_KEY = Deno.env.get('HUBMY_API_KEY')!
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function ok(data: unknown) {
  return new Response(JSON.stringify(data), { headers: { ...cors, 'Content-Type': 'application/json' } })
}
function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return err('No autorizado', 401)
    const token = authHeader.slice(7)

    const { lead_id, empresa_id, query } = await req.json()
    if (!empresa_id) return err('empresa_id requerido')

    const db = createClient(SUPABASE_URL, SERVICE_ROLE)

    // 1. Verify user
    const { data: { user }, error: userErr } = await db.auth.getUser(token)
    if (userErr || !user) return err('Token inválido', 401)
    const userId = user.id

    // 2. Verify user belongs to this company
    const { data: empresa } = await db.from('empresa').select('usuario_id, nombre_empresa').eq('id', empresa_id).maybeSingle()
    const isOwner = empresa?.usuario_id === userId
    if (!isOwner) {
      const { data: member } = await db.from('empresa_miembros').select('role').eq('empresa_id', empresa_id).eq('usuario_id', userId).maybeSingle()
      if (!member) return err('No tienes acceso a esta empresa', 403)
    }

    // 3. Check Hubmy subscription
    const { data: linked } = await db.from('hubmy_linked_users').select('hubmy_subscription_active').eq('supabase_user_id', userId).maybeSingle()
    if (!linked?.hubmy_subscription_active) return err('Se requiere suscripción activa en Hubmy para usar el agente IA', 403)

    // 4. Fetch lead context (if lead_id provided)
    let lead: any = null
    let stages: any[] = []
    let conversation = '(sin conversación activa)'

    if (lead_id) {
      const { data: leadData } = await db
        .from('lead')
        .select('nombre_completo, pipeline_id, etapa_id, prioridad, asignado_a, presupuesto')
        .eq('id', lead_id)
        .maybeSingle()
      lead = leadData

      const [{ data: msgsData }, { data: stagesData }] = await Promise.all([
        db.from('mensajes').select('sender, content').eq('lead_id', lead_id).not('content', 'is', null).neq('content', '').order('created_at', { ascending: false }).limit(15),
        lead?.pipeline_id
          ? db.from('etapas').select('id, nombre').eq('pipeline_id', lead.pipeline_id).order('orden', { ascending: true })
          : Promise.resolve({ data: [] as any[] })
      ])

      stages = stagesData ?? []
      const msgs = (msgsData ?? []).reverse()
      if (msgs.length) {
        conversation = msgs.map((m: any) => `${m.sender === 'lead' ? 'Cliente' : 'Agente'}: ${m.content}`).join('\n')
      }
    }

    // 5. Fetch team members with names
    const { data: membersRaw } = await db
      .from('empresa_miembros')
      .select('usuario_id, usuarios(nombre_completo)')
      .eq('empresa_id', empresa_id)

    const members = (membersRaw ?? [])
      .map((m: any) => ({ id: m.usuario_id, name: m.usuarios?.nombre_completo || null }))
      .filter((m: any) => m.name)

    // 6. Build context blocks
    const leadBlock = lead
      ? `Lead activo: ${lead.nombre_completo || 'Sin nombre'} | Prioridad: ${lead.prioridad || 'none'} | Etapa ID: ${lead.etapa_id || 'ninguna'} | Presupuesto: $${lead.presupuesto || 0}`
      : 'Sin lead específico seleccionado'

    const stagesBlock = stages.length
      ? stages.map((s: any) => `  - "${s.nombre}" (id: ${s.id})`).join('\n')
      : '  (pipeline sin etapas configuradas)'

    const membersBlock = members.length
      ? members.map((m: any) => `  - "${m.name}" (id: ${m.id})`).join('\n')
      : '  (sin miembros)'

    // 7. Call Hubmy AI with agent prompt
    const systemPrompt = `Eres un agente inteligente de CRM para la empresa "${empresa?.nombre_empresa || empresa_id}". Puedes hacer acciones sobre leads y consultar datos del CRM.

CONTEXTO ACTUAL:
${leadBlock}

ETAPAS DISPONIBLES EN EL PIPELINE:
${stagesBlock}

MIEMBROS DEL EQUIPO:
${membersBlock}

CONVERSACIÓN CON EL CLIENTE:
${conversation}

HERRAMIENTAS DISPONIBLES:
1. suggest_reply      — Sugiere una respuesta profesional para enviar al cliente
2. move_stage         — Mueve el lead a una etapa específica del pipeline
3. set_priority       — Cambia la prioridad del lead (high / medium / low)
4. assign_user        — Asigna el lead a un miembro del equipo
5. count_leads        — Cuenta leads en la empresa (con filtros opcionales)

IMPORTANTE: Responde ÚNICAMENTE con JSON válido (sin markdown ni texto extra):
{
  "type": "suggest_reply|move_stage|set_priority|assign_user|count_leads",

  "reply": "texto de respuesta sugerida (solo si type=suggest_reply)",

  "stage_id": "uuid exacto de la etapa (solo si type=move_stage)",
  "stage_name": "nombre de la etapa (solo si type=move_stage)",

  "priority": "high|medium|low (solo si type=set_priority)",

  "user_id": "uuid exacto del miembro (solo si type=assign_user)",
  "user_name": "nombre del miembro (solo si type=assign_user)",

  "count_filter": {
    "priority": "high|medium|low",
    "stale_days": 7,
    "archived": false
  },

  "summary": "mensaje breve al usuario explicando lo que hizo o encontró"
}

REGLAS:
- Usa EXACTAMENTE los IDs de las listas de etapas y miembros proporcionadas
- Si el usuario dice "siguiente etapa", infiere cuál es según la lista ordenada
- Si no hay comando específico del usuario → usa suggest_reply
- summary siempre debe estar en español y ser conciso`

    const aiRes = await fetch('https://apidev.hubmy.app/v1/api/ai/chat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${HUBMY_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query || 'Analiza la conversación y sugiere la mejor respuesta para el cliente' }
        ]
      })
    })

    if (!aiRes.ok) throw new Error(`Hubmy AI ${aiRes.status}: ${await aiRes.text()}`)
    const aiJson = await aiRes.json()
    const content: string = aiJson.data?.content || aiJson.choices?.[0]?.message?.content || aiJson.content || ''
    const cleaned = content.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()

    let agentResponse: any
    try {
      agentResponse = JSON.parse(cleaned)
    } catch {
      return err('La IA no devolvió JSON válido', 500)
    }

    // 8. Execute read-only operations (count_leads)
    if (agentResponse.type === 'count_leads') {
      const cf = agentResponse.count_filter || {}
      let q = db.from('lead').select('id', { count: 'exact', head: true }).eq('empresa_id', empresa_id)

      if (cf.archived === true) {
        q = q.eq('archived', true)
      } else {
        q = q.eq('archived', false)
      }
      if (cf.priority) q = q.eq('prioridad', cf.priority)
      if (cf.stale_days) {
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - Number(cf.stale_days))
        q = q.lt('updated_at', cutoff.toISOString())
      }

      const { count } = await q
      agentResponse.count = count ?? 0
    }

    return ok(agentResponse)

  } catch (e: any) {
    console.error('[hubmy-ai-agent]', e)
    return err(e.message ?? 'Error interno', 500)
  }
})
