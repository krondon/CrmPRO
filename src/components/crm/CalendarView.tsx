import { useState, useMemo, useEffect, useCallback } from 'react'
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    addMonths,
    subMonths,
    isToday,
    isBefore,
    addDays,
    startOfDay
} from 'date-fns'
import { es } from 'date-fns/locale'
import { Appointment, Lead } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AddMeetingDialog, AddMeetingFormData } from './leads/dialogs/AddMeetingDialog'
import { useAppointments } from '@/hooks/useAppointments'
import { getLeadsPaged } from '@/supabase/services/leads'
import { mapDBToLead } from '@/hooks/useLeadsList'
import { cn } from '@/lib/utils'
import {
    Plus,
    CaretLeft,
    CaretRight,
    CalendarBlank,
    ListBullets,
    Clock,
    User,
    VideoCamera,
    CheckCircle,
    XCircle,
    Trash,
} from '@phosphor-icons/react'


export function CalendarView({ companyId, user }: { companyId?: string, user?: any }) {

    // --- Estado ---
    const [currentDate, setCurrentDate] = useState(new Date()) // Fecha de navegación (mes visible)
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date()) // Fecha seleccionada (click)
    const [viewMode, setViewMode] = useState<'month' | 'agenda'>('month')
    const [showAddDialog, setShowAddDialog] = useState(false)

    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

    // --- Data Fetching ---
    const { appointments, fetchAppointments, removeAppointment, isLoading: isLoadingAppointments } = useAppointments(companyId || '')

    // Lightweight lead cache — only loads leads referenced by appointments
    const [leadCache, setLeadCache] = useState<Record<string, Lead>>({})
    useEffect(() => {
        if (!companyId || !appointments || appointments.length === 0) return
        const neededIds = [...new Set(appointments.map(a => a.leadId).filter(Boolean))]
        const missingIds = neededIds.filter(id => !leadCache[id])
        if (missingIds.length === 0) return

        getLeadsPaged({ empresaId: companyId, limit: 500, offset: 0, archived: false })
            .then(({ data }) => {
                const map: Record<string, Lead> = { ...leadCache }
                for (const d of (data || [])) {
                    const lead = mapDBToLead(d)
                    if (neededIds.includes(lead.id)) map[lead.id] = lead
                }
                setLeadCache(map)
            })
            .catch(() => { /* ignore */ })
    }, [companyId, appointments])

    // --- Helpers ---
    const handleAddMeeting = async () => {
        if (fetchAppointments) {
            await fetchAppointments()
        }
        setShowAddDialog(false)
    }

    const getLead = (leadId: string) => leadCache[leadId] || undefined

    const handleDeleteAppointment = async (id: string, e?: React.MouseEvent) => {
        e?.stopPropagation()
        if (confirmDeleteId === id) {
            await removeAppointment(id)
            setConfirmDeleteId(null)
        } else {
            setConfirmDeleteId(id)
            setTimeout(() => setConfirmDeleteId(prev => prev === id ? null : prev), 3000)
        }
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'scheduled': return 'bg-blue-100 text-blue-700 border-blue-200'
            case 'completed': return 'bg-green-100 text-green-700 border-green-200'
            case 'cancelled': return 'bg-red-100 text-red-700 border-red-200'
            default: return 'bg-gray-100 text-gray-700 border-gray-200'
        }
    }

    // --- Navegación ---
    const nextMonth = () => setCurrentDate(addMonths(currentDate, 1))
    const prevMonth = () => setCurrentDate(subMonths(currentDate, 1))
    const jumpToToday = () => {
        const now = new Date()
        setCurrentDate(now)
        setSelectedDate(now)
    }

    // --- Generación de Grid Mensual ---
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(monthStart)
    const startDate = startOfWeek(monthStart, { weekStartsOn: 0 }) // Domingo
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 })

    const calendarDays = useMemo(() => {
        return eachDayOfInterval({ start: startDate, end: endDate })
    }, [currentDate])

    const daysOfWeek = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

    const selectedDayAppointments = useMemo(() => {
        if (!selectedDate) return []
        return (appointments || []).filter(appt =>
            isSameDay(new Date(appt.startTime), selectedDate)
        ).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    }, [appointments, selectedDate])

    const upcomingAppointments = useMemo(() => {
        return (appointments || [])
            .filter(a => isBefore(new Date(), new Date(a.startTime)))
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
            .slice(0, 5)
    }, [appointments])

    // --- Componentes Render ---

    // Celda del Mes
    const renderDayCell = (day: Date, idx: number) => {
        const isCurrentMonth = isSameMonth(day, monthStart)
        const isTodayDate = isToday(day)
        const isSelected = selectedDate && isSameDay(day, selectedDate)

        const dayAppts = (appointments || []).filter(appt => isSameDay(new Date(appt.startTime), day))

        return (
            <div
                key={day.toString()}
                onClick={() => setSelectedDate(day)}
                className={cn(
                    "min-h-[100px] md:min-h-[120px] p-2 border-b border-r border-border/60 transition-colors cursor-pointer relative group flex flex-col gap-1",
                    !isCurrentMonth && "bg-muted/30 text-muted-foreground/50",
                    isSelected && "bg-primary/5 inset-ring inset-ring-primary/20",
                    "hover:bg-muted/50"
                )}
            >
                <div className="flex items-center justify-between mb-1">
                    <span className={cn(
                        "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
                        isTodayDate
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground group-hover:text-foreground",
                        isSelected && !isTodayDate && "bg-primary/10 text-primary font-bold"
                    )}>
                        {format(day, 'd')}
                    </span>
                    {dayAppts.length > 0 && (
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-md font-medium text-muted-foreground md:hidden">
                            {dayAppts.length}
                        </span>
                    )}
                </div>

                {/* Citas Desktop (Chips) */}
                <div className="hidden md:flex flex-col gap-1 overflow-hidden">
                    {dayAppts.slice(0, 3).map(appt => (
                        <div
                            key={appt.id}
                            className={cn(
                                "px-1.5 py-0.5 rounded text-[10px] font-medium truncate flex items-center gap-1 border border-l-[3px] group/chip relative",
                                appt.status === 'completed' ? "bg-green-50 border-green-200 border-l-green-500 text-green-700" :
                                    appt.status === 'cancelled' ? "bg-red-50 border-red-200 border-l-red-500 text-red-700" :
                                        "bg-blue-50 border-blue-200 border-l-blue-500 text-blue-700"
                            )}
                        >
                            <span className="shrink-0 font-bold">{format(new Date(appt.startTime), 'h:mmaaa')}</span>
                            <span className="truncate flex-1">{appt.title}</span>
                            <button
                                onClick={(e) => handleDeleteAppointment(appt.id, e)}
                                className={cn(
                                    "shrink-0 rounded p-0.5 transition-all",
                                    confirmDeleteId === appt.id
                                        ? "bg-red-500 text-white visible"
                                        : "invisible group-hover/chip:visible hover:bg-red-100 text-red-500"
                                )}
                                title={confirmDeleteId === appt.id ? 'Click para confirmar' : 'Eliminar cita'}
                            >
                                <Trash size={10} weight="bold" />
                            </button>
                        </div>
                    ))}
                    {dayAppts.length > 3 && (
                        <span className="text-[10px] text-muted-foreground pl-1 font-medium">
                            +{dayAppts.length - 3} más
                        </span>
                    )}
                </div>

                {/* Indicadores Mobile (Dots) */}
                <div className="flex md:hidden gap-0.5 mt-auto justify-center">
                    {dayAppts.slice(0, 4).map((_, i) => (
                        <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                    ))}
                </div>
            </div>
        )
    }

    // --- Main Render ---
    if (!companyId) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4">
                <CalendarBlank size={64} weight="duotone" />
                <p>Selecciona una empresa para ver el calendario</p>
            </div>
        )
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">

            {/* HEADER */}
            <header className="px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b shrink-0 bg-background/95 backdrop-blur z-20">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-primary/20 text-white">
                        <CalendarBlank size={24} weight="fill" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Calendario</h1>
                        <p className="text-sm text-muted-foreground hidden md:block">
                            Gestiona tus citas y reuniones con clientes
                        </p>
                    </div>
                    <div className="h-8 w-px bg-border mx-2 hidden md:block" />

                    {/* Controles de Vista */}
                    <div className="flex bg-muted/50 p-1 rounded-lg border">
                        <button
                            onClick={() => setViewMode('month')}
                            className={cn(
                                "px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2",
                                viewMode === 'month' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"
                            )}
                        >
                            <CalendarBlank size={16} /> Mes
                        </button>
                        <button
                            onClick={() => setViewMode('agenda')}
                            className={cn(
                                "px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2",
                                viewMode === 'agenda' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"
                            )}
                        >
                            <ListBullets size={16} /> Agenda
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                    {/* Navegación Mes */}
                    <div className="flex items-center bg-card border rounded-lg shadow-sm mr-2 ml-auto md:ml-0">
                        <Button variant="ghost" size="icon" onClick={prevMonth} className="h-9 w-9 text-muted-foreground hover:text-foreground">
                            <CaretLeft size={16} weight="bold" />
                        </Button>
                        <div className="px-3 min-w-[120px] text-center font-semibold text-sm">
                            {format(currentDate, 'MMMM yyyy', { locale: es }).replace(/^\w/, c => c.toUpperCase())}
                        </div>
                        <Button variant="ghost" size="icon" onClick={nextMonth} className="h-9 w-9 text-muted-foreground hover:text-foreground">
                            <CaretRight size={16} weight="bold" />
                        </Button>
                    </div>

                    <Button variant="outline" size="sm" onClick={jumpToToday} className="hidden md:flex">
                        Hoy
                    </Button>


                    <Button onClick={() => setShowAddDialog(true)} className="gap-2 shadow-md shadow-primary/20">
                        <Plus size={18} weight="bold" />
                        <span className="hidden md:inline">Nueva Cita</span>
                        <span className="md:hidden">Crear</span>
                    </Button>
                </div>
            </header>

            {/* CONTENIDO PRINCIPAL */}
            <div className="flex-1 flex overflow-hidden">

                {/* SIDEBAR (Desktop) */}
                <aside className="w-80 border-r bg-muted/10 hidden md:flex flex-col gap-6 p-6 overflow-y-auto shrink-0">

                    {/* Upcoming List */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Clock size={16} />
                            <h3 className="text-xs font-bold uppercase tracking-wider">Próximas Citas</h3>
                        </div>

                        {upcomingAppointments.length === 0 && (
                            <div className="p-4 rounded-lg border border-dashed text-center text-xs text-muted-foreground bg-muted/30">
                                No hay citas próximas
                            </div>
                        )}

                        <div className="space-y-2">
                            {upcomingAppointments.map(appt => (
                                <div key={appt.id} className="group flex items-start gap-3 p-3 rounded-xl bg-background border hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer" onClick={() => {
                                    setSelectedDate(new Date(appt.startTime))
                                    setCurrentDate(new Date(appt.startTime))
                                }}>
                                    <div className={cn(
                                        "w-1 self-stretch rounded-full",
                                        appt.status === 'scheduled' ? "bg-blue-500" : appt.status === 'completed' ? "bg-green-500" : "bg-red-500"
                                    )} />
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-sm font-semibold truncate text-foreground group-hover:text-primary transition-colors">{appt.title}</h4>
                                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                                            <CalendarBlank size={12} />
                                            <span>{format(new Date(appt.startTime), 'd MMM', { locale: es })}</span>
                                            <span className="text-border">|</span>
                                            <span>{format(new Date(appt.startTime), 'h:mm a')}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Resumen Diario Seleccionado (Si hay un día seleccionado con citas) */}
                    {selectedDate && selectedDayAppointments.length > 0 && (
                        <div className="mt-auto bg-primary/5 border border-primary/10 rounded-xl p-4">
                            <h4 className="font-bold text-primary mb-1">
                                {isToday(selectedDate) ? 'Hoy' : format(selectedDate, 'EEEE d', { locale: es })}
                            </h4>
                            <p className="text-sm opacity-80 mb-2">
                                {selectedDayAppointments.length} cita{selectedDayAppointments.length !== 1 && 's'} programada{selectedDayAppointments.length !== 1 && 's'}
                            </p>

                            <ScrollArea className="h-[120px]">
                                <div className="space-y-2 pr-2">
                                    {selectedDayAppointments.map(appt => (
                                        <div key={appt.id} className="flex gap-2 text-xs items-center group/side">
                                            <span className="font-mono text-muted-foreground shrink-0">{format(new Date(appt.startTime), 'HH:mm')}</span>
                                            <span className="truncate flex-1 font-medium">{appt.title}</span>
                                            <button
                                                onClick={(e) => handleDeleteAppointment(appt.id, e)}
                                                className={cn(
                                                    "shrink-0 rounded p-0.5 transition-all",
                                                    confirmDeleteId === appt.id
                                                        ? "bg-red-500 text-white visible"
                                                        : "invisible group-hover/side:visible hover:bg-red-100 text-red-500"
                                                )}
                                                title={confirmDeleteId === appt.id ? 'Click para confirmar' : 'Eliminar cita'}
                                            >
                                                <Trash size={12} weight="bold" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>
                    )}
                </aside>

                {/* MAIN VIEW AREA */}
                <main className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden relative">

                    {/* GRID MES */}
                    {viewMode === 'month' && (
                        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
                            {/* Header Días Semana */}
                            <div className="grid grid-cols-7 border-b bg-muted/40 shrink-0 sticky top-0 z-10">
                                {daysOfWeek.map(day => (
                                    <div key={day} className="py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        {day}
                                    </div>
                                ))}
                            </div>

                            {/* Grid Celdas */}
                            <div className="grid grid-cols-7 auto-rows-fr">
                                {calendarDays.map((day, idx) => renderDayCell(day, idx))}
                            </div>
                        </div>
                    )}

                    {/* AGENDA VIEW (Lista Limpia) */}
                    {viewMode === 'agenda' && (
                        <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-4xl mx-auto w-full">
                            <div className="space-y-6">
                                {appointments.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-center">
                                        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                                            <CalendarBlank size={32} className="text-muted-foreground" />
                                        </div>
                                        <h3 className="text-lg font-semibold">Sin citas programadas</h3>
                                        <p className="text-muted-foreground mt-1 max-w-xs mx-auto">Comienza agregando una nueva cita para organizar tu agenda.</p>
                                        <Button className="mt-4" onClick={() => setShowAddDialog(true)}>
                                            Agregar primera cita
                                        </Button>
                                    </div>
                                ) : (
                                    // Agrupar por Mes/Día
                                    Array.from(new Set(appointments.map(a => format(new Date(a.startTime), 'yyyy-MM')))).sort().map(monthKey => {
                                        const [year, month] = monthKey.split('-')
                                        const monthDate = new Date(parseInt(year), parseInt(month) - 1)
                                        const monthAppts = appointments
                                            .filter(a => format(new Date(a.startTime), 'yyyy-MM') === monthKey)
                                            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

                                        return (
                                            <div key={monthKey} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                                <div className="sticky top-0 bg-background/95 backdrop-blur py-2 z-10 flex items-center gap-4 mb-4 border-b">
                                                    <h2 className="text-lg font-bold text-foreground capitalize">
                                                        {format(monthDate, 'MMMM yyyy', { locale: es })}
                                                    </h2>
                                                    <Badge variant="secondary" className="rounded-full px-2">{monthAppts.length}</Badge>
                                                </div>

                                                <div className="grid gap-3">
                                                    {monthAppts.map(appt => {
                                                        const lead = getLead(appt.leadId)
                                                        return (
                                                            <div key={appt.id} className="group flex flex-col md:flex-row md:items-center gap-4 p-4 rounded-xl border bg-card hover:shadow-md transition-all hover:border-primary/30 relative overflow-hidden">
                                                                {/* Color de estado lateral */}
                                                                <div className={cn("absolute left-0 top-0 bottom-0 w-1",
                                                                    appt.status === 'scheduled' ? "bg-blue-500" :
                                                                        appt.status === 'completed' ? "bg-green-500" : "bg-red-500"
                                                                )} />

                                                                {/* Fecha Box */}
                                                                <div className="flex md:flex-col items-center md:justify-center gap-2 md:gap-0 px-2 md:w-20 shrink-0 text-center">
                                                                    <span className="text-xs font-bold text-muted-foreground uppercase">{format(new Date(appt.startTime), 'EEE', { locale: es })}</span>
                                                                    <span className="text-2xl font-black text-foreground">{format(new Date(appt.startTime), 'd')}</span>
                                                                </div>

                                                                {/* Info Principal */}
                                                                <div className="flex-1 min-w-0 pl-2">
                                                                    <div className="flex items-start justify-between gap-4">
                                                                        <div>
                                                                            <h3 className="font-semibold text-base group-hover:text-primary transition-colors">{appt.title}</h3>
                                                                            <p className="text-sm text-muted-foreground line-clamp-1">{appt.description || 'Sin descripción'}</p>
                                                                        </div>
                                                                        <Badge variant="outline" className={cn("capitalize shrink-0", getStatusColor(appt.status))}>
                                                                            {appt.status === 'scheduled' ? 'Programada' : appt.status}
                                                                        </Badge>
                                                                    </div>

                                                                    <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground/80">
                                                                        <div className="flex items-center gap-1.5 bg-muted/40 px-2 py-1 rounded-md">
                                                                            <Clock size={14} className="text-primary" />
                                                                            <span>
                                                                                {format(new Date(appt.startTime), 'h:mm a')} - {format(new Date(appt.endTime), 'h:mm a')}
                                                                            </span>
                                                                        </div>

                                                                        {lead && (
                                                                            <div className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer" title={`Ver lead: ${lead.name}`}>
                                                                                <User size={14} className="text-primary" />
                                                                                <span className="font-medium underline decoration-dotted">{lead.name}</span>
                                                                            </div>
                                                                        )}

                                                                        {appt.description && appt.description.toLowerCase().includes('meet') && (
                                                                            <div className="flex items-center gap-1.5 text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                                                                                <VideoCamera size={14} weight="fill" />
                                                                                <span className="font-medium text-xs">Reunión Virtual</span>
                                                                            </div>
                                                                        )}

                                                                        <button
                                                                            onClick={() => handleDeleteAppointment(appt.id)}
                                                                            className={cn(
                                                                                "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all ml-auto",
                                                                                confirmDeleteId === appt.id
                                                                                    ? "bg-red-500 text-white"
                                                                                    : "opacity-0 group-hover:opacity-100 hover:bg-red-50 text-red-500"
                                                                            )}
                                                                            title={confirmDeleteId === appt.id ? 'Click para confirmar' : 'Eliminar cita'}
                                                                        >
                                                                            <Trash size={14} weight="bold" />
                                                                            <span>{confirmDeleteId === appt.id ? 'Confirmar' : 'Eliminar'}</span>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        </div>
                    )}
                </main>

                {/* SHEET DETALLES (Mobile o Desktop Overlay para el futuro) */}
                {/* Podríamos agregar aquí un Sheet que se abra al seleccionar una cita para ver detalles completos */}

            </div>

            <AddMeetingDialog
                open={showAddDialog}
                onClose={() => setShowAddDialog(false)}
                onAdd={handleAddMeeting}
                empresaId={companyId || ''}
                defaultDate={selectedDate || new Date()}
            />


        </div>
    )
}