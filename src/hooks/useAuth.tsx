import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { supabase } from '@/supabase/client'
import { login as authLogin, logout as authLogout, register as authRegister, updateEmail as authUpdateEmail } from '@/supabase/auth'
import { createUsuario, getUsuarioById, updateLastEmpresaId } from '@/supabase/services/usuarios'
import { createEmpresa, getEmpresasByUsuario, leaveCompany } from '@/supabase/services/empresa'
import { crearSolicitud } from '@/supabase/services/solicitudes'
import { acceptInvitation } from '@/supabase/services/invitations'

const PENDING_JOIN_KEY = 'pending_join_empresa_id'
const PENDING_INVITE_TOKEN_KEY = 'pending_invite_token'

/**
 * Si hay un token de invitación pendiente en localStorage (puesto por /invitacion/:token),
 * aceptarla automáticamente para el usuario recién logueado.
 * Idempotente: errores se loguean pero no rompen el flujo.
 * Devuelve el empresa_id si se aceptó, o null.
 */
async function processPendingInvite(userId: string): Promise<string | null> {
    const token = localStorage.getItem(PENDING_INVITE_TOKEN_KEY)
    if (!token) return null
    try {
        const result: any = await acceptInvitation(token, userId)
        localStorage.removeItem(PENDING_INVITE_TOKEN_KEY)
        return result?.empresa_id || null
    } catch (err: any) {
        const msg = (err?.message || '').toLowerCase()
        // Si la invitación ya fue procesada o el email no coincide, limpiar el token igual
        // para no quedar en bucle.
        if (msg.includes('ya fue procesada') || msg.includes('para otro correo') || msg.includes('para ')) {
            localStorage.removeItem(PENDING_INVITE_TOKEN_KEY)
        }
        console.warn('[processPendingInvite] error aceptando invitación', err)
        return null
    }
}

/**
 * Si existe `pending_join_empresa_id` en localStorage (puesto por /unirme/:codigo),
 * crear automáticamente la solicitud_union en nombre del usuario recién logueado.
 * Idempotente: si ya existe solicitud pendiente, ignora silenciosamente.
 */
async function processPendingJoin(empresaId: string, nombre: string): Promise<boolean> {
    if (!empresaId) return false
    try {
        await crearSolicitud(empresaId, nombre)
        return true
    } catch (err: any) {
        const msg = err?.message || ''
        if (msg.toLowerCase().includes('pendiente')) {
            // Ya hay solicitud previa: limpiar igual el flag
            return true
        }
        console.warn('[processPendingJoin] error creando solicitud', err)
        return false
    }
}
import { toast } from 'sonner'

export interface User {
    id: string
    email: string
    businessName: string
    recoveryEmail?: string | null
    accountType: 'owner' | 'employee'
    isAnonymous?: boolean
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
    loginWithSession: (userId: string, email: string, name: string) => Promise<void>
    register: (email: string, password: string, businessName: string, accountType?: 'owner' | 'employee', userName?: string) => Promise<void>
    logout: () => Promise<void>
    fetchCompanies: () => Promise<Company[]>
    leaveCompanyHandler: (companyId: string) => Promise<void>
    resetPassword: (email: string) => Promise<void>
    resetPasswordByRecoveryEmail: (recoveryEmail: string) => Promise<void>
    updateEmail: (newEmail: string) => Promise<void>
    updateRecoveryEmail: (recoveryEmail: string) => Promise<void>
    upgradeToOwner: (businessName: string) => Promise<void>
    upgradeAnonymousUser: (email: string, password: string, businessName?: string, userName?: string) => Promise<void>
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

