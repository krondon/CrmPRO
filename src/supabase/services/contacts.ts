/**
 * Contacts Service - Supabase CRUD operations for contacts/contactos
 */

import { supabase } from '../client'
import { ContactDB } from '@/lib/types'

export interface GetContactsOptions {
    companyId: string
    page?: number // 1-based
    limit?: number
    search?: string
    sort?: 'recent' | 'oldest' | 'name-asc' | 'name-desc' | 'rating'
}

export interface GetContactsResponse {
    data: ContactDB[]
    count: number
}

/**
 * Get contacts with pagination, search, and sorting
 */
export async function getContacts({
    companyId,
    page = 1,
    limit = 50,
    search = '',
    sort = 'recent'
}: GetContactsOptions): Promise<GetContactsResponse> {
    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = supabase
        .from('contactos')
        .select('*', { count: 'exact' })
        .eq('empresa_id', companyId)
        .eq('archivado', false)

    // Apply search if present
    if (search.trim()) {
        const s = search.trim()
        query = query.or(`nombre.ilike.%${s}%,email.ilike.%${s}%,telefono.ilike.%${s}%,empresa_nombre.ilike.%${s}%`)
    }

    // Apply sorting
    switch (sort) {
        case 'name-asc':
            query = query.order('nombre', { ascending: true })
            break
        case 'name-desc':
            query = query.order('nombre', { ascending: false })
            break
        case 'oldest':
            query = query.order('created_at', { ascending: true })
            break
        case 'rating':
            query = query.order('rating', { ascending: false })
            break
        case 'recent':
        default:
            query = query.order('created_at', { ascending: false })
            break
    }

    // Apply pagination
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) throw error

    return {
        data: data as ContactDB[],
        count: count || 0
    }
}

/**
 * Get a single contact by ID
 */
export async function getContactById(id: string): Promise<ContactDB> {
    const { data, error } = await supabase
        .from('contactos')
        .select('*')
        .eq('id', id)
        .single()

    if (error) throw error
    return data as ContactDB
}

/**
 * Create a new contact
 */
export async function createContact(contact: Partial<ContactDB>): Promise<ContactDB> {
    const { data, error } = await supabase
        .from('contactos')
        .insert({
            ...contact,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
        .select()
        .single()

    if (error) throw error
    return data as ContactDB
}

/**
 * Create contacts in bulk
 */
export async function createContactsBulk(contacts: Partial<ContactDB>[]): Promise<ContactDB[]> {
    if (!contacts.length) return []

    const now = new Date().toISOString()
    const payload = contacts.map(contact => ({
        ...contact,
        created_at: now,
        updated_at: now
    }))

    const { data, error } = await supabase
        .from('contactos')
        .insert(payload)
        .select()

    if (error) throw error
    return (data || []) as ContactDB[]
}

/**
 * Update an existing contact
 */
export async function updateContact(id: string, updates: Partial<ContactDB>): Promise<ContactDB> {
    const { data, error } = await supabase
        .from('contactos')
        .update({
            ...updates,
            updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()

    if (error) throw error
    return data as ContactDB
}

/**
 * Delete a contact permanently
 */
export async function deleteContact(id: string): Promise<void> {
    const { error } = await supabase
        .from('contactos')
        .delete()
        .eq('id', id)

    if (error) throw error
}

/**
 * Archive a contact (soft delete)
 */
export async function archiveContact(id: string): Promise<void> {
    const { error } = await supabase
        .from('contactos')
        .update({
            archivado: true,
            updated_at: new Date().toISOString()
        })
        .eq('id', id)

    if (error) throw error
}

/**
 * Unarchive a contact
 */
export async function unarchiveContact(id: string): Promise<void> {
    const { error } = await supabase
        .from('contactos')
        .update({
            archivado: false,
            updated_at: new Date().toISOString()
        })
        .eq('id', id)

    if (error) throw error
}
