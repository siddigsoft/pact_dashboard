# Pre-Fund Balance Sync Runbook

## Problem

The `pre_fund_requests` table stores two denormalized columns:
- `paid_amount`  — running total of money paid out of the fund
- `available_balance` — funded amount minus paid out

These are updated by `directLinkPayment` (best-effort JS fallback) and the
`link_payment_atomically_rpc` / `unlink_payment_atomically_rpc` Postgres functions.

In some cases these columns can go out of sync with the actual rows in
`pre_fund_transactions`:
- The RPC created a transaction row but the subsequent `paid_amount` UPDATE
  failed (or vice versa).
- A transaction was deleted manually without running the reverse update.
- An old payment was registered via `metadata.pre_fund_deducted` (no txn row)
  but the column was never re-synced after corrections.

When they diverge:
- The **Balance Dashboard** shows the wrong "Available Balance" for a fund
  (it uses transaction-computed balance when txns exist, DB column as fallback).
- The **Reconciliation page** shows the correct value (always computes from txn rows).
- The **Allocation Dashboard** "Total Paid Out" KPI could also be wrong.

## Diagnosis

Run this in the Supabase SQL editor to see which funds are out of sync:

```sql
SELECT
  r.id,
  r.name,
  r.currency,
  r.amount,
  r.paid_amount         AS db_paid_amount,
  r.available_balance   AS db_available_balance,
  COALESCE(t.txn_paid, 0)              AS computed_paid_from_txns,
  r.amount - COALESCE(t.txn_paid, 0)  AS computed_available,
  ABS(r.paid_amount - COALESCE(t.txn_paid, 0)) AS drift
FROM pre_fund_requests r
LEFT JOIN (
  SELECT
    pre_fund_request_id,
    SUM(CASE
      WHEN transaction_type = 'payment'                THEN amount
      WHEN transaction_type IN ('reversal', 'return')  THEN -amount
      ELSE 0
    END) AS txn_paid
  FROM pre_fund_transactions
  GROUP BY pre_fund_request_id
) t ON t.pre_fund_request_id = r.id
WHERE ABS(r.paid_amount - COALESCE(t.txn_paid, 0)) > 1   -- ignore rounding differences
ORDER BY drift DESC;
```

## Fix — Sync DB Columns from Actual Transactions

> **Run this only after reviewing the diagnosis query above.**
> This is safe to run multiple times (idempotent).

```sql
WITH computed AS (
  SELECT
    pre_fund_request_id,
    SUM(CASE
      WHEN transaction_type = 'payment'                THEN amount
      WHEN transaction_type IN ('reversal', 'return')  THEN -amount
      ELSE 0
    END) AS txn_paid
  FROM pre_fund_transactions
  GROUP BY pre_fund_request_id
)
UPDATE pre_fund_requests r
SET
  paid_amount       = GREATEST(0, COALESCE(c.txn_paid, 0)),
  available_balance = GREATEST(0, r.amount - COALESCE(c.txn_paid, 0))
FROM computed c
WHERE c.pre_fund_request_id = r.id
  AND ABS(r.paid_amount - COALESCE(c.txn_paid, 0)) > 1;
```

After running, also sync allocation `spent_amount` for funds where the
computed user-level spend from transactions differs from stored values:

```sql
WITH txn_spend AS (
  SELECT
    pre_fund_request_id,
    user_id,
    SUM(CASE
      WHEN transaction_type = 'payment'                THEN amount
      WHEN transaction_type IN ('reversal', 'return')  THEN -amount
      ELSE 0
    END) AS txn_spent
  FROM pre_fund_transactions
  WHERE user_id IS NOT NULL
  GROUP BY pre_fund_request_id, user_id
)
UPDATE pre_fund_allocations a
SET spent_amount = GREATEST(0, COALESCE(ts.txn_spent, 0))
FROM txn_spend ts
WHERE ts.pre_fund_request_id = a.pre_fund_request_id
  AND ts.user_id              = a.user_id
  AND ABS(a.spent_amount - COALESCE(ts.txn_spent, 0)) > 1;
```

## Prevention

Deploy `pre_funding_atomic_rpcs.sql` if not already done — the
`link_payment_atomically_rpc` and `unlink_payment_atomically_rpc` functions
wrap all three writes (txn INSERT + balance UPDATE + allocation UPDATE) in a
single Postgres transaction so partial failures are impossible.
