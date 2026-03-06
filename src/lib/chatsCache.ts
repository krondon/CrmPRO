// Caché simple en memoria para ChatsView
// Los datos se mantienen mientras la app esté abierta
// Se limpia automáticamente al cerrar el navegador

import { getLeadsPaged } from '@/supabase/services/leads'
import { detectChannel } from '@/hooks/useLeadsList'

interface CachedLeadsData {
    leads: any[]
    lastChannelByLead: Record<string, 'whatsapp' | 'instagram' | 'facebook'>
    unreadCounts: Record<string, number>
    hasMore: boolean
    offset: number
    timestamp: number
}

// Caché por empresa
const leadsCache = new Map<string, CachedLeadsData>()

// Tiempo máximo de caché: 5 minutos (300000ms)
const CACHE_TTL = 5 * 60 * 1000

// Para evitar múltiples precargas simultáneas
const preloadingCompanies = new Set<string>()

export function getCachedLeads(companyId: string): CachedLeadsData | null {
    const cached = leadsCache.get(companyId)
    if (!cached) return null

    // Verificar si el caché ha expirado
    if (Date.now() - cached.timestamp > CACHE_TTL) {
        leadsCache.delete(companyId)
        return null
    }

    return cached
}

export function setCachedLeads(companyId: string, data: Omit<CachedLeadsData, 'timestamp'>): void {
    leadsCache.set(companyId, {
        ...data,
        timestamp: Date.now()
    })
}

export function updateCachedLeads(companyId: string, updates: Partial<CachedLeadsData>): void {
    const existing = leadsCache.get(companyId)
    if (existing) {
        leadsCache.set(companyId, {
            ...existing,
            ...updates,
            timestamp: Date.now()
        })
    }
}

export function invalidateLeadsCache(companyId: string): void {
    leadsCache.delete(companyId)
}

export function clearAllLeadsCache(): void {
    leadsCache.clear()
}

// Precargar leads de una empresa en segundo plano
export async function preloadChatsForCompany(companyId: string): Promise<void> {
    // Si ya hay datos en caché vigentes, no hacer nada
    if (getCachedLeads(companyId)) {
        console.log('[ChatsCache] Ya hay datos en caché para', companyId)
        return
    }

    // Evitar precargas simultáneas
    if (preloadingCompanies.has(companyId)) {
        console.log('[ChatsCache] Ya se está precargando', companyId)
        return
    }

    preloadingCompanies.add(companyId)
    console.log('[ChatsCache] Precargando chats en segundo plano para empresa:', companyId)

    try {
        const startTime = Date.now()
        const { data: page } = await getLeadsPaged({ empresaId: companyId, limit: 500, offset: 0 })
        const data = page || []

        const mapped = data.map((d: any) => ({
            ...d,
            id: d.id,
            name: d.nombre_completo || d.name || 'Sin Nombre',
            phone: d.telefono || d.phone,
            email: d.correo_electronico || d.email,
            createdAt: d.created_at ? new Date(d.created_at) : new Date(),
            lastMessage: d.last_message || '',
            lastMessageAt: d.last_message_at ? new Date(d.last_message_at) : (d.created_at ? new Date(d.created_at) : undefined),
            lastMessageSender: d.last_message_sender || 'team',
            avatar: d.avatar || undefined,
            company: d.empresa || d.company || undefined,
            archived: !!d.archived,
            archivedAt: d.archived_at ? new Date(d.archived_at) : undefined,
        }))

        const channelMap: Record<string, 'whatsapp' | 'instagram' | 'facebook'> = {}
        for (const l of mapped) channelMap[l.id] = detectChannel(l)

        setCachedLeads(companyId, {
            leads: mapped,
            lastChannelByLead: channelMap,
            unreadCounts: {},
            hasMore: mapped.length >= 500,
            offset: mapped.length
        })

        console.log('[ChatsCache] ✅ Precarga completada en', Date.now() - startTime, 'ms con', mapped.length, 'leads')
    } catch (err) {
        console.warn('[ChatsCache] Error en precarga:', err)
    } finally {
        preloadingCompanies.delete(companyId)
    }
}
