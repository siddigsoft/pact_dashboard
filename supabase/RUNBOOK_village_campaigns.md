# Village Campaigns — Database Migration Runbook

## Overview

This runbook applies the two migration files that bring the Village Campaigns
feature live in Supabase. Until these are applied, all Village Campaigns tab
queries return "relation does not exist" errors.

---

## Step 1 — Apply the base schema migration

Open **Supabase Dashboard → SQL Editor → New query**, paste the contents of:

```
supabase/migrations/20260812_village_campaigns.sql
```

Click **Run**. This creates:

| Table | Purpose |
|---|---|
| `adhoc_campaigns` | Campaign container (name, state, dates, personnel) |
| `adhoc_villages` | Villages within a campaign with HH targets |
| `adhoc_teams` | Global team registry (reusable across campaigns) |
| `adhoc_village_teams` | Assignment: which team covers which village |
| `adhoc_daily_logs` | Daily HH progress per team-village assignment |
| `adhoc_daily_log_photos` | Photo evidence attached to a daily log |

Also creates:
- Indexes on all foreign keys and `report_date`
- `update_adhoc_updated_at()` trigger function and triggers on campaigns/villages/teams
- RLS enabled on all 6 tables with initial open-read / open-write policies

---

## Step 2 — Apply the RLS hardening patch

In a **new** SQL Editor query, paste the contents of:

```
supabase/migrations/20260813_village_campaigns_rls_patch.sql
```

Click **Run**. This replaces the permissive write-all policies with:

- **`is_village_campaign_admin()`** SECURITY DEFINER helper — normalises role
  strings so all known Admin/FOM/Supervisor/Coordinator/ICT/DataTeam variants
  are treated as managers.
- **`adhoc_daily_logs`** — splits into explicit INSERT / UPDATE / DELETE:
  - INSERT/UPDATE: team lead whose `auth.uid()` matches the assignment's
    `adhoc_teams.team_lead_id`, with full FK-consistency check on
    `assignment_id / team_id / campaign_id / village_id`.
  - DELETE: ops/admin only — team leads cannot delete log rows.
- **`adhoc_village_teams`, `adhoc_campaigns`, `adhoc_villages`, `adhoc_teams`** —
  writes restricted to ops/admin roles via `is_village_campaign_admin()`.

---

## Step 3 — Verify the tables exist

Run in SQL Editor:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'adhoc_campaigns','adhoc_villages','adhoc_teams',
    'adhoc_village_teams','adhoc_daily_logs','adhoc_daily_log_photos'
  )
ORDER BY table_name;
```

Expected: **6 rows**, one per table name.

```sql
-- Verify RLS helper exists
SELECT proname FROM pg_proc WHERE proname = 'is_village_campaign_admin';
-- Expected: 1 row

-- Verify hardened policies on daily logs
SELECT policyname FROM pg_policies
WHERE tablename = 'adhoc_daily_logs'
ORDER BY policyname;
-- Expected: adhoc_daily_logs_delete, adhoc_daily_logs_insert,
--           adhoc_daily_logs_read, adhoc_daily_logs_update
```

---

## Step 4 — Smoke-test end-to-end

1. Open the app → **MMP Management → Village Campaigns** tab.
2. Create a campaign (any name, status = active).
3. Add a village (any name, HH target = 10).
4. Register a team via **Team Registry** → **Create Team**.
5. Assign the team to the village.
6. Open the **Daily Logs** tab → **Daily Log** → submit a log entry.
7. Confirm the log appears in the table with correct values.

If any of these steps return an error, paste the browser console error here and
re-check that both migration files were applied without errors in SQL Editor.

---

## Step 5 — Fix mmp_site_entries nullable mmp_file_id (required)

Village campaign site entries do not belong to an MMP file, so `mmp_file_id`
must be allowed to be NULL. Run this migration **after** Step 3:

```
supabase/migrations/20260814_mmp_site_entries_nullable_mmp_file_id.sql
```

This migration:
1. Drops the `NOT NULL` constraint on `mmp_site_entries.mmp_file_id`.
2. Re-runs the backfill — any village-team assignments that failed earlier
   (with error 23502) will now get their `site_entry_id` correctly.

**Without this step** the dispatch flow (creating site entries for campaign
villages) will fail with:
```
ERROR: 23502: null value in column "mmp_file_id" ... violates not-null constraint
```

---

## Notes

- The `site-visit-photos` storage bucket (used by regular site visits) is
  reused for Village Campaigns photo uploads under the
  `village-campaign-logs/{log_id}/` prefix — no new bucket needed.
- The `adhoc_village_teams.site_entry_id` column references `mmp_site_entries`
  as a bridge for the fee / dispatch / payment-tracking flow. It is set when a
  village-team assignment is saved and requires `mmp_file_id` to be nullable
  (applied by Step 5 above).
