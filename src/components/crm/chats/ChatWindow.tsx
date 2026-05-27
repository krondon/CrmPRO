
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { Lead } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
    ArrowLeft, X, VideoCamera, Check, WarningCircle,
    File as FileIcon, Microphone, WhatsappLogo, InstagramLogo, FacebookLogo,
    Archive, Trash, PencilSimple, ArrowSquareOut, CaretRight,
    ChatCircleDots, Spinner, Info, Broom, MagnifyingGlass, CaretUp, CaretDown
} from '@phosphor-icons/react'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { safeFormatDate } from '@/hooks/useDateFormat'
import { detectChannel } from '@/hooks/useLeadsList'
import { getMessages, subscribeToMessages, markMessagesAsRead, deleteMessage, deleteConversation } from '@/supabase/services/mensajes'
import type { Message as DbMessage } from '@/supabase/services/mensajes'
import { MessageInput } from './MessageInput'
import { AiAgentPanel } from './AiAgentPanel'
import { LeadTags } from './LeadTags'
import { LeadDetailSheet } from '../LeadDetailSheet'
import { listWhatsappInstancias } from '@/supabase/services/instances'
import type { EmpresaInstanciaDB } from '@/lib/types'
import { usePermissions } from '@/hooks/usePermissions'

interface ChatWindowProps {
    lead: Lead | null
    companyId: string
    currentUserEmail?: string // Opcional, para lógica futura
    canDeleteLead?: boolean
    canDeleteMessages?: boolean
    canManageTags?: boolean
    isAiEnabled?: boolean
    /**
     * Si la feature "Pendiente de respuesta humana" está activa para la
     * empresa. Cuando true, se muestra el badge "Pendiente" en el header
     * del chat si lead.isPendingHumanResponse=true.
     */
    showPendingHumanResponse?: boolean
    onBack: () => void // Para móvil
    onArchive: (lead: Lead, state: boolean) => Promise<void>
    onDelete: (lead: Lead) => Promise<void>
    onNavigateToPipeline?: (lead: Lead) => void
    updateLeadListOrder: (leadId: string, msg: any) => void
    updateUnreadCount: (leadId: string, count: number) => void
    onLeadUpdate?: (lead: Lead) => void
    deletedLeadInfo?: { name: string; phone?: string } | null
    onDismissDeleted?: () => void
    incomingMessage?: { msg: DbMessage; ts: number } | null
}

