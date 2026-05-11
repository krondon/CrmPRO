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

function resolveDateRange(relative: string) {
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const tomorrow = new Date(today.getTime() + 86400000)
  switch (relative) {
    case 'today':       return { from: today.toISOString(), to: tomorrow.toISOString() }
    case 'yesterday':   return { from: new Date(today.getTime() - 86400000).toISOString(), to: today.toISOString() }
    case 'last_7_days': return { from: new Date(today.getTime() - 7 * 86400000).toISOString(), to: tomorrow.toISOString() }
    case 'last_30_days':return { from: new Date(today.getTime() - 30 * 86400000).toISOString(), to: tomorrow.toISOString() }
    case 'this_month':  return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(), to: tomorrow.toISOString() }
    default:            return { from: new Date(today.getTime() - 30 * 86400000).toISOString(), to: tomorrow.toISOString() }
  }
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

    // 2. Verify membership
    const { data: empresa } = await db.from('empresa').select('usuario_id, nombre_empresa').eq('id', empresa_id).maybeSingle()
    const isOwner = empresa?.usuario_id === userId
    if (!isOwner) {
      const { data: member } = await db.from('empresa_miembros').select('role').eq('empresa_id', empresa_id).eq('usuario_id', userId).maybeSingle()
      if (!member) return err('No tienes acceso a esta empresa', 403)
    }

    // 3. Check Hubmy subscription
    const { data: linked } = await db.from('hubmy_linked_users').select('hubmy_subscription_active').eq('supabase_user_id', userId).maybeSingle()
    if (!linked?.hubmy_subscription_active) return err('Se requiere suscripción activa en Hubmy para usar el agente IA', 403)

    // 4. Fetch team members
    const { data: membersRaw } = await db.from('empresa_miembros').select('usuario_id, usuarios(nombre_completo)').eq('empresa_id', empresa_id)
    const members = (membersRaw ?? [])
      .map((m: any) => ({ id: m.usuario_id, name: m.usuarios?.nombre_completo || null }))
      .filter((m: any) => m.name)
    const memberMap = Object.fromEntries(members.map((m: any) => [m.id, m.name]))

    // 5. Fetch all pipelines + stages for this empresa
    const { data: pipelinesData } = await db.from('pipeline').select('id, nombre').eq('empresa_id', empresa_id)
    const allPipelines = pipelinesData ?? []
    const pipelineIds = allPipelines.map((p: any) => p.id)
    const pipelineMap = Object.fromEntries(allPipelines.map((p: any) => [p.id, p.nombre]))

    let allStages: any[] = []
    if (pipelineIds.length) {
      const { data: stagesData } = await db.from('etapas').select('id, nombre, pipeline_id').in('pipeline_id', pipelineIds).order('orden', { ascending: true })
      allStages = stagesData ?? []
    }
    const stageMap = Object.fromEntries(allStages.map((s: any) => [s.id, s.nombre]))

    // 6. Fetch current lead context
    let lead: any = null
    let leadStages: any[] = []
    let conversation = '(sin conversación activa)'

    if (lead_id) {
      const { data: leadData } = await db.from('lead').select('nombre_completo, pipeline_id, etapa_id, prioridad, asignado_a, presupuesto').eq('id', lead_id).maybeSingle()
      lead = leadData
      leadStages = lead?.pipeline_id ? allStages.filter((s: any) => s.pipeline_id === lead.pipeline_id) : []

      const { data: msgsData } = await db.from('mensajes').select('sender, content').eq('lead_id', lead_id).not('content', 'is', null).neq('content', '').order('created_at', { ascending: false }).limit(15)
      const msgs = (msgsData ?? []).reverse()
      if (msgs.length) conversation = msgs.map((m: any) => `${m.sender === 'lead' ? 'Cliente' : 'Agente'}: ${m.content}`).join('\n')
    }

    // 7. Build prompt context
    const leadBlock = lead
      ? `Lead activo: ${lead.nombre_completo || 'Sin nombre'} | Prioridad: ${lead.prioridad || 'none'} | Etapa ID: ${lead.etapa_id || 'ninguna'} | Presupuesto: $${lead.presupuesto || 0}`
      : 'Sin lead específico seleccionado'

    const stagesBlock = leadStages.length
      ? leadStages.map((s: any) => `  - "${s.nombre}" (id: ${s.id})`).join('\n')
      : allStages.slice(0, 15).map((s: any) => `  - "${s.nombre}" (id: ${s.id})`).join('\n') || '  (sin etapas)'

    const membersBlock = members.length
      ? members.map((m: any) => `  - "${m.name}" (id: ${m.id})`).join('\n')
      : '  (sin miembros)'

    // 8. Call Hubmy AI
    const systemPrompt = `Eres un agente inteligente de CRM para la empresa "${empresa?.nombre_empresa || empresa_id}".

CONTEXTO ACTUAL:
${leadBlock}

ETAPAS DEL PIPELINE:
${stagesBlock}

MIEMBROS DEL EQUIPO:
${membersBlock}

CONVERSACIÓN CON EL CLIENTE:
${conversation}

HERRAMIENTAS DISPONIBLES:
1.  suggest_reply      — Sugiere respuesta profesional para enviar al cliente
2.  move_stage         — Mueve el lead a una etapa del pipeline
3.  set_priority       — Cambia prioridad del lead (high/medium/low)
4.  assign_user        — Asigna el lead a un miembro del equipo
5.  archive_lead       — Archiva el lead actual
6.  count_leads        — Cuenta leads con filtros (prioridad, inactividad, archivados)
7.  list_leads         — Lista leads con filtros (hasta 15 resultados)
8.  count_messages     — Cuenta mensajes o leads únicos que escribieron en un período
9.  get_pipeline_stats — Estadísticas por etapa (cantidad de leads y presupuesto total)
10. revenue_summary    — Suma total de presupuestos de leads activos

RESPONDE ÚNICAMENTE con JSON válido (sin markdown ni texto extra):
{
  "type": "<herramienta>",

  "reply": "texto (solo si suggest_reply)",

  "stage_id": "uuid exacto (solo si move_stage)",
  "stage_name": "nombre (solo si move_stage)",

  "priority": "high|medium|low (solo si set_priority)",

  "user_id": "uuid exacto (solo si assign_user)",
  "user_name": "nombre (solo si assign_user)",

  "count_filter": {
    "priority": "high|medium|low",
    "stale_days": 7,
    "archived": false
  },

  "lead_filter": {
    "stage_id": "uuid o null",
    "priority": "high|medium|low o null",
    "assigned_to": "uuid o null",
    "stale_days": null,
    "limit": 10
  },

  "message_filter": {
    "sender": "lead|team|all",
    "date": "today|yesterday|last_7_days|last_30_days|this_month",
    "distinct_leads": true
  },

  "revenue_filter": {
    "stage_id": "uuid o null",
    "priority": "high|medium|low o null"
  },

  "summary": "explicación breve en español de lo que encontró o hará"
}

REGLAS:
- Usa IDs exactos de las listas. "siguiente etapa" → infiere por orden de la lista
- Sin comando explícito → suggest_reply
- Para "leads que escribieron ayer" → type=count_messages, sender=lead, date=yesterday, distinct_leads=true
- Para listar leads inactivos → type=list_leads con stale_days
- summary siempre en español y conciso`

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
    const rawContent: string = aiJson.data?.content || aiJson.choices?.[0]?.message?.content || aiJson.content || ''
    const cleaned = rawContent.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()

    let agentResponse: any
    try { agentResponse = JSON.parse(cleaned) }
    catch { return err('La IA no devolvió JSON válido', 500) }

    const type = agentResponse.type

    // 9. Execute server-side operations

    if (type === 'count_leads') {
      const cf = agentResponse.count_filter || {}
      let q = db.from('lead').select('id', { count: 'exact', head: true }).eq('empresa_id', empresa_id)
      q = cf.archived === true ? q.eq('archived', true) : q.eq('archived', false)
      if (cf.priority) q = q.eq('prioridad', cf.priority)
      if (cf.stale_days) {
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - Number(cf.stale_days))
        q = q.lt('updated_at', cutoff.toISOString())
      }
      const { count } = await q
      agentResponse.count = count ?? 0
    }

    else if (type === 'count_messages') {
      const mf = agentResponse.message_filter || {}
      const { from, to } = resolveDateRange(mf.date || 'yesterday')

      const { data: leadIds } = await db.from('lead').select('id').eq('empresa_id', empresa_id).eq('archived', false)
      const ids = (leadIds ?? []).map((l: any) => l.id)

      if (!ids.length) {
        agentResponse.count = 0
      } else {
        const BATCH = 100
        const collected: string[] = []
        for (let i = 0; i < ids.length; i += BATCH) {
          let q = db.from('mensajes').select('lead_id').in('lead_id', ids.slice(i, i + BATCH)).gte('created_at', from).lt('created_at', to)
          if (mf.sender && mf.sender !== 'all') q = q.eq('sender', mf.sender)
          const { data } = await q
          for (const m of (data ?? [])) collected.push(m.lead_id)
        }
        agentResponse.count = mf.distinct_leads !== false ? new Set(collected).size : collected.length
      }
    }

    else if (type === 'list_leads') {
      const lf = agentResponse.lead_filter || {}
      const limit = Math.min(Number(lf.limit) || 10, 15)

      let q = db.from('lead').select('id, nombre_completo, etapa_id, prioridad, asignado_a').eq('empresa_id', empresa_id).eq('archived', false).limit(limit)
      if (lf.stage_id) q = q.eq('etapa_id', lf.stage_id)
      if (lf.priority) q = q.eq('prioridad', lf.priority)
      if (lf.assigned_to) q = q.eq('asignado_a', lf.assigned_to)
      if (lf.stale_days) {
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - Number(lf.stale_days))
        q = q.lt('updated_at', cutoff.toISOString())
      }

      const { data: leadsData } = await q
      agentResponse.leads = (leadsData ?? []).map((l: any) => ({
        id: l.id,
        name: l.nombre_completo || 'Sin nombre',
        stage: stageMap[l.etapa_id] || 'Sin etapa',
        priority: l.prioridad || 'none',
        assigned: memberMap[l.asignado_a] || null,
      }))
    }

    else if (type === 'get_pipeline_stats') {
      const { data: allLeads } = await db.from('lead').select('etapa_id, presupuesto').eq('empresa_id', empresa_id).eq('archived', false)

      const statsMap: Record<string, { pipeline: string; stage: string; count: number; budget: number }> = {}
      for (const s of allStages) {
        statsMap[s.id] = { pipeline: pipelineMap[s.pipeline_id] || '', stage: s.nombre, count: 0, budget: 0 }
      }
      for (const l of (allLeads ?? [])) {
        if (l.etapa_id && statsMap[l.etapa_id]) {
          statsMap[l.etapa_id].count++
          statsMap[l.etapa_id].budget += Number(l.presupuesto) || 0
        }
      }
      agentResponse.stats = Object.values(statsMap)
    }

    else if (type === 'revenue_summary') {
      const rf = agentResponse.revenue_filter || {}
      let q = db.from('lead').select('presupuesto').eq('empresa_id', empresa_id).eq('archived', false)
      if (rf.stage_id) q = q.eq('etapa_id', rf.stage_id)
      if (rf.priority) q = q.eq('prioridad', rf.priority)
      const { data: leadsData } = await q
      agentResponse.revenue = (leadsData ?? []).reduce((sum: number, l: any) => sum + (Number(l.presupuesto) || 0), 0)
    }

    return ok(agentResponse)

  } catch (e: any) {
    console.error('[hubmy-ai-agent]', e)
    return err(e.message ?? 'Error interno', 500)
  }
})
