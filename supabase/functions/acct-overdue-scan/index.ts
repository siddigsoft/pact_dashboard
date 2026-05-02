/**
 * acct-overdue-scan
 *
 * Nightly Edge Function that scans for accounting alerts and creates in-app
 * notifications for users with accounting roles. Covers:
 *   1. AP invoices overdue (due_date < today, not paid/cancelled)
 *   2. Grants expiring within 30 days
 *   3. Open fiscal periods past their end_date
 *
 * Schedule (set in Supabase Dashboard → Edge Functions → Schedule):
 *   Cron: 0 6 * * *   (06:00 UTC daily)
 *
 * Can also be triggered manually via HTTP POST (admin use / testing).
 *
 * Environment variables (auto-injected by Supabase):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── accounting roles ─────────────────────────────────────────────────────────
const ACCT_ROLES = [
  'super_admin', 'admin', 'finance', 'financialAdmin',
  'financialadmin', 'financial_admin', 'accountant', 'auditor', 'fom', 'FOM',
]

// ─── helpers ──────────────────────────────────────────────────────────────────
function today(): string { return new Date().toISOString().slice(0, 10) }

async function getAccountingUserIds(sb: ReturnType<typeof createClient>): Promise<string[]> {
  const { data } = await sb
    .from('profiles')
    .select('id')
    .in('role', ACCT_ROLES)
    .neq('is_active', false)
  return (data ?? []).map((p: any) => p.id as string)
}

async function alreadyNotified(
  sb: ReturnType<typeof createClient>,
  eventType: string,
  metadataKey: string,
  metadataValue: string,
): Promise<boolean> {
  const todayStr = today()
  const { data } = await sb
    .from('notifications')
    .select('id')
    .eq('type', eventType)
    .gte('created_at', `${todayStr}T00:00:00Z`)
    .lte('created_at', `${todayStr}T23:59:59Z`)
    .contains('metadata', { [metadataKey]: metadataValue })
    .limit(1)
  return (data?.length ?? 0) > 0
}

async function createNotifications(
  sb: ReturnType<typeof createClient>,
  userIds: string[],
  payload: { type: string; title: string; message: string; link: string; metadata: Record<string, unknown> },
) {
  if (!userIds.length) return
  const rows = userIds.map(uid => ({
    user_id: uid,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    link: payload.link,
    metadata: payload.metadata,
    is_read: false,
    created_at: new Date().toISOString(),
  }))
  await sb.from('notifications').insert(rows)
}

// ─── scanners ─────────────────────────────────────────────────────────────────

async function scanOverdueInvoices(
  sb: ReturnType<typeof createClient>,
  userIds: string[],
): Promise<{ scanned: number; notified: number }> {
  const tableExists = await sb
    .from('acct_invoices')
    .select('id', { count: 'exact', head: true })
  if ((tableExists.error as any)?.code === '42P01') return { scanned: 0, notified: 0 }

  const { data } = await sb
    .from('acct_invoices')
    .select('id, invoice_number, due_date, total_amount, currency, status')
    .not('status', 'in', '("paid","partial_paid","cancelled","written_off")')
    .not('due_date', 'is', null)
    .lt('due_date', today())
    .order('due_date', { ascending: true })
    .limit(200)

  let notified = 0
  for (const inv of (data ?? []) as any[]) {
    const alreadyDone = await alreadyNotified(sb, 'accounting_ap_overdue', 'invoice_id', inv.id)
    if (alreadyDone) continue

    const daysOverdue = Math.floor(
      (Date.now() - new Date(inv.due_date).getTime()) / 86_400_000,
    )
    await createNotifications(sb, userIds, {
      type: 'accounting_ap_overdue',
      title: 'AP Invoice Overdue',
      message: `Invoice ${inv.invoice_number} is overdue by ${daysOverdue} day(s). Amount: ${inv.total_amount} ${inv.currency}`,
      link: '/accounting/ap-invoices',
      metadata: {
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        due_date: inv.due_date,
        total_amount: inv.total_amount,
        currency: inv.currency,
        days_overdue: daysOverdue,
      },
    })
    notified++
  }
  return { scanned: (data ?? []).length, notified }
}

async function scanExpiringGrants(
  sb: ReturnType<typeof createClient>,
  userIds: string[],
): Promise<{ scanned: number; notified: number }> {
  const tableExists = await sb
    .from('acct_grants')
    .select('id', { count: 'exact', head: true })
  if ((tableExists.error as any)?.code === '42P01') return { scanned: 0, notified: 0 }

  const todayStr = today()
  const in30 = new Date(); in30.setDate(in30.getDate() + 30)
  const in30Str = in30.toISOString().slice(0, 10)

  const { data } = await sb
    .from('acct_grants')
    .select('id, name_en, end_date, award_amount, currency, status')
    .not('status', 'in', '("expired","draft")')
    .gte('end_date', todayStr)
    .lte('end_date', in30Str)
    .order('end_date', { ascending: true })
    .limit(100)

  let notified = 0
  for (const grant of (data ?? []) as any[]) {
    const alreadyDone = await alreadyNotified(sb, 'accounting_grant_expiry', 'grant_id', grant.id)
    if (alreadyDone) continue

    const daysLeft = Math.ceil(
      (new Date(grant.end_date).getTime() - Date.now()) / 86_400_000,
    )
    await createNotifications(sb, userIds, {
      type: 'accounting_grant_expiry',
      title: 'Grant Expiring Soon',
      message: `Grant "${grant.name_en}" expires in ${daysLeft} day(s) on ${grant.end_date}. Awarded: ${grant.award_amount} ${grant.currency}`,
      link: '/accounting/grants',
      metadata: {
        grant_id: grant.id,
        grant_name: grant.name_en,
        end_date: grant.end_date,
        days_left: daysLeft,
        award_amount: grant.award_amount,
      },
    })
    notified++
  }
  return { scanned: (data ?? []).length, notified }
}

async function scanOpenPeriods(
  sb: ReturnType<typeof createClient>,
  userIds: string[],
): Promise<{ scanned: number; notified: number }> {
  const tableExists = await sb
    .from('acct_fiscal_periods')
    .select('id', { count: 'exact', head: true })
  if ((tableExists.error as any)?.code === '42P01') return { scanned: 0, notified: 0 }

  const { data } = await sb
    .from('acct_fiscal_periods')
    .select('id, period_name, end_date, status')
    .eq('status', 'open')
    .lt('end_date', today())
    .order('end_date', { ascending: true })
    .limit(20)

  let notified = 0
  for (const period of (data ?? []) as any[]) {
    const alreadyDone = await alreadyNotified(sb, 'accounting_period_close_overdue', 'period_id', period.id)
    if (alreadyDone) continue

    const daysPast = Math.floor(
      (Date.now() - new Date(period.end_date).getTime()) / 86_400_000,
    )
    await createNotifications(sb, userIds, {
      type: 'accounting_period_close_overdue',
      title: 'Fiscal Period Needs Closing',
      message: `Period "${period.period_name}" ended ${daysPast} day(s) ago on ${period.end_date} and is still open.`,
      link: '/accounting/period-close',
      metadata: {
        period_id: period.id,
        period_name: period.period_name,
        end_date: period.end_date,
        days_past: daysPast,
      },
    })
    notified++
  }
  return { scanned: (data ?? []).length, notified }
}

// ─── handler ──────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )

    const userIds = await getAccountingUserIds(sb)
    if (!userIds.length) {
      return new Response(
        JSON.stringify({ success: true, message: 'No accounting users found', results: {} }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const [invoices, grants, periods] = await Promise.all([
      scanOverdueInvoices(sb, userIds),
      scanExpiringGrants(sb, userIds),
      scanOpenPeriods(sb, userIds),
    ])

    const totalNotified = invoices.notified + grants.notified + periods.notified

    return new Response(
      JSON.stringify({
        success: true,
        run_at: new Date().toISOString(),
        accounting_users: userIds.length,
        total_notifications_created: totalNotified,
        results: {
          overdue_invoices: invoices,
          expiring_grants: grants,
          open_periods: periods,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('acct-overdue-scan error:', err)
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
