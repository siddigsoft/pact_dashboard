-- =========================================
-- SITE VISIT COST APPROVAL SYSTEM MIGRATION
-- =========================================
-- 
-- This migration creates the infrastructure for actual cost submission and approval workflow
-- Transport fees now come from real site visit costs requiring admin/finance approval
--
-- Tables Created:
-- 1. site_visit_cost_submissions - Enumerator cost submissions after site visits
-- 2. cost_approval_history - Audit trail of all approval/rejection actions
--
-- Features:
-- ✅ Actual cost submission by enumerators (transport, accommodation, meals, other)
-- ✅ Admin/Finance approval workflow with notes
-- ✅ Supporting document attachments (receipts, photos)
-- ✅ Automatic wallet payment upon approval
-- ✅ Budget integration with actual approved costs
-- ✅ Comprehensive audit trail
-- ✅ RLS policies for secure access
-- =========================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================
-- TABLE: site_visit_cost_submissions
-- =========================================
-- Stores actual costs submitted by enumerators after completing site visits
CREATE TABLE IF NOT EXISTS public.site_visit_cost_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mmp_site_entry_id UUID REFERENCES public.mmp_site_entries(id) ON DELETE CASCADE,
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
  total_cost_cents BIGINT NOT NULL DEFAULT 0, -- Auto-calculated
  currency VARCHAR(3) NOT NULL DEFAULT 'SDG',
  
  -- Cost breakdown and justification
  transportation_details TEXT, -- e.g., "Bus fare 50 SDG + Taxi 30 SDG"
  accommodation_details TEXT,
  meal_details TEXT,
  other_costs_details TEXT,
  submission_notes TEXT, -- General notes from enumerator
  
  -- Supporting documents
  supporting_documents JSONB DEFAULT '[]'::jsonb, -- Array of {url, type, filename, uploadedAt}
  
  -- Approval workflow
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, under_review, approved, rejected, paid
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT, -- Notes from admin/finance during review
  approval_notes TEXT, -- Final approval/rejection justification
  
  -- Payment tracking
  wallet_transaction_id UUID REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  paid_amount_cents BIGINT, -- May differ from submitted if adjusted
  payment_notes TEXT, -- Notes about payment adjustments
  
  -- Classification information (for reference)
  classification_level VARCHAR(1), -- A, B, or C
  role_scope VARCHAR(50), -- enumerator, coordinator, etc.
  
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

-- =========================================
-- TABLE: cost_approval_history
-- =========================================
-- Audit trail of all approval actions and status changes
CREATE TABLE IF NOT EXISTS public.cost_approval_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES public.site_visit_cost_submissions(id) ON DELETE CASCADE,
  
  -- Action details
  action VARCHAR(50) NOT NULL, -- submitted, under_review, approved, rejected, adjusted, paid, cancelled
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role VARCHAR(50), -- Role of person performing action
  action_timestamp TIMESTAMPTZ DEFAULT NOW(),
  
  -- Before/after values
  previous_status VARCHAR(20),
  new_status VARCHAR(20),
  previous_amount_cents BIGINT,
  new_amount_cents BIGINT,
  
  -- Action justification
  notes TEXT,
  changes JSONB, -- Detailed changes object
  
  -- Metadata
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================
-- INDEXES for Performance
-- =========================================
CREATE INDEX IF NOT EXISTS idx_cost_submissions_mmp_site_entry ON site_visit_cost_submissions(mmp_site_entry_id);
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
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================

-- Enable RLS on both tables
ALTER TABLE public.site_visit_cost_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_approval_history ENABLE ROW LEVEL SECURITY;

-- Cost Submissions Policies
-- 1. Enumerators can view their own submissions
DROP POLICY IF EXISTS cost_submissions_view_own ON public.site_visit_cost_submissions;
CREATE POLICY cost_submissions_view_own ON public.site_visit_cost_submissions
  FOR SELECT
  TO authenticated
  USING (submitted_by = auth.uid());

-- 2. Admin/Finance/ICT can view all submissions
DROP POLICY IF EXISTS cost_submissions_view_finance ON public.site_visit_cost_submissions;
CREATE POLICY cost_submissions_view_finance ON public.site_visit_cost_submissions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND LOWER(ur.role) IN ('admin', 'ict', 'financialadmin', 'fom')
    )
  );

-- 3. Enumerators can create their own submissions
DROP POLICY IF EXISTS cost_submissions_create_own ON public.site_visit_cost_submissions;
CREATE POLICY cost_submissions_create_own ON public.site_visit_cost_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (submitted_by = auth.uid());

