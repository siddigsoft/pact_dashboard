-- Migration: Down-Payment Request System & Super-Admin Role (CLEAN VERSION)
-- Date: 2025-11-25
-- This version drops existing objects before creating them to avoid conflicts

-- ============================================================================
-- 0. DROP EXISTING OBJECTS (Clean slate)
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "down_payment_requests_user_view" ON down_payment_requests;
DROP POLICY IF EXISTS "down_payment_requests_user_create" ON down_payment_requests;
DROP POLICY IF EXISTS "down_payment_requests_supervisor_view" ON down_payment_requests;
DROP POLICY IF EXISTS "down_payment_requests_supervisor_update" ON down_payment_requests;
DROP POLICY IF EXISTS "down_payment_requests_admin_all" ON down_payment_requests;
DROP POLICY IF EXISTS "cost_adjustment_audit_admin_create" ON cost_adjustment_audit;
DROP POLICY IF EXISTS "cost_adjustment_audit_view" ON cost_adjustment_audit;
DROP POLICY IF EXISTS "super_admins_view" ON super_admins;
DROP POLICY IF EXISTS "super_admins_manage" ON super_admins;
DROP POLICY IF EXISTS "deletion_audit_log_super_admin_create" ON deletion_audit_log;
DROP POLICY IF EXISTS "deletion_audit_log_view" ON deletion_audit_log;

-- Drop existing triggers
DROP TRIGGER IF EXISTS check_super_admin_limit ON super_admins;
DROP TRIGGER IF EXISTS auto_assign_supervisor ON down_payment_requests;
DROP TRIGGER IF EXISTS calculate_remaining_amount ON down_payment_requests;

-- Drop existing functions
DROP FUNCTION IF EXISTS enforce_super_admin_limit();
DROP FUNCTION IF EXISTS get_active_super_admin_count();
DROP FUNCTION IF EXISTS is_super_admin(UUID);
DROP FUNCTION IF EXISTS assign_supervisor_to_down_payment_request();
DROP FUNCTION IF EXISTS update_down_payment_remaining_amount();

-- Drop existing tables (cascade to handle foreign keys)
DROP TABLE IF EXISTS deletion_audit_log CASCADE;
DROP TABLE IF EXISTS cost_adjustment_audit CASCADE;
DROP TABLE IF EXISTS super_admins CASCADE;
DROP TABLE IF EXISTS down_payment_requests CASCADE;

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

CREATE TABLE down_payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Request details
  site_visit_id UUID,
  mmp_site_entry_id UUID,
  site_name TEXT,
  
  -- Requester information
  requested_by UUID REFERENCES profiles(id) NOT NULL,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  requester_role TEXT,
  hub_id TEXT,
  hub_name TEXT,
  
  -- Payment details
  total_transportation_budget NUMERIC(12,2) NOT NULL,
  requested_amount NUMERIC(12,2) NOT NULL,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('full_advance', 'installments')),
  
  -- Installment details
  installment_plan JSONB DEFAULT '[]',
  paid_installments JSONB DEFAULT '[]',
  
  -- Justification
  justification TEXT NOT NULL,
  supporting_documents JSONB DEFAULT '[]',
  
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
    'pending_supervisor',
    'pending_admin',
    'approved',
    'rejected',
    'partially_paid',
    'fully_paid',
    'cancelled'
  )),
  
  total_paid_amount NUMERIC(12,2) DEFAULT 0,
  remaining_amount NUMERIC(12,2),
  
  -- Wallet transactions
  wallet_transaction_ids JSONB DEFAULT '[]',
  
  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- Indexes
CREATE INDEX idx_down_payment_requests_requester ON down_payment_requests(requested_by);
CREATE INDEX idx_down_payment_requests_supervisor ON down_payment_requests(supervisor_id);
CREATE INDEX idx_down_payment_requests_status ON down_payment_requests(status);
CREATE INDEX idx_down_payment_requests_site_visit ON down_payment_requests(site_visit_id);
CREATE INDEX idx_down_payment_requests_mmp_entry ON down_payment_requests(mmp_site_entry_id);
CREATE INDEX idx_down_payment_requests_hub ON down_payment_requests(hub_id);

-- Comments
COMMENT ON TABLE down_payment_requests IS 'Tracks down-payment requests with two-tier approval workflow';
COMMENT ON COLUMN down_payment_requests.hub_id IS 'Hub identifier (TEXT to match profiles.hub_id)';

