// hr-salary-increment-apply
// Nightly edge function (replace SalaryIncrements.tsx page-load syncDueIncrements)
// Finds every approved salary_increment whose effective_date has arrived but
// employee_salary_config hasn't been updated yet, applies it, and logs the result.
//
// Schedule (cron): 02:00 UTC daily  →  set in supabase/config.toml or Dashboard
// Invoke manually: POST /functions/v1/hr-salary-increment-apply  (service-role key)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL            = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const today = new Date().toISOString().slice(0, 10);

  // Fetch all approved increments with an effective_date that has arrived
  const { data: increments, error: incErr } = await supabase
    .from('salary_increments')
    .select('id, user_id, effective_date, new_salary, currency')
    .eq('status', 'approved')
    .lte('effective_date', today);

  if (incErr) {
    return new Response(JSON.stringify({ error: incErr.message }), { status: 500 });
  }

  if (!increments || increments.length === 0) {
    await supabase.from('hr_salary_increment_log').insert({
      applied_count: 0, skipped_count: 0, error_count: 0,
      details: { note: 'No due increments found', run_date: today },
    });
    return new Response(JSON.stringify({ applied: 0, skipped: 0, errors: 0 }), { status: 200 });
  }

  // For each user keep only the latest approved increment (by effective_date)
  const latestByUser = new Map<string, typeof increments[0]>();
  for (const inc of increments) {
    const current = latestByUser.get(inc.user_id);
    if (!current || inc.effective_date > current.effective_date) {
      latestByUser.set(inc.user_id, inc);
    }
  }

  const userIds = [...latestByUser.keys()];

  // Load current salary configs
  const { data: configs } = await supabase
    .from('employee_salary_config')
    .select('id, user_id, base_salary, currency')
    .in('user_id', userIds);

  const cfgByUser = new Map<string, { id: string; base_salary: number; currency: string }>();
  for (const c of (configs ?? []) as any[]) cfgByUser.set(c.user_id, c);

  let applied = 0;
  let skipped = 0;
  let errors  = 0;
  const detail: Record<string, string> = {};

  for (const [userId, inc] of latestByUser.entries()) {
    const cfg = cfgByUser.get(userId);
    const needsSync =
      !cfg ||
      Number(cfg.base_salary) !== Number(inc.new_salary) ||
      cfg.currency !== inc.currency;

    if (!needsSync) { skipped++; continue; }

    try {
      if (cfg) {
        const { error } = await supabase
          .from('employee_salary_config')
          .update({ base_salary: inc.new_salary, currency: inc.currency, updated_at: new Date().toISOString() })
          .eq('id', cfg.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('employee_salary_config')
          .insert({
            user_id: userId,
            base_salary: inc.new_salary,
            currency: inc.currency,
            allowances: [],
            deductions: [],
            effective_date: inc.effective_date,
          });
        if (error) throw error;
      }
      applied++;
      detail[userId] = `applied ${inc.new_salary} ${inc.currency} (eff ${inc.effective_date})`;
    } catch (e: any) {
      errors++;
      detail[userId] = `error: ${e?.message ?? 'unknown'}`;
    }
  }

  await supabase.from('hr_salary_increment_log').insert({
    applied_count: applied,
    skipped_count: skipped,
    error_count:   errors,
    details: { run_date: today, summary: detail },
  });

  return new Response(
    JSON.stringify({ applied, skipped, errors, run_date: today }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
