-- Migration: Down-Payment Request System & Super-Admin Role (SAFE VERSION)
-- Date: 2025-11-25
-- This version safely handles existing objects without causing deadlocks

-- ============================================================================
-- STEP 1: DROP POLICIES FIRST (No table locks needed)
-- ============================================================================

-- Drop existing policies (safe - doesn't lock tables)
DROP POLICY IF EXISTS "down_payment_requests_user_view" ON down_payment_requests;
DROP POLICY IF EXISTS "down_payment_requests_user_create" ON down_payment_requests;
DROP POLICY IF EXISTS "down_payment_requests_supervisor_view" ON down_payment_requests;
DROP POLICY IF EXISTS "down_payment_requests_supervisor_update" ON down_payment_requests;
DROP POLICY IF EXISTS "down_payment_requests_admin_all" ON down_payment_requests;
DROP POLICY IF EXISTS "cost_adjustment_audit_admin_create" ON cost_adjustment_audit;
DROP POLICY IF EXISTS "cost_adjustment_audit_view" ON cost_adjustment_audit;
DROP POLICY IF EXISTS "super_admins_view" ON super_admins;
DROP POLICY IF EXISTS "super_admins_view_own" ON super_admins;
DROP POLICY IF EXISTS "super_admins_view_admin" ON super_admins;
DROP POLICY IF EXISTS "super_admins_manage" ON super_admins;
DROP POLICY IF EXISTS "deletion_audit_log_super_admin_create" ON deletion_audit_log;
DROP POLICY IF EXISTS "deletion_audit_log_view" ON deletion_audit_log;

-- ============================================================================
-- STEP 2: DROP TRIGGERS (Safe - no table locks)
-- ============================================================================

DROP TRIGGER IF EXISTS check_super_admin_limit ON super_admins;
DROP TRIGGER IF EXISTS auto_assign_supervisor ON down_payment_requests;
DROP TRIGGER IF EXISTS calculate_remaining_amount ON down_payment_requests;

-- ============================================================================
-- STEP 3: DROP FUNCTIONS (Safe - no table locks)
-- ============================================================================

DROP FUNCTION IF EXISTS enforce_super_admin_limit();
DROP FUNCTION IF EXISTS get_active_super_admin_count();
DROP FUNCTION IF EXISTS is_super_admin(UUID);
DROP FUNCTION IF EXISTS assign_supervisor_to_down_payment_request();
DROP FUNCTION IF EXISTS update_down_payment_remaining_amount();

-- ============================================================================
-- STEP 4: ENHANCE EXISTING TABLES (Safe - uses IF NOT EXISTS)
-- ============================================================================

-- Add columns to site_visit_costs if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'site_visit_costs' AND column_name = 'cost_status'
  ) THEN
    ALTER TABLE site_visit_costs ADD COLUMN cost_status TEXT DEFAULT 'estimated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'site_visit_costs' AND column_name = 'calculated_by'
  ) THEN
    ALTER TABLE site_visit_costs ADD COLUMN calculated_by UUID REFERENCES profiles(id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'site_visit_costs' AND column_name = 'calculation_notes'
  ) THEN
    ALTER TABLE site_visit_costs ADD COLUMN calculation_notes TEXT;
  END IF;
END $$;

-- ============================================================================
-- STEP 5: CREATE TABLES (Uses CREATE TABLE IF NOT EXISTS - Safe)
-- ============================================================================

-- Down-Payment Requests Table
CREATE TABLE IF NOT EXISTS down_payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  site_visit_id UUID,
  mmp_site_entry_id UUID,
  site_name TEXT,
  
  requested_by UUID REFERENCES profiles(id) NOT NULL,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  requester_role TEXT,
  hub_id TEXT,
  hub_name TEXT,
  
  total_transportation_budget NUMERIC(12,2) NOT NULL,
  requested_amount NUMERIC(12,2) NOT NULL,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('full_advance', 'installments')),
  
  installment_plan JSONB DEFAULT '[]',
  paid_installments JSONB DEFAULT '[]',
  
  justification TEXT NOT NULL,
  supporting_documents JSONB DEFAULT '[]',
  
  supervisor_id UUID REFERENCES profiles(id),
  supervisor_status TEXT CHECK (supervisor_status IN ('pending', 'approved', 'rejected', 'changes_requested')),
  supervisor_approved_by UUID REFERENCES profiles(id),
  supervisor_approved_at TIMESTAMPTZ,
  supervisor_notes TEXT,
  supervisor_rejection_reason TEXT,
  
  admin_status TEXT CHECK (admin_status IN ('pending', 'approved', 'rejected')),
  admin_processed_by UUID REFERENCES profiles(id),
  admin_processed_at TIMESTAMPTZ,
  admin_notes TEXT,
  admin_rejection_reason TEXT,
  
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
  
  wallet_transaction_ids JSONB DEFAULT '[]',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  metadata JSONB DEFAULT '{}'
);

