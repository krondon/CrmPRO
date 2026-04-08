# Plan de Solución - Envío de Audios desde CRM a WhatsApp

## Estado Actual del Problema

### Lo que sabemos (probado):
1. **Cuando descargas un audio de WhatsApp (.ogg) y lo reenvías desde el CRM** → SI llega y SI se reproduce en WhatsApp
2. **Cuando grabas un audio desde el CRM** → Chrome graba en formato **WebM** → llega a WhatsApp como archivo/documento NO reproducible
3. **SuperAPI acepta el `media.downloadUrl`** y envía el archivo, pero WhatsApp no reproduce WebM como audio nativo
4. **Los campos extra (`ptt: true`, `type: 'audio'`)** causan error en SuperAPI → no los reconoce

### Raíz del problema:
- Chrome NO soporta grabar en `audio/ogg;codecs=opus` (formato nativo de WhatsApp)
- Chrome graba en `audio/webm;codecs=opus` 
- WhatsApp NO reproduce WebM como nota de voz ni como audio inline
- SuperAPI NO convierte formatos, solo reenvía el archivo tal cual

---

## Opciones de Solución (de más simple a más compleja)

### Opción A: Verificar si Chrome soporta audio/mp4 (PROBAR PRIMERO)
**Esfuerzo: Bajo | Cambios: Solo frontend**

Ya se modificó `useAudioRecorder.ts` para priorizar `audio/mp4;codecs=opus` y `audio/mp4`.
Chrome 121+ (enero 2024) debería soportar esto.

**Verificar**: Abrir la consola del navegador y ejecutar:
```js
console.log('mp4+opus:', MediaRecorder.isTypeSupported('audio/mp4;codecs=opus'))
console.log('mp4:', MediaRecorder.isTypeSupported('audio/mp4'))
console.log('ogg+opus:', MediaRecorder.isTypeSupported('audio/ogg;codecs=opus'))
console.log('webm+opus:', MediaRecorder.isTypeSupported('audio/webm;codecs=opus'))
```

- Si `mp4` o `mp4+opus` es `true` → el cambio ya hecho debería funcionar, solo falta probar
- Si ambos son `false` → Chrome cae en WebM y necesitamos Opción B o C

**Archivos involucrados:**
- `src/hooks/useAudioRecorder.ts` (ya modificado)

---

### Opcion B: Convertir WebM → OGG en el cliente (browser) con librería WASM
**Esfuerzo: Medio | Cambios: Frontend**

Usar una librería como `@nicktomlin/ogg-opus-encoder` o `opus-media-recorder` para convertir el audio WebM a OGG Opus directamente en el navegador antes de subirlo.

**Flujo:**
1. Grabar audio con MediaRecorder (WebM en Chrome)
2. Decodificar el WebM con `AudioContext.decodeAudioData()`
3. Re-codificar los samples PCM a OGG Opus usando la librería WASM
4. Subir el archivo .ogg resultante a Supabase Storage
5. Enviar via SuperAPI con `downloadUrl` (como funciona actualmente)

**Pros:** 
- No requiere cambios en la edge function
- El archivo llega como .ogg real a WhatsApp
- Funciona en cualquier browser

**Contras:**
- Agrega dependencia WASM (~500KB-1MB)
- La conversión toma ~1-3 segundos extra en el browser

**Librerías candidatas:**
- `opus-media-recorder` - Polyfill de MediaRecorder que graba directamente en OGG
- `lamejs` - Convierte a MP3 (alternativa, WhatsApp reproduce MP3)
- `@nicktomlin/ogg-opus-encoder` - Encoder OGG Opus puro

**Archivos a modificar:**
- `package.json` (agregar dependencia)
- `src/hooks/useAudioRecorder.ts` (agregar conversión post-grabación)

---

### Opcion C: Convertir WebM → MP3 en el cliente con lamejs
**Esfuerzo: Medio-Bajo | Cambios: Frontend**

Similar a Opción B pero convirtiendo a MP3 en vez de OGG. MP3 es universalmente soportado por WhatsApp.

**Flujo:**
1. Grabar audio con MediaRecorder (WebM)
2. Decodificar con `AudioContext.decodeAudioData()`
3. Codificar a MP3 con `lamejs` (librería JS pura, sin WASM)
4. Subir .mp3 a Storage
5. Enviar via SuperAPI

**Pros:**
- `lamejs` es JS puro (no WASM), más simple de integrar
- MP3 es universalmente reproducible en WhatsApp
- Librería madura y estable

**Contras:**
- MP3 es más pesado que OGG Opus (~2x tamaño)
- Calidad ligeramente inferior a Opus para el mismo bitrate

**Archivos a modificar:**
- `package.json` (agregar `lamejs`)
- `src/hooks/useAudioRecorder.ts` (agregar conversión WebM→MP3)

---

### Opcion D: Usar `opus-media-recorder` como polyfill de MediaRecorder
**Esfuerzo: Medio | Cambios: Frontend**

Reemplazar el MediaRecorder nativo con `opus-media-recorder`, que es un polyfill que permite grabar en OGG Opus en TODOS los navegadores (incluido Chrome).

**Flujo:**
1. Importar `opus-media-recorder` en vez de usar `MediaRecorder` nativo
2. Grabar directamente en `audio/ogg;codecs=opus`
3. El archivo ya es .ogg nativo → subir y enviar normalmente

**Pros:**
- No necesita paso de conversión extra
- Produce OGG Opus nativo (formato ideal para WhatsApp)
- Una sola modificación en el hook

**Contras:**
- Requiere servir archivos WASM (encoderWorker.js, OggOpusEncoder.wasm)
- Setup inicial más complejo (configurar Vite para servir los workers)

**Archivos a modificar:**
- `package.json` (agregar `opus-media-recorder`)
- `src/hooks/useAudioRecorder.ts` (usar polyfill)
- `vite.config.ts` (posiblemente, para WASM workers)

---

## Recomendación

1. **PRIMERO**: Probar Opción A ejecutando los `console.log` en el browser. Si Chrome soporta MP4, ya está resuelto con los cambios actuales.

2. **Si MP4 no funciona**: Ir con **Opción C (lamejs → MP3)** por ser la más simple de implementar (JS puro, sin WASM, sin configuración extra de build).

3. **Si se quiere la máxima calidad**: Ir con **Opción D (opus-media-recorder)** para grabar directamente en OGG Opus.

---

## Estado de la Edge Function (send-message)
La edge function actualmente está limpia y funcional:
- Envía media por `downloadUrl` + `fileName` (sin campos PTT extra)
- Esto funciona correctamente (probado con archivo .ogg descargado)
- **NO necesita más cambios** - el fix es 100% del lado del formato de grabación

## Archivos Modificados Hasta Ahora
| Archivo | Estado | Cambio |
|---------|--------|--------|
| `Edge funtions/functions/send-message/index.ts` | Deployado | `message: content \|\| ''`, media limpio por URL |
| `src/hooks/useAudioRecorder.ts` | Local | Prioridad MP4 > WebM, extensión correcta |
| `src/supabase/services/mensajes.ts` | Local | `content ?? ''`, MediaPayload con ptt/mimetype |
| `src/components/crm/chats/MessageInput.tsx` | Local | Agrega ptt + mimetype al audio |
| `src/components/crm/LeadDetailSheet.tsx` | Local | Agrega ptt + mimetype al audio |
| `src/hooks/useLeadsList.ts` | Local | Guard `if (!msg) return` |
