-- Migration: Down-Payment Request System & Super-Admin Role
-- Date: 2025-11-25
-- Description: Implements down-payment request workflow with two-tier approval,
--             super-admin role with 3-account limit, and complete audit trail

-- ============================================================================
-- 1. ENHANCE EXISTING TABLES
-- ============================================================================

-- Add cost_status to site_visit_costs (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'site_visit_costs' AND column_name = 'cost_status'
  ) THEN
    ALTER TABLE site_visit_costs ADD COLUMN cost_status TEXT DEFAULT 'estimated';
    COMMENT ON COLUMN site_visit_costs.cost_status IS 'Status of cost record: estimated | finalized | adjusted';
  END IF;
END $$;

-- Add calculated_by and calculation_notes to site_visit_costs
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'site_visit_costs' AND column_name = 'calculated_by'
  ) THEN
    ALTER TABLE site_visit_costs ADD COLUMN calculated_by UUID REFERENCES profiles(id);
    COMMENT ON COLUMN site_visit_costs.calculated_by IS 'Admin who calculated the estimated costs';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'site_visit_costs' AND column_name = 'calculation_notes'
  ) THEN
    ALTER TABLE site_visit_costs ADD COLUMN calculation_notes TEXT;
    COMMENT ON COLUMN site_visit_costs.calculation_notes IS 'Notes about how costs were calculated';
  END IF;
END $$;

-- ============================================================================
-- 2. DOWN-PAYMENT REQUESTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS down_payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Request details
  site_visit_id UUID, -- May reference site_visits or mmp_site_entries
  mmp_site_entry_id UUID,
  site_name TEXT, -- Store site name for easy reference
  
  -- Requester information
  requested_by UUID REFERENCES profiles(id) NOT NULL,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  requester_role TEXT, -- 'dataCollector' | 'coordinator'
  hub_id UUID,
  hub_name TEXT,
  
  -- Payment details
  total_transportation_budget NUMERIC(12,2) NOT NULL, -- From site_visit_costs
  requested_amount NUMERIC(12,2) NOT NULL,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('full_advance', 'installments')),
  
  -- Installment details (JSONB array if payment_type = 'installments')
  -- Structure: [{amount: 30, stage: 'before_travel', description: '...', paid: false, paid_at: null, transaction_id: null}]
  installment_plan JSONB DEFAULT '[]',
  paid_installments JSONB DEFAULT '[]',
  
  -- Justification
  justification TEXT NOT NULL,
  supporting_documents JSONB DEFAULT '[]', -- [{fileName, fileUrl, uploadedAt}]
  
  -- TIER 1: Supervisor approval
  supervisor_id UUID REFERENCES profiles(id),
  supervisor_status TEXT CHECK (supervisor_status IN ('pending', 'approved', 'rejected', 'changes_requested')),
  supervisor_approved_by UUID REFERENCES profiles(id),
  supervisor_approved_at TIMESTAMPTZ,
  supervisor_notes TEXT,
  supervisor_rejection_reason TEXT,
  
  -- TIER 2: Admin approval
  admin_status TEXT CHECK (admin_status IN ('pending', 'approved', 'rejected')),
  admin_processed_by UUID REFERENCES profiles(id),
  admin_processed_at TIMESTAMPTZ,
  admin_notes TEXT,
  admin_rejection_reason TEXT,
  
  -- Payment tracking
  status TEXT NOT NULL DEFAULT 'pending_supervisor' CHECK (status IN (
    'pending_supervisor',  -- Waiting for hub supervisor
    'pending_admin',       -- Supervisor approved, waiting for admin
    'approved',            -- Admin approved but not yet paid
    'rejected',            -- Rejected by supervisor or admin
    'partially_paid',      -- Some installments paid
    'fully_paid',          -- All installments paid
    'cancelled'            -- Cancelled by requester or system
  )),
  
  total_paid_amount NUMERIC(12,2) DEFAULT 0,
  remaining_amount NUMERIC(12,2),
  
  -- Wallet transactions (array of transaction IDs)
  wallet_transaction_ids JSONB DEFAULT '[]',
  
  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_down_payment_requests_requester ON down_payment_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_down_payment_requests_supervisor ON down_payment_requests(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_down_payment_requests_status ON down_payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_down_payment_requests_site_visit ON down_payment_requests(site_visit_id);
CREATE INDEX IF NOT EXISTS idx_down_payment_requests_mmp_entry ON down_payment_requests(mmp_site_entry_id);
CREATE INDEX IF NOT EXISTS idx_down_payment_requests_hub ON down_payment_requests(hub_id);

-- Comments
COMMENT ON TABLE down_payment_requests IS 'Tracks down-payment requests by enumerators/coordinators with two-tier approval workflow';
COMMENT ON COLUMN down_payment_requests.payment_type IS 'full_advance: All money upfront | installments: Payments in stages';
COMMENT ON COLUMN down_payment_requests.status IS 'Overall request status tracking approval and payment stages';

-- ============================================================================
-- 3. COST ADJUSTMENT AUDIT TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS cost_adjustment_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Cost record being adjusted
  site_visit_cost_id UUID, -- References site_visit_costs
  site_visit_id UUID,
  mmp_site_entry_id UUID,
  site_name TEXT,
  
  -- Previous values (before adjustment)
  previous_transportation_cost NUMERIC(12,2),
  previous_accommodation_cost NUMERIC(12,2),
  previous_meal_allowance NUMERIC(12,2),
  previous_other_costs NUMERIC(12,2),
  previous_total_cost NUMERIC(12,2),
  
  -- New values (after adjustment)
  new_transportation_cost NUMERIC(12,2),
  new_accommodation_cost NUMERIC(12,2),
  new_meal_allowance NUMERIC(12,2),
  new_other_costs NUMERIC(12,2),
  new_total_cost NUMERIC(12,2),
  
  -- Adjustment details
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('increase', 'decrease', 'correction')),
  adjustment_reason TEXT NOT NULL, -- MANDATORY reason for change
  supporting_documents JSONB DEFAULT '[]',
  
  -- Who made the adjustment (must be admin or financialAdmin)
  adjusted_by UUID REFERENCES profiles(id) NOT NULL,
  adjusted_by_role TEXT NOT NULL,
  adjusted_by_name TEXT,
  adjusted_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Additional payment processing
  additional_payment_needed NUMERIC(12,2) DEFAULT 0,
  additional_payment_transaction_id UUID,
  additional_payment_processed BOOLEAN DEFAULT false,
  additional_payment_processed_at TIMESTAMPTZ,
  
  -- Audit trail
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cost_adjustment_audit_site_visit_cost ON cost_adjustment_audit(site_visit_cost_id);
CREATE INDEX IF NOT EXISTS idx_cost_adjustment_audit_site_visit ON cost_adjustment_audit(site_visit_id);
CREATE INDEX IF NOT EXISTS idx_cost_adjustment_audit_adjusted_by ON cost_adjustment_audit(adjusted_by);
CREATE INDEX IF NOT EXISTS idx_cost_adjustment_audit_date ON cost_adjustment_audit(adjusted_at);

