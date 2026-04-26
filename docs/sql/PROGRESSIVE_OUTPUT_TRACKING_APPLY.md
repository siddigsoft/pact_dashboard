# Progressive Output Tracking — Manual Apply

**File:** `docs/sql/PROGRESSIVE_OUTPUT_TRACKING.sql`
**Target DB:** pactdb (Supabase SQL editor)
**Standing rule:** all accounting / HR / task SQL is pasted manually by the
user. Do **not** run via Drizzle, `db:push`, or any auto-push.

## What this changes

1. **`task_assignee_elements`** gets three new optional columns:
   - `target_value NUMERIC(12,2)` — e.g. `100` for "100 surveys".
   - `current_value NUMERIC(12,2) DEFAULT 0` — running progress toward target.
   - `unit TEXT` — display label (e.g. `surveys`, `sites`, `%`).
   - All nullable. When `target_value IS NULL`, the element behaves
     exactly as before (binary done / not-done).
   - A `CHECK` constraint keeps `current_value` in `[0..target_value]`.

2. **New table `task_element_progress_log`** — audit trail of every
   `current_value` update (`element_id`, `task_id`, `value`, `note`,
   `updated_by`, `updated_at`). RLS lets the task creator, primary
   assignee, the element owner, and any co-assignee read it.

3. **New RPC `update_task_element_progress(element_id, value, note)`** —
   the only path the UI uses to change `current_value`. It validates
   the range, flips `done` / `done_at` automatically when the target is
   reached or undone, and writes a log row in one transaction.

## How to apply

1. Open the **pactdb** project in Supabase Studio → SQL editor.
2. Paste the entire content of `PROGRESSIVE_OUTPUT_TRACKING.sql`.
3. Run.
4. Verify:
   ```sql
   SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_name = 'task_assignee_elements'
     AND column_name IN ('target_value', 'current_value', 'unit');

   SELECT proname FROM pg_proc WHERE proname = 'update_task_element_progress';

   SELECT relname FROM pg_class WHERE relname = 'task_element_progress_log';
   ```
   You should see all three column rows, the function name, and the table.

## How to test from the UI

1. Open any task at `/tasks/<task-id>` where you are the creator.
2. Add an element via "Assignees & Elements". After it's created, click
   the new **target** chip to set, e.g., target `5`, unit `sites`.
3. The element row will show a small numeric input + progress bar. Bump
   it from 0 → 5; the element should auto-mark done at 5.
4. The header progress bar weighs quantitative elements by completion %
   instead of binary done count.

## Rollback

Run the `BEGIN ... COMMIT;` block at the bottom of the SQL file (it
drops the RPC, the log table, the constraint, and all three columns).
