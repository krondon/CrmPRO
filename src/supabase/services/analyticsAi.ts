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

export class HubmySubscriptionError extends Error {
  constructor() {
    super('hubmy_subscription_required')
    this.name = 'HubmySubscriptionError'
  }
}

export async function askAnalyticsAI(
  empresaId: string,
  question: string
): Promise<AnalyticsResponse> {
  const { data: { session } } = await supabase.auth.getSession()
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-analytics-query`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ empresa_id: empresaId, question }),
  })

  const json = await res.json()

  if (res.status === 403) throw new HubmySubscriptionError()
  if (!res.ok || json.error) throw new Error(json.error || 'Error desconocido')
  return json as AnalyticsResponse
}
