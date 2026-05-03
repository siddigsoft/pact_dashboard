# Runbook: Nightly Overdue Invoice Scan (pg_cron)

## What this does
Schedules a daily 06:00 UTC cron job that calls the `acct-overdue-scan` edge function.
The function scans `acct_invoices` for overdue AP invoices and creates in-app notifications
for all users with finance/accounting roles.

## Prerequisites
1. `pg_cron` extension enabled in Supabase Dashboard → Database → Extensions
2. `pg_net` extension enabled (same location)
3. The `acct-overdue-scan` edge function deployed:
   ```
   supabase functions deploy acct-overdue-scan
   ```

## Step 1 — Set the required PostgreSQL runtime settings
Run the following in **Supabase Dashboard → SQL Editor** before applying the cron SQL.
Replace the values with your actual project URL and service role key
(found in Supabase Dashboard → Project Settings → API):

```sql
-- Set once per database; survives restarts
ALTER DATABASE postgres
  SET "app.supabase_url"      = 'https://YOUR_PROJECT_REF.supabase.co';

ALTER DATABASE postgres
  SET "app.service_role_key"  = 'YOUR_SERVICE_ROLE_KEY';
```

> **Security note:** The service role key is stored as a database setting. It is only
> readable by database superusers and functions with `SECURITY DEFINER`. Never expose
> it in client-side code or logs.

## Step 2 — Apply the cron schedule
After setting the runtime settings above, run the cron migration in the SQL Editor:

```sql
\i supabase/migrations/acct_overdue_scan_cron.sql
```

Or paste the file contents directly into the SQL Editor.

## Step 3 — Verify the job is registered

```sql
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'acct-overdue-scan';
```

Expected output:
```
 jobid | jobname            | schedule  | active
-------+--------------------+-----------+--------
   1   | acct-overdue-scan  | 0 6 * * * | t
```

## Step 4 — Test immediately (optional)

```sql
SELECT cron.run_job('acct-overdue-scan');
```

Then check the notifications table:
```sql
SELECT title, message, created_at
FROM notifications
WHERE type = 'accounting_invoice_overdue'
ORDER BY created_at DESC
LIMIT 10;
```

## Removing the job

```sql
SELECT cron.unschedule('acct-overdue-scan');
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `ERROR: unrecognized configuration parameter "app.supabase_url"` | Step 1 not run | Run the `ALTER DATABASE` commands first |
| Job registered but no notifications appear | Edge function not deployed | `supabase functions deploy acct-overdue-scan` |
| `pg_net` error in cron logs | `pg_net` extension not enabled | Enable in Dashboard → Extensions |
| No overdue invoices found | All invoices are within due date | Check `acct_invoices` for rows with `due_date < now()` and `status != 'paid'` |

## Related files
- `supabase/migrations/acct_overdue_scan_cron.sql` — the cron schedule SQL
- `supabase/functions/acct-overdue-scan/index.ts` — the edge function
- `src/pages/AccountingSettings.tsx` — feature flags UI (enable `acct.gl_bridge.enabled`)
