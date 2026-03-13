import { Plus } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { AddStageDialog } from '@/components/crm/AddStageDialog'
import { PipelineColumn } from './PipelineColumn'
import { Pipeline, Lead, PipelineType, TeamMember, Stage } from '@/lib/types'
import { Company } from '@/components/crm/CompanyManagement'

interface User {
    id: string
    email: string
    businessName: string
}

interface PipelineBoardProps {
    currentPipeline?: Pipeline
    pipelines: Pipeline[]
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
    teamMembers: TeamMember[]
    currentCompany?: Company
    user?: User | null
    companies?: Company[]
    companyId?: string

    // Actions
    onAddStage: (stage: Stage) => void
    onDragOver: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent, stageId: string) => void
    onDeleteStage: (stageId: string) => void
    onEditStage: (stageId: string, updates: { name?: string; color?: string }) => void
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

export function PipelineBoard({
    currentPipeline,
    pipelines,
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
    teamMembers,
    currentCompany,
    user,
    companies,
    companyId,
    onAddStage,
    onDragOver,
    onDrop,
    onDeleteStage,
    onEditStage,
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
}: PipelineBoardProps) {

    return (
        <div className="flex-1 overflow-y-auto md:overflow-hidden bg-background/50">
            {(!pipelines || pipelines.length === 0) && (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <p className="text-lg font-medium">No hay pipelines disponibles</p>
                    <p className="text-sm">Ve a Configuración para crear uno nuevo.</p>
                </div>
            )}
            <div className="h-full md:overflow-x-auto px-4 md:px-6 py-4 md:py-6 pb-24 md:pb-6">
                <div className="flex flex-col md:flex-row gap-6 md:gap-4 h-auto md:h-full md:min-w-max">
                    {(currentPipeline?.stages || []).map(stage => (
                        <PipelineColumn
                            key={stage.id}
                            stage={stage}
                            pipelineLeads={pipelineLeads}
                            allPipelineLeads={allPipelineLeads}
                            stageCounts={stageCounts}
                            stagePages={stagePages}
                            unreadLeads={unreadLeads}
                            notasCounts={notasCounts}
                            meetingsCounts={meetingsCounts}
                            highlightedLeadId={highlightedLeadId}
                            isAdminOrOwner={isAdminOrOwner}
                            canEditLeads={canEditLeads}
                            isMobile={isMobile}
                            activePipeline={activePipeline}
                            currentPipeline={currentPipeline}
                            teamMembers={teamMembers}
                            currentCompany={currentCompany}
                            user={user}
                            companies={companies}
                            companyId={companyId}

                            onDragOver={onDragOver}
                            onDrop={onDrop}
                            onDeleteStage={onDeleteStage}
                            onEditStage={onEditStage}
                            onAddLead={onAddLead}
                            onImportLeads={onImportLeads}
                            onLoadMore={onLoadMore}

                            onDragStart={onDragStart}
                            onLeadClick={onLeadClick}
                            onDeleteLead={onDeleteLead}
                            onMoveToStage={onMoveToStage}
                            onOpenMoveDialog={onOpenMoveDialog}
                            t={t}
                            // Stage DnD
                            onStageDragStart={onStageDragStart}
                            onStageDragOverHeader={onStageDragOverHeader}
                            onStageDropOnHeader={onStageDropOnHeader}
                        />
                    ))}

                    {(currentPipeline?.stages || []).length === 0 && (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground">
                            <div className="text-center">
                                <p className="mb-4">{t.pipeline.noStages}</p>
                                {isAdminOrOwner && (
                                    <AddStageDialog
                                        pipelineType={activePipeline}
                                        currentStagesCount={0}
                                        onAdd={onAddStage}
                                        trigger={
                                            <Button>
                                                <Plus className="mr-2" size={20} />
                                                {t.pipeline.addFirstStage}
                                            </Button>
                                        }
                                    />
                                )}
                            </div>
                        </div>
                    )}

                    {(currentPipeline?.stages || []).length > 0 && canEditLeads && (
                        <div className="w-72 md:w-80 flex flex-col shrink-0 min-h-0">
                            <AddStageDialog
                                pipelineType={activePipeline}
                                currentStagesCount={currentPipeline?.stages.length || 0}
                                onAdd={onAddStage}
                                trigger={
                                    <div className="flex-1 space-y-2 overflow-y-auto min-h-[200px] bg-muted/20 rounded-lg p-2 border-2 border-dashed border-border hover:border-primary transition-colores cursor-pointer flex flex-col items-center justify-center" title={t.pipeline.addStage}>
                                        <Plus size={22} className="text-muted-foreground mb-1" />
                                        <span className="text-xs font-medium text-muted-foreground">{t.pipeline.addStage}</span>
                                    </div>
                                }
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
