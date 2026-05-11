import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function err(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { empresa_id, api_key, action, params = {} } = await req.json()

    if (!empresa_id || !api_key || !action) {
      return err('empresa_id, api_key y action son requeridos')
    }

    const db = createClient(supabaseUrl, serviceRoleKey)

    // ── Validate API key ─────────────────────────────────────────────
    const keyHash = await hashKey(api_key)
    const { data: keyRow, error: keyErr } = await db
      .from('empresa_api_keys')
      .select('id, scopes, expires_at, revoked_at')
      .eq('empresa_id', empresa_id)
      .eq('key_hash', keyHash)
      .single()

    if (keyErr || !keyRow) return err('API key inválida', 401)
    if (keyRow.revoked_at)  return err('API key revocada', 401)
    if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) return err('API key expirada', 401)

    db.from('empresa_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow.id).then()

    // ── Scope check ──────────────────────────────────────────────────
    const scopes: string[] = keyRow.scopes ?? ['read']
    const WRITE_ACTIONS = new Set([
      'create_lead','update_lead','move_lead','archive_lead','restore_lead',
      'create_task','complete_task','add_note','send_message',
      'create_meeting','create_contact','update_contact',
      'mark_notifications_read',
    ])
    if (WRITE_ACTIONS.has(action) && !scopes.includes('write')) {
      return err('Permisos insuficientes. Se requiere scope "write".', 403)
    }

    const result = await execute(db, empresa_id, action, params)
    return ok(result)

  } catch (e: any) {
    console.error('[morna-crm-api]', e)
    return err(e.message ?? 'Error interno del servidor', 500)
  }
})

