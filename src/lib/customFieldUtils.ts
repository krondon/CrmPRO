/**
 * Converts a human-readable field name to a safe JSON key (slug).
 * "Número de personas" → "numero_de_personas"
 * The key never changes after creation even if the display name is edited.
 */
export function toFieldKey(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // strip accent marks
    .replace(/[^a-z0-9]+/g, '_')       // non-alphanumeric → underscore
    .replace(/^_+|_+$/g, '')           // trim leading/trailing underscores
    .replace(/_+/g, '_')               // collapse consecutive underscores
    || 'campo'
}
