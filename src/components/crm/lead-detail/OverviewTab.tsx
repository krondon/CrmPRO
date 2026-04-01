/**
 * OverviewTab Component
 * 
 * Muestra información general del lead: asignación, presupuesto,
 * fechas y actividad reciente.
 * Extraído de LeadDetailSheet para mantener el código organizado.
 */

import { Lead, Message, Channel, TeamMember, EmpresaInstanciaDB } from '@/lib/types'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { InlineEdit } from '../InlineEdit'
import { safeFormatDate } from '@/hooks/useDateFormat'
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
    Timer
} from '@phosphor-icons/react'

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
    recentMessages,
    canEdit,
    maxBudget,
    instances = [],
    translations: t
}: OverviewTabProps) {
    const preferredInstance = instances.find(i => i.id === lead.preferred_instance_id) || null
    const PlatformIcon = preferredInstance ? (platformIcons[preferredInstance.plataforma] || DeviceMobile) : null

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
        </div>
    )
}
