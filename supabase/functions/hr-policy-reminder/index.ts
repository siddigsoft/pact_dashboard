/**
 * hr-policy-reminder
 *
 * Scheduled daily cron (07:00 UTC) that sends acknowledgement reminders
 * for hr_policies that have been published but not yet acknowledged.
 *
 * Logic:
 *   1. Find all published policies with an effective_date in the past.
 *   2. For each such policy, find employees who should acknowledge it
 *      (required_roles empty = all employees; otherwise role must match).
 *   3. Exclude employees who already have an acknowledgement matching
 *      the current policy version.
 *   4. Send in-app notification at Day 7 and Day 14 after effective_date.
 *   5. At Day 14, also notify the employee's manager (reports_to).
 *   6. Dedup via audit_logs: key = "hr-policy-reminder:<policy_id>:<user_id>:<day>"
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

// Days-after-effective-date thresholds
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

async function sendNotification(supabase: any, userId: string, title: string, message: string, link: string) {
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

async function isDedupHit(supabase: any, dedupKey: string): Promise<boolean> {
  const { data } = await supabase
    .from('audit_logs')
    .select('id')
    .eq('entity_id', dedupKey)
    .eq('module', 'hr_policy_reminder')
    .gte('created_at', new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString())
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

    // Only fire at exact day thresholds (±1 day window for cron jitter)
    const isReminderDay   = daysPast >= REMINDER_DAY   && daysPast < ESCALATION_DAY
    const isEscalationDay = daysPast >= ESCALATION_DAY

    if (!isReminderDay && !isEscalationDay) { skipped++; continue }

    // 3. Filter employees who should acknowledge this policy
    const targetEmployees = (employees ?? []).filter((emp: any) => {
      if (!policy.required_roles || policy.required_roles.length === 0) return true
      return policy.required_roles.includes(emp.role)
    })

    // 4. Fetch existing acknowledgements for this policy version
    const { data: acks } = await supabase
      .from('hr_policy_acknowledgements')
      .select('user_id')
      .eq('policy_id', policy.id)
      .eq('policy_version', policy.version)

    const ackedUserIds = new Set((acks ?? []).map((a: any) => a.user_id))

    for (const emp of targetEmployees) {
      if (ackedUserIds.has(emp.id)) continue

      const dayKey    = isEscalationDay ? `d${ESCALATION_DAY}` : `d${REMINDER_DAY}`
      const dedupKey  = `hr-policy-reminder:${policy.id}:${emp.id}:${dayKey}`
      const alreadySent = await isDedupHit(supabase, dedupKey)
      if (alreadySent) { skipped++; continue }

      const policyLink = `${APP_URL}/hr?tab=policy-library`

      if (isReminderDay) {
        await sendNotification(
          supabase, emp.id,
          `Policy acknowledgement required: ${policy.title}`,
          `Please read and acknowledge the "${policy.title}" policy (v${policy.version}). This acknowledgement is now 7+ days overdue.`,
          policyLink,
        )
        await logDedup(supabase, dedupKey, `Day-7 reminder: ${policy.title} → ${emp.full_name}`)
        reminded++
      } else {
        // Day 14 — send to employee + escalate to manager
        await sendNotification(
          supabase, emp.id,
          `OVERDUE: Policy acknowledgement required — ${policy.title}`,
          `You have not acknowledged the "${policy.title}" policy (v${policy.version}). This is now 14+ days overdue and has been escalated to your manager.`,
          policyLink,
        )
        await logDedup(supabase, dedupKey, `Day-14 escalation: ${policy.title} → ${emp.full_name}`)
        escalated++

        // Escalate to manager
        if (emp.reports_to) {
          const managerKey  = `hr-policy-reminder:${policy.id}:${emp.id}:manager:${dayKey}`
          const managerHit  = await isDedupHit(supabase, managerKey)
          if (!managerHit) {
            await sendNotification(
              supabase, emp.reports_to,
              `Action required: ${emp.full_name} has not acknowledged "${policy.title}"`,
              `Your team member ${emp.full_name} has not acknowledged the "${policy.title}" policy (v${policy.version}) after 14 days. Please follow up.`,
              policyLink,
            )
            await logDedup(supabase, managerKey, `Manager escalation: ${policy.title} → ${emp.full_name} (mgr: ${emp.reports_to})`)
          }
        }
      }
    }
  }

  return new Response(JSON.stringify({ reminded, escalated, skipped, policies: (policies ?? []).length }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
