/**
 * OverviewTab Component
 * 
 * Muestra información general del lead: asignación, presupuesto,
 * fechas y actividad reciente.
 * Extraído de LeadDetailSheet para mantener el código organizado.
 */

import { useEffect, useState } from 'react'
import { Lead, Message, Channel, TeamMember, EmpresaInstanciaDB, CustomFieldDefinition } from '@/lib/types'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { InlineEdit } from '../InlineEdit'
import { safeFormatDate } from '@/hooks/useDateFormat'
import { getEtapas } from '@/supabase/services/etapas'
import type { EtapaDB } from '@/lib/types'
import {
    WhatsappLogo,
    TelegramLogo,
    InstagramLogo,
    FacebookLogo,
    EnvelopeSimple,
    Phone,
    DeviceMobile,
    User as UserIcon,
    CurrencyDollar,
    CalendarBlank,
    Star,
    Crown,
    IdentificationBadge,
    Clock,
    ChatCircleDots,
    Tag as TagIcon,
    MapPin,
    Timer,
    Funnel
} from '@phosphor-icons/react'

import { HistoryTab } from './HistoryTab'

interface User {
    id: string
    email: string
    businessName: string
}

interface OverviewTabProps {
    lead: Lead
    teamMembers: TeamMember[]
    currentUser?: User | null
    assignedTo: string | null
    onUpdateAssignedTo: (value: string) => void
    onUpdateField: (field: keyof Lead, value: string | number) => void
    onUpdateCustomField?: (key: string, value: any) => void
    customFieldDefs?: CustomFieldDefinition[]
    recentMessages: Message[]
    canEdit: boolean
    maxBudget: number
    instances?: EmpresaInstanciaDB[]
    translations: {
        assignedTo: string
        budget: string
        createdAt: string
        lastContact: string
    }
}

// Iconos de canal
const channelIcons = {
    whatsapp: WhatsappLogo,
    telegram: TelegramLogo,
    instagram: InstagramLogo,
    facebook: FacebookLogo,
    email: EnvelopeSimple,
    phone: Phone
}

function getChannelIcon(channel: Channel) {
    return channelIcons[channel] || EnvelopeSimple
}

const platformIcons: Record<string, React.ElementType> = {
    whatsapp: WhatsappLogo,
    instagram: InstagramLogo,
    facebook: FacebookLogo,
    telegram: TelegramLogo,
    email: EnvelopeSimple,
    phone: Phone,
}

