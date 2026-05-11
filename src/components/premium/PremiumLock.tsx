import { type ReactNode } from 'react'
import LockIcon from 'lucide-react/dist/esm/icons/lock'
import { Button } from '@/components/ui/button'
import { useEdition } from '@/hooks/useEdition'
import type { PremiumFeature } from '@/lib/edition'
import { useUpgradeModal } from './UpgradeModalContext'

type Props = {
  feature: PremiumFeature
  children: ReactNode
  title?: string
  description?: string
}

export function PremiumLock({ feature, children, title, description }: Props) {
  const { isLocked } = useEdition()
  const { open } = useUpgradeModal()

  if (!isLocked(feature)) {
    return <>{children}</>
  }

  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none select-none opacity-30 blur-sm">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-background border rounded-lg shadow-lg p-6 max-w-md text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <LockIcon className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">
            {title ?? 'Función premium'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {description ?? 'Esta función está disponible en la versión PRO de CrmPRO en la nube.'}
          </p>
          <Button onClick={() => open({ type: 'feature', feature })}>
            Desbloquear con CrmPRO
          </Button>
        </div>
      </div>
    </div>
  )
}
