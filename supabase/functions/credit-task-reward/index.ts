/**
 * credit-task-reward
 *
 * Server-side trusted path for crediting a wallet when a personal task is
 * marked done with a completion reward. Called from the client via
 * supabase.functions.invoke('credit-task-reward', { body: { taskId } }).
 *
 * Security model:
 *  - Authenticated user JWT is validated (service role key used for DB ops).
 *  - The reward amount is read from the DB row — never trusted from caller.
 *  - Idempotency: skips if a matching wallet_transaction already exists.
 *  - Only tasks where assigned_to === authenticated user can be credited
 *    (prevents cross-user self-credit).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  const { taskId } = body as { taskId?: string }
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

  // Fetch task — verify it is assigned to the calling user and is done
  const { data: task, error: taskErr } = await sb
    .from('personal_tasks')
    .select('id, title, completion_reward_amount, completion_reward_currency, assigned_to, status, priority, reward_set_by, template_id')
    .eq('id', taskId)
    .maybeSingle()

  if (taskErr || !task) {
    return new Response(JSON.stringify({ ok: false, error: 'Task not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Only credit the assigned user — prevents cross-user exploit
  if (task.assigned_to !== user.id) {
    return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Task must be done
  if (task.status !== 'done') {
    return new Response(JSON.stringify({ ok: false, skipped: 'not_done' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Verify reward was admin-authorized.
  // Two valid authorization paths:
  //  1. reward_set_by IS NOT NULL: admin manually set the reward (admin role enforced by DB trigger)
  //  2. template_id IS NOT NULL AND reward_set_by IS NULL: task was materialized by the
  //     SECURITY DEFINER RPC materialise_daily_tasks_for_user, which is the only path that
  //     can insert rewards with reward_set_by=NULL (trigger allows trusted_materialise context).
  //
  //  The stored task.completion_reward_amount is the authoritative amount at materialization time.
  //  We do NOT re-verify against the current template state because: the template may be
  //  deactivated or edited after tasks are already created — completed tasks must still be
  //  credited based on the reward that was set when the task was created (snapshot semantics).
  //  The DB trigger already enforced the amount came from the template at creation time.
  if (!task.reward_set_by && !task.template_id) {
    return new Response(JSON.stringify({ ok: false, error: 'Reward not admin-authorized' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const amount = task.completion_reward_amount as number | null
  if (!amount || amount <= 0) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no_reward' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const currency = (task.completion_reward_currency as string | null) ?? 'USD'
  const taskTitle = task.title as string

  // Idempotency check
  const { count: existingCount } = await sb
    .from('wallet_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
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
    .eq('user_id', user.id)
    .maybeSingle()

  if (!wallet) {
    return new Response(JSON.stringify({ ok: false, error: 'No wallet found' }), {
      status: 422,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const amountCents = Math.round(amount * 100)
  const now = new Date().toISOString()

  const { error: txErr } = await sb.from('wallet_transactions').insert({
    wallet_id: wallet.id,
    user_id: user.id,
    amount,
    amount_cents: amountCents,
    currency,
    type: 'wallet_credit',
    status: 'posted',
    memo: `Task reward: ${taskTitle}`,
    description: `Completion reward for task "${taskTitle}"`,
    posted_at: now,
    created_at: now,
    metadata: { source: 'task_completion', task_id: taskId },
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

  const rewardStr = `${currency} ${amount.toFixed(2)}`
  const balanceStr = newBalance ? `${currency} ${newBalance}` : null

  // Send in-app notification
  const { data: profile } = await sb
    .from('profiles')
    .select('email')
    .eq('id', user.id)
    .maybeSingle()

  await Promise.all([
    sb.from('notifications').insert({
      recipient_id: user.id,
      event_type: 'task_reward_credited',
      entity_type: 'personal_task',
      entity_id: taskId,
      triggered_by: user.id,
      title_en: 'Task Reward Credited',
      title_ar: 'تم إضافة مكافأة المهمة',
      message_en: `${rewardStr} credited for completing "${taskTitle}".${balanceStr ? ` Wallet balance: ${balanceStr}` : ''}`,
      message_ar: `تم إضافة ${rewardStr} لإتمام مهمة "${taskTitle}".${balanceStr ? ` رصيد المحفظة: ${balanceStr}` : ''}`,
      priority: 'normal',
      action_url: '/wallets',
    }),
    profile?.email
      ? sb.functions.invoke('send-email', {
          body: {
            to: profile.email,
            subject: 'Task Reward Credited',
            html: `<p>Your wallet has been credited <strong>${rewardStr}</strong> for completing the task "<strong>${taskTitle}</strong>".${balanceStr ? `</p><p>Updated wallet balance: <strong>${balanceStr}</strong>` : ''}</p><p><a href="https://app.pactorg.com/wallets">View your wallet</a></p>`,
          },
        })
      : Promise.resolve(),
  ])

  return new Response(
    JSON.stringify({ ok: true, credited: amount, currency, newBalance }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
