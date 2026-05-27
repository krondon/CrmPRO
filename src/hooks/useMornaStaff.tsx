import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { getMornaStaffRole, type MornaStaffRole } from '@/supabase/services/mornaStaff'
import { useAuth } from './useAuth'
import { LoadingScreen } from '@/components/ui/LoadingScreen'

interface MornaStaffContextValue {
    role: MornaStaffRole | null
    isStaff: boolean
    isLoading: boolean
    refresh: () => Promise<void>
}

const MornaStaffContext = createContext<MornaStaffContextValue>({
    role: null,
    isStaff: false,
    isLoading: true,
    refresh: async () => {},
})

/**
 * Provider que consulta una sola vez el rol Morna Staff del usuario actual y
 * lo cachea para toda la app. Se monta dentro del árbol cuando hay sesión.
 */
export function MornaStaffProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth()
    const [role, setRole] = useState<MornaStaffRole | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    const fetchRole = async () => {
        if (!user || user.isAnonymous) {
            setRole(null)
            setIsLoading(false)
            return
        }
        setIsLoading(true)
        try {
            const r = await getMornaStaffRole()
            setRole(r)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        void fetchRole()
        // user.id como dep evita refetch innecesario en re-renders del objeto user
    }, [user?.id, user?.isAnonymous])

    return (
        <MornaStaffContext.Provider
            value={{
                role,
                isStaff: role !== null,
                isLoading,
                refresh: fetchRole,
            }}
        >
            {children}
        </MornaStaffContext.Provider>
    )
}

export function useMornaStaff() {
    return useContext(MornaStaffContext)
}

/**
 * Wrapper de ruta: redirige a /dashboard si el usuario no es Morna Staff.
 * Mientras carga muestra LoadingScreen (evita "flash" de la página admin
 * para usuarios sin permiso).
 */
export function MornaStaffRoute({ children }: { children: ReactNode }) {
    const { isStaff, isLoading } = useMornaStaff()
    if (isLoading) return <LoadingScreen />
    if (!isStaff) return <Navigate to="/dashboard" replace />
    return <>{children}</>
}
