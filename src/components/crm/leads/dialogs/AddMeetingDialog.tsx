import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { TeamMember, Lead } from '@/lib/types'
import { useTranslation } from '@/lib/i18n'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { X, Calendar as CalendarIcon, MagnifyingGlass, Spinner } from '@phosphor-icons/react'
import { createLeadMeeting } from '@/supabase/services/reuniones'
import { searchLeads as searchLeadsAPI, getLeadsPaged } from '@/supabase/services/leads'
import { mapDBToLead } from '@/hooks/useLeadsList'
import { format } from 'date-fns'

export interface AddMeetingFormData {
  title: string
  date: string
  duration: number
  participants: string[]
  notes: string
  leadId?: string
}

interface AddMeetingDialogProps {
  leadId?: string
  leads?: Lead[]
  empresaId: string
  open: boolean
  onClose: () => void
  onAdd?: (meeting: AddMeetingFormData) => Promise<void> | void
  teamMembers?: TeamMember[]
  defaultDate?: Date
}

export function AddMeetingDialog(props: AddMeetingDialogProps) {
  const t = useTranslation('es')
  const { open, onClose, leadId: initialLeadId, leads, empresaId, onAdd, teamMembers = [], defaultDate } = props

  const [selectedLeadId, setSelectedLeadId] = useState<string>(initialLeadId || '')
  
  useEffect(() => {
    if (initialLeadId) {
      setSelectedLeadId(initialLeadId)
    }
  }, [initialLeadId])

  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  
  useEffect(() => {
      if (open && defaultDate) {
          // Format for input type="datetime-local": YYYY-MM-DDThh:mm
          const d = new Date(defaultDate)
          const offset = d.getTimezoneOffset()
          const adjusted = new Date(d.getTime() - (offset * 60 * 1000))
          setDate(adjusted.toISOString().slice(0, 16))
      }
  }, [open, defaultDate])

  const [duration, setDuration] = useState(30)
  const [notes, setNotes] = useState('')
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([])
  const [participantInput, setParticipantInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [leadSearch, setLeadSearch] = useState('')
  const [leadDropdownOpen, setLeadDropdownOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<Lead[]>([])
  const [isSearchingLeads, setIsSearchingLeads] = useState(false)
  const [selectedLeadData, setSelectedLeadData] = useState<Lead | null>(null)
  const leadDropdownRef = useRef<HTMLDivElement>(null)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Server-side search with debounce
  const doSearch = useCallback(async (term: string) => {
    if (!empresaId) return
    setIsSearchingLeads(true)
    try {
      if (!term.trim()) {
        // Load recent leads when no search term
        const { data } = await getLeadsPaged({ empresaId, limit: 20, offset: 0, archived: false })
        setSearchResults((data || []).map(mapDBToLead))
      } else {
        const results = await searchLeadsAPI(empresaId, term, { limit: 30, archived: false })
        setSearchResults(results.map(mapDBToLead))
      }
    } catch (err) {
      console.error('Error searching leads:', err)
    }
    setIsSearchingLeads(false)
  }, [empresaId])

  // Debounced search effect
  useEffect(() => {
    if (!leadDropdownOpen) return
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => doSearch(leadSearch), 250)
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current) }
  }, [leadSearch, leadDropdownOpen, doSearch])

  // Load initial results when dropdown opens
  useEffect(() => {
    if (leadDropdownOpen && searchResults.length === 0) {
      doSearch('')
    }
  }, [leadDropdownOpen])

  // Also use passed leads as fallback/merge
  const displayLeads = useMemo(() => {
    if (searchResults.length > 0) return searchResults
    if (leads && leads.length > 0) return leads.slice(0, 30)
    return []
  }, [searchResults, leads])

  const selectedLeadName = useMemo(() => {
    if (selectedLeadData) return selectedLeadData.nombre || selectedLeadData.name || 'Sin nombre'
    if (!selectedLeadId) return ''
    // Try from current results or passed leads
    const fromResults = searchResults.find(l => l.id === selectedLeadId)
    if (fromResults) return fromResults.nombre || fromResults.name || 'Sin nombre'
    const fromLeads = (leads || []).find(l => l.id === selectedLeadId)
    if (fromLeads) return fromLeads.nombre || fromLeads.name || 'Sin nombre'
    return ''
  }, [selectedLeadId, selectedLeadData, searchResults, leads])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (leadDropdownRef.current && !leadDropdownRef.current.contains(e.target as Node)) {
        setLeadDropdownOpen(false)
      }
    }
    if (leadDropdownOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [leadDropdownOpen])

  const handleAddParticipant = () => {
    if (participantInput.trim() && !selectedParticipants.includes(participantInput.trim())) {
      setSelectedParticipants([...selectedParticipants, participantInput.trim()])
      setParticipantInput('')
    }
  }

  const handleRemoveParticipant = (participant: string) => {
    setSelectedParticipants(selectedParticipants.filter(p => p !== participant))
  }

  const handleSubmit = async () => {
    if (!selectedLeadId) {
        toast.error('Debe seleccionar una oportunidad')
        return
    }

    if (!title.trim() || !date) {
      toast.error(t.messages.fillRequired)
      return
    }

    setIsSubmitting(true)
    try {
      // Use createLeadMeeting from reuniones.ts (writes to lead_reuniones table)
      await createLeadMeeting({
        leadId: selectedLeadId,
        empresaId,
        title: title.trim(),
        date: new Date(date),
        duration,
        participants: selectedParticipants,
        notes: notes.trim()
      })

      // Llamar callback opcional si existe (para compatibilidad)
      if (onAdd) {
        await onAdd({
          title: title.trim(),
          date,
          duration,
          participants: selectedParticipants,
          notes: notes.trim(),
          leadId: selectedLeadId
        })
      }

      toast.success(t.messages.meetingCreated)
      resetForm()
      onClose()
    } catch (error: any) {
      console.error('Error creating meeting:', error)
      const msg = error?.message || error?.details || 'Error desconocido'
      toast.error(`No se pudo crear la reunión: ${msg}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setTitle('')
    setDate('')
    setDuration(30)
    setNotes('')
    setSelectedParticipants([])
    setParticipantInput('')
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.meeting.addMeeting}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!initialLeadId && (
            <div ref={leadDropdownRef} className="relative">
              <Label>Oportunidad *</Label>
              <div
                className="flex items-center border rounded-md px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setLeadDropdownOpen(!leadDropdownOpen)}
              >
                <span className={selectedLeadId ? "text-foreground flex-1 truncate" : "text-muted-foreground flex-1"}>
                  {selectedLeadName || "Seleccionar oportunidad..."}
                </span>
                <MagnifyingGlass size={16} className="text-muted-foreground shrink-0 ml-2" />
              </div>
              {leadDropdownOpen && (
                <div className="absolute z-50 mt-1 w-full bg-popover border rounded-lg shadow-lg overflow-hidden">
                  <div className="p-2 border-b relative">
                    <Input
                      placeholder="Buscar por nombre, email, teléfono, empresa..."
                      value={leadSearch}
                      onChange={(e) => setLeadSearch(e.target.value)}
                      autoFocus
                      className="h-8 text-sm pr-8"
                    />
                    {isSearchingLeads && (
                      <Spinner className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin h-4 w-4 text-primary" />
                    )}
                  </div>
                  <div className="max-h-[200px] overflow-y-auto">
                    {displayLeads.length === 0 && !isSearchingLeads ? (
                      <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                        No se encontraron oportunidades
                      </div>
                    ) : displayLeads.length === 0 && isSearchingLeads ? (
                      <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                        Buscando...
                      </div>
                    ) : (
                      displayLeads.map((lead) => (
                        <div
                          key={lead.id}
                          className={`px-3 py-2 text-sm cursor-pointer hover:bg-accent transition-colors flex items-center justify-between ${selectedLeadId === lead.id ? 'bg-accent font-medium' : ''}`}
                          onClick={() => {
                            setSelectedLeadId(lead.id)
                            setSelectedLeadData(lead)
                            setLeadDropdownOpen(false)
                            setLeadSearch('')
                          }}
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{lead.nombre || lead.name || 'Sin nombre'}</div>
                            {(lead.email || lead.company) && (
                              <div className="text-xs text-muted-foreground truncate">
                                {[lead.company, lead.email].filter(Boolean).join(' · ')}
                              </div>
                            )}
                          </div>
                          {selectedLeadId === lead.id && (
                            <span className="text-primary shrink-0 ml-2">✓</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <div>
            <Label htmlFor="meeting-title">{t.meeting.meetingTitle}</Label>
            <Input
              id="meeting-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Reunión de seguimiento"
            />
          </div>
          <div>
            <Label htmlFor="meeting-date">{t.meeting.date}</Label>
            <Input
              id="meeting-date"
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="meeting-duration">{t.meeting.duration}</Label>
            <Input
              id="meeting-duration"
              type="number"
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value) || 30)}
            />
          </div>
          <div>
            <Label>{t.meeting.participants}</Label>
            <div className="flex gap-2 mb-2">
              <Input
                value={participantInput}
                onChange={(e) => setParticipantInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddParticipant())}
                placeholder="Nombre del participante"
              />
              <Button onClick={handleAddParticipant} type="button" size="sm">
                {t.buttons.add}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {(teamMembers || []).filter(m => !selectedParticipants.includes(m.name)).map(member => (
                <Badge
                  key={member.id}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                  onClick={() => setSelectedParticipants([...selectedParticipants, member.name])}
                >
                  {member.name}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {selectedParticipants.map(participant => (
                <Badge key={participant} className="gap-1">
                  {participant}
                  <button onClick={() => handleRemoveParticipant(participant)}>
                    <X size={12} />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="meeting-notes">{t.meeting.notes}</Label>
            <Textarea
              id="meeting-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas de la reunión..."
              rows={4}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSubmit} className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : t.meeting.save}
            </Button>
            <Button onClick={onClose} variant="outline" disabled={isSubmitting}>{t.buttons.cancel}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
