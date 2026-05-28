// ============================================================
// admin-start-impersonation
//
// Inicia una sesión de impersonación: un staff de Morna "entra como cliente"
// (el dueño de una empresa) para dar soporte viendo el CRM tal como lo ve él,
// sin necesidad de su contraseña.
//
// Flujo:
//   1. Valida el JWT del caller y que esté en morna_staff (super_admin | support).
//   2. Valida el objetivo: existe, NO es staff, NO es el propio caller, tiene email.
//   3. Cierra cualquier impersonación abierta previa del mismo staff.
//   4. Registra la sesión en impersonation_log + admin_actions_log.
//   5. Genera un magic link (hashed_token) para el objetivo, que el front
//      intercambia por una sesión vía verifyOtp.
//
// Body: { targetUserId: string, empresaId?: string, reason: string (>=10) }
//
// Seguridad: el gating es 100% server-side. Los tokens del objetivo nunca se
// guardan en BD — solo se devuelve el hashed_token de un solo uso.
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

// inet de Postgres es estricto: si el valor no parece una IP lo guardamos null
// para no romper el INSERT.
function sanitizeIp(raw: string | null): string | null {
  if (!raw) return null;
  const candidate = raw.split(",")[0]?.trim() ?? "";
  if (!candidate) return null;
  return /^[0-9a-fA-F:.]+$/.test(candidate) ? candidate : null;
}

interface StartBody {
  targetUserId?: string;
  empresaId?: string;
  reason?: string;
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

    // 1. Autenticación del caller (el staff).
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
      console.warn("[admin-start-impersonation] token inválido:", userErr);
      return jsonResponse({ error: "unauthorized" }, 401);
    }
    const callerUserId = userData.user.id;

    // Verificar que el caller es staff (cualquier rol: super_admin | support).
    const { data: staffRow, error: staffErr } = await admin
      .from("morna_staff")
      .select("role")
      .eq("user_id", callerUserId)
      .maybeSingle();
    if (staffErr) {
      console.error("[admin-start-impersonation] error consultando morna_staff:", staffErr);
      return jsonResponse({ error: "internal_error" }, 500);
    }
    if (!staffRow) {
      console.warn(`[admin-start-impersonation] acceso denegado para user ${callerUserId}`);
      return jsonResponse({ error: "forbidden" }, 403);
    }

    // 2. Parsear y validar el body.
    let body: StartBody = {};
    try {
      const raw = await req.text();
      if (raw) body = JSON.parse(raw) as StartBody;
    } catch {
      return jsonResponse({ error: "invalid_body" }, 400);
    }

    const targetUserId = (body.targetUserId || "").trim();
    const empresaId = (body.empresaId || "").trim() || null;
    const reason = (body.reason || "").trim();

    if (!targetUserId) return jsonResponse({ error: "missing_target" }, 400);
    if (reason.length < 10) return jsonResponse({ error: "reason_too_short" }, 400);
    if (targetUserId === callerUserId) {
      return jsonResponse({ error: "cannot_impersonate_self" }, 400);
    }

    // El objetivo no puede ser otro staff (evita escalamiento lateral).
    const { data: targetStaff } = await admin
      .from("morna_staff")
      .select("user_id")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (targetStaff) {
      return jsonResponse({ error: "cannot_impersonate_staff" }, 403);
    }

    // 3. Resolver el objetivo (email + nombre).
    const { data: targetUserData, error: targetErr } = await admin.auth.admin.getUserById(
      targetUserId,
    );
    if (targetErr || !targetUserData?.user) {
      return jsonResponse({ error: "target_not_found" }, 404);
    }
    const targetUser = targetUserData.user;
    if ((targetUser as { is_anonymous?: boolean }).is_anonymous) {
      return jsonResponse({ error: "cannot_impersonate_anonymous" }, 400);
    }
    const targetEmail = targetUser.email;
    if (!targetEmail) return jsonResponse({ error: "target_has_no_email" }, 400);

    let targetName = targetEmail;
    const { data: usuarioRow } = await admin
      .from("usuarios")
      .select("nombre")
      .eq("id", targetUserId)
      .maybeSingle();
    if (usuarioRow?.nombre) targetName = usuarioRow.nombre as string;

    // 4. Cerrar impersonaciones abiertas previas del mismo staff (higiene).
    await admin
      .from("impersonation_log")
      .update({ ended_at: new Date().toISOString() })
      .eq("staff_user_id", callerUserId)
      .is("ended_at", null);

    // Registrar la nueva sesión.
    const { data: logRow, error: logErr } = await admin
      .from("impersonation_log")
      .insert({
        staff_user_id: callerUserId,
        target_user_id: targetUserId,
        target_empresa_id: empresaId,
        reason,
        ip_address: sanitizeIp(req.headers.get("x-forwarded-for")),
        user_agent: req.headers.get("user-agent"),
      })
      .select("id")
      .single();
    if (logErr || !logRow) {
      console.error("[admin-start-impersonation] error insertando impersonation_log:", logErr);
      return jsonResponse({ error: "internal_error" }, 500);
    }

    await admin.from("admin_actions_log").insert({
      staff_user_id: callerUserId,
      action: "start_impersonation",
      target_empresa_id: empresaId,
      target_user_id: targetUserId,
      payload: { reason, log_id: logRow.id },
    });

    // 5. Generar magic link para el objetivo (NO envía correo, solo lo genera).
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: targetEmail,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      console.error("[admin-start-impersonation] error generando link:", linkErr);
      return jsonResponse({ error: "internal_error" }, 500);
    }

    return jsonResponse({
      hashed_token: linkData.properties.hashed_token,
      targetUserId,
      targetEmail,
      targetName,
      logId: logRow.id,
    });
  } catch (e) {
    console.error("[admin-start-impersonation] error inesperado:", e);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
