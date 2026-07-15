# RUNBOOK: Policy Library & Employee Acknowledgement (Task #83)

## Tables Created
- `hr_policies` — policy registry (title, category, version, status, content, etc.)
- `hr_policy_acknowledgements` — per-employee sign-off records

## Apply Migration
Copy-paste `supabase/migrations/20250715_hr_policies.sql` into the Supabase Dashboard > SQL Editor and run it.
The migration is idempotent: it uses `DROP POLICY IF EXISTS … ; CREATE POLICY …` so it is safe to re-run.

## Verify Tables
```sql
SELECT id, title, category, version, status, effective_date
FROM hr_policies ORDER BY created_at DESC LIMIT 10;

SELECT a.id, a.policy_id, p.title, a.user_id, a.acknowledged_at,
       a.policy_version, a.confirmed_name, a.ip_address
FROM hr_policy_acknowledgements a
JOIN hr_policies p ON p.id = a.policy_id
ORDER BY a.acknowledged_at DESC LIMIT 20;
```

## RLS Summary
| Table                        | Role           | Allowed                          |
|------------------------------|----------------|----------------------------------|
| hr_policies                  | HR/admin/ict   | SELECT / INSERT / UPDATE / DELETE |
| hr_policies                  | Any auth user  | SELECT (published only)          |
| hr_policy_acknowledgements   | HR/admin/ict   | SELECT                           |
| hr_policy_acknowledgements   | Employee       | SELECT (own) + INSERT (own)      |

## Edge Functions

### acknowledge-policy
Located at `supabase/functions/acknowledge-policy/index.ts`.
Handles acknowledgement insertion server-side so that `ip_address` is captured
from the real request headers (`x-forwarded-for`, `x-real-ip`, `cf-connecting-ip`).
`user_id` is extracted from the caller's JWT — cannot be client-forged.

Deploy:
```bash
supabase functions deploy acknowledge-policy --no-verify-jwt
```

### hr-policy-reminder
Located at `supabase/functions/hr-policy-reminder/index.ts`.
Daily cron: sends in-app + email reminder at Day 7 and escalation at Day 14.
Uses permanent threshold-specific dedup keys in `audit_logs` so each threshold
fires exactly once per policy/employee, no matter how many times the cron runs.

Deploy:
```bash
supabase functions deploy hr-policy-reminder --no-verify-jwt
```

Schedule via pg_cron (run in SQL Editor):
```sql
SELECT cron.schedule(
  'hr-policy-reminder-daily',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.settings.supabase_url') || '/functions/v1/hr-policy-reminder',
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret'),
                 'Content-Type', 'application/json'
               ),
    body    := '{}'::jsonb
  )
  $$
);
```

Required secrets in Supabase Dashboard > Edge Functions > Secrets:
- `CRON_SECRET` — shared secret for the scheduled cron caller
- `APP_URL` — e.g. `https://app.pactorg.com`

## Re-acknowledgement on New Version
1. Edit the policy, bump the `version` field (e.g. `1.0` → `2.0`)
2. Click **Publish** — `published_at` updates to now
3. Existing acknowledgements remain (audit trail) but belong to the old version
4. All employees see the policy as **Pending** again (version mismatch)
5. The cron will start counting days from the new `effective_date`

## Compliance Export
Excel export button in the Compliance tab generates two sheets:
- **Policies** — all published policies with completion %
- **Acknowledgements** — full log with employee, version, timestamp, IP

## Storage Bucket (Policy Document Uploads)

Bucket name: **`hr-policies`** (public)
- Max file size: 50 MB
- Allowed types: PDF, Word (.doc/.docx), Excel (.xls/.xlsx)
- Bucket was created directly via SQL (already applied — no action needed):
  ```sql
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('hr-policies', 'hr-policies', true, 52428800,
    ARRAY['application/pdf','application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
  ON CONFLICT (id) DO NOTHING;
  ```
- RLS: HR/admin/ict roles can upload and delete; all authenticated users can download.

## Extra Metadata Columns (already applied)
Added to `hr_policies` via `supabase/migrations/20260715_hr_policy_extra_fields.sql`:
- `description text` — short 1–2 sentence summary
- `review_date date` — next scheduled review date
- `owner text` — responsible person or role (free text)

## Troubleshooting
| Symptom | Check |
|---|---|
| Employee can't see policies | Confirm `status = 'published'` and `required_roles` is empty or includes their role |
| Acknowledgement not saving | Check auth session is valid; `acknowledge-policy` edge function deployed |
| IP address is null | Edge function deployed? Verify `x-forwarded-for` header present in Supabase request |
| Cron not firing | Verify `CRON_SECRET` secret set; check pg_cron job with `SELECT * FROM cron.job` |
| Upload fails "Bucket not found" | Bucket already created — check Storage tab in Supabase Dashboard confirms `hr-policies` exists |
| Upload fails 403 | User's role not in (admin, super_admin, hr_admin, ict) — check `profiles.role` |
