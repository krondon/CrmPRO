import { supabase } from '../client'
import type { LeadDB, AutomationRule, AutomationTriggerType } from '@/lib/types'
import { getActiveRulesForTrigger } from '../services/automations'
import { updateLead } from '../services/leads'
import { createHistoryEntry } from '../services/history'

export interface AutomationContext {
    tagName?: string      // for 'tag_added' trigger
    fromStageId?: string  // for 'stage_change' trigger (the stage the lead just LEFT)
}

/**
 * Core automation engine.
 * Evaluates all active rules for a given trigger and applies them if conditions match.
 *
 * @param trigger   - The event that occurred
 * @param lead      - The lead object at the time of the event
 * @param context   - Additional context for the trigger
 */
export async function evaluateAndApplyRules(
    trigger: AutomationTriggerType,
    lead: LeadDB,
    context: AutomationContext = {}
): Promise<void> {
    if (!lead.empresa_id) return

    try {
        // 1. Fetch all active rules for this trigger and empresa
        const rules = await getActiveRulesForTrigger(lead.empresa_id, trigger)
        if (!rules || rules.length === 0) return

        console.log(`[AutomationEngine] Evaluating ${rules.length} rule(s) for trigger "${trigger}" on lead ${lead.id}`)

        for (const rule of rules) {
            const matches = doesRuleMatch(rule, lead, context)
            if (!matches) {
                console.log(`[AutomationEngine] Rule "${rule.nombre}" did NOT match lead ${lead.id}`)
                continue
            }

            console.log(`[AutomationEngine] ✅ Rule "${rule.nombre}" matched lead ${lead.id} — applying action`)
            await applyRule(rule, lead)
        }
    } catch (err) {
        console.error('[AutomationEngine] Error evaluating rules:', err)
        // We never throw from here to avoid blocking the caller
    }
}

/**
 * Evaluates whether a rule's conditions are satisfied for the given lead and context
 */
function doesRuleMatch(rule: AutomationRule, lead: LeadDB, context: AutomationContext): boolean {
    const cfg = rule.trigger_config as any

    switch (rule.trigger_type) {
        case 'message_received': {
            // Condition: lead must be in the specified stage (if any)
            const requiredStage = cfg?.from_stage_id
            if (requiredStage && lead.etapa_id !== requiredStage) return false
            // Also check: make sure the target stage is different from current
            if (lead.etapa_id === rule.action_config.target_stage_id) return false
            return true
        }

        case 'tag_added': {
            // Condition: tag name must match
            if (!context.tagName) return false
            const requiredTag = (cfg?.tag_name || '').trim().toLowerCase()
            const incomingTag = context.tagName.trim().toLowerCase()
            if (requiredTag && requiredTag !== incomingTag) return false
            // Condition: lead must be in the specified stage (if any)
            const requiredStage = cfg?.from_stage_id
            if (requiredStage && lead.etapa_id !== requiredStage) return false
            // Avoid redundant moves
            if (lead.etapa_id === rule.action_config.target_stage_id) return false
            return true
        }

        case 'stage_change': {
            // Condition: lead just ENTERED a specific stage
            // context.fromStageId is the stage the lead came FROM
            // The lead's current etapa_id is the stage it ENTERED
            const triggerStage = cfg?.from_stage_id // "from_stage_id" here means "entering this stage"
            if (triggerStage && lead.etapa_id !== triggerStage) return false
            // Avoid infinite loop: target must be different from current
            if (lead.etapa_id === rule.action_config.target_stage_id) return false
            return true
        }

        case 'time_in_stage': {
            // Time-based: handled by a scheduled CRON job, not here
            return false
        }

        default:
            return false
    }
}

/**
 * Applies the rule's action to the lead (moves it to the target stage)
 */
async function applyRule(rule: AutomationRule, lead: LeadDB): Promise<void> {
    const { target_stage_id, target_pipeline_id } = rule.action_config

    if (!target_stage_id) {
        console.warn(`[AutomationEngine] Rule "${rule.nombre}" has no target_stage_id, skipping`)
        return
    }

    const updates: { etapa_id: string; pipeline_id?: string } = {
        etapa_id: target_stage_id
    }

    if (target_pipeline_id) {
        updates.pipeline_id = target_pipeline_id
    }

    try {
        // Update the lead stage using a direct supabase call
        // (we don't have an actorId here since it's automated)
        const { error } = await supabase
            .from('lead')
            .update(updates)
            .eq('id', lead.id)

        if (error) {
            console.error(`[AutomationEngine] Error updating lead ${lead.id}:`, error)
            return
        }

        console.log(`[AutomationEngine] ✅ Lead ${lead.id} moved to stage ${target_stage_id} by rule "${rule.nombre}"`)

        // Log the automation execution in lead_historial
        try {
            await createHistoryEntry({
                lead_id: lead.id,
                usuario_id: '00000000-0000-0000-0000-000000000000', // System actor UUID
                accion: 'automatizacion',
                detalle: `Movido automáticamente por regla: "${rule.nombre}"`,
                metadata: {
                    rule_id: rule.id,
                    rule_name: rule.nombre,
                    trigger_type: rule.trigger_type,
                    from_stage_id: lead.etapa_id,
                    to_stage_id: target_stage_id,
                    actor_nombre: 'Sistema (Automatización)'
                }
            })
        } catch (histErr) {
            console.warn('[AutomationEngine] Could not create history entry:', histErr)
        }

        // Log in automation_logs for audit
        try {
            await supabase.from('automation_logs').insert({
                rule_id: rule.id,
                lead_id: lead.id,
                empresa_id: lead.empresa_id,
                trigger_type: rule.trigger_type,
                action_taken: {
                    from_stage_id: lead.etapa_id,
                    to_stage_id: target_stage_id,
                    rule_name: rule.nombre,
                    pipeline_id: target_pipeline_id || null
                }
            })
        } catch (logErr) {
            console.warn('[AutomationEngine] Could not create automation log:', logErr)
        }

    } catch (err) {
        console.error(`[AutomationEngine] Unexpected error applying rule "${rule.nombre}":`, err)
    }
}
