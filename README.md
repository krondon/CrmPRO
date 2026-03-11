# CRM Multi-Tenant con Integración SuperAPI

Sistema CRM multi-tenant con soporte para múltiples instancias de WhatsApp, Instagram y Facebook a través de SuperAPI.

## 🔗 Configuración de Webhook SuperAPI

### URL del Webhook

**IMPORTANTE**: La URL del webhook DEBE incluir el parámetro `secret` para identificar la empresa.

**Formato correcto:**
```
https://[TU-PROYECTO].supabase.co/functions/v1/webhook-chat?secret=[WEBHOOK_SECRET]
```

**Ejemplo:**
```
https://bjdqjxrwvktfqienbzop.supabase.co/functions/v1/webhook-chat?secret=perdomo_secret_crm
```

### Configuración en SuperAPI

1. **Callback URL**: `https://[TU-PROYECTO].supabase.co/functions/v1/webhook-chat?secret=[WEBHOOK_SECRET]&x=1`
2. **Identificador de verificación**: `[WEBHOOK_SECRET]` (el mismo valor)

**Ejemplo real:**
```
Callback URL: https://bjdqjxrwvktfqienbzop.supabase.co/functions/v1/webhook-chat?secret=perdomo_secret_crm&x=1
Identificador: perdomo_secret_crm
```

> **Nota**: El parámetro `&x=1` es un parámetro dummy necesario para que SuperAPI pueda agregar sus parámetros de verificación (`hub.verify_token`, `hub.challenge`, `hub.mode`) correctamente usando `&` en lugar de `?`. SuperAPI NO agrega el `secret` en las peticiones POST de mensajes, por eso debe estar en la URL base.

### Eventos a Configurar

Asegúrate de activar estos eventos en SuperAPI:
- ✅ `message` o `messages.received`
- ✅ `message_create`
- ✅ Todos los eventos relacionados con mensajes entrantes

---

## 📅 Configuración de Agendamiento de Citas (Super API → CRM)

Permite que la IA de la Super API agende citas automáticamente en el calendario del CRM mediante un POST a la Edge Function `book-appointment`.

### URL del Endpoint

```
https://[TU-PROYECTO].supabase.co/functions/v1/book-appointment
```

### Token de Autenticación

El token se valida con el secret `BOOK_APPOINTMENT_TOKEN` en Supabase Dashboard → **Edge Functions → Secrets**.  
Créalo si aún no existe.

### Estructura del Body (POST JSON)

