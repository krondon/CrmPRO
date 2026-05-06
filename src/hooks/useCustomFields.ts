import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/supabase/client'
import type { CustomFieldDefinition } from '@/lib/types'

export function useCustomFields(empresaId: string) {
  const [fields, setFields] = useState<CustomFieldDefinition[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!empresaId) return
    setLoading(true)
    const { data } = await supabase
      .from('empresa_custom_fields')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('orden', { ascending: true })
    setFields((data as CustomFieldDefinition[]) ?? [])
    setLoading(false)
  }, [empresaId])

  useEffect(() => { load() }, [load])

  const addField = async (
    def: Omit<CustomFieldDefinition, 'id' | 'created_at'>
  ): Promise<CustomFieldDefinition> => {
    const { data, error } = await supabase
      .from('empresa_custom_fields')
      .insert(def)
      .select()
      .single()
    if (error) throw error
    const newField = data as CustomFieldDefinition
    setFields(prev => [...prev, newField].sort((a, b) => a.orden - b.orden))
    return newField
  }

  const removeField = async (id: string) => {
    const { error } = await supabase
      .from('empresa_custom_fields')
      .delete()
      .eq('id', id)
    if (error) throw error
    setFields(prev => prev.filter(f => f.id !== id))
  }

  const removeFields = async (ids: string[]) => {
    const { error } = await supabase
      .from('empresa_custom_fields')
      .delete()
      .in('id', ids)
    if (error) throw error
    setFields(prev => prev.filter(f => !ids.includes(f.id)))
  }

  const updateField = async (
    id: string,
    patch: Partial<Pick<CustomFieldDefinition, 'nombre' | 'descripcion' | 'requerido' | 'opciones' | 'orden'>>
  ): Promise<CustomFieldDefinition> => {
    const { data, error } = await supabase
      .from('empresa_custom_fields')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    const updated = data as CustomFieldDefinition
    setFields(prev => prev.map(f => (f.id === id ? updated : f)).sort((a, b) => a.orden - b.orden))
    return updated
  }

  return { fields, loading, addField, removeField, removeFields, updateField, reload: load }
}
