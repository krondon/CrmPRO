import { useEffect, useState } from 'react'
import { es } from 'date-fns/locale'
import { ShieldCheck, Trash, Plus, Spinner, Warning, UserCircle, Lock } from '@phosphor-icons/react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { useMornaStaff } from '@/hooks/useMornaStaff'
import {
    listMornaStaff,
    addMornaStaff,
    removeMornaStaff,
    type MornaStaffMember,
    type MornaStaffRole,
} from '@/supabase/services/mornaStaff'
import { safeFormatDate } from '@/hooks/useDateFormat'
import { toast } from 'sonner'

const ROLE_LABELS: Record<MornaStaffRole, string> = {
    super_admin: 'Super Admin',
    support: 'Support',
}

export function StaffView() {
    const { role: myRole } = useMornaStaff()
    const isSuperAdmin = myRole === 'super_admin'

    const [staff, setStaff] = useState<MornaStaffMember[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [newEmail, setNewEmail] = useState('')
    const [newRole, setNewRole] = useState<MornaStaffRole>('support')
    const [adding, setAdding] = useState(false)

    const [removeTarget, setRemoveTarget] = useState<MornaStaffMember | null>(null)
    const [removing, setRemoving] = useState(false)

    const load = async () => {
        setLoading(true)
        setError(null)
        try {
            setStaff(await listMornaStaff())
        } catch (e) {
            setError((e as Error).message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void load()
    }, [])

    const handleAdd = async () => {
        const email = newEmail.trim()
        if (!email) {
            toast.error('Escribe un correo.')
            return
        }
        setAdding(true)
        try {
            await addMornaStaff(email, newRole)
            toast.success(`${email} agregado como ${ROLE_LABELS[newRole]}.`)
            setNewEmail('')
            setNewRole('support')
            await load()
        } catch (e) {
            toast.error((e as Error).message)
        } finally {
            setAdding(false)
        }
    }

    const handleRemove = async () => {
        if (!removeTarget) return
        setRemoving(true)
        try {
            await removeMornaStaff(removeTarget.userId)
            toast.success('Miembro del staff eliminado.')
            setRemoveTarget(null)
            await load()
        } catch (e) {
            toast.error((e as Error).message)
        } finally {
            setRemoving(false)
        }
    }

    const gridCols = isSuperAdmin
        ? 'grid-cols-[1fr_140px_200px_140px_80px]'
        : 'grid-cols-[1fr_140px_200px_140px]'

    return (
        <div className="p-6 space-y-6">
            <header>
                <h1 className="text-2xl font-black tracking-tight">Staff Morna</h1>
                <p className="text-sm text-zinc-400 mt-1">
                    Quién tiene acceso al panel administrativo.
                    {!isSuperAdmin && ' Solo un super_admin puede agregar o quitar miembros.'}
                </p>
            </header>

            {/* Agregar (solo super_admin) */}
            {isSuperAdmin && (
                <div className="flex flex-wrap items-end gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                    <div className="flex-1 min-w-[240px]">
                        <label className="text-[11px] uppercase tracking-wider font-bold text-zinc-500">
                            Correo del nuevo staff
                        </label>
                        <Input
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            placeholder="persona@correo.com"
                            type="email"
                            disabled={adding}
                            className="mt-1 bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600"
                        />
                    </div>
                    <div className="w-[180px]">
                        <label className="text-[11px] uppercase tracking-wider font-bold text-zinc-500">
                            Rol
                        </label>
                        <Select value={newRole} onValueChange={(v) => setNewRole(v as MornaStaffRole)}>
                            <SelectTrigger className="mt-1 bg-zinc-950 border-zinc-800 text-zinc-100">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="support">Support</SelectItem>
                                <SelectItem value="super_admin">Super Admin</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <Button
                        onClick={handleAdd}
                        disabled={adding || !newEmail.trim()}
                        className="bg-amber-500 text-amber-950 hover:bg-amber-400 font-bold"
                    >
                        {adding ? <Spinner size={14} className="animate-spin mr-1" /> : <Plus size={14} weight="bold" className="mr-1" />}
                        Agregar
                    </Button>
                </div>
            )}

            {/* Tabla */}
            <div className="border border-zinc-800 rounded-lg overflow-hidden">
                <div className={`grid ${gridCols} bg-zinc-900/60 border-b border-zinc-800 px-4 py-2.5 text-[11px] uppercase tracking-wider font-bold text-zinc-500`}>
                    <div>Miembro</div>
                    <div>Rol</div>
                    <div>Agregado por</div>
                    <div>Fecha</div>
                    {isSuperAdmin && <div className="text-right">Acción</div>}
                </div>

                {loading && (
                    <div className="flex items-center justify-center gap-3 py-12 text-zinc-500">
                        <Spinner className="w-5 h-5 animate-spin" />
                        Cargando staff...
                    </div>
                )}

                {error && !loading && (
                    <div className="flex items-center gap-2 px-4 py-6 text-rose-400 bg-rose-500/5">
                        <Warning size={16} weight="fill" />
                        <span className="text-sm">{error}</span>
                    </div>
                )}

                {!loading && !error && staff.length === 0 && (
                    <div className="text-center py-12 text-zinc-500 text-sm">Sin miembros de staff.</div>
                )}

                {!loading && !error && staff.map((m) => (
                    <div
                        key={m.userId}
                        className={`grid ${gridCols} items-center px-4 py-3 border-b border-zinc-800 hover:bg-zinc-900/50 transition-colors`}
                    >
                        <div className="flex items-center gap-2 min-w-0">
                            <UserCircle size={18} className="text-zinc-500 shrink-0" />
                            <div className="min-w-0">
                                <div className="font-semibold truncate text-zinc-100">{m.email ?? '—'}</div>
                                {m.nombre && <div className="text-[11px] text-zinc-500 truncate">{m.nombre}</div>}
                            </div>
                        </div>
                        <div>
                            <Badge
                                variant="outline"
                                className={
                                    m.role === 'super_admin'
                                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-300 gap-1'
                                        : 'border-zinc-700 bg-zinc-800/50 text-zinc-300 gap-1'
                                }
                            >
                                {m.role === 'super_admin' ? <ShieldCheck size={11} weight="fill" /> : null}
                                {ROLE_LABELS[m.role]}
                            </Badge>
                        </div>
                        <div className="text-xs text-zinc-400 truncate">{m.createdByEmail ?? '—'}</div>
                        <div className="text-xs text-zinc-400">
                            {safeFormatDate(m.createdAt, 'dd MMM yyyy', { locale: es })}
                        </div>
                        {isSuperAdmin && (
                            <div className="text-right">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setRemoveTarget(m)}
                                    className="h-7 w-7 p-0 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10"
                                    title="Quitar del staff"
                                >
                                    <Trash size={15} />
                                </Button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Confirmación de quitar */}
            <Dialog open={!!removeTarget} onOpenChange={(open) => { if (!open && !removing) setRemoveTarget(null) }}>
                <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Lock size={18} weight="bold" className="text-rose-400" />
                            Quitar del staff
                        </DialogTitle>
                        <DialogDescription className="text-zinc-400">
                            ¿Seguro que quieres quitar a{' '}
                            <span className="font-semibold text-zinc-200">{removeTarget?.email}</span>{' '}
                            del staff Morna? Perderá el acceso al panel administrativo.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setRemoveTarget(null)}
                            disabled={removing}
                            className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleRemove}
                            disabled={removing}
                            className="bg-rose-500 text-white hover:bg-rose-600 font-bold"
                        >
                            {removing ? <Spinner size={14} className="animate-spin mr-1" /> : <Trash size={14} weight="bold" className="mr-1" />}
                            Quitar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
