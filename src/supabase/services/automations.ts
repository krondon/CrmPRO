import { supabase } from '../client'
import type {
    AutomationRule,
    CreateAutomationRuleDTO,
    AutomationLog,
    AutomationTriggerType
} from '@/lib/types'

/**
 * Obtiene todas las reglas de automatización de una empresa
 * Opcionalmente filtradas por pipeline
 */
export async function getAutomationRules(
    empresaId: string,
    pipelineId?: string
): Promise<AutomationRule[]> {
    let query = supabase
        .from('automation_rules')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: true })

    if (pipelineId) {
        query = query.eq('pipeline_id', pipelineId)
    }

    const { data, error } = await query
    if (error) throw error
    return data ?? []
}

/**
 * Obtiene las reglas activas para un trigger específico de una empresa
 * Usada por el motor de automatización
 */
export async function getActiveRulesForTrigger(
    empresaId: string,
    triggerType: AutomationTriggerType
): Promise<AutomationRule[]> {
    const { data, error } = await supabase
        .from('automation_rules')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('trigger_type', triggerType)
        .eq('enabled', true)

    if (error) throw error
    return data ?? []
}

/**
 * Crea una nueva regla de automatización
 */
export async function createAutomationRule(
    rule: CreateAutomationRuleDTO
): Promise<AutomationRule> {
    const { data, error } = await supabase
        .from('automation_rules')
        .insert(rule)
        .select()
        .single()

    if (error) throw error
    return data
}

/**
 * Actualiza una regla de automatización
 */
export async function updateAutomationRule(
    id: string,
    updates: Partial<CreateAutomationRuleDTO>
): Promise<AutomationRule> {
    const { data, error } = await supabase
        .from('automation_rules')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

    if (error) throw error
    return data
}

/**
 * Activa o desactiva una regla
 */
export async function toggleAutomationRule(
    id: string,
    enabled: boolean
): Promise<AutomationRule> {
    return updateAutomationRule(id, { enabled } as any)
}

/**
 * Elimina una regla de automatización
 */
export async function deleteAutomationRule(id: string): Promise<boolean> {
    const { error } = await supabase
        .from('automation_rules')
        .delete()
        .eq('id', id)

    if (error) throw error
    return true
}

/**
 * Obtiene el historial de ejecuciones de automatizaciones para un lead
 */
export async function getAutomationLogsForLead(leadId: string): Promise<AutomationLog[]> {
    const { data, error } = await supabase
        .from('automation_logs')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })

    if (error) throw error
    return data ?? []
}

/**
 * Obtiene el historial de ejecuciones de una empresa (para panel de admin)
 */
export async function getAutomationLogs(
    empresaId: string,
    limit = 100
): Promise<AutomationLog[]> {
    const { data, error } = await supabase
        .from('automation_logs')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })
        .limit(limit)

    if (error) throw error
    return data ?? []
}
