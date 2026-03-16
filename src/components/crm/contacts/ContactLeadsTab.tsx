/**
 * ContactLeadsTab - Tab showing leads (chats) associated with this contact
 */

import { useEffect, useState } from 'react'
import { Lead } from '@/lib/types'
import { Contact } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Kanban, Plus, Spinner, CurrencyDollar, ArrowRight, ChatCircle } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/supabase/client'
import { createLead } from '@/supabase/services/leads'
import { getPipelines as getPipelinesWithStages } from '@/supabase/helpers/pipeline'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'

interface ContactLeadsTabProps {
    contact: Contact
    companyId?: string
}

interface LeadData {
    id: string
    nombre_completo: string
    empresa: string
    correo_electronico: string
    telefono: string
    presupuesto: number | null
    prioridad: string
    etapa_id: string
    pipeline_id: string
    created_at: string
    archived: boolean
    etapas?: {
        nombre: string
    }
    pipeline?: {
        nombre: string
    }
}

interface PipelineWithStages {
    id: string
    nombre: string
    tipo?: string
    etapas?: Array<{
        id: string
        nombre: string
        orden: number
        color?: string
    }>
}

interface DefaultLeadTarget {
    pipelineId: string
    pipelineName: string
    pipelineType: string
    stageId?: string
    stageName?: string
}

