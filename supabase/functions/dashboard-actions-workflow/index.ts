/**
 * dashboard-actions-workflow
 *
 * POST /functions/v1/dashboard-actions-workflow
 * Body: { action_id, source_table, workflow_action, notes? }
 *
 * Super Admin-only. Applies a workflow state transition on a source-table row.
 * Validates allowed transitions from current state (not just globally allowed actions).
 * Writes to action_status_overrides and audit_logs (fail-closed).
 * Dispatches push + email notifications to sender.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

/**
 * SOURCE TABLE CONTRACTS
 * Maps source_table → Supabase table, status column, action type, and transition map.
 *  - transitions: allowed state machine edges { fromStatus → allowedWorkflowActions }
 */
interface TransitionMap { [fromStatus: string]: string[] }

interface TableContract {
  table: string
  statusColumn: string
  actionType: string
  ownerFields: string[]
  transitions: TransitionMap
}

const SOURCE_TABLE_CONTRACTS: Record<string, TableContract> = {
  mmp_files: {
    table: 'mmp_files',
    statusColumn: 'status',
    actionType: 'mmp_lifecycle',
    ownerFields: ['uploaded_by', 'user_id'],
    transitions: {
      pending:                  ['approve', 'reject', 'request_revision'],
      verified:                 ['approve', 'reject', 'request_revision'],
      rejected:                 ['approve', 'request_revision'],
      approved:                 ['archive'],
      archived:                 [],
      deleted:                  [],
      recalled:                 ['approve', 'reject'],
      returned:                 ['approve', 'reject'],
      returned_to_fom:          ['approve', 'reject'],
      forwarded_to_fom:         ['approve', 'reject'],
      forwarded_to_coordinator: ['approve', 'reject'],
      pending_acceptance:       ['approve', 'reject'],
    }
  },
  mmp_site_entries: {
    table: 'mmp_site_entries',
    statusColumn: 'status',
    actionType: 'mmp_site_entry',
    ownerFields: ['mmp_id'],
    transitions: {
      pending:                   ['assign', 'reject', 'cancel'],
      forwarded:                 ['assign', 'reject', 'cancel'],
      assigned:                  ['dispatch', 'reject', 'cancel'],
      dispatched:                ['accept', 'reject', 'cancel'],
      claimed:                   ['complete', 'reject', 'cancel'],
      accepted:                  ['complete', 'reject', 'cancel'],
      inProgress:                ['complete', 'reject', 'cancel'],
      in_progress:               ['complete', 'reject', 'cancel'],
      ongoing:                   ['complete', 'reject', 'cancel'],
      permits_attached:          ['verify', 'reject', 'cancel'],
      cp_verified:               ['verify', 'reject', 'cancel'],
      locality_permit_verified:  ['verify', 'reject', 'cancel'],
      permitVerified:            ['verify', 'reject', 'cancel'],
      verified:                  ['approve', 'reject'],
      complete:                  ['approve'],
      completed:                 ['approve'],
      approved:                  ['archive'],
      archived:                  [],
      rejected:                  [],
      cancelled:                 [],
      canceled:                  [],
    }
  },
  site_visits: {
    table: 'site_visits',
    statusColumn: 'status',
    actionType: 'site_visit',
    ownerFields: ['assigned_to', 'requested_by', 'user_id'],
    transitions: {
      pending:       ['assign', 'cancel'],
      assigned:      ['dispatch', 'cancel'],
      dispatched:    ['accept', 'cancel'],
      accepted:      ['complete', 'cancel'],
      inProgress:    ['complete', 'cancel'],
      permitVerified:['complete', 'cancel'],
      verified:      ['complete', 'cancel'],
      completed:     [],
      cancelled:     [],
      canceled:      [],
    }
  },
  cost_submissions: {
    table: 'cost_submissions',
    statusColumn: 'status',
    actionType: 'cost_reimbursement',
    ownerFields: ['submitted_by', 'user_id'],
    transitions: {
      pending:                ['approve', 'reject', 'request_info'],
      under_review:           ['approve', 'reject', 'request_info'],
      approved:               ['pay', 'reject'],
      rejected:               ['request_info'],
      changes_requested:      ['approve', 'reject'],
      reconciliation_pending: ['approve', 'reject'],
      paid:                   [],
      reconciled:             [],
      closed:                 [],
      cancelled:              [],
    }
  },
  operational_cost_submissions: {
    table: 'operational_cost_submissions',
    statusColumn: 'status',
    actionType: 'operational_cost',
    ownerFields: ['submitted_by', 'user_id'],
    transitions: {
      pending:           ['approve', 'reject', 'request_info'],
      under_review:      ['approve', 'reject', 'request_info'],
      approved:          ['pay', 'reject'],
      rejected:          ['request_info'],
      changes_requested: ['approve', 'reject'],
      paid:              [],
      reconciled:        [],
      closed:            [],
      cancelled:         [],
    }
  },
  down_payment_requests: {
    table: 'down_payment_requests',
    statusColumn: 'status',
    actionType: 'advance_payment',
    ownerFields: ['requested_by', 'user_id'],
    transitions: {
      pending_supervisor: ['approve', 'reject', 'request_info'],
      pending_admin:      ['approve', 'reject'],
      approved:           ['pay', 'cancel'],
      partially_paid:     ['pay', 'cancel'],
      fully_paid:         [],
      rejected:           [],
      deleted:            [],
      cancelled:          [],
    }
  },
  wallet_transactions: {
    table: 'wallet_transactions',
    statusColumn: 'status',
    actionType: 'wallet_withdrawal',
    ownerFields: ['user_id'],
    transitions: {
      pending:  ['approve', 'reject'],
      approved: ['complete', 'reject'],
      rejected: [],
      completed: [],
      failed:   [],
    }
  },
  feedback: {
    table: 'feedback',
    statusColumn: 'status',
    actionType: 'feedback',
    ownerFields: ['user_id'],
    transitions: {
      new:      ['resolve', 'reject'],
      resolved: [],
      rejected: [],
    }
  },
  // Approval Requests: statuses from src/types/approval-request.ts
  approval_requests: {
    table: 'approval_requests',
    statusColumn: 'status',
    actionType: 'role_change',
    ownerFields: ['requested_by', 'user_id'],
    transitions: {
      pending:   ['approve', 'reject', 'cancel'],
      approved:  [],
      rejected:  [],
      cancelled: [],
    }
  },
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

  const { action_id, source_table, workflow_action, notes } =
    body as { action_id?: string; source_table?: string; workflow_action?: string; notes?: string }

  if (!action_id || !source_table || !workflow_action) {
    return new Response(JSON.stringify({ error: 'action_id, source_table, and workflow_action are required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const contract = SOURCE_TABLE_CONTRACTS[source_table]
  if (!contract) {
    return new Response(JSON.stringify({ error: `Unknown source_table: ${source_table}` }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const svc = createServiceClient()

  // Fetch current row from source table
  const { data: currentRow, error: fetchErr } = await svc
    .from(contract.table)
    .select('*')
    .eq('id', action_id)
    .maybeSingle()

  if (fetchErr || !currentRow) {
    return new Response(JSON.stringify({ error: `Action not found in ${source_table}` }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const currentStatus = String((currentRow as Record<string, unknown>)[contract.statusColumn] ?? '')

  // Strict transition validation: action must be allowed from the exact current status
  const allowedFromCurrent = contract.transitions[currentStatus]
  if (!allowedFromCurrent) {
    return new Response(JSON.stringify({
      error: `No transitions defined from status "${currentStatus}" in ${source_table}`,
      current_status: currentStatus,
      defined_statuses: Object.keys(contract.transitions),
    }), {
      status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  if (!allowedFromCurrent.includes(workflow_action)) {
    return new Response(JSON.stringify({
      error: `Workflow action "${workflow_action}" is not allowed from status "${currentStatus}" in ${source_table}`,
      allowed_from_current_status: allowedFromCurrent,
      current_status: currentStatus,
    }), {
      status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Determine target status from workflow action name
  // Maps Super Admin action verb → the actual status value written to the source table
  const actionToStatus: Record<string, string> = {
    approve:          'approved',
    reject:           'rejected',
    verify:           'verified',
    archive:          'archived',
    request_revision: 'rejected',
    request_info:     'changes_requested',
    complete:         'completed',
    cancel:           'cancelled',
    accept:           'accepted',
    dispatch:         'dispatched',
    assign:           'assigned',
    pay:              'paid',
    resolve:          'resolved',
  }
  const targetStatus = actionToStatus[workflow_action] ?? workflow_action

  const now = new Date().toISOString()
  const beforeSnapshot = { ...(currentRow as Record<string, unknown>) }

  const { error: updateErr } = await svc
    .from(contract.table)
    .update({ [contract.statusColumn]: targetStatus, updated_at: now })
    .eq('id', action_id)

  const mutationSucceeded = !updateErr
  if (updateErr) console.error('Failed to update source table:', updateErr)

  const { data: afterRow } = mutationSucceeded
    ? await svc.from(contract.table).select('*').eq('id', action_id).maybeSingle()
    : { data: null }

  const auditRecord = {
    module: 'monitoring_dashboard',
    action: `workflow_${workflow_action}`,
    entity_type: contract.actionType,
    entity_id: action_id,
    entity_name: `${source_table}/${action_id}`,
    description: `Workflow "${workflow_action}" on ${source_table}/${action_id}: "${currentStatus}" → "${targetStatus}"${notes ? `. Notes: ${notes}` : ''}${updateErr ? ` [FAILED: ${updateErr.message}]` : ''}`,
    success: mutationSucceeded,
    actor_id: caller.userId,
    actor_name: caller.email,
    metadata: {
      workflow_action,
      source_table,
      action_type: contract.actionType,
      before_state: beforeSnapshot,
      after_state: afterRow ?? { id: action_id, status: mutationSucceeded ? targetStatus : currentStatus, updated_at: now },
      notes: notes || null,
      source: 'dashboard-actions-workflow',
      error: updateErr?.message || null,
    }
  }

  const { error: auditErr } = await svc.from('audit_logs').insert(auditRecord)

  if (!mutationSucceeded) {
    return new Response(JSON.stringify({ error: 'Failed to apply workflow action', detail: updateErr!.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  if (auditErr) {
    console.error('AUDIT LOG FAILED after successful mutation:', auditErr)
    return new Response(JSON.stringify({ error: 'Workflow applied but audit logging failed; treat this operation as unconfirmed', detail: auditErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  await svc.from('action_status_overrides').insert({
    action_id,
    action_type: contract.actionType,
    source_table,
    status: 'acted',
    notes: notes ? `[${workflow_action}] ${notes}` : `[${workflow_action}] Workflow action applied`,
    set_by: caller.userId,
    set_at: now,
  })

  const row = currentRow as Record<string, unknown>
  let senderId = ''

  if (source_table === 'mmp_site_entries') {
    const mmpId = row['mmp_id']
    if (mmpId && typeof mmpId === 'string') {
      const { data: mmpFile } = await svc
        .from('mmp_files')
        .select('uploaded_by, user_id')
        .eq('id', mmpId)
        .maybeSingle()
      senderId = String(mmpFile?.uploaded_by ?? mmpFile?.user_id ?? '')
    }
  } else {
    for (const field of contract.ownerFields) {
      const val = row[field]
      if (val && typeof val === 'string' && val.length > 10) {
        senderId = val
        break
      }
    }
  }

  if (senderId) {
    const actionVerb = workflow_action === 'approve' ? 'approved' :
                       workflow_action === 'reject' ? 'rejected' :
                       workflow_action === 'complete' ? 'completed' :
                       workflow_action === 'cancel' ? 'cancelled' :
                       `updated (${workflow_action})`

    const notifTitle = `Your ${contract.actionType.replace(/_/g, ' ')} has been ${actionVerb}`
    const notifBody = `Action: ${workflow_action}. New status: ${targetStatus}.${notes ? ` Notes: ${notes}` : ''}`

    svc.from('notifications').insert({
      user_id: senderId,
      title: notifTitle,
      message: notifBody,
      type: workflow_action === 'reject' || workflow_action === 'cancel' ? 'warning' : 'info',
      is_read: false,
      created_at: now,
    }).catch(err => console.warn('DB notification failed:', err))

    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-fcm-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        user_ids: [senderId],
        title: notifTitle,
        body: notifBody,
        notification_type: `workflow_${workflow_action}`,
      }),
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
            subject: notifTitle,
            type: 'notification',
            recipientName: profile.full_name || 'User',
            title_en: 'Action Status Update',
            title_ar: 'تحديث حالة الطلب',
            message_en: `Your ${contract.actionType.replace(/_/g, ' ')} (ID: ${action_id.slice(0, 8)}) has been ${actionVerb}. ${notes ? `Notes: ${notes}` : ''}`,
            message_ar: `تم تحديث حالة طلبك إلى "${targetStatus}".`,
            priority: 'high',
          }),
        }).catch(err => console.warn('Email failed:', err))
      }
    } catch (err) {
      console.warn('Email resolution failed:', err)
    }
  }

  return new Response(JSON.stringify({
    success: true,
    action_id,
    source_table,
    previous_status: currentStatus,
    new_status: targetStatus,
    workflow_action,
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
