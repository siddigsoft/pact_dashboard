-- ====================================
-- ULTRA SAFE DATABASE SETUP
-- Handles existing tables gracefully
-- ====================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'ULTRA SAFE SETUP STARTING';
  RAISE NOTICE 'Checking for existing tables...';
  RAISE NOTICE '========================================';
END $$;

-- ====================================
-- TABLE 1: mmp_site_entries
-- Only create if it doesn't exist at all
-- ====================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'mmp_site_entries'
  ) THEN
    CREATE TABLE public.mmp_site_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      mmp_file_id UUID REFERENCES public.mmp_files(id) ON DELETE CASCADE,
      
      -- Site information
      site_name TEXT,
      site_code TEXT,
      site_type TEXT,
      
      -- Location
      locality TEXT,
      state TEXT,
      coordinates JSONB,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      
      -- Status and assignment
      status TEXT DEFAULT 'pending',
      assigned_to UUID REFERENCES public.profiles(id),
      assigned_by UUID REFERENCES public.profiles(id),
      assigned_at TIMESTAMPTZ,
      
      -- Visit details
      visit_date DATE,
      scheduled_date DATE,
      completed_at TIMESTAMPTZ,
      
      -- Financial
      visit_fee_cents BIGINT DEFAULT 0,
      currency VARCHAR(3) DEFAULT 'SDG',
      payment_status TEXT DEFAULT 'pending',
      
      -- Permits and verification
      permit_status TEXT,
      verification_status TEXT,
      verified_by UUID REFERENCES public.profiles(id),
      verified_at TIMESTAMPTZ,
      
      -- Workflow
      dispatched_by UUID REFERENCES public.profiles(id),
      dispatched_at TIMESTAMPTZ,
      accepted_by UUID REFERENCES public.profiles(id),
      accepted_at TIMESTAMPTZ,
      
      -- Additional data
      additional_data JSONB,
      notes TEXT,
      
      -- Audit
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    );
    
    RAISE NOTICE 'Created table: mmp_site_entries';
  ELSE
    RAISE NOTICE 'Table mmp_site_entries already exists - skipping';
  END IF;
END $$;

-- Indexes for mmp_site_entries
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_mmp_file ON mmp_site_entries(mmp_file_id);
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_status ON mmp_site_entries(status);
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_assigned_to ON mmp_site_entries(assigned_to);
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_visit_date ON mmp_site_entries(visit_date);

-- RLS for mmp_site_entries
ALTER TABLE public.mmp_site_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mmp_site_entries_all_auth ON public.mmp_site_entries;
CREATE POLICY mmp_site_entries_all_auth ON public.mmp_site_entries 
  FOR ALL USING (auth.role() = 'authenticated') 
  WITH CHECK (auth.role() = 'authenticated');

-- Trigger function
CREATE OR REPLACE FUNCTION public.set_mmp_site_entries_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_mmp_site_entries_updated_at ON public.mmp_site_entries;
CREATE TRIGGER set_mmp_site_entries_updated_at
BEFORE UPDATE ON public.mmp_site_entries
FOR EACH ROW EXECUTE FUNCTION public.set_mmp_site_entries_updated_at();

-- ====================================
-- TABLE 2: wallet_balances
-- ====================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'wallet_balances'
  ) THEN
    CREATE TABLE public.wallet_balances (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      balance_cents BIGINT NOT NULL DEFAULT 0,
      currency VARCHAR(3) DEFAULT 'SDG',
      status VARCHAR(50) DEFAULT 'active',
      last_transaction_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, currency)
    );
    RAISE NOTICE 'Created table: wallet_balances';
  ELSE
    RAISE NOTICE 'Table wallet_balances already exists - skipping';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wallet_balances_user_id ON wallet_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_balances_status ON wallet_balances(status);

