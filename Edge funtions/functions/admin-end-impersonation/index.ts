// ============================================================
// admin-end-impersonation
//
// Termina una sesión de impersonación: marca ended_at en impersonation_log
// y registra la acción. El front la llama al pulsar "Salir".
//
// Cuando se llama, el caller normalmente tiene la sesión del OBJETIVO (ya se
// hizo el swap al impersonar). Por eso autorizamos si el caller es el
// target_user_id O el staff_user_id del log.
//
// Body: { logId: string }
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, Authorization, x-supabase-authorization, X-Supabase-Authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function extractBearerToken(rawHeader: string | null): string | null {
  if (!rawHeader) return null;
  const normalized = rawHeader.trim();
  if (!normalized) return null;
  if (/^bearer\s+/i.test(normalized)) {
    return normalized.replace(/^bearer\s+/i, "").trim() || null;
  }
  return normalized;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface EndBody {
  logId?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "server_misconfigured" }, 503);
    }

    const authHeader =
      req.headers.get("Authorization") ||
      req.headers.get("authorization") ||
      req.headers.get("x-supabase-authorization") ||
      req.headers.get("X-Supabase-Authorization");
    const accessToken = extractBearerToken(authHeader);
    if (!accessToken) return jsonResponse({ error: "unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userErr } = await admin.auth.getUser(accessToken);
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
    const callerUserId = userData.user.id;

    let body: EndBody = {};
    try {
      const raw = await req.text();
      if (raw) body = JSON.parse(raw) as EndBody;
    } catch {
      return jsonResponse({ error: "invalid_body" }, 400);
    }

    const logId = (body.logId || "").trim();
    if (!logId) return jsonResponse({ error: "missing_log" }, 400);

    const { data: log, error: logErr } = await admin
      .from("impersonation_log")
      .select("id, staff_user_id, target_user_id, ended_at")
      .eq("id", logId)
      .maybeSingle();
    if (logErr) {
      console.error("[admin-end-impersonation] error leyendo log:", logErr);
      return jsonResponse({ error: "internal_error" }, 500);
    }
    if (!log) return jsonResponse({ error: "not_found" }, 404);

    // Solo el objetivo o el staff que la inició pueden cerrarla.
    if (callerUserId !== log.target_user_id && callerUserId !== log.staff_user_id) {
      return jsonResponse({ error: "forbidden" }, 403);
    }

    // Idempotente: si ya estaba cerrada, no duplicamos la acción.
    if (!log.ended_at) {
      await admin
        .from("impersonation_log")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", logId)
        .is("ended_at", null);

      await admin.from("admin_actions_log").insert({
        staff_user_id: log.staff_user_id,
        action: "end_impersonation",
        target_user_id: log.target_user_id,
        payload: { log_id: logId },
      });
    }

    return jsonResponse({ ok: true });
  } catch (e) {
    console.error("[admin-end-impersonation] error inesperado:", e);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