-- Create indexes if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_down_payment_requests_requester') THEN
    CREATE INDEX idx_down_payment_requests_requester ON down_payment_requests(requested_by);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_down_payment_requests_supervisor') THEN
    CREATE INDEX idx_down_payment_requests_supervisor ON down_payment_requests(supervisor_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_down_payment_requests_status') THEN
    CREATE INDEX idx_down_payment_requests_status ON down_payment_requests(status);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_down_payment_requests_site_visit') THEN
    CREATE INDEX idx_down_payment_requests_site_visit ON down_payment_requests(site_visit_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_down_payment_requests_mmp_entry') THEN
    CREATE INDEX idx_down_payment_requests_mmp_entry ON down_payment_requests(mmp_site_entry_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_down_payment_requests_hub') THEN
    CREATE INDEX idx_down_payment_requests_hub ON down_payment_requests(hub_id);
  END IF;
END $$;

-- Cost Adjustment Audit Table
CREATE TABLE IF NOT EXISTS cost_adjustment_audit (
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_cost_adjustment_audit_site_visit_cost') THEN
    CREATE INDEX idx_cost_adjustment_audit_site_visit_cost ON cost_adjustment_audit(site_visit_cost_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_cost_adjustment_audit_adjusted_by') THEN
    CREATE INDEX idx_cost_adjustment_audit_adjusted_by ON cost_adjustment_audit(adjusted_by);
  END IF;
END $$;

-- Super-Admins Table
CREATE TABLE IF NOT EXISTS super_admins (
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_super_admins_user') THEN
    CREATE INDEX idx_super_admins_user ON super_admins(user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_super_admins_active') THEN
    CREATE INDEX idx_super_admins_active ON super_admins(is_active) WHERE is_active = true;
  END IF;
END $$;

-- Deletion Audit Log Table
CREATE TABLE IF NOT EXISTS deletion_audit_log (
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_deletion_audit_log_table') THEN
    CREATE INDEX idx_deletion_audit_log_table ON deletion_audit_log(table_name);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_deletion_audit_log_deleted_by') THEN
    CREATE INDEX idx_deletion_audit_log_deleted_by ON deletion_audit_log(deleted_by);
  END IF;
END $$;

-- ============================================================================
-- STEP 6: CREATE FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_super_admin_limit()
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

CREATE OR REPLACE FUNCTION get_active_super_admin_count()
RETURNS INTEGER AS $$
BEGIN
  RETURN (SELECT COUNT(*) FROM super_admins WHERE is_active = true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_super_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM super_admins 
    WHERE user_id = user_uuid AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION assign_supervisor_to_down_payment_request()
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

CREATE OR REPLACE FUNCTION update_down_payment_remaining_amount()
RETURNS TRIGGER AS $$
BEGIN
  NEW.remaining_amount := NEW.requested_amount - COALESCE(NEW.total_paid_amount, 0);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 7: CREATE TRIGGERS
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
-- STEP 8: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE down_payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_adjustment_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE deletion_audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 9: CREATE RLS POLICIES (Fixed - No Infinite Recursion)
-- ============================================================================

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

-- Super-Admins Policies (Fixed to avoid infinite recursion)
CREATE POLICY "super_admins_view_own" ON super_admins
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "super_admins_view_admin" ON super_admins
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'ict')
    )
  );

CREATE POLICY "super_admins_manage" ON super_admins
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'ict')
    )
  );

-- Deletion Audit Log Policies
CREATE POLICY "deletion_audit_log_super_admin_create" ON deletion_audit_log
  FOR INSERT WITH CHECK (
    deleted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'ict')
    )
  );

CREATE POLICY "deletion_audit_log_view" ON deletion_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'financialAdmin', 'ict')
    )
  );

-- ============================================================================
-- 10. COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration completed successfully (SAFE VERSION)';
  RAISE NOTICE '✅ Tables: down_payment_requests, cost_adjustment_audit, super_admins, deletion_audit_log';
  RAISE NOTICE '✅ Enhanced: site_visit_costs (cost_status, calculated_by, calculation_notes)';
  RAISE NOTICE '✅ RLS policies, triggers, and functions created';
  RAISE NOTICE '✅ No infinite recursion - policies check profiles table';
  RAISE NOTICE '✅ Safe for concurrent connections - uses IF NOT EXISTS';
END $$;
