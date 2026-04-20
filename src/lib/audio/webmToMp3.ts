/**
 * webmToMp3
 *
 * Convierte un Blob de audio (WebM/Opus o cualquier formato decodificable
 * por el navegador) a un Blob MP3 usando Web Audio API + lamejs (JS puro, sin WASM).
 *
 * Uso:
 *   const mp3Blob = await webmToMp3(webmBlob)
 *   const mp3Blob = await webmToMp3(webmBlob, { bitrateKbps: 64 })
 */

// @breezystack/lamejs es el fork ESM de lamejs — compatible con Vite sin problemas de CJS
// @ts-expect-error este paquete no tiene declaraciones TypeScript
import { Mp3Encoder } from '@breezystack/lamejs'

/**
 * Remuestrea un buffer mono de Float32 a una nueva frecuencia de muestreo
 * usando OfflineAudioContext (nativo del navegador, sin librerías extra).
 */
async function resampleMono(
    pcm: Float32Array,
    fromRate: number,
    toRate: number
): Promise<Float32Array> {
    const outLength = Math.ceil((pcm.length * toRate) / fromRate)
    const offlineCtx = new OfflineAudioContext(1, outLength, toRate)
    const buffer = offlineCtx.createBuffer(1, pcm.length, fromRate)
    buffer.copyToChannel(pcm, 0)
    const source = offlineCtx.createBufferSource()
    source.buffer = buffer
    source.connect(offlineCtx.destination)
    source.start(0)
    const rendered = await offlineCtx.startRendering()
    return rendered.getChannelData(0)
}

/**
 * Convierte Float32 [-1, 1] a Int16 (requerido por lamejs).
 */
function float32ToInt16(float32: Float32Array): Int16Array {
    const int16 = new Int16Array(float32.length)
    for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]))
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    return int16
}

/**
 * Convierte un Blob de audio a MP3 en el navegador.
 *
 * @param blob        Blob fuente (WebM, Opus, OGG, etc.)
 * @param opts.bitrateKbps   Bitrate CBR del MP3 (default: 64 kbps — óptimo para voz mono)
 * @returns           Blob de audio/mpeg (MP3)
 */
export async function webmToMp3(
    blob: Blob,
    opts?: { bitrateKbps?: number }
): Promise<Blob> {
    const bitrate = opts?.bitrateKbps ?? 64

    // 1. Decodificar a PCM usando Web Audio API
    const arrayBuffer = await blob.arrayBuffer()
    const ctx = new AudioContext()
    let audioBuffer: AudioBuffer
    try {
        audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    } finally {
        // Liberar recursos de AudioContext independientemente del resultado
        ctx.close()
    }

    const { sampleRate, numberOfChannels, length } = audioBuffer

    // 2. Mezclar a mono (ahorra tamaño; óptimo para notas de voz)
    let pcmMono: Float32Array
    if (numberOfChannels === 1) {
        pcmMono = audioBuffer.getChannelData(0)
    } else {
        pcmMono = new Float32Array(length)
        for (let i = 0; i < length; i++) {
            let sum = 0
            for (let c = 0; c < numberOfChannels; c++) {
                sum += audioBuffer.getChannelData(c)[i]
            }
            pcmMono[i] = sum / numberOfChannels
        }
    }

    // 3. Remuestrear a 44100 Hz si es necesario
    //    (lamejs acepta frecuencias MPEG-1: 32000, 44100, 48000)
    const TARGET_RATE = 44100
    let finalPcm = pcmMono
    let finalRate = sampleRate

    if (sampleRate !== TARGET_RATE) {
        finalPcm = await resampleMono(pcmMono, sampleRate, TARGET_RATE)
        finalRate = TARGET_RATE
    }

    // 4. Encodear a MP3 CBR con lamejs
    const encoder = new Mp3Encoder(1, finalRate, bitrate)
    const samples = float32ToInt16(finalPcm)

    // lamejs requiere chunks múltiplos de 576 (tamaño de frame MPEG Layer 3 × 2)
    const CHUNK_SIZE = 1152
    const mp3Parts: Int8Array[] = []

    for (let offset = 0; offset < samples.length; offset += CHUNK_SIZE) {
        const chunk = samples.subarray(offset, offset + CHUNK_SIZE)
        const encoded: Int8Array = encoder.encodeBuffer(chunk)
        if (encoded.length > 0) {
            mp3Parts.push(encoded)
        }
    }

    // Vaciar el buffer interno del encoder
    const flushed: Int8Array = encoder.flush()
    if (flushed.length > 0) {
        mp3Parts.push(flushed)
    }

    if (mp3Parts.length === 0) {
        throw new Error('webmToMp3: el encoder no produjo datos MP3')
    }

    return new Blob(mp3Parts, { type: 'audio/mpeg' })
}
