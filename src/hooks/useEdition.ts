import { useMemo } from 'react'
import {
  getEdition,
  getLimit,
  type Edition,
  type EditionLimit,
  type PremiumFeature,
} from '@/lib/edition'

export function useEdition() {
  return useMemo(() => {
    const edition: Edition = getEdition()
    const isFree = edition === 'free'
    return {
      edition,
      isFree,
      isPro: !isFree,
      isLocked: (_feature: PremiumFeature) => isFree,
      getLimit: (key: EditionLimit) => getLimit(edition, key),
      isOverLimit: (key: EditionLimit, current: number) =>
        current >= getLimit(edition, key),
    }
  }, [])
}
