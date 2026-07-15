/**
 * hr-policy-reminder
 *
 * Scheduled daily cron (07:00 UTC) that sends acknowledgement reminders
 * for hr_policies that have been published but not yet acknowledged.
 *
 * Logic:
 *   1. Find all published policies with an effective_date in the past.
 *   2. For each policy, find employees who should acknowledge it
 *      (required_roles empty = all employees; otherwise role must match).
 *   3. Exclude employees who already have a current-version acknowledgement.
 *   4. At Day 7 after effective_date: send one in-app + email reminder.
 *   5. At Day 14: send one escalation to the employee + notify their manager.
 *   6. Idempotency: threshold-specific dedup keys in audit_logs are permanent
 *      (no rolling time window) — each threshold fires exactly once per
 *      policy/employee, regardless of how many times the cron runs.
 *      Key format: "hr-policy-reminder:<policy_id>:<user_id>:<d7|d14>"
 *      Manager escalation key: "hr-policy-reminder:<policy_id>:<emp_id>:manager:d14"
 *
 * Security: Requires `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret` header.
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, APP_URL
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const APP_URL      = Deno.env.get('APP_URL') ?? 'https://app.pactorg.com'

const REMINDER_DAY   = 7
const ESCALATION_DAY = 14

function isAuthorized(req: Request): boolean {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret) return false
  const xCron = req.headers.get('x-cron-secret')
  if (xCron === cronSecret) return true
  const auth = req.headers.get('authorization') ?? ''
  if (auth.startsWith('Bearer ') && auth.slice(7) === cronSecret) return true
  return false
}

async function sendNotification(userId: string, title: string, message: string, link: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/dispatch-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        user_id:  userId,
        type:     'hr_policy_reminder',
        title,
        message,
        link,
        channels: ['in_app', 'email'],
      }),
    })
  } catch (e) {
    console.error(`dispatch-notification failed for ${userId}:`, e)
  }
}

/**
 * Threshold-specific dedup: checks whether this exact key has EVER been logged,
 * regardless of when. This ensures each threshold (d7, d14) fires exactly once
 * per policy/user — safe to run the cron many times a day without resending.
 */
async function isDedupHit(supabase: any, dedupKey: string): Promise<boolean> {
  const { data } = await supabase
    .from('audit_logs')
    .select('id')
    .eq('entity_id', dedupKey)
    .eq('module', 'hr_policy_reminder')
    .limit(1)
  return (data?.length ?? 0) > 0
}

