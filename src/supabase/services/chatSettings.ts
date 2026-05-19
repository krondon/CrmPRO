import { supabase, requireSupabase } from '../client'

export async function getChatKeywords(empresaId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('chat_settings')
    .select('keywords')
    .eq('empresa_id', empresaId)
    .maybeSingle()
  if (error) throw error
  return (data?.keywords || []) as string[]
}

export async function upsertChatKeywords(empresaId: string, keywords: string[]): Promise<string[]> {
  const { data, error } = await supabase
    .from('chat_settings')
    .upsert({ empresa_id: empresaId, keywords, updated_at: new Date().toISOString() }, { onConflict: 'empresa_id' })
    .select('keywords')
    .maybeSingle()
  if (error) throw error
  return (data?.keywords || []) as string[]
}

/**
 * Lee si la feature "Pendiente de respuesta humana" está activa para la empresa.
 * Si la fila no existe todavía, devuelve false (feature opt-in).
 */
export async function getPendingResponseEnabled(empresaId: string): Promise<boolean> {
  const { data, error } = await requireSupabase()
    .from('chat_settings')
    .select('pending_response_enabled')
    .eq('empresa_id', empresaId)
    .maybeSingle()
  if (error) throw error
  return !!(data?.pending_response_enabled)
}

export async function setPendingResponseEnabled(empresaId: string, enabled: boolean): Promise<boolean> {
  const { data, error } = await requireSupabase()
    .from('chat_settings')
    .upsert(
      { empresa_id: empresaId, pending_response_enabled: enabled, updated_at: new Date().toISOString() },
      { onConflict: 'empresa_id' }
    )
    .select('pending_response_enabled')
    .maybeSingle()
  if (error) throw error
  return !!(data?.pending_response_enabled)
}
