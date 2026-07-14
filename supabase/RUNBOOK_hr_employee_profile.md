# Runbook: HR Employee Full Profile Tables

## Overview
Adds 7 new tables to support a full employee profile in the HR module:
personal details, education history, work experience, document vault,
skills, languages, and references.

## Tables Created
| Table | Purpose |
|---|---|
| `hr_employee_personal` | DOB, gender, nationality, marital status, ID numbers, address |
| `hr_employee_education` | Degree, institution, field of study, graduation year |
| `hr_employee_experience` | Previous employers, roles, dates |
| `hr_employee_documents` | Document vault: ID card, passport, CV, certificates, etc. |
| `hr_employee_skills` | Skills with proficiency levels |
| `hr_employee_languages` | Languages spoken with proficiency |
| `hr_employee_references` | Professional references |

## How to Apply (one-time)
1. Open Supabase SQL Editor: https://supabase.com/dashboard/project/abznugnirnlrqnnfkein/sql
2. Open file: `supabase/migrations/hr_employee_profile_tables.sql`
3. Copy the full SQL and run it in the SQL Editor

## Storage
Documents are uploaded to the existing **`staff-contracts`** private bucket under
the path: `{user_id}/{timestamp}_{filename}`

Signed URLs (120s TTL) are generated on-demand for viewing/downloading.

## UI Location
Go to **Admin Hub → Users → click any staff member**.

The UserDetail page now has 4 new tabs:
- **Personal** — identity, ID documents, home address
- **Education** — degree history + previous work experience
- **Documents** — document vault with categorized file types
- **Skills** — skills, languages, and professional references

## RLS Summary
- Staff can read **their own** record (`profile_id = auth.uid()`)
- HR Admins (`is_hr_admin()`) can read, insert, update, delete all records
- The `is_hr_admin()` function checks for roles: `admin`, `super_admin`, `superAdmin`, `SuperAdmin`, `ict`, `hr_admin`
