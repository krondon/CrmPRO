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

// ─── Predefined lead fields ───────────────────────────────────────────────────
// Mirror of src/lib/predefinedFields.ts. Inlined here because Supabase Edge
// Functions only bundle index.ts — sibling files are not picked up.
// IMPORTANT: keep this list in sync with src/lib/predefinedFields.ts.

type PredefinedFieldType = "text" | "number" | "select";

interface PredefinedField {
  key: string;
  label: string;
  tipo: PredefinedFieldType;
  opciones?: string[];
  descripcionDefault: string;
}

const PREDEFINED_FIELDS: PredefinedField[] = [
  {
    key: "nombre_completo",
    label: "Nombre completo",
    tipo: "text",
    descripcionDefault:
      "Nombre completo del cliente. Actualízalo solo si el cliente se identifica explícitamente con un nombre distinto al actual.",
  },
  {
    key: "telefono",
    label: "Teléfono",
    tipo: "text",
    descripcionDefault:
      "Teléfono de contacto del cliente. Actualízalo solo si el cliente proporciona un número diferente al registrado.",
  },
  {
    key: "correo_electronico",
    label: "Correo electrónico",
    tipo: "text",
    descripcionDefault:
      "Correo electrónico del cliente. Guárdalo cuando el cliente lo comparta por primera vez o pida usarlo como contacto principal.",
  },
  {
    key: "empresa",
    label: "Empresa",
    tipo: "text",
    descripcionDefault:
      "Nombre de la empresa para la que trabaja el cliente. Actualízalo si menciona claramente su lugar de trabajo.",
  },
  {
    key: "ubicacion",
    label: "Ubicación",
    tipo: "text",
    descripcionDefault:
      "Ciudad, zona o dirección del cliente. Actualízalo cuando mencione dónde se encuentra o dónde necesita el servicio.",
  },
  {
    key: "evento",
    label: "Evento",
    tipo: "text",
    descripcionDefault:
      "Tipo o nombre del evento que el cliente está organizando (boda, cumpleaños, corporativo, etc.). Llénalo cuando el cliente lo describa.",
  },
  {
    key: "membresia",
    label: "Membresía",
    tipo: "text",
    descripcionDefault:
      "Tipo de membresía o plan que tiene o desea contratar el cliente. Actualízalo si menciona un plan específico.",
  },
  {
    key: "presupuesto",
    label: "Presupuesto",
    tipo: "number",
    descripcionDefault:
      "Monto del presupuesto del cliente en USD. Actualízalo solo cuando el cliente confirme una cifra concreta, no estimaciones.",
  },
  {
    key: "prioridad",
    label: "Prioridad",
    tipo: "select",
    opciones: ["low", "medium", "high"],
    descripcionDefault:
      'Prioridad del lead. Súbela a "high" si el cliente muestra urgencia o intención clara de compra, "low" si es exploratorio.',
  },
];

function getPredefinedField(key: string): PredefinedField | undefined {
  return PREDEFINED_FIELDS.find((f) => f.key === key);
}

// ─── Tool schema — multi-action array ─────────────────────────────────────────

