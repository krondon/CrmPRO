import { useAuth } from '@/hooks/useAuth'

export function useGuestMode() {
  const { user } = useAuth()
  return { isGuest: !!user?.isAnonymous }
}
