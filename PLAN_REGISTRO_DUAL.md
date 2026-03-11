# 🔧 Plan: Registro Dual + Solicitud de Unión

> **Fecha**: 9 Marzo 2026  
> **Estado**: 📋 Planificación  
> **Riesgo BD**: ⚠️ Medio (ALTER en tablas existentes + tabla nueva)

---

## 📌 Objetivo

Dividir el registro en **dos flujos**:
1. **Dueño/Empresa** → Crea su CRM (flujo actual)
2. **Empleado/Invitado** → Solo crea cuenta, sin CRM propio

Agregar **solicitudes de unión**: el empleado busca un CRM por código y envía solicitud. El dueño la aprueba o rechaza.

---

## 📐 Estado Actual (antes de cambios)

| Componente | Comportamiento actual |
|---|---|
| `RegisterView.tsx` | Un solo formulario: email + password + nombre empresa → siempre crea empresa |
| `useAuth.register()` | Llama `createUsuario()` + `createEmpresa()` siempre |
| `useAuth.login()` | Si el usuario no tiene empresas → crea una automáticamente |
| Tabla `usuarios` | Columnas: `id, email, nombre, avatar_url, recovery_email, created_at` — no hay campo de tipo de cuenta |
| Tabla `empresa` | Columnas: `id, nombre_empresa, usuario_id, created_at, logo_url` — no hay código público |
| Tabla `empresa_miembros` | `id, empresa_id, usuario_id, email, role, created_at` — solo se llena vía invitaciones |
| Flujo invitado | Dueño envía invitación → empleado recibe link → acepta → se añade a `empresa_miembros` |

---

## 🗄️ FASE 1: Cambios en Base de Datos

### 1.1 ALTER tabla `usuarios` — agregar `account_type`

**Riesgo**: 🟢 Bajo (ADD COLUMN con DEFAULT, no rompe nada existente)

```sql
ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'owner';
-- Valores: 'owner' | 'employee'
-- Todos los usuarios existentes quedan como 'owner' (correcto, ya tienen empresa)
```

**Lo que hace**: Los usuarios existentes quedan con `account_type = 'owner'` automáticamente. Ninguna consulta existente se rompe porque es un campo nuevo con default.

- [ ] SQL ejecutado en Supabase
- [ ] Verificado que usuarios existentes tienen `account_type = 'owner'`

---

### 1.2 ALTER tabla `empresa` — agregar `codigo_empresa`

**Riesgo**: 🟢 Bajo (ADD COLUMN nullable + UPDATE posterior)

```sql
-- Paso 1: Agregar columna
ALTER TABLE empresa
ADD COLUMN IF NOT EXISTS codigo_empresa text UNIQUE;

-- Paso 2: Generar códigos para empresas existentes (8 chars del UUID, uppercase)
UPDATE empresa
SET codigo_empresa = UPPER(SUBSTRING(id::text, 1, 8))
WHERE codigo_empresa IS NULL;

-- Paso 3: Hacer NOT NULL después de rellenar
ALTER TABLE empresa
ALTER COLUMN codigo_empresa SET NOT NULL;

-- Paso 4: Función para auto-generar en nuevas empresas
CREATE OR REPLACE FUNCTION generar_codigo_empresa()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo_empresa IS NULL THEN
    NEW.codigo_empresa := UPPER(SUBSTRING(NEW.id::text, 1, 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_generar_codigo_empresa ON empresa;
CREATE TRIGGER tr_generar_codigo_empresa
  BEFORE INSERT ON empresa
  FOR EACH ROW
  EXECUTE FUNCTION generar_codigo_empresa();
```

**Lo que hace**: Cada empresa obtiene un código corto (ej: `A50FCEDC`) que el dueño comparte con sus empleados para que lo busquen.

- [ ] Paso 1 ejecutado (ADD COLUMN)
- [ ] Paso 2 ejecutado (UPDATE existentes)
- [ ] Paso 3 ejecutado (SET NOT NULL)
- [ ] Paso 4 ejecutado (trigger)
- [ ] Verificado con `SELECT id, nombre_empresa, codigo_empresa FROM empresa LIMIT 10;`

