-- ============================================================================
-- Cost Submission System Improvements
-- ============================================================================
-- This migration adds:
-- 1. Cost approval history table for audit trail
-- 2. Auto-payment trigger when submission is approved
-- 3. Request revision workflow support
-- 4. Enhanced RLS policies
-- ============================================================================

-- ============================================================================
-- 1. CREATE COST APPROVAL HISTORY TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS cost_approval_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES site_visit_cost_submissions(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES profiles(id),
  action VARCHAR(20) NOT NULL CHECK (action IN ('approved', 'rejected', 'revision_requested')),
  notes TEXT,
  previous_status VARCHAR(20),
  new_status VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_cost_approval_history_submission 
  ON cost_approval_history(submission_id);
CREATE INDEX IF NOT EXISTS idx_cost_approval_history_reviewer 
  ON cost_approval_history(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_cost_approval_history_created 
  ON cost_approval_history(created_at DESC);

-- Enable RLS
ALTER TABLE cost_approval_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see history of their own submissions
CREATE POLICY cost_approval_history_select_own ON cost_approval_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM site_visit_cost_submissions
      WHERE id = submission_id AND submitted_by = auth.uid()
    )
  );

-- Policy: Admins can see all history
CREATE POLICY cost_approval_history_select_admin ON cost_approval_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'finance_manager')
    )
  );

-- Policy: Only admins can insert history records
CREATE POLICY cost_approval_history_insert_admin ON cost_approval_history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'finance_manager')
    )
  );

-- ============================================================================
-- 2. ADD REVISION SUPPORT TO COST SUBMISSIONS
-- ============================================================================
-- Add revision fields if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'site_visit_cost_submissions' 
    AND column_name = 'revision_requested'
  ) THEN
    ALTER TABLE site_visit_cost_submissions 
    ADD COLUMN revision_requested BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'site_visit_cost_submissions' 
    AND column_name = 'revision_notes'
  ) THEN
    ALTER TABLE site_visit_cost_submissions 
    ADD COLUMN revision_notes TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'site_visit_cost_submissions' 
    AND column_name = 'revision_count'
  ) THEN
    ALTER TABLE site_visit_cost_submissions 
    ADD COLUMN revision_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- ============================================================================
-- 3. AUTO-PAYMENT TRIGGER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION process_cost_submission_approval()
RETURNS TRIGGER AS $$
DECLARE
  wallet_id_var UUID;
  transaction_id_var UUID;
BEGIN
  -- Only process when status changes to 'approved' from non-approved state
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    
    -- Get or create wallet for user
    SELECT id INTO wallet_id_var
    FROM wallets
    WHERE user_id = NEW.submitted_by;
    
    -- If wallet doesn't exist, create it
    IF wallet_id_var IS NULL THEN
      INSERT INTO wallets (
        user_id, 
        current_balance, 
        currency,
        created_at,
        updated_at
      )
      VALUES (
        NEW.submitted_by, 
        0, 
        NEW.currency,
        NOW(),
        NOW()
      )
      RETURNING id INTO wallet_id_var;
    END IF;
    
    -- Create wallet transaction
    INSERT INTO wallet_transactions (
      wallet_id,
      user_id,
      type,
      amount_cents,
      currency,
      description,
      site_visit_id,
      metadata,
      status,
      transaction_date,
      created_at
    ) VALUES (
      wallet_id_var,
      NEW.submitted_by,
      'earning',
      NEW.total_cost_cents,
      NEW.currency,
      'Cost reimbursement approved for site visit',
      NEW.site_visit_id,
      jsonb_build_object(
        'submission_id', NEW.id,
        'transportation_cents', NEW.transportation_cost_cents,
        'accommodation_cents', NEW.accommodation_cost_cents,
        'meal_allowance_cents', NEW.meal_allowance_cents,
        'other_costs_cents', NEW.other_costs_cents,
        'total_cents', NEW.total_cost_cents,
        'reviewer_id', NEW.reviewed_by,
        'reviewed_at', NEW.reviewed_at
      ),
      'completed',
      NOW(),
      NOW()
    )
    RETURNING id INTO transaction_id_var;
    
    -- Update wallet balance
    UPDATE wallets
    SET 
      current_balance = current_balance + NEW.total_cost_cents,
      updated_at = NOW()
    WHERE id = wallet_id_var;
    
    -- Mark submission as paid
    NEW.status := 'paid';
    NEW.paid_at := NOW();
    NEW.paid_amount_cents := NEW.total_cost_cents;
    NEW.wallet_transaction_id := transaction_id_var;
    NEW.updated_at := NOW();
    
    RAISE NOTICE 'Auto-payment processed: submission %, transaction %, amount %', 
      NEW.id, transaction_id_var, NEW.total_cost_cents;
    
  END IF;
  
  -- Handle revision request
  IF NEW.status = 'under_review' AND NEW.revision_requested = TRUE AND OLD.revision_requested = FALSE THEN
    NEW.revision_count := COALESCE(OLD.revision_count, 0) + 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS cost_submission_approval_trigger ON site_visit_cost_submissions;

-- Create the trigger
CREATE TRIGGER cost_submission_approval_trigger
BEFORE UPDATE ON site_visit_cost_submissions
FOR EACH ROW
EXECUTE FUNCTION process_cost_submission_approval();

