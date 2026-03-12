import { usePersistentState } from '@/hooks/usePersistentState'
import { useAuth } from '@/hooks/useAuth'
import { Task, Lead, Meeting, Notification as NotificationType, EmpresaMiembro as CompanyMember } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowRight, CalendarBlank, CaretDown, CheckCircle, Clock, Envelope, Funnel, Phone, Plus, ListChecks, Users, Vault, WarningCircle, X, PencilSimple, Microphone, Bell, DotsThree, CalendarCheck } from '@phosphor-icons/react'
import { format, isToday, isBefore, isAfter, startOfDay } from 'date-fns'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { AddTaskDialog } from './tasks/AddTaskDialog'
import { TaskHistoryDialog } from './tasks/TaskHistoryDialog'
import { ExpiredTasksDialog } from './tasks/ExpiredTasksDialog'
import { getLeads, getLeadsCount } from '@/supabase/services/leads'
import { getCompanyMembers, Company } from '@/supabase/services/empresa'
import { toast } from 'sonner'
import { getPipelines } from '@/supabase/helpers/pipeline'
import { getCompanyMeetings } from '@/supabase/services/reuniones'
import { getTasks, updateTask, deleteTask } from '@/supabase/services/tasks'

interface DashboardProps {
  companyId?: string
  companies?: Company[]
  onShowNotifications: () => void
  onNavigateToLead?: (lead: Lead) => void
}

