import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { UPGRADE_URL, type EditionLimit, type PremiumFeature } from '@/lib/edition'
import type { UpgradeReason } from './UpgradeModalContext'

const FEATURE_LABELS: Record<PremiumFeature, string> = {
  automations: 'Las automatizaciones',
  productivity_reports: 'Los reportes de productividad',
  advanced_integrations: 'Las integraciones avanzadas',
  super_api: 'La conexión con SuperAPI',
  semaforo: 'El Semáforo',
}

const LIMIT_LABELS: Record<EditionLimit, string> = {
  pipelines: 'pipelines (máximo 2)',
  team_members: 'usuarios en el equipo (máximo 3)',
  tags: 'etiquetas (máximo 15)',
}

function getSubtitle(reason: UpgradeReason): string {
  if (reason.type === 'feature') {
    const label = FEATURE_LABELS[reason.feature]
    return `${label} están disponibles en la versión PRO.`
  }
  if (reason.type === 'limit') {
    return `Llegaste al límite de la versión gratuita: ${LIMIT_LABELS[reason.limit]}.`
  }
  return 'Desbloquea todas las funciones migrando a CrmPRO en la nube.'
}

const STEPS = [
  {
    title: 'Exporta tu información',
    body: 'Pulsa "Exportar mis datos" desde Configuración. Se generará un ZIP con todos tus contactos, leads, pipelines, mensajes y adjuntos.',
  },
  {
    title: 'Crea tu cuenta PRO',
    body: 'Regístrate en crmpro-three.vercel.app y accede a todas las funciones premium desde el primer día.',
  },
  {
    title: 'Importa tu información',
    body: 'Dentro de CrmPRO, ve a Configuración → Importar desde versión gratuita y sube el ZIP.',
  },
  {
    title: 'Listo',
    body: 'Tus datos en la nube, sincronizados entre dispositivos y con todas las funciones premium activas.',
  },
]

type Props = {
  isOpen: boolean
  reason: UpgradeReason
  onClose: () => void
  onExportData?: () => void
}

export function UpgradeModal({ isOpen, reason, onClose, onExportData }: Props) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Esta función es parte de CrmPRO en la nube</DialogTitle>
          <DialogDescription>{getSubtitle(reason)}</DialogDescription>
        </DialogHeader>

        <ol className="space-y-3 text-sm">
          {STEPS.map((step, idx) => (
            <li key={idx} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {idx + 1}
              </span>
              <div>
                <p className="font-medium">{step.title}</p>
                <p className="text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {onExportData && (
            <Button variant="outline" onClick={onExportData}>
              Exportar mis datos ahora
            </Button>
          )}
          <Button asChild>
            <a href={UPGRADE_URL} target="_blank" rel="noopener noreferrer">
              Ir a CrmPRO
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
