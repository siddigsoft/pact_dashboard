/**
 * dashboard-actions-status
 *
 * POST /functions/v1/dashboard-actions-status
 * Body: { actions: [{ action_id, action_type }], status, notes? }
 * OR:   Array<{ action_id, action_type, status?, notes? }>  (legacy bulk shape)
 *
 * Super Admin-only. Sets the dashboard awareness status for one or more actions.
 * MAX 100 items per call.
 * Writes to action_status_overrides (append-only) and audit_logs (fail-closed).
 * Dispatches push + email notification to sender on every decision.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALLOWED_STATUSES = ['received', 'acted', 'ignored', 'no_response'] as const
const ALLOWED_TYPES = [
  'mmp_lifecycle', 'mmp_site_entry', 'site_visit', 'cost_reimbursement',
  'operational_cost', 'advance_payment', 'wallet_withdrawal', 'feedback', 'role_change'
] as const
const MAX_BULK_CAP = 100

type DashboardStatus = typeof ALLOWED_STATUSES[number]
type ActionType = typeof ALLOWED_TYPES[number]

function createServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  )
}

async function verifyCallerIsSuperAdmin(authHeader: string): Promise<{ userId: string; email: string } | null> {
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
  return { userId: user.id, email: user.email ?? '' }
}

async function dispatchNotification(
  svc: ReturnType<typeof createServiceClient>,
  senderId: string,
  actionType: string,
  statusLabel: string,
  notes?: string | null
) {
  if (!senderId || senderId.length < 10) return

  const title = `Your ${actionType.replace(/_/g, ' ')} has been reviewed`
  const body = `Status updated to "${statusLabel}"${notes ? `. Notes: ${notes}` : '.'}`

  await svc.from('notifications').insert({
    user_id: senderId,
    title,
    message: body,
    type: 'info',
    is_read: false,
    created_at: new Date().toISOString(),
  }).catch(err => console.warn('DB notification failed:', err))

  fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-fcm-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({ user_ids: [senderId], title, body, notification_type: 'monitoring_status_update' }),
  }).catch(err => console.warn('FCM push failed:', err))

  try {
    const { data: profile } = await svc
      .from('profiles')
      .select('email, full_name')
      .eq('id', senderId)
      .maybeSingle()

    if (profile?.email) {
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          to: profile.email,
          subject: title,
          type: 'notification',
          recipientName: profile.full_name || 'User',
          title_en: 'Dashboard Status Update',
          title_ar: 'تحديث حالة لوحة التحكم',
          message_en: `Your ${actionType.replace(/_/g, ' ')} submission has been reviewed and marked as "${statusLabel}".${notes ? ` Notes: ${notes}` : ''}`,
          message_ar: `تمت مراجعة طلبك وتم تحديد حالته.`,
          priority: 'normal',
        }),
      }).catch(err => console.warn('Email failed:', err))
    }
  } catch (err) {
    console.warn('Email resolution failed:', err)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const caller = await verifyCallerIsSuperAdmin(authHeader)
  if (!caller) {
    return new Response(JSON.stringify({ error: 'Forbidden: Super Admin only' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Canonical shape: { actions: [{action_id, action_type, source_table}], status, notes }
  // Also supports array body shape for backward compat: [{action_id, action_type, source_table, status, notes}]
  interface NormalizedItem { action_id: string; action_type: string; source_table?: string; status: DashboardStatus; notes?: string }
  let items: NormalizedItem[]

  if (Array.isArray(body)) {
    // Array shape
    items = (body as Array<{action_id: string; action_type: string; source_table?: string; status: string; notes?: string}>).map(i => ({
      action_id: i.action_id,
      action_type: i.action_type,
      source_table: i.source_table,
      status: i.status as DashboardStatus,
      notes: i.notes,
    }))
  } else {
    // Object shape
    const b = body as { actions?: Array<{action_id: string; action_type: string; source_table?: string}>; status: string; notes?: string }
    const statusVal = b.status as DashboardStatus
    const actionsArr = b.actions || []
    items = actionsArr.map(a => ({ action_id: a.action_id, action_type: a.action_type, source_table: a.source_table, status: statusVal, notes: b.notes }))
  }

  if (items.length === 0) {
    return new Response(JSON.stringify({ error: 'No actions provided' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  if (items.length > MAX_BULK_CAP) {
    return new Response(JSON.stringify({ error: `Bulk cap exceeded: max ${MAX_BULK_CAP} items per call` }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  for (const item of items) {
    if (!item.action_id || typeof item.action_id !== 'string') {
      return new Response(JSON.stringify({ error: 'action_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    if (!ALLOWED_TYPES.includes(item.action_type as ActionType)) {
      return new Response(JSON.stringify({ error: `Invalid action_type: ${item.action_type}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    if (!ALLOWED_STATUSES.includes(item.status as DashboardStatus)) {
      return new Response(JSON.stringify({ error: `Invalid status: ${item.status}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
  }

  const svc = createServiceClient()
  const now = new Date().toISOString()

  // Fetch actual previous status for each item (for forensic audit)
  const prevStatuses = new Map<string, string>()
  for (const item of items) {
    const { data: prevOverride } = await svc
      .from('action_status_overrides')
      .select('status')
      .eq('action_id', item.action_id)
      .eq('action_type', item.action_type)
      .order('set_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    prevStatuses.set(`${item.action_type}:${item.action_id}`, prevOverride?.status ?? 'received')
  }

  const inserts = items.map(item => ({
    action_id: item.action_id,
    action_type: item.action_type,
    source_table: item.source_table || null,
    status: item.status,
    notes: item.notes || null,
    set_by: caller.userId,
    set_at: now,
  }))

  const { error: insertErr } = await svc.from('action_status_overrides').insert(inserts)

  const mutationSucceeded = !insertErr
  if (insertErr) {
    console.error('Failed to insert status overrides:', insertErr)
  }

  const auditEntries = items.map(item => ({
    module: 'monitoring_dashboard',
    action: 'status_override',
    entity_type: item.action_type,
    entity_id: item.action_id,
    entity_name: `${item.action_type}/${item.action_id}`,
    description: `Dashboard awareness status: "${prevStatuses.get(`${item.action_type}:${item.action_id}`) ?? 'received'}" → "${item.status}" for ${item.action_type}/${item.action_id}${item.source_table ? ` (${item.source_table})` : ''}${item.notes ? ` — ${item.notes}` : ''}${insertErr ? ` [FAILED: ${insertErr.message}]` : ''}`,
    success: mutationSucceeded,
    actor_id: caller.userId,
    actor_name: caller.email,
    metadata: {
      action_type: item.action_type,
      action_id: item.action_id,
      source_table: item.source_table || null,
      before_status: prevStatuses.get(`${item.action_type}:${item.action_id}`) ?? 'received',
      after_status: item.status,
      notes: item.notes || null,
      applied_by: caller.userId,
      applied_at: now,
      source: 'dashboard-actions-status',
      error: insertErr?.message || null,
    }
  }))

  if (!mutationSucceeded) {
    await svc.from('audit_logs').insert(auditEntries).catch(e => console.error('Audit of failed mutation could not be written:', e))
    return new Response(JSON.stringify({ error: 'Failed to save status override', detail: insertErr!.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const { error: auditErr } = await svc.from('audit_logs').insert(auditEntries)
  if (auditErr) {
    console.error('AUDIT LOG FAILED after successful mutation:', auditErr)
    return new Response(JSON.stringify({ error: 'Status saved but audit logging failed; treat this operation as unconfirmed', detail: auditErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Dispatch push + email notifications to affected senders (non-blocking after audit succeeds)
  for (const item of items) {
    try {
      const { data: actionRow } = await svc
        .from('dashboard_actions')
        .select('sender_id')
        .eq('action_id', item.action_id)
        .eq('action_type', item.action_type)
        .maybeSingle()

      if (actionRow?.sender_id) {
        await dispatchNotification(svc, String(actionRow.sender_id), item.action_type, item.status.replace(/_/g, ' '), item.notes)
      }
    } catch (err) {
      console.warn('Notification dispatch failed for', item.action_id, err)
    }
  }

  return new Response(JSON.stringify({ success: true, count: items.length }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