---

### 1.3 Nueva RLS en `empresa` — permitir búsqueda por código

**Riesgo**: 🟡 Medio (modifica política SELECT de empresa)

Actualmente la política `empresa_select` solo permite `usuario_id = auth.uid()`. Necesitamos que un empleado autenticado pueda buscar una empresa por código (sin ver todas).

```sql
-- Política adicional: cualquier usuario autenticado puede buscar por codigo_empresa
-- (no reemplaza la política existente, se agrega como OR)
DROP POLICY IF EXISTS empresa_select ON empresa;
CREATE POLICY empresa_select ON empresa
  FOR SELECT TO authenticated
  USING (
    -- Dueño ve sus empresas
    usuario_id = auth.uid()
    -- Miembro ve empresas donde pertenece
    OR id IN (SELECT empresa_id FROM empresa_miembros WHERE usuario_id = auth.uid())
    -- Cualquier autenticado puede buscar por código (para solicitar unión)
    OR codigo_empresa IS NOT NULL
  );
```

> ⚠️ **NOTA**: La condición `codigo_empresa IS NOT NULL` expone nombre y código de todas las empresas a usuarios autenticados. Esto es necesario para la búsqueda. **NO expone datos sensibles** (leads, contactos, etc.). Si prefieres más restricción, podemos usar una Edge Function con `service_role` en su lugar.

**Alternativa más restrictiva (búsqueda vía Edge Function)**:
```
-- No tocar política de empresa
-- Crear Edge Function "search-company" que usa service_role para buscar por código
-- y retorna solo { id, nombre_empresa, codigo_empresa, logo_url }
```

- [ ] Decidir: ¿RLS abierto o Edge Function? → `___________`
- [ ] SQL/función ejecutado
- [ ] Verificado: usuario autenticado puede buscar por código
- [ ] Verificado: usuario autenticado NO ve datos internos (leads, contactos, etc.)

---

### 1.4 Nueva tabla `solicitudes_union`

**Riesgo**: 🟢 Bajo (tabla nueva, no afecta nada existente)

```sql
CREATE TABLE IF NOT EXISTS solicitudes_union (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Quién solicita
  solicitante_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  solicitante_email text NOT NULL,
  solicitante_nombre text,
  mensaje text,

  -- A qué empresa
  empresa_id uuid NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,

  -- Estado
  status text NOT NULL DEFAULT 'pending',
  -- Valores: 'pending' | 'approved' | 'rejected'

  role_asignado text DEFAULT 'viewer',
  -- Rol que el dueño elige al aprobar

  -- Auditoría
  created_at timestamptz DEFAULT now(),
  responded_at timestamptz,
  responded_by uuid REFERENCES auth.users(id),

  -- Evitar solicitudes duplicadas activas
  CONSTRAINT uq_solicitud_activa UNIQUE(solicitante_id, empresa_id, status)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_solicitudes_empresa_status
  ON solicitudes_union(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_solicitudes_solicitante
  ON solicitudes_union(solicitante_id);

-- RLS
ALTER TABLE solicitudes_union ENABLE ROW LEVEL SECURITY;

-- El solicitante ve y crea sus propias solicitudes
CREATE POLICY solicitudes_select_self ON solicitudes_union
  FOR SELECT TO authenticated
  USING (solicitante_id = auth.uid());

CREATE POLICY solicitudes_insert_self ON solicitudes_union
  FOR INSERT TO authenticated
  WITH CHECK (solicitante_id = auth.uid());

-- El dueño de la empresa ve y responde solicitudes
CREATE POLICY solicitudes_select_owner ON solicitudes_union
  FOR SELECT TO authenticated
  USING (empresa_id IN (SELECT id FROM empresa WHERE usuario_id = auth.uid()));

CREATE POLICY solicitudes_update_owner ON solicitudes_union
  FOR UPDATE TO authenticated
  USING (empresa_id IN (SELECT id FROM empresa WHERE usuario_id = auth.uid()))
  WITH CHECK (empresa_id IN (SELECT id FROM empresa WHERE usuario_id = auth.uid()));
```

