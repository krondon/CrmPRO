import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './useAuth'
import { supabase } from '@/supabase/client'
import type { RolePermission } from '@/lib/types'

/**
 * Hook que resuelve los permisos granulares del usuario actual
 * basándose en su role_id → roles.permissions.
 *
 * Owners reciben todos los permisos automáticamente.
 */

const ALL_PERMISSIONS: RolePermission[] = [
  'view_dashboard', 'view_pipeline', 'edit_leads', 'delete_leads',
  'view_analytics', 'view_calendar', 'manage_team', 'manage_settings',
  'view_budgets', 'edit_budgets', 'delete_messages', 'manage_tags'
]

export function usePermissions() {
  const { user, companies, currentCompanyId } = useAuth()
  const [permissions, setPermissions] = useState<RolePermission[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const currentCompany = companies.find(c => c.id === currentCompanyId)
  const isOwner = !!(currentCompany && user && currentCompany.ownerId === user.id)

  useEffect(() => {
    if (!user?.id || !currentCompanyId) {
      setPermissions([])
      setIsLoading(false)
      return
    }

    // Owners get all permissions
    if (isOwner) {
      setPermissions([...ALL_PERMISSIONS])
      setIsLoading(false)
      return
    }

    // For members, fetch their role_id -> roles.permissions
    let cancelled = false

    async function fetchPermissions() {
      setIsLoading(true)
      try {
        const { data: member, error } = await supabase
          .from('empresa_miembros')
          .select('role, role_id, roles ( permissions )')
          .eq('usuario_id', user!.id)
          .eq('empresa_id', currentCompanyId)
          .maybeSingle()

        if (cancelled) return

        if (error) {
          console.error('[usePermissions] Error fetching member:', error)
          setPermissions([])
          setIsLoading(false)
          return
        }

        if (!member) {
          setPermissions([])
          setIsLoading(false)
          return
        }

        // If member has a role_id linked to roles table, use those permissions
        const rolePerms = (member as any).roles?.permissions as RolePermission[] | undefined
        if (rolePerms && Array.isArray(rolePerms)) {
          setPermissions(rolePerms)
          setIsLoading(false)
          return
        }

        // Fallback: derive from the coarse role string
        const role = member.role || 'viewer'
        if (role === 'admin') {
          setPermissions([...ALL_PERMISSIONS])
        } else {
          // viewer — read-only defaults, no delete_messages, no manage_tags
          setPermissions(['view_dashboard', 'view_pipeline', 'view_analytics', 'view_calendar', 'view_budgets'])
        }
      } catch (err) {
        console.error('[usePermissions] Unexpected error:', err)
        if (!cancelled) setPermissions([])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchPermissions()
    return () => { cancelled = true }
  }, [user?.id, currentCompanyId, isOwner])

  const hasPermission = useCallback(
    (perm: RolePermission) => permissions.includes(perm),
    [permissions]
  )

  return { permissions, hasPermission, isLoading, isOwner }
}
