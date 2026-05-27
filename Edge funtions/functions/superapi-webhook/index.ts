// ============================================================================
// superapi-webhook
// ----------------------------------------------------------------------------
// Endpoint que recibe webhooks de SuperAPI (sección 6 del documento OAuth).
//
// Se configura UNA SOLA URL en el panel SuperAPI (OAuthApp.callbackUrl):
//   https://<proyecto>.supabase.co/functions/v1/superapi-webhook
//
// Cada install autorizado con scope `messages.receive` enviará aquí:
//   - event: 'message'           → llegó un mensaje del cliente final
//   - event: 'ai_response'       → la IA / operador respondió
//   - event: 'delivery_failed'   → falló entrega de un mensaje saliente
//
// Headers que envía SuperAPI:
//   x-signature-256: sha256=<HMAC-SHA256(signing_secret, rawBody)>
//   x-superapi-install: <install_id>
//   x-superapi-event: message | ai_response | delivery_failed
//
// Reglas críticas (de la documentación):
// 1. Verificar HMAC sobre el BODY CRUDO (raw bytes), no sobre JSON re-serializado.
// 2. Responder 200 OK rápido (<5s). Procesamiento pesado debe ser async.
// 3. Ser idempotente — `data.id` es la clave de deduplicación.
// 4. Si respondemos 4xx (no 408/429), SuperAPI NO reintenta y descarta el evento.
// 5. Si respondemos no-2xx (o timeout), SuperAPI reintenta a 1s, 5s, 30s.
//
// El procesamiento real del evento (crear mensaje en el CRM, lead, etc.) está
// como STUB intencional — se cableará después de la primera prueba real contra
// SuperAPI, cuando podamos verificar el shape exacto del payload y el mapeo
// de instance_id ↔ empresa_instancias. Por ahora solo verificamos, deduplicamos
// y persistimos en `webhooks_entrantes` para auditoría.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SIGNING_SECRET = Deno.env.get('SUPERAPI_OAUTH_SIGNING_SECRET') ?? ''

// Webhooks no necesitan CORS (vienen server-to-server), pero responder a OPTIONS
// por si Supabase o algún proxy lo agrega.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-signature-256, x-superapi-install, x-superapi-event',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// ---------------------------------------------------------------------------
// HMAC-SHA256 helpers (Web Crypto API — disponible en Deno sin dependencias)
// ---------------------------------------------------------------------------

