# Runbook: HR Benefits Enrollment, Succession Planning & Pulse Surveys

## Overview
This runbook covers the three new HR features added in the migration `20260720_hr_benefits_succession_pulse_surveys.sql`.

---

## 1. Apply the Migration

Paste the entire contents of `supabase/migrations/20260720_hr_benefits_succession_pulse_surveys.sql` into the **Supabase SQL Editor** and run it.

### What it does:
| Change | Detail |
|---|---|
| `hr_benefit_plans` | Adds `plan_tier`, `coverage_type`, `effective_date`, `hub_id`, `max_dependents` columns |
| `hr_benefit_enrollments` | Adds `effective_date`, `approved_by`, `approved_at`, `dependents_json`, `hub_id`, `enrollment_period_id` |
| `hr_open_enrollment_periods` *(new table)* | Admin-defined enrollment windows (start/end dates, eligible plans, is_active) |
| `positions` | Adds `is_critical_role`, `primary_successor_id`, `secondary_successor_id`, `successor_readiness`, `succession_notes` |
| `hr_pulse_surveys` *(new table)* | Survey header with questions JSONB, target_hub, dates |
| `hr_pulse_responses` *(new table)* | **Anonymous** responses — no `user_id` column by design |

### Verify:
```sql
-- Should return 0 errors
select column_name from information_schema.columns
where table_name = 'hr_open_enrollment_periods' order by 1;

select column_name from information_schema.columns
where table_name = 'positions' and column_name like 'succession%' or column_name = 'is_critical_role';

select table_name from information_schema.tables
where table_name in ('hr_pulse_surveys', 'hr_pulse_responses', 'hr_open_enrollment_periods');
```

---

## 2. Benefits Administration

### Feature: Self-service enrollment
- All staff see the **Benefits Administration** tab (was admin-only; now `adminOnly: false`).
- During an active Open Enrollment Period, employees can click **Request Enrollment** on any eligible plan.
- The request lands in the HR **Approval Queue** (status = `pending`).

### Feature: Admin approval flow
1. HR opens **Approval Queue** tab — pending requests listed.
2. Click **Approve** → status → `active`, staff notified.
3. Click **Reject** → status → `terminated`, staff notified.

### Feature: Open Enrollment Periods
- HR creates a period with start/end dates and optionally selects which plans are eligible.
- If no plans are selected, all active plans are eligible.
- Multiple periods can exist; the UI checks `is_active = true AND starts_at ≤ today ≤ ends_at`.

### Feature: Cost Report Export (Excel)
- Click **Cost Report (Excel)** → downloads a 3-sheet XLSX:
  - **By Plan**: enrolled count, employer cost, employee cost, grand total
  - **By Department**: aggregated cost per department
  - **By Hub**: aggregated cost per hub

---

## 3. Succession Planning

### Flagging Critical Roles
1. Open **HR → People → Positions & Vacancies**.
2. Edit any position → toggle **Critical Role** ON.
3. Set **Primary Successor**, optionally a **Secondary Successor**.
4. Set **Successor Readiness** (0–100%). Interpreted as:
   - ≥75% = Ready Now
   - 50–74% = Ready within 1 year
   - 25–49% = Ready 2–3 years
   - <25% = Early Stage

### Dashboard views
- **Critical Roles tab** (in Positions page): filtered view of all critical positions, showing successor names and readiness badges.
- **Red alert banner**: appears when any critical role has no successor OR readiness < 50%.
- **Org Chart**: people holding critical positions show succession badges (No Successor / Not Ready / Covered).
- **Offboarding dialog**: red warning block appears if the selected departing employee holds a critical position without a ready successor.

### Risk thresholds
| Condition | Indicator |
|---|---|
| `is_critical_role = true` AND `primary_successor_id IS NULL` | 🔴 No successor |
| `is_critical_role = true` AND `successor_readiness < 50` | 🟡 Not ready |
| `is_critical_role = true` AND `successor_readiness ≥ 50` | 🟢 Covered |

---

## 4. Pulse Surveys

### Anonymity guarantee
`hr_pulse_responses` has **no `user_id` column**. Only `hub_id` (broad grouping) is stored. Supabase RLS:
- Any authenticated user can `INSERT` a response (anonymous submission).
- Only admin/HR roles can `SELECT` responses (aggregate analytics only).
- No `UPDATE` or `DELETE` on responses (immutable audit).

### Question types
| Type | Scale | Used for |
|---|---|---|
| `rating` | 1–5 | Satisfaction ratings |
| `nps` | 0–10 | eNPS (Employee Net Promoter Score) |
| `text` | Free text | Open-ended feedback |
| `yes_no` | Yes / No | Binary questions |

### eNPS calculation
```
eNPS = ((Promoters − Detractors) / Total NPS Responses) × 100

Promoters  = responses where NPS score ≥ 9
Detractors = responses where NPS score ≤ 6
Passives   = responses where NPS score is 7 or 8

Interpretation:
  ≥ 50 = Excellent
  20–49 = Good
  0–19  = Needs improvement
  < 0   = Critical
```

### Admin workflow
1. HR → Analytics → **Pulse Surveys** tab.
2. Click **New Survey** → set title, dates, hub target, questions.
3. Survey becomes visible to all staff (or target hub staff) during the active window.
4. View results in **Results & Analytics** tab — per-question bar charts + eNPS.
5. Click **Export** for any survey to download anonymous responses as XLSX.

### HRAnalytics integration
- The **HR Analytics** page now shows an **Engagement & Pulse Surveys** section:
  - eNPS KPI card with colour-coded category badge
  - Total responses / surveys / active surveys
  - 6-month engagement score trend chart

---

## 5. RLS Notes

| Table | insert | select | update | delete |
|---|---|---|---|---|
| `hr_open_enrollment_periods` | admin/hr only | all auth | admin/hr only | admin/hr only |
| `hr_pulse_surveys` | admin/hr only | all auth | admin/hr only | admin/hr only |
| `hr_pulse_responses` | all auth (anonymous) | admin/hr only | ❌ (no policy) | ❌ (no policy) |

---

## 6. Rollback

If you need to undo:
```sql
-- Remove new tables
drop table if exists hr_pulse_responses;
drop table if exists hr_pulse_surveys;
drop table if exists hr_open_enrollment_periods;

-- Remove columns added to hr_benefit_plans
alter table hr_benefit_plans
  drop column if exists plan_tier,
  drop column if exists coverage_type,
  drop column if exists effective_date,
  drop column if exists hub_id,
  drop column if exists max_dependents;

-- Remove columns added to hr_benefit_enrollments
alter table hr_benefit_enrollments
  drop column if exists effective_date,
  drop column if exists approved_by,
  drop column if exists approved_at,
  drop column if exists dependents_json,
  drop column if exists hub_id,
  drop column if exists enrollment_period_id;

-- Remove succession columns from positions
alter table positions
  drop column if exists is_critical_role,
  drop column if exists primary_successor_id,
  drop column if exists secondary_successor_id,
  drop column if exists successor_readiness,
  drop column if exists succession_notes;
```
