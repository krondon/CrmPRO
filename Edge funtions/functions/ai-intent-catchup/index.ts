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

// How far back to scan for unprocessed messages (matches cron interval with buffer)
const LOOKBACK_MINUTES = 35;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const lookback = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000).toISOString();

  // 1. Recent inbound messages with their lead's empresa_id
  const { data: messages, error: msgErr } = await supabase
    .from("mensajes")
    .select("id, lead_id, content, lead:lead_id(empresa_id, archived)")
    .eq("sender", "lead")
    .gte("created_at", lookback)
    .order("created_at", { ascending: true })
    .limit(200);

  if (msgErr) {
    console.error("[ai-intent-catchup] Error fetching messages:", msgErr.message);
    return new Response(JSON.stringify({ error: msgErr.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  if (!messages?.length) {
    return new Response(
      JSON.stringify({ processed: 0, skipped: "no_recent_messages" }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  // 2. Already-processed message IDs in the same window (dedup by message_id)
  const { data: logged } = await supabase
    .from("ai_intent_log")
    .select("message_id")
    .gte("created_at", lookback)
    .not("message_id", "is", null);

  const processedIds = new Set((logged ?? []).map((r: any) => r.message_id as string));

  // 3. Filter to unprocessed messages belonging to active, non-archived leads
  const pending = (messages as any[]).filter((m) => {
    if (processedIds.has(m.id)) return false;
    const lead = Array.isArray(m.lead) ? m.lead[0] : m.lead;
    return lead?.empresa_id && !lead.archived;
  });

  if (!pending.length) {
    return new Response(
      JSON.stringify({ processed: 0, skipped: "all_already_processed" }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  console.log(`[ai-intent-catchup] ${pending.length} unprocessed messages — invoking detector...`);

  // 4. Invoke ai-intent-detector for each pending message sequentially to avoid rate limits
  let successCount = 0;
  let failCount = 0;

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
        console.warn(`[ai-intent-catchup] Invoke failed for msg ${msg.id}:`, invokeErr.message);
        failCount++;
      } else {
        successCount++;
      }
    } catch (e: any) {
      console.error(`[ai-intent-catchup] Exception for msg ${msg.id}:`, e.message);
      failCount++;
    }
  }

  return new Response(
    JSON.stringify({ processed: successCount, failed: failCount, total_pending: pending.length }),
    { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
});
