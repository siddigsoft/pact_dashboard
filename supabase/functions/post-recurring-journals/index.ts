import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function nextRunDate(frequency: string, dayOfMonth: number | null, from: Date): string {
  const d = new Date(from);
  switch (frequency) {
    case 'daily': d.setDate(d.getDate() + 1); break;
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      if (dayOfMonth) d.setDate(Math.min(dayOfMonth, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
      break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
    default: d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}

Deno.serve(async () => {
  const today = new Date().toISOString().slice(0, 10);

  // 1. Fetch all due recurring journals with auto_post = true
  const { data: due, error: fetchErr } = await supabase
    .from('acct_recurring_journals')
    .select('*, acct_recurring_journal_lines(*)')
    .eq('is_active', true)
    .eq('auto_post', true)
    .lte('next_run_date', today)
    .or(`end_date.is.null,end_date.gte.${today}`);

  if (fetchErr) return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 });
  if (!due || due.length === 0) return new Response(JSON.stringify({ posted: 0, message: 'Nothing due' }));

  const results: { id: string; name: string; status: string; jeId?: string }[] = [];

  for (const rec of due as any[]) {
    // Check max_runs
    if (rec.max_runs != null && rec.run_count >= rec.max_runs) {
      await supabase.from('acct_recurring_journals').update({ is_active: false }).eq('id', rec.id);
      results.push({ id: rec.id, name: rec.name, status: 'deactivated (max_runs reached)' });
      continue;
    }

    const lines = (rec.acct_recurring_journal_lines ?? []) as any[];
    if (lines.length === 0) { results.push({ id: rec.id, name: rec.name, status: 'skipped (no lines)' }); continue; }

    // 2. Create journal entry
    const entryRef = `RJ-${rec.id.slice(0, 8).toUpperCase()}-${today}`;
    const { data: je, error: jeErr } = await supabase
      .from('acct_journal_entries')
      .insert({
        entry_date: today,
        reference: entryRef,
        description: `Auto: ${rec.name}`,
        journal_type: rec.journal_type,
        status: 'posted',
        company_id: rec.company_id ?? null,
        source_module: 'recurring',
        source_id: rec.id,
      })
      .select('id')
      .single();

    if (jeErr || !je) { results.push({ id: rec.id, name: rec.name, status: `error: ${jeErr?.message}` }); continue; }

    // 3. Insert journal items
    const items = lines.map((l: any) => ({
      journal_entry_id: je.id,
      account_id: l.account_id,
      label: l.label ?? rec.name,
      debit: l.debit ?? 0,
      credit: l.credit ?? 0,
      analytic_account_id: l.analytic_account_id ?? null,
    }));
    await supabase.from('acct_journal_items').insert(items);

    // 4. Update recurring journal — advance next_run_date, increment run_count
    const newNextRun = nextRunDate(rec.frequency, rec.day_of_month, new Date(rec.next_run_date));
    await supabase.from('acct_recurring_journals').update({
      last_run_date: today,
      next_run_date: newNextRun,
      run_count: (rec.run_count ?? 0) + 1,
    }).eq('id', rec.id);

    results.push({ id: rec.id, name: rec.name, status: 'posted', jeId: je.id });
  }

  const posted = results.filter(r => r.status === 'posted').length;
  console.log(`Recurring journals: ${posted} posted out of ${due.length} due`);
  return new Response(JSON.stringify({ posted, total: due.length, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
