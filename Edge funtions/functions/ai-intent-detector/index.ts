import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// @ts-ignore
declare const Deno: any;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Tool schema — multi-action array ─────────────────────────────────────────

const ACTION_ITEM_SCHEMA = {
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: ["move_stage", "add_tag", "notify_team"],
      description: "Tipo de acción a ejecutar.",
    },
    stage_short_id: {
      type: "number",
      description: "Short ID numérico de la etapa destino. Solo para move_stage.",
    },
    tag_name: {
      type: "string",
      description: "Nombre exacto de la etiqueta a agregar. Solo para add_tag.",
    },
    message: {
      type: "string",
      description: "Mensaje descriptivo para el equipo. Solo para notify_team.",
    },
  },
  required: ["type"],
};

const CRM_TOOL_ANTHROPIC = {
  name: "crm_action",
  description:
    "Ejecuta una o más acciones en el CRM según la intención detectada en el mensaje del cliente. Si no hay ninguna acción clara, devuelve un array vacío.",
  input_schema: {
    type: "object",
    properties: {
      actions: {
        type: "array",
        description:
          "Lista de acciones a ejecutar. Puede ser vacía si el mensaje no requiere ninguna acción.",
        items: ACTION_ITEM_SCHEMA,
      },
    },
    required: ["actions"],
  },
};

