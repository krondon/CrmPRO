# Prompt Implementacion Busqueda de Chats Estilo WhatsApp

Necesito que implementes busqueda de chats estilo WhatsApp en el CRM, sin romper nada existente.

## Contexto critico

- Ahora mismo hay una regresion: no estan cargando los chats. Primero corrige eso y valida que la lista normal vuelve a cargar correctamente.
- Despues implementa la busqueda por contenido de mensajes.
- No quiero una explicacion teorica: quiero implementacion completa, validada y con diff.

## Lee primero estos archivos antes de tocar nada

- src/components/crm/chats/ChatList.tsx
- src/components/crm/ChatsView.tsx
- src/hooks/useLeadsList.ts
- src/supabase/services/leads.ts
- src/supabase/services/mensajes.ts
- src/lib/types.ts

## Objetivo funcional exacto (como WhatsApp)

1. El buscador debe encontrar coincidencias por:
- nombre del chat
- telefono
- empresa
- tags
- contenido de mensajes historicos (mensajes antiguos tambien)

2. Si busco una palabra como `epale` y esa palabra no esta en el nombre del chat, pero si en mensajes anteriores:
- debe aparecer el resultado igual
- debe mostrar quien es el chat
- debe mostrar snippet del mensaje con el termino resaltado
- al hacer click debe abrir ese chat y llevarme a esa conversacion (o al menos al contexto del mensaje encontrado)

3. Mientras escribo:
- no debe autoabrir ningun chat
- solo abre al hacer click

4. UI de resultados en busqueda:
- dos secciones, en este orden:
  - Chats
  - Mensajes
- un mismo lead puede aparecer en ambas secciones

5. Debounce de busqueda: 250ms.

6. Regla de modo normal:
- busqueda vacia o menor a 2 caracteres = volver a lista normal exactamente como estaba
- sin resetear paginacion
- sin recargar desde cero
- conservando filtro Activos/Archivados
- conservando realtime y unread counts

## Reglas de datos y backend

1. `lead.tags` es jsonb con arreglo de objetos tipo:
- id
- name
- color
La busqueda por tags debe usar `name`.

2. `mensajes.content` es text y se busca con `ilike`.

3. `mensajes.lead_id` referencia a `lead.id`.

4. No romper envio de mensajes:
- el Lead seleccionado debe tener siempre el objeto completo, con mismas columnas de la carga normal
- extrae columnas compartidas a una constante unica (por ejemplo `SHARED_LEAD_COLUMNS`) y reutilizala en todos los select de leads relacionados a busqueda
- no usar `select *`
- no usar listas de columnas divergentes

5. Merge de resultados:
- deduplicar por id
- si un lead ya existe en la lista paginada, ese lead existente gana (no sobrescribir con version parcial de busqueda)
- si viene solo por busqueda de mensajes, hacer fetch adicional de lead completo antes de permitir click

## Implementacion requerida

### En leads.ts

- constante de columnas compartidas
- funcion de busqueda por metadata + tags
- limite de 50 resultados

### En mensajes.ts

- funcion de busqueda por contenido con join a lead para filtrar empresa_id y archived
- resultado con `{ leadId, messageId, snippet, createdAt }`
- limite 50, orden desc por created_at

### En useLeadsList.ts

- estado paralelo de busqueda, separado del estado paginado normal
- debounce 250ms
- cancelacion/guard de request anterior
- ejecucion en paralelo de busqueda de leads y mensajes
- fetch extra de leads faltantes por leadIds encontrados en mensajes
- no seleccion automatica

### En ChatList.tsx y ChatsView.tsx

- renderizar secciones `Chats` y `Mensajes` cuando hay busqueda activa
- snippet resaltado
- click abre conversacion con lead completo

## Logs temporales obligatorios

Agregar exactamente 3 logs con prefijo `[chat-search]`:
- inicio de busqueda
- resultados crudos
- lead seleccionado al hacer click

## Entregables obligatorios

1. Lista de columnas compartidas detectada de carga normal antes del diff.
2. Diff unificado archivo por archivo.
3. Resultado de validacion TypeScript en archivos tocados.
4. Checklist de aceptacion con Si/No:
- Buscar `epale` devuelve resultados en Mensajes
- Snippet resaltado visible
- Click abre chat/conversacion correcta
- Escribir no abre chat automaticamente
- Limpiar busqueda restaura lista sin recarga total
- Activos/Archivados funciona durante busqueda
- Realtime sigue funcionando en modo normal
- Envio de mensajes sigue funcionando sin error de instancia

## Restricciones

- Cambios minimos y legibles
- Sin refactors fuera del alcance
- No tocar edge functions ni logica de envio
- No tocar UI de LeadDetailSheet
- Sin `any` nuevos ni `ts-ignore`
- No romper la carga normal de chats