```json
{
  "token": "<BOOK_APPOINTMENT_TOKEN>",
  "phone": "584141234567",
  "title": "Consulta de ventas",
  "date": "2026-02-25",
  "time": "10:00",
  "duration_minutes": 60,
  "notes": "Interesado en el plan premium"
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `token` | string | Token secreto (requerido) |
| `phone` | string | Teléfono del cliente (requerido) |
| `title` | string | Título de la cita (requerido) |
| `date` | string | Fecha en formato `YYYY-MM-DD` (requerido) |
| `time` | string | Hora en formato `HH:MM` 24h (opcional, default `09:00`) |
| `duration_minutes` | number | Duración en minutos (opcional, default `30`) |
| `notes` | string | Notas adicionales (opcional) |

---

## � Registro Dual: Dueño / Empleado

### Descripción

El sistema soporta dos flujos de registro separados:

| Tipo | Comportamiento |
|---|---|
| **Dueño (owner)** | Crea cuenta + empresa automática con código único. Accede al CRM completo. |
| **Empleado (employee)** | Crea cuenta sin empresa. Se redirige a `/join-crm` para solicitar unirse a un CRM existente. |

### Flujo del Empleado

1. El empleado selecciona "Soy Empleado / Invitado" en la pantalla de registro
2. Completa el formulario (nombre, email, contraseña)
3. Confirma email → inicia sesión → es redirigido a `/join-crm`
4. Ingresa el **código de empresa** que le proporcionó el dueño
5. Envía una solicitud de unión (con mensaje opcional)
6. El dueño ve la solicitud en **Equipo** → la aprueba o rechaza
7. Al ser aprobado, el empleado aparece como miembro con rol `viewer`

### Código de Empresa

Cada empresa tiene un `codigo_empresa` de 8 caracteres alfanuméricos (ej: `A50FCEDC`) generado automáticamente.

- **Dueño**: Lo encuentra en **Configuración → Empresas** junto al nombre de la empresa, con botón de copiar
- **Empleado**: Lo ingresa en `/join-crm` para buscar la empresa y solicitar unirse

### Migración de Base de Datos

Archivo: `database/migrations/registro_dual_y_solicitudes.sql`

**¿Qué hace?**

| # | Operación | Efecto |
|---|---|---|
| 1 | `ALTER TABLE usuarios ADD COLUMN account_type` | Agrega campo con default `'owner'`. Usuarios existentes no se ven afectados. |
| 2 | `ALTER TABLE empresa ADD COLUMN codigo_empresa` | Agrega código único nullable. |
| 3-4 | Función + Trigger `generar_codigo_empresa()` | Auto-genera código en cada INSERT. |
| 5 | `UPDATE empresa SET codigo_empresa = ...` | Genera códigos para empresas existentes que no tengan. |
| 6 | `CREATE TABLE solicitudes_union` | Nueva tabla para solicitudes de unión. |
| 7-8 | RLS en `solicitudes_union` | Solicitante ve sus solicitudes; dueño ve las de su empresa. |
| 9 | `FUNCTION buscar_empresa_por_codigo()` | RPC con `SECURITY DEFINER` para buscar empresa por código sin abrir la tabla. |
| 10 | `POLICY empresa_select_member` | Miembros pueden ver empresas a las que pertenecen. |
| 11 | Índices | Performance en búsqueda por código y por status. |

**¿Es seguro?**

- ✅ Usa `IF NOT EXISTS` / `IF EXISTS` — se puede ejecutar más de una vez sin errores
- ✅ `ALTER TABLE ADD COLUMN` con default no rompe datos existentes
- ✅ La búsqueda por código usa RPC con `SECURITY DEFINER` — **no** abre la tabla `empresa` a todos los usuarios
- ✅ RLS estricto: cada política usa `auth.uid()` para limitar acceso
- ✅ Todo envuelto en `BEGIN` / `COMMIT` — si algo falla, se hace rollback completo

**Ejecutar en Supabase SQL Editor:**

```sql
-- Copiar el contenido completo de database/migrations/registro_dual_y_solicitudes.sql
```

**Verificación post-migración:**

```sql
-- 1. Verificar account_type en usuarios
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'usuarios' AND column_name = 'account_type';

-- 2. Verificar códigos en empresa
SELECT id, nombre_empresa, codigo_empresa FROM empresa LIMIT 5;

-- 3. Verificar tabla solicitudes_union
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'solicitudes_union'
ORDER BY ordinal_position;

-- 4. Verificar políticas RLS
SELECT policyname, tablename, cmd
FROM pg_policies
WHERE tablename IN ('solicitudes_union', 'empresa')
ORDER BY tablename, policyname;

