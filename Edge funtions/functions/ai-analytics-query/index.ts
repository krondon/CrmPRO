import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// @ts-ignore
declare const Deno: any;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!;
const HUBMY_API_KEY = Deno.env.get("HUBMY_API_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": [
    "authorization",
    "Authorization",
    "x-supabase-authorization",
    "X-Supabase-Authorization",
    "x-client-info",
    "X-Client-Info",
    "apikey",
    "Apikey",
    "content-type",
    "Content-Type",
  ].join(", "),
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Tool schema (Anthropic + OpenAI compatible) ──────────────
// La IA SOLO puede devolver una de estas métricas y filtros.
// Cualquier cosa fuera del schema → la IA no la puede expresar.
const ALLOWED_METRICS = [
  "closed_revenue",
  "pipeline_value",
  "leads_count",
  "conversion_rate",
  "top_users",
  "leads_by_stage",
  "stale_leads",
  "priority_breakdown",
] as const;

type Metric = (typeof ALLOWED_METRICS)[number];

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    metric: {
      type: "string",
      enum: ALLOWED_METRICS as unknown as string[],
      description:
        "Métrica a calcular. closed_revenue=ventas cerradas (suma presupuesto en etapas tipo 'ganado'). " +
        "pipeline_value=valor total del embudo activo. leads_count=conteo de leads. " +
        "conversion_rate=% leads ganados / total. top_users=ranking de vendedores por ventas cerradas. " +
        "leads_by_stage=conteo de leads por etapa. stale_leads=leads sin actividad reciente. " +
        "priority_breakdown=distribución por prioridad (alta/media/baja).",
    },
    filters: {
      type: "object",
      properties: {
        date_from: {
          type: "string",
          description: "Fecha desde (ISO YYYY-MM-DD). Inferir del lenguaje natural usando la fecha de hoy del contexto.",
        },
        date_to: {
          type: "string",
          description: "Fecha hasta (ISO YYYY-MM-DD).",
        },
        pipeline_id: {
          type: "string",
          description:
            "UUID del pipeline si el usuario menciona uno por nombre. Solo usar uno de los listados en el contexto.",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Filtrar por prioridad si el usuario lo menciona.",
        },
        days_threshold: {
          type: "number",
          description: "Días sin actividad para stale_leads. Default 7.",
        },
        limit: {
          type: "number",
          description: "Cantidad máxima de filas para top_users. Default 10, máx 50.",
        },
      },
    },
    label: {
      type: "string",
      description:
        "Etiqueta corta y humana describiendo qué se está mostrando (ej: 'Ventas cerradas en abril 2026').",
    },
  },
  required: ["metric", "label"],
};

const ANALYTICS_TOOL_ANTHROPIC = {
  name: "build_analytics_plan",
  description:
    "Convierte la pregunta en lenguaje natural del usuario en un plan estructurado de analítica.",
  input_schema: PLAN_SCHEMA,
};

const ANALYTICS_TOOL_OPENAI = {
  type: "function",
  function: {
    name: "build_analytics_plan",
    description: ANALYTICS_TOOL_ANTHROPIC.description,
    parameters: PLAN_SCHEMA,
  },
};

