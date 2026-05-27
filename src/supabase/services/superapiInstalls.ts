/**
 * Servicio de SuperAPI OAuth installs.
 *
 * Responsabilidades:
 * - Leer la install activa de una empresa (sin exponer access_token).
 * - Invocar la edge function `superapi-oauth-exchange` para canjear el `code`.
 * - Marcar una install como revocada localmente (cuando el usuario revoca
 *   desde el panel de SuperAPI, o cuando recibimos 401 install_revoked).
 *
 * El `access_token` NUNCA se lee desde el cliente: solo el servidor (edge
 * functions con service role) lo necesita para hablar con SuperAPI.
 */

import { requireSupabase, supabase } from '../client'
import type { SuperAPIInstall, SuperAPIInstallDB } from '@/lib/types'

// ---------------------------------------------------------------------------
// Mappers DB → UI (filtran campos sensibles)
// ---------------------------------------------------------------------------

function mapInstall(row: SuperAPIInstallDB): SuperAPIInstall {
  return {
    id: row.id,
    empresaId: row.empresa_id,
    scopes: row.scopes ?? [],
    instanceIds: row.instance_ids ?? [],
    superapiUserEmail: row.superapi_user_email,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Devuelve la install activa de una empresa, o null si no hay.
 * RLS asegura que solo dueños/miembros de la empresa puedan leerla.
 *
 * `access_token` se excluye del SELECT — el cliente nunca lo necesita.
 */
export async function getActiveInstall(empresaId: string): Promise<SuperAPIInstall | null> {
  if (!empresaId) return null
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('superapi_installs')
    .select(
      'id, empresa_id, token_type, scopes, instance_ids, superapi_user_email, expires_at, revoked_at, last_used_at, created_at, updated_at',
    )
    .eq('empresa_id', empresaId)
    .is('revoked_at', null)
    .maybeSingle()

  if (error) {
    console.error('[superapiInstalls] error en getActiveInstall', error)
    throw error
  }
  if (!data) return null
  // Inyectar access_token vacío para satisfacer el tipo SuperAPIInstallDB
  return mapInstall({ ...(data as any), access_token: '' } as SuperAPIInstallDB)
}

/**
 * ¿Esta empresa ya tiene OAuth conectado? — boolean de conveniencia.
 */
export async function hasActiveInstall(empresaId: string): Promise<boolean> {
  const install = await getActiveInstall(empresaId)
  return !!install
}

/**
 * Marca una install como revocada localmente. NO llama a SuperAPI:
 * la revocación real la hace el usuario desde su panel, o se detecta
 * cuando una llamada API recibe 401 install_revoked.
 */
export async function markInstallRevokedLocal(installId: string): Promise<void> {
  const sb = requireSupabase()
  const { error } = await sb
    .from('superapi_installs')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', installId)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Edge function calls
// ---------------------------------------------------------------------------

export interface ExchangeCodeResult {
  ok: true
  install: SuperAPIInstall
}

export interface ExchangeCodeError {
  ok: false
  error: string
  message?: string
  step?: string
}

/**
 * Llama a la edge function `superapi-oauth-exchange` para canjear el `code`
 * recibido en el callback por un `access_token`. La edge function persiste
 * la install y devuelve metadata sin token.
 */
export async function exchangeCode(args: {
  code: string
  empresaId: string
  redirectUri: string
}): Promise<ExchangeCodeResult | ExchangeCodeError> {
  if (!supabase) {
    return { ok: false, error: 'supabase_not_configured' }
  }

  const { data, error } = await supabase.functions.invoke('superapi-oauth-exchange', {
    body: {
      code: args.code,
      empresa_id: args.empresaId,
      redirect_uri: args.redirectUri,
    },
  })

  if (error) {
    console.error('[superapiInstalls] error invocando exchange', error)
    return {
      ok: false,
      error: 'invoke_failed',
      message: error.message || 'Error invocando la función',
    }
  }

  if (!data || data.error) {
    return {
      ok: false,
      error: data?.error || 'unknown_error',
      message: data?.message,
      step: data?.step,
    }
  }

  // La edge function devuelve `install` ya con shape camelCase parcial — pero
  // por consistencia normalizamos a SuperAPIInstall completo.
  const raw = data.install || {}
  const install: SuperAPIInstall = {
    id: raw.id,
    empresaId: raw.empresa_id,
    scopes: raw.scopes ?? [],
    instanceIds: raw.instance_ids ?? [],
    superapiUserEmail: raw.superapi_user_email ?? null,
    expiresAt: raw.expires_at ?? null,
    revokedAt: raw.revoked_at ?? null,
    lastUsedAt: raw.last_used_at ?? null,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
  return { ok: true, install }
}
