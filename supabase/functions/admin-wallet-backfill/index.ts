import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ADMIN_ROLES = [
  'admin', 'Admin',
  'superAdmin', 'superadmin', 'SuperAdmin',
  'financialAdmin', 'financialadmin', 'FinancialAdmin',
  'ict', 'ICT',
  'fom', 'FOM',
]

interface SiteCredit {
  id: string
  userId: string
  fee: number
  siteName: string
}

interface CreditResult {
  id: string
  success: boolean
  skipped: boolean
  message: string
}

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

    // Service role client — bypasses ALL RLS on every table
    const svc = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    // Verify caller identity from their JWT
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Confirm the caller has an admin-level role
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

    const body = await req.json()
    const sites: SiteCredit[] = body.sites ?? []

    if (!sites.length) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results: CreditResult[] = []

    for (const site of sites) {
      try {
        if (!site.id || !site.userId || !(site.fee > 0)) {
          results.push({ id: site.id, success: false, skipped: false, message: 'Invalid site data' })
          continue
        }

        // ── 1. Duplicate check ──────────────────────────────────────────────
        const { data: existing } = await svc
          .from('wallet_transactions')
          .select('id')
          .or(`site_visit_id.eq.${site.id},related_site_visit_id.eq.${site.id}`)
          .limit(1)

        if (existing && existing.length > 0) {
          results.push({ id: site.id, success: true, skipped: true, message: 'Already credited' })
          continue
        }

        // ── 2. Get or create wallet ─────────────────────────────────────────
        let walletId: string
        let currentBalance = 0
        let totalEarned = 0

        const { data: walletRow } = await svc
          .from('wallets')
          .select('id, balances, total_earned, total_earned_cents')
          .eq('user_id', site.userId)
          .maybeSingle()

        if (walletRow) {
          walletId = walletRow.id
          currentBalance = Number((walletRow.balances as Record<string, number>)?.SDG ?? 0)
          totalEarned = Number(walletRow.total_earned ?? 0)
        } else {
          const { data: newWallet, error: createErr } = await svc
            .from('wallets')
            .insert({
              user_id: site.userId,
              balances: { SDG: 0 },
              total_earned: 0,
              balance_cents: 0,
              total_earned_cents: 0,
            })
            .select('id')
            .single()
          if (createErr || !newWallet) {
            throw new Error(createErr?.message ?? 'Failed to create wallet')
          }
          walletId = newWallet.id
          currentBalance = 0
          totalEarned = 0
        }

        const newBalance = currentBalance + site.fee

        // ── 3. Insert wallet transaction ────────────────────────────────────
        const { error: txErr } = await svc
          .from('wallet_transactions')
          .insert({
            wallet_id: walletId,
            user_id: site.userId,
            type: 'earning',
            amount: site.fee,
            amount_cents: Math.round(site.fee * 100),
            currency: 'SDG',
            site_visit_id: site.id,
            related_site_visit_id: site.id,
            description: `Site visit fee: ${site.siteName || 'Unknown site'}`,
            balance_before: currentBalance,
            balance_after: newBalance,
            metadata: { backfill: true, site_name: site.siteName },
          })
        if (txErr) throw new Error(txErr.message)

        // ── 4. Update wallet balances ───────────────────────────────────────
        const { error: updateErr } = await svc
          .from('wallets')
          .update({
            balances: { SDG: newBalance },
            total_earned: totalEarned + site.fee,
            balance_cents: Math.round(newBalance * 100),
            total_earned_cents: Math.round((totalEarned + site.fee) * 100),
            updated_at: new Date().toISOString(),
          })
          .eq('id', walletId)
        if (updateErr) throw new Error(updateErr.message)

        results.push({
          id: site.id,
          success: true,
          skipped: false,
          message: `Credited ${site.fee} SDG`,
        })
      } catch (err: unknown) {
        results.push({
          id: site.id,
          success: false,
          skipped: false,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