const CRM_TOOL_OPENAI = {
  type: "function",
  function: {
    name: "crm_action",
    description: CRM_TOOL_ANTHROPIC.description,
    parameters: CRM_TOOL_ANTHROPIC.input_schema,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isWithinActivationWindow(cfg: any): boolean {
  const now = new Date();
  const timeStr = now.toTimeString().slice(0, 5); // HH:MM
  if (cfg.activation_time_start && timeStr < cfg.activation_time_start) return false;
  if (cfg.activation_time_end && timeStr > cfg.activation_time_end) return false;
  return true;
}

async function callAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string
): Promise<{ actions: any[] }> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 20_000);

  try {
    // ── Anthropic (direct) ──────────────────────────────────────────────────
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
          tools: [CRM_TOOL_ANTHROPIC],
          tool_choice: { type: "any" },
          messages: [{ role: "user", content: userMessage }],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const toolUse = data.content?.find((c: any) => c.type === "tool_use");
      return toolUse?.input ?? { actions: [] };
    }

    // ── OpenRouter (sk-or-...) or OpenAI-compatible ─────────────────────────
    const baseUrl = apiKey.startsWith("sk-or-")
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";

    const res = await fetch(baseUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        tools: [CRM_TOOL_OPENAI],
        tool_choice: { type: "function", function: { name: "crm_action" } },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });
    if (!res.ok) throw new Error(`AI API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    return args ? JSON.parse(args) : { actions: [] };
  } finally {
    clearTimeout(tid);
  }
}

// ─── Core processor ───────────────────────────────────────────────────────────

export async function processMessage(params: {
  lead_id: string;
  message_id: string | null;
  content: string;
  empresa_id: string;
  supabase: any;
}): Promise<{ skipped?: string; actions?: any[]; actions_taken: number }> {
  const { lead_id, message_id, content, empresa_id, supabase } = params;

  // 1. Active configs for this company
  const { data: configs, error: configError } = await supabase
    .from("ai_automation_config")
    .select(
      "id, is_active, activation_time_start, activation_time_end, message_limit, sandbox_prompt, ai_api_key, ai_model"
    )
    .eq("empresa_id", empresa_id)
    .eq("is_active", true);

  if (configError) throw configError;
  if (!configs?.length) return { skipped: "no_active_configs", actions_taken: 0 };

  // 2. Filter by time window
  const windowConfigs = configs.filter(isWithinActivationWindow);
  if (!windowConfigs.length) return { skipped: "outside_activation_window", actions_taken: 0 };

  // 3. Check daily message limit
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const eligibleConfigs: any[] = [];
  for (const cfg of windowConfigs) {
    if (!cfg.sandbox_prompt || !cfg.ai_api_key) continue;

    if (cfg.message_limit) {
      const { count } = await supabase
        .from("ai_intent_log")
        .select("*", { count: "exact", head: true })
        .eq("empresa_id", empresa_id)
        .gte("created_at", startOfDay.toISOString());

      if ((count ?? 0) >= cfg.message_limit) {
        console.log(`[ai-intent-detector] Daily limit reached (${count}/${cfg.message_limit})`);
        continue;
      }
    }
    eligibleConfigs.push(cfg);
  }

  if (!eligibleConfigs.length) return { skipped: "limit_or_no_config", actions_taken: 0 };

  const cfg = eligibleConfigs[0];

  // 4. Get lead data (tags is JSONB array of {id, name, color})
  const { data: lead } = await supabase
    .from("lead")
    .select("id, etapa_id, pipeline_id, tags, archived")
    .eq("id", lead_id)
    .maybeSingle();

  if (!lead || lead.archived) return { skipped: "lead_not_found_or_archived", actions_taken: 0 };

  // 4b. Fetch available tags so the AI uses exact names
  const { data: availableTags } = await supabase
    .from("saved_tags")
    .select("name")
    .eq("empresa_id", empresa_id);

  const tagsContext = availableTags?.length
    ? `\n\nEtiquetas disponibles (usa estos nombres EXACTOS al llamar add_tag): ${availableTags.map((t: any) => `"${t.name}"`).join(", ")}`
    : "";

  // 5. Call AI (with 1 retry on transient failures like 504)
  let aiResult: { actions: any[] } = { actions: [] };
  let lastAiErr: any;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      aiResult = await callAI(
        cfg.ai_api_key,
        cfg.ai_model,
        cfg.sandbox_prompt + tagsContext,
        `Mensaje del cliente: "${content}"`
      );
      lastAiErr = null;
      break;
    } catch (aiErr: any) {
      lastAiErr = aiErr;
      console.error(`[ai-intent-detector] AI call error (attempt ${attempt + 1}):`, aiErr.message);
      if (attempt < 1) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  if (lastAiErr) throw lastAiErr;

  const actions: any[] = aiResult.actions ?? [];
  console.log(`[ai-intent-detector] Lead ${lead_id} → actions:`, JSON.stringify(actions));

  const actionsTaken: any[] = [];

  // 6. Execute each action
  for (const item of actions) {
    try {
      // ── move_stage ──────────────────────────────────────────────────────────
      if (item.type === "move_stage" && item.stage_short_id) {
        const { data: stageRow } = await supabase
          .from("etapas")
          .select("id")
          .eq("short_id", item.stage_short_id)
          .maybeSingle();

        const targetStageId = stageRow?.id ?? null;
        if (targetStageId && lead.etapa_id !== targetStageId) {
          await supabase.from("lead").update({ etapa_id: targetStageId }).eq("id", lead_id);
          await supabase.from("lead_historial").insert({
            lead_id,
            usuario_id: "00000000-0000-0000-0000-000000000000",
            accion: "automatizacion_ia",
            detalle: `IA detectó intención → movido a etapa #${item.stage_short_id}`,
            metadata: {
              action: "move_stage",
              stage_short_id: item.stage_short_id,
              from_stage_id: lead.etapa_id,
              to_stage_id: targetStageId,
              actor_nombre: "IA (Automatización)",
            },
          });
          actionsTaken.push({ action: "move_stage", target_stage_id: targetStageId });
          console.log(`[ai-intent-detector] ✅ move_stage → etapa #${item.stage_short_id}`);
        }
      }

      // ── add_tag ─────────────────────────────────────────────────────────────
      if (item.type === "add_tag" && item.tag_name?.trim()) {
        const tagName = item.tag_name.trim();

        // Try exact match first, then partial match as fallback
        let { data: tag } = await supabase
          .from("saved_tags")
          .select("id, name, color")
          .eq("empresa_id", empresa_id)
          .ilike("name", tagName)
          .maybeSingle();

        if (!tag) {
          const { data: partialTags } = await supabase
            .from("saved_tags")
            .select("id, name, color")
            .eq("empresa_id", empresa_id)
            .ilike("name", `%${tagName}%`)
            .limit(1);
          tag = partialTags?.[0] ?? null;
          if (tag) console.log(`[ai-intent-detector] 🔍 Tag "${tagName}" encontrada por coincidencia parcial → "${tag.name}"`);
        }

        if (tag) {
          const currentTags: any[] = Array.isArray(lead.tags) ? lead.tags : [];
          if (!currentTags.some((t: any) => t.id === tag.id)) {
            await supabase
              .from("lead")
              .update({ tags: [...currentTags, { id: tag.id, name: tag.name, color: tag.color }] })
              .eq("id", lead_id);
            // Update local copy so subsequent actions see current state
            lead.tags = [...currentTags, { id: tag.id, name: tag.name, color: tag.color }];
          }
          actionsTaken.push({ action: "add_tag", tag_name: tagName });
          console.log(`[ai-intent-detector] ✅ add_tag → "${tagName}"`);
        } else {
          console.warn(`[ai-intent-detector] ⚠️ Tag "${tagName}" no encontrada en saved_tags`);
          actionsTaken.push({ action: "add_tag", tag_name: tagName, warning: "tag_not_found" });
        }
      }

      // ── notify_team ─────────────────────────────────────────────────────────
      if (item.type === "notify_team") {
        const { data: empresa } = await supabase
          .from("empresa")
          .select("usuario_id")
          .eq("id", empresa_id)
          .single();

        if (empresa?.usuario_id) {
          await supabase.from("notificaciones").insert({
            empresa_id,
            usuario_id: empresa.usuario_id,
            tipo: "ia_intencion",
            titulo: `🤖 IA: atención requerida`,
            mensaje: item.message || "La IA detectó una situación que requiere atención del equipo",
            lead_id,
            leida: false,
          });
        }
        actionsTaken.push({ action: "notify_team", message: item.message });
        console.log(`[ai-intent-detector] ✅ notify_team → "${item.message}"`);
      }
    } catch (actionErr: any) {
      console.error(`[ai-intent-detector] Error ejecutando acción ${item.type}:`, actionErr.message);
    }
  }

  // 7. Audit log
  await supabase
    .from("ai_intent_log")
    .insert({
      empresa_id,
      lead_id,
      message_id: message_id ?? null,
      detected_intent: actions.map((a: any) => a.type).join("+") || "none",
      actions_taken: actionsTaken,
      raw_message: content.slice(0, 500),
    })
    .then(({ error: e }: any) => {
      if (e) console.warn("[ai-intent-detector] Log error:", e);
    });

  return { actions, actions_taken: actionsTaken.length };
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();
    const { lead_id, message_id, content, empresa_id } = body;

    if (!lead_id || !content || !empresa_id) {
      return new Response(
        JSON.stringify({ error: "Missing: lead_id, content, empresa_id" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const result = await processMessage({
      lead_id,
      message_id: message_id ?? null,
      content,
      empresa_id,
      supabase,
    });

    return new Response(JSON.stringify(result), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[ai-intent-detector] Unhandled error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
