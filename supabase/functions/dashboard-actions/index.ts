import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALLOWED_TYPES = [
  'mmp_lifecycle', 'mmp_site_entry', 'site_visit', 'cost_reimbursement',
  'operational_cost', 'advance_payment', 'wallet_withdrawal', 'feedback', 'role_change'
]
const ALLOWED_STATUSES = ['received', 'acted', 'ignored', 'no_response']

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
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

  const url = new URL(req.url)
  const rawType = url.searchParams.get('type') || ''
  const rawStatus = url.searchParams.get('status') || ''
  const filterFrom = url.searchParams.get('from') || ''
  const filterTo = url.searchParams.get('to') || ''
  const filterSender = url.searchParams.get('sender') || ''
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '500', 10), 1000)

  const filterType = ALLOWED_TYPES.includes(rawType) ? rawType : ''
  const filterStatus = ALLOWED_STATUSES.includes(rawStatus) ? rawStatus : ''

  const svc = createServiceClient()

  // Fetch latest overrides (most recent per action_id+type)
  const { data: overridesRaw } = await svc
    .from('action_status_overrides')
    .select('action_id, action_type, status, notes, set_at')
    .order('set_at', { ascending: false })

  const overridesMap = new Map<string, { status: string; notes: string | null; set_at: string }>()
  for (const ov of (overridesRaw || [])) {
    const key = `${ov.action_type}:${ov.action_id}`
    if (!overridesMap.has(key)) {
      overridesMap.set(key, { status: ov.status, notes: ov.notes, set_at: ov.set_at })
    }
  }

  // Fetch sender online status from profiles.last_seen
  // 5-minute window = "online"
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data: onlineProfiles } = await svc
    .from('profiles')
    .select('id, last_seen')
    .gte('last_seen', fiveMinutesAgo)

  const onlineUserIds = new Set<string>()
  for (const p of (onlineProfiles || [])) {
    onlineUserIds.add(p.id)
  }

  // Query the unified dashboard_actions view (includes sender_id and details)
  let viewQuery = svc
    .from('dashboard_actions')
    .select('action_id, action_type, source_table, sender_id, sender_name, sender_role, recipient_role, native_status, created_at, updated_at, details')
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (filterType) viewQuery = viewQuery.eq('action_type', filterType)
  if (filterFrom) viewQuery = viewQuery.gte('created_at', filterFrom)
  if (filterTo) viewQuery = viewQuery.lte('created_at', filterTo + 'T23:59:59Z')

  const { data: viewRows, error: viewErr } = await viewQuery
  if (viewErr) {
    console.error('dashboard_actions view error:', viewErr.message)
    return new Response(JSON.stringify({ error: 'Failed to query dashboard_actions view', detail: viewErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Normalize and apply remaining filters
  let allActions = (viewRows || []).map((row: Record<string, unknown>) => {
    const key = `${row.action_type}:${row.action_id}`
    const override = overridesMap.get(key)
    const dashboardStatus = override?.status ?? 'received'
    const senderId = String(row.sender_id || '')

    // Apply sender name filter
    const senderName = String(row.sender_name || '')
    if (filterSender && !senderName.toLowerCase().includes(filterSender.toLowerCase())) {
      return null
    }

    // is_sender_online: check by sender UUID in the online set
    const isOnline = senderId ? onlineUserIds.has(senderId) : false

    return {
      action_id: String(row.action_id),
      action_type: String(row.action_type),
      source_table: String(row.source_table),
      sender_id: senderId,
      sender_name: senderName,
      sender_role: String(row.sender_role || ''),
      recipient_role: String(row.recipient_role || ''),
      native_status: String(row.native_status || ''),
      dashboard_status: dashboardStatus,
      latest_notes: override?.notes ?? null,
      last_override_at: override?.set_at ?? null,
      is_sender_online: isOnline,
      created_at: String(row.created_at || ''),
      updated_at: String(row.updated_at || row.created_at || ''),
      details: (row.details as Record<string, unknown>) ?? {},
    }
  }).filter(Boolean) as Array<{
    action_id: string; action_type: string; source_table: string;
    sender_id: string; sender_name: string; sender_role: string; recipient_role: string;
    native_status: string; dashboard_status: string; latest_notes: string | null;
    last_override_at: string | null; is_sender_online: boolean;
    created_at: string; updated_at: string; details: Record<string, unknown>;
  }>

  // Apply dashboard status filter
  if (filterStatus) {
    allActions = allActions.filter(a => a.dashboard_status === filterStatus)
  }

  // Group by action type
  const categories: Record<string, unknown[]> = {}
  for (const at of ALLOWED_TYPES) categories[at] = []
  for (const a of allActions) {
    if (a.action_type in categories) categories[a.action_type].push(a)
  }

  const total = allActions.length

  // Audit log this query (fail-closed: block if write fails)
  const auditFilters = { type: filterType, status: filterStatus, from: filterFrom, to: filterTo, sender: filterSender }
  const { error: auditErr } = await svc.from('audit_logs').insert({
    module: 'monitoring_dashboard',
    action: 'dashboard_query',
    entity_type: 'dashboard_read',
    entity_id: `read-${Date.now()}`,
    entity_name: 'System Monitoring Dashboard Read',
    description: `Dashboard queried by ${caller.email}: ${total} actions returned. Filters: ${JSON.stringify(auditFilters)}`,
    success: true,
    actor_id: caller.userId,
    actor_name: caller.email,
    metadata: {
      filters: auditFilters,
      row_count: total,
      source: 'dashboard-actions',
    }
  })

  if (auditErr) {
    console.error('DASHBOARD READ AUDIT FAILED (fail-closed):', auditErr)
    return new Response(JSON.stringify({ error: 'Audit logging failed for this query', detail: auditErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Write to dashboard_query_log (fail-closed secondary log)
  const { error: queryLogErr } = await svc.from('dashboard_query_log').insert({
    queried_by: caller.userId,
    filters: auditFilters,
    row_count: total,
    user_agent: req.headers.get('user-agent') || null,
  })
  if (queryLogErr) {
    console.error('DASHBOARD QUERY LOG FAILED (fail-closed):', queryLogErr)
    return new Response(JSON.stringify({ error: 'Query log write failed', detail: queryLogErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  return new Response(JSON.stringify({
    categories,
    meta: { total, queried_at: new Date().toISOString() }
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
