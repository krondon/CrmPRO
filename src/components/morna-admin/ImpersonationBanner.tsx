import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Eye, SignOut, Spinner } from '@phosphor-icons/react'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'

// Debe coincidir con IMPERSONATION_ACTIVE_KEY de useAuth.
const IMPERSONATION_ACTIVE_KEY = 'morna-impersonation-active'
const BANNER_HEIGHT = '2.25rem' // 36px

interface ActiveImpersonation {
    logId: string
    targetEmail: string
    targetName?: string
    staffEmail?: string
    empresaId?: string | null
}

function readActive(): ActiveImpersonation | null {
    try {
        const raw = localStorage.getItem(IMPERSONATION_ACTIVE_KEY)
        if (!raw) return null
        return JSON.parse(raw) as ActiveImpersonation
    } catch {
        return null
    }
}

/**
 * Barra fija que avisa al staff de Morna que está viendo el CRM "como" un
 * cliente (impersonación). Se monta global en App. El estado se deriva de un
 * flag en localStorage que escribe useAuth.startImpersonation, así que solo
 * aparece en la pestaña que impersona y sobrevive a un refresh.
 *
 * Se re-lee en cada cambio de ruta porque entrar/salir siempre navegan.
 */
export function ImpersonationBanner() {
    const location = useLocation()
    const navigate = useNavigate()
    const { exitImpersonation } = useAuth()
    const [active, setActive] = useState<ActiveImpersonation | null>(() => readActive())
    const [leaving, setLeaving] = useState(false)

    useEffect(() => {
        setActive(readActive())
    }, [location.pathname])

    // Empujar el contenido hacia abajo para no taparlo mientras el banner está.
    const isActive = !!active
    useEffect(() => {
        const root = document.getElementById('root')
        if (!root) return
        root.style.paddingTop = isActive ? BANNER_HEIGHT : ''
        return () => {
            root.style.paddingTop = ''
        }
    }, [isActive])

    if (!active) return null

    const handleExit = async () => {
        setLeaving(true)
        try {
            const result = await exitImpersonation()
            setActive(null)
            if (result === 'restored') {
                navigate('/morna-admin', { replace: true })
            } else {
                toast.info('Tu sesión de staff expiró. Inicia sesión nuevamente.', { duration: 6000 })
                navigate('/login', { replace: true })
            }
        } catch (e) {
            console.error('[ImpersonationBanner] error al salir:', e)
            toast.error('No se pudo salir de la impersonación.')
            setLeaving(false)
        }
    }

    const label = active.targetName || active.targetEmail

    return (
        <div
            className="fixed top-0 inset-x-0 z-[200] flex items-center justify-center gap-2 px-3 bg-amber-500 text-amber-950 shadow-md"
            style={{ height: BANNER_HEIGHT }}
            role="status"
        >
            <Eye size={16} weight="fill" className="shrink-0" />
            <span className="text-xs sm:text-sm font-semibold truncate">
                Modo soporte — viendo el CRM como{' '}
                <span className="font-black">{label}</span>
            </span>
            <button
                type="button"
                onClick={handleExit}
                disabled={leaving}
                className="ml-2 shrink-0 inline-flex items-center gap-1 rounded-md bg-amber-950/90 text-amber-50 px-2.5 py-1 text-xs font-bold hover:bg-amber-950 transition-colors disabled:opacity-60"
            >
                {leaving ? (
                    <Spinner size={13} className="animate-spin" />
                ) : (
                    <SignOut size={13} weight="bold" />
                )}
                Salir
            </button>
        </div>
    )
}
