import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'
import { toast } from 'sonner'
import { CircleNotch, CheckCircle, CaretDown, CaretUp, ShieldCheck, Eye, EyeSlash } from '@phosphor-icons/react'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { useAuth } from '@/hooks/useAuth'

// --- Rate Limiting Config ---
// Intentos permitidos por ronda: ronda 0 = 3, ronda 1 = 2, ronda 2 = 1, ronda 3+ = bloqueado permanente
const ATTEMPTS_PER_ROUND = [3, 2, 1]
const LOCKOUT_DURATION_MS = 5 * 60 * 1000 // 5 minutos
const MAX_ROUNDS = ATTEMPTS_PER_ROUND.length // después de 3 rondas → bloqueo permanente

interface LoginAttemptData {
  count: number
  round: number // 0, 1, 2, 3 (3 = permanente)
  lockedUntil: number | null
}

function getLoginAttempts(email: string): LoginAttemptData {
  try {
    const raw = localStorage.getItem(`login-attempts-${email.toLowerCase().trim()}`)
    if (raw) {
      const parsed = JSON.parse(raw)
      // Migrar datos antiguos que no tienen round
      if (parsed.round === undefined) parsed.round = 0
      return parsed
    }
  } catch { /* ignore */ }
  return { count: 0, round: 0, lockedUntil: null }
}

function setLoginAttempts(email: string, data: LoginAttemptData): void {
  try {
    localStorage.setItem(`login-attempts-${email.toLowerCase().trim()}`, JSON.stringify(data))
  } catch { /* ignore */ }
}

function clearLoginAttempts(email: string): void {
  try {
    localStorage.removeItem(`login-attempts-${email.toLowerCase().trim()}`)
  } catch { /* ignore */ }
}

function getMaxAttemptsForRound(round: number): number {
  if (round >= MAX_ROUNDS) return 0
  return ATTEMPTS_PER_ROUND[round]
}

interface LoginViewProps {
  onLogin: (email: string, password: string) => Promise<void>
  onSwitchToRegister?: () => void
  onForgotPassword?: (email: string) => Promise<void>
}