    // Safety net: si por cualquier razón el usuario quedó logueado con un flag
    // `pending_join_empresa_id` o `pending_invite_token` pendiente sin procesar
    // (p.ej. auto-login post email-confirm que no pasa por login()), procesarlo aquí.
    useEffect(() => {
        if (!user?.id || user?.isAnonymous) return

        // 1) Invitación por token (flujo principal de empleados invitados por email)
        const pendingInviteToken = localStorage.getItem(PENDING_INVITE_TOKEN_KEY)
        if (pendingInviteToken) {
            let cancelledInvite = false
            ;(async () => {
                const acceptedEmpresaId = await processPendingInvite(user.id)
                if (cancelledInvite || !acceptedEmpresaId) return
                try {
                    const empresas = await getEmpresasByUsuario(user.id)
                    const uiCompanies = empresas.map((e: any) => ({
                        id: e.id,
                        name: e.nombre_empresa,
                        ownerId: e.usuario_id,
                        createdAt: new Date(e.created_at),
                        role: e.role,
                        logo: e.logo_url || undefined,
                    }))
                    setCompanies(uiCompanies)
                    setCurrentCompanyIdState(acceptedEmpresaId)
                    updateLastEmpresaId(user.id, acceptedEmpresaId).catch(() => {})
                } catch (e) {
                    console.warn('[safety-net] No se pudo refrescar empresas tras invitación', e)
                }
                toast.success('¡Te uniste a la empresa!', { duration: 5000 })
            })()
            return () => { cancelledInvite = true }
        }

        // 2) Solicitud por código público /unirme/:codigo (flujo secundario)
        const pendingEmpresaId = localStorage.getItem(PENDING_JOIN_KEY)
        if (!pendingEmpresaId) return

        // Ya es miembro: limpiar flag
        if (companies.some(c => c.id === pendingEmpresaId)) {
            localStorage.removeItem(PENDING_JOIN_KEY)
            return
        }

        let cancelled = false
        ;(async () => {
            const ok = await processPendingJoin(pendingEmpresaId, user.businessName || user.email)
            if (cancelled) return
            if (ok) {
                localStorage.removeItem(PENDING_JOIN_KEY)
                toast.success('Tu solicitud fue enviada. El administrador la revisará.', { duration: 6000 })
            } else {
                toast.error('No se pudo enviar tu solicitud automáticamente.', { duration: 8000 })
            }
        })()
        return () => { cancelled = true }
    }, [user?.id, companies])

    const setCurrentCompanyId = (id: string) => {
        setCurrentCompanyIdState(id)
        // Persistir en backend (fire-and-forget) para que sobreviva a refrescos en otros dispositivos
        if (user?.id) {
            updateLastEmpresaId(user.id, id || null).catch(err =>
                console.warn('[useAuth] no se pudo persistir last_empresa_id', err)
            )
        }
    }

    // Resuelve qué empresa mostrar al cargar la lista, respetando el orden:
    // 1) currentCompanyId actual si sigue siendo válido (viene de localStorage o de un setCurrent previo)
    // 2) last_empresa_id del usuario (backend) si está en la lista
    // 3) primera empresa de la lista
    const resolveInitialCompanyId = (
        list: Company[],
        backendLastId: string | null | undefined,
        existingCurrentId: string
    ): string => {
        if (list.length === 0) return ''
        if (existingCurrentId && list.some(c => c.id === existingCurrentId)) return existingCurrentId
        if (backendLastId && list.some(c => c.id === backendLastId)) return backendLastId
        return list[0].id
    }

    // Verificar si está en modo invitado
    const isGuestMode = (() => {
        if (!user || !currentCompanyId) return false
        const currentCompany = companies.find(c => c.id === currentCompanyId)
        return currentCompany ? currentCompany.ownerId !== user.id : false
    })()

    // Helper: iniciar sesión anónima nueva
    const _initAnonymousSession = async () => {
        const { data, error } = await supabase.auth.signInAnonymously()
        if (error || !data.user) throw error || new Error('signInAnonymously failed')
        const anonUser = data.user

        const fallbackEmail = `anon_${anonUser.id.slice(0, 8)}@temp.local`
        let row: any = { id: anonUser.id, email: fallbackEmail, nombre: 'Invitado' }
        try { row = await getUsuarioById(anonUser.id) }
        catch { try { row = await createUsuario({ id: anonUser.id, email: fallbackEmail, nombre: 'Invitado', account_type: 'owner' }) } catch { /* usar fallback */ } }

        let uiCompanies: Company[] = []
        try {
            const empresas = await getEmpresasByUsuario(anonUser.id)
            if (empresas.length > 0) {
                uiCompanies = empresas.map((e: any) => ({ id: e.id, name: e.nombre_empresa, ownerId: e.usuario_id, createdAt: new Date(e.created_at), role: e.role || 'owner' }))
            } else {
                const e = await createEmpresa({ nombre_empresa: 'Mi Empresa', usuario_id: anonUser.id })
                uiCompanies = [{ id: e.id, name: e.nombre_empresa, ownerId: e.usuario_id, createdAt: new Date(e.created_at), role: 'owner' }]
            }
        } catch { /* sin empresa, el CRM funcionará vacío */ }

        setUser({ id: anonUser.id, email: row.email, businessName: row.nombre, accountType: 'owner', isAnonymous: true })
        setCompanies(uiCompanies)
        if (uiCompanies.length > 0) setCurrentCompanyIdState(uiCompanies[0].id)
    }