export function ContactLeadsTab({ contact, companyId }: ContactLeadsTabProps) {
    const navigate = useNavigate()
    const [leads, setLeads] = useState<LeadData[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isCreatingLead, setIsCreatingLead] = useState(false)
    const [defaultTarget, setDefaultTarget] = useState<DefaultLeadTarget | null>(null)

    useEffect(() => {
        const fetchDefaultTarget = async () => {
            if (!companyId) {
                setDefaultTarget(null)
                return
            }

            try {
                const { data, error } = await getPipelinesWithStages(companyId)
                if (error) throw error

                const pipelines = (data || []) as PipelineWithStages[]
                if (pipelines.length === 0) {
                    setDefaultTarget(null)
                    return
                }

                const firstPipeline = pipelines[0]
                const sortedStages = [...(firstPipeline.etapas || [])].sort((a, b) => a.orden - b.orden)
                const firstStage = sortedStages[0]

                setDefaultTarget({
                    pipelineId: firstPipeline.id,
                    pipelineName: firstPipeline.nombre,
                    pipelineType: firstPipeline.tipo || 'sales',
                    stageId: firstStage?.id,
                    stageName: firstStage?.nombre
                })
            } catch (error) {
                console.error('Error loading default pipeline/stage:', error)
                setDefaultTarget(null)
            }
        }

        fetchDefaultTarget()
    }, [companyId])

    useEffect(() => {
        const fetchContactLeads = async () => {
            if (!companyId || !contact) {
                setIsLoading(false)
                return
            }

            try {
                setIsLoading(true)

                // Search leads that match this contact by:
                // 1. Origin Lead ID (Direct link)
                // 2. Email (if exists)
                // 3. Phone (if exists)

                let query = supabase
                    .from('lead')
                    .select(`
                        *,
                        etapas:etapa_id (nombre),
                        pipeline:pipeline_id (nombre)
                    `)
                    .eq('empresa_id', companyId)
                    .eq('archived', false)

                // Build OR condition
                const conditions = []

                // If this contact was created from a specific lead
                // (Note: contact interface might not have origin_lead_id exposed yet in frontend types, 
                // but we can query by other fields first)

                // Match by Email
                if (contact.email) {
                    conditions.push(`correo_electronico.eq.${contact.email}`)
                }

                // Match by Phone
                if (contact.phone) {
                    conditions.push(`telefono.eq.${contact.phone}`)
                }

                // If no matching conditions, try searching by name as fallback or return empty
                if (conditions.length === 0) {
                    // Try name match if nothing else
                    conditions.push(`nombre_completo.eq.${contact.name}`)
                }

                if (conditions.length > 0) {
                    query = query.or(conditions.join(','))

                    const { data: leadsData, error: leadsError } = await query.order('created_at', { ascending: false })

                    if (leadsError) throw leadsError
                    setLeads(leadsData || [])
                } else {
                    setLeads([])
                }

            } catch (error) {
                console.error('Error fetching contact leads:', error)
                setLeads([])
            } finally {
                setIsLoading(false)
            }
        }

        fetchContactLeads()
    }, [contact, companyId])

    const handleCreateOpportunity = async () => {
        if (!companyId) {
            toast.error('No se pudo identificar la empresa')
            return
        }

        if (!defaultTarget?.pipelineId) {
            toast.error('No hay pipelines disponibles para crear una oportunidad')
            return
        }

        setIsCreatingLead(true)
        try {
            const created = await createLead({
                nombre_completo: (contact.name || '').trim() || 'Nueva oportunidad',
                correo_electronico: contact.email?.trim() || undefined,
                telefono: contact.phone?.trim() || undefined,
                empresa: contact.company?.trim() || undefined,
                ubicacion: contact.location?.trim() || undefined,
                empresa_id: companyId,
                pipeline_id: defaultTarget.pipelineId,
                etapa_id: defaultTarget.stageId,
                asignado_a: '00000000-0000-0000-0000-000000000000',
                prioridad: 'medium'
            })

            const createdLead: LeadData = {
                id: created.id,
                nombre_completo: created.nombre_completo || contact.name || 'Nueva oportunidad',
                empresa: created.empresa || contact.company || '',
                correo_electronico: created.correo_electronico || contact.email || '',
                telefono: created.telefono || contact.phone || '',
                presupuesto: created.presupuesto || 0,
                prioridad: created.prioridad || 'medium',
                etapa_id: created.etapa_id || defaultTarget.stageId || '',
                pipeline_id: created.pipeline_id || defaultTarget.pipelineId,
                created_at: created.created_at || new Date().toISOString(),
                archived: false,
                etapas: defaultTarget.stageName ? { nombre: defaultTarget.stageName } : undefined,
                pipeline: { nombre: defaultTarget.pipelineName }
            }

            setLeads(prev => [createdLead, ...prev])
            toast.success('Oportunidad creada desde contacto')
        } catch (error) {
            console.error('Error creating lead from contact:', error)
            toast.error('No se pudo crear la oportunidad')
        } finally {
            setIsCreatingLead(false)
        }
    }

    const stats = {
        total: leads.length,
        won: leads.filter(l => l.etapas?.nombre?.toLowerCase().includes('ganado')).length,
        active: leads.filter(l =>
            !l.etapas?.nombre?.toLowerCase().includes('ganado') &&
            !l.etapas?.nombre?.toLowerCase().includes('perdido')
        ).length,
        totalValue: leads.reduce((sum, l) => sum + (l.presupuesto || 0), 0)
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Spinner size={32} className="animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="space-y-4 w-full pb-40">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="px-4 py-3">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Oportunidades</div>
                    <div className="text-xl font-bold text-foreground mt-0.5">{stats.total}</div>
                </Card>
                <Card className="px-4 py-3">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Activos</div>
                    <div className="text-xl font-bold text-blue-600 mt-0.5">{stats.active}</div>
                </Card>
                <Card className="px-4 py-3">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ganados</div>
                    <div className="text-xl font-bold text-green-600 mt-0.5">{stats.won}</div>
                </Card>
                <Card className="px-4 py-3">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Valor Total</div>
                    <div className="text-xl font-bold text-amber-600 mt-0.5">
                        ${stats.totalValue.toLocaleString()}
                    </div>
                </Card>
            </div>

            {/* Info */}
            {leads.length > 0 && (
                <Card className="p-3 bg-primary/5 border-primary/20 flex items-center gap-2">
                    <ChatCircle size={18} className="text-primary flex-shrink-0" weight="fill" />
                    <p className="text-sm text-foreground">
                        Este contacto tiene <strong className="text-primary">{leads.length}</strong> chats/oportunidades asociadas.
                    </p>
                </Card>
            )}

            {/* Leads List */}
            {leads.length === 0 ? (
                <Card className="p-8 text-center">
                    <Kanban size={48} className="mx-auto text-muted-foreground/30 mb-3" />
                    <h3 className="font-semibold text-foreground mb-1">
                        No hay oportunidades asociadas
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                        Este contacto no tiene chats ni oportunidades activas.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                        <Button
                            onClick={handleCreateOpportunity}
                            disabled={!defaultTarget || isCreatingLead}
                        >
                            {isCreatingLead ? (
                                <Spinner size={16} className="animate-spin mr-2" />
                            ) : (
                                <Plus size={18} weight="bold" className="mr-2" />
                            )}
                            Crear Oportunidad
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => navigate('/pipeline')}
                        >
                            Ir a Pipeline
                        </Button>
                    </div>
                    {!defaultTarget && (
                        <p className="text-xs text-muted-foreground mt-3">
                            Debes tener al menos un pipeline con etapas para crear oportunidades desde contactos.
                        </p>
                    )}
                </Card>
            ) : (
                <div className="space-y-2">
                    {leads.map(lead => (
                        <Card
                            key={lead.id}
                            className="p-4 hover:bg-muted/50 transition-colors group cursor-pointer"
                            onClick={() => navigate(`/pipeline?lead=${lead.id}`)}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-semibold text-foreground">
                                            {lead.nombre_completo}
                                        </h4>
                                        <ArrowRight
                                            size={16}
                                            className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 mt-2">
                                        {lead.pipeline && (
                                            <Badge variant="outline" className="text-xs">
                                                {lead.pipeline.nombre}
                                            </Badge>
                                        )}
                                        {lead.etapas && (
                                            <Badge variant="secondary" className="text-xs">
                                                {lead.etapas.nombre}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {/* Botón Ir al Chat */}
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        className="h-8 shadow-sm"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            navigate(`/chats?leadId=${lead.id}`)
                                        }}
                                    >
                                        <ChatCircle size={16} className="mr-2" />
                                        Chat
                                    </Button>

                                    <div className="text-right flex-shrink-0 ml-2">
                                        {lead.presupuesto && (
                                            <p className="text-sm font-bold text-foreground flex items-center gap-1 justify-end">
                                                <CurrencyDollar size={16} weight="bold" />
                                                ${lead.presupuesto.toLocaleString()}
                                            </p>
                                        )}
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true, locale: es })}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
