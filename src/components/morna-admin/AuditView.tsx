import { useEffect, useState } from 'react'
import { es } from 'date-fns/locale'
import { formatDistanceToNow, formatDistanceStrict } from 'date-fns'
import {
    Spinner,
    Warning,
    SignIn,
    SignOut,
    UserPlus,
    UserMinus,
    Eye,
    ArrowRight,
} from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import {
    listAuditLog,
    type AuditAction,
    type AuditImpersonation,
} from '@/supabase/services/mornaStaff'
import { safeFormatDate } from '@/hooks/useDateFormat'

const ACTION_LABELS: Record<string, string> = {
    start_impersonation: 'Inició impersonación',
    end_impersonation: 'Terminó impersonación',
    add_staff: 'Agregó staff',
    remove_staff: 'Quitó staff',
}

function actionIcon(action: string) {
    switch (action) {
        case 'start_impersonation':
            return <SignIn size={14} weight="bold" className="text-amber-400" />
        case 'end_impersonation':
            return <SignOut size={14} weight="bold" className="text-zinc-400" />
        case 'add_staff':
            return <UserPlus size={14} weight="bold" className="text-emerald-400" />
        case 'remove_staff':
            return <UserMinus size={14} weight="bold" className="text-rose-400" />
        default:
            return <Eye size={14} weight="bold" className="text-zinc-400" />
    }
}

export function AuditView() {
    const [actions, setActions] = useState<AuditAction[]>([])
    const [impersonations, setImpersonations] = useState<AuditImpersonation[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            setLoading(true)
            setError(null)
            try {
                const result = await listAuditLog()
                if (!cancelled) {
                    setActions(result.actions)
                    setImpersonations(result.impersonations)
                }
            } catch (e) {
                if (!cancelled) setError((e as Error).message)
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [])

    return (
        <div className="p-6 space-y-8">
            <header>
                <h1 className="text-2xl font-black tracking-tight">Auditoría</h1>
                <p className="text-sm text-zinc-400 mt-1">
                    Rastro de acciones administrativas y sesiones de impersonación.
                </p>
            </header>

            {loading && (
                <div className="flex items-center justify-center gap-3 py-12 text-zinc-500">
                    <Spinner className="w-5 h-5 animate-spin" />
                    Cargando auditoría...
                </div>
            )}

            {error && !loading && (
                <div className="flex items-center gap-2 px-4 py-6 text-rose-400 bg-rose-500/5 border border-rose-500/20 rounded-lg">
                    <Warning size={16} weight="fill" />
                    <span className="text-sm">{error}</span>
                </div>
            )}

            {!loading && !error && (
                <>
                    {/* Sesiones de impersonación */}
                    <section className="space-y-3">
                        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                            Sesiones de impersonación
                        </h2>
                        <div className="border border-zinc-800 rounded-lg overflow-hidden">
                            <div className="grid grid-cols-[200px_1fr_120px_150px_100px] bg-zinc-900/60 border-b border-zinc-800 px-4 py-2.5 text-[11px] uppercase tracking-wider font-bold text-zinc-500">
                                <div>Staff</div>
                                <div>Cliente · Motivo</div>
                                <div>Duración</div>
                                <div>Inicio</div>
                                <div className="text-right">Estado</div>
                            </div>
                            {impersonations.length === 0 && (
                                <div className="text-center py-8 text-zinc-500 text-sm">Sin impersonaciones registradas.</div>
                            )}
                            {impersonations.map((imp) => (
                                <div
                                    key={imp.id}
                                    className="grid grid-cols-[200px_1fr_120px_150px_100px] items-center px-4 py-3 border-b border-zinc-800 hover:bg-zinc-900/50 transition-colors"
                                >
                                    <div className="text-xs text-zinc-300 truncate" title={imp.staffEmail ?? ''}>
                                        {imp.staffEmail ?? '—'}
                                    </div>
                                    <div className="min-w-0 flex items-center gap-2 text-xs">
                                        <ArrowRight size={12} className="text-zinc-600 shrink-0" />
                                        <div className="min-w-0">
                                            <div className="text-zinc-200 truncate">{imp.targetEmail ?? '—'}</div>
                                            <div className="text-zinc-500 truncate" title={imp.reason}>{imp.reason}</div>
                                        </div>
                                    </div>
                                    <div className="text-xs text-zinc-400">
                                        {imp.endedAt
                                            ? formatDistanceStrict(new Date(imp.startedAt), new Date(imp.endedAt), { locale: es })
                                            : '—'}
                                    </div>
                                    <div className="text-xs text-zinc-400">
                                        {safeFormatDate(imp.startedAt, 'dd MMM HH:mm', { locale: es })}
                                    </div>
                                    <div className="text-right">
                                        {imp.active ? (
                                            <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300">
                                                Activa
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="border-zinc-700 bg-zinc-800/50 text-zinc-500">
                                                Cerrada
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Feed de acciones */}
                    <section className="space-y-3">
                        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                            Acciones administrativas
                        </h2>
                        <div className="border border-zinc-800 rounded-lg divide-y divide-zinc-800">
                            {actions.length === 0 && (
                                <div className="text-center py-8 text-zinc-500 text-sm">Sin acciones registradas.</div>
                            )}
                            {actions.map((a) => (
                                <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-900/50 transition-colors">
                                    <div className="shrink-0 w-7 h-7 rounded-md bg-zinc-800/60 flex items-center justify-center">
                                        {actionIcon(a.action)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm text-zinc-200">
                                            <span className="font-semibold">{a.staffEmail ?? 'Staff'}</span>
                                            {' · '}
                                            <span className="text-zinc-400">{ACTION_LABELS[a.action] ?? a.action}</span>
                                            {a.targetEmail && (
                                                <>
                                                    {' '}
                                                    <span className="text-zinc-500">→</span>{' '}
                                                    <span className="text-zinc-300">{a.targetEmail}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="shrink-0 text-xs text-zinc-500" title={safeFormatDate(a.createdAt, 'dd MMM yyyy HH:mm', { locale: es })}>
                                        {formatDistanceToNow(new Date(a.createdAt), { locale: es, addSuffix: true })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </>
            )}
        </div>
    )
}
