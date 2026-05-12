import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, CaretUpDown, Check } from '@phosphor-icons/react'
import { TeamMember, Role, PipelineType, Pipeline } from '@/lib/types'
import { getRoles } from '@/supabase/services/roles'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { getEquipos } from '@/supabase/services/equipos'
import { getPipelines } from '@/supabase/helpers/pipeline'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'

interface AddTeamMemberDialogProps {
  onAdd: (member: TeamMember) => void
  companyId?: string
  onInvitationCreated?: () => void // Callback para recargar invitaciones
}

export function AddTeamMemberDialog({ onAdd, companyId, onInvitationCreated }: AddTeamMemberDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('Representante de Ventas')

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // No permitir números
    if (/\d/.test(value)) return
    // Máximo 30 caracteres
    if (value.length > 30) return
    setName(value)
  }
  const [selectedRoleId, setSelectedRoleId] = useState<string>('viewer')
  const [selectedDbRoleId, setSelectedDbRoleId] = useState<string>('')
  const [selectedTeamId, setSelectedTeamId] = useState<string>('none')
  const [teams, setTeams] = useState<{ id: string; nombre_equipo: string }[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [dbPipelines, setDbPipelines] = useState<Pipeline[]>([])
  const [memberPipelines, setMemberPipelines] = useState<Set<PipelineType>>(new Set())

  const pipelineOptions = dbPipelines.map(p => ({ value: p.id, label: p.name }))

  const jobRoles = [
    { value: 'Representante de Ventas', label: 'Representante de Ventas' },
    { value: 'Gerente de Ventas', label: 'Gerente de Ventas' },
    { value: 'Agente de Soporte', label: 'Agente de Soporte' },
    { value: 'Gerente de Soporte', label: 'Gerente de Soporte' },
    { value: 'Ejecutivo de Cuentas', label: 'Ejecutivo de Cuentas' },
    { value: 'Desarrollo de Negocios', label: 'Desarrollo de Negocios' },
    { value: 'Éxito del Cliente', label: 'Éxito del Cliente' },
    { value: 'Administrador', label: 'Administrador' },
  ]

  const getRoleDisplayName = (name: string) => {
    const map: Record<string, string> = {
      'Admin': 'Administrador',
      'Viewer': 'Lector',
    }
    return map[name] || name
  }

  useEffect(() => {
    if (open && companyId) {
      getEquipos(companyId)
        .then((data: any) => setTeams(data || []))
        .catch(err => console.error('Error fetching teams:', err))

      void getPipelines(companyId)
        .then(({ data }) => {
          if (data) {
            const mappedPipelines: Pipeline[] = data.map((p: any) => ({
              id: p.id,
              name: p.nombre,
              type: p.nombre.toLowerCase().trim().replace(/\s+/g, '-'),
              stages: []
            }))
            setDbPipelines(mappedPipelines)
          }
        })
        .catch((err: any) => console.error('Error fetching pipelines:', err))

      // Cargar roles de la empresa desde la BD
      getRoles(companyId)
        .then(dbRoles => {
          setRoles(dbRoles)
          // Pre-seleccionar el rol Viewer por defecto si existe
          const viewerRole = dbRoles.find(r => r.name === 'Viewer' && r.isSystem)
          if (viewerRole) setSelectedDbRoleId(viewerRole.id)
        })
        .catch(err => console.error('Error fetching roles:', err))
    }
  }, [open, companyId])

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim()) {
      toast.error('Por favor completa todos los campos requeridos')
      return
    }

    // Validar que se seleccione un equipo (es obligatorio en el schema)
    if (!selectedTeamId || selectedTeamId === 'none') {
      toast.error('Debes seleccionar un equipo para enviar la invitación')
      return
    }

    const selectedPipelines = Array.from(memberPipelines)

    try {
      if (!companyId) {
        toast.error('No hay empresa seleccionada')
        return
      }

      const normalizedEmail = email.trim().toLowerCase()

      // Validación: evitar invitar correos ya miembros o ya invitados (pendientes)
      try {
        const [{ getCompanyMembers }, { getPendingInvitationsByCompany }] = await Promise.all([
          import('@/supabase/services/empresa'),
          import('@/supabase/services/invitations')
        ])

        const [members, pendingInvites] = await Promise.all([
          getCompanyMembers(companyId),
          getPendingInvitationsByCompany(companyId)
        ])

        const isAlreadyMember = (members || []).some((m: any) => (m.email || '').toLowerCase() === normalizedEmail)
        if (isAlreadyMember) {
          toast.error('Esa persona ya es miembro de la empresa')
          return
        }

        const alreadyInvited = (pendingInvites || []).some((inv: any) => (inv.invited_email || '').toLowerCase() === normalizedEmail)
        if (alreadyInvited) {
          toast.error('Ya existe una invitación pendiente para este correo')
          return
        }
      } catch (dupErr) {
        console.warn('[AddTeamMemberDialog] Advertencia al validar duplicados:', dupErr)
        // No bloqueamos si la validación previa falla; el backend reforzará la restricción
      }

      // Force import of the TS file if possible, or just rely on the build system
      const { createInvitation } = await import('@/supabase/services/invitations')

      console.log('[AddTeamMemberDialog] Enviando invitación con payload:', {
        equipo_id: selectedTeamId,
        empresa_id: companyId,
        invited_email: email.trim(),
        invited_nombre: name.trim(),
        invited_titulo_trabajo: role,
        pipeline_ids: selectedPipelines,
        permission_role: selectedRoleId
      })

      const result = await createInvitation({
        equipo_id: selectedTeamId,
        empresa_id: companyId,
        invited_email: normalizedEmail,
        invited_nombre: name.trim(),
        invited_titulo_trabajo: role,
        pipeline_ids: memberPipelines,
        permission_role: selectedRoleId,
        role_id: selectedDbRoleId || null
      })

      setName('')
      setEmail('')
      setRole('Representante de Ventas')
      setSelectedRoleId('viewer')
      setSelectedDbRoleId('')
      setSelectedTeamId('none')
      setMemberPipelines(new Set())
      setOpen(false)

      // Verificar si el email fue enviado o no
      const emailSent = result?.email?.sent === true
      if (emailSent) {
        toast.success('Invitación enviada', {
          description: 'Se envió un correo de invitación y una notificación en el CRM.'
        })
      } else {
        const reason = result?.email?.reason || ''
        toast.success('Invitación creada', {
          description: reason.includes('RESEND')
            ? 'La invitación se creó pero el correo no se pudo enviar (configura Resend). El usuario la verá en sus notificaciones del CRM.'
            : 'El usuario recibirá una notificación en su CRM.'
        })
      }

      // Llamar callback para recargar invitaciones
      if (onInvitationCreated) {
        onInvitationCreated()
      }
    } catch (e: any) {
      console.error('[AddTeamMemberDialog] error invitando', e)
      const msg = e.message || ''
      if (msg.includes('ya es miembro')) {
        toast.error('Este usuario ya es miembro de la empresa')
      } else if (msg.includes('invitación pendiente') || msg.includes('invitacion pendiente')) {
        toast.error('Ya existe una invitación pendiente para este correo. Cancélala primero si deseas reenviar.')
      } else if (msg.includes('owner')) {
        toast.error('No puedes invitar al dueño de la empresa')
      } else {
        toast.error(msg || 'Error al enviar invitación')
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2" size={20} />
          Agregar Miembro
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar Miembro al Equipo</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Invita a un usuario existente a tu equipo. Debe tener una cuenta registrada con este email.
          </p>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Nombre Completo *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                const val = e.target.value
                if (val.length <= 30 && !/\d/.test(val)) {
                  setName(val)
                }
              }}
              placeholder="Ej: María García"
            />
          </div>
          <div>
            <Label htmlFor="email">Correo Electrónico *</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@company.com"
            />
          </div>
          <div>
            <Label htmlFor="role">Cargo</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {jobRoles.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="permission-role">Rol de Permisos</Label>
            {roles.length > 0 ? (
              <Select
                value={selectedDbRoleId}
                onValueChange={(val) => {
                  setSelectedDbRoleId(val)
                  // Sync con selectedRoleId para compatibilidad
                  const role = roles.find(r => r.id === val)
                  if (role) {
                    setSelectedRoleId(role.name.toLowerCase() === 'admin' ? 'admin' : 'viewer')
                  }
                }}
              >
                <SelectTrigger id="permission-role">
                  <SelectValue placeholder="Selecciona un rol" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color }} />
                        {getRoleDisplayName(r.name)}
                        {r.isSystem && <span className="text-xs text-muted-foreground">(sistema)</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                <SelectTrigger id="permission-role">
                  <SelectValue placeholder="Selecciona un rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Lector (Lectura)</SelectItem>
                  <SelectItem value="admin">Administrador (Control Total)</SelectItem>
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Define los permisos de acceso para este miembro
            </p>
          </div>
          <div>
            <Label htmlFor="team">Equipo *</Label>
            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
              <SelectTrigger id="team">
                <SelectValue placeholder="Selecciona un equipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" disabled>Selecciona un equipo</SelectItem>
                {teams.map(team => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.nombre_equipo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              El equipo es obligatorio para enviar la invitación
            </p>
          </div>
          <div className="pt-2 border-t border-border">
            <Label className="mb-2 block">Pipelines del Miembro</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className={cn(
                    "w-full justify-between font-normal",
                    memberPipelines.size === 0 && "text-muted-foreground"
                  )}
                >
                  {memberPipelines.size > 0
                    ? `${memberPipelines.size} pipeline${memberPipelines.size > 1 ? 's' : ''} seleccionado${memberPipelines.size > 1 ? 's' : ''}`
                    : "Seleccionar pipelines"}
                  <CaretUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar pipeline..." />
                  <CommandList>
                    <CommandEmpty>No se encontraron pipelines.</CommandEmpty>
                    <CommandGroup>
                      {pipelineOptions.map((pipeline) => (
                        <CommandItem
                          key={pipeline.value}
                          value={pipeline.label}
                          onSelect={() => {
                            setMemberPipelines(prev => {
                              const next = new Set(prev)
                              if (next.has(pipeline.value)) next.delete(pipeline.value)
                              else next.add(pipeline.value)
                              return next
                            })
                          }}
                        >
                          <div className={cn(
                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                            memberPipelines.has(pipeline.value)
                              ? "bg-primary text-primary-foreground"
                              : "opacity-50 [&_svg]:invisible"
                          )}>
                            <Check className={cn("h-4 w-4")} />
                          </div>
                          {pipeline.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground mt-1">Opcional: podrás asignar pipelines después desde “Editar miembro”.</p>
          </div>
          <Button onClick={handleSubmit} className="w-full">Agregar Miembro al Equipo</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
