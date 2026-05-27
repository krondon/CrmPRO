// @deno-types="https://deno.land/std@0.177.0/http/server.ts"
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @deno-types="https://esm.sh/@supabase/supabase-js@2"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore
declare const Deno: any;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */

/** Configuración que el token resuelve desde la BD */
type TokenConfig = {
  empresa_id: string;
  pipeline_id: string;
  etapa_id: string;
  prioridad_default: string;
  asignado_a: string;
  empresa_label: string;
  nombre: string;
  metadata?: {
    /** Mapeo opcional `tipo` → `etapa_id`. Si está, redirige el lead según el evento. */
    etapas_por_tipo?: Record<string, string>;
    [key: string]: unknown;
  };
};

/** Payload que envía la landing / app externa */
type LandingLeadPayload = {
  /** Tipo de evento (ej "registro", "cita", "interesado"). Default: "registro". */
  tipo?: string;
  nombre_completo?: string;
  correo_electronico?: string;
  telefono: string;
  empresa?: string;
  ubicacion?: string;
  presupuesto?: string | number;
  membresia?: string;
  prioridad?: string;
  asignado_a?: string;
  evento?: string;
  notas?: string; // Texto libre, se inserta como nota en el lead
  // Campos legacy (retrocompatibilidad) — se ignoran si hay token válido
  empresa_id?: string;
  pipeline_id?: string;
  etapa_id?: string;
  // ── Campos opcionales de reunión ──────────────────────────────
  reunion?: {
    titulo: string;       // Título de la cita (requerido si se envía reunion)
    fecha: string;        // Fecha: "YYYY-MM-DD" o "DD/MM/YYYY"
    hora?: string;        // Hora: "HH:MM" 24h (default "09:00")
    duracion_minutos?: number; // Duración en minutos (default 30)
    notas?: string;       // Notas adicionales
  };
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Normaliza un teléfono al formato internacional usado por SuperAPI / WhatsApp.
 *
 * Caso especial Venezuela: muchos formularios reciben el número en formato
 * local (ej. 04125896324) en vez del internacional (584125896324). SuperAPI
 * espera el internacional con @c.us, así que un lead que entre como
 * "04125896324" termina como "04125896324@c.us" → mensaje no entregable.
 *
 * Fix: si los dígitos limpios coinciden con el patrón VE local
 * (0 + código de operadora + 7 dígitos), reemplazamos el "0" líder por "58".
 *
 * Operadoras VE: 412 (Digitel), 414/424 (Movistar), 416/426 (Movilnet).
 */
function normalizePhone(phone: string): string {
  const digits = phone
    .replace("@c.us", "")
    .replace("@s.whatsapp.net", "")
    .replace(/[^\d]/g, "")
    .trim();

  if (/^0(412|414|416|424|426)\d{7}$/.test(digits)) {
    return "58" + digits.slice(1);
  }

  return digits;
}

function normalizeTipo(tipo: string | undefined | null): string {
  return (tipo ?? "registro").toString().toLowerCase().trim();
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* ------------------------------------------------------------------ */
/*  Helper: construir fecha/hora para reunión                          */
/* ------------------------------------------------------------------ */

function buildDateTime(date: string, time: string): Date | null {
  try {
    if (date.includes("T")) return new Date(date);

    let isoDate = date;
    if (date.includes("/")) {
      const parts = date.split("/");
      if (parts.length === 3) {
        isoDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      }
    }

    let isoTime = time.trim();
    const amPmMatch = isoTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (amPmMatch) {
      let hours = parseInt(amPmMatch[1]);
      const minutes = amPmMatch[2];
      const period = amPmMatch[3].toUpperCase();
      if (period === "PM" && hours < 12) hours += 12;
      if (period === "AM" && hours === 12) hours = 0;
      isoTime = `${String(hours).padStart(2, "0")}:${minutes}`;
    }

    const dt = new Date(`${isoDate}T${isoTime}:00`);
    return isNaN(dt.getTime()) ? null : dt;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Resolver token desde la BD                                         */
/* ------------------------------------------------------------------ */

async function resolveToken(
  supabase: ReturnType<typeof createClient>,
  token: string
): Promise<TokenConfig | null> {
  const { data, error } = await supabase
    .from("landing_tokens")
    .select(
      "empresa_id, pipeline_id, etapa_id, prioridad_default, asignado_a, empresa_label, nombre, metadata"
    )
    .eq("token", token)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    console.error("[resolveToken] Error:", error);
    return null;
  }
  return data as TokenConfig | null;
}

/* ------------------------------------------------------------------ */
/*  Crear reunión vinculada al lead                                    */
/* ------------------------------------------------------------------ */

async function createReunion(
  supabase: ReturnType<typeof createClient>,
  reunion: NonNullable<LandingLeadPayload["reunion"]>,
  leadId: string,
  empresaId: string
): Promise<Record<string, unknown>> {
  if (!reunion.titulo || !reunion.fecha) {
    console.warn("[reunion] Faltan campos obligatorios (titulo, fecha)");
    return { error: "Reunión requiere 'titulo' y 'fecha'" };
  }

  const startTime = buildDateTime(reunion.fecha, reunion.hora ?? "09:00");
  if (!startTime) {
    console.warn(`[reunion] Fecha/hora inválida: fecha="${reunion.fecha}" hora="${reunion.hora}"`);
    return { error: `No se pudo interpretar fecha/hora: fecha="${reunion.fecha}" hora="${reunion.hora}"` };
  }

  const duracion = reunion.duracion_minutos ?? 30;

  const { data, error } = await supabase
    .from("lead_reuniones")
    .insert({
      lead_id: leadId,
      empresa_id: empresaId,
      titulo: reunion.titulo,
      fecha: startTime.toISOString(),
      duracion_minutos: duracion,
      notas: reunion.notas || null,
      created_by: null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[reunion] Error insertando:", error);
    return { error: error.message };
  }

  console.log(`✅ [reunion] Cita creada con ID: ${data.id} para lead ${leadId}`);
  return {
    reunion_id: data.id,
    titulo: reunion.titulo,
    fecha: startTime.toISOString(),
    duracion_minutos: duracion,
  };
}

/* ------------------------------------------------------------------ */
/*  Helper: insertar nota (texto libre del payload)                    */
/* ------------------------------------------------------------------ */

async function insertNota(
  supabase: ReturnType<typeof createClient>,
  leadId: string,
  contenido: string
): Promise<void> {
  try {
    await supabase.from("nota_lead").insert({
      lead_id: leadId,
      contenido,
      creado_por: null,
      creador_nombre: "Formulario Web",
    });
  } catch (notaErr) {
    console.warn("[notas] No se pudo insertar nota:", notaErr);
  }
}

/* ------------------------------------------------------------------ */
/*  Handler principal                                                  */
/* ------------------------------------------------------------------ */

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return jsonResponse({ success: true, message: "received_landing activo (multi-token, multi-evento)" }, 200);
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Supabase env vars are missing" }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const payload = (await req.json()) as LandingLeadPayload;

    if (!payload.telefono) {
      return jsonResponse({ error: "El campo 'telefono' es obligatorio" }, 400);
    }

    // ── Resolver token ──────────────────────────────────────────────
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || null;

    let config: TokenConfig | null = null;

    if (token) {
      config = await resolveToken(supabase, token);
      if (!config) {
        return jsonResponse({ error: "Token inválido o inactivo" }, 403);
      }
      console.log(
        `✅ [TOKEN] Resuelto: "${config.nombre}" → empresa=${config.empresa_id}, pipeline=${config.pipeline_id}, etapa_default=${config.etapa_id}`
      );
    } else {
      if (!payload.empresa_id) {
        return jsonResponse(
          { error: "Debes enviar ?token=xxx o incluir 'empresa_id' en el payload" },
          400
        );
      }
      console.log(`⚠️ [LEGACY] Sin token, usando IDs del payload: empresa=${payload.empresa_id}`);
    }

    // ── Resolver tipo + etapa destino ───────────────────────────────
    const tipo = normalizeTipo(payload.tipo);
    const etapasPorTipo = config?.metadata?.etapas_por_tipo ?? {};
    const etapaFromTipo = etapasPorTipo[tipo] || null;

    const empresaId  = config?.empresa_id  ?? payload.empresa_id!;
    const pipelineId = config?.pipeline_id ?? payload.pipeline_id ?? null;
    const etapaId    = etapaFromTipo ?? config?.etapa_id ?? payload.etapa_id ?? null;

    console.log(`📥 [EVENT] tipo="${tipo}" → etapa_destino=${etapaId} ${etapaFromTipo ? "(mapeado por tipo)" : "(default del token)"}`);

    // Validar empresa en modo legacy
    if (!config) {
      const { data: empresa } = await supabase
        .from("empresa")
        .select("id")
        .eq("id", empresaId)
        .maybeSingle();

      if (!empresa) {
        return jsonResponse({ error: `empresa_id '${empresaId}' no existe` }, 400);
      }
    }

    const cleanPhone = normalizePhone(payload.telefono);

    // ── Buscar lead existente (mismo teléfono + empresa) ────────────
    const { data: existingLead } = await supabase
      .from("lead")
      .select("id, etapa_id, pipeline_id, nombre_completo, correo_electronico, ubicacion, presupuesto, membresia, evento")
      .eq("empresa_id", empresaId)
      .eq("telefono", cleanPhone)
      .maybeSingle();

    let leadId: string;
    let created = false;
    let movedEtapa = false;
    let updated = false;
    let finalEtapaId: string | null = etapaId ?? null;

    if (existingLead) {
      // ── Lead ya existe → ACTUALIZAR con la info nueva ─────────────
      leadId = existingLead.id as string;

      // Solo sobreescribir campos si el payload trae un valor (no pisar con null)
      const updates: Record<string, unknown> = {};
      if (payload.nombre_completo)    updates.nombre_completo    = payload.nombre_completo;
      if (payload.correo_electronico) updates.correo_electronico = payload.correo_electronico;
      if (payload.ubicacion)          updates.ubicacion          = payload.ubicacion;
      if (payload.presupuesto != null) updates.presupuesto       = payload.presupuesto;
      if (payload.membresia)          updates.membresia          = payload.membresia;
      if (payload.evento)             updates.evento             = payload.evento;

      // Mover de etapa si corresponde (mismo pipeline + etapa distinta)
      const samePipeline = !pipelineId || existingLead.pipeline_id === pipelineId;
      if (etapaId && samePipeline && existingLead.etapa_id !== etapaId) {
        updates.etapa_id = etapaId;
        updates.stage_entered_at = new Date().toISOString();
        updates.sla_custom_limit_minutes = null;
        movedEtapa = true;
        finalEtapaId = etapaId;
      } else {
        finalEtapaId = (existingLead.etapa_id as string | null) ?? etapaId ?? null;
      }

      if (Object.keys(updates).length > 0) {
        const { error: updErr } = await supabase
          .from("lead")
          .update(updates)
          .eq("id", leadId);

        if (updErr) {
          console.warn(`[update] No se pudo actualizar lead ${leadId}:`, updErr);
        } else {
          updated = true;
          console.log(`✏️ [update] Lead ${leadId} actualizado con ${Object.keys(updates).length} campos`);
        }
      }

      // Dejar nota documentando el nuevo submit (siempre, para que quede trazado)
      const resumenSubmit = [
        `📩 Nuevo submit desde "${config?.nombre ?? "API directa"}" (tipo: ${tipo})`,
        payload.nombre_completo  ? `• Nombre: ${payload.nombre_completo}` : null,
        payload.correo_electronico ? `• Email: ${payload.correo_electronico}` : null,
        payload.ubicacion        ? `• Ubicación: ${payload.ubicacion}` : null,
        payload.presupuesto != null ? `• Presupuesto: ${payload.presupuesto}` : null,
        payload.membresia        ? `• Membresía: ${payload.membresia}` : null,
        payload.evento           ? `• Evento: ${payload.evento}` : null,
      ].filter(Boolean).join("\n");
      await insertNota(supabase, leadId, resumenSubmit);
    } else {
      // ── Lead nuevo → INSERT ──────────────────────────────────────
      const { data, error } = await supabase
        .from("lead")
        .insert({
          nombre_completo:    payload.nombre_completo ?? `Lead Landing ${cleanPhone}`,
          correo_electronico: payload.correo_electronico ?? null,
          telefono:           cleanPhone,
          empresa:            payload.empresa ?? config?.empresa_label ?? "Landing",
          ubicacion:          payload.ubicacion ?? null,
          presupuesto:        payload.presupuesto ?? null,
          membresia:          payload.membresia ?? null,
          evento:             payload.evento ?? null,
          empresa_id:         empresaId,
          pipeline_id:        pipelineId,
          etapa_id:           etapaId,
          prioridad:          payload.prioridad ?? config?.prioridad_default ?? "medium",
          asignado_a:         payload.asignado_a ?? config?.asignado_a ?? "00000000-0000-0000-0000-000000000000",
          stage_entered_at:   new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) {
        console.error("[insert] Error creando lead:", error);
        return jsonResponse({ error: error.message }, 500);
      }

      leadId = data.id as string;
      created = true;
      finalEtapaId = etapaId ?? null;
    }

    // ── Nota (siempre que venga, sea lead nuevo o existente) ────────
    if (payload.notas && payload.notas.trim()) {
      await insertNota(supabase, leadId, payload.notas.trim());
    }

    // ── Reunión (siempre que venga) ─────────────────────────────────
    let reunionResult: Record<string, unknown> | null = null;
    if (payload.reunion) {
      reunionResult = await createReunion(supabase, payload.reunion, leadId, empresaId);
    }

    // ── Auditoría en webhooks_entrantes ─────────────────────────────
    try {
      await supabase.from("webhooks_entrantes").insert({
        empresa_id: empresaId,
        provider: "landing",
        event: tipo,
        payload: { ...payload, token: token ?? undefined },
        signature_valid: !!token,
        dedupe_key: `landing_${cleanPhone}_${empresaId}_${tipo}`,
      });
    } catch (auditErr) {
      console.warn("[audit] No se pudo registrar auditoría:", auditErr);
    }

    // ── Notificación al owner ──────────────────────────────────────
    try {
      const { data: empresa } = await supabase
        .from("empresa")
        .select("owner_id, nombre_empresa")
        .eq("id", empresaId)
        .single();

      if (empresa?.owner_id) {
        const reunionInfo = reunionResult && !reunionResult.error
          ? ` + cita "${payload.reunion?.titulo}" agendada`
          : "";
        const accion = created ? "Nuevo lead" : movedEtapa ? "Lead movido de etapa" : "Lead actualizado";
        await supabase.from("notificaciones").insert({
          user_id: empresa.owner_id,
          tipo: "nuevo_lead_landing",
          titulo: `${accion} desde Landing`,
          mensaje: `${accion} (${tipo}) desde "${config?.nombre ?? "API directa"}": ${payload.nombre_completo ?? cleanPhone}${reunionInfo}`,
          datos: {
            lead_id: leadId,
            telefono: cleanPhone,
            empresa_id: empresaId,
            token_name: config?.nombre ?? null,
            tipo,
            created,
            moved_etapa: movedEtapa,
            reunion_id: reunionResult?.reunion_id ?? null,
          },
          leido: false,
        });
      }
    } catch (notifErr) {
      console.warn("[notif] No se pudo crear notificación:", notifErr);
    }

    return jsonResponse(
      {
        success: true,
        lead_id: leadId,
        created,
        updated,
        moved_etapa: movedEtapa,
        etapa_id: finalEtapaId,
        tipo,
        token_name: config?.nombre ?? null,
        reunion: reunionResult,
      },
      created ? 201 : 200
    );
  } catch (e) {
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Invalid JSON" },
      400
    );
  }
});
