# Runbook: Wallet Admin RLS Bypass

## Problem
The `wallets`, `wallet_transactions`, and `withdrawal_requests` tables have Row Level Security (RLS) policies that restrict every user to see only **their own** rows. This means even admin users querying the wallets admin page could only see their own 1 wallet instead of all 221.

## Fix
Migration file: `supabase/migrations/wallet_admin_rls_bypass.sql`

Adds three admin-bypass SELECT policies using a sub-select on `profiles.role`:
- `wallets` — "Admins can view all wallets"
- `wallet_transactions` — "Admins can view all wallet transactions"
- `withdrawal_requests` — "Admins can view all withdrawal requests"

Allowed roles: `admin`, `superAdmin`, `financialAdmin`

## How to Apply

1. Open Supabase Dashboard → your project → **SQL Editor**
2. Paste and run the contents of `supabase/migrations/wallet_admin_rls_bypass.sql`
3. Reload the Wallets Admin page — it will now show all 221 wallets with real balances

## After the Backfill
Once you apply this SQL **and** run "Credit 697 Sites" in the backfill panel:
- All 221 wallets will show their real earned balances
- Summary stats (Total Sites Cost, Current Balances) will reflect actual totals
- Each user row will show their earned amount broken down by site visits

## Notes
- These policies add **read** access only — no write bypass is granted
- The existing per-user SELECT policies remain in place; the new policies are additive
- If a user's role changes from admin, they lose the bypass automatically on next query
