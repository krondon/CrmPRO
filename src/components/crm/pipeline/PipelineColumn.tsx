import { useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, Trash } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { Lead, Pipeline, PipelineType, TeamMember, Stage } from '@/lib/types'
import { AddLeadDialog } from '@/components/crm/AddLeadDialog'
import { LeadCard } from './LeadCard'
import { Company } from '@/components/crm/CompanyManagement'

interface User {
    id: string
    email: string
    businessName: string
}

interface PipelineColumnProps {
    stage: Stage
    pipelineLeads: Lead[]
    allPipelineLeads: Lead[]
    stageCounts: Record<string, number>
    stagePages: Record<string, { offset: number; hasMore: boolean }>
    unreadLeads: Set<string>
    notasCounts: Record<string, number>
    meetingsCounts: Record<string, number>
    highlightedLeadId: string | null

    // Permissions & Context
    isAdminOrOwner: boolean
    canEditLeads: boolean
    isMobile: boolean
    activePipeline: PipelineType
    currentPipeline?: Pipeline
    teamMembers: TeamMember[]
    currentCompany?: Company
    user?: User | null
    companies?: Company[]
    companyId?: string

    // Actions
    onDragOver: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent, stageId: string) => void
    onDeleteStage: (stageId: string) => void
    onAddLead: (lead: Lead) => void
    onImportLeads: (leads: Lead[]) => void
    onLoadMore: (stageId: string) => void

    // LeadCard Actions
    onDragStart: (e: React.DragEvent, lead: Lead) => void
    onLeadClick: (lead: Lead) => void
    onDeleteLead: (leadId: string) => void
    onMoveToStage: (lead: Lead, stageId: string) => void
    onOpenMoveDialog: (lead: Lead) => void

    // Helpers
    t: any

    // Stage DnD
    onStageDragStart: (e: React.DragEvent, stage: Stage) => void
    onStageDragOverHeader: (e: React.DragEvent) => void
    onStageDropOnHeader: (e: React.DragEvent, targetStageId: string) => void
}

