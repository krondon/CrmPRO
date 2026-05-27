import SparklesIcon from 'lucide-react/dist/esm/icons/sparkles'
import { useEdition } from '@/hooks/useEdition'
import { useUpgradeModal } from './UpgradeModalContext'

export function UpgradeFab() {
  const { isFree } = useEdition()
  const { open } = useUpgradeModal()

  if (!isFree) return null

  return (
    <button
      type="button"
      onClick={() => open()}
      className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-primary-foreground shadow-lg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label="Migrar a CrmPRO"
    >
      <SparklesIcon className="h-4 w-4" />
      <span className="text-sm font-medium">Migrar a CrmPRO</span>
    </button>
  )
}
