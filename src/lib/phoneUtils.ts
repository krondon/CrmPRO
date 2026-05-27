/**
 * Utilidades de normalización de teléfonos.
 *
 * Objetivo: guardar siempre los teléfonos en formato internacional (sin "+",
 * sin separadores) para que SuperAPI/WhatsApp puedan armar el chatId
 * `<numero>@c.us` y para que la deduplicación por teléfono y el matcheo de
 * webhooks entrantes funcionen.
 */

// Códigos de operadora móvil de Venezuela.
// 412 (Digitel), 414/424 (Movistar), 416/426 (Movilnet).
const VE_LOCAL_PATTERN = /^0(412|414|416|424|426)\d{7}$/

/**
 * Normaliza un teléfono a formato internacional.
 *
 * Caso Venezuela: si llega en formato local (0 + operadora + 7 dígitos,
 * ej. "04143047373") lo convierte al internacional ("584143047373")
 * reemplazando el "0" líder por "58".
 *
 * Cualquier otro formato (ya internacional, otro país, etc.) se devuelve
 * solo con los dígitos, sin alterar el prefijo. Si la entrada es vacía o
 * inválida, devuelve string vacío.
 */
export function normalizePhone(raw: string | null | undefined): string {
    if (!raw) return ''

    const digits = String(raw)
        .replace('@c.us', '')
        .replace('@s.whatsapp.net', '')
        .replace(/[^\d]/g, '')
        .trim()

    if (VE_LOCAL_PATTERN.test(digits)) {
        return '58' + digits.slice(1)
    }

    return digits
}

/** True si el teléfono está en formato local venezolano (0412..., etc.). */
export function isVenezuelanLocalPhone(raw: string | null | undefined): boolean {
    if (!raw) return false
    const digits = String(raw).replace(/[^\d]/g, '')
    return VE_LOCAL_PATTERN.test(digits)
}
