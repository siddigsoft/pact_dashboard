-- ============================================================================
-- USER CLASSIFICATION SYSTEM MIGRATION
-- ============================================================================
-- This migration adds a comprehensive classification system for team members
-- (Coordinators, Data Collectors, Supervisors) with different fee structures,
-- monthly retainers, and admin management capabilities.
--
-- Created: 2025-11-22
-- ============================================================================

-- ============================================================================
-- 1. CREATE ENUMS
-- ============================================================================

-- Classification levels enum
DO $$ BEGIN
  CREATE TYPE classification_level AS ENUM ('A', 'B', 'C');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Applicable roles for classification
DO $$ BEGIN
  CREATE TYPE classification_role_scope AS ENUM ('coordinator', 'dataCollector', 'supervisor');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- 2. CREATE USER_CLASSIFICATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Classification details
  classification_level classification_level NOT NULL,
  role_scope classification_role_scope NOT NULL,
  
  -- Effective dates for time-bound changes and history
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  
  -- Retainer configuration (optional)
  has_retainer boolean DEFAULT false,
  retainer_amount_cents integer DEFAULT 0,
  retainer_currency text DEFAULT 'SDG',
  retainer_frequency text DEFAULT 'monthly', -- 'monthly', 'quarterly', 'annual'
  
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_classifications_user_id ON user_classifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_classifications_active ON user_classifications(is_active);
CREATE INDEX IF NOT EXISTS idx_user_classifications_effective ON user_classifications(effective_from, effective_until);
CREATE INDEX IF NOT EXISTS idx_user_classifications_level ON user_classifications(classification_level);
CREATE INDEX IF NOT EXISTS idx_user_classifications_role_scope ON user_classifications(role_scope);

-- ============================================================================
-- 3. CREATE CLASSIFICATION_FEE_STRUCTURES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS classification_fee_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Classification and role
  classification_level classification_level NOT NULL,
  role_scope classification_role_scope NOT NULL,
  
  -- Fee amounts (in cents for precision)
  site_visit_base_fee_cents integer NOT NULL DEFAULT 0,
  site_visit_transport_fee_cents integer NOT NULL DEFAULT 0,
  complexity_multiplier decimal(3,2) DEFAULT 1.0,
  
  -- Currency
  currency text DEFAULT 'SDG',
  
  -- Validity period
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  
  -- Metadata for future expansion
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
CREATE INDEX IF NOT EXISTS idx_classification_fees_level_role ON classification_fee_structures(classification_level, role_scope);
CREATE INDEX IF NOT EXISTS idx_classification_fees_active ON classification_fee_structures(is_active);
CREATE INDEX IF NOT EXISTS idx_classification_fees_validity ON classification_fee_structures(valid_from, valid_until);

-- Unique constraint for active fee structures
CREATE UNIQUE INDEX idx_unique_active_fee_structure
  ON classification_fee_structures(classification_level, role_scope, currency)
  WHERE is_active = true AND valid_until IS NULL;

-- ============================================================================
-- 4. CREATE VIEW FOR CURRENT USER CLASSIFICATIONS
-- ============================================================================

CREATE OR REPLACE VIEW current_user_classifications AS
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
-- 5. CREATE FUNCTION TO GET FEE FOR CLASSIFICATION
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
-- 6. CREATE TRIGGER TO UPDATE updated_at TIMESTAMP
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
-- 7. INSERT DEFAULT FEE STRUCTURES
-- ============================================================================

-- Default fees for Data Collectors
INSERT INTO classification_fee_structures (
  classification_level,
  role_scope,
  site_visit_base_fee_cents,
  site_visit_transport_fee_cents,
  complexity_multiplier,
  currency,
  is_active,
  change_notes
) VALUES
-- Level A Data Collectors (Experienced)
('A', 'dataCollector', 50000, 30000, 1.2, 'SDG', true, 'Initial classification fee structure - Level A (Experienced)'),
-- Level B Data Collectors (Intermediate)
('B', 'dataCollector', 35000, 25000, 1.0, 'SDG', true, 'Initial classification fee structure - Level B (Intermediate)'),
-- Level C Data Collectors (Entry-level)
('C', 'dataCollector', 25000, 20000, 0.8, 'SDG', true, 'Initial classification fee structure - Level C (Entry-level)')
ON CONFLICT DO NOTHING;

-- Default fees for Coordinators
INSERT INTO classification_fee_structures (
  classification_level,
  role_scope,
  site_visit_base_fee_cents,
  site_visit_transport_fee_cents,
  complexity_multiplier,
  currency,
  is_active,
  change_notes
) VALUES
-- Level A Coordinators (Senior)
('A', 'coordinator', 60000, 35000, 1.3, 'SDG', true, 'Initial classification fee structure - Level A (Senior Coordinator)'),
-- Level B Coordinators (Regular)
('B', 'coordinator', 45000, 30000, 1.1, 'SDG', true, 'Initial classification fee structure - Level B (Regular Coordinator)'),
-- Level C Coordinators (Junior)
('C', 'coordinator', 35000, 25000, 0.9, 'SDG', true, 'Initial classification fee structure - Level C (Junior Coordinator)')
ON CONFLICT DO NOTHING;

