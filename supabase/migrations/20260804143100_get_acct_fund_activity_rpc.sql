-- Aggregate journal activity per fund (replaces unbounded client journal_lines scan).

CREATE OR REPLACE FUNCTION public.get_acct_fund_activity()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'fund_id', fund_id,
        'total_debit', total_debit,
        'total_credit', total_credit,
        'line_count', line_count
      )
      ORDER BY fund_id
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT
      l.fund_id,
      COALESCE(SUM(CASE WHEN l.debit_credit = 'DR' THEN l.functional_amount ELSE 0 END), 0) AS total_debit,
      COALESCE(SUM(CASE WHEN l.debit_credit = 'CR' THEN l.functional_amount ELSE 0 END), 0) AS total_credit,
      COUNT(*)::int AS line_count
    FROM acct_journal_lines l
    WHERE l.fund_id IS NOT NULL
    GROUP BY l.fund_id
  ) s;
$$;

GRANT EXECUTE ON FUNCTION public.get_acct_fund_activity() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_acct_fund_activity() TO service_role;

COMMENT ON FUNCTION public.get_acct_fund_activity() IS
  'Per-fund debit/credit/line aggregates from acct_journal_lines.';
