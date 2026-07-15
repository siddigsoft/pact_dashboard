import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-alert-secret',
}

// ── Security: ALERT_FUNCTION_SECRET is REQUIRED — fail-closed ───────────────
// If the secret env var is not set, ALL requests are rejected to prevent
// unauthenticated abuse of the service-role-powered email/notification fan-out.
function authorised(req: Request): boolean {
  const expectedSecret = Deno.env.get('ALERT_FUNCTION_SECRET')
  if (!expectedSecret) return false           // fail-closed: missing secret = deny all
  const provided = req.headers.get('x-alert-secret')
  return provided === expectedSecret
}

// ── Threshold buckets ─────────────────────────────────────────────────────────
const DOC_THRESHOLDS    = [90, 30, 7]     // passport / visa / certification
const PROBATION_THRESHOLD = 14            // probation manager alert (+ shared DOC_THRESHOLDS)

function thresholdBucket(daysLeft: number, thresholds: number[]): number | null {
  for (const t of thresholds) {
    if (daysLeft === t) return t
  }
  // Also fire on the day-of (0) and for already-expired (negative treated as 0 bucket)
  if (daysLeft <= 0 && thresholds.includes(7)) return 0
  return null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!authorised(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorised' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    let totalAlerts = 0

    // ── Helpers ────────────────────────────────────────────────────────────────

    const cache: Record<string, any> = {}

    const getProfile = async (id: string) => {
      if (!cache[id]) {
        const { data } = await supabase.from('profiles').select('id, full_name, email, reports_to').eq('id', id).single()
        cache[id] = data || { id, full_name: 'Staff Member', email: null, reports_to: null }
      }
      return cache[id]
    }

    const getHRAdminIds = async (): Promise<string[]> => {
      if (cache['__hr_admins']) return cache['__hr_admins']
      const { data } = await supabase.from('profiles').select('id').in('role', ['admin', 'super_admin', 'hr_admin', 'ict'])
      cache['__hr_admins'] = (data ?? []).map((r: any) => r.id)
      return cache['__hr_admins']
    }

    const sendEmail = async (to: string, subject: string, html: string) => {
      try {
        await supabase.functions.invoke('send-email', { body: { to, subject, html } })
      } catch (e: any) {
        console.error('[hr-doc-expiry] email send error:', e?.message)
      }
    }

    const daysUntil = (dateStr: string): number =>
      Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)

    const urgencyFromDays = (d: number) => d <= 0 ? 'critical' : d <= 7 ? 'critical' : d <= 30 ? 'high' : 'medium'

    /**
     * Upsert notifications.
     * Dedup key = recipient_id + entity_id + event_type
     * event_type encodes: <doc_kind>_expiry_<bucket>d  so each threshold level is a distinct row.
     * For certifications, entity_id = training record uuid (not profile_id) to avoid cross-cert collisions.
     */
    const upsertNotif = async (rows: any[]) => {
      if (!rows.length) return
      const { error } = await supabase.from('notifications').upsert(rows, {
        onConflict: 'recipient_id,entity_id,event_type',
        ignoreDuplicates: false,   // update with fresh data in case message/priority changed
      })
      if (error) console.error('[hr-doc-expiry] upsert error:', error.message)
      else totalAlerts += rows.length
    }

    // ── 1. Passport Expiry ─────────────────────────────────────────────────────
    {
      const { data } = await supabase
        .from('hr_employee_personal')
        .select('profile_id, passport_no, passport_expiry')
        .not('passport_expiry', 'is', null)

      for (const row of (data ?? []) as any[]) {
        const daysLeft = daysUntil(row.passport_expiry)
        const bucket   = thresholdBucket(daysLeft, DOC_THRESHOLDS)
        if (bucket === null) continue

        const emp       = await getProfile(row.profile_id)
        const hrIds     = await getHRAdminIds()
        const expDate   = new Date(row.passport_expiry).toLocaleDateString('en-GB')
        const label     = daysLeft <= 0 ? `Expired on ${expDate}` : `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${expDate})`
        const urgency   = urgencyFromDays(daysLeft)
        const evtType   = `passport_expiry_${bucket}d`
        const actionUrl = `/users/${row.profile_id}?section=personal`

        // In-app: employee
        await upsertNotif([{
          event_type: evtType, entity_type: 'hr_document', entity_id: row.profile_id,
          recipient_id: row.profile_id,
          title_en: `Your passport ${label}`,
          title_ar: `جواز سفرك ${daysLeft <= 0 ? 'منتهي الصلاحية' : 'ينتهي قريباً'}`,
          message_en: `Passport (${row.passport_no || 'N/A'}) — ${label}. Please arrange renewal.`,
          message_ar: `جواز سفرك (${row.passport_no || 'N/A'}) — ${label}.`,
          priority: urgency, action_url: actionUrl, metadata: { document_type: 'passport', days_left: daysLeft },
        }])

        // In-app + email: each HR admin
        await upsertNotif(hrIds.map((id: string) => ({
          event_type: `${evtType}_hr`, entity_type: 'hr_document',
          entity_id: `${row.profile_id}_hr`,
          recipient_id: id,
          title_en: `${emp.full_name}: Passport ${label}`,
          title_ar: `${emp.full_name}: جواز سفر ${daysLeft <= 0 ? 'منتهي الصلاحية' : 'ينتهي قريباً'}`,
          message_en: `Passport (${row.passport_no || 'N/A'}) for ${emp.full_name} — ${label}. Please take action.`,
          message_ar: `جواز سفر ${emp.full_name} — ${label}.`,
          priority: urgency, action_url: actionUrl, metadata: { document_type: 'passport', days_left: daysLeft },
        })))

        // Email: employee
        if (emp.email) {
          await sendEmail(emp.email,
            `PACT HR: Your passport ${label}`,
            emailHtml('Passport Expiry Notice', emp.full_name,
              `Your passport <strong>${row.passport_no || 'N/A'}</strong> ${label}. Please arrange renewal immediately.`,
              actionUrl))
        }

        // Email: HR admins (one consolidated email per HR admin — fetch their addresses)
        const hrProfiles = await Promise.all(hrIds.map((id: string) => getProfile(id)))
        for (const hr of hrProfiles) {
          if (hr.email) {
            await sendEmail(hr.email,
              `PACT HR Alert: ${emp.full_name} Passport ${label}`,
              emailHtml('Passport Expiry Alert', hr.full_name,
                `Passport <strong>${row.passport_no || 'N/A'}</strong> for <strong>${emp.full_name}</strong> — ${label}. Please follow up.`,
                actionUrl))
          }
        }
      }
    }

    // ── 2. Visa / Work Permit Expiry ───────────────────────────────────────────
    {
      const { data } = await supabase
        .from('hr_employee_personal')
        .select('profile_id, visa_type, visa_number, visa_expiry')
        .not('visa_expiry', 'is', null)

      for (const row of (data ?? []) as any[]) {
        const daysLeft = daysUntil(row.visa_expiry)
        const bucket   = thresholdBucket(daysLeft, DOC_THRESHOLDS)
        if (bucket === null) continue

        const emp       = await getProfile(row.profile_id)
        const hrIds     = await getHRAdminIds()
        const expDate   = new Date(row.visa_expiry).toLocaleDateString('en-GB')
        const label     = daysLeft <= 0 ? `Expired on ${expDate}` : `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${expDate})`
        const urgency   = urgencyFromDays(daysLeft)
        const evtType   = `visa_expiry_${bucket}d`
        const actionUrl = `/users/${row.profile_id}?section=personal`
        const docName   = row.visa_type || 'Visa'

        // In-app + email: employee
        await upsertNotif([{
          event_type: evtType, entity_type: 'hr_document', entity_id: row.profile_id,
          recipient_id: row.profile_id,
          title_en: `Your ${docName} ${label}`,
          title_ar: `تأشيرتك ${daysLeft <= 0 ? 'منتهية الصلاحية' : 'تنتهي قريباً'}`,
          message_en: `${docName} (${row.visa_number || 'N/A'}) — ${label}. Please arrange renewal.`,
          message_ar: `${docName} (${row.visa_number || 'N/A'}) — ${label}.`,
          priority: urgency, action_url: actionUrl, metadata: { document_type: 'visa', days_left: daysLeft },
        }])

        if (emp.email) {
          await sendEmail(emp.email,
            `PACT HR: Your ${docName} ${label}`,
            emailHtml('Visa / Work Permit Expiry Notice', emp.full_name,
              `Your ${docName} <strong>${row.visa_number || 'N/A'}</strong> ${label}. Please arrange renewal.`,
              actionUrl))
        }

        // In-app + email: HR admins
        await upsertNotif(hrIds.map((id: string) => ({
          event_type: `${evtType}_hr`, entity_type: 'hr_document',
          entity_id: `${row.profile_id}_hr`,
          recipient_id: id,
          title_en: `${emp.full_name}: ${docName} ${label}`,
          title_ar: `${emp.full_name}: تأشيرة ${daysLeft <= 0 ? 'منتهية الصلاحية' : 'تنتهي قريباً'}`,
          message_en: `${docName} (${row.visa_number || 'N/A'}) for ${emp.full_name} — ${label}.`,
          message_ar: `تأشيرة ${emp.full_name} — ${label}.`,
          priority: urgency, action_url: actionUrl, metadata: { document_type: 'visa', days_left: daysLeft },
        })))

        const hrProfiles = await Promise.all(hrIds.map((id: string) => getProfile(id)))
        for (const hr of hrProfiles) {
          if (hr.email) {
            await sendEmail(hr.email,
              `PACT HR Alert: ${emp.full_name} ${docName} ${label}`,
              emailHtml('Visa / Work Permit Expiry Alert', hr.full_name,
                `${docName} <strong>${row.visa_number || 'N/A'}</strong> for <strong>${emp.full_name}</strong> — ${label}.`,
                actionUrl))
          }
        }
      }
    }

    // ── 3. Training / Certification Expiry ────────────────────────────────────
    {
      const { data } = await supabase
        .from('hr_employee_training')
        .select('id, profile_id, course_name, certificate_name, expiry_date')
        .not('expiry_date', 'is', null)

      for (const row of (data ?? []) as any[]) {
        const daysLeft = daysUntil(row.expiry_date)
        const bucket   = thresholdBucket(daysLeft, DOC_THRESHOLDS)
        if (bucket === null) continue

        const emp       = await getProfile(row.profile_id)
        const hrIds     = await getHRAdminIds()
        const certName  = row.certificate_name || row.course_name || 'Certificate'
        const expDate   = new Date(row.expiry_date).toLocaleDateString('en-GB')
        const label     = daysLeft <= 0 ? `Expired on ${expDate}` : `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${expDate})`
        const urgency   = urgencyFromDays(daysLeft)
        // Use training record id (not profile_id) to avoid collisions across multiple certs
        const evtType   = `certification_expiry_${bucket}d`
        const actionUrl = `/users/${row.profile_id}?section=training`

        // In-app + email: employee — entity_id = training record id
        await upsertNotif([{
          event_type: evtType, entity_type: 'hr_document', entity_id: row.id,
          recipient_id: row.profile_id,
          title_en: `Your certification "${certName}" ${label}`,
          title_ar: `شهادتك "${certName}" ${daysLeft <= 0 ? 'منتهية الصلاحية' : 'تنتهي قريباً'}`,
          message_en: `Certification "${certName}" — ${label}. Please arrange renewal.`,
          message_ar: `شهادة "${certName}" — ${label}.`,
          priority: urgency, action_url: actionUrl,
          metadata: { document_type: 'certification', days_left: daysLeft, cert_name: certName },
        }])

        if (emp.email) {
          await sendEmail(emp.email,
            `PACT HR: Your certification "${certName}" ${label}`,
            emailHtml('Certification Expiry Notice', emp.full_name,
              `Your certification <strong>"${certName}"</strong> ${label}. Please arrange renewal.`,
              actionUrl))
        }

        // In-app + email: HR admins — use `row.id + _hr` as entity_id
        await upsertNotif(hrIds.map((id: string) => ({
          event_type: `${evtType}_hr`, entity_type: 'hr_document',
          entity_id: `${row.id}_hr`,
          recipient_id: id,
          title_en: `${emp.full_name}: "${certName}" ${label}`,
          title_ar: `${emp.full_name}: شهادة "${certName}" ${daysLeft <= 0 ? 'منتهية الصلاحية' : 'تنتهي قريباً'}`,
          message_en: `Certification "${certName}" for ${emp.full_name} — ${label}.`,
          message_ar: `شهادة "${certName}" لـ ${emp.full_name} — ${label}.`,
          priority: urgency, action_url: actionUrl,
          metadata: { document_type: 'certification', days_left: daysLeft, cert_name: certName },
        })))

        const hrProfiles = await Promise.all(hrIds.map((id: string) => getProfile(id)))
        for (const hr of hrProfiles) {
          if (hr.email) {
            await sendEmail(hr.email,
              `PACT HR Alert: ${emp.full_name} — "${certName}" ${label}`,
              emailHtml('Certification Expiry Alert', hr.full_name,
                `Certification <strong>"${certName}"</strong> for <strong>${emp.full_name}</strong> — ${label}.`,
                actionUrl))
          }
        }
      }
    }

    // ── 4. Probation End Date — notify manager at T-14, HR at all DOC_THRESHOLDS ─
    {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email, probation_end_date, probation_confirmed, reports_to')
        .not('probation_end_date', 'is', null)
        .eq('probation_confirmed', false)

      for (const row of (data ?? []) as any[]) {
        const daysLeft  = daysUntil(row.probation_end_date)
        const expDate   = new Date(row.probation_end_date).toLocaleDateString('en-GB')
        const label     = daysLeft <= 0 ? `Ended on ${expDate}` : `Ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${expDate})`
        const actionUrl = `/users/${row.id}?section=employment`

        // Manager alert fires ONLY at exactly T-14 (probation-specific threshold)
        const managerBucket = daysLeft === PROBATION_THRESHOLD ? PROBATION_THRESHOLD : null
        if (managerBucket !== null && row.reports_to) {
          const mgr = await getProfile(row.reports_to)
          const urgency = daysLeft <= 7 ? 'high' : 'medium'

          await upsertNotif([{
            event_type: `probation_end_${managerBucket}d`, entity_type: 'profile',
            entity_id: `${row.id}_mgr`,
            recipient_id: row.reports_to,
            title_en: `Action Required: ${row.full_name} probation ${label}`,
            title_ar: `مطلوب إجراء: فترة تجربة ${row.full_name} ${daysLeft <= 0 ? 'انتهت' : 'تنتهي قريباً'}`,
            message_en: `Probation period for ${row.full_name} ${label}. Please confirm employment or extend probation.`,
            message_ar: `فترة التجربة لـ ${row.full_name} ${label}.`,
            priority: urgency, action_url: actionUrl,
            metadata: { document_type: 'probation', days_left: daysLeft, employee_id: row.id },
          }])

          if (mgr.email) {
            await sendEmail(mgr.email,
              `PACT HR: Probation review required — ${row.full_name} (${daysLeft <= 0 ? 'ended' : `T-${managerBucket}d`})`,
              emailHtml('Probation Review Required', mgr.full_name,
                `The probation period for <strong>${row.full_name}</strong> ${label}. Please confirm employment or contact HR to extend.`,
                actionUrl))
          }
        }

        // HR admin alerts at DOC_THRESHOLDS
        const hrBucket = thresholdBucket(daysLeft, DOC_THRESHOLDS)
        if (hrBucket !== null) {
          const hrIds     = await getHRAdminIds()
          const urgency   = urgencyFromDays(daysLeft)

          await upsertNotif(hrIds.map((id: string) => ({
            event_type: `probation_end_${hrBucket}d_hr`, entity_type: 'profile',
            entity_id: `${row.id}_hr`,
            recipient_id: id,
            title_en: `${row.full_name}: Probation ${label}`,
            title_ar: `${row.full_name}: فترة التجربة ${daysLeft <= 0 ? 'انتهت' : 'تنتهي قريباً'}`,
            message_en: `Probation for ${row.full_name} ${label}.`,
            message_ar: `فترة التجربة لـ ${row.full_name} ${label}.`,
            priority: urgency, action_url: actionUrl,
            metadata: { document_type: 'probation', days_left: daysLeft },
          })))
        }
      }
    }

    console.log(`[hr-document-expiry-alerts] Done. Total alert rows: ${totalAlerts}`)
    return new Response(
      JSON.stringify({ success: true, total_alerts: totalAlerts }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('[hr-document-expiry-alerts] Fatal error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

// ── Email template helper ──────────────────────────────────────────────────────
function emailHtml(heading: string, recipientName: string, bodyHtml: string, ctaUrl: string): string {
  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:8px">
  <div style="background:#0F2041;padding:16px 20px;border-radius:6px 6px 0 0">
    <h2 style="color:#fff;margin:0;font-size:16px">${heading}</h2>
  </div>
  <div style="background:#fff;padding:24px;border-radius:0 0 6px 6px;border:1px solid #e5e7eb;border-top:none">
    <p style="margin:0 0 12px">Dear <strong>${recipientName || 'Team Member'}</strong>,</p>
    <p style="margin:0 0 20px;color:#374151">${bodyHtml}</p>
    <a href="${ctaUrl}" style="display:inline-block;background:#1D3461;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600">View in PACT</a>
    <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb"/>
    <p style="font-size:12px;color:#9ca3af;margin:0">PACT Command Center — automated HR compliance alert</p>
  </div>
</div>`
}
