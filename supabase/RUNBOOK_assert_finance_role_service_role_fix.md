# Runbook: _assert_finance_role() service-role patch

## Why this exists
`activate_pre_fund_rpc` and other pre-fund RPCs call `_assert_finance_role()`,
which looked up `profiles.id = auth.uid()`.  When the **bank-feed edge function**
(`pre-fund-bank-feed`) invokes these RPCs via the service-role key,
`auth.uid()` is NULL so the profile lookup returns nothing and the guard raised
`Access denied`.  This prevented automatic bank-match → activation from working.

## Migration file
`supabase/migrations/20260709_assert_finance_role_service_role_fix.sql`

## What the patch does
Adds an early-return at the top of `_assert_finance_role()`:

```sql
IF auth.role() = 'service_role' THEN
  RETURN;
END IF;
```

Service-role JWTs are already highly privileged (they bypass RLS). The check
simply lets the guard pass for edge-function / cron callers without requiring
a real `profiles` row for the calling user.  All human-facing authenticated
API calls continue to go through the full profile/role lookup.

## How to apply
Run in the **Supabase SQL Editor** (or via `supabase db push`):

```sql
\i supabase/migrations/20260709_assert_finance_role_service_role_fix.sql
```

Or copy-paste the file contents directly into the SQL Editor and execute.

## Verification
After applying, trigger a test activation from the bank-feed:

```bash
curl -X POST https://<your-project>.supabase.co/functions/v1/pre-fund-bank-feed \
  -H "x-webhook-secret: <PRE_FUND_WEBHOOK_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"mode":"push","amount":1000,"currency":"USD","reference":"TEST-REF-001"}'
```

Expect `"status":"activated"` or `"status":"unmatched"` (not `activation_error`
with "Access denied").
