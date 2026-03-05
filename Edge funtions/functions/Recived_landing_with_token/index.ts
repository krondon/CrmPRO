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
  metadata?: Record<string, unknown>;
};

/** Payload que envía la landing page */
type LandingLeadPayload = {
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

function normalizePhone(phone: string): string {
  return phone
    .replace("@c.us", "")
    .replace("@s.whatsapp.net", "")
    .replace(/[^\d]/g, "")
    .trim();
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
  // Validar campos obligatorios de la reunión
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
      created_by: null, // Creada desde landing
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
/*  Handler principal                                                  */
/* ------------------------------------------------------------------ */

serve(async (req: Request) => {
  // ── CORS preflight ───────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── Health check ─────────────────────────────────────────────────
  if (req.method === "GET") {
    return jsonResponse({ success: true, message: "received_landing activo (multi-token)" }, 200);
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Supabase env vars are missing" }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // ── Leer payload ────────────────────────────────────────────────
    const payload = (await req.json()) as LandingLeadPayload;

    if (!payload.telefono) {
      return jsonResponse({ error: "El campo 'telefono' es obligatorio" }, 400);
    }

    // ── Resolver configuración del token ────────────────────────────
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || null;

    let config: TokenConfig | null = null;

    if (token) {
      config = await resolveToken(supabase, token);
      if (!config) {
        return jsonResponse({ error: "Token inválido o inactivo" }, 403);
      }
      console.log(
        `✅ [TOKEN] Resuelto: "${config.nombre}" → empresa=${config.empresa_id}, pipeline=${config.pipeline_id}, etapa=${config.etapa_id}`
      );
    } else {
      // ── Modo legacy (retrocompatible): IDs directos en el payload ──
      if (!payload.empresa_id) {
        return jsonResponse(
          { error: "Debes enviar ?token=xxx o incluir 'empresa_id' en el payload" },
          400
        );
      }
      console.log(`⚠️ [LEGACY] Sin token, usando IDs del payload: empresa=${payload.empresa_id}`);
    }

    // ── Determinar valores finales ──────────────────────────────────
    const empresaId  = config?.empresa_id  ?? payload.empresa_id!;
    const pipelineId = config?.pipeline_id ?? payload.pipeline_id;
    const etapaId    = config?.etapa_id    ?? payload.etapa_id;

    // Validar que la empresa existe (solo en modo legacy)
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

    // ── Insertar lead ───────────────────────────────────────────────
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
        pipeline_id:        pipelineId ?? null,
        etapa_id:           etapaId ?? null,
        prioridad:          payload.prioridad ?? config?.prioridad_default ?? "medium",
        asignado_a:         payload.asignado_a ?? config?.asignado_a ?? "00000000-0000-0000-0000-000000000000",
      })
      .select("id")
      .single();

    if (error) {
      // ── Duplicado (unique constraint on telefono + empresa_id) ────
      if ((error as any).code === "23505") {
        const { data: existingLead } = await supabase
          .from("lead")
          .select("id")
          .eq("empresa_id", empresaId)
          .eq("telefono", cleanPhone)
          .maybeSingle();

        // Si hay reunión y el lead ya existía, intentar crearla de todas formas
        let reunionResult: Record<string, unknown> | null = null;
        if (payload.reunion && existingLead?.id) {
          reunionResult = await createReunion(supabase, payload.reunion, existingLead.id, empresaId);
        }

        return jsonResponse(
          {
            success: true,
            message: "Lead already exists",
            lead_id: existingLead?.id ?? null,
            token_name: config?.nombre ?? null,
            reunion: reunionResult,
          },
          200
        );
      }

      return jsonResponse({ error: error.message }, 500);
    }

    // ── Crear reunión si se incluyó en el payload ──────────────────
    let reunionResult: Record<string, unknown> | null = null;
    if (payload.reunion) {
      reunionResult = await createReunion(supabase, payload.reunion, data.id, empresaId);
    }

    // ── Auditoría en webhooks_entrantes ─────────────────────────────
    try {
      await supabase.from("webhooks_entrantes").insert({
        empresa_id: empresaId,
        provider: "landing",
        event: "lead_created",
        payload: { ...payload, token: token ?? undefined },
        signature_valid: !!token,
        dedupe_key: `landing_${cleanPhone}_${empresaId}`,
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
        await supabase.from("notificaciones").insert({
          user_id: empresa.owner_id,
          tipo: "nuevo_lead_landing",
          titulo: "Nuevo Lead desde Landing",
          mensaje: `Se ha creado un lead desde "${config?.nombre ?? "API directa"}": ${payload.nombre_completo ?? cleanPhone}${reunionInfo}`,
          datos: {
            lead_id: data.id,
            telefono: cleanPhone,
            empresa_id: empresaId,
            token_name: config?.nombre ?? null,
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
        lead_id: data.id,
        token_name: config?.nombre ?? null,
        reunion: reunionResult,
      },
      201
    );
  } catch (e) {
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Invalid JSON" },
      400
    );
  }
});