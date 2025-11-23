-- ============================================================================
-- CORRECTIVE MIGRATION: Fix Classification Tables in Supabase
-- ============================================================================
-- This migration safely fixes the column naming mismatch
-- Run this AFTER checking the diagnostic query
-- ============================================================================

-- Step 1: Drop existing tables cleanly (safe because no data yet)
DROP TABLE IF EXISTS user_classifications CASCADE;
DROP TABLE IF EXISTS classification_fee_structures CASCADE;
DROP VIEW IF EXISTS current_user_classifications CASCADE;
DROP FUNCTION IF EXISTS get_classification_fee CASCADE;

-- Step 2: Create or recreate ENUMS
DO $$ BEGIN
  DROP TYPE IF EXISTS classification_level CASCADE;
  CREATE TYPE classification_level AS ENUM ('A', 'B', 'C');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP TYPE IF EXISTS classification_role_scope CASCADE;
  CREATE TYPE classification_role_scope AS ENUM ('coordinator', 'dataCollector', 'supervisor');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Step 3: Create USER_CLASSIFICATIONS table
CREATE TABLE user_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Classification
  classification_level classification_level NOT NULL,
  role_scope classification_role_scope NOT NULL,
  
  -- Dates (using effective_from/effective_until to match app expectations)
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  
  -- Retainer
  has_retainer boolean DEFAULT false,
  retainer_amount_cents integer DEFAULT 0,
  retainer_currency text DEFAULT 'SDG',
  retainer_frequency text DEFAULT 'monthly',
  
  -- Audit
  assigned_by uuid REFERENCES profiles(id),
  change_reason text,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  CONSTRAINT valid_effective_dates CHECK (
    effective_until IS NULL OR effective_until > effective_from
  ),
  CONSTRAINT valid_retainer_amount CHECK (retainer_amount_cents >= 0)
);

-- Step 4: Create CLASSIFICATION_FEE_STRUCTURES table  
CREATE TABLE classification_fee_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Classification
  classification_level classification_level NOT NULL,
  role_scope classification_role_scope NOT NULL,
  
  -- Fees (in cents for precision)
  site_visit_base_fee_cents integer NOT NULL DEFAULT 0,
  site_visit_transport_fee_cents integer NOT NULL DEFAULT 0,
  complexity_multiplier decimal(3,2) DEFAULT 1.0,
  currency text DEFAULT 'SDG',
  
  -- Validity (using effective_from/effective_until to match app)
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  
  -- Metadata
  metadata jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  
  -- Audit
  created_by uuid REFERENCES profiles(id),
  updated_by uuid REFERENCES profiles(id),
  change_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  CONSTRAINT valid_fee_amounts CHECK (
    site_visit_base_fee_cents >= 0 AND site_visit_transport_fee_cents >= 0
  ),
  CONSTRAINT valid_complexity CHECK (complexity_multiplier >= 0),
  CONSTRAINT valid_validity_dates CHECK (
    effective_until IS NULL OR effective_until > effective_from
  )
);

-- Step 5: Indexes
CREATE INDEX idx_user_class_user ON user_classifications(user_id);
CREATE INDEX idx_user_class_active ON user_classifications(is_active);
CREATE INDEX idx_user_class_effective ON user_classifications(effective_from, effective_until);
CREATE INDEX idx_user_class_level ON user_classifications(classification_level);

CREATE INDEX idx_fee_struct_level_role ON classification_fee_structures(classification_level, role_scope);
CREATE INDEX idx_fee_struct_active ON classification_fee_structures(is_active);
CREATE INDEX idx_fee_struct_validity ON classification_fee_structures(effective_from, effective_until);

CREATE UNIQUE INDEX idx_unique_active_fee ON classification_fee_structures(
  classification_level, role_scope, currency
) WHERE is_active = true AND effective_until IS NULL;