ALTER TABLE public.wallet_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallet_balances_all_auth ON public.wallet_balances;
CREATE POLICY wallet_balances_all_auth ON public.wallet_balances
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ====================================
-- TABLE 3: wallet_transactions
-- ====================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'wallet_transactions'
  ) THEN
    CREATE TABLE public.wallet_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      wallet_id UUID NOT NULL REFERENCES public.wallet_balances(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      transaction_type VARCHAR(50) NOT NULL,
      amount_cents BIGINT NOT NULL,
      currency VARCHAR(3) DEFAULT 'SDG',
      balance_before_cents BIGINT,
      balance_after_cents BIGINT,
      status VARCHAR(50) DEFAULT 'completed',
      description TEXT,
      metadata JSONB,
      reference_id VARCHAR(100),
      site_visit_id UUID REFERENCES public.mmp_site_entries(id) ON DELETE SET NULL,
      approved_by UUID REFERENCES public.profiles(id),
      approved_at TIMESTAMPTZ,
      processed_at TIMESTAMPTZ,
      created_by UUID REFERENCES public.profiles(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    RAISE NOTICE 'Created table: wallet_transactions';
  ELSE
    RAISE NOTICE 'Table wallet_transactions already exists - skipping';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type ON wallet_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_status ON wallet_transactions(status);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON wallet_transactions(created_at DESC);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallet_transactions_all_auth ON public.wallet_transactions;
CREATE POLICY wallet_transactions_all_auth ON public.wallet_transactions
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ====================================
-- TABLE 4: project_budgets
-- ====================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'project_budgets'
  ) THEN
    CREATE TABLE public.project_budgets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
      total_budget_cents BIGINT NOT NULL DEFAULT 0,
      allocated_budget_cents BIGINT NOT NULL DEFAULT 0,
      spent_budget_cents BIGINT NOT NULL DEFAULT 0,
      remaining_budget_cents BIGINT NOT NULL DEFAULT 0,
      budget_period VARCHAR(50) NOT NULL,
      period_start_date DATE,
      period_end_date DATE,
      category_allocations JSONB DEFAULT '{"site_visits": 0, "transportation": 0, "accommodation": 0, "meals": 0, "equipment": 0, "other": 0}'::jsonb,
      status VARCHAR(50) DEFAULT 'draft',
      approved_by UUID REFERENCES public.profiles(id),
      approved_at TIMESTAMPTZ,
      fiscal_year INTEGER,
      budget_notes TEXT,
      created_by UUID REFERENCES public.profiles(id),
      updated_by UUID REFERENCES public.profiles(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    RAISE NOTICE 'Created table: project_budgets';
  ELSE
    RAISE NOTICE 'Table project_budgets already exists - skipping';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_budgets_project_id ON project_budgets(project_id);
CREATE INDEX IF NOT EXISTS idx_project_budgets_status ON project_budgets(status);
CREATE INDEX IF NOT EXISTS idx_project_budgets_period ON project_budgets(budget_period);
CREATE INDEX IF NOT EXISTS idx_project_budgets_fiscal_year ON project_budgets(fiscal_year);

ALTER TABLE public.project_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_budgets_all_auth ON public.project_budgets;
CREATE POLICY project_budgets_all_auth ON public.project_budgets
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ====================================
-- TABLE 5: mmp_budgets
-- ====================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'mmp_budgets'
  ) THEN
    CREATE TABLE public.mmp_budgets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      mmp_file_id UUID NOT NULL REFERENCES public.mmp_files(id) ON DELETE CASCADE,
      project_budget_id UUID REFERENCES public.project_budgets(id) ON DELETE SET NULL,
      allocated_budget_cents BIGINT NOT NULL DEFAULT 0,
      spent_budget_cents BIGINT NOT NULL DEFAULT 0,
      remaining_budget_cents BIGINT NOT NULL DEFAULT 0,
      total_sites INTEGER DEFAULT 0,
      budgeted_sites INTEGER DEFAULT 0,
      completed_sites INTEGER DEFAULT 0,
      average_cost_per_site_cents BIGINT DEFAULT 0,
      category_breakdown JSONB DEFAULT '{"site_visit_fees": 0, "transportation": 0, "accommodation": 0, "meals": 0, "other": 0}'::jsonb,
      source_type VARCHAR(50) DEFAULT 'project_allocation',
      parent_budget_id UUID REFERENCES public.mmp_budgets(id) ON DELETE SET NULL,
      status VARCHAR(50) DEFAULT 'active',
      budget_notes TEXT,
      allocated_by UUID REFERENCES public.profiles(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    RAISE NOTICE 'Created table: mmp_budgets';
  ELSE
    RAISE NOTICE 'Table mmp_budgets already exists - skipping';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mmp_budgets_mmp_file_id ON mmp_budgets(mmp_file_id);
CREATE INDEX IF NOT EXISTS idx_mmp_budgets_project_budget_id ON mmp_budgets(project_budget_id);
CREATE INDEX IF NOT EXISTS idx_mmp_budgets_status ON mmp_budgets(status);

ALTER TABLE public.mmp_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mmp_budgets_all_auth ON public.mmp_budgets;
CREATE POLICY mmp_budgets_all_auth ON public.mmp_budgets
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ====================================
-- TABLE 6: budget_transactions
-- ====================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'budget_transactions'
  ) THEN
    CREATE TABLE public.budget_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_budget_id UUID REFERENCES public.project_budgets(id) ON DELETE CASCADE,
      mmp_budget_id UUID REFERENCES public.mmp_budgets(id) ON DELETE CASCADE,
      site_visit_id UUID REFERENCES public.mmp_site_entries(id) ON DELETE SET NULL,
      wallet_transaction_id UUID REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
      transaction_type VARCHAR(50) NOT NULL,
      amount_cents BIGINT NOT NULL,
      currency VARCHAR(3) DEFAULT 'SDG',
      category VARCHAR(50),
      balance_before_cents BIGINT,
      balance_after_cents BIGINT,
      description TEXT,
      metadata JSONB,
      reference_number VARCHAR(100),
      requires_approval BOOLEAN DEFAULT false,
      approved_by UUID REFERENCES public.profiles(id),
      approved_at TIMESTAMPTZ,
      created_by UUID REFERENCES public.profiles(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    RAISE NOTICE 'Created table: budget_transactions';
  ELSE
    RAISE NOTICE 'Table budget_transactions already exists - skipping';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_budget_transactions_project_budget ON budget_transactions(project_budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_transactions_mmp_budget ON budget_transactions(mmp_budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_transactions_type ON budget_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_budget_transactions_site_visit ON budget_transactions(site_visit_id);
CREATE INDEX IF NOT EXISTS idx_budget_transactions_created_at ON budget_transactions(created_at DESC);

ALTER TABLE public.budget_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budget_transactions_all_auth ON public.budget_transactions;
CREATE POLICY budget_transactions_all_auth ON public.budget_transactions
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ====================================
-- TABLE 7: budget_alerts
-- ====================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'budget_alerts'
  ) THEN
    CREATE TABLE public.budget_alerts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_budget_id UUID REFERENCES public.project_budgets(id) ON DELETE CASCADE,
      mmp_budget_id UUID REFERENCES public.mmp_budgets(id) ON DELETE CASCADE,
      alert_type VARCHAR(50) NOT NULL,
      severity VARCHAR(20) DEFAULT 'warning',
      threshold_percentage INTEGER,
      title VARCHAR(255) NOT NULL,
      message TEXT,
      status VARCHAR(20) DEFAULT 'active',
      acknowledged_by UUID REFERENCES public.profiles(id),
      acknowledged_at TIMESTAMPTZ,
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    );
    RAISE NOTICE 'Created table: budget_alerts';
  ELSE
    RAISE NOTICE 'Table budget_alerts already exists - skipping';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_budget_alerts_project ON budget_alerts(project_budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_mmp ON budget_alerts(mmp_budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_status ON budget_alerts(status);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_severity ON budget_alerts(severity);

ALTER TABLE public.budget_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budget_alerts_all_auth ON public.budget_alerts;
CREATE POLICY budget_alerts_all_auth ON public.budget_alerts
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ====================================
-- SUCCESS REPORT
-- ====================================
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM information_schema.tables 
  WHERE table_schema = 'public' 
    AND table_name IN (
      'mmp_site_entries', 'wallet_balances', 'wallet_transactions',
      'project_budgets', 'mmp_budgets', 'budget_transactions', 'budget_alerts'
    );

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'ULTRA SAFE SETUP COMPLETED!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables verified: % of 7', v_count;
  RAISE NOTICE '';
  RAISE NOTICE 'All required tables are now in place.';
  RAISE NOTICE 'Your PACT platform database is ready!';
  RAISE NOTICE '========================================';
END $$;
