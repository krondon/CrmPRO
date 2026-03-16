import { useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Contact } from '@/lib/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DownloadSimple, UploadSimple, FileX, Check, Spinner } from '@phosphor-icons/react'
import { toast } from 'sonner'

type ContactImportField =
    | 'ignore'
    | 'name'
    | 'email'
    | 'phone'
    | 'company'
    | 'position'
    | 'location'
    | 'notes'
    | 'source'
    | 'rating'
    | 'linkedin'
    | 'instagram'
    | 'twitter'

interface ContactsImportExportDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    contacts: Contact[]
    onImportMappedContacts: (rows: Partial<Contact>[]) => Promise<number>
}

interface ParsedExcelState {
    headers: string[]
    rows: Record<string, any>[]
}

const FIELD_OPTIONS: { value: ContactImportField; label: string }[] = [
    { value: 'ignore', label: 'Ignorar columna' },
    { value: 'name', label: 'Nombre completo' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Telefono' },
    { value: 'company', label: 'Empresa' },
    { value: 'position', label: 'Cargo' },
    { value: 'location', label: 'Ubicacion' },
    { value: 'notes', label: 'Notas' },
    { value: 'source', label: 'Fuente' },
    { value: 'rating', label: 'Rating (1-5)' },
    { value: 'linkedin', label: 'LinkedIn' },
    { value: 'instagram', label: 'Instagram' },
    { value: 'twitter', label: 'Twitter' }
]

function normalizeHeader(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
}

function suggestField(header: string): ContactImportField {
    const h = normalizeHeader(header)

    if (/(^|\s)(nombre|name|cliente|contacto)(\s|$)/.test(h)) return 'name'
    if (/(email|correo|mail)/.test(h)) return 'email'
    if (/(telefono|celular|cel|movil|whatsapp|phone)/.test(h)) return 'phone'
    if (/(empresa|company|compania|negocio|organizacion)/.test(h)) return 'company'
    if (/(cargo|puesto|position|rol)/.test(h)) return 'position'
    if (/(ubicacion|location|ciudad|direccion|pais|zona)/.test(h)) return 'location'
    if (/(nota|comentario|observacion|notes)/.test(h)) return 'notes'
    if (/(fuente|source|origen|canal)/.test(h)) return 'source'
    if (/(rating|puntuacion|score|estrellas)/.test(h)) return 'rating'
    if (/linkedin/.test(h)) return 'linkedin'
    if (/instagram/.test(h)) return 'instagram'
    if (/(twitter|x.com|x )/.test(h)) return 'twitter'

    return 'ignore'
}

function safeString(value: any): string {
    if (value === undefined || value === null) return ''
    return String(value).trim()
}

function clampRating(value: any): 1 | 2 | 3 | 4 | 5 | undefined {
    const n = Number(value)
    if (!Number.isFinite(n)) return undefined
    if (n < 1) return 1
    if (n > 5) return 5
    return Math.round(n) as 1 | 2 | 3 | 4 | 5
}

export function ContactsImportExportDialog({
    open,
    onOpenChange,
    contacts,
    onImportMappedContacts
}: ContactsImportExportDialogProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [isImporting, setIsImporting] = useState(false)
    const [parsedExcel, setParsedExcel] = useState<ParsedExcelState | null>(null)
    const [columnMapping, setColumnMapping] = useState<Record<string, ContactImportField>>({})

    const mappedPreview = useMemo(() => {
        if (!parsedExcel) return []

        return parsedExcel.rows.slice(0, 10).map((row) => {
            const mapped: Partial<Contact> = {
                socialNetworks: {}
            }

            parsedExcel.headers.forEach((header) => {
                const target = columnMapping[header] || 'ignore'
                const raw = row[header]

                if (target === 'ignore') return

                if (target === 'name') mapped.name = safeString(raw)
                if (target === 'email') mapped.email = safeString(raw)
                if (target === 'phone') mapped.phone = safeString(raw)
                if (target === 'company') mapped.company = safeString(raw)
                if (target === 'position') mapped.position = safeString(raw)
                if (target === 'location') mapped.location = safeString(raw)
                if (target === 'notes') mapped.notes = safeString(raw)
                if (target === 'source') mapped.source = safeString(raw)
                if (target === 'rating') mapped.rating = clampRating(raw)

                if (target === 'linkedin') {
                    mapped.socialNetworks = {
                        ...(mapped.socialNetworks || {}),
                        linkedin: safeString(raw)
                    }
                }
                if (target === 'instagram') {
                    mapped.socialNetworks = {
                        ...(mapped.socialNetworks || {}),
                        instagram: safeString(raw)
                    }
                }
                if (target === 'twitter') {
                    mapped.socialNetworks = {
                        ...(mapped.socialNetworks || {}),
                        twitter: safeString(raw)
                    }
                }
            })

            return mapped
        })
    }, [parsedExcel, columnMapping])

    const validMappedRowsCount = useMemo(() => {
        if (!parsedExcel) return 0

        let valid = 0

        parsedExcel.rows.forEach((row) => {
            let mappedName = ''
            parsedExcel.headers.forEach((header) => {
                if ((columnMapping[header] || 'ignore') === 'name') {
                    mappedName = safeString(row[header])
                }
            })
            if (mappedName) valid += 1
        })

        return valid
    }, [parsedExcel, columnMapping])

    const handleExcelFile = async (file: File) => {
        try {
            const buffer = await file.arrayBuffer()
            const workbook = XLSX.read(buffer)
            const firstSheetName = workbook.SheetNames[0]
            const worksheet = workbook.Sheets[firstSheetName]

            const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' })

            if (!rows.length) {
                toast.error('El archivo no tiene filas para importar')
                return
            }

            const headers = Object.keys(rows[0])
            const suggested: Record<string, ContactImportField> = {}
            headers.forEach((h) => {
                suggested[h] = suggestField(h)
            })

            setParsedExcel({ headers, rows })
            setColumnMapping(suggested)
            toast.success(`Archivo cargado: ${rows.length} filas detectadas`)
        } catch (error) {
            console.error('Error parsing excel:', error)
            toast.error('No se pudo leer el archivo Excel')
        }
    }

    const handleImport = async () => {
        if (!parsedExcel) return

        setIsImporting(true)
        try {
            const mappedRows: Partial<Contact>[] = parsedExcel.rows
                .map((row) => {
                    const mapped: Partial<Contact> = {
                        socialNetworks: {}
                    }

                    parsedExcel.headers.forEach((header) => {
                        const target = columnMapping[header] || 'ignore'
                        const raw = row[header]
                        if (target === 'ignore') return

                        if (target === 'name') mapped.name = safeString(raw)
                        if (target === 'email') mapped.email = safeString(raw)
                        if (target === 'phone') mapped.phone = safeString(raw)
                        if (target === 'company') mapped.company = safeString(raw)
                        if (target === 'position') mapped.position = safeString(raw)
                        if (target === 'location') mapped.location = safeString(raw)
                        if (target === 'notes') mapped.notes = safeString(raw)
                        if (target === 'source') mapped.source = safeString(raw)
                        if (target === 'rating') mapped.rating = clampRating(raw)

                        if (target === 'linkedin') {
                            mapped.socialNetworks = {
                                ...(mapped.socialNetworks || {}),
                                linkedin: safeString(raw)
                            }
                        }
                        if (target === 'instagram') {
                            mapped.socialNetworks = {
                                ...(mapped.socialNetworks || {}),
                                instagram: safeString(raw)
                            }
                        }
                        if (target === 'twitter') {
                            mapped.socialNetworks = {
                                ...(mapped.socialNetworks || {}),
                                twitter: safeString(raw)
                            }
                        }
                    })

                    return mapped
                })
                .filter((item) => !!item.name)

            if (!mappedRows.length) {
                toast.error('No hay filas validas. Debes mapear una columna al campo Nombre.')
                setIsImporting(false)
                return
            }

            const imported = await onImportMappedContacts(mappedRows)
            if (imported > 0) {
                setParsedExcel(null)
                setColumnMapping({})
                onOpenChange(false)
            }
        } finally {
            setIsImporting(false)
        }
    }

    const handleExport = () => {
        if (!contacts.length) {
            toast.error('No hay contactos para exportar')
            return
        }

        const rows = contacts.map((c) => ({
            Nombre: c.name || '',
            Email: c.email || '',
            Telefono: c.phone || '',
            Empresa: c.company || '',
            Cargo: c.position || '',
            Ubicacion: c.location || '',
            Fuente: c.source || '',
            Rating: c.rating || '',
            Notas: c.notes || '',
            LinkedIn: c.socialNetworks?.linkedin || '',
            Instagram: c.socialNetworks?.instagram || '',
            Twitter: c.socialNetworks?.twitter || ''
        }))

        const ws = XLSX.utils.json_to_sheet(rows)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Contactos')
        XLSX.writeFile(wb, `Contactos_${new Date().toISOString().slice(0, 10)}.xlsx`)
        toast.success(`${rows.length} contactos exportados`)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-4xl max-h-[90vh] flex flex-col p-4 sm:p-6 overflow-hidden">
                <DialogHeader className="flex-none">
                    <DialogTitle>Importar / Exportar Contactos</DialogTitle>
                </DialogHeader>

                <Tabs defaultValue="import" className="flex-1 flex flex-col min-h-0">
                    <TabsList className="grid grid-cols-2 w-full h-auto p-1 gap-1 flex-none">
                        <TabsTrigger value="import" className="text-xs sm:text-sm">Importar Excel</TabsTrigger>
                        <TabsTrigger value="export" className="text-xs sm:text-sm">Exportar Excel</TabsTrigger>
                    </TabsList>

                    <TabsContent value="import" className="flex-1 overflow-y-auto pr-1 mt-4 space-y-4 data-[state=inactive]:hidden">
                        {!parsedExcel && (
                            <div className="space-y-3">
                                <Label>Archivo Excel</Label>
                                <div
                                    className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center cursor-pointer hover:bg-muted/40 transition-colors"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <UploadSimple size={32} className="mx-auto text-primary mb-3" />
                                    <p className="font-medium">Selecciona un archivo .xlsx o .xls</p>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Luego podras decidir en que campo del CRM guardar cada columna.
                                    </p>
                                </div>
                                <Input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".xlsx,.xls"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (file) void handleExcelFile(file)
                                    }}
                                />
                            </div>
                        )}

                        {parsedExcel && (
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <Badge variant="secondary">{parsedExcel.rows.length} filas</Badge>
                                        <Badge variant="outline">{validMappedRowsCount} validas para importar</Badge>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setParsedExcel(null)
                                            setColumnMapping({})
                                        }}
                                    >
                                        <FileX size={16} className="mr-1" />
                                        Limpiar
                                    </Button>
                                </div>

                                <div className="space-y-2">
                                    <Label>Mapeo de columnas (estilo Odoo)</Label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                                        {parsedExcel.headers.map((header) => (
                                            <div key={header} className="flex flex-col gap-2 rounded-md border border-border/50 p-2 sm:p-2.5 bg-background">
                                                <div className="text-sm font-medium truncate" title={header}>{header}</div>
                                                <div>
                                                    <Select
                                                        value={columnMapping[header] || 'ignore'}
                                                        onValueChange={(v) => {
                                                            setColumnMapping((prev) => ({
                                                                ...prev,
                                                                [header]: v as ContactImportField
                                                            }))
                                                        }}
                                                    >
                                                        <SelectTrigger className="h-9">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {FIELD_OPTIONS.map((opt) => (
                                                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Preview (primeras 10 filas mapeadas)</Label>
                                    <div className="lg:hidden max-h-[260px] overflow-y-auto border rounded-md p-2 space-y-2 bg-background">
                                        {mappedPreview.map((row, idx) => (
                                            <div key={idx} className="rounded-md border border-border/60 p-2.5 bg-muted/20">
                                                <p className="text-sm font-semibold">{row.name || '-'}</p>
                                                <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                                                    <p><span className="font-medium text-foreground">Email:</span> {row.email || '-'}</p>
                                                    <p><span className="font-medium text-foreground">Telefono:</span> {row.phone || '-'}</p>
                                                    <p><span className="font-medium text-foreground">Empresa:</span> {row.company || '-'}</p>
                                                    <p><span className="font-medium text-foreground">Cargo:</span> {row.position || '-'}</p>
                                                    <p><span className="font-medium text-foreground">Ubicacion:</span> {row.location || '-'}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="hidden lg:block border rounded-md overflow-hidden bg-background">
                                        <div className="max-h-[260px] overflow-auto">
                                            <Table className="min-w-[760px] relative">
                                                <TableHeader className="sticky top-0 bg-background shadow-sm z-10">
                                                    <TableRow>
                                                        <TableHead>Nombre</TableHead>
                                                            <TableHead>Email</TableHead>
                                                            <TableHead>Telefono</TableHead>
                                                            <TableHead>Empresa</TableHead>
                                                            <TableHead>Cargo</TableHead>
                                                            <TableHead>Ubicacion</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {mappedPreview.map((row, idx) => (
                                                            <TableRow key={idx}>
                                                                <TableCell>{row.name || '-'}</TableCell>
                                                                <TableCell>{row.email || '-'}</TableCell>
                                                                <TableCell>{row.phone || '-'}</TableCell>
                                                                <TableCell>{row.company || '-'}</TableCell>
                                                                <TableCell>{row.position || '-'}</TableCell>
                                                                <TableCell>{row.location || '-'}</TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                </div>

                                <div className="sticky bottom-0 pb-2 pt-2 bg-background border-t mt-4">
                                    <Button onClick={handleImport} className="w-full flex-none shrink-0" disabled={isImporting || validMappedRowsCount === 0}>
                                        {isImporting ? (
                                            <>
                                                <Spinner size={16} className="animate-spin mr-2" />
                                                Importando contactos...
                                            </>
                                        ) : (
                                            <>
                                                <Check size={16} className="mr-2" />
                                                Importar {validMappedRowsCount} contactos
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="export" className="flex-1 overflow-y-auto space-y-4 mt-4 data-[state=inactive]:hidden">
                        <div className="p-4 rounded-lg border bg-muted/20">
                            <p className="text-sm">
                                Se exportaran los contactos cargados actualmente en esta vista.
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Total disponible para exportar ahora: {contacts.length}
                            </p>
                        </div>

                        <Button onClick={handleExport} className="w-full" disabled={!contacts.length}>
                            <DownloadSimple size={16} className="mr-2" />
                            Exportar contactos a Excel
                        </Button>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}
