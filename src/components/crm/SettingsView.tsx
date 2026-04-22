import { useState, useEffect, Dispatch, SetStateAction } from 'react'
import { usePersistentState } from '@/hooks/usePersistentState'
import { Pipeline, Stage, PipelineType } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash, SignOut, Pencil, Check, X, Envelope, ShieldCheck, GearSix, Lightning, Tag, Funnel, IdentificationBadge, Buildings, Plug, ShoppingCart, Key, Rocket } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AddPipelineDialog } from './AddPipelineDialog'
import { RolesManagement } from './RolesManagement'
import { TagsManagement } from './settings/TagsManagement'
import { CompanyManagement, Company } from './CompanyManagement'
import { CatalogManagement } from './CatalogManagement'
import { IDsViewer } from './IDsViewer'
import { IntegrationsManager } from './settings/IntegrationsManager'
import { LandingTokensManager } from './settings/LandingTokensManager'
import { updatePipeline, getPipelines } from '@/supabase/helpers/pipeline'
import { AutomationsPanel } from './settings/AutomationsPanel'
import { AiAutomationPanel } from './settings/ai-automation/AiAutomationPanel'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'

interface SettingsViewProps {
  currentUserId?: string
  currentCompanyId?: string
  onCompanyChange?: (companyId: string) => void
  companies?: Company[]
  setCompanies?: Dispatch<SetStateAction<Company[]>>
  onLogout?: () => void
}

