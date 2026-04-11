import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Lead } from '@/lib/types'

interface AllLeadsDialogProps {
    memberName: string
    leads: Lead[]
    onLeadClick?: (leadId: string) => void
    trigger?: React.ReactNode
}

export function AllLeadsDialog({ memberName, leads, onLeadClick, trigger }: AllLeadsDialogProps) {
    const [open, setOpen] = useState(false)

    const handleLeadClick = (leadId: string) => {
        setOpen(false)
        if (onLeadClick) {
            onLeadClick(leadId)
        }
    }

    return (
        <>
            {trigger ? (
                <div onClick={() => setOpen(true)}>
                    {trigger}
                </div>
            ) : (
                <button
                    onClick={() => setOpen(true)}
                    className="w-full text-xs text-muted-foreground hover:text-foreground text-center py-2 rounded-md hover:bg-muted/50 transition-colors font-medium"
                >
                    +{leads.length - 2} más • Click para ver todos
                </button>
            )}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden p-0">
                    <DialogHeader className="p-6 border-b border-border">
                        <DialogTitle>Todas las Oportunidades de {memberName}</DialogTitle>
                        <p className="text-sm text-muted-foreground mt-1">{leads.length} oportunidades asignadas</p>
                    </DialogHeader>

                    <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
                        <div className="grid gap-3">
                            {leads.map(lead => (
                                <button
                                    key={lead.id}
                                    onClick={() => handleLeadClick(lead.id)}
                                    className="flex items-start gap-3 p-4 rounded-lg hover:bg-muted/80 transition-colors border border-border hover:border-primary text-left w-full cursor-pointer"
                                >
                                    <div className={`w-3 h-3 rounded-full mt-1 shrink-0 ${lead.priority === 'high' ? 'bg-red-500 shadow-md shadow-red-500/50' :
                                        lead.priority === 'medium' ? 'bg-yellow-500 shadow-md shadow-yellow-500/50' :
                                            'bg-green-500 shadow-md shadow-green-500/50'
                                        }`} />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold truncate">{lead.name}</p>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-muted-foreground">
                                            {lead.company && <span>🏢 {lead.company}</span>}
                                            {lead.phone && <span>📱 {lead.phone}</span>}
                                            {lead.email && <span className="truncate">✉️ {lead.email}</span>}
                                        </div>
                                        {lead.budget && (
                                            <p className="text-sm mt-2 font-medium text-green-600">💰 ${lead.budget.toLocaleString()}</p>
                                        )}
                                    </div>
                                    <Badge variant={
                                        lead.priority === 'high' ? 'destructive' :
                                            lead.priority === 'medium' ? 'default' : 'secondary'
                                    } className="shrink-0">
                                        {lead.priority === 'high' ? 'Alta' : lead.priority === 'medium' ? 'Media' : 'Baja'}
                                    </Badge>
                                </button>
                            ))}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
