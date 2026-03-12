// import { useKV } from '@github/spark/hooks'
import { TeamMember, Task, Role, Lead } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { AddTeamMemberDialog } from './AddTeamMemberDialog'
import { Button } from '@/components/ui/button'
import { Trash, Building, Info, Funnel, Users, XCircle, CaretDown, CaretUp, MagnifyingGlass, CheckCircle, Clock, UserPlus } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useEffect, useState } from 'react'
import { createEquipo, deleteEquipo, getEquipos } from '@/supabase/services/equipos'
import { getPersonas, createPersona, deletePersona } from '@/supabase/services/persona'
import { getPipelines } from '@/supabase/helpers/pipeline'
import { addPersonaToPipeline, getPipelinesForPersona } from '@/supabase/helpers/personaPipeline'
import { getLeads } from '@/supabase/services/leads'
import { getSolicitudesPendientes, aprobarSolicitud, rechazarSolicitud } from '@/supabase/services/solicitudes'
import type { SolicitudUnionDB } from '@/lib/types'
import { supabase } from '@/supabase/client'
import { Input } from '@/components/ui/input'
import { AllLeadsDialog } from './AllLeadsDialog'
import { MemberSearchDialog } from './MemberSearchDialog'
import { TeamManagerDialog } from './TeamManagerDialog'

type Equipo = { id: string; nombre_equipo: string; empresa_id: string; created_at: string }

import { Company } from './CompanyManagement'
import { EditTeamMemberDialog } from './EditTeamMemberDialog'