- [ ] SQL ejecutado
- [ ] Verificado: `SELECT * FROM solicitudes_union LIMIT 1;` (tabla existe, vacía)
- [ ] Verificado RLS: solicitante solo ve las suyas
- [ ] Verificado RLS: dueño ve las de su empresa

---

## ⚙️ FASE 2: Cambios en Servicios (Backend)

### 2.1 Actualizar tipos — `src/lib/types.ts`

```ts
// Agregar a UsuarioDB:
account_type: 'owner' | 'employee'

// Nueva interface:
export interface SolicitudUnionDB {
  id: string
  solicitante_id: string
  solicitante_email: string
  solicitante_nombre: string | null
  mensaje: string | null
  empresa_id: string
  status: 'pending' | 'approved' | 'rejected'
  role_asignado: string
  created_at: string
  responded_at: string | null
  responded_by: string | null
}
```

- [ ] `UsuarioDB` actualizado con `account_type`
- [ ] `SolicitudUnionDB` creada
- [ ] Build pasa sin errores de tipos

---

### 2.2 Actualizar servicio de usuarios — `src/supabase/services/usuarios.ts`

```ts
// Modificar CreateUsuarioDTO:
interface CreateUsuarioDTO {
  id: string
  email: string
  nombre: string
  account_type?: 'owner' | 'employee'  // ← nuevo, default 'owner'
}

// Modificar createUsuario:
export async function createUsuario({ id, email, nombre, account_type = 'owner' }: CreateUsuarioDTO) {
  const { data, error } = await supabase
    .from('usuarios')
    .insert({ id, email, nombre, account_type })  // ← incluir account_type
    .select()
    .single()
  // ...
}
```

- [ ] `CreateUsuarioDTO` actualizado
- [ ] `createUsuario` envía `account_type`
- [ ] Verificado: registro owner sigue funcionando igual

---

### 2.3 Nuevo servicio — `src/supabase/services/solicitudes.ts`

Funciones a crear:

| Función | Descripción | Quién la usa |
|---|---|---|
| `buscarEmpresaPorCodigo(codigo)` | Busca empresa por `codigo_empresa` | Empleado |
| `crearSolicitud(empresaId, nombre, mensaje?)` | Inserta en `solicitudes_union` | Empleado |
| `getMisSolicitudes()` | Solicitudes del usuario actual | Empleado |
| `getSolicitudesPendientes(empresaId)` | Solicitudes pendientes de una empresa | Dueño |
| `aprobarSolicitud(solicitudId, role)` | Cambia status → approved, inserta en `empresa_miembros` | Dueño |
| `rechazarSolicitud(solicitudId)` | Cambia status → rejected | Dueño |

- [ ] Archivo creado
- [ ] `buscarEmpresaPorCodigo` funciona
- [ ] `crearSolicitud` funciona (inserta + notifica al dueño)
- [ ] `getMisSolicitudes` funciona
- [ ] `getSolicitudesPendientes` funciona
- [ ] `aprobarSolicitud` funciona (inserta en `empresa_miembros` + notifica al solicitante)
- [ ] `rechazarSolicitud` funciona (notifica al solicitante)

---

### 2.4 Modificar `useAuth.tsx`

#### `register()` — Acepta `accountType`

```
ANTES: register(email, password, businessName)
         → createUsuario() + createEmpresa() SIEMPRE

DESPUÉS: register(email, password, name, accountType)
         → Si 'owner':  createUsuario(account_type:'owner')  + createEmpresa() ← igual que ahora
         → Si 'employee': createUsuario(account_type:'employee') + NO crear empresa
```

#### `login()` — No crear empresa si es employee

```
ANTES (línea ~260):
  if (uiCompanies.length === 0) {
      createEmpresa(...)  // Siempre crea empresa
  }

DESPUÉS:
  if (uiCompanies.length === 0 && row.account_type === 'owner') {
      createEmpresa(...)  // Solo si es owner
  }
  // Si es employee sin empresas → la UI lo redirige a /join-crm
```

#### Nuevo estado: `accountType` en User

