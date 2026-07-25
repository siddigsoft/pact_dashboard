# Runbook: Pre-Fund Allow Overpay & Transfer Funds

## What this migration does

File: `supabase/migrations/pre_fund_allow_overpay.sql`

1. **`pre_fund_requests.allow_overpay` (boolean, nullable)** — Per-fund overpay override.
   - `NULL` → use the global default from `pre_fund_settings.allow_overpay_default`
   - `TRUE` → always allow payments beyond funded amount on this fund
   - `FALSE` → always block payments beyond funded amount on this fund

2. **`pre_fund_settings.allow_overpay_default` (boolean, default TRUE)** — Global default.
   - Configurable from Pre-Funding Settings → Payment Controls card.

## How to apply

1. Open Supabase SQL Editor → New Query
2. Paste the contents of `supabase/migrations/pre_fund_allow_overpay.sql`
3. Run — no data loss, both are `ADD COLUMN IF NOT EXISTS`

## New features enabled

### Per-fund Allow Overpay toggle (Fund Registry edit form)
- Appears in the "Fund Holder" section of the create/edit form
- Three states: "Use default" / "Allow overpay" / "Block overpay"
- Stored as `NULL / TRUE / FALSE` in `pre_fund_requests.allow_overpay`

### Global default (Pre-Funding Settings → Payment Controls)
- Toggle stored in `pre_fund_settings.allow_overpay_default`
- Applied to any fund where `allow_overpay IS NULL`

### Transfer Funds (Fund Registry → three-dot menu)
- Appears on Active / Low Balance funds when at least one other active fund exists
- Requires `canManage` permission
- Moves a specified amount from one fund to another:
  - Creates a `return` transaction on the source fund
  - Creates a `receipt` transaction on the destination fund
  - Updates `available_balance` on both funds immediately
  - Fires a `pre_fund_topup_requested` notification to Finance Admins
- Validates: amount > 0, amount ≤ source available_balance, reason required

## Rollback

```sql
ALTER TABLE pre_fund_requests DROP COLUMN IF EXISTS allow_overpay;
ALTER TABLE pre_fund_settings DROP COLUMN IF EXISTS allow_overpay_default;
```
