# Runbook: Education & Experience — Complete Setup

## What this fixes
- Employment history (Add Position) and Education history (Add Qualification) cannot be saved
- The `hr_employee_education` and `hr_employee_experience` tables need to be created
- RLS policies need to allow HR admins / super admins to insert records for any staff member

## Run once in Supabase SQL Editor

1. Go to **Supabase → SQL Editor**
2. Paste the full contents of: `supabase/migrations/20260723_hr_education_experience_complete.sql`
3. Click **Run**
4. You should see no errors

## What the SQL does (all idempotent — safe to run multiple times)

| Step | What it does |
|------|--------------|
| 1 | Creates `is_hr_admin_tier()` helper function (covers admin, super_admin, superadmin, hr_admin, ict, fom) |
| 2 | Creates `hr_employee_education` table if it doesn't exist |
| 3 | Enables RLS and sets SELECT / INSERT / UPDATE / DELETE policies on education table |
| 4 | Creates `hr_employee_experience` table if it doesn't exist |
| 5 | Enables RLS and sets SELECT / INSERT / UPDATE / DELETE policies on experience table |
| 6 | Adds `updated_at` auto-update triggers on both tables |
| 7 | Reloads PostgREST schema cache |

## After running

Reload the employee profile page. The amber warning banner will disappear and
you will be able to click **Add Position** → fill the form → **Save**.

## Verifying it worked

```sql
-- Should return 0 rows for "does not exist" errors
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('hr_employee_education', 'hr_employee_experience');
-- Should return exactly 2 rows
```
