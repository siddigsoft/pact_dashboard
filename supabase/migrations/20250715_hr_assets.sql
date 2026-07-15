-- ─────────────────────────────────────────────────────────────────────────────
-- Task #82: Equipment & Asset Tracking Module
-- Tables: hr_assets, hr_asset_assignments
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Asset registry
CREATE TABLE IF NOT EXISTS hr_assets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type        text NOT NULL CHECK (asset_type IN (
    'laptop','phone','access_card','sim_card','software_license',
    'vehicle','tablet','camera','radio','generator','other'
  )),
  name              text NOT NULL,
  serial_number     text,
  model             text,
  purchase_date     date,
  purchase_value    numeric(14,2),
  current_condition text CHECK (current_condition IN ('excellent','good','fair','damaged')),
  status            text NOT NULL DEFAULT 'available'
                    CHECK (status IN ('available','assigned','maintenance','retired')),
  notes             text,
  created_by        uuid REFERENCES profiles(id),
  hub_id            uuid REFERENCES hubs(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 2. Assignment history
CREATE TABLE IF NOT EXISTS hr_asset_assignments (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id                uuid NOT NULL REFERENCES hr_assets(id) ON DELETE CASCADE,
  user_id                 uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_date           date NOT NULL DEFAULT CURRENT_DATE,
  returned_date           date,
  condition_at_assignment text CHECK (condition_at_assignment IN ('excellent','good','fair','damaged')),
  condition_at_return     text CHECK (condition_at_return IN ('excellent','good','fair','damaged')),
  notes                   text,
  assigned_by             uuid REFERENCES profiles(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_hr_assets_status        ON hr_assets(status);
CREATE INDEX IF NOT EXISTS idx_hr_assets_type          ON hr_assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_hr_assets_hub           ON hr_assets(hub_id);
CREATE INDEX IF NOT EXISTS idx_hr_assign_asset         ON hr_asset_assignments(asset_id);
CREATE INDEX IF NOT EXISTS idx_hr_assign_user          ON hr_asset_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_hr_assign_active        ON hr_asset_assignments(user_id) WHERE returned_date IS NULL;

-- 4. Row Level Security
ALTER TABLE hr_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_asset_assignments ENABLE ROW LEVEL SECURITY;

-- hr_assets: all authenticated users can read; admins/HR can write
CREATE POLICY IF NOT EXISTS "hr_assets_select"
  ON hr_assets FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY IF NOT EXISTS "hr_assets_insert_admin"
  ON hr_assets FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND role IN ('admin','super_admin','hr_admin','ict'))
  );

CREATE POLICY IF NOT EXISTS "hr_assets_update_admin"
  ON hr_assets FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND role IN ('admin','super_admin','hr_admin','ict'))
  );

CREATE POLICY IF NOT EXISTS "hr_assets_delete_admin"
  ON hr_assets FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND role IN ('admin','super_admin','hr_admin','ict'))
  );

-- hr_asset_assignments: users see their own; admins see all
CREATE POLICY IF NOT EXISTS "hr_assign_select"
  ON hr_asset_assignments FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles
               WHERE id = auth.uid()
                 AND role IN ('admin','super_admin','hr_admin','ict'))
  );

CREATE POLICY IF NOT EXISTS "hr_assign_insert_admin"
  ON hr_asset_assignments FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND role IN ('admin','super_admin','hr_admin','ict'))
  );

CREATE POLICY IF NOT EXISTS "hr_assign_update_admin"
  ON hr_asset_assignments FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND role IN ('admin','super_admin','hr_admin','ict'))
  );

CREATE POLICY IF NOT EXISTS "hr_assign_delete_admin"
  ON hr_asset_assignments FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND role IN ('admin','super_admin','hr_admin','ict'))
  );
