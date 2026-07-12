# Runbook: Admin Wallet Backfill RPC

## What this does
Creates a `SECURITY DEFINER` Postgres function
`public.admin_backfill_site_visit_credit(p_site_visit_id uuid)`
that credits a completed site visit's wallet fee with **zero RLS interference**.

Because the function uses `SECURITY DEFINER`, it executes as the DB owner
(postgres), bypassing every Row Level Security policy on `wallets` and
`wallet_transactions`. This is the only reliable way to perform admin-initiated
bulk crediting across all users.

## When to apply
Apply **once**, before using the "Credit Missing Sites" backfill in
Finance Hub → Wallets Admin.  The backfill button now calls this RPC
instead of the old JS-based path.

## How to apply

### Option A — SQL Editor in Supabase Dashboard (recommended)
1. Open Supabase Dashboard → SQL Editor
2. Copy and paste the full contents of
   `supabase/migrations/admin_backfill_wallet_credits_rpc.sql`
3. Click **Run**

OR paste the compact version from the red warning card shown in
Finance Hub → Wallets Admin when the setup hasn't been done yet.

### Option B — both files at once
Run the two migration files in order:
1. `supabase/migrations/wallet_admin_rls_bypass.sql`  (RLS SELECT bypass)
2. `supabase/migrations/admin_backfill_wallet_credits_rpc.sql`  (backfill RPC)

## Verification
After running, execute in SQL Editor:
```sql
SELECT routine_name, security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'admin_backfill_site_visit_credit';
```
Expected: one row with `security_type = 'DEFINER'`.

## What the function does internally
1. Fetches the `mmp_site_entries` row for the given ID
2. Resolves payee: `visit_completed_by` → `accepted_by` (UUID-validated)
3. Confirms the payee UUID exists in `profiles` (avoids FK violation)
4. Checks for duplicate transactions (idempotent — safe to re-run)
5. Creates wallet if the user has none
6. Inserts `wallet_transactions` row with `type='earning'`
7. Updates `wallets.balances`, `balance_cents`, `total_earned`, `total_earned_cents`
8. Returns `{success, message, tx_id, amount}` or `{success:false, message, detail}`

## Re-running the backfill
The function is idempotent: calling it twice for the same site visit
returns `{success:true, skipped:true}` without inserting a duplicate.
It is safe to re-run the full backfill at any time.
