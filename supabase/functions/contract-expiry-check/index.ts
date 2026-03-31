/**
 * contract-expiry-check
 *
 * Scheduled Edge Function — runs daily via pg_cron at 08:00 UTC.
 * Also callable manually via HTTP POST for testing (requires CRON_SECRET).
 *
 * Authorization: callers must supply the shared secret in one of:
 *   - Authorization header: `Bearer <CRON_SECRET>`
 *   - x-cron-secret header: `<CRON_SECRET>`
 *
 * For each profile whose contract_end_date falls within the next 30 days,
 * this function:
 *   1. Inserts an in-app notification for the employee
 *   2. Sends an IONOS SMTP email to the employee via the send-email function
 *   3. If the employee has a manager (reports_to), inserts a notification for
 *      the manager and emails them too
 *
 * Deduplication: notification entity_id is "<profile_id>:<YYYY-MM-DD>" so
 * duplicate runs on the same day are harmless.
 *
 * Environment variables (auto-injected by Supabase):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CRON_SECRET  — shared secret for callers (set via Supabase Dashboard > Secrets)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.pactorg.com'
const WARN_DAYS = 30

function isAuthorized(req: Request): boolean {
  const cronSecret = Deno.env.get('CRON_SECRET')
  // If CRON_SECRET is not configured, only allow requests from Supabase internal network
  // by checking for the supabase service key header (defensive fallback).
  if (!cronSecret) {
    // Without a secret configured, reject all external calls.
    return false
  }

  // Accept via x-cron-secret header (preferred for cron jobs)
  const cronHeader = req.headers.get('x-cron-secret')
  if (cronHeader === cronSecret) return true

  // Accept via Bearer token in Authorization header (for manual testing)
  const authHeader = req.headers.get('authorization') ?? ''
  if (authHeader === `Bearer ${cronSecret}`) return true

  return false
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!isAuthorized(req)) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const cutoff = new Date(today)
    cutoff.setDate(cutoff.getDate() + WARN_DAYS)

    const { data: expiringProfiles, error: fetchError } = await supabase
      .from('profiles')
      .select('id, full_name, email, contract_end_date, reports_to')
      .not('contract_end_date', 'is', null)
      .gte('contract_end_date', today.toISOString().slice(0, 10))
      .lte('contract_end_date', cutoff.toISOString().slice(0, 10))

    if (fetchError) throw fetchError

    if (!expiringProfiles || expiringProfiles.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No expiring contracts found', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const managerIds = [...new Set(
      expiringProfiles
        .map(p => p.reports_to)
        .filter((id): id is string => !!id),
    )]

    type ManagerInfo = { full_name: string | null; email: string | null }
    const managerMap: Record<string, ManagerInfo> = {}

    if (managerIds.length > 0) {
      const { data: managers } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', managerIds)
      ;(managers ?? []).forEach((m) => { managerMap[m.id] = { full_name: m.full_name, email: m.email } })
    }

    const todayStr = today.toISOString().slice(0, 10)
    let processed = 0

    for (const profile of expiringProfiles) {
      const contractEnd = new Date(profile.contract_end_date!)
      const daysLeft = Math.ceil((contractEnd.getTime() - today.getTime()) / 86_400_000)
      const dedupeKey = `${profile.id}:${todayStr}`

      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('event_type', 'contract_expiry')
        .eq('entity_id', dedupeKey)
        .eq('recipient_id', profile.id)
        .maybeSingle()

      if (existing) continue

      const employeeName = profile.full_name || profile.email || 'Employee'
      const urgency = daysLeft <= 7 ? 'high' : 'medium'
      const expiryDate = contractEnd.toISOString().slice(0, 10)

      await supabase.from('notifications').insert({
        event_type: 'contract_expiry',
        entity_type: 'profile',
        entity_id: dedupeKey,
        recipient_id: profile.id,
        triggered_by: null,
        title_en: `Contract Expiry Reminder`,
        title_ar: `تذكير بانتهاء العقد`,
        message_en: `Your contract expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${expiryDate}). Please contact HR to discuss renewal.`,
        message_ar: `عقدك ينتهي خلال ${daysLeft} يوم (${expiryDate}). يرجى التواصل مع الموارد البشرية.`,
        priority: urgency,
        action_url: `${APP_URL}/users/${profile.id}`,
      })

      if (profile.email) {
        await supabase.functions.invoke('send-email', {
          body: {
            to: profile.email,
            subject: `Contract Expiry Reminder — ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining`,
            html: `
              <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px">
                <div style="background:#0F2041;padding:20px;border-radius:8px 8px 0 0">
                  <h1 style="color:#fff;margin:0;font-size:20px">PACT Command Center</h1>
                </div>
                <div style="background:#f9fafb;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e5e7eb;border-top:none">
                  <h2 style="color:#1D3461;margin-top:0">Contract Expiry Reminder</h2>
                  <p style="color:#374151">Dear ${employeeName},</p>
                  <p style="color:#374151">
                    This is a reminder that your employment contract is set to expire in
                    <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong> on <strong>${expiryDate}</strong>.
                  </p>
                  <p style="color:#374151">Please contact your HR department or manager to discuss contract renewal.</p>
                  <a href="${APP_URL}/users/${profile.id}"
                     style="display:inline-block;background:#1D3461;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:12px">
                    View My Profile
                  </a>
                </div>
              </div>`,
          },
        })
      }

      if (profile.reports_to && managerMap[profile.reports_to]) {
        const mgr = managerMap[profile.reports_to]
        const mgrDedupeKey = `${profile.id}:${todayStr}:mgr`

        const { data: mgrExisting } = await supabase
          .from('notifications')
          .select('id')
          .eq('event_type', 'contract_expiry')
          .eq('entity_id', mgrDedupeKey)
          .eq('recipient_id', profile.reports_to)
          .maybeSingle()

        if (!mgrExisting) {
          await supabase.from('notifications').insert({
            event_type: 'contract_expiry',
            entity_type: 'profile',
            entity_id: mgrDedupeKey,
            recipient_id: profile.reports_to,
            triggered_by: null,
            title_en: `Team Member Contract Expiry: ${employeeName}`,
            title_ar: `انتهاء عقد عضو الفريق: ${employeeName}`,
            message_en: `${employeeName}'s contract expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${expiryDate}).`,
            message_ar: `عقد ${employeeName} ينتهي خلال ${daysLeft} يوم (${expiryDate}).`,
            priority: urgency,
            action_url: `${APP_URL}/users/${profile.id}`,
          })

          if (mgr.email) {
            await supabase.functions.invoke('send-email', {
              body: {
                to: mgr.email,
                subject: `Team Member Contract Expiry — ${employeeName}`,
                html: `
                  <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px">
                    <div style="background:#0F2041;padding:20px;border-radius:8px 8px 0 0">
                      <h1 style="color:#fff;margin:0;font-size:20px">PACT Command Center</h1>
                    </div>
                    <div style="background:#f9fafb;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e5e7eb;border-top:none">
                      <h2 style="color:#1D3461;margin-top:0">Team Member Contract Expiry</h2>
                      <p style="color:#374151">Dear ${mgr.full_name || 'Manager'},</p>
                      <p style="color:#374151">
                        This is to inform you that <strong>${employeeName}</strong>'s employment contract
                        expires in <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong> on <strong>${expiryDate}</strong>.
                      </p>
                      <p style="color:#374151">Please follow up with HR regarding contract renewal.</p>
                      <a href="${APP_URL}/users/${profile.id}"
                         style="display:inline-block;background:#1D3461;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:12px">
                        View Employee Profile
                      </a>
                    </div>
                  </div>`,
              },
            })
          }
        }
      }

      processed++
    }

    return new Response(
      JSON.stringify({ message: 'Contract expiry check complete', processed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[contract-expiry-check] Error:', err)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
