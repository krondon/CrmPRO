# Edge Function: catalog-ai

Endpoint que recibe productos del catalogo via POST, usa Claude (IA) para generar una respuesta, y opcionalmente envia esa respuesta directamente al cliente por WhatsApp via SuperAPI.

---

## 1. Configuracion previa (una sola vez)

### 1.1 Obtener API Key de Anthropic

1. Ve a https://console.anthropic.com/
2. Crea una cuenta o inicia sesion
3. Ve a **API Keys** > **Create Key**
4. Copia la key (empieza con `sk-ant-api03-...`)

### 1.2 Guardar el secret en Supabase

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-TU_KEY_AQUI
```

### 1.3 Deploy de la funcion

```bash
supabase functions deploy catalog-ai
```

---

## 2. Referencia del endpoint

| Campo | Valor |
|-------|-------|
| **Metodo** | `POST` |
| **URL** | `https://<TU_PROJECT_ID>.supabase.co/functions/v1/catalog-ai` |
| **Auth** | Bearer token (JWT del usuario autenticado) |
| **Content-Type** | `application/json` |

### Request Body

```json
{
  "items": [
    {
      "name": "string (requerido)",
      "description": "string (opcional)",
      "price": 0.00,
      "image_url": "string (opcional)"
    }
  ],
  "question": "string (requerido)",
  "lead_name": "string (opcional)",
  "system_prompt": "string (opcional)",
  "phone": "string (opcional)",
  "empresa_id": "string (requerido si se pasa phone)",
  "instance_id": "string (opcional)"
}
```

| Campo | Tipo | Requerido | Descripcion |
|-------|------|-----------|-------------|
| `items` | array | Si | Array de productos del catalogo |
| `items[].name` | string | Si | Nombre del producto |
| `items[].description` | string | No | Descripcion del producto |
| `items[].price` | number | No | Precio unitario |
| `items[].image_url` | string | No | URL de la imagen del producto |
| `question` | string | Si | Pregunta del cliente sobre el catalogo |
| `lead_name` | string | No | Nombre del lead/cliente (personaliza la respuesta) |
| `system_prompt` | string | No | Reemplaza el system prompt por defecto. El catalogo se adjunta automaticamente al final. |
| `phone` | string | No | Numero del cliente. Si se pasa, la respuesta se envia por WhatsApp via SuperAPI |
| `empresa_id` | string | Requerido si hay `phone` | ID de la empresa para buscar las credenciales de SuperAPI |
| `instance_id` | string | No | UUID de la instancia especifica a usar. Si no se pasa, usa la unica activa de la empresa |

### Response (200 OK)

**Sin phone (solo IA):**
```json
{
  "success": true,
  "response": "Texto de respuesta de la IA",
  "model": "claude-sonnet-4-20250514",
  "usage": {
    "input_tokens": 250,
    "output_tokens": 150
  }
}
```

**Con phone (IA + WhatsApp):**
```json
{
  "success": true,
  "response": "Texto de respuesta de la IA",
  "model": "claude-sonnet-4-20250514",
  "usage": {
    "input_tokens": 250,
    "output_tokens": 150
  },
  "whatsapp": {
    "sent": true,
    "phone": "584141234567",
    "error": null
  }
}
```

> Si el envio por WhatsApp falla, `whatsapp.sent` sera `false` y `whatsapp.error` tendra el motivo. La respuesta de IA igual se devuelve con `success: true`.

### Errores posibles

| Status | Causa |
|--------|-------|
| 401 | Token JWT faltante o invalido |
| 400 | Falta `items`, `question`, o `empresa_id` cuando se pasa `phone` |
| 500 | Error interno (API Key invalida, error de Anthropic, etc.) |

---

## 3. Pruebas en Thunder Client

### Paso 1: Obtener el JWT del usuario

1. Crea una nueva request en Thunder Client:
   - **Metodo**: `POST`
   - **URL**: `https://<TU_PROJECT_ID>.supabase.co/auth/v1/token?grant_type=password`

2. **Headers**:

   | Header | Valor |
   |--------|-------|
   | `Content-Type` | `application/json` |
   | `apikey` | `<TU_SUPABASE_ANON_KEY>` |

3. **Body** (JSON):
   ```json
   {
     "email": "tu_email@ejemplo.com",
     "password": "tu_password"
   }
   ```

4. Click **Send** y copia el `access_token` de la respuesta.

> Tu Project ID y Anon Key estan en: Supabase Dashboard → Settings → API

---

### Paso 2: Prueba solo IA (sin WhatsApp)

Util para verificar que Claude responde bien antes de probar el envio.

- **Metodo**: `POST`
- **URL**: `https://<TU_PROJECT_ID>.supabase.co/functions/v1/catalog-ai`

**Headers**:

| Header | Valor |
|--------|-------|
| `Content-Type` | `application/json` |
| `Authorization` | `Bearer eyJhbGciOi...` |

