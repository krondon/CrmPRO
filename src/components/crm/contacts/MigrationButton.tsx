/**
 * MigrationButton - Botón temporal para ejecutar la migración de leads a contactos
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Database, CheckCircle, XCircle, Spinner } from '@phosphor-icons/react'
import { migrateLeadsToContacts } from '@/supabase/migrations/migrate-leads-to-contacts'
import { toast } from 'sonner'

interface MigrationButtonProps {
    empresaId?: string
}

export function MigrationButton({ empresaId }: MigrationButtonProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [isRunning, setIsRunning] = useState(false)
    const [result, setResult] = useState<{
        success: boolean
        contactsCreated: number
        relationsCreated: number
        totalLeadsProcessed: number
    } | null>(null)

    const handleMigration = async () => {
        if (!empresaId) {
            toast.error('No se encontró ID de empresa')
            return
        }

        setIsRunning(true)
        setResult(null)

        try {
            const migrationResult = await migrateLeadsToContacts(empresaId)
            setResult(migrationResult)
            toast.success('Migración completada exitosamente!')
        } catch (error) {
            console.error('Error en migración:', error)
            toast.error('Error durante la migración')
            setResult({
                success: false,
                contactsCreated: 0,
                relationsCreated: 0,
                totalLeadsProcessed: 0
            })
        } finally {
            setIsRunning(false)
        }
    }

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                onClick={() => setIsOpen(true)}
                className="gap-1.5 px-2 md:px-3"
                title="Migrar Leads a Contactos"
            >
                <Database size={16} />
                <span className="hidden md:inline text-xs">Migrar Oportunidades a Contactos</span>
            </Button>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Migrar Oportunidades a Contactos</DialogTitle>
                        <DialogDescription>
                            Esta acción creará contactos a partir de tus oportunidades existentes y establecerá las relaciones correspondientes.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <Alert>
                            <AlertDescription>
                                <strong>¿Qué hace esta migración?</strong>
                                <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                                    <li>Crea contactos únicos desde tus oportunidades</li>
                                    <li>Conecta contactos con sus pipelines</li>
                                    <li>No duplica contactos existentes</li>
                                    <li>Es seguro ejecutarla múltiples veces</li>
                                </ul>
                            </AlertDescription>
                        </Alert>

                        {result && (
                            <Alert variant={result.success ? 'default' : 'destructive'}>
                                <div className="flex items-start gap-3">
                                    {result.success ? (
                                        <CheckCircle size={20} className="text-green-600 mt-0.5" weight="fill" />
                                    ) : (
                                        <XCircle size={20} className="text-red-600 mt-0.5" weight="fill" />
                                    )}
                                    <div className="flex-1">
                                        <AlertDescription>
                                            {result.success ? (
                                                <>
                                                    <strong className="block mb-2">✅ Migración exitosa!</strong>
                                                    <ul className="text-sm space-y-1">
                                                        <li>• {result.contactsCreated} contactos creados/actualizados</li>
                                                        <li>• {result.relationsCreated} relaciones establecidas</li>
                                                        <li>• {result.totalLeadsProcessed} oportunidades procesadas</li>
                                                    </ul>
                                                </>
                                            ) : (
                                                <strong>❌ Error durante la migración. Revisa la consola.</strong>
                                            )}
                                        </AlertDescription>
                                    </div>
                                </div>
                            </Alert>
                        )}

                        <div className="flex gap-2 justify-end">
                            <Button
                                variant="outline"
                                onClick={() => setIsOpen(false)}
                                disabled={isRunning}
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleMigration}
                                disabled={isRunning || !empresaId}
                            >
                                {isRunning ? (
                                    <>
                                        <Spinner size={16} className="mr-2 animate-spin" />
                                        Migrando...
                                    </>
                                ) : (
                                    <>
                                        <Database size={16} className="mr-2" />
                                        Ejecutar Migración
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
