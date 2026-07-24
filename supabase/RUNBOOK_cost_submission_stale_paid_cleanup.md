# Runbook: Clean Up Stale `amount_paid_cents` on Approved Cost Submissions

## Problem

A bug in an earlier version of the Revert Paid flow reset the DB row's `status` back to `approved` but did **not** clear `amount_paid_cents`, `payment_proof_url`, `payment_proof_notes`, or `payment_proof_uploaded_at`.

This caused:
- The Batch Cost Pay dialog to show **SDG 0** total (remaining = amount_cents − stale amount_paid_cents ≈ 0).
- Payment proof images showing on rows that should be "un-paid".
- Individual "Mark Paid" dialogs opening with SDG 0 pre-filled.

## Fix Applied in Code

The application now normalises these rows at runtime (in `handleOpenBatchCostPay`) so the UI always shows the correct remaining amount. The individual `handleRevertPaid` and new `handleGroupRevertPaid` functions also clear all proof fields atomically going forward.

## SQL Cleanup (run manually against your Supabase project)

### Step 1 — Preview affected rows

```sql
SELECT
  id,
  status,
  amount_cents,
  amount_paid_cents,
  payment_proof_url IS NOT NULL AS has_proof,
  payment_proof_notes IS NOT NULL AS has_notes,
  description
FROM operational_cost_submissions
WHERE
  status = 'approved'
  AND amount_paid_cents > 0
ORDER BY updated_at DESC;
```

Review this list carefully. If any rows appear here that you believe are legitimately partially-paid (status should be `partially_paid`), update their status manually first before running Step 2.

### Step 2 — Fix stale rows

```sql
UPDATE operational_cost_submissions
SET
  amount_paid_cents       = 0,
  payment_proof_url       = NULL,
  payment_proof_notes     = NULL,
  payment_proof_uploaded_at = NULL,
  updated_at              = now()
WHERE
  status = 'approved'
  AND amount_paid_cents > 0;
```

### Step 3 — Confirm no stale rows remain

```sql
SELECT COUNT(*)
FROM operational_cost_submissions
WHERE
  status = 'approved'
  AND amount_paid_cents > 0;
-- Expected: 0
```

### Step 4 (Optional) — Verify proof fields also cleared

```sql
SELECT COUNT(*)
FROM operational_cost_submissions
WHERE
  status = 'approved'
  AND (
    payment_proof_url IS NOT NULL
    OR payment_proof_notes IS NOT NULL
    OR payment_proof_uploaded_at IS NOT NULL
  );
-- Expected: 0  (these fields should only be set for paid/reconciled/partially_paid rows)
```

## Notes

- This is a **one-time cleanup**. Going forward, the fixed `handleRevertPaid` and `handleGroupRevertPaid` clear all proof fields atomically in the same DB update.
- No migration file is needed — this is a data repair, not a schema change.
- Always run Step 1 first and review the list before executing Step 2.
