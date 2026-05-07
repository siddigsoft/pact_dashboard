# PACT Accounting — Notification Triggers · Manual Apply Runbook

## What this migration does

`supabase/migrations/20260502_acct_accounting_notifications.sql` (299 lines)

Creates in-app notification triggers for accounting events. **All four triggers
are guarded** — they skip gracefully with a RAISE NOTICE if the target table
doesn't exist yet. Re-run this file after applying each phase to pick up any
previously skipped triggers.

| Part | Trigger | Fires on | Notifies |
|---|---|---|---|
| B | `acct_notify_invoice_overdue` | `acct_invoices` INSERT/UPDATE — when unpaid + `due_date < today` | All finance roles — AP invoice overdue |
| C | `acct_notify_gl_bridge_failure` | `acct_gl_bridge_log` INSERT — when `result = 'error'` | All finance roles — GL bridge posting failed |
| D | `acct_notify_grant_expiry` | `acct_grants` INSERT/UPDATE — when ≤30 days to `end_date` | All finance roles — grant expiring soon |
| E | `acct_notify_period_close` | `acct_fiscal_periods` INSERT/UPDATE — when `status = open` and `end_date < today` | All finance roles — period needs closing |

Also creates:
- `acct_notify_role_users(event_type, title, message, link, metadata)` helper function
- `idx_notifications_type_acct` index on `notifications.type`

---

## When to apply

Apply **after** the phase that creates each target table:

| Trigger | Target table created by | Apply after |
|---|---|---|
| `acct_notify_invoice_overdue` | Phase 2 GL bridges | Phase 2 ✅ |
| `acct_notify_gl_bridge_failure` | Phase 2 GL bridges | Phase 2 ✅ |
| `acct_notify_grant_expiry` | `hr_advances_grant_milestones.sql` / Phase 5 | Phase 3 pre-req ✅ |
| `acct_notify_period_close` | Phase 1 sprint 1.1 | Phase 1 ✅ |

All four target tables should exist after Phase 3 is applied, so the best time to
run this file is **after Phase 3**. It can also be re-run safely any time to pick up
triggers skipped in earlier runs.

---

## Prerequisites

None strict — the file guards every trigger binding. However for all 4 triggers to
be created successfully, the following should already be applied:
- Phase 1 sprint 1.1 (`acct_fiscal_periods`)
- Phase 2 (`acct_invoices`, `acct_gl_bridge_log`)
- Phase 3 pre-req: `hr_advances_grant_milestones.sql` (`acct_grants`)

---

## Apply steps

1. Open **Supabase Dashboard → SQL Editor** for `abznugnirnlrqnnfkein`
2. Create a new query tab
3. Paste the **entire** content of `supabase/migrations/20260502_acct_accounting_notifications.sql`
4. Click **Run** — wrapped in `begin … commit`

### Expected NOTICE messages

```
NOTICE:  Trigger acct_notify_invoice_overdue created on acct_invoices
NOTICE:  Trigger acct_notify_gl_bridge_failure created on acct_gl_bridge_log
NOTICE:  Trigger acct_notify_grant_expiry created on acct_grants
NOTICE:  Trigger acct_notify_period_close created on acct_fiscal_periods
NOTICE:  acct_notify_role_users() helper created. Check NOTICE messages above for skipped triggers.
```

Any SKIP notice means the target table was not yet present — re-run this file after
applying the relevant phase.

---

## Smoke tests

```sql
-- 1. Helper function exists
SELECT proname FROM pg_proc WHERE proname = 'acct_notify_role_users';

-- 2. Triggers registered (expect 4 rows if all tables exist)
SELECT event_object_table, trigger_name
FROM information_schema.triggers
WHERE trigger_name LIKE 'acct_notify%'
ORDER BY event_object_table;

-- 3. Index created
SELECT indexname FROM pg_indexes
WHERE tablename = 'notifications'
  AND indexname = 'idx_notifications_type_acct';
```

---

## Testing a notification manually

```sql
-- Send a test AP overdue notification to all finance roles:
SELECT public.acct_notify_role_users(
  'accounting_ap_overdue',
  'Test: AP Invoice Overdue',
  'This is a test notification from the accounting notification system.',
  '/accounting/ap-invoices',
  '{}'::jsonb
);

-- Verify it appeared:
SELECT title, message, created_at
FROM public.notifications
WHERE type = 'accounting_ap_overdue'
ORDER BY created_at DESC
LIMIT 5;
```

---

## Rollback

```sql
-- Drop all accounting notification triggers
DROP TRIGGER IF EXISTS acct_notify_invoice_overdue  ON public.acct_invoices;
DROP TRIGGER IF EXISTS acct_notify_gl_bridge_failure ON public.acct_gl_bridge_log;
DROP TRIGGER IF EXISTS acct_notify_grant_expiry      ON public.acct_grants;
DROP TRIGGER IF EXISTS acct_notify_period_close      ON public.acct_fiscal_periods;

-- Drop trigger functions
DROP FUNCTION IF EXISTS public.acct_trg_invoice_overdue()        CASCADE;
DROP FUNCTION IF EXISTS public.acct_trg_gl_bridge_failure()      CASCADE;
DROP FUNCTION IF EXISTS public.acct_trg_grant_expiry_warning()   CASCADE;
DROP FUNCTION IF EXISTS public.acct_trg_period_close_reminder()  CASCADE;
DROP FUNCTION IF EXISTS public.acct_notify_role_users(text, text, text, text, jsonb) CASCADE;

-- Drop index
DROP INDEX IF EXISTS public.idx_notifications_type_acct;
```