-- ============================================================================
-- 4. TRIGGER TO LOG APPROVAL HISTORY
-- ============================================================================
CREATE OR REPLACE FUNCTION log_cost_submission_review()
RETURNS TRIGGER AS $$
BEGIN
  -- Log review action when status changes
  IF NEW.status != OLD.status AND NEW.reviewed_by IS NOT NULL THEN
    
    INSERT INTO cost_approval_history (
      submission_id,
      reviewer_id,
      action,
      notes,
      previous_status,
      new_status,
      created_at
    ) VALUES (
      NEW.id,
      NEW.reviewed_by,
      CASE 
        WHEN NEW.status = 'approved' THEN 'approved'
        WHEN NEW.status = 'rejected' THEN 'rejected'
        WHEN NEW.status = 'under_review' AND NEW.revision_requested = TRUE THEN 'revision_requested'
        ELSE 'approved'
      END,
      COALESCE(NEW.reviewer_notes, NEW.approval_notes, NEW.revision_notes),
      OLD.status,
      NEW.status,
      NOW()
    );
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS cost_submission_review_log_trigger ON site_visit_cost_submissions;

-- Create the trigger
CREATE TRIGGER cost_submission_review_log_trigger
AFTER UPDATE ON site_visit_cost_submissions
FOR EACH ROW
EXECUTE FUNCTION log_cost_submission_review();

-- ============================================================================
-- 5. FUNCTION TO GET APPROVAL HISTORY FOR A SUBMISSION
-- ============================================================================
CREATE OR REPLACE FUNCTION get_cost_submission_history(submission_id_param UUID)
RETURNS TABLE (
  id UUID,
  reviewer_name TEXT,
  reviewer_email TEXT,
  action VARCHAR(20),
  notes TEXT,
  previous_status VARCHAR(20),
  new_status VARCHAR(20),
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    h.id,
    p.full_name AS reviewer_name,
    p.email AS reviewer_email,
    h.action,
    h.notes,
    h.previous_status,
    h.new_status,
    h.created_at
  FROM cost_approval_history h
  LEFT JOIN profiles p ON p.id = h.reviewer_id
  WHERE h.submission_id = submission_id_param
  ORDER BY h.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. FUNCTION TO REQUEST REVISION
-- ============================================================================
CREATE OR REPLACE FUNCTION request_cost_submission_revision(
  submission_id_param UUID,
  reviewer_id_param UUID,
  revision_notes_param TEXT
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  -- Update submission to request revision
  UPDATE site_visit_cost_submissions
  SET 
    status = 'under_review',
    revision_requested = TRUE,
    revision_notes = revision_notes_param,
    reviewed_by = reviewer_id_param,
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = submission_id_param
  RETURNING json_build_object(
    'success', TRUE,
    'submission_id', id,
    'status', status
  ) INTO result;
  
  IF result IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', 'Submission not found');
  END IF;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. ENHANCED RLS POLICIES
-- ============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS cost_submissions_select_own ON site_visit_cost_submissions;
DROP POLICY IF EXISTS cost_submissions_select_admin ON site_visit_cost_submissions;
DROP POLICY IF EXISTS cost_submissions_insert_own ON site_visit_cost_submissions;
DROP POLICY IF EXISTS cost_submissions_update_own ON site_visit_cost_submissions;
DROP POLICY IF EXISTS cost_submissions_update_admin ON site_visit_cost_submissions;

-- Users can only see their own submissions
CREATE POLICY cost_submissions_select_own ON site_visit_cost_submissions
  FOR SELECT USING (submitted_by = auth.uid());

-- Admins can see all submissions
CREATE POLICY cost_submissions_select_admin ON site_visit_cost_submissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'finance_manager', 'super_admin')
    )
  );

-- Users can insert their own submissions
CREATE POLICY cost_submissions_insert_own ON site_visit_cost_submissions
  FOR INSERT WITH CHECK (submitted_by = auth.uid());

-- Users can update their own pending or revision-requested submissions
CREATE POLICY cost_submissions_update_own ON site_visit_cost_submissions
  FOR UPDATE USING (
    submitted_by = auth.uid() 
    AND status IN ('pending', 'under_review')
    AND (revision_requested = TRUE OR status = 'pending')
  );

-- Admins can update any submission (for approval/rejection/revision)
CREATE POLICY cost_submissions_update_admin ON site_visit_cost_submissions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'finance_manager', 'super_admin')
    )
  );

-- ============================================================================
-- 8. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_cost_submissions_status 
  ON site_visit_cost_submissions(status);
CREATE INDEX IF NOT EXISTS idx_cost_submissions_submitted_by 
  ON site_visit_cost_submissions(submitted_by);
CREATE INDEX IF NOT EXISTS idx_cost_submissions_site_visit 
  ON site_visit_cost_submissions(site_visit_id);
CREATE INDEX IF NOT EXISTS idx_cost_submissions_reviewed_by 
  ON site_visit_cost_submissions(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_cost_submissions_revision 
  ON site_visit_cost_submissions(revision_requested) 
  WHERE revision_requested = TRUE;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary of changes:
-- ✅ Created cost_approval_history table with RLS
-- ✅ Added revision workflow support (revision_requested, revision_notes, revision_count)
-- ✅ Created auto-payment trigger (approved → wallet transaction → paid)
-- ✅ Created approval history logging trigger
-- ✅ Added helper functions (get_history, request_revision)
-- ✅ Enhanced RLS policies for security
-- ✅ Added performance indexes
-- ============================================================================
