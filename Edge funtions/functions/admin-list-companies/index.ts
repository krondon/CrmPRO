// ============================================================
// admin-list-companies
//
// Lista todas las empresas del CRM con métricas agregadas para el panel
// administrativo de Morna. Solo accesible para usuarios en morna_staff.
//
// Flujo:
//   1. Valida que el caller tenga JWT válido.
//   2. Verifica que esté en morna_staff (vía RPC is_morna_staff).
//   3. Lee empresas + métricas con service_role (bypassa la RLS por empresa).
//
// Body: { search?: string, limit?: number, offset?: number, sort?: string }
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

interface ListCompaniesBody {
  search?: string;
  limit?: number;
  offset?: number;
  sort?: "name_asc" | "created_desc" | "users_desc" | "leads_desc" | "activity_desc";
}

interface CompanyRow {
  id: string;
  nombre_empresa: string;
  logo_url: string | null;
  codigo_empresa: string | null;
  created_at: string;
  owner_user_id: string;
  owner_email: string | null;
  users_count: number;
  leads_count: number;
  messages_30d: number;
  last_activity_at: string | null;
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

    // 1. Autenticación: extraer token del caller.
    const authHeader =
      req.headers.get("Authorization") ||
      req.headers.get("authorization") ||
      req.headers.get("x-supabase-authorization") ||
      req.headers.get("X-Supabase-Authorization");
    const accessToken = extractBearerToken(authHeader);
    if (!accessToken) return jsonResponse({ error: "unauthorized" }, 401);

    // Cliente con service_role para operaciones admin.
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Verificar usuario del token.
    const { data: userData, error: userErr } = await admin.auth.getUser(accessToken);
    if (userErr || !userData?.user) {
      console.warn("[admin-list-companies] token inválido:", userErr);
      return jsonResponse({ error: "unauthorized" }, 401);
    }
    const callerUserId = userData.user.id;

    // 2. Verificar que es morna_staff. Usamos lookup directo en lugar de la RPC
    //    porque el caller podría no tener permiso ejecutar is_morna_staff vía
    //    service_role bypass (lo tiene, pero es más simple así).
    const { data: staffRow, error: staffErr } = await admin
      .from("morna_staff")
      .select("role")
      .eq("user_id", callerUserId)
      .maybeSingle();

    if (staffErr) {
      console.error("[admin-list-companies] error consultando morna_staff:", staffErr);
      return jsonResponse({ error: "internal_error" }, 500);
    }
    if (!staffRow) {
      console.warn(`[admin-list-companies] acceso denegado para user ${callerUserId}`);
      return jsonResponse({ error: "forbidden" }, 403);
    }

    // 3. Parsear body.
    let body: ListCompaniesBody = {};
    try {
      const raw = await req.text();
      if (raw) body = JSON.parse(raw) as ListCompaniesBody;
    } catch {
      // Body vacío o inválido — usamos defaults.
    }

    const limit = Math.min(Math.max(body.limit ?? 50, 1), 200);
    const offset = Math.max(body.offset ?? 0, 0);
    const search = (body.search ?? "").trim();
    const sort = body.sort ?? "activity_desc";

    // 4. Query base: empresas con búsqueda opcional por nombre.
    let empresaQuery = admin
      .from("empresa")
      .select("id, nombre_empresa, logo_url, codigo_empresa, created_at, usuario_id", {
        count: "exact",
      });

    if (search.length >= 2) {
      empresaQuery = empresaQuery.ilike("nombre_empresa", `%${search}%`);
    }

    // Ordenamiento básico a nivel SQL — los sorts por métricas se hacen
    // post-merge en JS porque las métricas vienen de queries separadas.
    if (sort === "name_asc") {
      empresaQuery = empresaQuery.order("nombre_empresa", { ascending: true });
    } else {
      empresaQuery = empresaQuery.order("created_at", { ascending: false });
    }

    empresaQuery = empresaQuery.range(offset, offset + limit - 1);

    const { data: empresas, error: empresaErr, count: empresasTotal } = await empresaQuery;
    if (empresaErr) {
      console.error("[admin-list-companies] error listando empresas:", empresaErr);
      return jsonResponse({ error: "internal_error", details: empresaErr.message }, 500);
    }

    const empresaIds = (empresas ?? []).map((e: any) => e.id as string);
    if (empresaIds.length === 0) {
      return jsonResponse({ companies: [], total: empresasTotal ?? 0 });
    }

