# Runbook: Project GL Analytic Dimension

## Purpose
Adds `project_id` to `acct_journal_lines` so every GL posting can be tagged to a project. This powers the **GL Journal Activity** section in `ProjectCostTab` — previously only visible via `source_id` lookup on journal entries; now also directly queryable per line.

## Migration file
`supabase/migrations/20260712_project_gl_dimension.sql`

## Steps to apply

1. Open the Supabase SQL editor for your project
2. Copy and paste the contents of `20260712_project_gl_dimension.sql`
3. Run the script
4. Verify with:
   ```sql
   SELECT COUNT(*) FROM acct_journal_lines WHERE project_id IS NOT NULL;
   ```
   (Rows > 0 means the backfill ran correctly for existing entries.)

## What it changes

| Object | Change |
|--------|--------|
| `acct_journal_lines.project_id` | New nullable UUID FK → `projects(id)` |
| `idx_acct_journal_lines_project_id` | Partial index for fast project filtering |
| Backfill UPDATE | Tags existing lines whose parent entry has `source_type IN ('project', 'project_cost', 'project_operational_cost')` |

## Impact on the UI

- `ProjectCostTab` → **GL Journal Activity** section now runs a second query (`acct_journal_lines WHERE project_id = ?`) in addition to the existing `source_id` lookup on journal entries.
- Both result sets are de-duplicated by `line.id` before display.
- The Phase 5 query is **graceful**: if `project_id` does not yet exist on the table, the query fails silently (caught via `allSettled`) and only the `source_id` path is shown.

## Posting new entries going forward

When creating journal entries through the GL Bridge Engine, pass `project_id` on each line. The `acct_journal_lines` insert payload should include:
```typescript
{ ...existingLineFields, project_id: projectId }
```

No schema change is needed in application code — the column is already in the DB after this migration. TypeScript types for `acct_journal_lines` may need a manual cast `as any` until Supabase type generation is re-run.
