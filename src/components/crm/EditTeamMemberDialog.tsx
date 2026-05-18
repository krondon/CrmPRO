import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { CaretUpDown, PencilSimple, Check } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { TeamMember, Pipeline } from '@/lib/types'

import { getPipelines } from '@/supabase/helpers/pipeline'
import { getPipelinesForPersona, addPersonaToPipeline, removePersonaFromPipeline } from '@/supabase/helpers/personaPipeline'
import { updatePersona } from '@/supabase/helpers/persona'
import { updateCompanyMemberRole } from '@/supabase/services/empresa'
import { getEquipos } from '@/supabase/helpers/equipos'
import { JOB_TITLES, getJobTitleLabel, canonicalJobTitleId } from '@/lib/roleLabels'

// Cargos disponibles (catálogo central, en español).
const JOB_TITLE_OPTIONS = JOB_TITLES.map(j => ({ value: j.id, label: j.label }))

interface EditTeamMemberDialogProps {
  member: TeamMember
  companyId: string
  onUpdated?: (memberId: string) => void
  canEditRole?: boolean
}

export function EditTeamMemberDialog({ member, companyId, onUpdated, canEditRole = false }: EditTeamMemberDialogProps) {
  const [open, setOpen] = useState(false)
  const [dbPipelines, setDbPipelines] = useState<Pipeline[]>([])
  const [originalSelection, setOriginalSelection] = useState<Set<string>>(new Set())
  const [localSelection, setLocalSelection] = useState<Set<string>>(new Set())
  // Normalizar el valor existente al id canónico en español si viene en formato legacy.
  const [jobTitle, setJobTitle] = useState(canonicalJobTitleId(member.role || ''))
  const [permissionRole, setPermissionRole] = useState(member.permissionRole || 'viewer')

  // Estado para equipos
  const [teams, setTeams] = useState<{ id: string, name: string }[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState(member.teamId || '')

  const pipelineOptions = useMemo(() => dbPipelines.map(p => ({ value: p.id, label: p.name })), [dbPipelines])

  useEffect(() => {
    if (!open) return
    // Cargar pipelines de la empresa
    getPipelines(companyId)
      .then(({ data }) => {
        if (data) {
          const mapped: Pipeline[] = data.map((p: any) => ({
            id: p.id,
            name: p.nombre,
            type: p.nombre.toLowerCase().trim().replace(/\s+/g, '-'),
            stages: []
          }))
          setDbPipelines(mapped)
        }
      })
      .catch(err => console.error('[EditTeamMemberDialog] error cargando pipelines empresa', err))

    // Cargar equipos de la empresa
    getEquipos(companyId)
      .then(({ data, error }) => {
        if (error) {
          console.error('[EditTeamMemberDialog] error cargando equipos', error)
          return
        }
        const mapped = (data || []).map((t: any) => ({ id: t.id, name: t.nombre_equipo }))
        setTeams(mapped)
      })
      .catch(err => console.error('[EditTeamMemberDialog] error cargando equipos', err))

    // Cargar pipelines actuales del miembro (IDs)
    getPipelinesForPersona(member.id)
      .then(({ data, error }: any) => {
        if (error) {
          console.error('[EditTeamMemberDialog] error getPipelinesForPersona', error)
          return
        }
        const ids = new Set<string>((data || []).map((r: any) => r.pipeline_id))
        setOriginalSelection(ids)
        setLocalSelection(new Set(ids))
      })
      .catch(err => console.error('[EditTeamMemberDialog] error cargando pipelines del miembro', err))
  }, [open, companyId, member.id])

  const toggleSelection = (value: string) => {
    setLocalSelection(prev => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  const handleSave = async () => {
    try {
      const current = new Set(localSelection)
      const orig = new Set(originalSelection)

      const toAdd: string[] = []
      const toRemove: string[] = []

      // calcular diffs
      pipelineOptions.forEach(opt => {
        const inCurrent = current.has(opt.value)
        const inOrig = orig.has(opt.value)
        if (inCurrent && !inOrig) toAdd.push(opt.value)
        if (!inCurrent && inOrig) toRemove.push(opt.value)
      })

      // aplicar cambios de pipelines
      for (const pid of toAdd) {
        await addPersonaToPipeline({ persona_id: member.id, pipeline_id: pid })
      }
      for (const pid of toRemove) {
        await removePersonaFromPipeline(member.id, pid)
      }

      // actualizar job title en persona si cambió
      if ((jobTitle || '') !== (member.role || '')) {
        await updatePersona(member.id, { titulo_trabajo: jobTitle })
      }

      // actualizar equipo si cambió
      if (selectedTeamId && selectedTeamId !== (member.teamId || '')) {
        await updatePersona(member.id, { equipo_id: selectedTeamId })
      }

      // actualizar permission role en empresa_miembros si cambió
      if (canEditRole && permissionRole !== (member.permissionRole || 'viewer')) {
        if (member.email) {
          await updateCompanyMemberRole(companyId, { email: member.email, role: permissionRole })
        } else if (member.userId) {
          await updateCompanyMemberRole(companyId, { email: '', usuario_id: member.userId, role: permissionRole })
        } else {
          throw new Error('No se puede actualizar el rol: el miembro no tiene email ni usuario_id')
        }
      }

      toast.success('Pipelines del miembro actualizados')
      setOpen(false)
      if (onUpdated) onUpdated(member.id)
    } catch (e: any) {
      console.error('[EditTeamMemberDialog] error guardando cambios', e)
      toast.error(e?.message || 'No se pudieron actualizar los pipelines')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          title="Editar miembro"
          // En móvil: botón cuadrado solo con icono, igual que los demás del header.
          // En sm+ se ve con texto.
          className="h-8 w-8 p-0 sm:w-auto sm:px-3"
        >
          <PencilSimple size={16} className="sm:mr-1" />
          <span className="hidden sm:inline">Editar</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Miembro: {member.name}</DialogTitle>
          <p className="text-sm text-muted-foreground">Modifica el cargo, equipo y acceso a pipelines.</p>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">Cargo</Label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
            >
              <option value="">Seleccionar cargo...</option>
              {JOB_TITLE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
              {/* Si el cargo actual del miembro no está en el catálogo (legacy), igual mostrarlo */}
              {jobTitle && !JOB_TITLE_OPTIONS.some(o => o.value === jobTitle) && (
                <option value={jobTitle}>{getJobTitleLabel(jobTitle)}</option>
              )}
            </select>
          </div>

          <div>
            <Label className="mb-2 block">Equipo</Label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
            >
              <option value="">Seleccionar equipo...</option>
              {teams.map(team => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">Cambiar de equipo moverá al miembro a otro equipo.</p>
          </div>
          <div>
            <Label className="mb-2 block">Rol de permisos</Label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={permissionRole}
              onChange={(e) => setPermissionRole(e.target.value as any)}
              disabled={!canEditRole}
            >
              <option value="viewer">Lector (Lectura)</option>
              <option value="admin">Administrador (Control Total)</option>
            </select>
            {!canEditRole && (
              <p className="text-xs text-muted-foreground mt-1">Solo administradores pueden cambiar el rol.</p>
            )}
          </div>
          <div className="pt-2 border-t border-border">
            <Label className="mb-2 block">Pipelines disponibles</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className={cn(
                    'w-full justify-between font-normal',
                    localSelection.size === 0 && 'text-muted-foreground'
                  )}
                >
                  {localSelection.size > 0
                    ? `${localSelection.size} seleccionado${localSelection.size > 1 ? 's' : ''}`
                    : 'Seleccionar pipelines'}
                  <CaretUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar pipeline..." />
                  <CommandList>
                    <CommandEmpty>No se encontraron pipelines.</CommandEmpty>
                    <CommandGroup>
                      {pipelineOptions.map((opt) => (
                        <CommandItem key={opt.value} value={opt.label} onSelect={() => toggleSelection(opt.value)}>
                          <div className={cn(
                            'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                            localSelection.has(opt.value)
                              ? 'bg-primary text-primary-foreground'
                              : 'opacity-50 [&_svg]:invisible'
                          )}>
                            <Check className={cn('h-4 w-4')} />
                          </div>
                          {opt.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground mt-1">Los cambios se aplican a la relación persona–pipeline existente.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Guardar cambios</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
