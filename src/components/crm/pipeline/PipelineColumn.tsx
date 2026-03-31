import { useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash, PencilSimple, Check, X, ArrowsClockwise } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { Lead, Pipeline, PipelineType, TeamMember, Stage } from '@/lib/types'
import { AddLeadDialog } from '@/components/crm/AddLeadDialog'
import { LeadCard } from './LeadCard'
import { Company } from '@/components/crm/CompanyManagement'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

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
    onEditStage: (stageId: string, updates: { name?: string; color?: string; is_sla_enabled?: boolean; sla_limit_minutes?: number | null }) => void
    onResetSLA?: (stageId: string) => void
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
    onEditStage,
    onResetSLA,
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

    const [isEditing, setIsEditing] = useState(false)
    const [editName, setEditName] = useState(stage.name)
    const [editColor, setEditColor] = useState(stage.color)

    const initialSlaMinutes = stage.sla_limit_minutes || 30
    const initialSlaUnit = initialSlaMinutes % 1440 === 0 ? 'days' : initialSlaMinutes % 60 === 0 ? 'hours' : 'minutes'
    const initialSlaValue = initialSlaUnit === 'days' ? initialSlaMinutes / 1440 : initialSlaUnit === 'hours' ? initialSlaMinutes / 60 : initialSlaMinutes

    const [editSlaEnabled, setEditSlaEnabled] = useState(stage.is_sla_enabled || false)
    const [editSlaValue, setEditSlaValue] = useState(initialSlaValue)
    const [editSlaUnit, setEditSlaUnit] = useState<"minutes" | "hours" | "days">(initialSlaUnit)
    
    const editInputRef = useRef<HTMLInputElement>(null)

    const predefinedColors = [
        '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
        '#10b981', '#06b6d4', '#6366f1', '#ef4444'
    ]

    const handleStartEdit = () => {
        setEditName(stage.name)
        setEditColor(stage.color)
        setEditSlaEnabled(stage.is_sla_enabled || false)
        const resetMins = stage.sla_limit_minutes || 30
        const resetUnit = resetMins % 1440 === 0 ? 'days' : resetMins % 60 === 0 ? 'hours' : 'minutes'
        setEditSlaValue(resetUnit === 'days' ? resetMins / 1440 : resetUnit === 'hours' ? resetMins / 60 : resetMins)
        setEditSlaUnit(resetUnit)

        setIsEditing(true)
        setTimeout(() => editInputRef.current?.focus(), 50)
    }

    const handleSaveEdit = () => {
        if (!editName.trim()) return
        const updates: { name?: string; color?: string; is_sla_enabled?: boolean; sla_limit_minutes?: number | null } = {}
        if (editName.trim() !== stage.name) updates.name = editName.trim()
        if (editColor !== stage.color) updates.color = editColor

        let targetSlaMinutes: number | null = null
        if (editSlaEnabled) {
            if (editSlaUnit === 'days') targetSlaMinutes = editSlaValue * 1440
            else if (editSlaUnit === 'hours') targetSlaMinutes = editSlaValue * 60
            else targetSlaMinutes = editSlaValue
        }

        if (editSlaEnabled !== stage.is_sla_enabled) updates.is_sla_enabled = editSlaEnabled
        if (targetSlaMinutes !== stage.sla_limit_minutes) updates.sla_limit_minutes = targetSlaMinutes

        if (Object.keys(updates).length > 0) {
            onEditStage(stage.id, updates)
        }
        setIsEditing(false)
    }

    const handleCancelEdit = () => {
        setEditName(stage.name)
        setEditColor(stage.color)
        setEditSlaEnabled(stage.is_sla_enabled || false)
        setIsEditing(false)
    }

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
                    {isEditing ? (
                        <div className="mb-2 space-y-3 p-2 bg-background rounded-md border">
                            <div className="flex items-center gap-1.5">
                                <Input
                                    ref={editInputRef}
                                    value={editName}
                                    onChange={(e) => { if (e.target.value.length <= 30) setEditName(e.target.value) }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') handleCancelEdit() }}
                                    className="h-8 text-sm font-bold flex-1"
                                    placeholder="Nombre de la etapa"
                                />
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={handleSaveEdit}>
                                    <Check size={16} weight="bold" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={handleCancelEdit}>
                                    <X size={16} weight="bold" />
                                </Button>
                            </div>
                            <div className="flex items-center gap-1.5">
                                {predefinedColors.map(c => (
                                    <button
                                        key={c}
                                        className={cn('w-5 h-5 rounded-full border-2 transition-all', editColor === c ? 'border-foreground scale-110' : 'border-border/50')}
                                        style={{ backgroundColor: c }}
                                        onClick={() => setEditColor(c)}
                                        title="Color de etapa"
                                    />
                                ))}
                                <input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)} className="w-5 h-5 p-0 border-0 rounded-full cursor-pointer" title="Color personalizado" />
                            </div>
                            <div className="space-y-2 border-t pt-2 mt-2">
                                <div className="flex items-center justify-between">
                                    <Label className="cursor-pointer text-xs" onClick={() => setEditSlaEnabled(!editSlaEnabled)}>
                                        Semaforo de tiempo
                                    </Label>
                                    <Switch checked={editSlaEnabled} onCheckedChange={setEditSlaEnabled} />
                                </div>
                                <p className="text-[10px] text-muted-foreground leading-tight">
                                    Las tarjetas cambiaran de color segun el tiempo que lleven en esta etapa.
                                </p>
                                {editSlaEnabled && (
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                        <div className="flex flex-col gap-1">
                                            <Label className="text-[10px] text-muted-foreground">Limite</Label>
                                            <Input
                                                type="number"
                                                min={1}
                                                className="h-7 text-xs"
                                                value={editSlaValue}
                                                onChange={(e) => setEditSlaValue(Number(e.target.value))}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <Label className="text-[10px] text-muted-foreground">Unidad</Label>
                                            <Select value={editSlaUnit} onValueChange={(val: any) => setEditSlaUnit(val)}>
                                                <SelectTrigger className="h-7 text-xs">
                                                    <SelectValue placeholder="Unidad" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="minutes">Minutos</SelectItem>
                                                    <SelectItem value="hours">Horas</SelectItem>
                                                    <SelectItem value="days">Días</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className={cn('w-3 h-3 rounded-full shrink-0')} style={{ backgroundColor: stage.color, boxShadow: `0 0 6px ${stage.color}40` }} />
                            <h3 className="font-bold text-sm md:text-base truncate max-w-[120px] tracking-tight" title={stage.name}>{stage.name}</h3>
                            <Badge variant="secondary" className="text-[10px] font-bold shrink-0 rounded-full px-2">{totalStageLeads}</Badge>
                        </div>
                        {/* Action buttons on the right of title row */}
                        <div className="flex items-center gap-1 shrink-0">
                            {isAdminOrOwner && stage.is_sla_enabled && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-amber-500"
                                    onClick={() => onResetSLA?.(stage.id)}
                                    title="Reiniciar semáforos de la etapa"
                                >
                                    <ArrowsClockwise size={15} weight="bold" />
                                </Button>
                            )}
                            {isAdminOrOwner && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                                    onClick={handleStartEdit}
                                    title="Editar etapa"
                                >
                                    <PencilSimple size={15} weight="bold" />
                                </Button>
                            )}
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
                                    assignmentType={currentPipeline?.assignment_type}
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
                    )}

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
                            stage={stage}
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
