import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { InstancesManager } from './InstancesManager'
import { Plug, Info } from '@phosphor-icons/react'

interface Props {
  empresaId: string
}

export function IntegrationsManager({ empresaId }: Props) {
  return (
    <div className="space-y-8">
      {/* Info General */}
      <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-violet-500/5 to-transparent pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <Plug size={20} weight="duotone" className="text-violet-600" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold">Integración Multi-Canal</CardTitle>
              <CardDescription className="text-xs">Gestión de instancias de WhatsApp, Instagram y Facebook</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
            <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Para agregar un número de WhatsApp, Instagram o Facebook, crea una nueva instancia más abajo con su <strong className="text-foreground">API Token</strong> y <strong className="text-foreground">Webhook Secret</strong> únicos.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Instancias por Plataforma */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Plug size={20} weight="duotone" className="text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Instancias por Plataforma</h2>
            <p className="text-xs text-muted-foreground">Configura tus credenciales de Super API y el pipeline/etapa destino para cada instancia.</p>
          </div>
        </div>
        <InstancesManager empresaId={empresaId} />
      </div>
    </div>
  )
}
