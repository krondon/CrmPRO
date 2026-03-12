/**
 * ContactCard - Individual contact item in the list
 */

import { Contact } from '@/lib/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Star, Buildings, Phone } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

interface ContactCardProps {
    contact: Contact
    isSelected: boolean
    onClick: () => void
}

export function ContactCard({ contact, isSelected, onClick }: ContactCardProps) {
    const initials = contact.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)

    const stars = Array.from({ length: 5 }, (_, i) => i < (contact.rating || 0))

    return (
        <button
            onClick={onClick}
            className={cn(
                'w-full text-left p-3 rounded-lg transition-all border',
                'hover:bg-muted/50 group',
                isSelected
                    ? 'bg-primary/10 border-primary shadow-sm'
                    : 'bg-card border-transparent hover:border-border'
            )}
        >
            <div className="flex items-start gap-3">
                {/* Avatar */}
                <Avatar className="h-11 w-11 flex-shrink-0">
                    <AvatarImage src={contact.avatar} alt={contact.name} />
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                        {initials}
                    </AvatarFallback>
                </Avatar>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm text-foreground truncate" title={contact.name}>
                                {contact.name}
                            </h3>
                            {contact.position && (
                                <p className="text-xs text-muted-foreground truncate" title={contact.position}>
                                    {contact.position}
                                </p>
                            )}
                        </div>

                        {/* Rating Stars */}
                        {contact.rating && contact.rating > 0 && (
                            <div className="flex gap-0.5 flex-shrink-0" title={`Rating: ${contact.rating}`}>
                                {stars.map((filled, i) => (
                                    <Star
                                        key={i}
                                        size={12}
                                        weight={filled ? 'fill' : 'regular'}
                                        className={filled ? 'text-amber-500' : 'text-muted-foreground/30'}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Company */}
                    {contact.company && (
                        <div className="flex items-center gap-1.5 mt-1">
                            <Buildings size={12} className="text-muted-foreground flex-shrink-0" />
                            <span className="text-xs text-muted-foreground truncate">
                                {contact.company}
                            </span>
                        </div>
                    )}

                    {/* Phone */}
                    {contact.phone && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <Phone size={12} className="text-muted-foreground flex-shrink-0" />
                            <span className="text-xs text-muted-foreground truncate">
                                {contact.phone}
                            </span>
                        </div>
                    )}

                    {/* Tags */}
                    {contact.tags && contact.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                            {contact.tags.slice(0, 2).map(tag => (
                                <Badge
                                    key={tag}
                                    variant="secondary"
                                    className="text-[10px] px-1.5 py-0 h-4 font-medium"
                                >
                                    {tag}
                                </Badge>
                            ))}
                            {contact.tags.length > 2 && (
                                <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0 h-4 font-medium"
                                >
                                    +{contact.tags.length - 2}
                                </Badge>
                            )}
                        </div>
                    )}

                    {/* Footer with date */}
                    <div className="mt-1.5 flex items-center justify-between">
                        <p className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(contact.createdAt, { addSuffix: true, locale: es })}
                        </p>
                        {contact.leadsCount !== undefined && contact.leadsCount > 0 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                                {contact.leadsCount} {contact.leadsCount === 1 ? 'oportunidad' : 'oportunidades'}
                            </Badge>
                        )}
                    </div>
                </div>
            </div>
        </button>
    )
}
