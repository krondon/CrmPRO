/**
 * MessageInput Component
 * 
 * Input de mensajes con soporte para:
 * - Texto
 * - Imágenes (paste/drag desde clipboard)
 * - Notas de voz (useAudioRecorder)
 * - Archivos adjuntos
 */

import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
    PaperPlaneRight,
    Paperclip,
    Microphone,
    Smiley,
    Stop,
    Spinner,
    X,
    DeviceMobile,
    Sparkle,
    FileText,
    WhatsappLogo,
    ChatText,
    MagnifyingGlass,
    Plus,
    PencilSimple,
    Trash,
    Check,
    Clock,
    InstagramLogo,
    FacebookLogo
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { useAuth } from '@/hooks/useAuth'
import { sendMessage, uploadChatAttachment } from '@/supabase/services/mensajes'
import type { Message } from '@/supabase/services/mensajes'
import { listFollowUpTemplates, sendMetaTemplate } from '@/supabase/services/metaTemplates'
import {
    listQuickReplies,
    createQuickReply,
    updateQuickReply,
    deleteQuickReply,
    renderQuickReply,
    QUICK_REPLY_VARIABLES
} from '@/supabase/services/quickReplies'
import type { MetaFollowUpTemplateDB, QuickReply } from '@/lib/types'

import { Channel } from '@/lib/types'

interface MessageInputProps {
    leadId: string
    channel: 'whatsapp' | 'instagram' | 'facebook'
    disabled?: boolean
    instanceLabel?: string | null
    empresaId?: string
    onMessageSent?: (msg?: Message) => void
    isAiEnabled?: boolean
    onAiClick?: () => void
    suggestion?: { text: string; ts: number } | null
    /**
     * Datos del lead para reemplazar variables {nombre}, {empresa}, {telefono}
     * en los mensajes predeterminados cuando se seleccionan.
     */
    leadData?: { name?: string | null; company?: string | null; phone?: string | null }
    /**
     * Si la ventana de servicio de 24h de Meta está cerrada para este chat
     * (Instagram/Facebook sin mensaje del cliente en las últimas 24h). Cuando
     * no es null, se bloquea el envío y se muestra una barra de estado en lugar
     * del input. Se rehabilita solo cuando el cliente vuelve a escribir.
     */
    windowClosedChannel?: 'instagram' | 'facebook' | null
}

