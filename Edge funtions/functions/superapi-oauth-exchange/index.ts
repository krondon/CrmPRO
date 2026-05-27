// ============================================================================
// superapi-oauth-exchange
// ----------------------------------------------------------------------------
// Intercambia el `code` recibido en el callback OAuth de SuperAPI por un
// `access_token` y persiste la install en la tabla `superapi_installs`.
//
// Flujo (paso 4 del documento "SuperAPI · OAuth Integration Guide"):
//   1. Frontend recibe ?code=...&state=... en /superapi/callback
//   2. Frontend ya validó state contra el que guardó en localStorage (CSRF)
//   3. Frontend POSTea aquí: { code, empresa_id, redirect_uri }
//   4. Esta función llama POST {SUPERAPI_OAUTH_TOKEN_URL} con client_secret
//   5. Recibe access_token + scopes[] + instances[]
//   6. Upsert en superapi_installs (una por empresa, re-autoriza = update)
//   7. Devuelve metadata SIN el access_token al frontend
//
// Seguridad:
// - client_secret nunca sale del backend.
// - access_token nunca se devuelve al cliente; queda solo en la BD bajo RLS.
// - Verifica que el usuario autenticado sea owner o miembro de la empresa
//   antes de escribir nada.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const SUPERAPI_OAUTH_TOKEN_URL =
  Deno.env.get('SUPERAPI_OAUTH_TOKEN_URL') ?? 'https://v4.iasuperapi.com/oauth/token'
const SUPERAPI_OAUTH_CLIENT_ID = Deno.env.get('SUPERAPI_OAUTH_CLIENT_ID') ?? ''
const SUPERAPI_OAUTH_CLIENT_SECRET = Deno.env.get('SUPERAPI_OAUTH_CLIENT_SECRET') ?? ''

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, Authorization, x-supabase-authorization, X-Supabase-Authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function extractBearer(raw: string | null): string | null {
  if (!raw) return null
  const v = raw.trim()
  if (!v) return null
  return /^bearer\s+/i.test(v) ? v.replace(/^bearer\s+/i, '').trim() || null : v
}

interface ExchangeRequest {
  code?: string
  empresa_id?: string
  redirect_uri?: string
  scope?: string // opcional, solo para logging
}

interface SuperApiTokenResponse {
  payload?: {
    access_token?: string
    token_type?: string
    expires_in?: number
    scope?: string
    instances?: string[]
  }
  error?: string
  message?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let step = 'inicio'
  try {
    // ------------------------------------------------------------------
    // 0. Validar configuración del servidor
    // ------------------------------------------------------------------
    step = 'validar-config'
    if (!SUPERAPI_OAUTH_CLIENT_ID || !SUPERAPI_OAUTH_CLIENT_SECRET) {
      console.error('[superapi-oauth-exchange] faltan SUPERAPI_OAUTH_CLIENT_ID/SECRET')
      return json(
        {
          error: 'oauth_not_configured',
          message: 'SuperAPI OAuth aún no está configurado en este servidor.',
        },
        503,
      )
    }
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      throw new Error('Faltan variables de entorno SUPABASE_URL / SERVICE_ROLE')
    }

    // ------------------------------------------------------------------
    // 1. Verificar usuario autenticado
    // ------------------------------------------------------------------
    step = 'auth-usuario'
    const accessToken =
      extractBearer(req.headers.get('Authorization') || req.headers.get('authorization')) ||
      extractBearer(
        req.headers.get('x-supabase-authorization') ||
          req.headers.get('X-Supabase-Authorization'),
      )
    if (!accessToken) return json({ error: 'unauthorized', message: 'Falta token' }, 401)

    const db = createClient(SUPABASE_URL, SERVICE_ROLE)
    const { data: userData, error: userErr } = await db.auth.getUser(accessToken)
    if (userErr || !userData?.user) {
      return json({ error: 'unauthorized', message: 'Usuario no válido' }, 401)
    }
    const userId = userData.user.id
    const userEmail = userData.user.email ?? null

    // ------------------------------------------------------------------
    // 2. Parsear body
    // ------------------------------------------------------------------
    step = 'parsear-body'
    const body = (await req.json()) as ExchangeRequest
    const { code, empresa_id, redirect_uri } = body
    if (!code) return json({ error: 'invalid_request', message: 'Falta code' }, 400)
    if (!empresa_id) return json({ error: 'invalid_request', message: 'Falta empresa_id' }, 400)
    if (!redirect_uri) {
      return json({ error: 'invalid_request', message: 'Falta redirect_uri' }, 400)
    }

