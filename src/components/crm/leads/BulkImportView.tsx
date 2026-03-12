/**
 * BulkImportView - Vista para importación masiva de oportunidades desde Excel/PDF
 * 
 * Extracted from AddLeadDialog.tsx for better separation of concerns.
 * Uses useExcelImport and usePdfImport hooks for parsing logic.
 */

import { useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { Plus, Upload, FileX, Check, Warning, Spinner, Trash } from '@phosphor-icons/react'
import { Stage } from '@/lib/types'
import { toast } from 'sonner'
import { useExcelImport, PreviewRow } from '@/hooks/useExcelImport'
import { usePdfImport } from '@/hooks/usePdfImport'

interface BulkImportViewProps {
    stages: Stage[]
    companyId?: string
    stageId: string
    onStageChange: (stageId: string) => void
    onImport: (validRows: PreviewRow[]) => Promise<void>
}

export function BulkImportView({
    stages,
    companyId,
    stageId,
    onStageChange,
    onImport
}: BulkImportViewProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Use the extracted hooks
    const {
        previewData,
        setPreviewData,
        importStatus,
        setImportStatus,
        progress,
        parseExcel,
        handleCellEdit,
        handleDeleteRow,
        handleAddRow,
        resetImport
    } = useExcelImport({ companyId })

    const { parsePDF } = usePdfImport()

    // File change handler
    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0]
        if (!selectedFile) return

        setImportStatus('preview')

        try {
            const fileExtension = selectedFile.name.split('.').pop()?.toLowerCase()

            if (fileExtension === 'pdf') {
                const pdfData = await parsePDF(selectedFile)
                setPreviewData(pdfData)
            } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
                await parseExcel(selectedFile)
            } else {
                toast.error("Formato no soportado. Use .xlsx, .xls o .pdf")
                setImportStatus('idle')
            }
        } catch (err) {
            console.error("Error parsing file", err)
            toast.error("Error al leer el archivo")
            setImportStatus('idle')
        }
    }, [parsePDF, parseExcel, setImportStatus, setPreviewData])

    // Handle import button click
    const handleImportClick = async () => {
        if (!stageId) {
            toast.error('Debes seleccionar una etapa inicial para las oportunidades')
            return
        }

        const validRows = previewData.filter(r => r.isValid)
        if (validRows.length === 0) {
            toast.error('No hay oportunidades válidas para importar')
            return
        }

        setImportStatus('importing')

        try {
            await onImport(validRows)
            setImportStatus('success')
            toast.success(`${validRows.length} oportunidades importadas exitosamente`)

            // Auto reset after success
            setTimeout(() => {
                resetImport()
            }, 2000)
        } catch (err) {
            console.error('Import error:', err)
            toast.error('Error al importar las oportunidades')
            setImportStatus('preview')
        }
    }

    // Cancel and reset
    const handleCancel = () => {
        resetImport()
    }

    return (
        <div className="space-y-4 h-full flex flex-col">
            {/* Stage selector */}
            <div className="space-y-2">
                <Label>Etapa Inicial para las Oportunidades</Label>
                <Select value={stageId} onValueChange={onStageChange}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {stages.map(stage => (
                            <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* File drop zone - only show when idle */}
            {importStatus === 'idle' && (
                <div
                    className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/25 rounded-lg p-10 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                >
                    <div className="bg-primary/10 p-4 rounded-full mb-4">
                        <Upload size={32} className="text-primary" />
                    </div>
                    <p className="text-lg font-medium">Click para seleccionar archivo</p>
                    <p className="text-sm text-muted-foreground mt-1">Soporta .xlsx, .xls, .pdf</p>
                    <p className="text-xs text-muted-foreground mt-4 text-center">
                        Columnas: Nombre, Teléfono, Correo, Empresa
                    </p>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".xlsx, .xls, .pdf"
                        onChange={handleFileChange}
                    />
                </div>
            )}

            {/* Preview table and controls */}
            {(importStatus === 'preview' || importStatus === 'importing' || importStatus === 'success') && (
                <div className="space-y-4 flex-1 flex flex-col min-h-0">
                    {/* Header with file info and actions */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary">{previewData.length} contactos</Badge>
                            <Badge variant="outline" className="text-xs text-muted-foreground sm:hidden">
                                ← Desliza →
                            </Badge>
                        </div>
                        {importStatus === 'preview' && (
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="default"
                                    size="sm"
                                    onClick={handleAddRow}
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                >
                                    <Plus className="sm:mr-1" size={14} />
                                    <span className="hidden sm:inline">Añadir Fila</span>
                                </Button>
                                <Button variant="ghost" size="sm" onClick={handleCancel}>
                                    <FileX className="sm:mr-1" size={14} />
                                    <span className="hidden sm:inline">Cancelar</span>
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Mobile hint */}
                    <p className="text-xs text-muted-foreground sm:hidden text-center italic">
                        Desliza horizontalmente para ver todas las columnas
                    </p>

                    {/* Preview table */}
                    <ScrollArea className="h-[250px] sm:h-[400px] border rounded-md w-full">
                        <div className="overflow-x-auto">
                            <Table className="min-w-[800px]">
                                <TableHeader className="sticky top-0 bg-background z-10">
                                    <TableRow className="bg-muted/50">
                                        <TableHead className="w-[60px] text-center">Estado</TableHead>
                                        <TableHead className="min-w-[150px]">Nombre</TableHead>
                                        <TableHead className="min-w-[120px]">Teléfono</TableHead>
                                        <TableHead className="min-w-[180px]">Correo</TableHead>
                                        <TableHead className="min-w-[150px]">Empresa</TableHead>
                                        <TableHead className="min-w-[120px]">Ubicación</TableHead>
                                        <TableHead className="w-[100px]">Presupuesto</TableHead>
                                        <TableHead className="w-[60px] text-center">Acción</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {previewData.slice(0, 100).map((row, i) => (
                                        <TableRow key={i} className="hover:bg-muted/30">
                                            <TableCell className="text-center">
                                                {row.isValid ? (
                                                    <Check size={18} className="text-green-500 mx-auto" />
                                                ) : (
                                                    <span title={row.error} className="cursor-help">
                                                        <Warning size={18} className="text-amber-500 mx-auto" />
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="p-1">
                                                <Input
                                                    value={row.nombre_completo || ''}
                                                    onChange={(e) => handleCellEdit(i, 'nombre_completo', e.target.value)}
                                                    className="h-8 text-xs bg-blue-50/50 border-blue-200 focus:bg-white min-w-[120px]"
                                                    placeholder="Nombre"
                                                />
                                            </TableCell>
                                            <TableCell className="p-1">
                                                <Input
                                                    value={row.telefono || ''}
                                                    onChange={(e) => handleCellEdit(i, 'telefono', e.target.value)}
                                                    className="h-7 text-xs bg-blue-50/50 border-blue-200 focus:bg-white min-w-[100px]"
                                                    placeholder="Teléfono"
                                                />
                                            </TableCell>
                                            <TableCell className="p-1">
                                                <Input
                                                    value={row.correo_electronico || ''}
                                                    onChange={(e) => handleCellEdit(i, 'correo_electronico', e.target.value)}
                                                    className="h-8 text-xs bg-blue-50/50 border-blue-200 focus:bg-white min-w-[120px]"
                                                    placeholder="Email"
                                                />
                                            </TableCell>
                                            <TableCell className="p-1">
                                                <Input
                                                    value={row.empresa || ''}
                                                    onChange={(e) => handleCellEdit(i, 'empresa', e.target.value)}
                                                    className="h-7 text-xs bg-blue-50/50 border-blue-200 focus:bg-white min-w-[100px]"
                                                    placeholder="Empresa"
                                                />
                                            </TableCell>
                                            <TableCell className="p-1">
                                                <Input
                                                    value={row.ubicacion || ''}
                                                    onChange={(e) => handleCellEdit(i, 'ubicacion', e.target.value)}
                                                    className="h-7 text-xs bg-blue-50/50 border-blue-200 focus:bg-white min-w-[80px]"
                                                    placeholder="Ubicación"
                                                />
                                            </TableCell>
                                            <TableCell className="p-1">
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    value={row.presupuesto || 0}
                                                    onChange={(e) => handleCellEdit(i, 'presupuesto', Math.max(0, Number(e.target.value)))}
                                                    className="h-8 text-xs bg-blue-50/50 border-blue-200 focus:bg-white w-[80px]"
                                                    placeholder="0"
                                                />
                                            </TableCell>
                                            <TableCell className="p-1 text-center">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 w-8 p-0 text-red-500 hover:text-white hover:bg-red-500 rounded-full"
                                                    onClick={() => handleDeleteRow(i)}
                                                    title="Eliminar fila"
                                                >
                                                    <Trash size={16} />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {previewData.length > 100 && (
                                        <TableRow>
                                            <TableCell colSpan={8} className="text-center text-muted-foreground text-xs">
                                                ... y {previewData.length - 100} más
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </ScrollArea>

                    {/* Action buttons */}
                    <div className="pt-2">
                        {importStatus === 'preview' && (
                            <Button
                                onClick={handleImportClick}
                                className="w-full"
                                disabled={previewData.filter(r => r.isValid).length === 0}
                            >
                                Importar {previewData.filter(r => r.isValid).length} Oportunidades
                            </Button>
                        )}
                        {importStatus === 'importing' && (
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <Progress value={progress} className="h-2" />
                                    <p className="text-xs text-center text-muted-foreground">Procesando... {progress}%</p>
                                </div>
                                <Button disabled className="w-full">
                                    <Spinner className="mr-2 animate-spin" />
                                    Importando...
                                </Button>
                            </div>
                        )}
                        {importStatus === 'success' && (
                            <Button variant="default" className="w-full bg-green-600 hover:bg-green-700">
                                <Check className="mr-2" />
                                Listo
                            </Button>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
