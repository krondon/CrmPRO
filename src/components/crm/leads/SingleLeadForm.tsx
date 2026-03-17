/**
 * SingleLeadForm - Formulario para creación manual de un lead
 * 
 * Extracted from AddLeadDialog.tsx for better separation of concerns.
 * Handles: name, email, phone, company, location, budget, priority, stage, assignedTo
 */

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MagnifyingGlass, User, X } from '@phosphor-icons/react'
import { TeamMember, Stage, EmpresaInstanciaDB, ContactDB } from '@/lib/types'
import { useTranslation } from '@/lib/i18n'
import { toast } from 'sonner'

// Maximum budget limit: 10 million dollars
const MAX_BUDGET = 10_000_000
const MAX_LOCATION_LENGTH = 120
const MAX_EVENT_LENGTH = 80
const MAX_MEMBERSHIP_LENGTH = 80

export interface SingleLeadFormData {
    name: string
    email: string
    phone: string
    company: string
    location: string
    evento: string
    membresia: string
    budget: number
    priority: 'low' | 'medium' | 'high'
    stageId: string
    assignedTo: string
    preferredInstanceId?: string
}

interface SingleLeadFormProps {
    stages: Stage[]
    eligibleMembers: TeamMember[]
    defaultStageId?: string
    defaultAssignedTo?: string
    onSubmit: (data: SingleLeadFormData) => void | Promise<void>
    isSubmitting?: boolean
    whatsappInstances?: Pick<EmpresaInstanciaDB, 'id' | 'label'>[]
    /** Contacto seleccionado para pre-llenar el formulario */
    selectedContact?: ContactDB | null
    /** Datos sugeridos desde la pestaña de pegado rápido */
    prefillData?: Partial<SingleLeadFormData> | null
    contactSearch?: string
    contactResults?: ContactDB[]
    isSearching?: boolean
    onContactSearchChange?: (val: string) => void
    onContactSelect?: (contact: ContactDB) => void
    onClearContact?: () => void
}

