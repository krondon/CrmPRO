import { Dispatch, SetStateAction } from 'react'
import { Lead, Pipeline, PipelineType, Stage, TeamMember } from '@/lib/types'
import { createLead, deleteLead } from '@/supabase/services/leads'
import { createEtapa } from '@/supabase/helpers/etapas'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

interface User {
    id: string
    email: string
    businessName: string
}

interface UsePipelineLeadActionsProps {
    companyId: string
    activePipeline: PipelineType
    pipelines: Pipeline[]
    setPipelines: Dispatch<SetStateAction<Pipeline[]>>
    setLeads: Dispatch<SetStateAction<Lead[]>>
    setStageCounts: Dispatch<SetStateAction<Record<string, number>>>
    teamMembers: TeamMember[]
    user: User | null | undefined
    isAdminOrOwner: boolean
    currentCompany?: { name: string }
}

export function usePipelineLeadActions({
    companyId,
    activePipeline,
    pipelines,
    setPipelines,
    setLeads,
    setStageCounts,
    teamMembers,
    user,
    isAdminOrOwner,
    currentCompany
}: UsePipelineLeadActionsProps) {

    const handleAddStage = async (stage: Stage) => {
        if (!isAdminOrOwner) {
            toast.error('No tienes permisos para agregar etapas')
            return
        }

        const currentPipeline = pipelines.find(p => p.type === activePipeline)

        // 1. Resolver o Crear Pipeline en BD
        let pipelineId = currentPipeline?.id
        let isNewPipeline = false

        // Validar si es un UUID real
        const isPipelineUUID = pipelineId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pipelineId)

        if (!pipelineId || !isPipelineUUID) {
            // No existe en BD, lo creamos
            try {
                const name = activePipeline === 'sales' ? 'Sales Pipeline' :
                    activePipeline === 'support' ? 'Support Pipeline' : 'Administrative Pipeline'

                const { createPipeline } = await import('@/supabase/helpers/pipeline')
                const { data: newPipeline, error } = await createPipeline({
                    nombre: name,
                    empresa_id: companyId
                })

                if (error) throw error
                pipelineId = newPipeline.id
                isNewPipeline = true
            } catch (err: any) {
                console.error('Error creating pipeline:', err)
                toast.error('No se pudo crear el pipeline en BD')
                return
            }
        }

        // 2. Crear Etapa en BD
        let stageToState = stage
        try {
            const { data: newStage, error } = await createEtapa({
                nombre: stage.name,
                pipeline_id: pipelineId!, // Seguro que existe
                orden: stage.order,
                color: stage.color
            })

            if (error) throw error

            // Usamos el ID real de la BD
            stageToState = { ...stage, id: newStage.id }
            toast.success('Etapa guardada en BD')
        } catch (err: any) {
            console.error('Error creating stage:', err)
            toast.error(`Error al guardar etapa en BD: ${err.message}`)
            return
        }

        // 3. Actualizar Estado Local
        setPipelines((current) => {
            const pipelines = current || []
            const pipelineIndex = pipelines.findIndex(p => p.type === activePipeline)

            if (pipelineIndex === -1 || isNewPipeline) {
                // Si acabamos de crear el pipeline en BD, o no existía localmente
                // Necesitamos reconstruir el objeto pipeline con el ID real
                const mapType = (name: string) => name.toLowerCase().trim().replace(/\s+/g, '-') as PipelineType

                // Si ya existía localmente (pero sin UUID), preservamos sus etapas viejas? 
                // Mejor no mezclar. Si es nuevo en BD, empezamos limpio o migramos etapas?
                // Simplificación: Asumimos que si no tenía UUID era vacio o efímero.

                const newPipelineObj: Pipeline = {
                    id: pipelineId!,
                    name: activePipeline === 'sales' ? 'Sales Pipeline' :
                        activePipeline === 'support' ? 'Support Pipeline' : 'Administrative Pipeline',
                    type: activePipeline,
                    stages: [stageToState]
                }

                // Si existía uno local 'fake', lo reemplazamos
                if (pipelineIndex !== -1) {
                    const updated = [...pipelines]
                    // Mantener etapas anteriores?? Serían invalidas. 
                    // Lo ideal es que el usuario empiece a agregar etapas y se arregle.
                    updated[pipelineIndex] = {
                        ...updated[pipelineIndex],
                        id: pipelineId!,
                        stages: [...updated[pipelineIndex].stages, stageToState]
                    }
                    return updated
                }

                return [...pipelines, newPipelineObj]
            }

            const updatedPipelines = [...pipelines]
            updatedPipelines[pipelineIndex] = {
                ...updatedPipelines[pipelineIndex],
                stages: [...updatedPipelines[pipelineIndex].stages, stageToState]
            }

            return updatedPipelines
        })
    }

    const handleAddLead = async (lead: Lead) => {
        try {
            // Resolver el UUID del pipeline actual
            const currentPipeline = pipelines.find(p => p.type === activePipeline)
            let pipelineIdToSave = currentPipeline?.id

            if (!pipelineIdToSave) {
                toast.error('No se ha seleccionado un pipeline válido')
                return
            }

            const payload: any = {
                nombre_completo: lead.name,
                correo_electronico: lead.email,
                telefono: lead.phone,
                empresa: lead.company,
                ubicacion: lead.location,
                presupuesto: lead.budget,
                etapa_id: lead.stage,
                pipeline_id: pipelineIdToSave,
                prioridad: lead.priority,
                asignado_a: null,
                empresa_id: companyId
            }

            // 1. Si lead.assignedTo coincide con un ID directo.
            const byId = teamMembers.find(m => m.id === lead.assignedTo)
            if (byId) {
                payload.asignado_a = byId.id
            } else {
                // 2. Intentar por nombre (legacy)
                const byName = teamMembers.find(m => m.name === lead.assignedTo)
                if (byName) {
                    payload.asignado_a = byName.id
                } else if (lead.assignedTo === 'todos') {
                    payload.asignado_a = '00000000-0000-0000-0000-000000000000'
                } else if (user && user.id === lead.assignedTo) {
                    payload.asignado_a = user.id
                }
            }

            // Si el pipeline es custom (tiene UUID), intentamos guardar
            if (pipelineIdToSave) {
                // Validar que la etapa sea UUID
                const isStageUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lead.stage)

                if (!isStageUUID) {
                    toast.warning('No se puede guardar en BD: La etapa no está sincronizada (ID inválido). Se guardará localmente.')
                    setLeads((current) => [...(current || []), lead])
                    setStageCounts(prev => ({
                        ...prev,
                        [lead.stage]: (prev[lead.stage] || 0) + 1
                    }))
                    return
                }

                const actorNombre = user?.businessName || (user as any)?.nombre || user?.email
                const created = await createLead(payload, user?.id, actorNombre)

                toast.success('Lead guardado en BD')

                // Notificar asignación si corresponde
                const NIL_UUID = '00000000-0000-0000-0000-000000000000'
                const assignedId = payload.asignado_a
                if (isAdminOrOwner && assignedId && assignedId !== NIL_UUID) {
                    const recipient = teamMembers.find(m => m.id === assignedId)
                    if (recipient?.email) {
                        try {
                            await supabase.functions.invoke('send-lead-assigned', {
                                body: {
                                    leadId: created.id,
                                    leadName: lead.name,
                                    empresaId: companyId,
                                    empresaNombre: currentCompany?.name,
                                    assignedUserId: recipient?.userId || assignedId,
                                    assignedUserEmail: recipient?.email,
                                    assignedByEmail: user?.email,
                                    assignedByNombre: user?.businessName || currentCompany?.name || user?.email
                                }
                            })
                        } catch (e) {
                            console.error('[PipelineView] Error enviando notificación de asignación', e)
                        }
                    }
                }
            } else {
                // Fallback local para defaults
                setLeads((current) => [...(current || []), lead])
                setStageCounts(prev => ({
                    ...prev,
                    [lead.stage]: (prev[lead.stage] || 0) + 1
                }))
                toast.warning('Lead guardado localmente (Pipeline default)')
            }

        } catch (error: any) {
            console.error('Error creating lead:', error)
            toast.error(`Error al crear lead: ${error.message}`)
        }
    }

    const handleDeleteLead = async (leadId: string, onSuccess?: () => void) => {
        try {
            if (leadId.length > 20) {
                await deleteLead(leadId)
            }

            setLeads((current) => {
                const lead = current?.find(l => l.id === leadId)
                if (lead) {
                    setStageCounts(prev => ({
                        ...prev,
                        [lead.stage]: Math.max(0, (prev[lead.stage] || 0) - 1)
                    }))
                }
                return (current || []).filter(l => l.id !== leadId)
            })

            if (onSuccess) onSuccess()
            toast.success('Lead eliminado')
        } catch (error: any) {
            console.error('Error deleting lead:', error)
            toast.error('Error al eliminar lead')
        }
    }

    const handleImportLeads = (importedLeads: Lead[]) => {
        if (!importedLeads || importedLeads.length === 0) return

        const stageIncrements: Record<string, number> = {}

        setLeads((current) => {
            const byId = new Map<string, Lead>()
            const currentPipeline = pipelines.find(p => p.type === activePipeline)

                ; (current || []).forEach(l => byId.set(l.id, l))

            importedLeads.forEach((lead) => {
                const normalizedLead = {
                    ...lead,
                    pipeline: lead.pipeline || currentPipeline?.id || activePipeline
                }

                if (!byId.has(normalizedLead.id)) {
                    stageIncrements[normalizedLead.stage] = (stageIncrements[normalizedLead.stage] || 0) + 1
                }

                byId.set(normalizedLead.id, normalizedLead)
            })

            return Array.from(byId.values())
        })

        if (Object.keys(stageIncrements).length > 0) {
            setStageCounts((prev) => {
                const next = { ...prev }
                Object.entries(stageIncrements).forEach(([stageId, count]) => {
                    next[stageId] = (next[stageId] || 0) + count
                })
                return next
            })
        }
    }

    return {
        handleAddStage,
        handleAddLead,
        handleImportLeads,
        handleDeleteLead
    }
}
