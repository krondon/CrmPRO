import { Navigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EnvelopeSimple, SignOut } from '@phosphor-icons/react'
import { PENDING_INVITE_TOKEN_KEY } from './JoinByInviteView'

interface NoCompanyViewProps {
    onLogout: () => void
}

/**
 * Pantalla para empleados que tienen sesión pero aún no pertenecen a ninguna empresa.
 * Si hay un token de invitación pendiente, lo redirige a /invitacion/:token.
 * En caso contrario muestra un mensaje claro: necesitan que el owner los invite.
 */
export function NoCompanyView({ onLogout }: NoCompanyViewProps) {
    const pendingToken = typeof window !== 'undefined'
        ? localStorage.getItem(PENDING_INVITE_TOKEN_KEY)
        : null

    if (pendingToken) {
        return <Navigate to={`/invitacion/${pendingToken}`} replace />
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
            <Card className="w-full max-w-md animate-in fade-in zoom-in-95 duration-300">
                <CardHeader className="text-center">
                    <div className="mx-auto bg-blue-100 dark:bg-blue-900/30 w-14 h-14 rounded-full flex items-center justify-center mb-3 text-blue-600 dark:text-blue-400">
                        <EnvelopeSimple size={28} weight="duotone" />
                    </div>
                    <CardTitle>Esperando una invitación</CardTitle>
                    <CardDescription>
                        Tu cuenta aún no pertenece a ninguna empresa. Pídele al administrador
                        que te envíe una invitación por correo. Al abrir el link, entrarás
                        directamente al CRM.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button variant="outline" className="w-full" onClick={onLogout}>
                        <SignOut size={18} className="mr-2" />
                        Cerrar sesión
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
}