**Body**:
```json
{
  "items": [
    {
      "name": "Camiseta Premium",
      "description": "100% algodon, tallas S, M, L, XL. Colores: blanco, negro, azul",
      "price": 29.99
    },
    {
      "name": "Pantalon Cargo",
      "description": "6 bolsillos, tela resistente. Colores: negro, verde militar, beige",
      "price": 49.99
    },
    {
      "name": "Gorra Snapback",
      "description": "Ajustable, talla unica, logo bordado",
      "price": 15.00
    }
  ],
  "question": "Quiero algo casual para el fin de semana, que me recomiendas?",
  "lead_name": "Carlos"
}
```

**Respuesta esperada**:
```json
{
  "success": true,
  "response": "Hola Carlos! Para un fin de semana casual te recomiendo...",
  "model": "claude-sonnet-4-20250514",
  "usage": { "input_tokens": 280, "output_tokens": 95 }
}
```

---

### Paso 3: Prueba completa IA + WhatsApp

Agrega `phone` y `empresa_id` al body. La respuesta se envia directamente al numero por WhatsApp.

**Body**:
```json
{
  "items": [
    {
      "name": "Camiseta Premium",
      "description": "100% algodon, tallas S, M, L, XL. Colores: blanco, negro, azul",
      "price": 29.99
    },
    {
      "name": "Pantalon Cargo",
      "description": "6 bolsillos, tela resistente. Colores: negro, verde militar, beige",
      "price": 49.99
    }
  ],
  "question": "Tienen algo en color negro?",
  "lead_name": "Maria",
  "phone": "584141234567",
  "empresa_id": "UUID_DE_TU_EMPRESA"
}
```

**Respuesta esperada**:
```json
{
  "success": true,
  "response": "Hola Maria! Si, tenemos varias opciones en negro...",
  "model": "claude-sonnet-4-20250514",
  "usage": { "input_tokens": 290, "output_tokens": 80 },
  "whatsapp": {
    "sent": true,
    "phone": "584141234567",
    "error": null
  }
}
```

Si `whatsapp.sent` es `false`, revisa `whatsapp.error` para ver el motivo.

---

### Paso 4: Prueba con system_prompt personalizado

Util si quieres cambiar el comportamiento de la IA para una empresa especifica.

**Body**:
```json
{
  "items": [
    { "name": "Plan Basico", "description": "10 usuarios, 5GB", "price": 9.99 },
    { "name": "Plan Pro", "description": "50 usuarios, 50GB, soporte prioritario", "price": 29.99 },
    { "name": "Plan Enterprise", "description": "Ilimitado, 500GB, soporte 24/7", "price": 99.99 }
  ],
  "question": "Cual es el plan mas barato?",
  "lead_name": "Pedro",
  "system_prompt": "Eres un asesor comercial de SaaS. Responde de forma profesional y orientada a ventas. Siempre menciona el valor diferencial de cada plan. El catalogo disponible es el siguiente:"
}
```

> El catalogo se adjunta automaticamente despues del system_prompt personalizado.

---

### Paso 5: Prueba de algo fuera del catalogo

```json
{
  "items": [
    { "name": "Laptop HP 15", "description": "Intel i5, 8GB RAM, 256GB SSD", "price": 599.99 },
    { "name": "Mouse Logitech", "description": "Inalambrico, ergonomico", "price": 25.00 }
  ],
  "question": "Tienen impresoras?",
  "lead_name": "Pedro"
}
```

La IA debe responder que no hay impresoras en el catalogo.

---

## 4. Uso desde el frontend (React)

```typescript
import { supabase } from '@/lib/supabase'

async function askCatalogAI(params: {
  items: { name: string; description?: string; price?: number; image_url?: string }[]
  question: string
  leadName?: string
  systemPrompt?: string
  phone?: string
  empresaId?: string
  instanceId?: string
}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('No hay sesion activa')

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/catalog-ai`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        items: params.items,
        question: params.question,
        lead_name: params.leadName,
        system_prompt: params.systemPrompt,
        phone: params.phone,
        empresa_id: params.empresaId,
        instance_id: params.instanceId,
      })
    }
  )

  if (!response.ok) {
    const err = await response.json()
    throw new Error(err.error || 'Error al consultar la IA')
  }

  return response.json()
}
```

---

## 5. Troubleshooting

| Problema | Solucion |
|----------|----------|
| 401 Unauthorized | El token JWT expiro. Genera uno nuevo con el Paso 1 |
| 500 + "Falta ANTHROPIC_API_KEY" | Ejecuta `supabase secrets set ANTHROPIC_API_KEY=tu_key` |
| 500 + "Error de la API de Anthropic: 401" | Tu API Key de Anthropic es invalida o no tiene creditos |
| 400 + "Se requiere empresa_id" | Pasaste `phone` pero olvidaste `empresa_id` |
| `whatsapp.sent: false` + "No se encontro instancia" | La empresa no tiene instancias de WhatsApp activas configuradas |
| `whatsapp.sent: false` + "no tiene API Token" | La instancia existe pero le falta el api_token en Configuracion → Instancias |
| CORS error desde navegador | Los headers CORS ya estan configurados. Si persiste, verifica el dominio en Supabase |

### Ver logs en tiempo real

```bash
supabase functions logs catalog-ai --tail
```
