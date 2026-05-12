import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/supabase/client'
import { PREDEFINED_FIELDS, type PredefinedField } from '@/lib/predefinedFields'

export interface PredefinedFieldWithDescription extends PredefinedField {
  /** Descripción efectiva: override si existe, sino el default. */
  descripcion: string
  /** True si la empresa tiene un override personalizado en DB. */
  isOverridden: boolean
}

/**
 * Carga las descripciones efectivas de los campos predefinidos para una empresa.
 * Si la empresa no ha personalizado un campo, devuelve el default desde código.
 * El usuario puede sobreescribir o restaurar al default.
 */
export function usePredefinedFieldDescriptions(empresaId: string) {
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!empresaId) return
    setLoading(true)
    const { data } = await supabase
      .from('empresa_predefined_field_descriptions')
      .select('field_key, descripcion')
      .eq('empresa_id', empresaId)
    const map: Record<string, string> = {}
    for (const row of (data ?? []) as { field_key: string; descripcion: string }[]) {
      map[row.field_key] = row.descripcion
    }
    setOverrides(map)
    setLoading(false)
  }, [empresaId])

  useEffect(() => { load() }, [load])

  const fields: PredefinedFieldWithDescription[] = PREDEFINED_FIELDS.map(f => ({
    ...f,
    descripcion: overrides[f.key] ?? f.descripcionDefault,
    isOverridden: f.key in overrides,
  }))

  const setDescription = async (fieldKey: string, descripcion: string) => {
    const trimmed = descripcion.trim()
    const def = PREDEFINED_FIELDS.find(f => f.key === fieldKey)
    if (!def) throw new Error(`Campo predefinido desconocido: ${fieldKey}`)

    if (!trimmed || trimmed === def.descripcionDefault) {
      await resetDescription(fieldKey)
      return
    }

    const { error } = await supabase
      .from('empresa_predefined_field_descriptions')
      .upsert(
        { empresa_id: empresaId, field_key: fieldKey, descripcion: trimmed, updated_at: new Date().toISOString() },
        { onConflict: 'empresa_id,field_key' }
      )
    if (error) throw error
    setOverrides(prev => ({ ...prev, [fieldKey]: trimmed }))
  }

  const resetDescription = async (fieldKey: string) => {
    const { error } = await supabase
      .from('empresa_predefined_field_descriptions')
      .delete()
      .eq('empresa_id', empresaId)
      .eq('field_key', fieldKey)
    if (error) throw error
    setOverrides(prev => {
      const next = { ...prev }
      delete next[fieldKey]
      return next
    })
  }

  return { fields, loading, setDescription, resetDescription, reload: load }
}
