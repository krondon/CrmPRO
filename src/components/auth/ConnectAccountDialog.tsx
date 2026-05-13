import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner, UserCirclePlus, SignIn } from '@phosphor-icons/react'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'

interface ConnectAccountDialogProps {
  open: boolean
  onClose: () => void
}

type Mode = 'create' | 'login'

export function ConnectAccountDialog({ open, onClose }: ConnectAccountDialogProps) {
  const { upgradeAnonymousUser, login, user } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('create')

  const [name, setName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleHubmy = () => {
    if (user?.id) sessionStorage.setItem('anon_user_id_before_hubmy', user.id)
    const state = crypto.randomUUID()
    sessionStorage.setItem('hubmy_oauth_state', state)
    window.location.href = `https://apidev.hubmy.app/v1/sdk/authorize?app_id=app_01KQZ5J8M509WNKCJCF18NY2DF&state=${state}`
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim() || !name.trim()) return
    if (password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }
    setIsLoading(true)
    try {
      await upgradeAnonymousUser(email.trim(), password, businessName.trim() || name.trim(), name.trim())
      toast.success('¡Cuenta creada! Revisa tu email para confirmar.', { duration: 6000 })
      onClose()
    } catch (e: any) {
      const msg = e?.message || ''
      if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('email already')) {
        toast.error('Este correo ya está registrado. Prueba con otro o inicia sesión.')
      } else {
        toast.error(msg || 'Error al crear la cuenta')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return
    setIsLoading(true)
    try {
      await login(email.trim(), password)
      onClose()
      navigate('/dashboard')
    } catch (e: any) {
      const msg = e?.message || ''
      if (msg.toLowerCase().includes('invalid login') || msg.toLowerCase().includes('invalid credentials')) {
        toast.error('Correo o contraseña incorrectos')
      } else if (msg.toLowerCase().includes('email not confirmed')) {
        toast.error('Confirma tu email antes de iniciar sesión')
      } else {
        toast.error(msg || 'Error al iniciar sesión')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const switchMode = (m: Mode) => {
    setMode(m)
    setEmail('')
    setPassword('')
    setName('')
    setBusinessName('')
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'create'
              ? <><UserCirclePlus size={20} className="text-violet-600" weight="fill" /> Conecta tu cuenta</>
              : <><SignIn size={20} className="text-violet-600" weight="bold" /> Iniciar sesión</>
            }
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Guarda todos tus datos y accede desde cualquier dispositivo.'
              : 'Accede con tu cuenta existente. Tus datos de invitado serán reemplazados.'
            }
          </DialogDescription>
        </DialogHeader>

        {/* Toggle de modo */}
        <div className="flex rounded-lg border border-border overflow-hidden text-sm font-medium">
          <button
            type="button"
            onClick={() => switchMode('create')}
            className={`flex-1 py-2 transition-colors ${mode === 'create' ? 'bg-violet-600 text-white' : 'bg-background text-muted-foreground hover:bg-muted'}`}
          >
            Nueva cuenta
          </button>
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`flex-1 py-2 transition-colors ${mode === 'login' ? 'bg-violet-600 text-white' : 'bg-background text-muted-foreground hover:bg-muted'}`}
          >
            Ya tengo cuenta
          </button>
        </div>

        {/* Hubmy OAuth */}
        <button
          type="button"
          onClick={handleHubmy}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-background hover:bg-muted transition-colors text-sm font-medium disabled:opacity-50"
        >
          <img
            src="https://dev.hubmy.app/favicon.ico"
            alt="Hubmy"
            className="w-4 h-4"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          Continuar con Hubmy
        </button>

        <div className="relative flex items-center">
          <div className="flex-grow border-t border-border" />
          <span className="mx-3 text-xs text-muted-foreground">o con email</span>
          <div className="flex-grow border-t border-border" />
        </div>

        {mode === 'create' ? (
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ca-name">Tu nombre</Label>
              <Input id="ca-name" placeholder="Ej: Juan García" value={name} onChange={(e) => setName(e.target.value)} disabled={isLoading} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ca-business">
                Nombre de tu empresa{' '}
                <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
              </Label>
              <Input id="ca-business" placeholder="Ej: Agencia García" value={businessName} onChange={(e) => setBusinessName(e.target.value)} disabled={isLoading} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ca-email">Correo electrónico</Label>
              <Input id="ca-email" type="email" placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ca-password">Contraseña</Label>
              <Input id="ca-password" type="password" placeholder="Mín. 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading} required minLength={6} />
            </div>
            <Button type="submit" className="w-full bg-violet-600 hover:bg-violet-700 text-white" disabled={isLoading || !email || !password || !name}>
              {isLoading ? <Spinner className="w-4 h-4 animate-spin mr-2" /> : null}
              Crear cuenta
            </Button>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cl-email">Correo electrónico</Label>
              <Input id="cl-email" type="email" placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cl-password">Contraseña</Label>
              <Input id="cl-password" type="password" placeholder="Tu contraseña" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading} required />
            </div>
            <Button type="submit" className="w-full bg-violet-600 hover:bg-violet-700 text-white" disabled={isLoading || !email || !password}>
              {isLoading ? <Spinner className="w-4 h-4 animate-spin mr-2" /> : null}
              Iniciar sesión
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              ¿Olvidaste tu contraseña?{' '}
              <button type="button" onClick={() => { onClose(); navigate('/login') }} className="text-violet-600 hover:underline">
                Recupérala aquí
              </button>
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
