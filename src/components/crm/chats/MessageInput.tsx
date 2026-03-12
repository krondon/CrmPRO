/**
 * MessageInput Component
 * 
 * Input de mensajes con soporte para:
 * - Texto
 * - Imágenes (paste/drag desde clipboard)
 * - Notas de voz (useAudioRecorder)
 * - Archivos adjuntos
 */

import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    PaperPlaneRight,
    Paperclip,
    Microphone,
    Smiley,
    Stop,
    Spinner,
    X,
    DeviceMobile
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { sendMessage, uploadChatAttachment } from '@/supabase/services/mensajes'

import { Channel } from '@/lib/types'

interface MessageInputProps {
    leadId: string
    channel: 'whatsapp' | 'instagram' | 'facebook'
    disabled?: boolean
    instanceLabel?: string | null
    onMessageSent?: () => void
}

export function MessageInput({
    leadId,
    channel,
    disabled = false,
    instanceLabel,
    onMessageSent
}: MessageInputProps) {
    const [messageInput, setMessageInput] = useState('')
    const [isUploading, setIsUploading] = useState(false)
    const [pendingImages, setPendingImages] = useState<Array<{ file: File; preview: string }>>([])
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Hook de grabación de audio
    const handleAudioReady = useCallback(async (audioBlob: Blob, audioFile: File) => {
        setIsUploading(true)
        try {
            const mediaData = await uploadChatAttachment(audioFile, leadId)
            await sendMessage(leadId, '', 'team', channel, mediaData)
            toast.success('Nota de voz enviada')
            onMessageSent?.()
        } catch (err) {
            console.error('[Audio] Error sending:', err)
            toast.error('Error enviando nota de voz')
        } finally {
            setIsUploading(false)
        }
    }, [leadId, channel, onMessageSent])

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
    const handlePasteClipboard = async (e: React.ClipboardEvent<HTMLInputElement>) => {
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
        if (!messageInput.trim() && pendingImages.length === 0) return
        setIsUploading(true)
        try {
            if (pendingImages.length > 0) {
                for (let i = 0; i < pendingImages.length; i++) {
                    const { file } = pendingImages[i]
                    const mediaData = await uploadChatAttachment(file, leadId)
                    const content = i === 0 ? messageInput : ''
                    await sendMessage(leadId, content, 'team', channel, mediaData)
                }
            } else {
                await sendMessage(leadId, messageInput, 'team', channel)
            }

            setMessageInput('')
            clearPendingImages()
            onMessageSent?.()
        } catch (e) {
            console.error('Error sending message:', e)
            toast.error('Error al enviar mensaje')
        } finally {
            setIsUploading(false)
        }
    }

    // Selección de archivos (cualquier tipo, máximo 16MB)
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

    return (
        <div className="shrink-0 border-t bg-background px-4 py-4">
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

            <form onSubmit={handleSendMessage} className="relative flex items-center gap-2">
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                    onChange={handleFileSelect}
                />
                <button
                    type="button"
                    className="text-muted-foreground hover:text-primary transition-colors p-2 rounded-full hover:bg-muted"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={disabled || isUploading}
                >
                    <Paperclip className="w-5 h-5" />
                </button>

                <div className="flex-1 flex items-center gap-2 bg-muted/50 border border-border/50 rounded-full px-4 py-2 focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/50 transition-all">
                    <Input
                        placeholder={isRecording ? "Grabando audio..." : "Escribe un mensaje..."}
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        onPaste={handlePasteClipboard}
                        className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none p-0 text-sm placeholder:text-muted-foreground/60 font-medium"
                        disabled={disabled || isUploading || isRecording}
                    />
                    {!isRecording && !messageInput.trim() && (
                        <button type="button" className="text-muted-foreground hover:text-primary transition-colors p-1">
                            <Smiley className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {/* Botón de enviar o grabar */}
                {messageInput.trim() || pendingImages.length > 0 ? (
                    <Button
                        type="submit"
                        size="icon"
                        className="rounded-full h-11 w-11 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 active:scale-90 transition-all"
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
                            "rounded-full h-11 w-11 transition-all active:scale-90",
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
