# Runbook — add `hourly_rate` to `employee_salary_config`

**Date:** 2026-04-25
**Target DB:** pactdb (Supabase project `abznugnirnlrqnnfkein`)
**SQL file:** `supabase/migrations/20260425_add_hourly_rate_to_employee_salary_config.sql`
**Risk:** Very low — pure additive, nullable column. No PK changes. Idempotent.

---

## What broke

When saving a salary configuration in **HR & Finance → Payroll Admin →
Configure Salary**, the dialog showed:

> **Save failed** — Could not find the 'hourly_rate' column of
> 'employee_salary_config' in the schema cache

## Why

The timesheet module migration (`20260409_timesheet_module.sql`) adds
`hourly_rate numeric(10,2)` to `employee_salary_config` so hourly
employees can have their pay computed from approved timesheet hours.
That migration file was authored but never pasted into pactdb.

The frontend writes `hourly_rate` on every save (whether or not the
employee is hourly), so the missing column blocks **all** salary saves.

## What's already shipped (no SQL needed)

`src/pages/PayrollAdmin.tsx` (the salary config dialog) was hardened to
**retry the save without `hourly_rate`** if PostgREST reports a schema
cache miss. So the save will work right now even before you paste the
SQL — `hourly_rate` simply won't be persisted until the column exists.

## Steps — apply the column

1. Open the **pactdb SQL editor** in Supabase.
2. Paste the entire contents of
   `supabase/migrations/20260425_add_hourly_rate_to_employee_salary_config.sql`.
3. Click **Run**.
4. Confirm the verification SELECT at the bottom returns one row:

   | column_name | data_type | is_nullable |
   |-------------|-----------|-------------|
   | hourly_rate | numeric   | YES         |

5. The `NOTIFY pgrst, 'reload schema'` line tells PostgREST to refresh
   its schema cache immediately, so no Supabase restart is needed. The
   column will be writable from the app within a few seconds.

## Smoke test

1. Open **HR & Finance → Payroll Admin**.
2. Click **Configure Salary** for any employee.
3. Set a base salary (and optionally an hourly rate).
4. Click **Save Configuration** — should succeed without the previous
   schema-cache error and without any retry fallback.

## Rollback (if needed)

```sql
ALTER TABLE public.employee_salary_config DROP COLUMN IF EXISTS hourly_rate;
NOTIFY pgrst, 'reload schema';
```

The frontend resilience patch will keep working after rollback — saves
will simply skip the `hourly_rate` field again.
