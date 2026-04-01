import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Lead } from '@/lib/types';

interface UseLeadsRealtimeOptions {
  companyId: string;
  onInsert?: (lead: Lead) => void;
  onUpdate?: (lead: Lead) => void;
  onDelete?: (leadId: string) => void;
}

export function useLeadsRealtime({ companyId, onInsert, onUpdate, onDelete }: UseLeadsRealtimeOptions) {
  // Helper para mapear de BD a Frontend
  const mapDbLeadToLead = (dbLead: any): Lead => ({
    id: dbLead.id,
    name: dbLead.nombre_completo,
    email: dbLead.correo_electronico,
    phone: dbLead.telefono,
    company: dbLead.empresa,
    location: dbLead.ubicacion,
    evento: dbLead.evento,
    membresia: dbLead.membresia,
    budget: dbLead.presupuesto,
    stage: dbLead.etapa_id,
    pipeline: dbLead.pipeline_id || 'sales',
    priority: dbLead.prioridad,
    assignedTo: dbLead.asignado_a,
    tags: dbLead.tags || [],
    createdAt: new Date(dbLead.created_at),
    lastContact: dbLead.last_message_at ? new Date(dbLead.last_message_at) : new Date(dbLead.created_at),
    stageEnteredAt: dbLead.stage_entered_at ? new Date(dbLead.stage_entered_at) : undefined,
    slaCustomLimitMinutes: dbLead.sla_custom_limit_minutes ?? null,
  });

  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
      .channel(`leads-realtime-${companyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lead',
          filter: `empresa_id=eq.${companyId}`, // CORREGIDO: company_id -> empresa_id
        },
        (payload) => {
          console.log('[REALTIME] Event received:', payload);

          if (payload.eventType === 'INSERT' && onInsert) {
            onInsert(mapDbLeadToLead(payload.new));
          }
          if (payload.eventType === 'UPDATE' && onUpdate) {
            onUpdate(mapDbLeadToLead(payload.new));
          }
          if (payload.eventType === 'DELETE' && onDelete) {
            onDelete(payload.old.id as string);
          }
        }
      );

    channel.subscribe((status) => {
      console.log('[REALTIME] Subscription status:', status);
    });

    return () => {
      console.log('[REALTIME] Unsubscribing channel');
      channel.unsubscribe();
    };
  }, [companyId, onInsert, onUpdate, onDelete]);
}
