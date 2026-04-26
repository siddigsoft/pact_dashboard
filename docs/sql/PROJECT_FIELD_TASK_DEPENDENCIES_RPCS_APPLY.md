# Apply: Typed Dependency RPCs (Item-6 follow-up #1)

**File:** `docs/sql/PROJECT_FIELD_TASK_DEPENDENCIES_RPCS.sql`
**Standing rule:** all task SQL is pasted **manually** by the user in the
pactdb Supabase SQL editor. No Drizzle, no `db:push`, no Replit auto-push.
Agent writes the SQL; user runs it.

**Prerequisite:** `docs/sql/PROJECT_FIELD_TASK_DEPENDENCIES.sql` already applied.

## What this ships

Tightens authorization on `project_field_task_dependencies` so that **only a
user who can UPDATE the successor task** may add or remove a dependency
edge that points at it. The previous policy (shipped with the table) only
required SELECT visibility on both endpoints, which is looser than the
intended planner UX.

| Object | Type | Auth |
|---|---|---|
| `can_write_project_field_task(uuid)` | SECURITY INVOKER helper | none |
| `upsert_project_field_task_dep(predecessor uuid, successor uuid, dep_type text DEFAULT 'FS', lag_days int DEFAULT 0, notes text DEFAULT NULL)` | SECURITY DEFINER | caller must pass the helper for `successor` |
| `delete_project_field_task_dep(predecessor uuid, successor uuid)` | SECURITY DEFINER | caller must pass the helper for `successor` |
| RLS policy `pftd_no_direct_writes` | deny-all writes | drops the previous loose policy |

The helper probes UPDATE permission via a **no-op self-update** on
`project_field_tasks.notes` (`SET notes = notes`). Any AFTER-UPDATE trigger
that respects zero-diff updates will not fire any side-effect. If your
`project_field_tasks` has an audit trigger that records EVERY update
regardless of column diff, swap to the savepoint-rolled-back probe shown in
the comment block at the bottom of the SQL file.

### Role-restore mechanic (why both RPCs are safe end-to-end)

Each RPC captures `current_user` at function start (the SECURITY DEFINER
owner — typically `postgres` in Supabase), runs the probe under
`SET LOCAL ROLE authenticated` so the project_field_tasks UPDATE RLS
policy actually applies to the end user, then restores the captured role
via `EXECUTE format('SET LOCAL ROLE %I', v_owner_role)` — **NOT**
`RESET ROLE`. `RESET ROLE` would revert to `session_user`, which under
PostgREST is the connection role `authenticator`, and the subsequent
`INSERT`/`DELETE` against `project_field_task_dependencies` would then
hit the deny-all-write RLS policy and fail.

## How to apply

1. Open the pactdb Supabase SQL editor.
2. Paste the **entire** contents of `docs/sql/PROJECT_FIELD_TASK_DEPENDENCIES_RPCS.sql`.
3. Run it. Expected: `COMMIT` with no errors.
4. Smoke-test (replace placeholders with real task IDs from the same project):

```sql
-- 1) Happy path — create then update an edge as a user who can write the successor
SELECT public.upsert_project_field_task_dep(
  '<TASK_A_UUID>',  -- predecessor
  '<TASK_B_UUID>',  -- successor (you must be able to UPDATE this task)
  'SS', 2, 'planning v1'
);
-- ↑ returns a uuid

SELECT public.upsert_project_field_task_dep(
  '<TASK_A_UUID>', '<TASK_B_UUID>', 'FS', 0, NULL
);
-- ↑ same pair → ON CONFLICT DO UPDATE rewrites the row, returns the SAME uuid

-- 2) Authorization rejection — ask another role to repeat (1)
--    EXPECT: ERROR: 42501 — Not authorized to add a dependency to task …

-- 3) Direct table write is denied
INSERT INTO public.project_field_task_dependencies
  (project_id, predecessor_id, successor_id)
VALUES ('<PROJECT_ID>', '<TASK_A_UUID>', '<TASK_C_UUID>');
-- ↑ EXPECT: new row violates row-level security policy

-- 4) Delete
SELECT public.delete_project_field_task_dep('<TASK_A_UUID>', '<TASK_B_UUID>');
-- ↑ returns true; second call returns false (already gone)
```

## Frontend touch-points

After apply, `src/hooks/useTaskDependencies.ts` will route both writes
through the RPCs automatically. No further redeploy beyond the next normal
build.

## Rollback

The rollback snippet is at the bottom of the SQL file. It restores the
loose "SELECT-both-endpoints" policy and drops the three new functions.