// ─── AI call (mismo patrón que ai-intent-detector) ────────────
async function callAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
): Promise<any> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 20_000);
  try {
    if (apiKey.startsWith("sk-ant-")) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 512,
          system: systemPrompt,
          tools: [ANALYTICS_TOOL_ANTHROPIC],
          tool_choice: { type: "tool", name: "build_analytics_plan" },
          messages: [{ role: "user", content: userMessage }],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const toolUse = data.content?.find((c: any) => c.type === "tool_use");
      return toolUse?.input ?? null;
    }

    const baseUrl = apiKey.startsWith("sk-or-")
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";

    const res = await fetch(baseUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        tools: [ANALYTICS_TOOL_OPENAI],
        tool_choice: { type: "function", function: { name: "build_analytics_plan" } },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });
    if (!res.ok) throw new Error(`AI API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    return args ? JSON.parse(args) : null;
  } finally {
    clearTimeout(tid);
  }
}

// ─── Hubmy AI fallback (JSON prompt, no tool calling) ─────────
async function callHubmyAI(systemPrompt: string, question: string): Promise<any> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch("https://apidev.hubmy.app/v1/api/ai/chat", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${HUBMY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content:
              systemPrompt +
              `\n\nIMPORTANTE: Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin bloques de código, sin texto extra). Usa exactamente este formato:\n{"metric":"<métrica>","filters":{},"label":"<etiqueta>"}`,
          },
          { role: "user", content: `Pregunta del usuario: "${question}"` },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Hubmy AI ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const content: string =
      data.data?.content ||
      data.choices?.[0]?.message?.content ||
      data.content ||
      "";
    // Strip markdown code fences if present
    const cleaned = content.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  } finally {
    clearTimeout(tid);
  }
}

// ─── Plan validator ───────────────────────────────────────────
function validatePlan(plan: any): { ok: true; plan: any } | { ok: false; error: string } {
  if (!plan || typeof plan !== "object") return { ok: false, error: "Plan no recibido" };
  if (!ALLOWED_METRICS.includes(plan.metric)) {
    return { ok: false, error: `Métrica no permitida: ${plan.metric}` };
  }
  if (typeof plan.label !== "string" || !plan.label.trim()) {
    return { ok: false, error: "Falta label" };
  }
  const f = plan.filters ?? {};
  if (typeof f !== "object") return { ok: false, error: "Filters inválido" };
  // Validaciones livianas — el resto las hace la función SQL
  if (f.priority && !["low", "medium", "high"].includes(f.priority)) {
    return { ok: false, error: `Prioridad inválida: ${f.priority}` };
  }
  for (const k of ["date_from", "date_to"]) {
    if (f[k] && !/^\d{4}-\d{2}-\d{2}/.test(String(f[k]))) {
      return { ok: false, error: `Fecha inválida en ${k}` };
    }
  }
  return { ok: true, plan };
}

function buildSystemPrompt(today: string, pipelines: { id: string; nombre: string }[]): string {
  const pipelinesBlock = pipelines.length
    ? pipelines.map((p) => `- "${p.nombre}" (id: ${p.id})`).join("\n")
    : "(la empresa no tiene pipelines configurados)";

  return (
    `Eres un asistente que convierte preguntas en lenguaje natural sobre métricas de un CRM ` +
    `en un plan estructurado mediante la herramienta build_analytics_plan.\n\n` +
    `REGLAS:\n` +
    `- SIEMPRE devuelve la herramienta. Si la pregunta es ambigua, elige la métrica más cercana y deja filtros vacíos.\n` +
    `- Hoy es ${today}. Resuelve frases como "este mes", "mes pasado", "últimos 7 días", "este año" a fechas concretas (date_from / date_to).\n` +
    `- Solo puedes usar pipeline_id si el usuario menciona claramente un pipeline existente:\n${pipelinesBlock}\n` +
    `- Cuando la pregunta tenga que ver con dinero/ventas cerradas: usa closed_revenue.\n` +
    `- Cuando hable del valor total del pipeline o presupuesto en juego: pipeline_value.\n` +
    `- Cuando hable de # de leads/oportunidades: leads_count.\n` +
    `- Cuando pregunte tasa o porcentaje de cierre/conversión: conversion_rate.\n` +
    `- Cuando pregunte por mejores vendedores/ranking: top_users.\n` +
    `- Cuando pregunte distribución por etapa: leads_by_stage.\n` +
    `- Cuando pregunte por leads sin contactar/sin movimiento/abandonados: stale_leads.\n` +
    `- Cuando pregunte distribución por prioridad/criticidad: priority_breakdown.\n` +
    `- El label debe ser corto, humano y reflejar la pregunta (ej: "Ventas cerradas en abril 2026").`
  );
}

