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
            mediaRecorder.onstop = () => {
                // Limpiar stream
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(track => track.stop())
                    streamRef.current = null
                }

                // Resetear estados
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

                // Extensión según el formato real grabado
                const actualMime = mediaRecorder.mimeType || 'audio/webm'
                let ext = 'webm'
                if (actualMime.includes('ogg')) ext = 'ogg'
                else if (actualMime.includes('mp4')) ext = 'm4a'

                const audioFile = new File(
                    [audioBlob],
                    `voice-note-${Date.now()}.${ext}`,
                    { type: actualMime }
                )

                // Notificar que el audio está listo
                onAudioReady?.(audioBlob, audioFile)
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
        cancelRecording
    }
}
