---
name: SQL Migration Rule
description: Whenever a task requires a DB change, save the SQL as a migration file in supabase/migrations/ — permanent user preference.
---

# SQL Migration Rule

**Rule:** Any task that requires a database change must produce a SQL migration file saved to `supabase/migrations/`.

**Why:** The project uses Supabase (not Replit managed PostgreSQL). The user runs migrations manually in Supabase Studio → SQL Editor. Missing this step means DB changes never get applied.

**How to apply:**
- Correct folder: `supabase/migrations/`
- File naming: `YYYYMMDD_short_description.sql` (e.g. `20260815_retainer_payout_currency.sql`)
- Always include a header comment: what it does, date, "safe to re-run" note
- Always use `IF NOT EXISTS`, `CREATE OR REPLACE`, etc. so re-running is safe
- Never wait to be asked — produce the migration file as part of completing the task
- Remove any SQL files placed outside the correct folder
- This applies to: new columns, new tables, new views, new RLS policies, new functions, indexes, enum types, triggers, etc.
