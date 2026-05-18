import { useState } from 'react'
import { UserCirclePlus, Copy, Check } from '@phosphor-icons/react'
import { ConnectAccountDialog } from './ConnectAccountDialog'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'

export function AnonymousBar() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const { user } = useAuth()

  const guestId = user?.id ? user.id.slice(0, 8).toUpperCase() : '--------'

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(user?.id ?? guestId)
    setCopied(true)
    toast.success('ID copiado')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <div className="w-full rounded-xl bg-violet-50 dark:bg-violet-950/40 border border-violet-200/60 dark:border-violet-800/50 overflow-hidden">
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-2.5 px-3 pt-2.5 pb-1.5 hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors group"
        >
          <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-900 flex items-center justify-center shrink-0 group-hover:bg-violet-200 dark:group-hover:bg-violet-800 transition-colors">
            <UserCirclePlus size={16} weight="bold" className="text-violet-600 dark:text-violet-400" />
          </div>
          <div className="flex flex-col items-start min-w-0">
            <span className="text-xs font-semibold text-violet-700 dark:text-violet-300 leading-tight">Modo invitado</span>
            <span className="text-[10px] text-violet-500 dark:text-violet-400 leading-tight">Conecta tu cuenta →</span>
          </div>
        </button>

        <button
          onClick={handleCopy}
          className="w-full flex items-center justify-between px-3 py-1.5 border-t border-violet-200/50 dark:border-violet-800/40 hover:bg-violet-100/60 dark:hover:bg-violet-900/30 transition-colors group"
          title="Copiar ID de invitado (útil para soporte)"
        >
          <span className="text-[10px] text-violet-400 dark:text-violet-500 font-mono tracking-wider">
            ID: {guestId}
          </span>
          {copied
            ? <Check size={11} className="text-emerald-500 shrink-0" weight="bold" />
            : <Copy size={11} className="text-violet-400 dark:text-violet-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          }
        </button>
      </div>

      <ConnectAccountDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}