-- ============================================================================
-- 3. COST ADJUSTMENT AUDIT TABLE
-- ============================================================================

CREATE TABLE cost_adjustment_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  site_visit_cost_id UUID,
  site_visit_id UUID,
  mmp_site_entry_id UUID,
  site_name TEXT,
  
  previous_transportation_cost NUMERIC(12,2),
  previous_accommodation_cost NUMERIC(12,2),
  previous_meal_allowance NUMERIC(12,2),
  previous_other_costs NUMERIC(12,2),
  previous_total_cost NUMERIC(12,2),
  
  new_transportation_cost NUMERIC(12,2),
  new_accommodation_cost NUMERIC(12,2),
  new_meal_allowance NUMERIC(12,2),
  new_other_costs NUMERIC(12,2),
  new_total_cost NUMERIC(12,2),
  
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('increase', 'decrease', 'correction')),
  adjustment_reason TEXT NOT NULL,
  supporting_documents JSONB DEFAULT '[]',
  
  adjusted_by UUID REFERENCES profiles(id) NOT NULL,
  adjusted_by_role TEXT NOT NULL,
  adjusted_by_name TEXT,
  adjusted_at TIMESTAMPTZ DEFAULT NOW(),
  
  additional_payment_needed NUMERIC(12,2) DEFAULT 0,
  additional_payment_transaction_id UUID,
  additional_payment_processed BOOLEAN DEFAULT false,
  additional_payment_processed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_cost_adjustment_audit_site_visit_cost ON cost_adjustment_audit(site_visit_cost_id);
CREATE INDEX idx_cost_adjustment_audit_adjusted_by ON cost_adjustment_audit(adjusted_by);

COMMENT ON TABLE cost_adjustment_audit IS 'Complete audit trail of all cost adjustments';

-- ============================================================================
-- 4. SUPER-ADMIN TABLE
-- ============================================================================

CREATE TABLE super_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  user_id UUID REFERENCES profiles(id) UNIQUE NOT NULL,
  
  appointed_by UUID REFERENCES profiles(id),
  appointed_at TIMESTAMPTZ DEFAULT NOW(),
  appointment_reason TEXT NOT NULL,
  
  is_active BOOLEAN DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  deactivated_by UUID REFERENCES profiles(id),
  deactivation_reason TEXT,
  
  last_activity_at TIMESTAMPTZ,
  deletion_count INTEGER DEFAULT 0,
  adjustment_count INTEGER DEFAULT 0,
  total_actions_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_super_admins_user ON super_admins(user_id);
CREATE INDEX idx_super_admins_active ON super_admins(is_active) WHERE is_active = true;

COMMENT ON TABLE super_admins IS 'Super-admin role - Maximum 3 active accounts allowed';

-- ============================================================================
-- 5. DELETION AUDIT LOG
-- ============================================================================

CREATE TABLE deletion_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  record_data JSONB NOT NULL,
  
  deleted_by UUID REFERENCES profiles(id) NOT NULL,
  deleted_by_role TEXT NOT NULL,
  deleted_by_name TEXT,
  deletion_reason TEXT NOT NULL,
  
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  
  is_restorable BOOLEAN DEFAULT true,
  restored_at TIMESTAMPTZ,
  restored_by UUID REFERENCES profiles(id),
  restoration_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_deletion_audit_log_table ON deletion_audit_log(table_name);
CREATE INDEX idx_deletion_audit_log_deleted_by ON deletion_audit_log(deleted_by);

COMMENT ON TABLE deletion_audit_log IS 'Complete audit trail of all deletions';

-- ============================================================================
-- 6. FUNCTIONS
-- ============================================================================

CREATE FUNCTION enforce_super_admin_limit()
RETURNS TRIGGER AS $$
DECLARE
  active_count INTEGER;
BEGIN
  IF NEW.is_active = true THEN
    SELECT COUNT(*) INTO active_count
    FROM super_admins
    WHERE is_active = true
    AND (TG_OP = 'INSERT' OR id != NEW.id);
    
    IF active_count >= 3 THEN
      RAISE EXCEPTION 'Maximum 3 active super-admin accounts allowed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION get_active_super_admin_count()
