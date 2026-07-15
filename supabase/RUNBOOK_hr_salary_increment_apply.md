# Runbook — hr-salary-increment-apply Edge Function

## Purpose
Nightly automated application of due salary increments. Replaces the previous
`syncDueIncrements()` page-load trigger in `SalaryIncrements.tsx`.

Finds every `salary_increments` row with:
- `status = 'approved'`
- `effective_date <= TODAY`

…where `employee_salary_config.base_salary` doesn't yet reflect `new_salary`,
and updates (or creates) the employee's salary config record.

Results are written to `hr_salary_increment_log` for auditing.

---

## Schedule
Run nightly at **02:00 UTC** so changes are reflected before staff check their
payslips the next morning.

### Using Supabase Dashboard
1. Go to **Edge Functions** → select `hr-salary-increment-apply`
2. Set a **cron schedule**: `0 2 * * *`

### Using `supabase/config.toml`
```toml
[functions.hr-salary-increment-apply]
schedule = "0 2 * * *"
```

---

## Manual Trigger
```bash
curl -X POST https://<SUPABASE_URL>/functions/v1/hr-salary-increment-apply \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

Or from the Supabase Dashboard → Edge Functions → Invoke.

---

## Audit Log
Every run writes one row to `hr_salary_increment_log`:

| Column | Description |
|---|---|
| `run_at` | Timestamp of the run |
| `applied_count` | Employees whose salary config was updated |
| `skipped_count` | Employees whose salary was already correct |
| `error_count` | Employees where the update failed |
| `details` | jsonb: `{ run_date, summary: { userId: "message" } }` |

Query recent runs:
```sql
SELECT run_at, applied_count, skipped_count, error_count
FROM hr_salary_increment_log
ORDER BY run_at DESC
LIMIT 10;
```

---

## Environment Variables (set in Edge Function secrets)
- `SUPABASE_URL` — auto-injected by Supabase runtime
- `SUPABASE_SERVICE_ROLE_KEY` — auto-injected by Supabase runtime

No additional secrets are required.

---

## Migration
`supabase/migrations/20260715_payroll_compliance.sql` creates:
- `hr_compensation_grades` — salary band master
- `hr_payroll_leave_flags` — unpaid-leave deduction queue
- `hr_salary_increment_log` — this function's audit log

Apply manually:
```sql
-- run contents of supabase/migrations/20260715_payroll_compliance.sql
```

---

## Failure Handling
- A failed update for one employee does **not** abort the loop — all others are
  still processed.
- `error_count > 0` in the log row signals a partial failure; check `details`
  for the specific user_id and error message.
- If the function fails entirely (5xx), Supabase will not auto-retry cron
  invocations — monitor via the Dashboard logs.

---

## Notes
- The `trg_apply_salary_increment` DB trigger (migration `20260424_hr_audit_complete.sql`)
  handles real-time apply when an increment is saved with `effective_date <= today`.
  This edge function handles the **time-crossing** case: increments approved before
  their effective_date that need to be applied when that date arrives.
- Both the trigger and the edge function are idempotent — running both is safe.
