import { useCallback, useEffect, useState } from 'react'
import type { Lead } from '@/lib/types'

const STORAGE_KEY_PREFIX = 'lead_clipboard:'

interface ClipboardEntry {
    lead: Lead
    sourceEmpresaId: string
    copiedAt: number
}

function keyFor(empresaId: string) {
    return `${STORAGE_KEY_PREFIX}${empresaId}`
}

function readFromStorage(empresaId: string): ClipboardEntry | null {
    if (typeof window === 'undefined' || !empresaId) return null
    try {
        const raw = sessionStorage.getItem(keyFor(empresaId))
        if (!raw) return null
        const parsed = JSON.parse(raw) as ClipboardEntry
        if (!parsed?.lead?.id) return null
        return parsed
    } catch {
        return null
    }
}

/**
 * Mantiene una "oportunidad copiada" en sessionStorage para poder pegarla en otro
 * pipeline/etapa. Solo vive durante la sesión del navegador y está aislada por
 * empresa: si el usuario cambia de empresa, no ve el clipboard de la otra.
 */
export function useLeadClipboard(empresaId: string | undefined) {
    const [entry, setEntry] = useState<ClipboardEntry | null>(() =>
        empresaId ? readFromStorage(empresaId) : null
    )

    // Re-leer si cambia la empresa (cambiar de CRM no debe mezclar clipboards)
    useEffect(() => {
        setEntry(empresaId ? readFromStorage(empresaId) : null)
    }, [empresaId])

    const copy = useCallback((lead: Lead) => {
        if (!empresaId) return
        const next: ClipboardEntry = {
            lead,
            sourceEmpresaId: empresaId,
            copiedAt: Date.now(),
        }
        try {
            sessionStorage.setItem(keyFor(empresaId), JSON.stringify(next))
        } catch (e) {
            console.warn('[useLeadClipboard] No se pudo guardar en sessionStorage:', e)
        }
        setEntry(next)
    }, [empresaId])

    const clear = useCallback(() => {
        if (!empresaId) return
        try {
            sessionStorage.removeItem(keyFor(empresaId))
        } catch { /* ignore */ }
        setEntry(null)
    }, [empresaId])

    return { copiedLead: entry?.lead ?? null, copy, clear }
}
