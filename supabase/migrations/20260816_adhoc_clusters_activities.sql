-- ============================================================
-- Village Campaigns — Cluster Level & Multi-Activity Support
-- ============================================================
-- Adds:
--   1. adhoc_clusters table (State → Locality → Cluster → Village hierarchy)
--   2. cluster_id FK on adhoc_villages (nullable — existing villages unaffected)
--   3. activity_name + activity_type columns on adhoc_village_teams
--      so one village can have multiple assignments for different activities
-- ============================================================

-- 1. Cluster table
CREATE TABLE IF NOT EXISTS adhoc_clusters (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid        NOT NULL REFERENCES adhoc_campaigns(id) ON DELETE CASCADE,
  cluster_name    text        NOT NULL,
  cluster_code    text        NOT NULL,   -- e.g. CLU-01
  state           text,
  locality        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, cluster_code)
);

CREATE INDEX IF NOT EXISTS adhoc_clusters_campaign_idx ON adhoc_clusters(campaign_id);

-- Auto-update timestamp trigger
DROP TRIGGER IF EXISTS adhoc_clusters_updated_at ON adhoc_clusters;
CREATE TRIGGER adhoc_clusters_updated_at
  BEFORE UPDATE ON adhoc_clusters
  FOR EACH ROW EXECUTE FUNCTION update_adhoc_updated_at();

-- RLS
ALTER TABLE adhoc_clusters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "adhoc_clusters_read"             ON adhoc_clusters;
DROP POLICY IF EXISTS "adhoc_clusters_write"            ON adhoc_clusters;
DROP POLICY IF EXISTS "adhoc_clusters_write_admin_only" ON adhoc_clusters;

-- All authenticated users can read cluster definitions (team leads, field staff, etc.)
CREATE POLICY "adhoc_clusters_read"
  ON adhoc_clusters FOR SELECT TO authenticated USING (true);

-- Only campaign admins/coordinators/ops staff can create, edit, or delete clusters.
-- Uses the same is_village_campaign_admin() function defined in
-- 20260813_village_campaigns_rls_patch.sql (applied first in the runbook).
CREATE POLICY "adhoc_clusters_write_admin_only"
  ON adhoc_clusters FOR ALL TO authenticated
  USING (is_village_campaign_admin())
  WITH CHECK (is_village_campaign_admin());

-- 2. Add cluster_id FK to adhoc_villages (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'adhoc_villages'
      AND column_name  = 'cluster_id'
  ) THEN
    ALTER TABLE public.adhoc_villages
      ADD COLUMN cluster_id uuid REFERENCES adhoc_clusters(id) ON DELETE SET NULL;
  END IF;
END$$;

-- 3. Add activity_name and activity_type to adhoc_village_teams (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'adhoc_village_teams'
      AND column_name  = 'activity_name'
  ) THEN
    ALTER TABLE public.adhoc_village_teams
      ADD COLUMN activity_name text;   -- e.g. 'Nutrition', 'WASH', 'Protection'
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'adhoc_village_teams'
      AND column_name  = 'activity_type'
  ) THEN
    ALTER TABLE public.adhoc_village_teams
      ADD COLUMN activity_type text;   -- e.g. 'nutrition', 'wash', 'protection', 'general'
  END IF;
END$$;

-- 4. Drop the UNIQUE constraint on (campaign_id, village_id, team_id) so the same
--    team can be assigned to the same village for DIFFERENT activities.
--    We replace it with a partial unique on (campaign_id, village_id, team_id, activity_type)
--    with a NULLS NOT DISTINCT-style handled by a partial index instead.
DO $$
BEGIN
  -- Drop old unique constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'adhoc_village_teams_campaign_id_village_id_team_id_key'
  ) THEN
    ALTER TABLE public.adhoc_village_teams
      DROP CONSTRAINT adhoc_village_teams_campaign_id_village_id_team_id_key;
  END IF;
END$$;

-- New uniqueness: one row per (campaign, village, team, activity_name).
--
-- activity_name is the canonical identity of an activity assignment:
--   - "Nutrition", "WASH", "Protection", etc. are distinct named activities.
--   - Two rows with the same name but different activity_type would be a duplicate.
--   - activity_type is a classification tag only, not the identity.
--
-- Rule 1: when activity_name IS NOT NULL — unique by named activity.
--   Allows: Nutrition + WASH, Nutrition + Protection (different names)
--   Blocks:  two "Nutrition" rows for the same team/village (same name = duplicate)
CREATE UNIQUE INDEX IF NOT EXISTS adhoc_village_teams_unique_with_activity
  ON adhoc_village_teams (campaign_id, village_id, team_id, activity_name)
  WHERE activity_name IS NOT NULL;

-- Rule 2: when activity_name IS NULL — one "general" row per team/village combo.
--   Preserves backward compatibility for existing assignments that have no activity.
CREATE UNIQUE INDEX IF NOT EXISTS adhoc_village_teams_unique_no_activity
  ON adhoc_village_teams (campaign_id, village_id, team_id)
  WHERE activity_name IS NULL;
