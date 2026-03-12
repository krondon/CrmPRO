/**
 * Export Utilities - Helper functions for exporting leads to Excel and PDF
 */

import { Lead, Stage } from './types'

export type ExportFormat = 'excel' | 'pdf'

export interface ExportColumn {
    key: keyof Lead | 'stageName' | 'assignedToName'
    label: string
    enabled: boolean
}

export interface ExportOptions {
    format: ExportFormat
    columns: ExportColumn[]
    stageId?: string
    stageName?: string
    companyName?: string
}

/**
 * Default columns for export
 */
export const DEFAULT_EXPORT_COLUMNS: ExportColumn[] = [
    { key: 'name', label: 'Nombre Completo', enabled: true },
    { key: 'phone', label: 'Teléfono', enabled: true },
    { key: 'email', label: 'Correo Electrónico', enabled: true },
    { key: 'company', label: 'Empresa', enabled: true },
    { key: 'location', label: 'Ubicación', enabled: true },
    { key: 'budget', label: 'Presupuesto', enabled: true },
    { key: 'stageName', label: 'Etapa Actual', enabled: true },
    { key: 'priority', label: 'Prioridad', enabled: true },
    { key: 'assignedToName', label: 'Asignado A', enabled: true },
    { key: 'createdAt', label: 'Fecha de Creación', enabled: true },
]

/**
 * Format a lead for export
 */
export function formatLeadForExport(
    lead: Lead,
    stageName?: string,
    assignedToName?: string
): Record<string, any> {
    return {
        name: lead.name || '',
        phone: lead.phone || '',
        email: lead.email || '',
        company: lead.company || '',
        location: lead.location || '',
        budget: lead.budget ? `$${lead.budget.toLocaleString()}` : '$0',
        stageName: stageName || 'Sin etapa',
        priority: lead.priority === 'high' ? 'Alta' : lead.priority === 'medium' ? 'Media' : 'Baja',
        assignedToName: assignedToName || 'Sin asignar',
        createdAt: lead.createdAt ? new Date(lead.createdAt).toLocaleDateString('es-ES') : '',
    }
}

/**
 * Get column label by key
 */
export function getColumnLabel(key: string): string {
    const column = DEFAULT_EXPORT_COLUMNS.find(col => col.key === key)
    return column?.label || key
}

/**
 * Generate file name with timestamp
 */
export function generateFileName(format: ExportFormat, companyName?: string, stageName?: string): string {
    const timestamp = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    const company = companyName ? `${companyName}_` : ''
    const stage = stageName ? `${stageName}_` : ''
    const extension = format === 'excel' ? 'xlsx' : 'pdf'

    return `${company}${stage}Oportunidades_${timestamp}.${extension}`
}

/**
 * Trigger file download in browser
 */
export function downloadFile(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}

/**
 * Format budget for display
 */
export function formatBudget(budget?: number): string {
    if (!budget) return '$0'
    return `$${budget.toLocaleString('es-ES')}`
}

/**
 * Format priority for display
 */
export function formatPriority(priority?: string): string {
    switch (priority) {
        case 'high':
            return 'Alta'
        case 'medium':
            return 'Media'
        case 'low':
            return 'Baja'
        default:
            return 'Sin prioridad'
    }
}

/**
 * Format date for display
 */
export function formatDate(date?: Date | string): string {
    if (!date) return ''
    const d = typeof date === 'string' ? new Date(date) : date
    return d.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    })
}
