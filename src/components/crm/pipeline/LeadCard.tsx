import { memo } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { DotsThree, Note, CalendarBlank, CurrencyDollar, Clock, WarningCircle, Copy } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { Lead, Pipeline, PipelineType, TeamMember, Stage } from '@/lib/types'
import { Company } from '@/components/crm/CompanyManagement'
import { calculateSLAStatus, SLAStatus, SLAResult } from '@/lib/slaHelpers'
import { useState, useEffect } from 'react'

interface User {
    id: string
    email: string
    businessName: string
}

interface LeadCardProps {
    lead: Lead
    stage: Stage
    stageColor: string
    isHighlighted: boolean
    hasUnreadMessages: boolean
    notesCount: number
    meetingsCount: number
    isAdminOrOwner: boolean
    canEditLeads: boolean
    isMobile: boolean
    currentPipeline?: Pipeline
    teamMembers: TeamMember[]
    currentCompany?: Company
    user?: User | null

    // Callbacks
    onDragStart: (e: React.DragEvent, lead: Lead) => void
    onClick: (lead: Lead) => void
    onDelete: (leadId: string) => void
    onMoveToStage: (lead: Lead, stageId: string) => void
    onOpenMoveDialog: (lead: Lead) => void
    onCopy?: (lead: Lead) => void

    // Helpers
    t: any
}

