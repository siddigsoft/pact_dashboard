import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ADMIN_ROLES = [
  'admin', 'Admin',
  'superadmin', 'SuperAdmin', 'super_admin',
  'financialAdmin', 'financialadmin', 'FinancialAdmin',
  'fom', 'FOM',
  'countrydirector', 'CountryDirector', 'country_director',
  'ict', 'ICT',
  'datateam', 'DataTeam', 'data_team',
]

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify caller identity using their JWT
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check caller has an admin-level role using service client (bypasses RLS)
    const svc = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )
    const { data: callerProfile } = await svc
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (!callerProfile || !ADMIN_ROLES.includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Permission denied: admin role required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { target_user_id } = await req.json()
    if (!target_user_id) {
      return new Response(JSON.stringify({ error: 'target_user_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Upsert wallet using service role — completely bypasses RLS
    const { data: wallet, error: upsertError } = await svc
      .from('wallets')
      .upsert({
        user_id: target_user_id,
        currency: 'SDG',
        balance_cents: 0,
        total_earned_cents: 0,
        total_paid_out_cents: 0,
        pending_payout_cents: 0,
        balances: { SDG: 0 },
        total_earned: 0,
      }, { onConflict: 'user_id', ignoreDuplicates: true })
      .select('id, user_id')

    if (upsertError) {
      return new Response(JSON.stringify({ error: upsertError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch the wallet (it may already have existed before the upsert)
    const { data: existingWallet } = await svc
      .from('wallets')
      .select('id, user_id')
      .eq('user_id', target_user_id)
      .limit(1)
      .maybeSingle()

    return new Response(JSON.stringify({ wallet_id: existingWallet?.id, user_id: target_user_id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
