import { useEffect, useRef } from 'react'
import { invokeVerifyPendingResponses } from '@/supabase/services/pendingResponses'

/**
 * Polea cada `intervalMs` el edge function que actualiza el flag
 * is_pending_human_response de los leads de la empresa, consultando
 * el endpoint /chats/locked de SuperAPI.
 *
 * Si `enabled` es false (feature apagada por la empresa, sin empresa
 * activa, o componente desmontado), no hace nada.
 *
 * El primer chequeo se hace 5s después de montar para no competir con
 * la carga inicial del pipeline. Luego cada `intervalMs`.
 */
export function usePendingResponsePolling(
    empresaId: string | undefined | null,
    enabled: boolean,
    intervalMs: number = 60_000
) {
    const inFlightRef = useRef(false)

    useEffect(() => {
        if (!enabled || !empresaId) return

        let cancelled = false

        const tick = async () => {
            if (cancelled || inFlightRef.current) return
            inFlightRef.current = true
            try {
                await invokeVerifyPendingResponses(empresaId)
            } catch (err) {
                console.warn('[usePendingResponsePolling] tick error:', err)
            } finally {
                inFlightRef.current = false
            }
        }

        // Primer chequeo diferido
        const initialDelay = window.setTimeout(tick, 5_000)
        // Intervalo periódico
        const interval = window.setInterval(tick, intervalMs)

        return () => {
            cancelled = true
            window.clearTimeout(initialDelay)
            window.clearInterval(interval)
        }
    }, [empresaId, enabled, intervalMs])
}