RETURNS INTEGER AS $$
BEGIN
  RETURN (SELECT COUNT(*) FROM super_admins WHERE is_active = true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE FUNCTION is_super_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM super_admins 
    WHERE user_id = user_uuid AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE FUNCTION assign_supervisor_to_down_payment_request()
RETURNS TRIGGER AS $$
DECLARE
  hub_supervisor_id UUID;
BEGIN
  IF NEW.hub_id IS NOT NULL THEN
    SELECT p.id INTO hub_supervisor_id
    FROM profiles p
    WHERE p.role IN ('supervisor', 'hubSupervisor')
    AND p.hub_id = NEW.hub_id
    AND p.status = 'active'
    LIMIT 1;
    
    IF hub_supervisor_id IS NOT NULL THEN
      NEW.supervisor_id := hub_supervisor_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION update_down_payment_remaining_amount()
RETURNS TRIGGER AS $$
BEGIN
  NEW.remaining_amount := NEW.requested_amount - COALESCE(NEW.total_paid_amount, 0);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. TRIGGERS
-- ============================================================================

CREATE TRIGGER check_super_admin_limit
  BEFORE INSERT OR UPDATE ON super_admins
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION enforce_super_admin_limit();

CREATE TRIGGER auto_assign_supervisor
  BEFORE INSERT ON down_payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION assign_supervisor_to_down_payment_request();

CREATE TRIGGER calculate_remaining_amount
  BEFORE INSERT OR UPDATE ON down_payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_down_payment_remaining_amount();

-- ============================================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE down_payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_adjustment_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE deletion_audit_log ENABLE ROW LEVEL SECURITY;

-- Down-Payment Requests Policies
CREATE POLICY "down_payment_requests_user_view" ON down_payment_requests
  FOR SELECT USING (requested_by = auth.uid());

CREATE POLICY "down_payment_requests_user_create" ON down_payment_requests
  FOR INSERT WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('dataCollector', 'datacollector', 'coordinator')
    )
  );

CREATE POLICY "down_payment_requests_supervisor_view" ON down_payment_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid()
      AND role IN ('supervisor', 'hubSupervisor')
      AND (hub_id = down_payment_requests.hub_id OR profiles.hub_id IS NULL)
    )
  );

CREATE POLICY "down_payment_requests_supervisor_update" ON down_payment_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid()
      AND role IN ('supervisor', 'hubSupervisor')
      AND (hub_id = down_payment_requests.hub_id OR profiles.hub_id IS NULL)
    )
    AND status IN ('pending_supervisor', 'pending_admin')
  );

CREATE POLICY "down_payment_requests_admin_all" ON down_payment_requests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'financialAdmin', 'ict')
    )
  );

-- Cost Adjustment Audit Policies
CREATE POLICY "cost_adjustment_audit_admin_create" ON cost_adjustment_audit
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'financialAdmin', 'ict')
    )
  );

CREATE POLICY "cost_adjustment_audit_view" ON cost_adjustment_audit
  FOR SELECT USING (auth.role() = 'authenticated');

-- Super-Admins Policies
CREATE POLICY "super_admins_view" ON super_admins
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM super_admins 
      WHERE user_id = auth.uid() 
      AND is_active = true
    )
  );

CREATE POLICY "super_admins_manage" ON super_admins
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM super_admins 
      WHERE user_id = auth.uid() 
      AND is_active = true
    )
  );

-- Deletion Audit Log Policies
CREATE POLICY "deletion_audit_log_super_admin_create" ON deletion_audit_log
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM super_admins 
      WHERE user_id = auth.uid() 
      AND is_active = true
    )
  );

CREATE POLICY "deletion_audit_log_view" ON deletion_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'financialAdmin', 'ict')
    )
    OR EXISTS (
      SELECT 1 FROM super_admins 
      WHERE user_id = auth.uid() 
      AND is_active = true
    )
  );

-- ============================================================================
-- 9. COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration completed successfully';
  RAISE NOTICE '✅ Tables: down_payment_requests, cost_adjustment_audit, super_admins, deletion_audit_log';
  RAISE NOTICE '✅ Enhanced: site_visit_costs (cost_status, calculated_by, calculation_notes)';
  RAISE NOTICE '✅ RLS policies, triggers, and functions created';
  RAISE NOTICE '✅ hub_id is TEXT type (matches profiles.hub_id)';
END $$;
