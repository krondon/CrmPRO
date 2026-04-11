/**
 * ContactProfile - Right panel showing contact details with tabs
 * Mobile-first: compact header, back button, scrollable tabs
 */

import { useState } from 'react'
import { Contact } from '@/lib/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    User,
    PencilSimple,
    Trash,
    Star,
    MapPin,
    Envelope,
    Phone,
    Buildings,
    Briefcase,
    ArrowLeft
} from '@phosphor-icons/react'
import { ContactGeneralInfo } from './ContactGeneralInfo'
import { ContactLeadsTab } from './ContactLeadsTab'
import { ContactHistoryTab } from './ContactHistoryTab'
import { ContactEditDialog } from './ContactEditDialog'

interface ContactProfileProps {
    contact: Contact | null
    onUpdate: (updates: Partial<Contact>) => Promise<void>
    onDelete: () => Promise<void>
    companyId?: string
    onClose?: () => void
}

export function ContactProfile({
    contact,
    onUpdate,
    onDelete,
    companyId,
    onClose
}: ContactProfileProps) {
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
    const [activeTab, setActiveTab] = useState('general')

    if (!contact) {
        return (
            <div className="flex-1 flex items-center justify-center bg-muted/20">
                <div className="text-center p-8">
                    <User size={64} className="mx-auto text-muted-foreground/30 mb-4" />
                    <h3 className="text-lg font-semibold text-foreground">
                        Selecciona un contacto
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        Elige un contacto de la lista para ver sus detalles
                    </p>
                </div>
            </div>
        )
    }

    const initials = contact.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)

    const stars = Array.from({ length: 5 }, (_, i) => i < (contact.rating || 0))

    const handleSaveEdit = async (updates: Partial<Contact>) => {
        await onUpdate(updates)
        setIsEditDialogOpen(false)
    }

    return (
        <div className="flex-1 flex flex-col bg-background overflow-hidden h-full">
            {/* ── Header ── */}
            <div className="flex-none border-b border-border bg-card">
                {/* Mobile back button */}
                {onClose && (
                    <div className="md:hidden border-b border-border px-3 py-2">
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={onClose}
                            className="gap-1 text-muted-foreground"
                        >
                            <ArrowLeft size={18} />
                            Volver a contactos
                        </Button>
                    </div>
                )}

                <div className="p-4 md:p-6">
                    <div className="flex items-start gap-3 md:gap-4">
                        {/* Avatar – smaller on mobile */}
                        <Avatar className="h-14 w-14 md:h-20 md:w-20 flex-shrink-0">
                            <AvatarImage src={contact.avatar} alt={contact.name} />
                            <AvatarFallback className="bg-primary/10 text-primary text-lg md:text-2xl font-bold">
                                {initials}
                            </AvatarFallback>
                        </Avatar>

                        {/* Name + Actions */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <h2 className="text-lg md:text-2xl font-bold text-foreground truncate">
                                        {contact.name}
                                    </h2>
                                    {contact.position && (
                                        <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                            <Briefcase size={14} />
                                            {contact.position}
                                        </p>
                                    )}
                                    {contact.rating && contact.rating > 0 && (
                                        <div className="flex gap-0.5 mt-1">
                                            {stars.map((filled, i) => (
                                                <Star
                                                    key={i}
                                                    size={14}
                                                    weight={filled ? 'fill' : 'regular'}
                                                    className={filled ? 'text-amber-500' : 'text-muted-foreground/30'}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Action Buttons – always visible, compact */}
                                <div className="flex gap-1.5 flex-shrink-0">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setIsEditDialogOpen(true)}
                                        className="h-8 px-2.5 text-xs"
                                    >
                                        <PencilSimple size={14} className="mr-1" />
                                        Editar
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={onDelete}
                                        className="h-8 w-8 p-0"
                                    >
                                        <Trash size={14} />
                                    </Button>
                                </div>
                            </div>

                            {/* Quick Info – compact row */}
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs md:text-sm text-muted-foreground">
                                {contact.company && (
                                    <span className="flex items-center gap-1">
                                        <Buildings size={13} />
                                        {contact.company}
                                    </span>
                                )}
                                {contact.email && (
                                    <a href={`mailto:${contact.email}`} className="flex items-center gap-1 text-primary hover:underline">
                                        <Envelope size={13} />
                                        {contact.email}
                                    </a>
                                )}
                                {contact.phone && (
                                    <a href={`tel:${contact.phone}`} className="flex items-center gap-1 text-primary hover:underline">
                                        <Phone size={13} />
                                        {contact.phone}
                                    </a>
                                )}
                                {contact.location && (
                                    <span className="flex items-center gap-1">
                                        <MapPin size={13} />
                                        {contact.location}
                                    </span>
                                )}
                            </div>

                            {/* Tags */}
                            {contact.tags && contact.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    {contact.tags.map(tag => (
                                        <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                                            {tag}
                                        </Badge>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Tabs & Content ── */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden min-h-0">
                <div className="flex-none border-b border-border bg-card px-2 md:px-6">
                    <TabsList className="w-full justify-start rounded-none h-10 p-0 bg-transparent">
                        <TabsTrigger
                            value="general"
                            className="h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 font-medium text-xs md:text-sm whitespace-nowrap"
                        >
                            General
                        </TabsTrigger>
                        <TabsTrigger
                            value="leads"
                            className="h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 font-medium text-xs md:text-sm whitespace-nowrap"
                        >
                            Oportunidades
                        </TabsTrigger>
                        <TabsTrigger
                            value="history"
                            className="h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 font-medium text-xs md:text-sm whitespace-nowrap"
                        >
                            Historial
                        </TabsTrigger>
                    </TabsList>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0">
                    <TabsContent value="general" className="m-0 p-4 md:p-6">
                        <ContactGeneralInfo contact={contact} />
                    </TabsContent>
                    <TabsContent value="leads" className="m-0 p-4 md:p-6">
                        <ContactLeadsTab contact={contact} companyId={companyId} />
                    </TabsContent>
                    <TabsContent value="history" className="m-0 p-4 md:p-6">
                        <ContactHistoryTab contactId={contact.id} />
                    </TabsContent>
                </div>
            </Tabs>

            {/* Edit Dialog */}
            <ContactEditDialog
                open={isEditDialogOpen}
                onOpenChange={setIsEditDialogOpen}
                contact={contact}
                onSave={handleSaveEdit}
                title="Editar Contacto"
            />
        </div>
    )
}
