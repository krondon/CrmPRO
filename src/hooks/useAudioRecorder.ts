/**
 * useAudioRecorder Hook
 * 
 * Hook reutilizable para grabación de audio. Unifica la lógica duplicada
 * que existía en ChatsView.tsx y LeadDetailSheet.tsx.
 * 
 * **¿Qué hace?**
 * - Maneja la grabación de audio usando MediaRecorder API
 * - Prioriza formato OGG/Opus para compatibilidad con WhatsApp
 * - Proporciona estados de grabación y tiempo
 * 
 * **¿Dónde afecta?**
 * - ChatsView.tsx: Envío de notas de voz en la vista de chats
 * - LeadDetailSheet.tsx: Envío de notas de voz en el detalle del lead
 * 
 * **Testing requerido:**
 * 1. Ir a Chats → Seleccionar un chat → Presionar botón de micrófono
 * 2. Grabar audio por al menos 3 segundos → Detener
 * 3. Verificar que el audio se envía correctamente
 * 4. Repetir lo mismo desde LeadDetailSheet (click en un lead desde Pipeline)
 */

import { useState, useRef, useCallback } from 'react'
import { webmToMp3 } from '@/lib/audio/webmToMp3'

interface UseAudioRecorderOptions {
    /** Callback opcional cuando hay error */
    onError?: (error: Error) => void
    /** Callback cuando se obtiene el blob de audio */
    onAudioReady?: (audioBlob: Blob, audioFile: File) => void
}

interface UseAudioRecorderReturn {
    /** Si está grabando actualmente */
    isRecording: boolean
    /** Tiempo de grabación en segundos */
    recordingTime: number
    /** Iniciar grabación */
    startRecording: () => Promise<void>
    /** Detener grabación (dispara onAudioReady con el audio) */
    stopRecording: () => void
    /** Cancelar grabación sin guardar */
    cancelRecording: () => void
    /** True mientras se convierte el audio (WebM → MP3) antes de entregarlo */
    isProcessing: boolean
}

// Formatos de audio preferidos, en orden de prioridad
// WhatsApp reproduce OGG Opus y MP4/AAC de forma nativa
// Chrome no soporta OGG pero sí MP4 desde v121+
const PREFERRED_FORMATS = [
    'audio/ogg;codecs=opus',     // Firefox - formato nativo de WhatsApp
    'audio/ogg',                 // Firefox fallback
    'audio/mp4;codecs=opus',     // Chrome 121+ - compatible con WhatsApp
    'audio/mp4',                 // Chrome/Safari - AAC, compatible con WhatsApp
    'audio/webm;codecs=opus',    // Último recurso
    'audio/webm'
]

/**
 * Hook para grabación de audio
 * @param options Opciones de configuración
 * @returns Estados y funciones para controlar la grabación
 */