export function PipelineColumn({
    stage,
    pipelineLeads,
    allPipelineLeads,
    stageCounts,
    stagePages,
    unreadLeads,
    notasCounts,
    meetingsCounts,
    highlightedLeadId,
    isAdminOrOwner,
    canEditLeads,
    isMobile,
    activePipeline,
    currentPipeline,
    teamMembers,
    currentCompany,
    user,
    companies,
    companyId,
    onDragOver,
    onDrop,
    onDeleteStage,
    onAddLead,
    onImportLeads,
    onLoadMore,
    onDragStart,
    onLeadClick,
    onDeleteLead,
    onMoveToStage,
    onOpenMoveDialog,
    t
    ,
    onStageDragStart,
    onStageDragOverHeader,
    onStageDropOnHeader
}: PipelineColumnProps) {

    const stageLeads = pipelineLeads.filter(l => l.stage === stage.id)
    const totalStageLeads = stageCounts[stage.id] ?? allPipelineLeads.filter(l => l.stage === stage.id).length
    const remainingStageLeads = Math.max(0, totalStageLeads - stageLeads.length)

    return (
        <div
            className="w-full md:w-80 md:h-full flex flex-col shrink-0 bg-muted/10 rounded-2xl overflow-hidden border border-border/30 shadow-sm hover:shadow-md transition-shadow duration-200"
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, stage.id)}
        >
            {/* Stage color accent bar */}
            <div className="h-1 w-full" style={{ backgroundColor: stage.color }} />
            <div className="p-3 flex-1 flex flex-col min-h-0">
                {/* Stage Header - Title Row */}
                <div
                    className="sticky top-0 bg-background/95 backdrop-blur z-10 py-2 border-b md:border-none md:static md:bg-transparent md:z-0 md:py-0 mb-3"
                    draggable={isAdminOrOwner}
                    onDragStart={(e) => onStageDragStart(e, stage)}
                    onDragOver={onStageDragOverHeader}
                    onDrop={(e) => onStageDropOnHeader(e, stage.id)}
                >
                    {/* Row 1: Stage Name and Count */}
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className={cn('w-3 h-3 rounded-full shrink-0')} style={{ backgroundColor: stage.color, boxShadow: `0 0 6px ${stage.color}40` }} />
                            <h3 className="font-bold text-sm md:text-base truncate max-w-[120px] tracking-tight" title={stage.name}>{stage.name}</h3>
                            <Badge variant="secondary" className="text-[10px] font-bold shrink-0 rounded-full px-2">{totalStageLeads}</Badge>
                        </div>
                        {/* Action buttons on the right of title row */}
                        <div className="flex items-center gap-1 shrink-0">
                            {isAdminOrOwner && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                    onClick={() => onDeleteStage(stage.id)}
                                    title="Eliminar etapa"
                                >
                                    <Trash size={16} weight="bold" />
                                </Button>
                            )}
                            {canEditLeads && (
                                <AddLeadDialog
                                    pipelineType={activePipeline}
                                    pipelineId={currentPipeline?.id}
                                    stages={currentPipeline?.stages || []}
                                    teamMembers={teamMembers}
                                    onAdd={onAddLead}
                                    onImport={onImportLeads}
                                    defaultStageId={stage.id}
                                    companies={companies}
                                    currentUser={user}
                                    companyName={currentCompany?.name}
                                    companyId={companyId}
                                    trigger={
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 text-muted-foreground hover:bg-background hover:shadow-sm transition-all rounded-lg"
                                            type="button"
                                            title={t.pipeline.addLead}
                                        >
                                            <Plus size={18} weight="bold" />
                                            <span className="sr-only">{t.pipeline.addLead}</span>
                                        </Button>
                                    }
                                />
                            )}
                        </div>
                    </div>

                    {/* Row 2: Load More Controls (Moved to bottom of column but kept here if desired, let's keep it here but styled better) */}
                    {remainingStageLeads > 0 && (
                        <div className="flex items-center justify-center pt-2 pb-1 border-b border-border/50 mb-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onLoadMore(stage.id)}
                                disabled={!stagePages[stage.id]?.hasMore}
                                title={`Cargar más oportunidades de esta etapa (quedan ${remainingStageLeads})`}
                                className="text-[11px] h-6 px-3 text-muted-foreground hover:text-foreground w-full font-semibold bg-background/50 hover:bg-background"
                            >
                                Cargar más ({remainingStageLeads} restantes)
                            </Button>
                        </div>
                    )}
                </div>

                {/* Column Cards Container */}
                <div className="flex flex-row md:flex-col gap-3 overflow-x-auto md:overflow-x-hidden md:overflow-y-auto min-h-[120px] md:min-h-[200px] md:flex-1 pb-4 px-1 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
                    {stageLeads.map(lead => (
                        <LeadCard
                            key={lead.id}
                            lead={lead}
                            stageColor={stage.color}
                            isHighlighted={highlightedLeadId === lead.id}
                            hasUnreadMessages={unreadLeads.has(lead.id)}
                            notesCount={notasCounts[lead.id] || 0}
                            meetingsCount={meetingsCounts[lead.id] || 0}
                            isAdminOrOwner={isAdminOrOwner}
                            canEditLeads={canEditLeads}
                            isMobile={isMobile}
                            currentPipeline={currentPipeline}
                            teamMembers={teamMembers}
                            currentCompany={currentCompany}
                            user={user}

                            onDragStart={onDragStart}
                            onClick={onLeadClick}
                            onDelete={onDeleteLead}
                            onMoveToStage={onMoveToStage}
                            onOpenMoveDialog={onOpenMoveDialog}
                            t={t}
                        />
                    ))}

                    {stageLeads.length === 0 && (
                        <div className="text-center py-10 text-muted-foreground/60 text-xs font-medium">
                            {t.pipeline.noLeads}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
