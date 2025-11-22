-- ====================================
-- FINAL SAFE SETUP - WALLET & BUDGET TABLES ONLY
-- Skips mmp_site_entries completely (already exists)
-- ====================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'FINAL SAFE SETUP';
  RAISE NOTICE 'Creating ONLY wallet and budget tables';
  RAISE NOTICE 'Skipping mmp_site_entries (already exists)';
  RAISE NOTICE '========================================';
END $$;

-- ====================================
-- TABLE 1: wallet_balances
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
    
    CREATE INDEX idx_wallet_balances_user_id ON wallet_balances(user_id);
    CREATE INDEX idx_wallet_balances_status ON wallet_balances(status);
    
    ALTER TABLE public.wallet_balances ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY wallet_balances_all_auth ON public.wallet_balances
      FOR ALL USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
    
    RAISE NOTICE '✓ Created table: wallet_balances';
  ELSE
    RAISE NOTICE '→ Table wallet_balances already exists - skipping';
  END IF;
END $$;

-- ====================================
-- TABLE 2: wallet_transactions
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
    
    CREATE INDEX idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id);
    CREATE INDEX idx_wallet_transactions_user_id ON wallet_transactions(user_id);
    CREATE INDEX idx_wallet_transactions_type ON wallet_transactions(transaction_type);
    CREATE INDEX idx_wallet_transactions_status ON wallet_transactions(status);
    CREATE INDEX idx_wallet_transactions_created_at ON wallet_transactions(created_at DESC);
    
    ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY wallet_transactions_all_auth ON public.wallet_transactions
      FOR ALL USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
    
    RAISE NOTICE '✓ Created table: wallet_transactions';
  ELSE
    RAISE NOTICE '→ Table wallet_transactions already exists - skipping';
  END IF;
END $$;

-- ====================================
-- TABLE 3: project_budgets
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
    
    CREATE INDEX idx_project_budgets_project_id ON project_budgets(project_id);
    CREATE INDEX idx_project_budgets_status ON project_budgets(status);
    CREATE INDEX idx_project_budgets_period ON project_budgets(budget_period);
    CREATE INDEX idx_project_budgets_fiscal_year ON project_budgets(fiscal_year);
    
    ALTER TABLE public.project_budgets ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY project_budgets_all_auth ON project_budgets
      FOR ALL USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
    
    RAISE NOTICE '✓ Created table: project_budgets';
  ELSE
    RAISE NOTICE '→ Table project_budgets already exists - skipping';
  END IF;
END $$;

-- ====================================
-- TABLE 4: mmp_budgets
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
    
    CREATE INDEX idx_mmp_budgets_mmp_file_id ON mmp_budgets(mmp_file_id);
    CREATE INDEX idx_mmp_budgets_project_budget_id ON mmp_budgets(project_budget_id);
    CREATE INDEX idx_mmp_budgets_status ON mmp_budgets(status);
    
    ALTER TABLE public.mmp_budgets ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY mmp_budgets_all_auth ON public.mmp_budgets
      FOR ALL USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
    
    RAISE NOTICE '✓ Created table: mmp_budgets';
  ELSE
    RAISE NOTICE '→ Table mmp_budgets already exists - skipping';
  END IF;
END $$;

-- ====================================
-- TABLE 5: budget_transactions
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
    
    CREATE INDEX idx_budget_transactions_project_budget ON budget_transactions(project_budget_id);
    CREATE INDEX idx_budget_transactions_mmp_budget ON budget_transactions(mmp_budget_id);
    CREATE INDEX idx_budget_transactions_type ON budget_transactions(transaction_type);
    CREATE INDEX idx_budget_transactions_site_visit ON budget_transactions(site_visit_id);
    CREATE INDEX idx_budget_transactions_created_at ON budget_transactions(created_at DESC);
    
    ALTER TABLE public.budget_transactions ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY budget_transactions_all_auth ON budget_transactions
      FOR ALL USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
    
    RAISE NOTICE '✓ Created table: budget_transactions';
  ELSE
    RAISE NOTICE '→ Table budget_transactions already exists - skipping';
  END IF;
