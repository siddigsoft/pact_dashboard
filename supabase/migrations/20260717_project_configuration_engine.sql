-- ============================================================
-- PROJECT CONFIGURATION ENGINE — FULL SCHEMA
-- Date: 2026-07-17
-- Safe: all changes are additive. Nothing existing is modified.
-- WFP TPM and all current data are completely unaffected.
-- ============================================================


-- ============================================================
-- STEP 1: CLEAN SLATE
-- Drop new tables only — nothing existing is touched
-- ============================================================

DROP TABLE IF EXISTS project_activity_feed        CASCADE;
DROP TABLE IF EXISTS project_activity_types       CASCADE;
DROP TABLE IF EXISTS project_budget_rules         CASCADE;
DROP TABLE IF EXISTS project_approval_stages      CASCADE;
DROP TABLE IF EXISTS project_approval_chains      CASCADE;
DROP TABLE IF EXISTS project_activity_assignments CASCADE;
DROP TABLE IF EXISTS project_team_members         CASCADE;
DROP TABLE IF EXISTS project_activities           CASCADE;


-- ============================================================
-- STEP 2: CREATE NEW TABLES
-- ============================================================

-- 2a. Project Activities
CREATE TABLE project_activities (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id             UUID REFERENCES projects(id) ON DELETE CASCADE,
  title                  TEXT NOT NULL,
  activity_type          TEXT NOT NULL DEFAULT 'field_assessment',
  custom_type_label      TEXT,
  description            TEXT,
  location_state         TEXT,
  location_hub           TEXT,
  location_locality      TEXT,
  coordinates            JSONB,
  start_date             DATE,
  end_date               DATE,
  status                 TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','assigned','in_progress','completed','cancelled')),
  advance_allowed        BOOLEAN DEFAULT TRUE,
  max_advance_per_person NUMERIC(15,2),
  notes                  TEXT,
  created_by             UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_proj_activities_project ON project_activities(project_id);
CREATE INDEX idx_proj_activities_status  ON project_activities(status);
CREATE INDEX idx_proj_activities_dates   ON project_activities(start_date, end_date);
CREATE INDEX idx_proj_activities_geo     ON project_activities(location_hub, location_state, location_locality);


-- 2b. Project Activity Assignments
CREATE TABLE project_activity_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id     UUID NOT NULL REFERENCES project_activities(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assignment_type TEXT NOT NULL DEFAULT 'direct'
    CHECK (assignment_type IN ('direct','open')),
  status          TEXT NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned','claimed','in_progress','completed','withdrawn')),
  claimed_at      TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (activity_id, user_id)
);

CREATE INDEX idx_proj_act_assign_activity ON project_activity_assignments(activity_id);
CREATE INDEX idx_proj_act_assign_user     ON project_activity_assignments(user_id);
CREATE INDEX idx_proj_act_assign_status   ON project_activity_assignments(status);


-- 2c. Project Team Members
CREATE TABLE project_team_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_role TEXT NOT NULL
    CHECK (project_role IN (
      'project_fom',
      'project_supervisor',
      'project_coordinator',
      'project_finance_reviewer',
      'project_data_collector',
      'project_viewer'
    )),
  added_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  added_at     TIMESTAMPTZ DEFAULT NOW(),
  is_active    BOOLEAN DEFAULT TRUE,
  UNIQUE (project_id, user_id)
);

CREATE INDEX idx_proj_team_project ON project_team_members(project_id);
CREATE INDEX idx_proj_team_user    ON project_team_members(user_id);
CREATE INDEX idx_proj_team_role    ON project_team_members(project_role);


-- 2d. Project Approval Chains
CREATE TABLE project_approval_chains (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  submission_type TEXT NOT NULL
    CHECK (submission_type IN ('down_payment','cost_submission','fund_withdrawal')),
  name            TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, submission_type)
);

CREATE INDEX idx_proj_chains_project ON project_approval_chains(project_id);


