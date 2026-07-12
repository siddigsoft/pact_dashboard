-- Phase 5: GL Analytic Dimension — project_id on acct_journal_lines
-- This allows tagging every journal line with a project for project-level GL reporting.
-- Run this migration manually via Supabase SQL editor or CLI.

-- 1. Add project_id column to journal lines (nullable FK to projects)
ALTER TABLE acct_journal_lines
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- 2. Index for fast filtering by project
CREATE INDEX IF NOT EXISTS idx_acct_journal_lines_project_id
  ON acct_journal_lines(project_id)
  WHERE project_id IS NOT NULL;

-- 3. Backfill: copy project_id from journal entries where source_type indicates a project
--    This tags all existing lines that were posted from a project source.
UPDATE acct_journal_lines jl
SET project_id = je.source_id
FROM acct_journal_entries je
WHERE jl.entry_id = je.id
  AND je.source_type IN ('project', 'project_cost', 'project_operational_cost')
  AND jl.project_id IS NULL
  AND je.source_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM projects p WHERE p.id = je.source_id);

-- 4. RLS: allow authenticated users to read lines filtered by project
--    (inherits from the parent journal entry policy — no separate policy needed
--     if row-level policies already cover acct_journal_lines based on entry access)

-- Done. Verify with:
-- SELECT count(*) FROM acct_journal_lines WHERE project_id IS NOT NULL;
