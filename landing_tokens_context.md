# Contexto y Cambios Propuestos para Endpoint Multimodal de Landing Pages

**Fecha:** 3 de marzo de 2026  
**Proyecto:** CrmPRO  
**Funcionalidad:** Endpoint único para recibir leads de múltiples landing pages, usando tokens de configuración.

---

## Estado Actual

- El endpoint `/received_landing` recibe datos de leads desde landing pages.
- La identificación de la empresa/pipeline/etapa se hace por `empresa_id` (y opcionalmente `pipeline_id`, `etapa_id`) enviados en el body del request.
- Esto obliga a exponer IDs internos y/o crear múltiples endpoints para cada landing.

---

## Propuesta de Mejora

**Objetivo:**  
Permitir que un solo endpoint reciba leads de cualquier landing, usando un **token** que encapsula la configuración destino (empresa, pipeline, etapa).

**Cambios principales:**
1. **Tabla `landing_tokens`** en la base de datos:
   - Guarda tokens únicos (`lt_xxx...`) y su configuración destino.
   - Permite activar/desactivar tokens.
   - RLS para seguridad multiempresa.

2. **Refactor del endpoint:**
   - Si se envía `?token=lt_xxx` en la URL, el endpoint resuelve automáticamente la empresa/pipeline/etapa.
   - El body solo necesita los datos del lead (nombre, teléfono, etc.), sin IDs internos.
   - Si no se envía token, sigue funcionando el modo legacy (con `empresa_id` en el body).

3. **UI en el CRM:**
   - Nueva sección "Landing Tokens" en Configuraciones.
   - Permite crear, editar, eliminar y copiar tokens.
   - Muestra ejemplo de integración para desarrolladores.

---

## Ejemplo de uso

**Antes (legacy):**
```json
POST /received_landing
{
  "nombre_completo": "Roger",
  "telefono": "232424",
  "empresa_id": "b5ccfca5-5cf7-4d2a-bc69-a3a8bf0b99a8"
}
```

**Ahora (con token):**
```json
POST /received_landing?token=lt_xxx
{
  "nombre_completo": "Roger",
  "telefono": "232424"
}
```

---

## Estado de implementación

- Cambios listos en migración SQL, endpoint, servicio y UI.
- No se han aplicado aún en producción (pendiente de aprobación/implementación).
- El modo legacy sigue funcionando, no se rompe nada existente.
- **Soporte de reuniones**: El endpoint ahora acepta un objeto `reunion` opcional para crear una cita en `lead_reuniones` junto con el lead.

---

## Soporte de Reuniones (Nuevo)

El endpoint `/received_landing` ahora soporta crear una reunión junto con el lead en una sola llamada. La reunión es **opcional** — si no se envía el campo `reunion`, el comportamiento es el mismo de antes.

### Ejemplo con reunión:

```json
POST /received_landing?token=lt_xxx
{
  "nombre_completo": "Roger Pérez",
  "telefono": "584141234567",
  "reunion": {
    "titulo": "Consulta inicial",
    "fecha": "2026-03-10",
    "hora": "14:00",
    "duracion_minutos": 45,
    "notas": "Interesado en plan premium"
  }
}
```

### Campos del objeto `reunion`:

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `titulo` | string | Sí | Título de la cita |
| `fecha` | string | Sí | Fecha: `YYYY-MM-DD` o `DD/MM/YYYY` |
| `hora` | string | No | Hora 24h `HH:MM` (default `09:00`) |
| `duracion_minutos` | number | No | Duración en minutos (default `30`) |
| `notas` | string | No | Notas adicionales |

### Respuesta exitosa con reunión:

```json
{
  "success": true,
  "lead_id": "uuid-del-lead",
  "token_name": "Landing Ferrer",
  "reunion": {
    "reunion_id": "uuid-de-la-reunion",
    "titulo": "Consulta inicial",
    "fecha": "2026-03-10T14:00:00.000Z",
    "duracion_minutos": 45
  }
}
```

### Comportamiento especial:
- Si el lead **ya existe** (duplicado por teléfono+empresa), la reunión **se crea de todas formas** vinculada al lead existente.
- Si falla la creación de la reunión (campos inválidos, error de BD), el lead se crea correctamente y el campo `reunion` en la respuesta contiene el detalle del error.
- La reunión se inserta en `lead_reuniones` (la misma tabla que usa `book-appointment`).

---

**Nota:**  
Si se retoma la implementación, solo hay que ejecutar la migración SQL y redeployar la función.  
Este documento sirve para que cualquier desarrollador entienda el contexto y pueda continuar el trabajo sin perder el hilo.
