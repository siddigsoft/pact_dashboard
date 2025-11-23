-- ============================================================================
-- USER CLASSIFICATION SYSTEM MIGRATION (FIXED VERSION)
-- ============================================================================
-- This migration safely installs the classification system, handling existing tables
-- ============================================================================

-- ============================================================================
-- 1. DROP EXISTING TABLES (Safe cleanup)
-- ============================================================================

DROP TABLE IF EXISTS user_classifications CASCADE;
DROP TABLE IF EXISTS classification_fee_structures CASCADE;
DROP VIEW IF EXISTS current_user_classifications CASCADE;

-- ============================================================================
-- 2. CREATE ENUMS
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE classification_level AS ENUM ('A', 'B', 'C');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE classification_role_scope AS ENUM ('coordinator', 'dataCollector', 'supervisor');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- 3. CREATE USER_CLASSIFICATIONS TABLE
-- ============================================================================

CREATE TABLE user_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Classification details
  classification_level classification_level NOT NULL,
  role_scope classification_role_scope NOT NULL,
  
  -- Effective dates
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  
  -- Retainer configuration
  has_retainer boolean DEFAULT false,
  retainer_amount_cents integer DEFAULT 0,
  retainer_currency text DEFAULT 'SDG',
  retainer_frequency text DEFAULT 'monthly',
  
  -- Audit fields
  assigned_by uuid REFERENCES profiles(id),
  change_reason text,
  notes text,
  
  -- Status
  is_active boolean DEFAULT true,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Constraints
  CONSTRAINT valid_effective_dates CHECK (
    effective_until IS NULL OR effective_until > effective_from
  ),
  CONSTRAINT valid_retainer_amount CHECK (
    retainer_amount_cents >= 0
  )
);

-- Indexes
CREATE INDEX idx_user_classifications_user_id ON user_classifications(user_id);
CREATE INDEX idx_user_classifications_active ON user_classifications(is_active);
CREATE INDEX idx_user_classifications_effective ON user_classifications(effective_from, effective_until);
CREATE INDEX idx_user_classifications_level ON user_classifications(classification_level);
CREATE INDEX idx_user_classifications_role_scope ON user_classifications(role_scope);

-- ============================================================================
-- 4. CREATE CLASSIFICATION_FEE_STRUCTURES TABLE
-- ============================================================================

CREATE TABLE classification_fee_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Classification and role
  classification_level classification_level NOT NULL,
  role_scope classification_role_scope NOT NULL,
  
  -- Fee amounts (in cents)
  site_visit_base_fee_cents integer NOT NULL DEFAULT 0,
  site_visit_transport_fee_cents integer NOT NULL DEFAULT 0,
  complexity_multiplier decimal(3,2) DEFAULT 1.0,
  
  -- Currency
  currency text DEFAULT 'SDG',
  
  -- Validity period
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  
  -- Metadata
  metadata jsonb DEFAULT '{}',
  
  -- Status
  is_active boolean DEFAULT true,
  
  -- Audit
  created_by uuid REFERENCES profiles(id),
  updated_by uuid REFERENCES profiles(id),
  change_notes text,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Constraints
  CONSTRAINT valid_fee_amounts CHECK (
    site_visit_base_fee_cents >= 0 AND 
    site_visit_transport_fee_cents >= 0
  ),
  CONSTRAINT valid_complexity_multiplier CHECK (
    complexity_multiplier >= 0
  ),
  CONSTRAINT valid_validity_dates CHECK (
    valid_until IS NULL OR valid_until > valid_from
  )
);

-- Indexes
CREATE INDEX idx_classification_fees_level_role ON classification_fee_structures(classification_level, role_scope);
CREATE INDEX idx_classification_fees_active ON classification_fee_structures(is_active);
CREATE INDEX idx_classification_fees_validity ON classification_fee_structures(valid_from, valid_until);

-- Unique constraint
CREATE UNIQUE INDEX idx_unique_active_fee_structure
  ON classification_fee_structures(classification_level, role_scope, currency)
  WHERE is_active = true AND valid_until IS NULL;

-- ============================================================================
-- 5. CREATE VIEW
-- ============================================================================

