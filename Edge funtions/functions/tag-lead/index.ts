// @deno-types="https://deno.land/std@0.177.0/http/server.ts"
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @deno-types="https://esm.sh/@supabase/supabase-js@2"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore
declare const Deno: any;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Clave secreta para autenticar la super API
// Configúrala en los Secrets de Supabase Edge Functions como: TAG_LEAD_SECRET
const TAG_LEAD_SECRET = Deno.env.get("TAG_LEAD_SECRET") ?? "";

// empresa_id fijo — la super API NO necesita enviarlo
// Configúralo en los Secrets como: TAG_LEAD_EMPRESA_ID
const TAG_LEAD_EMPRESA_ID = Deno.env.get("TAG_LEAD_EMPRESA_ID") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */

/**
 * Payload que envía la super API para etiquetar un lead.
 * Se identifica el lead por teléfono (dentro de una empresa).
 * Se puede pasar el tag_id directamente (UUID) o el nombre de la etiqueta.
 */
type TagLeadPayload = {
  /** Teléfono del lead a etiquetar (requerido) */
  telefono: string;

  /**
   * UUID de la etiqueta en saved_tags (preferido).
   * Si se envía este campo, se ignora tag_nombre.
   */
  tag_id?: string;

  /**
   * Nombre de la etiqueta (alternativo a tag_id).
   * Se buscará en saved_tags por nombre dentro de la empresa.
   */
  tag_nombre?: string;

  /**
   * UUID de la empresa — OPCIONAL.
   * Si no se envía, se usa el valor fijo configurado
   * en el Secret TAG_LEAD_EMPRESA_ID del servidor.
   */
  empresa_id?: string;

  /**
   * Descripción opcional del motivo del etiquetado
   * (se guarda en el historial del lead).
   */
  motivo?: string;
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
    return jsonResponse({ success: true, message: "tag-lead activo ✅" }, 200);
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Supabase env vars are missing" }, 500);
  }

  // ── Autenticación por clave secreta (opcional pero recomendado) ──
  if (TAG_LEAD_SECRET) {
    const apiKey =
      req.headers.get("x-api-key") ||
      new URL(req.url).searchParams.get("api_key");

    if (apiKey !== TAG_LEAD_SECRET) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // ── Leer payload ────────────────────────────────────────────────
    const payload = (await req.json()) as TagLeadPayload;

    // ── Validaciones básicas ────────────────────────────────────────
    if (!payload.telefono) {
      return jsonResponse({ error: "El campo 'telefono' es obligatorio" }, 400);
    }
    if (!payload.tag_id && !payload.tag_nombre) {
      return jsonResponse(
        { error: "Debes enviar 'tag_id' (UUID) o 'tag_nombre'" },
        400
      );
    }

    // Resolver empresa_id: del payload o del Secret del servidor
    const empresaId = payload.empresa_id?.trim() || TAG_LEAD_EMPRESA_ID;
    if (!empresaId) {
      return jsonResponse(
        { error: "No se pudo determinar empresa_id. Configura TAG_LEAD_EMPRESA_ID en los Secrets o envíalo en el payload." },
        400
      );
    }

    const cleanPhone = normalizePhone(payload.telefono);

    console.log(
      `📌 [tag-lead] Buscando lead con teléfono=${cleanPhone} en empresa=${empresaId}`
    );

    // ── 1. Buscar el lead por teléfono dentro de la empresa ─────────
    const { data: lead, error: leadError } = await supabase
      .from("lead")
      .select("id, nombre_completo, etiquetas")
      .eq("empresa_id", empresaId)
      .eq("telefono", cleanPhone)
      .maybeSingle();

    if (leadError) {
      console.error("[tag-lead] Error buscando lead:", leadError);
      return jsonResponse({ error: leadError.message }, 500);
    }

    if (!lead) {
      return jsonResponse(
        {
          success: false,
          message: `No se encontró un lead con teléfono ${cleanPhone} en esta empresa`,
        },
        404
      );
    }

    console.log(`✅ [tag-lead] Lead encontrado: ${lead.id} (${lead.nombre_completo})`);

    // ── 2. Resolver el tag_id ────────────────────────────────────────
    let resolvedTagId = payload.tag_id ?? null;
    let resolvedTagNombre = payload.tag_nombre ?? null;

    if (!resolvedTagId && payload.tag_nombre) {
      // Buscar la etiqueta por nombre dentro de la empresa
      const { data: tagRow, error: tagError } = await supabase
        .from("saved_tags")
        .select("id, label")
        .eq("empresa_id", empresaId)
        .ilike("label", payload.tag_nombre.trim())
        .maybeSingle();

      if (tagError) {
        console.error("[tag-lead] Error buscando tag:", tagError);
        return jsonResponse({ error: tagError.message }, 500);
      }

      if (!tagRow) {
        return jsonResponse(
          {
            success: false,
            message: `No se encontró la etiqueta "${payload.tag_nombre}" en la empresa`,
          },
          404
        );
      }

      resolvedTagId = tagRow.id;
      resolvedTagNombre = tagRow.label;
      console.log(`🏷️ [tag-lead] Tag resuelto por nombre: id=${resolvedTagId} label=${resolvedTagNombre}`);
    } else if (resolvedTagId) {
      // Verificar que el tag_id existe y pertenece a la empresa
      const { data: tagRow, error: tagError } = await supabase
        .from("saved_tags")
        .select("id, label")
        .eq("id", resolvedTagId)
        .eq("empresa_id", empresaId)
        .maybeSingle();

      if (tagError) {
        console.error("[tag-lead] Error verificando tag:", tagError);
        return jsonResponse({ error: tagError.message }, 500);
      }

      if (!tagRow) {
        return jsonResponse(
          {
            success: false,
            message: `El tag_id "${resolvedTagId}" no existe o no pertenece a esta empresa`,
          },
          404
        );
      }

      resolvedTagNombre = tagRow.label;
      console.log(`🏷️ [tag-lead] Tag verificado: id=${resolvedTagId} label=${resolvedTagNombre}`);
    }

    // ── 3. Verificar si el lead ya tiene esta etiqueta ───────────────
    const currentTags: string[] = Array.isArray(lead.etiquetas) ? lead.etiquetas : [];

    if (currentTags.includes(resolvedTagId!)) {
      return jsonResponse(
        {
          success: true,
          message: "El lead ya tiene esta etiqueta aplicada",
          lead_id: lead.id,
          tag_id: resolvedTagId,
          tag_label: resolvedTagNombre,
          already_tagged: true,
        },
        200
      );
    }

    // ── 4. Aplicar la etiqueta al lead ──────────────────────────────
    const updatedTags = [...currentTags, resolvedTagId!];

    const { error: updateError } = await supabase
      .from("lead")
      .update({ etiquetas: updatedTags })
      .eq("id", lead.id);

    if (updateError) {
      console.error("[tag-lead] Error actualizando etiquetas:", updateError);
      return jsonResponse({ error: updateError.message }, 500);
    }

    console.log(
      `✅ [tag-lead] Etiqueta "${resolvedTagNombre}" aplicada al lead ${lead.id}`
    );

    // ── 5. Registrar en historial del lead ──────────────────────────
    try {
      await supabase.from("lead_historial").insert({
        lead_id: lead.id,
        tipo: "tag_automatico",
        descripcion: payload.motivo
          ? `Etiqueta "${resolvedTagNombre}" aplicada automáticamente. Motivo: ${payload.motivo}`
          : `Etiqueta "${resolvedTagNombre}" aplicada automáticamente por la Super API`,
        dato_nuevo: { tag_id: resolvedTagId, tag_label: resolvedTagNombre },
        creado_por: null, // Acción automática (sin usuario)
      });
    } catch (histErr) {
      console.warn("[tag-lead] No se pudo registrar en historial:", histErr);
    }

    // ── 6. Auditoría en webhooks_entrantes ──────────────────────────
    try {
      await supabase.from("webhooks_entrantes").insert({
        empresa_id: empresaId,
        provider: "super_api",
        event: "tag_lead",
        payload: payload,
        signature_valid: !!TAG_LEAD_SECRET,
        dedupe_key: `tag_${cleanPhone}_${resolvedTagId}_${empresaId}`,
      });
    } catch (auditErr) {
      console.warn("[tag-lead] No se pudo registrar auditoría:", auditErr);
    }

    // ── 7. Respuesta exitosa ────────────────────────────────────────
    return jsonResponse(
      {
        success: true,
        message: `Etiqueta "${resolvedTagNombre}" aplicada correctamente`,
        lead_id: lead.id,
        lead_nombre: lead.nombre_completo,
        tag_id: resolvedTagId,
        tag_label: resolvedTagNombre,
        telefono: cleanPhone,
      },
      200
    );
  } catch (e) {
    console.error("[tag-lead] Error inesperado:", e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Invalid JSON or unexpected error" },
      400
    );
  }
});
