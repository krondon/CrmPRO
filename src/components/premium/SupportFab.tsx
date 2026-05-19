import { WhatsappLogo } from '@phosphor-icons/react'
import { useGuestMode } from '@/hooks/useGuestMode'
import { getWhatsAppUrl } from '@/lib/guestContact'

export function SupportFab() {
  const { isGuest } = useGuestMode()

  if (!isGuest) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 group">
      {/* Tooltip */}
      <div className="absolute bottom-full right-0 mb-3 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 whitespace-nowrap">
        Hablemos con el equipo de Morna Tech
        <div className="absolute top-full right-6 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-slate-900" />
      </div>

      <a
        href={getWhatsAppUrl()}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Contactar a Morna Tech por WhatsApp"
        title="Hablemos con el equipo de Morna Tech"
        className="relative flex items-center gap-2.5 rounded-full bg-green-600 hover:bg-green-700 px-5 py-3.5 text-white shadow-2xl shadow-green-600/40 transition-all hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 animate-in zoom-in-95 fade-in slide-in-from-bottom-4 duration-500"
      >
        <span className="absolute inset-0 rounded-full bg-green-500/40 animate-ping" aria-hidden />
        <WhatsappLogo size={24} weight="fill" className="relative" />
        <span className="relative text-sm font-bold hidden sm:inline">¿Necesitas ayuda?</span>
      </a>
    </div>
  )
}
