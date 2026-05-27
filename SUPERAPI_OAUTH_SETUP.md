# SuperAPI · OAuth 2.0 — Guía de activación

Esta guía documenta cómo "prender" la integración OAuth con SuperAPI cuando Morna
entregue las credenciales. Mientras tanto, **el código vive desactivado detrás
de un feature flag** (`VITE_SUPERAPI_OAUTH_ENABLED=false`) y no impacta al CRM
en producción.

La integración manual existente (copiar/pegar tokens en `InstancesManager`)
**sigue funcionando exactamente igual** — las dos coexisten.

---

## Estado actual (al momento de implementar)

| Componente | Estado |
|---|---|
| Migración SQL (`superapi_installs`) | ✅ Lista, sin correr en BD aún |
| Edge Function `superapi-oauth-exchange` | ✅ Código completo, esperando secrets |
| Edge Function `superapi-webhook` | ✅ Código completo, esperando `SIGNING_SECRET` |
| Edge Function `superapi-send-message-oauth` | ✅ Código completo |
| Frontend (botón + callback + service) | ✅ Listo, detrás de feature flag |
| Procesamiento de eventos del webhook | ⏸️ STUB intencional — wirear post-launch |
| Pruebas end-to-end contra SuperAPI real | ❌ Imposible hasta que SuperAPI lance OAuth |

---

## Lo que se necesita de Morna para activar

1. **Registrar el CRM como OAuthApp** en el panel de SuperAPI:
   - Nombre: `CRM Pro`
   - **Allowed origin**: la URL pública del CRM (la de Vercel)
   - **Redirect URIs**: `https://<CRM-URL>/superapi/callback`
   - **Callback de webhooks**: `https://bjdqjxrwvktfqienbzop.supabase.co/functions/v1/superapi-webhook`
   - **Scopes permitidos**: `instances.read`, `messages.send`, `messages.receive`

2. **Entregar 3 secrets** (se muestran una sola vez al crear la app):
   - `client_id` — público
   - `client_secret` — privado
   - `signing_secret` — privado, para HMAC de webhooks

---

## Pasos para activar (cuando lleguen las credenciales)

### 1. Correr la migración SQL en Supabase

```bash
# Desde Supabase Dashboard → SQL Editor → New Query
# Pegar el contenido de:
database/migrations/superapi_oauth_installs.sql
```

Verificar que se creó la tabla:

```sql
select * from superapi_installs limit 1;
-- debe devolver 0 filas (no error)
```

### 2. Desplegar las 3 Edge Functions

```bash
# Desde la raíz del proyecto, con Supabase CLI instalado:
cd "Edge funtions"
supabase functions deploy superapi-oauth-exchange
supabase functions deploy superapi-webhook
supabase functions deploy superapi-send-message-oauth
```

### 3. Configurar los secrets del servidor (Supabase Dashboard)

`Project Settings → Edge Functions → Secrets → Add new secret`:

| Nombre | Valor |
|---|---|
| `SUPERAPI_BASE_URL` | `https://v4.iasuperapi.com` (sin `/` final) |
| `SUPERAPI_OAUTH_TOKEN_URL` | `https://v4.iasuperapi.com/oauth/token` |
| `SUPERAPI_OAUTH_CLIENT_ID` | el `client_id` entregado por Morna |
| `SUPERAPI_OAUTH_CLIENT_SECRET` | el `client_secret` (privado) |
| `SUPERAPI_OAUTH_SIGNING_SECRET` | el `signing_secret` (privado) |

> **Si SuperAPI migra a v5**, solo hay que actualizar `SUPERAPI_BASE_URL` y
> `SUPERAPI_OAUTH_TOKEN_URL` aquí + `VITE_SUPERAPI_OAUTH_AUTHORIZE_URL` en
> el frontend. No hace falta cambiar código.

### 4. Configurar variables del frontend (Vercel)

`Vercel Dashboard → Project Settings → Environment Variables`:

| Nombre | Valor | Scope |
|---|---|---|
| `VITE_SUPERAPI_OAUTH_ENABLED` | `true` | Production |
| `VITE_SUPERAPI_OAUTH_AUTHORIZE_URL` | `https://v4.iasuperapi.com/oauth/authorize` | Production |
| `VITE_SUPERAPI_OAUTH_CLIENT_ID` | mismo `client_id` que el backend | Production |
| `VITE_SUPERAPI_OAUTH_REDIRECT_URI` | dejar vacío (se autodetecta) | — |

Redeploy desde Vercel (las env vars de Vite se inyectan en build time).

### 5. Smoke test contra producción

⚠️ **Ojo: no hay sandbox**, las pruebas son contra SuperAPI real. Hacer con
una empresa de prueba interna, NO con un cliente real.

