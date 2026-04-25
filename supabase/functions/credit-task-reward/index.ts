/**
 * credit-task-reward
 *
 * Server-side trusted path for crediting a wallet when a personal task is
 * marked done with a completion reward.
 *
 * Two call paths:
 *  1. Self-credit on completion: client invokes with { taskId } using the
 *     assignee's JWT. Function verifies the task is assigned to the caller,
 *     status='done', reward was admin-authorised, and credits NET.
 *  2. Admin-approved reward: RewardApprovalsPanel invokes with
 *     { task_id, user_id, override_amount, override_currency, approval_id }.
 *     The override_amount is treated as GROSS — net is recomputed from the
 *     snapshot stored on the approval row (or the task row as fallback).
 *
 * Reward Deductions (2026-04-25):
 *  - personal_tasks.reward_deductions snapshots {name,type,amount}[].
 *  - net = max(0, gross - sum(fixed) - sum(percent% of gross)).
 *  - Wallet is credited NET. Email + in-app notification surface the full
 *    breakdown so the assignee sees exactly what was deducted and why.
 *  - Idempotency unchanged (one credit per task_id).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RewardDeduction {
  name: string
  type: 'fixed' | 'percent'
  amount: number
}

function computeNet(gross: number, deductions: RewardDeduction[]): { net: number; total: number; lines: Array<{ name: string; type: 'fixed' | 'percent'; amount: number; computed: number }> } {
  const safeGross = Math.max(0, Number(gross) || 0)
  const lines: Array<{ name: string; type: 'fixed' | 'percent'; amount: number; computed: number }> = []
  let total = 0
  for (const d of deductions ?? []) {
    if (!d || typeof d !== 'object') continue
    const amt = Number(d.amount) || 0
    const computed = d.type === 'percent' ? +(safeGross * (amt / 100)).toFixed(2) : +amt.toFixed(2)
    if (computed <= 0) continue
    lines.push({ name: String(d.name ?? '').trim() || 'Deduction', type: d.type, amount: amt, computed })
    total += computed
  }
  total = +total.toFixed(2)
  const net = +Math.max(0, safeGross - total).toFixed(2)
  return { net, total, lines }
}

function fmt(n: number, currency: string) {
  return `${currency} ${(Math.round(n * 100) / 100).toFixed(2)}`
}

function buildBreakdownHtml(gross: number, lines: Array<{ name: string; type: 'fixed' | 'percent'; amount: number; computed: number }>, total: number, net: number, currency: string): string {
  if (lines.length === 0) return ''
  const rows = lines.map(l => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:#475569;">${l.name}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:#475569;text-align:right;">${l.type === 'percent' ? `${l.amount}%` : fmt(l.amount, currency)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:#b91c1c;text-align:right;font-weight:600;">- ${fmt(l.computed, currency)}</td>
    </tr>`).join('')
  return `
    <div style="margin:18px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <div style="padding:10px 12px;background:#f8fafc;font-weight:600;color:#0f172a;font-size:13px;">Reward breakdown</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tbody>
          <tr>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:#475569;">Gross reward</td>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:#475569;text-align:right;"></td>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:#0f172a;text-align:right;font-weight:600;">${fmt(gross, currency)}</td>
          </tr>
          ${rows}
          <tr>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:#475569;">Total deductions</td>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:#475569;text-align:right;"></td>
            <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:#b91c1c;text-align:right;font-weight:600;">- ${fmt(total, currency)}</td>
          </tr>
          <tr>
            <td style="padding:8px 10px;background:#ecfdf5;color:#065f46;font-weight:700;">Net credited</td>
            <td style="padding:8px 10px;background:#ecfdf5;text-align:right;"></td>
            <td style="padding:8px 10px;background:#ecfdf5;color:#065f46;text-align:right;font-weight:700;">${fmt(net, currency)}</td>
          </tr>
        </tbody>
      </table>
    </div>`
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Create user-context client to validate JWT
  const userSb = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error: authErr } = await userSb.auth.getUser()
  if (authErr || !user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const body = await req.json().catch(() => ({}))
  // Accept both legacy { taskId } and admin-approval { task_id, user_id, override_amount, override_currency, approval_id }
  const taskId: string | undefined = body.taskId ?? body.task_id
  const approvalUserId: string | undefined = body.user_id
  const overrideAmount: number | undefined = body.override_amount
  const overrideCurrency: string | undefined = body.override_currency
  const approvalId: string | undefined = body.approval_id
  const isAdminApproval = Boolean(approvalId)

  if (!taskId || typeof taskId !== 'string') {
    return new Response(JSON.stringify({ ok: false, error: 'taskId is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Service role client for trusted DB operations
  const sb = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Fetch task — include reward_deductions snapshot column (added 2026-04-25)
  const { data: task, error: taskErr } = await sb
    .from('personal_tasks')
    .select('id, title, completion_reward_amount, completion_reward_currency, reward_deductions, assigned_to, status, priority, reward_set_by, template_id')
    .eq('id', taskId)
    .maybeSingle()

  if (taskErr || !task) {
    return new Response(JSON.stringify({ ok: false, error: 'Task not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Determine the assignee whose wallet will be credited and authorise the path.
  // approvalAnchor is the immutable approval-row snapshot used as the source
  // of truth for gross/currency/deductions in admin mode. Scoped per-request
  // (no globalThis) to avoid concurrent-isolate cross-talk.
  let recipientId: string
  let approvalAnchor:
    | { reward_amount: number; reward_currency: string; reward_deductions_snapshot: unknown }
    | null = null
  if (isAdminApproval) {
    // Admin-approval path requires HARD checks — never trust the body alone.
    //   1. Caller must hold an admin/finance role on profiles.
    //   2. The approval row must exist, be 'approved', match task_id,
    //      and its user_id must equal the task's assigned_to.
    //   3. The override_amount (if any) must equal the approval's reward_amount.
    const [{ data: callerProfile }, { data: approvalRow }] = await Promise.all([
      sb.from('profiles').select('id, role').eq('id', user.id).maybeSingle(),
      sb
        .from('task_reward_approvals')
        .select('id, task_id, user_id, status, reward_amount, reward_currency, reward_deductions_snapshot, reward_deductions_total, reward_net')
        .eq('id', approvalId!)
        .maybeSingle(),
    ])

    const ADMIN_ROLES = new Set([
      'super_admin', 'admin', 'hr_admin', 'finance_admin', 'finance', 'finance_manager',
    ])
    const callerRole = (callerProfile?.role as string | null) ?? ''
    if (!ADMIN_ROLES.has(callerRole)) {
      return new Response(JSON.stringify({ ok: false, error: 'Forbidden — admin role required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!approvalRow) {
      return new Response(JSON.stringify({ ok: false, error: 'Approval not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (approvalRow.status !== 'approved') {
      return new Response(JSON.stringify({ ok: false, error: 'Approval is not in approved status' }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (approvalRow.task_id !== taskId) {
      return new Response(JSON.stringify({ ok: false, error: 'Approval / task mismatch' }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (approvalRow.user_id !== task.assigned_to) {
      return new Response(JSON.stringify({ ok: false, error: 'Approval user / task assignee mismatch' }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (approvalUserId && approvalUserId !== approvalRow.user_id) {
      return new Response(JSON.stringify({ ok: false, error: 'user_id body / approval mismatch' }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    // The amount the wallet is credited from is anchored to the approval row,
    // never the body. (Override_amount in the body is now informational only.)
    if (overrideAmount != null && Number(overrideAmount) !== Number(approvalRow.reward_amount)) {
      return new Response(JSON.stringify({ ok: false, error: 'override_amount does not match approval' }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    recipientId = approvalRow.user_id
    approvalAnchor = approvalRow as typeof approvalAnchor
  } else {
    // Self-credit path: caller must be the assignee, status must be done,
    // and the reward must have been admin-authorised at task-creation time.
    if (task.assigned_to !== user.id) {
      return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (task.status !== 'done') {
      return new Response(JSON.stringify({ ok: false, skipped: 'not_done' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!task.reward_set_by && !task.template_id) {
      return new Response(JSON.stringify({ ok: false, error: 'Reward not admin-authorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    recipientId = user.id
  }

  // Resolve gross + currency + deductions.
  //  - Admin path: ALL three are anchored to the immutable approval row. The
  //    approval snapshot was taken at INSERT time by snapshot_reward_deductions_on_approval
  //    so it can never drift even if the task row is later edited.
  //  - Self-credit path: read from the live task row (task is in 'done' status
  //    and reward was admin-authorised at task-creation time per check above).
  const gross = (isAdminApproval && approvalAnchor
    ? Number(approvalAnchor.reward_amount)
    : Number(task.completion_reward_amount)) as number | null

  if (!gross || gross <= 0) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no_reward' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const currency = (isAdminApproval && approvalAnchor
    ? approvalAnchor.reward_currency
    : (task.completion_reward_currency ?? 'USD')) as string
  const taskTitle = task.title as string

  // Compute NET from snapshot deductions. Admin path uses the approval-row
  // snapshot (immutable), self-credit uses the live task row.
  const snapshotFromApproval = isAdminApproval && approvalAnchor && Array.isArray(approvalAnchor.reward_deductions_snapshot)
    ? (approvalAnchor.reward_deductions_snapshot as RewardDeduction[])
    : null
  const deductionsRaw: RewardDeduction[] = snapshotFromApproval
    ?? ((task.reward_deductions as RewardDeduction[] | null) ?? [])
  const { net, total: deductionTotal, lines } = computeNet(gross, deductionsRaw)

  // Idempotency check (per task_id, regardless of path)
  const { count: existingCount } = await sb
    .from('wallet_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', recipientId)
    .contains('metadata', { source: 'task_completion', task_id: taskId })

  if ((existingCount ?? 0) > 0) {
    return new Response(JSON.stringify({ ok: true, skipped: 'already_credited' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Find wallet
  const { data: wallet } = await sb
    .from('wallets')
    .select('id')
    .eq('user_id', recipientId)
    .maybeSingle()

  if (!wallet) {
    return new Response(JSON.stringify({ ok: false, error: 'No wallet found' }), {
      status: 422,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // If net is zero (deductions ate the whole reward), still record the audit
  // trail but don't push a zero-value wallet transaction — log and return.
  if (net <= 0) {
    await sb.from('notifications').insert({
      recipient_id: recipientId,
      event_type: 'task_reward_zero_net',
      entity_type: 'personal_task',
      entity_id: taskId,
      triggered_by: user.id,
      title_en: 'Task Reward Fully Deducted',
      title_ar: 'تم خصم مكافأة المهمة بالكامل',
      message_en: `Reward for "${taskTitle}" was ${fmt(gross, currency)} but deductions of ${fmt(deductionTotal, currency)} brought the net to zero.`,
      message_ar: `كانت مكافأة "${taskTitle}" ${fmt(gross, currency)} ولكن الخصومات البالغة ${fmt(deductionTotal, currency)} جعلت الصافي صفراً.`,
      priority: 'normal',
      action_url: '/wallets',
    })
    return new Response(JSON.stringify({ ok: true, skipped: 'net_zero', gross, deductionTotal, currency }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const amountCents = Math.round(net * 100)
  const now = new Date().toISOString()

  const { error: txErr } = await sb.from('wallet_transactions').insert({
    wallet_id: wallet.id,
    user_id: recipientId,
    amount: net,
    amount_cents: amountCents,
    currency,
    type: 'wallet_credit',
    status: 'posted',
    memo: `Task reward: ${taskTitle}`,
    description: lines.length > 0
      ? `Completion reward for task "${taskTitle}" (gross ${fmt(gross, currency)} − deductions ${fmt(deductionTotal, currency)} = net ${fmt(net, currency)})`
      : `Completion reward for task "${taskTitle}"`,
    posted_at: now,
    created_at: now,
    metadata: {
      source: 'task_completion',
      task_id: taskId,
      gross_amount: gross,
      deductions: lines,
      deduction_total: deductionTotal,
      net_amount: net,
      ...(approvalId ? { approval_id: approvalId } : {}),
    },
  })

  if (txErr) {
    return new Response(JSON.stringify({ ok: false, error: txErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Fetch updated wallet balance
  const { data: updatedWallet } = await sb
    .from('wallets')
    .select('total_earned')
    .eq('id', wallet.id)
    .maybeSingle()
  const newBalance = updatedWallet ? Number(updatedWallet.total_earned).toFixed(2) : null

  const grossStr = fmt(gross, currency)
  const netStr = fmt(net, currency)
  const balanceStr = newBalance ? `${currency} ${newBalance}` : null
  const hasDeductions = lines.length > 0

  // Notification message — show net (what they actually got) + brief deduction note
  const messageEn = hasDeductions
    ? `${netStr} credited for completing "${taskTitle}" (gross ${grossStr} − deductions ${fmt(deductionTotal, currency)}).${balanceStr ? ` Wallet balance: ${balanceStr}` : ''}`
    : `${netStr} credited for completing "${taskTitle}".${balanceStr ? ` Wallet balance: ${balanceStr}` : ''}`
  const messageAr = hasDeductions
    ? `تم إضافة ${netStr} لإتمام مهمة "${taskTitle}" (الإجمالي ${grossStr} − الخصومات ${fmt(deductionTotal, currency)}).${balanceStr ? ` رصيد المحفظة: ${balanceStr}` : ''}`
    : `تم إضافة ${netStr} لإتمام مهمة "${taskTitle}".${balanceStr ? ` رصيد المحفظة: ${balanceStr}` : ''}`

  // Get recipient email
  const { data: profile } = await sb
    .from('profiles')
    .select('email')
    .eq('id', recipientId)
    .maybeSingle()

  const breakdownHtml = buildBreakdownHtml(gross, lines, deductionTotal, net, currency)

  await Promise.all([
    sb.from('notifications').insert({
      recipient_id: recipientId,
      event_type: 'task_reward_credited',
      entity_type: 'personal_task',
      entity_id: taskId,
      triggered_by: user.id,
      title_en: hasDeductions ? 'Task Reward Credited (after deductions)' : 'Task Reward Credited',
      title_ar: hasDeductions ? 'تم إضافة مكافأة المهمة (بعد الخصومات)' : 'تم إضافة مكافأة المهمة',
      message_en: messageEn,
      message_ar: messageAr,
      priority: 'normal',
      action_url: '/wallets',
      metadata: { gross_amount: gross, deduction_total: deductionTotal, net_amount: net, currency, deductions: lines },
    }),
    profile?.email
      ? sb.functions.invoke('send-email', {
          body: {
            to: profile.email,
            subject: hasDeductions ? `Task Reward Credited: ${netStr} (after deductions)` : 'Task Reward Credited',
            html: `
              <p>Your wallet has been credited <strong>${netStr}</strong> for completing the task "<strong>${taskTitle}</strong>".</p>
              ${breakdownHtml}
              ${balanceStr ? `<p>Updated wallet balance: <strong>${balanceStr}</strong></p>` : ''}
              <p><a href="https://app.pactorg.com/wallets">View your wallet</a></p>
            `,
          },
        })
      : Promise.resolve(),
  ])

  return new Response(
    JSON.stringify({
      ok: true,
      credited: net,
      gross,
      deductionTotal,
      deductions: lines,
      currency,
      newBalance,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