export function ChatWindow({
    lead,
    companyId,
    canDeleteLead = false,
    canDeleteMessages = true,
    canManageTags = true,
    isAiEnabled = false,
    showPendingHumanResponse = false,
    onBack,
    onArchive,
    onDelete,
    onNavigateToPipeline,
    updateLeadListOrder,
    updateUnreadCount,
    onLeadUpdate,
    deletedLeadInfo,
    onDismissDeleted,
    incomingMessage
}: ChatWindowProps) {
    // Resolver permisos directamente en el componente (más confiable que props)
    const { hasPermission, isOwner } = usePermissions()
    const resolvedCanDeleteMessages = isOwner || hasPermission('delete_messages')
    const resolvedCanManageTags = isOwner || hasPermission('manage_tags')

    // Usar permisos resueltos localmente en vez de los props
    canDeleteMessages = resolvedCanDeleteMessages
    canManageTags = resolvedCanManageTags

    // Inserta un mensaje preservando orden cronológico por `created_at`.
    // Necesario porque el webhook puede insertar mensajes con timestamp
    // del proveedor (no NOW()), y los realtime pueden llegar fuera de orden
    // —especialmente en ráfagas de Facebook Messenger.
    const insertSortedMessage = useCallback((prev: DbMessage[], msg: DbMessage): DbMessage[] => {
        if (prev.some(m => m.id === msg.id)) return prev
        const t = new Date(msg.created_at).getTime()
        // Camino rápido: típicamente el nuevo es el más reciente.
        if (prev.length === 0 || t >= new Date(prev[prev.length - 1].created_at).getTime()) {
            return [...prev, msg]
        }
        const idx = prev.findIndex(m => new Date(m.created_at).getTime() > t)
        if (idx === -1) return [...prev, msg]
        return [...prev.slice(0, idx), msg, ...prev.slice(idx)]
    }, [])

    // Estados locales
    const [messages, setMessages] = useState<DbMessage[]>([])
    const [isLoadingMessages, setIsLoadingMessages] = useState(false)
    const [showContactInfo, setShowContactInfo] = useState(false)
    const [detailSheetOpen, setDetailSheetOpen] = useState(false)
    const [archivingLeadId, setArchivingLeadId] = useState<string | null>(null)
    const [lightboxImage, setLightboxImage] = useState<string | null>(null)
    const [activeInstance, setActiveInstance] = useState<EmpresaInstanciaDB | null>(null)
    const [activeDeleteMsgId, setActiveDeleteMsgId] = useState<string | null>(null)
    const [showChatSearch, setShowChatSearch] = useState(false)
    const [chatSearchTerm, setChatSearchTerm] = useState('')
    const [chatSearchIndex, setChatSearchIndex] = useState(0)
    const [showAiPanel, setShowAiPanel] = useState(false)
    const [pendingSuggestion, setPendingSuggestion] = useState<{ text: string; ts: number } | null>(null)

    const messagesEndRef = useRef<HTMLDivElement>(null)
    const chatSearchInputRef = useRef<HTMLInputElement>(null)

    // Dismiss delete button when tapping outside
    useEffect(() => {
        if (!activeDeleteMsgId) return
        const dismiss = () => setActiveDeleteMsgId(null)
        document.addEventListener('click', dismiss)
        return () => document.removeEventListener('click', dismiss)
    }, [activeDeleteMsgId])

    const handleDeleteMessage = useCallback(async (messageId: string) => {
        try {
            await deleteMessage(messageId)
            setMessages(prev => prev.filter(m => m.id !== messageId))
            setActiveDeleteMsgId(null)
        } catch (e) {
            console.error('Error deleting message:', e)
        }
    }, [])

    // Refs para callbacks estables (evitar re-suscripción del socket)
    const updateLeadListOrderRef = useRef(updateLeadListOrder)
    updateLeadListOrderRef.current = updateLeadListOrder
    const updateUnreadCountRef = useRef(updateUnreadCount)
    updateUnreadCountRef.current = updateUnreadCount

    // Cargar mensajes cuando cambia el lead
    useEffect(() => {
        if (!lead) {
            setMessages([])
            return
        }

        const load = async () => {
            setIsLoadingMessages(true)
            try {
                setMessages(await getMessages(lead.id))
            } catch (e) {
                console.error('Error loading messages:', e)
            } finally {
                setIsLoadingMessages(false)
            }
        }

        void load()

        // Marcar como leídos al abrir
        const markRead = async () => {
            try {
                await markMessagesAsRead(lead.id)
                updateUnreadCountRef.current(lead.id, 0)
            } catch { }
        }
        markRead()

        // Detectar instancia activa desde el último mensaje del lead
        const detectInstance = async () => {
            try {
                const allMsgs = await getMessages(lead.id)
                // Buscar el último mensaje ENTRANTE del lead que tenga instanceId en metadata
                const lastLeadMsg = [...allMsgs].reverse().find(
                    m => m.sender === 'lead' && (m.metadata?.instanceId || m.metadata?.instance_id)
                )
                const instanceId = lastLeadMsg?.metadata?.instanceId || lastLeadMsg?.metadata?.instance_id
                if (instanceId) {
                    const instances = await listWhatsappInstancias(companyId)
                    const found = instances.find(i => i.id === instanceId) || null
                    setActiveInstance(found)
                } else {
                    const lastTeamMsg = [...allMsgs].reverse().find(
                        m => m.sender === 'team' && (m.metadata?.instanceId || m.metadata?.instance_id)
                    )
                    const teamInstanceId = lastTeamMsg?.metadata?.instanceId || lastTeamMsg?.metadata?.instance_id
                    if (teamInstanceId) {
                        const instances = await listWhatsappInstancias(companyId)
                        const found = instances.find(i => i.id === teamInstanceId) || null
                        setActiveInstance(found)
                    } else {
                        setActiveInstance(null)
                    }
                }
            } catch (e) {
                console.error('[ChatWindow] Error detectando instancia:', e)
            }
        }
        void detectInstance()

        // Suscribirse a nuevos mensajes del lead (canal único para evitar colisiones)
        const sub = subscribeToMessages(lead.id, (newMsg) => {
            setMessages(prev => insertSortedMessage(prev, newMsg))
            updateLeadListOrderRef.current(lead.id, newMsg)

            if (newMsg.sender === 'lead') {
                markRead() // Marcar como leído si entra mientras vemos el chat
            }
        })

        return () => {
            try { sub.unsubscribe() } catch { }
        }
    }, [lead?.id, companyId])

    // Fallback: si subscribeToMessages falla, recibir mensajes desde subscribeToAllMessages vía prop
    useEffect(() => {
        if (!incomingMessage || !lead) return
        const msg = incomingMessage.msg
        if (msg.lead_id !== lead.id) return
        setMessages(prev => insertSortedMessage(prev, msg))
    }, [incomingMessage, lead?.id, insertSortedMessage])

    // Scroll automático y al cambiar de mensajes
    useEffect(() => {
        const el = document.getElementById('chat-scroll-area')
        if (el) el.scrollTop = el.scrollHeight
        // También usar ref para asegurar
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages, lead?.id])

    // Media del chat (memoizado)
    const chatMedia = useMemo(() => {
        if (!messages.length) return []
        return messages.filter(m => {
            const data = m.metadata?.data || m.metadata || {};
            const type = data.type;
            if (type === 'image' || type === 'video') return true;
            if (data.mediaUrl || data.media?.url || data.body?.startsWith('http')) {
                const url = data.mediaUrl || data.media?.url || data.body;
                if (!url) return false;
                const lower = url.toLowerCase();
                return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.mov'].some(ext => lower.includes(ext));
            }
            if (m.content && (m.content.match(/https?:\/\/.*\.(jpg|jpeg|png|gif|webp|mp4|webm|mov)/i))) return true;
            return false;
        }).map(m => {
            const data = m.metadata?.data || m.metadata || {};
            let url = data.mediaUrl || data.media?.url || (data.type === 'image' && data.body?.startsWith('http') ? data.body : null);
            if (!url && m.content) {
                const match = m.content.match(/(https?:\/\/[^\s]+)/g);
                if (match) {
                    const found = match.find(u => ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.mov'].some(ext => u.toLowerCase().includes(ext)));
                    if (found) url = found;
                }
            }
            let type = data.type;
            if (!type && url) {
                type = ['.mp4', '.webm', '.mov'].some(ext => url!.toLowerCase().includes(ext)) ? 'video' : 'image';
            }
            return { id: m.id, url, type };
        }).filter(m => m.url).reverse();
    }, [messages]);

    // Buscar mensajes que coinciden con el término de búsqueda
    const chatSearchMatches = useMemo(() => {
        if (!chatSearchTerm.trim()) return [] as string[]
        const term = chatSearchTerm.toLowerCase()
        return messages
            .filter(m => m.content && m.content.toLowerCase().includes(term))
            .map(m => m.id)
    }, [messages, chatSearchTerm])

    // Scroll al match actual cuando cambia el índice o los matches
    useEffect(() => {
        if (chatSearchMatches.length === 0) return
        const targetId = chatSearchMatches[chatSearchIndex]
        if (!targetId) return
        const el = document.getElementById(`msg-${targetId}`)
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
    }, [chatSearchIndex, chatSearchMatches])

    // Reset search index when term changes
    useEffect(() => {
        setChatSearchIndex(0)
    }, [chatSearchTerm])

    // Reset search when changing lead
    useEffect(() => {
        setShowChatSearch(false)
        setChatSearchTerm('')
    }, [lead?.id])

    // Helper para resaltar texto de búsqueda en mensajes
    const highlightText = useCallback((text: string) => {
        if (!chatSearchTerm.trim()) return text
        const escaped = chatSearchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
        if (parts.length === 1) return text
        return parts.map((part, i) =>
            part.toLowerCase() === chatSearchTerm.toLowerCase()
                ? <mark key={i} className="bg-yellow-300 dark:bg-yellow-500/60 text-inherit rounded-sm px-0.5">{part}</mark>
                : part
        )
    }, [chatSearchTerm])

    // Handlers locales
    const handleArchive = async () => {
        if (!lead) return
        setArchivingLeadId(lead.id)
        try {
            await onArchive(lead, !lead.archived)
        } finally {
            setArchivingLeadId(null)
        }
    }

    const handleDelete = async () => {
        if (!lead) return
        if (window.confirm(`¿Eliminar el lead "${lead.name || lead.phone || lead.id}"? Esta acción no se puede deshacer.`)) {
            await onDelete(lead)
        }
    }

    // Render de "Chat eliminado" cuando el lead fue borrado/archivado
    if (!lead && deletedLeadInfo) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-gradient-to-br from-background via-background to-destructive/5 min-h-0">
                <div className="relative mb-8">
                    <div className="absolute inset-0 bg-destructive/15 rounded-full blur-3xl scale-150 opacity-30" />
                    <div className="w-36 h-36 bg-card border border-border/50 rounded-[2.5rem] flex items-center justify-center shadow-2xl relative z-10 animate-in zoom-in duration-500">
                        <div className="w-18 h-18 bg-destructive/10 rounded-full flex items-center justify-center p-4">
                            <Trash className="w-10 h-10 text-destructive/70" weight="duotone" />
                        </div>
                    </div>
                </div>
                <h3 className="text-2xl font-black mb-2 tracking-tight">Chat eliminado</h3>
                <p className="text-muted-foreground font-medium mb-1">
                    La conversación con <span className="font-bold text-foreground">{deletedLeadInfo.name}</span> fue eliminada.
                </p>
                {deletedLeadInfo.phone && (
                    <p className="text-sm text-muted-foreground/70 mb-6">{deletedLeadInfo.phone}</p>
                )}
                <Button
                    variant="outline"
                    className="mt-4 rounded-xl font-bold px-6"
                    onClick={onDismissDeleted}
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Volver a conversaciones
                </Button>
            </div>
        )
    }

    // Render vacío si no hay lead
    if (!lead) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-gradient-to-br from-background via-background to-primary/5 min-h-0">
                <div className="relative mb-8">
                    <div className="absolute inset-0 bg-primary/20 rounded-full blur-3xl scale-150 opacity-30" />
                    <div className="w-40 h-40 bg-card border border-border/50 rounded-[2.5rem] flex items-center justify-center shadow-2xl relative z-10 animate-in zoom-in duration-700">
                        <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center">
                            <ChatCircleDots className="w-10 h-10 text-primary" weight="duotone" />
                        </div>
                    </div>
                </div>
                <h3 className="text-3xl font-black mb-4 tracking-tight">Centro de Mensajería</h3>
                <p className="max-w-md text-muted-foreground font-medium leading-relaxed">
                    Selecciona una conversación de la izquierda para comenzar a chatear.
                    Gestiona <span className="text-[#25D366] font-bold">WhatsApp</span>, <span className="text-[#E1306C] font-bold">Instagram</span> y <span className="text-[#1877F2] font-bold">Facebook</span> en un solo lugar con una experiencia premium.
                </p>
                <div className="mt-10 flex gap-4 opacity-40 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-700">
                    <div className="flex items-center gap-2 bg-muted p-3 rounded-2xl border border-border/40">
                        <WhatsappLogo weight="fill" className="w-5 h-5 text-[#25D366]" />
                        <span className="text-xs font-black uppercase tracking-widest">WhatsApp</span>
                    </div>
                    <div className="flex items-center gap-2 bg-muted p-3 rounded-2xl border border-border/40">
                        <InstagramLogo weight="fill" className="w-5 h-5 text-[#E1306C]" />
                        <span className="text-xs font-black uppercase tracking-widest">Instagram</span>
                    </div>
                    <div className="flex items-center gap-2 bg-muted p-3 rounded-2xl border border-border/40">
                        <FacebookLogo weight="fill" className="w-5 h-5 text-[#1877F2]" />
                        <span className="text-xs font-black uppercase tracking-widest">Facebook</span>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="flex-1 flex flex-row relative min-h-0 overflow-hidden bg-[#efeae2] dark:bg-background/95">
            <div className="flex-1 flex flex-col min-h-0 relative transition-all duration-300 min-w-0 overflow-hidden">
                {/* Header */}
                <div
                    className="h-14 sm:h-16 px-2 sm:px-4 border-b bg-background flex items-center justify-between shrink-0 cursor-pointer hover:bg-muted/30 transition-colors group"
                    onClick={() => setShowContactInfo(!showContactInfo)}
                >
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="md:hidden shrink-0 -ml-1 h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground hover:text-foreground"
                            onClick={(e) => { e.stopPropagation(); onBack() }}
                        >
                            <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                        </Button>
                        <Avatar className="h-8 w-8 sm:h-10 sm:w-10 shadow-sm border border-border/50 shrink-0">
                            <AvatarImage src={lead.avatar} />
                            <AvatarFallback className="bg-muted text-muted-foreground font-bold text-xs sm:text-sm">
                                {(lead.name || 'Unknown').substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col min-w-0 flex-1">
                            <div className="flex items-center gap-2 min-w-0">
                                <h3 className="font-bold truncate text-[13px] sm:text-base leading-tight tracking-tight">
                                    {lead.name}
                                </h3>
                                {showPendingHumanResponse && lead.isPendingHumanResponse && (
                                    <span
                                        className="text-[9px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded-md bg-red-500/10 border border-red-500/20 shrink-0"
                                        title="El cliente envió un mensaje que aún no ha sido atendido por un asesor"
                                    >
                                        Pendiente
                                    </span>
                                )}
                            </div>
                            <p className="truncate text-[10px] sm:text-[11px] font-medium text-muted-foreground">
                                {lead.phone}
                                {lead.company && <span className="hidden sm:inline"> • {lead.company}</span>}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center shrink-0 ml-1">
                        {activeInstance && (
                            <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 mr-2 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold">
                                <WhatsappLogo size={10} weight="fill" />
                                {activeInstance.label || activeInstance.client_id || 'WhatsApp'}
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation()
                                setShowChatSearch(v => !v)
                                if (!showChatSearch) setTimeout(() => chatSearchInputRef.current?.focus(), 100)
                                else setChatSearchTerm('')
                            }}
                            className={cn(
                                "p-1.5 sm:p-2 rounded-full transition-all active:scale-95",
                                showChatSearch ? "bg-primary/10 text-primary" : "hover:bg-muted"
                            )}
                            title="Buscar en chat"
                        >
                            <MagnifyingGlass className="w-[18px] h-[18px] sm:w-5 sm:h-5" />
                        </button>
                        {canDeleteMessages && (
                        <button
                            type="button"
                            onClick={async (e) => {
                                e.stopPropagation()
                                if (!lead) return
                                if (window.confirm(`¿Eliminar toda la conversación con "${lead.name || lead.phone}"? Se borrarán todos los mensajes. Esta acción no se puede deshacer.`)) {
                                    try {
                                        await deleteConversation(lead.id)
                                        setMessages([])
                                    } catch (err) {
                                        console.error('Error eliminando conversación:', err)
                                    }
                                }
                            }}
                            className="p-1.5 sm:p-2 rounded-full hover:bg-orange-500/10 hover:text-orange-500 transition-all active:scale-95"
                            title="Limpiar chat (borrar mensajes)"
                        >
                            <Broom className="w-[18px] h-[18px] sm:w-5 sm:h-5" />
                        </button>
                        )}
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setShowContactInfo(!showContactInfo); }}
                            className={cn(
                                "p-1.5 sm:p-2 rounded-full hover:bg-muted transition-all active:scale-95",
                                showContactInfo ? "bg-primary/10 text-primary" : ""
                            )}
                        >
                            <Info className="w-[18px] h-[18px] sm:w-5 sm:h-5" weight={showContactInfo ? "fill" : "regular"} />
                        </button>
                    </div>
                </div>

                {/* Search in chat bar */}
                {showChatSearch && (
                    <div className="flex items-center gap-2 px-3 py-2 border-b bg-background shrink-0 animate-in slide-in-from-top-2 duration-200">
                        <MagnifyingGlass className="w-4 h-4 text-muted-foreground shrink-0" />
                        <input
                            ref={chatSearchInputRef}
                            type="text"
                            placeholder="Buscar en esta conversación..."
                            value={chatSearchTerm}
                            onChange={(e) => setChatSearchTerm(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    if (chatSearchMatches.length > 0) {
                                        setChatSearchIndex(prev => (prev + 1) % chatSearchMatches.length)
                                    }
                                }
                                if (e.key === 'Escape') {
                                    setShowChatSearch(false)
                                    setChatSearchTerm('')
                                }
                            }}
                            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                        />
                        {chatSearchTerm && (
                            <span className="text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
                                {chatSearchMatches.length > 0
                                    ? `${chatSearchIndex + 1} de ${chatSearchMatches.length}`
                                    : 'Sin resultados'}
                            </span>
                        )}
                        <div className="flex items-center gap-0.5">
                            <button
                                type="button"
                                onClick={() => setChatSearchIndex(prev => prev > 0 ? prev - 1 : chatSearchMatches.length - 1)}
                                disabled={chatSearchMatches.length === 0}
                                className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
                            >
                                <CaretUp className="w-4 h-4" weight="bold" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setChatSearchIndex(prev => (prev + 1) % chatSearchMatches.length)}
                                disabled={chatSearchMatches.length === 0}
                                className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
                            >
                                <CaretDown className="w-4 h-4" weight="bold" />
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={() => { setShowChatSearch(false); setChatSearchTerm('') }}
                            className="p-1 rounded hover:bg-muted transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 scrollbar-thin scrollbar-thumb-muted-foreground/10" id="chat-scroll-area">
                    <div className="space-y-6 w-full max-w-3xl mx-auto pb-4">
                        {messages.map((msg, idx) => {
                            const isTeam = msg.sender === 'team'
                            const msgDate = safeFormatDate(msg.created_at, 'yyyy-MM-dd')
                            const prevMsgDate = idx > 0 ? safeFormatDate(messages[idx - 1].created_at, 'yyyy-MM-dd') : null
                            const showDateLabel = msgDate !== prevMsgDate

                            const data = msg.metadata?.data || msg.metadata || {};
                            let mediaUrl = data.mediaUrl || data.media?.links?.download || data.media?.url || data.media?.publicUrl || data.media?.downloadUrl || (data.type === 'image' && data.body?.startsWith('http') ? data.body : null);

                            if (!mediaUrl && msg.content) {
                                const urlRegex = /(https?:\/\/[^\s]+)/g;
                                const matches = msg.content.match(urlRegex);
                                if (matches) {
                                    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.pdf', '.csv'];
                                    const foundUrl = matches.find(url => {
                                        const lower = url.toLowerCase();
                                        return imageExtensions.some(ext => lower.includes(ext));
                                    }) || matches[matches.length - 1];
                                    if (foundUrl) mediaUrl = foundUrl;
                                }
                            }

                            return (
                                <div key={msg.id || idx} className="contents">
                                    {showDateLabel && (
                                        <div className="flex justify-center my-8">
                                            <span className="px-4 py-1.5 bg-background/80 backdrop-blur-md border border-border/40 text-[10px] font-black text-muted-foreground rounded-full uppercase tracking-widest shadow-sm z-10">
                                                {safeFormatDate(msg.created_at, "EEEE, d 'de' MMMM", { locale: es })}
                                            </span>
                                        </div>
                                    )}
                                    <div
                                        id={`msg-${msg.id}`}
                                        className={cn(
                                            "flex w-full group/msg relative transition-colors duration-300",
                                            isTeam ? "justify-end" : "justify-start",
                                            chatSearchMatches[chatSearchIndex] === msg.id && "bg-yellow-200/40 dark:bg-yellow-500/20 rounded-xl"
                                        )}
                                    >
                                        {canDeleteMessages && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleDeleteMessage(msg.id)
                                            }}
                                            className={cn(
                                                "absolute top-1/2 -translate-y-1/2 p-2 rounded-full bg-destructive text-white transition-all shadow-lg z-20",
                                                "opacity-0 scale-75 group-hover/msg:opacity-100 group-hover/msg:scale-100",
                                                activeDeleteMsgId === msg.id && "!opacity-100 !scale-100",
                                                isTeam ? "-left-1 sm:-left-5" : "-right-1 sm:-right-5"
                                            )}
                                            title="Eliminar mensaje"
                                        >
                                            <Trash size={16} weight="bold" />
                                        </button>
                                        )}
                                        {/* Hint "Toca de nuevo para eliminar" en móvil */}
                                        {canDeleteMessages && activeDeleteMsgId === msg.id && (
                                            <div className={cn(
                                                "absolute -top-8 z-30 px-2.5 py-1 rounded-lg bg-destructive text-white text-[11px] font-semibold shadow-lg animate-in fade-in zoom-in-95 duration-200 whitespace-nowrap sm:hidden",
                                                isTeam ? "right-0" : "left-0"
                                            )}>
                                                Toca de nuevo para eliminar
                                            </div>
                                        )}
                                        <div
                                            className={cn(
                                                "max-w-[75%] min-w-0 px-3.5 py-2.5 rounded-2xl shadow-sm text-[15px] relative animate-in fade-in slide-in-from-bottom-2 duration-300 break-words overflow-hidden cursor-pointer sm:cursor-default",
                                                isTeam
                                                    ? "bg-primary text-primary-foreground rounded-tr-none shadow-primary/10"
                                                    : "bg-white text-black rounded-tl-none border border-border/10 shadow-black/5",
                                                activeDeleteMsgId === msg.id && "ring-2 ring-destructive/50 scale-[0.97] transition-transform"
                                            )}
                                            onClick={() => {
                                                if (!canDeleteMessages) return
                                                if (activeDeleteMsgId === msg.id) {
                                                    handleDeleteMessage(msg.id)
                                                } else {
                                                    setActiveDeleteMsgId(msg.id)
                                                }
                                            }}
                                        >
                                            {(() => {
                                                if (!msg.content) return null;
                                                if (msg.content.startsWith('http')) return null;

                                                if (mediaUrl) {
                                                    const urlRegex = /https?:\/\/[^\s]+/gi;
                                                    const cleanedContent = msg.content.replace(urlRegex, '').trim();
                                                    if (cleanedContent && cleanedContent.length > 0) {
                                                        return <div className="whitespace-pre-wrap break-words leading-relaxed mb-2 font-medium">{highlightText(cleanedContent)}</div>;
                                                    }
                                                    return null;
                                                }
                                                return <div className="whitespace-pre-wrap break-words leading-relaxed font-medium">{highlightText(msg.content)}</div>;
                                            })()}

                                            {(() => {
                                                if (!mediaUrl) return null;
                                                // Preferir URL almacenada en bucket (más confiable que URLs temporales de SuperAPI)
                                                const resolvedUrl = data.storedMediaUrl || mediaUrl;
                                                const lowerUrl = resolvedUrl.toLowerCase();
                                                const mimeType = data.file?.mimeType || data.media?.mimeType || data.media?.type || data.media?.contentType || data.type
                                                const lowerMime = (mimeType || '').toLowerCase();

                                                // Audio se evalúa ANTES que video para evitar conflicto con .ogg
                                                const isAudio = ['.mp3', '.wav', '.oga', '.m4a', '.aac', '.opus'].some(ext => lowerUrl.includes(ext))
                                                    || lowerMime.startsWith('audio/')
                                                    || data.type === 'audio'
                                                    || data.type === 'ptt'
                                                    || (lowerUrl.includes('.ogg') && !lowerMime.startsWith('video/'));
                                                const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].some(ext => lowerUrl.includes(ext))
                                                    || (lowerMime.startsWith('image/'))
                                                    || (data.type === 'image')
                                                const isVideo = !isAudio && (
                                                    ['.mp4', '.webm', '.mov'].some(ext => lowerUrl.includes(ext))
                                                    || lowerMime.startsWith('video/')
                                                    || (data.type === 'video')
                                                );

                                                if (isImage) {
                                                    return (
                                                        <button
                                                            type="button"
                                                            className="mt-1 rounded-xl overflow-hidden shadow-inner bg-black/5 ring-1 ring-black/5 dark:ring-white/5 cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-primary/40"
                                                            onClick={() => resolvedUrl && setLightboxImage(resolvedUrl)}
                                                        >
                                                            <img src={resolvedUrl} alt="Imagen" className="max-w-full h-auto object-cover max-h-[500px]" loading="lazy" />
                                                        </button>
                                                    )
                                                } else if (isAudio) {
                                                    return (
                                                        <div className={cn("mt-1 flex items-center gap-3 p-2 rounded-xl border max-w-full backdrop-blur-sm", isTeam ? "bg-white/10 border-white/10" : "bg-muted/30 border-border/30")}>
                                                            <div className={cn("p-2 rounded-full text-white shrink-0 shadow-sm", isTeam ? "bg-white/20" : "bg-primary")}>
                                                                <Microphone size={16} weight="fill" />
                                                            </div>
                                                            <div className="flex-1 min-w-[150px]">
                                                                <audio src={resolvedUrl} controls className={cn("w-full h-8 opacity-90", isTeam ? "invert grayscale" : "")} />
                                                            </div>
                                                        </div>
                                                    )
                                                } else if (isVideo) {
                                                    return (
                                                        <div className="mt-1 rounded-xl overflow-hidden shadow-inner bg-black/5 ring-1 ring-black/5 dark:ring-white/5">
                                                            <video src={resolvedUrl} controls className="max-w-full h-auto max-h-[500px]" />
                                                        </div>
                                                    )
                                                } else {
                                                    const fileName = resolvedUrl.split('/').pop()?.split('?')[0] || 'Archivo adjunto';
                                                    return (
                                                        <div className={cn("mt-1 flex items-center gap-3 p-3 rounded-xl border max-w-full transition-all cursor-pointer", isTeam ? "bg-white/10 border-white/10 hover:bg-white/20" : "bg-muted/30 border-border/30 hover:bg-muted")}>
                                                            <div className={cn("p-2.5 rounded-lg shadow-sm shrink-0", isTeam ? "bg-white/10 text-white" : "bg-background text-primary")}>
                                                                <FileIcon size={24} weight="duotone" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-bold truncate" title={fileName}>{fileName}</p>
                                                                <a href={resolvedUrl} target="_blank" rel="noopener noreferrer" className={cn("text-[10px] font-black uppercase tracking-tight hover:underline flex items-center gap-1 mt-1 opacity-80", isTeam ? "text-white" : "text-primary")}>Abrir enlace</a>
                                                            </div>
                                                        </div>
                                                    )
                                                }
                                            })()}

                                            <div className={cn("text-[10px] mt-1.5 flex items-center gap-1.5 font-bold tracking-tight uppercase opacity-60", isTeam ? "justify-end text-white/90" : "justify-start text-muted-foreground/90")}>
                                                {safeFormatDate(msg.created_at, 'HH:mm')}
                                                {isTeam && (
                                                    (msg.metadata as any)?.error ? (
                                                        <WarningCircle className="w-3.5 h-3.5 text-red-300" weight="fill" />
                                                    ) : (
                                                        msg.read
                                                            ? <Check className="w-3.5 h-3.5 text-white" weight="bold" />
                                                            : <div className="flex items-center -space-x-1.5"><Check className="w-3 h-3" /><Check className="w-3 h-3" /></div>
                                                    )
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                        <div ref={messagesEndRef} id="scroll-bottom" />
                    </div>
                </div>

                {showAiPanel && (
                    <AiAgentPanel
                        lead={lead}
                        companyId={companyId}
                        onClose={() => setShowAiPanel(false)}
                        onApplySuggestion={(text) => {
                            setPendingSuggestion({ text, ts: Date.now() })
                            setShowAiPanel(false)
                        }}
                        onLeadUpdated={() => {
                            setShowAiPanel(false)
                            onLeadUpdate?.(lead)
                        }}
                    />
                )}
                <MessageInput
                    leadId={lead.id}
                    leadData={{ name: lead.name, company: lead.company, phone: lead.phone }}
                    channel={detectChannel(lead)}
                    disabled={isLoadingMessages}
                    instanceLabel={activeInstance ? (activeInstance.label || activeInstance.client_id || 'WhatsApp') : null}
                    empresaId={companyId}
                    onMessageSent={(msg) => {
                        if (msg) {
                            setMessages(prev => insertSortedMessage(prev, msg))
                        }
                        updateLeadListOrder(lead.id, msg as any)
                    }}
                    isAiEnabled={isAiEnabled}
                    onAiClick={() => setShowAiPanel(prev => !prev)}
                    suggestion={pendingSuggestion}
                />
            </div>

            {/* Contact Info Panel */}
            {showContactInfo && (
                <div className={cn(
                    "flex flex-col shrink-0 animate-in slide-in-from-right duration-300 shadow-2xl overflow-hidden z-20 bg-background border-l border-border",
                    "absolute inset-0 w-full md:static md:w-[320px] md:max-w-[320px] min-h-0"
                )}>
                    {/* ... Contenido del panel de info ... */}
                    <div className="h-16 px-4 bg-muted/10 border-b flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-3">
                            <button onClick={() => setShowContactInfo(false)} className="hover:bg-muted p-2 rounded-full transition-colors text-muted-foreground hover:text-foreground md:hidden">
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <span className="font-bold text-xs uppercase tracking-[0.2em] text-muted-foreground/80">Información</span>
                        </div>
                        <button onClick={() => setShowContactInfo(false)} className="hover:bg-muted p-2 rounded-full transition-colors text-muted-foreground hover:text-foreground hidden md:block">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20">
                        <div className="flex flex-col items-center p-8 pb-8 bg-gradient-to-b from-muted/20 to-transparent border-b border-border/40">
                            <div className="relative mb-6 group">
                                <Avatar className="w-32 h-32 shadow-2xl ring-4 ring-background group-hover:scale-105 transition-transform duration-500">
                                    <AvatarImage src={lead.avatar} />
                                    <AvatarFallback className="text-4xl font-black bg-muted text-muted-foreground">
                                        {(lead.name || '?').substring(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                {(() => {
                                    const channel = detectChannel(lead)
                                    if (channel === 'instagram') return (
                                        <div className="absolute -bottom-2 -right-2 bg-background rounded-full p-2 shadow-xl border border-border/20">
                                            <InstagramLogo weight="fill" className="h-6 w-6 text-[#E1306C]" />
                                        </div>
                                    )
                                    if (channel === 'facebook') return (
                                        <div className="absolute -bottom-2 -right-2 bg-background rounded-full p-2 shadow-xl border border-border/20">
                                            <FacebookLogo weight="fill" className="h-6 w-6 text-[#1877F2]" />
                                        </div>
                                    )
                                    return (
                                        <div className="absolute -bottom-2 -right-2 bg-background rounded-full p-2 shadow-xl border border-border/20">
                                            <WhatsappLogo weight="fill" className="h-6 w-6 text-[#25D366]" />
                                        </div>
                                    )
                                })()}
                            </div>

                            <h2 className="text-2xl font-black text-center text-foreground tracking-tight px-4 line-clamp-2">{lead.name}</h2>
                            <p className="text-muted-foreground mt-1.5 text-sm font-bold tracking-wide">{lead.phone}</p>

                            <div className="mt-6 w-full px-6">
                                <LeadTags
                                    leadId={lead.id}
                                    currentTags={lead.tags || []}
                                    companyId={companyId}
                                    readOnly={!canManageTags}
                                    onUpdate={(newTags) => {
                                        if (onLeadUpdate) {
                                            onLeadUpdate({ ...lead, tags: newTags })
                                        }
                                    }}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-2 mt-6 w-full px-4">
                                <Button variant="outline" size="sm" className="h-10 rounded-xl font-bold border-border/60 hover:bg-muted transition-all" onClick={() => setDetailSheetOpen(true)}>
                                    <PencilSimple size={18} className="mr-2" /> Editar
                                </Button>
                                <Button variant="outline" size="sm" className="h-10 rounded-xl font-bold border-border/60 hover:bg-muted transition-all" onClick={() => onNavigateToPipeline?.(lead)}>
                                    <ArrowSquareOut size={18} className="mr-2" /> Pipeline
                                </Button>
                                <Button
                                    variant={lead.archived ? 'default' : 'outline'}
                                    size="sm"
                                    className={cn("h-10 rounded-xl font-bold transition-all", lead.archived ? "bg-primary" : "border-border/60 hover:bg-muted")}
                                    onClick={handleArchive}
                                    disabled={archivingLeadId === lead.id}
                                >
                                    {archivingLeadId === lead.id ? <Spinner className="w-4 h-4 animate-spin" /> : <Archive size={18} className="mr-2" weight={lead.archived ? 'fill' : 'regular'} />}
                                    {lead.archived ? 'Restaurar' : 'Archivar'}
                                </Button>
                                {canDeleteLead && (
                                    <Button variant="destructive" size="sm" className="h-10 rounded-xl font-bold hover:bg-destructive/90 transition-all shadow-lg shadow-destructive/10" onClick={handleDelete}>
                                        <Trash size={18} className="mr-2" /> Eliminar
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Media Section */}
                        <div className="p-6 space-y-8">
                            <div className="pt-2">
                                <div className="flex items-center justify-between mb-4 group cursor-pointer hover:bg-muted/40 p-1 rounded-lg transition-all">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Media Compartida</span>
                                    <div className="flex items-center gap-1.5 text-muted-foreground group-hover:text-primary transition-colors">
                                        <span className="text-xs font-black">{chatMedia.length}</span>
                                        <CaretRight size={14} weight="bold" />
                                    </div>
                                </div>
                                {chatMedia.length > 0 ? (
                                    <div className="grid grid-cols-3 gap-2">
                                        {chatMedia.slice(0, 6).map((m: any, i) => (
                                            <div key={i} className="aspect-square relative rounded-xl overflow-hidden bg-muted border border-border/30 cursor-pointer hover:ring-2 hover:ring-primary/40 active:scale-95 transition-all shadow-sm group/thumb">
                                                {m.type === 'video' ? <video src={m.url} className="w-full h-full object-cover" /> : <img src={m.url} alt="media" className="w-full h-full object-cover" />}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="py-10 text-center bg-muted/20 rounded-2xl border-2 border-dashed border-border/40">
                                        <p className="text-xs text-muted-foreground font-bold italic opacity-60 px-4">No hay archivos compartidos recientemente</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <LeadDetailSheet
                lead={lead}
                open={detailSheetOpen}
                onClose={() => setDetailSheetOpen(false)}
                onUpdate={(updatedLead) => {
                    onLeadUpdate?.(updatedLead)
                }}
                teamMembers={[]}
                companyId={companyId}
                canDeleteLead={canDeleteLead}
                onDeleteLead={handleDelete}
            />

            {lightboxImage && createPortal(
                <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setLightboxImage(null)}>
                    <div className="relative max-w-6xl max-h-[90vh] w-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                        <img src={lightboxImage} alt="Imagen ampliada" className="max-h-[90vh] max-w-full rounded-2xl shadow-2xl" />
                        <button
                            type="button"
                            className="absolute top-3 right-3 bg-black/70 text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-black"
                            onClick={() => setLightboxImage(null)}
                        >
                            ×
                        </button>
                    </div>
                </div>,
                document.getElementById('root')!
            )}

        </div>
    )
}
