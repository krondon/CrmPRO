// ============================================================
// admin-manage-staff
//
// Agrega o quita miembros de morna_staff desde el panel. SOLO super_admin.
//
// Body:
//   { action: "add",    email: string, role: "super_admin" | "support" }
//   { action: "remove", userId: string }
//
// Guardas anti-lockout en remove: no puedes quitarte a ti mismo ni quitar al
// último super_admin. Toda mutación queda en admin_actions_log.
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

interface ManageBody {
  action?: "add" | "remove";
  email?: string;
  role?: "super_admin" | "support";
  userId?: string;
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
    if (userErr || !userData?.user) return jsonResponse({ error: "unauthorized" }, 401);
    const callerUserId = userData.user.id;

    // Gating: solo super_admin puede mutar staff.
    const { data: staffRow, error: staffErr } = await admin
      .from("morna_staff")
      .select("role")
      .eq("user_id", callerUserId)
      .maybeSingle();
    if (staffErr) return jsonResponse({ error: "internal_error" }, 500);
    if (!staffRow) return jsonResponse({ error: "forbidden" }, 403);
    if (staffRow.role !== "super_admin") return jsonResponse({ error: "forbidden" }, 403);

    let body: ManageBody = {};
    try {
      const raw = await req.text();
      if (raw) body = JSON.parse(raw) as ManageBody;
    } catch {
      return jsonResponse({ error: "invalid_body" }, 400);
    }

    // ---------- ADD ----------
    if (body.action === "add") {
      const email = (body.email || "").trim().toLowerCase();
      const role = body.role;
      if (!email) return jsonResponse({ error: "missing_email" }, 400);
      if (role !== "super_admin" && role !== "support") {
        return jsonResponse({ error: "invalid_role" }, 400);
      }

      // Resolver el usuario por email vía `usuarios` (debe tener cuenta en el CRM).
      const { data: usuario, error: usuarioErr } = await admin
        .from("usuarios")
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      if (usuarioErr) {
        console.error("[admin-manage-staff] error buscando usuario:", usuarioErr);
        return jsonResponse({ error: "internal_error" }, 500);
      }
      if (!usuario) return jsonResponse({ error: "user_not_found" }, 404);

      const { error: upsertErr } = await admin
        .from("morna_staff")
        .upsert(
          { user_id: usuario.id, role, created_by: callerUserId },
          { onConflict: "user_id" },
        );
      if (upsertErr) {
        console.error("[admin-manage-staff] error en upsert:", upsertErr);
        return jsonResponse({ error: "internal_error" }, 500);
      }

      await admin.from("admin_actions_log").insert({
        staff_user_id: callerUserId,
        action: "add_staff",
        target_user_id: usuario.id,
        payload: { email, role },
      });

      return jsonResponse({ ok: true, userId: usuario.id });
    }

    // ---------- REMOVE ----------
    if (body.action === "remove") {
      const userId = (body.userId || "").trim();
      if (!userId) return jsonResponse({ error: "missing_user" }, 400);
      if (userId === callerUserId) {
        return jsonResponse({ error: "cannot_remove_self" }, 400);
      }

      // Verificar que el objetivo existe como staff y su rol.
      const { data: targetRow } = await admin
        .from("morna_staff")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      if (!targetRow) return jsonResponse({ error: "not_staff" }, 404);

      // No permitir quitar al último super_admin (anti-lockout).
      if (targetRow.role === "super_admin") {
        const { count } = await admin
          .from("morna_staff")
          .select("user_id", { count: "exact", head: true })
          .eq("role", "super_admin");
        if ((count ?? 0) <= 1) {
          return jsonResponse({ error: "cannot_remove_last_admin" }, 400);
        }
      }

      const { error: delErr } = await admin
        .from("morna_staff")
        .delete()
        .eq("user_id", userId);
      if (delErr) {
        console.error("[admin-manage-staff] error borrando staff:", delErr);
        return jsonResponse({ error: "internal_error" }, 500);
      }

      await admin.from("admin_actions_log").insert({
        staff_user_id: callerUserId,
        action: "remove_staff",
        target_user_id: userId,
        payload: { removed_role: targetRow.role },
      });

      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: "invalid_action" }, 400);
  } catch (e) {
    console.error("[admin-manage-staff] error inesperado:", e);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
