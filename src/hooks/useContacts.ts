/**
 * useContacts - Hook for managing contacts data
 * Fetches contacts from Supabase 'contactos' table
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Contact, ContactDB } from '@/lib/types'
import {
    getContacts,
    createContact as createContactService,
    createContactsBulk as createContactsBulkService,
    updateContact as updateContactService,
    deleteContact as deleteContactService,
    archiveContact as archiveContactService
} from '@/supabase/services/contacts'
import { toast } from 'sonner'

// Simple debounce implementation
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value)
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay)
        return () => clearTimeout(handler)
    }, [value, delay])
    return debouncedValue
}

/**
 * Map database contact to Contact type
 */
function mapDBToContact(db: ContactDB): Contact {
    return {
        id: db.id,
        name: db.nombre,
        email: db.email || undefined,
        phone: db.telefono || undefined,
        company: db.empresa_nombre || undefined,
        position: db.cargo || undefined,
        notes: db.notas || undefined,
        archived: db.archivado,
        createdAt: new Date(db.created_at),
        updatedAt: db.updated_at ? new Date(db.updated_at) : undefined,

        // Mapped fields
        rating: (db.rating as 1 | 2 | 3 | 4 | 5) || 0,
        socialNetworks: db.redes_sociales || {},

        // Campos de UI que no están en la tabla contactos aún / no usados
        tags: db.tags || [],
        avatar: db.avatar || undefined,
        location: db.ubicacion || undefined,
        source: db.fuente || undefined,
        birthday: db.cumpleanos ? new Date(db.cumpleanos) : undefined,
        assignedTo: db.asignado_a || undefined,
    }
}

/**
 * Map Contact type to database format
 */
function mapContactToDB(contact: Partial<Contact>, companyId: string): Partial<ContactDB> {
    return {
        nombre: contact.name,
        email: contact.email || null,
        telefono: contact.phone || null,
        empresa_nombre: contact.company || null,
        cargo: contact.position || null,
        notas: contact.notes || null,
        archivado: contact.archived || false,
        empresa_id: companyId,

        // New fields
        rating: contact.rating || 0,
        redes_sociales: contact.socialNetworks || {}
    }
}

export type SortOption = 'recent' | 'oldest' | 'name-asc' | 'name-desc' | 'rating'