-- Comments
COMMENT ON TABLE cost_adjustment_audit IS 'Complete audit trail of all cost adjustments made by admins';
COMMENT ON COLUMN cost_adjustment_audit.adjustment_reason IS 'MANDATORY field - every cost change must have a documented reason';

-- ============================================================================
-- 4. SUPER-ADMIN TABLE (Maximum 3 accounts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS super_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User reference (one-to-one with profiles)
  user_id UUID REFERENCES profiles(id) UNIQUE NOT NULL,
  
  -- Appointment details
  appointed_by UUID REFERENCES profiles(id),
  appointed_at TIMESTAMPTZ DEFAULT NOW(),
  appointment_reason TEXT NOT NULL,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  deactivated_by UUID REFERENCES profiles(id),
  deactivation_reason TEXT,
  
  -- Activity tracking
  last_activity_at TIMESTAMPTZ,
  deletion_count INTEGER DEFAULT 0, -- Track number of deletions performed
  adjustment_count INTEGER DEFAULT 0, -- Track number of cost adjustments
  total_actions_count INTEGER DEFAULT 0, -- Track all privileged actions
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_super_admins_user ON super_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_super_admins_active ON super_admins(is_active) WHERE is_active = true;

-- Comments
COMMENT ON TABLE super_admins IS 'Super-admin role with complete system control - Maximum 3 active accounts allowed';
COMMENT ON COLUMN super_admins.deletion_count IS 'Number of hard deletions performed (only super-admins can delete)';

-- ============================================================================
-- 5. ENFORCE 3-ACCOUNT LIMIT FOR SUPER-ADMINS
-- ============================================================================

-- Function to enforce maximum 3 active super-admins
CREATE OR REPLACE FUNCTION enforce_super_admin_limit()
RETURNS TRIGGER AS $$
DECLARE
  active_count INTEGER;
BEGIN
  -- Only check when activating a super-admin
  IF NEW.is_active = true THEN
    -- Count current active super-admins (excluding current record if update)
    SELECT COUNT(*) INTO active_count
    FROM super_admins
    WHERE is_active = true
    AND (TG_OP = 'INSERT' OR id != NEW.id);
    
    -- Enforce limit
    IF active_count >= 3 THEN
      RAISE EXCEPTION 'Maximum 3 active super-admin accounts allowed. Please deactivate an existing super-admin first.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to check limit before insert/update
DROP TRIGGER IF EXISTS check_super_admin_limit ON super_admins;
CREATE TRIGGER check_super_admin_limit
  BEFORE INSERT OR UPDATE ON super_admins
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION enforce_super_admin_limit();

-- ============================================================================
-- 6. DELETION AUDIT LOG (Track all deletions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS deletion_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- What was deleted
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL, -- Store as TEXT to support any ID type
  record_data JSONB NOT NULL, -- Complete snapshot of deleted record
  
  -- Who deleted it (must be super-admin)
  deleted_by UUID REFERENCES profiles(id) NOT NULL,
  deleted_by_role TEXT NOT NULL, -- Should be 'superAdmin'
  deleted_by_name TEXT,
  deletion_reason TEXT NOT NULL, -- MANDATORY reason
  
  -- When
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Restoration capability
  is_restorable BOOLEAN DEFAULT true,
  restored_at TIMESTAMPTZ,
  restored_by UUID REFERENCES profiles(id),
  restoration_notes TEXT,
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deletion_audit_log_table ON deletion_audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_deletion_audit_log_record ON deletion_audit_log(record_id);
CREATE INDEX IF NOT EXISTS idx_deletion_audit_log_deleted_by ON deletion_audit_log(deleted_by);
CREATE INDEX IF NOT EXISTS idx_deletion_audit_log_date ON deletion_audit_log(deleted_at);

-- Comments
COMMENT ON TABLE deletion_audit_log IS 'Complete audit trail of all deletions (only super-admins can delete records)';
COMMENT ON COLUMN deletion_audit_log.record_data IS 'Full JSON snapshot of deleted record for potential restoration';
COMMENT ON COLUMN deletion_audit_log.deletion_reason IS 'MANDATORY field - every deletion must have a documented reason';

-- ============================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE down_payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_adjustment_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE deletion_audit_log ENABLE ROW LEVEL SECURITY;

-- Down-Payment Requests Policies
-- Data collectors/coordinators can view and create their own requests
CREATE POLICY "down_payment_requests_user_view" ON down_payment_requests
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE id = requested_by
    )
  );

