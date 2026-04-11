/**
 * ExportLeadsDialog - Dialog for configuring and exporting leads
 * 
 * Allows users to:
 * - Select export format (Excel/PDF)
 * - Choose which columns to export
 * - Filter by stage
 * - Preview export count
 */

import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Download, FileXls, Spinner } from '@phosphor-icons/react'
import { Lead, Stage, TeamMember } from '@/lib/types'
import { ExportColumn, DEFAULT_EXPORT_COLUMNS } from '@/lib/exportUtils'
import { useExcelExport } from '@/hooks/useExcelExport'

interface ExportLeadsDialogProps {
    leads: Lead[]
    stages: Stage[]
    teamMembers: TeamMember[]
    companyName?: string
    trigger?: React.ReactNode
}

export function ExportLeadsDialog({
    leads,
    stages,
    teamMembers,
    companyName,
    trigger
}: ExportLeadsDialogProps) {
    const [open, setOpen] = useState(false)
    const [selectedStage, setSelectedStage] = useState<string>('all')
    const [columns, setColumns] = useState<ExportColumn[]>(DEFAULT_EXPORT_COLUMNS)

    const { isExporting, exportToExcel } = useExcelExport()

    // Calculate leads count based on selected stage
    const leadsCount = useMemo(() => {
        if (selectedStage === 'all') return leads.length
        return leads.filter(lead => lead.stage === selectedStage).length
    }, [leads, selectedStage])

    // Toggle column selection
    const toggleColumn = (key: string) => {
        setColumns(prev => prev.map(col =>
            col.key === key ? { ...col, enabled: !col.enabled } : col
        ))
    }

    // Handle export
    const handleExport = async () => {
        const stageName = selectedStage === 'all'
            ? undefined
            : stages.find(s => s.id === selectedStage)?.name

        const options = {
            format: 'excel' as const,
            columns,
            stageId: selectedStage === 'all' ? undefined : selectedStage,
            stageName,
            companyName
        }

        await exportToExcel(leads, stages, teamMembers, options)
        setOpen(false)
    }

    // Reset state when dialog closes
    const handleOpenChange = (newOpen: boolean) => {
        setOpen(newOpen)
        if (!newOpen) {
            // Reset to defaults
            setSelectedStage('all')
            setColumns(DEFAULT_EXPORT_COLUMNS)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="outline" size="sm">
                        <Download size={16} className="mr-2" />
                        Exportar
                    </Button>
                )}
            </DialogTrigger>

            <DialogContent className="max-w-2xl h-full max-h-[85vh] flex flex-col overflow-hidden p-0 rounded-2xl">
                <DialogHeader className="p-6 border-b border-border flex flex-row items-center gap-4 shrink-0">
                    <div className="bg-blue-50 p-2.5 rounded-xl border border-blue-100">
                        <Download size={24} className="text-blue-600" />
                    </div>
                    <div className="flex flex-col">
                        <DialogTitle className="text-xl font-bold text-slate-800">
                            Exportar Oportunidades
                        </DialogTitle>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Configura las opciones de exportación para tus oportunidades
                        </p>
                    </div>
                </DialogHeader>

                <ScrollArea className="flex-1 overflow-y-auto">
                    <div className="p-6 space-y-6">
                        {/* Format Info */}
                        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                            <div className="bg-green-100 p-3 rounded-lg border border-green-200">
                                <FileXls size={32} weight="duotone" className="text-green-600" />
                            </div>
                            <div>
                                <p className="font-bold text-slate-800">Formato: Excel (.xlsx)</p>
                                <p className="text-sm text-slate-600">Las oportunidades se exportarán en formato Excel</p>
                            </div>
                        </div>

                        {/* Stage Filter */}
                        <div className="space-y-3">
                            <Label className="text-sm font-bold text-slate-700">Filtrar por Etapa</Label>
                            <Select value={selectedStage} onValueChange={setSelectedStage}>
                                <SelectTrigger className="w-full h-11 rounded-lg border-slate-200">
                                    <SelectValue placeholder="Seleccionar etapa" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas las etapas</SelectItem>
                                    {stages.map(stage => (
                                        <SelectItem key={stage.id} value={stage.id}>
                                            {stage.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-none px-3 py-1 rounded-full text-xs font-bold">
                                    {leadsCount} oportunidades
                                </Badge>
                                <span className="text-sm text-slate-500">serán exportados</span>
                            </div>
                        </div>

                        {/* Column Selection */}
                        <div className="space-y-3">
                            <Label className="text-sm font-bold text-slate-700">Columnas a Exportar</Label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 p-5 bg-slate-50 border border-slate-100 rounded-xl">
                                {columns.map(column => (
                                    <div key={column.key} className="flex items-center space-x-3 group">
                                        <Checkbox
                                            id={column.key}
                                            checked={column.enabled}
                                            onCheckedChange={() => toggleColumn(column.key)}
                                            className="border-slate-300 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
                                        />
                                        <label
                                            htmlFor={column.key}
                                            className="text-sm font-medium text-slate-700 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer group-hover:text-blue-600 transition-colors"
                                        >
                                            {column.label}
                                        </label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                {/* Footer Actions */}
                <div className="p-6 border-t border-slate-100 bg-slate-50/50 shrink-0">
                    <div className="flex items-center justify-between gap-3">
                        <div className="text-sm text-slate-500 font-medium">
                            {columns.filter(c => c.enabled).length} columnas seleccionadas
                        </div>
                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                onClick={() => handleOpenChange(false)}
                                disabled={isExporting}
                                className="border-slate-200 text-slate-600 hover:bg-slate-100 h-10 px-6 rounded-lg font-bold"
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleExport}
                                disabled={isExporting || leadsCount === 0 || columns.filter(c => c.enabled).length === 0}
                                className="bg-blue-600 hover:bg-blue-700 text-white h-10 px-8 rounded-lg font-bold shadow-md shadow-blue-200"
                            >
                                {isExporting ? (
                                    <>
                                        <Spinner className="mr-2 animate-spin" size={18} />
                                        Exportando...
                                    </>
                                ) : (
                                    <>
                                        <Download size={18} weight="bold" className="mr-2" />
                                        Exportar
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
