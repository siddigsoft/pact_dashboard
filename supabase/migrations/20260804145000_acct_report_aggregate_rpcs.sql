-- Aggregates for Budget Encumbrance, Grants, and AP Aging (replace unbounded client scans).

CREATE OR REPLACE FUNCTION public.get_acct_account_actuals()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'account_id', account_id,
        'actual', actual
      )
      ORDER BY account_id
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT
      l.account_id,
      COALESCE(SUM(
        CASE WHEN l.debit_credit = 'DR' THEN l.functional_amount ELSE -l.functional_amount END
      ), 0) AS actual
    FROM acct_journal_lines l
    INNER JOIN acct_journal_entries e ON e.id = l.entry_id AND e.status = 'posted'
    WHERE l.account_id IS NOT NULL
    GROUP BY l.account_id
  ) s;
$$;

GRANT EXECUTE ON FUNCTION public.get_acct_account_actuals() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_acct_account_actuals() TO service_role;

CREATE OR REPLACE FUNCTION public.get_acct_grants_with_spend()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(row_to_json(x)::jsonb ORDER BY x.end_date ASC NULLS LAST),
    '[]'::jsonb
  )
  FROM (
    SELECT
      g.id,
      g.grant_name,
      g.donor_name,
      g.reference_number,
      g.award_amount,
      g.currency,
      g.start_date,
      g.end_date,
      g.reporting_frequency,
      g.status,
      g.description,
      g.fund_id,
      g.created_at,
      COALESCE(s.spent, 0) AS spent
    FROM acct_grants g
    LEFT JOIN (
      SELECT grant_id, SUM(amount) AS spent
      FROM acct_grant_expenses
      GROUP BY grant_id
    ) s ON s.grant_id = g.id
    ORDER BY g.end_date ASC NULLS LAST
    LIMIT 500
  ) x;
$$;

GRANT EXECUTE ON FUNCTION public.get_acct_grants_with_spend() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_acct_grants_with_spend() TO service_role;

CREATE OR REPLACE FUNCTION public.get_acct_ap_vendor_lines()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', l.id,
        'vendor_id', l.vendor_id,
        'debit_credit', l.debit_credit,
        'functional_amount', COALESCE(l.functional_amount, 0),
        'functional_currency', l.functional_currency,
        'posting_date', e.posting_date
      )
      ORDER BY e.posting_date DESC
    ),
    '[]'::jsonb
  )
  FROM acct_journal_lines l
  INNER JOIN acct_journal_entries e ON e.id = l.entry_id
  WHERE l.vendor_id IS NOT NULL
    AND e.status = 'posted';
$$;

GRANT EXECUTE ON FUNCTION public.get_acct_ap_vendor_lines() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_acct_ap_vendor_lines() TO service_role;
