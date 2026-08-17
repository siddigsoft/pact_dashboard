-- ============================================================
-- Account Balances: view + RPC
-- Aggregates DR/CR totals from POSTED journal lines per account.
-- Run this once in Supabase Studio → SQL Editor.
-- ============================================================

-- 1. View (fast path used by the COA page when available)
CREATE OR REPLACE VIEW vw_account_balances AS
SELECT
  l.account_id,
  SUM(CASE WHEN l.debit_credit = 'DR' THEN COALESCE(l.functional_amount, 0) ELSE 0 END)  AS total_dr,
  SUM(CASE WHEN l.debit_credit = 'CR' THEN COALESCE(l.functional_amount, 0) ELSE 0 END)  AS total_cr,
  SUM(
    CASE WHEN l.debit_credit = 'DR'
         THEN  COALESCE(l.functional_amount, 0)
         ELSE -COALESCE(l.functional_amount, 0)
    END
  ) AS net_balance
FROM acct_journal_lines l
JOIN acct_journal_entries e ON e.id = l.entry_id
WHERE e.status = 'posted'
GROUP BY l.account_id;

-- 2. RPC (used by the COA page when the view isn't available yet)
--    Returns one row per account with posted DR/CR totals.
--    SECURITY DEFINER so authenticated users can call it even if they
--    lack direct SELECT on the underlying tables.
CREATE OR REPLACE FUNCTION get_account_balances()
RETURNS TABLE (
  account_id      uuid,
  total_dr        numeric,
  total_cr        numeric,
  net_balance     numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.account_id,
    SUM(CASE WHEN l.debit_credit = 'DR' THEN COALESCE(l.functional_amount, 0) ELSE 0 END),
    SUM(CASE WHEN l.debit_credit = 'CR' THEN COALESCE(l.functional_amount, 0) ELSE 0 END),
    SUM(
      CASE WHEN l.debit_credit = 'DR'
           THEN  COALESCE(l.functional_amount, 0)
           ELSE -COALESCE(l.functional_amount, 0)
      END
    )
  FROM acct_journal_lines l
  JOIN acct_journal_entries e ON e.id = l.entry_id
  WHERE e.status = 'posted'
  GROUP BY l.account_id;
$$;

-- Allow authenticated users to call the RPC
GRANT EXECUTE ON FUNCTION get_account_balances() TO authenticated;
