import { useState, useRef, Dispatch, SetStateAction } from 'react'
// import { useKV } from '@github/spark/hooks'
import { usePersistentState } from '@/hooks/usePersistentState'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Plus, Upload, Trash, Building, Check, Eye, Pencil, X, Copy } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { createEmpresa, deleteEmpresa, updateEmpresaLogo, updateEmpresa } from '@/supabase/services/empresa'
import { supabase } from '@/supabase/client'

export interface Company {
  id: string
  name: string
  logo?: string
  ownerId: string
  createdAt: Date
  role?: string // 'owner' | 'admin' | 'viewer'
  codigoEmpresa?: string
}

interface CompanyManagementProps {
  currentUserId: string
  currentCompanyId: string
  onCompanyChange: (companyId: string) => void
  companies: Company[]
  setCompanies: Dispatch<SetStateAction<Company[]>>
}

export function CompanyManagement({ currentUserId, currentCompanyId, onCompanyChange, companies, setCompanies }: CompanyManagementProps) {
  // const [companies, setCompanies] = usePersistentState<Company[]>('companies', [])
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newCompanyName, setNewCompanyName] = useState('')
  const [newCompanyLogo, setNewCompanyLogo] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [editingLogoCompanyId, setEditingLogoCompanyId] = useState<string | null>(null)
  const [viewingLogo, setViewingLogo] = useState<string | null>(null)
  const [editingNameCompanyId, setEditingNameCompanyId] = useState<string | null>(null)
  const [editNameValue, setEditNameValue] = useState('')

  const handleCreateCompany = async () => {
    if (!newCompanyName.trim()) {
      toast.error('El nombre de la empresa es requerido')
      return
    }
    try {
      // Si hay logo cargado previo (data URL), subirlo a Storage primero
      let uploadedLogoUrl: string | undefined
      if (newCompanyLogo?.startsWith('data:image')) {
        const fileName = `company-${currentUserId}-${Date.now()}.png`
        const arrayBuffer = await (await fetch(newCompanyLogo)).arrayBuffer()
        const { error: uploadError } = await supabase.storage
          .from('company-logos')
          .upload(fileName, new Blob([arrayBuffer], { type: 'image/png' }), { upsert: true })
        if (uploadError) {
          console.error('[CompanyManagement] Error subiendo logo', uploadError)
          toast.error('No se pudo subir el logo')
        } else {
          const { data: publicUrlData } = supabase.storage
            .from('company-logos')
            .getPublicUrl(fileName)
          uploadedLogoUrl = publicUrlData?.publicUrl
        }
      }

      const inserted = await createEmpresa({ nombre_empresa: newCompanyName.trim(), usuario_id: currentUserId, logo_url: uploadedLogoUrl })
      const newCompany: Company = {
        id: inserted.id,
        name: inserted.nombre_empresa,
        logo: uploadedLogoUrl || newCompanyLogo || undefined,
        ownerId: inserted.usuario_id,
        createdAt: new Date(inserted.created_at),
        role: 'owner'
      }
      setCompanies((current) => [...(current || []), newCompany])
      onCompanyChange(newCompany.id)
      setNewCompanyName('')
      setNewCompanyLogo('')
      setShowCreateDialog(false)
      toast.success('¡Empresa creada y guardada en la base de datos!')
    } catch (e: any) {
      console.error('[CompanyManagement] Error creando empresa', e)
      toast.error(e.message || 'No se pudo crear la empresa')
    }
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, companyId?: string) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      toast.error('El archivo es muy grande. Máximo 2MB')
      return
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Solo se permiten imágenes')
      return
    }

    // Subir a Storage y luego persistir URL en empresa
    const ext = file.type.includes('png') ? 'png' : file.type.includes('jpeg') ? 'jpg' : 'img'
    const fileName = `company-${companyId || currentUserId}-${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('company-logos')
      .upload(fileName, file, { upsert: true })
    if (uploadError) {
      console.error('[CompanyManagement] Error subiendo logo', uploadError)
      toast.error('No se pudo subir el logo')
      return
    }
    const { data: publicUrlData } = supabase.storage
      .from('company-logos')
      .getPublicUrl(fileName)
    const publicUrl = publicUrlData?.publicUrl
    if (!publicUrl) {
      toast.error('No se pudo obtener la URL pública del logo')
      return
    }

    if (companyId) {
      try {
        await updateEmpresaLogo(companyId, publicUrl)
        setCompanies((current) =>
          (current || []).map(c =>
            c.id === companyId ? { ...c, logo: publicUrl } : c
          )
        )
        setEditingLogoCompanyId(null)
        toast.success('Logo actualizado y guardado')
      } catch (err: any) {
        console.error('[CompanyManagement] Error guardando logo en empresa', err)
        toast.error(err.message || 'No se pudo guardar el logo')
      }
    } else {
      setNewCompanyLogo(publicUrl)
      toast.success('Logo listo para crear la empresa')
    }
  }

  const handleUpdateName = async (companyId: string) => {
    if (!editNameValue.trim()) {
      toast.error('El nombre no puede estar vacío')
      return
    }
    try {
      await updateEmpresa(companyId, { nombre_empresa: editNameValue.trim() })
      setCompanies((current) =>
        (current || []).map(c =>
          c.id === companyId ? { ...c, name: editNameValue.trim() } : c
        )
      )
      setEditingNameCompanyId(null)
      toast.success('Nombre de empresa actualizado')
    } catch (e: any) {
      console.error('[CompanyManagement] Error actualizando nombre', e)
      toast.error('No se pudo actualizar el nombre')
    }
  }

  const handleDeleteCompany = async (companyId: string) => {
    try {
      await deleteEmpresa(companyId)
      setCompanies((current) => (current || []).filter(c => c.id !== companyId))
      if (currentCompanyId === companyId) {
        const remaining = (companies || []).filter(c => c.id !== companyId)
        if (remaining.length > 0) {
          onCompanyChange(remaining[0].id)
        } else {
          onCompanyChange('')
        }
      }
      toast.success('Empresa eliminada de la base de datos')
    } catch (e: any) {
      console.error('[CompanyManagement] Error eliminando empresa', e)
      toast.error(e.message || 'No se pudo eliminar la empresa')
    }
  }

  // Separar empresas propias y empresas invitadas
  const ownedCompanies = (companies || []).filter(c => c.ownerId === currentUserId)
  const invitedCompanies = (companies || []).filter(c => c.ownerId !== currentUserId)

  // Verificar si la empresa actual es una empresa invitada
  const currentCompany = companies.find(c => c.id === currentCompanyId)
  const isViewingInvitedCompany = currentCompany && currentCompany.ownerId !== currentUserId

  return (
    <div className="space-y-6">
      {/* Sección de empresas invitadas (si está en modo invitado) */}
      {isViewingInvitedCompany && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Eye size={20} className="text-primary" />
            <h2 className="text-xl font-bold tracking-tight">Empresa Actual (Modo Invitado)</h2>
          </div>
          <Card className="ring-2 ring-primary/60 bg-gradient-to-r from-primary/5 to-transparent rounded-xl border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div
                    className="h-16 w-16 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => currentCompany?.logo && setViewingLogo(currentCompany.logo)}
                  >
                    <Avatar className="h-16 w-16">
                      {currentCompany?.logo ? (
                        <AvatarImage src={currentCompany.logo} alt={currentCompany.name} />
                      ) : (
                        <AvatarFallback>
                          <Building size={32} />
                        </AvatarFallback>
                      )}
                    </Avatar>
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-col md:flex-row md:items-center gap-2">
                    <h3 className="font-semibold text-lg truncate">{currentCompany?.name}</h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="h-5 whitespace-nowrap">
                        <Eye size={12} className="mr-1" />
                        Invitado
                      </Badge>
                      <Badge variant="outline" className="h-5 capitalize whitespace-nowrap">
                        {currentCompany?.role || 'viewer'}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 break-words">
                    Acceso: {currentCompany?.role === 'admin' ? 'Administrador' : 'Lectura'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sección de mis empresas */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-7 w-1.5 rounded-full bg-gradient-to-b from-primary via-primary/60 to-primary/20" />
            <h2 className="text-xl font-bold tracking-tight">
              {isViewingInvitedCompany ? 'Mis Empresas' : 'Gestión de Empresas'}
            </h2>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2" size={20} />
                Nueva Empresa
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Crear Nueva Empresa</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="company-name">Nombre de la Empresa *</Label>
                  <Input
                    id="company-name"
                    value={newCompanyName}
                    onChange={(e) => {
                      if (e.target.value.length <= 30) setNewCompanyName(e.target.value)
                    }}
                    placeholder="Mi Empresa S.A."
                  />
                </div>

                <div>
                  <Label>Logo de la Empresa</Label>
                  <div className="flex items-center gap-4 mt-2">
                    <Avatar className="h-16 w-16">
                      {newCompanyLogo ? (
                        <AvatarImage src={newCompanyLogo} alt="Logo" />
                      ) : (
                        <AvatarFallback>
                          <Building size={32} />
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="flex-1">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleLogoUpload(e)}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="mr-2" size={16} />
                        Subir Logo
                      </Button>
                      <p className="text-xs text-muted-foreground mt-1">
                        PNG, JPG hasta 2MB
                      </p>
                    </div>
                  </div>
                </div>

                <Button onClick={handleCreateCompany} className="w-full">
                  <Plus className="mr-2" size={20} />
                  Crear Empresa
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4">
          {ownedCompanies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center border rounded-xl bg-muted/5 border-dashed border-border/30">
              <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-4 rounded-full mb-4 shadow-sm">
                <Building size={36} className="text-primary/40" />
              </div>
              <h3 className="text-lg font-bold mb-2 tracking-tight">No tienes empresas propias aún</h3>
              <p className="text-muted-foreground/70 max-w-sm mb-6 text-sm font-medium">
                Comienza creando tu primera empresa para gestionar tus proyectos y equipo.
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="mr-2" size={18} />
                Crear mi primera empresa
              </Button>
            </div>
          ) : (
            ownedCompanies.map((company) => (
              <Card key={company.id} className={`group overflow-hidden rounded-xl border shadow-sm hover:shadow-md transition-all duration-200 ${company.id === currentCompanyId ? 'ring-2 ring-primary/60 bg-gradient-to-r from-primary/5 to-transparent border-primary/20' : 'border-border/30'}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div
                        className="h-16 w-16 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => company.logo && setViewingLogo(company.logo)}
                      >
                        <Avatar className="h-16 w-16">
                          {company.logo ? (
                            <AvatarImage src={company.logo} alt={company.name} />
                          ) : (
                            <AvatarFallback>
                              <Building size={32} />
                            </AvatarFallback>
                          )}
                        </Avatar>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleLogoUpload(e, company.id)}
                        className="hidden"
                        id={`logo-upload-${company.id}`}
                      />
                      {(company.role === 'owner' || company.role === 'admin') && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full p-0 z-10"
                          onClick={(e) => {
                            e.stopPropagation()
                            document.getElementById(`logo-upload-${company.id}`)?.click()
                          }}
                        >
                          <Upload size={14} />
                        </Button>
                      )}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {editingNameCompanyId === company.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editNameValue}
                              onChange={(e) => setEditNameValue(e.target.value)}
                              className="h-8 w-48"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleUpdateName(company.id)
                                if (e.key === 'Escape') setEditingNameCompanyId(null)
                              }}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={() => handleUpdateName(company.id)}
                            >
                              <Check size={16} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => setEditingNameCompanyId(null)}
                            >
                              <X size={16} />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <h3 className="font-semibold">{company.name}</h3>
                            {company.role === 'owner' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => {
                                  setEditingNameCompanyId(company.id)
                                  setEditNameValue(company.name)
                                }}
                              >
                                <Pencil size={12} />
                              </Button>
                            )}
                          </>
                        )}
                        {company.id === currentCompanyId && (
                          <Badge variant="default" className="h-5">
                            <Check size={12} className="mr-1" />
                            Activa
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Creada el {new Date(company.createdAt).toLocaleDateString('es-ES')}
                      </p>
                      {company.role === 'owner' && company.codigoEmpresa && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-xs text-muted-foreground">Código:</span>
                          <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded select-all">
                            {company.codigoEmpresa}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={() => {
                              navigator.clipboard.writeText(company.codigoEmpresa!)
                              toast.success('Código copiado')
                            }}
                          >
                            <Copy size={12} />
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {company.id !== currentCompanyId && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            onCompanyChange(company.id)
                            toast.success(`Cambiado a ${company.name}`)
                          }}
                        >
                          Activar
                        </Button>
                      )}
                      {company.role === 'owner' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteCompany(company.id)}
                        >
                          <Trash size={16} />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Sección de otras empresas invitadas (si hay más de una) */}
      {invitedCompanies.length > 0 && !isViewingInvitedCompany && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-muted-foreground tracking-tight">Empresas Invitadas</h2>
          <div className="grid gap-4">
            {invitedCompanies.map((company) => (
              <Card key={company.id} className="opacity-80 hover:opacity-100 transition-all duration-200 rounded-xl border border-border/30 shadow-sm hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-12 w-12">
                      {company.logo ? (
                        <AvatarImage src={company.logo} alt={company.name} />
                      ) : (
                        <AvatarFallback>
                          <Building size={24} />
                        </AvatarFallback>
                      )}
                    </Avatar>

                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{company.name}</h3>
                        <Badge variant="outline" className="h-5 capitalize">
                          {company.role || 'viewer'}
                        </Badge>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        onCompanyChange(company.id)
                        toast.success(`Entrando a ${company.name} como invitado`)
                      }}
                    >
                      <Eye size={14} className="mr-1" />
                      Ver
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Modal de vista previa de logo estilo Instagram */}
      {viewingLogo && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 cursor-pointer animate-in fade-in duration-200"
          onClick={() => setViewingLogo(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full h-full flex items-center justify-center">
            <img
              src={viewingLogo}
              alt="Logo preview"
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-4 right-4 h-10 w-10 rounded-full bg-black/50 hover:bg-black/70 text-white p-0"
              onClick={() => setViewingLogo(null)}
            >
              ✕
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
