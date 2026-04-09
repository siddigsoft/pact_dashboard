/**
 * payroll-auto-run
 *
 * Supabase Edge Function / Scheduled Job that automatically creates a payroll
 * draft run for the current month when the configured day-of-month is reached.
 *
 * SECURITY: Should be invoked by pg_cron using the service-role key internally,
 * or via HTTP POST with a trusted secret (PAYROLL_CRON_SECRET env var).
 *
 * Can be triggered:
 *   1. Via pg_cron / Supabase Scheduled Functions (set to run daily at 06:00 UTC)
 *      pg_cron: SELECT cron.schedule('payroll-auto-run', '0 6 * * *',
 *               $$ SELECT net.http_post('...payroll-auto-run', '{}', '{"x-cron-secret":"<secret>"}') $$);
 *   2. Manually via HTTP POST with header x-cron-secret (admin use / testing)
 *
 * Environment variables:
 *   SUPABASE_URL              — auto-injected by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase
 *   PAYROLL_CRON_SECRET       — shared secret for HTTP invocation validation
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

interface ScheduleConfig {
  day_of_month: number;
  enabled: boolean;
  paused: boolean;
  last_triggered: string | null;
  notes: string | null;
}

interface SalaryConfig {
  user_id: string;
  base_salary: number;
  currency: string;
  hourly_rate: number | null;
  allowances: Array<{ name: string; type: 'fixed' | 'percent'; amount: number }>;
  deductions: Array<{ name: string; type: 'fixed' | 'percent'; amount: number }>;
}

interface Profile {
  id: string;
  full_name: string | null;
  department_name: string | null;
}

interface TaskRewardRow {
  assigned_to: string;
  completion_reward: number;
}

const SCHEDULE_SETTING_KEY = 'auto_schedule'

// Clamp day to last day of month for short months
function clampToMonth(year: number, month: number, day: number): number {
  const lastDay = new Date(year, month + 1, 0).getDate()
  return Math.min(day, lastDay)
}

// Period label e.g. "April 2026"
function periodLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// Compute salary components from config
function computePayroll(cfg: SalaryConfig): {
  base: number; allowTotal: number; gross: number; dedTotal: number; net: number;
} {
  const base = Number(cfg.base_salary ?? 0)
  const allowances = cfg.allowances ?? []
  const deductions = cfg.deductions ?? []

  const allowTotal = allowances.reduce((s, a) => {
    return s + (a.type === 'percent' ? (a.amount / 100) * base : a.amount)
  }, 0)
  const gross = base + allowTotal
  const dedTotal = deductions.reduce((s, d) => {
    return s + (d.type === 'percent' ? (d.amount / 100) * gross : d.amount)
  }, 0)
  return { base, allowTotal, gross, dedTotal, net: gross - dedTotal }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ── Authorization check ─────────────────────────────────────────────────────
  // Accepts EITHER (not both needed):
  //   (a) Exact Bearer token matching the service-role key (internal invocation via pg_cron)
  //   (b) x-cron-secret header matching PAYROLL_CRON_SECRET env var (HTTP invocation)
  //
  // NOTE: Substring matching on 'service_role' is intentionally avoided to prevent
  // spoofed Authorization headers from bypassing protection.
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const cronSecret = Deno.env.get('PAYROLL_CRON_SECRET') ?? ''
  const providedSecret = req.headers.get('x-cron-secret') ?? ''
  const authHeader = req.headers.get('authorization') ?? ''

  // Exact match: "Bearer <SERVICE_ROLE_KEY>"
  const isServiceRoleCall = serviceRoleKey.length > 0 &&
    authHeader === `Bearer ${serviceRoleKey}`

  // Exact match: x-cron-secret header must equal the configured secret (non-empty)
  const isSecretMatch = cronSecret.length > 0 && providedSecret === cronSecret

  if (!isServiceRoleCall && !isSecretMatch) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const now = new Date()
  const todayDay = now.getDate()
  const year = now.getFullYear()
  const month = now.getMonth()  // 0-indexed

  try {
    // 1. Read schedule config
    const { data: settingRow, error: settingErr } = await supabase
      .from('payroll_settings')
      .select('setting_value')
      .eq('setting_key', SCHEDULE_SETTING_KEY)
      .maybeSingle()

    if (settingErr || !settingRow) {
      return new Response(JSON.stringify({ skipped: true, reason: 'No schedule configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const cfg = settingRow.setting_value as ScheduleConfig

    if (!cfg.enabled || cfg.paused) {
      return new Response(JSON.stringify({ skipped: true, reason: 'Schedule disabled or paused' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Check if today is the configured trigger day (clamped to month length)
    const triggerDay = clampToMonth(year, month, cfg.day_of_month)
    if (todayDay !== triggerDay) {
      return new Response(JSON.stringify({ skipped: true, reason: `Today is day ${todayDay}; trigger day is ${triggerDay}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Idempotency: skip if already triggered this month
    const thisMonthLabel = periodLabel(now)
    if (cfg.last_triggered) {
      const lastDate = new Date(cfg.last_triggered)
      if (!isNaN(lastDate.getTime()) && periodLabel(lastDate) === thisMonthLabel) {
        return new Response(JSON.stringify({ skipped: true, reason: `Already triggered for ${thisMonthLabel}` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // 4. Check if approved/locked run exists for this month
    const { data: existingRuns } = await supabase
      .from('payroll_runs')
      .select('id, status')
      .eq('period_label', thisMonthLabel)

    const lockedOrApproved = (existingRuns ?? []).find(
      (r: { id: string; status: string }) => r.status === 'approved' || r.status === 'locked'
    )
    if (lockedOrApproved) {
      return new Response(JSON.stringify({ skipped: true, reason: `${thisMonthLabel} run already ${lockedOrApproved.status}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 5. Load salary configs
    const { data: salaryConfigs, error: salErr } = await supabase
      .from('employee_salary_config')
      .select('user_id, base_salary, currency, allowances, deductions, hourly_rate')

    if (salErr || !salaryConfigs || salaryConfigs.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: 'No salary configs found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const configs = salaryConfigs as SalaryConfig[]
    const userIds = configs.map(c => c.user_id)

    // 6. Load profiles for names/departments
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, department_name')
      .in('id', userIds)

    const profileMap = new Map<string, Profile>()
    for (const p of (profiles ?? []) as Profile[]) {
      profileMap.set(p.id, p)
    }

    // 7. Period dates
    const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate()
    const endStr   = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`

    // 8. Fetch approved timesheet hours for hourly-rate employees
    const hourlyEmpIds = configs.filter(c => Number(c.hourly_rate ?? 0) > 0).map(c => c.user_id)
    const hoursByUser = new Map<string, number>()

    if (hourlyEmpIds.length > 0) {
      // Query approved timesheet_entries joined through approved weekly timesheets (split model).
      // Zero-entry months produce zero hourly pay (no fallback to legacy flat table shape).
      const { data: entries } = await supabase
        .from('timesheet_entries')
        .select('hours, timesheets!inner(user_id, status)')
        .gte('date', startStr)
        .lte('date', endStr)

      for (const e of (entries ?? []) as Array<{ hours: number; timesheets: { user_id: string; status: string } }>) {
        if (e.timesheets.status === 'approved' && hourlyEmpIds.includes(e.timesheets.user_id)) {
          const uid = e.timesheets.user_id
          hoursByUser.set(uid, (hoursByUser.get(uid) ?? 0) + (Number(e.hours) || 0))
        }
      }
    }

    // 9. Fetch task completion rewards within period
    const { data: taskRewards } = await supabase
      .from('personal_tasks')
      .select('assigned_to, completion_reward')
      .eq('status', 'completed')
      .gte('updated_at', startStr)
      .lte('updated_at', endStr + 'T23:59:59')
      .not('completion_reward', 'is', null)
      .gt('completion_reward', 0)

    const rewardsByUser = new Map<string, number>()
    for (const t of (taskRewards ?? []) as TaskRewardRow[]) {
      rewardsByUser.set(t.assigned_to, (rewardsByUser.get(t.assigned_to) ?? 0) + (Number(t.completion_reward) || 0))
    }

    // 10. Create or reuse draft run
    const draftRun = (existingRuns ?? []).find((r: { id: string; status: string }) => r.status === 'draft')
    let runId: string

    if (draftRun) {
      runId = draftRun.id
    } else {
      const { data: newRun, error: runErr } = await supabase
        .from('payroll_runs')
        .insert({ period_label: thisMonthLabel, period_start: startStr, period_end: endStr, created_by: null, status: 'draft' })
        .select('id')
        .single()
      if (runErr) throw new Error(`payroll_run insert failed: ${runErr.message}`)
      runId = newRun.id
    }

    // 11. Build and insert run items (salary + retainer placeholder + task rewards + hourly pay)
    await supabase.from('payroll_run_items').delete().eq('run_id', runId)

    const items = configs.map(config => {
      const { base, allowTotal, gross, dedTotal, net } = computePayroll(config)
      const userId = config.user_id
      const profile = profileMap.get(userId)

      const rewards = rewardsByUser.get(userId) ?? 0
      const hourlyRate = Number(config.hourly_rate ?? 0)
      const approvedHours = hoursByUser.get(userId) ?? 0
      const hourlyPay = hourlyRate > 0 ? Math.round(hourlyRate * approvedHours) : 0

      const adjustments = hourlyPay > 0
        ? [{ type: 'bonus', label: `Hourly Pay (${approvedHours}h × ${hourlyRate})`, amount: hourlyPay }]
        : []

      return {
        run_id: runId,
        user_id: userId,
        user_name: profile?.full_name ?? '—',
        department_name: profile?.department_name ?? '—',
        base_salary: base,
        allowances_total: allowTotal,
        gross_salary: gross,
        deductions_total: dedTotal,
        net_salary: net + rewards + hourlyPay,
        task_rewards: rewards,
        retainer_amount: 0,
        currency: config.currency ?? 'SDG',
        allowances_snapshot: config.allowances,
        deductions_snapshot: config.deductions,
        adjustments,
      }
    })

    const { error: itemsErr } = await supabase.from('payroll_run_items').insert(items)
    if (itemsErr) throw new Error(`payroll_run_items insert failed: ${itemsErr.message}`)

    // 12. Update last_triggered in schedule config
    const updatedCfg = { ...cfg, last_triggered: now.toISOString(), updated_at: now.toISOString() }
    await supabase
      .from('payroll_settings')
      .update({ setting_value: updatedCfg as unknown as Record<string, unknown>, updated_at: now.toISOString() })
      .eq('setting_key', SCHEDULE_SETTING_KEY)

    // 13. Log the auto-run event
    await supabase
      .from('audit_logs')
      .insert({
        action: 'payroll_auto_run',
        details: JSON.stringify({ period: thisMonthLabel, run_id: runId, employee_count: items.length }),
        performed_by: null,
        entity_type: 'payroll_run',
        entity_id: runId,
      })

    return new Response(
      JSON.stringify({ success: true, period: thisMonthLabel, run_id: runId, employee_count: items.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[payroll-auto-run] Error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