CREATE VIEW current_user_classifications AS
SELECT DISTINCT ON (user_id)
  uc.id,
  uc.user_id,
  uc.classification_level,
  uc.role_scope,
  uc.effective_from,
  uc.effective_until,
  uc.has_retainer,
  uc.retainer_amount_cents,
  uc.retainer_currency,
  uc.retainer_frequency,
  uc.is_active,
  uc.created_at,
  uc.updated_at,
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

-- ============================================================================
-- 6. CREATE FUNCTION
-- ============================================================================

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
    AND cfs.valid_from <= now()
    AND (cfs.valid_until IS NULL OR cfs.valid_until > now())
  ORDER BY cfs.valid_from DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 7. CREATE TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_classification_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_user_classifications_updated_at
  BEFORE UPDATE ON user_classifications
  FOR EACH ROW
  EXECUTE FUNCTION update_classification_updated_at();

CREATE TRIGGER trigger_classification_fee_structures_updated_at
  BEFORE UPDATE ON classification_fee_structures
  FOR EACH ROW
  EXECUTE FUNCTION update_classification_updated_at();

-- ============================================================================
-- 8. INSERT DEFAULT FEE STRUCTURES (9 combinations)
-- ============================================================================

INSERT INTO classification_fee_structures (
  classification_level, role_scope, 
  site_visit_base_fee_cents, site_visit_transport_fee_cents, 
  complexity_multiplier, currency, is_active, change_notes
) VALUES
-- Data Collectors
('A', 'dataCollector', 50000, 30000, 1.2, 'SDG', true, 'Level A - Experienced'),
('B', 'dataCollector', 35000, 25000, 1.0, 'SDG', true, 'Level B - Intermediate'),
('C', 'dataCollector', 25000, 20000, 0.8, 'SDG', true, 'Level C - Entry-level'),
-- Coordinators
('A', 'coordinator', 60000, 35000, 1.3, 'SDG', true, 'Level A - Senior'),
('B', 'coordinator', 45000, 30000, 1.1, 'SDG', true, 'Level B - Regular'),
('C', 'coordinator', 35000, 25000, 0.9, 'SDG', true, 'Level C - Junior'),
-- Supervisors
('A', 'supervisor', 70000, 40000, 1.4, 'SDG', true, 'Level A - Senior'),
('B', 'supervisor', 55000, 35000, 1.2, 'SDG', true, 'Level B - Regular'),
('C', 'supervisor', 45000, 30000, 1.0, 'SDG', true, 'Level C - Junior');

-- ============================================================================
-- 9. ENABLE RLS
-- ============================================================================

ALTER TABLE user_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE classification_fee_structures ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read user_classifications"
  ON user_classifications FOR SELECT USING (true);

CREATE POLICY "Public read classification_fee_structures"
  ON classification_fee_structures FOR SELECT USING (true);

-- Admin-only write access
CREATE POLICY "Admin insert user_classifications"
  ON user_classifications FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'ict', 'financialAdmin')
    )
  );

CREATE POLICY "Admin update user_classifications"
  ON user_classifications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'ict', 'financialAdmin')
    )
  );

CREATE POLICY "Admin delete user_classifications"
  ON user_classifications FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'ict')
    )
  );

-- Fee structures policies
CREATE POLICY "Admin insert classification_fee_structures"
  ON classification_fee_structures FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'ict', 'financialAdmin')
    )
  );

CREATE POLICY "Admin update classification_fee_structures"
  ON classification_fee_structures FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'ict', 'financialAdmin')
    )
  );

CREATE POLICY "Admin delete classification_fee_structures"
  ON classification_fee_structures FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'ict')
    )
  );

-- ============================================================================
-- 10. ADD CONSTRAINTS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE UNIQUE INDEX idx_unique_active_user_classification
  ON user_classifications(user_id, role_scope)
  WHERE is_active = true AND effective_until IS NULL;

ALTER TABLE user_classifications
  ADD CONSTRAINT no_overlapping_classifications EXCLUDE USING gist (
    user_id WITH =,
    role_scope WITH =,
    tstzrange(effective_from, effective_until, '[)') WITH &&
  )
  WHERE (is_active = true);

-- ============================================================================
-- MIGRATION COMPLETE ✅
-- ============================================================================
