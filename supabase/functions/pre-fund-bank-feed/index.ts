/**
 * pre-fund-bank-feed
 *
 * Supabase Edge Function — bank feed webhook / polling endpoint.
 *
 * Receives bank transaction notifications (push or pull) from external bank
 * APIs and attempts to match them against awaiting_receipt pre_fund_requests.
 *
 * Two operation modes (determined by request body):
 *
 *   A. PUSH  — bank POSTs a transaction to this endpoint (webhook mode)
 *      Body: { mode: "push", reference, amount, currency, transaction_date, description }
 *
 *   B. POLL  — scheduler GETs this endpoint; function fetches from bank API
 *      Body: { mode: "poll" }  (or GET request)
 *      Requires: bank_api_url_encrypted + bank_api_key_encrypted in pre_fund_settings
 *      (admin sets these in Pre-Funding → Settings → Bank Feed)
 *
 * Matching logic (both modes):
 *   1. Find awaiting_receipt fund(s) where amount matches within 0.01 AND
 *      currency matches AND (reference contains fund name OR fund ref code).
 *   2. If exactly 1 match → call activate_pre_fund_rpc to post GL + activate.
 *   3. If 0 or >1 matches → insert into pre_fund_bank_unmatched for manual review.
 *
 * SECURITY: Validate x-webhook-secret header (set PRE_FUND_WEBHOOK_SECRET in
 * Supabase Secrets).  For poll mode, also accepts x-cron-secret.
 *
 * Environment variables (Supabase dashboard → Edge Functions → Secrets):
 *   SUPABASE_URL               — auto-injected
 *   SUPABASE_SERVICE_ROLE_KEY  — auto-injected
 *   PRE_FUND_WEBHOOK_SECRET    — shared secret for push webhook validation
 *   PRE_FUND_CRON_SECRET       — shared secret for poll/cron invocation
 *
 * Scheduling the poll mode (pg_cron or Supabase Scheduled Functions):
 *   Schedule "0 * * * *" (hourly) pointing at this function with mode=poll.
 *   pg_cron example:
 *     SELECT cron.schedule('pre-fund-bank-feed-poll', '0 * * * *', $$
 *       SELECT net.http_post(
 *         url     := '...supabase.co/functions/v1/pre-fund-bank-feed',
 *         headers := '{"Content-Type":"application/json","x-cron-secret":"<secret>"}',
 *         body    := '{"mode":"poll"}'
 *       ) $$);
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
  transaction_date: string   // ISO date string
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

    // ── Security ─────────────────────────────────────────────────────────
    const incomingWebhookSecret = req.headers.get('x-webhook-secret')
    const incomingCronSecret    = req.headers.get('x-cron-secret')

    const isWebhookAuth = webhookSecret && incomingWebhookSecret === webhookSecret
    const isCronAuth    = cronSecret    && incomingCronSecret    === cronSecret

    if ((webhookSecret || cronSecret) && !isWebhookAuth && !isCronAuth) {
      console.error('[pre-fund-bank-feed] Unauthorized')
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Service-role client ───────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    // ── Parse body ────────────────────────────────────────────────────────
    let body: Record<string, unknown> = {}
    if (req.method === 'POST') {
      try { body = await req.json() } catch { /* empty body ok for GET */ }
    }

    const mode = (body.mode as string) ?? (req.method === 'GET' ? 'poll' : 'push')

    // ── Collect transactions to process ───────────────────────────────────
    const transactions: BankTransaction[] = []

    if (mode === 'push') {
      // Single transaction pushed by bank webhook
      if (!body.amount || !body.currency) {
        return new Response(
          JSON.stringify({ error: 'Push mode requires amount and currency fields.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      transactions.push({
        reference:        (body.reference as string) ?? null,
        amount:           Number(body.amount),
        currency:         (body.currency as string).toUpperCase(),
        transaction_date: (body.transaction_date as string) ?? new Date().toISOString().slice(0, 10),
        description:      (body.description as string) ?? null,
        raw_payload:      body,
      })
    } else {
      // Poll mode: fetch from bank API using encrypted credentials
      const { data: settingsRow } = await supabase
        .from('pre_fund_settings')
        .select('bank_api_enabled, bank_api_url_hint')
        .single()

      if (!(settingsRow as any)?.bank_api_enabled) {
        return new Response(
          JSON.stringify({ ok: true, message: 'Bank API feed is disabled in settings. Enable it under Pre-Funding → Settings → Bank Feed.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Decrypt bank credentials via RPC (stored as pgcrypto-encrypted bytea)
      const { data: credData, error: credErr } = await supabase.rpc('get_pre_fund_bank_credentials')
      if (credErr || !credData) {
        console.warn('[pre-fund-bank-feed] Could not retrieve bank credentials:', credErr?.message)
        return new Response(
          JSON.stringify({ ok: false, error: 'Bank credentials unavailable. Re-enter them in Pre-Funding → Settings → Bank Feed.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { url, key } = credData as { url: string; key: string }

      // Fetch last 24 h of transactions from the bank API
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const bankRes = await fetch(`${url}?since=${since}`, {
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      })

      if (!bankRes.ok) {
        console.error('[pre-fund-bank-feed] Bank API error:', bankRes.status, bankRes.statusText)
        return new Response(
          JSON.stringify({ ok: false, error: `Bank API returned ${bankRes.status}` }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const bankData = await bankRes.json()
      // Bank API response is expected to be an array or { transactions: [] }
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
      // Load awaiting_receipt funds matching currency + amount (within 1 cent)
      const { data: candidates } = await supabase
        .from('pre_fund_requests')
        .select('id, name, amount, currency, gl_receipt_account, gl_liability_account')
        .eq('status', 'awaiting_receipt')
        .eq('currency', txn.currency)
        .gte('amount', txn.amount - 0.01)
        .lte('amount', txn.amount + 0.01)

      const funds = (candidates as any[]) ?? []

      // Narrow by reference/name match if reference is available
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
        // Exact match — activate the fund
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
        // No clear match — persist as unmatched for Finance manual review
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
