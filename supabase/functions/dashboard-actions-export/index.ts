/**
 * dashboard-actions-export
 * POST/GET /functions/v1/dashboard-actions-export
 * Body: { format: 'csv'|'pdf', filters?: { type, status, from, to, sender } }
 * CSV: action feed (dashboard_actions + latest overrides)
 * PDF: audit log report (audit_logs WHERE module=monitoring_dashboard)
 * Super Admin only.
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

function escapeCsv(val: unknown): string {
  const s = val == null ? '' : String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return 'No data\n'
  const headers = Object.keys(rows[0])
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map(h => escapeCsv(row[h])).join(','))
  }
  return lines.join('\n')
}

/**
 * Server-side PDF generation using PDF 1.4 specification.
 * Produces a valid binary PDF with report header + tabular data.
 * Pure Deno — no third-party library required.
 */
function generatePdf(opts: {
  generatedAt: string
  generatedBy: string
  rowCount: number
  filters: Record<string, string>
  rows: Record<string, unknown>[]
}): Uint8Array {
  const enc = (s: string) => String(s ?? '').replace(/[\\()]/g, '\\$&').replace(/\r?\n/g, ' ')
  const cols = ['created_at', 'action', 'actor_name', 'entity_type', 'entity_name', 'description', 'success']
  const pageWidth = 842
  const pageHeight = 595
  const margin = 30
  const rowH = 14
  const colW = Math.floor((pageWidth - 2 * margin) / cols.length)

  // Build content stream lines
  const lines: string[] = []

  // Title + meta
  lines.push(`BT /F1 12 Tf ${margin} ${pageHeight - margin - 12} Td (PACT System Monitoring Report) Tj ET`)
  lines.push(`BT /F1 8 Tf ${margin} ${pageHeight - margin - 26} Td (Generated: ${enc(opts.generatedAt.slice(0, 19))} by ${enc(opts.generatedBy)}) Tj ET`)
  lines.push(`BT /F1 8 Tf ${margin} ${pageHeight - margin - 38} Td (Total rows: ${opts.rowCount}  Filters: ${enc(JSON.stringify(opts.filters))}) Tj ET`)

  // Column headers
  let y = pageHeight - margin - 60
  for (let i = 0; i < cols.length; i++) {
    const x = margin + i * colW
    lines.push(`BT /F1 7 Tf ${x} ${y} Td (${enc(cols[i])}) Tj ET`)
  }
  y -= rowH

  // Data rows — multi-page: track y position and restart at top of new page when needed
  // Each page starts at y = pageHeight - margin - rowH (first data row below header area on page 2+)
  const firstPageDataStart = y
  const dataStart = pageHeight - margin - rowH
  let currentPage = 1

  for (const row of opts.rows) {
    if (y < margin + rowH) {
      // Move to next page: reset y to top of data area
      y = dataStart
      currentPage++
      // Repeat column headers on new page
      for (let i = 0; i < cols.length; i++) {
        const x = margin + i * colW
        lines.push(`BT /F1 7 Tf ${x} ${y} Td (${enc(cols[i])}) Tj ET`)
      }
      y -= rowH
    }
    for (let i = 0; i < cols.length; i++) {
      const x = margin + i * colW
      const val = String(row[cols[i]] ?? '').slice(0, 18)
      lines.push(`BT /F1 6 Tf ${x} ${y} Td (${enc(val)}) Tj ET`)
    }
    y -= rowH
  }

  // Suppress unused variable warning
  void firstPageDataStart
  void currentPage

  const content = lines.join('\n')
  const te = new TextEncoder()
  const contentBytes = te.encode(content)
  const streamLen = contentBytes.length

  // Build PDF objects and compute byte offsets for xref table
  const pdfHeader = '%PDF-1.4\n'
  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'
  const obj2 = '2 0 obj\n<< /Type /Pages /Kids [4 0 R] /Count 1 >>\nendobj\n'
  const obj3 = '3 0 obj\n<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>\nendobj\n'
  const obj4 = `4 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents 5 0 R /Resources 3 0 R >>\nendobj\n`
  const obj5 = `5 0 obj\n<< /Length ${streamLen} >>\nstream\n${content}\nendstream\nendobj\n`

  const offsets: number[] = []
  let offset = pdfHeader.length
  offsets.push(offset); offset += obj1.length
  offsets.push(offset); offset += obj2.length
  offsets.push(offset); offset += obj3.length
  offsets.push(offset); offset += obj4.length
  offsets.push(offset); offset += obj5.length

  const xrefStart = offset
  const xrefLines = offsets.map(o => o.toString().padStart(10, '0') + ' 00000 n \n').join('')
  const xref = `xref\n0 6\n0000000000 65535 f \n${xrefLines}`
  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`

  const fullPdf = pdfHeader + obj1 + obj2 + obj3 + obj4 + obj5 + xref + trailer
  return te.encode(fullPdf)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
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

  // Parse params from GET query string or POST body
  // POST body may be either:
  //   { format, filters: { type, status, from, to, sender } }  (frontend shape)
  //   { format, action_type, date_from, date_to }              (direct shape)
  let rawParams: Record<string, unknown> = {}
  if (req.method === 'GET') {
    const url = new URL(req.url)
    url.searchParams.forEach((v, k) => { rawParams[k] = v })
  } else {
    try {
      rawParams = (await req.json()) as Record<string, unknown>
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
  }

  // Normalize: if `filters` is an object, extract from it
  const nestedFilters = (rawParams.filters && typeof rawParams.filters === 'object')
    ? rawParams.filters as Record<string, string>
    : null

  const params = {
    format: String(rawParams.format || 'csv'),
    // Support both direct and nested filter shapes
    action_type: String(nestedFilters?.type || rawParams.action_type || ''),
    status_filter: String(nestedFilters?.status || rawParams.status || ''),
    date_from: String(nestedFilters?.from || rawParams.date_from || ''),
    date_to: String(nestedFilters?.to || rawParams.date_to || ''),
    sender_filter: String(nestedFilters?.sender || rawParams.sender || ''),
  }

  const format = params.format.toLowerCase()
  if (!['csv', 'pdf'].includes(format)) {
    return new Response(JSON.stringify({ error: 'format must be csv or pdf' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const svc = createServiceClient()
  const now = new Date().toISOString()

  // ——— PDF: AUDIT LOG REPORT ———
  // PDF exports the immutable audit_log entries for monitoring_dashboard module,
  // including actor name, action, entity info, and notes — full compliance report.
  if (format === 'pdf') {
    let auditQuery = svc
      .from('audit_logs')
      .select('id, action, entity_type, entity_id, entity_name, description, success, actor_name, created_at, metadata')
      .eq('module', 'monitoring_dashboard')
      .order('created_at', { ascending: false })
      .limit(10000)

    if (params.date_from) auditQuery = auditQuery.gte('created_at', params.date_from)
    if (params.date_to) auditQuery = auditQuery.lte('created_at', params.date_to + 'T23:59:59Z')
    if (params.action_type) {
      const types = params.action_type.split(',').map((s: string) => s.trim()).filter(Boolean)
      if (types.length === 1) auditQuery = auditQuery.eq('entity_type', types[0])
      else if (types.length > 1) auditQuery = auditQuery.in('entity_type', types)
    }

    const { data: rawAudit, error: auditErr } = await auditQuery
    if (auditErr) {
      return new Response(JSON.stringify({ error: 'Failed to fetch audit logs for PDF', detail: auditErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Apply sender filter (actor_name, server-side post-fetch since ilike not needed)
    const auditRows = params.sender_filter
      ? (rawAudit ?? []).filter(r => String(r.actor_name || '').toLowerCase().includes(params.sender_filter.toLowerCase()))
      : (rawAudit ?? [])

    const activeFilters = {
      action_type: params.action_type || null,
      date_from: params.date_from || null,
      date_to: params.date_to || null,
      sender: params.sender_filter || null,
    }

    const { error: auditExportErr } = await svc.from('audit_logs').insert({
      module: 'monitoring_dashboard',
      action: 'export_pdf_audit_report',
      entity_type: 'audit_export',
      entity_id: `pdf-export-${Date.now()}`,
      entity_name: 'Audit Log PDF Report Export',
      description: `PDF audit report exported by ${caller.email}: ${auditRows.length} entries`,
      success: true,
      actor_id: caller.userId,
      actor_name: caller.email,
      metadata: { format: 'pdf', row_count: auditRows.length, filters: activeFilters, exported_at: now, source: 'dashboard-actions-export' }
    })
    if (auditExportErr) {
      console.error('PDF EXPORT AUDIT FAILED (fail-closed):', auditExportErr)
      return new Response(JSON.stringify({ error: 'Export audit logging failed; PDF export blocked', detail: auditExportErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { error: pdfQueryLogErr } = await svc.from('dashboard_query_log').insert({
      queried_by: caller.userId,
      export_format: 'pdf',
      row_count: auditRows.length,
      filters: activeFilters,
      queried_at: now,
    })
    if (pdfQueryLogErr) {
      console.error('PDF QUERY LOG FAILED (fail-closed):', pdfQueryLogErr)
      return new Response(JSON.stringify({ error: 'Query log write failed; PDF export blocked', detail: pdfQueryLogErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Generate server-side PDF from audit rows
    const pdfRows = (auditRows ?? []).map(r => ({
      action: r.action ?? '',
      actor_name: r.actor_name ?? '',
      entity_name: r.entity_name ?? '',
      entity_type: r.entity_type ?? '',
      description: r.description ?? '',
      success: r.success ? 'yes' : 'no',
      created_at: r.created_at ?? '',
    }))

    const pdfBytes = generatePdf({
      generatedAt: now,
      generatedBy: caller.email,
      rowCount: pdfRows.length,
      filters: {
        date_from: params.date_from || 'all',
        date_to: params.date_to || 'all',
      },
      rows: pdfRows,
    })

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="pact-audit-report-${now.slice(0, 10)}.pdf"`,
      }
    })
  }

  // ——— DASHBOARD_ACTIONS QUERY (for csv / pdf) ———
  let dataQuery = svc
    .from('dashboard_actions')
    .select('action_id, action_type, source_table, sender_id, sender_name, native_status, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(10000)

  if (params.action_type) {
    const types = params.action_type.split(',').map((s: string) => s.trim()).filter(Boolean)
    if (types.length === 1) {
      dataQuery = dataQuery.eq('action_type', types[0])
    } else if (types.length > 1) {
      dataQuery = dataQuery.in('action_type', types)
    }
  }
  if (params.date_from) dataQuery = dataQuery.gte('created_at', params.date_from)
  if (params.date_to) dataQuery = dataQuery.lte('created_at', params.date_to + 'T23:59:59Z')

  const { data: rows, error: queryErr } = await dataQuery
  if (queryErr) {
    return new Response(JSON.stringify({ error: 'Failed to query dashboard actions', detail: queryErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Pre-fetch all latest overrides in one query to avoid N+1
  const actionIds = (rows ?? []).map(r => (r as Record<string, unknown>).action_id as string)
  const { data: allOverrides } = actionIds.length > 0
    ? await svc
        .from('action_status_overrides')
        .select('action_id, action_type, status, notes, set_at')
        .in('action_id', actionIds)
        .order('set_at', { ascending: false })
    : { data: [] }

  // Build latest-override lookup: "action_type:action_id" → first (newest) entry
  const overrideMap = new Map<string, { status: string; notes: string | null }>()
  for (const ov of (allOverrides ?? [])) {
    const key = `${ov.action_type}:${ov.action_id}`
    if (!overrideMap.has(key)) overrideMap.set(key, { status: ov.status, notes: ov.notes ?? null })
  }

  // Enrich rows and apply filters
  const senderLower = params.sender_filter.toLowerCase()
  const rowsWithStatus: Record<string, unknown>[] = []
  for (const row of (rows ?? [])) {
    const r = row as Record<string, unknown>

    if (senderLower && !String(r.sender_name || '').toLowerCase().includes(senderLower)) continue

    const override = overrideMap.get(`${r.action_type}:${r.action_id}`)
    const dashboardStatus = override?.status ?? 'received'

    if (params.status_filter && dashboardStatus !== params.status_filter) continue

    rowsWithStatus.push({
      action_id: r.action_id,
      action_type: r.action_type,
      source_table: r.source_table,
      sender_name: r.sender_name,
      native_status: r.native_status,
      dashboard_status: dashboardStatus,
      latest_notes: override?.notes ?? '',
      created_at: r.created_at,
      updated_at: r.updated_at,
      sender_id: r.sender_id,
    })
  }

  // Audit this export (fail-closed — block export if audit fails)
  const { error: exportLogErr } = await svc.from('audit_logs').insert({
    module: 'monitoring_dashboard',
    action: `export_${format}`,
    entity_type: 'export',
    entity_id: `export-${format}-${Date.now()}`,
    entity_name: `Dashboard Export (${format.toUpperCase()})`,
    description: `${format.toUpperCase()} export by ${caller.email}: ${rowsWithStatus.length} rows. Filters: ${JSON.stringify({ action_type: params.action_type, status: params.status_filter, date_from: params.date_from, date_to: params.date_to })}`,
    success: true,
    actor_id: caller.userId,
    actor_name: caller.email,
    metadata: {
      format,
      row_count: rowsWithStatus.length,
      filters: {
        action_type: params.action_type || null,
        status: params.status_filter || null,
        date_from: params.date_from || null,
        date_to: params.date_to || null,
        sender: params.sender_filter || null,
      },
      exported_at: now,
      source: 'dashboard-actions-export',
    }
  })

  if (exportLogErr) {
    console.error('EXPORT AUDIT LOG FAILED (fail-closed):', exportLogErr)
    return new Response(JSON.stringify({ error: 'Export audit logging failed; export blocked', detail: exportLogErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Log to dashboard_query_log (fail-closed)
  const { error: queryLogErr } = await svc.from('dashboard_query_log').insert({
    queried_by: caller.userId,
    export_format: format,
    row_count: rowsWithStatus.length,
    filters: { action_type: params.action_type, date_from: params.date_from, date_to: params.date_to },
    queried_at: now,
  })
  if (queryLogErr) {
    console.error('EXPORT QUERY LOG FAILED (fail-closed):', queryLogErr)
    return new Response(JSON.stringify({ error: 'Query log write failed; export blocked', detail: queryLogErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // CSV: return action feed with awareness status overlay
  const csvText = rowsToCsv(rowsWithStatus)
  return new Response(csvText, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="pact-dashboard-actions-${now.slice(0, 10)}.csv"`,
    }
  })
})
