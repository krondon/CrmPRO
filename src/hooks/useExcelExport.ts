/**
 * useExcelExport - Hook for exporting leads to Excel format
 * 
 * Uses the xlsx library to generate Excel files with formatted data
 */

import { useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { Lead, Stage, TeamMember } from '@/lib/types'
import {
    ExportOptions,
    formatLeadForExport,
    generateFileName,
    downloadFile,
    DEFAULT_EXPORT_COLUMNS
} from '@/lib/exportUtils'
import { toast } from 'sonner'

interface UseExcelExportReturn {
    isExporting: boolean
    exportToExcel: (leads: Lead[], stages: Stage[], teamMembers: TeamMember[], options: ExportOptions) => Promise<void>
}

export function useExcelExport(): UseExcelExportReturn {
    const [isExporting, setIsExporting] = useState(false)

    const exportToExcel = useCallback(async (
        leads: Lead[],
        stages: Stage[],
        teamMembers: TeamMember[],
        options: ExportOptions
    ) => {
        setIsExporting(true)

        try {
            // Filter leads by stage if specified
            let filteredLeads = leads
            if (options.stageId) {
                filteredLeads = leads.filter(lead => lead.stage === options.stageId)
            }

            if (filteredLeads.length === 0) {
                toast.error('No hay leads para exportar en esta etapa')
                setIsExporting(false)
                return
            }

            // Get enabled columns
            const enabledColumns = options.columns.filter(col => col.enabled)

            // Format leads for export
            const formattedLeads = filteredLeads.map(lead => {
                const stage = stages.find(s => s.id === lead.stage)
                const assignedMember = teamMembers.find(m => m.id === lead.assignedTo || m.userId === lead.assignedTo || m.name === lead.assignedTo)

                const formatted = formatLeadForExport(
                    lead,
                    stage?.name,
                    assignedMember?.name
                )

                // Only include enabled columns
                const row: Record<string, any> = {}
                enabledColumns.forEach(col => {
                    row[col.label] = formatted[col.key] || ''
                })

                return row
            })

            // Create worksheet
            const worksheet = XLSX.utils.json_to_sheet(formattedLeads)

            // Auto-size columns
            const columnWidths = enabledColumns.map(col => ({
                wch: Math.max(col.label.length, 15)
            }))
            worksheet['!cols'] = columnWidths

            // Create workbook
            const workbook = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads')

            // Generate Excel file
            const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
            const blob = new Blob([excelBuffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            })

            // Download file
            const fileName = generateFileName('excel', options.companyName, options.stageName)
            downloadFile(blob, fileName)

            toast.success(`${filteredLeads.length} leads exportados exitosamente`)
        } catch (error) {
            console.error('Error exporting to Excel:', error)
            toast.error('Error al exportar a Excel')
        } finally {
            setIsExporting(false)
        }
    }, [])

    return {
        isExporting,
        exportToExcel
    }
}
