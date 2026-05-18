import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { LoadingScreen } from '@/components/ui/LoadingScreen'

interface ProtectedRouteProps {
    children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
    const { user, isLoading } = useAuth()
    const location = useLocation()

    if (isLoading) {
        return <LoadingScreen />
    }

    if (!user) {
        return <Navigate to="/welcome" state={{ from: location }} replace />
    }

    return <>{children}</>
}
