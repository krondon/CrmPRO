// ============================================================
// admin-list-audit
//
// Devuelve el rastro de auditoría del Panel Morna para cualquier staff:
//   - actions:        últimas ~100 filas de admin_actions_log
//   - impersonations: últimas ~100 filas de impersonation_log
//
// Los emails se resuelven vía la tabla pública `usuarios`.
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

const LIMIT = 100;

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

    const { data: staffRow, error: staffErr } = await admin
      .from("morna_staff")
      .select("role")
      .eq("user_id", callerUserId)
      .maybeSingle();
    if (staffErr) return jsonResponse({ error: "internal_error" }, 500);
    if (!staffRow) return jsonResponse({ error: "forbidden" }, 403);

    const [actionsRes, impersRes] = await Promise.all([
      admin
        .from("admin_actions_log")
        .select("id, staff_user_id, action, target_empresa_id, target_user_id, payload, created_at")
        .order("created_at", { ascending: false })
        .limit(LIMIT),
      admin
        .from("impersonation_log")
        .select("id, staff_user_id, target_user_id, target_empresa_id, reason, started_at, ended_at")
        .order("started_at", { ascending: false })
        .limit(LIMIT),
    ]);

    if (actionsRes.error || impersRes.error) {
      console.error("[admin-list-audit] error leyendo logs:", actionsRes.error, impersRes.error);
      return jsonResponse({ error: "internal_error" }, 500);
    }

    // Resolver emails de todos los user_ids involucrados (una sola consulta).
    const ids = Array.from(
      new Set(
        [
          ...(actionsRes.data ?? []).flatMap((a: any) => [a.staff_user_id, a.target_user_id]),
          ...(impersRes.data ?? []).flatMap((i: any) => [i.staff_user_id, i.target_user_id]),
        ].filter(Boolean),
      ),
    );
    const emailMap: Record<string, string | null> = {};
    if (ids.length > 0) {
      const { data: usuarios } = await admin
        .from("usuarios")
        .select("id, email")
        .in("id", ids);
      for (const u of (usuarios ?? []) as any[]) emailMap[u.id] = u.email ?? null;
    }

    const actions = (actionsRes.data ?? []).map((a: any) => ({
      id: a.id,
      action: a.action,
      staffEmail: emailMap[a.staff_user_id] ?? null,
      targetEmail: a.target_user_id ? (emailMap[a.target_user_id] ?? null) : null,
      targetEmpresaId: a.target_empresa_id ?? null,
      payload: a.payload ?? null,
      createdAt: a.created_at,
    }));

    const impersonations = (impersRes.data ?? []).map((i: any) => ({
      id: i.id,
      staffEmail: emailMap[i.staff_user_id] ?? null,
      targetEmail: emailMap[i.target_user_id] ?? null,
      targetEmpresaId: i.target_empresa_id ?? null,
      reason: i.reason,
      startedAt: i.started_at,
      endedAt: i.ended_at ?? null,
      active: !i.ended_at,
    }));

    return jsonResponse({ actions, impersonations });
  } catch (e) {
    console.error("[admin-list-audit] error inesperado:", e);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
