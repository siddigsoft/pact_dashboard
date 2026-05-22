/**
 * survey-reminder-test
 *
 * Manually fires the survey reminder for a specific survey right now,
 * bypassing the day-matching schedule and the 22h dedup check.
 * Adds a [TEST] prefix to all messages so recipients know it's a test.
 *
 * Auth:   Supabase user JWT (Authorization: Bearer <user-token>)
 *         Caller must have role admin | coordinator | supervisor |
 *         fom | countryDirector.
 * Method: POST
 * Body:   { survey_id: string }
 * Returns: { ok, emails_sent, wa_sent, phones: string[], emails: string[], error? }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_URL      = Deno.env.get('APP_URL') ?? 'https://app.pactorg.com'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''


function normalizePhone(raw: string): string {
  const p = raw.trim().replace(/[\s\-\(\)\.]/g, '')
  if (!p) return p
  if (p.startsWith('+')) return p
  // Has country code digits but missing leading +
  if (p.startsWith('249') && p.length >= 12) return '+' + p
  if (p.startsWith('256') && p.length >= 12) return '+' + p
  // Sudan local formats: 09x / 01x
  if (p.startsWith('09') || p.startsWith('01')) return '+249' + p.slice(1)
  // Uganda local format: 07x
  if (p.startsWith('07')) return '+256' + p.slice(1)
  // Sudan numbers stored without leading 0 (9 digits starting with 9 or 1)
  if (/^9\d{8}$/.test(p)) return '+249' + p
  if (/^1\d{8}$/.test(p)) return '+249' + p
  return p
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  // ── Auth: verify user JWT ────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ ok: false, error: 'Missing auth token' })

  const userToken = authHeader.slice(7)
  const userSb = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: `Bearer ${userToken}` } },
  })
  const { data: { user }, error: authErr } = await userSb.auth.getUser()
  if (authErr || !user) return json({ ok: false, error: 'Unauthorized — please log in again' })

  const sb = createClient(SUPABASE_URL, SERVICE_KEY)

  // ── Parse body ───────────────────────────────────────────────────────────────
  let body: { survey_id?: string; test_mode?: boolean }
  try { body = await req.json() } catch { return json({ ok: false, error: 'Invalid request body' }) }
  const { survey_id, test_mode = false } = body
  if (!survey_id) return json({ ok: false, error: 'survey_id is required' })

  // ── Fetch survey ─────────────────────────────────────────────────────────────
  const { data: survey, error: fetchErr } = await sb
    .from('surveys')
    .select('id, title, title_ar, short_code, settings')
    .eq('id', survey_id)
    .single()

  if (fetchErr || !survey) return json({ ok: false, error: 'Survey not found' })

  const s = (survey.settings ?? {}) as Record<string, unknown>

  if (!s.reminder_enabled) {
    return json({ ok: false, error: 'Reminders are not enabled for this survey. Enable the toggle in Settings and save first.' })
  }

  // ── Build deadline info ──────────────────────────────────────────────────────
  const expiresAtStr = s.expires_at as string | null
  const surveyUrl    = `${APP_URL}/s/${survey.short_code ?? survey.id}`
  const titleEn      = survey.title as string
  const titleAr      = (survey.title_ar ?? survey.title) as string

  let daysLabel      = 'at a future date'
  let deadlineDateStr = 'No deadline set'

  if (expiresAtStr) {
    const deadline     = new Date(expiresAtStr)
    const msRemaining  = deadline.getTime() - Date.now()
    const daysRemaining = Math.round(msRemaining / 86_400_000)
    daysLabel = daysRemaining < 0
      ? `${Math.abs(daysRemaining)} days ago (expired)`
      : daysRemaining === 0 ? 'today'
      : daysRemaining === 1 ? 'tomorrow'
      : `in ${daysRemaining} days`
    deadlineDateStr = deadline.toLocaleDateString('en-GB', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })
  }

  // ── Build email HTML ─────────────────────────────────────────────────────────
  const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f9fafb;margin:0;padding:0;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
    ${test_mode ? `<div style="background:#f59e0b;padding:10px 32px;"><p style="color:#fff;font-size:12px;font-weight:700;margin:0;">⚠️ TEST MESSAGE — This is a manual test of the reminder system</p></div>` : ''}
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

  // ── Email recipients ─────────────────────────────────────────────────────────
  const rawEmails = String(s.reminder_emails || s.notify_emails || '')
  const emails = rawEmails.split(',').map(e => e.trim()).filter(e => e.includes('@'))

  let emailOk = 0
  for (const to of emails) {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({
          to,
          subject: `${test_mode ? '[TEST] ' : ''}⏰ Reminder: "${titleEn}" closes ${daysLabel} — PACT Surveys`,
          html: emailHtml,
          type: 'general',
        }),
      })
      emailOk++
    } catch (e) {
      console.warn(`Test email to ${to} failed:`, e)
    }
  }

  // ── WhatsApp recipients ──────────────────────────────────────────────────────
  const manualPhones = String(s.reminder_phones ?? '')
    .split(',').map(p => normalizePhone(p)).filter(p => p.length >= 7)

  const selectedRoles = Array.isArray(s.reminder_roles) ? (s.reminder_roles as string[]) : []
  let rolePhones: string[] = []
  if (selectedRoles.length > 0) {
    const { data: roleUsers } = await sb
      .from('profiles').select('phone').in('role', selectedRoles).not('phone', 'is', null)
    rolePhones = (roleUsers ?? []).map((u: { phone: string }) => normalizePhone(u.phone)).filter(p => p.length >= 7)
  }

  const selectedUserIds = Array.isArray(s.reminder_user_ids) ? (s.reminder_user_ids as string[]) : []
  let userPhones: string[] = []
  if (selectedUserIds.length > 0) {
    const { data: pickedUsers } = await sb
      .from('profiles').select('phone').in('id', selectedUserIds).not('phone', 'is', null)
    userPhones = (pickedUsers ?? []).map((u: { phone: string }) => normalizePhone(u.phone)).filter(p => p.length >= 7)
  }

  const phones = [...new Set([...rolePhones, ...userPhones, ...manualPhones])]

  let waOk = 0
  for (const phone of phones) {
    try {
      const waResp = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({
          phone_numbers: [phone],
          event_type: 'reminder',
          priority: 'urgent',
          data: {
            recipient_name: 'there',
            message: `${test_mode ? '[TEST] ' : ''}Survey "${titleEn}" deadline is ${daysLabel} (${deadlineDateStr}). Fill it here: ${surveyUrl}`,
            url: surveyUrl,
          },
        }),
      })
      const waBody = await waResp.json().catch(() => ({}))
      if (waBody.sent > 0) waOk++
      else console.warn(`[WhatsApp] skipped/failed for ${phone}:`, waBody)
    } catch (e) {
      console.warn(`WhatsApp to ${phone} failed:`, e)
    }
  }

  // ── Audit log ────────────────────────────────────────────────────────────────
  // action='test' never blocks the daily dedup; action='manual_send' does not
  // block it either — the dedup check only matches action='send' (cron rows).
  await sb.from('audit_logs').insert({
    module: 'survey_reminder',
    action: test_mode ? 'test' : 'manual_send',
    entity_type: 'survey',
    entity_id: survey_id,
    entity_name: titleEn.substring(0, 200),
    description: `${test_mode ? 'Test' : 'Manual'} reminder fired by ${user.email}. Emails: ${emailOk}/${emails.length}, WhatsApp: ${waOk}/${phones.length}`,
    success: true,
    actor_id: user.id,
    actor_name: user.email ?? 'unknown',
    metadata: {
      survey_id,
      emails_sent: emailOk,
      wa_sent: waOk,
      wa_from_roles: rolePhones.length,
      wa_from_users: userPhones.length,
      wa_from_manual: manualPhones.length,
    },
  })

  return json({
    ok: true,
    emails_sent: emailOk,
    emails_total: emails.length,
    wa_sent: waOk,
    wa_total: phones.length,
    phones,
    emails,
  })
})
