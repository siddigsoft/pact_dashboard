# Apply: add `crm_opportunity_id` to `projects` + refresh project RPCs

**Date:** 2026-04-26
**File:** `supabase/migrations/20260409_crm_project_pipeline.sql`
**Severity:** High — blocks every project detail page (PostgREST schema-cache error)
**Depends on:** `crm_opportunities` table already exists in pactdb (it does — the CRM Opportunities page is live).

## Why

Opening any project (or anywhere a project insert/update runs) currently fails with:

> Could not find the 'crm_opportunity_id' column of 'projects' in the schema cache

The application code already reads and writes `projects.crm_opportunity_id` in:

- `src/utils/projectMapping.ts` (lines 20, 56)
- `src/context/project/projectQueries.ts` (lines 34, 140)
- `src/pages/CreateProject.tsx` (CRM-prefill flow, line 30+)
- `src/pages/PortfolioDashboard.tsx` (CRM link KPI, lines 51, 3223+)
- `src/pages/CRMOpportunities.tsx` (already-converted check, line 84)
- `src/components/project/ProjectDetail.tsx` (linked-opportunity sidecar, line 290)
- `src/context/project/ProjectContext.tsx` (line 151)

…but the column has never been added to pactdb. Until the migration is applied, every project read/write that touches the column is rejected by PostgREST.

## What this patch does

Idempotent — safe to re-run.

1. `ALTER TABLE projects ADD COLUMN IF NOT EXISTS crm_opportunity_id uuid REFERENCES crm_opportunities(id) ON DELETE SET NULL;`
2. `CREATE OR REPLACE FUNCTION public.get_all_projects()` — adds `crm_opportunity_id` to the projected columns.
3. `CREATE OR REPLACE FUNCTION public.get_projects_for_analytics()` — same.
4. Re-grants `EXECUTE` on both RPCs to `authenticated, anon`.

No data motion. No RLS change. No FK on existing rows (new column starts NULL).

## Apply

1. Open pactdb SQL editor (project `abznugnirnlrqnnfkein`).
2. Paste the entire contents of
   `supabase/migrations/20260409_crm_project_pipeline.sql`.
3. Run it. Expect:
   - `ALTER TABLE` (no row count)
   - two `CREATE FUNCTION` lines
   - two `GRANT` lines
4. Wait ~10 seconds for PostgREST to reload its schema cache, **or** force it immediately:
   ```sql
   NOTIFY pgrst, 'reload schema';
   ```

## Verify (run immediately after)

```sql
-- 1. Column exists with the right type and FK
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'projects'
  AND column_name  = 'crm_opportunity_id';
-- EXPECTED: 1 row, data_type = 'uuid', is_nullable = 'YES'

-- 2. FK to crm_opportunities is in place
SELECT conname, confrelid::regclass AS references_table, confdeltype
FROM pg_constraint
WHERE conrelid = 'public.projects'::regclass
  AND conname LIKE '%crm_opportunity%';
-- EXPECTED: 1 row, references_table = 'crm_opportunities', confdeltype = 'n' (SET NULL)

-- 3. RPCs return the new column
SELECT (get_all_projects()::jsonb -> 0) ? 'crm_opportunity_id' AS has_col;
-- EXPECTED: t
```

If row 3 returns `f` or errors, the RPC still has the old definition — re-run step 2.

## Smoke (UI)

1. Hard-refresh the app (Ctrl+Shift+R).
2. Open any existing project's detail page → the "Could not find the 'crm_opportunity_id' column" banner should be gone.
3. Open `/portfolio` → the **"Projects with CRM Link"** stat should render (will be `0` until you convert an opportunity).
4. Open `/crm/opportunities` → click **Convert to Project** on any opportunity → the new project should pre-fill the CRM link, and re-opening the opportunity should show it as already converted.

## Roll-back

Only if a downstream system breaks (extremely unlikely — column is nullable and additive):

```sql
-- Drops the column and the FK in one shot
ALTER TABLE projects DROP COLUMN IF EXISTS crm_opportunity_id;

-- Then re-create the RPCs WITHOUT crm_opportunity_id from the prior migration
-- (look up the older definition in git history before running).
```

This will re-introduce the schema-cache error on every page that references the column, so use only as an emergency unblock.

## After it ships

- Update `docs/STATUS_DASHBOARD.md` — add a row for
  `20260409_crm_project_pipeline.sql` under the applied-migrations section
  with today's date.
- Close any open bug reports referencing the
  *"Could not find the 'crm_opportunity_id' column"* error.
