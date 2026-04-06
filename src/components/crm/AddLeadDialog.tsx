/**
 * AddLeadDialog - Dialog for creating leads manually or importing from Excel/PDF
 * 
 * REFACTORED: Reduced from 1,411 lines → ~280 lines by extracting:
 * - SingleLeadForm: Manual lead creation form
 * - BulkImportView: Excel/PDF import with useExcelImport hook
 */

import { useEffect, useState, useMemo, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Plus, MagnifyingGlass, User, X } from '@phosphor-icons/react'
import { Lead, PipelineType, Stage, TeamMember, ContactDB } from '@/lib/types'
import { useTranslation } from '@/lib/i18n'
import { toast } from 'sonner'
import { Company } from './CompanyManagement'
import { usePersistentState } from '@/hooks/usePersistentState'
import { createLead, createLeadsBulk } from '@/supabase/services/leads'
import { getContacts } from '@/supabase/services/contacts'
import { SingleLeadForm, BulkImportView } from './leads'
import { listWhatsappInstancias } from '@/supabase/services/instances'
import { getNextAssignee } from '@/supabase/helpers/pipeline'
import type { EmpresaInstanciaDB } from '@/lib/types'
import type { SingleLeadFormData } from './leads/SingleLeadForm'
import type { PreviewRow } from '@/hooks/useExcelImport'

interface User {
  id: string
  email: string
  businessName: string
}

interface AddLeadDialogProps {
  pipelineType: PipelineType
  pipelineId?: string
  stages: Stage[]
  teamMembers: TeamMember[]
  onAdd: (lead: Lead) => void
  onImport?: (leads: Lead[]) => void
  trigger?: React.ReactNode
  defaultStageId?: string
  companies?: Company[]
  currentUser?: User | null
  companyName?: string
  companyId?: string
  assignmentType?: import('@/lib/types').AssignmentType
}

// Max budget limit
const MAX_BUDGET = 10_000_000
const MAX_NAME_LENGTH = 30
const MAX_LOCATION_LENGTH = 120
const MAX_EVENT_LENGTH = 80
const MAX_MEMBERSHIP_LENGTH = 80

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function clampText(value: string, maxLength: number) {
  return value.trim().slice(0, maxLength)
}

function normalizeBudget(value: string) {
  const cleaned = value.replace(/[^0-9.,]/g, '').replace(/\./g, '').replace(',', '.')
  const parsed = Number(cleaned)
  if (Number.isNaN(parsed)) return 0
  return Math.max(0, Math.min(parsed, MAX_BUDGET))
}

