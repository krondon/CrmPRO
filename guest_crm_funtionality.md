Implementación de Invitados (Usuarios sin CRM)
Este documento describe la funcionalidad faltante detectada y los siguientes pasos para su desarrollo en la plataforma.

Problema Actual
La plataforma permite tener usuarios "sin CRM" (modo invitado), pero la interfaz y la lógica de negocio no contemplan su gestión correcta dentro de los módulos de ventas/pipelines:

Falta de Asignación de Pipelines: Desde la vista de Equipo, no es posible asignar a estos usuarios "invitados" a ningún Pipeline, ya que la UI asume que al no tener CRM activado, no interactúan con esta entidad.
Invisibilidad en Auto-asignaciones: Dado que no pueden ser añadidos a la tabla puente (persona_pipeline), la nueva lógica de asignación automática (Round Robin / Random) nunca los tomará en cuenta, perdiéndose oportunidades de colaboración real.
Ausencia de Gestión de Tareas: La plataforma tampoco cuenta con una interfaz o lógica robusta para asignar, dar seguimiento ni completar tareas si el usuario destino es un "invitado".
Flujo de Trabajo Propuesto para Desarrollar
1. Definición Exacta del Rol "Sin CRM"
Decidir qué permisos visuales tienen. ¿Pueden ver los Leads? ¿Solo pueden ver Tareas? ¿Tienen acceso a los Chats?
Comprobar si requieren un identificador exacto en base de datos (por ejemplo, roles: ['guest'] o un flag has_crm_access: false).
2. Soporte en el Modelo de Datos y UI (Equipos)
Modificar la Vista de Equipos (TeamView.tsx o equivalente): Permitir que el botón "Editar" también muestre las opciones de Pipelines y Tareas para estos usuarios invitados, quizás con un mensaje de "Acceso Limitado".
Garantizar que al asignar un pipeline a un invitado, este registro se guarde exitosamente en persona_pipeline.
3. Adaptación del Tablero (Pipeline Board)
Modo "Solo mis tareas": Si el usuario invitado no tiene CRM pero requiere interactuar con Leads específicos a los que se le ha asignado una tarea, crear una vista adaptada (por ejemplo, una lista simplificada en vez del Kanban board completo).
Si sí deben ver el Kanban, ocultar acciones de edición destructivas dependiendo de su rol específico.
4. Asignación de Tareas Independientes
Separar la lógica de creación de tareas de la obligación de tener un Lead o Empresa de por medio asumiendo que el invitado puede hacer tareas administrativas.
Crear una bandeja de entrada genérica de "Mis Tareas Activas" para invitados.
Siguientes Pasos (Acción Requerida del Usuario)
Para comenzar a implementar esto, necesitamos confirmar qué nivel exacto de acceso se espera que tenga el usuario "Sin CRM". Una vez decidido, procederemos a habilitar su asignación a pipelines desde la vista de Equipos y refinar sus permisos visuales.