-- 2e. Project Approval Stages
CREATE TABLE project_approval_stages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id         UUID NOT NULL REFERENCES project_approval_chains(id) ON DELETE CASCADE,
  stage_number     INTEGER NOT NULL,
  stage_name       TEXT,
  approver_role    TEXT NOT NULL
    CHECK (approver_role IN (
      'project_fom',
      'project_supervisor',
      'project_finance_reviewer',
      'global_finance_admin',
      'specific_user'
    )),
  approver_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  threshold_type   TEXT DEFAULT 'all'
    CHECK (threshold_type IN ('all','above','below')),
  threshold_amount NUMERIC(15,2),
  skip_if_below    NUMERIC(15,2),
  deadline_hours   INTEGER,
  on_deadline_miss TEXT DEFAULT 'notify'
    CHECK (on_deadline_miss IN ('notify','escalate','auto_reject')),
  require_note     BOOLEAN DEFAULT FALSE,
  stage_order      INTEGER NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_proj_stages_chain ON project_approval_stages(chain_id, stage_order);


-- 2f. Project Budget Rules
CREATE TABLE project_budget_rules (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                 UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
  max_advance_per_request    NUMERIC(15,2),
  max_outstanding_per_person NUMERIC(15,2),
  auto_approve_below         NUMERIC(15,2),
  require_director_above     NUMERIC(15,2),
  allowed_currencies         TEXT[] DEFAULT ARRAY['SDG'],
  allowed_payment_methods    TEXT[] DEFAULT ARRAY['cash','bank_transfer','mobile_money'],
  created_by                 UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at                 TIMESTAMPTZ DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ DEFAULT NOW()
);


