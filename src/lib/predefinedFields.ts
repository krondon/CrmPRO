/**
 * Predefined lead fields — the native columns on the `lead` table
 * that the AI can read and write via function calling.
 *
 * Each field has a default description used in the AI system prompt.
 * Users can override the description per-empresa from the settings
 * panel; overrides are stored in `empresa_predefined_field_descriptions`.
 *
 * IMPORTANT: this list is mirrored in the edge function
 * (Edge funtions/functions/ai-intent-detector/predefinedFields.ts).
 * Keep both in sync.
 */

export type PredefinedFieldType = 'text' | 'number' | 'select'

export interface PredefinedField {
  /** Key used by the AI in function calling AND as DB column name. */
  key: string
  /** Display label shown in the settings panel. */
  label: string
  /** Type used to validate values written by the AI. */
  tipo: PredefinedFieldType
  /** Allowed values when tipo === 'select'. */
  opciones?: string[]
  /** Default description injected into the AI prompt. Editable per-empresa. */
  descripcionDefault: string
}

export const PREDEFINED_FIELDS: PredefinedField[] = [
  {
    key: 'nombre_completo',
    label: 'Nombre completo',
    tipo: 'text',
    descripcionDefault:
      'Nombre completo del cliente. Actualízalo solo si el cliente se identifica explícitamente con un nombre distinto al actual.',
  },
  {
    key: 'telefono',
    label: 'Teléfono',
    tipo: 'text',
    descripcionDefault:
      'Teléfono de contacto del cliente. Actualízalo solo si el cliente proporciona un número diferente al registrado.',
  },
  {
    key: 'correo_electronico',
    label: 'Correo electrónico',
    tipo: 'text',
    descripcionDefault:
      'Correo electrónico del cliente. Guárdalo cuando el cliente lo comparta por primera vez o pida usarlo como contacto principal.',
  },
  {
    key: 'empresa',
    label: 'Empresa',
    tipo: 'text',
    descripcionDefault:
      'Nombre de la empresa para la que trabaja el cliente. Actualízalo si menciona claramente su lugar de trabajo.',
  },
  {
    key: 'ubicacion',
    label: 'Ubicación',
    tipo: 'text',
    descripcionDefault:
      'Ciudad, zona o dirección del cliente. Actualízalo cuando mencione dónde se encuentra o dónde necesita el servicio.',
  },
  {
    key: 'evento',
    label: 'Evento',
    tipo: 'text',
    descripcionDefault:
      'Tipo o nombre del evento que el cliente está organizando (boda, cumpleaños, corporativo, etc.). Llénalo cuando el cliente lo describa.',
  },
  {
    key: 'membresia',
    label: 'Membresía',
    tipo: 'text',
    descripcionDefault:
      'Tipo de membresía o plan que tiene o desea contratar el cliente. Actualízalo si menciona un plan específico.',
  },
  {
    key: 'presupuesto',
    label: 'Presupuesto',
    tipo: 'number',
    descripcionDefault:
      'Monto del presupuesto del cliente en USD. Actualízalo solo cuando el cliente confirme una cifra concreta, no estimaciones.',
  },
  {
    key: 'prioridad',
    label: 'Prioridad',
    tipo: 'select',
    opciones: ['low', 'medium', 'high'],
    descripcionDefault:
      'Prioridad del lead. Súbela a "high" si el cliente muestra urgencia o intención clara de compra, "low" si es exploratorio.',
  },
]

export const PREDEFINED_FIELD_KEYS = PREDEFINED_FIELDS.map(f => f.key)

export function getPredefinedField(key: string): PredefinedField | undefined {
  return PREDEFINED_FIELDS.find(f => f.key === key)
}
