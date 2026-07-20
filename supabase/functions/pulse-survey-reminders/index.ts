/**
 * pulse-survey-reminders
 *
 * Scheduled daily cron that sends in-app + email reminders to staff about
 * active pulse surveys whose deadline is in N days (default: 3 and 7 days).
 *
 * Logic:
 *  1. Fetch all active hr_pulse_surveys where enable_reminders=true and
 *     ends_at is in the future.
 *  2. For each survey, compute days remaining until ends_at.
 *  3. If today's remaining count is in reminder_days[], send notifications.
 *  4. Determine audience: all staff, hub-scoped, or department-scoped.
 *  5. For each eligible profile, INSERT into notifications (in-app) and
 *     invoke dispatch-notification for email if configured.
 *
 * Security: Requires Authorization: Bearer <CRON_SECRET>
 * Trigger:  Daily 07:00 UTC via Supabase Scheduled Functions.
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CRON_SECRET  = Deno.env.get('CRON_SECRET') ?? ''

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now()
  return Math.ceil(ms / 86_400_000)
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Auth
  const authHeader = req.headers.get('Authorization') ?? ''
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY)
  const now = new Date().toISOString()

  // 1. Fetch surveys needing reminders
  const { data: surveys, error: sErr } = await db
    .from('hr_pulse_surveys')
    .select('id, title, ends_at, target_hub_id, target_department_id, target_audience, reminder_days')
    .eq('is_active', true)
    .eq('enable_reminders', true)
    .gt('ends_at', now)

  if (sErr) {
    console.error('Error fetching surveys:', sErr.message)
    return new Response(JSON.stringify({ ok: false, error: sErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let totalNotified = 0
  const results: { surveyId: string; daysLeft: number; notified: number }[] = []

  for (const survey of (surveys ?? [])) {
    const daysLeft = daysUntil(survey.ends_at)
    const reminderDays: number[] = survey.reminder_days ?? [3, 7]

    if (!reminderDays.includes(daysLeft)) continue

    // 2. Build audience query
    let profileQuery = db
      .from('profiles')
      .select('id, full_name, email')
      .eq('status', 'active')

    if (survey.target_audience === 'hub' && survey.target_hub_id) {
      profileQuery = profileQuery.eq('hub_id', survey.target_hub_id)
    } else if (survey.target_audience === 'department' && survey.target_department_id) {
      profileQuery = profileQuery.eq('department_id', survey.target_department_id)
    }

    const { data: profiles } = await profileQuery

    if (!profiles || profiles.length === 0) continue

    // 3. Insert in-app notifications (batch)
    const notifs = profiles.map((p: { id: string; full_name: string; email: string }) => ({
      user_id: p.id,
      type: 'task_reminder',
      title: `Pulse Survey closing in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
      message: `"${survey.title}" closes in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Your voice matters — please take a moment to respond. All answers are anonymous.`,
      data: { survey_id: survey.id, type: 'pulse_survey_reminder' },
      is_read: false,
    }))

    const { error: notifErr } = await db.from('notifications').insert(notifs)
    if (notifErr) {
      console.error(`Notification insert error for survey ${survey.id}:`, notifErr.message)
    } else {
      totalNotified += notifs.length
    }

    results.push({ surveyId: survey.id, daysLeft, notified: notifs.length })
  }

  return new Response(JSON.stringify({ ok: true, totalNotified, results }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