const ACTION_ITEM_SCHEMA = {
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: ["move_stage", "add_tag", "remove_tag", "notify_team", "set_field"],
      description: "Tipo de acción a ejecutar.",
    },
    stage_short_id: {
      type: "number",
      description: "Short ID numérico de la etapa destino. Solo para move_stage.",
    },
    tag_name: {
      type: "string",
      description: "Nombre exacto de la etiqueta a agregar o quitar. Para add_tag y remove_tag.",
    },
    message: {
      type: "string",
      description: "Mensaje descriptivo para el equipo. Solo para notify_team.",
    },
    field_key: {
      type: "string",
      description: "Clave exacta del campo a actualizar. Solo para set_field. Debe coincidir con uno de los field_key listados en el contexto.",
    },
    value: {
      type: "string",
      description: "Valor a escribir en el campo. Solo para set_field. Para campos numéricos, envía el número como string (ej '5000'). Para campos de selección, usa exactamente una de las opciones permitidas.",
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

function formatFieldValue(value: any): string {
  if (value === null || value === undefined || value === "") return "(vacío)";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

interface CustomFieldDef {
  clave: string;
  nombre: string;
  tipo: "text" | "number" | "select";
  opciones: string[] | null;
  descripcion: string | null;
}

/**
 * Construye el bloque de contexto de campos que se inyecta al system prompt.
 * Incluye los campos predefinidos (con su descripción efectiva) y los custom fields,
 * junto con el valor actual de cada uno y guía para la acción set_field.
 */
function buildFieldsContext(
  lead: any,
  customFields: CustomFieldDef[],
  overrideMap: Record<string, string>,
): string {
  const predefinedLines = PREDEFINED_FIELDS.map((f) => {
    const desc = overrideMap[f.key] ?? f.descripcionDefault;
    const opciones = f.opciones?.length ? ` (opciones permitidas: ${f.opciones.join(", ")})` : "";
    const valor = formatFieldValue(lead[f.key]);
    return `- field_key: "${f.key}" | tipo: ${f.tipo}${opciones} | valor actual: ${valor} | descripción: ${desc}`;
  }).join("\n");

  const customLines = customFields.length
    ? customFields
        .map((f) => {
          const opciones = f.opciones && Array.isArray(f.opciones) && f.opciones.length
            ? ` (opciones permitidas: ${f.opciones.join(", ")})`
            : "";
          const valor = formatFieldValue(lead.custom_fields?.[f.clave]);
          const desc = f.descripcion?.trim()
            ? f.descripcion.trim()
            : "(sin descripción — NO escribir este campo automáticamente)";
          return `- field_key: "${f.clave}" | tipo: ${f.tipo}${opciones} | valor actual: ${valor} | descripción: ${desc}`;
        })
        .join("\n")
    : "(no hay campos personalizados)";

  return (
    `\n\n──── CAMPOS DEL LEAD ────\n` +
    `Usa la acción "set_field" cuando el cliente proporcione información clara y explícita que corresponda a uno de los campos listados. ` +
    `No inventes valores ni completes campos con información ambigua. ` +
    `Solo escribe un campo si su descripción te lo indica y el valor actual es distinto al nuevo.\n\n` +
    `Campos del sistema:\n${predefinedLines}\n\n` +
    `Campos personalizados:\n${customLines}`
  );
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

  // 1. Active config for this company
  const { data: configs, error: configError } = await supabase
    .from("ai_automation_config")
    .select("id, is_active, sandbox_prompt, ai_api_key, ai_model")
    .eq("empresa_id", empresa_id)
    .eq("is_active", true);

  if (configError) throw configError;
  if (!configs?.length) return { skipped: "no_active_configs", actions_taken: 0 };

  const cfg = configs.find((c: any) => c.sandbox_prompt && c.ai_api_key && c.ai_model);
  if (!cfg) return { skipped: "no_valid_config", actions_taken: 0 };

  // 4. Get lead data — incluye todos los campos predefinidos + custom_fields
  //    para que la IA pueda ver el valor actual de cada campo.
  const { data: lead } = await supabase
    .from("lead")
    .select(
      "id, etapa_id, pipeline_id, tags, archived, " +
      "nombre_completo, telefono, correo_electronico, empresa, ubicacion, evento, membresia, presupuesto, prioridad, " +
      "custom_fields"
    )
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

  // 4c. Cargar definiciones de campos custom + overrides de descripciones predefinidas
  const [{ data: customFieldDefs }, { data: predefinedOverrides }] = await Promise.all([
    supabase
      .from("empresa_custom_fields")
      .select("clave, nombre, tipo, opciones, descripcion")
      .eq("empresa_id", empresa_id),
    supabase
      .from("empresa_predefined_field_descriptions")
      .select("field_key, descripcion")
      .eq("empresa_id", empresa_id),
  ]);

  const overrideMap: Record<string, string> = {};
  for (const row of (predefinedOverrides ?? []) as Array<{ field_key: string; descripcion: string }>) {
    overrideMap[row.field_key] = row.descripcion;
  }

  const fieldsContext = buildFieldsContext(lead, customFieldDefs ?? [], overrideMap);

  // 5. Call AI (with 1 retry on transient failures like 504)
  let aiResult: { actions: any[] } = { actions: [] };
  let lastAiErr: any;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      aiResult = await callAI(
        cfg.ai_api_key,
        cfg.ai_model,
        cfg.sandbox_prompt + tagsContext + fieldsContext,
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
          // Registrar en lead_historial
          await supabase.from("lead_historial").insert({
            lead_id,
            usuario_id: "00000000-0000-0000-0000-000000000000",
            accion: "automatizacion_ia",
            detalle: `IA agregó etiqueta "${tag.name}"`,
            metadata: {
              action: "add_tag",
              tag_name: tag.name,
              actor_nombre: "IA (Automatización)",
            },
          });
        } else {
          console.warn(`[ai-intent-detector] ⚠️ Tag "${tagName}" no encontrada en saved_tags`);
          actionsTaken.push({ action: "add_tag", tag_name: tagName, warning: "tag_not_found" });
        }
      }

      // ── remove_tag ──────────────────────────────────────────────────────────
      if (item.type === "remove_tag" && item.tag_name?.trim()) {
        const tagName = item.tag_name.trim();
        const currentTags: any[] = Array.isArray(lead.tags) ? lead.tags : [];
        const filtered = currentTags.filter(
          (t: any) => t.name?.toLowerCase() !== tagName.toLowerCase()
        );
        if (filtered.length < currentTags.length) {
          await supabase.from("lead").update({ tags: filtered }).eq("id", lead_id);
          lead.tags = filtered;
          actionsTaken.push({ action: "remove_tag", tag_name: tagName });
          console.log(`[ai-intent-detector] ✅ remove_tag → "${tagName}"`);
          // Registrar en lead_historial
          await supabase.from("lead_historial").insert({
            lead_id,
            usuario_id: "00000000-0000-0000-0000-000000000000",
            accion: "automatizacion_ia",
            detalle: `IA removió etiqueta "${tagName}"`,
            metadata: {
              action: "remove_tag",
              tag_name: tagName,
              actor_nombre: "IA (Automatización)",
            },
          });
        } else {
          console.log(`[ai-intent-detector] ℹ️ remove_tag → "${tagName}" no estaba en el lead`);
        }
      }

      // ── set_field ───────────────────────────────────────────────────────────
      if (item.type === "set_field" && item.field_key) {
        const key: string = item.field_key;
        const rawValue = item.value;

        const predef = getPredefinedField(key);
        const custom = (customFieldDefs ?? []).find((f: any) => f.clave === key) as CustomFieldDef | undefined;

        if (!predef && !custom) {
          console.warn(`[ai-intent-detector] ⚠️ set_field: field_key "${key}" no encontrado`);
          actionsTaken.push({ action: "set_field", field_key: key, warning: "field_not_found" });
          continue;
        }

        const tipo = predef ? predef.tipo : custom!.tipo;
        const opciones = predef?.opciones ?? (Array.isArray(custom?.opciones) ? custom!.opciones : null);

        // Validar / parsear valor según tipo
        let parsedValue: any;
        if (rawValue === null || rawValue === undefined) {
          actionsTaken.push({ action: "set_field", field_key: key, warning: "empty_value" });
          continue;
        }

        if (tipo === "number") {
          const n = parseFloat(String(rawValue).replace(/[^\d.\-]/g, ""));
          if (Number.isNaN(n)) {
            console.warn(`[ai-intent-detector] ⚠️ set_field "${key}" valor no numérico:`, rawValue);
            actionsTaken.push({ action: "set_field", field_key: key, warning: "invalid_number" });
            continue;
          }
          parsedValue = n;
        } else if (tipo === "select") {
          const strVal = String(rawValue).trim();
          const match = (opciones ?? []).find(
            (o) => o.toLowerCase() === strVal.toLowerCase(),
          );
          if (!match) {
            console.warn(`[ai-intent-detector] ⚠️ set_field "${key}" opción inválida:`, strVal, "permitidas:", opciones);
            actionsTaken.push({ action: "set_field", field_key: key, warning: "invalid_option" });
            continue;
          }
          parsedValue = match;
        } else {
          parsedValue = String(rawValue).trim();
          if (!parsedValue) {
            actionsTaken.push({ action: "set_field", field_key: key, warning: "empty_value" });
            continue;
          }
        }

        // No hacer update si el valor no cambió
        const currentValue = predef ? lead[key] : lead.custom_fields?.[key];
        if (currentValue === parsedValue) {
          console.log(`[ai-intent-detector] ℹ️ set_field "${key}" sin cambios (valor actual = nuevo)`);
          continue;
        }

        // Aplicar update
        if (predef) {
          await supabase.from("lead").update({ [key]: parsedValue }).eq("id", lead_id);
          lead[key] = parsedValue;
        } else {
          const updatedJsonb = { ...(lead.custom_fields ?? {}), [key]: parsedValue };
          await supabase.from("lead").update({ custom_fields: updatedJsonb }).eq("id", lead_id);
          lead.custom_fields = updatedJsonb;
        }

        const fieldLabel = predef ? predef.label : custom!.nombre;
        await supabase.from("lead_historial").insert({
          lead_id,
          usuario_id: "00000000-0000-0000-0000-000000000000",
          accion: "automatizacion_ia",
          detalle: `IA actualizó "${fieldLabel}" → ${parsedValue}`,
          metadata: {
            action: "set_field",
            field_key: key,
            field_kind: predef ? "predefined" : "custom",
            previous_value: currentValue ?? null,
            new_value: parsedValue,
            actor_nombre: "IA (Automatización)",
          },
        });

        actionsTaken.push({ action: "set_field", field_key: key, field_label: fieldLabel, value: parsedValue });
        console.log(`[ai-intent-detector] ✅ set_field "${key}" → ${parsedValue}`);
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

  // 7. Registrar en actividad_crm (historial general del admin) cada acción de IA
  for (const taken of actionsTaken) {
    if (taken.warning) continue; // Saltar acciones fallidas
    const detalleMap: Record<string, string> = {
      move_stage: `IA movió la oportunidad a etapa #${taken.target_stage_id?.slice(0, 8) || '?'}`,
      add_tag: `IA agregó etiqueta "${taken.tag_name}"`,
      remove_tag: `IA removió etiqueta "${taken.tag_name}"`,
      set_field: `IA actualizó campo "${taken.field_label || taken.field_key}" → ${taken.value}`,
      notify_team: `IA notificó al equipo: ${taken.message || ''}`,
    };
    try {
      await supabase.from("actividad_crm").insert({
        empresa_id,
        usuario_id: null,
        usuario_nombre: "IA (Automatización)",
        categoria: "leads",
        accion: `ia_${taken.action}`,
        detalle: detalleMap[taken.action] || `IA ejecutó acción: ${taken.action}`,
        entidad_tipo: "lead",
        entidad_id: lead_id,
        entidad_nombre: lead.nombre_completo || null,
        metadata: { ai_action: true, ...taken },
      });
    } catch (actErr: any) {
      console.warn(`[ai-intent-detector] actividad_crm log error:`, actErr.message);
    }
  }

  // 8. Audit log
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
