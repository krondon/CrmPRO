import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Calendar as CalendarIcon, Phone, Envelope, Users, CheckCircle, Spinner, CaretUpDown, Check } from '@phosphor-icons/react'
import { createTask, updateTask } from '@/supabase/services/tasks'
import { getLeads } from '@/supabase/services/leads'
import { getCompanyMembers } from '@/supabase/services/empresa'
import { createNotification } from '@/supabase/services/notifications'
import { Lead, Task } from '@/lib/types'
import { toast } from 'sonner'
import { mapDBToLead } from '@/hooks/useLeadsList'

interface AddTaskDialogProps {
    companyId: string
    trigger?: React.ReactNode
    onTaskCreated?: () => void
    open?: boolean
    onOpenChange?: (open: boolean) => void
    taskToEdit?: Task | null
}

export function AddTaskDialog({ companyId, trigger, onTaskCreated, open: controlledOpen, onOpenChange, taskToEdit }: AddTaskDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false)
    const isControlled = controlledOpen !== undefined
    const open = isControlled ? controlledOpen : internalOpen
    const setOpen = isControlled ? onOpenChange! : setInternalOpen

    const [loading, setLoading] = useState(false)
    const [leads, setLeads] = useState<Lead[]>([])
    const [members, setMembers] = useState<any[]>([]) // Using any for simplicity with Member structure

    // Form State
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [type, setType] = useState('call')
    const [priority, setPriority] = useState('medium')
    const [dueDate, setDueDate] = useState<Date | undefined>(new Date())
    const [leadId, setLeadId] = useState<string>('none')
    const [assignedTo, setAssignedTo] = useState<string>('me')
    const [openCombobox, setOpenCombobox] = useState(false)

    // Load Dependencies and Set Initial State for Edit
    useEffect(() => {
        if (open && companyId) {
            // Load Leads
            getLeads(companyId).then(data => {
                if (data) setLeads(data.map(mapDBToLead))
            })

            // Load Members
            getCompanyMembers(companyId).then(data => {
                if (data) setMembers(data)
            })
        }
    }, [open, companyId])

    useEffect(() => {
        if (open && taskToEdit) {
            setTitle(taskToEdit.title)
            setDescription(taskToEdit.description || '')
            setType(taskToEdit.type)
            setPriority(taskToEdit.priority)
            setDueDate(taskToEdit.dueDate ? new Date(taskToEdit.dueDate) : undefined)
            setLeadId(taskToEdit.leadId || 'none')
            setAssignedTo(taskToEdit.assignedTo || 'me')
        } else if (open && !taskToEdit) {
            // Reset if opening in create mode
            setTitle('')
            setDescription('')
            setType('call')
            setPriority('medium')
            setDueDate(new Date())
            setLeadId('none')
            setAssignedTo('me')
        }
    }, [open, taskToEdit])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!title.trim()) return toast.error('El título es obligatorio')
        if (!dueDate) return toast.error('La fecha es obligatoria')

        setLoading(true)
        try {
            if (taskToEdit) {
                await updateTask(taskToEdit.id, {
                    title,
                    description,
                    type,
                    priority: priority as any,
                    dueDate,
                    leadId: leadId === 'none' ? undefined : leadId,
                    assignedTo: assignedTo === 'me' ? undefined : assignedTo,
                })
                toast.success('Tarea actualizada')
            } else {
                await createTask({
                    title,
                    description,
                    type,
                    priority: priority as any,
                    dueDate,
                    leadId: leadId === 'none' ? undefined : leadId,
                    assignedTo: assignedTo === 'me' ? undefined : assignedTo,
                    empresaId: companyId
                })
                toast.success('Tarea creada exitosamente')
            }

            // Send notification if assigned to someone else
            if (assignedTo && assignedTo !== 'me') {
                const assignedMember = members.find(m => m.usuario_id === assignedTo)
                // If checking by ID fails, check by email (legacy/hybrid)
                const targetId = assignedMember?.usuario_id || assignedMember?.email || assignedTo

                if (targetId) {
                    await createNotification({
                        userId: targetId,
                        title: 'Nueva Tarea Asignada',
                        message: `Se te ha asignado la tarea: "${title}"`,
                        type: 'info',
                        link: '/dashboard'
                    })
                }
            }

            setOpen(false)
            onTaskCreated?.()
        } catch (error: any) {
            console.error('Error saving task:', error)
            toast.error('Error al guardar la tarea')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{taskToEdit ? 'Editar Tarea' : 'Nueva Tarea'}</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Título de la tarea</Label>
                        <Input
                            placeholder="Ej: Llamar a cliente..."
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            autoFocus
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Tipo</Label>
                            <Select value={type} onValueChange={setType}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="call">
                                        <div className="flex items-center gap-2"><Phone className="text-blue-500" /> Llamada</div>
                                    </SelectItem>
                                    <SelectItem value="email">
                                        <div className="flex items-center gap-2"><Envelope className="text-purple-500" /> Email</div>
                                    </SelectItem>
                                    <SelectItem value="meeting">
                                        <div className="flex items-center gap-2"><Users className="text-emerald-500" /> Reunión</div>
                                    </SelectItem>
                                    <SelectItem value="todo">
                                        <div className="flex items-center gap-2"><CheckCircle className="text-gray-500" /> To-Do</div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Prioridad</Label>
                            <Select value={priority} onValueChange={setPriority}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="low">Baja</SelectItem>
                                    <SelectItem value="medium">Media</SelectItem>
                                    <SelectItem value="high">Alta</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2 flex flex-col">
                            <Label>Fecha de vencimiento</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "pl-3 text-left font-normal",
                                            !dueDate && "text-muted-foreground"
                                        )}
                                    >
                                        {dueDate ? (
                                            format(dueDate, "PPP", { locale: es })
                                        ) : (
                                            <span>Seleccionar fecha</span>
                                        )}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={dueDate}
                                        onSelect={setDueDate}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="space-y-2">
                            <Label>Asignar a</Label>
                            <Select value={assignedTo} onValueChange={setAssignedTo}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="me">Mí mismo (sin asignar)</SelectItem>
                                    {members.map(member => (
                                        <SelectItem key={member.id} value={member.usuario_id || member.email}>
                                            {member.email}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2 flex flex-col">
                        <Label>Vincular a Oportunidad (Opcional)</Label>
                        <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={openCombobox}
                                    className="w-full justify-between font-normal"
                                >
                                    {leadId && leadId !== 'none'
                                        ? (() => {
                                            const l = leads.find((lead) => lead.id === leadId)
                                            return l ? `${l.name} ${l.company ? `- ${l.company}` : ''}` : "Seleccionar oportunidad..."
                                        })()
                                        : "Buscar oportunidad..."}
                                    <CaretUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                <Command>
                                    <CommandInput placeholder="Buscar oportunidad..." />
                                    <CommandList>
                                        <CommandEmpty>No se encontraron oportunidades.</CommandEmpty>
                                        <CommandGroup>
                                            <CommandItem
                                                value="none"
                                                onSelect={() => {
                                                    setLeadId('none')
                                                    setOpenCombobox(false)
                                                }}
                                            >
                                                <Check
                                                    className={cn(
                                                        "mr-2 h-4 w-4",
                                                        leadId === 'none' ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                                Ninguno
                                            </CommandItem>
                                            {leads.map((lead) => (
                                                <CommandItem
                                                    key={lead.id}
                                                    value={`${lead.name} ${lead.company || ''}`} // Use name+company for search
                                                    onSelect={() => {
                                                        setLeadId(lead.id)
                                                        setOpenCombobox(false)
                                                    }}
                                                >
                                                    <Check
                                                        className={cn(
                                                            "mr-2 h-4 w-4",
                                                            leadId === lead.id ? "opacity-100" : "opacity-0"
                                                        )}
                                                    />
                                                    {lead.name}
                                                    {lead.company && <span className="text-muted-foreground ml-2 text-xs"> - {lead.company}</span>}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="space-y-2">
                        <Label>Descripción / Notas</Label>
                        <textarea
                            className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="Detalles adicionales..."
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                        <Button type="submit" disabled={loading}>
                            {loading && <Spinner className="animate-spin mr-2" />}
                            {taskToEdit ? 'Guardar Cambios' : 'Crear Tarea'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
