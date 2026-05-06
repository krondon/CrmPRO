import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// @ts-ignore
declare const Deno: any;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Parsea un string de ventana de tiempo como "8h", "30m", "1s", "1h 30m"
 * y devuelve la duración en milisegundos. Por defecto: 24h.
 */
function parseTimeWindowMs(window: string | null): number {
  if (!window?.trim()) return 24 * 3600_000;
  let totalMs = 0;
  const tokens = window.trim().split(/\s+/);
  for (const token of tokens) {
    const match = token.match(/^(\d+(?:\.\d+)?)(h|m|s)$/i);
    if (!match) continue;
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === "h") totalMs += value * 3_600_000;
    else if (unit === "m") totalMs += value * 60_000;
    else if (unit === "s") totalMs += value * 1_000;
  }
  return totalMs > 0 ? totalMs : 24 * 3_600_000;
}

/**
 * Verifica si ya pasó el intervalo configurado desde la última ejecución.
 * Si nunca se ejecutó (last_execution_at es null), retorna true.
 */
function shouldExecute(cfg: any): boolean {
  if (!cfg.last_execution_at) return true;
  const intervalMs = (cfg.execution_interval_hours ?? 1) * 3_600_000;
  const lastRun = new Date(cfg.last_execution_at).getTime();
  return Date.now() - lastRun >= intervalMs;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Obtener todas las configuraciones activas
  const { data: configs, error: configErr } = await supabase
    .from("ai_automation_config")
    .select(
      "id, empresa_id, background_time_window, background_message_limit, execution_interval_hours, last_execution_at, sandbox_prompt, ai_api_key, ai_model"
    )
    .eq("is_active", true);

  if (configErr) {
    console.error("[ai-intent-catchup] Error fetching configs:", configErr.message);
    return new Response(JSON.stringify({ error: configErr.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  if (!configs?.length) {
    return new Response(
      JSON.stringify({ processed: 0, skipped: "no_active_configs" }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  let totalProcessed = 0;
  let totalFailed = 0;

  for (const cfg of configs) {
    // 2. Verificar si es el turno de esta config según el intervalo configurado
    if (!shouldExecute(cfg)) {
      console.log(`[ai-intent-catchup] Config ${cfg.id} — intervalo no alcanzado, saltando`);
      continue;
    }

    // Saltar configs sin campos requeridos
    if (!cfg.sandbox_prompt || !cfg.ai_api_key || !cfg.ai_model) {
      console.log(`[ai-intent-catchup] Config ${cfg.id} — faltan campos requeridos, saltando`);
      continue;
    }

    const windowMs = parseTimeWindowMs(cfg.background_time_window);
    const lookback = new Date(Date.now() - windowMs).toISOString();
    const messageLimit = cfg.background_message_limit ?? 20;

    // 3. Obtener mensajes dentro de la ventana de tiempo para leads de esta empresa
    //    Traemos más de los necesarios para compensar la deduplicación posterior
    const { data: messages } = await supabase
      .from("mensajes")
      .select("id, lead_id, content, lead:lead_id(empresa_id, archived)")
      .eq("sender", "lead")
      .gte("created_at", lookback)
      .order("created_at", { ascending: true })
      .limit(messageLimit * 5);

    if (!messages?.length) {
      // Aunque no haya mensajes, actualizamos last_execution_at para reiniciar el intervalo
      await supabase
        .from("ai_automation_config")
        .update({ last_execution_at: new Date().toISOString() })
        .eq("id", cfg.id);
      console.log(`[ai-intent-catchup] Config ${cfg.id} — sin mensajes en la ventana`);
      continue;
    }

    // 4. Filtrar solo los mensajes de leads activos de esta empresa
    const empresaMessages = (messages as any[]).filter((m) => {
      const lead = Array.isArray(m.lead) ? m.lead[0] : m.lead;
      return lead?.empresa_id === cfg.empresa_id && !lead.archived;
    });

    if (!empresaMessages.length) {
      await supabase
        .from("ai_automation_config")
        .update({ last_execution_at: new Date().toISOString() })
        .eq("id", cfg.id);
      continue;
    }

    // 5. Obtener IDs de mensajes ya procesados para esta empresa (deduplicación)
    const messageIds = empresaMessages.map((m: any) => m.id);
    const { data: logged } = await supabase
      .from("ai_intent_log")
      .select("message_id")
      .eq("empresa_id", cfg.empresa_id)
      .in("message_id", messageIds);

    const processedIds = new Set((logged ?? []).map((r: any) => r.message_id as string));

    // 6. Filtrar no procesados y tomar hasta el límite configurado
    const pending = empresaMessages
      .filter((m: any) => !processedIds.has(m.id))
      .slice(0, messageLimit);

    console.log(
      `[ai-intent-catchup] Config ${cfg.id} (empresa ${cfg.empresa_id}): ${pending.length} mensajes a procesar`
    );

    // 7. Invocar ai-intent-detector por cada mensaje pendiente
    for (const msg of pending) {
      const lead = Array.isArray(msg.lead) ? msg.lead[0] : msg.lead;
      try {
        const { error: invokeErr } = await supabase.functions.invoke("ai-intent-detector", {
          body: {
            lead_id: msg.lead_id,
            message_id: msg.id,
            content: msg.content,
            empresa_id: lead.empresa_id,
          },
        });
        if (invokeErr) {
          console.warn(`[ai-intent-catchup] Invoke fallido para msg ${msg.id}:`, invokeErr.message);
          totalFailed++;
        } else {
          totalProcessed++;
        }
      } catch (e: any) {
        console.error(`[ai-intent-catchup] Excepción para msg ${msg.id}:`, e.message);
        totalFailed++;
      }
    }

    // 8. Actualizar last_execution_at para reiniciar el intervalo
    await supabase
      .from("ai_automation_config")
      .update({ last_execution_at: new Date().toISOString() })
      .eq("id", cfg.id);
  }

  return new Response(
    JSON.stringify({ processed: totalProcessed, failed: totalFailed }),
    { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
});
