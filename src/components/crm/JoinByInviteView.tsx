import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
    CircleNotch,
    Buildings,
    PaperPlaneTilt,
    UserCircle,
    EnvelopeSimple,
    Lock,
    CheckCircle,
    WarningCircle,
    SignIn,
} from '@phosphor-icons/react'
import { getInvitationByToken, acceptInvitation } from '@/supabase/services/invitations'
import { useAuth } from '@/hooks/useAuth'
import { getJobTitleLabel } from '@/lib/roleLabels'

export const PENDING_INVITE_TOKEN_KEY = 'pending_invite_token'

interface InviteInfo {
    empresa_id: string
    empresa_nombre: string | null
    empresa_logo: string | null
    equipo_nombre: string | null
    invited_email: string
    invited_nombre: string | null
    invited_titulo_trabajo: string | null
    permission_role: string | null
    status: string
}

export function JoinByInviteView() {
    const { token } = useParams<{ token: string }>()
    const navigate = useNavigate()
    const { user, register, logout, fetchCompanies, setCurrentCompanyId } = useAuth()

    const [invite, setInvite] = useState<InviteInfo | null>(null)
    const [loading, setLoading] = useState(true)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    // Form state (solo nombre + password — el email viene del token)
    const [name, setName] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [registered, setRegistered] = useState(false)

    const [accepting, setAccepting] = useState(false)
    const [switchingAccount, setSwitchingAccount] = useState(false)

    // 1) Resolver invitación por token
    useEffect(() => {
        let mounted = true
        if (!token) {
            setErrorMsg('Link inválido')
            setLoading(false)
            return
        }
        ;(async () => {
            try {
                const data = await getInvitationByToken(token)
                if (!mounted) return
                setInvite(data)
                // Pre-cargar el nombre sugerido por el owner
                if (data.invited_nombre) setName(data.invited_nombre)
                // Guardar token para sobrevivir registro/confirmación de email
                if (data.status === 'pending') {
                    localStorage.setItem(PENDING_INVITE_TOKEN_KEY, token)
                }
            } catch (err: any) {
                if (mounted) setErrorMsg(err?.message || 'Invitación no encontrada')
            } finally {
                if (mounted) setLoading(false)
            }
        })()
        return () => { mounted = false }
    }, [token])

    // 2) Si hay sesión + invitación pending, NO auto-aceptar: pedir 1 click
    //    Se ejecuta sólo cuando el invited_email coincide con el del usuario logueado.
    const userEmailMatches = !!(user && invite && user.email?.toLowerCase() === invite.invited_email.toLowerCase())
    const userEmailMismatch = !!(user && invite && !userEmailMatches)

    // Cerrar la sesión actual del navegador para que el invitado pueda entrar/registrarse
    // con el correo correcto. Re-aseguramos el token en localStorage porque el logout
    // limpia varias keys y queremos que el flujo de auto-aceptar siga funcionando.
    const handleSwitchAccount = async () => {
        if (!token) return
        setSwitchingAccount(true)
        try {
            localStorage.setItem(PENDING_INVITE_TOKEN_KEY, token)
            await logout()
            localStorage.setItem(PENDING_INVITE_TOKEN_KEY, token)
        } catch (err) {
            console.warn('[JoinByInviteView] error al cerrar sesión previa', err)
        } finally {
            setSwitchingAccount(false)
        }
    }

    const handleAccept = async () => {
        if (!user || !invite || !token) return
        setAccepting(true)
        try {
            await acceptInvitation(token, user.id)
            localStorage.removeItem(PENDING_INVITE_TOKEN_KEY)
            toast.success(`¡Bienvenido a ${invite.empresa_nombre || 'la empresa'}!`)
            const companies = await fetchCompanies()
            const joined = companies.find(c => c.id === invite.empresa_id)
            if (joined) setCurrentCompanyId(joined.id)
            navigate('/dashboard')
        } catch (err: any) {
            toast.error(err?.message || 'No se pudo aceptar la invitación')
        } finally {
            setAccepting(false)
        }
    }

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!invite) return
        if (!name.trim()) {
            toast.error('Ingresa tu nombre')
            return
        }
        if (password.length < 6) {
            toast.error('La contraseña debe tener al menos 6 caracteres')
            return
        }
        if (password !== confirmPassword) {
            toast.error('Las contraseñas no coinciden')
            return
        }
        setSubmitting(true)
        try {
            // El token ya está en localStorage; useAuth lo procesará después de la confirmación de email.
            await register(invite.invited_email, password, name.trim(), 'employee', name.trim())
            setRegistered(true)
        } catch {
            // useAuth ya mostró el toast
        } finally {
            setSubmitting(false)
        }
    }

    // ─── Render states ───

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-background">
                <div className="text-center space-y-3">
                    <CircleNotch size={32} className="animate-spin mx-auto text-primary" />
                    <p className="text-sm text-muted-foreground">Buscando invitación...</p>
                </div>
            </div>
        )
    }

    if (errorMsg || !invite) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-background">
                <Card className="w-full max-w-md">
                    <CardHeader className="text-center">
                        <div className="mx-auto bg-red-100 dark:bg-red-900/30 w-14 h-14 rounded-full flex items-center justify-center mb-3 text-red-600 dark:text-red-400">
                            <WarningCircle size={28} weight="duotone" />
                        </div>
                        <CardTitle>Invitación inválida</CardTitle>
                        <CardDescription>
                            {errorMsg || 'El link no corresponde a ninguna invitación activa. Pídele al administrador uno nuevo.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button asChild className="w-full">
                            <Link to="/login">Ir al login</Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    if (invite.status === 'accepted') {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-background">
                <Card className="w-full max-w-md">
                    <CardHeader className="text-center">
                        <div className="mx-auto bg-green-100 dark:bg-green-900/30 w-14 h-14 rounded-full flex items-center justify-center mb-3 text-green-600 dark:text-green-400">
                            <CheckCircle size={28} weight="duotone" />
                        </div>
                        <CardTitle>Invitación ya aceptada</CardTitle>
                        <CardDescription>
                            Esta invitación a <strong>{invite.empresa_nombre || 'la empresa'}</strong> ya fue aceptada.
                            Inicia sesión para entrar al CRM.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button asChild className="w-full">
                            <Link to="/login">Iniciar sesión</Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    if (invite.status !== 'pending') {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-background">
                <Card className="w-full max-w-md">
                    <CardHeader className="text-center">
                        <CardTitle>Invitación cerrada</CardTitle>
                        <CardDescription>Esta invitación ya no está activa.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button asChild className="w-full">
                            <Link to="/login">Ir al login</Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // Post-registro: avisar al usuario que confirme el correo
    if (registered) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-background">
                <Card className="w-full max-w-md animate-in fade-in zoom-in-95 duration-300">
                    <CardHeader className="text-center">
                        <div className="mx-auto bg-blue-100 dark:bg-blue-900/30 w-14 h-14 rounded-full flex items-center justify-center mb-3 text-blue-600 dark:text-blue-400">
                            <EnvelopeSimple size={28} weight="duotone" />
                        </div>
                        <CardTitle>Confirma tu correo</CardTitle>
                        <CardDescription>
                            Te enviamos un email a <strong>{invite.invited_email}</strong>. Confírmalo
                            y luego inicia sesión — entrarás automáticamente a{' '}
                            <strong>{invite.empresa_nombre || 'tu empresa'}</strong>.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button asChild className="w-full">
                            <Link to="/login">Ir al login</Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // Usuario logueado pero con otro email distinto al invitado
    if (userEmailMismatch) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-background">
                <Card className="w-full max-w-md">
                    <CardHeader className="text-center">
                        <div className="mx-auto bg-yellow-100 dark:bg-yellow-900/30 w-14 h-14 rounded-full flex items-center justify-center mb-3 text-yellow-600 dark:text-yellow-400">
                            <WarningCircle size={28} weight="duotone" />
                        </div>
                        <CardTitle>Email no coincide</CardTitle>
                        <CardDescription>
                            Esta invitación es para <strong>{invite.invited_email}</strong>, pero
                            tu sesión actual es <strong>{user!.email}</strong>. Cierra sesión para
                            continuar con el correo invitado.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button
                            onClick={handleSwitchAccount}
                            disabled={switchingAccount}
                            className="w-full"
                        >
                            {switchingAccount ? (
                                <>
                                    <CircleNotch size={18} className="animate-spin mr-2" />
                                    Cerrando sesión...
                                </>
                            ) : (
                                'Cerrar sesión y continuar'
                            )}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // Usuario logueado con el email correcto: 1 click para aceptar
    if (user && userEmailMatches) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-background">
                <Card className="w-full max-w-md animate-in fade-in zoom-in-95 duration-300">
                    <CardHeader className="text-center">
                        <div className="mx-auto bg-blue-100 dark:bg-blue-900/30 w-14 h-14 rounded-full flex items-center justify-center mb-3 text-blue-600 dark:text-blue-400">
                            {invite.empresa_logo ? (
                                <img src={invite.empresa_logo} alt="" className="w-10 h-10 object-cover rounded-full" />
                            ) : (
                                <Buildings size={28} weight="duotone" />
                            )}
                        </div>
                        <CardTitle>Únete a {invite.empresa_nombre || 'la empresa'}</CardTitle>
                        <CardDescription>
                            Fuiste invitado como{' '}
                            <strong>{invite.invited_titulo_trabajo ? getJobTitleLabel(invite.invited_titulo_trabajo) : 'miembro'}</strong>
                            {invite.equipo_nombre ? <> en el equipo <strong>{invite.equipo_nombre}</strong></> : null}.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <Button onClick={handleAccept} disabled={accepting} className="w-full">
                            {accepting ? (
                                <>
                                    <CircleNotch size={18} className="animate-spin mr-2" />
                                    Aceptando...
                                </>
                            ) : (
                                <>
                                    <CheckCircle size={18} className="mr-2" />
                                    Aceptar invitación
                                </>
                            )}
                        </Button>
                        <Button variant="outline" className="w-full" onClick={() => navigate('/dashboard')}>
                            Más tarde
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // No logueado: formulario de registro con email bloqueado
    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
            <Card className="w-full max-w-md animate-in fade-in zoom-in-95 duration-300">
                <CardHeader className="text-center">
                    <div className="mx-auto bg-blue-100 dark:bg-blue-900/30 w-14 h-14 rounded-full flex items-center justify-center mb-3 text-blue-600 dark:text-blue-400">
                        {invite.empresa_logo ? (
                            <img src={invite.empresa_logo} alt="" className="w-10 h-10 object-cover rounded-full" />
                        ) : (
                            <Buildings size={28} weight="duotone" />
                        )}
                    </div>
                    <CardTitle>Únete a {invite.empresa_nombre || 'la empresa'}</CardTitle>
                    <CardDescription>
                        Fuiste invitado como{' '}
                        <strong>{invite.invited_titulo_trabajo || 'miembro'}</strong>
                        {invite.equipo_nombre ? <> en el equipo <strong>{invite.equipo_nombre}</strong></> : null}.
                        Crea tu contraseña para entrar.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleRegister} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="email">Email</Label>
                            <div className="relative">
                                <EnvelopeSimple size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    id="email"
                                    type="email"
                                    value={invite.invited_email}
                                    readOnly
                                    disabled
                                    className="pl-9 bg-muted/40 cursor-not-allowed"
                                />
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                                Este email viene de la invitación y no se puede cambiar.
                            </p>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="name">Tu nombre</Label>
                            <div className="relative">
                                <UserCircle size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    id="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Juan Pérez"
                                    disabled={submitting}
                                    className="pl-9"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="password">Contraseña</Label>
                            <div className="relative">
                                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Mínimo 6 caracteres"
                                    disabled={submitting}
                                    className="pl-9"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="confirm">Confirmar contraseña</Label>
                            <div className="relative">
                                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    id="confirm"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Repite la contraseña"
                                    disabled={submitting}
                                    className="pl-9"
                                />
                            </div>
                        </div>
                        <Button type="submit" disabled={submitting} className="w-full">
                            {submitting ? (
                                <>
                                    <CircleNotch size={18} className="animate-spin mr-2" />
                                    Creando cuenta...
                                </>
                            ) : (
                                <>
                                    <PaperPlaneTilt size={18} className="mr-2" />
                                    Crear cuenta y unirme
                                </>
                            )}
                        </Button>
                    </form>

                    <div className="mt-4 pt-4 border-t text-center text-sm text-muted-foreground">
                        ¿Ya tienes cuenta con {invite.invited_email}?{' '}
                        <Link to="/login" className="text-primary font-semibold hover:underline">
                            <SignIn size={14} className="inline mr-1" />
                            Iniciar sesión
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
