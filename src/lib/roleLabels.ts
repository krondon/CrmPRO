/**
 * Traducciones de roles de permisos y cargos (titulo_trabajo) a español.
 *
 * IDs internos en BD permanecen en inglés (owner/admin/viewer y sales_rep, etc.).
 * Solo se traduce el LABEL que ve el usuario.
 */

export type PermissionRoleId = 'owner' | 'admin' | 'viewer' | string

/** Devuelve el nombre visible (español) de un rol de permisos. */
export function getPermissionRoleLabel(role?: string | null): string {
    const r = (role || '').toLowerCase().trim()
    switch (r) {
        case 'owner':
        case 'propietario':
            return 'Propietario'
        case 'admin':
        case 'administrator':
        case 'administrador':
            return 'Administrador'
        case 'viewer':
        case 'lector':
            return 'Lector'
        default:
            return role || 'Lector'
    }
}

/**
 * Catálogo de cargos (titulo_trabajo) en español.
 * `id`: valor canónico que se guarda en `persona.titulo_trabajo`.
 * `label`: lo que se muestra al usuario.
 * `aliases`: otros valores que pueden existir en BD por compatibilidad (legacy en inglés).
 */
export interface JobTitleOption {
    id: string
    label: string
    aliases: string[]
}

export const JOB_TITLES: JobTitleOption[] = [
    { id: 'Representante de Ventas', label: 'Representante de Ventas', aliases: ['sales_rep', 'Sales Rep', 'Representante de ventas'] },
    { id: 'Gerente de Ventas',       label: 'Gerente de Ventas',       aliases: ['sales_manager', 'Sales Manager'] },
    { id: 'Agente de Soporte',       label: 'Agente de Soporte',       aliases: ['support_agent', 'Support Agent'] },
    { id: 'Gerente de Soporte',      label: 'Gerente de Soporte',      aliases: ['support_manager', 'Support Manager'] },
    { id: 'Ejecutivo de Cuentas',    label: 'Ejecutivo de Cuentas',    aliases: ['account_executive', 'Account Executive'] },
    { id: 'Desarrollo de Negocios',  label: 'Desarrollo de Negocios',  aliases: ['business_developer', 'Business Developer'] },
    { id: 'Éxito del Cliente',       label: 'Éxito del Cliente',       aliases: ['customer_success', 'Customer Success'] },
    { id: 'Administrador',           label: 'Administrador',           aliases: ['administrator', 'Administrator'] },
]

/** Normaliza cualquier valor legacy a su id canónico (en español). */
export function canonicalJobTitleId(value?: string | null): string {
    const v = (value || '').trim()
    if (!v) return ''
    const match = JOB_TITLES.find(j =>
        j.id.toLowerCase() === v.toLowerCase() ||
        j.aliases.some(a => a.toLowerCase() === v.toLowerCase())
    )
    return match ? match.id : v
}

/** Devuelve el label visible (español) de un cargo. */
export function getJobTitleLabel(value?: string | null): string {
    const id = canonicalJobTitleId(value)
    const match = JOB_TITLES.find(j => j.id === id)
    return match ? match.label : (value || '')
}

/**
 * ¿Este cargo corresponde a "Representante de Ventas"?
 * Acepta también los alias legacy en inglés.
 */
export function isSalesRepJobTitle(value?: string | null): boolean {
    return canonicalJobTitleId(value) === 'Representante de Ventas'
}
