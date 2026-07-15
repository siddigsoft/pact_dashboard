-- Performance Reviews 360° Enhancement
-- Adds self-assessment, peer feedback, and calibration support.
-- Safe to re-run: guarded with IF NOT EXISTS / DROP+CREATE for RLS.
--
-- Apply manually in the Supabase SQL editor for the PACT production project.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.  Add 360° columns to existing performance_reviews table
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE performance_reviews
  ADD COLUMN IF NOT EXISTS self_assessment_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS peer_feedback_enabled  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cycle_phase            text    NOT NULL DEFAULT 'manager_review';

-- Allowed phases: not_started | self_assessment | peer_feedback | manager_review | calibration | published
-- 'published' replaces status='completed' for the cycle flow.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.  Self-assessments
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_review_self_assessments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id     uuid NOT NULL REFERENCES performance_reviews(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ratings       jsonb NOT NULL DEFAULT '{}',
  comments      text,
  submitted_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_hr_review_sa_review ON hr_review_self_assessments(review_id);
CREATE INDEX IF NOT EXISTS idx_hr_review_sa_user   ON hr_review_self_assessments(user_id);

ALTER TABLE hr_review_self_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_review_sa_own_rw ON hr_review_self_assessments;
CREATE POLICY hr_review_sa_own_rw ON hr_review_self_assessments
  FOR ALL
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'hr', 'hr_admin', 'manager')
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'hr', 'hr_admin', 'manager')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.  Peer nominations & feedback
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_review_peer_nominations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id    uuid NOT NULL REFERENCES performance_reviews(id) ON DELETE CASCADE,
  reviewee_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nominee_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  approved     boolean,                        -- NULL=pending, true=approved, false=rejected
  feedback     jsonb,                          -- { competency_id: { rating: n, comment: "..." } }
  submitted_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, reviewee_id, nominee_id)
);

CREATE INDEX IF NOT EXISTS idx_hr_review_pn_review   ON hr_review_peer_nominations(review_id);
CREATE INDEX IF NOT EXISTS idx_hr_review_pn_reviewee ON hr_review_peer_nominations(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_hr_review_pn_nominee  ON hr_review_peer_nominations(nominee_id);

ALTER TABLE hr_review_peer_nominations ENABLE ROW LEVEL SECURITY;

-- Reviewee can nominate peers (INSERT own rows); nominee can submit feedback (UPDATE own rows);
-- HR/admin can do everything.
DROP POLICY IF EXISTS hr_review_pn_reviewee_insert ON hr_review_peer_nominations;
CREATE POLICY hr_review_pn_reviewee_insert ON hr_review_peer_nominations
  FOR INSERT WITH CHECK (
    reviewee_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'hr', 'hr_admin', 'manager')
    )
  );

DROP POLICY IF EXISTS hr_review_pn_select ON hr_review_peer_nominations;
CREATE POLICY hr_review_pn_select ON hr_review_peer_nominations
  FOR SELECT USING (
    reviewee_id = auth.uid()
    OR nominee_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'hr', 'hr_admin', 'manager')
    )
  );

DROP POLICY IF EXISTS hr_review_pn_update ON hr_review_peer_nominations;
CREATE POLICY hr_review_pn_update ON hr_review_peer_nominations
  FOR UPDATE USING (
    nominee_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'hr', 'hr_admin', 'manager')
    )
  );

DROP POLICY IF EXISTS hr_review_pn_delete ON hr_review_peer_nominations;
CREATE POLICY hr_review_pn_delete ON hr_review_peer_nominations
  FOR DELETE USING (
    reviewee_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'hr', 'hr_admin', 'manager')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.  Calibration adjustments
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_review_calibration_adjustments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id         uuid NOT NULL REFERENCES performance_reviews(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  original_score    numeric(4,2) NOT NULL,
  adjusted_score    numeric(4,2) NOT NULL,
  adjustment_reason text,
  adjusted_by       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  adjusted_at       timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_hr_review_cal_review ON hr_review_calibration_adjustments(review_id);

ALTER TABLE hr_review_calibration_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_review_cal_admin_all ON hr_review_calibration_adjustments;
CREATE POLICY hr_review_cal_admin_all ON hr_review_calibration_adjustments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'hr', 'hr_admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'hr', 'hr_admin', 'manager')
    )
  );

DROP POLICY IF EXISTS hr_review_cal_select_own ON hr_review_calibration_adjustments;
CREATE POLICY hr_review_cal_select_own ON hr_review_calibration_adjustments
  FOR SELECT USING (user_id = auth.uid());