function cleanCandidateText(value: string) {
  return value
    .replace(/^[-*\u2022\s]+/, '')
    .replace(/[\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function AddLeadDialog({
  pipelineType,
  pipelineId,
  stages,
  teamMembers,
  onAdd,
  onImport,
  trigger,
  defaultStageId,
  currentUser,
  companyName,
  companyId,
  assignmentType
}: AddLeadDialogProps) {
  const t = useTranslation('es')
  const [open, setOpen] = useState(false)
  const [localUser] = usePersistentState<User | null>('current-user', null)
  const effectiveUser = currentUser || localUser

  const [activeTab, setActiveTab] = useState('manual')
  const [pasteText, setPasteText] = useState('')
  const [manualPrefill, setManualPrefill] = useState<Partial<SingleLeadFormData> | null>(null)
  const [stageId, setStageId] = useState(defaultStageId || stages[0]?.id || '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [waInstances, setWaInstances] = useState<Pick<EmpresaInstanciaDB, 'id' | 'label'>[]>([])

  // Contact search state
  const [contactSearch, setContactSearch] = useState('')
  const [contactResults, setContactResults] = useState<ContactDB[]>([])
  const [selectedContact, setSelectedContact] = useState<ContactDB | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [showContactPicker, setShowContactPicker] = useState(false)

  // Cargar instancias WA activas de la empresa
  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        if (!companyId) return
        const list = await listWhatsappInstancias(companyId)
        if (mounted) {
          setWaInstances(list.map(i => ({ id: i.id, label: i.label || 'WhatsApp' })))
        }
      } catch (e) {
        console.warn('[AddLeadDialog] No se pudieron cargar instancias WA', e)
      }
    }
    load()
    return () => { mounted = false }
  }, [companyId])

  // Debounced contact search
  useEffect(() => {
    if (!contactSearch.trim() || !companyId) {
      setContactResults([])
      return
    }
    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const res = await getContacts({ companyId, search: contactSearch.trim(), limit: 8 })
        setContactResults(res.data)
      } catch (e) {
        console.warn('[AddLeadDialog] Error buscando contactos', e)
      } finally {
        setIsSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [contactSearch, companyId])

  // Eligible team members for this pipeline
  const eligibleMembers = useMemo(() => {
    const filtered = teamMembers.filter(m => {
      const ps = m.pipelines || []
      if (ps.length === 0) return false
      if (pipelineId && ps.includes(pipelineId)) return true
      if (ps.includes(pipelineType)) return true
      if (companyName && ps.includes(companyName)) return true
      return false
    })
    if (effectiveUser) {
      const labelBase = companyName || effectiveUser.businessName || effectiveUser.email || 'Yo'
      const userAsMember: TeamMember = {
        id: effectiveUser.id,
        name: `${labelBase} (Yo)`,
        email: effectiveUser.email,
        avatar: '',
        role: 'self',
        pipelines: [],
        permissionRole: 'viewer'
      }
      const withoutUser = filtered.filter(m => m.id !== effectiveUser.id)
      return [userAsMember, ...withoutUser]
    }
    return filtered
  }, [teamMembers, pipelineType, effectiveUser, companyName, pipelineId])

  // Update stageId when defaultStageId changes
  useEffect(() => {
    setStageId(defaultStageId || stages[0]?.id || '')
  }, [defaultStageId, stages])

  // Handle manual form submission
  const handleManualSubmit = useCallback(async (data: SingleLeadFormData) => {
    if (!pipelineId && !companyId) {
      toast.error('No se pudo identificar el pipeline o empresa')
      return
    }

    setIsSubmitting(true)
    try {
      // Generar email dummy si no existe (para cumplir con restricción NOT NULL de DB)

      const actorNombre = effectiveUser?.businessName || (effectiveUser as any)?.nombre || effectiveUser?.email

      const NIL_UUID = '00000000-0000-0000-0000-000000000000'
      let finalAssignedTo = data.assignedTo === 'todos' ? NIL_UUID : data.assignedTo
      // ==== AUTO-ASIGNACIÓN (Round Robin / Random) ====
      // Si no se asignó manualmente, verificar si el pipeline tiene auto-asignación
      if (pipelineId && (!finalAssignedTo || finalAssignedTo === NIL_UUID)) {
        try {
          const assignee = await getNextAssignee(pipelineId)
          if (assignee) {
            finalAssignedTo = assignee.personaId
            console.log('[AddLeadDialog] Auto-asignado a:', assignee.personaId)
          }
        } catch (err: any) {
          console.warn('[AddLeadDialog] Error en auto-asignación:', err)
        }
      }

      const dbLead = await createLead({
        nombre_completo: data.name,
        correo_electronico: data.email?.trim() || undefined,
        telefono: data.phone || undefined,
        empresa: data.company || undefined,
        ubicacion: data.location || undefined,
        evento: data.evento || undefined,
        membresia: data.membresia || undefined,
        presupuesto: data.budget,
        etapa_id: data.stageId,
        pipeline_id: pipelineId || '',
        empresa_id: companyId || '',
        asignado_a: finalAssignedTo,
        prioridad: data.priority,
        preferred_instance_id: data.preferredInstanceId || null
      }, effectiveUser?.id, actorNombre)

      if (dbLead) {
        // Notificar asignación si corresponde
        const assignedId = finalAssignedTo
        if (assignedId && assignedId !== NIL_UUID) {
          const recipient = teamMembers?.find(m => m.id === assignedId || m.userId === assignedId)
          if (recipient?.email) {
            try {
              await import('@/lib/supabase').then(({ supabase }) => {
                supabase.functions.invoke('send-lead-assigned', {
                  body: {
                    leadId: dbLead.id,
                    leadName: dbLead.nombre_completo,
                    empresaId: companyId,
                    empresaNombre: companyName,
                    assignedUserId: recipient.userId || assignedId,
                    assignedUserEmail: recipient.email,
                    assignedByEmail: effectiveUser?.email,
                    assignedByNombre: actorNombre
                  }
                }).catch(e => console.error('[AddLeadDialog] Error en bg notification:', e))
              })
            } catch (e) {
              console.error('[AddLeadDialog] Error enviando notificación de asignación', e)
            }
          }
        }

        const newLead: Lead = {
          id: dbLead.id,
          name: dbLead.nombre_completo || '',
          email: dbLead.correo_electronico || '',
          phone: dbLead.telefono || '',
          company: dbLead.empresa || '',
          location: dbLead.ubicacion || '',
          evento: dbLead.evento || '',
          membresia: dbLead.membresia || '',
          budget: dbLead.presupuesto || 0,
          stage: dbLead.etapa_id || '',
          pipeline: dbLead.pipeline_id || pipelineType,
          priority: dbLead.prioridad as 'low' | 'medium' | 'high',
          assignedTo: dbLead.asignado_a || '',
          tags: [],
          createdAt: new Date(dbLead.created_at),
          lastContact: new Date(dbLead.created_at)
        }
        onAdd(newLead)
        toast.success('Oportunidad creada exitosamente')
        setOpen(false)
      }
    } catch (err) {
      console.error('Error creating lead:', err)
      const message = err instanceof Error ? err.message : 'Error al crear la oportunidad'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }, [pipelineId, companyId, pipelineType, onAdd, t])

  // Handle bulk import
  const handleBulkImport = useCallback(async (validRows: PreviewRow[]) => {
    if (!pipelineId || !companyId || !stageId) {
      toast.error('Faltan datos del pipeline o etapa')
      return
    }

    const batchLeads = validRows.map((row, index) => ({
      nombre_completo: row.nombre_completo || '',
      telefono: row.telefono,
      correo_electronico: row.correo_electronico || undefined,
      empresa: row.empresa,
      ubicacion: row.ubicacion,
      presupuesto: row.presupuesto,
      empresa_id: companyId,
      pipeline_id: pipelineId,
      etapa_id: stageId,
      asignado_a: '00000000-0000-0000-0000-000000000000',
      prioridad: 'medium' as const
    }))

    const actorNombre = effectiveUser?.businessName || (effectiveUser as any)?.nombre || effectiveUser?.email
    const result = await createLeadsBulk(batchLeads, effectiveUser?.id, actorNombre)

    if (result && Array.isArray(result)) {
      const importedLeads: Lead[] = result.map(r => ({
        id: r.id,
        name: r.nombre_completo || '',
        email: r.correo_electronico || '',
        phone: r.telefono || '',
        company: r.empresa || '',
        location: r.ubicacion || '',
        budget: r.presupuesto || 0,
        stage: r.etapa_id || stageId,
        pipeline: r.pipeline_id || pipelineId || pipelineType,
        priority: (r.prioridad as 'low' | 'medium' | 'high') || 'medium',
        assignedTo: r.asignado_a || '',
        tags: [],
        createdAt: r.created_at ? new Date(r.created_at) : new Date(),
        lastContact: r.created_at ? new Date(r.created_at) : new Date()
      }))

      onImport?.(importedLeads)
      importedLeads.forEach(lead => onAdd(lead))

      setOpen(false)
    }
  }, [pipelineId, companyId, stageId, pipelineType, onAdd, onImport])

  // Handle quick-paste processing with flexible parsing and field sanitization
  const processPasteText = useCallback(() => {
    if (!pasteText.trim()) return

    const lines = pasteText.split('\n')
    let name = '', email = '', phone = '', company = '', budget = '', location = '', evento = '', membresia = ''
    const unlabeledCandidates: string[] = []

    const collectUnlabeled = (raw: string) => {
      const part = cleanCandidateText(raw)
      if (!part) return

      if (!email && part.includes('@')) {
        const emailMatch = part.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
        if (emailMatch) email = emailMatch[0]
      }

      if (!phone) {
        const phoneMatch = part.match(/(?:\+?\d[\d\s().-]{6,}\d)/)
        if (phoneMatch) phone = phoneMatch[0].trim()
      }

      if (!budget && /(\$|usd|cop|eur|mxn|ars|clp|presupuesto|costo|coste|precio|monto|budget|valor)/i.test(part)) {
        const budgetMatch = part.match(/\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+/)
        if (budgetMatch) budget = budgetMatch[0]
      }

      if (!location && /(ubicacion|ubicación|location|ciudad|direccion|dirección|pais|país|zona)/i.test(part)) {
        location = part.replace(/^(ubicacion|ubicación|location|ciudad|direccion|dirección|pais|país|zona)\s*[:=\-–]?\s*/i, '').trim()
      }

      if (!evento && /(evento|event)/i.test(part)) {
        evento = part.replace(/^(evento|event)\s*[:=\-–]?\s*/i, '').trim()
      }

      if (!membresia && /(membresia|membresía|menbresia|membership|plan|paquete|gold|silver|premium|pro|basic|platinum)/i.test(part)) {
        membresia = part.replace(/^(membresia|membresía|menbresia|membership|plan|paquete)\s*[:=\-–]?\s*/i, '').trim()
      }

      if (
        !part.includes('@') &&
        part.length >= 2 &&
        part.length <= 100
      ) {
        unlabeledCandidates.push(part)
      }
    }

    lines.forEach(line => {
      const trimmed = line.trim()
      if (!trimmed) return

      const kvMatch = trimmed.match(/^([^:=\-–]+?)\s*[:=\-–]\s*(.+)$/)
      if (kvMatch) {
        const keyLower = normalizeText(kvMatch[1])
        const value = kvMatch[2].trim()

        if (['cliente', 'nombre', 'name', 'lead', 'oportunidad'].some(k => keyLower.includes(k))) {
          name = value.replace(/[\[\]]/g, '')
        } else if (['email', 'correo', 'mail'].some(k => keyLower.includes(k))) {
          email = value
        } else if (['telefono', 'phone', 'cel', 'movil', 'whatsapp', 'wa'].some(k => keyLower.includes(k))) {
          phone = value
        } else if (['empresa', 'company', 'compania', 'negocio'].some(k => keyLower.includes(k))) {
          company = value
        } else if (['presupuesto', 'costo', 'coste', 'precio', 'monto', 'budget', 'valor'].some(k => keyLower.includes(k))) {
          budget = value
        } else if (['ubicacion', 'location', 'ciudad', 'direccion', 'pais', 'zona'].some(k => keyLower.includes(k))) {
          location = value
        } else if (['evento', 'event'].some(k => keyLower.includes(k))) {
          evento = value
        } else if (['membresia', 'menbresia', 'membership', 'plan', 'paquete'].some(k => keyLower.includes(k))) {
          membresia = value
        }
        return
      }

      const parts = trimmed.split(/[;,|]/).map(p => p.trim()).filter(Boolean)
      if (parts.length > 1) {
        parts.forEach(collectUnlabeled)
      } else {
        collectUnlabeled(trimmed)
      }
    })

    const collapsedText = pasteText.replace(/\s+/g, ' ').trim()
    if (!name) {
      const nameMatch = collapsedText.match(/(?:cliente|nombre|lead|oportunidad)\s*[:=\-–]\s*([^,;\n]+)/i)
      if (nameMatch) name = nameMatch[1].trim()
    }
    if (!location) {
      const locationMatch = collapsedText.match(/(?:ubicacion|ubicación|location|ciudad|direccion|dirección|pais|país)\s*[:=\-–]\s*([^,;\n]+)/i)
      if (locationMatch) location = locationMatch[1].trim()
    }
    if (!evento) {
      const eventMatch = collapsedText.match(/(?:evento|event)\s*[:=\-–]\s*([^,;\n]+)/i)
      if (eventMatch) evento = eventMatch[1].trim()
    }
    if (!membresia) {
      const membershipMatch = collapsedText.match(/(?:membresia|membresía|menbresia|membership|plan|paquete)\s*[:=\-–]\s*([^,;\n]+)/i)
      if (membershipMatch) membresia = membershipMatch[1].trim()
    }

    const uniqueCandidates = unlabeledCandidates.filter((value, index, arr) => (
      arr.findIndex(v => normalizeText(v) === normalizeText(value)) === index
    ))

    const companyHints = /(company|compania|compañia|corp|inc|llc|ltd|sas|s\.a\.?|group|tech|studio|agency|solutions|consulting|enterprise|enterprises|digital|labs)/i
    const membershipHints = /(gold|silver|premium|platinum|basic|pro)/i

    if (!name) {
      const likelyName = uniqueCandidates.find(c => {
        const wordCount = c.split(/\s+/).filter(Boolean).length
        return wordCount <= 4 && c.length <= MAX_NAME_LENGTH && !companyHints.test(c) && !membershipHints.test(c) && !/\d/.test(c)
      })
      if (likelyName) name = likelyName
    }

    if (!company) {
      const likelyCompany = uniqueCandidates.find(c => c !== name && companyHints.test(c))
        || uniqueCandidates.find(c => c !== name && c.split(/\s+/).length >= 2)
      if (likelyCompany) company = likelyCompany
    }

    if (!location) {
      const likelyLocation = uniqueCandidates.find(c => c !== name && c !== company && /,/.test(c) && !/\d{4,}/.test(c))
      if (likelyLocation) location = likelyLocation
    }

    const normalizedPrefill = {
      name: clampText(name, MAX_NAME_LENGTH),
      email: email.trim(),
      phone: phone.trim(),
      company: company.trim(),
      location: clampText(location, MAX_LOCATION_LENGTH),
      evento: clampText(evento, MAX_EVENT_LENGTH),
      membresia: clampText(membresia, MAX_MEMBERSHIP_LENGTH),
      budget: normalizeBudget(budget)
    }

    setManualPrefill(normalizedPrefill)

    toast.info(`Detectado: ${normalizedPrefill.name || 'Sin nombre'}, ${normalizedPrefill.email || 'Sin email'}. Datos cargados en formulario manual.`)
    setActiveTab('manual')
    setPasteText('')
  }, [pasteText])

  const resetForm = () => {
    setActiveTab('manual')
    setPasteText('')
    setContactSearch('')
    setContactResults([])
    setSelectedContact(null)
    setManualPrefill(null)
    setShowContactPicker(false)
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen)
      if (!isOpen) resetForm()
    }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            size="sm"
            className="h-9 px-4 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm hover:shadow-md transition-all font-medium"
          >
            <Plus size={16} className="mr-1.5" weight="bold" />
            <span className="text-sm">{t.pipeline.addLead}</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className={`max-h-[90vh] overflow-y-auto transition-all duration-300 ${activeTab === 'excel' ? 'max-w-[95vw] md:max-w-5xl lg:max-w-6xl' : 'max-w-md sm:max-w-xl md:max-w-2xl'
        }`}>
        <DialogHeader>
          <DialogTitle>{t.pipeline.addLead}</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="manual">Manual</TabsTrigger>
            <TabsTrigger value="paste">Pegar Rápido</TabsTrigger>
            <TabsTrigger value="excel">Importar Excel</TabsTrigger>
          </TabsList>

          {/* Manual Tab - Uses SingleLeadForm */}
          <TabsContent value="manual">
            <SingleLeadForm
              stages={stages}
              eligibleMembers={eligibleMembers}
              defaultStageId={stageId}
              defaultAssignedTo={eligibleMembers[0]?.id}
              onSubmit={handleManualSubmit}
              isSubmitting={isSubmitting}
              whatsappInstances={waInstances}
              selectedContact={selectedContact}
              prefillData={manualPrefill}
              contactSearch={contactSearch}
              contactResults={contactResults}
              isSearching={isSearching}
              onContactSearchChange={setContactSearch}
              onContactSelect={(c) => {
                setSelectedContact(c)
                setContactSearch('')
                setContactResults([])
              }}
              onClearContact={() => setSelectedContact(null)}
              assignmentType={assignmentType}
            />
          </TabsContent>

          {/* Paste Tab */}
          <TabsContent value="paste" className="space-y-4">
            <div className="space-y-2">
              <Label>Instrucciones:</Label>
              <p className="text-sm text-muted-foreground">
                Copia los datos de tu cliente (WhatsApp, Email) y pégalos abajo.
                El sistema intentará identificar automáticamente los campos.
              </p>
            </div>
            <Textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={` 
Nombre: [Nombre del Cliente]
correo: email@cliente.com
telefono: +123456789
Venta: 100
empresa: Nombre de la Empresa
ubicación: Caracas
evento: Expo 2024
membresia: Oro

                            ...`}
              className="min-h-[200px] font-mono text-sm"
            />
            <Button onClick={processPasteText} className="w-full">
              Procesar y Verificar
            </Button>
          </TabsContent>

          {/* Excel Import Tab - Uses BulkImportView */}
          <TabsContent value="excel" className="h-full">
            <BulkImportView
              stages={stages}
              companyId={companyId}
              stageId={stageId}
              onStageChange={setStageId}
              onImport={handleBulkImport}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