export function TeamView({ companyId, companies = [], currentUserId, currentUserEmail }: { companyId?: string; companies?: Company[]; currentUserId?: string; currentUserEmail?: string }) {
  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="bg-muted/50 p-6 rounded-full mb-4">
          <Building size={64} className="text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold mb-2">No hay empresa seleccionada</h2>
        <p className="text-muted-foreground max-w-md mb-6">
          Debes crear o seleccionar una empresa para gestionar tu equipo.
        </p>
      </div>
    )
  }

  const currentCompany = companies.find(c => c.id === companyId)
  const userRole = currentCompany?.role || 'viewer'
  const isOwnerById = currentUserId && currentCompany?.ownerId === currentUserId
  const isAdminOrOwner = userRole === 'admin' || userRole === 'owner' || isOwnerById

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  // leads y roles ahora se inicializan como arrays vacíos, y deben obtenerse de la BD si se requiere
  const [leads, setLeads] = useState<Lead[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [dbPipelines, setDbPipelines] = useState<any[]>([])
  const [newTeamName, setNewTeamName] = useState('')
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string | null>(null) // null = all, 'no-team' = unassigned, uuid = specific team
  const [refreshTrigger, setRefreshTrigger] = useState(0) // Disparar recarga de invitaciones
  const [teamSearch, setTeamSearch] = useState('')
  const [memberSearch, setMemberSearch] = useState('')
  const [showAllTeams, setShowAllTeams] = useState(false)
  const [solicitudesPendientes, setSolicitudesPendientes] = useState<SolicitudUnionDB[]>([])
  const [approvedMembers, setApprovedMembers] = useState<{ id: string; email: string; nombre: string | null; role: string; created_at: string }[]>([])

  useEffect(() => {
    if (!companyId) return
    let cancelled = false

    getPipelines(companyId).then(({ data }) => {
      if (!cancelled && data) setDbPipelines(data)
    })

    return () => { cancelled = true }
  }, [companyId])

  // Cargar solicitudes pendientes (solo owner/admin)
  useEffect(() => {
    if (!companyId || !isAdminOrOwner) return
    let cancelled = false
    getSolicitudesPendientes(companyId).then(data => {
      if (!cancelled) setSolicitudesPendientes(data)
    }).catch(() => { })

    return () => { cancelled = true }
  }, [companyId, isAdminOrOwner])

  // Cargar miembros aprobados desde empresa_miembros (efecto independiente para evitar race condition con isAdminOrOwner)
  useEffect(() => {
    if (!companyId) return
    let cancelled = false

    supabase
      .from('empresa_miembros')
      .select('id, email, role, created_at')
      .eq('empresa_id', companyId)
      .then(({ data, error }) => {
        console.log('[TeamView] empresa_miembros data:', data, 'error:', error)
        if (!cancelled && data) {
          setApprovedMembers(data.map((m: any) => ({
            id: m.id,
            email: m.email,
            nombre: null,
            role: m.role || 'viewer',
            created_at: m.created_at
          })))
        }
      })
      .catch((e) => console.error('[TeamView] error cargando miembros aprobados:', e))

    return () => { cancelled = true }
  }, [companyId])

  useEffect(() => {
    if (!companyId) return
    let cancelled = false

      ; (async () => {
        try {
          const data = await getEquipos(companyId)
          if (!cancelled) setEquipos(data as any)
        } catch (e: any) {
          console.error('[TeamView] error cargando equipos', e)
        }
      })()

    return () => { cancelled = true }
  }, [companyId])

  useEffect(() => {
    if (!companyId) return
    let cancelled = false

    getLeads(companyId, currentUserId, isAdminOrOwner)
      .then((data: any) => {
        if (cancelled) return
        const mappedLeads = data.map((l: any) => ({
          id: l.id,
          name: l.nombre_completo,
          email: l.correo_electronico,
          phone: l.telefono,
          company: l.empresa,
          budget: l.presupuesto,
          stage: l.etapa_id,
          pipeline: l.pipeline_id,
          priority: l.prioridad,
          assignedTo: l.asignado_a,
          tags: [],
          createdAt: new Date(l.created_at),
          lastContact: new Date(l.created_at)
        }))
        setLeads(mappedLeads)
      })
      .catch(err => console.error('[TeamView] Error loading leads:', err))

    return () => { cancelled = true }
  }, [companyId])

  useEffect(() => {
    if (!companyId) return
    let cancelled = false

      ; (async () => {
        try {
          // Si hay filtro de equipo, solo ese; si no, todos de la empresa
          let personas: any[] = []
          if (selectedTeamFilter && selectedTeamFilter !== 'no-team') {
            personas = await getPersonas(selectedTeamFilter)
          } else {
            // Obtener todos los equipos y concatenar miembros
            const equiposIds = equipos.map(e => e.id)
            const allPersonas = await Promise.all(equiposIds.map(id => getPersonas(id)))
            personas = allPersonas.flat()
          }

          // Si ya cambió la empresa, no continuar
          if (cancelled) return

          // Obtener invitaciones pendientes
          const { getPendingInvitationsByCompany } = await import('@/supabase/services/invitations')
          const pendingInvites = await getPendingInvitationsByCompany(companyId)
          console.log('[TeamView] pendingInvites raw:', pendingInvites)

          if (cancelled) return

          // Obtener roles de miembros activos
          const { getCompanyMembers } = await import('@/supabase/services/empresa')
          const companyMembers = await getCompanyMembers(companyId)

          if (cancelled) return

          const mappedPending = pendingInvites.map((inv: any) => {
            const resolvedPipelines = (inv.pipeline_ids || []).map((pid: string) => {
              const found = dbPipelines.find(p => p.id === pid)
              return found ? found.nombre : pid
            })

            return {
              id: inv.id,
              name: inv.invited_nombre || inv.invited_email,
              email: inv.invited_email,
              role: inv.invited_titulo_trabajo || 'Pending',
              pipelines: resolvedPipelines,
              avatar: '',
              status: 'pending',
              permissionRole: inv.permission_role || 'viewer'
            }
          })

          const mapped = await Promise.all(personas.map(async p => {
            let memberPipelines: string[] = []
            try {
              const { data: pPipelines } = await getPipelinesForPersona(p.id)
              if (pPipelines) {
                memberPipelines = pPipelines.map((pp: any) => {
                  const found = dbPipelines.find(dbp => dbp.id === pp.pipeline_id)
                  return found ? found.nombre : pp.pipeline_id
                })
              }
            } catch (err) {
              console.error('Error loading pipelines for persona', p.id, err)
            }

            // Buscar rol en empresa_miembros
            // Intentamos coincidir por usuario_id si existe, o por email
            const memberInfo = companyMembers?.find((m: any) =>
              (p.usuario_id && m.usuario_id === p.usuario_id) ||
              (m.email && p.email && m.email.toLowerCase() === p.email.toLowerCase())
            )

            return {
              id: p.id,
              name: p.nombre,
              email: p.email,
              avatar: '',
              role: p.titulo_trabajo || '',
              teamId: p.equipo_id || undefined,
              pipelines: memberPipelines,
              permissionRole: memberInfo?.role || 'viewer',
              userId: p.usuario_id
            }
          }))

          // Verificar cancelación antes de actualizar estado
          if (cancelled) return

          const mappedMembers = mapped.map((m: any) => ({
            ...m,
            status: 'active'
          }))

          setTeamMembers([...mappedMembers, ...mappedPending])
        } catch (e: any) {
          console.error('[TeamView] error cargando miembros', e)
        }
      })()

    return () => { cancelled = true }
  }, [companyId, equipos, selectedTeamFilter, dbPipelines, refreshTrigger])


  // Si necesitas cargar leads y roles desde la BD, agrega aquí los efectos y servicios
  const NIL_UUID = '00000000-0000-0000-0000-000000000000'
  const getAssignedLeadsCount = (memberId: string, status?: string) => {
    const ownLeads = leads.filter(l => l.assignedTo === memberId).length
    // Si el miembro está pendiente, no contar los leads asignados a "todos"
    if (status === 'pending') return ownLeads

    const allLeads = leads.filter(l => l.assignedTo === NIL_UUID || l.assignedTo === 'todos').length
    return ownLeads + allLeads
  }

  const getRoleInfo = (roleId?: string) => {
    if (!roleId) return null
    return roles.find(r => r.id === roleId)
  }

  const handleAddMember = async (member: TeamMember) => {
    try {
      const inserted = await createPersona({
        nombre: member.name,
        email: member.email,
        titulo_trabajo: member.role,
        equipo_id: member.teamId || null,
        permisos: []
      })

      // Guardar pipelines
      if (member.pipelines && member.pipelines.length > 0) {
        for (const pipelineVal of member.pipelines) {
          // Verificamos si es un UUID válido
          const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pipelineVal)

          if (isUUID) {
            await addPersonaToPipeline({
              persona_id: inserted.id,
              pipeline_id: pipelineVal
            })
          } else {
            // Si no es UUID (ej: 'sales'), intentamos buscarlo en los pipelines de la BD por nombre o tipo si existiera
            // Esto es un "best effort" por si acaso existen pipelines con esos nombres
            const found = dbPipelines.find(p => p.nombre.toLowerCase() === pipelineVal.toLowerCase())
            if (found) {
              await addPersonaToPipeline({
                persona_id: inserted.id,
                pipeline_id: found.id
              })
            }
          }
        }
      }

      // Resolver nombres de pipelines para visualización local
      const resolvedPipelines = (member.pipelines || []).map(pVal => {
        // Si es uno de los defaults, lo dejamos tal cual
        if (['sales', 'support', 'administrative'].includes(pVal)) return pVal

        // Si es UUID, buscamos en dbPipelines
        const found = dbPipelines.find(p => p.id === pVal)
        if (found) return found.nombre

        // Si no encontramos, devolvemos el valor original (fallback)
        return pVal
      })

      const mapped: TeamMember = {
        id: inserted.id,
        name: inserted.nombre,
        email: inserted.email,
        avatar: '',
        role: inserted.titulo_trabajo || '',
        teamId: inserted.equipo_id || undefined,
        pipelines: resolvedPipelines // Usamos los nombres resueltos
      }
      setTeamMembers((current) => [...(current || []), mapped])
      toast.success('Miembro guardado')
    } catch (e: any) {
      console.error('[TeamView] error creando persona', e)
      toast.error(e.message || 'No se pudo crear el miembro')
    }
  }

  const handleDeleteMember = async (memberId: string) => {
    if (!isAdminOrOwner) {
      toast.error('No tienes permisos para eliminar miembros')
      return
    }

    const member: any = (teamMembers || []).find(m => m.id === memberId)
    if (!member) return

    // Confirmación antes de eliminar
    if (!confirm(`¿Estás seguro de que quieres eliminar a ${member.name || 'este usuario'} de la empresa? Esta acción eliminará su acceso y membresía.`)) {
      return
    }

    try {
      // Detectar si es una invitación pendiente
      if (member.status === 'pending') {
        const { cancelInvitation } = await import('@/supabase/services/invitations')
        await cancelInvitation(memberId)
        setTeamMembers((current) => (current || []).filter(m => m.id !== memberId))
        toast.success('Invitación cancelada y eliminada del CRM del invitado')
        return
      }

      // Eliminar de empresa_miembros y persona
      const { removeMemberFromCompany } = await import('@/supabase/services/empresa')
      if (member.email && companyId) {
        await removeMemberFromCompany(companyId, member.email)
        toast.success('Miembro eliminado de la empresa y equipos')
      } else {
        // Fallback
        await deletePersona(memberId)
        toast.success('Miembro eliminado de la base de datos')
      }

      setTeamMembers((current) => (current || []).filter(m => m.id !== memberId))
    } catch (e: any) {
      console.error('[TeamView] error eliminando persona', e)
      toast.error(e.message || 'No se pudo eliminar el miembro')
    }
  }

  const handleCreateEquipo = async (nombre?: string) => {
    const teamName = nombre || newTeamName.trim()
    if (!teamName || !companyId) return toast.error('Nombre requerido')
    try {
      // Usamos "name" por posible ausencia de columna "nombre" en la tabla real
      const inserted = await createEquipo({ nombre_equipo: teamName, empresa_id: companyId })
      setEquipos((curr) => [inserted as any, ...(curr || [])])
      setNewTeamName('')
      toast.success('Equipo creado y guardado')
    } catch (e: any) {
      console.error('[TeamView] error creando equipo', e)
      toast.error(e.message || 'No se pudo crear el equipo')
    }
  }

  const handleDeleteEquipo = async (id: string) => {
    try {
      await deleteEquipo(id)
      setEquipos((curr) => (curr || []).filter(e => e.id !== id))
      toast.success('Equipo eliminado')
    } catch (e: any) {
      console.error('[TeamView] error eliminando equipo', e)
      toast.error(e.message || 'No se pudo eliminar el equipo')
    }
  }

  const filteredTeams = (equipos || []).filter(eq =>
    eq.nombre_equipo.toLowerCase().includes(teamSearch.toLowerCase())
  )
  const visibleTeams = showAllTeams ? filteredTeams : filteredTeams.slice(0, 5)

  const filteredMembers = (teamMembers || []).filter(member => {
    // Filter by team
    if (selectedTeamFilter !== null) {
      if (selectedTeamFilter === 'no-team') {
        if (member.teamId) return false
      } else {
        if (member.teamId !== selectedTeamFilter) return false
      }
    }

    // Filter by search
    if (memberSearch) {
      const searchLower = memberSearch.toLowerCase()
      return (
        member.name.toLowerCase().includes(searchLower) ||
        member.email.toLowerCase().includes(searchLower)
      )
    }

    return true
  })

  return (
    <div className="flex-1 overflow-y-auto p-6 pb-24 md:pb-6 space-y-6">
      {/* Barra de herramientas superior */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-1.5 rounded-full bg-gradient-to-b from-primary via-primary/60 to-primary/20" />
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tighter">Equipo</h1>
            <p className="text-muted-foreground/70 text-sm font-medium">Gestión de equipos y asignaciones</p>
          </div>
        </div>

        {/* Botones principales */}
        <div className="flex items-center gap-2 flex-wrap">
          <MemberSearchDialog
            members={teamMembers}
            equipos={equipos}
            onSelectMember={(member) => {
              // Scroll to member card (podrías implementar esto si quieres)
              console.log('Selected member:', member)
            }}
            onFilterByTeam={(teamId) => setSelectedTeamFilter(teamId)}
          />

          <TeamManagerDialog
            equipos={equipos}
            selectedTeamFilter={selectedTeamFilter}
            onCreateTeam={async (nombre) => {
              await handleCreateEquipo(nombre)
            }}
            onDeleteTeam={async (id) => {
              await handleDeleteEquipo(id)
            }}
            onSelectFilter={setSelectedTeamFilter}
            isAdminOrOwner={isAdminOrOwner}
          />

          {isAdminOrOwner && (
            <AddTeamMemberDialog
              onAdd={handleAddMember}
              companyId={companyId}
              onInvitationCreated={() => setRefreshTrigger(prev => prev + 1)}
            />
          )}
        </div>
      </div>

      {/* Indicador de filtro activo */}
      {selectedTeamFilter && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-2 rounded-full px-3 bg-primary/10 text-primary border border-primary/20">
            <Funnel size={13} />
            Filtrando por: {selectedTeamFilter === 'no-team' ? 'Sin Equipo' : equipos.find(e => e.id === selectedTeamFilter)?.nombre_equipo || 'Equipo'}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedTeamFilter(null)}
            className="h-7 text-muted-foreground hover:text-foreground"
          >
            <XCircle size={14} className="mr-1" />
            Limpiar filtro
          </Button>
        </div>
      )}

      {/* Panel de solicitudes pendientes (solo owner/admin) */}
      {isAdminOrOwner && solicitudesPendientes.length > 0 && (
        <Card className="border-yellow-500/30 bg-yellow-50/50 dark:bg-yellow-950/10 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus size={18} className="text-yellow-600" />
              Solicitudes de unión ({solicitudesPendientes.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {solicitudesPendientes.map(sol => (
              <div key={sol.id} className="flex items-center justify-between p-3 rounded-lg border bg-background">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{sol.solicitante_nombre || sol.solicitante_email}</p>
                  {sol.mensaje && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">"{sol.mensaje}"</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <Clock size={12} className="inline mr-1" />
                    {new Date(sol.created_at).toLocaleDateString('es-ES')}
                  </p>
                </div>
                <div className="flex gap-2 ml-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 h-8"
                    onClick={async () => {
                      try {
                        await rechazarSolicitud(sol.id)
                        setSolicitudesPendientes(prev => prev.filter(s => s.id !== sol.id))
                        toast.success('Solicitud rechazada')
                      } catch { toast.error('Error al rechazar') }
                    }}
                  >
                    <XCircle size={14} className="mr-1" />
                    Rechazar
                  </Button>
                  <Button
                    size="sm"
                    className="h-8"
                    onClick={async () => {
                      try {
                        await aprobarSolicitud(sol.id, 'viewer')
                        setSolicitudesPendientes(prev => prev.filter(s => s.id !== sol.id))
                        toast.success('Solicitud aprobada — se ha añadido al equipo')
                        setRefreshTrigger(prev => prev + 1)
                      } catch { toast.error('Error al aprobar') }
                    }}
                  >
                    <CheckCircle size={14} className="mr-1" />
                    Aprobar
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Vista de equipos mejorada */}
      <div className="rounded-xl border border-border/30 p-4 space-y-3 bg-muted/5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">Equipos</h2>
          <div className="flex gap-2">
            <Button
              variant={selectedTeamFilter === null ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedTeamFilter(null)}
            >
              <Users className="mr-2" size={16} />
              Todos
            </Button>
            <Button
              variant={selectedTeamFilter === 'no-team' ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedTeamFilter('no-team')}
            >
              Sin Equipo
            </Button>
          </div>
        </div>

        {/* Mostrar primeros 4 equipos */}
        <div className="grid gap-2">
          {equipos.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay equipos creados
            </p>
          )}
          {equipos.slice(0, 4).map(eq => (
            <div
              key={eq.id}
              className={`flex items-center justify-between rounded-xl p-3 transition-all duration-200 border-l-[3px] ${selectedTeamFilter === eq.id
                ? 'bg-primary/5 border-l-primary shadow-sm'
                : 'hover:bg-muted/30 border-l-border hover:border-l-muted-foreground/40'
                }`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{eq.nombre_equipo}</div>
                <div className="text-xs text-muted-foreground">
                  Creado: {new Date(eq.created_at).toLocaleDateString('es-ES')}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <Button
                  variant={selectedTeamFilter === eq.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedTeamFilter(selectedTeamFilter === eq.id ? null : eq.id)}
                >
                  <Funnel size={14} className={selectedTeamFilter === eq.id ? "mr-1" : "sm:mr-1"} />
                  <span className="hidden sm:inline">{selectedTeamFilter === eq.id ? 'Filtrando' : 'Filtrar'}</span>
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Botón "Ver más" si hay más de 4 equipos */}
        {equipos.length > 4 && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              // Trigger para abrir TeamManagerDialog
              document.querySelector<HTMLButtonElement>('[data-team-manager-trigger]')?.click()
            }}
          >
            <CaretDown className="mr-2" size={16} />
            Ver {equipos.length - 4} equipos más
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredMembers.map(member => {
          const roleInfo = getRoleInfo(member.roleId)
          return (
            <Card key={member.id} className="overflow-hidden border border-border/30 shadow-sm hover:shadow-md transition-all duration-200 rounded-xl group">
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-start max-w-full">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-14 w-14 shrink-0 ring-2 ring-primary/10 ring-offset-2">
                      <AvatarImage src={member.avatar} />
                      <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-primary font-bold text-lg">{member.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <CardTitle className="text-base font-bold truncate tracking-tight">{member.name}</CardTitle>
                        {(member as any).status === 'pending' && (
                          <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300 shrink-0">
                            Pendiente
                          </Badge>
                        )}
                        {member.permissionRole && (
                          <Badge variant="secondary" className="text-[10px] shrink-0 rounded-full px-2 font-bold">
                            {member.permissionRole === 'admin' ? 'Admin' : 'Viewer'}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 min-w-0">
                        <p className="text-sm text-muted-foreground truncate">{member.role}</p>
                        {roleInfo && (
                          <Badge
                            variant="outline"
                            className="text-xs shrink-0"
                            style={{ borderColor: roleInfo.color, color: roleInfo.color }}
                          >
                            {roleInfo.name}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  {isAdminOrOwner && (
                    (member as any).status === 'pending' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 sm:self-auto self-start sm:ml-auto"
                        onClick={() => handleDeleteMember(member.id)}
                        title="Cancelar invitación"
                      >
                        <XCircle size={16} />
                      </Button>
                    ) : (
                      // Hide delete button for self
                      // We check if the member being rendered is the current user (by ID or Email)
                      // Note: currentUserId is passed as prop. We also check against the user's email if available.
                      (member.userId !== currentUserId && member.email !== currentUserEmail) && (
                        <div className="flex items-center gap-2 sm:self-auto self-start sm:ml-auto">
                          <EditTeamMemberDialog
                            member={member}
                            companyId={companyId!}
                            onUpdated={() => setRefreshTrigger(prev => prev + 1)}
                            canEditRole={isAdminOrOwner}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteMember(member.id)}
                            title="Eliminar miembro"
                          >
                            <Trash size={16} />
                          </Button>
                        </div>
                      )
                    )
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-medium truncate ml-2">{member.email}</span>
                  </div>
                  {member.teamId && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Equipo</span>
                      <span className="font-medium truncate ml-2">
                        {equipos.find(e => e.id === member.teamId)?.nombre_equipo || 'Desconocido'}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground font-medium">Tareas Activas</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-sm font-semibold px-2 py-0.5">
                        {getAssignedLeadsCount(member.id, (member as any).status)}
                      </Badge>
                      {getAssignedLeadsCount(member.id, (member as any).status) > 0 && (
                        <AllLeadsDialog
                          memberName={member.name}
                          leads={(leads || []).filter(l => {
                            if (l.assignedTo === member.id) return true
                            if ((member as any).status !== 'pending' && (l.assignedTo === NIL_UUID || l.assignedTo === 'todos')) return true
                            return false
                          })}
                          onLeadClick={(leadId) => {
                            // Navegar al detalle del lead
                            console.log('Navegando a la oportunidad:', leadId)
                            // Aquí puedes agregar lógica de navegación
                          }}
                          trigger={
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-muted rounded-full cursor-pointer">
                              <Info size={16} className="text-muted-foreground" />
                            </Button>
                          }
                        />
                      )}
                    </div>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Pipelines</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(() => {
                        const allPipelines = member.pipelines || []
                        const visiblePipelines = allPipelines.slice(0, 4)
                        const hiddenPipelines = allPipelines.slice(4)

                        const renderBadge = (tp: string) => {
                          let label = tp
                          if (tp === 'sales') label = 'Ventas'
                          else if (tp === 'support') label = 'Soporte'
                          else if (tp === 'administrative') label = 'Administrativo'
                          return (
                            <Badge key={tp} variant="outline" className="text-xs capitalize">
                              {label}
                            </Badge>
                          )
                        }

                        return (
                          <>
                            {visiblePipelines.map(renderBadge)}
                            {hiddenPipelines.length > 0 && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-secondary/80">
                                    +{hiddenPipelines.length} más
                                  </Badge>
                                </PopoverTrigger>
                                <PopoverContent className="w-64 p-3">
                                  <div className="space-y-2">
                                    <h4 className="font-medium text-sm">Pipelines adicionales</h4>
                                    <div className="flex flex-wrap gap-1">
                                      {hiddenPipelines.map(renderBadge)}
                                    </div>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )}
                            {allPipelines.length === 0 && (
                              <span className="text-xs text-muted-foreground">Sin asignar</span>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </div>
                  {roleInfo && roleInfo.permissions.length > 0 && (
                    <div className="pt-2 border-t border-border/30">
                      <span className="text-[11px] text-muted-foreground/70 font-medium">
                        {roleInfo.permissions.length} permisos
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}

        {filteredMembers.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
            <div className="p-4 rounded-full bg-muted/30 mb-4">
              <Users size={32} className="text-muted-foreground/40" />
            </div>
            <p className="text-muted-foreground/70 font-medium">
              {selectedTeamFilter
                ? "No hay miembros en este equipo"
                : "No team members added yet"}
            </p>
          </div>
        )}
      </div>

      {/* Usuarios aprobados sin equipo (solo owner/admin) */}
      {isAdminOrOwner && approvedMembers.length > 0 && (
        <div className="mt-8 pt-6 border-t border-border/50">
          <div className="flex items-center gap-2 mb-4">
            <Users size={20} className="text-green-600" />
            <h2 className="text-lg font-bold tracking-tight">Usuarios Registrados (App) ({approvedMembers.length})</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {approvedMembers.map(member => (
              <Card key={member.id} className="overflow-hidden border border-border/30 shadow-sm hover:shadow-md transition-all duration-200 rounded-xl group bg-green-50/20 dark:bg-green-950/5">
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-start max-w-full">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-14 w-14 shrink-0 ring-2 ring-primary/10 ring-offset-2 bg-background">
                        <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-primary font-bold text-lg">
                          {(member.nombre || member.email).split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-center gap-2 min-w-0">
                          <CardTitle className="text-base font-bold truncate tracking-tight flex-1" title={member.nombre || member.email}>
                            {member.nombre || member.email}
                          </CardTitle>
                        </div>
                        <div className="flex items-center gap-2 mt-1 min-w-0">
                          <p className="text-sm text-muted-foreground truncate flex-1 min-w-0" title={member.email}>
                            {member.email}
                          </p>
                          {/* Rol oculto temporalmente por solicitud del usuario
                          <Badge variant="outline" className="text-xs shrink-0 capitalize flex-none">
                            {member.role || 'viewer'}
                          </Badge>
                          */}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Registro</span>
                      <span className="font-medium truncate ml-2 text-xs text-right">
                        {new Date(member.created_at).toLocaleDateString('es-ES')}
                      </span>
                    </div>
                    {/* Sección 'Equipo' eliminada temporalmente por solicitud del usuario */}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground pt-4 mt-2">
            Estos usuarios ingresaron mediante la nueva funcionalidad de login (App/CRM). Se muestran aquí con este identificativo de forma temporal.
          </p>
        </div>
      )}
    </div>
  )
}
