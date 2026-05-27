/**
 * SuperAPI OAuth 2.0 — helpers de cliente.
 *
 * Funcionalidad:
 * - Feature flag (env var VITE_SUPERAPI_OAUTH_ENABLED)
 * - Construcción de la URL del consent screen (paso 1 del doc)
 * - Manejo del token CSRF (state) en localStorage
 * - Parseo del callback (?code= ?state= ?error=)
 *
 * NO contiene credenciales sensibles. El `client_secret` y `signing_secret`
 * viven solo en Supabase Edge Functions (server-side).
 *
 * Ver: documento "SuperAPI · OAuth Integration Guide", sección 4.
 */

import type { SuperApiScope } from '@/lib/types'

// ---------------------------------------------------------------------------
// Configuración leída de variables de entorno (Vite)
// ---------------------------------------------------------------------------

interface SuperAPIOAuthConfig {
  enabled: boolean
  authorizeUrl: string
  clientId: string
  redirectUri: string
}

function readBool(value: string | undefined): boolean {
  if (!value) return false
  const v = value.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

export function getSuperAPIOAuthConfig(): SuperAPIOAuthConfig {
  const env = import.meta.env
  const authorizeUrl = (env.VITE_SUPERAPI_OAUTH_AUTHORIZE_URL as string | undefined) ?? ''
  const clientId = (env.VITE_SUPERAPI_OAUTH_CLIENT_ID as string | undefined) ?? ''
  // Si no hay redirect_uri configurado, usar el origen actual + /superapi/callback
  const redirectUri =
    (env.VITE_SUPERAPI_OAUTH_REDIRECT_URI as string | undefined) ||
    (typeof window !== 'undefined' ? `${window.location.origin}/superapi/callback` : '')

  const enabledFlag = readBool(env.VITE_SUPERAPI_OAUTH_ENABLED as string | undefined)

  // Sólo está realmente habilitado si la feature flag está prendida Y hay client_id
  const enabled = enabledFlag && !!clientId && !!authorizeUrl

  return { enabled, authorizeUrl, clientId, redirectUri }
}

export function isSuperAPIOAuthEnabled(): boolean {
  return getSuperAPIOAuthConfig().enabled
}

// ---------------------------------------------------------------------------
// State CSRF — anti-CSRF token guardado en localStorage hasta que vuelva
// ---------------------------------------------------------------------------

const STATE_STORAGE_KEY = 'superapi_oauth_state'

interface StoredState {
  state: string
  empresaId: string
  createdAt: number
  // Cualquier extra que queramos rescatar tras el callback (ej. ruta de retorno)
  returnTo?: string
}

/** Genera un token aleatorio criptográficamente seguro. */
function generateState(): string {
  // crypto.randomUUID está disponible en navegadores modernos y en HTTPS
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '')
  }
  // Fallback (poco probable que se use)
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2) +
    Date.now().toString(36)
  )
}

function saveState(payload: StoredState): void {
  try {
    localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(payload))
  } catch (e) {
    console.warn('[superapi-oauth] no se pudo guardar state', e)
  }
}

function readStoredState(): StoredState | null {
  try {
    const raw = localStorage.getItem(STATE_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as StoredState
  } catch {
    return null
  }
}

function clearStoredState(): void {
  try {
    localStorage.removeItem(STATE_STORAGE_KEY)
  } catch {
    /* noop */
  }
}

/**
 * Valida el state recibido en el callback contra el que guardamos antes del redirect.
 * Devuelve el payload almacenado si coincide, o `null` si no — en cuyo caso
 * el callback DEBE rechazarse por riesgo de CSRF.
 *
 * Limpia el state de localStorage tras leerlo (un solo uso).
 * Acepta state con hasta 30 minutos de antigüedad — más viejo = expirado.
 */
export function consumeState(receivedState: string | null): StoredState | null {
  if (!receivedState) return null
  const stored = readStoredState()
  if (!stored) return null

  const expired = Date.now() - stored.createdAt > 30 * 60 * 1000
  const match = stored.state === receivedState

  // Siempre limpiar — single use
  clearStoredState()

  if (!match || expired) return null
  return stored
}

// ---------------------------------------------------------------------------
// Construcción de la URL del consent screen (Paso 1 del doc)
// ---------------------------------------------------------------------------

export interface BuildAuthorizeUrlOptions {
  empresaId: string
  email: string                          // requerido por SuperAPI; si no existe, crea cuenta
  scopes?: SuperApiScope[]               // si vacío, SuperAPI asume todos los allowedScopes
  ttl?: string                           // ej. '7d', '30d', '90d'; vacío = nunca vence
  returnTo?: string                      // a dónde volver tras el callback
}

export interface AuthorizeUrlResult {
  url: string
  state: string
}

/**
 * Construye la URL completa de `/oauth/authorize` y guarda el state CSRF
 * en localStorage. Retorna `{ url, state }`.
 *
 * Lanza si el OAuth no está habilitado o falta configuración.
 */
export function buildAuthorizeUrl(opts: BuildAuthorizeUrlOptions): AuthorizeUrlResult {
  const cfg = getSuperAPIOAuthConfig()
  if (!cfg.enabled) {
    throw new Error(
      'SuperAPI OAuth no está habilitado. Revisa VITE_SUPERAPI_OAUTH_ENABLED y VITE_SUPERAPI_OAUTH_CLIENT_ID.',
    )
  }
  if (!opts.empresaId) throw new Error('empresaId requerido')
  if (!opts.email) throw new Error('email requerido')

  const state = generateState()
  saveState({
    state,
    empresaId: opts.empresaId,
    createdAt: Date.now(),
    returnTo: opts.returnTo,
  })

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    state,
    email: opts.email,
  })

  if (opts.scopes && opts.scopes.length > 0) {
    // SuperAPI espera scopes separados por espacios
    params.set('scope', opts.scopes.join(' '))
  }
  if (opts.ttl) params.set('ttl', opts.ttl)

  return { url: `${cfg.authorizeUrl}?${params.toString()}`, state }
}

// ---------------------------------------------------------------------------
// Parseo del callback (?code= ?state= o ?error=)
// ---------------------------------------------------------------------------

export interface CallbackParams {
  code: string | null
  state: string | null
  error: string | null
  errorDescription: string | null
}

export function parseCallbackParams(search: string | URLSearchParams): CallbackParams {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search
  return {
    code: params.get('code'),
    state: params.get('state'),
    error: params.get('error'),
    errorDescription: params.get('error_description'),
  }
}

/**
 * Mapa de mensajes para los códigos de error que devuelve `/oauth/authorize`
 * (sección 8 del documento).
 */
export const OAUTH_AUTHORIZE_ERROR_MESSAGES: Record<string, string> = {
  invalid_client: 'La configuración de la app es incorrecta (client_id desconocido).',
  app_disabled: 'La integración con SuperAPI está deshabilitada. Contacta soporte.',
  origin_mismatch: 'El origen del CRM no coincide con el autorizado en SuperAPI.',
  invalid_redirect_uri: 'La URL de redirección no está autorizada en SuperAPI.',
  invalid_scope: 'Se pidió un permiso no autorizado para esta app.',
  invalid_email: 'El email no es válido.',
  user_create_failed: 'No se pudo crear la cuenta en SuperAPI.',
  access_denied: 'Cancelaste la autorización.',
}