export function OverviewTab({
    lead,
    teamMembers,
    currentUser,
    assignedTo,
    onUpdateAssignedTo,
    onUpdateField,
    onUpdateCustomField,
    customFieldDefs = [],
    recentMessages,
    canEdit,
    maxBudget,
    instances = [],
    translations: t
}: OverviewTabProps) {
    const preferredInstance = instances.find(i => i.id === lead.preferred_instance_id) || null
    const PlatformIcon = preferredInstance ? (platformIcons[preferredInstance.plataforma] || DeviceMobile) : null

    const [stages, setStages] = useState<EtapaDB[]>([])
    const pipelineId = (lead.pipeline as string) || ''

    useEffect(() => {
        let mounted = true
        if (!pipelineId) {
            setStages([])
            return
        }
        getEtapas(pipelineId)
            .then(list => {
                if (!mounted) return
                const sorted = [...list].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
                setStages(sorted)
            })
            .catch(err => {
                console.error('[OverviewTab] error loading stages', err)
                if (mounted) setStages([])
            })
        return () => { mounted = false }
    }, [pipelineId])

    const currentStage = stages.find(s => s.id === lead.stage)

    return (
        <div className="flex-1 px-6 sm:px-8 py-6 sm:py-8 space-y-8 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-6">
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-muted-foreground/60 transition-colors group-hover:text-primary/70">
                        <IdentificationBadge size={14} weight="bold" />
                        <Label className="text-[10px] uppercase font-black tracking-widest">{t.assignedTo}</Label>
                    </div>
                    <div className="relative group/select">
                        <Select value={assignedTo || 'todos'} onValueChange={onUpdateAssignedTo} disabled={!canEdit}>
                            <SelectTrigger className="w-full h-11 bg-background border-border/40 hover:border-primary/30 transition-all rounded-xl shadow-sm pl-4">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-border/40 shadow-xl">
                                <SelectItem value="todos" className="text-sm font-medium">Todos</SelectItem>
                                {currentUser && (
                                    <SelectItem value={currentUser.id} className="text-sm font-medium">
                                        {`${currentUser.businessName || currentUser.email || 'Yo'} (Yo)`}
                                    </SelectItem>
                                )}
                                {teamMembers.map(m => (
                                    <SelectItem key={m.id} value={m.id} className="text-sm font-medium">{m.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-muted-foreground/60">
                        <Funnel size={14} weight="bold" />
                        <Label className="text-[10px] uppercase font-black tracking-widest">Etapa</Label>
                    </div>
                    <Select
                        value={lead.stage || ''}
                        onValueChange={(value) => onUpdateField('stage' as keyof Lead, value)}
                        disabled={!canEdit || stages.length === 0}
                    >
                        <SelectTrigger className="w-full h-11 bg-background border-border/40 hover:border-primary/30 transition-all rounded-xl shadow-sm pl-4">
                            <SelectValue placeholder={stages.length === 0 ? 'Sin pipeline' : 'Seleccionar etapa'}>
                                {currentStage && (
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="w-2.5 h-2.5 rounded-full shrink-0"
                                            style={{ backgroundColor: currentStage.color || '#3b82f6' }}
                                        />
                                        <span className="font-bold text-sm truncate">{currentStage.nombre}</span>
                                    </div>
                                )}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-border/40 shadow-xl">
                            {stages.map(s => (
                                <SelectItem key={s.id} value={s.id} className="text-sm font-medium">
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="w-2.5 h-2.5 rounded-full shrink-0"
                                            style={{ backgroundColor: s.color || '#3b82f6' }}
                                        />
                                        {s.nombre}
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-muted-foreground/60">
                        <CurrencyDollar size={14} weight="bold" />
                        <Label className="text-[10px] uppercase font-black tracking-widest">{t.budget}</Label>
                    </div>
                    <div className="h-11 flex items-center px-4 rounded-xl bg-primary/5 border border-primary/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
                        <InlineEdit
                            value={lead.budget}
                            onSave={(value) => onUpdateField('budget', value)}
                            type="number"
                            min={0}
                            max={maxBudget}
                            prefix="$"
                            displayClassName="font-black text-primary text-lg !m-0 !p-0 hover:bg-transparent justify-start w-auto tracking-tighter"
                            disabled={!canEdit}
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-muted-foreground/60">
                        <Star size={14} weight="bold" />
                        <Label className="text-[10px] uppercase font-black tracking-widest">Evento</Label>
                    </div>
                    <div className="h-11 flex items-center px-4 rounded-xl bg-background border border-border/40 hover:border-primary/30 transition-all shadow-sm">
                        <InlineEdit
                            value={lead.evento || ''}
                            onSave={(value) => onUpdateField('evento', value)}
                            displayClassName="font-bold text-sm text-foreground/80 !m-0 !p-0 hover:bg-transparent justify-start w-auto"
                            disabled={!canEdit}
                            placeholder="Sin evento"
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-muted-foreground/60">
                        <Crown size={14} weight="bold" />
                        <Label className="text-[10px] uppercase font-black tracking-widest">Membresía</Label>
                    </div>
                    <div className="h-11 flex items-center px-4 rounded-xl bg-background border border-border/40 hover:border-primary/30 transition-all shadow-sm">
                        <InlineEdit
                            value={lead.membresia || ''}
                            onSave={(value) => onUpdateField('membresia', value)}
                            displayClassName="font-bold text-sm text-foreground/80 !m-0 !p-0 hover:bg-transparent justify-start w-auto"
                            disabled={!canEdit}
                            placeholder="Sin membresía"
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-muted-foreground/60">
                        <Clock size={14} weight="bold" />
                        <Label className="text-[10px] uppercase font-black tracking-widest">{t.createdAt}</Label>
                    </div>
                    <div className="h-11 flex items-center px-4 rounded-xl bg-muted/30 border border-transparent text-sm font-bold text-muted-foreground/80">
                        {safeFormatDate(lead.createdAt, 'MMM d, yyyy')}
                    </div>
                </div>

                <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-muted-foreground/60">
                        <Timer size={14} weight="bold" />
                        <Label className="text-[10px] uppercase font-black tracking-widest">Tiempo limite (min)</Label>
                    </div>
                    <div className="h-11 flex items-center px-4 rounded-xl bg-background border border-border/40 hover:border-primary/30 transition-all shadow-sm">
                        <InlineEdit
                            type="number"
                            value={lead.slaCustomLimitMinutes ?? ''}
                            onSave={(value) => {
                                const parseVal = parseInt(value as string)
                                onUpdateField('slaCustomLimitMinutes', isNaN(parseVal) ? null as any : parseVal)
                            }}
                            displayClassName="font-bold text-sm text-foreground/80 !m-0 !p-0 hover:bg-transparent justify-start w-auto"
                            disabled={!canEdit}
                            placeholder="SLA por defecto"
                        />
                    </div>
                </div>

                {preferredInstance && PlatformIcon && (
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-muted-foreground/60">
                            <ChatCircleDots size={14} weight="bold" />
                            <Label className="text-[10px] uppercase font-black tracking-widest">Atención</Label>
                        </div>
                        <div className="h-11 flex items-center gap-2.5 px-3 rounded-xl bg-background border border-border/40 shadow-sm transition-all hover:border-primary/30">
                            <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center">
                                <PlatformIcon size={14} className="text-primary" weight="fill" />
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-xs font-bold truncate text-foreground/80">
                                    {preferredInstance.label || preferredInstance.plataforma}
                                </span>
                                {preferredInstance.client_id && (
                                    <span className="text-[9px] text-muted-foreground/60 font-mono tracking-tighter truncate">
                                        ID: {preferredInstance.client_id}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Custom fields */}
            {customFieldDefs.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-6 pt-2">
                    {customFieldDefs.map(def => (
                        <div key={def.clave} className="space-y-1.5">
                            <div className="flex items-center gap-2 text-muted-foreground/60">
                                <Label className="text-[10px] uppercase font-black tracking-widest">{def.nombre}</Label>
                            </div>
                            <div className="min-h-11 flex items-center px-4 py-2.5 rounded-xl bg-background border border-border/40 hover:border-primary/30 transition-all shadow-sm">
                                {def.tipo === 'select' ? (
                                    <Select
                                        value={String(lead.customFields?.[def.clave] ?? '__none__')}
                                        onValueChange={v => onUpdateCustomField?.(def.clave, v === '__none__' ? '' : v)}
                                        disabled={!canEdit}
                                    >
                                        <SelectTrigger className="border-0 shadow-none h-auto p-0 font-bold text-sm text-foreground/80 focus:ring-0">
                                            <SelectValue placeholder="Sin selección" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__none__">Sin selección</SelectItem>
                                            {(def.opciones ?? []).map(opt => (
                                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <InlineEdit
                                        value={lead.customFields?.[def.clave] ?? ''}
                                        onSave={v => onUpdateCustomField?.(def.clave, def.tipo === 'number' ? Number(v) : v)}
                                        type={def.tipo === 'number' ? 'number' : 'text'}
                                        displayClassName="font-bold text-sm text-foreground/80 !m-0 !p-0 hover:bg-transparent justify-start w-auto"
                                        disabled={!canEdit}
                                        placeholder={`Sin ${def.nombre.toLowerCase()}`}
                                    />
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="relative pt-4">
                <div className="absolute top-0 left-0 w-8 h-1 rounded-full bg-gradient-to-r from-primary to-transparent" />
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-foreground/40 mb-5">Actividad Reciente</h3>

                <div className="space-y-3 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[1.5px] before:bg-gradient-to-b before:from-primary/20 before:via-border/50 before:to-transparent">
                    {recentMessages.length > 0 ? (
                        recentMessages.slice(-3).map(msg => {
                            const Icon = getChannelIcon(msg.channel)
                            return (
                                <div key={msg.id} className="relative pl-8 group">
                                    <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-background border-2 border-primary/20 flex items-center justify-center z-10 shadow-sm group-hover:border-primary transition-colors">
                                        <Icon size={12} className="text-primary/60 group-hover:text-primary" weight="bold" />
                                    </div>
                                    <div className="p-4 bg-muted/30 rounded-2xl border border-transparent hover:border-border/40 hover:bg-background transition-all group-hover:shadow-[0_8px_16px_rgba(0,0,0,0.02)]">
                                        <div className="flex items-center justify-between gap-4 mb-2">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-primary/40">
                                                {msg.sender === 'lead' ? 'Del Lead' : 'Del Equipo'}
                                            </span>
                                            <span className="text-[10px] font-bold text-muted-foreground/40 italic">
                                                {safeFormatDate(msg.timestamp, 'MMM d, h:mm a')}
                                            </span>
                                        </div>
                                        <p className="text-xs leading-relaxed font-semibold text-foreground/80">{msg.content}</p>
                                    </div>
                                </div>
                            )
                        })
                    ) : (
                        <div className="pl-8 py-4 text-xs font-bold text-muted-foreground/30 italic">Sin actividad reciente</div>
                    )}
                </div>
            </div>
            
            <Separator className="my-8" />
            
            <div className="relative">
                <div className="absolute top-0 left-0 w-8 h-1 rounded-full bg-gradient-to-r from-primary to-transparent" />
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-foreground/40 mb-5">Historial</h3>
                <HistoryTab leadId={lead.id} />
            </div>
        </div>
    )
}