export function Dashboard({ companyId, companies = [], onShowNotifications, onNavigateToLead }: DashboardProps) {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]) // New state for completed today
  // const [tasks] = usePersistentState<Task[]>(`tasks-${companyId}`, [])
  const [loading, setLoading] = useState(true)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [leads, setLeads] = useState<Lead[]>([])
  const [leadsCount, setLeadsCount] = useState(0)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [members, setMembers] = useState<CompanyMember[]>([])
  const [notifications] = usePersistentState<NotificationType[]>(`notifications-${companyId}`, [])
  const [pipelinesCount, setPipelinesCount] = useState(0)
  const [showExpiredTasks, setShowExpiredTasks] = useState(false)

  useEffect(() => {
    if (companyId) {
      // Cargar leads count
      getLeadsCount(companyId)
        .then((count: any) => {
          setLeadsCount(count || 0)
        })
        .catch(err => console.error('Error fetching leads count in Dashboard:', err))

      // Cargar leads para navegación
      getLeads(companyId)
        .then((data) => {
          if (data) {
            const { mapDBToLead } = require('@/hooks/useLeadsList')
            setLeads(data.map(mapDBToLead))
          }
        })
        .catch(err => console.error('Error fetching leads in Dashboard:', err))

      // Cargar pipelines para contar
      getPipelines(companyId)
        .then(({ data }) => {
          if (data) setPipelinesCount(data.length)
        })
        .catch(err => console.error('Error fetching pipelines in Dashboard:', err))

      // Cargar reuniones de la empresa
      getCompanyMeetings(companyId)
        .then(data => {
          setMeetings(data)
        })
        .catch(err => console.error('Error fetching meetings in Dashboard:', err))

      // Cargar tareas reales
      getTasks(companyId)
        .then(data => setTasks(data))
        .catch(err => console.error('Error fetching tasks:', err))

      // Cargar miembros
      getCompanyMembers(companyId)
        .then(data => setMembers(data || []))
        .catch(err => console.error('Error fetching members:', err))
    }
  }, [companyId])

  const refreshTasks = () => {
    if (companyId) {
      getTasks(companyId).then(data => setTasks(data))
    }
  }

  const handleCompleteTask = async (task: Task) => {
    console.log('Completing task:', task)
    const originalTasks = [...tasks]

    try {
      // Optimistic update
      setTasks(prev => prev.filter(t => t.id !== task.id))
      setCompletedTasks(prev => [{ ...task, status: 'completed', completedAt: new Date() }, ...prev])

      await updateTask(task.id, {
        status: 'completed',
        completedAt: new Date()
      })

      toast.success('Tarea completada')
    } catch (err) {
      console.error('Error completing task:', err)
      toast.error('Error al completar tarea: ' + (err as any).message)
      // Revert
      setTasks(originalTasks)
      setCompletedTasks(prev => prev.filter(t => t.id !== task.id))
    }
  }

  const handleDeleteTask = async (task: Task) => {
    const originalTasks = [...tasks]
    try {
      setTasks(prev => prev.filter(t => t.id !== task.id))
      await deleteTask(task.id)
      toast.success('Tarea eliminada')
    } catch (err) {
      console.error('Error deleting task:', err)
      toast.error('Error al eliminar tarea')
      setTasks(originalTasks)
    }
  }

  const handleClearExpiredTasks = async () => {
    const originalTasks = [...tasks]
    const expiredIds = overdueTasks.map(t => t.id)

    try {
      // Optimistic update
      setTasks(prev => prev.filter(t => !expiredIds.includes(t.id)))

      // Execute deletes in parallel
      await Promise.all(expiredIds.map(id => deleteTask(id)))

      toast.success('Tareas vencidas eliminadas')
      setShowExpiredTasks(false)
    } catch (err) {
      console.error('Error clearing expired tasks:', err)
      toast.error('Error al limpiar tareas')
      setTasks(originalTasks)
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const todayTasks = tasks.filter(t => {
    const taskDate = new Date(t.dueDate)
    taskDate.setHours(0, 0, 0, 0)
    return taskDate.getTime() === today.getTime() || (new Date(t.dueDate) < today) // Show overdue in today list too? Or separate? 
    // Let's keep original logic: today is today. Overdue is overdue.
  })

  // Correction: filtering logic was:
  // const myTasks = (tasks || []).filter(t => !t.completed) <--- "completed" property was boolean in mock/old type
  // New type uses status = 'pending' | 'completed'
  // But our getTasks service ALREADY filters for status='pending'. So 'tasks' state only has pending tasks.

  // So we just filter by date from 'tasks'
  const tasksForToday = tasks.filter(t => {
    const d = new Date(t.dueDate)
    d.setHours(0, 0, 0, 0)
    return d.getTime() === today.getTime()
  })

  // Overdue
  const tasksOverdue = tasks.filter(t => {
    const d = new Date(t.dueDate)
    d.setHours(0, 0, 0, 0)
    return d.getTime() < today.getTime()
  })
  const overdueTasks = tasksOverdue

  // Filtrar reuniones
  const todayStart = startOfDay(today)
  const todayEnd = new Date(today)
  todayEnd.setHours(23, 59, 59, 999)

  const upcomingMeetings = meetings.filter(m => {
    const mDate = new Date(m.date)
    return isToday(mDate) || isAfter(mDate, todayStart)
  })

  const expiredMeetings = meetings.filter(m => {
    const mDate = new Date(m.date)
    return isBefore(mDate, todayStart)
  })

  // Ordenar reuniones de hoy por hora
  upcomingMeetings.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Ordenar reuniones vencidas (más recientes primero)
  expiredMeetings.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const unreadNotifications = (notifications || []).filter(n => !n.read).length

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500/10 text-red-600 border-red-200'
      case 'medium': return 'bg-orange-500/10 text-orange-600 border-orange-200'
      case 'low': return 'bg-blue-500/10 text-blue-600 border-blue-200'
      default: return 'bg-gray-100 text-gray-600 border-gray-200'
    }
  }

  const getTaskIcon = (type: string) => {
    switch (type) {
      case 'call': return <Phone size={16} weight="duotone" className="text-blue-500" />
      case 'email': return <Envelope size={16} weight="duotone" className="text-purple-500" />
      case 'meeting': return <Users size={16} weight="duotone" className="text-emerald-500" />
      default: return <CheckCircle size={16} weight="duotone" className="text-gray-500" />
    }
  }

  const getAssigneeName = (id?: string) => {
    if (!id) return 'Sin asignar'
    const member = members.find(m => m.usuario_id === id)
    return member?.email || 'Desconocido'
  }

  const formatTime = (dateStr: string | Date) => {
    try {
      return format(new Date(dateStr), 'h:mm a')
    } catch {
      return ''
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-32 md:pb-8 space-y-8 bg-background/50">
      {/* Welcome Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          {(() => {
            const activeCompany = (companies || []).find(c => c.id === companyId)
            return (
              <>
                <Avatar className="h-16 w-16 md:h-20 md:w-20 shadow-xl ring-4 ring-background border-4 border-primary/10 animate-in zoom-in duration-500">
                  {activeCompany?.logo ? (
                    <AvatarImage src={activeCompany.logo} alt={activeCompany.name} className="object-cover" />
                  ) : (
                    <AvatarFallback className="text-2xl font-black bg-gradient-to-br from-primary to-primary/60 text-white">
                      {activeCompany?.name?.slice(0, 2).toUpperCase() || '??'}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className="space-y-3">
                  <h1 className="text-3xl md:text-5xl font-black tracking-tight text-foreground transition-all">
                    ¡Bienvenido, {user?.businessName || user?.email?.split('@')[0]}!
                  </h1>
                  <p className="text-muted-foreground font-medium text-sm md:text-base opacity-80 flex items-center gap-2">
                    {activeCompany ? (() => {
                      const role = activeCompany.ownerId === user?.id ? 'owner' : (activeCompany as any).role
                      const displayRole = role === 'admin' ? 'Admin' : (role === 'owner' || role === 'Owner') ? 'Propietario' : 'Lector'
                      const isOwner = displayRole === 'Propietario'
                      const isAdmin = displayRole === 'Admin'

                      return (
                        <Badge className={cn(
                          "font-black uppercase tracking-widest text-[10px] px-2 py-0.5 shadow-none border",
                          isOwner ? "bg-violet-500/10 text-violet-600 border-violet-200 dark:bg-violet-500/20 dark:text-violet-400 dark:border-violet-800" :
                            isAdmin ? "bg-blue-500/10 text-blue-600 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-800" :
                              "bg-muted text-muted-foreground border-border"
                        )}>
                          {displayRole}
                        </Badge>
                      )
                    })() : 'Esto es lo que está sucediendo hoy en tu negocio'}
                  </p>
                </div>
              </>
            )
          })()}
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={onShowNotifications}
            className="h-10 px-4 gap-2 rounded-xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all font-semibold relative"
          >
            <Bell size={20} weight="fill" />
            <span className="hidden sm:inline">Notificaciones</span>
            {unreadNotifications > 0 && (
              <Badge variant="destructive" className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] px-1 flex items-center justify-center bg-red-500 border-2 border-background text-[10px] font-bold">
                {unreadNotifications}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <Card className="border-none shadow-sm bg-gradient-to-br from-blue-500/10 to-transparent hover:shadow-md transition-shadow rounded-2xl overflow-hidden relative group">
          <div className="absolute top-[-10px] right-[-10px] opacity-10 group-hover:scale-110 transition-transform">
            <Funnel size={80} weight="fill" className="text-blue-500" />
          </div>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-widest text-blue-600/80">Pipelines</CardTitle>
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Funnel size={18} className="text-blue-600" weight="bold" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black">{pipelinesCount}</div>
            <p className="text-xs font-medium text-muted-foreground mt-1">Pipelines configurados</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-gradient-to-br from-purple-500/10 to-transparent hover:shadow-md transition-shadow rounded-2xl overflow-hidden relative group">
          <div className="absolute top-[-10px] right-[-10px] opacity-10 group-hover:scale-110 transition-transform">
            <Users size={80} weight="fill" className="text-purple-500" />
          </div>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-widest text-purple-600/80">Total Oportunidades</CardTitle>
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <Users size={18} className="text-purple-600" weight="bold" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black">{leadsCount}</div>
            <p className="text-xs font-medium text-muted-foreground mt-1">Oportunidades en seguimiento</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-gradient-to-br from-emerald-500/10 to-transparent hover:shadow-md transition-shadow rounded-2xl overflow-hidden relative group">
          <div className="absolute top-[-10px] right-[-10px] opacity-10 group-hover:scale-110 transition-transform">
            <Clock size={80} weight="fill" className="text-emerald-500" />
          </div>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-widest text-emerald-600/80">Tareas Hoy</CardTitle>
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <Clock size={18} className="text-emerald-600" weight="bold" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black">{tasksForToday.length}</div>
            <p className="text-xs font-medium text-muted-foreground mt-1">Pendientes por completar</p>
          </CardContent>
        </Card>

        <Card
          onClick={() => setShowExpiredTasks(true)}
          className="cursor-pointer border-none shadow-sm bg-gradient-to-br from-rose-500/10 to-transparent hover:shadow-md transition-shadow rounded-2xl overflow-hidden relative group"
        >
          <div className="absolute top-[-10px] right-[-10px] opacity-10 group-hover:scale-110 transition-transform">
            <WarningCircle size={80} weight="fill" className="text-rose-500" />
          </div>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-widest text-rose-600/80">Vencidas</CardTitle>
            <div className="p-2 bg-rose-500/10 rounded-lg">
              <WarningCircle size={18} className="text-rose-600" weight="bold" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-rose-600">{overdueTasks.length}</div>
            <p className="text-xs font-medium text-muted-foreground mt-1">Requieren atención urgente</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-2 gap-8 h-auto">
        {/* Tareas de Hoy */}
        {/* Tareas de Hoy */}
        <Card className="relative overflow-hidden shadow-sm flex flex-col h-full min-h-[350px] max-h-[500px]">
          <CardHeader className="flex flex-row items-center justify-between pb-2 shrink-0">
            <div>
              <CardTitle className="text-xl font-bold">Tareas de Hoy</CardTitle>
              <p className="text-sm text-muted-foreground">Tus objetivos para este día</p>
            </div>

            <div className="flex items-center gap-2">
              <TaskHistoryDialog
                companyId={companyId || ''}
                trigger={
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary" data-history-trigger>
                    <Clock size={20} weight="duotone" />
                  </Button>
                }
              />

              <AddTaskDialog
                open={isEditOpen}
                onOpenChange={setIsEditOpen}
                companyId={companyId || ''}
                onTaskCreated={refreshTasks}
                taskToEdit={editingTask}
              />

              <AddTaskDialog
                companyId={companyId || ''}
                onTaskCreated={refreshTasks}
                trigger={
                  <Button size="sm" className="bg-primary/10 text-primary hover:bg-primary/20 border-none shadow-none">
                    <Plus size={16} className="mr-1" /> Nueva Tarea
                  </Button>
                }
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-2 flex-1 overflow-hidden flex flex-col">
            {tasksForToday.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 opacity-60">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <CheckCircle size={32} className="text-muted-foreground" weight="thin" />
                </div>
                <div>
                  <p className="font-bold text-lg">¡Todo al día!</p>
                  <p className="text-sm text-muted-foreground">No tienes tareas pendientes para hoy</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent flex-1">
                {tasksForToday.map(task => (
                  <div key={task.id}
                    className="group flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-background/50 hover:bg-background hover:shadow-sm transition-all hover:-translate-y-0.5"
                  >

                    {/* Checkbox visual simulation -> Real Action */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm('¿Marcar tarea como completada?')) {
                          handleCompleteTask(task)
                        }
                      }}
                      className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 hover:border-primary hover:bg-primary/10 cursor-pointer flex items-center justify-center transition-colors shrink-0">
                      <CheckCircle size={12} weight="bold" className="text-primary opacity-0 hover:opacity-100" />
                    </div>

                    {/* Icon Box */}
                    <div className="h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                      {getTaskIcon(task.type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-sm truncate text-foreground">{task.title}</p>
                        <Badge variant="outline" className={cn('text-[9px] h-4 px-1 uppercase font-bold tracking-wider border', getPriorityColor(task.priority))}>
                          {task.priority}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                          {task.leadName && (
                            <>
                              <span className='font-medium text-foreground/90 text-[11px]'>{task.leadName}</span>
                              {task.leadCompany && <span className="text-[10px] opacity-70 ml-1">• {task.leadCompany}</span>}
                            </>
                          )}
                          {!task.leadName && <span className="italic opacity-50 text-[10px]">Sin Oportunidad Asignada</span>}
                        </span>
                        {/* Assignee & Description */}
                        {task.assignedTo && (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-medium ml-2 bg-indigo-500/10 text-indigo-600 border-indigo-100/50 hover:bg-indigo-500/20 shadow-sm border">
                            <Users size={10} className="mr-1" /> {getAssigneeName(task.assignedTo)}
                          </Badge>
                        )}
                        {!task.assignedTo && (
                          <span className="text-[10px] text-muted-foreground border-l pl-2 ml-2 flex items-center gap-1 opacity-50">
                            <Users size={10} /> Sin asignar
                          </span>
                        )}
                      </div>

                      {task.description && (
                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
                          {task.description}
                        </p>
                      )}
                    </div>

                    {/* Actions Hover Layer */}
                    <div className="flex items-center gap-1 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-primary"
                        onClick={() => {
                          setEditingTask(task)
                          setIsEditOpen(true)
                        }}
                        title="Editar tarea"
                      >
                        <PencilSimple size={14} weight="bold" />
                      </Button>
                    </div>

                  </div>
                ))}

                <Button variant="ghost" className="w-full text-xs text-muted-foreground hover:text-primary h-8 mt-2" onClick={() => document.querySelector<HTMLButtonElement>('[data-history-trigger]')?.click()}>
                  Ver historial completo <ArrowRight size={12} className="ml-1" />
                </Button>
              </div>
            )}

            {/* Completed Tasks Today Section - Minimized */}
            {completedTasks.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border/40">
                <h4 className="text-xs font-semibold text-muted-foreground mb-2 px-1 uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle size={12} /> Completadas recientemente
                </h4>
                <div className="space-y-2 opacity-70 hover:opacity-100 transition-opacity">
                  {completedTasks.slice(0, 3).map(task => (
                    <div key={task.id} className="flex items-center gap-3 p-2 rounded-lg border border-transparent bg-muted/20">
                      <div className="h-4 w-4 rounded-full bg-primary/20 flex items-center justify-center">
                        <CheckCircle size={10} className="text-primary" weight="fill" />
                      </div>
                      <span className="text-xs font-medium line-through text-muted-foreground">{task.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Próximas Citas */}
        <Card className="border-none shadow-sm rounded-2xl min-h-[350px] max-h-[420px] flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between flex-none">
            <div className="space-y-1">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                Próximas Citas
                {upcomingMeetings.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-primary/10 text-primary border-none font-bold">
                    {upcomingMeetings.length}
                  </Badge>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground">Tu agenda de próximas citas</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center">
              <CalendarBlank size={22} className="text-primary" weight="duotone" />
            </div>
          </CardHeader>
          <CardContent className="pt-2 flex-1 overflow-hidden">
            {upcomingMeetings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 opacity-60">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <CalendarBlank size={32} className="text-muted-foreground" weight="thin" />
                </div>
                <div>
                  <p className="font-bold text-lg">Agenda despejada</p>
                  <p className="text-sm text-muted-foreground">No hay citas programadas</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto max-h-full pr-1 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
                {upcomingMeetings.slice(0, 5).map(meeting => (
                  <div key={meeting.id} className="flex items-center gap-3 p-3 rounded-xl border border-transparent bg-muted/30 hover:bg-muted/50 transition-all">
                    <div className="w-10 h-10 rounded-lg bg-background flex flex-col items-center justify-center shadow-sm border border-muted-foreground/10 shrink-0">
                      <span className="text-[9px] font-bold text-primary uppercase leading-none">{format(new Date(meeting.date), 'MMM')}</span>
                      <span className="text-sm font-black leading-none mt-0.5">{format(new Date(meeting.date), 'd')}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{meeting.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-primary font-bold flex items-center gap-1">
                          <Clock size={10} weight="bold" />
                          {formatTime(meeting.date)} · {meeting.duration}min
                        </span>
                        {meeting.participants && meeting.participants.length > 0 && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Users size={10} />
                            {meeting.participants.slice(0, 2).map(p => p.name).join(', ')}
                            {meeting.participants.length > 2 && ` +${meeting.participants.length - 2}`}
                          </span>
                        )}
                      </div>
                    </div>
                    {onNavigateToLead && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[10px] text-muted-foreground hover:text-primary shrink-0"
                        onClick={async () => {
                          const leadData = leads.find(l => l.id === meeting.leadId)
                          if (leadData) {
                            onNavigateToLead(leadData)
                          } else {
                            try {
                              const { getLeadById } = await import('@/supabase/services/leads')
                              const dbLead = await getLeadById(meeting.leadId)
                              if (dbLead) {
                                const { mapDBToLead } = await import('@/hooks/useLeadsList')
                                onNavigateToLead(mapDBToLead(dbLead))
                              }
                            } catch (err) {
                              console.error('Error loading lead:', err)
                            }
                          }
                        }}
                      >
                        Ver Oportunidad
                      </Button>
                    )}
                  </div>
                ))}
                {upcomingMeetings.length > 5 && (
                  <p className="text-center text-[11px] text-muted-foreground py-1 font-medium">
                    +{upcomingMeetings.length - 5} citas más · Ver en Calendario
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reuniones Vencidas */}
        {expiredMeetings.length > 0 && (
          <Card className="border-none shadow-sm rounded-2xl min-h-[300px] lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="text-xl font-bold text-muted-foreground">Reuniones Anteriores</CardTitle>
                <p className="text-xs text-muted-foreground">Historial reciente de citas pasadas</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-muted/20 flex items-center justify-center">
                <Clock size={22} className="text-muted-foreground" weight="duotone" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {expiredMeetings.slice(0, 6).map(meeting => (
                  <div key={meeting.id} className="flex flex-col gap-2 p-3 rounded-xl border border-border/40 bg-background/40 opacity-70 hover:opacity-100 transition-all">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-bold text-sm truncate">{meeting.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {format(new Date(meeting.date), 'MMM d, h:mm a')}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[9px] uppercase tracking-wider">
                        Finalizada
                      </Badge>
                    </div>
                    {meeting.participants && meeting.participants.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {meeting.participants.slice(0, 2).map(p => (
                          <div key={p.id} className="text-[10px] text-muted-foreground flex items-center gap-1 bg-muted/50 px-1.5 py-0.5 rounded-md">
                            <Users size={10} /> {p.name}
                          </div>
                        ))}
                        {meeting.participants.length > 2 && (
                          <span className="text-[10px] text-muted-foreground">+{meeting.participants.length - 2}</span>
                        )}
                        {onNavigateToLead && (
                          <div className="mt-1 flex justify-end w-full">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-2 text-[9px] text-muted-foreground hover:text-primary"
                              onClick={async () => {
                                const leadData = leads.find(l => l.id === meeting.leadId)
                                if (leadData) {
                                  onNavigateToLead(leadData)
                                } else {
                                  // Fetch from DB if not in current list
                                  try {
                                    const { getLeadById } = await import('@/supabase/services/leads')
                                    const dbLead = await getLeadById(meeting.leadId)
                                    if (dbLead) {
                                      const { mapDBToLead } = await import('@/hooks/useLeadsList')
                                      onNavigateToLead(mapDBToLead(dbLead))
                                    }
                                  } catch (err) {
                                    console.error('Error loading lead:', err)
                                  }
                                }
                              }}
                            >
                              Ir a la oportunidad
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <ExpiredTasksDialog
        open={showExpiredTasks}
        onOpenChange={setShowExpiredTasks}
        tasks={overdueTasks}
        onCompleteTask={handleCompleteTask}
        onEditTask={(task) => {
          setEditingTask(task)
          setIsEditOpen(true)
          setShowExpiredTasks(false) // Close list, open edit
        }}
        onDeleteTask={handleDeleteTask}
        onClearAll={handleClearExpiredTasks}
      />
    </div>
  )
}

