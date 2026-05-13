import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Spinner, UserCirclePlus, SignIn } from '@phosphor-icons/react'

export function WelcomeView() {
  const { startAsGuest } = useAuth()
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)

  const handleGuest = async () => {
    setIsLoading(true)
    try {
      await startAsGuest()
      navigate('/dashboard', { replace: true })
    } catch {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6 animate-in fade-in zoom-in-95 duration-300">

        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <svg viewBox="0 0 24 24" className="w-8 h-8 fill-white">
              <rect x="2" y="3" width="6" height="18" rx="1.5"/>
              <rect x="9" y="3" width="6" height="12" rx="1.5"/>
              <rect x="16" y="3" width="6" height="15" rx="1.5"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground">CRM Pro</h1>
          <p className="text-sm text-muted-foreground">¿Cómo deseas continuar?</p>
        </div>

        {/* Opciones */}
        <div className="space-y-3">
          <button
            onClick={handleGuest}
            disabled={isLoading}
            className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/40 hover:border-violet-400 dark:hover:border-violet-600 hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-all group disabled:opacity-60 disabled:cursor-not-allowed text-left"
          >
            {isLoading ? (
              <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900 flex items-center justify-center shrink-0">
                <Spinner className="w-5 h-5 text-violet-600 animate-spin" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900 flex items-center justify-center shrink-0 group-hover:bg-violet-200 dark:group-hover:bg-violet-800 transition-colors">
                <UserCirclePlus size={22} weight="bold" className="text-violet-600 dark:text-violet-400" />
              </div>
            )}
            <div>
              <p className="font-semibold text-violet-700 dark:text-violet-300 text-sm">Probar sin cuenta</p>
              <p className="text-xs text-violet-500 dark:text-violet-400">Entra como invitado, sin registro</p>
            </div>
          </button>

          <button
            onClick={() => navigate('/login')}
            disabled={isLoading}
            className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-border bg-background hover:border-primary/40 hover:bg-muted/50 transition-all group disabled:opacity-60 disabled:cursor-not-allowed text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
              <SignIn size={22} weight="bold" className="text-foreground/70 group-hover:text-primary transition-colors" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm">Iniciar sesión</p>
              <p className="text-xs text-muted-foreground">Accede con tu cuenta existente</p>
            </div>
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          ¿No tienes cuenta?{' '}
          <button onClick={() => navigate('/register')} className="text-primary hover:underline font-medium">
            Regístrate gratis
          </button>
        </p>
      </div>
    </div>
  )
}
