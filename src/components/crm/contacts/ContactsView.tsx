/**
 * ContactsView - Main container for the Contacts module
 * Two-column layout: ContactsList (sidebar) + ContactProfile (detail panel)
 */

import { useState } from 'react'
import { Contact } from '@/lib/types'
import { useContacts } from '@/hooks/useContacts'
import { ContactsList } from './ContactsList'
import { ContactProfile } from './ContactProfile'
import { ContactEditDialog } from './ContactEditDialog'
import { MigrationButton } from './MigrationButton'
import { Button } from '@/components/ui/button'
import { Plus, Users } from '@phosphor-icons/react'
import { Card } from '@/components/ui/card'

interface ContactsViewProps {
    companyId?: string
    currentUserId?: string
}

export function ContactsView({ companyId, currentUserId }: ContactsViewProps) {
    const {
        contacts,
        isLoading,
        createContact,
        updateContact,
        deleteContact,
        archiveContact,
        loadMore,
        hasMore,
        totalContacts,
        searchQuery,
        setSearchQuery,
        sortBy,
        setSortBy
    } = useContacts(companyId)
    const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)

    // ... (handlers remain same)

    const handleCreateContact = async (contactData: Partial<Contact>) => {
        const created = await createContact(contactData)
        if (created) {
            setSelectedContact(created)
            setIsCreateDialogOpen(false)
        }
    }

    const handleUpdateContact = async (updates: Partial<Contact>) => {
        if (!selectedContact) return
        const updated = await updateContact(selectedContact.id, updates)
        if (updated) {
            setSelectedContact(updated)
        }
    }

    const handleDeleteContact = async () => {
        if (!selectedContact) return
        const success = await deleteContact(selectedContact.id)
        if (success) {
            setSelectedContact(null)
        }
    }

    const handleArchiveContact = async () => {
        if (!selectedContact) return
        const success = await archiveContact(selectedContact.id)
        if (success) {
            setSelectedContact(null)
        }
    }

    const stats = {
        total: totalContacts, // Use total from server
        vip: contacts.filter(c => (c.rating || 0) >= 4).length, // Only counts loaded ones (approximation)
        newThisMonth: contacts.filter(c => {
            const monthAgo = new Date()
            monthAgo.setMonth(monthAgo.getMonth() - 1)
            return c.createdAt > monthAgo
        }).length
    }

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header – slim on mobile, full on desktop */}
            <div className={`flex-none border-b border-border bg-card px-4 md:px-6 py-2.5 md:py-4 ${selectedContact ? 'hidden md:block' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                    <h1 className="text-lg md:text-2xl font-bold text-foreground flex items-center gap-2">
                        <Users size={22} className="text-primary flex-shrink-0" weight="fill" />
                        Contactos
                    </h1>
                    <div className="flex gap-1.5 md:gap-2 flex-shrink-0">
                        {/* aqui estaba el boton de migrar contactos */}
                       
                        <Button
                            onClick={() => setIsCreateDialogOpen(true)}
                            className="bg-primary hover:bg-primary/90 h-8 md:h-9 text-xs md:text-sm px-2.5 md:px-4"
                            size="sm"
                        >
                            <Plus size={16} weight="bold" className="mr-1 md:mr-2" />
                            <span className="hidden sm:inline">Nuevo Contacto</span>
                            <span className="sm:hidden">Nuevo</span>
                        </Button>
                        
                    </div>
                </div>

                {/* Stats – desktop only */}
                <div className="hidden md:grid grid-cols-3 gap-3 mt-3">
                    <Card className="px-4 py-3">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total</div>
                        <div className="text-xl font-bold text-foreground">{stats.total}</div>
                    </Card>
                    <Card className="px-4 py-3">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">VIP (⭐⭐⭐⭐+)</div>
                        <div className="text-xl font-bold text-amber-600">{stats.vip}</div>
                    </Card>
                    <Card className="px-4 py-3">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nuevos (30d)</div>
                        <div className="text-xl font-bold text-green-600">{stats.newThisMonth}</div>
                    </Card>
                </div>

                {/* Subtitle – desktop only */}
                <p className="text-sm text-muted-foreground mt-1 hidden md:block">
                    Gestiona tus contactos y personas de interés
                </p>
            </div>

            {/* Main Content - Responsive Layout */}
            <div className="flex-1 flex overflow-hidden relative">
                {/* Left Sidebar - Contacts List 
                    Visible on mobile if NO contact selected, always visible on desktop
                */}
                <div className={`
                    flex-1 md:flex-none md:w-80 border-r border-border bg-card h-full
                    ${selectedContact ? 'hidden md:flex' : 'flex'}
                `}>
                    <ContactsList
                        contacts={contacts}
                        isLoading={isLoading}
                        selectedContact={selectedContact}
                        onSelectContact={setSelectedContact}
                        loadMore={loadMore}
                        hasMore={hasMore}
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        sortBy={sortBy}
                        setSortBy={setSortBy}
                    />
                </div>

                {/* Right Panel - Contact Detail 
                    Visible on mobile if contact selected, always visible on desktop
                */}
                <div className={`
                    flex-1 bg-background h-full overflow-hidden
                    ${selectedContact ? 'flex' : 'hidden md:flex'}
                `}>
                    <ContactProfile
                        contact={selectedContact}
                        onUpdate={handleUpdateContact}
                        onDelete={handleDeleteContact}
                        companyId={companyId}
                        onClose={() => setSelectedContact(null)}
                    />
                </div>
            </div>

            {/* Create Contact Dialog */}
            <ContactEditDialog
                open={isCreateDialogOpen}
                onOpenChange={setIsCreateDialogOpen}
                onSave={handleCreateContact}
                title="Nuevo Contacto"
            />
        </div>
    )
}
