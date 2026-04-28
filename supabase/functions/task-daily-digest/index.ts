/**
 * task-daily-digest
 *
 * Edge Function that sends each user a daily summary of their
 * pending personal tasks (including overdue/due-today project field tasks).
 *
 * Security: Requires `Authorization: Bearer <CRON_SECRET>` header.
 *
 * Trigger: Scheduled daily (07:00 UTC) via Supabase Scheduled Functions.
 *
 * Env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL, CRON_SECRET
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.pactorg.com'

// ── Typed row shapes ─────────────────────────────────────────────────────────

interface Profile {
  id: string
  full_name: string | null
  email: string | null
  task_digest_opt_out: boolean | null
}

interface PersonalTaskRow {
  id: string
  title: string
  priority: string | null
  status: string
  due_date: string | null
  completion_reward_amount: number | null
  completion_reward_currency: string | null
  recurrence: string | null
}

interface ProjectFieldTaskRow {
  id: string
  title: string
  priority: string | null
  status: string
  due_date: string | null
  project_id: string | null
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isOverdue(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false
  const d = new Date(dueDate)
  d.setHours(23, 59, 59, 999)
  return d < new Date()
}

function isDueToday(dueDate: string | null | undefined, todayStr: string): boolean {
  if (!dueDate) return false
  return dueDate.startsWith(todayStr) && !isOverdue(dueDate)
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }
  catch { return '' }
}

// ── Handler ─────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Security: verify CRON_SECRET — reject if secret is not configured or token mismatch
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (token !== cronSecret) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Fetch all active users who have not opted out of the task digest
    const { data: profiles } = await sb
      .from('profiles')
      .select('id, full_name, email, task_digest_opt_out')
      .eq('status', 'active')
      .neq('task_digest_opt_out', true)

    if (!profiles?.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Single timestamp for the entire run — prevents cross-midnight drift (#61)
    const runAt = new Date()
    const today = runAt.toISOString().split('T')[0]
    let sent = 0
    let skipped = 0

    for (const rawProfile of profiles) {
      const profile = rawProfile as Profile
      if (!profile.email) { skipped++; continue }

      // Fetch pending personal tasks for this user
      const { data: rawTasks } = await sb
        .from('personal_tasks')
        .select('id, title, priority, status, due_date, completion_reward_amount, completion_reward_currency, recurrence')
        .or(`assigned_to.eq.${profile.id},and(user_id.eq.${profile.id},assigned_to.is.null)`)
        .not('status', 'in', '("done","cancelled")')
        .is('parent_task_id', null)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(30)

      const tasks: PersonalTaskRow[] = (rawTasks ?? []) as PersonalTaskRow[]

      // Fetch overdue and due-today project field tasks for this user
      const { data: rawProjectTasks } = await sb
        .from('project_field_tasks')
        .select('id, title, priority, status, due_date, project_id')
        .eq('assigned_to', profile.id)
        .not('status', 'in', '("done","cancelled")')
        .not('due_date', 'is', null)
        .lte('due_date', today)
        .order('due_date', { ascending: true })
        .limit(20)

      const projectTasks: ProjectFieldTaskRow[] = (rawProjectTasks ?? []) as ProjectFieldTaskRow[]

      if (!tasks.length && !projectTasks.length) { skipped++; continue }

      const overduePT   = tasks.filter(t => isOverdue(t.due_date))
      const dueTodayPT  = tasks.filter(t => isDueToday(t.due_date, today))
      const upcomingPT  = tasks.filter(t => t.due_date && !t.due_date.startsWith(today) && !isOverdue(t.due_date))
      const noDuePT     = tasks.filter(t => !t.due_date)
      const recurringPT = tasks.filter(t => t.recurrence && t.recurrence !== 'none')

      const overdueProj  = projectTasks.filter(t => isOverdue(t.due_date))
      const dueTodayProj = projectTasks.filter(t => isDueToday(t.due_date, today))

      // Build email body
      const lines: string[] = []
      lines.push(`Good morning, ${profile.full_name ?? 'there'}!`)
      lines.push(`Here's your task summary for today (${runAt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}):`)
      lines.push('')

      if (overduePT.length > 0) {
        lines.push(`🔴 OVERDUE PERSONAL TASKS (${overduePT.length}):`)
        overduePT.slice(0, 5).forEach(t => {
          lines.push(`  • ${t.title} — due ${formatDate(t.due_date)}`)
        })
        if (overduePT.length > 5) lines.push(`  … and ${overduePT.length - 5} more`)
        lines.push('')
      }

      if (overdueProj.length > 0) {
        lines.push(`🔴 OVERDUE PROJECT TASKS (${overdueProj.length}):`)
        overdueProj.slice(0, 5).forEach(t => {
          lines.push(`  • ${t.title} — due ${formatDate(t.due_date)}`)
        })
        if (overdueProj.length > 5) lines.push(`  … and ${overdueProj.length - 5} more`)
        lines.push('')
      }

      if (dueTodayPT.length > 0) {
        lines.push(`🟡 DUE TODAY — PERSONAL (${dueTodayPT.length}):`)
        dueTodayPT.forEach(t => {
          const reward = t.completion_reward_amount ? ` (+${t.completion_reward_currency ?? 'USD'} ${t.completion_reward_amount})` : ''
          lines.push(`  • ${t.title}${reward}`)
        })
        lines.push('')
      }

      if (dueTodayProj.length > 0) {
        lines.push(`🟡 DUE TODAY — PROJECT TASKS (${dueTodayProj.length}):`)
        dueTodayProj.forEach(t => {
          lines.push(`  • ${t.title}`)
        })
        lines.push(`  → View in projects: ${APP_URL}/projects`)
        lines.push('')
      }

      if (upcomingPT.length > 0) {
        lines.push(`📅 UPCOMING (${upcomingPT.length}):`)
        upcomingPT.slice(0, 5).forEach(t => {
          lines.push(`  • ${t.title} — due ${formatDate(t.due_date)}`)
        })
        if (upcomingPT.length > 5) lines.push(`  … and ${upcomingPT.length - 5} more`)
        lines.push('')
      }

      if (recurringPT.length > 0) {
        lines.push(`🔁 RECURRING TASKS (${recurringPT.length}):`)
        recurringPT.slice(0, 3).forEach(t => {
          lines.push(`  • [${t.recurrence}] ${t.title}`)
        })
        lines.push('')
      }

      if (noDuePT.length > 0) {
        const preview = noDuePT.slice(0, 3).map(t => t.title).join(', ')
        const extra = noDuePT.length > 3 ? ` + ${noDuePT.length - 3} more` : ''
        lines.push(`📌 NO DUE DATE (${noDuePT.length}): ${preview}${extra}`)
        lines.push('')
      }

      lines.push(`View all tasks: ${APP_URL}/my-tasks`)

      const bodyText = lines.join('\n')
      const htmlBody = `<pre style="font-family:sans-serif;font-size:14px;line-height:1.6;white-space:pre-wrap">${bodyText}</pre>`

      const totalPending = tasks.length
      const totalOverdue = overduePT.length + overdueProj.length

      // Send email
      try {
        const { error } = await sb.functions.invoke('send-email', {
          body: {
            to: profile.email,
            subject: `📋 Your Daily Task Digest — ${runAt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`,
            html: htmlBody,
          },
        })
        if (!error) {
          sent++
          // In-app notification
          await sb.from('notifications').insert({
            event_type: 'task_digest',
            entity_type: 'personal_task',
            entity_id: profile.id,
            recipient_id: profile.id,
            triggered_by: profile.id,
            title_en: 'Daily Task Digest',
            title_ar: 'ملخص المهام اليومية',
            message_en: `You have ${totalPending} pending task${totalPending !== 1 ? 's' : ''}${totalOverdue > 0 ? ` (${totalOverdue} overdue)` : ''}.`,
            message_ar: `لديك ${totalPending} مهمة معلّقة${totalOverdue > 0 ? ` (${totalOverdue} متأخرة)` : ''}.`,
            priority: totalOverdue > 0 ? 'high' : 'medium',
            status: 'unread',
            action_url: '/my-tasks',
          })
        } else {
          skipped++
        }
      } catch {
        skipped++
      }
    }

    return new Response(
      JSON.stringify({ ok: true, sent, skipped }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
