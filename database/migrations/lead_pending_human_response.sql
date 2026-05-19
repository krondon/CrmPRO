-- ============================================================
-- Pending Human Response
--
-- Marca una oportunidad cuando el cliente envió un mensaje
-- y todavía NO ha respondido un asesor humano. A diferencia
-- del conteo de mensajes no leídos, este estado NO se limpia
-- cuando la IA responde — solo cuando SuperAPI confirma que
-- el chat fue "bloqueado" porque un asesor escribió.
--
-- 1) Columna en lead: is_pending_human_response
-- 2) Trigger en mensajes: al recibir mensaje del cliente,
--    marca el lead como pendiente.
-- 3) Setting por empresa en chat_settings.
--
-- El paso a "false" lo realiza un edge function
-- (verify-pending-responses) que consulta SuperAPI cada 60s.
-- ============================================================

alter table lead
  add column if not exists is_pending_human_response boolean not null default false;

create index if not exists idx_lead_pending_human_response
  on lead (empresa_id, is_pending_human_response)
  where is_pending_human_response = true;

-- ============================================================
-- Setting por empresa (en tabla chat_settings existente)
-- ============================================================

alter table chat_settings
  add column if not exists pending_response_enabled boolean not null default false;

-- ============================================================
-- Trigger: al insertar mensaje con sender='lead' → marca lead
-- como pendiente. Cualquier mensaje con sender='team' (incluida
-- la IA) NO limpia el flag, porque no podemos distinguir IA de
-- humano a nivel de BD. El flag se limpia desde el edge function
-- después de verificar el lock en SuperAPI.
-- ============================================================

create or replace function set_lead_pending_on_incoming_message()
returns trigger
language plpgsql
as $$
begin
  if new.sender = 'lead' and new.lead_id is not null then
    update lead
      set is_pending_human_response = true
      where id = new.lead_id
        and is_pending_human_response = false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_lead_pending_on_incoming on mensajes;

create trigger trg_set_lead_pending_on_incoming
  after insert on mensajes
  for each row
  execute function set_lead_pending_on_incoming_message();
