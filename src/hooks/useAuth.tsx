import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { supabase } from '@/supabase/client'
import { login as authLogin, logout as authLogout, register as authRegister, updateEmail as authUpdateEmail } from '@/supabase/auth'
import { createUsuario, getUsuarioById } from '@/supabase/services/usuarios'
import { createEmpresa, getEmpresasByUsuario, leaveCompany } from '@/supabase/services/empresa'
import { toast } from 'sonner'

export interface User {
    id: string
    email: string
    businessName: string
    recoveryEmail?: string | null
}

export interface Company {
    id: string
    name: string
    ownerId: string
    createdAt: Date
    role?: string
    logo?: string
}

interface AuthContextType {
    user: User | null
    companies: Company[]
    currentCompanyId: string
    isLoading: boolean
    isGuestMode: boolean
    setCurrentCompanyId: (id: string) => void
    setCompanies: React.Dispatch<React.SetStateAction<Company[]>>
    login: (email: string, password: string) => Promise<void>
    register: (email: string, password: string, businessName: string) => Promise<void>
    logout: () => Promise<void>
    fetchCompanies: () => Promise<Company[]>
    leaveCompanyHandler: (companyId: string) => Promise<void>
    resetPassword: (email: string) => Promise<void>
    resetPasswordByRecoveryEmail: (recoveryEmail: string) => Promise<void>
    updateEmail: (newEmail: string) => Promise<void>
    updateRecoveryEmail: (recoveryEmail: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
    const context = useContext(AuthContext)
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}

// Helper para leer de localStorage con fallback
function getStoredValue<T>(key: string, defaultValue: T): T {
    if (typeof window === 'undefined') return defaultValue
    try {
        const raw = localStorage.getItem(key)
        if (raw !== null) return JSON.parse(raw)
    } catch (e) {
        // Silencio errores de parseo
    }
    return defaultValue
}

// Helper para guardar en localStorage
function setStoredValue<T>(key: string, value: T): void {
    if (typeof window === 'undefined') return
    try {
        localStorage.setItem(key, JSON.stringify(value))
    } catch (e) {
        // Silencio errores de escritura
    }
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(() => getStoredValue('current-user', null))
    const [companies, setCompanies] = useState<Company[]>(() => getStoredValue('companies', []))
    const [currentCompanyId, setCurrentCompanyIdState] = useState<string>(() => getStoredValue('current-company-id', ''))
    const [isLoading, setIsLoading] = useState(true)

    // Sincronizar con localStorage
    useEffect(() => {
        setStoredValue('current-user', user)
    }, [user])

    useEffect(() => {
        setStoredValue('companies', companies)
    }, [companies])

    useEffect(() => {
        setStoredValue('current-company-id', currentCompanyId)
    }, [currentCompanyId])

    const setCurrentCompanyId = (id: string) => {
        setCurrentCompanyIdState(id)
    }

    // Verificar si está en modo invitado
    const isGuestMode = (() => {
        if (!user || !currentCompanyId) return false
        const currentCompany = companies.find(c => c.id === currentCompanyId)
        return currentCompany ? currentCompany.ownerId !== user.id : false
    })()

    // Verificar sesión inicial
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            // Si hay usuario en localStorage pero no hay sesión válida, limpiar estado
            const storedUser = localStorage.getItem('current-user')
            if (!session && storedUser && storedUser !== 'null') {
                console.log('[AUTH] Sesión expirada detectada, limpiando estado del usuario')
                setUser(null)
                setCompanies([])
                setCurrentCompanyIdState('')
                toast.info('Tu sesión ha expirado. Por favor, inicia sesión nuevamente.', { duration: 5000 })
            }
            setIsLoading(false)
        })

        // Escuchar cambios de sesión
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            console.log('[AUTH] Evento de autenticación:', event)

            if (event === 'SIGNED_OUT') {
                console.log('[AUTH] Sesión terminada, limpiando estado')
                setUser(null)
                setCompanies([])
                setCurrentCompanyIdState('')
            }

            if (event === 'TOKEN_REFRESHED' && !session) {
                console.log('[AUTH] Token expiró y no se pudo refrescar')
                setUser(null)
                setCompanies([])
                setCurrentCompanyIdState('')
                toast.info('Tu sesión ha expirado. Por favor, inicia sesión nuevamente.', { duration: 5000 })
            }

            // Cuando el usuario confirma el cambio de email desde el link recibido
            if (event === 'EMAIL_CHANGE' && session?.user?.email) {
                console.log('[AUTH] Email confirmado y actualizado:', session.user.email)
                setUser(prev => prev ? { ...prev, email: session.user!.email! } : prev)
                toast.success('¡Correo actualizado correctamente!')
            }

            // Actualizar usuario si cambia el objeto de sesión (por meta_data etc)
            if (event === 'USER_UPDATED' && session?.user) {
                setUser(prev => prev ? { ...prev, email: session.user!.email! } : prev)
            }

            setIsLoading(false)
        })

        return () => subscription.unsubscribe()
    }, [])

    const fetchCompanies = async (): Promise<Company[]> => {
        if (!user?.id) return []
        try {
            const empresas = await getEmpresasByUsuario(user.id)
            const uiCompanies = empresas.map((e: any) => ({
                id: e.id,
                name: e.nombre_empresa,
                ownerId: e.usuario_id,
                createdAt: new Date(e.created_at),
                role: e.role,
                logo: e.logo_url || undefined
            }))
            setCompanies(uiCompanies)

            if (!currentCompanyId && uiCompanies.length > 0) {
                setCurrentCompanyIdState(uiCompanies[0].id)
            }
            return uiCompanies
        } catch (error) {
            console.error('Error fetching companies:', error)
            return []
        }
    }

    const login = async (email: string, password: string) => {
        // No activamos isLoading global para evitar desmontar la vista de Login
        try {
            console.log('[LOGIN] iniciando login para', email)
            const authUser = await authLogin(email, password)
            console.log('[LOGIN] authUser recibido', authUser)

            let row
            try {
                row = await getUsuarioById(authUser.id)
            } catch (err: any) {
                console.log('[LOGIN] usuario no encontrado en tabla usuarios, intentando crear...')

                try {
                    row = await createUsuario({
                        id: authUser.id,
                        email: authUser.email || email,
                        nombre: authUser.email?.split('@')[0] || 'Usuario'
                    })
                } catch (createErr: any) {
                    console.error('[LOGIN] Error creando usuario:', createErr)

                    // Manejo de duplicados (email o ID)
                    if (createErr.message?.includes('duplicate key') || createErr.code === '23505') {
                        // Caso: Conflicto de Email (Usuario borrado de Auth pero no de base de datos)
                        if (createErr.message?.includes('email')) {
                            console.log('[LOGIN] Email duplicado detectado. Intentando vincular usuario existente...')
                            try {
                                // 1. Buscar el usuario antiguo por email
                                const { data: existingUser } = await supabase
                                    .from('usuarios').select('*').eq('email', email).single()

                                if (existingUser) {
                                    // 2. Actualizar su ID al nuevo ID de Auth
                                    console.log(`[LOGIN] Actualizando ID de ${existingUser.id} a ${authUser.id}`)
                                    const { data: updatedUser, error: updateError } = await supabase
                                        .from('usuarios')
                                        .update({ id: authUser.id }) // Actualizamos la PK
                                        .eq('email', email)
                                        .select()
                                        .single()

                                    if (updateError) throw updateError
                                    row = updatedUser
                                } else {
                                    throw new Error('Conflicto de email pero no se encuentra el registro.')
                                }
                            } catch (migrationError) {
                                console.error('[LOGIN] Falló la migración del usuario:', migrationError)
                                throw new Error('Error de integridad: El email ya existe y no se pudo recuperar la cuenta. Contacte soporte.')
                            }
                        } else {
                            // Caso: Race condition (ya se creó el ID)
                            console.log('[LOGIN] Usuario ya existe (race condition), leyendo...')
                            row = await getUsuarioById(authUser.id)
                        }
                    } else {
                        throw createErr
                    }
                }
            }

            console.log('[LOGIN] fila usuarios', row)
            const newUser: User = {
                id: row.id,
                email: row.email,
                businessName: row.nombre,
                recoveryEmail: row.recovery_email
            }
            setUser(newUser)

            const empresas = await getEmpresasByUsuario(authUser.id)
            const uiCompanies = empresas.map((e: any) => ({
                id: e.id,
                name: e.nombre_empresa,
                ownerId: e.usuario_id,
                createdAt: new Date(e.created_at),
                role: e.role,
                logo: e.logo_url || undefined
            }))
            setCompanies(uiCompanies)
            if (uiCompanies.length > 0) {
                setCurrentCompanyIdState(uiCompanies[0].id)
            }

            if (uiCompanies.length === 0) {
                console.log('[LOGIN] No se encontraron empresas; creando empresa inicial')
                try {
                    const empresaCreada = await createEmpresa({ nombre_empresa: row.nombre, usuario_id: authUser.id })
                    console.log('[LOGIN] Empresa inicial creada en login', empresaCreada)
                    const nuevaCompany = {
                        id: empresaCreada.id,
                        name: empresaCreada.nombre_empresa,
                        ownerId: empresaCreada.usuario_id,
                        createdAt: new Date(empresaCreada.created_at),
                        role: 'owner'
                    }
                    setCompanies([nuevaCompany])
                    setCurrentCompanyIdState(nuevaCompany.id)
                } catch (err: any) {
                    console.error('[LOGIN] Error creando empresa inicial en login', err)
                }
            }

            toast.success('¡Sesión iniciada exitosamente!')
        } catch (e: any) {
            console.error('[LOGIN] error', e)
            if (e.message?.toLowerCase().includes('email not confirmed')) {
                toast.error('Por favor confirma tu email antes de iniciar sesión. Revisa tu bandeja de entrada.', {
                    duration: 6000
                })
            } else {
                toast.error(e.message || 'Error iniciando sesión')
            }
            throw e
        }
    }

    const register = async (email: string, password: string, businessName: string) => {
        try {
            console.log('[REGISTER] iniciando registro para', email)
            const authUser = await authRegister(email, password)
            console.log('[REGISTER] authUser recibido', authUser)

            const { data: sessionData } = await supabase.auth.getSession()

            if (!sessionData.session) {
                console.log('[REGISTER] confirmación de email requerida')
                toast.success('¡Registro exitoso! Por favor revisa tu email para confirmar tu cuenta.', {
                    duration: 6000
                })
                return
            }

            const row = await createUsuario({ id: authUser.id, email, nombre: businessName })
            console.log('[REGISTER] fila insertada usuarios', row)

            const empresa = await createEmpresa({ nombre_empresa: businessName, usuario_id: authUser.id })
            console.log('[REGISTER] empresa creada', empresa)

            const newUser: User = {
                id: row.id,
                email: row.email,
                businessName: row.nombre,
                recoveryEmail: row.recovery_email
            }
            setUser(newUser)

            const uiCompany = {
                id: empresa.id,
                name: empresa.nombre_empresa,
                ownerId: empresa.usuario_id,
                createdAt: new Date(empresa.created_at)
            }
            setCompanies([uiCompany])
            setCurrentCompanyIdState(uiCompany.id)
            toast.success('¡Cuenta creada exitosamente!')
        } catch (e: any) {
            console.error('[REGISTER] error', e)
            if (e.message?.toLowerCase().includes('429')) {
                toast.error('Demasiados intentos. Espera unos segundos e intenta de nuevo.')
            } else if (e.message?.toLowerCase().includes('email not confirmed')) {
                toast.info('Por favor confirma tu email antes de iniciar sesión. Revisa tu bandeja de entrada.', {
                    duration: 6000
                })
            } else if (e.message?.toLowerCase().includes('ya está registrado')) {
                toast.error('Este correo ya está registrado. Intenta iniciar sesión.', {
                    duration: 5000
                })
            } else {
                toast.error(e.message || 'Error registrando usuario')
            }
            throw e
        }
    }

    const logout = async () => {
        try {
            await authLogout()
        } catch (error) {
            console.warn('[AUTH] Error en logout (posiblemente sesión ya expirada)', error)
        } finally {
            // Siempre limpiamos el estado local, falle o no el logout de supabase
            setUser(null)
            setCompanies([])
            setCurrentCompanyIdState('')

            // Limpiar localStorage explícitamente para evitar estados zombies
            localStorage.removeItem('supabase.auth.token')
            localStorage.removeItem('current-user')

            // Limpiar cache de pipelines para que al re-logear se lea de la BD
            const keysToRemove: string[] = []
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i)
                if (key && key.startsWith('pipelines-')) {
                    keysToRemove.push(key)
                }
            }
            keysToRemove.forEach(key => localStorage.removeItem(key))

            toast.success('¡Sesión cerrada!')
        }
    }

    const leaveCompanyHandler = async (companyId: string) => {
        if (!user) return
        const company = companies.find(c => c.id === companyId)
        if (!company) return

        try {
            await leaveCompany(companyId, user.email, user.id)
            toast.success('Has abandonado la empresa correctamente')

            // Cambiar a la empresa propia
            const myCompany = companies.find(c => c.ownerId === user.id)
            if (myCompany) {
                setCurrentCompanyIdState(myCompany.id)
            }
            await fetchCompanies()
        } catch (error) {
            console.error('Error leaving company:', error)
            toast.error('Error al abandonar la empresa')
        }
    }

    const updateEmail = async (newEmail: string) => {
        try {
            await authUpdateEmail(newEmail)
            // Actualizar también en la tabla usuarios
            if (user?.id) {
                await supabase
                    .from('usuarios')
                    .update({ email: newEmail })
                    .eq('id', user.id)
            }
            toast.info(
                'Se envió un link de confirmación al nuevo correo. Haz clic en él para completar el cambio.',
                { duration: 8000 }
            )
        } catch (e: any) {
            console.error('[AUTH] Error actualizando email:', e)
            toast.error(e.message || 'Error al cambiar el correo')
            throw e
        }
    }

    const updateRecoveryEmail = async (newRecoveryEmail: string) => {
        if (!user?.id) return
        try {
            const trimmedEmail = newRecoveryEmail.toLowerCase().trim()
            if (trimmedEmail === user.email.toLowerCase()) {
                throw new Error('El correo alternativo no puede ser el mismo que el principal.')
            }

            const { data, error } = await supabase
                .from('usuarios')
                .update({ recovery_email: trimmedEmail || null })
                .eq('id', user.id)
                .select()
                .single()

            if (error) throw error

            setUser(prev => prev ? { ...prev, recoveryEmail: data.recovery_email } : prev)
            toast.success('Correo alternativo actualizado correctamente.')
        } catch (e: any) {
            console.error('[AUTH] Error actualizando recovery email:', e)
            toast.error(e.message || 'Error al actualizar el correo alternativo')
            throw e
        }
    }

    const resetPassword = async (email: string) => {
        // No activamos isLoading global
        // Obtenemos la URL actual para asegurar que la redirección vuelva a este mismo entorno (local o prod)
        const redirectUrl = `${window.location.origin}/update-password`
        console.log('[AUTH] Intentando enviar correo de recuperación con redirección a:', redirectUrl)

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: redirectUrl
            })
            if (error) throw error
            toast.success('Correo de recuperación enviado. Revisa tu bandeja de entrada.')
        } catch (error: any) {
            console.error('Error resetting password:', error)
            toast.error(error.message || 'Error al enviar correo de recuperación')
            throw error
        }
    }

    const resetPasswordByRecoveryEmail = async (recoveryEmail: string) => {
        try {
            console.log('[AUTH] Solicitando recuperación por correo alternativo:', recoveryEmail)
            const redirectUrl = `${window.location.origin}/update-password`

            // Usamos fetch directo para evadir errores internos del wrapper de Supabase (invoke)
            // que a veces fallan con errores de Logflare/BigQuery
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

            const response = await fetch(`${supabaseUrl}/functions/v1/send-recovery-email`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseAnonKey}`,
                    'apikey': supabaseAnonKey
                },
                body: JSON.stringify({
                    recovery_email: recoveryEmail,
                    redirect_to: redirectUrl
                })
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || data.message || `Error del servidor: ${response.status}`)
            }

            if (data.success) {
                toast.success(data.message || 'Enlace de recuperación enviado.')
            } else {
                throw new Error(data.error || 'Error al procesar la solicitud')
            }
        } catch (error: any) {
            console.error('Error in resetPasswordByRecoveryEmail:', error)
            toast.error(error.message || 'Error enviando recuperación al correo alternativo')
            throw error
        }
    }

    const value: AuthContextType = {
        user,
        companies,
        currentCompanyId,
        isLoading,
        isGuestMode,
        setCurrentCompanyId,
        setCompanies,
        login,
        register,
        logout,
        fetchCompanies,
        leaveCompanyHandler,
        resetPassword,
        resetPasswordByRecoveryEmail,
        updateEmail,
        updateRecoveryEmail
    }

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    )
}
