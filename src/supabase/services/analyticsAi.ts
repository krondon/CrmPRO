import { supabase } from '../client'

export type AnalyticsMetric =
  | 'closed_revenue'
  | 'pipeline_value'
  | 'leads_count'
  | 'conversion_rate'
  | 'top_users'
  | 'leads_by_stage'
  | 'stale_leads'
  | 'priority_breakdown'

export interface AnalyticsPlan {
  metric: AnalyticsMetric
  label: string
  filters?: {
    date_from?: string
    date_to?: string
    pipeline_id?: string
    priority?: 'low' | 'medium' | 'high'
    days_threshold?: number
    limit?: number
  }
}

export type AnalyticsKpiResult = {
  kind: 'kpi'
  value: number
  count?: number
  days_threshold?: number
}

export type AnalyticsSeriesResult = {
  kind: 'series'
  rows: Array<{ label: string; value: number; revenue?: number }>
}

export type AnalyticsResult = AnalyticsKpiResult | AnalyticsSeriesResult

export interface AnalyticsResponse {
  plan: AnalyticsPlan
  data: AnalyticsResult
  label: string
}

export async function askAnalyticsAI(
  empresaId: string,
  question: string
): Promise<AnalyticsResponse> {
  const { data, error } = await supabase.functions.invoke('ai-analytics-query', {
    body: { empresa_id: empresaId, question },
  })
  if (error) {
    const message = (error as any)?.context?.error || (error as any)?.message || 'Error desconocido'
    throw new Error(message)
  }
  if (!data || (data as any).error) {
    throw new Error((data as any)?.error || 'Respuesta vacía de la IA')
  }
  return data as AnalyticsResponse
}