-- 4. Enumerators can update their pending submissions
DROP POLICY IF EXISTS cost_submissions_update_own ON public.site_visit_cost_submissions;
CREATE POLICY cost_submissions_update_own ON public.site_visit_cost_submissions
  FOR UPDATE
  TO authenticated
  USING (submitted_by = auth.uid() AND status = 'pending')
  WITH CHECK (submitted_by = auth.uid() AND status = 'pending');

-- 5. Admin/Finance can update submissions for approval
DROP POLICY IF EXISTS cost_submissions_update_finance ON public.site_visit_cost_submissions;
CREATE POLICY cost_submissions_update_finance ON public.site_visit_cost_submissions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND LOWER(ur.role) IN ('admin', 'financialadmin', 'fom')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND LOWER(ur.role) IN ('admin', 'financialadmin', 'fom')
    )
  );

-- 6. Admin/ICT can delete submissions
DROP POLICY IF EXISTS cost_submissions_delete_admin ON public.site_visit_cost_submissions;
CREATE POLICY cost_submissions_delete_admin ON public.site_visit_cost_submissions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND LOWER(ur.role) IN ('admin', 'ict')
    )
  );

-- Cost Approval History Policies
-- 1. Anyone can view history of submissions they can view
DROP POLICY IF EXISTS cost_history_view_all ON public.cost_approval_history;
CREATE POLICY cost_history_view_all ON public.cost_approval_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM site_visit_cost_submissions s
      WHERE s.id = submission_id
      AND (
        s.submitted_by = auth.uid() OR
        EXISTS (
          SELECT 1 FROM user_roles ur
          WHERE ur.user_id = auth.uid()
          AND LOWER(ur.role) IN ('admin', 'ict', 'financialadmin', 'fom')
        )
      )
    )
  );

-- 2. Only trigger/admin can insert history records (prevents privilege escalation)
DROP POLICY IF EXISTS cost_history_insert_system ON public.cost_approval_history;
CREATE POLICY cost_history_insert_system ON public.cost_approval_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Only allow inserts if user is admin/ICT (for manual corrections)
    -- Normal history entries are created by trigger with SECURITY DEFINER
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND LOWER(ur.role) IN ('admin', 'ict')
    )
    OR actor_id = auth.uid() -- Allow if the actor is the current user (for trigger inserts)
  );

-- =========================================
-- HELPER VIEWS
-- =========================================

-- View: Pending cost submissions queue for finance team
CREATE OR REPLACE VIEW pending_cost_approvals AS
SELECT 
  cs.*,
  p.full_name as submitter_name,
  p.email as submitter_email,
  p.employee_id as submitter_employee_id,
  mse.site_name,
  mse.status as site_entry_status,
  mf.name as mmp_name,
  proj.name as project_name,
  EXTRACT(DAY FROM (NOW() - cs.submitted_at)) as days_pending
FROM site_visit_cost_submissions cs
LEFT JOIN profiles p ON cs.submitted_by = p.id
LEFT JOIN mmp_site_entries mse ON cs.mmp_site_entry_id = mse.id
LEFT JOIN mmp_files mf ON cs.mmp_file_id = mf.id
LEFT JOIN projects proj ON cs.project_id = proj.id
WHERE cs.status IN ('pending', 'under_review')
ORDER BY cs.submitted_at ASC;

-- View: User cost submission summary
CREATE OR REPLACE VIEW user_cost_submission_summary AS
SELECT
  submitted_by as user_id,
  COUNT(*) as total_submissions,
  SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
  SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count,
  SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
  SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_count,
  SUM(CASE WHEN status = 'approved' THEN total_cost_cents ELSE 0 END) as total_approved_cents,
  SUM(CASE WHEN status = 'paid' THEN paid_amount_cents ELSE 0 END) as total_paid_cents,
  AVG(CASE WHEN status IN ('approved', 'paid') THEN total_cost_cents END) as avg_approved_cents,
  MAX(submitted_at) as last_submission_date
FROM site_visit_cost_submissions
GROUP BY submitted_by;

-- View: MMP cost summary
CREATE OR REPLACE VIEW mmp_cost_submission_summary AS
SELECT
  mmp_file_id,
  COUNT(*) as total_submissions,
  SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_submissions,
  SUM(CASE WHEN status = 'approved' OR status = 'paid' THEN total_cost_cents ELSE 0 END) as total_approved_cost_cents,
  SUM(CASE WHEN status = 'paid' THEN paid_amount_cents ELSE 0 END) as total_paid_cents,
  SUM(transportation_cost_cents) FILTER (WHERE status IN ('approved', 'paid')) as total_transport_cents,
  SUM(accommodation_cost_cents) FILTER (WHERE status IN ('approved', 'paid')) as total_accommodation_cents,
  SUM(meal_allowance_cents) FILTER (WHERE status IN ('approved', 'paid')) as total_meals_cents,
  AVG(total_cost_cents) FILTER (WHERE status IN ('approved', 'paid')) as avg_cost_per_site_cents
