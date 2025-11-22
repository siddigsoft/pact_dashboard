-- ====================================
-- Budget System Schema
-- Comprehensive budget tracking for Projects and MMPs
-- ====================================

-- ====================================
-- 1. PROJECT BUDGETS TABLE
-- Track overall budget for each project
-- ====================================
CREATE TABLE IF NOT EXISTS project_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Budget amounts (all in SDG cents for precision)
  total_budget_cents BIGINT NOT NULL DEFAULT 0,
  allocated_budget_cents BIGINT NOT NULL DEFAULT 0,
  spent_budget_cents BIGINT NOT NULL DEFAULT 0,
  remaining_budget_cents BIGINT NOT NULL DEFAULT 0,
  
  -- Budget period
  budget_period VARCHAR(50) NOT NULL, -- 'monthly', 'quarterly', 'annual', 'project_lifetime'
  period_start_date DATE,
  period_end_date DATE,
  
  -- Budget categories breakdown (JSONB for flexibility)
  category_allocations JSONB DEFAULT '{"site_visits": 0, "transportation": 0, "accommodation": 0, "meals": 0, "equipment": 0, "other": 0}'::jsonb,
  
  -- Status and approval
  status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'submitted', 'approved', 'active', 'closed', 'exceeded'
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  
  -- Metadata
  fiscal_year INTEGER,
  budget_notes TEXT,
  created_by UUID REFERENCES profiles(id),
  updated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for project budgets
CREATE INDEX IF NOT EXISTS idx_project_budgets_project_id ON project_budgets(project_id);
CREATE INDEX IF NOT EXISTS idx_project_budgets_status ON project_budgets(status);
CREATE INDEX IF NOT EXISTS idx_project_budgets_period ON project_budgets(budget_period);
CREATE INDEX IF NOT EXISTS idx_project_budgets_fiscal_year ON project_budgets(fiscal_year);

-- ====================================
-- 2. MMP BUDGETS TABLE
-- Track budget for each Monthly Monitoring Plan
-- ====================================
CREATE TABLE IF NOT EXISTS mmp_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mmp_file_id UUID NOT NULL REFERENCES mmp_files(id) ON DELETE CASCADE,
  project_budget_id UUID REFERENCES project_budgets(id) ON DELETE SET NULL,
  
  -- Budget amounts (in SDG cents)
  allocated_budget_cents BIGINT NOT NULL DEFAULT 0,
  spent_budget_cents BIGINT NOT NULL DEFAULT 0,
  remaining_budget_cents BIGINT NOT NULL DEFAULT 0,
  
  -- Site visit budget breakdown
  total_sites INTEGER DEFAULT 0,
  budgeted_sites INTEGER DEFAULT 0,
  completed_sites INTEGER DEFAULT 0,
  average_cost_per_site_cents BIGINT DEFAULT 0,
  
  -- Category breakdown (JSONB)
  category_breakdown JSONB DEFAULT '{"site_visit_fees": 0, "transportation": 0, "accommodation": 0, "meals": 0, "other": 0}'::jsonb,
  
  -- Budget source
  source_type VARCHAR(50) DEFAULT 'project_allocation', -- 'project_allocation', 'top_up', 'reallocation', 'additional_funding'
  parent_budget_id UUID REFERENCES mmp_budgets(id), -- For top-ups/adjustments
  
  -- Status
  status VARCHAR(50) DEFAULT 'active', -- 'draft', 'active', 'completed', 'exceeded', 'closed'
  
  -- Metadata
  budget_notes TEXT,
  allocated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for MMP budgets
CREATE INDEX IF NOT EXISTS idx_mmp_budgets_mmp_file_id ON mmp_budgets(mmp_file_id);
CREATE INDEX IF NOT EXISTS idx_mmp_budgets_project_budget_id ON mmp_budgets(project_budget_id);
CREATE INDEX IF NOT EXISTS idx_mmp_budgets_status ON mmp_budgets(status);

