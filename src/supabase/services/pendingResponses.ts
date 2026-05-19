import { requireSupabase } from '../client'

export interface VerifyPendingResult {
    success: boolean
    checked?: number
    cleared?: number
    total_pending?: number
    skipped?: string
    error?: string
}

/**
 * Invoca la edge function que verifica el estado de "bloqueo" en SuperAPI
 * para los leads de la empresa marcados como pendientes de respuesta humana.
 *
 * Si SuperAPI confirma el lock (asesor escribiendo o ya respondió), el edge
 * function limpia is_pending_human_response y la suscripción realtime
 * actualiza la UI automáticamente.
 */
export async function invokeVerifyPendingResponses(empresaId: string): Promise<VerifyPendingResult> {
    const supabase = requireSupabase()
    const { data, error } = await supabase.functions.invoke('verify-pending-responses', {
        body: { empresa_id: empresaId }
    })
    if (error) {
        console.error('[pendingResponses] invoke error:', error)
        return { success: false, error: error.message || 'Error invocando verify-pending-responses' }
    }
    return (data ?? { success: true }) as VerifyPendingResult
}
