# RUNBOOK: Policy Library & Employee Acknowledgement (Task #83)

## Tables Created
- `hr_policies` — policy registry (title, category, version, status, content, etc.)
- `hr_policy_acknowledgements` — per-employee sign-off records

## Apply Migration
```sql
-- In Supabase SQL editor, run:
\i supabase/migrations/20250715_hr_policies.sql
```

Or copy-paste the file contents into the Supabase Dashboard > SQL Editor.

## Verify Tables
```sql
SELECT id, title, category, version, status, effective_date
FROM hr_policies ORDER BY created_at DESC LIMIT 10;

SELECT a.id, a.policy_id, p.title, a.user_id, a.acknowledged_at, a.policy_version
FROM hr_policy_acknowledgements a
JOIN hr_policies p ON p.id = a.policy_id
ORDER BY a.acknowledged_at DESC LIMIT 20;
```

## RLS Summary
| Table                        | Role           | Allowed             |
|------------------------------|----------------|---------------------|
| hr_policies                  | HR/admin/ict   | SELECT/INSERT/UPDATE/DELETE |
| hr_policies                  | Any auth user  | SELECT (published only) |
| hr_policy_acknowledgements   | HR/admin/ict   | SELECT              |
| hr_policy_acknowledgements   | Employee       | SELECT (own) + INSERT (own) |

## Edge Function: hr-policy-reminder
Located at `supabase/functions/hr-policy-reminder/index.ts`.

### What it does
- Runs daily (pg_cron or Supabase Scheduled Functions)
- At Day 7 after effective_date: sends in-app + email reminder to employees who haven't acknowledged
- At Day 14: sends escalation reminder + notifies their manager

### Deploy
```bash
supabase functions deploy hr-policy-reminder --no-verify-jwt
```

### Schedule (pg_cron — run in SQL editor)
```sql
SELECT cron.schedule(
  'hr-policy-reminder-daily',
  '0 7 * * *',  -- 07:00 UTC every day
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/hr-policy-reminder',
    headers := '{"Authorization": "Bearer " || current_setting(''app.settings.cron_secret'')}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
```

## Re-acknowledgement on New Version
When publishing a new version of a policy (bump the `version` field and set status → published):
1. Edit the policy, change the `version` string (e.g., 1.0 → 2.0)
2. Click Publish — the `published_at` timestamp updates
3. Existing acknowledgements remain in the DB (audit trail) but are for the OLD version
4. All employees will see the policy as "Pending" again because the version no longer matches

## Compliance Export
Use the Excel export button in the Compliance tab of the Policy Library page. It generates:
- Sheet 1: "Policies" — all published policies with completion %
- Sheet 2: "Acknowledgements" — full acknowledgement log

## Troubleshooting
- Employee can't see policies: check `status = 'published'` and `required_roles` is empty OR includes their role
- Acknowledgement not saving: check RLS — employee must be authenticated (`auth.uid() = user_id`)
- Edge function not running: verify CRON_SECRET secret is set in Supabase Dashboard > Edge Functions > Secrets
