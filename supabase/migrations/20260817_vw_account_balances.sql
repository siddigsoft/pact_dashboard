-- View: vw_account_balances
-- Aggregates DR/CR totals from POSTED journal entries per account.
-- Used by the Chart of Accounts page to show live balances alongside each account.

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