export function useAudioRecorder(options: UseAudioRecorderOptions = {}): UseAudioRecorderReturn {
    const { onError, onAudioReady } = options

    const [isRecording, setIsRecording] = useState(false)
    const [recordingTime, setRecordingTime] = useState(0)
    const [isProcessing, setIsProcessing] = useState(false)

    // Refs para mantener referencias estables durante la grabación
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const audioChunksRef = useRef<Blob[]>([])
    const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const isCancelledRef = useRef(false)

    /**
     * Limpia todos los recursos de grabación
     */
    const cleanup = useCallback(() => {
        // Detener el stream de audio
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop())
            streamRef.current = null
        }

        // Limpiar el intervalo del timer
        if (recordingIntervalRef.current) {
            clearInterval(recordingIntervalRef.current)
            recordingIntervalRef.current = null
        }

        // Resetear estados
        mediaRecorderRef.current = null
        audioChunksRef.current = []
        setRecordingTime(0)
        setIsRecording(false)
    }, [])

    /**
     * Detiene la grabación y obtiene el audio
     */
    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            isCancelledRef.current = false
            mediaRecorderRef.current.stop()
        }

        if (recordingIntervalRef.current) {
            clearInterval(recordingIntervalRef.current)
            recordingIntervalRef.current = null
        }
    }, [])

    /**
     * Cancela la grabación sin guardar el audio
     */
    const cancelRecording = useCallback(() => {
        isCancelledRef.current = true

        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop()
        }

        cleanup()
    }, [cleanup])

    /**
     * Inicia la grabación de audio
     */
    const startRecording = useCallback(async () => {
        try {
            // Obtener acceso al micrófono
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            streamRef.current = stream
            isCancelledRef.current = false

            // Detectar el mejor formato soportado
            let mimeType = ''
            for (const format of PREFERRED_FORMATS) {
                if (MediaRecorder.isTypeSupported(format)) {
                    mimeType = format
                    break
                }
            }

            // Crear MediaRecorder con el mejor formato disponible
            const mediaRecorder = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream)

            mediaRecorderRef.current = mediaRecorder
            audioChunksRef.current = []

            // Evento: datos disponibles durante la grabación
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data)
                }
            }

            // Evento: grabación detenida
            mediaRecorder.onstop = async () => {
                // Limpiar stream
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(track => track.stop())
                    streamRef.current = null
                }

                // Resetear estados de grabación
                setRecordingTime(0)
                setIsRecording(false)

                // Si fue cancelada, no procesar el audio
                if (isCancelledRef.current) {
                    audioChunksRef.current = []
                    return
                }

                // Crear blob de audio
                const audioBlob = new Blob(audioChunksRef.current, {
                    type: mediaRecorder.mimeType || 'audio/webm'
                })

                if (audioBlob.size === 0) {
                    onError?.(new Error('No se grabó audio'))
                    return
                }

                // Detectar si el formato grabado es compatible con WhatsApp de forma nativa.
                // Solo OGG/Opus (Firefox) y MP3/MPEG son entregados sin conversión.
                // audio/mp4 (.m4a) de Chrome puede llegar como documento en WhatsApp → convertir también.
                const actualMime = mediaRecorder.mimeType || 'audio/webm'
                const isNativeCompatible =
                    actualMime.includes('ogg') ||
                    actualMime.includes('mpeg')

                let finalBlob = audioBlob
                let ext = 'webm'
                if (actualMime.includes('ogg')) ext = 'ogg'
                // mp4/m4a y webm van a conversión → no necesitan ext aquí

                // Convertir WebM → MP3 si el navegador no grabó en formato compatible
                if (!isNativeCompatible) {
                    setIsProcessing(true)
                    try {
                        finalBlob = await webmToMp3(audioBlob)
                        ext = 'mp3'
                        if (import.meta.env.DEV) {
                            console.debug('[useAudioRecorder] Converted WebM→MP3', {
                                original: `${(audioBlob.size / 1024).toFixed(1)} KB (${actualMime})`,
                                converted: `${(finalBlob.size / 1024).toFixed(1)} KB (audio/mpeg)`
                            })
                        }
                    } catch (convErr) {
                        setIsProcessing(false)
                        onError?.(convErr instanceof Error ? convErr : new Error('Error convirtiendo audio a MP3'))
                        return
                    } finally {
                        setIsProcessing(false)
                    }
                }

                const audioFile = new File(
                    [finalBlob],
                    `voice-note-${Date.now()}.${ext}`,
                    { type: finalBlob.type }
                )

                // Notificar que el audio está listo
                onAudioReady?.(finalBlob, audioFile)
            }

            // Iniciar grabación con timeslice de 500ms
            mediaRecorder.start(500)
            setIsRecording(true)
            setRecordingTime(0)

            // Iniciar contador de tiempo
            recordingIntervalRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1)
            }, 1000)

        } catch (err) {
            const error = err instanceof Error ? err : new Error('Error al acceder al micrófono')
            onError?.(error)
            cleanup()
        }
    }, [onError, onAudioReady, cleanup])

    return {
        isRecording,
        recordingTime,
        startRecording,
        stopRecording,
        cancelRecording,
        isProcessing
    }
}
