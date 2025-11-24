-- =========================================
-- SITE VISIT COST APPROVAL SYSTEM FOR SUPABASE
-- =========================================
-- Created: 2025-11-23
-- Description: Adds cost submission and approval workflow tables

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================
-- TABLE: site_visit_cost_submissions
-- =========================================
CREATE TABLE IF NOT EXISTS public.site_visit_cost_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_visit_id UUID REFERENCES public.site_visits(id) ON DELETE CASCADE,
  mmp_file_id UUID REFERENCES public.mmp_files(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  
  -- Submitter information
  submitted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Actual costs (all in cents for precision)
  transportation_cost_cents BIGINT NOT NULL DEFAULT 0,
  accommodation_cost_cents BIGINT NOT NULL DEFAULT 0,
  meal_allowance_cents BIGINT NOT NULL DEFAULT 0,
  other_costs_cents BIGINT NOT NULL DEFAULT 0,
  total_cost_cents BIGINT NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'SDG',
  
  -- Cost breakdown and justification
  transportation_details TEXT,
  accommodation_details TEXT,
  meal_details TEXT,
  other_details TEXT,
  submission_notes TEXT,
  
  -- Supporting documents
  supporting_documents JSONB DEFAULT '[]'::jsonb,
  
  -- Approval workflow
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT,
  approval_notes TEXT,
  
  -- Payment tracking
  wallet_transaction_id UUID REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  paid_amount_cents BIGINT,
  payment_notes TEXT,
  
  -- Classification information
  classification_level VARCHAR(1),
  role_scope VARCHAR(50),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_status CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'paid', 'cancelled')),
  CONSTRAINT valid_currency CHECK (currency IN ('SDG', 'USD', 'EUR', 'GBP', 'SAR', 'AED')),
  CONSTRAINT positive_costs CHECK (
    transportation_cost_cents >= 0 AND
    accommodation_cost_cents >= 0 AND
    meal_allowance_cents >= 0 AND
    other_costs_cents >= 0 AND
    total_cost_cents >= 0
  )
);

