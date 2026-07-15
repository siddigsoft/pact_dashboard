/**
 * acknowledge-policy
 *
 * Handles policy acknowledgement insertion with server-side IP capture.
 * Called from EmployeePoliciesTab instead of a direct Supabase insert, so
 * the ip_address field is populated from the real request headers (not
 * client-supplied), providing a trustworthy audit trail.
 *
 * Auth: Requires a valid Supabase JWT (anon or authenticated session).
 * The user_id is taken from the JWT — clients cannot forge it.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
  }

  const SUPABASE_URL     = Deno.env.get('SUPABASE_URL') ?? ''
  const ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  // Validate the caller's JWT to get the authenticated user
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
  }

  let body: { policy_id: string; policy_version: string; confirmed_name: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: corsHeaders })
  }

  const { policy_id, policy_version, confirmed_name } = body
  if (!policy_id || !policy_version) {
    return new Response(JSON.stringify({ error: 'policy_id and policy_version are required' }), { status: 400, headers: corsHeaders })
  }

  // Extract client IP from trusted headers (set by the Supabase/CF edge proxy)
  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    req.headers.get('cf-connecting-ip') ??
    null

  // Insert using service role so we bypass RLS for this write
  // (RLS policy "hr_ack_insert_self" already checks user_id = auth.uid(),
  //  but we use service role to reliably capture ip_address)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error: insertError } = await admin.from('hr_policy_acknowledgements').insert({
    policy_id,
    user_id:        user.id,           // from JWT — cannot be forged
    policy_version,
    confirmed_name: confirmed_name?.trim() ?? null,
    acknowledged_at: new Date().toISOString(),
    ip_address:     ipAddress,
  })

  if (insertError) {
    // UNIQUE constraint violation = already acknowledged this version
    if (insertError.code === '23505') {
      return new Response(JSON.stringify({ error: 'already_acknowledged' }), { status: 409, headers: corsHeaders })
    }
    console.error('Acknowledgement insert failed:', insertError.message)
    return new Response(JSON.stringify({ error: insertError.message }), { status: 400, headers: corsHeaders })
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