-- Default fees for Supervisors
INSERT INTO classification_fee_structures (
  classification_level,
  role_scope,
  site_visit_base_fee_cents,
  site_visit_transport_fee_cents,
  complexity_multiplier,
  currency,
  is_active,
  change_notes
) VALUES
-- Level A Supervisors (Senior)
('A', 'supervisor', 70000, 40000, 1.4, 'SDG', true, 'Initial classification fee structure - Level A (Senior Supervisor)'),
-- Level B Supervisors (Regular)
('B', 'supervisor', 55000, 35000, 1.2, 'SDG', true, 'Initial classification fee structure - Level B (Regular Supervisor)'),
-- Level C Supervisors (Junior)
('C', 'supervisor', 45000, 30000, 1.0, 'SDG', true, 'Initial classification fee structure - Level C (Junior Supervisor)')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 8. UPDATE WALLET TRANSACTION TYPES (Add 'retainer')
-- ============================================================================

-- Note: wallet_transactions.type is a text field, so no enum modification needed
-- The application will handle the new 'retainer' type

-- ============================================================================
-- 9. CREATE RLS POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE user_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE classification_fee_structures ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view current classifications (for display purposes)
CREATE POLICY "Public read access to user_classifications"
  ON user_classifications
  FOR SELECT
  USING (true);

-- Policy: Only admins/ICT/financialAdmin can insert classifications
CREATE POLICY "Admin insert user_classifications"
  ON user_classifications
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'ict', 'financialAdmin')
    )
  );

-- Policy: Only admins/ICT/financialAdmin can update classifications
CREATE POLICY "Admin update user_classifications"
  ON user_classifications
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'ict', 'financialAdmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'ict', 'financialAdmin')
    )
  );

-- Policy: Only admins/ICT can delete classifications
CREATE POLICY "Admin delete user_classifications"
  ON user_classifications
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'ict')
    )
  );

-- Policy: Anyone can view fee structures (for calculation purposes)
CREATE POLICY "Public read access to classification_fee_structures"
  ON classification_fee_structures
  FOR SELECT
  USING (true);

-- Policy: Only admins/ICT/financialAdmin can insert fee structures
CREATE POLICY "Admin insert classification_fee_structures"
  ON classification_fee_structures
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'ict', 'financialAdmin')
    )
  );

-- Policy: Only admins/ICT/financialAdmin can update fee structures
CREATE POLICY "Admin update classification_fee_structures"
  ON classification_fee_structures
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'ict', 'financialAdmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'ict', 'financialAdmin')
    )
  );

-- Policy: Only admins/ICT can delete fee structures
CREATE POLICY "Admin delete classification_fee_structures"
  ON classification_fee_structures
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'ict')
    )
  );

-- ============================================================================
-- 10. ADD UNIQUENESS AND OVERLAP PREVENTION CONSTRAINTS
-- ============================================================================

-- Prevent multiple active classifications for the same user and role scope (no end date)
CREATE UNIQUE INDEX idx_unique_active_user_classification
  ON user_classifications(user_id, role_scope)
  WHERE is_active = true AND effective_until IS NULL;

-- Prevent overlapping effective date ranges for the same user and role scope
-- Using exclusion constraint with tstzrange to catch all overlaps
-- First, enable btree_gist extension if not already enabled
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Create exclusion constraint to prevent overlapping effective periods
ALTER TABLE user_classifications
  ADD CONSTRAINT no_overlapping_classifications EXCLUDE USING gist (
    user_id WITH =,
    role_scope WITH =,
    tstzrange(effective_from, effective_until, '[)') WITH &&
  )
  WHERE (is_active = true);

-- ============================================================================
-- 11. ADD COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE user_classifications IS 'Stores classification levels (A/B/C) for team members based on experience and criteria. Supports historical tracking and future-dated changes.';
COMMENT ON TABLE classification_fee_structures IS 'Defines fee structures for each classification level and role combination. Supports multiple currencies and time-based validity periods.';
COMMENT ON VIEW current_user_classifications IS 'Provides currently active classification for each user, automatically filtering by effective dates.';
COMMENT ON FUNCTION get_classification_fee IS 'Retrieves the current active fee structure for a given classification level and role.';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Summary of changes:
-- ✅ Created user_classifications table with history tracking
-- ✅ Created classification_fee_structures table for centralized fee management
-- ✅ Created current_user_classifications view for easy querying
-- ✅ Created get_classification_fee function for fee retrieval
-- ✅ Added triggers for automatic timestamp updates
-- ✅ Inserted default fee structures for all classification levels
-- ✅ Set up RLS policies for secure access control
-- ✅ Added comprehensive documentation

-- Next steps (Application Layer):
-- 1. Update TypeScript types to include classification fields
-- 2. Create ClassificationBadge component for UI display
-- 3. Build admin UI for classification management
-- 4. Integrate classification fees into wallet calculations
-- 5. Implement monthly retainer processing
-- 6. Display classifications throughout the application
