-- ============================================================================
-- PREREQUISITE STUB — ensures fd_forms exists even when running this file alone
-- Safe no-op if core migration already ran (CREATE TABLE IF NOT EXISTS).
-- ============================================================================
DO $fd_prereq$ BEGIN
  CREATE TABLE IF NOT EXISTS field_data_forms (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EXCEPTION WHEN OTHERS THEN NULL; END $fd_prereq$;

DO $fd_prereq2$ BEGIN
  CREATE TABLE IF NOT EXISTS fd_forms (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
EXCEPTION WHEN OTHERS THEN NULL; END $fd_prereq2$;
-- ============================================================================

-- ============================================================================
-- Field Data Hub — Phase 15: Collaboration & Review Tools
-- Tables: fd_submission_comments, fd_submission_flags, fd_form_review_comments
-- ============================================================================

-- ── 1. Submission comment threads ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_submission_comments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   UUID        NOT NULL,   -- references fd_submissions(id)
  form_id         UUID        NOT NULL,   -- denormalized for quick filtering
  parent_id       UUID        REFERENCES fd_submission_comments(id) ON DELETE CASCADE,
  body            TEXT        NOT NULL,
  author_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name     TEXT        NOT NULL DEFAULT '',
  is_resolved     BOOLEAN     NOT NULL DEFAULT false,
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdsc_submission  ON fd_submission_comments(submission_id);
CREATE INDEX IF NOT EXISTS idx_fdsc_form        ON fd_submission_comments(form_id);
CREATE INDEX IF NOT EXISTS idx_fdsc_parent      ON fd_submission_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_fdsc_author      ON fd_submission_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_fdsc_resolved    ON fd_submission_comments(is_resolved);

-- ── 2. Submission flags ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_submission_flags (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   UUID        NOT NULL,
  form_id         UUID        NOT NULL,
  flag_type       TEXT        NOT NULL
                  CHECK (flag_type IN ('suspicious','needs_correction','priority','interesting')),
  flagged_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  flagged_by_name TEXT        NOT NULL DEFAULT '',
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdsf_submission  ON fd_submission_flags(submission_id);
CREATE INDEX IF NOT EXISTS idx_fdsf_form        ON fd_submission_flags(form_id);
CREATE INDEX IF NOT EXISTS idx_fdsf_type        ON fd_submission_flags(flag_type);

-- Prevent exact duplicate flags (same submission + same flag type from same user)
CREATE UNIQUE INDEX IF NOT EXISTS idx_fdsf_unique
  ON fd_submission_flags(submission_id, flag_type, flagged_by)
  WHERE flagged_by IS NOT NULL;

-- ── 3. Form draft review comments ────────────────────────────────────────────
-- Inline comments reviewers leave on specific form fields before publishing.
CREATE TABLE IF NOT EXISTS fd_form_review_comments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id         UUID        NOT NULL,
  field_key       TEXT        NOT NULL DEFAULT '',   -- empty = general/form-level comment
  body            TEXT        NOT NULL,
  reviewer_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_name   TEXT        NOT NULL DEFAULT '',
  is_resolved     BOOLEAN     NOT NULL DEFAULT false,
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  form_version    INTEGER,    -- snapshot of form version when comment was written
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fdfrc_form       ON fd_form_review_comments(form_id);
CREATE INDEX IF NOT EXISTS idx_fdfrc_field      ON fd_form_review_comments(form_id, field_key);
CREATE INDEX IF NOT EXISTS idx_fdfrc_resolved   ON fd_form_review_comments(is_resolved);
CREATE INDEX IF NOT EXISTS idx_fdfrc_reviewer   ON fd_form_review_comments(reviewer_id);

-- ── 4. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE fd_submission_comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_submission_flags     ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_form_review_comments ENABLE ROW LEVEL SECURITY;

-- Roles with FDH access
-- (mirrors fd_forms / fd_submissions RLS pattern)
DROP POLICY IF EXISTS "fdsc_read" ON fd_submission_comments;
CREATE POLICY "fdsc_read"  ON fd_submission_comments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','admin','ict','fom','data_team','coordinator','supervisor','project_manager','country_director')
    )
  );

DROP POLICY IF EXISTS "fdsc_insert" ON fd_submission_comments;
CREATE POLICY "fdsc_insert" ON fd_submission_comments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','admin','ict','fom','data_team','coordinator','supervisor','project_manager','country_director')
    )
  );

DROP POLICY IF EXISTS "fdsc_update" ON fd_submission_comments;
CREATE POLICY "fdsc_update" ON fd_submission_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','admin','fom','data_team')
    )
  );

-- Flags
DROP POLICY IF EXISTS "fdsf_read" ON fd_submission_flags;
CREATE POLICY "fdsf_read"  ON fd_submission_flags FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','admin','ict','fom','data_team','coordinator','supervisor','project_manager','country_director')
    )
  );

DROP POLICY IF EXISTS "fdsf_insert" ON fd_submission_flags;
CREATE POLICY "fdsf_insert" ON fd_submission_flags FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','admin','ict','fom','data_team','coordinator','supervisor','project_manager','country_director')
    )
  );

DROP POLICY IF EXISTS "fdsf_delete" ON fd_submission_flags;
CREATE POLICY "fdsf_delete" ON fd_submission_flags FOR DELETE TO authenticated
  USING (
    flagged_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','admin','fom','data_team')
    )
  );

-- Form review comments
DROP POLICY IF EXISTS "fdfrc_read" ON fd_form_review_comments;
CREATE POLICY "fdfrc_read"  ON fd_form_review_comments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','admin','ict','fom','data_team','coordinator','supervisor','project_manager','country_director')
    )
  );

DROP POLICY IF EXISTS "fdfrc_insert" ON fd_form_review_comments;
CREATE POLICY "fdfrc_insert" ON fd_form_review_comments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','admin','ict','fom','data_team','coordinator','supervisor','project_manager','country_director')
    )
  );

DROP POLICY IF EXISTS "fdfrc_update" ON fd_form_review_comments;
CREATE POLICY "fdfrc_update" ON fd_form_review_comments FOR UPDATE TO authenticated
  USING (
    reviewer_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','admin','fom','data_team')
    )
  );

-- ── 5. updated_at trigger (shared helper function assumed present) ─────────────
CREATE OR REPLACE FUNCTION fd_collab_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_fdsc_updated_at
  BEFORE UPDATE ON fd_submission_comments
  FOR EACH ROW EXECUTE FUNCTION fd_collab_set_updated_at();

CREATE OR REPLACE TRIGGER trg_fdfrc_updated_at
  BEFORE UPDATE ON fd_form_review_comments
  FOR EACH ROW EXECUTE FUNCTION fd_collab_set_updated_at();

-- ── 6. Helpful view: open review comment counts per form ──────────────────────
CREATE OR REPLACE VIEW fd_form_review_summary AS
SELECT
  form_id,
  COUNT(*)                                          AS total_comments,
  COUNT(*) FILTER (WHERE NOT is_resolved)           AS open_comments,
  COUNT(*) FILTER (WHERE is_resolved)               AS resolved_comments,
  COUNT(DISTINCT field_key)                         AS fields_with_comments,
  MAX(created_at)                                   AS last_comment_at
FROM fd_form_review_comments
GROUP BY form_id;

-- ============================================================================
-- Phase 15 migration complete.
-- Run this SQL in the Supabase SQL Editor.
-- Tables: fd_submission_comments, fd_submission_flags, fd_form_review_comments
-- View:   fd_form_review_summary
-- ============================================================================
