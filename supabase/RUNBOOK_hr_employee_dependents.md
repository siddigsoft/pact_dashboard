# Runbook: hr_employee_dependents table

## Problem
The Dependents & Beneficiaries tab throws:
> "Could not find the table 'public.hr_employee_dependents' in the schema cache"

## Fix
Run the SQL below in **Supabase → SQL Editor** (one-time setup).

## SQL to run

Copy the full contents of:
`supabase/migrations/20260723_hr_employee_dependents.sql`

Paste it into the Supabase SQL Editor and click **Run**.

## What it creates

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key, auto-generated |
| profile_id | uuid | FK → profiles.id (cascade delete) |
| full_name | text | Required |
| relationship | text | spouse / child / parent / sibling / other |
| date_of_birth | date | Optional |
| gender | text | Optional |
| national_id_no | text | Optional |
| is_beneficiary | boolean | EOSB/gratuity/insurance flag |
| health_insurance | boolean | Covered by health insurance flag |
| notes | text | Optional |
| created_at | timestamptz | Auto |
| updated_at | timestamptz | Auto |

## RLS policies applied
- Admins, Super Admins, HR Admin, ICT → full read/write/delete
- Staff → read their own dependents only

## After running
Refresh the employee profile page — the Dependents & Beneficiaries form will save without errors.