async function logDedup(supabase: any, dedupKey: string, description: string) {
  await supabase.from('audit_logs').insert({
    module:      'hr_policy_reminder',
    action:      'send',
    entity_type: 'hr_policy_reminder',
    entity_id:   dedupKey,
    entity_name: description,
    description,
    success:     true,
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  // 1. Fetch all published policies with effective_date in the past
  const { data: policies, error: pErr } = await supabase
    .from('hr_policies')
    .select('id, title, version, effective_date, required_roles')
    .eq('status', 'published')
    .lte('effective_date', today.toISOString().slice(0, 10))

  if (pErr) {
    console.error('Failed to load policies:', pErr.message)
    return new Response(JSON.stringify({ error: pErr.message }), { status: 500, headers: corsHeaders })
  }

  // 2. Fetch all active employees with role + reports_to
  const { data: employees, error: eErr } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, reports_to')
    .eq('is_active', true)

  if (eErr) {
    console.error('Failed to load employees:', eErr.message)
    return new Response(JSON.stringify({ error: eErr.message }), { status: 500, headers: corsHeaders })
  }

  let reminded = 0
  let escalated = 0
  let skipped = 0

  for (const policy of (policies ?? [])) {
    const effectiveDate = new Date(policy.effective_date + 'T00:00:00Z')
    const daysPast = Math.floor((today.getTime() - effectiveDate.getTime()) / (1000 * 60 * 60 * 24))

    // Classify which threshold bucket this policy is in.
    // daysPast 7..13  → day-7 reminder (first crossing of the 7-day mark)
    // daysPast ≥14    → day-14 escalation (first crossing of the 14-day mark)
    // Below 7         → not yet due, skip entirely
    const isReminderBucket   = daysPast >= REMINDER_DAY   && daysPast < ESCALATION_DAY
    const isEscalationBucket = daysPast >= ESCALATION_DAY

    if (!isReminderBucket && !isEscalationBucket) { skipped++; continue }

    // 3. Filter employees who should acknowledge this policy
    const targetEmployees = (employees ?? []).filter((emp: any) => {
      if (!policy.required_roles || policy.required_roles.length === 0) return true
      return policy.required_roles.some((r: string) => r.toLowerCase() === (emp.role ?? '').toLowerCase())
    })

    // 4. Exclude employees who already acknowledged this version
    const { data: acks } = await supabase
      .from('hr_policy_acknowledgements')
      .select('user_id')
      .eq('policy_id', policy.id)
      .eq('policy_version', policy.version)

    const ackedUserIds = new Set((acks ?? []).map((a: any) => a.user_id))

    for (const emp of targetEmployees) {
      if (ackedUserIds.has(emp.id)) continue

      // Threshold-specific dedup key — permanent, no time window.
      // d7 key is written when the day-7 reminder fires; subsequent daily
      // cron runs find the key and skip, so the reminder is sent exactly once.
      const threshold  = isEscalationBucket ? 'd14' : 'd7'
      const dedupKey   = `hr-policy-reminder:${policy.id}:${emp.id}:${threshold}`
      const alreadySent = await isDedupHit(supabase, dedupKey)
      if (alreadySent) { skipped++; continue }

      // Employee-accessible link: their own profile page → Policies tab
      const empLink     = `${APP_URL}/users/${emp.id}`
      // Manager-facing admin link for compliance
      const adminLink   = `${APP_URL}/hr?tab=policy-library`

      if (isReminderBucket) {
        await sendNotification(
          emp.id,
          `Policy acknowledgement required: ${policy.title}`,
          `Please read and acknowledge the "${policy.title}" policy (v${policy.version}). Your acknowledgement is now 7+ days overdue. Click to open your profile and complete it.`,
          empLink,
        )
        await logDedup(supabase, dedupKey, `Day-7 reminder: ${policy.title} → ${emp.full_name}`)
        reminded++
      } else {
        // Day 14 — remind employee and escalate to manager
        await sendNotification(
          emp.id,
          `OVERDUE: Policy acknowledgement required — ${policy.title}`,
          `You have not acknowledged the "${policy.title}" policy (v${policy.version}). This is 14+ days overdue and your manager has been notified. Please sign off immediately.`,
          empLink,
        )
        await logDedup(supabase, dedupKey, `Day-14 escalation: ${policy.title} → ${emp.full_name}`)
        escalated++

        // Escalate to manager — also dedup'd permanently per emp per policy
        if (emp.reports_to) {
          const mgrKey = `hr-policy-reminder:${policy.id}:${emp.id}:manager:d14`
          const mgrHit = await isDedupHit(supabase, mgrKey)
          if (!mgrHit) {
            await sendNotification(
              emp.reports_to,
              `Action required: ${emp.full_name} has not acknowledged "${policy.title}"`,
              `Your team member ${emp.full_name} has not acknowledged the "${policy.title}" policy (v${policy.version}) after 14 days. Please follow up. View compliance in HR Hub.`,
              adminLink,
            )
            await logDedup(supabase, mgrKey, `Manager escalation: ${policy.title} → ${emp.full_name} (mgr: ${emp.reports_to})`)
          }
        }
      }
    }
  }

  return new Response(
    JSON.stringify({ reminded, escalated, skipped, policies: (policies ?? []).length }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
