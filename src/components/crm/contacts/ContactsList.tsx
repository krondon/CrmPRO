/**
 * ContactsList - Sidebar with searchable contact list
 */

import { useRef, useCallback, useEffect } from 'react'
import { Contact } from '@/lib/types'
import { ContactCard } from './ContactCard'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MagnifyingGlass, SortAscending, Spinner } from '@phosphor-icons/react'
import { SortOption } from '@/hooks/useContacts'

interface ContactsListProps {
    contacts: Contact[]
    isLoading: boolean
    selectedContact: Contact | null
    onSelectContact: (contact: Contact) => void
    // Pagination & Search
    loadMore: () => void
    hasMore: boolean
    searchQuery: string
    setSearchQuery: (query: string) => void
    sortBy: SortOption
    setSortBy: (sort: SortOption) => void
}

export function ContactsList({
    contacts,
    isLoading,
    selectedContact,
    onSelectContact,
    loadMore,
    hasMore,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy
}: ContactsListProps) {
    // Infinite scroll with IntersectionObserver
    const sentinelRef = useRef<HTMLDivElement>(null)

    const handleIntersect = useCallback(
        (entries: IntersectionObserverEntry[]) => {
            if (entries[0].isIntersecting && hasMore && !isLoading) {
                loadMore()
            }
        },
        [hasMore, isLoading, loadMore]
    )

    useEffect(() => {
        const sentinel = sentinelRef.current
        if (!sentinel) return

        const observer = new IntersectionObserver(handleIntersect, {
            rootMargin: '200px',
        })
        observer.observe(sentinel)
        return () => observer.disconnect()
    }, [handleIntersect])

    return (
        <div className="w-full md:w-80 border-r border-border flex flex-col h-full bg-card overflow-hidden">
            {/* Search and Filters - Fixed Header */}
            <div className="flex-none p-4 space-y-3 border-b border-border bg-card z-10">
                {/* Search Input */}
                <div className="relative">
                    <MagnifyingGlass
                        size={18}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                        placeholder="Buscar contactos..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                    />
                </div>

                {/* Sort Dropdown */}
                <Select value={sortBy} onValueChange={(val) => setSortBy(val as SortOption)}>
                    <SelectTrigger className="w-full">
                        <div className="flex items-center gap-2">
                            <SortAscending size={16} />
                            <SelectValue placeholder="Ordenar por..." />
                        </div>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="recent">Más recientes</SelectItem>
                        <SelectItem value="oldest">Más antiguos</SelectItem>
                        <SelectItem value="name-asc">Nombre (A-Z)</SelectItem>
                        <SelectItem value="name-desc">Nombre (Z-A)</SelectItem>
                        <SelectItem value="rating">Rating (mayor)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Contacts List - Scrollable Area */}
            <ScrollArea className="flex-1 h-full">
                <div className="p-2 pb-20">
                    {contacts.length === 0 && !isLoading ? (
                        <div className="text-center py-12 px-4">
                            <p className="text-muted-foreground text-sm">
                                {searchQuery ? 'No se encontraron contactos' : 'No hay contactos aún'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {contacts.map(contact => (
                                <ContactCard
                                    key={contact.id}
                                    contact={contact}
                                    isSelected={selectedContact?.id === contact.id}
                                    onClick={() => onSelectContact(contact)}
                                />
                            ))}
                        </div>
                    )}

                    {/* Loading spinner */}
                    {isLoading && (
                        <div className="py-4 flex justify-center">
                            <Spinner size={24} className="animate-spin text-primary" />
                        </div>
                    )}

                    {/* Sentinel for infinite scroll */}
                    {hasMore && !isLoading && <div ref={sentinelRef} className="h-1" />}
                </div>
            </ScrollArea>

            {/* Footer with count */}
            <div className="flex-none p-3 border-t border-border bg-muted/20 z-10">
                <p className="text-xs text-muted-foreground text-center">
                    Mostrando {contacts.length} resultados
                </p>
            </div>
        </div>
    )
}
