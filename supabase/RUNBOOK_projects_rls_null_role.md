# Runbook: projects RLS — null/missing profile role verification

**Related migration:** `supabase/migrations/20260807_projects_rls_member_visibility.sql`

## Background

The `projects_select` policy uses two EXISTS subqueries against `profiles.role`.
Two edge cases can occur before a user's profile is fully set up:

| Case | Description | Expected result |
|------|-------------|-----------------|
| A | Profile row exists but `role` IS NULL | Denied — `NULL NOT IN (...)` and `NULL IN (...)` both evaluate to `NULL`, which Postgres treats as `FALSE`. Neither EXISTS returns a row. |
| B | Profile row is missing entirely (auth user but no `profiles` row) | Denied — both EXISTS subqueries find no matching row and return `false`. |

Both outcomes are intentional. The policy is **deny-by-default** until a role
is explicitly assigned and the profile row exists.

---

## Manual SQL verification (run in Supabase SQL Editor as `service_role`)

### 1 — Confirm NULL NOT IN behaviour (Case A)

```sql
-- NULL NOT IN a set always yields NULL (unknown), not TRUE.
-- Postgres USING clause treats NULL as FALSE → row is hidden.
SELECT
  NULL NOT IN ('employee', 'fom', 'countryDirector', 'hr') AS null_not_in_result,
  -- Expected: NULL
  NULL IN ('employee', 'fom', 'countryDirector', 'hr')     AS null_in_result;
  -- Expected: NULL
```

Both columns must return `NULL`.  If either returns `TRUE`, the policy would
incorrectly grant access to null-role users.

---

### 2 — Simulate a null-role user (Case A)

```sql
-- Replace <test_user_id> with a real auth.users UUID that has a profile row.
-- Temporarily set role to NULL (restore immediately after testing).

BEGIN;

UPDATE profiles SET role = NULL WHERE id = '<test_user_id>';

-- Check how many projects the policy would reveal (should be 0).
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "<test_user_id>"}';

SELECT count(*) AS visible_projects          -- Expected: 0
FROM projects
WHERE (
  EXISTS (
    SELECT 1 FROM profiles pr
    WHERE pr.id = '<test_user_id>'::uuid
      AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
  )
  OR (
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = '<test_user_id>'::uuid
        AND pr.role IN ('employee', 'fom', 'countryDirector', 'hr')
    )
    AND (
      (projects.team->>'projectManagerId') = '<test_user_id>'
      OR projects.team->'teamComposition' @> jsonb_build_array(
           jsonb_build_object('userId', '<test_user_id>')
         )
      OR EXISTS (
        SELECT 1 FROM project_team_members ptm
        WHERE ptm.project_id = projects.id
          AND ptm.user_id    = '<test_user_id>'::uuid
          AND ptm.is_active  = TRUE
      )
    )
  )
);

ROLLBACK; -- Never commit — this is a test only.
```

Expected: `visible_projects = 0`.

---

### 3 — Simulate a missing profile row (Case B)

```sql
-- Replace <ghost_user_id> with a UUID that exists in auth.users
-- but has NO row in profiles.

SELECT count(*) AS visible_projects          -- Expected: 0
FROM projects
WHERE (
  EXISTS (
    SELECT 1 FROM profiles pr
    WHERE pr.id = '<ghost_user_id>'::uuid
      AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
  )
  OR (
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = '<ghost_user_id>'::uuid
        AND pr.role IN ('employee', 'fom', 'countryDirector', 'hr')
    )
    AND (
      (projects.team->>'projectManagerId') = '<ghost_user_id>'
      OR projects.team->'teamComposition' @> jsonb_build_array(
           jsonb_build_object('userId', '<ghost_user_id>')
         )
      OR EXISTS (
        SELECT 1 FROM project_team_members ptm
        WHERE ptm.project_id = projects.id
          AND ptm.user_id    = '<ghost_user_id>'::uuid
          AND ptm.is_active  = TRUE
      )
    )
  )
);
```

Expected: `visible_projects = 0`.

---

### 4 — Smoke test: privileged role still sees all projects

```sql
-- Replace <admin_user_id> with a UUID whose profiles.role = 'admin'
-- (or any role NOT in the restricted list).

SELECT count(*) AS visible_projects          -- Expected: total project count
FROM projects
WHERE EXISTS (
  SELECT 1 FROM profiles pr
  WHERE pr.id = '<admin_user_id>'::uuid
    AND pr.role NOT IN ('employee', 'fom', 'countryDirector', 'hr')
);
```

---

## Resolution steps if a null-role user accidentally gains access

1. Confirm via query 2 above that `visible_projects > 0` after reproducing.
2. Check whether a Postgres version update changed `NULL IN (...)` semantics
   (unlikely — this is ANSI SQL and stable in all supported PG versions).
3. If the policy has been recreated without the `EXISTS` pattern (e.g. using
   a direct column reference), re-apply the migration.
4. Assign a role to the user in `profiles` so they re-enter a known state.

---

## Administrative notes

- **Assign roles promptly.** After creating a user in `auth.users`, ensure the
  `profiles` row is created (typically via an `on_auth_user_created` trigger)
  and a role is assigned before telling the user to log in.
- **Profile trigger.** If the trigger is missing or failed, a profile row will
  not exist and the user sees nothing — correct but confusing. Check
  `supabase/functions/` or your auth hook for the trigger definition.
