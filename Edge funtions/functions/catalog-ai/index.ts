import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-supabase-authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Faltan variables de entorno de Supabase')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    let empresa_id: string | null = null
    let search: string | null = null

    if (req.method === 'GET') {
      const url = new URL(req.url)
      empresa_id = url.searchParams.get('empresa_id')
      search = url.searchParams.get('search')
    } else {
      const body = await req.json()
      empresa_id = body.empresa_id
      search = body.search ?? null
    }

    if (!empresa_id) {
      return new Response(JSON.stringify({ error: 'Se requiere empresa_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let query = supabase
      .from('catalog_items')
      .select('id, name, description, unit_price, stock, image_url')
      .eq('empresa_id', empresa_id)

    if (search && search.trim()) {
      query = query.or(`name.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%`)
    }

    query = query.order('name')

    const { data: items, error } = await query

    if (error) throw error

    return new Response(JSON.stringify({
      success: true,
      empresa_id,
      search: search?.trim() || null,
      total: items.length,
      items: items.map((item: any) => ({
        id: item.id,
        name: item.name,
        description: item.description ?? null,
        unit_price: item.unit_price ?? null,
        stock: item.stock ?? null,
        image_url: item.image_url ?? null,
      }))
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('[catalog-ai] Error:', error)
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Error interno del servidor'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