CREATE POLICY "down_payment_requests_user_create" ON down_payment_requests
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles WHERE id = requested_by
      AND role IN ('dataCollector', 'datacollector', 'coordinator')
    )
  );

-- Hub supervisors can view and approve requests from their hub
CREATE POLICY "down_payment_requests_supervisor_view" ON down_payment_requests
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE role IN ('supervisor', 'hubSupervisor')
      AND (hub_id = down_payment_requests.hub_id OR hub_id IS NULL)
    )
  );

CREATE POLICY "down_payment_requests_supervisor_update" ON down_payment_requests
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT id FROM profiles 
      WHERE role IN ('supervisor', 'hubSupervisor')
      AND (hub_id = down_payment_requests.hub_id OR hub_id IS NULL)
    )
    AND status IN ('pending_supervisor', 'pending_admin')
  );

-- Admins can view and process all requests
CREATE POLICY "down_payment_requests_admin_all" ON down_payment_requests
  FOR ALL USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role IN ('admin', 'financialAdmin', 'ict')
    )
  );

-- Cost Adjustment Audit Policies
-- Only admins can create adjustment records
CREATE POLICY "cost_adjustment_audit_admin_create" ON cost_adjustment_audit
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role IN ('admin', 'financialAdmin', 'ict')
    )
  );

