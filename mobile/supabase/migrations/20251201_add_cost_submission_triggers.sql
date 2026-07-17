-- Migration: Add cost submission triggers and functions
-- Description: Implements auto-calculation of total costs and approval history tracking
-- Date: 2025-12-01

BEGIN;

-- Function to auto-calculate total cost for cost submissions
CREATE OR REPLACE FUNCTION calculate_total_cost_submission()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_cost_cents =
    COALESCE(NEW.transportation_cost_cents, 0) +
    COALESCE(NEW.accommodation_cost_cents, 0) +
    COALESCE(NEW.meal_allowance_cents, 0) +
    COALESCE(NEW.other_costs_cents, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-calculate total cost on insert/update
DROP TRIGGER IF EXISTS cost_submissions_calculate_total_trigger ON public.cost_submissions;
CREATE TRIGGER cost_submissions_calculate_total_trigger
  BEFORE INSERT OR UPDATE ON public.cost_submissions
  FOR EACH ROW
  EXECUTE FUNCTION calculate_total_cost_submission();

-- Create cost approval history table
CREATE TABLE IF NOT EXISTS public.cost_approval_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.cost_submissions(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL, -- 'approved', 'rejected', 'status_changed', etc.
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_role VARCHAR(50), -- 'enumerator', 'supervisor', 'admin', etc.
  previous_status VARCHAR(50),
  new_status VARCHAR(50),
  previous_amount_cents INTEGER,
  new_amount_cents INTEGER,
  notes TEXT,
  changes JSONB, -- Store what changed
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for cost approval history
CREATE INDEX IF NOT EXISTS idx_cost_approval_history_submission_id ON public.cost_approval_history(submission_id);
CREATE INDEX IF NOT EXISTS idx_cost_approval_history_actor_id ON public.cost_approval_history(actor_id);
CREATE INDEX IF NOT EXISTS idx_cost_approval_history_created_at ON public.cost_approval_history(created_at DESC);

-- Enable RLS on cost approval history
ALTER TABLE public.cost_approval_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for cost approval history
CREATE POLICY "Users can view approval history for their submissions"
  ON public.cost_approval_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.cost_submissions cs
      WHERE cs.id = cost_approval_history.submission_id
      AND cs.submitted_by = auth.uid()
    )
  );

CREATE POLICY "Supervisors and admins can view all approval history"
  ON public.cost_approval_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('supervisor', 'admin', 'coordinator')
    )
  );

CREATE POLICY "System can insert approval history"
  ON public.cost_approval_history
  FOR INSERT
  WITH CHECK (true);

-- Function to record cost approval actions
CREATE OR REPLACE FUNCTION record_cost_approval_action()
RETURNS TRIGGER AS $$
DECLARE
  action_type VARCHAR(50);
  actor_role VARCHAR(50);
BEGIN
  -- Determine action type
  action_type := CASE
    WHEN NEW.status = 'approved' AND OLD.status != 'approved' THEN 'approved'
    WHEN NEW.status = 'rejected' AND OLD.status != 'rejected' THEN 'rejected'
    WHEN NEW.status = 'paid' AND OLD.status != 'paid' THEN 'paid'
    ELSE 'status_changed'
  END;

  -- Get actor role
  SELECT COALESCE(p.role, 'enumerator') INTO actor_role
  FROM public.profiles p
  WHERE p.id = COALESCE(NEW.reviewed_by, NEW.submitted_by);

  -- Insert approval history record
  INSERT INTO public.cost_approval_history (
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
    action_type,
    COALESCE(NEW.reviewed_by, NEW.submitted_by),
    actor_role,
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to record approval actions
DROP TRIGGER IF EXISTS cost_submissions_approval_history_trigger ON public.cost_submissions;
CREATE TRIGGER cost_submissions_approval_history_trigger
  AFTER UPDATE ON public.cost_submissions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.reviewed_by IS DISTINCT FROM NEW.reviewed_by)
  EXECUTE FUNCTION record_cost_approval_action();

-- Function to create wallet transaction when cost submission is approved
CREATE OR REPLACE FUNCTION process_cost_submission_payment()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process when status changes to 'approved' and no transaction exists yet
  IF NEW.status = 'approved' AND OLD.status != 'approved' AND NEW.wallet_transaction_id IS NULL THEN
    -- Create wallet transaction for reimbursement
    INSERT INTO public.wallet_transactions (
      wallet_id,
      user_id,
      type,
      amount,
      currency,
      cost_submission_id,
      description,
      reference_id
    )
    SELECT
      w.id,
      NEW.submitted_by,
      'cost_reimbursement',
      NEW.total_cost_cents / 100.0, -- Convert cents to SDG
      'SDG',
      NEW.id,
      'Cost reimbursement for site visit: ' || COALESCE(me.site_name, 'Unknown'),
      NEW.reference_id
    FROM public.wallets w
    JOIN public.mmp_site_entries me ON me.id = NEW.site_visit_id
    WHERE w.user_id = NEW.submitted_by;

    -- Update the cost submission with the transaction ID
    UPDATE public.cost_submissions
    SET wallet_transaction_id = (
      SELECT id FROM public.wallet_transactions
      WHERE cost_submission_id = NEW.id
      ORDER BY created_at DESC
      LIMIT 1
    ),
    paid_at = NOW()
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to process payment when submission is approved
DROP TRIGGER IF EXISTS cost_submissions_payment_trigger ON public.cost_submissions;
CREATE TRIGGER cost_submissions_payment_trigger
  AFTER UPDATE ON public.cost_submissions
  FOR EACH ROW
  WHEN (NEW.status = 'approved' AND OLD.status != 'approved')
  EXECUTE FUNCTION process_cost_submission_payment();

-- Add comments
COMMENT ON FUNCTION calculate_total_cost_submission() IS 'Automatically calculates total cost from individual cost components';
COMMENT ON FUNCTION record_cost_approval_action() IS 'Records all approval actions in the cost_approval_history table';
COMMENT ON FUNCTION process_cost_submission_payment() IS 'Creates wallet transaction when cost submission is approved';
COMMENT ON TABLE cost_approval_history IS 'Audit trail of all cost submission approval actions';

COMMIT;