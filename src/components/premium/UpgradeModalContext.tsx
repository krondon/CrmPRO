import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import type { EditionLimit, PremiumFeature } from '@/lib/edition'
import { UpgradeModal } from './UpgradeModal'

export type UpgradeReason =
  | { type: 'feature'; feature: PremiumFeature }
  | { type: 'limit'; limit: EditionLimit }
  | { type: 'generic' }

type UpgradeContextValue = {
  open: (reason?: UpgradeReason) => void
  close: () => void
  isOpen: boolean
  reason: UpgradeReason
}

const UpgradeContext = createContext<UpgradeContextValue | null>(null)

type ProviderProps = {
  children: ReactNode
  onExportData?: () => void
}

export function UpgradeModalProvider({ children, onExportData }: ProviderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [reason, setReason] = useState<UpgradeReason>({ type: 'generic' })

  const open = useCallback((next?: UpgradeReason) => {
    setReason(next ?? { type: 'generic' })
    setIsOpen(true)
  }, [])

  const close = useCallback(() => setIsOpen(false), [])

  return (
    <UpgradeContext.Provider value={{ open, close, isOpen, reason }}>
      {children}
      <UpgradeModal
        isOpen={isOpen}
        reason={reason}
        onClose={close}
        onExportData={onExportData}
      />
    </UpgradeContext.Provider>
  )
}

export function useUpgradeModal() {
  const ctx = useContext(UpgradeContext)
  if (!ctx) {
    throw new Error('useUpgradeModal debe usarse dentro de <UpgradeModalProvider>')
  }
  return ctx
}
