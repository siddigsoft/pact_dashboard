/**
 * pre-fund-bank-feed
 *
 * Supabase Edge Function — bank feed webhook / polling endpoint.
 * Receives bank transaction notifications and matches them against
 * awaiting_receipt pre_fund_requests.
 *
 * Two operation modes:
 *   A. PUSH — bank POSTs a transaction (webhook mode)
 *      Body: { mode: "push", reference, amount, currency, transaction_date, description }
 *
 *   B. POLL — scheduler calls this endpoint; function fetches from bank API
 *      Body: { mode: "poll" }
 *      Requires bank credentials stored in pre_fund_settings.
 *
 * Matching logic:
 *   1. Find awaiting_receipt funds where currency matches AND amount is within
 *      bank_match_tolerance_pct% of the incoming amount (from settings, default 2%).
 *   2. Exact 1 match → call activate_pre_fund_rpc (GL JE + status = active).
 *   3. 0 or >1 matches → insert into pre_fund_bank_unmatched for manual review.
 *
 * SECURITY: FAILS CLOSED if secrets are not set.
 *   - Push mode: PRE_FUND_WEBHOOK_SECRET MUST be set and x-webhook-secret header must match.
 *   - Poll/cron mode: PRE_FUND_CRON_SECRET MUST be set and x-cron-secret header must match.
 *
 * Environment variables (Supabase dashboard → Edge Functions → Secrets):
 *   SUPABASE_URL               — auto-injected
 *   SUPABASE_SERVICE_ROLE_KEY  — auto-injected
 *   PRE_FUND_WEBHOOK_SECRET    — REQUIRED for push mode
 *   PRE_FUND_CRON_SECRET       — REQUIRED for poll/cron mode
 *
 * Scheduling poll mode (pg_cron or Supabase Scheduled Functions):
 *   Schedule "0 * * * *" (hourly) with body { "mode": "poll" } and
 *   header x-cron-secret: <PRE_FUND_CRON_SECRET>.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-webhook-secret, x-cron-secret',
}

interface BankTransaction {
  reference:        string | null
  amount:           number
  currency:         string
  transaction_date: string
  description:      string | null
  raw_payload:      Record<string, unknown>
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const webhookSecret = Deno.env.get('PRE_FUND_WEBHOOK_SECRET')
    const cronSecret    = Deno.env.get('PRE_FUND_CRON_SECRET')

    // ── Parse body to determine mode ──────────────────────────────────────
    let body: Record<string, unknown> = {}
    if (req.method === 'POST') {
      try { body = await req.json() } catch { /* empty body ok for GET */ }
    }
    const mode = (body.mode as string) ?? (req.method === 'GET' ? 'poll' : 'push')

    // ── FAIL CLOSED: enforce required secrets by mode ─────────────────────
    if (mode === 'push') {
      if (!webhookSecret) {
        console.error('[pre-fund-bank-feed] FATAL: PRE_FUND_WEBHOOK_SECRET is not set.')
        return new Response(
          JSON.stringify({ error: 'Service misconfigured: PRE_FUND_WEBHOOK_SECRET is not set.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      if (req.headers.get('x-webhook-secret') !== webhookSecret) {
        console.error('[pre-fund-bank-feed] Unauthorized push request')
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } else {
      // poll mode
      if (!cronSecret) {
        console.error('[pre-fund-bank-feed] FATAL: PRE_FUND_CRON_SECRET is not set.')
        return new Response(
          JSON.stringify({ error: 'Service misconfigured: PRE_FUND_CRON_SECRET is not set.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      if (req.headers.get('x-cron-secret') !== cronSecret) {
        console.error('[pre-fund-bank-feed] Unauthorized poll request')
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // ── Service-role client ───────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    // ── Collect transactions ───────────────────────────────────────────────
    const transactions: BankTransaction[] = []
    let tolerancePct = 2   // default; overridden from settings in poll mode

    if (mode === 'push') {
      if (!body.amount || !body.currency) {
        return new Response(
          JSON.stringify({ error: 'Push mode requires amount and currency fields.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Fetch tolerance from settings for push mode too
      const { data: settingsRow } = await supabase
        .from('pre_fund_settings')
        .select('bank_match_tolerance_pct')
        .single()
      tolerancePct = Number((settingsRow as any)?.bank_match_tolerance_pct ?? 2)

      transactions.push({
        reference:        (body.reference as string) ?? null,
        amount:           Number(body.amount),
        currency:         (body.currency as string).toUpperCase(),
        transaction_date: (body.transaction_date as string) ?? new Date().toISOString().slice(0, 10),
        description:      (body.description as string) ?? null,
        raw_payload:      body,
      })
    } else {
      // Poll mode: decrypt credentials and fetch from bank API
      const { data: credData, error: credErr } = await supabase.rpc('get_pre_fund_bank_credentials')

      if (credErr) {
        console.error('[pre-fund-bank-feed] Credentials RPC error:', credErr.message)
        return new Response(
          JSON.stringify({ ok: false, error: credErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const cred = credData as { url?: string; key?: string; enabled?: boolean; tolerance_pct?: number; error?: string }

      if (cred?.error === 'bank_api_disabled' || cred?.enabled === false) {
        return new Response(
          JSON.stringify({ ok: true, message: 'Bank API feed is disabled in settings.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (cred?.error) {
        console.error('[pre-fund-bank-feed] Credential error:', cred.error)
        return new Response(
          JSON.stringify({ ok: false, error: cred.error }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!cred?.url || !cred?.key) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Bank credentials unavailable. Re-enter in Pre-Funding → Settings → Bank Feed.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      tolerancePct = Number(cred.tolerance_pct ?? 2)

      // Fetch last 24 h of transactions from bank API
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const bankRes = await fetch(`${cred.url}?since=${since}`, {
        headers: { Authorization: `Bearer ${cred.key}`, 'Content-Type': 'application/json' },
      })

      if (!bankRes.ok) {
        console.error('[pre-fund-bank-feed] Bank API error:', bankRes.status, bankRes.statusText)
        return new Response(
          JSON.stringify({ ok: false, error: `Bank API returned ${bankRes.status}` }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const bankData = await bankRes.json()
      const rawTxns: unknown[] = Array.isArray(bankData)
        ? bankData
        : (bankData?.transactions ?? bankData?.data ?? [])

      for (const t of rawTxns as Record<string, unknown>[]) {
        transactions.push({
          reference:        String(t.reference ?? t.ref ?? t.id ?? ''),
          amount:           Number(t.amount ?? t.value ?? 0),
          currency:         String(t.currency ?? 'USD').toUpperCase(),
          transaction_date: String(t.date ?? t.transaction_date ?? new Date().toISOString().slice(0, 10)),
          description:      String(t.description ?? t.memo ?? ''),
          raw_payload:      t,
        })
      }

      console.log(`[pre-fund-bank-feed] Fetched ${transactions.length} transaction(s) from bank API`)
    }

    // ── Match transactions against awaiting_receipt funds ─────────────────
    const results = []

    for (const txn of transactions) {
      // Amount tolerance as absolute value from configured percentage
      const tolerance = txn.amount * (tolerancePct / 100)

      const { data: candidates } = await supabase
        .from('pre_fund_requests')
        .select('id, name, amount, currency, gl_receipt_account, gl_liability_account')
        .eq('status', 'awaiting_receipt')
        .eq('currency', txn.currency)
        .gte('amount', txn.amount - tolerance)
        .lte('amount', txn.amount + tolerance)

      const funds = (candidates as any[]) ?? []

      // Narrow by reference/name match when multiple candidates
      let matched = funds
      if (txn.reference && funds.length > 1) {
        const refLower = txn.reference.toLowerCase()
        const nameMatched = funds.filter(f =>
          refLower.includes(f.name.toLowerCase().slice(0, 10)) ||
          f.name.toLowerCase().includes(refLower.slice(0, 10))
        )
        if (nameMatched.length > 0) matched = nameMatched
      }

      if (matched.length === 1) {
        const fund = matched[0]
        const { data: activateResult, error: activateErr } = await supabase.rpc(
          'activate_pre_fund_rpc',
          {
            p_fund_id:            fund.id,
            p_fund_name:          fund.name,
            p_amount:             txn.amount,
            p_currency:           txn.currency,
            p_gl_receipt_code:    fund.gl_receipt_account,
            p_gl_liability_code:  fund.gl_liability_account,
            p_idempotency_suffix: `-bankfeed-${txn.reference ?? txn.transaction_date}`,
          }
        )

        if (activateErr) {
          console.error('[pre-fund-bank-feed] Activation error for fund', fund.id, activateErr)
          results.push({ status: 'activation_error', fund_id: fund.id, error: activateErr.message, reference: txn.reference })
        } else {
          console.log('[pre-fund-bank-feed] Activated fund', fund.id, 'from bank transaction', txn.reference)
          results.push({ status: 'activated', fund_id: fund.id, fund_name: fund.name, reference: txn.reference })
        }
      } else {
        const { error: unmatchedErr } = await supabase
          .from('pre_fund_bank_unmatched')
          .insert({
            raw_reference:    txn.reference,
            amount:           txn.amount,
            currency:         txn.currency,
            transaction_date: txn.transaction_date,
            description:      txn.description,
            match_status:     'unmatched',
            source_payload:   txn.raw_payload,
          })

        if (unmatchedErr) {
          console.error('[pre-fund-bank-feed] Failed to store unmatched txn:', unmatchedErr)
        } else {
          const reason = funds.length === 0 ? 'no_amount_match' : 'multiple_candidates'
          console.log('[pre-fund-bank-feed] Stored unmatched transaction:', txn.reference, reason)
          results.push({ status: 'unmatched', reason, reference: txn.reference, amount: txn.amount, currency: txn.currency })
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        mode,
        processed: transactions.length,
        results,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[pre-fund-bank-feed] Unexpected error:', err)
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