// deno-lint-ignore no-explicit-any
async function execute(db: any, eid: string, action: string, p: any): Promise<unknown> {
  switch (action) {

    // ═══════════════════════════════════════════════════════════════
    // LEADS
    // ═══════════════════════════════════════════════════════════════
    case 'search_leads': {
      let q = db.from('lead')
        .select('id,nombre_completo,correo_electronico,telefono,empresa,prioridad,etapa_id,pipeline_id,tags,presupuesto,channel,asignado_a,created_at,last_message_at,archived,custom_fields')
        .eq('empresa_id', eid)
        .eq('archived', p.archived ?? false)
        .order('created_at', { ascending: false })
        .limit(Math.min(p.limit ?? 50, 200))

      if (p.query)        q = q.or(`nombre_completo.ilike.%${p.query}%,correo_electronico.ilike.%${p.query}%,telefono.ilike.%${p.query}%,empresa.ilike.%${p.query}%`)
      if (p.etapa_id)     q = q.eq('etapa_id', p.etapa_id)
      if (p.pipeline_id)  q = q.eq('pipeline_id', p.pipeline_id)
      if (p.prioridad)    q = q.eq('prioridad', p.prioridad)
      if (p.asignado_a)   q = q.eq('asignado_a', p.asignado_a)
      if (p.tags?.length) q = q.overlaps('tags', p.tags)

      const { data, error } = await q
      if (error) throw error
      return { leads: data, total: data.length }
    }

    case 'get_lead': {
      const { data, error } = await db.from('lead')
        .select('*, etapas(nombre,color), pipeline(nombre)')
        .eq('id', p.lead_id).eq('empresa_id', eid).single()
      if (error) throw error
      return data
    }

    case 'move_lead': {
      const { error } = await db.from('lead')
        .update({ etapa_id: p.etapa_id, stage_entered_at: new Date().toISOString() })
        .eq('id', p.lead_id).eq('empresa_id', eid)
      if (error) throw error
      return { success: true }
    }

    case 'create_lead': {
      const { data, error } = await db.from('lead').insert({
        empresa_id: eid,
        nombre_completo:    p.nombre_completo,
        correo_electronico: p.correo_electronico ?? null,
        telefono:           p.telefono ?? null,
        empresa:            p.empresa ?? null,
        pipeline_id:        p.pipeline_id,
        etapa_id:           p.etapa_id ?? null,
        prioridad:          p.prioridad ?? 'medium',
        presupuesto:        p.presupuesto ?? null,
        tags:               p.tags ?? [],
        asignado_a:         p.asignado_a ?? null,
      }).select().single()
      if (error) throw error
      return { success: true, lead: data }
    }

    case 'update_lead': {
      const ALLOWED = ['nombre_completo','correo_electronico','telefono','empresa','prioridad','tags','presupuesto','asignado_a','custom_fields']
      const updates: Record<string,unknown> = {}
      for (const k of ALLOWED) if (p[k] !== undefined) updates[k] = p[k]
      const { error } = await db.from('lead').update(updates).eq('id', p.lead_id).eq('empresa_id', eid)
      if (error) throw error
      return { success: true }
    }

    case 'archive_lead': {
      const { error } = await db.from('lead')
        .update({ archived: true, archived_at: new Date().toISOString() })
        .eq('id', p.lead_id).eq('empresa_id', eid)
      if (error) throw error
      return { success: true }
    }

    case 'restore_lead': {
      const { error } = await db.from('lead')
        .update({ archived: false, archived_at: null })
        .eq('id', p.lead_id).eq('empresa_id', eid)
      if (error) throw error
      return { success: true }
    }

    case 'get_unread_leads': {
      // Leads con mensajes sin leer del lado del cliente
      const { data, error } = await db.from('lead')
        .select('id,nombre_completo,telefono,last_message_at,channel,etapa_id,pipeline_id,asignado_a,tags,prioridad')
        .eq('empresa_id', eid)
        .eq('archived', false)
        .order('last_message_at', { ascending: false })
        .limit(Math.min(p.limit ?? 50, 200))
      if (error) throw error

      // Filtrar los que tienen mensajes no leídos
      const leadIds = data.map((l: any) => l.id)
      if (leadIds.length === 0) return { leads: [], total: 0 }

      const { data: unread } = await db.from('mensajes')
        .select('lead_id')
        .in('lead_id', leadIds)
        .eq('sender', 'lead')
        .eq('read', false)

      const unreadSet = new Set((unread || []).map((m: any) => m.lead_id))
      const unreadLeads = data.filter((l: any) => unreadSet.has(l.id))

      return { leads: unreadLeads, total: unreadLeads.length }
    }

    // ═══════════════════════════════════════════════════════════════
    // PIPELINE
    // ═══════════════════════════════════════════════════════════════
    case 'get_pipelines': {
      const { data, error } = await db.from('pipeline')
        .select('id,nombre,short_id,etapas(id,nombre,orden,color,short_id)')
        .eq('empresa_id', eid).order('created_at')
      if (error) throw error
      return { pipelines: data }
    }

    case 'get_pipeline_summary': {
      let q = db.from('lead')
        .select('etapa_id,pipeline_id,etapas(nombre,orden,color),pipeline(nombre)')
        .eq('empresa_id', eid).eq('archived', false)
      if (p.pipeline_id) q = q.eq('pipeline_id', p.pipeline_id)

      const { data, error } = await q
      if (error) throw error

      const map: Record<string, any> = {}
      for (const lead of data) {
        const k = lead.etapa_id ?? '__none__'
        if (!map[k]) map[k] = { etapa_nombre: lead.etapas?.nombre ?? 'Sin etapa', pipeline_nombre: lead.pipeline?.nombre ?? '', count: 0, orden: lead.etapas?.orden ?? 999 }
        map[k].count++
      }
      return {
        total_leads: data.length,
        by_stage: Object.entries(map).map(([etapa_id, v]) => ({ etapa_id, ...v })).sort((a: any, b: any) => a.orden - b.orden),
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // CONTACTS
    // ═══════════════════════════════════════════════════════════════
    case 'search_contacts': {
      let q = db.from('contactos')
        .select('id,nombre,apellido,email,telefono,empresa,canal,created_at,last_seen_at')
        .eq('empresa_id', eid).order('created_at', { ascending: false })
        .limit(Math.min(p.limit ?? 50, 200))
      if (p.query) q = q.or(`nombre.ilike.%${p.query}%,apellido.ilike.%${p.query}%,email.ilike.%${p.query}%,telefono.ilike.%${p.query}%`)
      const { data, error } = await q
      if (error) throw error
      return { contacts: data, total: data.length }
    }

    case 'get_contact': {
      const { data, error } = await db.from('contactos')
        .select('*').eq('id', p.contact_id).eq('empresa_id', eid).single()
      if (error) throw error
      return data
    }

    case 'create_contact': {
      const { data, error } = await db.from('contactos').insert({
        empresa_id: eid,
        nombre:    p.nombre,
        apellido:  p.apellido ?? null,
        email:     p.email ?? null,
        telefono:  p.telefono ?? null,
        empresa:   p.empresa ?? null,
        canal:     p.canal ?? null,
      }).select().single()
      if (error) throw error
      return { success: true, contact: data }
    }

    case 'update_contact': {
      const ALLOWED = ['nombre','apellido','email','telefono','empresa','canal']
      const updates: Record<string,unknown> = {}
      for (const k of ALLOWED) if (p[k] !== undefined) updates[k] = p[k]
      const { error } = await db.from('contactos').update(updates).eq('id', p.contact_id).eq('empresa_id', eid)
      if (error) throw error
      return { success: true }
    }

    // ═══════════════════════════════════════════════════════════════
    // MESSAGES
    // ═══════════════════════════════════════════════════════════════
    case 'get_lead_messages': {
      // Verify the lead belongs to this empresa before reading messages
      const { data: leadCheck } = await db.from('lead').select('id').eq('id', p.lead_id).eq('empresa_id', eid).maybeSingle()
      if (!leadCheck) throw new Error('Lead no encontrado')
      const { data, error } = await db.from('mensajes')
        .select('id,content,sender,created_at,channel,read,metadata')
        .eq('lead_id', p.lead_id)
        .order('created_at', { ascending: false })
        .limit(Math.min(p.limit ?? 50, 200))
      if (error) throw error
      return { messages: data.reverse(), total: data.length }
    }

    case 'send_message': {
      // 1. Obtener lead
      const { data: lead, error: leadErr } = await db.from('lead')
        .select('id,telefono,empresa_id,preferred_instance_id')
        .eq('id', p.lead_id).eq('empresa_id', eid).single()
      if (leadErr || !lead) throw new Error('Lead no encontrado')
      if (!lead.telefono) throw new Error('El lead no tiene teléfono registrado')

      const targetChannel = (p.channel || 'whatsapp').toLowerCase()

      // 2. Resolver instancia
      let instanceId: string | null = p.instance_id ?? lead.preferred_instance_id ?? null

      if (!instanceId) {
        // Buscar del último mensaje entrante
        const { data: lastMsg } = await db.from('mensajes')
          .select('metadata').eq('lead_id', p.lead_id).eq('sender', 'lead')
          .order('created_at', { ascending: false }).limit(1).maybeSingle()
        const meta = lastMsg?.metadata as any
        instanceId = meta?.instanceId || meta?.instance_id || null
      }

      if (!instanceId) {
        // Fallback: única instancia activa del canal
        const { data: instances } = await db.from('empresa_instancias')
          .select('id').eq('empresa_id', eid)
          .eq('plataforma', targetChannel === 'whatsapp' ? 'whatsapp' : targetChannel)
          .eq('active', true).limit(1)
        instanceId = instances?.[0]?.id ?? null
      }

      if (!instanceId) throw new Error('No se encontró una instancia activa para el canal ' + targetChannel)

      // 3. Obtener credenciales de la instancia
      const { data: inst, error: instErr } = await db.from('empresa_instancias')
        .select('id,client_id,api_url,api_token,plataforma').eq('id', instanceId).single()
      if (instErr || !inst) throw new Error('Instancia no encontrada')
      if (!inst.api_token) throw new Error('La instancia no tiene API Token configurado')
      if (!inst.client_id) throw new Error('La instancia no tiene Client ID configurado')

      // 4. Construir chatId y llamar Super API
      const BASE_URL = inst.api_url || 'https://v4.iasuperapi.com'
      let chatId = lead.telefono.replace(/\D/g, '')
      let platform = 'wws'

      if (targetChannel === 'instagram') { platform = 'instagram'; chatId = lead.telefono }
      else if (targetChannel === 'facebook') { platform = 'facebook'; chatId = lead.telefono }
      else if (!chatId.includes('@')) chatId = `${chatId}@c.us`

      const apiRes = await fetch(`${BASE_URL}/api/v1/send-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${inst.api_token}`,
        },
        body: JSON.stringify({ chatId, message: p.content, platform, client: inst.client_id }),
      })

      const apiBody = await apiRes.json().catch(() => ({})) as any
      const isError = apiBody.error === true || apiBody.status === 'error' || !apiRes.ok
      if (isError) throw new Error(`Super API: ${apiBody.message || apiBody.error || apiRes.status}`)

      // 5. Guardar en mensajes
      const { data: saved, error: saveErr } = await db.from('mensajes').insert({
        lead_id:  p.lead_id,
        content:  p.content,
        sender:   'team',
        channel:  targetChannel,
        read:     true,
        metadata: { instanceId, platform },
      }).select().single()
      if (saveErr) throw saveErr

      // 6. Actualizar preferred_instance_id del lead
      await db.from('lead').update({ preferred_instance_id: instanceId }).eq('id', p.lead_id)

      return { success: true, message: saved }
    }

    // ═══════════════════════════════════════════════════════════════
    // TASKS
    // ═══════════════════════════════════════════════════════════════
    case 'get_tasks': {
      let q = db.from('tasks')
        .select('id,titulo,descripcion,estado,prioridad,fecha_vencimiento,asignado_a,lead_id,created_at')
        .eq('empresa_id', eid).order('fecha_vencimiento', { ascending: true })
        .limit(Math.min(p.limit ?? 100, 500))
      if (p.lead_id)    q = q.eq('lead_id', p.lead_id)
      if (p.asignado_a) q = q.eq('asignado_a', p.asignado_a)
      if (p.estado)     q = q.eq('estado', p.estado)
      const { data, error } = await q
      if (error) throw error
      return { tasks: data, total: data.length }
    }

    case 'create_task': {
      const { data, error } = await db.from('tasks').insert({
        empresa_id: eid, lead_id: p.lead_id,
        titulo: p.titulo, descripcion: p.descripcion ?? null,
        fecha_vencimiento: p.fecha_vencimiento ?? null,
        asignado_a: p.asignado_a ?? null,
        prioridad: p.prioridad ?? 'medium', estado: 'pendiente',
      }).select().single()
      if (error) throw error
      return { success: true, task: data }
    }

    case 'complete_task': {
      const { error } = await db.from('tasks')
        .update({ estado: 'completada', completed_at: new Date().toISOString() })
        .eq('id', p.task_id).eq('empresa_id', eid)
      if (error) throw error
      return { success: true }
    }

    // ═══════════════════════════════════════════════════════════════
    // NOTES
    // ═══════════════════════════════════════════════════════════════
    case 'get_notes': {
      const { data, error } = await db.from('nota_lead')
        .select('id,contenido,created_at,usuario_id')
        .eq('lead_id', p.lead_id).eq('empresa_id', eid)
        .order('created_at', { ascending: false })
      if (error) throw error
      return { notes: data, total: data.length }
    }

    case 'add_note': {
      const { data, error } = await db.from('nota_lead').insert({
        empresa_id: eid, lead_id: p.lead_id, contenido: p.contenido, usuario_id: null,
      }).select().single()
      if (error) throw error
      return { success: true, note: data }
    }

    // ═══════════════════════════════════════════════════════════════
    // MEETINGS
    // ═══════════════════════════════════════════════════════════════
    case 'get_meetings': {
      let q = db.from('lead_reuniones')
        .select('id,titulo,fecha_hora,notas,lead_id,created_at,lead_reunion_participantes(usuario_id)')
        .eq('empresa_id', eid)
        .order('fecha_hora', { ascending: true })
        .limit(Math.min(p.limit ?? 50, 200))
      if (p.lead_id)    q = q.eq('lead_id', p.lead_id)
      if (p.date_from)  q = q.gte('fecha_hora', p.date_from)
      if (p.date_to)    q = q.lte('fecha_hora', p.date_to)
      const { data, error } = await q
      if (error) throw error
      return { meetings: data, total: data.length }
    }

    case 'create_meeting': {
      const { data, error } = await db.from('lead_reuniones').insert({
        empresa_id: eid,
        lead_id:   p.lead_id,
        titulo:    p.titulo,
        fecha_hora: p.fecha_hora,
        notas:     p.notas ?? null,
      }).select().single()
      if (error) throw error
      return { success: true, meeting: data }
    }

    // ═══════════════════════════════════════════════════════════════
    // NOTIFICATIONS
    // ═══════════════════════════════════════════════════════════════
    case 'get_notifications': {
      let q = db.from('notificaciones')
        .select('id,tipo,titulo,mensaje,leida,lead_id,created_at')
        .eq('empresa_id', eid)
        .order('created_at', { ascending: false })
        .limit(Math.min(p.limit ?? 50, 200))
      if (p.unread_only) q = q.eq('leida', false)
      if (p.user_id)     q = q.eq('usuario_id', p.user_id)
      const { data, error } = await q
      if (error) throw error
      return { notifications: data, total: data.length, unread: data.filter((n: any) => !n.leida).length }
    }

    case 'mark_notifications_read': {
      const ids: string[] = p.notification_ids ?? []
      if (ids.length === 0) throw new Error('notification_ids requerido')
      const { error } = await db.from('notificaciones')
        .update({ leida: true }).in('id', ids).eq('empresa_id', eid)
      if (error) throw error
      return { success: true, marked: ids.length }
    }

    // ═══════════════════════════════════════════════════════════════
    // ACTIVITY
    // ═══════════════════════════════════════════════════════════════
    case 'get_lead_activity': {
      const { data, error } = await db.from('actividad_crm')
        .select('id,tipo,descripcion,usuario_id,created_at')
        .eq('lead_id', p.lead_id).eq('empresa_id', eid)
        .order('created_at', { ascending: false })
        .limit(Math.min(p.limit ?? 50, 200))
      if (error) throw error
      return { activity: data, total: data.length }
    }

    // ═══════════════════════════════════════════════════════════════
    // REPORTS
    // ═══════════════════════════════════════════════════════════════
    case 'get_pipeline_report': {
      let q = db.from('lead')
        .select('id,prioridad,etapa_id,pipeline_id,created_at,presupuesto,archived,etapas(nombre,orden),pipeline(nombre)')
        .eq('empresa_id', eid)
      if (p.pipeline_id) q = q.eq('pipeline_id', p.pipeline_id)
      if (p.date_from)   q = q.gte('created_at', p.date_from)
      if (p.date_to)     q = q.lte('created_at', p.date_to)

      const { data, error } = await q
      if (error) throw error

      const byStage: Record<string, any> = {}
      let totalBudget = 0
      for (const l of data) {
        const k = l.etapa_id ?? '__none__'
        if (!byStage[k]) byStage[k] = { nombre: l.etapas?.nombre ?? 'Sin etapa', pipeline: l.pipeline?.nombre ?? '', count: 0, budget: 0 }
        byStage[k].count++
        byStage[k].budget += l.presupuesto ?? 0
        totalBudget += l.presupuesto ?? 0
      }
      return {
        total_leads: data.length,
        active_leads:   data.filter((l: any) => !l.archived).length,
        archived_leads: data.filter((l: any) =>  l.archived).length,
        total_budget: totalBudget, by_stage: Object.values(byStage),
        by_priority: {
          high:   data.filter((l: any) => l.prioridad === 'high').length,
          medium: data.filter((l: any) => l.prioridad === 'medium').length,
          low:    data.filter((l: any) => l.prioridad === 'low').length,
        },
      }
    }

    case 'get_activity_report': {
      let q = db.from('actividad_crm').select('tipo,usuario_id,created_at')
        .eq('empresa_id', eid).order('created_at', { ascending: false }).limit(1000)
      if (p.date_from) q = q.gte('created_at', p.date_from)
      if (p.date_to)   q = q.lte('created_at', p.date_to)
      if (p.user_id)   q = q.eq('usuario_id', p.user_id)

      const { data, error } = await q
      if (error) throw error

      const byType: Record<string,number> = {}
      const byUser: Record<string,number> = {}
      for (const a of data) {
        byType[a.tipo] = (byType[a.tipo] ?? 0) + 1
        if (a.usuario_id) byUser[a.usuario_id] = (byUser[a.usuario_id] ?? 0) + 1
      }
      return { total: data.length, by_type: byType, by_user: byUser }
    }

    case 'get_leads_report': {
      let q = db.from('lead').select('channel,prioridad,tags,presupuesto,archived,created_at').eq('empresa_id', eid)
      if (p.date_from) q = q.gte('created_at', p.date_from)
      if (p.date_to)   q = q.lte('created_at', p.date_to)

      const { data, error } = await q
      if (error) throw error

      const byChannel: Record<string,number> = {}
      const tagFreq: Record<string,number> = {}
      let totalBudget = 0
      for (const l of data) {
        const ch = l.channel ?? 'desconocido'
        byChannel[ch] = (byChannel[ch] ?? 0) + 1
        totalBudget += l.presupuesto ?? 0
        for (const t of l.tags ?? []) tagFreq[t] = (tagFreq[t] ?? 0) + 1
      }
      return {
        total_leads: data.length,
        active: data.filter((l: any) => !l.archived).length,
        archived: data.filter((l: any) => l.archived).length,
        total_budget: totalBudget, by_channel: byChannel,
        by_priority: {
          high:   data.filter((l: any) => l.prioridad === 'high').length,
          medium: data.filter((l: any) => l.prioridad === 'medium').length,
          low:    data.filter((l: any) => l.prioridad === 'low').length,
        },
        top_tags: Object.entries(tagFreq).sort((a,b) => b[1]-a[1]).slice(0,10).map(([tag,count]) => ({ tag, count })),
      }
    }

    case 'get_messages_report': {
      const dateFrom = p.date_from ?? new Date().toISOString().split('T')[0]
      const dateTo   = p.date_to   ?? new Date().toISOString()

      const { data, error } = await db.from('mensajes')
        .select('sender,channel,lead_id,created_at,read')
        .gte('created_at', dateFrom).lte('created_at', dateTo)
        .in('lead_id',
          db.from('lead').select('id').eq('empresa_id', eid)
        )
      if (error) throw error

      const clientMsgs  = data.filter((m: any) => m.sender === 'lead')
      const teamMsgs    = data.filter((m: any) => m.sender === 'team')
      const unread      = clientMsgs.filter((m: any) => !m.read)
      const byChannel: Record<string,number> = {}
      for (const m of clientMsgs) {
        const ch = m.channel ?? 'desconocido'
        byChannel[ch] = (byChannel[ch] ?? 0) + 1
      }

      return {
        period: { from: dateFrom, to: dateTo },
        clients_that_wrote: new Set(clientMsgs.map((m: any) => m.lead_id)).size,
        total_client_messages: clientMsgs.length,
        total_team_messages:   teamMsgs.length,
        unread_messages:       unread.length,
        by_channel:            byChannel,
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // GENERAL
    // ═══════════════════════════════════════════════════════════════
    case 'get_company_info': {
      const { data, error } = await db.from('empresa')
        .select('id,nombre_empresa,logo_url,created_at').eq('id', eid).single()
      if (error) throw error
      return data
    }

    case 'get_team_members': {
      const { data, error } = await db.from('empresa_miembros')
        .select('usuario_id,rol,created_at,usuarios(email,nombre_completo,avatar_url)')
        .eq('empresa_id', eid)
      if (error) throw error
      return { members: data, total: data.length }
    }

    default:
      throw new Error(`Acción desconocida: "${action}"`)
  }
}
