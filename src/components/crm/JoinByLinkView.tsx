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
    SignIn,
    UserCircle,
    EnvelopeSimple,
    Lock,
    Clock,
    WarningCircle,
} from '@phosphor-icons/react'
import { buscarEmpresaPorCodigo, crearSolicitud, getMisSolicitudes } from '@/supabase/services/solicitudes'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/supabase/client'

export const PENDING_JOIN_KEY = 'pending_join_empresa_id'

interface ResolvedEmpresa {
    id: string
    nombre_empresa: string
    logo_url?: string | null
    codigo_empresa: string
}

export function JoinByLinkView() {
    const { codigo } = useParams<{ codigo: string }>()
    const navigate = useNavigate()
    const { user, register } = useAuth()

    const [empresa, setEmpresa] = useState<ResolvedEmpresa | null>(null)
    const [loadingEmpresa, setLoadingEmpresa] = useState(true)
    const [notFound, setNotFound] = useState(false)

    // Form state (registro)
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [registered, setRegistered] = useState(false)

    // Estado para usuario ya logueado: si ya tiene solicitud pendiente/aprobada para esta empresa
    const [existingStatus, setExistingStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null)
    const [creatingSolicitud, setCreatingSolicitud] = useState(false)

    // Resolver empresa por código
    useEffect(() => {
        let mounted = true
        if (!codigo) {
            setLoadingEmpresa(false)
            setNotFound(true)
            return
        }
        ;(async () => {
            try {
                const result = await buscarEmpresaPorCodigo(codigo)
                if (!mounted) return
                if (!result) {
                    setNotFound(true)
                } else {
                    setEmpresa(result)
                    // Guardar empresa_id en localStorage para sobrevivir registro/login
                    localStorage.setItem(PENDING_JOIN_KEY, result.id)
                }
            } catch (err: any) {
                console.error('[JoinByLink] error buscando empresa', err)
                if (mounted) setNotFound(true)
            } finally {
                if (mounted) setLoadingEmpresa(false)
            }
        })()
        return () => { mounted = false }
    }, [codigo])

    // Si hay usuario logueado, ver si ya existe solicitud para esta empresa
    useEffect(() => {
        if (!user || !empresa) return
        ;(async () => {
            try {
                const mias = await getMisSolicitudes()
                const found = mias.find((s: any) => s.empresa_id === empresa.id)
                if (found) {
                    setExistingStatus(found.status as any)
                }
            } catch (err) {
                console.warn('[JoinByLink] no se pudo leer solicitudes', err)
            }
        })()
    }, [user, empresa])

    // Crear solicitud (usuario ya logueado)
    const handleCreateSolicitud = async () => {
        if (!empresa) return
        setCreatingSolicitud(true)
        try {
            // Obtener nombre real del usuario
            const { data: { user: authUser } } = await supabase.auth.getUser()
            let nombre = authUser?.email || 'Usuario'
            if (authUser) {
                const { data: row } = await supabase
                    .from('usuarios')
                    .select('nombre')
                    .eq('id', authUser.id)
                    .maybeSingle()
                if (row?.nombre) nombre = row.nombre
            }
            await crearSolicitud(empresa.id, nombre)
            localStorage.removeItem(PENDING_JOIN_KEY)
            setExistingStatus('pending')
            toast.success('Solicitud enviada — el administrador la revisará pronto')
        } catch (err: any) {
            const msg = err?.message || 'Error al enviar solicitud'
            if (msg.toLowerCase().includes('pendiente')) {
                setExistingStatus('pending')
            } else {
                toast.error(msg)
            }
        } finally {
            setCreatingSolicitud(false)
        }
    }

    // Registro + futuro auto-link (al confirmar email + login)
    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name || !email || !password) {
            toast.error('Completa todos los campos')
            return
        }
        if (password !== confirmPassword) {
            toast.error('Las contraseñas no coinciden')
            return
        }
        if (password.length < 6) {
            toast.error('La contraseña debe tener al menos 6 caracteres')
            return
        }
        if (!empresa) return
        setSubmitting(true)
        try {
            // El flag PENDING_JOIN_KEY ya está en localStorage desde el useEffect inicial
            await register(email, password, name, 'employee', name)
            setRegistered(true)
        } catch {
            // useAuth ya mostró toast
        } finally {
            setSubmitting(false)
        }
    }

    // ───── Render ─────

    if (loadingEmpresa) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-background">
                <div className="text-center space-y-3">
                    <CircleNotch size={32} className="animate-spin mx-auto text-primary" />
                    <p className="text-sm text-muted-foreground">Buscando empresa...</p>
                </div>
            </div>
        )
    }

    if (notFound || !empresa) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-background">
                <Card className="w-full max-w-md">
                    <CardHeader className="text-center">
                        <div className="mx-auto bg-red-100 dark:bg-red-900/30 w-14 h-14 rounded-full flex items-center justify-center mb-3 text-red-600 dark:text-red-400">
                            <WarningCircle size={28} weight="duotone" />
                        </div>
                        <CardTitle>Link inválido</CardTitle>
                        <CardDescription>
                            El código <code className="font-mono">{codigo}</code> no corresponde a ninguna empresa.
                            Pídele al administrador un link actualizado.
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

    // Pantalla post-registro (espera confirmación email)
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
                            Te enviamos un email a <strong>{email}</strong>. Al confirmarlo, podrás
                            iniciar sesión y se enviará automáticamente la solicitud para unirte a{' '}
                            <strong>{empresa.nombre_empresa}</strong>.
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

    // Usuario ya logueado
    if (user) {
        // Ya tiene solicitud
        if (existingStatus === 'pending') {
            return (
                <div className="min-h-screen flex items-center justify-center p-4 bg-background">
                    <Card className="w-full max-w-md">
                        <CardHeader className="text-center">
                            <div className="mx-auto bg-yellow-100 dark:bg-yellow-900/30 w-14 h-14 rounded-full flex items-center justify-center mb-3 text-yellow-600 dark:text-yellow-400">
                                <Clock size={28} weight="duotone" />
                            </div>
                            <CardTitle>Esperando aprobación</CardTitle>
                            <CardDescription>
                                Ya enviaste una solicitud para unirte a <strong>{empresa.nombre_empresa}</strong>.
                                El administrador la revisará pronto.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button asChild className="w-full" variant="outline">
                                <Link to="/dashboard">Ir al CRM</Link>
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            )
        }

        if (existingStatus === 'approved') {
            return (
                <div className="min-h-screen flex items-center justify-center p-4 bg-background">
                    <Card className="w-full max-w-md">
                        <CardHeader className="text-center">
                            <CardTitle>Ya eres miembro</CardTitle>
                            <CardDescription>
                                Tu solicitud para <strong>{empresa.nombre_empresa}</strong> fue aprobada.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button asChild className="w-full">
                                <Link to="/dashboard">Ir al CRM</Link>
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            )
        }

        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-background">
                <Card className="w-full max-w-md animate-in fade-in zoom-in-95 duration-300">
                    <CardHeader className="text-center">
                        <div className="mx-auto bg-blue-100 dark:bg-blue-900/30 w-14 h-14 rounded-full flex items-center justify-center mb-3 text-blue-600 dark:text-blue-400">
                            {empresa.logo_url ? (
                                <img src={empresa.logo_url} alt="" className="w-10 h-10 object-cover rounded-full" />
                            ) : (
                                <Buildings size={28} weight="duotone" />
                            )}
                        </div>
                        <CardTitle>Solicitar acceso</CardTitle>
                        <CardDescription>
                            Vas a pedir unirte a <strong>{empresa.nombre_empresa}</strong>.
                            El administrador recibirá tu solicitud y decidirá si te acepta.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <Button
                            onClick={handleCreateSolicitud}
                            disabled={creatingSolicitud}
                            className="w-full"
                        >
                            {creatingSolicitud ? (
                                <>
                                    <CircleNotch size={18} className="animate-spin mr-2" />
                                    Enviando...
                                </>
                            ) : (
                                <>
                                    <PaperPlaneTilt size={18} className="mr-2" />
                                    Solicitar acceso
                                </>
                            )}
                        </Button>
                        <Button variant="outline" className="w-full" onClick={() => navigate('/dashboard')}>
                            Cancelar
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // Usuario no logueado: registro inline o ir a login
    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
            <Card className="w-full max-w-md animate-in fade-in zoom-in-95 duration-300">
                <CardHeader className="text-center">
                    <div className="mx-auto bg-blue-100 dark:bg-blue-900/30 w-14 h-14 rounded-full flex items-center justify-center mb-3 text-blue-600 dark:text-blue-400">
                        {empresa.logo_url ? (
                            <img src={empresa.logo_url} alt="" className="w-10 h-10 object-cover rounded-full" />
                        ) : (
                            <Buildings size={28} weight="duotone" />
                        )}
                    </div>
                    <CardTitle>Unirme a {empresa.nombre_empresa}</CardTitle>
                    <CardDescription>
                        Crea tu cuenta. Al iniciar sesión enviaremos tu solicitud automáticamente
                        para que el administrador la apruebe.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleRegister} className="space-y-4">
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
                            <Label htmlFor="email">Email</Label>
                            <div className="relative">
                                <EnvelopeSimple size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="tu@correo.com"
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
                                    Crear cuenta y solicitar acceso
                                </>
                            )}
                        </Button>
                    </form>

                    <div className="mt-4 pt-4 border-t text-center text-sm text-muted-foreground">
                        ¿Ya tienes cuenta?{' '}
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
