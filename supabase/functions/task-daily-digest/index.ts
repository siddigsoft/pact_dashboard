/**
 * task-daily-digest
 *
 * Edge Function that sends each user a daily summary of their
 * pending personal tasks and recurring tasks.
 *
 * Trigger: Scheduled daily (07:00 UTC) via pg_cron / Supabase Scheduled Functions,
 *          or manually via HTTP POST (admin use / testing).
 *
 * Env vars (auto-injected by Supabase):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   APP_URL (e.g. https://app.pactorg.com)
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.pactorg.com'

function isOverdue(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false
  return new Date(dueDate) < new Date()
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }
  catch { return '' }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Fetch all users who have not opted out of the task digest
    const { data: profiles } = await sb
      .from('profiles')
      .select('id, full_name, email, role, department_id, task_digest_opt_out')
      .eq('status', 'active')
      .neq('task_digest_opt_out', true)

    if (!profiles?.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: corsHeaders })
    }

    const today = new Date().toISOString().split('T')[0]
    let sent = 0
    let skipped = 0

    for (const profile of profiles) {
      if (!profile.email) { skipped++; continue }

      // Fetch pending personal tasks for this user
      const { data: tasks } = await sb
        .from('personal_tasks')
        .select('id, title, priority, status, due_date, completion_reward_amount, completion_reward_currency, recurrence, daily_task_date')
        .or(`assigned_to.eq.${profile.id},and(user_id.eq.${profile.id},assigned_to.is.null)`)
        .not('status', 'in', '("done","cancelled")')
        .is('parent_task_id', null)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(30)

      if (!tasks?.length) { skipped++; continue }

      const overdue   = tasks.filter((t: any) => isOverdue(t.due_date))
      const dueToday  = tasks.filter((t: any) => t.due_date?.startsWith(today) && !isOverdue(t.due_date))
      const upcoming  = tasks.filter((t: any) => t.due_date && !t.due_date.startsWith(today) && !isOverdue(t.due_date))
      const noDue     = tasks.filter((t: any) => !t.due_date)
      const recurring = tasks.filter((t: any) => t.recurrence && t.recurrence !== 'none')

      // Build plain-text / HTML body
      const lines: string[] = []
      lines.push(`Good morning, ${profile.full_name ?? 'there'}!`)
      lines.push(`Here's your task summary for today (${formatDate(today)}):`)
      lines.push('')

      if (overdue.length > 0) {
        lines.push(`🔴 OVERDUE (${overdue.length}):`)
        overdue.slice(0, 5).forEach((t: any) => {
          lines.push(`  • ${t.title} — due ${formatDate(t.due_date)}`)
        })
        if (overdue.length > 5) lines.push(`  … and ${overdue.length - 5} more`)
        lines.push('')
      }

      if (dueToday.length > 0) {
        lines.push(`🟡 DUE TODAY (${dueToday.length}):`)
        dueToday.forEach((t: any) => {
          const reward = t.completion_reward_amount ? ` (+${t.completion_reward_currency ?? 'USD'} ${t.completion_reward_amount})` : ''
          lines.push(`  • ${t.title}${reward}`)
        })
        lines.push('')
      }

      if (upcoming.length > 0) {
        lines.push(`📅 UPCOMING (${upcoming.length}):`)
        upcoming.slice(0, 5).forEach((t: any) => {
          lines.push(`  • ${t.title} — due ${formatDate(t.due_date)}`)
        })
        if (upcoming.length > 5) lines.push(`  … and ${upcoming.length - 5} more`)
        lines.push('')
      }

      if (recurring.length > 0) {
        lines.push(`🔁 RECURRING TASKS (${recurring.length}):`)
        recurring.slice(0, 3).forEach((t: any) => {
          lines.push(`  • [${t.recurrence}] ${t.title}`)
        })
        lines.push('')
      }

      if (noDue.length > 0) {
        lines.push(`📌 NO DUE DATE (${noDue.length}): ${noDue.slice(0, 3).map((t: any) => t.title).join(', ')}${noDue.length > 3 ? ` + ${noDue.length - 3} more` : ''}`)
        lines.push('')
      }

      lines.push(`View all tasks: ${APP_URL}/my-tasks`)

      const bodyText = lines.join('\n')
      const htmlBody = `<pre style="font-family:sans-serif;font-size:14px;line-height:1.6;white-space:pre-wrap">${bodyText}</pre>`

      // Send email via the send-email function
      try {
        const { error } = await sb.functions.invoke('send-email', {
          body: {
            to: profile.email,
            subject: `📋 Your Daily Task Digest — ${new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`,
            html: htmlBody,
          },
        })
        if (!error) {
          sent++
          // Also push an in-app notification
          await sb.from('notifications').insert({
            event_type: 'task_digest',
            entity_type: 'personal_task',
            entity_id: profile.id,
            recipient_id: profile.id,
            triggered_by: profile.id,
            title_en: 'Daily Task Digest',
            title_ar: 'ملخص المهام اليومية',
            message_en: `You have ${tasks.length} pending task${tasks.length > 1 ? 's' : ''}${overdue.length > 0 ? ` (${overdue.length} overdue)` : ''}.`,
            message_ar: `لديك ${tasks.length} مهمة معلّقة${overdue.length > 0 ? ` (${overdue.length} متأخرة)` : ''}.`,
            priority: overdue.length > 0 ? 'high' : 'medium',
            status: 'unread',
            action_url: '/my-tasks',
          })
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