async function computeHmacSha256Hex(secret: string, body: ArrayBuffer): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, body))
  let hex = ''
  for (let i = 0; i < sigBytes.length; i++) {
    hex += sigBytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

/** Comparación constante en tiempo para evitar timing attacks sobre la firma. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

// ---------------------------------------------------------------------------
// Tipos del payload (sección 6 del documento)
// ---------------------------------------------------------------------------

type SuperApiEventType = 'message' | 'ai_response' | 'delivery_failed'

interface SuperApiWebhookBody {
  event: SuperApiEventType
  platform?: string             // instagram | whatsapp | facebook
  instanceId?: string           // ID SuperAPI de la instancia
  data: {
    id: string                  // clave de deduplicación
    from?: string
    to?: string
    body?: string
    type?: string
    timestamp?: number
    sender?: { platform?: string; id?: string; client?: string }
    [k: string]: unknown
  }
  [k: string]: unknown
}

// ============================================================================
// Handler principal
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // Si el servidor no está configurado todavía (Morna aún no entregó el secret),
  // devolvemos 503 para que SuperAPI reintente — no perdemos eventos.
  if (!SIGNING_SECRET) {
    console.error('[superapi-webhook] SUPERAPI_OAUTH_SIGNING_SECRET no configurado')
    return json({ error: 'webhook_not_configured' }, 503)
  }
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error('[superapi-webhook] faltan vars de Supabase')
    return json({ error: 'server_misconfigured' }, 503)
  }

  // -------------------------------------------------------------------------
  // 1. Leer body crudo (¡no parsear JSON antes de verificar firma!)
  // -------------------------------------------------------------------------
  const rawBody = await req.arrayBuffer()

  // -------------------------------------------------------------------------
  // 2. Verificar HMAC SHA-256
  // -------------------------------------------------------------------------
  const sigHeader = (req.headers.get('x-signature-256') || '').trim()
  if (!sigHeader.startsWith('sha256=')) {
    return json({ error: 'missing_signature' }, 401)
  }

  let signatureValid = false
  try {
    const expectedHex = await computeHmacSha256Hex(SIGNING_SECRET, rawBody)
    const expected = `sha256=${expectedHex}`
    signatureValid = timingSafeEqual(sigHeader, expected)
  } catch (e) {
    console.error('[superapi-webhook] error computando HMAC:', e)
  }

  // -------------------------------------------------------------------------
  // 3. Parsear JSON (después de verificar firma)
  // -------------------------------------------------------------------------
  let payload: SuperApiWebhookBody | null = null
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody)) as SuperApiWebhookBody
  } catch {
    console.error('[superapi-webhook] body no es JSON válido')
  }

  const eventType = (req.headers.get('x-superapi-event') || payload?.event || 'unknown') as
    | SuperApiEventType
    | 'unknown'
  const headerInstallId = req.headers.get('x-superapi-install') || null
  const instanceId = payload?.instanceId ?? null
  const dedupeKey = payload?.data?.id ?? null

  const db = createClient(SUPABASE_URL, SERVICE_ROLE)

  // -------------------------------------------------------------------------
  // 4. Si la firma NO valida — logear y rechazar con 401
  //    (4xx permanente para que SuperAPI NO reintente — es señal de mala config)
  // -------------------------------------------------------------------------
  if (!signatureValid) {
    console.warn('[superapi-webhook] firma inválida', { eventType, instanceId, headerInstallId })
    // Aún así dejamos rastro en webhooks_entrantes para forense
    await db.from('webhooks_entrantes').insert({
      provider: 'superapi',
      event: typeof eventType === 'string' ? eventType : 'unknown',
      payload: payload as any,
      signature_valid: false,
      dedupe_key: dedupeKey,
    } as any).then(() => {}).catch(() => {})
    return json({ error: 'invalid_signature' }, 401)
  }

  if (!payload || !payload.data || !dedupeKey) {
    return json({ error: 'invalid_payload' }, 400)
  }

  // -------------------------------------------------------------------------
  // 5. Resolver install y empresa vía instance_id (mapping defensivo)
  // -------------------------------------------------------------------------
  let installRow: { id: string; empresa_id: string } | null = null
  if (instanceId) {
    const { data: byInstance } = await db
      .from('superapi_installs')
      .select('id, empresa_id')
      .contains('instance_ids', [instanceId])
      .is('revoked_at', null)
      .maybeSingle()
    if (byInstance) installRow = byInstance as any
  }

  // -------------------------------------------------------------------------
  // 6. Dedupe — si ya procesamos este data.id, responder 200 idempotente
  // -------------------------------------------------------------------------
  const { data: existing } = await db
    .from('webhooks_entrantes')
    .select('id')
    .eq('provider', 'superapi')
    .eq('dedupe_key', dedupeKey)
    .maybeSingle()

  if (existing) {
    console.log('[superapi-webhook] evento duplicado, ignorado', { dedupeKey })
    return json({ ok: true, duplicate: true })
  }

  // -------------------------------------------------------------------------
  // 7. Persistir en webhooks_entrantes (auditoría)
  // -------------------------------------------------------------------------
  const { error: insertErr } = await db.from('webhooks_entrantes').insert({
    empresa_id: installRow?.empresa_id ?? null,
    provider: 'superapi',
    event: eventType,
    payload: payload as any,
    signature_valid: true,
    dedupe_key: dedupeKey,
  } as any)

  if (insertErr) {
    console.error('[superapi-webhook] error insertando en webhooks_entrantes', insertErr)
    // 5xx → SuperAPI reintenta. Mejor que perder el evento.
    return json({ error: 'persist_failed', message: insertErr.message }, 500)
  }

  // Actualizar last_used_at del install si lo identificamos
  if (installRow) {
    await db
      .from('superapi_installs')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', installRow.id)
      .then(() => {})
      .catch(() => {})
  }

  // -------------------------------------------------------------------------
  // 8. Procesamiento específico del evento — STUB intencional
  //    ----------------------------------------------------------------------
  //    TODO (Fase 2 — cuando SuperAPI esté en producción y podamos probar):
  //
  //    - event: 'message'
  //        → Mapear instanceId a empresa_instancias.client_id (asumido igual)
  //        → Si auto_create_lead=true, crear lead nuevo en `lead` con telefono
  //          = data.from / data.sender.id según plataforma
  //        → Insertar row en `mensajes` con sender='lead', metadata.instanceId
  //          para que send-message resuelva la instancia correcta en respuestas
  //
  //    - event: 'ai_response'
  //        → Insertar mensaje saliente en `mensajes` con sender='assistant'
  //        → Marcar lead como respondido (limpiar bandera pendiente)
  //
  //    - event: 'delivery_failed'
  //        → Marcar el mensaje saliente original como fallido
  //        → Notificar al asesor si está configurado
  //
  //    No se implementa aquí porque sin SuperAPI real no podemos verificar
  //    el shape exacto del payload ni los IDs, y meter lógica sin probar
  //    puede ensuciar tablas reales cuando se prenda el feature flag.
  // -------------------------------------------------------------------------
  console.log('[superapi-webhook] evento recibido y persistido', {
    eventType,
    instanceId,
    empresa_id: installRow?.empresa_id,
    install_id: installRow?.id,
    dedupeKey,
  })

  return json({ ok: true })
})
