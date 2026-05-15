/**
 * useUserPipelineAccess
 *
 * Hook central que resuelve qué pipelines puede ver un usuario en la empresa activa.
 *
 * Regla actual:
 *   Si el usuario tiene rol de permisos `admin` o `viewer` (Lector) Y su cargo
 *   (persona.titulo_trabajo) es "Representante de Ventas", entonces solo debe ver
 *   los pipelines que tiene asignados en `persona_pipeline` y, dentro de ellos,
 *   solo las oportunidades asignadas a él (usuario_id o persona.id).
 *
 * Owner nunca se restringe (siempre ve todo).
 * Admin/Viewer con otro cargo tampoco se restringen por esta regla.
 *
 * Retorna:
 *   - allowedPipelineIds: string[] | null
 *       null  → sin restricción (comportamiento normal).
 *       []    → restringido pero sin pipelines asignados (no ve ninguno).
 *       [...] → solo esos IDs.
 *   - isRestricted: boolean
 *   - isLoading:   boolean
 */

import { useEffect, useState } from 'react'
import { supabase } from '@/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { isSalesRepJobTitle } from '@/lib/roleLabels'

interface UseUserPipelineAccessReturn {
    allowedPipelineIds: string[] | null
    isRestricted: boolean
    isLoading: boolean
    /**
     * `persona.id` del usuario actual en la empresa actual. Un lead puede tener
     * `asignado_a` con el `usuario_id` o con el `persona.id` según cómo se haya
     * creado, así que ambos deben considerarse al filtrar "leads del usuario".
     */
    currentPersonaId: string | null
    /** Lista combinada [user.id, persona.id] sin nulls — útil para `.in()` en queries. */
    assignedToIds: string[]
}

export function useUserPipelineAccess(): UseUserPipelineAccessReturn {
    const { user, companies, currentCompanyId } = useAuth()
    const currentCompany = companies.find(c => c.id === currentCompanyId)

    const [allowedPipelineIds, setAllowedPipelineIds] = useState<string[] | null>(null)
    const [isRestricted, setIsRestricted] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [currentPersonaId, setCurrentPersonaId] = useState<string | null>(null)

    useEffect(() => {
        // Sin usuario o sin empresa → reset
        if (!user?.id || !currentCompanyId) {
            setAllowedPipelineIds(null)
            setIsRestricted(false)
            setCurrentPersonaId(null)
            return
        }

        // Owner de la empresa: nunca se restringe.
        const isOwner = currentCompany?.ownerId === user.id
        const role = (currentCompany?.role || '').toLowerCase()

        // La restricción aplica a Admin y a Viewer (Lector). Owner queda exento.
        const restrictableRoles = ['admin', 'viewer']
        if (isOwner || !restrictableRoles.includes(role)) {
            setAllowedPipelineIds(null)
            setIsRestricted(false)
            setCurrentPersonaId(null)
            return
        }

        let cancelled = false
        setIsLoading(true)

        ;(async () => {
            if (!supabase) {
                setAllowedPipelineIds(null)
                setIsRestricted(false)
                setIsLoading(false)
                return
            }
            try {
                // 1) Buscar la persona del usuario en esta empresa para conocer su cargo.
                //    persona.empresa_id viene a través de equipos.empresa_id, así que filtramos
                //    por usuario_id y luego validamos con la empresa por miembros.
                const { data: personas, error: pErr } = await supabase
                    .from('persona')
                    .select('id, titulo_trabajo, equipo_id, equipos:equipo_id(empresa_id)')
                    .eq('usuario_id', user.id)

                if (cancelled) return
                if (pErr) {
                    console.warn('[useUserPipelineAccess] No se pudo leer persona:', pErr)
                    setAllowedPipelineIds(null)
                    setIsRestricted(false)
                    setCurrentPersonaId(null)
                    return
                }

                const personaForCompany = (personas || []).find((p: any) => {
                    const empId = Array.isArray(p.equipos) ? p.equipos[0]?.empresa_id : p.equipos?.empresa_id
                    return empId === currentCompanyId
                })

                // Si no tiene persona en esta empresa, no sabemos el cargo → no restringimos.
                if (!personaForCompany) {
                    setAllowedPipelineIds(null)
                    setIsRestricted(false)
                    setCurrentPersonaId(null)
                    return
                }

                setCurrentPersonaId(personaForCompany.id)

                if (!isSalesRepJobTitle(personaForCompany.titulo_trabajo)) {
                    setAllowedPipelineIds(null)
                    setIsRestricted(false)
                    return
                }

                // 2) Es admin + Representante de Ventas → leer sus pipelines asignados.
                const { data: pipelinesRows, error: ppErr } = await supabase
                    .from('persona_pipeline')
                    .select('pipeline_id')
                    .eq('persona_id', personaForCompany.id)

                if (cancelled) return
                if (ppErr) {
                    console.warn('[useUserPipelineAccess] No se pudo leer persona_pipeline:', ppErr)
                    setAllowedPipelineIds([])
                    setIsRestricted(true)
                    return
                }

                const ids = (pipelinesRows || []).map((r: any) => r.pipeline_id).filter(Boolean)
                setAllowedPipelineIds(ids)
                setIsRestricted(true)
            } catch (err) {
                console.error('[useUserPipelineAccess] error inesperado:', err)
                if (!cancelled) {
                    setAllowedPipelineIds(null)
                    setIsRestricted(false)
                }
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        })()

        return () => { cancelled = true }
    }, [user?.id, currentCompanyId, currentCompany?.ownerId, currentCompany?.role])

    const assignedToIds = [user?.id, currentPersonaId].filter((v): v is string => !!v)
    return { allowedPipelineIds, isRestricted, isLoading, currentPersonaId, assignedToIds }
}
