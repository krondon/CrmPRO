import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import {
    MagnifyingGlass,
    Spinner,
    Buildings,
    Users,
    ChatCircleDots,
    UserCircle,
    ArrowsDownUp,
    Warning,
} from '@phosphor-icons/react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
    listAdminCompanies,
    type AdminCompanyRow,
    type ListCompaniesParams,
} from '@/supabase/services/mornaStaff'
import { safeFormatDate } from '@/hooks/useDateFormat'

const PAGE_SIZE = 50

type SortKey = NonNullable<ListCompaniesParams['sort']>

const SORT_LABELS: Record<SortKey, string> = {
    activity_desc: 'Actividad reciente',
    created_desc: 'Fecha de creación',
    name_asc: 'Nombre (A-Z)',
    users_desc: 'Más usuarios',
    leads_desc: 'Más oportunidades',
}

export function CompaniesView() {
    const [companies, setCompanies] = useState<AdminCompanyRow[]>([])
    const [total, setTotal] = useState(0)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [sort, setSort] = useState<SortKey>('activity_desc')

    // Debounce para no pegar al backend en cada tecla.
    useEffect(() => {
        const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
        return () => window.clearTimeout(t)
    }, [search])

    useEffect(() => {
        let cancelled = false
        const load = async () => {
            setIsLoading(true)
            setError(null)
            try {
                const result = await listAdminCompanies({
                    search: debouncedSearch,
                    limit: PAGE_SIZE,
                    sort,
                })
                if (!cancelled) {
                    setCompanies(result.companies)
                    setTotal(result.total)
                }
            } catch (err) {
                if (!cancelled) setError((err as Error).message)
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }
        void load()
        return () => {
            cancelled = true
        }
    }, [debouncedSearch, sort])

    const totalUsers = useMemo(() => companies.reduce((acc, c) => acc + c.users_count, 0), [companies])
    const totalLeads = useMemo(() => companies.reduce((acc, c) => acc + c.leads_count, 0), [companies])

    return (
        <div className="p-6 space-y-6">
            <header className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-black tracking-tight">Empresas</h1>
                    <p className="text-sm text-zinc-400 mt-1">
                        {total > 0
                            ? `${total} empresa${total !== 1 ? 's' : ''} registrada${total !== 1 ? 's' : ''}`
                            : 'Sin empresas para mostrar'}
                    </p>
                </div>
            </header>

            {/* KPIs rápidos */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <KpiCard icon={Buildings} label="Empresas (página)" value={companies.length} />
                <KpiCard icon={Users} label="Usuarios (página)" value={totalUsers} />
                <KpiCard icon={ChatCircleDots} label="Leads (página)" value={totalLeads} />
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[260px] max-w-md">
                    <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                    <Input
                        placeholder="Buscar empresa por nombre..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-500"
                    />
                </div>
                <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                    <SelectTrigger className="w-[220px] bg-zinc-900 border-zinc-800 text-zinc-100">
                        <div className="flex items-center gap-2">
                            <ArrowsDownUp size={14} className="text-zinc-500" />
                            <SelectValue />
                        </div>
                    </SelectTrigger>
                    <SelectContent>
                        {Object.entries(SORT_LABELS).map(([key, label]) => (
                            <SelectItem key={key} value={key}>{label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Tabla */}
            <div className="border border-zinc-800 rounded-lg overflow-hidden">
                <div className="grid grid-cols-[1fr_180px_100px_100px_140px_160px] bg-zinc-900/60 border-b border-zinc-800 px-4 py-2.5 text-[11px] uppercase tracking-wider font-bold text-zinc-500">
                    <div>Empresa</div>
                    <div>Owner</div>
                    <div className="text-right">Usuarios</div>
                    <div className="text-right">Leads</div>
                    <div className="text-right">Mensajes 30d</div>
                    <div className="text-right">Última actividad</div>
                </div>

                {isLoading && companies.length === 0 && (
                    <div className="flex items-center justify-center gap-3 py-12 text-zinc-500">
                        <Spinner className="w-5 h-5 animate-spin" />
                        Cargando empresas...
                    </div>
                )}

                {error && (
                    <div className="flex items-center gap-2 px-4 py-6 text-rose-400 bg-rose-500/5 border-b border-rose-500/20">
                        <Warning size={16} weight="fill" />
                        <span className="text-sm">{error}</span>
                    </div>
                )}

                {!isLoading && !error && companies.length === 0 && (
                    <div className="text-center py-12 text-zinc-500 text-sm">
                        No se encontraron empresas{debouncedSearch ? ` para "${debouncedSearch}"` : ''}.
                    </div>
                )}

                {companies.map((c) => (
                    <CompanyRow key={c.id} company={c} />
                ))}
            </div>
        </div>
    )
}

function KpiCard({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
    return (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-zinc-500 text-xs uppercase tracking-wider font-bold">
                <Icon size={14} weight="bold" />
                {label}
            </div>
            <div className="mt-2 text-2xl font-black text-zinc-100 tabular-nums">{value.toLocaleString()}</div>
        </div>
    )
}

function CompanyRow({ company }: { company: AdminCompanyRow }) {
    const initials = (company.nombre_empresa || '??').substring(0, 2).toUpperCase()
    const lastActivity = company.last_activity_at
        ? formatDistanceToNow(new Date(company.last_activity_at), { locale: es, addSuffix: true })
        : '—'

    return (
        <div className="grid grid-cols-[1fr_180px_100px_100px_140px_160px] items-center px-4 py-3 border-b border-zinc-800 hover:bg-zinc-900/50 transition-colors group">
            <div className="flex items-center gap-3 min-w-0">
                <Avatar className="h-9 w-9 border border-zinc-700 shrink-0">
                    <AvatarImage src={company.logo_url ?? undefined} />
                    <AvatarFallback className="bg-zinc-800 text-zinc-300 font-bold text-xs">
                        {initials}
                    </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                    <div className="font-semibold truncate text-zinc-100">{company.nombre_empresa}</div>
                    <div className="text-[11px] text-zinc-500 truncate">
                        Creada {safeFormatDate(company.created_at, 'dd MMM yyyy', { locale: es })}
                        {company.codigo_empresa && <span className="ml-2 opacity-60">· {company.codigo_empresa}</span>}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-zinc-400 truncate" title={company.owner_email ?? ''}>
                <UserCircle size={14} className="shrink-0 text-zinc-500" />
                <span className="truncate">{company.owner_email ?? '—'}</span>
            </div>

            <div className="text-right text-sm tabular-nums">{company.users_count}</div>
            <div className="text-right text-sm tabular-nums">{company.leads_count}</div>
            <div className="text-right text-sm tabular-nums">
                <Badge
                    variant="outline"
                    className={
                        company.messages_30d > 0
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 tabular-nums'
                            : 'border-zinc-700 bg-zinc-800/50 text-zinc-500 tabular-nums'
                    }
                >
                    {company.messages_30d.toLocaleString()}
                </Badge>
            </div>
            <div className="text-right text-xs text-zinc-400">{lastActivity}</div>
        </div>
    )
}
