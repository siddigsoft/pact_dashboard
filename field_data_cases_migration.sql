-- ============================================================================
-- Field Data Hub — Phase 11: Case Management
-- Run in Supabase SQL Editor (safe to re-run: uses IF NOT EXISTS)
-- ============================================================================

-- ─── 1. Case Registry ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_cases (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id          UUID,             -- REFERENCES field_data_forms(id) ON DELETE SET NULL
  case_ref         TEXT NOT NULL,    -- human-readable reference, e.g. CASE-00142
  case_type        TEXT,             -- Household / Health / Protection / Nutrition / etc.
  subject_name     TEXT,             -- name of individual/household/unit
  subject_id       TEXT,             -- unique ID from the linked form (e.g. HH-00142)
  assignee_name    TEXT,             -- responsible staff member name
  status           TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','active','follow_up','closed','rejected')),
  priority         TEXT NOT NULL DEFAULT 'medium'
                   CHECK (priority IN ('low','medium','high','urgent')),
  opened_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at        TIMESTAMPTZ,
  last_contact_at  TIMESTAMPTZ,
  metadata         JSONB NOT NULL DEFAULT '{}',  -- arbitrary key/value pairs from form
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Guard: add status if table already existed without it
ALTER TABLE fd_cases ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open';
ALTER TABLE fd_cases ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';

CREATE INDEX IF NOT EXISTS idx_fd_cases_form     ON fd_cases(form_id);
CREATE INDEX IF NOT EXISTS idx_fd_cases_status   ON fd_cases(status);
CREATE INDEX IF NOT EXISTS idx_fd_cases_subject  ON fd_cases(subject_id);
CREATE INDEX IF NOT EXISTS idx_fd_cases_ref      ON fd_cases(case_ref);

-- ─── 2. Case Visits ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_case_visits (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          UUID NOT NULL REFERENCES fd_cases(id) ON DELETE CASCADE,
  scheduled_date   DATE NOT NULL,
  scheduled_time   TIME,
  enumerator_name  TEXT,
  location         TEXT,
  status           TEXT NOT NULL DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled','attempted','completed','not_found','refused','rescheduled')),
  outcome_notes    TEXT,
  rescheduled_to   DATE,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Guard: add status if table already existed without it
ALTER TABLE fd_case_visits ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'scheduled';

CREATE INDEX IF NOT EXISTS idx_fd_visits_case   ON fd_case_visits(case_id);
CREATE INDEX IF NOT EXISTS idx_fd_visits_date   ON fd_case_visits(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_fd_visits_status ON fd_case_visits(status);

-- ─── 3. Case Notes ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fd_case_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     UUID NOT NULL REFERENCES fd_cases(id) ON DELETE CASCADE,
  note_text   TEXT NOT NULL,
  author_name TEXT,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fd_notes_case ON fd_case_notes(case_id);
CREATE INDEX IF NOT EXISTS idx_fd_notes_time ON fd_case_notes(created_at DESC);

-- ─── 4. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE fd_cases       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_case_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_case_notes  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "fd_cases_access"       ON fd_cases;
  DROP POLICY IF EXISTS "fd_case_visits_access" ON fd_case_visits;
  DROP POLICY IF EXISTS "fd_case_notes_access"  ON fd_case_notes;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "fd_cases_access" ON fd_cases FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin','financial_admin',
      'ict','fom','data_team','projectmanager','project_manager','countrydirector','country_director')));

CREATE POLICY "fd_case_visits_access" ON fd_case_visits FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin','financial_admin',
      'ict','fom','data_team','projectmanager','project_manager','countrydirector','country_director')));

CREATE POLICY "fd_case_notes_access" ON fd_case_notes FOR ALL
  USING ( EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND LOWER(role) IN ('super_admin','superadmin','admin','financialadmin','financial_admin',
      'ict','fom','data_team','projectmanager','project_manager','countrydirector','country_director')));

NOTIFY pgrst, 'reload schema';

-- ─── 5. Auto-close visits on case close (optional trigger) ───────────────────
/*
CREATE OR REPLACE FUNCTION fd_case_close_cascade()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('closed','rejected') AND OLD.status NOT IN ('closed','rejected') THEN
    UPDATE fd_case_visits
    SET status = 'rescheduled', outcome_notes = 'Case closed — visit cancelled'
    WHERE case_id = NEW.id AND status = 'scheduled';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_fd_case_close
  AFTER UPDATE ON fd_cases
  FOR EACH ROW EXECUTE FUNCTION fd_case_close_cascade();
*/

-- ─── 6. Useful views ─────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW fd_case_summary AS
SELECT
  c.id,
  c.case_ref,
  c.case_type,
  c.subject_name,
  c.subject_id,
  c.status,
  c.priority,
  c.assignee_name,
  c.opened_at,
  c.closed_at,
  c.form_id,
  COUNT(DISTINCT v.id)                             AS visit_count,
  COUNT(DISTINCT v.id) FILTER (WHERE v.status = 'completed') AS completed_visits,
  COUNT(DISTINCT n.id)                             AS note_count,
  MAX(n.created_at)                                AS last_note_at,
  MAX(v.scheduled_date)                            AS next_visit_date
FROM fd_cases c
LEFT JOIN fd_case_visits v ON v.case_id = c.id
LEFT JOIN fd_case_notes  n ON n.case_id = c.id
GROUP BY c.id;

-- ============================================================================
-- Migration complete. Open /field-data/cases in the app to get started.
-- ============================================================================