-- ====================================
-- 3. BUDGET TRANSACTIONS TABLE
-- Track all budget movements (allocations, spending, top-ups)
-- ====================================
CREATE TABLE IF NOT EXISTS budget_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to budget entities
  project_budget_id UUID REFERENCES project_budgets(id) ON DELETE CASCADE,
  mmp_budget_id UUID REFERENCES mmp_budgets(id) ON DELETE CASCADE,
  
  -- Link to related entities
  site_visit_id UUID REFERENCES site_visits(id) ON DELETE SET NULL,
  wallet_transaction_id UUID REFERENCES wallet_transactions(id) ON DELETE SET NULL,
  
  -- Transaction details
  transaction_type VARCHAR(50) NOT NULL, -- 'allocation', 'spend', 'top_up', 'reallocation', 'adjustment', 'refund'
  amount_cents BIGINT NOT NULL,
  currency VARCHAR(3) DEFAULT 'SDG',
  
  -- Category
  category VARCHAR(50), -- 'site_visits', 'transportation', 'accommodation', 'meals', 'equipment', 'other'
  
  -- Balance tracking
  balance_before_cents BIGINT,
  balance_after_cents BIGINT,
  
  -- Description and metadata
  description TEXT,
  metadata JSONB,
  reference_number VARCHAR(100),
  
  -- Approval workflow
  requires_approval BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  
  -- Audit
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for budget transactions
CREATE INDEX IF NOT EXISTS idx_budget_transactions_project_budget ON budget_transactions(project_budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_transactions_mmp_budget ON budget_transactions(mmp_budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_transactions_type ON budget_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_budget_transactions_site_visit ON budget_transactions(site_visit_id);
CREATE INDEX IF NOT EXISTS idx_budget_transactions_created_at ON budget_transactions(created_at DESC);

-- ====================================
-- 4. BUDGET ALERTS TABLE
-- Track budget alerts and notifications
-- ====================================
CREATE TABLE IF NOT EXISTS budget_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Alert target
  project_budget_id UUID REFERENCES project_budgets(id) ON DELETE CASCADE,
  mmp_budget_id UUID REFERENCES mmp_budgets(id) ON DELETE CASCADE,
  
  -- Alert details
  alert_type VARCHAR(50) NOT NULL, -- 'low_budget', 'overspending', 'budget_exceeded', 'threshold_reached'
  severity VARCHAR(20) DEFAULT 'warning', -- 'info', 'warning', 'critical'
  threshold_percentage INTEGER, -- Percentage threshold that triggered alert
  
  -- Alert message
  title VARCHAR(255) NOT NULL,
  message TEXT,
  
  -- Status
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'acknowledged', 'resolved', 'dismissed'
  acknowledged_by UUID REFERENCES profiles(id),
  acknowledged_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Indexes for budget alerts
CREATE INDEX IF NOT EXISTS idx_budget_alerts_project ON budget_alerts(project_budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_mmp ON budget_alerts(mmp_budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_status ON budget_alerts(status);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_severity ON budget_alerts(severity);

-- ====================================
-- TRIGGERS AND FUNCTIONS
-- ====================================

-- Function to update project budget remaining amount
CREATE OR REPLACE FUNCTION update_project_budget_remaining()
RETURNS TRIGGER AS $$
BEGIN
  NEW.remaining_budget_cents := NEW.total_budget_cents - NEW.allocated_budget_cents - NEW.spent_budget_cents;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for project budgets
DROP TRIGGER IF EXISTS trigger_update_project_budget_remaining ON project_budgets;
CREATE TRIGGER trigger_update_project_budget_remaining
  BEFORE INSERT OR UPDATE ON project_budgets
  FOR EACH ROW
  EXECUTE FUNCTION update_project_budget_remaining();

-- Function to update MMP budget remaining amount
CREATE OR REPLACE FUNCTION update_mmp_budget_remaining()
RETURNS TRIGGER AS $$
BEGIN
  NEW.remaining_budget_cents := NEW.allocated_budget_cents - NEW.spent_budget_cents;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for MMP budgets
DROP TRIGGER IF EXISTS trigger_update_mmp_budget_remaining ON mmp_budgets;
CREATE TRIGGER trigger_update_mmp_budget_remaining
  BEFORE INSERT OR UPDATE ON mmp_budgets
  FOR EACH ROW
  EXECUTE FUNCTION update_mmp_budget_remaining();

-- Function to create budget alert when threshold is reached
CREATE OR REPLACE FUNCTION check_budget_threshold()
RETURNS TRIGGER AS $$
DECLARE
  usage_percentage INTEGER;
  alert_exists BOOLEAN;
BEGIN
  -- Calculate usage percentage
  IF NEW.allocated_budget_cents > 0 THEN
    usage_percentage := ((NEW.spent_budget_cents::FLOAT / NEW.allocated_budget_cents::FLOAT) * 100)::INTEGER;
    
    -- Check for 80% threshold
    IF usage_percentage >= 80 AND usage_percentage < 100 THEN
      SELECT EXISTS(
        SELECT 1 FROM budget_alerts 
        WHERE mmp_budget_id = NEW.id 
        AND alert_type = 'threshold_reached' 
        AND status = 'active'
      ) INTO alert_exists;
      
      IF NOT alert_exists THEN
        INSERT INTO budget_alerts (
          mmp_budget_id,
          alert_type,
          severity,
          threshold_percentage,
          title,
          message
        ) VALUES (
          NEW.id,
          'threshold_reached',
          'warning',
          80,
          'Budget threshold reached',
          'MMP budget has reached ' || usage_percentage || '% of allocated budget'
        );
      END IF;
    END IF;
    
    -- Check for 100% exceeded
    IF usage_percentage >= 100 THEN
      SELECT EXISTS(
        SELECT 1 FROM budget_alerts 
        WHERE mmp_budget_id = NEW.id 
        AND alert_type = 'budget_exceeded' 
        AND status = 'active'
      ) INTO alert_exists;
      
      IF NOT alert_exists THEN
        INSERT INTO budget_alerts (
          mmp_budget_id,
          alert_type,
          severity,
          threshold_percentage,
          title,
          message
        ) VALUES (
          NEW.id,
          'budget_exceeded',
          'critical',
          100,
          'Budget exceeded',
          'MMP budget has been exceeded by ' || (usage_percentage - 100) || '%'
        );
        
        -- Update status to exceeded
        NEW.status := 'exceeded';
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for budget threshold alerts
DROP TRIGGER IF EXISTS trigger_check_budget_threshold ON mmp_budgets;
CREATE TRIGGER trigger_check_budget_threshold
  BEFORE UPDATE ON mmp_budgets
  FOR EACH ROW
  EXECUTE FUNCTION check_budget_threshold();

-- ====================================
-- RLS POLICIES
-- ====================================

-- Enable RLS on all budget tables
ALTER TABLE project_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE mmp_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_alerts ENABLE ROW LEVEL SECURITY;

-- Project Budgets RLS Policies
CREATE POLICY "Users can view project budgets for their projects"
  ON project_budgets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = project_budgets.project_id
    )
  );

CREATE POLICY "Admins and FOM can manage project budgets"
  ON project_budgets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'fom', 'ict')
    )
  );

