-- Authoritative balance-sheet balances as of a selected fiscal period end.
-- Unlike acct_trial_balance, this deliberately includes all posted history
-- through the selected period end, rather than only the selected period.
create or replace function public.acct_balance_sheet_as_of(
  p_period_id uuid,
  p_fund_id   uuid default null
) returns table (
  account_id      uuid,
  account_code    text,
  account_name_en text,
  account_name_ar text,
  account_type    acct_account_type,
  debit_total     numeric(20,4),
  credit_total    numeric(20,4),
  net_balance     numeric(20,4)
) language sql stable as $$
  select
    a.id as account_id,
    a.code as account_code,
    a.name_en as account_name_en,
    a.name_ar as account_name_ar,
    a.account_type,
    coalesce(sum(case when l.debit_credit = 'DR' then l.functional_amount else 0 end), 0) as debit_total,
    coalesce(sum(case when l.debit_credit = 'CR' then l.functional_amount else 0 end), 0) as credit_total,
    coalesce(sum(case when l.debit_credit = 'DR' then l.functional_amount else -l.functional_amount end), 0) as net_balance
  from public.acct_fiscal_periods p
  join public.acct_journal_entries e
    on e.status = 'posted'
   and e.posting_date <= p.end_date
  join public.acct_journal_lines l
    on l.entry_id = e.id
   and (p_fund_id is null or l.fund_id = p_fund_id)
  join public.acct_accounts a
    on a.id = l.account_id
    -- Revenue and expense rows are returned as well so the presentation layer
    -- can show cumulative unclosed earnings alongside equity. Without this,
    -- an open period's balance sheet can fail the accounting equation despite
    -- a perfectly balanced posted ledger.
    and a.account_type in ('asset', 'liability', 'equity', 'revenue', 'expense')
  where p.id = p_period_id
  group by a.id, a.code, a.name_en, a.name_ar, a.account_type
  having coalesce(sum(case when l.debit_credit = 'DR' then l.functional_amount else -l.functional_amount end), 0) <> 0
  order by a.code;
$$;

comment on function public.acct_balance_sheet_as_of(uuid, uuid) is
  'Returns non-zero account balances from posted journals through the selected fiscal period end, optionally scoped to one fund. Balance-sheet presentation uses assets/liabilities/equity plus cumulative unclosed earnings from the included revenue and expense rows.';