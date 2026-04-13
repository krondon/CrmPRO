// @deno-types="https://deno.land/std@0.177.0/http/server.ts"
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @deno-types="https://esm.sh/@supabase/supabase-js@2"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore
declare const Deno: any;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Reutiliza el mismo secret y empresa_id que tag-lead para simplificar la configuración
const TAG_LEAD_SECRET = Deno.env.get("TAG_LEAD_SECRET") ?? "";
const TAG_LEAD_EMPRESA_ID = Deno.env.get("TAG_LEAD_EMPRESA_ID") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */

/**
 * Payload que envía la Super API para consultar la info de un lead.
 * Se identifica el lead por teléfono dentro de la empresa.
 */
type GetLeadInfoPayload = {
  /** Teléfono del lead a consultar (requerido) */
  telefono: string;

  /**
   * UUID de la empresa — OPCIONAL.
   * Si no se envía, se usa el valor fijo configurado
   * en el Secret TAG_LEAD_EMPRESA_ID del servidor.
   */
  empresa_id?: string;
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
/*  Handler principal                                                  */
/* ------------------------------------------------------------------ */

serve(async (req: Request) => {
  // ── CORS preflight ───────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── Health check ─────────────────────────────────────────────────
  if (req.method === "GET") {
    return jsonResponse({ success: true, message: "get-lead-info activo ✅" }, 200);
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
    const rawBody = await req.text();
    console.log("📩 [get-lead-info] Body recibido:", rawBody);
    
    let payload: GetLeadInfoPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      console.warn("⚠️ [get-lead-info] Error parseando JSON:", e);
      return jsonResponse({ error: "Invalid JSON format" }, 400);
    }

    // ── Validaciones básicas ────────────────────────────────────────
    if (!payload.telefono) {
      console.warn("⚠️ [get-lead-info] Validación fallida: 'telefono' es obligatorio.");
      return jsonResponse({ error: "El campo 'telefono' es obligatorio" }, 400);
    }

    if (!payload.empresa_id?.trim()) {
      console.warn("⚠️ [get-lead-info] Validación fallida: 'empresa_id' no encontrado en el payload.");
      return jsonResponse(
        { error: "El campo 'empresa_id' es obligatorio en el JSON." },
        400
      );
    }

    const empresaId = payload.empresa_id.trim();
    const cleanPhone = normalizePhone(payload.telefono);

    console.log(
      `🔍 [get-lead-info] Buscando lead con teléfono=${cleanPhone} en empresa=${empresaId}`
    );

    // ── 1. Buscar el lead por teléfono ──────────────────────────────
    const { data: lead, error: leadError } = await supabase
      .from("lead")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("telefono", cleanPhone)
      .maybeSingle();

    if (leadError) {
      console.error("[get-lead-info] Error buscando lead:", leadError);
      return jsonResponse({ error: leadError.message }, 500);
    }

    if (!lead) {
      return jsonResponse(
        {
          success: false, // Puedes cambiarlo a true si Super API lo exige así
          message: `Usuario no registrado. No se encontró un lead con teléfono ${cleanPhone} en esta empresa.`,
        },
        200 // Ahora devuelve OK 200 para que la Super API no explote
      );
    }

    console.log(`✅ [get-lead-info] Lead encontrado: ${lead.id} (${lead.nombre_completo})`);

    // ── Determinar si el cliente es nuevo (creado hace menos de 24 horas) ──
    const ahora = new Date();
    const creadoEn = new Date(lead.created_at);
    const diferenciaMs = ahora.getTime() - creadoEn.getTime();
    const es_nuevo_cliente = diferenciaMs < 24 * 60 * 60 * 1000;

    // ── 2. Consultas paralelas de datos relacionados ─────────────────
    const [
      notasResult,
      reunionesResult,
      presupuestosResult,
      historialResult,
    ] = await Promise.all([
      // Notas del lead
      supabase
        .from("nota_lead")
        .select("id, contenido, creador_nombre, creado_por, created_at")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false }),

      // Reuniones con sus participantes
      supabase
        .from("lead_reuniones")
        .select(`
          id,
          titulo,
          fecha,
          duracion_minutos,
          notas,
          created_at,
          participantes:lead_reunion_participantes (
            id,
            nombre,
            tipo
          )
        `)
        .eq("lead_id", lead.id)
        .order("fecha", { ascending: true }),

      // Presupuestos PDF
      supabase
        .from("presupuesto_pdf")
        .select("id, nombre, url, created_at")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false }),

      // Historial — últimos 10 registros
      supabase
        .from("lead_historial")
        .select("id, tipo, descripcion, dato_anterior, dato_nuevo, creado_por, created_at")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    // Logs de errores no bloqueantes (la info principal del lead ya fue obtenida)
    if (notasResult.error) {
      console.warn("[get-lead-info] Error cargando notas:", notasResult.error.message);
    }
    if (reunionesResult.error) {
      console.warn("[get-lead-info] Error cargando reuniones:", reunionesResult.error.message);
    }
    if (presupuestosResult.error) {
      console.warn("[get-lead-info] Error cargando presupuestos:", presupuestosResult.error.message);
    }
    if (historialResult.error) {
      console.warn("[get-lead-info] Error cargando historial:", historialResult.error.message);
    }

    // ── 3. Ensamblar la respuesta ───────────────────────────────────
    const responsePayload = {
      success: true,
      lead: {
        // ── Datos principales ──
        id: lead.id,
        nombre: lead.nombre_completo,
        telefono: lead.telefono,
        email: lead.correo_electronico,
        empresa: lead.empresa,
        ubicacion: lead.ubicacion ?? null,
        prioridad: lead.prioridad,
        pipeline_id: lead.pipeline_id,
        etapa_id: lead.etapa_id,
        fuente: lead.fuente ?? null,
        canal: lead.canal ?? null,
        asignado_a: lead.asignado_a ?? null,
        presupuesto: lead.presupuesto ?? null,
        valor: lead.valor ?? null,
        evento: lead.evento ?? null,
        membresia: lead.membresia ?? null,
        archived: lead.archived ?? false,
        archived_at: lead.archived_at ?? null,
        created_at: lead.created_at,
        updated_at: lead.updated_at ?? null,
        es_nuevo_cliente,           // true si la oportunidad se creó hace menos de 24 h

        // ── Etiquetas ──
        // El CRM maneja dos columnas: 'tags' (objetos {id,name,color}) y
        // 'etiquetas' (array de UUIDs usada por tag-lead). Devolvemos ambas
        // para que la Super API tenga la info completa.
        tags: Array.isArray(lead.tags) ? lead.tags : [],
        etiquetas_ids: Array.isArray(lead.etiquetas) ? lead.etiquetas : [],

        // ── Notas ──
        notas: (notasResult.data ?? []).map((n: any) => ({
          id: n.id,
          contenido: n.contenido,
          creador_nombre: n.creador_nombre ?? null,
          created_at: n.created_at,
        })),

        // ── Reuniones ──
        reuniones: (reunionesResult.data ?? []).map((r: any) => ({
          id: r.id,
          titulo: r.titulo,
          fecha: r.fecha,
          duracion_minutos: r.duracion_minutos ?? null,
          notas: r.notas ?? null,
          participantes: (r.participantes ?? []).map((p: any) => ({
            id: p.id,
            nombre: p.nombre,
            tipo: p.tipo ?? null,
          })),
          created_at: r.created_at,
        })),

        // ── Presupuestos PDF ──
        presupuestos_pdf: (presupuestosResult.data ?? []).map((p: any) => ({
          id: p.id,
          nombre: p.nombre,
          url: p.url,
          created_at: p.created_at,
        })),

        // ── Historial (últimos 10) ──
        historial: (historialResult.data ?? []).map((h: any) => ({
          id: h.id,
          tipo: h.tipo,
          descripcion: h.descripcion ?? null,
          dato_anterior: h.dato_anterior ?? null,
          dato_nuevo: h.dato_nuevo ?? null,
          created_at: h.created_at,
        })),
      },
    };

    console.log(`📤 [get-lead-info] Respuesta enviada para lead ${lead.id}`);

    return jsonResponse(responsePayload as unknown as Record<string, unknown>, 200);
  } catch (e) {
    console.error("[get-lead-info] Error inesperado:", e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Invalid JSON or unexpected error" },
      400
    );
  }
});
