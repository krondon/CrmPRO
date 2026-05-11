import { useEffect, useMemo, useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { CircleNotch, Check } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { supabase } from '@/supabase/client'
import { aprobarSolicitud } from '@/supabase/services/solicitudes'
import { getEquipos } from '@/supabase/services/equipos'
import { getPipelines } from '@/supabase/helpers/pipeline'
import { getRoles } from '@/supabase/services/roles'
import type { Role, Pipeline } from '@/lib/types'

interface ApproveJoinRequestDialogProps {
    open: boolean
    onClose: () => void
    solicitudId: string
    solicitanteEmail?: string
    solicitanteName?: string
    onApproved: () => void
}

interface Equipo {
    id: string
    nombre_equipo: string
}

export function ApproveJoinRequestDialog({
    open,
    onClose,
    solicitudId,
    solicitanteEmail,
    solicitanteName,
    onApproved,
}: ApproveJoinRequestDialogProps) {
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [empresaId, setEmpresaId] = useState<string | null>(null)
    const [empresaName, setEmpresaName] = useState<string>('')

    const [teams, setTeams] = useState<Equipo[]>([])
    const [pipelines, setPipelines] = useState<Pipeline[]>([])
    const [roles, setRoles] = useState<Role[]>([])

    // selección
    const [selectedTeamId, setSelectedTeamId] = useState<string>('none')
    const [selectedRoleId, setSelectedRoleId] = useState<string>('viewer') // role string (admin/viewer)
    const [selectedDbRoleId, setSelectedDbRoleId] = useState<string>('') // role.id (UUID) si custom
    const [selectedPipelineIds, setSelectedPipelineIds] = useState<Set<string>>(new Set())

    // Cargar datos cuando se abre
    useEffect(() => {
        if (!open || !solicitudId) return
        let mounted = true
        ;(async () => {
            setLoading(true)
            try {
                // 1. Leer solicitud para obtener empresa_id
                const { data: sol, error: solErr } = await supabase
                    .from('solicitudes_union')
                    .select('empresa_id, solicitante_email, solicitante_nombre')
                    .eq('id', solicitudId)
                    .single()
                if (solErr || !sol) throw new Error('No se pudo cargar la solicitud')
                if (!mounted) return
                setEmpresaId(sol.empresa_id)

                // 2. Empresa name + Equipos + Pipelines + Roles (paralelo)
                const [empresaRes, teamsData, pipelinesData, rolesData] = await Promise.all([
                    supabase.from('empresa').select('nombre_empresa').eq('id', sol.empresa_id).single(),
                    getEquipos(sol.empresa_id),
                    getPipelines(sol.empresa_id),
                    getRoles(sol.empresa_id).catch(() => []),
                ])
                if (!mounted) return
                setEmpresaName(empresaRes.data?.nombre_empresa || '')
                setTeams((teamsData || []) as Equipo[])
                const mappedPipelines: Pipeline[] = ((pipelinesData?.data) || []).map((p: any) => ({
                    id: p.id,
                    name: p.nombre,
                    type: p.nombre?.toLowerCase().trim().replace(/\s+/g, '-') || 'pipeline',
                    stages: [],
                }))
                setPipelines(mappedPipelines)
                setRoles(rolesData || [])
            } catch (err: any) {
                toast.error(err?.message || 'Error cargando datos')
                onClose()
            } finally {
                if (mounted) setLoading(false)
            }
        })()
        return () => { mounted = false }
    }, [open, solicitudId])

    const togglePipeline = (id: string) => {
        setSelectedPipelineIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const handleApprove = async () => {
        if (!empresaId) return
        setSubmitting(true)
        try {
            const crmConfig =
                selectedTeamId !== 'none'
                    ? {
                          equipo_id: selectedTeamId,
                          pipeline_ids: Array.from(selectedPipelineIds),
                      }
                    : null

            await aprobarSolicitud(
                solicitudId,
                selectedRoleId,
                selectedDbRoleId || null,
                crmConfig
            )
            toast.success('Solicitud aprobada — el usuario ya puede acceder al CRM')
            onApproved()
            onClose()
        } catch (err: any) {
            toast.error(err?.message || 'Error al aprobar')
        } finally {
            setSubmitting(false)
        }
    }

    const customRoles = useMemo(() => roles.filter(r => !!r.id), [roles])

    return (
        <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
            <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Aprobar solicitud</DialogTitle>
                    <DialogDescription>
                        {solicitanteName || solicitanteEmail || 'Usuario'} quiere unirse a{' '}
                        <strong>{empresaName || 'tu empresa'}</strong>. Configura su rol y acceso.
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="py-8 text-center">
                        <CircleNotch size={28} className="animate-spin mx-auto text-muted-foreground" />
                        <p className="text-xs text-muted-foreground mt-2">Cargando opciones...</p>
                    </div>
                ) : (
                    <div className="space-y-4 py-2">
                        {/* Rol */}
                        <div className="space-y-1.5">
                            <Label>Rol en la empresa *</Label>
                            <Select
                                value={selectedRoleId}
                                onValueChange={(v) => {
                                    setSelectedRoleId(v)
                                    // Si elige uno custom, también seteamos su UUID
                                    const custom = customRoles.find(r => r.id === v)
                                    setSelectedDbRoleId(custom ? v : '')
                                }}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="admin">Admin (puede gestionar todo)</SelectItem>
                                    <SelectItem value="viewer">Viewer (solo lectura)</SelectItem>
                                    {customRoles.map(r => (
                                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Equipo */}
                        <div className="space-y-1.5">
                            <Label>Equipo destino</Label>
                            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                                <SelectTrigger><SelectValue placeholder="Selecciona un equipo" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Sin equipo asignado</SelectItem>
                                    {teams.map(t => (
                                        <SelectItem key={t.id} value={t.id}>{t.nombre_equipo}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {selectedTeamId === 'none' && (
                                <p className="text-[11px] text-muted-foreground">
                                    Sin equipo: el usuario tendrá acceso al CRM pero no aparecerá en TeamView.
                                </p>
                            )}
                        </div>

                        {/* Pipelines */}
                        {selectedTeamId !== 'none' && (
                            <div className="space-y-1.5">
                                <Label>Pipelines a los que tendrá acceso</Label>
                                {pipelines.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">No hay pipelines configurados.</p>
                                ) : (
                                    <div className="space-y-2 border rounded-lg p-3 max-h-40 overflow-y-auto">
                                        {pipelines.map(p => (
                                            <label key={p.id} className="flex items-center gap-2 cursor-pointer text-sm">
                                                <Checkbox
                                                    checked={selectedPipelineIds.has(p.id)}
                                                    onCheckedChange={() => togglePipeline(p.id)}
                                                />
                                                {p.name}
                                            </label>
                                        ))}
                                    </div>
                                )}
                                {selectedPipelineIds.size > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {Array.from(selectedPipelineIds).map(id => {
                                            const p = pipelines.find(pp => pp.id === id)
                                            return p ? (
                                                <Badge key={id} variant="secondary" className="text-[10px]">
                                                    {p.name}
                                                </Badge>
                                            ) : null
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onClose} disabled={submitting}>
                        Cancelar
                    </Button>
                    <Button onClick={handleApprove} disabled={loading || submitting}>
                        {submitting ? (
                            <><CircleNotch size={16} className="animate-spin mr-2" />Aprobando...</>
                        ) : (
                            <><Check size={16} className="mr-2" />Aprobar</>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
