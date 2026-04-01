import { useState, useEffect } from 'react'
import { Role, RolePermission } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Trash, PencilSimple } from '@phosphor-icons/react'
import { toast } from 'sonner'

const ALL_PERMISSIONS: { id: RolePermission; label: string; description: string }[] = [
  { id: 'view_dashboard', label: 'Ver Dashboard', description: 'Acceso al panel principal' },
  { id: 'view_pipeline', label: 'Ver Pipeline', description: 'Visualizar el pipeline de ventas' },
  { id: 'edit_leads', label: 'Editar Oportunidades', description: 'Crear y modificar oportunidades' },
  { id: 'delete_leads', label: 'Eliminar Oportunidades', description: 'Borrar oportunidades del sistema' },
  { id: 'view_analytics', label: 'Ver Analíticas', description: 'Acceso a reportes y métricas' },
  { id: 'view_calendar', label: 'Ver Calendario', description: 'Visualizar calendario y citas' },
  { id: 'manage_team', label: 'Gestionar Equipo', description: 'Administrar miembros del equipo' },
  { id: 'manage_settings', label: 'Gestionar Configuración', description: 'Modificar ajustes del sistema' },
  { id: 'view_budgets', label: 'Ver Presupuestos', description: 'Visualizar presupuestos' },
  { id: 'edit_budgets', label: 'Editar Presupuestos', description: 'Crear y modificar presupuestos' },
]

export function RolesManagement({ companyId }: { companyId: string }) {
  const [roles, setRoles] = useState<Role[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [showDialog, setShowDialog] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [roleName, setRoleName] = useState('')
  const [roleColor, setRoleColor] = useState('#3b82f6')
  const [selectedPermissions, setSelectedPermissions] = useState<RolePermission[]>([])

  useEffect(() => {
    async function fetchRoles() {
      if (!companyId) return
      setIsLoading(true)
      try {
        const { getRoles } = await import('@/supabase/services/roles')
        const dbRoles = await getRoles(companyId)
        // Los roles de sistema (Admin, Viewer) ya vienen de la BD
        setRoles(dbRoles)
      } catch (err) {
        console.error('Error fetching roles:', err)
        toast.error('Error al cargar roles')
        setRoles([])
      } finally {
        setIsLoading(false)
      }
    }
    fetchRoles()
  }, [companyId])

  const handleOpenDialog = (role?: Role) => {
    if (role) {
      setEditingRole(role)
      setRoleName(role.name)
      setRoleColor(role.color)
      setSelectedPermissions(role.permissions)
    } else {
      setEditingRole(null)
      setRoleName('')
      setRoleColor('#3b82f6')
      setSelectedPermissions([])
    }
    setShowDialog(true)
  }

  const handleSaveRole = async () => {
    if (!roleName.trim()) {
      toast.error('El nombre del rol es requerido')
      return
    }

    if (!companyId) {
      toast.error('No hay empresa seleccionada')
      return
    }

    try {
      const { createRole, updateRole } = await import('@/supabase/services/roles')

      if (editingRole) {
        const updated = await updateRole(editingRole.id, {
          name: roleName,
          color: roleColor,
          permissions: selectedPermissions
        })

        setRoles(current =>
          current.map(r => r.id === editingRole.id ? updated : r)
        )
        toast.success('Rol actualizado correctamente')
      } else {
        const created = await createRole(companyId, {
          name: roleName,
          color: roleColor,
          permissions: selectedPermissions
        })

        // El id devuelto podría requerir ser forzado al tipo Role que incluye isSystem
        const newRole: Role = {
          ...created,
          isSystem: false
        }

        setRoles(current => [...current, newRole])
        toast.success('Rol creado correctamente')
      }

      setShowDialog(false)
    } catch (err) {
      console.error('Error saving role:', err)
      toast.error('Error al guardar el rol')
    }
  }

  const handleDeleteRole = async (roleId: string) => {
    const roleToDelete = roles.find(r => r.id === roleId)
    if (roleToDelete?.isSystem) {
      toast.error('No se pueden eliminar los roles del sistema')
      return
    }

    try {
      const { deleteRole } = await import('@/supabase/services/roles')
      await deleteRole(roleId)

      setRoles(current => current.filter(r => r.id !== roleId))
      toast.success('Rol eliminado')
    } catch (err) {
      console.error('Error deleting role:', err)
      toast.error('Error al eliminar rol')
    }
  }

  const togglePermission = (permission: RolePermission) => {
    setSelectedPermissions((current) =>
      current.includes(permission)
        ? current.filter(p => p !== permission)
        : [...current, permission]
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Gestión de Roles</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Define roles y permisos para tu equipo
          </p>
        </div>
        {/*
          Botón deshabilitado temporalmente para creación de roles.
          Reactivar cuando se habilite nuevamente esta funcionalidad.
        */}
        {/**
        <Button onClick={() => handleOpenDialog()} disabled={isLoading}>
          <Plus className="mr-2" size={20} />
          Nuevo Rol
        </Button>
        */}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8">Cargando roles...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(roles || []).map((role) => {
            const isSystemRole = !!role.isSystem

            return (
              <Card key={role.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: role.color }}
                      />
                      <CardTitle className="text-lg">{role.name}</CardTitle>
                    </div>

                    {!isSystemRole && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handleOpenDialog(role)}
                        >
                          <PencilSimple size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteRole(role.id)}
                        >
                          <Trash size={16} />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {role.permissions.length} permisos asignados
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {role.permissions.slice(0, 3).map((perm) => {
                        const permData = ALL_PERMISSIONS.find(p => p.id === perm)
                        return (
                          <Badge key={perm} variant="secondary" className="text-xs">
                            {permData?.label}
                          </Badge>
                        )
                      })}
                      {role.permissions.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{role.permissions.length - 3}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRole ? 'Editar Rol' : 'Crear Nuevo Rol'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Nombre del Rol</Label>
              <Input
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                placeholder="Ej: Gerente de Ventas"
              />
            </div>

            <div className="space-y-2">
              <Label>Color del Rol</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={roleColor}
                  onChange={(e) => setRoleColor(e.target.value)}
                  className="w-20 h-10"
                />
                <Badge style={{ backgroundColor: roleColor, color: 'white' }}>
                  {roleName || 'Vista Previa'}
                </Badge>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Permisos</Label>
              <div className="space-y-2">
                {ALL_PERMISSIONS.map((permission) => (
                  <div
                    key={permission.id}
                    className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50"
                  >
                    <Checkbox
                      id={permission.id}
                      checked={selectedPermissions.includes(permission.id)}
                      onCheckedChange={() => togglePermission(permission.id)}
                    />
                    <div className="flex-1">
                      <label
                        htmlFor={permission.id}
                        className="text-sm font-medium cursor-pointer"
                      >
                        {permission.label}
                      </label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {permission.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button onClick={handleSaveRole} className="flex-1">
                {editingRole ? 'Guardar Cambios' : 'Crear Rol'}
              </Button>
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
