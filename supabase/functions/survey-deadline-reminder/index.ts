/**
 * survey-deadline-reminder
 *
 * Scheduled daily cron that sends email + WhatsApp reminders for active surveys
 * approaching their deadline (expires_at).
 *
 * Logic:
 *   1. Pull all active surveys where settings->>'reminder_enabled' = 'true'
 *      and settings->>'expires_at' is set and in the future.
 *   2. For each survey, compute how many days remain until the deadline.
 *   3. If today's day-count matches any value in settings->>'reminder_days_before'
 *      (comma-separated, e.g. "1,3,7"), send reminders.
 *   4. Dedup: skip if a reminder was already sent for this survey in the last 22h.
 *   5. Send email to settings->>'reminder_emails' (falls back to 'notify_emails').
 *   6. Send WhatsApp to settings->>'reminder_phones' (if configured).
 *
 * Security: Requires `Authorization: Bearer <CRON_SECRET>` header.
 * Trigger:  Scheduled daily 08:00 UTC via Supabase Scheduled Functions.
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

/**
 * Normalise a phone number to E.164 international format.
 *
 * Rules (applied after stripping spaces / dashes / parentheses):
 *   09xxxxxxxx  → +2499xxxxxxxx  (Sudan, Zain/MTN/Sudani 09x prefix)
 *   01xxxxxxxx  → +2491xxxxxxxx  (Sudan, 01x prefix)
 *   07xxxxxxxx  → +2567xxxxxxxx  (Uganda, 07x prefix)
 *   +…          → unchanged       (already international)
 *   anything else → unchanged
 */
function normalizePhone(raw: string): string {
  const p = raw.trim().replace(/[\s\-\(\)\.]/g, '')
  if (!p) return p
  if (p.startsWith('+')) return p
  if (p.startsWith('09') || p.startsWith('01')) return '+249' + p.slice(1)
  if (p.startsWith('07')) return '+256' + p.slice(1)
  return p
}

interface SurveyRow {
  id: string
  title: string
  title_ar: string | null
  short_code: string | null
  settings: Record<string, unknown>
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // ── Auth ────────────────────────────────────────────────────────────────────
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

  // ── Fetch active reminder surveys ────────────────────────────────────────────
  const { data: surveys, error: fetchErr } = await sb
    .from('surveys')
    .select('id, title, title_ar, short_code, settings')
    .eq('status', 'active')