-- 5. Verificar función RPC
SELECT routine_name FROM information_schema.routines
WHERE routine_name = 'buscar_empresa_por_codigo';
```

### Estructura de Tablas (Nuevas/Modificadas)

**`usuarios`** (columna agregada):
```
account_type TEXT DEFAULT 'owner' CHECK ('owner' | 'employee')
```

**`empresa`** (columna agregada):
```
codigo_empresa TEXT UNIQUE — auto-generado por trigger
```

**`solicitudes_union`** (tabla nueva):
```
id              UUID PK
solicitante_id  UUID FK → auth.users
solicitante_email TEXT
solicitante_nombre TEXT
mensaje         TEXT (opcional)
empresa_id      UUID FK → empresa
status          TEXT ('pending' | 'approved' | 'rejected')
role_asignado   TEXT DEFAULT 'viewer'
created_at      TIMESTAMPTZ
responded_at    TIMESTAMPTZ
responded_by    UUID FK → auth.users
UNIQUE(solicitante_id, empresa_id)
```

### Archivos Frontend Modificados

| Archivo | Cambio |
|---|---|
| `src/lib/types.ts` | `AccountType`, `SolicitudUnionDB`, `codigo_empresa` en `EmpresaDB` |
| `src/supabase/auth.ts` | `register()` acepta metadata (account_type, business_name) |
| `src/supabase/services/usuarios.ts` | `account_type` en `CreateUsuarioDTO` |
| `src/supabase/services/solicitudes.ts` | **Nuevo** — RPC buscar empresa, CRUD solicitudes |
| `src/supabase/services/empresa.ts` | Select incluye `codigo_empresa` |
| `src/hooks/useAuth.tsx` | Registro dual, login lee metadata de Auth para crear usuario correctamente |
| `src/components/crm/RegisterView.tsx` | Selector owner/employee + formularios diferenciados |
| `src/components/crm/JoinCRMView.tsx` | **Nuevo** — búsqueda por código + envío solicitud |
| `src/components/crm/CompanyManagement.tsx` | Muestra `codigoEmpresa` con botón copiar |
| `src/components/crm/TeamView.tsx` | Panel solicitudes pendientes (aprobar/rechazar) |
| `src/App.tsx` | Ruta `/join-crm`, redirección empleados sin empresa |

### Estado de implementación (2026-03-09)

**Completado:**
- [x] Migración SQL ejecutada y verificada en producción
- [x] Selector dual en pantalla de registro (owner / employee)
- [x] Formularios diferenciados por tipo de cuenta
- [x] Vista `/join-crm` para buscar empresa por código y enviar solicitud
- [x] Panel de solicitudes pendientes en vista de Equipo (owner)
- [x] Código de empresa visible en Configuración → Empresas (con botón copiar)
- [x] RPC segura `buscar_empresa_por_codigo` con SECURITY DEFINER
- [x] Metadata de Auth (account_type, business_name) se guarda en registro y se lee en login
- [x] Rollback SQL documentado

**Pendiente de pruebas:**
- [ ] Flujo completo: registro employee → confirmar email → login → /join-crm → buscar código → enviar solicitud
- [ ] Flujo completo: owner ve solicitud en Equipo → aprueba → employee accede al CRM
- [ ] Verificar que el employee aprobado ve correctamente la empresa en el selector

### Bug fix: Login post-confirmación de email

**Problema:** Al registrar un usuario, si Supabase requiere confirmación de email, el `register()` retorna temprano sin crear fila en `usuarios`. Al hacer login después de confirmar, el usuario se creaba sin `account_type` ni nombre correcto.

**Solución:** Se guardan `account_type` y `business_name` en `user_metadata` de Supabase Auth durante el registro (`signUp({ options: { data: {...} } })`). El login lee esos metadatos al crear la fila en `usuarios`.

### Rollback

Si necesitas revertir la migración:

```sql
-- Eliminar tabla y función
DROP TABLE IF EXISTS solicitudes_union CASCADE;
DROP FUNCTION IF EXISTS buscar_empresa_por_codigo(TEXT);
DROP FUNCTION IF EXISTS generar_codigo_empresa();
DROP TRIGGER IF EXISTS trg_generar_codigo_empresa ON empresa;

-- Quitar columnas
ALTER TABLE empresa DROP COLUMN IF EXISTS codigo_empresa;
ALTER TABLE usuarios DROP COLUMN IF EXISTS account_type;

-- Quitar política de miembros
DROP POLICY IF EXISTS empresa_select_member ON empresa;
```

---

## �📚 Documentación Completa

Para instrucciones detalladas de configuración y pruebas, consulta:
- **Walkthrough**: `.gemini/antigravity/brain/[conversation-id]/walkthrough.md`
- **Plan de Implementación**: `.gemini/antigravity/brain/[conversation-id]/implementation_plan.md`

---

📄 **License**: MIT



.
..
....
.....
......