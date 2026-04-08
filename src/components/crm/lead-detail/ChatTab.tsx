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

import { useRef, useState, useEffect } from 'react'
import { Message, Channel } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
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
    WarningCircle
} from '@phosphor-icons/react'
import { safeFormatDate } from '@/hooks/useDateFormat'

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
    messagesEndRef: React.RefObject<HTMLDivElement>
    // Audio recording
    isRecording: boolean
    recordingTime: number
    onStartRecording: () => void
    onStopRecording: () => void
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
    messagesEndRef,
    isRecording,
    recordingTime,
    onStartRecording,
    onStopRecording,
    translations: t
}: ChatTabProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [historyLimit, setHistoryLimit] = useState(20)
    const [lightboxImage, setLightboxImage] = useState<string | null>(null)
    const [activeDeleteMsgId, setActiveDeleteMsgId] = useState<string | null>(null)

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

                {canEdit && messages.length > 0 && (
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
                                                : 'mr-auto bg-muted'
                                        )}
                                        onClick={() => {
                                            if (!canEdit) return
                                            setActiveDeleteMsgId(prev => prev === msg.id ? null : msg.id)
                                        }}
                                    >
                                        {canEdit && (
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
