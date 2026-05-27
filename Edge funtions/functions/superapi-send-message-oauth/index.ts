// ============================================================================
// superapi-send-message-oauth
// ----------------------------------------------------------------------------
// Versión OAuth de send-message. Envía mensajes vía SuperAPI usando el
// `access_token` Bearer obtenido del flujo OAuth (sección 5 del documento).
//
// Endpoint llamado: POST {SUPERAPI_BASE_URL}/api/v1/oauth/instances/:id/messages
// Auth:             Authorization: Bearer <access_token>
//
// Convive con `send-message` clásico — no lo reemplaza. El frontend decide cuál
// llamar según si la empresa tiene un install OAuth activo o sólo instancias
// configuradas manualmente.
//
// Diferencias clave vs send-message:
// - Las credenciales vienen de `superapi_installs.access_token` (1 por empresa),
//   no de `empresa_instancias.api_token` (1 por instancia).
// - El `:id` de la URL es el `instance_id` SuperAPI, que asumimos igual al
//   `empresa_instancias.client_id` actual (decisión confirmada con Morna como
//   "pudiera funcionar como los mismos que ya manejas").
// - Maneja 429 con Retry-After y propaga la info al cliente.
// - Maneja 502 (Meta/IG/WA caído) — el cliente puede decidir reintentar.
// - Maneja 401 install_revoked → marca el install como revocado en BD.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPERAPI_BASE_URL =
  (Deno.env.get('SUPERAPI_BASE_URL') ?? 'https://v4.iasuperapi.com').replace(/\/+$/, '')

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, Authorization, x-supabase-authorization, X-Supabase-Authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, ...extraHeaders, 'Content-Type': 'application/json' },
  })
}

function extractBearer(raw: string | null): string | null {
  if (!raw) return null
  const v = raw.trim()
  if (!v) return null
  return /^bearer\s+/i.test(v) ? v.replace(/^bearer\s+/i, '').trim() || null : v
}

interface MediaPayload {
  downloadUrl: string
  fileName: string
  mimetype?: string
}

interface SendBody {
  lead_id: string
  companyId?: string
  content?: string
  channel?: string
  media?: MediaPayload
  instanceId?: string
  replyToMessageId?: string
  to?: string
  // Soporte para tipos avanzados del OAuth API
  type?: 'message' | 'action' | 'location'
  action?: string
  location?: { lat: number; lon: number; address?: string }
}

