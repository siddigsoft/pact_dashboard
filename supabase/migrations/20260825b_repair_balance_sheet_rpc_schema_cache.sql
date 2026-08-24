-- Repair the Balance Sheet RPC registration for databases where the original
-- reporting migration was applied without refreshing PostgREST's schema cache.
-- Input names intentionally match the client RPC payload.

DROP FUNCTION IF EXISTS public.acct_balance_sheet_as_of(uuid, uuid);

CREATE FUNCTION public.acct_balance_sheet_as_of(
  p_period_id uuid,
  p_fund_id uuid DEFAULT NULL
) RETURNS TABLE (
  account_id uuid,
  account_code text,
  account_name_en text,
  account_name_ar text,
  account_type acct_account_type,
  debit_total numeric(20,4),
  credit_total numeric(20,4),
  net_balance numeric(20,4)
) LANGUAGE sql STABLE AS $$
  SELECT
    a.id AS account_id,
    a.code AS account_code,
    a.name_en AS account_name_en,
    a.name_ar AS account_name_ar,
    a.account_type,
    COALESCE(SUM(CASE WHEN l.debit_credit = 'DR' THEN l.functional_amount ELSE 0 END), 0) AS debit_total,
    COALESCE(SUM(CASE WHEN l.debit_credit = 'CR' THEN l.functional_amount ELSE 0 END), 0) AS credit_total,
    COALESCE(SUM(CASE WHEN l.debit_credit = 'DR' THEN l.functional_amount ELSE -l.functional_amount END), 0) AS net_balance
  FROM public.acct_fiscal_periods p
  JOIN public.acct_journal_entries e
    ON e.status = 'posted'
   AND e.posting_date <= p.end_date
  JOIN public.acct_journal_lines l
    ON l.entry_id = e.id
   AND (p_fund_id IS NULL OR l.fund_id = p_fund_id)
  JOIN public.acct_accounts a
    ON a.id = l.account_id
   AND a.account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')
  WHERE p.id = p_period_id
  GROUP BY a.id, a.code, a.name_en, a.name_ar, a.account_type
  HAVING COALESCE(SUM(CASE WHEN l.debit_credit = 'DR' THEN l.functional_amount ELSE -l.functional_amount END), 0) <> 0
  ORDER BY a.code;
$$;

COMMENT ON FUNCTION public.acct_balance_sheet_as_of(uuid, uuid) IS
  'Returns non-zero posted balances through the selected fiscal-period end, with revenue and expense rows available to calculate cumulative unclosed earnings.';

GRANT EXECUTE ON FUNCTION public.acct_balance_sheet_as_of(uuid, uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';