/**
 * ChatTab Component
 * 
 * Maneja el chat del lead con:
 * - Selector de canales (WhatsApp, Email, etc.)
 * - Lista de mensajes con renderizado de multimedia
 * - Input de mensajes con soporte para archivos adjuntos
 * - Grabación de notas de voz
 * 
 * Extraído de LeadDetailSheet para mantener el código organizado.
 */

import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { Message, Channel, MetaFollowUpTemplateDB, QuickReply } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
    PaperPlaneRight,
    WhatsappLogo,
    InstagramLogo,
    FacebookLogo,
    Trash,
    DownloadSimple,
    FilePdf,
    File as FileIcon,
    Paperclip,
    Spinner,
    Microphone,
    Stop,
    Check,
    WarningCircle,
    FileText,
    ChatText,
    MagnifyingGlass,
    Plus,
    PencilSimple,
    X
} from '@phosphor-icons/react'
import { safeFormatDate } from '@/hooks/useDateFormat'
import { useAuth } from '@/hooks/useAuth'
import { listFollowUpTemplates, sendMetaTemplate } from '@/supabase/services/metaTemplates'
import {
    listQuickReplies,
    createQuickReply,
    updateQuickReply,
    deleteQuickReply,
    renderQuickReply,
    QUICK_REPLY_VARIABLES,
} from '@/supabase/services/quickReplies'

// ============================================
// TIPOS
// ============================================

interface ChatTabProps {
    leadId: string
    messages: Message[]
    selectedChannel: Channel
    onChannelChange: (channel: Channel) => void
    messageInput: string
    onMessageInputChange: (value: string) => void
    onSendMessage: () => void
    onDeleteMessage: (messageId: string) => void
    onDeleteConversation: () => void
    onFileUpload: (file: File) => Promise<void>
    isUploading: boolean
    canEdit: boolean
    canDeleteMessages?: boolean
    messagesEndRef: React.RefObject<HTMLDivElement>
    // Audio recording
    isRecording: boolean
    recordingTime: number
    onStartRecording: () => void
    onStopRecording: () => void
    // Quick replies + Meta templates (igual que en el chat grande)
    empresaId?: string
    leadData?: { name?: string | null; company?: string | null; phone?: string | null }
    translations: {
        noMessages: string
        typeMessage: string
    }
}

// ============================================
// UTILIDADES
// ============================================

// Solo canales activos - whatsapp e instagram
const channelIcons: Partial<Record<Channel, any>> = {
    whatsapp: WhatsappLogo,
    instagram: InstagramLogo,
    facebook: FacebookLogo,
}

// Lista de canales disponibles para renderizar
const availableChannels: Channel[] = ['whatsapp', 'instagram', 'facebook']

function getChannelIcon(channel: Channel) {
    return channelIcons[channel] || WhatsappLogo
}

// ============================================
// SUB-COMPONENTES
// ============================================