1. Iniciar sesión en el CRM
2. Ir a **Configuración → Instancias**
3. Debe aparecer arriba del listado clásico la tarjeta morada
   **"Conectar con SuperAPI · Recomendado"**
4. Click "Conectar SuperAPI" → redirige a `/oauth/authorize` de SuperAPI
5. Marcar instancias y autorizar
6. Vuelve a `/superapi/callback` → muestra spinner → checkmark verde →
   redirige a `/settings`
7. Volver a ver la tarjeta — ahora debe estar verde con badge **OAuth** y
   las instancias autorizadas listadas
8. Enviar un mensaje de prueba desde la card del lead — debe pasar por la
   nueva edge function `superapi-send-message-oauth`
9. Verificar en `webhooks_entrantes` que llega un evento con
   `provider='superapi'` cuando el cliente responda

---

## Cómo APAGAR rápido si algo sale mal

**Plan de rollback en 30 segundos:**

1. `Vercel → Environment Variables → VITE_SUPERAPI_OAUTH_ENABLED=false`
2. Redeploy

El botón "Conectar SuperAPI" desaparece. Toda la integración manual sigue
funcionando intacta. Los registros en `superapi_installs` quedan inertes
hasta que se vuelva a prender.

> No es necesario borrar tablas, edge functions o secrets para rollback.
> Solo bajar la flag.

---

## Trabajo pendiente para Fase 2 (después del primer evento real)

Documentado como STUB en `Edge funtions/functions/superapi-webhook/index.ts`:
el procesamiento específico de eventos (crear mensaje en `mensajes`, crear
lead nuevo si `auto_create_lead=true`, marcar `delivery_failed`, etc.).

**Por qué quedó en STUB:** sin ambiente de pruebas no podíamos verificar el
shape exacto del payload ni el mapping de IDs. Hoy la edge function verifica
firma, deduplica y persiste en `webhooks_entrantes` — basta para no perder
ningún evento. Al recibir el primer evento real:

1. Inspeccionar la fila en `webhooks_entrantes` para ver el `payload` real
2. Confirmar que `payload.instanceId` mapea a `empresa_instancias.client_id`
3. Implementar handlers según los 3 `event_type`:
   - `message` → INSERT en `mensajes` con `sender='lead'`, `metadata.instanceId`
   - `ai_response` → INSERT en `mensajes` con `sender='assistant'`
   - `delivery_failed` → UPDATE del mensaje original a estado fallido

---

## Arquitectura — referencia rápida

```
Frontend (CRM)
  └─ Settings → Instancias
       └─ <SuperAPIConnectButton/>                    ← visible si flag=true
             └─ click → buildAuthorizeUrl()           ← genera state CSRF
                  └─ window.location = /oauth/authorize?...
                                          │
                                          ▼
                          ┌─────────────────────────────┐
                          │  SuperAPI consent screen    │
                          └─────────────────────────────┘
                                          │
                                          ▼
  /superapi/callback?code=...&state=...
       └─ <SuperAPICallbackView/>
             └─ consumeState() → exchangeCode() ───┐
                                                    │
                                                    ▼
                Edge: superapi-oauth-exchange (Deno)
                       │
                       ├─ POST /oauth/token con client_secret
                       └─ INSERT/UPDATE superapi_installs

Webhooks entrantes
  SuperAPI → POST .../superapi-webhook  (HMAC SHA-256)
                       │
                       ├─ verifyHmac(rawBody, signing_secret)
                       ├─ dedupe por data.id
                       └─ INSERT webhooks_entrantes (provider='superapi')

Envío de mensajes (alternativo a send-message clásico)
  CRM → Edge: superapi-send-message-oauth
                       │
                       ├─ leer superapi_installs.access_token
                       ├─ POST /api/v1/oauth/instances/:id/messages (Bearer)
                       └─ INSERT mensajes con metadata.oauth=true
```

---

## Archivos clave (para futura referencia)

| Archivo | Rol |
|---|---|
| `database/migrations/superapi_oauth_installs.sql` | Schema + RLS |
| `Edge funtions/functions/superapi-oauth-exchange/index.ts` | Intercambio `code → access_token` |
| `Edge funtions/functions/superapi-webhook/index.ts` | Recepción de eventos con HMAC |
| `Edge funtions/functions/superapi-send-message-oauth/index.ts` | Envío con Bearer |
| `src/lib/superapi-oauth.ts` | Helpers cliente (state CSRF, URL builder) |
| `src/supabase/services/superapiInstalls.ts` | CRUD frontend |
| `src/components/crm/settings/SuperAPIConnectButton.tsx` | Botón en Settings |
| `src/components/crm/SuperAPICallbackView.tsx` | Página `/superapi/callback` |
| `.env.example` | Plantilla de variables de entorno |
