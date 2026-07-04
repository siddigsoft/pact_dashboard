/**
 * project-stage-deadline-reminder
 *
 * Scheduled daily cron that sends in-app + email reminders for Project Flow
 * stages that have a deadline (`dueDate` in `custom_flow_stages`) approaching
 * or already passed.
 *
 * Logic:
 *   1. Pull all non-archived projects with a `custom_flow_stages` array and a
 *      status of draft/active/onHold (skip completed/cancelled projects).
 *   2. For each stage entry that has a `dueDate`, is not `skipped`, and is not
 *      already completed (per `project_flow_log`), compute days remaining.
 *   3. Upcoming reminders fire at 3 days before, 1 day before, and on the due
 *      date itself. Once past the due date, an overdue reminder re-fires once
 *      per day until the stage is completed.
 *   4. Dedup: skip if a reminder was already sent for this project+stage in
 *      the last 22h (tracked via `audit_logs`).
 *   5. Recipients: stage assignees (`project_stage_assignees`); falls back to
 *      the project's team (project manager + members + team composition) if
 *      no explicit stage assignees exist.
 *   6. Delivery is routed through the `dispatch-notification` edge function
 *      (event: `project_stage_deadline_reminder`) so it lands in-app + email,
 *      matching how stage assignment / task assignment notifications work.
 *
 * Security: Requires `Authorization: Bearer <CRON_SECRET>` header.
 * Trigger:  Scheduled daily via Supabase Scheduled Functions / pg_cron.
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, APP_URL
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.pactorg.com'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// Days-before-deadline thresholds that trigger an "upcoming" reminder.
const UPCOMING_THRESHOLDS = [3, 1, 0]

interface CustomStageEntry {
  id: string
  skipped?: boolean
  customLabel?: string
  dueDate?: string | null
  plannedEnd?: string | null
  isMilestone?: boolean
}

interface ProjectRow {
  id: string
  name: string
  status: string
  archived: boolean | null
  custom_flow_stages: CustomStageEntry[] | null
  team: { projectManager?: string; members?: string[]; teamComposition?: { userId?: string }[] } | null
}

function titleCaseFromId(id: string): string {
  return id
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function teamMemberIds(team: ProjectRow['team']): string[] {
  const ids = new Set<string>()
  if (!team) return []
  if (team.projectManager) ids.add(team.projectManager)
  ;(Array.isArray(team.members) ? team.members : []).forEach((m) => m && ids.add(m))
  ;(Array.isArray(team.teamComposition) ? team.teamComposition : []).forEach((m) => m?.userId && ids.add(m.userId))
  return Array.from(ids)
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // ── Auth ──────────────────────────────────────────────────────────────────
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret) {
    return new Response(JSON.stringify({ ok: false, error: 'CRON_SECRET not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const authHeader = req.headers.get('Authorization') ?? ''
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY)

  // ── Fetch candidate projects ─────────────────────────────────────────────
  const { data: projects, error: fetchErr } = await sb
    .from('projects')
    .select('id, name, status, archived, custom_flow_stages, team')
    .in('status', ['draft', 'active', 'onHold'])
    .or('archived.is.null,archived.eq.false')

  if (fetchErr) {
    return new Response(JSON.stringify({ ok: false, error: fetchErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const now = new Date()
  const lookback22h = new Date(now.getTime() - 22 * 60 * 60 * 1000).toISOString()

  let stagesScanned = 0
  let remindersSent = 0
  let skippedAlready = 0
  let skippedNoMatch = 0
  let skippedNoRecipients = 0

  for (const project of ((projects ?? []) as ProjectRow[])) {
    const stages = Array.isArray(project.custom_flow_stages) ? project.custom_flow_stages : []
    if (stages.length === 0) continue

    // Which stages are already completed for this project?
    const { data: logRows } = await sb
      .from('project_flow_log')
      .select('stage_id')
      .eq('project_id', project.id)
    const completedStageIds = new Set((logRows ?? []).map((r: { stage_id: string }) => r.stage_id))

    for (const stage of stages) {
      if (stage.skipped) continue
      if (completedStageIds.has(stage.id)) continue

      const dueDateStr = stage.dueDate || stage.plannedEnd
      if (!dueDateStr) continue

      const deadline = new Date(dueDateStr)
      if (isNaN(deadline.getTime())) continue

      stagesScanned++

      const msRemaining = deadline.getTime() - now.getTime()
      const daysRemaining = Math.round(msRemaining / 86_400_000)

      const isUpcomingMatch = UPCOMING_THRESHOLDS.includes(daysRemaining)
      const isOverdue = daysRemaining < 0
      if (!isUpcomingMatch && !isOverdue) {
        skippedNoMatch++
        continue
      }

      // ── Dedup: already reminded for this project+stage in the last 22h? ──
      const dedupKey = `${project.id}:${stage.id}`
      const { count: existing } = await sb
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('module', 'project_stage_reminder')
        .eq('entity_id', dedupKey)
        .gte('created_at', lookback22h)

      if ((existing ?? 0) > 0) {
        skippedAlready++
        continue
      }

      // ── Resolve recipients: stage assignees, else fall back to team ──────
      const { data: assigneeRows } = await sb
        .from('project_stage_assignees')
        .select('user_id')
        .eq('project_id', project.id)
        .eq('stage_id', stage.id)

      let recipientIds = (assigneeRows ?? []).map((r: { user_id: string }) => r.user_id).filter(Boolean)
      if (recipientIds.length === 0) {
        recipientIds = teamMemberIds(project.team)
      }
      if (recipientIds.length === 0) {
        skippedNoRecipients++
        continue
      }

      const stageLabel = stage.customLabel || titleCaseFromId(stage.id)
      const deadlineDateStr = deadline.toLocaleDateString('en-GB', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })

      const daysLabel = isOverdue
        ? `overdue by ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? '' : 's'}`
        : daysRemaining === 0
          ? 'due today'
          : daysRemaining === 1
            ? 'due tomorrow'
            : `due in ${daysRemaining} days`
      const daysLabelAr = isOverdue
        ? `متأخرة بـ ${Math.abs(daysRemaining)} يوم`
        : daysRemaining === 0
          ? 'مستحقة اليوم'
          : daysRemaining === 1
            ? 'مستحقة غداً'
            : `مستحقة خلال ${daysRemaining} أيام`

      const priority = isOverdue ? 'urgent' : daysRemaining <= 1 ? 'high' : 'normal'

      const titleEn = isOverdue
        ? `Stage "${stageLabel}" is overdue`
        : `Stage "${stageLabel}" deadline approaching`
      const titleAr = isOverdue
        ? `مرحلة "${stageLabel}" متأخرة`
        : `يقترب موعد مرحلة "${stageLabel}"`
      const messageEn = `Stage "${stageLabel}" in project "${project.name}" is ${daysLabel} (${deadlineDateStr}).`
      const messageAr = `مرحلة "${stageLabel}" في مشروع "${project.name}" ${daysLabelAr} (${deadlineDateStr}).`

      try {
        await fetch(`${SUPABASE_URL}/functions/v1/dispatch-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({
            event_type: 'project_stage_deadline_reminder',
            entity_type: 'project',
            entity_id: project.id,
            priority,
            recipient_ids: recipientIds,
            title_en: titleEn,
            title_ar: titleAr,
            message_en: messageEn,
            message_ar: messageAr,
            action_url: `${APP_URL}/projects/${project.id}?tab=flow`,
            send_email: true,
            metadata: {
              project_name: project.name,
              stage: stageLabel,
              due_date: deadlineDateStr,
              days_label: isOverdue ? daysLabel : daysLabel,
            },
          }),
        })
      } catch (e) {
        console.warn(`dispatch-notification failed for ${dedupKey}:`, e)
        continue
      }

      // ── Audit log (also used for dedup check) ───────────────────────────
      await sb.from('audit_logs').insert({
        module: 'project_stage_reminder',
        action: 'send',
        entity_type: 'project_stage',
        entity_id: dedupKey,
        entity_name: `${project.name} — ${stageLabel}`.substring(0, 200),
        description: `Stage deadline reminder sent — ${daysLabel}. Recipients: ${recipientIds.length}`,
        success: true,
        actor_id: 'system',
        actor_name: 'Stage Deadline Reminder Cron',
        metadata: {
          project_id: project.id,
          stage_id: stage.id,
          days_remaining: daysRemaining,
          recipients: recipientIds.length,
          due_date: dueDateStr,
        },
      })

      remindersSent++
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      stages_scanned: stagesScanned,
      reminders_sent: remindersSent,
      skipped_already_sent: skippedAlready,
      skipped_no_day_match: skippedNoMatch,
      skipped_no_recipients: skippedNoRecipients,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