-- Step 6: Insert 9 fee structures (all combinations: 3 levels × 3 roles)
INSERT INTO classification_fee_structures (
  classification_level, role_scope,
  site_visit_base_fee_cents, site_visit_transport_fee_cents,
  complexity_multiplier, currency, is_active, change_notes
) VALUES
-- Data Collectors
('A', 'dataCollector', 50000, 30000, 1.2, 'SDG', true, 'Level A - Senior Data Collector'),
('B', 'dataCollector', 35000, 25000, 1.0, 'SDG', true, 'Level B - Regular Data Collector'),
('C', 'dataCollector', 25000, 20000, 0.8, 'SDG', true, 'Level C - Junior Data Collector'),
-- Coordinators
('A', 'coordinator', 60000, 35000, 1.3, 'SDG', true, 'Level A - Senior Coordinator'),
('B', 'coordinator', 45000, 30000, 1.1, 'SDG', true, 'Level B - Regular Coordinator'),
('C', 'coordinator', 35000, 25000, 0.9, 'SDG', true, 'Level C - Junior Coordinator'),
-- Supervisors
('A', 'supervisor', 70000, 40000, 1.4, 'SDG', true, 'Level A - Senior Supervisor'),
('B', 'supervisor', 55000, 35000, 1.2, 'SDG', true, 'Level B - Regular Supervisor'),
('C', 'supervisor', 45000, 30000, 1.0, 'SDG', true, 'Level C - Junior Supervisor');

-- Step 7: Create View
CREATE VIEW current_user_classifications AS
SELECT DISTINCT ON (user_id)
  uc.*,
  p.full_name,
  p.email,
  p.role as user_role
FROM user_classifications uc
JOIN profiles p ON uc.user_id = p.id
WHERE 
  uc.is_active = true
  AND uc.effective_from <= now()
  AND (uc.effective_until IS NULL OR uc.effective_until > now())
ORDER BY user_id, effective_from DESC;

-- Step 8: Create Function
CREATE OR REPLACE FUNCTION get_classification_fee(
  p_classification_level classification_level,
  p_role_scope classification_role_scope,
  p_currency text DEFAULT 'SDG'
)
RETURNS TABLE (
  base_fee_cents integer,
  transport_fee_cents integer,
  complexity_multiplier decimal
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cfs.site_visit_base_fee_cents,
    cfs.site_visit_transport_fee_cents,
    cfs.complexity_multiplier
  FROM classification_fee_structures cfs
  WHERE 
    cfs.classification_level = p_classification_level
    AND cfs.role_scope = p_role_scope
    AND cfs.currency = p_currency
    AND cfs.is_active = true
    AND cfs.effective_from <= now()
    AND (cfs.effective_until IS NULL OR cfs.effective_until > now())
  ORDER BY cfs.effective_from DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 9: Triggers
CREATE OR REPLACE FUNCTION update_classification_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_user_class_updated
  BEFORE UPDATE ON user_classifications
  FOR EACH ROW EXECUTE FUNCTION update_classification_timestamp();

CREATE TRIGGER trigger_fee_struct_updated
  BEFORE UPDATE ON classification_fee_structures
  FOR EACH ROW EXECUTE FUNCTION update_classification_timestamp();

-- Step 10: Enable RLS
ALTER TABLE user_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE classification_fee_structures ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Public read user_classifications"
  ON user_classifications FOR SELECT USING (true);

CREATE POLICY "Public read classification_fee_structures"
  ON classification_fee_structures FOR SELECT USING (true);

-- Admin write
CREATE POLICY "Admin manage user_classifications"
  ON user_classifications FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'ict', 'financialAdmin')
    )
  );

CREATE POLICY "Admin manage classification_fee_structures"
  ON classification_fee_structures FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'ict', 'financialAdmin')
    )
  );

-- ============================================================================
-- DONE! Classification system installed with correct column names
-- ============================================================================

SELECT 'Migration completed successfully! Classification tables created.' AS status;
