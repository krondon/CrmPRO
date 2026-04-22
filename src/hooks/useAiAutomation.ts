import { useState, useEffect, useCallback } from 'react'
import type { AiAutomationConfig, CreateAiAutomationConfigDTO } from '@/lib/types'
import {
  getAiAutomationConfigs,
  createAiAutomationConfig,
  updateAiAutomationConfig,
  deleteAiAutomationConfig,
  toggleAiAutomationConfig,
} from '@/supabase/services/aiAutomation'

export function useAiAutomation(empresaId: string) {
  const [configs, setConfigs] = useState<AiAutomationConfig[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!empresaId) return
    let cancelled = false
    setIsLoading(true)
    getAiAutomationConfigs(empresaId)
      .then(data => { if (!cancelled) setConfigs(data) })
      .catch(err => console.error('[useAiAutomation]', err))
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [empresaId])

  const save = useCallback(async (
    dto: CreateAiAutomationConfigDTO & { id?: string }
  ): Promise<AiAutomationConfig> => {
    const { id, ...rest } = dto
    if (id) {
      const updated = await updateAiAutomationConfig(id, rest)
      setConfigs(prev => prev.map(c => c.id === id ? updated : c))
      return updated
    }
    const created = await createAiAutomationConfig(rest)
    setConfigs(prev => [created, ...prev])
    return created
  }, [])

  const remove = useCallback(async (id: string) => {
    await deleteAiAutomationConfig(id)
    setConfigs(prev => prev.filter(c => c.id !== id))
  }, [])

  const toggle = useCallback(async (id: string, isActive: boolean) => {
    await toggleAiAutomationConfig(id, isActive)
    setConfigs(prev => prev.map(c => c.id === id ? { ...c, is_active: isActive } : c))
  }, [])

  return { configs, isLoading, save, remove, toggle }
}