export function SingleLeadForm({
    stages,
    eligibleMembers,
    defaultStageId,
    defaultAssignedTo,
    onSubmit,
    isSubmitting = false,
    whatsappInstances = [],
    selectedContact,
    prefillData,
    contactSearch = '',
    contactResults = [],
    isSearching = false,
    onContactSearchChange,
    onContactSelect,
    onClearContact
}: SingleLeadFormProps) {
    const t = useTranslation('es')

    // Local state to track whether to show autocomplete dropdown
    const [showSuggestions, setShowSuggestions] = useState(false)

    // Form state
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [phone, setPhone] = useState('')
    const [company, setCompany] = useState('')
    const [location, setLocation] = useState('')
    const [evento, setEvento] = useState('')
    const [membresia, setMembresia] = useState('')
    const [budget, setBudget] = useState('')
    const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')
    const [stageId, setStageId] = useState(defaultStageId || stages[0]?.id || '')
    const [assignedTo, setAssignedTo] = useState(defaultAssignedTo || eligibleMembers[0]?.id || '')
    const [preferredInstanceId, setPreferredInstanceId] = useState<string | undefined>(
        whatsappInstances.length === 1 ? whatsappInstances[0].id : undefined
    )

    // Update defaults when they change
    useEffect(() => {
        if (defaultStageId) setStageId(defaultStageId)
    }, [defaultStageId])

    useEffect(() => {
        if (defaultAssignedTo) setAssignedTo(defaultAssignedTo)
    }, [defaultAssignedTo])

    // Pre-fill form when a contact is selected
    useEffect(() => {
        if (selectedContact) {
            setName(selectedContact.nombre || '')
            setEmail(selectedContact.email || '')
            setPhone(selectedContact.telefono || '')
            setCompany(selectedContact.empresa_nombre || '')
            setLocation(selectedContact.ubicacion || '')
        }
    }, [selectedContact])

    // Apply values parsed from quick paste tab
    useEffect(() => {
        if (!prefillData) return

        if (typeof prefillData.name === 'string') setName(prefillData.name)
        if (typeof prefillData.email === 'string') setEmail(prefillData.email)
        if (typeof prefillData.phone === 'string') setPhone(prefillData.phone)
        if (typeof prefillData.company === 'string') setCompany(prefillData.company)
        if (typeof prefillData.location === 'string') setLocation(prefillData.location)
        if (typeof prefillData.evento === 'string') setEvento(prefillData.evento)
        if (typeof prefillData.membresia === 'string') setMembresia(prefillData.membresia)
        if (typeof prefillData.budget === 'number' && prefillData.budget >= 0) {
            setBudget(String(prefillData.budget))
        }
        if (prefillData.priority) setPriority(prefillData.priority)
        if (prefillData.stageId) setStageId(prefillData.stageId)
        if (prefillData.assignedTo) setAssignedTo(prefillData.assignedTo)
    }, [prefillData])

    const handleSubmit = async () => {
        if (!name.trim()) {
            toast.error('El nombre es requerido')
            return
        }

        if (location.trim().length > MAX_LOCATION_LENGTH) {
            toast.error(`Ubicación no puede superar ${MAX_LOCATION_LENGTH} caracteres`)
            return
        }

        if (evento.trim().length > MAX_EVENT_LENGTH) {
            toast.error(`Evento no puede superar ${MAX_EVENT_LENGTH} caracteres`)
            return
        }

        if (membresia.trim().length > MAX_MEMBERSHIP_LENGTH) {
            toast.error(`Membresía no puede superar ${MAX_MEMBERSHIP_LENGTH} caracteres`)
            return
        }

        const budgetValue = parseFloat(budget) || 0

        await onSubmit({
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim(),
            company: company.trim(),
            location: location.trim(),
            evento: evento.trim(),
            membresia: membresia.trim(),
            budget: budgetValue,
            priority,
            stageId,
            assignedTo,
            preferredInstanceId
        })

        // Reset form after successful submit
        setName('')
        setEmail('')
        setPhone('')
        setCompany('')
        setLocation('')
        setEvento('')
        setMembresia('')
        setBudget('')
        setPriority('medium')
    }

    const handleBudgetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value)
        if (val < 0 || val > MAX_BUDGET) {
            toast.error(`El presupuesto no puede superar $${MAX_BUDGET.toLocaleString()}`)
            return
        }
        setBudget(e.target.value)
    }

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        // Only allow numbers and phone characters, max 15 chars
        if (val.length <= 15 && !/[a-zA-Z]/.test(val)) {
            setPhone(val)
        }
    }

    return (
        <div className="space-y-4">
            {/* WhatsApp Instance Selector (solo si hay instancias disponibles) */}
            {whatsappInstances.length > 0 && (
                <div>
                    <Label htmlFor="lead-wa-instance">Instancia WhatsApp (opcional)</Label>
                    <Select
                        value={preferredInstanceId || ''}
                        onValueChange={(v) => setPreferredInstanceId(v)}
                    >
                        <SelectTrigger id="lead-wa-instance">
                            <SelectValue placeholder={
                                whatsappInstances.length === 1 ? 'Única instancia disponible' : 'Selecciona una instancia'
                            } />
                        </SelectTrigger>
                        <SelectContent>
                            {whatsappInstances.map(inst => (
                                <SelectItem key={inst.id} value={inst.id}>{inst.label || 'WhatsApp'}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}
            {/* Name - Required */}
            <div className="relative z-10">
                <div className="flex justify-between items-center mb-1">
                    <Label htmlFor="lead-name">{t.lead.name} *</Label>
                    {selectedContact && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded flex items-center gap-1 font-medium">
                            <span className="h-4 w-4 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                                <User size={10} weight="bold" />
                            </span>
                            Contacto vinculado
                            {onClearContact && (
                                <button type="button" onClick={() => {
                                    setName('')
                                    setEmail('')
                                    setPhone('')
                                    setCompany('')
                                    setLocation('')
                                    onClearContact()
                                }} className="ml-1 hover:text-destructive transition-colors">
                                    <X size={12} weight="bold" />
                                </button>
                            )}
                        </span>
                    )}
                </div>
                <div className="relative">
                    <Input
                        id="lead-name"
                        value={name}
                        onChange={(e) => {
                            const val = e.target.value
                            if (val.length <= 30) {
                                setName(val)
                                if (onContactSearchChange) {
                                    onContactSearchChange(val)
                                    setShowSuggestions(true)
                                }
                            }
                        }}
                        onFocus={() => {
                            if (name && onContactSearchChange) {
                                onContactSearchChange(name)
                                setShowSuggestions(true)
                            }
                        }}
                        onBlur={() => {
                            // Delay hiding to allow clicks on suggestions
                            setTimeout(() => setShowSuggestions(false), 200)
                        }}
                        placeholder="Nombre de la oportunidad"
                        autoComplete="off"
                        className={selectedContact ? "border-primary/50 bg-primary/5" : ""}
                    />
                    
                    {/* Autocomplete Dropdown */}
                    {showSuggestions && (isSearching || contactResults.length > 0) && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-md shadow-md max-h-48 overflow-y-auto z-50">
                            {isSearching ? (
                                <div className="p-3 text-sm text-muted-foreground text-center flex items-center justify-center gap-2">
                                    <MagnifyingGlass size={16} className="animate-spin" /> Buscando...
                                </div>
                            ) : (
                                <div>
                                    {contactResults.map((c) => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => {
                                                if (onContactSelect) onContactSelect(c)
                                                setShowSuggestions(false)
                                            }}
                                            className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted transition-colors border-b border-border/50 last:border-0"
                                        >
                                            <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold text-xs shrink-0">
                                                {(c.nombre || '?')[0].toUpperCase()}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-medium text-sm truncate">{c.nombre}</p>
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {[c.email, c.telefono, c.empresa_nombre].filter(Boolean).join(' • ')}
                                                </p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Email */}
            <div>
                <Label htmlFor="lead-email">{t.lead.email}</Label>
                <Input
                    id="lead-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="juan@empresa.com"
                />
            </div>

            {/* Phone */}
            <div>
                <Label htmlFor="lead-phone">{t.lead.phone}</Label>
                <Input
                    id="lead-phone"
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="+1 (555) 000-0000"
                />
            </div>

            {/* Company */}
            <div>
                <Label htmlFor="lead-company">{t.lead.company}</Label>
                <Input
                    id="lead-company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Nombre de la empresa"
                />
            </div>

            {/* Location */}
            <div>
                <Label htmlFor="lead-location">Ubicación</Label>
                <Input
                    id="lead-location"
                    value={location}
                    onChange={(e) => {
                        if (e.target.value.length <= MAX_LOCATION_LENGTH) {
                            setLocation(e.target.value)
                        }
                    }}
                    maxLength={MAX_LOCATION_LENGTH}
                    placeholder="Ej. Ciudad, País o Dirección"
                />
            </div>

            {/* Budget */}
            <div>
                <Label htmlFor="lead-budget">{t.lead.budget}</Label>
                <Input
                    id="lead-budget"
                    type="number"
                    min="0"
                    value={budget}
                    onChange={handleBudgetChange}
                    max={MAX_BUDGET}
                    placeholder="10000"
                />
            </div>

            <div>
                <Label htmlFor="lead-evento">Evento</Label>
                <Input
                    id="lead-evento"
                    value={evento}
                    onChange={(e) => {
                        if (e.target.value.length <= MAX_EVENT_LENGTH) {
                            setEvento(e.target.value)
                        }
                    }}
                    maxLength={MAX_EVENT_LENGTH}
                    placeholder="Ej. Expo 2026"
                />
            </div>

            <div>
                <Label htmlFor="lead-membresia">Membresía</Label>
                <Input
                    id="lead-membresia"
                    value={membresia}
                    onChange={(e) => {
                        if (e.target.value.length <= MAX_MEMBERSHIP_LENGTH) {
                            setMembresia(e.target.value)
                        }
                    }}
                    maxLength={MAX_MEMBERSHIP_LENGTH}
                    placeholder="Ej. Gold"
                />
            </div>

            {/* Stage - only show if stages exist */}
            {stages.length > 0 && (
                <div>
                    <Label htmlFor="lead-stage">{t.stage.name}</Label>
                    <Select value={stageId} onValueChange={setStageId}>
                        <SelectTrigger id="lead-stage">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {stages.map(stage => (
                                <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}

            {/* Priority */}
            <div>
                <Label htmlFor="lead-priority">{t.lead.priority}</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                    <SelectTrigger id="lead-priority">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="low">{t.lead.lowPriority}</SelectItem>
                        <SelectItem value="medium">{t.lead.mediumPriority}</SelectItem>
                        <SelectItem value="high">{t.lead.highPriority}</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Assigned To */}
            <div>
                <Label htmlFor="lead-assigned">{t.lead.assignTo} *</Label>
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                    <SelectTrigger id="lead-assigned">
                        <SelectValue placeholder="Seleccionar miembro" />
                    </SelectTrigger>
                    <SelectContent>
                        {eligibleMembers.map(member => (
                            <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
                        ))}
                        <SelectItem value="todos">Todos</SelectItem>
                        {eligibleMembers.length === 0 && (
                            <SelectItem value="none" disabled>Sin miembros disponibles</SelectItem>
                        )}
                    </SelectContent>
                </Select>
            </div>

            {/* Submit Button */}
            <Button onClick={handleSubmit} className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando...' : t.buttons.add}
            </Button>
        </div>
    )
}