END $$;

-- ====================================
-- TABLE 6: budget_alerts
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
    
    CREATE INDEX idx_budget_alerts_project ON budget_alerts(project_budget_id);
    CREATE INDEX idx_budget_alerts_mmp ON budget_alerts(mmp_budget_id);
    CREATE INDEX idx_budget_alerts_status ON budget_alerts(status);
    CREATE INDEX idx_budget_alerts_severity ON budget_alerts(severity);
    
    ALTER TABLE public.budget_alerts ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY budget_alerts_all_auth ON budget_alerts
      FOR ALL USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
    
    RAISE NOTICE '✓ Created table: budget_alerts';
  ELSE
    RAISE NOTICE '→ Table budget_alerts already exists - skipping';
  END IF;
END $$;

-- ====================================
-- SUCCESS REPORT
-- ====================================
DO $$
DECLARE
  v_wallet_balances BOOLEAN;
  v_wallet_transactions BOOLEAN;
  v_project_budgets BOOLEAN;
  v_mmp_budgets BOOLEAN;
  v_budget_transactions BOOLEAN;
  v_budget_alerts BOOLEAN;
  v_count INTEGER := 0;
BEGIN
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'wallet_balances'
  ) INTO v_wallet_balances;
  
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'wallet_transactions'
  ) INTO v_wallet_transactions;
  
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'project_budgets'
  ) INTO v_project_budgets;
  
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'mmp_budgets'
  ) INTO v_mmp_budgets;
  
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'budget_transactions'
  ) INTO v_budget_transactions;
  
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'budget_alerts'
  ) INTO v_budget_alerts;

  IF v_wallet_balances THEN v_count := v_count + 1; END IF;
  IF v_wallet_transactions THEN v_count := v_count + 1; END IF;
  IF v_project_budgets THEN v_count := v_count + 1; END IF;
  IF v_mmp_budgets THEN v_count := v_count + 1; END IF;
  IF v_budget_transactions THEN v_count := v_count + 1; END IF;
  IF v_budget_alerts THEN v_count := v_count + 1; END IF;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'SETUP COMPLETED SUCCESSFULLY!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Wallet System:';
  RAISE NOTICE '  ✓ wallet_balances: %', CASE WHEN v_wallet_balances THEN 'READY' ELSE 'MISSING!' END;
  RAISE NOTICE '  ✓ wallet_transactions: %', CASE WHEN v_wallet_transactions THEN 'READY' ELSE 'MISSING!' END;
  RAISE NOTICE '';
  RAISE NOTICE 'Budget System:';
  RAISE NOTICE '  ✓ project_budgets: %', CASE WHEN v_project_budgets THEN 'READY' ELSE 'MISSING!' END;
  RAISE NOTICE '  ✓ mmp_budgets: %', CASE WHEN v_mmp_budgets THEN 'READY' ELSE 'MISSING!' END;
  RAISE NOTICE '  ✓ budget_transactions: %', CASE WHEN v_budget_transactions THEN 'READY' ELSE 'MISSING!' END;
  RAISE NOTICE '  ✓ budget_alerts: %', CASE WHEN v_budget_alerts THEN 'READY' ELSE 'MISSING!' END;
  RAISE NOTICE '';
  RAISE NOTICE 'Total tables created: % of 6', v_count;
  RAISE NOTICE '';
  
  IF v_count = 6 THEN
    RAISE NOTICE '🎉 ALL SYSTEMS READY!';
    RAISE NOTICE 'Your PACT platform budget and wallet systems are active.';
  ELSE
    RAISE NOTICE '⚠ WARNING: Some tables may be missing!';
  END IF;
  
  RAISE NOTICE '========================================';
END $$;
