# Runbook: Recruitment 360° — JR Workflow, Scoring & Offer Letters

**Migration files:**
1. `supabase/migrations/20260715_hr_recruitment_jr_scoring.sql` — core tables & indexes
2. `supabase/migrations/20260715b_recruitment_rls_headcount_fixes.sql` — security fixes + headcount plan

**Edge functions:**
- `supabase/functions/google-calendar-event/index.ts` — creates Google Calendar events using the user's stored OAuth token

> **Apply both migrations in order. Deploy the new edge function alongside.**

## Overview

This migration extends the existing Recruitment/ATS tables (from `20260705_hr_recruitment_disciplinary_benefits_headcount.sql`) with three new capabilities:

1. **Job Requisition (JR) approval workflow** — formal request → manager approval → HR approval → auto-created job posting
2. **Candidate scoring** — per-interviewer rubric scorecards with aggregate RadarChart
3. **Interview slots** — structured scheduling with multi-interviewer notifications

---

## New Tables

| Table | Purpose |
|---|---|
| `hr_job_requisitions` | JR records with dual-layer approval workflow |
| `hr_candidate_scores` | One scorecard per interviewer per candidate (UNIQUE constraint) |
| `hr_interview_slots` | Scheduled interview sessions (array of interviewer UUIDs) |

## Altered Tables

| Table | New Columns |
|---|---|
| `hr_job_postings` | `requisition_id uuid` — FK back to the JR that auto-created this posting |
| `hr_candidates` | `salary_offer`, `offer_currency`, `offer_start_date`, `offer_sent_at`, `linked_profile_id`, `onboarding_noted` |

---

## Prerequisite

Apply **`20260705_hr_recruitment_disciplinary_benefits_headcount.sql`** first. This migration
`REFERENCES hr_job_postings(id)` and `REFERENCES hr_candidates(id)`, so those tables must exist.

---

## Apply Steps

1. Open **Supabase Dashboard → SQL Editor**
2. Verify prerequisite: `SELECT to_regclass('public.hr_job_postings');` — must return a value
3. Paste and run `20260715_hr_recruitment_jr_scoring.sql`
4. Verify new tables:
   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN ('hr_job_requisitions','hr_candidate_scores','hr_interview_slots');
   ```
5. Verify new columns on `hr_candidates`:
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'hr_candidates'
     AND column_name IN ('salary_offer','offer_currency','offer_start_date','linked_profile_id','onboarding_noted');
   ```

---

## RLS Access Matrix

### hr_job_requisitions
| Action | Who |
|---|---|
| SELECT | All authenticated users |
| INSERT | All authenticated users (anyone can raise a requisition) |
| UPDATE | Own requester (own rows) OR manager/admin roles |
| DELETE | Requester (own draft rows) OR HR/admin |

### hr_candidate_scores
| Action | Who |
|---|---|
| SELECT | Own interviewer rows OR manager/admin/HR |
| INSERT | Self (interviewer_id = auth.uid()) OR HR/admin |
| UPDATE | Self OR HR/admin |
| DELETE | Self OR HR/admin |

### hr_interview_slots
| Action | Who |
|---|---|
| SELECT | Listed in `interviewer_ids[]` OR creator OR manager/admin |
| INSERT | Manager/admin/HR roles only |
| UPDATE | Creator OR HR/admin |
| DELETE | Creator OR HR/admin |

---

## Workflow: JR Approval Flow

```
Requester creates JR (status = 'draft')
  → submits → status = 'pending_manager'
  → Manager approves → status = 'pending_hr' (manager_approved_at set)
  → Manager rejects  → status = 'rejected' (manager_rejection_note set)
  → HR approves      → status = 'approved' (hr_approved_at set)
                        Auto-creates hr_job_postings row (linked_posting_id set)
  → HR rejects       → status = 'rejected' (hr_rejection_note set)
```

When HR approves, the system automatically creates a job posting in `hr_job_postings` with:
- `title` from JR
- `headcount_needed` from JR
- `description` from JR justification
- `requisition_id` pointing back to the JR
- `status = 'open'`

---

## Workflow: Candidate Hired → Onboarding

When a candidate's stage is set to `hired`:
1. A dialog prompts HR to optionally link to an existing `profiles` row
2. `linked_profile_id` is set on `hr_candidates`
3. `onboarding_noted = true` is set
4. An in-app notification is sent to HR/admin roles with a link to `/staff-onboarding`
5. If the JR is linked, it remains `approved` (already filled tracking is implicit via headcount)

---

## Rollback

```sql
ALTER TABLE hr_candidates
  DROP COLUMN IF EXISTS salary_offer,
  DROP COLUMN IF EXISTS offer_currency,
  DROP COLUMN IF EXISTS offer_start_date,
  DROP COLUMN IF EXISTS offer_sent_at,
  DROP COLUMN IF EXISTS linked_profile_id,
  DROP COLUMN IF EXISTS onboarding_noted;

ALTER TABLE hr_job_postings
  DROP COLUMN IF EXISTS requisition_id;

DROP TABLE IF EXISTS hr_interview_slots;
DROP TABLE IF EXISTS hr_candidate_scores;
DROP TABLE IF EXISTS hr_job_requisitions;
```
