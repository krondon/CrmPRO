import { type ComponentProps } from 'react'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useEdition } from '@/hooks/useEdition'
import type { PremiumFeature } from '@/lib/edition'
import { useUpgradeModal } from './UpgradeModalContext'

type Props = ComponentProps<typeof Switch> & {
  feature: PremiumFeature
}

export function PremiumSwitch({ feature, ...switchProps }: Props) {
  const { isLocked } = useEdition()
  const { open } = useUpgradeModal()

  if (!isLocked(feature)) {
    return <Switch {...switchProps} />
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            open({ type: 'feature', feature })
          }}
          className="inline-flex cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Función premium — clic para desbloquear"
        >
          <Switch checked={false} disabled className="pointer-events-none opacity-50" />
        </button>
      </TooltipTrigger>
      <TooltipContent>Función premium — clic para desbloquear</TooltipContent>
    </Tooltip>
  )
}
