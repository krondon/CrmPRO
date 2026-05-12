import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const HUBMY_API_KEY = Deno.env.get('HUBMY_API_KEY')!
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const HUBMY_BASE    = 'https://apidev.hubmy.app'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function hubmyPost(path: string, body: unknown) {
  return fetch(`${HUBMY_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${HUBMY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const payload = await req.json()

    // DB Webhook format: { type, table, record, old_record, schema }
    const record = payload.record ?? payload
    const { lead_id, sender, content } = record

    // Only notify on incoming messages from the lead (not from agents)
    if (sender === 'agent' || !lead_id) {
      return new Response('skipped', { headers: corsHeaders })
    }

    const db = createClient(SUPABASE_URL, SERVICE_ROLE)

    // 1. Get lead info
    const { data: lead } = await db
      .from('lead')
      .select('empresa_id, nombre_completo, asignado_a')
      .eq('id', lead_id)
      .maybeSingle()

    if (!lead?.empresa_id) {
      return new Response('lead not found', { headers: corsHeaders })
    }

    // 2. Get empresa owner
    const { data: empresa } = await db
      .from('empresa')
      .select('usuario_id, nombre')
      .eq('id', lead.empresa_id)
      .maybeSingle()

    // 3. Collect all user IDs to notify (owner + all members)
    const { data: members } = await db
      .from('empresa_miembros')
      .select('usuario_id')
      .eq('empresa_id', lead.empresa_id)

    const userIds = new Set<string>()
    if (empresa?.usuario_id) userIds.add(empresa.usuario_id)
    for (const m of members ?? []) {
      if (m.usuario_id) userIds.add(m.usuario_id)
    }

    if (userIds.size === 0) {
      return new Response('no users', { headers: corsHeaders })
    }

    // 4. Find Hubmy-linked users
    const { data: linked } = await db
      .from('hubmy_linked_users')
      .select('hubmy_user_id, supabase_user_id')
      .in('supabase_user_id', [...userIds])

    if (!linked || linked.length === 0) {
      return new Response('no hubmy users', { headers: corsHeaders })
    }

    const leadName  = lead.nombre_completo || 'Un lead'
    const empresaNombre = empresa?.nombre || 'tu empresa'
    const msgPreview = content ? content.slice(0, 100) : 'Nuevo mensaje'

    // 5. Fire push + realtime for each Hubmy user
    await Promise.allSettled(
      linked.map(async ({ hubmy_user_id }) => {
        // Push notification (works even if offline)
        await hubmyPost('/v1/api/notifications', {
          target_type: 'user',
          target: hubmy_user_id,
          title: `💬 Nuevo mensaje — ${leadName}`,
          body: msgPreview,
          action_url: 'https://crmpro-three.vercel.app/chats',
        })

        // Realtime: haptic feedback (only if user has app open)
        await hubmyPost('/v1/api/realtime/send', {
          user_id: hubmy_user_id,
          action: 'haptic',
          params: { style: 'medium' },
        })

        // Realtime: notification sound
        await hubmyPost('/v1/api/realtime/send', {
          user_id: hubmy_user_id,
          action: 'play_sound',
          params: { preset: 'notification' },
        })
      })
    )

    return new Response(
      JSON.stringify({ notified: linked.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e: any) {
    console.error('[hubmy-notify]', e)
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