    // 5. Métricas en paralelo: usuarios, leads, mensajes 30d, último mensaje.
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      usersResult,
      leadsResult,
      messages30dResult,
      lastMsgResult,
      ownersResult,
    ] = await Promise.all([
      // Conteo de miembros por empresa.
      admin
        .from("empresa_miembros")
        .select("empresa_id", { count: "exact", head: false })
        .in("empresa_id", empresaIds),

      // Conteo de leads por empresa.
      admin
        .from("lead")
        .select("empresa_id", { count: "exact", head: false })
        .in("empresa_id", empresaIds),

      // Mensajes en los últimos 30 días, vía join lead.empresa_id.
      admin
        .from("mensajes")
        .select("lead_id, lead!inner(empresa_id)")
        .gte("created_at", since30d)
        .in("lead.empresa_id", empresaIds),

      // Último mensaje por empresa (proxy de actividad).
      admin
        .from("mensajes")
        .select("created_at, lead!inner(empresa_id)")
        .in("lead.empresa_id", empresaIds)
        .order("created_at", { ascending: false })
        .limit(empresaIds.length * 5),

      // Email del owner.
      admin
        .from("auth.users" as any)
        .select("id, email")
        .in("id", (empresas ?? []).map((e: any) => e.usuario_id))
        .then(async (res) => {
          // Fallback: si la consulta a auth.users directa falla (pueden ser
          // permisos), pegarle al admin.auth.admin.listUsers o un batch
          // de getUserById.
          if (res.error) {
            console.warn("[admin-list-companies] auth.users select falló, fallback a getUserById:", res.error.message);
            const ownerIds = Array.from(new Set((empresas ?? []).map((e: any) => e.usuario_id).filter(Boolean)));
            const items: Array<{ id: string; email: string | null }> = [];
            for (const ownerId of ownerIds) {
              try {
                const { data: u } = await admin.auth.admin.getUserById(ownerId);
                if (u?.user) items.push({ id: u.user.id, email: u.user.email ?? null });
              } catch (e) {
                console.warn(`[admin-list-companies] getUserById falló para ${ownerId}:`, e);
              }
            }
            return { data: items as any, error: null };
          }
          return res;
        }),
    ]);

    // Helpers para agregar conteos por empresa.
    const countBy = (rows: any[] | null, key: string): Record<string, number> => {
      const map: Record<string, number> = {};
      for (const r of rows ?? []) {
        const k = String(r?.[key] ?? "");
        if (!k) continue;
        map[k] = (map[k] || 0) + 1;
      }
      return map;
    };

    const usersMap = countBy(usersResult.data, "empresa_id");
    const leadsMap = countBy(leadsResult.data, "empresa_id");

    // Para mensajes 30d el join devuelve `lead.empresa_id` anidado.
    const msgs30dMap: Record<string, number> = {};
    for (const row of (messages30dResult.data ?? []) as any[]) {
      const emp = row?.lead?.empresa_id;
      if (!emp) continue;
      msgs30dMap[emp] = (msgs30dMap[emp] || 0) + 1;
    }

    // Último mensaje por empresa.
    const lastActivityMap: Record<string, string> = {};
    for (const row of (lastMsgResult.data ?? []) as any[]) {
      const emp = row?.lead?.empresa_id;
      const t = row?.created_at;
      if (!emp || !t) continue;
      if (!lastActivityMap[emp] || t > lastActivityMap[emp]) {
        lastActivityMap[emp] = t;
      }
    }

    // Email del owner por user_id.
    const ownerEmailMap: Record<string, string> = {};
    for (const row of (ownersResult.data ?? []) as any[]) {
      if (row?.id && row?.email) ownerEmailMap[row.id] = row.email;
    }

    // 6. Componer respuesta.
    const companies: CompanyRow[] = (empresas ?? []).map((e: any) => ({
      id: e.id,
      nombre_empresa: e.nombre_empresa,
      logo_url: e.logo_url ?? null,
      codigo_empresa: e.codigo_empresa ?? null,
      created_at: e.created_at,
      owner_user_id: e.usuario_id,
      owner_email: ownerEmailMap[e.usuario_id] ?? null,
      users_count: usersMap[e.id] ?? 0,
      leads_count: leadsMap[e.id] ?? 0,
      messages_30d: msgs30dMap[e.id] ?? 0,
      last_activity_at: lastActivityMap[e.id] ?? null,
    }));

    // Sort en memoria si la métrica no es ordenable en SQL.
    if (sort === "users_desc") companies.sort((a, b) => b.users_count - a.users_count);
    else if (sort === "leads_desc") companies.sort((a, b) => b.leads_count - a.leads_count);
    else if (sort === "activity_desc") {
      companies.sort((a, b) => {
        const ta = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
        const tb = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
        return tb - ta;
      });
    }

    return jsonResponse({
      companies,
      total: empresasTotal ?? companies.length,
      limit,
      offset,
    });
  } catch (err) {
    console.error("[admin-list-companies] unhandled:", err);
    return jsonResponse({ error: "internal_error", message: (err as Error).message }, 500);
  }
});
