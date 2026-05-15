import { supabase } from '../client'
import type { MetaConfigDB, MetaFollowUpTemplateDB } from '@/lib/types'

// ----- meta_configs -----

export async function listMetaConfigs(empresaId: string): Promise<MetaConfigDB[]> {
  if (!empresaId) return []
  const { data, error } = await supabase
    .from('meta_configs')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as MetaConfigDB[]
}

export async function createMetaConfig(
  payload: Omit<MetaConfigDB, 'id' | 'created_at' | 'updated_at'>
): Promise<MetaConfigDB> {
  const { data, error } = await supabase
    .from('meta_configs')
    .insert(payload as any)
    .select('*')
    .single()
  if (error) throw error
  return data as MetaConfigDB
}

export async function updateMetaConfig(
  id: string,
  updates: Partial<Omit<MetaConfigDB, 'id' | 'empresa_id'>>
): Promise<MetaConfigDB> {
  const { data, error } = await supabase
    .from('meta_configs')
    .update({ ...updates, updated_at: new Date().toISOString() } as any)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as MetaConfigDB
}

export async function deleteMetaConfig(id: string): Promise<boolean> {
  const { error } = await supabase.from('meta_configs').delete().eq('id', id)
  if (error) throw error
  return true
}

// ----- meta_follow_up_templates -----

export async function listFollowUpTemplates(
  empresaId: string,
  metaConfigId?: string
): Promise<MetaFollowUpTemplateDB[]> {
  if (!empresaId) return []
  let q = supabase
    .from('meta_follow_up_templates')
    .select('*')
    .eq('empresa_id', empresaId)
  if (metaConfigId) q = q.eq('meta_config_id', metaConfigId)
  const { data, error } = await q.order('display_label', { ascending: true })
  if (error) throw error
  return (data ?? []) as MetaFollowUpTemplateDB[]
}

export async function upsertFollowUpTemplate(
  payload: Omit<MetaFollowUpTemplateDB, 'id' | 'created_at' | 'updated_at'> & { id?: string }
): Promise<MetaFollowUpTemplateDB> {
  const { data, error } = await supabase
    .from('meta_follow_up_templates')
    .upsert(payload as any, {
      onConflict: 'meta_config_id,meta_template_name,meta_template_language',
    })
    .select('*')
    .single()
  if (error) throw error
  return data as MetaFollowUpTemplateDB
}

export async function updateFollowUpTemplate(
  id: string,
  updates: Partial<Omit<MetaFollowUpTemplateDB, 'id' | 'empresa_id' | 'meta_config_id'>>
): Promise<MetaFollowUpTemplateDB> {
  const { data, error } = await supabase
    .from('meta_follow_up_templates')
    .update({ ...updates, updated_at: new Date().toISOString() } as any)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as MetaFollowUpTemplateDB
}

export async function deleteFollowUpTemplate(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('meta_follow_up_templates')
    .delete()
    .eq('id', id)
  if (error) throw error
  return true
}

// ----- Meta Graph API helpers (frontend, usan el token de la config) -----

const GRAPH_VERSION = 'v21.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

/**
 * Invoca la edge function send-meta-template para enviar una plantilla
 * aprobada a un lead vía Meta Cloud API y persistir el mensaje en CRM.
 * Usa fetch directo para poder leer el body en respuestas 4xx/5xx.
 */
export async function sendMetaTemplate(params: {
  lead_id: string
  template_id: string
  to?: string
}): Promise<{ ok: boolean; wamid?: string | null; step?: string; error?: string }> {
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData?.session?.access_token
  if (!accessToken) return { ok: false, error: 'No hay sesión activa' }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, error: 'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY' }
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-meta-template`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        'x-supabase-authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(params),
    })
    const json: any = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) {
      const step = json?.step ? `[${json.step}] ` : ''
      const errMsg = json?.error || `HTTP ${res.status}`
      console.error('[sendMetaTemplate]', step, errMsg, json)
      return { ok: false, step: json?.step, error: `${step}${errMsg}` }
    }
    return { ok: true, wamid: json?.wamid ?? null }
  } catch (e: any) {
    console.error('[sendMetaTemplate] network error', e)
    return { ok: false, error: e?.message || 'Error de red' }
  }
}

export interface MetaTemplateRemote {
  name: string
  language: string
  category?: string
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | string
  bodyText: string | null
  hasVariables: boolean
}

/**
 * Llama directamente a Graph API desde el browser para validar credenciales.
 * Devuelve display_phone_number cuando todo OK.
 */
export async function testMetaConnection(params: {
  phone_number_id: string
  access_token: string
}): Promise<{ ok: true; display_phone: string } | { ok: false; error: string }> {
  try {
    const url = `${GRAPH_BASE}/${params.phone_number_id}?fields=display_phone_number,verified_name&access_token=${encodeURIComponent(params.access_token)}`
    const res = await fetch(url)
    const json: any = await res.json()
    if (!res.ok) {
      return { ok: false, error: json?.error?.message || `HTTP ${res.status}` }
    }
    return { ok: true, display_phone: json?.display_phone_number || '' }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Error de red' }
  }
}

/**
 * Trae las message templates aprobadas para una WABA.
 * Filtra status=APPROVED y extrae el body (solo bloques tipo BODY).
 */
export async function fetchApprovedTemplates(params: {
  waba_id: string
  access_token: string
}): Promise<MetaTemplateRemote[]> {
  const url = `${GRAPH_BASE}/${params.waba_id}/message_templates?limit=200&access_token=${encodeURIComponent(params.access_token)}`
  const res = await fetch(url)
  const json: any = await res.json()
  if (!res.ok) {
    throw new Error(json?.error?.message || `HTTP ${res.status}`)
  }
  const items: any[] = json?.data || []
  return items
    .filter((t) => (t?.status || '').toUpperCase() === 'APPROVED')
    .map((t) => {
      const bodyBlock = (t.components || []).find(
        (c: any) => String(c?.type || '').toUpperCase() === 'BODY'
      )
      const bodyText: string = bodyBlock?.text || ''
      const hasVariables = /\{\{\s*\d+\s*\}\}/.test(bodyText)
      return {
        name: t.name,
        language: t.language,
        category: t.category,
        status: t.status,
        bodyText: bodyText || null,
        hasVariables,
      } satisfies MetaTemplateRemote
    })
}
