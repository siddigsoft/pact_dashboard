# RUNBOOK: Pre-Fund Holder RLS

## Why this is needed

The `pre_fund_requests` table was originally built for Finance Admins only.
When a non-admin user (CD, FOM, Coordinator, etc.) is assigned as `holder_user_id`
on a fund, they need to **read their own row** so that:

1. The route guard (`/pre-funding`) can confirm they are a holder → grants access
2. The sidebar `isFundHolder` query returns `true` → shows the "My Fund" link
3. The Distribute and Report tabs can load their scoped data

Without this, any non-admin fund holder gets "Access Restricted" even when correctly
assigned as `holder_user_id`.

## What the migration does

| Policy | Table | Effect |
|---|---|---|
| Fund holders can read their own fund | `pre_fund_requests` | SELECT where `holder_user_id = auth.uid()` |
| Fund holders can read allocations for their fund | `pre_fund_allocations` | SELECT where fund belongs to their fund |
| Fund holders can read steps for their fund | `pre_fund_steps` | SELECT where fund belongs to their fund |

All existing Finance Admin / SuperAdmin policies are **unaffected**.

## How to apply

1. Go to **Supabase Dashboard → SQL Editor**
2. Open `supabase/migrations/pre_fund_holder_rls.sql`
3. Paste the full contents and click **Run**
4. Verify: no errors in the output

## How to verify

After running, ask Mohamed (or any assigned fund holder) to refresh
`app.pactorg.com` — they should now see the **"My Fund"** link in the sidebar
and be able to open the Pre-Funding page.

## Safe to re-run

Yes — all statements use `DROP POLICY IF EXISTS` + `CREATE POLICY` and
`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (idempotent).