/** Renderiza el contenido multimedia de un mensaje */
function MessageMedia({ msg, onImageClick }: { msg: Message, onImageClick?: (url: string) => void }) {
    const data = (msg.metadata as any)?.data || msg.metadata || {}

    // Detectar URL de media
    let mediaUrl =
        data.mediaUrl ||
        data.media?.links?.download ||
        data.media?.url ||
        data.media?.publicUrl ||
        data.media?.downloadUrl ||
        (data.type === 'image' && data.body?.startsWith('http') ? data.body : null)

    // Buscar URLs en el contenido del mensaje
    if (!mediaUrl && msg.content) {
        const urlRegex = /(https?:\/\/[^\s]+)/g
        const matches = msg.content.match(urlRegex)
        if (matches) {
            const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.pdf', '.csv']
            const foundUrl = matches.find(url => {
                const lower = url.toLowerCase()
                return imageExtensions.some(ext => lower.includes(ext))
            }) || matches[matches.length - 1]
            if (foundUrl) mediaUrl = foundUrl
        }
    }

    if (!mediaUrl) return null

    // Preferir URL almacenada en bucket
    const resolvedUrl = data.storedMediaUrl || mediaUrl
    const lowerUrl = resolvedUrl.toLowerCase()
    const mimeType = data.file?.mimeType || data.media?.mimeType || data.media?.type || data.media?.contentType || data.type
    const lowerMime = (mimeType || '').toLowerCase()

    // Audio se evalúa ANTES que video para evitar conflicto con .ogg
    const isAudio = ['.mp3', '.wav', '.oga', '.m4a', '.aac', '.opus'].some(ext => lowerUrl.includes(ext))
        || lowerMime.startsWith('audio/')
        || data.type === 'audio'
        || data.type === 'ptt'
        || (lowerUrl.includes('.ogg') && !lowerMime.startsWith('video/'))
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].some(ext => lowerUrl.includes(ext))
        || lowerMime.startsWith('image/')
        || (data.type === 'image')
    const isVideo = !isAudio && (
        ['.mp4', '.webm', '.mov'].some(ext => lowerUrl.includes(ext))
        || lowerMime.startsWith('video/')
        || (data.type === 'video')
    )
    const isPdf = lowerUrl.includes('.pdf')

    if (isImage) {
        return (
            <button
                type="button"
                className="mt-2 rounded-md overflow-hidden bg-black/5 cursor-zoom-in focus:outline-none w-full text-left"
                onClick={() => onImageClick?.(resolvedUrl!)}
            >
                <img
                    src={resolvedUrl}
                    alt="Imagen adjunta"
                    className="max-w-full h-auto object-cover max-h-60"
                    loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
            </button>
        )
    }

    if (isAudio) {
        return (
            <div className="mt-2 flex items-center gap-3 bg-muted/50 p-3 rounded-md border border-border max-w-full">
                <div className="bg-gradient-to-br from-green-500 to-green-600 p-2 rounded-full text-white shadow-sm">
                    <Microphone size={20} />
                </div>
                <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1">
                        {data.type === 'ptt' ? '🎤 Nota de voz' : '🔊 Audio'}
                    </p>
                    <audio src={resolvedUrl} controls className="w-full max-w-sm h-8" style={{ maxHeight: '32px' }}>
                        Tu navegador no soporta reproducción de audio.
                    </audio>
                </div>
            </div>
        )
    }

    if (isVideo) {
        return (
            <div className="mt-2 rounded-md overflow-hidden">
                <video src={resolvedUrl} controls className="max-w-full h-auto max-h-60" />
            </div>
        )
    }

    // Archivo genérico (PDF u otro)
    const fileName = resolvedUrl.split('/').pop()?.split('?')[0] || 'Archivo adjunto'
    return (
        <div className="mt-2 flex items-center gap-3 bg-muted/50 p-3 rounded-md border border-border max-w-full hover:bg-muted transition-colors">
            <div className="bg-background p-2 rounded-md text-primary shadow-sm">
                {isPdf ? <FilePdf size={24} weight="duotone" /> : <FileIcon size={24} weight="duotone" />}
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">
                <p className="text-sm font-medium truncate" title={fileName}>{fileName}</p>
                <a
                    href={resolvedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                >
                    Abrir en nueva pestaña
                </a>
            </div>
            <a
                href={resolvedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 hover:bg-background rounded-full transition-colors text-muted-foreground hover:text-foreground"
                title="Descargar"
                download
            >
                <DownloadSimple size={20} />
            </a>
        </div>
    )
}

/** Renderiza el contenido de texto del mensaje */
function MessageContent({ msg }: { msg: Message }) {
    const data = (msg.metadata as any)?.data || msg.metadata || {}
    let mediaUrl =
        data.mediaUrl ||
        data.media?.links?.download ||
        data.media?.url ||
        (data.type === 'image' && data.body?.startsWith('http') ? data.body : null)

    if (!mediaUrl && msg.content) {
        const urlRegex = /(https?:\/\/[^\s]+)/g
        const matches = msg.content.match(urlRegex)
        if (matches) {
            const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.pdf', '.csv', '.mp3', '.wav', '.ogg', '.oga', '.m4a']
            const foundUrl = matches.find(url => {
                const lower = url.toLowerCase()
                return imageExtensions.some(ext => lower.includes(ext))
            }) || matches[matches.length - 1]
            if (foundUrl) mediaUrl = foundUrl
        }
    }

    // Determinar tipo de contenido para badge
    let contentType: string | null = null
    let contentIcon: string | null = null
    if (mediaUrl) {
        const lowerUrl = mediaUrl.toLowerCase()
        const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].some(ext => lowerUrl.includes(ext)) || (data.type === 'image')
        const isVideo = ['.mp4', '.webm', '.mov'].some(ext => lowerUrl.includes(ext)) || (data.type === 'video')
        const isAudio = ['.mp3', '.wav', '.ogg', '.oga', '.m4a', '.aac', '.opus'].some(ext => lowerUrl.includes(ext)) ||
            (data.type === 'audio') || (data.type === 'ptt')
        const isPdf = lowerUrl.includes('.pdf')

        if (isAudio) {
            contentType = data.type === 'ptt' ? 'Nota de voz' : 'Audio'
            contentIcon = '🎤'
        } else if (isImage) {
            contentType = 'Imagen'
            contentIcon = '📷'
        } else if (isVideo) {
            contentType = 'Video'
            contentIcon = '🎬'
        } else if (isPdf) {
            contentType = 'PDF'
            contentIcon = '📄'
        } else {
            contentType = 'Archivo'
            contentIcon = '📎'
        }
    }

    // Si el contenido es solo una URL, no mostrarlo
    if (!msg.content) return null
    if (msg.content.startsWith('http')) return null

    // Si hay mediaUrl, limpiar URLs del texto
    if (mediaUrl) {
        const urlRegex = /https?:\/\/[^\s]+/gi
        const cleanedContent = msg.content.replace(urlRegex, '').trim()
        if (!cleanedContent || cleanedContent.length === 0) return null
        return (
            <div className="space-y-1">
                {contentType && (
                    <div className="inline-flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-medium">
                        <span>{contentIcon}</span>
                        <span>{contentType}</span>
                    </div>
                )}
                <p className="text-sm">{cleanedContent}</p>
            </div>
        )
    }

    return <p className="text-sm">{msg.content}</p>
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export function ChatTab({
    leadId,
    messages,
    selectedChannel,
    onChannelChange,
    messageInput,
    onMessageInputChange,
    onSendMessage,
    onDeleteMessage,
    onDeleteConversation,
    onFileUpload,
    isUploading,
    canEdit,
    canDeleteMessages = true,
    messagesEndRef,
    isRecording,
    recordingTime,
    onStartRecording,
    onStopRecording,
    empresaId,
    leadData,
    translations: t
}: ChatTabProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [historyLimit, setHistoryLimit] = useState(20)
    const [lightboxImage, setLightboxImage] = useState<string | null>(null)
    const [activeDeleteMsgId, setActiveDeleteMsgId] = useState<string | null>(null)

    // ===== Plantillas Meta + Mensajes predeterminados =====
    // Misma lógica que en MessageInput (chat grande) para mantener UX consistente
    const { user, companies, currentCompanyId } = useAuth()
    const currentCompany = companies.find(c => c.id === currentCompanyId)
    const role = (currentCompany?.role || '').toLowerCase()
    const isOwnerByCompany = !!(currentCompany && user && currentCompany.ownerId === user.id)
    const canManageQuickReplies = isOwnerByCompany || role === 'owner' || role === 'admin'

    // Plantillas Meta (solo WhatsApp)
    const [metaTemplates, setMetaTemplates] = useState<MetaFollowUpTemplateDB[]>([])
    const [templatesLoaded, setTemplatesLoaded] = useState(false)
    const [sendingTemplateId, setSendingTemplateId] = useState<string | null>(null)
    const [templatePopoverOpen, setTemplatePopoverOpen] = useState(false)

    const loadTemplates = useCallback(async () => {
        if (!empresaId || selectedChannel !== 'whatsapp' || templatesLoaded) return
        try {
            const list = await listFollowUpTemplates(empresaId)
            setMetaTemplates(list.filter(tpl => tpl.active))
        } catch (err) {
            console.error('[ChatTab] error loading templates', err)
        } finally {
            setTemplatesLoaded(true)
        }
    }, [empresaId, selectedChannel, templatesLoaded])

    const handleSendTemplate = async (template: MetaFollowUpTemplateDB) => {
        setSendingTemplateId(template.id)
        try {
            const res = await sendMetaTemplate({ lead_id: leadId, template_id: template.id })
            if (!res.ok) {
                toast.error(res.error || 'No se pudo enviar la plantilla')
                return
            }
            toast.success(`Plantilla "${template.display_label || template.meta_template_name}" enviada`)
            setTemplatePopoverOpen(false)
        } catch (err: any) {
            console.error('[ChatTab] sendTemplate error', err)
            toast.error(err?.message || 'Error enviando plantilla')
        } finally {
            setSendingTemplateId(null)
        }
    }

    // Mensajes predeterminados (Quick Replies) — disponibles en todos los canales
    const [quickReplies, setQuickReplies] = useState<QuickReply[]>([])
    const [quickRepliesLoaded, setQuickRepliesLoaded] = useState(false)
    const [quickRepliesLoading, setQuickRepliesLoading] = useState(false)
    const [quickReplyPopoverOpen, setQuickReplyPopoverOpen] = useState(false)
    const [quickReplySearch, setQuickReplySearch] = useState('')
    const [formMode, setFormMode] = useState<'list' | 'create' | 'edit'>('list')
    const [formEditingId, setFormEditingId] = useState<string | null>(null)
    const [formTitle, setFormTitle] = useState('')
    const [formContent, setFormContent] = useState('')
    const [formSaving, setFormSaving] = useState(false)
    const formContentRef = useRef<HTMLTextAreaElement>(null)

    const loadQuickReplies = useCallback(async () => {
        if (!empresaId || quickRepliesLoaded) return
        setQuickRepliesLoading(true)
        try {
            const list = await listQuickReplies(empresaId)
            setQuickReplies(list)
        } catch (err) {
            console.error('[ChatTab] error loading quick replies', err)
        } finally {
            setQuickRepliesLoaded(true)
            setQuickRepliesLoading(false)
        }
    }, [empresaId, quickRepliesLoaded])

    const filteredQuickReplies = useMemo(() => {
        const q = quickReplySearch.trim().toLowerCase()
        if (!q) return quickReplies
        return quickReplies.filter(qr =>
            qr.title.toLowerCase().includes(q) || qr.content.toLowerCase().includes(q)
        )
    }, [quickReplies, quickReplySearch])

    const resetForm = () => {
        setFormMode('list')
        setFormEditingId(null)
        setFormTitle('')
        setFormContent('')
    }

    const handleUseQuickReply = (qr: QuickReply) => {
        const rendered = renderQuickReply(qr.content, {
            name: leadData?.name,
            company: leadData?.company,
            phone: leadData?.phone,
        })
        onMessageInputChange(rendered)
        setQuickReplyPopoverOpen(false)
        resetForm()
        setQuickReplySearch('')
    }

    const handleStartCreate = () => {
        setFormMode('create')
        setFormEditingId(null)
        setFormTitle('')
        setFormContent('')
        setTimeout(() => formContentRef.current?.focus(), 0)
    }

    const handleStartEdit = (qr: QuickReply) => {
        setFormMode('edit')
        setFormEditingId(qr.id)
        setFormTitle(qr.title)
        setFormContent(qr.content)
        setTimeout(() => formContentRef.current?.focus(), 0)
    }

    const handleSaveForm = async () => {
        if (!empresaId) return
        const title = formTitle.trim()
        const content = formContent.trim()
        if (!title || !content) {
            toast.error('Título y contenido son obligatorios')
            return
        }
        setFormSaving(true)
        try {
            if (formMode === 'edit' && formEditingId) {
                await updateQuickReply(formEditingId, { title, content })
                setQuickReplies(prev =>
                    prev
                        .map(qr => qr.id === formEditingId ? { ...qr, title, content } : qr)
                        .sort((a, b) => a.title.localeCompare(b.title))
                )
                toast.success('Mensaje predeterminado actualizado')
            } else {
                const created = await createQuickReply(empresaId, { title, content })
                setQuickReplies(prev =>
                    [...prev, created].sort((a, b) => a.title.localeCompare(b.title))
                )
                toast.success('Mensaje predeterminado creado')
            }
            resetForm()
        } catch (err: any) {
            console.error('[ChatTab] save quick reply error', err)
            toast.error(err?.message || 'Error guardando el mensaje')
        } finally {
            setFormSaving(false)
        }
    }

    const handleDeleteQuickReply = async (qr: QuickReply) => {
        if (!confirm(`¿Eliminar el mensaje "${qr.title}"? Esta acción no se puede deshacer.`)) return
        try {
            await deleteQuickReply(qr.id)
            setQuickReplies(prev => prev.filter(x => x.id !== qr.id))
            toast.success('Mensaje eliminado')
        } catch (err: any) {
            console.error('[ChatTab] delete quick reply error', err)
            toast.error(err?.message || 'No se pudo eliminar el mensaje')
        }
    }

    const insertVariableInForm = (varKey: string) => {
        const ta = formContentRef.current
        if (!ta) return
        const token = `{${varKey}}`
        const start = ta.selectionStart ?? formContent.length
        const end = ta.selectionEnd ?? formContent.length
        const next = formContent.slice(0, start) + token + formContent.slice(end)
        setFormContent(next)
        setTimeout(() => {
            ta.focus()
            const pos = start + token.length
            ta.setSelectionRange(pos, pos)
        }, 0)
    }

    // Dismiss delete button when tapping outside
    useEffect(() => {
        if (!activeDeleteMsgId) return
        const dismiss = () => setActiveDeleteMsgId(null)
        document.addEventListener('click', dismiss)
        return () => document.removeEventListener('click', dismiss)
    }, [activeDeleteMsgId])

    const filteredMessages = messages.filter(m => m.channel === selectedChannel)
    const displayedMessages = filteredMessages.slice(-historyLimit)
    const hasMoreHistory = filteredMessages.length > historyLimit

    // Auto-scroll to bottom when channel changes
    useEffect(() => {
        // Timeout ensures layout is complete
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
        }, 50)
    }, [selectedChannel])

    // Reset history limit when channel changes
    useEffect(() => {
        setHistoryLimit(20)
    }, [selectedChannel])

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (file.size > 16 * 1024 * 1024) {
            toast.error('El archivo es muy grande. Máximo 16MB')
            return
        }
        await onFileUpload(file)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    return (
        <div className="flex-1 flex flex-col px-3 sm:px-6 py-2 sm:py-6 sm:overflow-hidden overflow-visible h-auto sm:h-full min-h-0">
            {/* Channel Selector & Clear Button */}
            <div className="flex justify-between items-start mb-1 flex-shrink-0">
                <div className="flex gap-1.5 flex-wrap">
                    {availableChannels.map(channel => {
                        const Icon = getChannelIcon(channel)
                        return (
                            <Button
                                key={channel}
                                variant={selectedChannel === channel ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => onChannelChange(channel)}
                                className="h-7 text-xs px-2"
                            >
                                <Icon size={14} className="mr-1.5" />
                                {channel}
                            </Button>
                        )
                    })}
                </div>

                {canDeleteMessages && canEdit && messages.length > 0 && (
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                                <Trash size={16} className="mr-2" />
                                Limpiar
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>¿Eliminar conversación?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Esta acción eliminará todos los mensajes de este lead permanentemente.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={onDeleteConversation} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    Eliminar
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}
            </div>

            {/* Messages List - Mobile: Grow auto (external scroll), Desktop: ScrollArea (internal) */}
            <div className="flex-1 pr-1 sm:pr-4 mb-2 sm:min-h-0 h-auto sm:h-full sm:overflow-hidden">
                <ScrollArea className="h-full">
                    <div className="space-y-3 pb-2">
                        {hasMoreHistory && (
                            <div className="text-center py-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setHistoryLimit(prev => prev + 20)}
                                    className="text-xs text-muted-foreground"
                                >
                                    Cargar mensajes anteriores
                                </Button>
                            </div>
                        )}
                        {displayedMessages.map((msg, idx) => {
                            const msgDate = safeFormatDate(msg.timestamp, 'yyyy-MM-dd')
                            const prevMsgDate = idx > 0 ? safeFormatDate(displayedMessages[idx - 1].timestamp, 'yyyy-MM-dd') : null
                            const showDateLabel = msgDate !== prevMsgDate

                            return (
                                <div key={msg.id || idx} className="contents">
                                    {showDateLabel && (
                                        <div className="flex justify-center my-6">
                                            <span className="px-3 py-1 bg-muted border border-border/40 text-[10px] font-bold text-muted-foreground rounded-full uppercase tracking-wider shadow-sm">
                                                {safeFormatDate(msg.timestamp, "EEEE, d 'de' MMMM")}
                                            </span>
                                        </div>
                                    )}
                                    <div
                                        className={cn(
                                            'group relative p-3 rounded-lg max-w-[80%] mb-2 cursor-pointer sm:cursor-default',
                                            msg.sender === 'team'
                                                ? 'ml-auto bg-primary text-primary-foreground'
                                                : 'mr-auto bg-muted',
                                            canDeleteMessages && activeDeleteMsgId === msg.id && 'ring-2 ring-destructive/50 scale-[0.97] transition-transform'
                                        )}
                                        onClick={() => {
                                            if (!canDeleteMessages) return
                                            if (activeDeleteMsgId === msg.id) {
                                                onDeleteMessage(msg.id)
                                                setActiveDeleteMsgId(null)
                                            } else {
                                                setActiveDeleteMsgId(msg.id)
                                            }
                                        }}
                                    >
                                        {canDeleteMessages && (
                                            <>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onDeleteMessage(msg.id)
                                                    setActiveDeleteMsgId(null)
                                                }}
                                                className={cn(
                                                    "absolute -top-3 p-2 rounded-full bg-destructive text-white transition-all shadow-lg z-20",
                                                    "opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100",
                                                    activeDeleteMsgId === msg.id && "!opacity-100 !scale-100",
                                                    msg.sender === 'team' ? "-left-3" : "-right-3"
                                                )}
                                                title="Eliminar mensaje"
                                            >
                                                <Trash size={14} weight="bold" />
                                            </button>
                                            {activeDeleteMsgId === msg.id && (
                                                <div className={cn(
                                                    "absolute -top-8 z-30 px-2.5 py-1 rounded-lg bg-destructive text-white text-[11px] font-semibold shadow-lg animate-in fade-in zoom-in-95 duration-200 whitespace-nowrap sm:hidden",
                                                    msg.sender === 'team' ? "right-0" : "left-0"
                                                )}>
                                                    Toca de nuevo para eliminar
                                                </div>
                                            )}
                                            </>
                                        )}

                                        <MessageContent msg={msg} />
                                        <MessageMedia msg={msg} onImageClick={setLightboxImage} />

                                        <div className="flex justify-between items-center mt-1 opacity-70">
                                            <span className="text-xs">{safeFormatDate(msg.timestamp, 'h:mm a')}</span>
                                            {msg.sender === 'team' && (
                                                (msg.metadata as any)?.error ? (
                                                    <span title="Error enviando a WhatsApp">
                                                        <WarningCircle className="w-3.5 h-3.5 text-red-500 ml-1" weight="fill" />
                                                    </span>
                                                ) : (
                                                    msg.read ? <Check size={14} weight="bold" className="text-blue-500 ml-1" /> : <Check size={14} className="ml-1" />
                                                )
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                        <div ref={messagesEndRef} />
                        {filteredMessages.length === 0 && (
                            <p className="text-center text-muted-foreground text-sm py-8">
                                {t.noMessages}
                            </p>
                        )}
                    </div>
                </ScrollArea>
            </div>

            {/* Input Area */}
            <div className="flex flex-wrap gap-1 sm:gap-2 items-center">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                    onChange={handleFileChange}
                    className="hidden"
                />
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!canEdit || isUploading}
                    title="Adjuntar archivo"
                >
                    {isUploading ? <Spinner size={20} className="animate-spin" /> : <Paperclip size={20} />}
                </Button>

                {empresaId && (
                    <Popover
                        open={quickReplyPopoverOpen}
                        onOpenChange={(o) => {
                            setQuickReplyPopoverOpen(o)
                            if (o) loadQuickReplies()
                            else resetForm()
                        }}
                    >
                        <PopoverTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                disabled={!canEdit || isUploading}
                                title="Mensajes predeterminados"
                                className="text-muted-foreground hover:text-violet-600"
                            >
                                <ChatText size={20} weight="duotone" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent
                            align="start"
                            side="top"
                            className="w-[22rem] p-0 rounded-2xl overflow-hidden"
                        >
                            <div className="px-4 py-3 border-b border-border/40 bg-violet-500/5">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <ChatText size={16} weight="duotone" className="text-violet-600 shrink-0" />
                                        <span className="text-sm font-bold truncate">
                                            {formMode === 'list' ? 'Mensajes predeterminados'
                                                : formMode === 'create' ? 'Nuevo mensaje'
                                                : 'Editar mensaje'}
                                        </span>
                                    </div>
                                    {formMode !== 'list' && (
                                        <button
                                            type="button"
                                            onClick={resetForm}
                                            className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted shrink-0"
                                            title="Volver al listado"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                                {formMode === 'list' && (
                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                        Selecciona uno para usarlo. Las variables se reemplazan automáticamente.
                                    </p>
                                )}
                            </div>

                            {formMode === 'list' ? (
                                <>
                                    <div className="px-3 pt-3">
                                        <div className="relative">
                                            <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                                            <Input
                                                value={quickReplySearch}
                                                onChange={(e) => setQuickReplySearch(e.target.value)}
                                                placeholder="Buscar por título o contenido..."
                                                className="pl-8 pr-8 h-9 text-xs"
                                            />
                                            {quickReplySearch && (
                                                <button
                                                    type="button"
                                                    onClick={() => setQuickReplySearch('')}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
                                                    aria-label="Limpiar"
                                                >
                                                    <X size={12} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="max-h-72 overflow-y-auto p-2">
                                        {quickRepliesLoading && !quickRepliesLoaded ? (
                                            <p className="text-xs text-muted-foreground text-center py-6">Cargando…</p>
                                        ) : quickReplies.length === 0 ? (
                                            <div className="text-center py-6 px-3 space-y-1">
                                                <p className="text-xs font-semibold">Sin mensajes predeterminados</p>
                                                <p className="text-[11px] text-muted-foreground">
                                                    {canManageQuickReplies
                                                        ? 'Crea el primero con el botón de abajo.'
                                                        : 'Pídele a un administrador que cree algunos.'}
                                                </p>
                                            </div>
                                        ) : filteredQuickReplies.length === 0 ? (
                                            <p className="text-xs text-muted-foreground text-center py-6">
                                                No se encontraron mensajes para "{quickReplySearch}".
                                            </p>
                                        ) : (
                                            filteredQuickReplies.map((qr) => (
                                                <div
                                                    key={qr.id}
                                                    className="group flex items-start gap-1 p-2 rounded-xl hover:bg-muted/60 transition-colors"
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => handleUseQuickReply(qr)}
                                                        className="flex-1 min-w-0 text-left"
                                                    >
                                                        <div className="text-sm font-bold truncate">{qr.title}</div>
                                                        <p className="text-[11px] text-muted-foreground line-clamp-2 whitespace-pre-wrap mt-0.5">
                                                            {qr.content}
                                                        </p>
                                                    </button>
                                                    {canManageQuickReplies && (
                                                        <div className="flex flex-col gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleStartEdit(qr)}
                                                                className="p-1 rounded-md hover:bg-background text-muted-foreground hover:text-foreground"
                                                                title="Editar"
                                                            >
                                                                <PencilSimple size={12} weight="bold" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteQuickReply(qr)}
                                                                className="p-1 rounded-md hover:bg-background text-muted-foreground hover:text-destructive"
                                                                title="Eliminar"
                                                            >
                                                                <Trash size={12} weight="bold" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    {canManageQuickReplies && (
                                        <div className="p-2 border-t border-border/40">
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                onClick={handleStartCreate}
                                                className="w-full justify-start gap-2 text-violet-600 hover:text-violet-700 hover:bg-violet-500/10"
                                            >
                                                <Plus size={14} weight="bold" />
                                                Crear mensaje predeterminado
                                            </Button>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="p-3 space-y-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                            Título
                                        </label>
                                        <Input
                                            value={formTitle}
                                            onChange={(e) => setFormTitle(e.target.value)}
                                            placeholder="ej: Saludo inicial"
                                            className="h-9 text-sm"
                                            disabled={formSaving}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                            Contenido del mensaje
                                        </label>
                                        <textarea
                                            ref={formContentRef}
                                            value={formContent}
                                            onChange={(e) => setFormContent(e.target.value)}
                                            placeholder="Hola {nombre}, gracias por contactarnos…"
                                            rows={4}
                                            className="w-full text-sm rounded-md border border-input bg-background px-3 py-2 placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                                            disabled={formSaving}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                            Insertar variable
                                        </label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {QUICK_REPLY_VARIABLES.map(v => (
                                                <button
                                                    key={v.key}
                                                    type="button"
                                                    onClick={() => insertVariableInForm(v.key)}
                                                    disabled={formSaving}
                                                    className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-violet-500/10 text-violet-700 hover:bg-violet-500/20 transition-colors disabled:opacity-50"
                                                    title={v.label}
                                                >
                                                    {`{${v.key}}`}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-end gap-2 pt-1">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={resetForm}
                                            disabled={formSaving}
                                            className="h-8"
                                        >
                                            Cancelar
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={handleSaveForm}
                                            disabled={formSaving || !formTitle.trim() || !formContent.trim()}
                                            className="h-8 gap-1.5"
                                        >
                                            {formSaving ? (
                                                <Spinner size={12} className="animate-spin" />
                                            ) : (
                                                <Check size={12} weight="bold" />
                                            )}
                                            Guardar
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </PopoverContent>
                    </Popover>
                )}

                {selectedChannel === 'whatsapp' && empresaId && (
                    <Popover
                        open={templatePopoverOpen}
                        onOpenChange={(o) => {
                            setTemplatePopoverOpen(o)
                            if (o) loadTemplates()
                        }}
                    >
                        <PopoverTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                disabled={!canEdit || isUploading}
                                title="Enviar plantilla de WhatsApp"
                                className="text-muted-foreground hover:text-green-600"
                            >
                                <FileText size={20} weight="duotone" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent
                            align="start"
                            side="top"
                            className="w-80 p-0 rounded-2xl overflow-hidden"
                        >
                            <div className="px-4 py-3 border-b border-border/40 bg-green-500/5">
                                <div className="flex items-center gap-2">
                                    <WhatsappLogo size={16} weight="duotone" className="text-green-600" />
                                    <span className="text-sm font-bold">Plantillas Meta</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                    Envía una plantilla aprobada a este lead.
                                </p>
                            </div>
                            <div className="max-h-72 overflow-y-auto p-2">
                                {!templatesLoaded ? (
                                    <p className="text-xs text-muted-foreground text-center py-6">Cargando…</p>
                                ) : metaTemplates.length === 0 ? (
                                    <div className="text-center py-6 px-3 space-y-1">
                                        <p className="text-xs font-semibold">Sin plantillas activas</p>
                                        <p className="text-[11px] text-muted-foreground">
                                            Configura plantillas en Configuración → Plantillas Meta.
                                        </p>
                                    </div>
                                ) : (
                                    metaTemplates.map((tpl) => (
                                        <button
                                            key={tpl.id}
                                            type="button"
                                            disabled={sendingTemplateId !== null}
                                            onClick={() => handleSendTemplate(tpl)}
                                            className="w-full text-left p-2.5 rounded-xl hover:bg-muted/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
                                        >
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <span className="text-sm font-bold truncate">
                                                    {tpl.display_label || tpl.meta_template_name}
                                                </span>
                                                <span className="text-[9px] uppercase font-mono text-muted-foreground shrink-0">
                                                    {tpl.meta_template_language}
                                                </span>
                                            </div>
                                            {tpl.body_preview && (
                                                <p className="text-[11px] text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                                                    {tpl.body_preview}
                                                </p>
                                            )}
                                            {sendingTemplateId === tpl.id && (
                                                <p className="text-[10px] text-green-600 font-semibold mt-1 flex items-center gap-1">
                                                    <Spinner size={10} className="animate-spin" /> Enviando…
                                                </p>
                                            )}
                                        </button>
                                    ))
                                )}
                            </div>
                        </PopoverContent>
                    </Popover>
                )}

                <Input
                    value={messageInput}
                    onChange={(e) => onMessageInputChange(e.target.value)}
                    placeholder={t.typeMessage}
                    onKeyDown={(e) => e.key === 'Enter' && !isUploading && onSendMessage()}
                    disabled={!canEdit || isUploading}
                    className="flex-1 min-w-0"
                />
                <Button onClick={onSendMessage} disabled={!canEdit || isUploading || isRecording}>
                    <PaperPlaneRight size={20} />
                </Button>

                {/* Audio Recording Button */}
                <Button
                    variant={isRecording ? "destructive" : "ghost"}
                    size="icon"
                    disabled={!canEdit || isUploading}
                    title={isRecording ? "Detener grabación" : "Grabar nota de voz"}
                    onClick={() => {
                        if (isRecording) {
                            onStopRecording()
                        } else {
                            onStartRecording()
                        }
                    }}
                >
                    {isRecording ? (
                        <Stop size={20} weight="fill" />
                    ) : (
                        <Microphone size={20} />
                    )}
                </Button>

                {/* Recording Time Indicator */}
                {isRecording && (
                    <div className="flex items-center gap-2 text-destructive animate-pulse">
                        <div className="w-2 h-2 rounded-full bg-destructive" />
                        <span className="text-sm font-mono">
                            {Math.floor(recordingTime / 60).toString().padStart(2, '0')}:{(recordingTime % 60).toString().padStart(2, '0')}
                        </span>
                    </div>
                )}
            </div>

            {/* Lightbox para imágenes */}
            {lightboxImage && (
                <div role="dialog" aria-modal="true" className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setLightboxImage(null)}>
                    <div className="relative max-w-[90vw] max-h-[90vh]">
                        <button
                            title="Cerrar (Click afuera también cierra)"
                            className="absolute -top-4 -right-4 bg-background/20 hover:bg-background/40 backdrop-blur-md text-white rounded-full p-2 transition-all"
                            onClick={() => setLightboxImage(null)}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"></path></svg>
                        </button>
                        <img
                            src={lightboxImage}
                            alt="Vista ampliada"
                            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