// ─── Server ────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader =
      req.headers.get("x-supabase-authorization") ??
      req.headers.get("Authorization") ??
      req.headers.get("authorization");
    if (!authHeader) return json({ error: "Missing auth header" }, 401);

    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const { empresa_id, question } = body || {};
    if (!empresa_id || typeof empresa_id !== "string")
      return json({ error: "empresa_id requerido" }, 400);
    if (!question || typeof question !== "string" || !question.trim())
      return json({ error: "question requerido" }, 400);
    if (question.length > 500) return json({ error: "question demasiado larga" }, 400);

    // Decode JWT to get user id
    const tokenJwt = authHeader.replace(/^Bearer\s+/i, "");
    let requesterId: string | null = null;
    try {
      const payload = JSON.parse(
        atob(tokenJwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      requesterId = payload.sub;
    } catch {
      return json({ error: "Token inválido" }, 401);
    }
    if (!requesterId) return json({ error: "Token sin sub" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verificar pertenencia: owner O miembro de la empresa
    const [{ data: empresa }, { data: miembro }] = await Promise.all([
      supabase.from("empresa").select("id, usuario_id").eq("id", empresa_id).maybeSingle(),
      supabase
        .from("empresa_miembros")
        .select("id")
        .eq("empresa_id", empresa_id)
        .eq("usuario_id", requesterId)
        .maybeSingle(),
    ]);

    if (!empresa) return json({ error: "Empresa no encontrada" }, 404);
    const isOwner = empresa.usuario_id === requesterId;
    if (!isOwner && !miembro) return json({ error: "Sin acceso a la empresa" }, 403);

    // Buscar config de IA activa de la empresa (reutilizamos la misma config que ai-intent-detector)
    const { data: configs } = await supabase
      .from("ai_automation_config")
      .select("ai_api_key, ai_model")
      .eq("empresa_id", empresa_id)
      .eq("is_active", true);

    const cfg = (configs ?? []).find((c: any) => c.ai_api_key && c.ai_model);

    // Cargar pipelines para el system prompt
    const { data: pipelines } = await supabase
      .from("pipeline")
      .select("id, nombre")
      .eq("empresa_id", empresa_id);

    const today = new Date().toISOString().slice(0, 10);
    const systemPrompt = buildSystemPrompt(today, pipelines ?? []);

    // Llamar IA: empresa config primero, Hubmy AI como fallback
    const t0 = Date.now();
    let rawPlan: any = null;
    let lastErr: any = null;

    if (cfg) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          rawPlan = await callAI(
            cfg.ai_api_key,
            cfg.ai_model,
            systemPrompt,
            `Pregunta del usuario: "${question}"`,
          );
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          if (attempt < 1) await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }

    // Hubmy AI fallback (cuando no hay config de empresa o falló)
    if (!rawPlan && HUBMY_API_KEY) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          rawPlan = await callHubmyAI(systemPrompt, question);
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          if (attempt < 1) await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }
    if (!rawPlan || lastErr) {
      await supabase.from("ai_analytics_query_log").insert({
        empresa_id,
        usuario_id: requesterId,
        question,
        plan: {},
        error: String((lastErr as any)?.message ?? lastErr ?? "sin respuesta"),
      });
      return json({ error: "La IA no pudo responder", detail: String((lastErr as any)?.message ?? lastErr) }, 502);
    }

    const validation = validatePlan(rawPlan);
    if (!validation.ok) {
      await supabase.from("ai_analytics_query_log").insert({
        empresa_id,
        usuario_id: requesterId,
        question,
        plan: rawPlan ?? {},
        error: validation.error,
      });
      return json({ error: "Plan inválido", detail: validation.error }, 422);
    }
    const plan = validation.plan;

    // Ejecutar la métrica
    const { data: result, error: rpcError } = await supabase.rpc("run_analytics_query", {
      p_empresa_id: empresa_id,
      p_plan: plan,
    });

    if (rpcError) {
      await supabase.from("ai_analytics_query_log").insert({
        empresa_id,
        usuario_id: requesterId,
        question,
        plan,
        error: rpcError.message,
      });
      return json({ error: "Error al ejecutar la consulta", detail: rpcError.message }, 500);
    }

    const latencyMs = Date.now() - t0;

    // Log no bloqueante
    supabase
      .from("ai_analytics_query_log")
      .insert({
        empresa_id,
        usuario_id: requesterId,
        question,
        plan,
        result_meta: { latency_ms: latencyMs, model: cfg.ai_model },
      })
      .then(() => {})
      .catch(() => {});

    return json({
      plan,
      data: result,
      label: plan.label,
    });
  } catch (err: any) {
    console.error("[ai-analytics-query] unhandled:", err);
    return new Response(JSON.stringify({ error: "Internal error", detail: err?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
