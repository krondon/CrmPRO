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
import { TeamMember, Stage, EmpresaInstanciaDB, ContactDB } from '@/lib/types'
import { useTranslation } from '@/lib/i18n'
import { toast } from 'sonner'

// Maximum budget limit: 10 million dollars
const MAX_BUDGET = 10_000_000

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
}

export function SingleLeadForm({
    stages,
    eligibleMembers,
    defaultStageId,
    defaultAssignedTo,
    onSubmit,
    isSubmitting = false,
    whatsappInstances = [],
    selectedContact
}: SingleLeadFormProps) {
    const t = useTranslation('es')

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

    const handleSubmit = async () => {
        if (!name.trim()) {
            toast.error('El nombre es requerido')
            return
        }

        if (evento.trim().length > 80) {
            toast.error('Evento no puede superar 80 caracteres')
            return
        }

        if (membresia.trim().length > 80) {
            toast.error('Membresía no puede superar 80 caracteres')
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
            <div>
                <Label htmlFor="lead-name">{t.lead.name} *</Label>
                <Input
                    id="lead-name"
                    value={name}
                    onChange={(e) => {
                        if (e.target.value.length <= 30) setName(e.target.value)
                    }}
                    placeholder="Nombre de la oportunidad"
                />
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
                    onChange={(e) => setLocation(e.target.value)}
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
                    onChange={(e) => setEvento(e.target.value)}
                    maxLength={80}
                    placeholder="Ej. Expo 2026"
                />
            </div>

            <div>
                <Label htmlFor="lead-membresia">Membresía</Label>
                <Input
                    id="lead-membresia"
                    value={membresia}
                    onChange={(e) => setMembresia(e.target.value)}
                    maxLength={80}
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
