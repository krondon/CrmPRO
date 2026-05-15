import { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { TeamMember } from '@/lib/types'
import { MagnifyingGlass, User, Envelope, Briefcase, Users } from '@phosphor-icons/react'
import { getPermissionRoleLabel, getJobTitleLabel } from '@/lib/roleLabels'

type Equipo = { id: string; nombre_equipo: string; empresa_id: string; created_at: string }

interface MemberSearchDialogProps {
    members: TeamMember[]
    equipos: Equipo[]
    onSelectMember: (member: TeamMember) => void
    onFilterByTeam: (teamId: string | null) => void
}

export function MemberSearchDialog({ members, equipos, onSelectMember, onFilterByTeam }: MemberSearchDialogProps) {
    const [open, setOpen] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const [searchType, setSearchType] = useState<'members' | 'teams'>('members')

    const filteredMembers = members.filter(member => {
        if (!searchTerm.trim()) return false

        const search = searchTerm.toLowerCase()
        return (
            member.name?.toLowerCase().includes(search) ||
            member.email?.toLowerCase().includes(search) ||
            member.role?.toLowerCase().includes(search)
        )
    })

    const filteredTeams = equipos.filter(equipo => {
        if (!searchTerm.trim()) return false
        return equipo.nombre_equipo.toLowerCase().includes(searchTerm.toLowerCase())
    })

    const handleSelectMember = (member: TeamMember) => {
        setOpen(false)
        setSearchTerm('')
        onSelectMember(member)
    }

    const handleSelectTeam = (teamId: string) => {
        setOpen(false)
        setSearchTerm('')
        onFilterByTeam(teamId)
    }

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen(true)}
                className="gap-2"
            >
                <MagnifyingGlass size={18} />
                <span className="hidden sm:inline">Buscar</span>
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Buscar en Equipo</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        {/* Tabs para alternar búsqueda */}
                        <div className="flex gap-2">
                            <Button
                                variant={searchType === 'members' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setSearchType('members')}
                                className="flex-1"
                            >
                                <User size={16} className="mr-2" />
                                Miembros
                            </Button>
                            <Button
                                variant={searchType === 'teams' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setSearchType('teams')}
                                className="flex-1"
                            >
                                <Users size={16} className="mr-2" />
                                Equipos
                            </Button>
                        </div>

                        <div className="relative">
                            <MagnifyingGlass className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder={searchType === 'members' ?
                                    'Buscar por nombre, email o rol...' :
                                    'Buscar equipos...'
                                }
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                                autoFocus
                            />
                        </div>

                        <div className="max-h-[400px] overflow-y-auto space-y-2">
                            {searchTerm.trim() === '' ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <MagnifyingGlass size={48} className="mx-auto mb-3 opacity-50" />
                                    <p>Escribe para buscar {searchType === 'members' ? 'miembros' : 'equipos'}</p>
                                </div>
                            ) : searchType === 'members' ? (
                                filteredMembers.length === 0 ? (
                                    <div className="text-center py-12 text-muted-foreground">
                                        <p>No se encontraron miembros</p>
                                    </div>
                                ) : (
                                    filteredMembers.map(member => (
                                        <button
                                            key={member.id}
                                            onClick={() => handleSelectMember(member)}
                                            className="w-full text-left p-4 rounded-lg border border-border hover:border-primary hover:bg-muted/50 transition-all"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="flex-1 space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <User size={16} className="text-muted-foreground shrink-0" />
                                                        <h4 className="font-semibold truncate">{member.name}</h4>
                                                        {(member as any).status === 'pending' && (
                                                            <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300">
                                                                Pendiente
                                                            </Badge>
                                                        )}
                                                        {member.permissionRole && (
                                                            <Badge variant="secondary" className="text-xs">
                                                                {getPermissionRoleLabel(member.permissionRole)}
                                                            </Badge>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                        <Envelope size={14} className="shrink-0" />
                                                        <span className="truncate">{member.email}</span>
                                                    </div>

                                                    {/* Mostramos el cargo (titulo_trabajo) en su forma traducida */}
                                                    {member.role && (
                                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                            <Briefcase size={14} className="shrink-0" />
                                                            <span className="truncate">{getJobTitleLabel(member.role)}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </button>
                                    ))
                                )
                            ) : (
                                filteredTeams.length === 0 ? (
                                    <div className="text-center py-12 text-muted-foreground">
                                        <p>No se encontraron equipos</p>
                                    </div>
                                ) : (
                                    filteredTeams.map(team => (
                                        <button
                                            key={team.id}
                                            onClick={() => handleSelectTeam(team.id)}
                                            className="w-full text-left p-4 rounded-lg border border-border hover:border-primary hover:bg-muted/50 transition-all"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h4 className="font-semibold">{team.nombre_equipo}</h4>
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        Creado: {new Date(team.created_at).toLocaleDateString('es-ES')}
                                                    </p>
                                                </div>
                                                <Users size={20} className="text-muted-foreground" />
                                            </div>
                                        </button>
                                    ))
                                )
                            )}
                        </div>

                        {((searchType === 'members' && filteredMembers.length > 0) ||
                            (searchType === 'teams' && filteredTeams.length > 0)) && (
                                <div className="text-xs text-center text-muted-foreground pt-2 border-t">
                                    {searchType === 'members' ? filteredMembers.length : filteredTeams.length} resultado(s)
                                </div>
                            )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
