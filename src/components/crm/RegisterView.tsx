import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'
import { toast } from 'sonner'
import { CircleNotch, EnvelopeOpen, Buildings, UserCircle, ArrowLeft } from '@phosphor-icons/react'

type AccountType = 'owner' | 'employee'

interface RegisterViewProps {
  onRegister: (email: string, password: string, businessName: string, accountType?: AccountType) => Promise<void>
  onSwitchToLogin?: () => void
}

export function RegisterView({ onRegister, onSwitchToLogin }: RegisterViewProps) {
  const t = useTranslation('es')
  const navigate = useNavigate()
  const [accountType, setAccountType] = useState<AccountType | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email || !password || !confirmPassword || !businessName) {
      toast.error(t.messages.fillRequired)
      return
    }

    if (password !== confirmPassword) {
      toast.error('Las contraseñas no coinciden')
      return
    }

    if (password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }

    setIsLoading(true)
    try {
      await onRegister(email, password, businessName, accountType || 'owner')
      setIsSuccess(true)
    } catch (error) {
      // Error ya manejado en useAuth
    } finally {
      setIsLoading(false)
    }
  }

  const handleSwitchToLogin = () => {
    if (onSwitchToLogin) {
      onSwitchToLogin()
    } else {
      navigate('/login')
    }
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md animate-in fade-in zoom-in duration-300">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto bg-purple-100 dark:bg-purple-900/30 w-16 h-16 rounded-full flex items-center justify-center mb-4 text-purple-600 dark:text-purple-400">
              <EnvelopeOpen size={32} weight="fill" />
            </div>
            <CardTitle className="text-2xl font-bold text-purple-600 dark:text-purple-500">¡Confirma tu cuenta!</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-6">
            <p className="text-muted-foreground text-lg">
              Hemos enviado un correo de confirmación a <br />
              <strong className="text-foreground">{email}</strong>
            </p>
            <p className="text-sm text-muted-foreground">
              Por favor revisa tu bandeja de entrada (y spam) y haz clic en el enlace para activar tu cuenta.
            </p>
            <Button
              className="w-full mt-4"
              variant="outline"
              onClick={() => navigate('/login')}
            >
              Ir a Iniciar Sesión
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Paso 1: Selector de tipo de cuenta
  if (!accountType) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold text-primary animate-in fade-in slide-in-from-top-2 duration-300 delay-75">CRM Pro</CardTitle>
            <CardDescription className="text-lg mt-2 animate-in fade-in duration-300 delay-100">¿Cómo deseas registrarte?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <button
              onClick={() => setAccountType('owner')}
              className="w-full p-4 rounded-lg border-2 border-border hover:border-primary hover:bg-primary/5 transition-all duration-200 text-left group"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                  <Buildings size={28} weight="duotone" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-base">Soy Dueño / Empresa</h3>
                  <p className="text-sm text-muted-foreground mt-1">Crear mi propio CRM y gestionar mi negocio</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setAccountType('employee')}
              className="w-full p-4 rounded-lg border-2 border-border hover:border-primary hover:bg-primary/5 transition-all duration-200 text-left group"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 group-hover:bg-blue-500/20 transition-colors">
                  <UserCircle size={28} weight="duotone" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-base">Soy Empleado / Invitado</h3>
                  <p className="text-sm text-muted-foreground mt-1">Unirme al CRM de otra empresa</p>
                </div>
              </div>
            </button>

            <div className="text-center pt-2">
              <Link
                to="/login"
                onClick={(e) => {
                  if (onSwitchToLogin) {
                    e.preventDefault()
                    onSwitchToLogin()
                  }
                }}
                className="text-sm text-primary hover:underline"
              >
                ¿Ya tienes cuenta? Iniciar sesión
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Paso 2: Formulario según tipo
  const isOwner = accountType === 'owner'

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <CardHeader className="text-center">
          <button
            onClick={() => setAccountType(null)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft size={16} />
            Cambiar tipo de cuenta
          </button>
          <CardTitle className="text-3xl font-bold text-primary">CRM Pro</CardTitle>
          <CardDescription className="text-lg mt-2">
            {isOwner ? 'Registro de Empresa' : 'Registro de Empleado'}
          </CardDescription>
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${
              isOwner
                ? 'bg-primary/10 text-primary'
                : 'bg-blue-500/10 text-blue-500'
            }`}>
              {isOwner ? <Buildings size={14} /> : <UserCircle size={14} />}
              {isOwner ? 'Dueño / Empresa' : 'Empleado / Invitado'}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300 delay-75">
            <div>
              <Label htmlFor="register-business">
                {isOwner ? 'Nombre de la empresa' : 'Tu nombre'}
              </Label>
              <Input
                id="register-business"
                value={businessName}
                onChange={(e) => {
                  if (e.target.value.length <= 30) setBusinessName(e.target.value)
                }}
                placeholder={isOwner ? 'Nombre de la empresa' : 'Tu nombre completo'}
                disabled={isLoading}
              />
            </div>
            <div>
              <Label htmlFor="register-email">{t.auth.email}</Label>
              <Input
                id="register-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                disabled={isLoading}
              />
            </div>
            <div>
              <Label htmlFor="register-password">{t.auth.password}</Label>
              <Input
                id="register-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isLoading}
              />
            </div>
            <div>
              <Label htmlFor="register-confirm-password">{t.auth.confirmPassword}</Label>
              <Input
                id="register-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isLoading}
              />
            </div>

            {!isOwner && (
              <p className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                Después de registrarte, podrás buscar un CRM por código y enviar una solicitud para unirte.
              </p>
            )}

            <Button type="submit" className="w-full transition-all duration-300 hover:scale-[1.02]" size="lg" disabled={isLoading}>
              {isLoading ? (
                <>
                  <CircleNotch size={20} className="animate-spin mr-2" />
                  Creando cuenta...
                </>
              ) : isOwner ? 'Crear mi CRM' : 'Crear cuenta'}
            </Button>
            <div className="text-center mt-4">
              <Link
                to="/login"
                onClick={(e) => {
                  if (onSwitchToLogin) {
                    e.preventDefault()
                    onSwitchToLogin()
                  }
                }}
                className="text-sm text-primary hover:underline block hover:scale-105 transition-transform duration-200"
              >
                {t.auth.login}
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
