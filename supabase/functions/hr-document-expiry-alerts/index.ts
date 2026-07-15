import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const now = new Date()
    const THRESHOLDS = [7, 30, 90]   // Only these exact day-buckets fire alerts
    let totalAlerts = 0

    // ── Helpers ──────────────────────────────────────────────────────────────

    const getHRAdminIds = async (): Promise<string[]> => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['admin', 'super_admin', 'hr_admin', 'ict'])
      return (data ?? []).map((r: any) => r.id)
    }

    const getProfileName = async (profileId: string): Promise<string> => {
      const { data } = await supabase.from('profiles').select('full_name').eq('id', profileId).single()
      return data?.full_name || 'Staff Member'
    }

    const getManagerId = async (profileId: string): Promise<string | null> => {
      const { data } = await supabase.from('profiles').select('reports_to').eq('id', profileId).single()
      return (data as any)?.reports_to ?? null
    }

    const daysUntil = (dateStr: string): number =>
      Math.ceil((new Date(dateStr).getTime() - now.getTime()) / 86400000)

    const isInThreshold = (daysLeft: number): boolean =>
      THRESHOLDS.some(t => daysLeft === t) || daysLeft <= 0

    const upsertNotifications = async (rows: any[]) => {
      if (rows.length === 0) return
      const { error } = await supabase.from('notifications').upsert(rows, {
        onConflict: 'recipient_id,entity_id,event_type',
        ignoreDuplicates: true,
      })
      if (error) console.error('[hr-doc-expiry] notification upsert error:', error.message)
      else totalAlerts += rows.length
    }

    const sendEmail = async (to: string, subject: string, html: string) => {
      try {
        await supabase.functions.invoke('send-email', { body: { to, subject, html } })
      } catch (e: any) {
        console.error('[hr-doc-expiry] email send error:', e.message)
      }
    }

    // ── 1. Passport Expiry ────────────────────────────────────────────────────
    const { data: passports } = await supabase
      .from('hr_employee_personal')
      .select('profile_id, passport_no, passport_expiry')
      .not('passport_expiry', 'is', null)

    for (const row of passports ?? []) {
      const daysLeft = daysUntil(row.passport_expiry)
      if (!isInThreshold(daysLeft)) continue

      const empName = await getProfileName(row.profile_id)
      const hrIds   = await getHRAdminIds()
      const expDate = new Date(row.passport_expiry).toLocaleDateString('en-GB')
      const label   = daysLeft <= 0 ? `Expired on ${expDate}` : `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${expDate})`
      const title   = `${empName}: Passport ${label}`
      const urgency = daysLeft <= 7 ? 'critical' : daysLeft <= 30 ? 'high' : 'medium'

      // Notify HR admins
      await upsertNotifications(hrIds.map(id => ({
        event_type: 'document_expiry_alert',
        entity_type: 'hr_document',
        entity_id: row.profile_id,
        recipient_id: id,
        title_en: title,
        title_ar: `${empName}: جواز سفر ${daysLeft <= 0 ? 'منتهي الصلاحية' : 'ينتهي قريباً'}`,
        message_en: `Passport ${row.passport_no || 'N/A'} for ${empName} — ${label}. Please take action.`,
        message_ar: `جواز سفر ${empName} — ${label}.`,
        priority: urgency,
        action_url: `/users/${row.profile_id}?section=personal`,
        metadata: { document_type: 'passport', days_left: daysLeft },
      })))

      // Notify employee directly
      await upsertNotifications([{
        event_type: 'document_expiry_alert',
        entity_type: 'hr_document',
        entity_id: row.profile_id,
        recipient_id: row.profile_id,
        title_en: `Your passport ${label}`,
        title_ar: `جواز سفرك ${daysLeft <= 0 ? 'منتهي الصلاحية' : 'ينتهي قريباً'}`,
        message_en: `Your passport (${row.passport_no || 'N/A'}) ${label}. Please arrange renewal.`,
        message_ar: `جواز سفرك (${row.passport_no || 'N/A'}) ${label}.`,
        priority: urgency,
        action_url: `/users/${row.profile_id}?section=personal`,
        metadata: { document_type: 'passport', days_left: daysLeft },
      }])

      // Email employee
      const { data: emp } = await supabase.from('profiles').select('email, full_name').eq('id', row.profile_id).single()
      if (emp?.email) {
        await sendEmail(
          emp.email,
          `PACT HR Alert: Your passport ${label}`,
          `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
            <h2 style="color:#0F2041">Passport Expiry Notice</h2>
            <p>Dear ${emp.full_name || 'Staff Member'},</p>
            <p>Your passport <strong>${row.passport_no || 'N/A'}</strong> ${label}. Please arrange renewal as soon as possible.</p>
            <a href="https://app.pactorg.com/users/${row.profile_id}?section=personal" style="display:inline-block;background:#1D3461;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:12px">View Profile</a>
          </div>`
        )
      }
    }

    // ── 2. Visa / Work Permit Expiry ─────────────────────────────────────────
    const { data: visas } = await supabase
      .from('hr_employee_personal')
      .select('profile_id, visa_type, visa_number, visa_expiry')
      .not('visa_expiry', 'is', null)

    for (const row of visas ?? []) {
      const daysLeft = daysUntil(row.visa_expiry)
      if (!isInThreshold(daysLeft)) continue

      const empName = await getProfileName(row.profile_id)
      const hrIds   = await getHRAdminIds()
      const expDate = new Date(row.visa_expiry).toLocaleDateString('en-GB')
      const label   = daysLeft <= 0 ? `Expired on ${expDate}` : `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${expDate})`
      const title   = `${empName}: Visa/Work Permit ${label}`
      const urgency = daysLeft <= 7 ? 'critical' : daysLeft <= 30 ? 'high' : 'medium'

      await upsertNotifications(hrIds.map(id => ({
        event_type: 'visa_expiry_alert',
        entity_type: 'hr_document',
        entity_id: row.profile_id,
        recipient_id: id,
        title_en: title,
        title_ar: `${empName}: تأشيرة ${daysLeft <= 0 ? 'منتهية الصلاحية' : 'تنتهي قريباً'}`,
        message_en: `${row.visa_type || 'Visa'} (${row.visa_number || 'N/A'}) for ${empName} — ${label}.`,
        message_ar: `تأشيرة ${empName} — ${label}.`,
        priority: urgency,
        action_url: `/users/${row.profile_id}?section=personal`,
        metadata: { document_type: 'visa', days_left: daysLeft },
      })))

      // Notify employee
      await upsertNotifications([{
        event_type: 'visa_expiry_alert',
        entity_type: 'hr_document',
        entity_id: row.profile_id,
        recipient_id: row.profile_id,
        title_en: `Your visa/work permit ${label}`,
        title_ar: `تأشيرتك ${daysLeft <= 0 ? 'منتهية الصلاحية' : 'تنتهي قريباً'}`,
        message_en: `Your ${row.visa_type || 'visa'} (${row.visa_number || 'N/A'}) ${label}. Please arrange renewal.`,
        message_ar: `تأشيرتك (${row.visa_number || 'N/A'}) ${label}.`,
        priority: urgency,
        action_url: `/users/${row.profile_id}?section=personal`,
        metadata: { document_type: 'visa', days_left: daysLeft },
      }])
    }

    // ── 3. Training / Certification Expiry ────────────────────────────────────
    const { data: trainings } = await supabase
      .from('hr_employee_training')
      .select('profile_id, course_name, certificate_name, expiry_date')
      .not('expiry_date', 'is', null)

    for (const row of (trainings ?? []) as any[]) {
      const daysLeft = daysUntil(row.expiry_date)
      if (!isInThreshold(daysLeft)) continue

      const empName = await getProfileName(row.profile_id)
      const hrIds   = await getHRAdminIds()
      const certName = row.certificate_name || row.course_name || 'Certificate'
      const expDate = new Date(row.expiry_date).toLocaleDateString('en-GB')
      const label   = daysLeft <= 0 ? `Expired on ${expDate}` : `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${expDate})`
      const urgency = daysLeft <= 7 ? 'critical' : daysLeft <= 30 ? 'high' : 'medium'

      await upsertNotifications(hrIds.map((id: string) => ({
        event_type: 'certification_expiry_alert',
        entity_type: 'hr_document',
        entity_id: row.profile_id,
        recipient_id: id,
        title_en: `${empName}: ${certName} ${label}`,
        title_ar: `${empName}: شهادة ${daysLeft <= 0 ? 'منتهية الصلاحية' : 'تنتهي قريباً'}`,
        message_en: `Certification "${certName}" for ${empName} — ${label}.`,
        message_ar: `شهادة "${certName}" لـ ${empName} — ${label}.`,
        priority: urgency,
        action_url: `/users/${row.profile_id}?section=training`,
        metadata: { document_type: 'certification', days_left: daysLeft, cert_name: certName },
      })))

      // Notify employee
      await upsertNotifications([{
        event_type: 'certification_expiry_alert',
        entity_type: 'hr_document',
        entity_id: row.profile_id,
        recipient_id: row.profile_id,
        title_en: `Your certification "${certName}" ${label}`,
        title_ar: `شهادتك "${certName}" ${daysLeft <= 0 ? 'منتهية الصلاحية' : 'تنتهي قريباً'}`,
        message_en: `Your certification "${certName}" ${label}. Please arrange renewal.`,
        message_ar: `شهادتك "${certName}" ${label}.`,
        priority: urgency,
        action_url: `/users/${row.profile_id}?section=training`,
        metadata: { document_type: 'certification', days_left: daysLeft },
      }])
    }

    // ── 4. Probation End Date — notify employee's manager at T-7 and T-30 ────
    const { data: probations } = await supabase
      .from('profiles')
      .select('id, full_name, email, probation_end_date, reports_to')
      .not('probation_end_date', 'is', null)

    for (const row of (probations ?? []) as any[]) {
      const daysLeft = daysUntil(row.probation_end_date)
      if (!isInThreshold(daysLeft)) continue

      const expDate = new Date(row.probation_end_date).toLocaleDateString('en-GB')
      const label   = daysLeft <= 0 ? `ended on ${expDate}` : `ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${expDate})`
      const urgency = daysLeft <= 7 ? 'high' : 'medium'

      const recipients: string[] = []

      // Notify manager (reports_to) at T-30 and T-7
      if (row.reports_to) {
        recipients.push(row.reports_to)
      }

      // Also notify HR admins
      const hrIds = await getHRAdminIds()
      recipients.push(...hrIds)

      const uniqueRecipients = [...new Set(recipients)]

      await upsertNotifications(uniqueRecipients.map(id => ({
        event_type: 'probation_end_alert',
        entity_type: 'profile',
        entity_id: row.id,
        recipient_id: id,
        title_en: `${row.full_name}: Probation period ${label}`,
        title_ar: `${row.full_name}: فترة التجربة ${daysLeft <= 0 ? 'انتهت' : 'تنتهي قريباً'}`,
        message_en: `Probation period for ${row.full_name} ${label}. Action required: confirm employment or extend probation.`,
        message_ar: `فترة التجربة لـ ${row.full_name} ${label}.`,
        priority: urgency,
        action_url: `/users/${row.id}?section=employment`,
        metadata: { document_type: 'probation', days_left: daysLeft, profile_id: row.id },
      })))

      // Email manager
      if (row.reports_to) {
        const { data: mgr } = await supabase.from('profiles').select('email, full_name').eq('id', row.reports_to).single()
        if (mgr?.email) {
          await sendEmail(
            mgr.email,
            `PACT HR: Probation period for ${row.full_name} ${label}`,
            `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
              <h2 style="color:#0F2041">Probation Review Required</h2>
              <p>Dear ${mgr.full_name || 'Manager'},</p>
              <p>The probation period for <strong>${row.full_name}</strong> ${label}.</p>
              <p>Please confirm employment status or contact HR to extend the probation period.</p>
              <a href="https://app.pactorg.com/users/${row.id}?section=employment" style="display:inline-block;background:#1D3461;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:12px">View Employee Profile</a>
            </div>`
          )
        }
      }
    }

    console.log(`[hr-document-expiry-alerts] Done. Total alerts: ${totalAlerts}`)

    return new Response(
      JSON.stringify({ success: true, total_alerts: totalAlerts }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('[hr-document-expiry-alerts] Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
