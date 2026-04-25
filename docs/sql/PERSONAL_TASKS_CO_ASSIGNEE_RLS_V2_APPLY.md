# Manual Apply Runbook — Personal Tasks Co-Assignee RLS v2

**Bug:** Co-assignees see "Task not found" when they open `/tasks/<id>`.
**Reporter:** Mohamed Yo… (Employee), 2026-04-25.
**Reproducer URL:** `https://app.pactorg.com/tasks/1638de9c-dd0f-469a-9682-d6192b727379`
**File to paste:** `supabase/migrations/20260425_personal_tasks_co_assignee_rls_v2.sql`
**Target project:** `abznugnirnlrqnnfkein` (pactdb production) — **NOT** SuperApp.
**Standing rule:** raw SQL only, hand-paste into the pactdb SQL editor. NO Drizzle. NO `db:push`. NO Replit auto-push.

---

## Why this bug happens

`src/pages/TaskDetail.tsx` (lines 155-167) fetches the task with:

```ts
supabase.from('personal_tasks').select('*').eq('id', id).maybeSingle()
```

There is **no** `Task not found` branch in business logic — the only path
to that screen (line 862) is when the row comes back `null`. Therefore
the only thing that can make Mohamed see this is the row-level security
policy on `personal_tasks` denying him SELECT.

Two prior migrations on the same date both ship a SELECT policy:

| File | Predicate for co-assignees | Status |
|------|----------------------------|--------|
| `20260422_personal_tasks_assignee_rls.sql` | `co_assignees ? auth.uid()::text` | **broken** — `?` only matches top-level string elements or top-level object keys, never `[{id,…}]` array shapes |
| `20260422_personal_tasks_co_assignee_rls_fix.sql` | `co_assignees @> jsonb_build_array(jsonb_build_object('id', auth.uid()::text))` | correct, but type-strict — won't match if the stored id differs in type, casing, or whitespace |

Most likely cause: only the first was applied to pactdb, or the
containment check is missing on a row whose stored shape is slightly off.
Either way the v2 policy below is bulletproof.

---

## What v2 changes

* Drops **every** historical policy name on `personal_tasks` (idempotent).
* Re-enables RLS (no-op if already on).
* Recreates SELECT / UPDATE policies using the EXISTS form below — works
  for any stored shape because `->>` always coerces the value to text,
  and the `CASE` wrapper protects against `co_assignees` ever being a
  scalar / object / null (without the wrapper, `jsonb_array_elements`
  would throw `cannot extract elements from a scalar` and lock every
  user out of the affected row):

  ```sql
  EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(co_assignees) = 'array' THEN co_assignees
        ELSE '[]'::jsonb
      END
    ) AS elem
    WHERE (elem->>'id') = auth.uid()::text
  )
  ```
* Keeps INSERT (creator only) and DELETE (creator only). DELETE is
  intentionally **NOT** widened in this hot-patch — see the migration
  comment above the `personal_tasks_delete` policy and Step 4E below.
  The TaskDetail UI exposes Delete to admins and the primary assignee,
  but RLS denies them today (pre-existing gap, separately tracked in
  `STATUS_DASHBOARD.md` §5). Fixing that requires its own scoped
  migration and auth review — do **not** bundle it here.
* Re-asserts the GIN index on `co_assignees` (idempotent, used by the My
  Tasks list query in `usePersonalTasks.ts` line 621).

The migration body is wrapped in `BEGIN; … COMMIT;` so the policy swap
is atomic — no window where the table is unprotected.

---

## Apply procedure

### Step 1 — Snapshot the current policies (audit trail)

Open the **pactdb** SQL editor as `super_admin`, run:

```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'personal_tasks'
ORDER BY policyname;
```

Save the output as a comment in this runbook (paste below).
Today's snapshot: _<paste here on apply day>_

### Step 2 — Confirm the reported task actually has Mohamed as co-assignee

Still as `super_admin`:

```sql
SELECT id, full_name
FROM profiles
WHERE full_name ILIKE 'Mohamed%';
-- pick the UUID matching the user in the screenshot
```

Then:

```sql
SELECT id, user_id, assigned_to,
       jsonb_pretty(co_assignees) AS co
FROM public.personal_tasks
WHERE id = '1638de9c-dd0f-469a-9682-d6192b727379';
```

You must see Mohamed's uid in the `co` array. If not, RLS is **not** the
problem — fix the data first (re-add him as co-assignee from the task
edit form), then come back here.

### Step 3 — Apply the migration

