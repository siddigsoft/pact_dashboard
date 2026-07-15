/**
 * acknowledge-policy
 *
 * Handles policy acknowledgement with full server-side validation:
 *  1. Validates the caller's JWT → derives user_id (cannot be forged)
 *  2. Fetches the policy by policy_id — must exist and be published
 *  3. Checks submitted policy_version matches the current version on record
 *  4. Checks the caller's role is applicable (required_roles empty = all staff)
 *  5. Captures ip_address from trusted request headers
 *  6. Inserts the acknowledgement record
 *
 * Auth: Requires a valid Supabase JWT (authenticated session).
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

  // ── 1. Validate caller JWT ──────────────────────────────────────────────────
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
    return new Response(
      JSON.stringify({ error: 'policy_id and policy_version are required' }),
      { status: 400, headers: corsHeaders },
    )
  }

  // ── Service-role client for all subsequent reads/writes ─────────────────────
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── 2. Fetch the policy — must exist and be published ──────────────────────
  const { data: policy, error: polErr } = await admin
    .from('hr_policies')
    .select('id, version, status, required_roles')
    .eq('id', policy_id)
    .maybeSingle()

  if (polErr || !policy) {
    return new Response(JSON.stringify({ error: 'Policy not found' }), { status: 404, headers: corsHeaders })
  }
  if (policy.status !== 'published') {
    return new Response(JSON.stringify({ error: 'Policy is not published' }), { status: 403, headers: corsHeaders })
  }

  // ── 3. Version must match current version ──────────────────────────────────
  if (policy.version !== policy_version) {
    return new Response(
      JSON.stringify({ error: 'version_mismatch', current_version: policy.version }),
      { status: 409, headers: corsHeaders },
    )
  }

  // ── 4. Caller role must be applicable ──────────────────────────────────────
  const requiredRoles: string[] = policy.required_roles ?? []
  if (requiredRoles.length > 0) {
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    const callerRole = (profile?.role ?? '').toLowerCase()
    const applicable = requiredRoles.some(r => r.toLowerCase() === callerRole)
    if (!applicable) {
      return new Response(
        JSON.stringify({ error: 'This policy does not apply to your role' }),
        { status: 403, headers: corsHeaders },
      )
    }
  }

  // ── 5. Capture IP from trusted edge/proxy headers ──────────────────────────
  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    req.headers.get('cf-connecting-ip') ??
    null

  // ── 6. Insert acknowledgement ──────────────────────────────────────────────
  const { error: insertError } = await admin.from('hr_policy_acknowledgements').insert({
    policy_id,
    user_id:         user.id,
    policy_version,
    confirmed_name:  confirmed_name?.trim() ?? null,
    acknowledged_at: new Date().toISOString(),
    ip_address:      ipAddress,
  })

  if (insertError) {
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
