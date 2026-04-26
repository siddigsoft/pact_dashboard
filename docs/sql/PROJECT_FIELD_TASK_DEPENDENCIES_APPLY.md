# Apply: Project Field Task Dependencies (MS Project FS/SS/FF/SF)

**File:** `docs/sql/PROJECT_FIELD_TASK_DEPENDENCIES.sql`
**Standing rule:** all accounting / HR / task SQL is pasted **manually** by the
user in the pactdb Supabase SQL editor. No Drizzle, no `db:push`, no Replit
auto-push. Agent writes the SQL; user runs it.

## What this ships

Adds `public.project_field_task_dependencies`, a typed many-to-many table
that supersedes the legacy `project_field_tasks.dependencies uuid[]` column:

| Column            | Type    | Notes                                          |
|-------------------|---------|------------------------------------------------|
| `id`              | uuid    | PK, default `gen_random_uuid()`                |
| `project_id`      | text    | Matches `project_field_tasks.project_id` (which is text in pactdb). No separate FK to `projects` — cascade delete is already covered by the predecessor/successor FKs below. |
| `predecessor_id`  | uuid    | FK → `project_field_tasks.id`, cascade delete  |
| `successor_id`    | uuid    | FK → `project_field_tasks.id`, cascade delete  |
| `dep_type`        | text    | `FS` \| `SS` \| `FF` \| `SF` (default `FS`)    |
| `lag_days`        | int     | Lag (positive) or lead (negative). Default 0.  |
| `notes`           | text    | Optional admin note                            |
| `created_by`      | uuid    | FK → `profiles.id`                             |
| `created_at`      | tstz    | Default `now()`                                |

### Guards
1. **Same-project trigger** — blocks cross-project links.
2. **Cycle-detection trigger** — recursive CTE walks the predecessor graph
   and aborts with `check_violation` if the new edge would form a cycle.
3. **No self-reference** — `CHECK (predecessor_id <> successor_id)`.
4. **Unique pair** — `UNIQUE (predecessor_id, successor_id)`.

### RLS
- `SELECT`: any authenticated user (consistent with the app's existing
  exposure of dependency edges to all collaborators).
- `INSERT/UPDATE/DELETE`: gated by the existence of the parent
  `project_field_tasks` row, which is itself protected by its own RLS.

### Migration of legacy data
The script also runs a one-time `INSERT … SELECT … ON CONFLICT DO NOTHING`
that copies every entry from `project_field_tasks.dependencies` into the
new table as `dep_type='FS', lag_days=0`. The legacy column is **kept**
(not dropped) for backward-compat read paths.

## How to apply

1. Open the **pactdb** Supabase project → **SQL Editor** → **New query**.
2. Paste the entire contents of
   `docs/sql/PROJECT_FIELD_TASK_DEPENDENCIES.sql`.
3. Click **Run**. Expected result: `Success. No rows returned.` followed by
   the migration insert reporting however many legacy edges were copied.

## Smoke tests (run after apply)

```sql
-- 1) Table exists and is empty (or contains migrated rows)
SELECT count(*) FROM public.project_field_task_dependencies;

-- 2) RLS is on
SELECT relrowsecurity FROM pg_class
WHERE relname = 'project_field_task_dependencies';   -- expect: t

-- 3) Cycle guard works (replace IDs with two real tasks in the same project)
INSERT INTO public.project_field_task_dependencies (project_id, predecessor_id, successor_id)
VALUES ('<PROJECT_UUID>', '<TASK_A>', '<TASK_B>');

INSERT INTO public.project_field_task_dependencies (project_id, predecessor_id, successor_id)
VALUES ('<PROJECT_UUID>', '<TASK_B>', '<TASK_A>');
-- ↑ second insert MUST fail with: 'Adding this dependency would create a cycle…'

-- 4) Cross-project guard works (replace IDs with tasks from DIFFERENT projects)
INSERT INTO public.project_field_task_dependencies (project_id, predecessor_id, successor_id)
VALUES (gen_random_uuid(), '<TASK_PROJECT_X>', '<TASK_PROJECT_Y>');
-- ↑ MUST fail with: 'Cross-project dependencies are not allowed'
```

## Rollback

The rollback snippet is at the bottom of the SQL file. Note: rollback will
**not** restore data added directly to the new table; the legacy uuid[]
column remains untouched throughout.

## Frontend touch-points

After apply, the following client-side pieces light up automatically:
- `src/hooks/useTaskDependencies.ts` — typed read + mutate hook
- `src/components/project/ProjectFieldTasksPanel.tsx` — dependencies tab,
  detail dialog, and Gantt view all switch to typed edges, falling back to
  the legacy array when the new table is empty/unavailable.