function LoginView({ onLogin, onSwitchToRegister, onForgotPassword }: LoginViewProps) {
  const t = useTranslation('es')
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isResetting, setIsResetting] = useState(false) // Toggle mode
  const [isSuccess, setIsSuccess] = useState(false) // Success mode
  const [showMoreOptions, setShowMoreOptions] = useState(false)
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [isRecoveryLoading, setIsRecoveryLoading] = useState(false)
  const [recoverySuccessMsg, setRecoverySuccessMsg] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // --- Rate Limiting State ---
  const [isLocked, setIsLocked] = useState(false)
  const [isPermanentlyLocked, setIsPermanentlyLocked] = useState(false)
  const [lockoutRemaining, setLockoutRemaining] = useState(0) // ms restantes
  const lockoutTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Limpia el intervalo al desmontar
  useEffect(() => {
    return () => {
      if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current)
    }
  }, [])

  // Inicia un countdown visual
  const startLockoutCountdown = useCallback((lockedUntil: number, currentEmail?: string) => {
    if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current)

    const updateRemaining = () => {
      const remaining = lockedUntil - Date.now()
      if (remaining <= 0) {
        setIsLocked(false)
        setLockoutRemaining(0)
        setErrorMessage(null)
        if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current)

        // Avanzar la ronda en localStorage al expirar
        if (currentEmail) {
          const data = getLoginAttempts(currentEmail)
          if (data.lockedUntil && data.lockedUntil <= Date.now()) {
            const nextRound = data.round + 1
            if (nextRound >= MAX_ROUNDS) {
              setLoginAttempts(currentEmail, { count: 0, round: nextRound, lockedUntil: null })
              setIsPermanentlyLocked(true)
              setIsLocked(true)
            } else {
              setLoginAttempts(currentEmail, { count: 0, round: nextRound, lockedUntil: null })
            }
          }
        }
      } else {
        setIsLocked(true)
        setLockoutRemaining(remaining)
      }
    }

    updateRemaining()
    lockoutTimerRef.current = setInterval(updateRemaining, 1000)
  }, [])

  // Verificar bloqueo cuando cambia el email
  useEffect(() => {
    if (!email || isResetting) {
      setIsLocked(false)
      setIsPermanentlyLocked(false)
      setLockoutRemaining(0)
      if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current)
      return
    }

    const data = getLoginAttempts(email)

    // Bloqueo permanente (ya pasó todas las rondas)
    if (data.round >= MAX_ROUNDS) {
      setIsPermanentlyLocked(true)
      setIsLocked(true)
      return
    }

    if (data.lockedUntil && data.lockedUntil > Date.now()) {
      startLockoutCountdown(data.lockedUntil, email)
    } else {
      setIsLocked(false)
      setIsPermanentlyLocked(false)
      // Si expiró el bloqueo temporal, avanzar a la siguiente ronda
      if (data.lockedUntil && data.lockedUntil <= Date.now()) {
        const nextRound = data.round + 1
        if (nextRound >= MAX_ROUNDS) {
          // Ya no tiene más rondas → bloqueo permanente
          setLoginAttempts(email, { count: 0, round: nextRound, lockedUntil: null })
          setIsPermanentlyLocked(true)
          setIsLocked(true)
        } else {
          // Avanzar a siguiente ronda con menos intentos
          setLoginAttempts(email, { count: 0, round: nextRound, lockedUntil: null })
        }
      }
    }
  }, [email, isResetting, startLockoutCountdown])
  const { resetPasswordByRecoveryEmail } = useAuth()

  // Formatea milisegundos restantes a "M:SS"
  const formatLockoutTime = (ms: number): string => {
    const totalSeconds = Math.ceil(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email || (!isResetting && !password)) {
      toast.error(t.messages.fillRequired)
      return
    }

    // Verificar bloqueo antes de intentar login
    if (!isResetting) {
      let data = getLoginAttempts(email)

      // Si hay un lockout expirado, avanzar ronda ahora
      if (data.lockedUntil && data.lockedUntil <= Date.now()) {
        const nextRound = data.round + 1
        if (nextRound >= MAX_ROUNDS) {
          setLoginAttempts(email, { count: 0, round: nextRound, lockedUntil: null })
          toast.error('Cuenta bloqueada. Usa "Olvidé mi contraseña" para recuperar el acceso.')
          setIsPermanentlyLocked(true)
          setIsLocked(true)
          return
        } else {
          setLoginAttempts(email, { count: 0, round: nextRound, lockedUntil: null })
          data = getLoginAttempts(email) // releer datos actualizados
        }
      }

      // Bloqueo permanente
      if (data.round >= MAX_ROUNDS) {
        toast.error('Cuenta bloqueada. Usa "Olvidé mi contraseña" para recuperar el acceso.')
        setIsPermanentlyLocked(true)
        setIsLocked(true)
        return
      }
      // Bloqueo temporal
      if (data.lockedUntil && data.lockedUntil > Date.now()) {
        const remaining = formatLockoutTime(data.lockedUntil - Date.now())
        toast.error(`Cuenta bloqueada temporalmente. Intenta de nuevo en ${remaining}.`)
        startLockoutCountdown(data.lockedUntil, email)
        return
      }
    }

    setIsLoading(true)
    setErrorMessage(null)

    try {
      if (isResetting) {
        if (onForgotPassword) {
          await onForgotPassword(email)
          setIsSuccess(true)
        }
      } else {
        await onLogin(email, password)
        // Login exitoso: limpiar intentos
        clearLoginAttempts(email)
        navigate('/dashboard')
      }
    } catch (error: any) {
      console.error('Login/Reset error:', error)
      const msg = error.message || 'Ha ocurrido un error. Inténtalo de nuevo.'

      // Solo contar intentos fallidos en modo login (no en reset password)
      if (!isResetting) {
        const data = getLoginAttempts(email)
        const newCount = data.count + 1
        const maxForRound = getMaxAttemptsForRound(data.round)

        if (newCount >= maxForRound) {
          const nextRound = data.round + 1
          if (nextRound >= MAX_ROUNDS) {
            // Bloqueo permanente
            setLoginAttempts(email, { count: newCount, round: nextRound, lockedUntil: null })
            setIsPermanentlyLocked(true)
            setIsLocked(true)
            setErrorMessage('Demasiados intentos fallidos. Debes usar "Olvidé mi contraseña" para recuperar el acceso.')
            toast.error('Cuenta bloqueada. Usa la opción de recuperar contraseña.')
          } else {
            // Bloqueo temporal → avanzar ronda
            const lockedUntil = Date.now() + LOCKOUT_DURATION_MS
            setLoginAttempts(email, { count: newCount, round: data.round, lockedUntil })
            startLockoutCountdown(lockedUntil, email)
            const nextAttempts = getMaxAttemptsForRound(nextRound)
            setErrorMessage(`Demasiados intentos. Bloqueado por 5 minutos. En el próximo intento tendrás ${nextAttempts} oportunidad${nextAttempts === 1 ? '' : 'es'}.`)
            toast.error('Cuenta bloqueada temporalmente por múltiples intentos fallidos.')
          }
        } else {
          setLoginAttempts(email, { count: newCount, round: data.round, lockedUntil: null })
          const remaining = maxForRound - newCount
          setErrorMessage(`${msg} (${remaining} intento${remaining === 1 ? '' : 's'} restante${remaining === 1 ? '' : 's'})`)
          toast.error(msg)
        }
      } else {
        setErrorMessage(msg)
        toast.error(msg)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleSwitchToRegister = () => {
    if (onSwitchToRegister) {
      onSwitchToRegister()
    } else {
      navigate('/register')
    }
  }

  if (isLoading) {
    return <LoadingScreen />
  }

  if (isResetting && isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md animate-in fade-in zoom-in duration-300">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto bg-green-100 dark:bg-green-900/30 w-16 h-16 rounded-full flex items-center justify-center mb-4 text-green-600 dark:text-green-400">
              <CheckCircle size={32} weight="fill" />
            </div>
            <CardTitle className="text-2xl font-bold text-green-600 dark:text-green-500">¡Correo Enviado!</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-6">
            <p className="text-muted-foreground text-lg">
              {recoverySuccessMsg ? recoverySuccessMsg : (
                <>
                  Hemos enviado un enlace de recuperación a <br />
                  <strong className="text-foreground">{email}</strong>
                </>
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              Revisa tu bandeja de entrada (y la carpeta de spam) para continuar con el proceso.
            </p>
            <Button
              className="w-full"
              size="lg"
              onClick={() => {
                setIsSuccess(false)
                setIsResetting(false)
                setPassword('')
                setRecoveryEmail('')
                setRecoverySuccessMsg(null)
              }}
            >
              Volver a Iniciar Sesión
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!recoveryEmail) {
      toast.error('Ingresa tu correo alternativo')
      return
    }

    setIsRecoveryLoading(true)
    setErrorMessage(null)

    try {
      await resetPasswordByRecoveryEmail(recoveryEmail)
      setRecoverySuccessMsg(`Enviamos el enlace de recuperación a tu correo alternativo: ${recoveryEmail}`)
      setIsSuccess(true)
      setIsResetting(true)
    } catch (error: any) {
      console.error('Recovery error:', error)
      setErrorMessage(error.message || 'Error al enviar recuperación')
    } finally {
      setIsRecoveryLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-primary animate-in fade-in slide-in-from-top-2 duration-300 delay-75">CRM Pro</CardTitle>
          <CardDescription className="text-lg mt-2 animate-in fade-in duration-300 delay-100">
            {isResetting ? 'Recuperar Contraseña' : t.auth.welcome}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div key={isResetting ? 'reset' : 'login'} className="animate-in fade-in slide-in-from-right-4 duration-200">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="login-email">{t.auth.email}</Label>
                <Input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@empresa.com"
                  disabled={isLoading}
                />
              </div>

              {!isResetting && (
                <div className="animate-in fade-in slide-in-from-left-2 duration-200">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password">{t.auth.password}</Label>
                    <button
                      type="button"
                      onClick={() => setIsResetting(true)}
                      className="text-xs text-primary hover:underline font-medium"
                      tabIndex={-1}
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                  <div className="relative mt-1">
                    <Input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Mensaje de bloqueo con countdown */}
              {isLocked && !isResetting && !isPermanentlyLocked && (
                <div className="p-4 bg-red-600 dark:bg-red-700 border border-red-700 dark:border-red-600 text-white text-sm rounded-lg text-center font-semibold shadow-md animate-in fade-in duration-300">
                  🔒 Cuenta bloqueada temporalmente.
                  <br />
                  Podrás intentar de nuevo en <strong className="text-base">{formatLockoutTime(lockoutRemaining)}</strong>
                </div>
              )}

              {/* Mensaje de bloqueo permanente */}
              {isPermanentlyLocked && !isResetting && (
                <div className="p-4 bg-red-800 dark:bg-red-900 border border-red-900 dark:border-red-700 text-white text-sm rounded-lg text-center font-semibold shadow-md animate-in fade-in duration-300 space-y-2">
                  <div>🚫 Cuenta bloqueada por demasiados intentos fallidos.</div>
                  <div className="text-red-200 text-xs">Debes recuperar tu contraseña para continuar.</div>
                  <button
                    type="button"
                    onClick={() => setIsResetting(true)}
                    className="mt-2 px-4 py-1.5 bg-white text-red-800 rounded-md text-xs font-bold hover:bg-red-50 transition-colors"
                  >
                    Olvidé mi contraseña
                  </button>
                </div>
              )}

              <Button type="submit" className="w-full transition-all duration-300 hover:scale-[1.02]" size="lg" disabled={isLoading || (isLocked && !isResetting)}>
                {isLoading ? (
                  <>
                    <CircleNotch size={20} className="animate-spin mr-2" />
                    {isResetting ? 'Enviando enlace...' : 'Iniciando sesión...'}
                  </>
                ) : isPermanentlyLocked && !isResetting ? (
                  '🚫 Bloqueado — Recupera tu contraseña'
                ) : isLocked && !isResetting ? (
                  `Bloqueado (${formatLockoutTime(lockoutRemaining)})`
                ) : (
                  isResetting ? 'Enviar enlace de recuperación' : t.auth.login
                )}
              </Button>

              {isResetting && (
                <div className="pt-4 border-t border-border mt-4">
                  <button
                    type="button"
                    onClick={() => setShowMoreOptions(!showMoreOptions)}
                    className="flex items-center justify-center gap-1 w-full text-sm text-muted-foreground hover:text-primary transition-colors py-1"
                  >
                    {showMoreOptions ? <CaretUp size={14} /> : <CaretDown size={14} />}
                    {showMoreOptions ? 'Menos opciones' : 'Ver más opciones (Correo alternativo)'}
                  </button>

                  {showMoreOptions && (
                    <div className="mt-4 space-y-4 p-4 bg-muted/50 rounded-lg border border-border animate-in slide-in-from-top-2 duration-200">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-1">
                        <ShieldCheck size={18} className="text-primary" />
                        ¿No tienes acceso al correo principal?
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Ingresa tu correo alternativo de recuperación configurado en tu cuenta.
                      </p>
                      <div className="space-y-2">
                        <Input
                          type="email"
                          placeholder="correo@alternativo.com"
                          value={recoveryEmail}
                          onChange={(e) => setRecoveryEmail(e.target.value)}
                          disabled={isRecoveryLoading}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full"
                          onClick={handleRecoverySubmit}
                          disabled={isRecoveryLoading || !recoveryEmail}
                        >
                          {isRecoveryLoading ? (
                            <CircleNotch size={16} className="animate-spin mr-2" />
                          ) : null}
                          Enviar al correo alternativo
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {errorMessage && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md text-center font-medium">
                  {errorMessage}
                </div>
              )}

              {!isResetting && (
                <div className="mt-4">
                  <div className="relative flex items-center">
                    <div className="flex-grow border-t border-border" />
                    <span className="mx-3 text-xs text-muted-foreground">o continúa con</span>
                    <div className="flex-grow border-t border-border" />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const state = crypto.randomUUID()
                      sessionStorage.setItem('hubmy_oauth_state', state)
                      window.location.href = `https://apidev.hubmy.app/v1/sdk/authorize?app_id=app_01KQZ5J8M509WNKCJCF18NY2DF&state=${state}`
                    }}
                    className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-background hover:bg-muted transition-colors text-sm font-medium"
                  >
                    <img src="https://dev.hubmy.app/favicon.ico" alt="Hubmy" className="w-4 h-4" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    Continuar con Hubmy
                  </button>
                </div>
              )}

              <div className="text-center mt-4 space-y-2">
                {isResetting ? (
                  <button
                    type="button"
                    onClick={() => setIsResetting(false)}
                    className="text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors"
                  >
                    Volver a Iniciar Sesión
                  </button>
                ) : (
                  <Link
                    to="/register"
                    onClick={(e) => {
                      if (onSwitchToRegister) {
                        e.preventDefault()
                        onSwitchToRegister()
                      }
                    }}
                    className="text-sm text-primary hover:underline block hover:scale-105 transition-transform duration-200"
                  >
                    {t.auth.createAccount}
                  </Link>
                )}
              </div>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default LoginView
