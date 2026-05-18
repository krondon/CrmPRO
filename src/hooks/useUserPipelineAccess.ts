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
    /**
     * `true` cuando el hook ya determinó si el usuario está restringido o no.
     * `false` mientras se está calculando (incluido el fetch async de persona).
     * Las vistas deben esperar a que sea `true` antes de cargar datos o hacer
     * búsquedas globales para evitar mostrar leads que el usuario no debe ver.
     */
    accessResolved: boolean
}

export function useUserPipelineAccess(): UseUserPipelineAccessReturn {
    const { user, companies, currentCompanyId } = useAuth()
    const currentCompany = companies.find(c => c.id === currentCompanyId)

    const [allowedPipelineIds, setAllowedPipelineIds] = useState<string[] | null>(null)
    const [isRestricted, setIsRestricted] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [currentPersonaId, setCurrentPersonaId] = useState<string | null>(null)
    const [accessResolved, setAccessResolved] = useState(false)

    useEffect(() => {
        // Volvemos a "no resuelto" hasta que la lógica termine de decidir.
        setAccessResolved(false)

        // Sin usuario o sin empresa → reset (no hay nada que resolver aún)
        if (!user?.id || !currentCompanyId) {
            setAllowedPipelineIds(null)
            setIsRestricted(false)
            setCurrentPersonaId(null)
            // No marcamos como resuelto porque aún no hay sesión/empresa;
            // las vistas no deberían cargar tampoco sin esos datos.
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
            setAccessResolved(true)
            return
        }

        let cancelled = false
        setIsLoading(true)

        ;(async () => {
            if (!supabase) {
                setAllowedPipelineIds(null)
                setIsRestricted(false)
                setIsLoading(false)
                setAccessResolved(true)
                return
            }
            try {
                // 1) Traer personas del usuario. Hacemos 2 queries simples en
                //    lugar de un join implícito de PostgREST porque ese join a
                //    veces no resuelve la relación (devuelve null) y nos deja
                //    sin saber el empresa_id del equipo de la persona.
                const { data: personas, error: pErr } = await supabase
                    .from('persona')
                    .select('id, titulo_trabajo, equipo_id')
                    .eq('usuario_id', user.id)

                if (cancelled) return
                if (pErr) {
                    console.warn('[useUserPipelineAccess] No se pudo leer persona:', pErr)
                    setAllowedPipelineIds(null)
                    setIsRestricted(false)
                    setCurrentPersonaId(null)
                    return
                }

                const personasList = personas || []
                const equipoIds = personasList
                    .map((p: any) => p.equipo_id)
                    .filter((v: any): v is string => !!v)

                // 2) Traer los equipos para conocer empresa_id de cada uno.
                let equipoToEmpresa = new Map<string, string>()
                if (equipoIds.length > 0) {
                    const { data: equipos, error: eqErr } = await supabase
                        .from('equipos')
                        .select('id, empresa_id')
                        .in('id', equipoIds)

                    if (cancelled) return
                    if (eqErr) {
                        console.warn('[useUserPipelineAccess] No se pudo leer equipos:', eqErr)
                        setAllowedPipelineIds(null)
                        setIsRestricted(false)
                        setCurrentPersonaId(null)
                        return
                    }

                    equipoToEmpresa = new Map(
                        (equipos || []).map((e: any) => [e.id as string, e.empresa_id as string])
                    )
                }

                // 3) Encontrar la persona del usuario CUYO equipo está en la empresa actual.
                const personaForCompany = personasList.find((p: any) => {
                    const empId = p.equipo_id ? equipoToEmpresa.get(p.equipo_id) : undefined
                    return empId === currentCompanyId
                })

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

                // 2) Es admin/viewer + Representante de Ventas → leer pipelines asignados.
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
                if (!cancelled) {
                    setIsLoading(false)
                    setAccessResolved(true)
                }
            }
        })()

        return () => { cancelled = true }
    }, [user?.id, currentCompanyId, currentCompany?.ownerId, currentCompany?.role])

    const assignedToIds = [user?.id, currentPersonaId].filter((v): v is string => !!v)
    return { allowedPipelineIds, isRestricted, isLoading, currentPersonaId, assignedToIds, accessResolved }
}