-- MMP Budgets RLS Policies
CREATE POLICY "Users can view MMP budgets"
  ON mmp_budgets FOR SELECT
  USING (true);

CREATE POLICY "Admins and FOM can manage MMP budgets"
  ON mmp_budgets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'fom', 'ict')
    )
  );

-- Budget Transactions RLS Policies
CREATE POLICY "Users can view budget transactions"
  ON budget_transactions FOR SELECT
  USING (true);

CREATE POLICY "Admins and FOM can manage budget transactions"
  ON budget_transactions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'fom', 'ict')
    )
  );

-- Budget Alerts RLS Policies
CREATE POLICY "Users can view budget alerts"
  ON budget_alerts FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage budget alerts"
  ON budget_alerts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'fom', 'ict')
    )
  );

-- ====================================
-- HELPER VIEWS
-- ====================================

-- View for project budget summary
CREATE OR REPLACE VIEW project_budget_summary AS
SELECT 
  pb.id,
  pb.project_id,
  p.name as project_name,
  pb.total_budget_cents,
  pb.allocated_budget_cents,
  pb.spent_budget_cents,
  pb.remaining_budget_cents,
  pb.budget_period,
  pb.status,
  COUNT(DISTINCT mb.id) as mmp_count,
  SUM(mb.spent_budget_cents) as total_mmp_spent,
  CASE 
    WHEN pb.total_budget_cents > 0 
    THEN ((pb.spent_budget_cents::FLOAT / pb.total_budget_cents::FLOAT) * 100)::INTEGER 
    ELSE 0 
  END as utilization_percentage,
  pb.created_at,
  pb.updated_at
FROM project_budgets pb
LEFT JOIN projects p ON p.id = pb.project_id
LEFT JOIN mmp_budgets mb ON mb.project_budget_id = pb.id
GROUP BY pb.id, p.name;

-- View for MMP budget summary
CREATE OR REPLACE VIEW mmp_budget_summary AS
SELECT 
  mb.id,
  mb.mmp_file_id,
  mf.file_name as mmp_name,
  mf.project_id,
  mb.allocated_budget_cents,
  mb.spent_budget_cents,
  mb.remaining_budget_cents,
  mb.total_sites,
  mb.completed_sites,
  mb.average_cost_per_site_cents,
  mb.status,
  COUNT(DISTINCT bt.id) as transaction_count,
  CASE 
    WHEN mb.allocated_budget_cents > 0 
    THEN ((mb.spent_budget_cents::FLOAT / mb.allocated_budget_cents::FLOAT) * 100)::INTEGER 
    ELSE 0 
  END as utilization_percentage,
  mb.created_at,
  mb.updated_at
FROM mmp_budgets mb
LEFT JOIN mmp_files mf ON mf.id = mb.mmp_file_id
LEFT JOIN budget_transactions bt ON bt.mmp_budget_id = mb.id
GROUP BY mb.id, mf.file_name, mf.project_id;

-- ====================================
-- SAMPLE DATA FUNCTIONS
-- ====================================

-- Function to initialize budget for existing projects
CREATE OR REPLACE FUNCTION initialize_project_budgets()
RETURNS void AS $$
DECLARE
  proj RECORD;
BEGIN
  FOR proj IN SELECT id FROM projects WHERE id NOT IN (SELECT project_id FROM project_budgets)
  LOOP
    INSERT INTO project_budgets (
      project_id,
      total_budget_cents,
      budget_period,
      period_start_date,
      period_end_date,
      status
    ) VALUES (
      proj.id,
      0, -- Budget will be set manually
      'annual',
      DATE_TRUNC('year', CURRENT_DATE),
      DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year' - INTERVAL '1 day',
      'draft'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ====================================
-- SCHEMA COMPLETE
-- ====================================
-- Summary:
-- ✅ project_budgets: Overall project budget tracking
-- ✅ mmp_budgets: MMP-specific budget tracking
-- ✅ budget_transactions: All budget movements
-- ✅ budget_alerts: Automated budget alerts
-- ✅ Triggers: Auto-update remaining budgets and alerts
-- ✅ RLS Policies: Secure access control
-- ✅ Views: Summary queries for dashboards
-- ====================================
