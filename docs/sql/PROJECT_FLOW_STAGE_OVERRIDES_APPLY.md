# Project Flow Stage Overrides — Manual Apply

**File:** `docs/sql/PROJECT_FLOW_STAGE_OVERRIDES.sql`
**Target DB:** pactdb (Supabase SQL editor)
**Standing rule:** all accounting / HR / project-flow SQL is pasted manually
by the user. Do **not** run via Drizzle, `db:push`, or any auto-push.

## What this changes

1. **New table `project_flow_stage_overrides`** with the columns:
   - `project_type` + `stage_id` (unique together) — match by these.
   - Bilingual override fields: `label_en`, `label_ar`, `description_en`,
     `description_ar`, `key_outputs_en[]`, `key_outputs_ar[]`.
   - `typical_duration_days` (nullable override) and `is_disabled` (skip this
     stage in the UI).
   - `notes` for internal admin notes about why the override exists.
   - `created_by` / `updated_by` / `created_at` / `updated_at` audit columns
     (auto-touched by trigger).
   - `CHECK` constraint keeps `typical_duration_days >= 0`.

2. **Trigger `trg_touch_project_flow_stage_overrides`** auto-bumps
   `updated_at` on every UPDATE.

3. **RLS** policies: every authenticated user can SELECT (the merged flow
   needs to be readable by all teammates). Only `admin` / `super_admin`
   can INSERT / UPDATE / DELETE.

## How to apply

1. Open the **pactdb** project in Supabase Studio → SQL editor.
2. Paste the entire content of `PROJECT_FLOW_STAGE_OVERRIDES.sql`.
3. Run.
4. Verify:
   ```sql
   SELECT relname FROM pg_class
    WHERE relname = 'project_flow_stage_overrides';

   SELECT trigger_name FROM information_schema.triggers
    WHERE event_object_table = 'project_flow_stage_overrides';

   SELECT polname FROM pg_policy
    WHERE polrelid = 'public.project_flow_stage_overrides'::regclass;
   ```
   You should see the table, one trigger, and two policies.

## How to test from the UI

1. Sign in as an admin or super_admin.
2. Open `/admin/project-flow-stages` (linked from Settings sidebar group).
3. Pick a project type (e.g. "Third Party Monitoring").
4. Edit a stage's label or duration. The change appears immediately on any
   project of that type viewed from the Flow tab.
5. Tick "Disabled" on a stage; it greys out on the stage strip and is
   skipped by the next-stage advancement logic.

## Rollback

Run the rollback `BEGIN ... COMMIT;` block at the bottom of the SQL file
(drops the trigger, function, and table — overrides are deleted, the
hard-coded defaults take over again).
