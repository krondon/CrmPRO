export const WHATSAPP_NUMBER = '584241222233'

export const WHATSAPP_MESSAGE =
  'Hola Morna Tech, los conocí en la feria probando CRM Pro. Me gustaría más información sobre el plan completo.'

export function getWhatsAppUrl(customMessage?: string): string {
  const text = encodeURIComponent(customMessage || WHATSAPP_MESSAGE)
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`
}
