/**
 * task-dependency-reminder-cron
 *
 * Scheduled function that pings users who are blocking a started task by an
 * unconfirmed Start dependency. Models after task-daily-digest / escalation-check.
 *
 * Logic:
 *   1. Pull every personal_task with status='inprogress' and a non-empty
 *      `start_dependencies` jsonb where at least one entry has confirmed=false
 *      and a userId.
 *   2. For each pending dep, insert a single notification per (taskId, depUserId)
 *      per day — relies on the natural UNIQUE constraint on
 *      (recipient_id, event_type, entity_type, entity_id, dedupe_key) when
 *      present, otherwise we self-deduplicate by checking for an existing
 *      notification of the same event_type/entity in the last 22 hours.
 *   3. Skip when the depended-on user is the assignee themselves.
 *
 * Security: Requires `Authorization: Bearer <CRON_SECRET>` header.
 *
 * Trigger: Scheduled daily (08:00 UTC) via Supabase Scheduled Functions.
 *
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL, CRON_SECRET
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.pactorg.com'

interface StartDep {
  label?: string
  kind?: string
  userId?: string | null
  userName?: string | null
  confirmed?: boolean
}

interface TaskRow {
  id: string
  title: string
  assigned_to: string | null
  user_id: string
  start_dependencies: StartDep[] | null
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // ── Auth check ────────────────────────────────────────────────────────────
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret) {
    return new Response(JSON.stringify({ ok: false, error: 'CRON_SECRET not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const authHeader = req.headers.get('Authorization') ?? ''
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // ── Pull every in-progress task that declared start dependencies ──────────
  const { data: tasks, error: taskErr } = await sb
    .from('personal_tasks')
    .select('id, title, assigned_to, user_id, start_dependencies')
    .eq('status', 'inprogress')
    .not('start_dependencies', 'is', null)

  if (taskErr) {
    return new Response(JSON.stringify({ ok: false, error: taskErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const rows = (tasks ?? []) as TaskRow[]
  if (rows.length === 0) {
    return new Response(JSON.stringify({ ok: true, tasks_scanned: 0, reminders_sent: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Look back 22h to avoid double-pinging when the cron runs slightly drifted
  const lookbackIso = new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString()

  let remindersSent = 0
  let skippedAlreadyPinged = 0
  let skippedNoDeps = 0

  for (const t of rows) {
    const deps = Array.isArray(t.start_dependencies) ? t.start_dependencies : []
    const pending = deps.filter(d => d && d.confirmed === false && d.userId)
    if (pending.length === 0) { skippedNoDeps += 1; continue }

    // De-duplicate inside one task — same user might appear in multiple deps
    const byUser = new Map<string, StartDep[]>()
    for (const d of pending) {
      if (!d.userId) continue
      // Don't ping the assignee themselves about a dep on themselves
      if (d.userId === t.assigned_to || d.userId === t.user_id) continue
      const list = byUser.get(d.userId) ?? []
      list.push(d)
      byUser.set(d.userId, list)
    }

    for (const [recipientId, depList] of byUser.entries()) {
      // Self-dedup: did we already send a reminder to this user for this task today?
      const { count: existing } = await sb
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', recipientId)
        .eq('event_type', 'task_dependency_reminder')
        .eq('entity_type', 'personal_task')
        .eq('entity_id', t.id)
        .gte('created_at', lookbackIso)

      if ((existing ?? 0) > 0) { skippedAlreadyPinged += 1; continue }

      const labels = depList.map(d => d.label ?? '(unlabelled)').join(', ')

      const { error: insErr } = await sb.from('notifications').insert({
        recipient_id: recipientId,
        event_type: 'task_dependency_reminder',
        entity_type: 'personal_task',
        entity_id: t.id,
        triggered_by: null,
        title_en: 'Reminder: someone is waiting on you',
        title_ar: 'تذكير: هناك من ينتظرك',
        message_en: `You are blocking task "${t.title}" on: ${labels}. Please confirm or update the requester.`,
        message_ar: `أنت تعيق مهمة "${t.title}" بسبب: ${labels}. الرجاء التأكيد أو إبلاغ صاحب الطلب.`,
        priority: 'normal',
        action_url: `${APP_URL}/tasks/${t.id}`,
      })

      if (!insErr) remindersSent += 1
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      tasks_scanned: rows.length,
      reminders_sent: remindersSent,
      skipped_already_pinged: skippedAlreadyPinged,
      skipped_no_pending_deps: skippedNoDeps,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