function isValidId(id: unknown): id is string {
  if (typeof id !== 'string') return false
  const c = id.trim().toLowerCase()
  return c !== '' && c !== 'null' && c !== 'undefined' && c !== 'none'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let step = 'inicio'
  try {
    // ------------------------------------------------------------------
    // 1. Auth del usuario que llama (CRM frontend)
    // ------------------------------------------------------------------
    step = 'auth'
    const accessToken =
      extractBearer(req.headers.get('Authorization') || req.headers.get('authorization')) ||
      extractBearer(
        req.headers.get('x-supabase-authorization') ||
          req.headers.get('X-Supabase-Authorization'),
      )
    if (!accessToken) return json({ error: 'unauthorized' }, 401)

    const db = createClient(SUPABASE_URL, SERVICE_ROLE)
    const { data: userData, error: userErr } = await db.auth.getUser(accessToken)
    if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401)

    // ------------------------------------------------------------------
    // 2. Parsear input
    // ------------------------------------------------------------------
    step = 'parse-body'
    const body = (await req.json()) as SendBody
    const {
      lead_id,
      companyId,
      content,
      channel,
      media,
      instanceId,
      replyToMessageId,
      to,
      type,
      action,
      location,
    } = body

    if (!lead_id) return json({ error: 'invalid_request', message: 'Falta lead_id' }, 400)

    // ------------------------------------------------------------------
    // 3. Buscar lead + empresa
    // ------------------------------------------------------------------
    step = 'buscar-lead'
    const { data: lead, error: leadErr } = await db
      .from('lead')
      .select('id, telefono, empresa_id, preferred_instance_id')
      .eq('id', lead_id)
      .single()

    if (leadErr || !lead) return json({ error: 'lead_not_found' }, 404)

    const empresaId = companyId || lead.empresa_id
    if (!empresaId) return json({ error: 'invalid_request', message: 'Falta empresa_id' }, 400)

    const targetChannel = (channel || 'whatsapp').toLowerCase()
    if (!lead.telefono && targetChannel === 'whatsapp' && !to) {
      return json({ error: 'invalid_request', message: 'Lead sin teléfono y sin `to`' }, 400)
    }

    // ------------------------------------------------------------------
    // 4. Resolver install OAuth activo de la empresa
    // ------------------------------------------------------------------
    step = 'resolver-install'
    const { data: install, error: installErr } = await db
      .from('superapi_installs')
      .select('id, access_token, scopes, instance_ids, revoked_at, expires_at')
      .eq('empresa_id', empresaId)
      .is('revoked_at', null)
      .maybeSingle()

    if (installErr) throw new Error(`Error leyendo install: ${installErr.message}`)
    if (!install) {
      return json(
        {
          error: 'no_oauth_install',
          message:
            'Esta empresa no tiene una conexión OAuth con SuperAPI. Usa el flujo manual (send-message) o autoriza desde Configuración.',
        },
        409,
      )
    }
    if (install.expires_at && new Date(install.expires_at).getTime() < Date.now()) {
      return json(
        { error: 'token_expired', message: 'El access_token expiró. Reautoriza la app.' },
        401,
      )
    }
    if (!Array.isArray(install.scopes) || !install.scopes.includes('messages.send')) {
      return json(
        {
          error: 'insufficient_scope',
          message: 'El install no tiene scope messages.send. Reautoriza solicitándolo.',
        },
        403,
      )
    }

    // ------------------------------------------------------------------
    // 5. Resolver instancia local (misma lógica que send-message)
    // ------------------------------------------------------------------
    step = 'resolver-instancia'
    let effectiveInstanceId: string | null = isValidId(instanceId) ? instanceId : null

    if (!effectiveInstanceId && replyToMessageId) {
      const { data: replyMsg } = await db
        .from('mensajes')
        .select('metadata')
        .eq('id', replyToMessageId)
        .maybeSingle()
      const m = (replyMsg?.metadata || {}) as any
      const v = m?.instanceId || m?.instance_id
      if (isValidId(v)) effectiveInstanceId = v
    }

    if (!effectiveInstanceId) {
      const { data: lastInbound } = await db
        .from('mensajes')
        .select('metadata')
        .eq('lead_id', lead_id)
        .eq('sender', 'lead')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const m = (lastInbound?.metadata || {}) as any
      const v = m?.instanceId || m?.instance_id
      if (isValidId(v)) effectiveInstanceId = v
    }

    if (!effectiveInstanceId && isValidId(lead.preferred_instance_id)) {
      effectiveInstanceId = lead.preferred_instance_id
    }

    if (!effectiveInstanceId && targetChannel === 'whatsapp') {
      const { data: waInstances } = await db
        .from('empresa_instancias')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('plataforma', 'whatsapp')
        .eq('active', true)
      if (waInstances && waInstances.length === 1) {
        effectiveInstanceId = waInstances[0].id
      }
    }

    if (!effectiveInstanceId) {
      return json(
        { error: 'instance_unresolved', message: 'No se pudo resolver la instancia a usar' },
        400,
      )
    }

    // ------------------------------------------------------------------
    // 6. Mapear instancia local → instance_id SuperAPI
    //    Asumimos que coinciden con empresa_instancias.client_id (confirmado
    //    con Morna como "pudiera funcionar como los mismos"). Si no coincide
    //    en el futuro, este es el único punto que hay que ajustar.
    // ------------------------------------------------------------------
    step = 'mapear-instancia-superapi'
    const { data: instanceRow, error: instanceErr } = await db
      .from('empresa_instancias')
      .select('id, empresa_id, plataforma, client_id, active')
      .eq('id', effectiveInstanceId)
      .maybeSingle()

    if (instanceErr) throw new Error(`Error leyendo instancia: ${instanceErr.message}`)
    if (!instanceRow || !instanceRow.active) {
      return json({ error: 'instance_inactive' }, 400)
    }
    if (instanceRow.empresa_id !== empresaId) {
      return json({ error: 'instance_empresa_mismatch' }, 403)
    }

    const superApiInstanceId = instanceRow.client_id
    if (!superApiInstanceId) {
      return json(
        {
          error: 'instance_missing_client_id',
          message: 'La instancia no tiene client_id (ID SuperAPI) configurado',
        },
        400,
      )
    }

    // Verificación defensiva: el instance_id debe estar autorizado en el install
    if (
      Array.isArray(install.instance_ids) &&
      install.instance_ids.length > 0 &&
      !install.instance_ids.includes(superApiInstanceId)
    ) {
      return json(
        {
          error: 'instance_not_authorized',
          message: 'Esta instancia no está en la lista autorizada del install OAuth',
        },
        403,
      )
    }

    // ------------------------------------------------------------------
    // 7. Construir chatId y payload del nuevo API OAuth
    // ------------------------------------------------------------------
    step = 'preparar-payload'
    let chatId = String(to && targetChannel === 'whatsapp' ? to : lead.telefono || '')
    if (targetChannel === 'whatsapp' || targetChannel === 'wws') {
      chatId = chatId.replace(/\D/g, '')
      if (chatId && !chatId.includes('@')) chatId = `${chatId}@c.us`
    }

    // Spec del POST /api/v1/oauth/instances/:id/messages (sección 5):
    //   chatId, body, media?, quotedMessageId?, type?, action?, location?
    const apiBody: Record<string, unknown> = {
      chatId,
      body: content ?? '',
    }
    if (media?.downloadUrl) {
      apiBody.media = { downloadUrl: media.downloadUrl, fileName: media.fileName || 'file' }
    }
    if (replyToMessageId) apiBody.quotedMessageId = replyToMessageId
    if (type && type !== 'message') apiBody.type = type
    if (type === 'action' && action) apiBody.action = action
    if (type === 'location' && location) apiBody.location = location

    // ------------------------------------------------------------------
    // 8. Llamar a SuperAPI con Bearer
    // ------------------------------------------------------------------
    step = 'llamar-superapi'
    const url = `${SUPERAPI_BASE_URL}/api/v1/oauth/instances/${encodeURIComponent(
      superApiInstanceId,
    )}/messages`

    const apiRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${install.access_token}`,
      },
      body: JSON.stringify(apiBody),
    })

    let apiJson: any = null
    try {
      apiJson = await apiRes.json()
    } catch {
      apiJson = null
    }

    // Actualizar last_used_at (fire-and-forget)
    db.from('superapi_installs')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', install.id)
      .then(() => {})
      .catch(() => {})

    // Manejo de errores documentados (sección 8 del doc)
    if (apiRes.status === 401) {
      const code = apiJson?.code || apiJson?.error
      if (code === 'install_revoked') {
        // Marcar el install como revocado para que el frontend pida re-autorizar
        await db
          .from('superapi_installs')
          .update({ revoked_at: new Date().toISOString() })
          .eq('id', install.id)
        return json({ error: 'install_revoked', message: 'El usuario revocó la app' }, 401)
      }
      return json(
        { error: code || 'unauthorized', message: apiJson?.message || 'Token rechazado' },
        401,
      )
    }

    if (apiRes.status === 403) {
      return json(
        {
          error: apiJson?.code || 'forbidden',
          message: apiJson?.message || 'Sin permiso para esta operación',
        },
        403,
      )
    }

    if (apiRes.status === 429) {
      const retryAfter = apiRes.headers.get('Retry-After') || '60'
      return json(
        {
          error: 'rate_limit_exceeded',
          retry_after_seconds: Number(retryAfter) || 60,
          message: 'SuperAPI: 60 req/min/install excedido',
        },
        429,
        { 'Retry-After': retryAfter },
      )
    }

    if (apiRes.status === 502) {
      // Plataforma destino (Meta/WA/IG) caída — el cliente puede reintentar luego
      return json(
        {
          error: 'channel_delivery_failed',
          message:
            apiJson?.message ||
            'No se pudo entregar al canal destino. Reintentar más tarde.',
          superapi_status: 502,
        },
        502,
      )
    }

    if (!apiRes.ok && apiRes.status !== 207) {
      return json(
        {
          error: apiJson?.code || 'superapi_error',
          message: apiJson?.message || `SuperAPI respondió ${apiRes.status}`,
          status: apiRes.status,
        },
        apiRes.status,
      )
    }

    // ------------------------------------------------------------------
    // 9. Guardar en `mensajes` (mismo formato que send-message clásico)
    // ------------------------------------------------------------------
    step = 'guardar-mensaje'
    const finalContent = media
      ? content
        ? `${content}\n${media.downloadUrl}`
        : media.downloadUrl
      : content ?? ''

    const metadata: Record<string, unknown> = {
      instanceId: effectiveInstanceId,
      superapi_instance_id: superApiInstanceId,
      platform: targetChannel,
      oauth: true,
      ...(media ? { type: 'media', data: { mediaUrl: media.downloadUrl, fileName: media.fileName } } : {}),
      ...(apiRes.status === 207 ? { partial: true, failures: apiJson?.failures ?? [] } : {}),
    }

    const { data: message, error: insertError } = await db
      .from('mensajes')
      .insert({
        lead_id,
        content: finalContent,
        sender: 'team',
        channel: targetChannel || 'whatsapp',
        read: true,
        metadata,
      })
      .select()
      .single()

    if (insertError) throw insertError

    return json({
      ok: true,
      message,
      superapi_status: apiRes.status,
      ...(apiRes.status === 207 ? { partial: true, failures: apiJson?.failures } : {}),
    })
  } catch (e: any) {
    console.error(`[superapi-send-message-oauth] fallo en paso "${step}":`, e?.message ?? e)
    return json({ error: 'internal_error', message: e?.message ?? 'Error', step }, 500)
  }
})
