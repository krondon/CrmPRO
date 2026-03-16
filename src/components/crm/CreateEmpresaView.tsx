import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Buildings, CircleNotch, SignOut } from '@phosphor-icons/react'
import { useAuth } from '@/hooks/useAuth'

interface CreateEmpresaViewProps {
  onLogout: () => void
}

export function CreateEmpresaView({ onLogout }: CreateEmpresaViewProps) {
  const { user, upgradeToOwner } = useAuth()
  const [nombre, setNombre] = useState(user?.businessName || '')
  const [loading, setLoading] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = nombre.trim()
    if (!trimmed) {
      toast.error('Ingresa el nombre de tu empresa')
      return
    }

    setLoading(true)
    try {
      await upgradeToOwner(trimmed)
      toast.success('¡Empresa creada exitosamente!')
    } catch (err: any) {
      toast.error(err.message || 'Error al crear la empresa')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Buildings size={28} className="text-primary" />
            <span className="text-xl font-bold">CRM Pro</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onLogout}>
            <SignOut size={16} className="mr-1" />
            Salir
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Crear tu empresa</CardTitle>
            <CardDescription>
              Tu cuenta no tiene una empresa asociada. Crea una para empezar a usar el CRM.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre de la empresa *</Label>
                <Input
                  id="nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: Mi Empresa S.A."
                  maxLength={60}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <CircleNotch size={16} className="mr-2 animate-spin" />
                    Creando...
                  </>
                ) : (
                  <>
                    <Buildings size={16} className="mr-2" />
                    Crear empresa
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
