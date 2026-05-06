/**
 * usePdfExport - Hook for exporting leads to PDF format
 * 
 * Uses jsPDF and jspdf-autotable to generate formatted PDF documents
 */

import { useState, useCallback } from 'react'
import { Lead, Stage, TeamMember } from '@/lib/types'
import {
    ExportOptions,
    formatLeadForExport,
    generateFileName,
    downloadFile
} from '@/lib/exportUtils'
import { toast } from 'sonner'

interface UsePdfExportReturn {
    isExporting: boolean
    exportToPDF: (leads: Lead[], stages: Stage[], teamMembers: TeamMember[], options: ExportOptions) => Promise<void>
}

export function usePdfExport(): UsePdfExportReturn {
    const [isExporting, setIsExporting] = useState(false)

    const exportToPDF = useCallback(async (
        leads: Lead[],
        stages: Stage[],
        teamMembers: TeamMember[],
        options: ExportOptions
    ) => {
        setIsExporting(true)

        try {
            // Dynamic import to reduce bundle size
            const jsPDFModule = await import('jspdf')
            const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF || jsPDFModule
            await import('jspdf-autotable')

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

                return formatLeadForExport(
                    lead,
                    stage?.name,
                    assignedMember?.name
                )
            })

            // Create PDF document
            const doc = new jsPDF({
                orientation: 'landscape',
                unit: 'mm',
                format: 'a4'
            })

            // Add header
            doc.setFontSize(18)
            doc.setTextColor(40, 40, 40)
            const title = options.stageName
                ? `Leads - ${options.stageName}`
                : 'Leads Exportados'
            doc.text(title, 14, 15)

            // Add company name if provided
            if (options.companyName) {
                doc.setFontSize(12)
                doc.setTextColor(100, 100, 100)
                doc.text(options.companyName, 14, 22)
            }

            // Add date
            doc.setFontSize(10)
            doc.setTextColor(150, 150, 150)
            const dateStr = new Date().toLocaleDateString('es-ES', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            })
            doc.text(`Generado: ${dateStr}`, 14, options.companyName ? 28 : 22)

            // Prepare table data
            const headers = enabledColumns.map(col => col.label)
            const rows = formattedLeads.map(lead =>
                enabledColumns.map(col => String(lead[col.key] || ''))
            )

            // Add table using autotable
            const startY = options.companyName ? 35 : 28

            // @ts-ignore - jspdf-autotable extends jsPDF
            doc.autoTable({
                head: [headers],
                body: rows,
                startY: startY,
                theme: 'grid',
                styles: {
                    fontSize: 8,
                    cellPadding: 2,
                    overflow: 'linebreak',
                    halign: 'left'
                },
                headStyles: {
                    fillColor: [59, 130, 246], // Blue
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    halign: 'center'
                },
                alternateRowStyles: {
                    fillColor: [245, 247, 250]
                },
                margin: { top: 10, right: 10, bottom: 10, left: 10 },
                didDrawPage: (data: any) => {
                    // Footer
                    const pageCount = doc.getNumberOfPages()
                    doc.setFontSize(8)
                    doc.setTextColor(150, 150, 150)
                    doc.text(
                        `Página ${data.pageNumber} de ${pageCount}`,
                        doc.internal.pageSize.width / 2,
                        doc.internal.pageSize.height - 10,
                        { align: 'center' }
                    )
                }
            })

            // Generate blob and download
            const blob = doc.output('blob')
            const fileName = generateFileName('pdf', options.companyName, options.stageName)
            downloadFile(blob, fileName)

            toast.success(`${filteredLeads.length} leads exportados exitosamente`)
        } catch (error) {
            console.error('Error exporting to PDF:', error)
            toast.error('Error al exportar a PDF')
        } finally {
            setIsExporting(false)
        }
    }, [])

    return {
        isExporting,
        exportToPDF
    }
}