```ts
// Agregar a la interface User:
accountType: 'owner' | 'employee'

// Propagar en login y register al crear newUser
```

- [ ] `register()` modificado para aceptar `accountType`
- [ ] `login()` NO crea empresa si `account_type === 'employee'`
- [ ] `User` interface incluye `accountType`
- [ ] Flujo owner existente sigue funcionando sin cambios
- [ ] Flujo employee nuevo: registro → no empresa → redirige

---

## 🖥️ FASE 3: Cambios en Frontend

### 3.1 Modificar `RegisterView.tsx` — Selector de tipo

Agregar paso previo con dos opciones antes del formulario:

```
┌──────────────────────────────────────┐
│         CRM Pro - Registro           │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 🏢 Soy Dueño / Empresa        │  │
│  │ Crear mi propio CRM            │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 👤 Soy Empleado / Invitado    │  │
│  │ Unirme a un CRM existente      │  │
│  └────────────────────────────────┘  │
│                                      │
│  ¿Ya tienes cuenta? Iniciar sesión   │
└──────────────────────────────────────┘
```

- Si elige **Dueño** → formulario actual (email, password, nombre empresa)
- Si elige **Empleado** → formulario ligero (email, password, nombre personal)
  - El label cambia de "Nombre de la empresa" a "Tu nombre"

- [ ] Selector de tipo creado
- [ ] Formulario owner funciona igual que antes
- [ ] Formulario employee no pide nombre de empresa
- [ ] `onRegister` pasa `accountType` al hook

---

### 3.2 Nueva vista `JoinCRMView.tsx`

Vista a la que llegan empleados sin empresa. Permite:
1. Buscar empresa por código
2. Ver resultado (nombre, logo)
3. Escribir mensaje opcional
4. Enviar solicitud
5. Ver historial de solicitudes enviadas

```
┌──────────────────────────────────────┐
│     Unirse a un CRM                  │
│                                      │
│  Código: [________] [🔍 Buscar]      │
│                                      │
│  ✅ "Ferretería López"               │
│                                      │
│  Mensaje (opcional):                 │
│  ┌────────────────────────────────┐  │
│  │ Hola, soy del equipo ventas   │  │
│  └────────────────────────────────┘  │
│                                      │
│  [ Enviar Solicitud ]                │
│                                      │
│  ── Mis solicitudes ──               │
│  • Ferretería López — ⏳ Pendiente   │
│  • CRM Demo — ❌ Rechazada           │
└──────────────────────────────────────┘
```

- [ ] Componente creado
- [ ] Búsqueda por código funciona
- [ ] Envío de solicitud funciona
- [ ] Lista de solicitudes enviadas funciona
- [ ] Muestra estado en tiempo real

---

### 3.3 Ruta nueva en `App.tsx`

```tsx
<Route path="/join-crm" element={
  <ProtectedRoute>
    <JoinCRMView />
  </ProtectedRoute>
} />
```

Redirección automática:
- Employee sin empresas → `/join-crm`
- Employee con empresa aprobada → `/guest/dashboard`

- [ ] Ruta agregada
- [ ] Redirección automática funciona
- [ ] Employee aprobado navega a guest mode correctamente

---

### 3.4 Panel de solicitudes para el dueño

Agregar en `NotificationsView.tsx` (o en `TeamView.tsx`) una sección:

```
┌──────────────────────────────────────┐
│  📬 Solicitudes de Unión (2)         │
│                                      │
│  👤 María García                     │
│     maria@gmail.com                  │
│     "Soy del equipo de ventas"       │
│     Rol: [Viewer ▼]                  │
│     [✅ Aprobar] [❌ Rechazar]        │
│                                      │
│  👤 Pedro López                      │
│     pedro@correo.com                 │
│     Sin mensaje                      │
│     Rol: [Viewer ▼]                  │
│     [✅ Aprobar] [❌ Rechazar]        │
└──────────────────────────────────────┘
```

- [ ] Sección de solicitudes creada
- [ ] Aprobar inserta en `empresa_miembros` correctamente
- [ ] Rechazar actualiza estado y notifica
- [ ] El empleado ve su CRM inmediatamente después de aprobación

---