-- =========================================
-- TABLE: cost_approval_history
-- =========================================
CREATE TABLE IF NOT EXISTS public.cost_approval_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES public.site_visit_cost_submissions(id) ON DELETE CASCADE,
  
  -- Action details
  action VARCHAR(50) NOT NULL,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role VARCHAR(50),
  action_timestamp TIMESTAMPTZ DEFAULT NOW(),
  
  -- Before/after values
  previous_status VARCHAR(20),
  new_status VARCHAR(20),
  previous_amount_cents BIGINT,
  new_amount_cents BIGINT,
  
  -- Action justification
  notes TEXT,
  changes JSONB,
  
  -- Metadata
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================
-- INDEXES for Performance
-- =========================================
CREATE INDEX IF NOT EXISTS idx_cost_submissions_site_visit ON site_visit_cost_submissions(site_visit_id);
CREATE INDEX IF NOT EXISTS idx_cost_submissions_submitted_by ON site_visit_cost_submissions(submitted_by);
CREATE INDEX IF NOT EXISTS idx_cost_submissions_status ON site_visit_cost_submissions(status);
CREATE INDEX IF NOT EXISTS idx_cost_submissions_reviewed_by ON site_visit_cost_submissions(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_cost_submissions_created_at ON site_visit_cost_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_submissions_mmp_file ON site_visit_cost_submissions(mmp_file_id);
CREATE INDEX IF NOT EXISTS idx_cost_submissions_project ON site_visit_cost_submissions(project_id);

CREATE INDEX IF NOT EXISTS idx_cost_history_submission ON cost_approval_history(submission_id);
CREATE INDEX IF NOT EXISTS idx_cost_history_actor ON cost_approval_history(actor_id);
CREATE INDEX IF NOT EXISTS idx_cost_history_action ON cost_approval_history(action);
CREATE INDEX IF NOT EXISTS idx_cost_history_timestamp ON cost_approval_history(action_timestamp DESC);

-- =========================================
-- HELPER VIEWS
-- =========================================
CREATE OR REPLACE VIEW pending_cost_approvals AS
SELECT 
  cs.*,
  p.full_name as submitter_name,
  p.email as submitter_email,
  sv.site_name,
  sv.status as site_visit_status,
  mf.name as mmp_name,
  proj.name as project_name,
  EXTRACT(DAY FROM (NOW() - cs.submitted_at)) as days_pending
FROM site_visit_cost_submissions cs
LEFT JOIN profiles p ON cs.submitted_by = p.id
LEFT JOIN site_visits sv ON cs.site_visit_id = sv.id
LEFT JOIN mmp_files mf ON cs.mmp_file_id = mf.id
LEFT JOIN projects proj ON cs.project_id = proj.id
WHERE cs.status IN ('pending', 'under_review')
ORDER BY cs.submitted_at ASC;

-- =========================================
-- TRIGGER FUNCTIONS
-- =========================================

-- Auto-calculate total_cost_cents trigger
CREATE OR REPLACE FUNCTION calculate_total_cost_submission()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_cost_cents := 
    COALESCE(NEW.transportation_cost_cents, 0) +
    COALESCE(NEW.accommodation_cost_cents, 0) +
    COALESCE(NEW.meal_allowance_cents, 0) +
    COALESCE(NEW.other_costs_cents, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calculate_total_cost ON site_visit_cost_submissions;
CREATE TRIGGER trg_calculate_total_cost
  BEFORE INSERT OR UPDATE OF transportation_cost_cents, accommodation_cost_cents, meal_allowance_cents, other_costs_cents
  ON site_visit_cost_submissions
  FOR EACH ROW
  EXECUTE FUNCTION calculate_total_cost_submission();

-- Update updated_at timestamp trigger
CREATE OR REPLACE FUNCTION update_cost_submission_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_cost_submission_timestamp ON site_visit_cost_submissions;
CREATE TRIGGER trg_update_cost_submission_timestamp
  BEFORE UPDATE ON site_visit_cost_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_cost_submission_timestamp();

-- Record approval action in history
CREATE OR REPLACE FUNCTION record_cost_approval_action()
RETURNS TRIGGER AS $$
DECLARE
  actor_user_id UUID;
  actor_user_role TEXT;
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status != NEW.status) THEN
    actor_user_id := COALESCE(NEW.reviewed_by, auth.uid());
  ELSIF (TG_OP = 'INSERT') THEN
    actor_user_id := NEW.submitted_by;
  END IF;

  SELECT role INTO actor_user_role
  FROM user_roles
  WHERE user_id = actor_user_id
  ORDER BY 
    CASE LOWER(role)
      WHEN 'admin' THEN 1
      WHEN 'ict' THEN 2
      WHEN 'fom' THEN 3
      WHEN 'financialadmin' THEN 4
      ELSE 5
    END
  LIMIT 1;

  IF (TG_OP = 'UPDATE' AND OLD.status != NEW.status) THEN
    INSERT INTO cost_approval_history (
      submission_id, action, actor_id, actor_role,
      previous_status, new_status,
      previous_amount_cents, new_amount_cents,
      notes, changes
    ) VALUES (
      NEW.id,
      CASE NEW.status
        WHEN 'approved' THEN 'approved'
        WHEN 'rejected' THEN 'rejected'
        WHEN 'paid' THEN 'paid'
        ELSE 'status_changed'
      END,
      actor_user_id, actor_user_role,
      OLD.status, NEW.status,
      OLD.total_cost_cents, NEW.total_cost_cents,
      NEW.reviewer_notes,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status
      )
    );
  ELSIF (TG_OP = 'INSERT') THEN
    INSERT INTO cost_approval_history (
      submission_id, action, actor_id, actor_role,
      new_status, new_amount_cents, notes, changes
    ) VALUES (
      NEW.id, 'submitted', actor_user_id, actor_user_role,
      NEW.status, NEW.total_cost_cents, NEW.submission_notes,
      jsonb_build_object('submission_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_record_cost_approval_action ON site_visit_cost_submissions;
CREATE TRIGGER trg_record_cost_approval_action
  AFTER INSERT OR UPDATE ON site_visit_cost_submissions
  FOR EACH ROW
  EXECUTE FUNCTION record_cost_approval_action();

-- =========================================
-- COMMENTS
-- =========================================
COMMENT ON TABLE public.site_visit_cost_submissions IS 'Actual cost submissions by field staff for site visits requiring approval';
COMMENT ON TABLE public.cost_approval_history IS 'Audit trail of all cost submission status changes and approvals';
COMMENT ON VIEW pending_cost_approvals IS 'Helper view for finance/admin to see all pending cost approvals with submitter details';
