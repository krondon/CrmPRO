import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from './useAuth'
import { supabase } from '@/supabase/client'
import type { RolePermission } from '@/lib/types'

/**
 * Hook que resuelve los permisos granulares del usuario actual.
 *
 * Owner → todos los permisos (sincrónicamente, sin fetch).
 * Admin / Viewer / Custom → se leen de roles.permissions (async).
 */

const ALL_PERMISSIONS: RolePermission[] = [
  'view_dashboard', 'view_pipeline', 'edit_leads', 'delete_leads',
  'view_analytics', 'view_calendar', 'manage_team', 'manage_settings',
  'view_budgets', 'edit_budgets', 'delete_messages', 'manage_tags'
]

const DEFAULT_VIEWER_PERMISSIONS: RolePermission[] = [
  'view_dashboard', 'view_pipeline', 'view_analytics', 'view_calendar', 'view_budgets'
]

export function usePermissions() {
  const { user, companies, currentCompanyId } = useAuth()
  const [fetchedPermissions, setFetchedPermissions] = useState<RolePermission[]>([])
  const [isFetching, setIsFetching] = useState(false)

  const currentCompany = companies.find(c => c.id === currentCompanyId)
  const isOwner = !!(currentCompany && user && currentCompany.ownerId === user.id)

  // Solo el owner resuelve permisos de forma inmediata (sin async)
  // Admin, viewer y custom deben leer sus permisos reales de la BD
  useEffect(() => {
    if (!user?.id || !currentCompanyId || isOwner) {
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

        // Usar permisos granulares del rol asignado (role_id → roles.permissions)
        const rolePerms = (member as any).roles?.permissions as RolePermission[] | undefined
        if (rolePerms && Array.isArray(rolePerms)) {
          setFetchedPermissions(rolePerms)
          return
        }

        // Fallback: si no tiene role_id, buscar el rol de sistema por nombre
        const roleName = (member.role || '').toLowerCase() === 'admin' ? 'Admin' : 'Viewer'
        const { data: systemRole } = await supabase
          .from('roles')
          .select('permissions')
          .eq('empresa_id', currentCompanyId)
          .eq('name', roleName)
          .eq('is_system', true)
          .maybeSingle()

        if (cancelled) return

        if (systemRole?.permissions && Array.isArray(systemRole.permissions)) {
          setFetchedPermissions(systemRole.permissions as RolePermission[])
          return
        }

        // Último fallback
        setFetchedPermissions(DEFAULT_VIEWER_PERMISSIONS)
      } catch (err) {
        console.error('[usePermissions] Unexpected error:', err)
        if (!cancelled) setFetchedPermissions([])
      } finally {
        if (!cancelled) setIsFetching(false)
      }
    }

    fetchPermissions()
    return () => { cancelled = true }
  }, [user?.id, currentCompanyId, isOwner])

  // Owner: permisos completos de forma síncrona (disponibles en el primer render)
  // Admin/Viewer/Custom: permisos reales desde la BD (async)
  const permissions = isOwner ? ALL_PERMISSIONS : fetchedPermissions
  const isLoading = isOwner ? false : isFetching

  const hasPermission = useCallback(
    (perm: RolePermission) => permissions.includes(perm),
    [permissions]
  )

  return { permissions, hasPermission, isLoading, isOwner }
}
