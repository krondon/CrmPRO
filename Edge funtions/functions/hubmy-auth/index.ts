import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const HUBMY_API_KEY = Deno.env.get('HUBMY_API_KEY')!
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { token } = await req.json()
    if (!token) return err('token requerido')

    // 1. Validate Hubmy session
    const validateRes = await fetch(
      `https://apidev.hubmy.app/v1/sdk/auth/validate?token=${encodeURIComponent(token)}`,
      { headers: { Authorization: `Bearer ${HUBMY_API_KEY}` } },
    )
    const vJson = await validateRes.json()
    if (!validateRes.ok || vJson.error) {
      return err(vJson.message || vJson.error || 'Sesión Hubmy inválida', 401)
    }

    const hu = vJson.data.user
    const hs = vJson.data.session
    const email = hu.email
    const name  = hu.display_name || hu.name || email

    const db = createClient(SUPABASE_URL, SERVICE_ROLE)

    // 2. Generate Supabase magic link (creates user if not exists)
    const { data: linkData, error: linkErr } = await db.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { data: { nombre_completo: name, hubmy_user_id: hu.id } },
    })
    if (linkErr || !linkData) throw new Error(linkErr?.message ?? 'No se pudo generar link')

    const supabaseUserId = linkData.user.id

    // 3. Ensure registro en tabla usuarios
    await db.from('usuarios').upsert({
      id: supabaseUserId,
      email,
      nombre_completo: name,
      tipo_cuenta: 'owner',
    }, { onConflict: 'id', ignoreDuplicates: true })

    // 4. Link Hubmy user ↔ Supabase user
    await db.from('hubmy_linked_users').upsert({
      supabase_user_id: supabaseUserId,
      hubmy_user_id:    hu.id,
      hubmy_session_id: hs?.id ?? null,
      hubmy_email:      email,
      hubmy_name:       name,
      last_active_at:   new Date().toISOString(),
    }, { onConflict: 'hubmy_user_id' })

    return ok({
      hashed_token: linkData.properties.hashed_token,
      email,
      name,
      hubmy_user_id: hu.id,
    })

  } catch (e: any) {
    console.error('[hubmy-auth]', e)
    return err(e.message ?? 'Error interno', 500)
  }
})