Paste the **entire** body of
`supabase/migrations/20260425_personal_tasks_co_assignee_rls_v2.sql`
into the pactdb SQL editor and execute. Expected output:

* `BEGIN`
* `DROP POLICY` × 6 (some `NOTICE: policy ... does not exist, skipping` lines are OK and expected)
* `ALTER TABLE`
* `CREATE POLICY` × 4
* `CREATE INDEX` (or `NOTICE: relation already exists, skipping`)
* `COMMIT`

### Step 4 — Verify

**A. Policies are in place AND use the new predicate** (not just the right
names — also inspect the predicate text so you don't ship the broken
`?` operator by accident):

```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'personal_tasks'
ORDER BY policyname;
```

Expect exactly four rows:

| policyname | cmd |
|------------|-----|
| personal_tasks_delete | DELETE |
| personal_tasks_insert | INSERT |
| personal_tasks_select | SELECT |
| personal_tasks_update | UPDATE |

The `qual` column for SELECT and UPDATE **must** contain the substring
`jsonb_array_elements` AND `(elem->>'id')`. If you see `co_assignees ?`
or `co_assignees @>`, the migration did **not** apply — re-run Step 3.

**B. Mohamed can now SELECT the task.** In the pactdb SQL editor switch
"Run as user" to Mohamed's auth uid (top-right dropdown), then:

```sql
SELECT id, title FROM public.personal_tasks
WHERE id = '1638de9c-dd0f-469a-9682-d6192b727379';
```

Expect exactly **one** row. If you get zero, RLS is still denying — go
back to Step 2 and confirm the data shape.

**C. Mohamed can also UPDATE** (acknowledge). As Mohamed:

```sql
-- Dry run — wrapped in ROLLBACK so nothing is persisted.
BEGIN;
UPDATE public.personal_tasks
   SET updated_at = now()
 WHERE id = '1638de9c-dd0f-469a-9682-d6192b727379';
-- Expect: UPDATE 1
ROLLBACK;
```

**D. NEGATIVE check — a random user who is NOT owner / primary / co-assignee
must NOT see the row.** This is the regression guard against accidentally
loosening the policy. Pick any active employee profile that is not in
this task's `user_id`, `assigned_to`, or `co_assignees` (e.g. yourself
if you don't appear there). Switch "Run as user" to that uid and run:

```sql
SELECT id FROM public.personal_tasks
WHERE id = '1638de9c-dd0f-469a-9682-d6192b727379';
```

Expect **zero** rows. If you get one, the policy is too permissive —
ROLLBACK the migration immediately and ping the agent.

**E. (Optional — DO NOT regress on the known pre-existing gap.)**
The DELETE policy is intentionally unchanged from the prior baseline:
only the task creator (`user_id`) can delete. The TaskDetail UI
exposes Delete to admins and the primary assignee too, so those clicks
fail silently at the RLS layer today — that's a separate, pre-existing
bug, NOT a regression from this hot-patch. To prove this hot-patch did
not change DELETE behavior, as an admin who is NOT the creator of any
test task, run:

```sql
BEGIN;
DELETE FROM public.personal_tasks
 WHERE id = '<some-task-not-owned-by-this-admin>';
-- Expect: DELETE 0 (RLS denies — same as before this hot-patch).
ROLLBACK;
```

If you want to fix the admin/assignee delete gap, ask the agent for a
separate scoped migration — don't widen this one.

### Step 5 — Confirm in the UI

Ask Mohamed to hard-refresh `https://app.pactorg.com/tasks/1638de9c-dd0f-469a-9682-d6192b727379`.
He should see the full task detail, with the **Acknowledge** button on
the co-assignee panel.

### Step 6 — Update the dashboard

Flip the `personal_tasks_co_assignee_rls_v2` row in
`docs/STATUS_DASHBOARD.md` → BUGFIXES section to **APPLIED ✅** with the
date and your initials.

---

## Rollback

If something goes wrong, paste
`docs/sql/PERSONAL_TASKS_CO_ASSIGNEE_RLS_V2_ROLLBACK.sql`. It installs
the **containment-based baseline** from
`20260422_personal_tasks_co_assignee_rls_fix.sql` — i.e. it puts the
table into a known-good prior state, even if your live pre-v2 state was
the older `?`-operator policy. (This is on purpose — we never want to
revert into the genuinely broken `?` policy.)

**Note:** the containment baseline still has the original co-assignee
bug for any malformed row, so only roll back if v2 itself caused a
regression you can reproduce; do NOT roll back as a "go back to working"
step, because v2 IS the working step.
