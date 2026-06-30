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
 * SECURITY: Must be invoked with x-cron-secret header matching
 * PRE_FUND_CRON_SECRET env var.  On Supabase this is set via the dashboard
 * Secrets manager.  Regular authenticated users cannot call this function.
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
 *            url      := current_setting('app.supabase_functions_url') || '/pre-fund-scheduler',
 *            headers  := jsonb_build_object(
 *              'Content-Type', 'application/json',
 *              'x-cron-secret', current_setting('app.pre_fund_cron_secret')
 *            ),
 *            body     := '{}'::jsonb
 *          )
 *        $$
 *      );
 *      -- Then set app settings:
 *      ALTER DATABASE postgres SET app.supabase_functions_url = 'https://<project>.supabase.co/functions/v1';
 *      ALTER DATABASE postgres SET app.pre_fund_cron_secret   = '<your-secret>';
 *
 * Environment variables (set in Supabase dashboard → Edge Functions → Secrets):
 *   SUPABASE_URL              — auto-injected
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected
 *   PRE_FUND_CRON_SECRET      — shared secret for HTTP invocation validation
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

  try {
    // ── Security: validate cron secret ──────────────────────────────────
    const cronSecret = Deno.env.get('PRE_FUND_CRON_SECRET')
    if (cronSecret) {
      const headerSecret = req.headers.get('x-cron-secret')
      if (headerSecret !== cronSecret) {
        console.error('[pre-fund-scheduler] Unauthorized: invalid x-cron-secret')
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else {
      console.warn('[pre-fund-scheduler] PRE_FUND_CRON_SECRET not set — running unauthenticated (set this in production)')
    }

    // ── Service-role client (bypasses RLS, satisfies function role guard) ─
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    console.log('[pre-fund-scheduler] Starting run_pre_fund_renewal_check()')
    const startedAt = new Date().toISOString()

    // ── Run the renewal check SQL function ───────────────────────────────
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

    return new Response(
      JSON.stringify({
        ok: true,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        funds_actioned: results.length,
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