function LeadCardComponent({
    lead,
    stage,
    stageColor,
    isHighlighted,
    hasUnreadMessages,
    notesCount,
    meetingsCount,
    isAdminOrOwner,
    canEditLeads,
    isMobile,
    currentPipeline,
    teamMembers,
    currentCompany,
    user,
    onDragStart,
    onClick,
    onDelete,
    onMoveToStage,
    onOpenMoveDialog,
    onCopy,
    t
}: LeadCardProps) {

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'high': return 'bg-destructive'
            case 'medium': return 'bg-warning'
            case 'low': return 'bg-muted-foreground'
            default: return 'bg-muted-foreground'
        }
    }

    const getAssignedName = () => {
        const NIL_UUID = '00000000-0000-0000-0000-000000000000'
        const member = teamMembers.find(m => m.id === lead.assignedTo || m.userId === lead.assignedTo)
        if (member) return member.name
        if (lead.assignedTo === NIL_UUID || lead.assignedTo == null) {
            return 'Todos'
        }
        if (user && user.id === lead.assignedTo) {
            return `${currentCompany?.name || user.businessName || user.email} (Yo)`
        }
        // Si el asignado es el dueño/owner de la empresa, mostrar nombre de la empresa
        if (currentCompany && currentCompany.ownerId === lead.assignedTo) {
            return `${currentCompany.name} (Owner)`
        }
        return 'Sin asignar'
    }

    const [slaResult, setSlaResult] = useState<SLAResult>({ status: 'DISABLED', label: '' })

    useEffect(() => {
        if (!stage.is_sla_enabled) {
            setSlaResult({ status: 'DISABLED', label: '' })
            return
        }

        const computeSLA = () => {
            const result = calculateSLAStatus({
                isSlaEnabled: stage.is_sla_enabled,
                stageEnteredAt: lead.stageEnteredAt,
                limitMinutes: lead.slaCustomLimitMinutes ?? stage.sla_limit_minutes
            })
            setSlaResult(result)
        }

        computeSLA()
        const interval = setInterval(computeSLA, 1000)
        return () => clearInterval(interval)
    }, [stage.is_sla_enabled, lead.stageEnteredAt, lead.slaCustomLimitMinutes, stage.sla_limit_minutes])

    const slaStatus = slaResult.status

    const getSlaIndicatorClass = (status: SLAStatus) => {
        switch (status) {
            case 'RED': return 'ring-2 ring-red-500 bg-red-50/10'
            case 'YELLOW': return 'ring-2 ring-yellow-400 bg-yellow-50/10'
            case 'GREEN': return 'border-border/40'
            default: return 'border-border/40'
        }
    }

    return (
        <Card
            id={`lead-card-${lead.id}`}
            draggable={canEditLeads}
            onDragStart={(e) => onDragStart(e, lead)}
            className={cn(
                "w-[85vw] sm:w-80 md:w-full relative shrink-0 p-0 cursor-move hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 bg-background overflow-hidden active:scale-[0.98] active:opacity-80 rounded-xl group/card border",
                getSlaIndicatorClass(slaStatus),
                isHighlighted && "ring-2 ring-primary ring-offset-2 animate-pulse",
                !canEditLeads && "cursor-default"
            )}
            onClick={() => onClick(lead)}
        >
            {/* Color accent bar */}
            <div className="h-1 w-full" style={{ backgroundColor: stageColor }} />
            
            {/* SLA Indicator Side Bar */}
            {slaStatus === 'RED' && <div className="absolute left-0 top-1 bottom-0 w-1 bg-red-500 shadow-[2px_0_8px_rgba(239,68,68,0.5)]" />}
            {slaStatus === 'YELLOW' && <div className="absolute left-0 top-1 bottom-0 w-1 bg-yellow-400 shadow-[2px_0_8px_rgba(250,204,21,0.5)]" />}
            {slaStatus === 'GREEN' && <div className="absolute left-0 top-1 bottom-0 w-1 bg-green-500" />}

            <div className="p-3">
                <div className="flex items-start justify-between mb-1.5">
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-sm truncate tracking-tight">{lead.name}</h4>
                            <p className="text-[11px] text-muted-foreground/70 truncate font-medium">{lead.company}</p>
                        </div>
                        {hasUnreadMessages && (
                            <div className="w-2.5 h-2.5 rounded-full bg-destructive shrink-0 animate-pulse shadow-sm shadow-destructive/30" title="Mensajes no leídos" />
                        )}
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                                <DotsThree size={14} />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem disabled={!isAdminOrOwner}>{t.buttons.edit}</DropdownMenuItem>
                            {isMobile ? (
                                <DropdownMenuItem
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onOpenMoveDialog(lead)
                                    }}
                                >
                                    Mover a Etapa
                                </DropdownMenuItem>
                            ) : (
                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger disabled={!isAdminOrOwner}>Mover a Etapa</DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                        {(currentPipeline?.stages || []).map(s => (
                                            <DropdownMenuItem
                                                key={s.id}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onMoveToStage(lead, s.id)
                                                }}
                                                disabled={s.id === lead.stage}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                                                    {s.name}
                                                </div>
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuSubContent>
                                </DropdownMenuSub>
                            )}
                            {onCopy && (
                                <DropdownMenuItem
                                    onClick={(event) => {
                                        event.stopPropagation()
                                        onCopy(lead)
                                    }}
                                >
                                    <Copy size={14} className="mr-2" />
                                    Copiar oportunidad
                                </DropdownMenuItem>
                            )}
                            {isAdminOrOwner && (
                                <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={(event) => {
                                        event.stopPropagation()
                                        onDelete(lead.id)
                                    }}
                                >
                                    {t.buttons.delete}
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <div className="flex items-center gap-1.5 mb-1.5">
                    <Badge variant="outline" className={cn(
                        'h-4 px-1.5 text-[9px] font-bold uppercase tracking-wider border rounded-full',
                        lead.priority === 'high' ? 'bg-destructive/10 text-destructive border-destructive/30' :
                            lead.priority === 'medium' ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' :
                                'bg-muted text-muted-foreground border-border'
                    )}>
                        {lead.priority}
                    </Badge>
                    {notesCount > 0 && (
                        <TooltipProvider delayDuration={300}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex items-center gap-0.5 text-amber-600">
                                        <Note size={12} weight="fill" />
                                        <span className="text-[10px] font-semibold">{notesCount}</span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                    {notesCount} nota{notesCount > 1 ? 's' : ''}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                    {meetingsCount > 0 && (
                        <TooltipProvider delayDuration={300}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex items-center gap-0.5 text-purple-600">
                                        <CalendarBlank size={12} weight="fill" />
                                        <span className="text-[10px] font-semibold">{meetingsCount}</span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                    {meetingsCount} reunión{meetingsCount > 1 ? 'es' : ''}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </div>

                {lead.budget > 0 && (
                    <div className="flex items-center gap-1 text-sm font-bold text-emerald-600 dark:text-emerald-500 mb-1.5">
                        <CurrencyDollar size={14} weight="bold" />
                        <span>${lead.budget.toLocaleString()}</span>
                    </div>
                )}

                {lead.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1.5">
                        {lead.tags.slice(0, 3).map(tag => (
                            <span
                                key={tag.id}
                                className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider border opacity-90 truncate max-w-[100px]"
                                style={{
                                    backgroundColor: tag.color + '15',
                                    color: tag.color,
                                    borderColor: tag.color + '30'
                                }}
                                title={tag.name}
                            >
                                {tag.name}
                            </span>
                        ))}
                        {lead.tags.length > 3 && (
                            <span className="text-[9px] text-muted-foreground font-bold px-1 py-0.5">
                                +{lead.tags.length - 3}
                            </span>
                        )}
                    </div>
                )}

                {slaStatus !== 'DISABLED' && slaResult.label && (
                    <TooltipProvider delayDuration={200}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className={cn(
                                    'flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold mb-1.5',
                                    slaStatus === 'RED' && 'bg-red-500/10 text-red-600',
                                    slaStatus === 'YELLOW' && 'bg-yellow-400/10 text-yellow-600',
                                    slaStatus === 'GREEN' && 'bg-green-500/10 text-green-600'
                                )}>
                                    {slaStatus === 'RED' ? <WarningCircle size={12} weight="fill" /> : <Clock size={12} weight="bold" />}
                                    {slaResult.label}
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                                {slaStatus === 'GREEN' && 'A tiempo - dentro del limite'}
                                {slaStatus === 'YELLOW' && 'Atencion - queda poco tiempo'}
                                {slaStatus === 'RED' && 'Vencido - supero el tiempo limite'}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}

                <div className="pt-1.5 border-t border-border/40 flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary shrink-0">
                        {getAssignedName().charAt(0).toUpperCase()}
                    </div>
                    <span className="text-[11px] text-muted-foreground font-medium truncate">
                        {getAssignedName()}
                    </span>
                </div>
            </div>
        </Card>
    )
}

// Exportamos memoizado para rendimiento en DnD
export const LeadCard = memo(LeadCardComponent)
