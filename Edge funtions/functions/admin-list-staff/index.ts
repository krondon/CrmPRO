// ============================================================
// admin-list-staff
//
// Lista los miembros de morna_staff con su email/nombre (resueltos vía la tabla
// pública `usuarios`) y quién los agregó. Accesible para cualquier staff.
//
// El cliente nunca lee morna_staff directo (RLS sin políticas); todo pasa por
// aquí con service_role.
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

    // Cargar staff.
    const { data: rows, error: rowsErr } = await admin
      .from("morna_staff")
      .select("user_id, role, created_at, created_by, notes")
      .order("created_at", { ascending: true });
    if (rowsErr) {
      console.error("[admin-list-staff] error listando staff:", rowsErr);
      return jsonResponse({ error: "internal_error" }, 500);
    }

    // Resolver emails/nombres vía la tabla pública `usuarios`.
    const ids = Array.from(
      new Set(
        (rows ?? [])
          .flatMap((r: any) => [r.user_id, r.created_by])
          .filter(Boolean),
      ),
    );
    const profileMap: Record<string, { email: string | null; nombre: string | null }> = {};
    if (ids.length > 0) {
      const { data: usuarios } = await admin
        .from("usuarios")
        .select("id, email, nombre")
        .in("id", ids);
      for (const u of (usuarios ?? []) as any[]) {
        profileMap[u.id] = { email: u.email ?? null, nombre: u.nombre ?? null };
      }
    }

    const staff = (rows ?? []).map((r: any) => ({
      userId: r.user_id,
      email: profileMap[r.user_id]?.email ?? null,
      nombre: profileMap[r.user_id]?.nombre ?? null,
      role: r.role,
      createdAt: r.created_at,
      createdByEmail: r.created_by ? (profileMap[r.created_by]?.email ?? null) : null,
      notes: r.notes ?? null,
    }));

    return jsonResponse({ staff });
  } catch (e) {
    console.error("[admin-list-staff] error inesperado:", e);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