export function SettingsView({ currentUserId, currentCompanyId, onCompanyChange, companies, setCompanies, onLogout }: SettingsViewProps = {}) {
  const currentCompany = companies?.find(c => c.id === currentCompanyId)
  const userRole = currentCompany?.role || 'viewer'
  const isAdminOrOwner = userRole === 'admin' || userRole === 'owner'

  const [newEmail, setNewEmail] = useState('')
  const [confirmEmail, setConfirmEmail] = useState('')
  const [recoveryEmailInput, setRecoveryEmailInput] = useState('')
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false)
  const [isUpdatingRecovery, setIsUpdatingRecovery] = useState(false)

  const { user, updateEmail, updateRecoveryEmail, upgradeToOwner } = useAuth()
  const [upgradeBusinessName, setUpgradeBusinessName] = useState('')
  const [isUpgrading, setIsUpgrading] = useState(false)

  const [pipelines, setPipelines] = usePersistentState<Pipeline[]>(`pipelines-${currentCompanyId}`, [])
  const [showPipelineDialog, setShowPipelineDialog] = useState(false)
  const [editingPipelineId, setEditingPipelineId] = useState<string | null>(null)
  const [editPipelineName, setEditPipelineName] = useState('')

  useEffect(() => {
    if (!currentCompanyId) return

    getPipelines(currentCompanyId)
      .then(({ data }) => {
        if (data) {
          const dbPipelines: Pipeline[] = data.map((p: any) => ({
            id: p.id,
            name: p.nombre,
            type: p.nombre.toLowerCase().trim().replace(/\s+/g, '-'),
            stages: (p.etapas || []).map((s: any) => ({
              id: s.id,
              name: s.nombre,
              order: s.orden,
              color: s.color,
              pipelineType: p.nombre.toLowerCase().trim().replace(/\s+/g, '-')
            })).sort((a: any, b: any) => a.order - b.order)
          }))
          setPipelines(dbPipelines)
        }
      })
      .catch(err => console.error('[SettingsView] Error loading pipelines:', err))
  }, [currentCompanyId])

  const handleUpdatePipeline = async (pipelineId: string) => {
    if (!editPipelineName.trim()) {
      toast.error('El nombre del pipeline no puede estar vacío')
      return
    }
    try {
      await updatePipeline(pipelineId, { nombre: editPipelineName.trim() })
      setPipelines((current) =>
        (current || []).map(p =>
          p.id === pipelineId ? { ...p, name: editPipelineName.trim() } : p
        )
      )
      setEditingPipelineId(null)
      toast.success('Nombre del pipeline actualizado')
    } catch (e: any) {
      console.error('[SettingsView] Error actualizando pipeline', e)
      toast.error('No se pudo actualizar el pipeline')
    }
  }

  const handleAddPipeline = (pipeline: Pipeline) => {
    setPipelines((current) => [...(current || []), pipeline])
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-32 md:pb-8 space-y-8 bg-background/50">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500/20 to-violet-600/10 flex items-center justify-center shadow-sm">
            <GearSix size={26} weight="duotone" className="text-violet-600" />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">Configuraciones</h1>
            <p className="text-sm text-muted-foreground font-medium">Gestiona tu cuenta, pipelines e integraciones</p>
          </div>
        </div>
        <Button
          variant="outline"
          className="text-destructive hover:bg-destructive/10 border-destructive/20 md:hidden rounded-xl"
          onClick={onLogout}
        >
          <SignOut className="mr-2" size={16} />
          Cerrar Sesión
        </Button>
      </div>

      <Tabs defaultValue="companies">
        <TabsList className="w-full justify-start overflow-x-auto h-auto p-1.5 no-scrollbar bg-muted/50 rounded-xl backdrop-blur-sm border border-border/40 flex-nowrap">
          <TabsTrigger value="account" className="rounded-lg data-[state=active]:shadow-sm gap-1.5 text-xs font-semibold shrink-0">
            <Envelope size={14} weight="duotone" />
            Mi Cuenta
          </TabsTrigger>
          <TabsTrigger value="companies" className="rounded-lg data-[state=active]:shadow-sm gap-1.5 text-xs font-semibold shrink-0">
            <Buildings size={14} weight="duotone" />
            Empresas
          </TabsTrigger>

          <TabsTrigger value="tags" className="rounded-lg data-[state=active]:shadow-sm gap-1.5 text-xs font-semibold shrink-0">
            <Tag size={14} weight="duotone" />
            Etiquetas
          </TabsTrigger>
          <TabsTrigger value="pipelines" className="rounded-lg data-[state=active]:shadow-sm gap-1.5 text-xs font-semibold shrink-0">
            <Funnel size={14} weight="duotone" />
            Pipelines
          </TabsTrigger>
          {/* {isAdminOrOwner && (
            <TabsTrigger value="catalog" className="rounded-lg data-[state=active]:shadow-sm gap-1.5 text-xs font-semibold">
              <ShoppingCart size={14} weight="duotone" />
              Catalogo
            </TabsTrigger>
          )} */}
          {userRole === 'owner' && (
            <TabsTrigger value="roles" className="rounded-lg data-[state=active]:shadow-sm gap-1.5 text-xs font-semibold shrink-0">
              <ShieldCheck size={14} weight="duotone" />
              Roles
            </TabsTrigger>
          )}
          {isAdminOrOwner && (
            <TabsTrigger value="automations" className="rounded-lg data-[state=active]:shadow-sm gap-1.5 text-xs font-semibold shrink-0">
              <Lightning size={14} weight="duotone" />
              Automatizaciones
            </TabsTrigger>
          )}
          {isAdminOrOwner && (
            <TabsTrigger value="ai-automation" className="rounded-lg data-[state=active]:shadow-sm gap-1.5 text-xs font-semibold shrink-0">
              🤖
              IA
            </TabsTrigger>
          )}
          {isAdminOrOwner && (
            <TabsTrigger value="integrations" className="rounded-lg data-[state=active]:shadow-sm gap-1.5 text-xs font-semibold shrink-0">
              <Plug size={14} weight="duotone" />
              Integraciones
            </TabsTrigger>
          )}
          {isAdminOrOwner && (
            <TabsTrigger value="landing-tokens" className="rounded-lg data-[state=active]:shadow-sm gap-1.5 text-xs font-semibold shrink-0">
              <Key size={14} weight="duotone" />
              Landing Tokens
            </TabsTrigger>
          )}
          {isAdminOrOwner && (
            <TabsTrigger value="ids" className="rounded-lg data-[state=active]:shadow-sm gap-1.5 text-xs font-semibold shrink-0">
              <IdentificationBadge size={14} weight="duotone" />
              IDs
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── Mi Cuenta ─────────────────────────────────────── */}
        <TabsContent value="account" className="space-y-6 mt-8">
          <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-blue-500/5 to-transparent pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Envelope size={20} weight="duotone" className="text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-lg font-bold">Cambiar correo electrónico</CardTitle>
                  <CardDescription className="text-xs">
                    Al guardar, recibirás un link de confirmación en el nuevo correo.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Correo actual</Label>
                <p className="text-sm font-bold bg-muted/50 px-4 py-2.5 rounded-xl border border-border/40">{user?.email || '—'}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="new-email" className="text-sm font-semibold">Nuevo correo</Label>
                  <Input
                    id="new-email"
                    type="email"
                    placeholder="nuevo@correo.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-email" className="text-sm font-semibold">Confirmar nuevo correo</Label>
                  <Input
                    id="confirm-email"
                    type="email"
                    placeholder="nuevo@correo.com"
                    value={confirmEmail}
                    onChange={(e) => setConfirmEmail(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
              </div>

              <Button
                className="rounded-xl shadow-sm"
                disabled={isUpdatingEmail || !newEmail || !confirmEmail}
                onClick={async () => {
                  if (newEmail !== confirmEmail) {
                    toast.error('Los correos no coinciden')
                    return
                  }
                  if (newEmail === user?.email) {
                    toast.error('El nuevo correo es igual al actual')
                    return
                  }
                  setIsUpdatingEmail(true)
                  try {
                    await updateEmail(newEmail)
                    setNewEmail('')
                    setConfirmEmail('')
                  } finally {
                    setIsUpdatingEmail(false)
                  }
                }}
              >
                {isUpdatingEmail ? 'Enviando...' : 'Cambiar correo'}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-emerald-500/5 to-transparent pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <ShieldCheck size={20} weight="duotone" className="text-emerald-600" />
                </div>
                <div>
                  <CardTitle className="text-lg font-bold">Correo alternativo de recuperación</CardTitle>
                  <CardDescription className="text-xs">
                    Se usará para recuperar acceso si pierdes tu correo principal.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Correo alternativo actual</Label>
                <p className="text-sm font-bold bg-muted/50 px-4 py-2.5 rounded-xl border border-border/40">
                  {user?.recoveryEmail || 'No configurado'}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="recovery-email" className="text-sm font-semibold">Nuevo correo alternativo</Label>
                <Input
                  id="recovery-email"
                  type="email"
                  placeholder="alternativo@correo.com"
                  value={recoveryEmailInput}
                  onChange={(e) => setRecoveryEmailInput(e.target.value)}
                  className="rounded-xl"
                />
              </div>

              <Button
                variant="outline"
                className="rounded-xl"
                disabled={isUpdatingRecovery || !recoveryEmailInput}
                onClick={async () => {
                  setIsUpdatingRecovery(true)
                  try {
                    await updateRecoveryEmail(recoveryEmailInput)
                    setRecoveryEmailInput('')
                  } finally {
                    setIsUpdatingRecovery(false)
                  }
                }}
              >
                {isUpdatingRecovery ? 'Guardando...' : 'Guardar correo alternativo'}
              </Button>
            </CardContent>
          </Card>
          {user?.accountType === 'employee' && (
            <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-orange-500/5 to-transparent pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                    <Rocket size={20} weight="duotone" className="text-orange-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-bold">Crear mi propia empresa</CardTitle>
                    <CardDescription className="text-xs">
                      Actualmente eres colaborador. Crea tu propia empresa para gestionar tu propio CRM.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-5">
                <div className="space-y-1.5">
                  <Label htmlFor="upgrade-name" className="text-sm font-semibold">Nombre de la empresa</Label>
                  <Input
                    id="upgrade-name"
                    placeholder="Mi Empresa"
                    value={upgradeBusinessName}
                    onChange={(e) => setUpgradeBusinessName(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <Button
                  className="rounded-xl shadow-sm"
                  disabled={isUpgrading || !upgradeBusinessName.trim()}
                  onClick={async () => {
                    setIsUpgrading(true)
                    try {
                      await upgradeToOwner(upgradeBusinessName.trim())
                      setUpgradeBusinessName('')
                    } finally {
                      setIsUpgrading(false)
                    }
                  }}
                >
                  {isUpgrading ? 'Creando...' : 'Crear empresa'}
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Empresas ─────────────────────────────────────── */}
        <TabsContent value="companies" className="space-y-6 mt-8">
          {currentUserId && onCompanyChange && companies && setCompanies ? (
            <CompanyManagement
              currentUserId={currentUserId}
              currentCompanyId={currentCompanyId || ''}
              onCompanyChange={onCompanyChange}
              companies={companies}
              setCompanies={setCompanies}
            />
          ) : (
            <Card className="border-none shadow-sm rounded-2xl">
              <CardContent className="py-16">
                <div className="flex flex-col items-center justify-center text-center space-y-3 opacity-60">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                    <Buildings size={32} className="text-muted-foreground" weight="thin" />
                  </div>
                  <p className="font-bold text-lg">Inicia sesión</p>
                  <p className="text-sm text-muted-foreground">Inicia sesión para gestionar tus empresas</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Integraciones ─────────────────────────────────── */}
        <TabsContent value="integrations" className="space-y-6 mt-8">
          {isAdminOrOwner ? (
            <IntegrationsManager empresaId={currentCompanyId || ''} />
          ) : (
            <Card className="border-none shadow-sm rounded-2xl">
              <CardContent className="py-16">
                <div className="flex flex-col items-center justify-center text-center space-y-3 opacity-60">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                    <Plug size={32} className="text-muted-foreground" weight="thin" />
                  </div>
                  <p className="font-bold text-lg">Sin permisos</p>
                  <p className="text-sm text-muted-foreground">No tienes permisos para gestionar integraciones.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Landing Tokens ─────────────────────────────────── */}
        <TabsContent value="landing-tokens" className="space-y-6 mt-8">
          {isAdminOrOwner ? (
            <LandingTokensManager empresaId={currentCompanyId || ''} />
          ) : (
            <Card className="border-none shadow-sm rounded-2xl">
              <CardContent className="py-16">
                <div className="flex flex-col items-center justify-center text-center space-y-3 opacity-60">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                    <Key size={32} className="text-muted-foreground" weight="thin" />
                  </div>
                  <p className="font-bold text-lg">Sin permisos</p>
                  <p className="text-sm text-muted-foreground">No tienes permisos para gestionar landing tokens.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Catálogo ─────────────────────────────────── */}
        
        <TabsContent value="catalog" className="space-y-6 mt-8">
          {isAdminOrOwner ? (
            <CatalogManagement />
          ) : (
            <Card className="border-none shadow-sm rounded-2xl">
              <CardContent className="py-16">
                <div className="flex flex-col items-center justify-center text-center space-y-3 opacity-60">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                    <ShoppingCart size={32} className="text-muted-foreground" weight="thin" />
                  </div>
                  <p className="font-bold text-lg">Sin permisos</p>
                  <p className="text-sm text-muted-foreground">No tienes permisos para gestionar el catálogo.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Etiquetas ─────────────────────────────────── */}
        <TabsContent value="tags" className="space-y-6 mt-8">
          <TagsManagement empresaId={currentCompanyId || ''} />
        </TabsContent>

        {/* ── Pipelines ─────────────────────────────────── */}
        <TabsContent value="pipelines" className="space-y-6 mt-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Funnel size={20} weight="duotone" className="text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Pipelines</h2>
                <p className="text-xs text-muted-foreground">Gestiona tus embudos de ventas y etapas</p>
              </div>
            </div>
            {isAdminOrOwner && (
              <Button onClick={() => setShowPipelineDialog(true)} className="rounded-xl shadow-sm gap-2">
                <Plus size={16} weight="bold" />
                Nuevo Pipeline
              </Button>
            )}
          </div>

          <div className="grid gap-4">
            {(pipelines || []).map(pipeline => (
              <Card key={pipeline.id} className="group border-none shadow-sm rounded-2xl hover:shadow-md transition-all overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-blue-500/5 to-transparent">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      {editingPipelineId === pipeline.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editPipelineName}
                            onChange={(e) => setEditPipelineName(e.target.value)}
                            className="h-8 w-64 rounded-lg"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleUpdatePipeline(pipeline.id)
                              if (e.key === 'Escape') setEditingPipelineId(null)
                            }}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg"
                            onClick={() => handleUpdatePipeline(pipeline.id)}
                          >
                            <Check size={16} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive rounded-lg"
                            onClick={() => setEditingPipelineId(null)}
                          >
                            <X size={16} />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                            <Funnel size={18} weight="duotone" className="text-blue-600" />
                          </div>
                          <div>
                            <CardTitle className="text-base font-bold">{pipeline.name}</CardTitle>
                            <Badge variant="outline" className="mt-1 text-[10px] uppercase tracking-wider font-bold rounded-md">{pipeline.type}</Badge>
                          </div>
                          {isAdminOrOwner && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
                              onClick={() => {
                                setEditingPipelineId(pipeline.id)
                                setEditPipelineName(pipeline.name)
                              }}
                            >
                              <Pencil size={14} />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Etapas</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {pipeline.stages.map(stage => (
                      <Badge
                        key={stage.id}
                        className="rounded-lg px-3 py-1 text-xs font-bold shadow-sm border-none"
                        style={{ backgroundColor: stage.color, color: 'white' }}
                      >
                        {stage.name}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {(pipelines || []).length === 0 && (
            <Card className="border-none shadow-sm rounded-2xl">
              <CardContent className="py-16">
                <div className="flex flex-col items-center justify-center text-center space-y-3 opacity-60">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                    <Funnel size={32} className="text-muted-foreground" weight="thin" />
                  </div>
                  <p className="font-bold text-lg">Sin pipelines</p>
                  <p className="text-sm text-muted-foreground">No hay pipelines configurados aún</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Roles (solo owner) ─────────────────────────────────── */}
        <TabsContent value="roles" className="space-y-6 mt-8">
          {userRole === 'owner' ? (
            <RolesManagement companyId={currentCompanyId || ''} />
          ) : (
            <Card className="border-none shadow-sm rounded-2xl">
              <CardContent className="py-16">
                <div className="flex flex-col items-center justify-center text-center space-y-3 opacity-60">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                    <ShieldCheck size={32} className="text-muted-foreground" weight="thin" />
                  </div>
                  <p className="font-bold text-lg">Sin permisos</p>
                  <p className="text-sm text-muted-foreground">Solo el propietario puede gestionar roles.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Automatizaciones ─────────────────────────────── */}
        <TabsContent value="automations" className="space-y-6 mt-8">
          {isAdminOrOwner && currentCompanyId ? (
            <AutomationsPanel
              empresaId={currentCompanyId}
              pipelines={pipelines || []}
            />
          ) : (
            <Card className="border-none shadow-sm rounded-2xl">
              <CardContent className="py-16">
                <div className="flex flex-col items-center justify-center text-center space-y-3 opacity-60">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                    <Lightning size={32} className="text-muted-foreground" weight="thin" />
                  </div>
                  <p className="font-bold text-lg">Sin permisos</p>
                  <p className="text-sm text-muted-foreground">No tienes permisos para gestionar automatizaciones.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Automatización IA ─────────────────────────────── */}
        <TabsContent value="ai-automation" className="space-y-6 mt-8">
          {isAdminOrOwner && currentCompanyId ? (
            <AiAutomationPanel
              empresaId={currentCompanyId}
              pipelines={pipelines || []}
            />
          ) : (
            <Card className="border-none shadow-sm rounded-2xl">
              <CardContent className="py-16">
                <div className="flex flex-col items-center justify-center text-center space-y-3 opacity-60">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-3xl">
                    🤖
                  </div>
                  <p className="font-bold text-lg">Sin permisos</p>
                  <p className="text-sm text-muted-foreground">No tienes permisos para gestionar automatizaciones IA.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── IDs ─────────────────────────────────── */}
        <TabsContent value="ids" className="space-y-6 mt-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <IdentificationBadge size={20} weight="duotone" className="text-purple-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold">IDs del Sistema</h2>
              <p className="text-xs text-muted-foreground">Usa estos IDs para configurar las variables de entorno del webhook.</p>
            </div>
          </div>
          <IDsViewer
            empresaId={currentCompanyId}
            empresaNombre={currentCompany?.name}
          />
        </TabsContent>
      </Tabs>

      <AddPipelineDialog
        open={showPipelineDialog}
        onClose={() => setShowPipelineDialog(false)}
        onAdd={handleAddPipeline}
        empresaId={currentCompanyId}
      />
    </div>
  )
}