export function MessageInput({
    leadId,
    channel,
    disabled = false,
    instanceLabel,
    empresaId,
    onMessageSent,
    isAiEnabled = false,
    onAiClick,
    suggestion,
    leadData,
    windowClosedChannel = null,
}: MessageInputProps) {
    // Ventana de 24h de Meta cerrada: bloquea todo envío en este chat.
    const isWindowClosed = windowClosedChannel !== null
    // Solo admin/owner pueden crear, editar y eliminar mensajes predeterminados.
    // Cualquier miembro del equipo puede leer y usarlos.
    const { user, companies, currentCompanyId } = useAuth()
    const currentCompany = companies.find(c => c.id === currentCompanyId)
    const role = (currentCompany?.role || '').toLowerCase()
    const isOwnerByCompany = !!(currentCompany && user && currentCompany.ownerId === user.id)
    const canManageQuickReplies = isOwnerByCompany || role === 'owner' || role === 'admin'
    const [messageInput, setMessageInput] = useState('')
    const [isUploading, setIsUploading] = useState(false)
    const [pendingImages, setPendingImages] = useState<Array<{ file: File; preview: string }>>([])
    const fileInputRef = useRef<HTMLInputElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // Auto-resize del textarea según el contenido (crece hasta MAX_HEIGHT y luego scroll interno)
    useLayoutEffect(() => {
        const ta = textareaRef.current
        if (!ta) return
        const MAX_HEIGHT = 180 // ~7-8 líneas antes de mostrar scroll
        ta.style.height = 'auto'
        const next = Math.min(ta.scrollHeight, MAX_HEIGHT)
        ta.style.height = `${next}px`
        ta.style.overflowY = ta.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden'
    }, [messageInput])

    // Plantillas Meta (solo WhatsApp)
    const [metaTemplates, setMetaTemplates] = useState<MetaFollowUpTemplateDB[]>([])
    const [templatesLoaded, setTemplatesLoaded] = useState(false)
    const [sendingTemplateId, setSendingTemplateId] = useState<string | null>(null)
    const [templatePopoverOpen, setTemplatePopoverOpen] = useState(false)

    const loadTemplates = useCallback(async () => {
        if (!empresaId || channel !== 'whatsapp' || templatesLoaded) return
        try {
            const list = await listFollowUpTemplates(empresaId)
            setMetaTemplates(list.filter(t => t.active))
        } catch (err) {
            console.error('[MessageInput] error loading templates', err)
        } finally {
            setTemplatesLoaded(true)
        }
    }, [empresaId, channel, templatesLoaded])

    // ============================================================
    // Mensajes predeterminados (Quick Replies)
    // Disponibles en todos los canales. La gestión (crear/editar/
    // eliminar) está restringida a admin/owner vía isFullAccess.
    // ============================================================
    const [quickReplies, setQuickReplies] = useState<QuickReply[]>([])
    const [quickRepliesLoaded, setQuickRepliesLoaded] = useState(false)
    const [quickRepliesLoading, setQuickRepliesLoading] = useState(false)
    const [quickReplyPopoverOpen, setQuickReplyPopoverOpen] = useState(false)
    const [quickReplySearch, setQuickReplySearch] = useState('')
    // Form state (compartido entre crear y editar)
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
            console.error('[MessageInput] error loading quick replies', err)
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
        setMessageInput(rendered)
        setQuickReplyPopoverOpen(false)
        resetForm()
        setQuickReplySearch('')
        // Foco al textarea para edición rápida
        setTimeout(() => textareaRef.current?.focus(), 0)
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
            console.error('[MessageInput] save quick reply error', err)
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
            console.error('[MessageInput] delete quick reply error', err)
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
        // Reposicionar cursor justo después del token insertado
        setTimeout(() => {
            ta.focus()
            const pos = start + token.length
            ta.setSelectionRange(pos, pos)
        }, 0)
    }

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
            onMessageSent?.()
        } catch (err: any) {
            console.error('[MessageInput] sendTemplate error', err)
            toast.error(err?.message || 'Error enviando plantilla')
        } finally {
            setSendingTemplateId(null)
        }
    }

    // Apply suggestion from AI agent panel
    useEffect(() => {
        if (suggestion?.text) setMessageInput(suggestion.text)
    }, [suggestion])

    // Hook de grabación de audio
    const handleAudioReady = useCallback(async (audioBlob: Blob, audioFile: File) => {
        if (isWindowClosed) return
        setIsUploading(true)
        try {
            const mediaData = await uploadChatAttachment(audioFile, leadId)
            mediaData.ptt = true
            mediaData.mimetype = audioFile.type || 'audio/ogg; codecs=opus'
            const msg = await sendMessage(leadId, '', 'team', channel, mediaData)
            toast.success('Nota de voz enviada')
            onMessageSent?.(msg)
        } catch (err) {
            console.error('[Audio] Error sending:', err)
            toast.error('Error enviando nota de voz')
        } finally {
            setIsUploading(false)
        }
    }, [leadId, channel, onMessageSent, isWindowClosed])

    const { isRecording, recordingTime, startRecording, stopRecording } = useAudioRecorder({
        onAudioReady: handleAudioReady,
        onError: (error) => toast.error(error.message || 'No se pudo acceder al micrófono')
    })

    // Manejo de imágenes pendientes
    const removePendingImage = (preview: string) => {
        setPendingImages(prev => {
            const next = prev.filter(p => p.preview !== preview)
            URL.revokeObjectURL(preview)
            return next
        })
    }

    const clearPendingImages = () => {
        setPendingImages(prev => {
            prev.forEach(p => URL.revokeObjectURL(p.preview))
            return []
        })
    }

    // Paste de imágenes desde clipboard
    const handlePasteClipboard = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const items = Array.from(e.clipboardData?.items || [])
        const images = items.filter(item => item.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean) as File[]
        if (!images.length) return

        e.preventDefault()
        const validImages = images.filter(file => file.size <= 16 * 1024 * 1024)
        if (validImages.length !== images.length) {
            toast.error('Alguna imagen supera 16MB y fue descartada')
        }
        if (!validImages.length) return

        const mapped = validImages.map(file => ({ file, preview: URL.createObjectURL(file) }))
        setPendingImages(prev => [...prev, ...mapped])
    }

    // Enviar mensaje
    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault()
        if (isWindowClosed) return
        if (!messageInput.trim() && pendingImages.length === 0) return
        setIsUploading(true)
        try {
            let sentMsg: Message | undefined
            if (pendingImages.length > 0) {
                for (let i = 0; i < pendingImages.length; i++) {
                    const { file } = pendingImages[i]
                    const mediaData = await uploadChatAttachment(file, leadId)
                    const content = i === 0 ? messageInput : ''
                    sentMsg = await sendMessage(leadId, content, 'team', channel, mediaData)
                }
            } else {
                sentMsg = await sendMessage(leadId, messageInput, 'team', channel)
            }

            setMessageInput('')
            clearPendingImages()
            onMessageSent?.(sentMsg)
        } catch (e) {
            console.error('Error sending message:', e)
            toast.error('Error al enviar mensaje')
        } finally {
            setIsUploading(false)
        }
    }

    // Selección de archivos (cualquier tipo, máximo 16MB)
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isWindowClosed) { e.target.value = ''; return }
        const file = e.target.files?.[0]
        if (!file) return

        if (file.size > 16 * 1024 * 1024) {
            toast.error('El archivo es muy grande. Máximo 16MB')
            e.target.value = ''
            return
        }

        // Enviar archivo directamente
        setIsUploading(true)
        try {
            const mediaData = await uploadChatAttachment(file, leadId)
            await sendMessage(leadId, messageInput || '', 'team', channel, mediaData)
            setMessageInput('')
            toast.success('Archivo enviado')
            onMessageSent?.()
        } catch (err) {
            console.error('Error enviando archivo:', err)
            toast.error('Error enviando archivo')
        } finally {
            setIsUploading(false)
            e.target.value = ''
        }
    }

    // Ventana de 24h cerrada (Instagram/Facebook): sustituir el input por una
    // barra de estado bloqueado. El asesor no puede enviar nada hasta que el
    // cliente vuelva a escribir (lo que reabre la ventana automáticamente).
    if (isWindowClosed) {
        const isInstagram = windowClosedChannel === 'instagram'
        const platformName = isInstagram ? 'Instagram' : 'Facebook'
        const PlatformIcon = isInstagram ? InstagramLogo : FacebookLogo
        return (
            <div className="shrink-0 border-t bg-background px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                    <div className="shrink-0 mt-0.5 p-1.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                        <Clock size={18} weight="fill" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                            <PlatformIcon size={14} weight="fill" className="shrink-0" />
                            Ventana de 24 h cerrada
                        </p>
                        <p className="text-[12px] leading-relaxed text-amber-700/90 dark:text-amber-200/80 mt-0.5">
                            No puedes escribir a este contacto de {platformName} hasta que vuelva a
                            enviarte un mensaje. Responder fuera de esta ventana va contra las políticas
                            de Meta y puede ocasionar la suspensión de la cuenta.
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="shrink-0 border-t bg-background px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {/* Indicador de instancia activa */}
            {instanceLabel && (
                <div className="flex items-center gap-1.5 mb-2 px-1">
                    <DeviceMobile size={12} className="text-emerald-600 shrink-0" weight="fill" />
                    <span className="text-[11px] text-muted-foreground">
                        Responderás desde: <strong className="text-emerald-600 font-semibold">{instanceLabel}</strong>
                    </span>
                </div>
            )}
            {/* Preview de imágenes pendientes */}
            {pendingImages.length > 0 && (
                <div className="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-thin">
                    {pendingImages.map((img, idx) => (
                        <div key={idx} className="relative shrink-0 group">
                            <img
                                src={img.preview}
                                alt="pending"
                                className="h-20 w-20 object-cover rounded-xl border-2 border-primary/30 shadow-lg"
                            />
                            <button
                                type="button"
                                onClick={() => removePendingImage(img.preview)}
                                className="absolute -top-2 -right-2 bg-destructive text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <X weight="bold" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <form onSubmit={handleSendMessage} className="relative flex items-end gap-2">
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                    onChange={handleFileSelect}
                />
                <button
                    type="button"
                    className="text-muted-foreground hover:text-primary transition-colors p-2 rounded-full hover:bg-muted min-h-11 min-w-11"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={disabled || isUploading}
                >
                    <Paperclip className="w-5 h-5" />
                </button>

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
                            <button
                                type="button"
                                className="text-muted-foreground hover:text-violet-600 transition-colors p-2 rounded-full hover:bg-muted min-h-11 min-w-11 flex items-center justify-center"
                                disabled={disabled || isUploading}
                                title="Mensajes predeterminados"
                            >
                                <ChatText className="w-5 h-5" weight="duotone" />
                            </button>
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
                                    {/* Buscador */}
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

                                    {/* Listado */}
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

                                    {/* Botón crear (solo admin/owner) */}
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
                                /* Formulario crear/editar */
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

                {channel === 'whatsapp' && empresaId && (
                    <Popover
                        open={templatePopoverOpen}
                        onOpenChange={(o) => {
                            setTemplatePopoverOpen(o)
                            if (o) loadTemplates()
                        }}
                    >
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                className="text-muted-foreground hover:text-green-600 transition-colors p-2 rounded-full hover:bg-muted min-h-11 min-w-11 flex items-center justify-center"
                                disabled={disabled || isUploading}
                                title="Enviar plantilla de WhatsApp"
                            >
                                <FileText className="w-5 h-5" weight="duotone" />
                            </button>
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
                                    metaTemplates.map((t) => (
                                        <button
                                            key={t.id}
                                            type="button"
                                            disabled={sendingTemplateId !== null}
                                            onClick={() => handleSendTemplate(t)}
                                            className="w-full text-left p-2.5 rounded-xl hover:bg-muted/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
                                        >
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <span className="text-sm font-bold truncate">
                                                    {t.display_label || t.meta_template_name}
                                                </span>
                                                <span className="text-[9px] uppercase font-mono text-muted-foreground shrink-0">
                                                    {t.meta_template_language}
                                                </span>
                                            </div>
                                            {t.body_preview && (
                                                <p className="text-[11px] text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                                                    {t.body_preview}
                                                </p>
                                            )}
                                            {sendingTemplateId === t.id && (
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

                <div className="flex-1 flex items-end gap-2 bg-muted/50 border border-border/50 rounded-3xl px-4 py-2 focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/50 transition-all min-h-11">
                    <textarea
                        ref={textareaRef}
                        rows={1}
                        placeholder={isRecording ? "Grabando audio..." : "Escribe un mensaje..."}
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        onPaste={handlePasteClipboard}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                e.currentTarget.form?.requestSubmit()
                            }
                        }}
                        className="flex-1 self-center border-0 bg-transparent outline-none shadow-none p-0 py-1.5 text-sm placeholder:text-muted-foreground/60 font-medium resize-none leading-snug max-h-[180px] disabled:cursor-not-allowed disabled:opacity-50 scrollbar-thin scrollbar-thumb-muted-foreground/20"
                        disabled={disabled || isUploading || isRecording}
                    />
                    {!isRecording && !messageInput.trim() && (
                        <button type="button" className="text-muted-foreground hover:text-primary transition-colors p-1 shrink-0 mb-1">
                            <Smiley className="w-5 h-5" />
                        </button>
                    )}
                    {isAiEnabled && !isRecording && (
                        <button
                            type="button"
                            onClick={onAiClick}
                            disabled={disabled || isUploading}
                            className="text-muted-foreground hover:text-violet-500 transition-colors p-1 shrink-0 mb-1"
                            title="Agente IA"
                        >
                            <Sparkle className="w-5 h-5" weight="fill" />
                        </button>
                    )}
                </div>

                {/* Botón de enviar o grabar */}
                {messageInput.trim() || pendingImages.length > 0 ? (
                    <Button
                        type="submit"
                        size="icon"
                        className="rounded-full h-11 w-11 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 active:scale-90 transition-all shrink-0"
                        disabled={disabled || isUploading || isRecording}
                    >
                        {isUploading ? (
                            <Spinner className="w-5 h-5 text-white animate-spin" />
                        ) : (
                            <PaperPlaneRight className="w-5 h-5 text-white" weight="fill" />
                        )}
                    </Button>
                ) : (
                    <Button
                        type="button"
                        size="icon"
                        variant={isRecording ? "destructive" : "ghost"}
                        className={cn(
                            "rounded-full h-11 w-11 transition-all active:scale-90 shrink-0",
                            isRecording ? "bg-destructive text-white hover:bg-destructive/90 animate-pulse" : "text-muted-foreground hover:bg-muted"
                        )}
                        disabled={disabled || isUploading}
                        onClick={() => isRecording ? stopRecording() : startRecording()}
                    >
                        {isRecording ? <Stop className="w-5 h-5" weight="fill" /> : <Microphone className="w-5 h-5" />}
                    </Button>
                )}

                {/* Indicador de grabación */}
                {isRecording && (
                    <div className="absolute left-1/2 -top-16 -translate-x-1/2 bg-background border border-border/50 px-4 py-2 rounded-2xl shadow-2xl flex items-center gap-3 text-destructive animate-in slide-in-from-bottom-2 z-50">
                        <div className="w-3 h-3 rounded-full bg-destructive animate-ping" />
                        <span className="text-sm font-black font-mono tracking-widest">
                            {Math.floor(recordingTime / 60).toString().padStart(2, '0')}:{(recordingTime % 60).toString().padStart(2, '0')}
                        </span>
                    </div>
                )}
            </form>
        </div>
    )
}