    // ------------------------------------------------------------------
    // 3. Verificar que el usuario pertenezca a la empresa
    // ------------------------------------------------------------------
    step = 'verificar-empresa'
    const { data: empresaRow, error: empresaErr } = await db
      .from('empresa')
      .select('id, usuario_id')
      .eq('id', empresa_id)
      .maybeSingle()
    if (empresaErr) throw new Error(`Error leyendo empresa: ${empresaErr.message}`)
    if (!empresaRow) return json({ error: 'empresa_not_found' }, 404)

    let belongs = empresaRow.usuario_id === userId
    if (!belongs) {
      const { data: miembro } = await db
        .from('empresa_miembros')
        .select('id')
        .eq('empresa_id', empresa_id)
        .eq('usuario_id', userId)
        .maybeSingle()
      belongs = !!miembro
    }
    if (!belongs) {
      return json(
        { error: 'forbidden', message: 'No perteneces a esta empresa' },
        403,
      )
    }

    // ------------------------------------------------------------------
    // 4. Intercambiar code → access_token contra SuperAPI
    // ------------------------------------------------------------------
    step = 'intercambio-superapi'
    const tokenRes = await fetch(SUPERAPI_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri,
        client_id: SUPERAPI_OAUTH_CLIENT_ID,
        client_secret: SUPERAPI_OAUTH_CLIENT_SECRET,
      }),
    })

    let tokenJson: SuperApiTokenResponse
    try {
      tokenJson = (await tokenRes.json()) as SuperApiTokenResponse
    } catch {
      const text = await tokenRes.text().catch(() => '')
      console.error('[superapi-oauth-exchange] respuesta no-JSON', tokenRes.status, text)
      return json(
        { error: 'superapi_bad_response', status: tokenRes.status, body: text.slice(0, 500) },
        502,
      )
    }

    if (!tokenRes.ok) {
      // Mapeo de errores documentados: invalid_client (401), invalid_grant (400)
      console.error('[superapi-oauth-exchange] error en /oauth/token', tokenRes.status, tokenJson)
      return json(
        {
          error: tokenJson?.error || 'superapi_token_error',
          message: tokenJson?.message || `SuperAPI respondió ${tokenRes.status}`,
        },
        tokenRes.status === 401 ? 401 : 400,
      )
    }

    const payload = tokenJson.payload
    if (!payload?.access_token) {
      return json(
        { error: 'superapi_missing_access_token', message: 'SuperAPI no devolvió access_token' },
        502,
      )
    }

    // ------------------------------------------------------------------
    // 5. Upsert en superapi_installs (una por empresa)
    // ------------------------------------------------------------------
    step = 'persistir-install'
    const scopes = (payload.scope ?? '').split(/\s+/).filter(Boolean)
    const instanceIds = Array.isArray(payload.instances) ? payload.instances : []
    const expiresAt =
      typeof payload.expires_in === 'number' && payload.expires_in > 0
        ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
        : null

    const { data: install, error: upsertErr } = await db
      .from('superapi_installs')
      .upsert(
        {
          empresa_id,
          access_token: payload.access_token,
          token_type: payload.token_type || 'Bearer',
          scopes,
          instance_ids: instanceIds,
          superapi_user_email: userEmail,
          expires_at: expiresAt,
          revoked_at: null,
          last_used_at: null,
        },
        { onConflict: 'empresa_id' },
      )
      .select('id, empresa_id, scopes, instance_ids, expires_at, created_at, updated_at')
      .single()

    if (upsertErr) throw new Error(`Error guardando install: ${upsertErr.message}`)

    // ------------------------------------------------------------------
    // 6. Respuesta — nunca devolver el access_token al cliente
    // ------------------------------------------------------------------
    return json({
      ok: true,
      install: {
        id: install.id,
        empresa_id: install.empresa_id,
        scopes: install.scopes,
        instance_ids: install.instance_ids,
        expires_at: install.expires_at,
        created_at: install.created_at,
        updated_at: install.updated_at,
      },
    })
  } catch (e: any) {
    console.error(`[superapi-oauth-exchange] fallo en paso "${step}":`, e?.message ?? e)
    return json(
      {
        error: 'internal_error',
        message: e?.message ?? 'Error desconocido',
        step,
      },
      500,
    )
  }
})