-- All authenticated users can view audit records (transparency)
CREATE POLICY "cost_adjustment_audit_view" ON cost_adjustment_audit
  FOR SELECT USING (auth.role() = 'authenticated');

-- Super-Admins Policies
-- Only existing super-admins can view/manage super-admin records
CREATE POLICY "super_admins_view" ON super_admins
  FOR SELECT USING (
    auth.uid() IN (
      SELECT user_id FROM super_admins WHERE is_active = true
    )
  );

CREATE POLICY "super_admins_manage" ON super_admins
  FOR ALL USING (
    auth.uid() IN (
      SELECT user_id FROM super_admins WHERE is_active = true
    )
  );

-- Deletion Audit Log Policies
-- Only super-admins can create deletion records
CREATE POLICY "deletion_audit_log_super_admin_create" ON deletion_audit_log
  FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM super_admins WHERE is_active = true
    )
  );

-- Super-admins and admins can view deletion logs
CREATE POLICY "deletion_audit_log_view" ON deletion_audit_log
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role IN ('admin', 'financialAdmin', 'ict')
      UNION
      SELECT user_id FROM super_admins WHERE is_active = true
    )
  );

-- ============================================================================
-- 8. HELPER FUNCTIONS
-- ============================================================================

-- Function to get active super-admin count
CREATE OR REPLACE FUNCTION get_active_super_admin_count()
RETURNS INTEGER AS $$
BEGIN
  RETURN (SELECT COUNT(*) FROM super_admins WHERE is_active = true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is super-admin
CREATE OR REPLACE FUNCTION is_super_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM super_admins 
    WHERE user_id = user_uuid AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to auto-assign supervisor based on hub
CREATE OR REPLACE FUNCTION assign_supervisor_to_down_payment_request()
RETURNS TRIGGER AS $$
DECLARE
  hub_supervisor_id UUID;
BEGIN
  -- Find supervisor for the hub
  IF NEW.hub_id IS NOT NULL THEN
    SELECT id INTO hub_supervisor_id
    FROM profiles
    WHERE role IN ('supervisor', 'hubSupervisor')
    AND hub_id = NEW.hub_id
    AND status = 'active'
    LIMIT 1;
    
    IF hub_supervisor_id IS NOT NULL THEN
      NEW.supervisor_id := hub_supervisor_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-assign supervisor
DROP TRIGGER IF EXISTS auto_assign_supervisor ON down_payment_requests;
CREATE TRIGGER auto_assign_supervisor
  BEFORE INSERT ON down_payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION assign_supervisor_to_down_payment_request();

-- Function to update remaining amount
CREATE OR REPLACE FUNCTION update_down_payment_remaining_amount()
RETURNS TRIGGER AS $$
BEGIN
  NEW.remaining_amount := NEW.requested_amount - COALESCE(NEW.total_paid_amount, 0);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-calculate remaining amount
DROP TRIGGER IF EXISTS calculate_remaining_amount ON down_payment_requests;
CREATE TRIGGER calculate_remaining_amount
  BEFORE INSERT OR UPDATE ON down_payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_down_payment_remaining_amount();

-- ============================================================================
-- 9. INITIAL DATA / SEED
-- ============================================================================

-- No initial seed data needed for this migration

-- ============================================================================
-- 10. MIGRATION COMPLETE
-- ============================================================================

-- Add comment to track migration
COMMENT ON TABLE down_payment_requests IS 'Down-payment request system - Migration 20251125';
COMMENT ON TABLE cost_adjustment_audit IS 'Cost adjustment audit trail - Migration 20251125';
COMMENT ON TABLE super_admins IS 'Super-admin role with 3-account limit - Migration 20251125';
COMMENT ON TABLE deletion_audit_log IS 'Deletion audit log - Migration 20251125';

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 20251125_down_payment_and_super_admin_system completed successfully';
  RAISE NOTICE 'Created tables: down_payment_requests, cost_adjustment_audit, super_admins, deletion_audit_log';
  RAISE NOTICE 'Enhanced table: site_visit_costs (added cost_status, calculated_by, calculation_notes)';
  RAISE NOTICE 'Added RLS policies for all new tables';
  RAISE NOTICE 'Created helper functions and triggers';
END $$;
