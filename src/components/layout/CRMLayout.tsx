import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/crm/Sidebar'
import { OnboardingTemplatesDialog } from '@/components/crm/OnboardingTemplatesDialog'
import { NotificationPanel } from '@/components/crm/NotificationPanel'
import { useAuth } from '@/hooks/useAuth'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/supabase/client'
import { getPendingInvitations } from '@/supabase/services/invitations'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Copy, Bell, UserCirclePlus, ArrowSquareOut } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { preloadChatsForCompany } from '@/lib/chatsCache'
import { useNavigate, useLocation } from 'react-router-dom'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Building } from '@phosphor-icons/react'
import { getPermissionRoleLabel } from '@/lib/roleLabels'
import { SupportFab } from '@/components/premium'

interface CRMLayoutProps {
    isGuestMode?: boolean
}

export function CRMLayout({ isGuestMode: forcedGuestMode }: CRMLayoutProps) {
    const {
        user,
        companies,
        currentCompanyId,
        setCurrentCompanyId,
        logout,
        isGuestMode: authGuestMode,
        leaveCompanyHandler,
        fetchCompanies
    } = useAuth()

    const navigate = useNavigate()
    const location = useLocation()
    const [showNotifications, setShowNotifications] = useState(false)
    const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)
    const [showOnboarding, setShowOnboarding] = useState(false)
    const onboardingChecked = useRef(false)

    const isGuestMode = forcedGuestMode ?? authGuestMode
    const currentCompany = companies.find(c => c.id === currentCompanyId)

    useEffect(() => {
        if (!currentCompanyId || onboardingChecked.current) return
        onboardingChecked.current = true
        ;(async () => {
            const { count } = await supabase.from('pipeline').select('id', { count: 'exact', head: true }).eq('empresa_id', currentCompanyId)
            if ((count ?? 0) === 0) setShowOnboarding(true)
        })()
    }, [currentCompanyId])

    // Precargar chats cuando cambia la empresa
    useEffect(() => {
        if (currentCompanyId && user?.id) {
            const timer = setTimeout(() => {
                preloadChatsForCompany(currentCompanyId)
            }, 1000)
            return () => clearTimeout(timer)
        }
    }, [currentCompanyId, user?.id])

    // Sincronizar URL con modo colaborador
    useEffect(() => {
        const isUrlGuest = location.pathname.startsWith('/guest')
        const currentPath = location.pathname.replace('/guest', '').replace(/^\//, '') || 'dashboard'

        // Si está en modo invitado pero la URL no tiene /guest, redirigir
        if (authGuestMode && !isUrlGuest) {
            navigate(`/guest/${currentPath}`, { replace: true })
        }
        // Si NO está en modo invitado pero la URL tiene /guest, redirigir
        else if (!authGuestMode && isUrlGuest) {
            navigate(`/${currentPath}`, { replace: true })
        }
    }, [authGuestMode, location.pathname, navigate])

    // Referencia para saber si estamos en la página de notificaciones
    const isOnNotificationsRef = useRef(false)
    useEffect(() => {
        isOnNotificationsRef.current = location.pathname.endsWith('/notifications') || location.pathname.endsWith('/notifications/')
    }, [location.pathname])

    // Mostrar toast rico para una notificación nueva
    const showNotificationToast = useCallback((notif: any) => {
        // No mostrar toast si ya estamos en la página de notificaciones
        if (isOnNotificationsRef.current) return

        const isLeadAssigned = notif.type === 'lead_assigned'
        const isTeamInvitation = notif.type === 'team_invitation'
        const isInvitationResponse = notif.type === 'invitation_response'

        // Sonar notificación (usando Web Audio API para un tono corto)
        try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
            const oscillator = audioCtx.createOscillator()
            const gainNode = audioCtx.createGain()
            oscillator.connect(gainNode)
            gainNode.connect(audioCtx.destination)
            oscillator.frequency.setValueAtTime(880, audioCtx.currentTime)
            oscillator.frequency.setValueAtTime(1174.66, audioCtx.currentTime + 0.1)
            gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime)
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4)
            oscillator.start(audioCtx.currentTime)
            oscillator.stop(audioCtx.currentTime + 0.4)
        } catch { /* silently fail if audio not available */ }

        const prefix = isGuestMode ? '/guest' : ''

        if (isLeadAssigned) {
            toast(
                '🎯 Nuevo Lead Asignado',
                {
                    description: notif.message || 'Se te ha asignado una nueva oportunidad',
                    duration: 8000,
                    action: {
                        label: 'Ver',
                        onClick: () => navigate(`${prefix}/notifications`)
                    },
                    className: 'notification-toast-lead',
                }
            )
        } else if (isTeamInvitation) {
            toast(
                '👥 Nueva Invitación de Equipo',
                {
                    description: notif.message || 'Te han invitado a un equipo',
                    duration: 8000,
                    action: {
                        label: 'Ver',
                        onClick: () => navigate(`${prefix}/notifications`)
                    },
                    className: 'notification-toast-team',
                }
            )
        } else if (isInvitationResponse) {
            const accepted = notif.data?.response === 'accepted'
            toast(
                accepted ? '✅ Invitación Aceptada' : '❌ Invitación Rechazada',
                {
                    description: notif.message || 'Han respondido a tu invitación',
                    duration: 6000,
                    action: {
                        label: 'Ver',
                        onClick: () => navigate(`${prefix}/notifications`)
                    },
                }
            )
        } else {
            toast(
                '🔔 Nueva Notificación',
                {
                    description: notif.message || notif.title || 'Tienes una nueva notificación',
                    duration: 6000,
                    action: {
                        label: 'Ver',
                        onClick: () => navigate(`${prefix}/notifications`)
                    },
                }
            )
        }
    }, [isGuestMode, navigate])

    // Contar notificaciones no leídas
    useEffect(() => {
        if (!user?.email) return

        const fetchNotificationCount = async () => {
            const { count } = await supabase
                .from('notificaciones')
                .select('id', { count: 'exact', head: true })
                .eq('usuario_email', user.email)
                .eq('read', false)
                .in('type', ['lead_assigned', 'invitation_response', 'team_invitation'])
            setUnreadNotificationsCount(count || 0)
        }

        fetchNotificationCount()

        // Suscripción en tiempo real - actualizar conteo Y mostrar toast
        const channel = supabase
            .channel(`noti-counter-${user.email}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notificaciones',
                filter: `usuario_email=eq.${user.email}`
            }, (payload: any) => {
                fetchNotificationCount()
                // Mostrar toast para la nueva notificación
                if (payload.new) {
                    showNotificationToast(payload.new)
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'notificaciones',
                filter: `usuario_email=eq.${user.email}`
            }, fetchNotificationCount)
            .subscribe()

        return () => {
            channel.unsubscribe()
        }
    }, [user?.email, showNotificationToast])

    // Cuando el usuario navega a /notifications, resetear el badge inmediatamente
    // y re-consultar para asegurar que el conteo está actualizado
    useEffect(() => {
        const isOnNotificationsPage = location.pathname.endsWith('/notifications') || location.pathname.endsWith('/notifications/')
        if (isOnNotificationsPage && user?.email) {
            // Resetear inmediatamente en UI
            setUnreadNotificationsCount(0)
            // También marcar como leídas en BD por si acaso NotificationsView no lo hizo aún
            supabase
                .from('notificaciones')
                .update({ read: true })
                .eq('usuario_email', user.email)
                .eq('read', false)
                .in('type', ['lead_assigned', 'invitation_response', 'team_invitation'])
                .then(() => {/* silently update */ })
        }
    }, [location.pathname, user?.email])

    // Función para manejar cambio de vista
    const handleViewChange = (view: string) => {
        const prefix = isGuestMode ? '/guest' : ''
        const path = view === 'dashboard' ? '' : view
        navigate(`${prefix}/${path}`.replace('//', '/'))
    }

    // Determinar la vista actual basada en la URL
    const getCurrentView = (): string => {
        const path = location.pathname.replace('/guest', '').replace('/', '') || 'dashboard'
        return path
    }

    // Manejar cambio de empresa
    const handleCompanyChange = (companyId: string) => {
        setCurrentCompanyId(companyId)
        const selectedCompany = companies.find(c => c.id === companyId)
        const willBeGuest = selectedCompany && user && selectedCompany.ownerId !== user.id

        // Redirigir a la ruta correcta basada en si será invitado o no
        const currentPath = location.pathname.replace('/guest', '').replace('/', '') || 'dashboard'
        if (willBeGuest) {
            navigate(`/guest/${currentPath}`)
        } else if (location.pathname.startsWith('/guest')) {
            navigate(`/${currentPath}`)
        }
    }

    if (!user) return null

    const role = currentCompany?.ownerId === user.id ? 'owner' : (currentCompany?.role || 'viewer')
    const displayRole = getPermissionRoleLabel(role)
    const badgeColor = displayRole === 'Propietario' ? 'bg-primary/10 text-primary border-primary/20' : displayRole === 'Administrador' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' : 'bg-muted text-muted-foreground border-border'

    return (
        <div className="fixed inset-0 bg-background overflow-hidden flex flex-col md:flex-row">
            <Sidebar
                currentView={getCurrentView()}
                onViewChange={handleViewChange}
                onLogout={logout}
                user={user}
                currentCompanyId={currentCompanyId}
                onCompanyChange={handleCompanyChange}
                companies={companies}
                notificationCount={unreadNotificationsCount}
                isAnonymous={user?.isAnonymous}
            />

            <main className="flex-1 flex flex-col overflow-hidden relative pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0">
                {/* Collaborator Mode Banner - Ultra Slim Top Bar */}
                {isGuestMode && currentCompany && (
                    <div className="w-full bg-amber-500/10 border-b border-amber-500/20 px-4 h-10 flex items-center justify-between shrink-0 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar className="w-6 h-6 border border-amber-200 shadow-sm shrink-0">
                                {currentCompany?.logo ? (
                                    <AvatarImage src={currentCompany.logo} alt={currentCompany.name} className="object-cover" />
                                ) : (
                                    <AvatarFallback className="bg-amber-100 text-amber-700 font-bold text-[10px]">
                                        <Building size={12} />
                                    </AvatarFallback>
                                )}
                            </Avatar>
                            <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-xs font-semibold text-amber-800 truncate">{currentCompany.name}</span>
                                <span className="text-amber-600/50 hidden sm:inline">•</span>
                                <Badge variant="outline" className="h-5 px-1.5 text-[9px] uppercase tracking-wider bg-amber-50 text-amber-700 border-amber-200 shrink-0">
                                    {displayRole}
                                </Badge>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    if (confirm('¿Estás seguro de que quieres abandonar esta empresa? Perderás el acceso inmediatamente.')) {
                                        leaveCompanyHandler(currentCompany.id)
                                        navigate('/dashboard')
                                    }
                                }}
                                className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded font-medium"
                            >
                                Abandonar
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    const myCompany = companies.find(c => c.ownerId === user?.id)
                                    if (myCompany) {
                                        handleCompanyChange(myCompany.id)
                                        toast.info('Has vuelto a tu empresa principal')
                                    } else {
                                        toast.error('No se encontró tu empresa principal')
                                    }
                                }}
                                className="h-6 px-2 text-xs text-amber-700 hover:text-amber-900 hover:bg-amber-500/20 rounded font-medium"
                            >
                                Salir
                            </Button>
                        </div>
                    </div>
                )}


                {/* Page Content (rendered by Outlet) */}
                <Outlet />
            </main>

            <NotificationPanel open={showNotifications} onClose={() => setShowNotifications(false)} />
            <OnboardingTemplatesDialog
                open={showOnboarding}
                onClose={() => setShowOnboarding(false)}
                companyId={currentCompanyId}
            />
            <SupportFab />
        </div>
    )
}
