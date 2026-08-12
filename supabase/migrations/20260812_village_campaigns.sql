-- ============================================================
-- Village Campaigns for Ad-hoc Operations
-- ============================================================
-- Hierarchy:
--   adhoc_campaigns  (campaign container)
--     └── adhoc_villages  (villages with HH targets)
--   adhoc_teams  (global team registry, reusable across campaigns/villages)
--   adhoc_village_teams  (assignment: team works a village in a campaign)
--   adhoc_daily_logs  (daily progress per team-village assignment)
--   adhoc_daily_log_photos  (photos for a daily log)
-- ============================================================

-- 1. Campaign container
CREATE TABLE IF NOT EXISTS adhoc_campaigns (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name     text        NOT NULL,
  state             text,
  locality          text,
  start_date        date,
  end_date          date,
  status            text        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('draft','active','completed','archived')),
  -- Links
  project_id        uuid        REFERENCES projects(id) ON DELETE SET NULL,
  mmp_file_id       uuid        REFERENCES mmp_files(id) ON DELETE SET NULL,
  -- Personnel chain
  coordinator_id    uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  supervisor_id     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  -- Audit
  created_by        uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

-- 2. Villages within a campaign
CREATE TABLE IF NOT EXISTS adhoc_villages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid        NOT NULL REFERENCES adhoc_campaigns(id) ON DELETE CASCADE,
  village_name    text        NOT NULL,
  village_code    text        NOT NULL,       -- auto-suggested e.g. VLG-01
  hh_target       integer     NOT NULL DEFAULT 0,
  state           text,
  locality        text,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','in_progress','completed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS adhoc_villages_campaign_idx ON adhoc_villages(campaign_id);

-- 3. Global team registry (reusable across campaigns/villages)
CREATE TABLE IF NOT EXISTS adhoc_teams (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_name       text        NOT NULL,
  team_code       text        NOT NULL UNIQUE,  -- e.g. TM-001
  team_lead_id    uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  member_count    integer     NOT NULL DEFAULT 0,
  notes           text,
  is_active       boolean     NOT NULL DEFAULT true,
  created_by      uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 4. Team → Village assignment (team can work multiple villages)
CREATE TABLE IF NOT EXISTS adhoc_village_teams (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         uuid        NOT NULL REFERENCES adhoc_campaigns(id) ON DELETE CASCADE,
  village_id          uuid        NOT NULL REFERENCES adhoc_villages(id) ON DELETE CASCADE,
  team_id             uuid        NOT NULL REFERENCES adhoc_teams(id) ON DELETE CASCADE,
  hh_target_for_team  integer,    -- optional per-team sub-target within the village
  -- Bridge to mmp_site_entries for mobile visibility
  site_entry_id       uuid        REFERENCES mmp_site_entries(id) ON DELETE SET NULL,
  status              text        NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active','completed','withdrawn')),
  assigned_at         timestamptz NOT NULL DEFAULT now(),
  assigned_by         uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (campaign_id, village_id, team_id)
);

CREATE INDEX IF NOT EXISTS adhoc_village_teams_campaign_idx ON adhoc_village_teams(campaign_id);
CREATE INDEX IF NOT EXISTS adhoc_village_teams_village_idx  ON adhoc_village_teams(village_id);
CREATE INDEX IF NOT EXISTS adhoc_village_teams_team_idx     ON adhoc_village_teams(team_id);

-- 5. Daily progress logs per assignment
CREATE TABLE IF NOT EXISTS adhoc_daily_logs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   uuid        NOT NULL REFERENCES adhoc_village_teams(id) ON DELETE CASCADE,
  campaign_id     uuid        NOT NULL REFERENCES adhoc_campaigns(id) ON DELETE CASCADE,
  village_id      uuid        NOT NULL REFERENCES adhoc_villages(id) ON DELETE CASCADE,
  team_id         uuid        NOT NULL REFERENCES adhoc_teams(id) ON DELETE CASCADE,
  report_date     date        NOT NULL DEFAULT CURRENT_DATE,
  -- Metrics
  hh_covered      integer     NOT NULL DEFAULT 0,
  male_count      integer     NOT NULL DEFAULT 0,
  female_count    integer     NOT NULL DEFAULT 0,
  beneficiaries   integer     NOT NULL DEFAULT 0,
  notes           text,
  -- Location
  gps_lat         double precision,
  gps_lng         double precision,
  gps_accuracy    double precision,
  -- Audit
  submitted_by    uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  source          text        NOT NULL DEFAULT 'web' CHECK (source IN ('web','mobile')),
  UNIQUE (assignment_id, report_date)   -- one log per team-village per day
);

CREATE INDEX IF NOT EXISTS adhoc_daily_logs_assignment_idx ON adhoc_daily_logs(assignment_id);
CREATE INDEX IF NOT EXISTS adhoc_daily_logs_campaign_idx   ON adhoc_daily_logs(campaign_id);
CREATE INDEX IF NOT EXISTS adhoc_daily_logs_date_idx       ON adhoc_daily_logs(report_date);

-- 6. Photos attached to a daily log
CREATE TABLE IF NOT EXISTS adhoc_daily_log_photos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id      uuid        NOT NULL REFERENCES adhoc_daily_logs(id) ON DELETE CASCADE,
  photo_url   text        NOT NULL,
  storage_path text,
  caption     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS adhoc_daily_log_photos_log_idx ON adhoc_daily_log_photos(log_id);

-- ── Timestamps auto-update ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_adhoc_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER adhoc_campaigns_updated_at  BEFORE UPDATE ON adhoc_campaigns  FOR EACH ROW EXECUTE FUNCTION update_adhoc_updated_at();
CREATE TRIGGER adhoc_villages_updated_at   BEFORE UPDATE ON adhoc_villages   FOR EACH ROW EXECUTE FUNCTION update_adhoc_updated_at();
CREATE TRIGGER adhoc_teams_updated_at      BEFORE UPDATE ON adhoc_teams      FOR EACH ROW EXECUTE FUNCTION update_adhoc_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE adhoc_campaigns        ENABLE ROW LEVEL SECURITY;
ALTER TABLE adhoc_villages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE adhoc_teams            ENABLE ROW LEVEL SECURITY;
ALTER TABLE adhoc_village_teams    ENABLE ROW LEVEL SECURITY;
ALTER TABLE adhoc_daily_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE adhoc_daily_log_photos ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all; write restricted to admins/coordinators via app logic
CREATE POLICY "village_campaigns_read"        ON adhoc_campaigns        FOR SELECT TO authenticated USING (true);
CREATE POLICY "village_campaigns_write"       ON adhoc_campaigns        FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "adhoc_villages_read"           ON adhoc_villages         FOR SELECT TO authenticated USING (true);
CREATE POLICY "adhoc_villages_write"          ON adhoc_villages         FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "adhoc_teams_read"              ON adhoc_teams            FOR SELECT TO authenticated USING (true);
CREATE POLICY "adhoc_teams_write"             ON adhoc_teams            FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "adhoc_village_teams_read"      ON adhoc_village_teams    FOR SELECT TO authenticated USING (true);
CREATE POLICY "adhoc_village_teams_write"     ON adhoc_village_teams    FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "adhoc_daily_logs_read"         ON adhoc_daily_logs       FOR SELECT TO authenticated USING (true);
CREATE POLICY "adhoc_daily_logs_write"        ON adhoc_daily_logs       FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "adhoc_daily_log_photos_read"   ON adhoc_daily_log_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "adhoc_daily_log_photos_write"  ON adhoc_daily_log_photos FOR ALL    TO authenticated USING (true) WITH CHECK (true);
