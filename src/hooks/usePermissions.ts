import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from './useAuth'
import { supabase } from '@/supabase/client'
import type { RolePermission } from '@/lib/types'

/**
 * Hook que resuelve los permisos granulares del usuario actual.
 *
 * Owner / Admin → todos los permisos (sincrónicamente, sin fetch).
 * Viewer / Custom → se leen de roles.permissions (async).
 */

const ALL_PERMISSIONS: RolePermission[] = [
  'view_dashboard', 'view_pipeline', 'edit_leads', 'delete_leads',
  'view_analytics', 'view_calendar', 'manage_team', 'manage_settings',
  'view_budgets', 'edit_budgets', 'delete_messages', 'manage_tags'
]

export function usePermissions() {
  const { user, companies, currentCompanyId } = useAuth()
  const [fetchedPermissions, setFetchedPermissions] = useState<RolePermission[]>([])
  const [isFetching, setIsFetching] = useState(false)

  const currentCompany = companies.find(c => c.id === currentCompanyId)
  const isOwner = !!(currentCompany && user && currentCompany.ownerId === user.id)
  const companyRole = (currentCompany?.role || '').toLowerCase()
  // Owner y Admin resuelven permisos de forma inmediata (sin async)
  const isFullAccess = isOwner || companyRole === 'owner' || companyRole === 'admin'

  // Solo fetchear para viewers / roles custom
  useEffect(() => {
    if (!user?.id || !currentCompanyId || isFullAccess) {
      setFetchedPermissions([])
      return
    }

    let cancelled = false

    async function fetchPermissions() {
      setIsFetching(true)
      try {
        const { data: member, error } = await supabase
          .from('empresa_miembros')
          .select('role, role_id, roles ( permissions )')
          .eq('usuario_id', user!.id)
          .eq('empresa_id', currentCompanyId)
          .maybeSingle()

        if (cancelled) return

        if (error || !member) {
          setFetchedPermissions([])
          return
        }

        // Double-check: si la BD dice admin (case insensitive), dar todo
        if ((member.role || '').toLowerCase() === 'admin') {
          setFetchedPermissions([...ALL_PERMISSIONS])
          return
        }

        // Usar permisos granulares del rol asignado
        const rolePerms = (member as any).roles?.permissions as RolePermission[] | undefined
        if (rolePerms && Array.isArray(rolePerms)) {
          setFetchedPermissions(rolePerms)
          return
        }

        // Fallback viewer
        setFetchedPermissions(['view_dashboard', 'view_pipeline', 'view_analytics', 'view_calendar', 'view_budgets'])
      } catch (err) {
        console.error('[usePermissions] Unexpected error:', err)
        if (!cancelled) setFetchedPermissions([])
      } finally {
        if (!cancelled) setIsFetching(false)
      }
    }

    fetchPermissions()
    return () => { cancelled = true }
  }, [user?.id, currentCompanyId, isFullAccess])

  // Owner/Admin: permisos completos de forma síncrona (disponibles en el primer render)
  // Viewer/Custom: permisos del fetch async
  const permissions = isFullAccess ? ALL_PERMISSIONS : fetchedPermissions
  const isLoading = isFullAccess ? false : isFetching

  const hasPermission = useCallback(
    (perm: RolePermission) => permissions.includes(perm),
    [permissions]
  )

  return { permissions, hasPermission, isLoading, isOwner }
}