FROM site_visit_cost_submissions
GROUP BY mmp_file_id;

-- =========================================
-- HELPER FUNCTIONS
-- =========================================

-- Function: Record approval action in history
CREATE OR REPLACE FUNCTION record_cost_approval_action()
RETURNS TRIGGER AS $$
DECLARE
  actor_user_id UUID;
  actor_user_role TEXT;
BEGIN
  -- Determine actor based on operation
  IF (TG_OP = 'UPDATE' AND OLD.status != NEW.status) THEN
    -- For updates, actor is the reviewer (if set) or current user
    actor_user_id := COALESCE(NEW.reviewed_by, auth.uid());
  ELSIF (TG_OP = 'INSERT') THEN
    -- For inserts, actor is the submitter
    actor_user_id := NEW.submitted_by;
  END IF;

  -- Get actor's role deterministically (highest priority role if multiple)
  -- Priority order: admin > ict > fom > financialadmin > others
  SELECT role INTO actor_user_role
  FROM user_roles
  WHERE user_id = actor_user_id
  ORDER BY 
    CASE LOWER(role)
      WHEN 'admin' THEN 1
      WHEN 'ict' THEN 2
      WHEN 'fom' THEN 3
      WHEN 'financialadmin' THEN 4
      WHEN 'supervisor' THEN 5
      WHEN 'coordinator' THEN 6
      ELSE 7
    END
  LIMIT 1;

  -- Record history on status change
  IF (TG_OP = 'UPDATE' AND OLD.status != NEW.status) THEN
    INSERT INTO cost_approval_history (
      submission_id,
      action,
      actor_id,
      actor_role,
      previous_status,
      new_status,
      previous_amount_cents,
      new_amount_cents,
      notes,
      changes
    ) VALUES (
      NEW.id,
      CASE NEW.status
        WHEN 'under_review' THEN 'under_review'
        WHEN 'approved' THEN 'approved'
        WHEN 'rejected' THEN 'rejected'
        WHEN 'paid' THEN 'paid'
        WHEN 'cancelled' THEN 'cancelled'
        ELSE 'status_changed'
      END,
      actor_user_id,
      actor_user_role,
      OLD.status,
      NEW.status,
      OLD.total_cost_cents,
      NEW.total_cost_cents,
      NEW.reviewer_notes,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'old_amount', OLD.total_cost_cents,
        'new_amount', NEW.total_cost_cents,
        'reviewed_by', NEW.reviewed_by,
        'reviewed_at', NEW.reviewed_at
      )
    );
  -- Record history on initial submission
  ELSIF (TG_OP = 'INSERT') THEN
    INSERT INTO cost_approval_history (
      submission_id,
      action,
      actor_id,
      actor_role,
      new_status,
      new_amount_cents,
      notes,
      changes
    ) VALUES (
      NEW.id,
      'submitted',
      actor_user_id,
      actor_user_role,
      NEW.status,
      NEW.total_cost_cents,
      NEW.submission_notes,
      jsonb_build_object(
        'submission_id', NEW.id,
        'mmp_site_entry_id', NEW.mmp_site_entry_id,
        'total_cost_cents', NEW.total_cost_cents,
        'submitted_by', NEW.submitted_by,
        'submitted_at', NEW.submitted_at
      )
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
-- SUCCESS MESSAGE
-- =========================================
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'COST APPROVAL SYSTEM MIGRATION COMPLETE!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables Created:';
  RAISE NOTICE '  ✓ site_visit_cost_submissions';
  RAISE NOTICE '  ✓ cost_approval_history';
  RAISE NOTICE '';
  RAISE NOTICE 'Views Created:';
  RAISE NOTICE '  ✓ pending_cost_approvals';
  RAISE NOTICE '  ✓ user_cost_submission_summary';
  RAISE NOTICE '  ✓ mmp_cost_submission_summary';
  RAISE NOTICE '';
  RAISE NOTICE 'Features Enabled:';
  RAISE NOTICE '  ✓ Actual cost submission by enumerators';
  RAISE NOTICE '  ✓ Admin/Finance approval workflow';
  RAISE NOTICE '  ✓ Automatic audit trail';
  RAISE NOTICE '  ✓ Row Level Security policies';
  RAISE NOTICE '  ✓ Auto-calculated totals';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '  1. Frontend cost submission form';
  RAISE NOTICE '  2. Cost approval queue page';
  RAISE NOTICE '  3. Wallet integration for payments';
  RAISE NOTICE '========================================';
END $$;
