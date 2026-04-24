export const AI_INTENTS = [
  {
    value: 'payment_intent',
    label: 'Intención de pago',
    description: 'El cliente quiere pagar o confirma un pago',
    emoji: '💳',
  },
  {
    value: 'purchase_request',
    label: 'Solicitud de compra',
    description: 'El cliente quiere adquirir un producto o servicio',
    emoji: '🛒',
  },
  {
    value: 'cancellation_intent',
    label: 'Intención de cancelación',
    description: 'El cliente quiere cancelar o se arrepiente',
    emoji: '❌',
  },
  {
    value: 'complaint',
    label: 'Queja o reclamo',
    description: 'El cliente expresa inconformidad',
    emoji: '😤',
  },
  {
    value: 'scheduling_request',
    label: 'Solicitud de cita',
    description: 'El cliente quiere agendar una cita o reunión',
    emoji: '📅',
  },
  {
    value: 'information_request',
    label: 'Solicitud de información',
    description: 'El cliente pide detalles o hace preguntas generales',
    emoji: '❓',
  },
  {
    value: 'qualified_lead',
    label: 'Lead calificado',
    description: 'El cliente muestra señales fuertes de compra',
    emoji: '⭐',
  },
  {
    value: 'unsubscribe_request',
    label: 'Solicitud de baja',
    description: 'El cliente quiere ser removido del proceso',
    emoji: '🚫',
  },
  {
    value: 'urgent_request',
    label: 'Solicitud urgente',
    description: 'El cliente indica alta prioridad o urgencia',
    emoji: '🚨',
  },
  {
    value: 'positive_feedback',
    label: 'Feedback positivo',
    description: 'El cliente expresa satisfacción con el servicio',
    emoji: '👍',
  },
] as const

export type AiIntentKey = typeof AI_INTENTS[number]['value']

export const AI_ACTION_TYPES = [
  {
    value: 'move_stage',
    label: 'Mover a etapa',
    description: 'Mueve la oportunidad a una etapa del pipeline',
  },
  {
    value: 'add_tag',
    label: 'Agregar etiqueta',
    description: 'Añade un tag a la oportunidad',
  },
  {
    value: 'notify_team',
    label: 'Notificar al equipo',
    description: 'Envía una alerta interna al equipo responsable',
  },
] as const

export type AiActionKey = typeof AI_ACTION_TYPES[number]['value']

export function getIntentMeta(value: string) {
  return AI_INTENTS.find(i => i.value === value) ?? {
    value,
    label: value,
    description: '',
    emoji: '🤖',
  }
}
