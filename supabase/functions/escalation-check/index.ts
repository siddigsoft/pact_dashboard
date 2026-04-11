/**
 * escalation-check
 *
 * Checks for unacted-on approval notifications and escalates them.
 * Scheduled via pg_cron or callable manually with CRON_SECRET.
 *
 * Escalation rules:
 *   - urgent priority: escalate after 2 hours of no action
 *   - high priority:   escalate after 8 hours of no action
 *   - normal priority: escalate after 24 hours of no action
 *
 * Authorization: Bearer <CRON_SECRET> or x-cron-secret: <CRON_SECRET>
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.pactorg.com'

// Approval event types that require action within a window
const APPROVAL_EVENT_TYPES = [
  'approval_required',
  'cost_submitted',
  'leave_request_submitted',
  'payroll_approval_needed',
  'signature_requested',
  'mmp_forwarded',
  'withdrawal_requested',
]

// Hours before escalation per priority
const ESCALATION_HOURS: Record<string, number> = {
  urgent: 2,
  high:   8,
  normal: 24,
}

// Escalation targets: who should receive escalation per event type
const ESCALATION_ROLES: Record<string, string[]> = {
  'cost_submitted':         ['Admin', 'SuperAdmin'],
  'payroll_approval_needed':['Admin', 'SuperAdmin'],
  'mmp_forwarded':          ['Supervisor', 'Admin', 'SuperAdmin'],
  'leave_request_submitted':['Supervisor', 'Admin'],
  'withdrawal_requested':   ['Admin', 'SuperAdmin'],
  'approval_required':      ['Admin', 'SuperAdmin'],
  'signature_requested':    ['Admin', 'SuperAdmin'],
}

function isAuthorized(req: Request): boolean {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret) return false
  const cronHeader = req.headers.get('x-cron-secret')
  if (cronHeader === cronSecret) return true
  const authHeader = req.headers.get('authorization') ?? ''
  if (authHeader === `Bearer ${cronSecret}`) return true
  return false
}

function hoursAgo(hours: number): string {
  const d = new Date()
  d.setHours(d.getHours() - hours)
  return d.toISOString()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!isAuthorized(req)) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const escalated: any[] = []
  const errors: any[] = []
  const now = new Date().toISOString()

  try {
    // Find unread/unacted approval notifications per priority tier
    for (const [priorityKey, hours] of Object.entries(ESCALATION_HOURS)) {
      const cutoff = hoursAgo(hours)

      const { data: stalePending, error: fetchErr } = await supabase
        .from('notifications')
        .select('id, event_type, priority, recipient_id, recipient_role, title_en, title_ar, message_en, message_ar, action_url, created_at, metadata, entity_id, entity_type, triggered_by_name')
        .in('event_type', APPROVAL_EVENT_TYPES)
        .eq('priority', priorityKey)
        .in('status', ['pending', 'sent'])
        .lt('created_at', cutoff)
        .is('escalated_at', null)  // not yet escalated

      if (fetchErr) {
        // notifications table might not have escalated_at column — gracefully skip
        if (fetchErr.code === '42703') {
          console.log('escalated_at column missing, skipping escalation tracking')
          continue
        }
        console.error(`Failed to fetch stale ${priorityKey} notifications:`, fetchErr)
        continue
      }

      if (!stalePending || stalePending.length === 0) continue

      console.log(`Found ${stalePending.length} stale ${priorityKey} notifications to escalate`)

      for (const notification of stalePending) {
        try {
          // Determine escalation targets for this event type
          const targetRoles = ESCALATION_ROLES[notification.event_type] || ['Admin', 'SuperAdmin']

          // Find admins/supervisors to notify (excluding original recipient)
          const { data: escalationTargets } = await supabase
            .from('profiles')
            .select('id, email, full_name, role')
            .in('role', targetRoles)
            .eq('status', 'approved')
            .neq('id', notification.recipient_id)

          if (!escalationTargets || escalationTargets.length === 0) continue

          const elapsedHours = Math.round((Date.now() - new Date(notification.created_at).getTime()) / 3600000)

          // Create escalation notifications for each admin/supervisor
          const escalationRecords = escalationTargets.map((target: any) => ({
            event_type: 'escalation',
            entity_type: notification.entity_type || 'notification',
            entity_id: notification.id,
            priority: notification.priority === 'normal' ? 'high' : 'urgent',
            status: 'pending',
            recipient_id: target.id,
            recipient_email: target.email,
            recipient_role: target.role,
            title_en: `⚠️ Escalation: Unreviewed ${notification.event_type.replace(/_/g, ' ')}`,
            title_ar: `⚠️ تصعيد: ${notification.title_ar || 'طلب موافقة غير مراجع'}`,
            message_en: `An approval notification (${notification.title_en}) sent ${elapsedHours} hour(s) ago has not been acted upon. Original recipient role: ${notification.recipient_role || 'Unknown'}. Please review and take action.`,
            message_ar: `إشعار موافقة (${notification.title_ar || notification.title_en}) أُرسل منذ ${elapsedHours} ساعة لم يتم اتخاذ إجراء بشأنه. يرجى المراجعة والإجراء.`,
            action_url: notification.action_url || `${APP_URL}/notifications`,
            triggered_by: 'system',
            triggered_by_name: 'Escalation Engine',
            metadata: {
              original_notification_id: notification.id,
              original_event_type: notification.event_type,
              elapsed_hours: elapsedHours,
              original_priority: notification.priority,
              escalation_reason: `Approval pending for ${elapsedHours} hour(s) (threshold: ${hours}h)`,
            },
            email_sent: false,
          }))

          const { error: insertErr } = await supabase
            .from('notifications')
            .insert(escalationRecords)

          if (insertErr && insertErr.code !== '42P01') {
            console.error('Failed to insert escalation notifications:', insertErr)
            errors.push({ notification_id: notification.id, error: insertErr.message })
            continue
          }

          // Mark original notification as escalated
          const { error: updateErr } = await supabase
            .from('notifications')
            .update({ escalated_at: now })
            .eq('id', notification.id)

          if (updateErr) {
            console.warn('Could not mark notification as escalated (column may not exist):', updateErr.message)
          }

          // Audit log
          await supabase.from('audit_logs').insert({
            module: 'notification',
            action: 'escalation',
            entity_type: 'notification',
            entity_id: notification.id,
            entity_name: notification.title_en,
            description: `Escalated notification ${notification.id} to ${escalationTargets.length} admin(s) after ${elapsedHours}h`,
            success: true,
            actor_id: 'system',
            actor_name: 'Escalation Engine',
            metadata: {
              original_event_type: notification.event_type,
              elapsed_hours: elapsedHours,
              escalation_targets: escalationTargets.map((t: any) => t.email),
              threshold_hours: hours,
            }
          }).then(() => {}).catch(console.warn)

          escalated.push({
            original_id: notification.id,
            event_type: notification.event_type,
            elapsed_hours: elapsedHours,
            escalation_count: escalationTargets.length,
          })

        } catch (notifErr) {
          console.error('Error processing notification escalation:', notifErr)
          errors.push({ notification_id: notification.id, error: String(notifErr) })
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        escalated_count: escalated.length,
        error_count: errors.length,
        escalated,
        errors: errors.length > 0 ? errors : undefined,
        checked_at: now,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Escalation check error:', err)
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
