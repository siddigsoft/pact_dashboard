/**
 * Scheduled Edge Function: monitoring-flag-no-response
 *
 * Flags dashboard actions that have been "received" (no override) for more
 * than 48 hours without any awareness action. Inserts a 'no_response' row
 * into action_status_overrides.
 *
 * SECURITY: All invocations must authenticate via one of:
 *   a) Authorization: Bearer <service_role_key>   — for Supabase cron
 *   b) Authorization: Bearer <super_admin_jwt>    — for manual invocation
 *
 * Configure schedule: "0 * * * *" via Supabase Dashboard → Edge Functions → Schedules.
 * The scheduler must pass the service role key in the Authorization header.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const THRESHOLD_HOURS = 48
const MAX_FLAGS_PER_RUN = 500

function createServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  )
}

async function isAuthorized(authHeader: string): Promise<{ actorId: string; actorName: string } | null> {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')

  // Allow invocation with service role key (Supabase cron / CI)
  if (token === serviceRoleKey) {
    return { actorId: 'system', actorName: 'cron:monitoring-flag-no-response' }
  }

  // Allow invocation as a Super Admin (manual trigger)
  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error } = await anonClient.auth.getUser()
  if (error || !user) return null

  const svc = createServiceClient()
  const { data: sa } = await svc
    .from('super_admins')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!sa) return null
  return { actorId: user.id, actorName: user.email ?? 'super_admin' }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Require authentication on every invocation
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const actor = await isAuthorized(authHeader)
  if (!actor) {
    return new Response(JSON.stringify({ error: 'Forbidden: service role or Super Admin required' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const svc = createServiceClient()
  const thresholdDate = new Date(Date.now() - THRESHOLD_HOURS * 60 * 60 * 1000).toISOString()

  // Fetch all current overrides (most recent per key)
  const { data: overridesRaw } = await svc
    .from('action_status_overrides')
    .select('action_id, action_type, status')
    .order('set_at', { ascending: false })

  const handledKeys = new Set<string>()
  const skippedKeys = new Set<string>()
  for (const ov of (overridesRaw || [])) {
    const key = `${ov.action_type}:${ov.action_id}`
    if (!handledKeys.has(key)) {
      handledKeys.add(key)
      if (ov.status === 'acted' || ov.status === 'ignored' || ov.status === 'no_response') {
        skippedKeys.add(key)
      }
    }
  }

  // Fetch stale actions from the unified view — only in-flight (non-terminal) statuses
  // The view exposes native_status (aliased from each source table's status column)
  // Terminal statuses should not be auto-flagged for no-response
  const TERMINAL_STATUSES = [
    'completed', 'cancelled', 'paid', 'reconciled', 'closed', 'archived',
    'dismissed', 'actioned', 'approved', 'rejected', 'disbursed', 'failed',
  ]
  const { data: staleRows, error: viewErr } = await svc
    .from('dashboard_actions')
    .select('action_id, action_type, sender_id, native_status')
    .lt('created_at', thresholdDate)
    .not('native_status', 'in', `(${TERMINAL_STATUSES.map(s => `"${s}"`).join(',')})`)
    .limit(MAX_FLAGS_PER_RUN)

  if (viewErr) {
    console.error('Failed to query dashboard_actions:', viewErr.message)
    return new Response(JSON.stringify({ error: viewErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Filter out already-handled items
  const toFlag = (staleRows || []).filter(row => {
    const key = `${row.action_type}:${row.action_id}`
    return !skippedKeys.has(key)
  })

  if (toFlag.length === 0) {
    return new Response(JSON.stringify({ flagged: 0, message: 'No stale actions to flag' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Resolve system super admin user_id for set_by
  const { data: systemSA } = await svc
    .from('super_admins')
    .select('user_id')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  const systemUserId = systemSA?.user_id
  if (!systemUserId) {
    return new Response(JSON.stringify({ error: 'No active super admin found for system actor' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const flagTimestamp = new Date().toISOString()

  // Audit each action before inserting overrides; fail-closed on any audit failure.
  for (const row of toFlag) {
    const senderId = String(row.sender_id ?? '')
    const { error: perAuditErr } = await svc.from('audit_logs').insert({
      module: 'monitoring_dashboard',
      action: 'auto_flag_no_response',
      entity_type: row.action_type,
      entity_id: row.action_id,
      entity_name: `${row.action_type}/${row.action_id}`,
      description: `Auto-flagged as no_response: ${row.action_type}/${row.action_id} has had no awareness action for ${THRESHOLD_HOURS}h`,
      success: true,
      actor_id: actor.actorId,
      actor_name: actor.actorName,
      metadata: {
        action_type: row.action_type,
        action_id: row.action_id,
        sender_id: senderId || null,
        before_status: 'received',
        after_status: 'no_response',
        threshold_hours: THRESHOLD_HOURS,
        source: 'monitoring-flag-no-response',
      }
    })
    if (perAuditErr) {
      console.error('PER-ACTION AUDIT FAILED (fail-closed, no overrides inserted):', row.action_id, perAuditErr.message)
      return new Response(JSON.stringify({
        error: 'Audit log failed; batch aborted with no state changes',
        action_id: row.action_id,
        detail: perAuditErr.message,
      }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
  }

  // Batch audit summary, also fail-closed.
  const { error: batchAuditErr } = await svc.from('audit_logs').insert({
    module: 'monitoring_dashboard',
    action: 'auto_flag_no_response_batch',
    entity_type: 'batch',
    entity_id: `no-response-batch-${Date.now()}`,
    entity_name: 'Automated 48h No-Response Flagging — Batch',
    description: `Batch auto-flagged ${toFlag.length} stale actions as no_response (>${THRESHOLD_HOURS}h without action)`,
    success: true,
    actor_id: actor.actorId,
    actor_name: actor.actorName,
    metadata: {
      flagged_count: toFlag.length,
      threshold_hours: THRESHOLD_HOURS,
      flagged_ids: toFlag.map(r => `${r.action_type}:${r.action_id}`),
      source: 'monitoring-flag-no-response',
    }
  })
  if (batchAuditErr) {
    console.error('BATCH AUDIT LOG FAILED (fail-closed, no overrides inserted):', batchAuditErr.message)
    return new Response(JSON.stringify({
      error: 'Batch audit log failed; batch aborted with no state changes',
      detail: batchAuditErr.message,
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const inserts = toFlag.map(row => ({
    action_id: row.action_id,
    action_type: row.action_type,
    status: 'no_response',
    set_by: systemUserId,
    set_at: flagTimestamp,
    notes: `Auto-flagged: no response for ${THRESHOLD_HOURS}h`,
  }))

  const { error: insertErr } = await svc.from('action_status_overrides').insert(inserts)
  if (insertErr) {
    console.error('Failed to insert no_response overrides (audits already written):', insertErr.message)
    return new Response(JSON.stringify({ error: insertErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  for (const row of toFlag) {
    const senderId = String(row.sender_id ?? '')
    if (!senderId || senderId.length < 10) continue

    // DB notification
    svc.from('notifications').insert({
      user_id: senderId,
      title: `Follow-up needed on your ${row.action_type.replace(/_/g, ' ')}`,
      message: `Your submission has received no response for ${THRESHOLD_HOURS} hours. Please follow up with your supervisor.`,
      type: 'warning',
      is_read: false,
      created_at: new Date().toISOString(),
    }).catch(err => console.warn('DB notification failed for', row.action_id, err))

    // FCM push
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-fcm-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        user_ids: [senderId],
        title: `Follow-up needed on your ${row.action_type.replace(/_/g, ' ')}`,
        body: `Your submission has received no response for ${THRESHOLD_HOURS} hours.`,
        notification_type: 'monitoring_no_response',
      }),
    }).catch(err => console.warn('FCM push failed for', row.action_id, err))

    // Email notification
    svc.from('profiles').select('email, full_name').eq('id', senderId).maybeSingle().then(({ data: profile }) => {
      if (!profile?.email) return
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          to: profile.email,
          subject: `Follow-up needed: Your ${row.action_type.replace(/_/g, ' ')} has no response`,
          type: 'notification',
          recipientName: profile.full_name || 'User',
          title_en: 'No Response Alert',
          title_ar: 'تنبيه: لا يوجد رد',
          message_en: `Your ${row.action_type.replace(/_/g, ' ')} submission (ID: ${row.action_id.slice(0, 8)}) has received no response for ${THRESHOLD_HOURS} hours. Please follow up with your supervisor.`,
          message_ar: `لم يتلق طلبك ردًا لمدة ${THRESHOLD_HOURS} ساعة. يرجى متابعة المشرف.`,
          priority: 'high',
        }),
      }).catch(err => console.warn('Email failed for', row.action_id, err))
    }).catch(err => console.warn('Profile lookup failed for', senderId, err))
  }

  return new Response(JSON.stringify({
    flagged: toFlag.length,
    threshold_hours: THRESHOLD_HOURS,
    ran_at: new Date().toISOString(),
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
