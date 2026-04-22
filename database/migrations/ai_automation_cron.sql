-- ============================================================
-- AI Automation: cron catchup + message_id dedup column
-- ============================================================

-- 1. Add message_id to ai_intent_log so the catchup function
--    can avoid re-processing messages already handled.
alter table ai_intent_log
  add column if not exists message_id uuid references mensajes(id) on delete set null;

create index if not exists idx_ai_intent_log_message_id
  on ai_intent_log (message_id)
  where message_id is not null;

-- ============================================================
-- 2. Enable pg_cron and pg_net (Supabase Dashboard →
--    Database → Extensions → enable both if not already on)
-- ============================================================
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- ============================================================
-- 3. Schedule the catchup to run every 5 minutes.
--
--    BEFORE running this block, replace the two placeholders:
--      <YOUR_PROJECT_URL>      → e.g. https://abcxyz.supabase.co
--      <YOUR_SERVICE_ROLE_KEY> → from Settings → API → service_role
-- ============================================================
select cron.schedule(
  'ai-intent-catchup',          -- job name (must be unique)
  '*/5 * * * *',                -- every 5 minutes
  $$
  select
    net.http_post(
      url     := '<YOUR_PROJECT_URL>/functions/v1/ai-intent-catchup',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer <YOUR_SERVICE_ROLE_KEY>'
      ),
      body    := '{}'::jsonb
    ) as request_id;
  $$
);

-- To verify the job was created:
--   select * from cron.job;
--
-- To remove it later:
--   select cron.unschedule('ai-intent-catchup');
