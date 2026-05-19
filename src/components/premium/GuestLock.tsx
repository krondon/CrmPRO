import { type ReactNode } from 'react'
import { WhatsappLogo, Sparkle } from '@phosphor-icons/react'
import LockIcon from 'lucide-react/dist/esm/icons/lock'
import { Button } from '@/components/ui/button'
import { useGuestMode } from '@/hooks/useGuestMode'
import { getWhatsAppUrl } from '@/lib/guestContact'

type Props = {
  children: ReactNode
  title?: string
  description?: string
  customMessage?: string
}

export function GuestLock({ children, title, description, customMessage }: Props) {
  const { isGuest } = useGuestMode()

  if (!isGuest) {
    return <>{children}</>
  }

  return (
    <div className="relative min-h-[420px] w-full">
      <div aria-hidden className="pointer-events-none select-none opacity-70 blur-[2px]">
        {children}
      </div>

      <div className="absolute inset-0 flex items-start justify-center px-4 pt-[150px] pb-4 z-10">
        <div className="bg-background border border-border/60 rounded-3xl shadow-2xl max-w-md w-full text-center overflow-hidden animate-in fade-in zoom-in-95 duration-500">

          {/* Header oscuro con logo negativo */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 px-8 py-7 flex items-center justify-center">
            <img
              src="/LogoNegativo.png"
              alt="Morna Tech"
              className="h-14 sm:h-16 w-auto object-contain"
            />
          </div>

          {/* Cuerpo claro */}
          <div className="p-8 sm:p-10 space-y-5">
            <div className="relative inline-flex">
              <div className="absolute inset-0 bg-violet-500/20 rounded-full blur-2xl scale-150" />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-md shadow-violet-500/40">
                <LockIcon className="h-5 w-5 text-white" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 text-[10px] font-bold uppercase tracking-widest">
                <Sparkle size={10} weight="fill" />
                Exclusivo
              </div>
              <h3 className="text-xl sm:text-2xl font-black tracking-tight">
                {title ?? 'Funcionalidad exclusiva'}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed px-2">
                {description ??
                  'Esta funcionalidad está reservada para clientes activos. Hablemos para que tu equipo la tenga disponible.'}
              </p>
            </div>

            <Button
              asChild
              size="lg"
              className="w-full h-12 bg-green-600 hover:bg-green-700 text-white gap-2 rounded-xl shadow-lg shadow-green-600/30 font-bold text-base"
            >
              <a
                href={getWhatsAppUrl(customMessage)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <WhatsappLogo size={22} weight="fill" />
                Contactar por WhatsApp
              </a>
            </Button>

            <p className="text-[11px] text-muted-foreground/70 font-semibold tracking-wide pt-3 border-t border-border/40">
              Un producto de <span className="text-foreground font-bold">Morna Tech</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