-- 2g. Project Activity Types (custom labels per project)
CREATE TABLE project_activity_types (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  icon       TEXT DEFAULT 'clipboard',
  is_active  BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_proj_act_types_project ON project_activity_types(project_id);


-- 2h. Project Activity Feed
CREATE TABLE project_activity_feed (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  activity_id   UUID REFERENCES project_activities(id) ON DELETE SET NULL,
  actor_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role    TEXT,
  event_type    TEXT NOT NULL,
  event_payload JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_proj_feed_project  ON project_activity_feed(project_id, created_at DESC);
CREATE INDEX idx_proj_feed_activity ON project_activity_feed(activity_id);
CREATE INDEX idx_proj_feed_actor    ON project_activity_feed(actor_id);


-- ============================================================
-- STEP 3: ADD NULLABLE COLUMNS TO EXISTING TABLES
-- Both nullable — every existing record stays valid as-is
-- ============================================================

ALTER TABLE operational_cost_submissions
  ADD COLUMN IF NOT EXISTS project_activity_id UUID
  REFERENCES project_activities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ocs_project_activity
  ON operational_cost_submissions(project_activity_id)
  WHERE project_activity_id IS NOT NULL;

ALTER TABLE down_payment_requests
  ADD COLUMN IF NOT EXISTS project_activity_id UUID
  REFERENCES project_activities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dpr_project_activity
  ON down_payment_requests(project_activity_id)
  WHERE project_activity_id IS NOT NULL;


-- ============================================================
-- STEP 4: AUTO-UPDATE updated_at TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_project_activities_updated_at
  BEFORE UPDATE ON project_activities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_project_approval_chains_updated_at
  BEFORE UPDATE ON project_approval_chains
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_project_budget_rules_updated_at
  BEFORE UPDATE ON project_budget_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- STEP 5: ENABLE ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE project_activities           ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_activity_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_team_members         ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_approval_chains      ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_approval_stages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_budget_rules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_activity_types       ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_activity_feed        ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- STEP 6: RLS POLICIES
-- ============================================================

-- ── project_activities ──────────────────────────────────────

CREATE POLICY "Staff see their assigned activities"
  ON project_activities FOR SELECT
  USING (
    id IN (
      SELECT activity_id FROM project_activity_assignments
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Staff see open activities in their hub"
  ON project_activities FOR SELECT
  USING (
    status = 'open'
    AND (
      location_hub IS NULL
      OR location_hub IN (
        SELECT hub_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Project team see their project activities"
  ON project_activities FOR SELECT
  USING (
    project_id IN (
      SELECT project_id FROM project_team_members
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

CREATE POLICY "Admins full access project activities"
  ON project_activities FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN (
        'admin','Admin','superAdmin','SuperAdmin',
        'super_admin','Super Admin'
      )
    )
  );


-- ── project_activity_assignments ────────────────────────────

CREATE POLICY "Users see own assignments"
  ON project_activity_assignments FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Project team see all assignments on their project"
  ON project_activity_assignments FOR SELECT
  USING (
    activity_id IN (
      SELECT pa.id FROM project_activities pa
      JOIN project_team_members ptm ON ptm.project_id = pa.project_id
      WHERE ptm.user_id = auth.uid() AND ptm.is_active = TRUE
    )
  );

CREATE POLICY "Staff can update own assignment status"
  ON project_activity_assignments FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Admins manage all assignments"
  ON project_activity_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN (
        'admin','Admin','superAdmin','SuperAdmin',
        'super_admin','Super Admin'
      )
    )
  );


-- ── project_team_members ─────────────────────────────────────

CREATE POLICY "Team members see own membership"
  ON project_team_members FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Project FOM sees their project team"
  ON project_team_members FOR SELECT
  USING (
    project_id IN (
      SELECT ptm2.project_id FROM project_team_members ptm2
      WHERE ptm2.user_id = auth.uid()
        AND ptm2.project_role = 'project_fom'
        AND ptm2.is_active = TRUE
    )
  );

CREATE POLICY "Admins manage project teams"
  ON project_team_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN (
        'admin','Admin','superAdmin','SuperAdmin',
        'super_admin','Super Admin'
      )
    )
  );


-- ── project_approval_chains ──────────────────────────────────

CREATE POLICY "Project team see their chains"
  ON project_approval_chains FOR SELECT
  USING (
    project_id IN (
      SELECT project_id FROM project_team_members
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

CREATE POLICY "Admins manage approval chains"
  ON project_approval_chains FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN (
        'admin','Admin','superAdmin','SuperAdmin',
        'super_admin','Super Admin'
      )
    )
  );


-- ── project_approval_stages ──────────────────────────────────

CREATE POLICY "Project team see chain stages"
  ON project_approval_stages FOR SELECT
  USING (
    chain_id IN (
      SELECT pac.id FROM project_approval_chains pac
      JOIN project_team_members ptm ON ptm.project_id = pac.project_id
      WHERE ptm.user_id = auth.uid() AND ptm.is_active = TRUE
    )
  );

CREATE POLICY "Admins manage approval stages"
  ON project_approval_stages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN (
        'admin','Admin','superAdmin','SuperAdmin',
        'super_admin','Super Admin'
      )
    )
  );


-- ── project_budget_rules ─────────────────────────────────────

CREATE POLICY "Project team see budget rules"
  ON project_budget_rules FOR SELECT
  USING (
    project_id IN (
      SELECT project_id FROM project_team_members
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

CREATE POLICY "Admins manage budget rules"
  ON project_budget_rules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN (
        'admin','Admin','superAdmin','SuperAdmin',
        'super_admin','Super Admin'
      )
    )
  );


-- ── project_activity_types ───────────────────────────────────

CREATE POLICY "Project team see activity types"
  ON project_activity_types FOR SELECT
  USING (
    project_id IN (
      SELECT project_id FROM project_team_members
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

CREATE POLICY "Admins manage activity types"
  ON project_activity_types FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN (
        'admin','Admin','superAdmin','SuperAdmin',
        'super_admin','Super Admin'
      )
    )
  );


-- ── project_activity_feed ────────────────────────────────────

CREATE POLICY "Project team see activity feed"
  ON project_activity_feed FOR SELECT
  USING (
    project_id IN (
      SELECT project_id FROM project_team_members
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

CREATE POLICY "Admins see all activity feed"
  ON project_activity_feed FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN (
        'admin','Admin','superAdmin','SuperAdmin',
        'super_admin','Super Admin'
      )
    )
  );

CREATE POLICY "Anyone can insert feed events"
  ON project_activity_feed FOR INSERT
  WITH CHECK (TRUE);


-- ============================================================
-- VERIFY SUCCESS — run these 3 queries after:
--
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name LIKE 'project_%'
--   ORDER BY table_name;
--
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'operational_cost_submissions'
--   AND column_name = 'project_activity_id';
--
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'down_payment_requests'
--   AND column_name = 'project_activity_id';
-- ============================================================
