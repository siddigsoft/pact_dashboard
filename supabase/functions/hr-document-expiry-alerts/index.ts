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
    const thresholds = [7, 14, 30, 60, 90]
    let totalAlerts = 0

    // ── 1. Passport Expiry ────────────────────────────────────────────────────
    const { data: passports } = await supabase
      .from('hr_employee_personal')
      .select('profile_id, passport_no, passport_expiry')
      .not('passport_expiry', 'is', null)

    for (const row of passports ?? []) {
      const expiry = new Date(row.passport_expiry)
      const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / 86400000)
      if (daysLeft < 0 || daysLeft > 90) continue

      const urgency = daysLeft <= 7 ? 'critical' : daysLeft <= 30 ? 'high' : 'medium'
      const title = daysLeft <= 0
        ? `Passport Expired`
        : `Passport expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`

      // Fetch employee name
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', row.profile_id)
        .single()

      const empName = profile?.full_name || 'Staff Member'

      // Insert in-app notification for HR admins
      const { data: hrAdmins } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['admin', 'super_admin', 'hr_admin', 'ict'])

      const notifications = (hrAdmins ?? []).map(admin => ({
        event_type: 'document_expiry_alert',
        entity_type: 'hr_document',
        entity_id: row.profile_id,
        recipient_id: admin.id,
        title_en: `${empName}: ${title}`,
        title_ar: `${empName}: وثيقة تنتهي قريباً`,
        message_en: `Passport #${row.passport_no || 'N/A'} for ${empName} expires on ${expiry.toLocaleDateString('en-GB')}.`,
        message_ar: `جواز سفر ${empName} ينتهي في ${expiry.toLocaleDateString('en-GB')}.`,
        priority: urgency,
        action_url: `/users/${row.profile_id}?section=personal`,
        metadata: { document_type: 'passport', days_left: daysLeft, profile_id: row.profile_id },
      }))

      if (notifications.length > 0) {
        await supabase.from('notifications').upsert(notifications, {
          onConflict: 'recipient_id,entity_id,event_type',
          ignoreDuplicates: true,
        })
        totalAlerts += notifications.length
      }
    }

    // ── 2. Visa Expiry ────────────────────────────────────────────────────────
    const { data: visas } = await supabase
      .from('hr_employee_personal')
      .select('profile_id, visa_type, visa_number, visa_expiry')
      .not('visa_expiry', 'is', null)

    for (const row of visas ?? []) {
      const expiry = new Date(row.visa_expiry)
      const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / 86400000)
      if (daysLeft < 0 || daysLeft > 90) continue

      const urgency = daysLeft <= 7 ? 'critical' : daysLeft <= 30 ? 'high' : 'medium'
      const title = daysLeft <= 0
        ? `Visa / Work Permit Expired`
        : `Visa / Work Permit expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', row.profile_id)
        .single()

      const empName = profile?.full_name || 'Staff Member'

      const { data: hrAdmins } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['admin', 'super_admin', 'hr_admin', 'ict'])

      const notifications = (hrAdmins ?? []).map(admin => ({
        event_type: 'visa_expiry_alert',
        entity_type: 'hr_document',
        entity_id: row.profile_id,
        recipient_id: admin.id,
        title_en: `${empName}: ${title}`,
        title_ar: `${empName}: تأشيرة تنتهي قريباً`,
        message_en: `${row.visa_type || 'Visa'} for ${empName} (${row.visa_number || 'No.N/A'}) expires on ${expiry.toLocaleDateString('en-GB')}.`,
        message_ar: `تأشيرة ${empName} تنتهي في ${expiry.toLocaleDateString('en-GB')}.`,
        priority: urgency,
        action_url: `/users/${row.profile_id}?section=personal`,
        metadata: { document_type: 'visa', days_left: daysLeft, profile_id: row.profile_id },
      }))

      if (notifications.length > 0) {
        await supabase.from('notifications').upsert(notifications, {
          onConflict: 'recipient_id,entity_id,event_type',
          ignoreDuplicates: true,
        })
        totalAlerts += notifications.length
      }
    }

    // ── 3. Probation End Date ─────────────────────────────────────────────────
    const { data: probations } = await supabase
      .from('profiles')
      .select('id, full_name, probation_end_date')
      .not('probation_end_date', 'is', null)

    for (const row of probations ?? []) {
      const expiry = new Date(row.probation_end_date)
      const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / 86400000)
      if (daysLeft < 0 || daysLeft > 14) continue

      const title = daysLeft <= 0
        ? `Probation period ended`
        : `Probation period ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`

      const { data: hrAdmins } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['admin', 'super_admin', 'hr_admin', 'ict'])

      const notifications = (hrAdmins ?? []).map(admin => ({
        event_type: 'probation_end_alert',
        entity_type: 'profile',
        entity_id: row.id,
        recipient_id: admin.id,
        title_en: `${row.full_name}: ${title}`,
        title_ar: `${row.full_name}: فترة التجربة تنتهي قريباً`,
        message_en: `Probation period for ${row.full_name} ends on ${expiry.toLocaleDateString('en-GB')}. Action required: confirm employment or extend probation.`,
        message_ar: `تنتهي فترة التجربة لـ ${row.full_name} في ${expiry.toLocaleDateString('en-GB')}.`,
        priority: 'high',
        action_url: `/users/${row.id}?section=employment`,
        metadata: { document_type: 'probation', days_left: daysLeft, profile_id: row.id },
      }))

      if (notifications.length > 0) {
        await supabase.from('notifications').upsert(notifications, {
          onConflict: 'recipient_id,entity_id,event_type',
          ignoreDuplicates: true,
        })
        totalAlerts += notifications.length
      }
    }

    console.log(`[hr-document-expiry-alerts] Done. Total alerts inserted/skipped: ${totalAlerts}`)

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
