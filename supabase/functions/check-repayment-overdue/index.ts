/**
 * check-repayment-overdue
 *
 * Checks cost_recovery_log for 'return_required' decisions whose repayment_deadline
 * has passed and fires escalating notifications if the money hasn't come back.
 *
 * Escalation schedule:
 *   Day 0  (deadline day)    → enumerator + supervisor + finance warned (escalation_day0_sent)
 *   Day 7  (deadline + 7d)   → admin escalated    (escalation_day7_sent)
 *   Day 14 (deadline + 14d)  → super admin critical; repayment_status → 'overdue' (escalation_day14_sent)
 *
 * Authorization: Bearer <CRON_SECRET>  or  x-cron-secret: <CRON_SECRET>
 * Cron: 0 6 * * * (06:00 UTC daily) — register in Supabase Dashboard pg_cron
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.pactorg.com'

function isAuthorized(req: Request): boolean {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret) return false
  const header = req.headers.get('x-cron-secret')
  if (header === cronSecret) return true
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${cronSecret}`
}

/** Returns today's date string YYYY-MM-DD */
function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

/** Adds n days to a date string YYYY-MM-DD */
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().split('T')[0]
}

/** Build and insert a notification row directly */
async function insertNotification(
  supabase: ReturnType<typeof createClient>,
  recipientId: string,
  recipientEmail: string | null,
  recipientRole: string,
  titleEn: string,
  titleAr: string,
  messageEn: string,
  messageAr: string,
  priority: 'normal' | 'high' | 'urgent',
  actionUrl: string,
  metadata: Record<string, unknown>,
) {
  const { error } = await supabase.from('notifications').insert({
    event_type: 'repayment_overdue',
    entity_type: 'cost_recovery',
    entity_id: metadata.cost_recovery_id as string ?? null,
    priority,
    status: 'pending',
    recipient_id: recipientId,
    recipient_email: recipientEmail,
    recipient_role: recipientRole,
    title_en: titleEn,
    title_ar: titleAr,
    message_en: messageEn,
    message_ar: messageAr,
    action_url: actionUrl,
    triggered_by: 'system',
    triggered_by_name: 'Repayment Overdue Engine',
    metadata,
    email_sent: false,
  })
  if (error) console.warn('[check-repayment-overdue] insert notification error:', error.message)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!isAuthorized(req)) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const today = todayStr()
  const processed: string[] = []
  const errors: string[] = []

  try {
    // Fetch all active return_required records that still need chasing
    const { data: overdue, error: fetchErr } = await supabase
      .from('cost_recovery_log')
      .select(
        'id, mmp_id, site_entry_id, amount, amount_currency, enumerator_id, enumerator_name, ' +
        'repayment_deadline, repayment_method, repayment_status, ' +
        'escalation_day0_sent, escalation_day7_sent, escalation_day14_sent',
      )
      .eq('decision', 'return_required')
      .in('repayment_status', ['pending', 'overdue'])
      .not('repayment_deadline', 'is', null)
      .lte('repayment_deadline', today) // deadline has passed or is today

    if (fetchErr) {
      // Table or column not found — silently exit
      if (fetchErr.code === '42P01' || fetchErr.code === '42703') {
        console.log('[check-repayment-overdue] cost_recovery_log not yet configured — skipping')
        return new Response(
          JSON.stringify({ status: 'not_configured', processed: 0 }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      throw new Error(fetchErr.message)
    }

    if (!overdue || overdue.length === 0) {
      return new Response(
        JSON.stringify({ status: 'ok', message: 'No overdue repayments', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    console.log(`[check-repayment-overdue] Found ${overdue.length} overdue repayments`)

    // Fetch admin + finance + super admin profiles once
    const { data: adminProfiles } = await supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .in('role', ['admin', 'Admin', 'finance', 'Finance', 'super_admin', 'Super Admin', 'superAdmin', 'SuperAdmin'])
      .eq('status', 'approved')

    const admins   = (adminProfiles || []).filter((p: any) => ['admin', 'Admin'].includes(p.role))
    const finance  = (adminProfiles || []).filter((p: any) => ['finance', 'Finance'].includes(p.role))
    const superAdm = (adminProfiles || []).filter((p: any) =>
      ['super_admin', 'Super Admin', 'superAdmin', 'SuperAdmin'].includes(p.role))

    for (const row of overdue as any[]) {
      try {
        const deadline = row.repayment_deadline as string
        const day7Threshold  = addDays(deadline, 7)
        const day14Threshold = addDays(deadline, 14)

        const amtStr = `${Number(row.amount).toLocaleString()} ${row.amount_currency || 'SDG'}`
        const actionUrl = `${APP_URL}/down-payment?tab=recoveries`
        const meta = {
          cost_recovery_id: row.id,
          mmp_id: row.mmp_id,
          site_entry_id: row.site_entry_id,
          amount: row.amount,
          amount_currency: row.amount_currency,
          enumerator_name: row.enumerator_name,
          repayment_deadline: deadline,
        }

        const updatesNeeded: Record<string, unknown> = {}

        // ---------- Day 14 (critical — super admin) ----------
        if (!row.escalation_day14_sent && today >= day14Threshold) {
          console.log(`[overdue] Day 14 escalation for CRL ${row.id}`)

          for (const sa of superAdm) {
            await insertNotification(
              supabase,
              sa.id, sa.email ?? null, sa.role,
              `🔴 Critical: Repayment 14 Days Overdue`,
              `🔴 حرج: السداد متأخر 14 يوماً`,
              `${amtStr} owed by ${row.enumerator_name || 'an enumerator'} is now 14 days overdue. Immediate action required.`,
              `${amtStr} المستحقة على ${row.enumerator_name || 'العداد'} متأخرة 14 يوماً. مطلوب اتخاذ إجراء فوري.`,
              'urgent',
              actionUrl,
              { ...meta, escalation_tier: 'day14' },
            )
          }

          updatesNeeded.escalation_day14_sent = true
          updatesNeeded.repayment_status = 'overdue'
        }

        // ---------- Day 7 (admin escalation) ----------
        if (!row.escalation_day7_sent && today >= day7Threshold) {
          console.log(`[overdue] Day 7 escalation for CRL ${row.id}`)

          for (const admin of admins) {
            await insertNotification(
              supabase,
              admin.id, admin.email ?? null, admin.role,
              `⚠️ Escalation: Repayment 7 Days Overdue`,
              `⚠️ تصعيد: السداد متأخر 7 أيام`,
              `${amtStr} owed by ${row.enumerator_name || 'an enumerator'} is 7 days past the repayment deadline. Please follow up.`,
              `${amtStr} المستحقة على ${row.enumerator_name || 'العداد'} تجاوزت الموعد النهائي بـ 7 أيام. يرجى المتابعة.`,
              'high',
              actionUrl,
              { ...meta, escalation_tier: 'day7' },
            )
          }

          updatesNeeded.escalation_day7_sent = true
        }

        // ---------- Day 0 (deadline day — enumerator + finance) ----------
        if (!row.escalation_day0_sent && today >= deadline) {
          console.log(`[overdue] Day 0 alert for CRL ${row.id}`)

          // Notify the enumerator if we have their ID
          if (row.enumerator_id) {
            const { data: enumProfile } = await supabase
              .from('profiles')
              .select('id, email, full_name, role')
              .eq('id', row.enumerator_id)
              .maybeSingle()

            if (enumProfile) {
              await insertNotification(
                supabase,
                enumProfile.id, (enumProfile as any).email ?? null, (enumProfile as any).role || 'enumerator',
                `Payment Repayment Due Today`,
                `استحقاق سداد الدفعة اليوم`,
                `You are required to return ${amtStr} today (deadline: ${deadline}). Method: ${row.repayment_method || 'see your supervisor'}. Contact your supervisor immediately.`,
                `يجب عليك إعادة ${amtStr} اليوم (الموعد النهائي: ${deadline}). الطريقة: ${row.repayment_method || 'راجع مشرفك'}. تواصل مع مشرفك فوراً.`,
                'high',
                actionUrl,
                { ...meta, escalation_tier: 'day0' },
              )
            }
          }

          // Notify finance
          for (const fin of finance) {
            await insertNotification(
              supabase,
              fin.id, fin.email ?? null, fin.role,
              `Repayment Due Today — Action Required`,
              `استحقاق السداد اليوم — إجراء مطلوب`,
              `${amtStr} owed by ${row.enumerator_name || 'an enumerator'} is due today. Please record receipt or contact the enumerator.`,
              `${amtStr} المستحقة على ${row.enumerator_name || 'العداد'} حلّ موعدها اليوم. يرجى تسجيل الاستلام أو التواصل مع العداد.`,
              'high',
              actionUrl,
              { ...meta, escalation_tier: 'day0' },
            )
          }

          updatesNeeded.escalation_day0_sent = true
        }

        // Write escalation flags back (if anything changed)
        if (Object.keys(updatesNeeded).length > 0) {
          const { error: updateErr } = await supabase
            .from('cost_recovery_log')
            .update(updatesNeeded)
            .eq('id', row.id)

          if (updateErr) {
            console.error(`[overdue] Failed to update CRL ${row.id}:`, updateErr.message)
            errors.push(row.id)
          } else {
            processed.push(row.id)
          }
        }
      } catch (rowErr: any) {
        console.error(`[overdue] Error processing row ${row.id}:`, rowErr.message)
        errors.push(row.id)
      }
    }
  } catch (err: any) {
    console.error('[check-repayment-overdue] Fatal error:', err.message)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  return new Response(
    JSON.stringify({
      status: 'ok',
      processed: processed.length,
      errors: errors.length,
      processed_ids: processed,
      error_ids: errors,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