    // Verificar sesión inicial
    useEffect(() => {
        ;(async () => {
            const { data: { session } } = await supabase.auth.getSession()

            let storedUserParsed: User | null = null
            try {
                const raw = localStorage.getItem('current-user')
                if (raw && raw !== 'null') storedUserParsed = JSON.parse(raw)
            } catch { /* ignore */ }

            if (!session) {
                if (storedUserParsed && !storedUserParsed.isAnonymous) {
                    setUser(null)
                    setCompanies([])
                    setCurrentCompanyIdState('')
                    toast.info('Tu sesión ha expirado. Por favor, inicia sesión nuevamente.', { duration: 5000 })
                } else {
                    await _initAnonymousSession()
                }
                setIsLoading(false)
                return
            }

            if (session.user.is_anonymous && (!storedUserParsed || storedUserParsed.id !== session.user.id)) {
                try {
                    let row: any
                    try { row = await getUsuarioById(session.user.id) }
                    catch { row = await createUsuario({ id: session.user.id, email: `anon_${session.user.id.slice(0, 8)}@temp.local`, nombre: 'Invitado', account_type: 'owner' }) }
                    let empresas: any[] = []
                    try { empresas = await getEmpresasByUsuario(session.user.id) } catch { /* ignore */ }
                    const uiCompanies: Company[] = empresas.length > 0
                        ? empresas.map((e: any) => ({ id: e.id, name: e.nombre_empresa, ownerId: e.usuario_id, createdAt: new Date(e.created_at), role: e.role || 'owner' }))
                        : []
                    if (uiCompanies.length === 0) {
                        try {
                            const e = await createEmpresa({ nombre_empresa: 'Mi Empresa', usuario_id: session.user.id })
                            uiCompanies.push({ id: e.id, name: e.nombre_empresa, ownerId: e.usuario_id, createdAt: new Date(e.created_at), role: 'owner' })
                        } catch { /* ignore */ }
                    }
                    setUser({ id: row.id, email: row.email, businessName: row.nombre, accountType: 'owner', isAnonymous: true })
                    setCompanies(uiCompanies)
                    if (uiCompanies.length > 0) setCurrentCompanyIdState(uiCompanies[0].id)
                } catch (e) { console.error('[AUTH] Error cargando sesión anónima existente:', e) }
            }

            setIsLoading(false)
        })().catch((e) => {
            console.error('[AUTH] Error crítico en init de sesión:', e)
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
            if ((event as string) === 'EMAIL_CHANGE' && session?.user?.email) {
                console.log('[AUTH] Email confirmado y actualizado:', session.user.email)
                setUser(prev => prev ? { ...prev, email: session.user!.email! } : prev)
                toast.success('¡Correo actualizado correctamente!')
            }

            // Actualizar usuario si cambia el objeto de sesión (por meta_data etc)
            if (event === 'USER_UPDATED' && session?.user) {
                setUser(prev => prev ? {
                    ...prev,
                    email: session.user!.email || prev.email,
                    ...(session.user!.is_anonymous === false ? { isAnonymous: false } : {})
                } : prev)
            }
            // No llamar setIsLoading(false) aquí — el IIFE de getSession lo maneja
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
                logo: e.logo_url || undefined,
                codigoEmpresa: e.codigo_empresa || undefined
            }))
            setCompanies(uiCompanies)

            // Resolver currentCompanyId respetando elección previa (localStorage) y backend
            let backendLastId: string | null = null
            try {
                const row = await getUsuarioById(user.id)
                backendLastId = row?.last_empresa_id || null
            } catch (e) {
                console.warn('[useAuth.fetchCompanies] no se pudo leer last_empresa_id', e)
            }
            const resolved = resolveInitialCompanyId(uiCompanies, backendLastId, currentCompanyId)
            if (resolved !== currentCompanyId) {
                setCurrentCompanyIdState(resolved)
                // Si la elección actual ya no es válida y caímos en otra, sincronizar backend
                if (resolved && resolved !== backendLastId) {
                    updateLastEmpresaId(user.id, resolved).catch(err =>
                        console.warn('[useAuth.fetchCompanies] no se pudo persistir last_empresa_id', err)
                    )
                }
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
                    // Leer metadata guardada durante el registro
                    const meta = authUser.user_metadata || {}
                    row = await createUsuario({
                        id: authUser.id,
                        email: authUser.email || email,
                        nombre: meta.user_name || meta.business_name || authUser.email?.split('@')[0] || 'Usuario',
                        account_type: meta.account_type || 'owner'
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
                recoveryEmail: row.recovery_email,
                accountType: row.account_type || 'owner'
            }

            // Cargar empresas ANTES de setUser para que ambos estados se actualicen juntos
            // y React no renderice un estado intermedio con user set pero companies vacío
            const empresas = await getEmpresasByUsuario(authUser.id)
            const uiCompanies = empresas.map((e: any) => ({
                id: e.id,
                name: e.nombre_empresa,
                ownerId: e.usuario_id,
                createdAt: new Date(e.created_at),
                role: e.role,
                logo: e.logo_url || undefined,
                codigoEmpresa: e.codigo_empresa || undefined
            }))

            // Setear user + companies juntos en el mismo batch de React
            setUser(newUser)
            setCompanies(uiCompanies)
            if (uiCompanies.length > 0) {
                const chosen = resolveInitialCompanyId(uiCompanies, row.last_empresa_id, currentCompanyId)
                setCurrentCompanyIdState(chosen)
                if (chosen && chosen !== row.last_empresa_id) {
                    updateLastEmpresaId(newUser.id, chosen).catch(err =>
                        console.warn('[LOGIN] no se pudo persistir last_empresa_id', err)
                    )
                }
            } else {
                console.log('[LOGIN] Usuario sin empresas — App.tsx redirigirá a /no-company o /create-empresa')
            }

            // Procesar invitación pendiente si el usuario llegó vía /invitacion/:token
            const acceptedEmpresaId = await processPendingInvite(authUser.id)
            if (acceptedEmpresaId) {
                // Refrescar empresas para incluir la recién aceptada
                try {
                    const empresas2 = await getEmpresasByUsuario(authUser.id)
                    const uiCompanies2 = empresas2.map((e: any) => ({
                        id: e.id,
                        name: e.nombre_empresa,
                        ownerId: e.usuario_id,
                        createdAt: new Date(e.created_at),
                        role: e.role,
                        logo: e.logo_url || undefined,
                        codigoEmpresa: e.codigo_empresa || undefined
                    }))
                    setCompanies(uiCompanies2)
                    setCurrentCompanyIdState(acceptedEmpresaId)
                    updateLastEmpresaId(authUser.id, acceptedEmpresaId).catch(() => {})
                } catch (e) {
                    console.warn('[LOGIN] No se pudo refrescar empresas tras aceptar invitación', e)
                }
                toast.success('¡Te uniste a la empresa!', { duration: 5000 })
            }

            // Procesar solicitud pendiente si el usuario llegó vía /unirme/:codigo
            const pendingEmpresaId = localStorage.getItem(PENDING_JOIN_KEY)
            if (pendingEmpresaId) {
                const yaEsMiembro = uiCompanies.some(c => c.id === pendingEmpresaId)
                if (yaEsMiembro) {
                    localStorage.removeItem(PENDING_JOIN_KEY)
                } else {
                    const ok = await processPendingJoin(pendingEmpresaId, row.nombre || row.email)
                    if (ok) {
                        localStorage.removeItem(PENDING_JOIN_KEY)
                        toast.success('Tu solicitud fue enviada. El administrador la revisará.', { duration: 6000 })
                    }
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

    // Called after a third-party SSO (e.g. Hubmy) has already established the Supabase session
    const loginWithSession = async (userId: string, email: string, name: string) => {
        try {
            let row
            try {
                row = await getUsuarioById(userId)
            } catch {
                row = await createUsuario({ id: userId, email, nombre: name, account_type: 'owner' })
            }

            const newUser: User = {
                id: row.id,
                email: row.email,
                businessName: row.nombre,
                recoveryEmail: row.recovery_email,
                accountType: row.account_type || 'owner',
            }

            const empresas = await getEmpresasByUsuario(userId)
            const uiCompanies = empresas.map((e: any) => ({
                id: e.id,
                name: e.nombre_empresa,
                ownerId: e.usuario_id,
                createdAt: new Date(e.created_at),
                role: e.role,
                logo: e.logo_url || undefined,
            }))

            setUser(newUser)
            setCompanies(uiCompanies)
            if (uiCompanies.length > 0) {
                const chosen = resolveInitialCompanyId(uiCompanies, row.last_empresa_id, currentCompanyId)
                setCurrentCompanyIdState(chosen)
                if (chosen && chosen !== row.last_empresa_id) {
                    updateLastEmpresaId(newUser.id, chosen).catch(err =>
                        console.warn('[LOGIN_WITH_SESSION] no se pudo persistir last_empresa_id', err)
                    )
                }
            }

            // Procesar invitación pendiente (caso SSO con /invitacion/:token previo)
            const acceptedEmpresaId = await processPendingInvite(userId)
            if (acceptedEmpresaId) {
                try {
                    const empresas2 = await getEmpresasByUsuario(userId)
                    const uiCompanies2 = empresas2.map((e: any) => ({
                        id: e.id,
                        name: e.nombre_empresa,
                        ownerId: e.usuario_id,
                        createdAt: new Date(e.created_at),
                        role: e.role,
                        logo: e.logo_url || undefined,
                    }))
                    setCompanies(uiCompanies2)
                    setCurrentCompanyIdState(acceptedEmpresaId)
                    updateLastEmpresaId(userId, acceptedEmpresaId).catch(() => {})
                } catch (e) {
                    console.warn('[LOGIN_WITH_SESSION] No se pudo refrescar empresas tras invitación', e)
                }
                toast.success('¡Te uniste a la empresa!', { duration: 5000 })
            }

            // Procesar solicitud pendiente (caso SSO con /unirme/:codigo previo)
            const pendingEmpresaId = localStorage.getItem(PENDING_JOIN_KEY)
            if (pendingEmpresaId) {
                const yaEsMiembro = uiCompanies.some(c => c.id === pendingEmpresaId)
                if (yaEsMiembro) {
                    localStorage.removeItem(PENDING_JOIN_KEY)
                } else {
                    const ok = await processPendingJoin(pendingEmpresaId, row.nombre || row.email)
                    if (ok) {
                        localStorage.removeItem(PENDING_JOIN_KEY)
                        toast.success('Tu solicitud fue enviada. El administrador la revisará.', { duration: 6000 })
                    }
                }
            }
        } catch (e: any) {
            console.error('[LOGIN_WITH_SESSION]', e)
            throw e
        }
    }

    const register = async (email: string, password: string, businessName: string, accountType: 'owner' | 'employee' = 'owner', userName?: string) => {
        try {
            console.log('[REGISTER] iniciando registro para', email, 'tipo:', accountType)
            const authUser = await authRegister(email, password, {
                account_type: accountType,
                business_name: businessName,
                user_name: userName || businessName
            })
            console.log('[REGISTER] authUser recibido', authUser)

            const { data: sessionData } = await supabase.auth.getSession()

            if (!sessionData.session) {
                console.log('[REGISTER] confirmación de email requerida')
                toast.success('¡Registro exitoso! Por favor revisa tu email para confirmar tu cuenta.', {
                    duration: 6000
                })
                return
            }

            // Para owner: userName es el nombre personal, businessName es el nombre de la empresa
            // Para employee: businessName ya es el nombre personal
            const nombreUsuario = accountType === 'owner' ? (userName || businessName) : businessName
            const row = await createUsuario({ id: authUser.id, email, nombre: nombreUsuario, account_type: accountType })
            console.log('[REGISTER] fila insertada usuarios', row)

            if (accountType === 'owner') {
                const empresa = await createEmpresa({ nombre_empresa: businessName, usuario_id: authUser.id })
                console.log('[REGISTER] empresa creada', empresa)

                const newUser: User = {
                    id: row.id,
                    email: row.email,
                    businessName: row.nombre ?? '',
                    recoveryEmail: row.recovery_email,
                    accountType: 'owner'
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
            } else {
                // Employee: no crear empresa
                const newUser: User = {
                    id: row.id,
                    email: row.email,
                    businessName: row.nombre ?? '',
                    recoveryEmail: row.recovery_email,
                    accountType: 'employee'
                }
                setUser(newUser)

                // Procesar invitación pendiente si vino vía /invitacion/:token
                const acceptedEmpresaId = await processPendingInvite(authUser.id)
                if (acceptedEmpresaId) {
                    try {
                        const empresas2 = await getEmpresasByUsuario(authUser.id)
                        const uiCompanies2 = empresas2.map((e: any) => ({
                            id: e.id,
                            name: e.nombre_empresa,
                            ownerId: e.usuario_id,
                            createdAt: new Date(e.created_at),
                            role: e.role,
                            logo: e.logo_url || undefined,
                        }))
                        setCompanies(uiCompanies2)
                        setCurrentCompanyIdState(acceptedEmpresaId)
                        updateLastEmpresaId(authUser.id, acceptedEmpresaId).catch(() => {})
                    } catch (e) {
                        console.warn('[REGISTER] No se pudo refrescar empresas tras invitación', e)
                    }
                    toast.success('¡Te uniste a la empresa!', { duration: 5000 })
                }

                // Procesar solicitud pendiente si vino vía /unirme/:codigo
                const pendingEmpresaId = localStorage.getItem(PENDING_JOIN_KEY)
                if (pendingEmpresaId) {
                    const ok = await processPendingJoin(pendingEmpresaId, row.nombre || row.email)
                    if (ok) {
                        localStorage.removeItem(PENDING_JOIN_KEY)
                        toast.success('Tu solicitud fue enviada. El administrador la revisará.', { duration: 6000 })
                    }
                }
            }

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

    const upgradeToOwner = async (businessName: string) => {
        if (!user) throw new Error('No autenticado')

        try {
            // 1. Crear empresa para el usuario
            const empresa = await createEmpresa({
                nombre_empresa: businessName,
                usuario_id: user.id
            })

            // 2. Actualizar account_type en tabla usuarios
            const { error: updateErr } = await supabase
                .from('usuarios')
                .update({ account_type: 'owner' })
                .eq('id', user.id)

            if (updateErr) throw updateErr

            // 3. Actualizar estado local
            setUser(prev => prev ? { ...prev, accountType: 'owner' } : prev)

            const newCompany: Company = {
                id: empresa.id,
                name: empresa.nombre_empresa,
                ownerId: empresa.usuario_id,
                createdAt: new Date(empresa.created_at),
                role: 'owner'
            }
            setCompanies(prev => [newCompany, ...prev])
            setCurrentCompanyIdState(newCompany.id)

            toast.success('¡Empresa creada! Ahora eres propietario.')
        } catch (e: any) {
            console.error('[AUTH] Error upgrading to owner:', e)
            toast.error(e.message || 'Error al crear empresa')
            throw e
        }
    }

    const upgradeAnonymousUser = async (email: string, password: string, businessName?: string, userName?: string) => {
        if (!user) throw new Error('No autenticado')
        try {
            const { error } = await supabase.auth.updateUser({ email, password })
            if (error) throw error
            const nombre = userName || businessName || user.businessName || 'Usuario'
            await supabase.from('usuarios').update({ email, nombre, account_type: 'owner' }).eq('id', user.id)
            if (businessName && currentCompanyId) {
                await supabase.from('empresa').update({ nombre_empresa: businessName }).eq('id', currentCompanyId)
                setCompanies(prev => prev.map(c => c.id === currentCompanyId ? { ...c, name: businessName } : c))
            }
            setUser(prev => prev ? { ...prev, email, businessName: nombre, isAnonymous: false } : prev)
        } catch (e: any) {
            console.error('[AUTH] Error actualizando usuario anónimo:', e)
            throw e
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
        loginWithSession,
        register,
        logout,
        fetchCompanies,
        leaveCompanyHandler,
        resetPassword,
        resetPasswordByRecoveryEmail,
        updateEmail,
        updateRecoveryEmail,
        upgradeToOwner,
        upgradeAnonymousUser
    }

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    )
}
