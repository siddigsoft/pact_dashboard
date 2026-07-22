# Runbook: Fix RLS for Education & Experience Tables

## Problem
The `hr_employee_education` and `hr_employee_experience` tables had RLS policies that checked role names using old capitalized values (`'Admin'`, `'SuperAdmin'`, `'HR_Admin'`) which don't match the actual stored values (`'admin'`, `'super_admin'`, `'hr_admin'`, etc.). This blocked admin users from inserting or updating records on another employee's profile.

## Prerequisite
Run `20260723_hr_employee_dependents_rls_fix.sql` first — it creates the `public.is_hr_admin_tier()` helper function that this migration depends on.

## Steps

1. Open your Supabase project SQL Editor
2. Run the prerequisite migration if not already done:
   - `supabase/migrations/20260723_hr_employee_dependents_rls_fix.sql`
3. Then run this migration:
   - `supabase/migrations/20260722_hr_education_experience_rls_fix.sql`

## What it does
- Drops the old broken RLS policies on `hr_employee_education` (both `hr_edu_*` and `hr_education_*` variants)
- Drops the old broken RLS policies on `hr_employee_experience` (both `hr_exp_*` and `hr_experience_*` variants)
- Recreates all four policies (SELECT, INSERT, UPDATE, DELETE) on both tables using `public.is_hr_admin_tier()` which covers: `admin`, `super_admin`, `superadmin`, `hr_admin`, `ict`, `fom`

## Verification
After running, go to an employee profile → Education & Experience tab → Employment History → click "Add Position". The form should open and saving should work without any "Save failed" error.