  if (fetchErr) {
    return new Response(JSON.stringify({ ok: false, error: fetchErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const now = new Date()
  const lookback22h = new Date(now.getTime() - 22 * 60 * 60 * 1000).toISOString()

  let surveysScanned = 0
  let remindersSent = 0
  let skippedAlready = 0
  let skippedNoDayMatch = 0

  for (const survey of ((surveys ?? []) as SurveyRow[])) {
    const s = survey.settings ?? {}

    // Must have reminders enabled
    if (!s.reminder_enabled) continue

    // Must have a future expires_at
    const expiresAtStr = s.expires_at as string | null
    if (!expiresAtStr) continue
    const deadline = new Date(expiresAtStr)
    if (deadline <= now) continue

    surveysScanned++

    // How many full days remain (rounded)
    const msRemaining = deadline.getTime() - now.getTime()
    const daysRemaining = Math.round(msRemaining / 86_400_000)

    // Check if today matches a configured reminder day
    const configuredDays = String(s.reminder_days_before ?? '1,3,7')
      .split(',')
      .map(d => parseInt(d.trim(), 10))
      .filter(d => !isNaN(d))

    if (!configuredDays.includes(daysRemaining)) {
      skippedNoDayMatch++
      continue
    }

    // Dedup: already sent reminder for this survey in last 22h?
    const { count: existing } = await sb
      .from('audit_logs')
      .select('id', { count: 'exact', head: true })
      .eq('module', 'survey_reminder')
      .eq('entity_id', survey.id)
      .gte('created_at', lookback22h)

    if ((existing ?? 0) > 0) {
      skippedAlready++
      continue
    }

    const surveyUrl = `${APP_URL}/s/${survey.short_code ?? survey.id}`
    const deadlineDateStr = deadline.toLocaleDateString('en-GB', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })
    const daysLabel = daysRemaining === 0
      ? 'today'
      : daysRemaining === 1
        ? 'tomorrow'
        : `in ${daysRemaining} days`

    const titleEn = survey.title
    const titleAr = survey.title_ar ?? survey.title

    const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f9fafb;margin:0;padding:0;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
    <div style="background:#4f46e5;padding:28px 32px;">
      <p style="color:#e0e7ff;font-size:12px;margin:0 0 4px;">PACT Platform — Survey Reminder</p>
      <h1 style="color:#fff;font-size:20px;margin:0;line-height:1.3;">⏰ Survey Deadline Approaching</h1>
    </div>
    <div style="padding:28px 32px;">
      <p style="color:#374151;font-size:14px;margin:0 0 16px;">The following survey deadline is <strong>${daysLabel}</strong>:</p>
      <div style="background:#f0f4ff;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
        <p style="color:#4f46e5;font-size:16px;font-weight:700;margin:0 0 4px;">${titleEn}</p>
        ${titleAr !== titleEn ? `<p style="color:#6b7280;font-size:13px;direction:rtl;text-align:right;margin:4px 0 0;">${titleAr}</p>` : ''}
        <p style="color:#6b7280;font-size:12px;margin:8px 0 0;">Deadline: <strong>${deadlineDateStr}</strong> (${daysLabel})</p>
      </div>
      <p style="color:#6b7280;font-size:13px;margin:0 0 20px;">Please make sure to submit your response before the deadline. After it closes, the survey will no longer accept responses.</p>
      <a href="${surveyUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;">Fill Out Survey →</a>
    </div>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;" />
    <div style="padding:16px 32px;background:#f9fafb;">
      <p style="color:#9ca3af;font-size:11px;margin:0;text-align:center;">This is an automatic reminder from PACT Command Center.</p>
      <p dir="rtl" style="color:#9ca3af;font-size:11px;margin:6px 0 0;text-align:center;">تذكير تلقائي من منصة PACT — الموعد النهائي للاستبيان يقترب</p>
    </div>
  </div>
</body>
</html>`

    // ── Email recipients ────────────────────────────────────────────────────────
    const rawEmails = String(s.reminder_emails || s.notify_emails || '')
    const emails = rawEmails.split(',').map(e => e.trim()).filter(e => e.includes('@'))

    let emailOk = 0
    for (const to of emails) {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({
            to,
            subject: `⏰ Reminder: "${titleEn}" closes ${daysLabel} — PACT Surveys`,
            html: emailHtml,
            type: 'general',
          }),
        })
        emailOk++
      } catch (e) {
        console.warn(`Email to ${to} failed:`, e)
      }
    }

    // ── WhatsApp recipients ─────────────────────────────────────────────────────
    // Start with manually entered numbers (normalise to E.164)
    const manualPhones = String(s.reminder_phones ?? '')
      .split(',').map(p => normalizePhone(p)).filter(p => p.length >= 7)

    // Resolve phones from selected roles
    const selectedRoles = Array.isArray(s.reminder_roles) ? (s.reminder_roles as string[]) : []
    let rolePhones: string[] = []
    if (selectedRoles.length > 0) {
      const { data: roleUsers } = await sb
        .from('profiles')
        .select('phone')
        .in('role', selectedRoles)
        .not('phone', 'is', null)
      rolePhones = (roleUsers ?? []).map((u: { phone: string }) => normalizePhone(u.phone)).filter(p => p.length >= 7)
    }

    // Resolve phones from individually selected users
    const selectedUserIds = Array.isArray(s.reminder_user_ids) ? (s.reminder_user_ids as string[]) : []
    let userPhones: string[] = []
    if (selectedUserIds.length > 0) {
      const { data: pickedUsers } = await sb
        .from('profiles')
        .select('phone')
        .in('id', selectedUserIds)
        .not('phone', 'is', null)
      userPhones = (pickedUsers ?? []).map((u: { phone: string }) => normalizePhone(u.phone)).filter(p => p.length >= 7)
    }

    // Deduplicate all sources (after normalisation, +249… and 09… won't clash)
    const phones = [...new Set([...rolePhones, ...userPhones, ...manualPhones])]

    let waOk = 0
    for (const phone of phones) {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({
            to: phone,
            event_type: 'reminder',
            data: {
              recipient_name: 'there',
              message: `Survey "${titleEn}" deadline is ${daysLabel} (${deadlineDateStr}). Fill it here: ${surveyUrl}`,
              url: surveyUrl,
            },
          }),
        })
        waOk++
      } catch (e) {
        console.warn(`WhatsApp to ${phone} failed:`, e)
      }
    }

    // ── Audit log (also used for dedup check) ───────────────────────────────────
    await sb.from('audit_logs').insert({
      module: 'survey_reminder',
      action: 'send',
      entity_type: 'survey',
      entity_id: survey.id,
      entity_name: titleEn.substring(0, 200),
      description: `Deadline reminder sent — ${daysRemaining}d before deadline. Emails: ${emailOk}/${emails.length}, WhatsApp: ${waOk}/${phones.length} (roles:${rolePhones.length} users:${userPhones.length} manual:${manualPhones.length})`,
      success: true,
      actor_id: 'system',
      actor_name: 'Survey Reminder Cron',
      metadata: {
        survey_id: survey.id,
        days_remaining: daysRemaining,
        emails_sent: emailOk,
        wa_sent: waOk,
        wa_from_roles: rolePhones.length,
        wa_from_users: userPhones.length,
        wa_from_manual: manualPhones.length,
        expires_at: expiresAtStr,
      },
    })

    remindersSent++
  }

  return new Response(
    JSON.stringify({
      ok: true,
      surveys_scanned: surveysScanned,
      reminders_sent: remindersSent,
      skipped_already_sent: skippedAlready,
      skipped_no_day_match: skippedNoDayMatch,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
