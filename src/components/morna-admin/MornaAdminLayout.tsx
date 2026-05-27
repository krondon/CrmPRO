import { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Buildings, ShieldCheck, ClockCounterClockwise, ArrowLeft, SignOut } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useMornaStaff } from '@/hooks/useMornaStaff'
import { Button } from '@/components/ui/button'

/**
 * Layout del panel Morna. Look-and-feel deliberadamente distinto del CRM
 * (oscuro, denso) para que el staff nunca dude en qué contexto está.
 */
export function MornaAdminLayout({ children }: { children: ReactNode }) {
    const navigate = useNavigate()
    const { user, logout } = useAuth()
    const { role } = useMornaStaff()

    const navItems = [
        { to: '/morna-admin', label: 'Empresas', icon: Buildings, end: true },
        { to: '/morna-admin/staff', label: 'Staff Morna', icon: ShieldCheck, end: false },
        { to: '/morna-admin/audit', label: 'Auditoría', icon: ClockCounterClockwise, end: false },
    ]

    return (
        <div className="min-h-screen flex bg-zinc-950 text-zinc-100">
            <aside className="w-64 shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col">
                <div className="px-5 py-5 border-b border-zinc-800">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center font-black text-zinc-950">
                            M
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold tracking-tight">Panel Morna</span>
                            <span className="text-[10px] uppercase tracking-widest text-amber-400/80 font-bold">
                                {role === 'super_admin' ? 'Super Admin' : 'Support'}
                            </span>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 p-3 space-y-1">
                    {navItems.map(item => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.end}
                            className={({ isActive }) =>
                                cn(
                                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                                    isActive
                                        ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                                )
                            }
                        >
                            <item.icon size={16} weight="bold" />
                            {item.label}
                        </NavLink>
                    ))}
                </nav>

                <div className="p-3 border-t border-zinc-800 space-y-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"
                        onClick={() => navigate('/dashboard')}
                    >
                        <ArrowLeft size={14} className="mr-2" />
                        Volver al CRM
                    </Button>
                    <div className="px-3 py-2 text-[11px] text-zinc-500 truncate" title={user?.email}>
                        {user?.email}
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-zinc-400 hover:text-rose-300 hover:bg-rose-500/10"
                        onClick={logout}
                    >
                        <SignOut size={14} className="mr-2" />
                        Cerrar sesión
                    </Button>
                </div>
            </aside>

            <main className="flex-1 min-w-0 overflow-auto">
                {children}
            </main>
        </div>
    )
}
