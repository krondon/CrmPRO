export type Edition = 'free' | 'pro'

export type PremiumFeature =
  | 'automations'
  | 'productivity_reports'
  | 'advanced_integrations'
  | 'super_api'
  | 'semaforo'

export type EditionLimit = 'pipelines' | 'team_members' | 'tags'

const FREE_LIMITS: Record<EditionLimit, number> = {
  pipelines: 2,
  team_members: 3,
  tags: 15,
}

export const UPGRADE_URL = 'https://crmpro-three.vercel.app/'

export function getEdition(): Edition {
  const value = (import.meta.env as Record<string, string | undefined>).VITE_EDITION
  return value === 'free' ? 'free' : 'pro'
}

export function getLimit(edition: Edition, limit: EditionLimit): number {
  return edition === 'free' ? FREE_LIMITS[limit] : Infinity
}