### 3.5 Código de empresa visible en `SettingsView.tsx`

El dueño necesita ver y copiar su código para compartirlo:

```
┌──────────────────────────────────────┐
│  Tu código de empresa:               │
│  ┌────────────────────┐              │
│  │ A50FCEDC  [📋 Copiar]│            │
│  └────────────────────┘              │
│  Comparte este código con tus        │
│  empleados para que soliciten unirse │
└──────────────────────────────────────┘
```

- [ ] Código visible en settings
- [ ] Botón copiar funciona
- [ ] Texto auxiliar explica para qué sirve

---

## 🔒 FASE 4: Verificaciones de Seguridad

- [ ] Employee NO puede crear empresa desde la UI
- [ ] Employee NO puede acceder a `/dashboard` sin empresa aprobada
- [ ] Dueño sigue con flujo 100% igual al actual
- [ ] RLS de `solicitudes_union`: solicitante solo ve las suyas
- [ ] RLS de `solicitudes_union`: dueño solo ve las de su empresa
- [ ] No se puede aprobar una solicitud ya aprobada/rechazada
- [ ] Código de empresa no es predecible (pero tampoco necesita ser secreto)

---

## 📋 Orden de Implementación

| # | Paso | Fase | Dependencias |
|---|------|------|---|
| 1 | ALTER `usuarios` (account_type) | BD | Ninguna |
| 2 | ALTER `empresa` (codigo_empresa + trigger) | BD | Ninguna |
| 3 | CREATE `solicitudes_union` + RLS | BD | Ninguna |
| 4 | Decidir: RLS abierto vs Edge Function para búsqueda | BD | #2 |
| 5 | Actualizar types.ts | Tipos | #1, #3 |
| 6 | Actualizar usuarios.ts | Servicio | #1, #5 |
| 7 | Crear solicitudes.ts | Servicio | #3, #5 |
| 8 | Modificar useAuth.tsx (register + login) | Hook | #6 |
| 9 | Modificar RegisterView.tsx (selector dual) | Frontend | #8 |
| 10 | Crear JoinCRMView.tsx | Frontend | #7, #8 |
| 11 | Agregar ruta /join-crm en App.tsx | Frontend | #10 |
| 12 | Panel solicitudes en NotificationsView/TeamView | Frontend | #7 |
| 13 | Código empresa en SettingsView | Frontend | #2 |
| 14 | Verificaciones de seguridad | QA | Todo |

---

## ⚡ SQLs de Consulta (verificación pre-cambio)

Correr estas queries ANTES de ejecutar migraciones para tener un snapshot:

```sql
-- 1. Estructura actual de usuarios
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns WHERE table_name = 'usuarios' ORDER BY ordinal_position;

-- 2. Estructura actual de empresa
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns WHERE table_name = 'empresa' ORDER BY ordinal_position;

-- 3. Cuántos usuarios hay (todos quedarán como 'owner')
SELECT count(*) as total_usuarios FROM usuarios;

-- 4. Cuántas empresas hay (todas recibirán codigo_empresa)
SELECT count(*) as total_empresas FROM empresa;

-- 5. Políticas actuales de empresa
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'empresa';
```

---

## ⏪ Plan de Rollback (si algo sale mal)

```sql
-- Revertir 1.1
ALTER TABLE usuarios DROP COLUMN IF EXISTS account_type;

-- Revertir 1.2
DROP TRIGGER IF EXISTS tr_generar_codigo_empresa ON empresa;
DROP FUNCTION IF EXISTS generar_codigo_empresa();
ALTER TABLE empresa DROP COLUMN IF EXISTS codigo_empresa;

-- Revertir 1.3 (restaurar política original)
DROP POLICY IF EXISTS empresa_select ON empresa;
CREATE POLICY empresa_select ON empresa FOR SELECT USING (usuario_id = auth.uid());

-- Revertir 1.4
DROP TABLE IF EXISTS solicitudes_union;
```

> **IMPORTANTE**: El rollback de BD es seguro porque son ADD COLUMN (no borran datos) y CREATE TABLE (nueva). Ninguna columna existente se modifica.
