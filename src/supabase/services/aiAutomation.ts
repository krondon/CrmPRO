import { supabase } from '../client'
import type { AiAutomationConfig, CreateAiAutomationConfigDTO } from '@/lib/types'

export async function getAiAutomationConfigs(empresaId: string): Promise<AiAutomationConfig[]> {
  const { data, error } = await supabase
    .from('ai_automation_config')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createAiAutomationConfig(
  dto: CreateAiAutomationConfigDTO
): Promise<AiAutomationConfig> {
  const { data, error } = await supabase
    .from('ai_automation_config')
    .insert(dto)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateAiAutomationConfig(
  id: string,
  dto: Partial<CreateAiAutomationConfigDTO>
): Promise<AiAutomationConfig> {
  const { data, error } = await supabase
    .from('ai_automation_config')
    .update({ ...dto, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteAiAutomationConfig(id: string): Promise<void> {
  const { error } = await supabase
    .from('ai_automation_config')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function toggleAiAutomationConfig(
  id: string,
  isActive: boolean
): Promise<void> {
  const { error } = await supabase
    .from('ai_automation_config')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
