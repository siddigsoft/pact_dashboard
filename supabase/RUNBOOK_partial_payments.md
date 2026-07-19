# Partial Payments — DB Runbook

## Migration
Run this once against your Supabase project:

```sql
ALTER TABLE operational_cost_submissions
  ADD COLUMN IF NOT EXISTS amount_paid_cents bigint NOT NULL DEFAULT 0;
```

No enum change needed — `status = 'partially_paid'` is stored as plain text alongside the existing values.

## How it works
| Status | Meaning |
|--------|---------|
| `approved` | Approved, no payment yet |
| `partially_paid` | One or more partial payments made, balance still outstanding |
| `paid` | Fully paid (amount_paid_cents = amount_cents) |

Each call to "Mark as Paid" increments `amount_paid_cents` by the chosen amount.  
When `amount_paid_cents >= amount_cents`, status flips to `'paid'`.

## Rollback
```sql
ALTER TABLE operational_cost_submissions DROP COLUMN IF EXISTS amount_paid_cents;
-- manually UPDATE any 'partially_paid' rows back to 'approved' if needed
UPDATE operational_cost_submissions SET status = 'approved' WHERE status = 'partially_paid';
```
