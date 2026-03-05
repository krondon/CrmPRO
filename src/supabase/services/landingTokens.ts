import { supabase } from '../client'
import type { LandingTokenDB } from '@/lib/types'

/* ------------------------------------------------------------------ */
/*  CRUD Landing Tokens                                                */
/* ------------------------------------------------------------------ */

export async function listLandingTokens(empresaId: string): Promise<LandingTokenDB[]> {
  if (!empresaId) return []
  const { data, error } = await supabase
    .from('landing_tokens')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function createLandingToken(
  payload: Pick<LandingTokenDB, 'empresa_id' | 'pipeline_id' | 'etapa_id' | 'nombre'> &
    Partial<Pick<LandingTokenDB, 'prioridad_default' | 'asignado_a' | 'empresa_label' | 'metadata'>>
): Promise<LandingTokenDB> {
  // Generar token en el cliente (prefijo lt_ + 24 chars hex)
  const tokenBytes = new Uint8Array(12)
  crypto.getRandomValues(tokenBytes)
  const hex = Array.from(tokenBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  const token = `lt_${hex}`

  const { data, error } = await supabase
    .from('landing_tokens')
    .insert({
      ...payload,
      token,
      active: true,
      prioridad_default: payload.prioridad_default ?? 'medium',
      asignado_a: payload.asignado_a ?? '00000000-0000-0000-0000-000000000000',
      empresa_label: payload.empresa_label ?? 'Landing',
    } as any)
    .select('*')
    .single()

  if (error) throw error
  return data as LandingTokenDB
}

export async function updateLandingToken(
  id: string,
  updates: Partial<Omit<LandingTokenDB, 'id' | 'empresa_id' | 'token' | 'created_at'>>
): Promise<LandingTokenDB> {
  const { data, error } = await supabase
    .from('landing_tokens')
    .update({ ...updates, updated_at: new Date().toISOString() } as any)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data as LandingTokenDB
}

export async function deleteLandingToken(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('landing_tokens')
    .delete()
    .eq('id', id)

  if (error) throw error
  return true
}

export async function toggleLandingToken(id: string, active: boolean): Promise<LandingTokenDB> {
  return updateLandingToken(id, { active })
}
