import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { House, Kanban, ChartBar, CalendarBlank, Users, Gear, Bell, SignOut, Microphone, Buildings, ChatCircleDots, AddressBook, ClockCounterClockwise } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { useTranslation } from '@/lib/i18n'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Company } from './CompanyManagement'

interface User {
  id: string
  email: string
  businessName: string
}

interface SidebarProps {
  currentView: string
  onViewChange: (view: any) => void
  onLogout?: () => void
  user?: User
  currentCompanyId?: string
  onCompanyChange?: (companyId: string) => void
  companies?: Company[]
  notificationCount?: number
}

export function Sidebar({ currentView, onViewChange, onLogout, user, currentCompanyId, onCompanyChange, companies = [], notificationCount = 0 }: SidebarProps) {
  const t = useTranslation('es')
  const location = useLocation()
  const navigate = useNavigate()
  const [showCompanySelector, setShowCompanySelector] = useState(false)

  const unreadCount = notificationCount || 0

  // Determinar si está en modo invitado basado en la URL
  const isGuestMode = location.pathname.startsWith('/guest')

  // Helper para generar rutas con prefijo guest si es necesario
  const getPath = (path: string) => {
    const basePath = path === 'dashboard' ? '' : path
    return isGuestMode ? `/guest/${basePath}`.replace('//', '/') : `/${basePath}`.replace('//', '/')
  }

  // Determinar si una ruta está activa
  const isActive = (itemId: string) => {
    const pathWithoutGuest = location.pathname.replace('/guest', '')
    const cleanPath = pathWithoutGuest === '/' ? 'dashboard' : pathWithoutGuest.slice(1)
    return cleanPath === itemId || (itemId === 'dashboard' && cleanPath === '')
  }

  const menuItems = [
    { id: 'dashboard', icon: House, label: t.nav.dashboard },
    { id: 'pipeline', icon: Kanban, label: t.nav.pipeline },
    { id: 'chats', icon: ChatCircleDots, label: 'Chats' },
    { id: 'contacts', icon: AddressBook, label: 'Contactos' },
    ...(!isGuestMode ? [{ id: 'historial', icon: ClockCounterClockwise, label: 'Historial' }] : []),
    { id: 'analytics', icon: ChartBar, label: t.nav.analytics },
    { id: 'calendar', icon: CalendarBlank, label: t.nav.calendar },
    { id: 'team', icon: Users, label: t.nav.team },
    { id: 'settings', icon: Gear, label: t.nav.settings },
  ]

  return (
    <>
      <div className="hidden md:flex md:w-68 bg-card border-r border-border flex-col h-full shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="p-6 space-y-4 flex-none">
          {(() => {
            const activeCompany = (companies || []).find(c => c.id === currentCompanyId);
            return (
              <div className="flex items-center gap-3 mb-2 animate-in fade-in slide-in-from-left-4 duration-500">
                <Avatar className="h-10 w-10 shrink-0 shadow-md ring-2 ring-primary/10">
                  {activeCompany?.logo ? (
                    <AvatarImage src={activeCompany.logo} alt={activeCompany.name} className="object-cover" />
                  ) : (
                    <AvatarFallback className="bg-gradient-to-br from-primary to-primary/60 text-white font-bold">
                      {activeCompany?.name?.slice(0, 2).toUpperCase() || '??'}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className="flex flex-col min-w-0 flex-1">
                  <h1 className="text-lg font-bold text-foreground truncate leading-tight tracking-tight">
                    {activeCompany?.name || t.app.title}
                  </h1>
                  <p className="text-[9px] uppercase tracking-[0.2em] font-bold text-muted-foreground/50 leading-tight mt-0.5">
                    {activeCompany ? 'Panel de Control' : t.app.subtitle}
                  </p>
                </div>
              </div>
            );
          })()}

          {user && (companies || []).length > 0 && (() => {
            const activeCompany = (companies || []).find(c => c.id === currentCompanyId)
            return (
              <div className="space-y-1.5 pt-2">
                <label className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground/70 flex items-center gap-1.5 ml-1">
                  <Buildings size={12} className="text-primary/70" /> Empresa Activa
                </label>
                <Select
                  value={currentCompanyId || ''}
                  onValueChange={(val) => onCompanyChange && onCompanyChange(val)}
                >
                  <SelectTrigger className="h-11 text-xs bg-muted/30 border-muted-foreground/10 hover:border-primary/30 hover:bg-muted/50 transition-all rounded-xl focus:ring-1 focus:ring-primary/20 pl-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar className="h-7 w-7 shrink-0 ring-1 ring-border">
                        {activeCompany?.logo ? (
                          <AvatarImage src={activeCompany.logo} alt={activeCompany.name} className="object-cover" />
                        ) : (
                          <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                            {activeCompany?.name?.slice(0, 2).toUpperCase() || '??'}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <span className="truncate font-medium text-foreground">
                        {activeCompany?.name || 'Seleccionar empresa'}
                      </span>
                    </div>
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-muted-foreground/10 shadow-xl">
                    {(companies || []).map(c => (
                      <SelectItem key={c.id} value={c.id} className="rounded-lg py-2 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6 shrink-0 ring-1 ring-border">
                            {c.logo ? (
                              <AvatarImage src={c.logo} alt={c.name} className="object-cover" />
                            ) : (
                              <AvatarFallback className="text-[9px] font-bold bg-primary/10 text-primary">
                                {c.name?.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            )}
                          </Avatar>
                          <span className="font-medium">{c.name}</span>
                          {c.ownerId !== user?.id && (
                            <Badge variant="secondary" className="text-[9px] h-4 bg-primary/10 text-primary border-none uppercase font-extrabold px-1.5 leading-none tracking-tighter">
                              {c.role === 'admin' ? 'Administrador' : c.role === 'owner' ? 'Propietario' : 'Colaborador'}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          })()}
        </div>

        <nav className="flex-1 px-3 py-2 overflow-y-auto min-h-0 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent pr-1">
          <ul className="space-y-1.5">
            {menuItems.map((item) => {
              const Icon = item.icon
              const active = isActive(item.id)

              return (
                <li key={item.id}>
                  <NavLink
                    to={getPath(item.id)}
                    className={cn(
                      'w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 group',
                      active
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                        : 'text-foreground/70 hover:bg-primary/5 hover:text-primary'
                    )}
                  >
                    <Icon
                      size={20}
                      weight={active ? 'fill' : 'bold'}
                      className={cn(
                        "transition-transform duration-200 group-hover:scale-110",
                        active ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary"
                      )}
                    />
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-border/50 space-y-1.5 flex-none bg-muted/10">

          <NavLink
            to={getPath('notifications')}
            className={cn(
              "w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all group relative",
              isActive('notifications')
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                : "text-foreground/70 hover:bg-primary/5 hover:text-primary"
            )}
          >
            <Bell
              size={20}
              weight={isActive('notifications') ? 'fill' : 'bold'}
              className={cn(isActive('notifications') ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary")}
            />
            <span>{t.nav.notifications}</span>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-auto pulse-notification notification-bounce bg-[#FF3B30] text-white border-none h-5 min-w-[20px] px-1 shadow-sm">
                {unreadCount}
              </Badge>
            )}
          </NavLink>

          <div className="pt-2">
            {onLogout && (
              <button
                onClick={onLogout}
                className="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold text-red-500 hover:bg-red-50 hover:text-red-600 transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-red-50 group-hover:bg-red-100 flex items-center justify-center transition-colors">
                  <SignOut size={18} weight="bold" />
                </div>
                <span>{t.auth.logout}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 w-full bg-background border-t border-border z-[9999] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] pb-[env(safe-area-inset-bottom)]">
        <nav className="flex items-center justify-between px-1 py-1.5 overflow-x-auto">
          {/* Botón de empresa */}
          {user && (companies || []).length > 0 && (() => {
            const activeCompany = (companies || []).find(c => c.id === currentCompanyId)
            return (
              <button
                onClick={() => setShowCompanySelector(true)}
                className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-medium text-muted-foreground min-w-fit"
              >
                {activeCompany?.logo ? (
                  <Avatar className="h-6 w-6 ring-1 ring-primary/30">
                    <AvatarImage src={activeCompany.logo} alt={activeCompany.name} className="object-cover" />
                    <AvatarFallback className="text-[9px] font-bold bg-primary/10 text-primary">
                      {activeCompany.name?.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <Buildings size={20} />
                )}
                <span className="text-[9px] truncate max-w-[40px]">Empresa</span>
              </button>
            )
          })()}

          {menuItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.id)

            return (
              <NavLink
                key={item.id}
                to={getPath(item.id)}
                className={cn(
                  'flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-medium transition-all min-w-fit',
                  active
                    ? 'text-primary'
                    : 'text-muted-foreground'
                )}
              >
                <Icon size={20} weight={active ? 'fill' : 'regular'} />
                <span className="text-[9px]">{item.label}</span>
              </NavLink>
            )
          })}

          {/* Notification Bell - Mobile */}
          <NavLink
            to={getPath('notifications')}
            className={cn(
              'flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-medium transition-all min-w-fit relative',
              isActive('notifications')
                ? 'text-primary'
                : 'text-muted-foreground'
            )}
          >
            <div className="relative">
              <Bell size={20} weight={isActive('notifications') ? 'fill' : 'regular'} />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-2 h-4 min-w-[16px] px-0.5 flex items-center justify-center rounded-full bg-[#FF3B30] text-white text-[9px] font-bold pulse-notification notification-bounce shadow-sm">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <span className="text-[9px]">Alertas</span>
          </NavLink>
        </nav>
      </div>

      {/* Dialog para selector de empresa en móvil */}
      <Dialog open={showCompanySelector} onOpenChange={setShowCompanySelector}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Buildings size={20} />
              Cambiar Empresa
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {(companies || []).map(c => (
              <button
                key={c.id}
                onClick={() => {
                  onCompanyChange && onCompanyChange(c.id)
                  setShowCompanySelector(false)
                }}
                className={cn(
                  'w-full flex items-center gap-3 text-left px-3 py-2 rounded-lg text-sm transition-colors',
                  currentCompanyId === c.id
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                )}
              >
                <Avatar className="h-8 w-8 shrink-0 ring-1 ring-border">
                  {c.logo ? (
                    <AvatarImage src={c.logo} alt={c.name} className="object-cover" />
                  ) : (
                    <AvatarFallback className={cn(
                      'text-[10px] font-bold',
                      currentCompanyId === c.id ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'
                    )}>
                      {c.name?.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
                <span className="flex-1 truncate font-medium">{c.name}</span>
                {c.ownerId !== user?.id && (
                  <Badge variant="secondary" className={cn(
                    'text-[9px] border-none uppercase font-extrabold px-1.5 h-4 tracking-tighter shrink-0',
                    currentCompanyId === c.id ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'
                  )}>
                    {c.role === 'admin' ? 'Administrador' : c.role === 'owner' ? 'Propietario' : 'Colaborador'}
                  </Badge>
                )}
              </button>
            ))}
          </div>
          <div className="pt-2 mt-2 border-t border-border">
            <button
              onClick={() => {
                onLogout && onLogout()
                setShowCompanySelector(false)
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 transition-colors flex items-center gap-2"
            >
              <SignOut size={16} />
              Cerrar Sesión
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