export function useContacts(companyId?: string) {
    const [contacts, setContacts] = useState<Contact[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<Error | null>(null)

    // Pagination & Search State
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(true)
    const [totalContacts, setTotalContacts] = useState(0)
    const [searchQuery, setSearchQuery] = useState('')
    const [sortBy, setSortBy] = useState<SortOption>('recent')

    const debouncedSearch = useDebounce(searchQuery, 500)
    const LIMIT = 20

    // Reset pagination when search or sort changes
    useEffect(() => {
        setPage(1)
        setHasMore(true)
        // We don't clear contacts here to avoid Flickr, but we will replace them in fetch
    }, [debouncedSearch, sortBy])

    const fetchContacts = useCallback(async (isLoadMore = false) => {
        if (!companyId) {
            setIsLoading(false)
            return
        }

        try {
            if (!isLoadMore) setIsLoading(true)
            setError(null)

            const currentPage = isLoadMore ? page + 1 : 1

            const { data, count } = await getContacts({
                companyId,
                page: currentPage,
                limit: LIMIT,
                search: debouncedSearch,
                sort: sortBy
            })

            const mappedContacts = data.map(mapDBToContact)

            if (isLoadMore) {
                setContacts(prev => [...prev, ...mappedContacts])
                setPage(currentPage)
            } else {
                setContacts(mappedContacts)
                setPage(1)
            }

            setTotalContacts(count)
            setHasMore(contacts.length + mappedContacts.length < count)
            // Check if we loaded less than limit (end of list)
            if (data.length < LIMIT) {
                setHasMore(false)
            } else {
                setHasMore(true) // Should rely on count, but this is a fallback
                if (isLoadMore && contacts.length + mappedContacts.length >= count) setHasMore(false)
                if (!isLoadMore && mappedContacts.length >= count) setHasMore(false)
            }

        } catch (err) {
            console.error('Error fetching contacts:', err)
            setError(err as Error)
            toast.error('Error al cargar contactos')
        } finally {
            setIsLoading(false)
        }
    }, [companyId, page, debouncedSearch, sortBy])

    // Initial fetch and parameter change fetch
    useEffect(() => {
        fetchContacts(false)
    }, [fetchContacts]) // fetchContacts depends on debouncedSearch and sortBy

    const loadMore = useCallback(() => {
        if (!isLoading && hasMore) {
            fetchContacts(true)
        }
    }, [isLoading, hasMore, fetchContacts])

    const createContact = useCallback(async (contact: Partial<Contact>): Promise<Contact | null> => {
        if (!companyId) return null

        try {
            const dbContact = mapContactToDB(contact, companyId)
            const created = await createContactService(dbContact)
            const newContact = mapDBToContact(created)
            setContacts(prev => [newContact, ...prev])
            setTotalContacts(prev => prev + 1)
            toast.success('Contacto creado exitosamente')
            return newContact
        } catch (err) {
            console.error('Error creating contact:', err)
            toast.error('Error al crear contacto')
            return null
        }
    }, [companyId])

    const updateContact = useCallback(async (id: string, updates: Partial<Contact>): Promise<Contact | null> => {
        if (!companyId) return null

        try {
            const dbUpdates = mapContactToDB(updates, companyId)
            const updated = await updateContactService(id, dbUpdates)
            const updatedContact = mapDBToContact(updated)
            setContacts(prev => prev.map(c => c.id === id ? updatedContact : c))
            toast.success('Contacto actualizado exitosamente')
            return updatedContact
        } catch (err) {
            console.error('Error updating contact:', err)
            toast.error('Error al actualizar contacto')
            return null
        }
    }, [companyId])

    const importContactsBulk = useCallback(async (items: Partial<Contact>[]): Promise<number> => {
        if (!companyId || !items.length) return 0

        try {
            const dbPayload = items
                .map(item => mapContactToDB(item, companyId))
                .filter(item => !!item.nombre)

            if (!dbPayload.length) {
                toast.error('No hay contactos válidos para importar')
                return 0
            }

            const created = await createContactsBulkService(dbPayload)
            const mappedCreated = created.map(mapDBToContact)

            setContacts(prev => [...mappedCreated, ...prev])
            setTotalContacts(prev => prev + mappedCreated.length)
            toast.success(`${mappedCreated.length} contactos importados exitosamente`)
            return mappedCreated.length
        } catch (err) {
            console.error('Error importing contacts:', err)
            toast.error('Error al importar contactos')
            return 0
        }
    }, [companyId])

    const deleteContact = useCallback(async (id: string): Promise<boolean> => {
        try {
            await deleteContactService(id)
            setContacts(prev => prev.filter(c => c.id !== id))
            setTotalContacts(prev => prev - 1)
            toast.success('Contacto eliminado')
            return true
        } catch (err) {
            console.error('Error deleting contact:', err)
            toast.error('Error al eliminar contacto')
            return false
        }
    }, [])

    const archiveContact = useCallback(async (id: string): Promise<boolean> => {
        try {
            await archiveContactService(id)
            setContacts(prev => prev.filter(c => c.id !== id))
            setTotalContacts(prev => prev - 1)
            toast.success('Contacto archivado')
            return true
        } catch (err) {
            console.error('Error archiving contact:', err)
            toast.error('Error al archivar contacto')
            return false
        }
    }, [])

    return {
        contacts,
        isLoading,
        error,
        refetch: () => fetchContacts(false),
        createContact,
        importContactsBulk,
        updateContact,
        deleteContact,
        archiveContact,
        // Pagination & Search exports
        loadMore,
        hasMore,
        totalContacts,
        searchQuery,
        setSearchQuery,
        sortBy,
        setSortBy
    }
}
