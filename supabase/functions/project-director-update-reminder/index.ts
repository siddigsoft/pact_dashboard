/**
 * project-director-update-reminder
 *
 * Daily cron: reminds project teams when the current reporting cycle is ending
 * and no submitted/validated director update exists; also pings validators when
 * submissions are waiting.
 *
 * Security: Authorization: Bearer <CRON_SECRET>
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, APP_URL
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

type Cadence = 'weekly' | 'biweekly'

function isoWeekParts(now = new Date()) {
  const t = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  const year = t.getUTCFullYear()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  return { year, week, monday }
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function currentCycle(cadence: Cadence) {
  const { year, week, monday } = isoWeekParts()
  if (cadence === 'biweekly') {
    const startWeek = week % 2 === 1 ? week : week - 1
    const endWeek = startWeek + 1
    const startMonday = new Date(monday)
    if (week % 2 === 0) startMonday.setDate(monday.getDate() - 7)
    const endSunday = new Date(startMonday)
    endSunday.setDate(startMonday.getDate() + 13)
    return {
      period: `${year}-W${String(startWeek).padStart(2, '0')}/${String(endWeek).padStart(2, '0')}`,
      end: isoDate(endSunday),
      label: `Weeks ${startWeek}–${endWeek}, ${year}`,
    }
  }
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return {
    period: `${year}-W${String(week).padStart(2, '0')}`,
    end: isoDate(sunday),
    label: `Week ${week}, ${year}`,
  }
}

function daysUntil(iso: string) {
  const end = new Date(`${iso}T23:59:59Z`).getTime()
  const now = Date.now()
  return Math.ceil((end - now) / 86400000)
}

function teamIds(team: Record<string, unknown> | null): string[] {
  const ids = new Set<string>()
  if (!team) return []
  const pm = team.projectManager
  if (typeof pm === 'string' && pm) ids.add(pm)
  for (const m of Array.isArray(team.members) ? team.members : []) {
    if (typeof m === 'string' && m) ids.add(m)
  }
  for (const m of Array.isArray(team.teamComposition) ? team.teamComposition : []) {
    const uid = (m as { userId?: string })?.userId
    if (uid) ids.add(uid)
  }
  return Array.from(ids)
}

async function dispatch(body: Record<string, unknown>) {
  await fetch(`${SUPABASE_URL}/functions/v1/dispatch-notification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(body),
  }).catch((err) => console.warn('[pdu-reminder] dispatch failed', err))
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret) {
    return new Response(JSON.stringify({ ok: false, error: 'CRON_SECRET not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if ((req.headers.get('Authorization') ?? '') !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY)
  const today = isoDate(new Date())
  const lookback22h = new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString()

  const { data: projects, error } = await sb
    .from('projects')
    .select('id, name, project_code, reporting_cadence, team, status, archived')
    .in('status', ['draft', 'active', 'onHold'])
    .or('archived.is.null,archived.eq.false')

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let dueReminders = 0
  let skipped = 0
  let validationPings = 0

  for (const p of projects ?? []) {
    const cadence: Cadence = p.reporting_cadence === 'biweekly' ? 'biweekly' : 'weekly'
    const cycle = currentCycle(cadence)
    const remaining = daysUntil(cycle.end)
    // Remind on cycle-end day and the day before
    if (remaining > 1 || remaining < 0) continue

    const { data: existing } = await sb
      .from('project_director_updates')
      .select('id, status')
      .eq('project_id', p.id)
      .eq('reporting_period', cycle.period)
      .maybeSingle()

    if (existing && (existing.status === 'submitted' || existing.status === 'validated')) {
      skipped++
      continue
    }

    // Dedup: skip if we already logged a reminder in the last 22h
    const { data: recent } = await sb
      .from('audit_logs')
      .select('id')
      .eq('entity_type', 'project_director_update_reminder')
      .eq('entity_id', p.id)
      .gte('created_at', lookback22h)
      .limit(1)

    if (recent?.length) {
      skipped++
      continue
    }

    const recipients = teamIds(p.team as Record<string, unknown> | null)
    if (recipients.length === 0) {
      skipped++
      continue
    }

    const label = p.project_code ? `${p.name} (${p.project_code})` : p.name
    await dispatch({
      event_type: 'project_director_update_due',
      recipient_ids: recipients,
      title_en: remaining <= 0 ? 'Director update due today' : 'Director update due tomorrow',
      title_ar: remaining <= 0 ? 'تحديث مدير المشروع مستحق اليوم' : 'تحديث مدير المشروع مستحق غداً',
      message_en: `${label} — ${cycle.label} ends ${cycle.end}. Submit the director update at ${APP_URL}/project-updates`,
      message_ar: `${label} — ${cycle.label}. أرسل التحديث عبر ${APP_URL}/project-updates`,
      priority: remaining <= 0 ? 'high' : 'normal',
      entity_type: 'project',
      entity_id: p.id,
      action_url: '/project-updates',
      metadata: { reporting_period: cycle.period, cadence },
    })

    await sb.from('audit_logs').insert({
      module: 'project_director_update_reminder',
      action: 'send',
      entity_type: 'project_director_update_reminder',
      entity_id: p.id,
      entity_name: label.substring(0, 200),
      description: `Director update due reminder for ${cycle.period}`,
      success: true,
      actor_id: 'system',
      actor_name: 'Director Update Reminder Cron',
      metadata: { reporting_period: cycle.period, sent_on: today },
    }).catch(() => {/* non-fatal */})

    dueReminders++
  }

  // Pending validations — one digest to Implementation roles
  const periods = [currentCycle('weekly').period, currentCycle('biweekly').period]
  const { count } = await sb
    .from('project_director_updates')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'submitted')
    .in('reporting_period', periods)

  if ((count ?? 0) > 0) {
    await dispatch({
      event_type: 'project_director_update_validation_pending',
      recipient_roles: ['admin', 'Admin', 'superAdmin', 'super_admin', 'fom', 'countryDirector'],
      title_en: `${count} director update(s) awaiting validation`,
      title_ar: `${count} تحديث(ات) مدير مشروع بانتظار التحقق`,
      message_en: `Open ${APP_URL}/project-updates and filter To review.`,
      message_ar: `افتح ${APP_URL}/project-updates وراجع التحديثات المقدمة.`,
      priority: 'high',
      entity_type: 'project_director_update',
      action_url: '/project-updates',
      metadata: { pending_count: count },
    })
    validationPings = 1
  }

  return new Response(JSON.stringify({
    ok: true,
    summary: { dueReminders, skipped, validationPings, projectsScanned: (projects ?? []).length },
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
