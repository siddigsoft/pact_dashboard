import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_URL = 'https://app.pactorg.com'

function buildDigestHtml(
  recipientName: string,
  pendingItems: Array<{ id: string; siteName: string; amount: number; reclaimedAt: string; reason: string }>
): string {
  const rows = pendingItems.map(item => `
    <tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:8px 10px;font-family:monospace;font-size:12px;color:#374151;">${item.id}</td>
      <td style="padding:8px 10px;font-size:13px;color:#111827;">${item.siteName}</td>
      <td style="padding:8px 10px;font-size:13px;font-weight:600;color:#d97706;">${Number(item.amount).toLocaleString()} SDG</td>
      <td style="padding:8px 10px;font-size:12px;color:#6b7280;">${item.reclaimedAt}</td>
      <td style="padding:8px 10px;font-size:12px;color:#ef4444;">${item.reason || 'Unspecified'}</td>
    </tr>
  `).join('')

  const totalAmount = pendingItems.reduce((s, i) => s + Number(i.amount), 0)

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Reclaim Reconciliation Digest</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;background:#f5f5f5;">
  <div style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">

    <!-- Header -->
    <div style="background:#0f2041;padding:28px 32px;">
      <h1 style="color:#fff;margin:0;font-size:22px;">PACT Command Center</h1>
      <p style="color:#b4c3e6;margin:4px 0 0;font-size:13px;">مركز قيادة باكت  |  Reclaim Reconciliation Digest</p>
    </div>

    <!-- Orange alert bar -->
    <div style="background:#d97706;padding:12px 32px;">
      <p style="color:#fff;margin:0;font-size:14px;font-weight:600;">
        ⚠ ${pendingItems.length} Advance${pendingItems.length !== 1 ? 's' : ''} Require Manual Reconciliation
        — Total Exposure: ${totalAmount.toLocaleString()} SDG
      </p>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px;">
      <p style="color:#374151;font-size:15px;margin:0 0 6px;">Dear ${recipientName},</p>
      <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 20px;">
        This is your scheduled reconciliation digest. The following advances were flagged for manual
        reconciliation following site reclaims and have not yet been resolved. Please review and take
        the necessary action in the Transportation Advance Report.
      </p>

      <!-- Table -->
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="padding:9px 10px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Advance ID</th>
              <th style="padding:9px 10px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Site</th>
              <th style="padding:9px 10px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Amount</th>
              <th style="padding:9px 10px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Reclaimed</th>
              <th style="padding:9px 10px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Reason</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr style="background:#fef3c7;">
              <td colspan="2" style="padding:10px;font-weight:700;font-size:13px;color:#92400e;">Total Exposure</td>
              <td colspan="3" style="padding:10px;font-weight:700;font-size:14px;color:#92400e;">${totalAmount.toLocaleString()} SDG</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin:28px 0 16px;">
        <a href="${APP_URL}/advance-requests-report?tab=reclaimImpact"
           style="display:inline-block;padding:13px 28px;background:#d97706;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
          View Reclaim Impact Report / عرض تقرير تأثير الاسترداد
        </a>
      </div>

      <!-- Arabic note -->
      <div style="background:#f8f9fa;border-radius:6px;padding:16px;direction:rtl;text-align:right;margin-top:20px;">
        <p style="color:#374151;font-size:14px;font-weight:600;margin:0 0 6px;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
          مرحبا ${recipientName}،
        </p>
        <p style="color:#6b7280;font-size:13px;line-height:1.7;margin:0;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
          هذا ملخص المطابقة المجدول الخاص بك. يوجد ${pendingItems.length} سلفة تحتاج إلى مراجعة يدوية بسبب استرداد المواقع.
          يرجى مراجعة التقرير واتخاذ الإجراءات اللازمة.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#0f2041;padding:16px 32px;text-align:center;">
      <p style="color:#b4c3e6;font-size:12px;margin:0;">
        Automated digest — PACT Command Center Platform<br>
        رسالة آلية — منصة مركز قيادة باكت
      </p>
    </div>
  </div>
</body>
</html>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const smtpHost = Deno.env.get('SMTP_HOST')
    const smtpPort = Deno.env.get('SMTP_PORT') || '465'
    const smtpUser = Deno.env.get('SMTP_USER')
    const smtpPassword = Deno.env.get('SMTP_PASSWORD')

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // 1. Fetch all non-cancelled advances
    const { data: advances, error: advErr } = await supabase
      .from('down_payment_requests')
      .select('id, requested_amount, metadata, mmp_site_entry_id, created_at')
      .neq('status', 'cancelled')

    if (advErr) throw advErr

    // 2. Filter in JS for manual_reconciliation_required
    const pending = (advances || []).filter((a: any) => {
      const meta = typeof a.metadata === 'string' ? JSON.parse(a.metadata) : (a.metadata || {})
      return meta?.manual_reconciliation_required === true
    })

    if (pending.length === 0) {
      console.log('[DIGEST] No pending reconciliations — skipping')
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No pending reconciliations' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Fetch site names
    const entryIds = [...new Set(pending.map((a: any) => a.mmp_site_entry_id).filter(Boolean))]
    const { data: entries } = await supabase
      .from('mmp_site_entries')
      .select('id, site_name, site_code')
      .in('id', entryIds)
    const entryMap: Record<string, string> = {}
    ;(entries || []).forEach((e: any) => { entryMap[e.id] = e.site_name || e.site_code || e.id })

    // 4. Build items list
    const items = pending.map((a: any) => {
      const meta = typeof a.metadata === 'string' ? JSON.parse(a.metadata) : (a.metadata || {})
      return {
        id: a.id.substring(0, 8).toUpperCase(),
        siteName: entryMap[a.mmp_site_entry_id] || 'Unknown Site',
        amount: a.requested_amount || 0,
        reclaimedAt: meta.site_reclaimed_at
          ? new Date(meta.site_reclaimed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
          : 'N/A',
        reason: meta.site_reclaim_reason || meta.reclaim_reason || 'Unspecified',
      }
    })

    // 5. Fetch financial admin emails
    const { data: admins } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .in('role', ['financial_auditor', 'admin', 'superadmin'])
      .not('email', 'is', null)

    if (!admins?.length) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No financial admins found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 6. Send emails
    if (!smtpHost || !smtpUser || !smtpPassword) {
      console.warn('[DIGEST] SMTP not configured — logging only')
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'SMTP not configured', pendingCount: pending.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const nodemailer = await import('npm:nodemailer@6.9.8')
    const transporter = nodemailer.default.createTransport({
      host: smtpHost,
      port: Number(smtpPort),
      secure: Number(smtpPort) === 465,
      auth: { user: smtpUser, pass: smtpPassword },
      tls: { rejectUnauthorized: false },
    })

    let sent = 0
    for (const admin of admins) {
      if (!admin.email) continue
      try {
        const html = buildDigestHtml(admin.full_name || 'Finance Team', items)
        await transporter.sendMail({
          from: `"PACT Command Center" <${smtpUser}>`,
          to: admin.email,
          subject: `[ACTION REQUIRED] ${pending.length} Advance Reconciliation${pending.length !== 1 ? 's' : ''} Pending — PACT`,
          html,
          text: `${pending.length} advance(s) require manual reconciliation.\nTotal: ${items.reduce((s, i) => s + i.amount, 0).toLocaleString()} SDG\nView report: ${APP_URL}/advance-requests-report?tab=reclaimImpact`,
        })
        sent++
        console.log(`[DIGEST] Sent to ${admin.email}`)

        // Log to audit
        await supabase.from('audit_logs').insert({
          module: 'notification',
          action: 'send',
          entity_type: 'email',
          entity_id: `digest-${Date.now()}`,
          entity_name: 'Reclaim Reconciliation Digest',
          description: `Reclaim digest sent to ${admin.email} — ${pending.length} pending reconciliation(s)`,
          success: true,
          actor_id: 'system',
          actor_name: 'Scheduled Digest',
          metadata: { recipient: admin.email, pendingCount: pending.length, totalAmount: items.reduce((s, i) => s + i.amount, 0) }
        }).catch(() => {})
      } catch (e) {
        console.error(`[DIGEST] Failed to send to ${admin.email}:`, e)
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent, pendingCount: pending.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('[DIGEST] Fatal error:', err)
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
