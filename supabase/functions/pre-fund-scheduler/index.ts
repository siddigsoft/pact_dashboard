/**
 * pre-fund-scheduler
 *
 * Supabase Edge Function / Scheduled Job that runs the pre-funding
 * auto-renewal engine daily.  Calls run_pre_fund_renewal_check() which:
 *   - Marks funds ending within warning_days as ending_soon
 *   - Marks low-balance funds as low_balance
 *   - Creates auto_draft renewal copies for eligible funds
 *   - Creates auto_activate renewal copies (active or pending_grace)
 *   - Posts GL JEs for immediately-activated renewals
 *   - Activates pending_grace funds whose grace window has expired
 *   - Fires notification_events for Finance team
 *
 * SECURITY: PRE_FUND_CRON_SECRET MUST be set in Supabase Secrets.
 * The function FAILS CLOSED (returns 401) if the secret is missing or
 * the request header does not match.  Never run this without the secret set.
 *
 * Scheduling (choose one):
 *   A. Supabase Scheduled Functions (recommended):
 *      Set schedule "0 6 * * *" (daily 06:00 UTC) in Supabase dashboard →
 *      Edge Functions → pre-fund-scheduler → Schedule.
 *
 *   B. pg_cron (alternative — requires pg_cron extension enabled):
 *      SELECT cron.schedule(
 *        'pre-fund-scheduler',
 *        '0 6 * * *',
 *        $$
 *          SELECT net.http_post(
 *            url      := 'https://<project>.supabase.co/functions/v1/pre-fund-scheduler',
 *            headers  := jsonb_build_object(
 *              'Content-Type', 'application/json',
 *              'x-cron-secret', '<YOUR_PRE_FUND_CRON_SECRET>'
 *            ),
 *            body     := '{}'::jsonb
 *          )
 *        $$
 *      );
 *
 * Environment variables (set in Supabase dashboard → Edge Functions → Secrets):
 *   SUPABASE_URL              — auto-injected
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected
 *   PRE_FUND_CRON_SECRET      — REQUIRED: shared secret for HTTP invocation validation
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ── Security: FAIL CLOSED — secret MUST be configured ───────────────────
  const cronSecret = Deno.env.get('PRE_FUND_CRON_SECRET')
  if (!cronSecret) {
    console.error('[pre-fund-scheduler] FATAL: PRE_FUND_CRON_SECRET is not set. ' +
      'Set it in Supabase Dashboard → Edge Functions → Secrets before scheduling this function.')
    return new Response(
      JSON.stringify({ error: 'Service misconfigured: PRE_FUND_CRON_SECRET is not set.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const headerSecret = req.headers.get('x-cron-secret')
  if (headerSecret !== cronSecret) {
    console.error('[pre-fund-scheduler] Unauthorized: invalid or missing x-cron-secret')
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // ── Service-role client (bypasses RLS, satisfies function role guard) ─
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    console.log('[pre-fund-scheduler] Starting run_pre_fund_renewal_check()')
    const startedAt = new Date().toISOString()

    const { data, error } = await supabase.rpc('run_pre_fund_renewal_check')

    if (error) {
      console.error('[pre-fund-scheduler] RPC error:', error)
      return new Response(
        JSON.stringify({ ok: false, error: error.message, started_at: startedAt }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const results = (data as Array<{ fund_id: string; fund_name: string; action: string }>) ?? []
    console.log(`[pre-fund-scheduler] Completed — ${results.length} fund(s) actioned`)

    // ── #66 — Expiry window notifications (30 / 15 / 7 days) ────────────────
    // Query active funds expiring within 30 days and notify Finance team if
    // the exact window (30, 15, or 7 days remaining) hasn't been notified yet.
    let expiryNotified = 0
    try {
      const today = new Date()
      const in30 = new Date(today); in30.setDate(today.getDate() + 30)

      const { data: expiringFunds } = await supabase
        .from('pre_fund_requests')
        .select('id, name, end_date, fund_status')
        .in('fund_status', ['active', 'ending_soon', 'low_balance'])
        .lte('end_date', in30.toISOString().slice(0, 10))
        .gte('end_date', today.toISOString().slice(0, 10))

      const todayMidnight = new Date(today); todayMidnight.setHours(0, 0, 0, 0)
      for (const fund of (expiringFunds ?? [])) {
        const endDate = new Date(fund.end_date as string)
        const daysLeft = Math.round((endDate.getTime() - todayMidnight.getTime()) / 86400000)
        if (![7, 15, 30].includes(daysLeft)) continue

        const dedupKey = `pre_fund_expiry_${fund.id}_${daysLeft}d`

        // Deduplication: skip if we already fired this exact window today
        const { count } = await supabase
          .from('notification_events')
          .select('id', { count: 'exact', head: true })
          .eq('event_type', 'pre_fund_expiry_warning')
          .eq('reference_type', 'pre_fund_request')
          .contains('metadata', { dedup_key: dedupKey })

        if ((count ?? 0) > 0) continue

        const priority = daysLeft <= 7 ? 'critical' : daysLeft <= 15 ? 'high' : 'medium'
        await supabase.from('notification_events').insert({
          event_type:    'pre_fund_expiry_warning',
          reference_type: 'pre_fund_request',
          title:   `Pre-Fund Expiry: ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining — "${fund.name}"`,
          message: `"${fund.name}" expires on ${fund.end_date}. Please initiate a renewal or return before the deadline.`,
          target_roles: ['superAdmin', 'fom', 'finance'],
          metadata: {
            fund_id:    fund.id,
            days_left:  daysLeft,
            end_date:   fund.end_date,
            priority,
            action_url: '/pre-funding',
            dedup_key:  dedupKey,
          },
        })
        expiryNotified++
      }
      console.log(`[pre-fund-scheduler] Expiry notifications sent: ${expiryNotified}`)
    } catch (expiryErr) {
      console.error('[pre-fund-scheduler] Expiry notification error:', expiryErr)
    }

    return new Response(
      JSON.stringify({
        ok: true,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        funds_actioned: results.length,
        expiry_notified: expiryNotified,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[pre-fund-scheduler] Unexpected error:', err)
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
