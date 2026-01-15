-- Migration: Cost Submissions and Enhanced Withdrawal Flow
-- Purpose: Implement robust cost submission and two-step withdrawal approval
-- Date: 2024-12-14

-- ============================================================================
-- 1. CREATE cost_submissions TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cost_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_visit_id uuid NOT NULL REFERENCES public.mmp_site_entries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'SDG',
  amount numeric NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending','under_review','approved','paid','rejected','cancelled')),
  submission_date timestamptz NOT NULL DEFAULT now(),
  
  -- Approval tracking
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  
  -- Payment tracking
  paid_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  paid_at timestamptz,
  payment_wallet_tx_id uuid REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  
  -- Audit and deduplication
  notes text,
  reference_id text, -- Client-generated UUID for offline deduplication
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure payment only happens after approval
  CONSTRAINT cost_submission_payment_requires_approval 
    CHECK (status != 'paid' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

-- Indexes for performance
CREATE INDEX idx_cost_submissions_site_visit_id ON public.cost_submissions(site_visit_id);
CREATE INDEX idx_cost_submissions_user_id ON public.cost_submissions(user_id);
CREATE INDEX idx_cost_submissions_status ON public.cost_submissions(status);
CREATE INDEX idx_cost_submissions_submission_date ON public.cost_submissions(submission_date DESC);

-- Unique constraint for idempotency via reference_id
CREATE UNIQUE INDEX ux_cost_submissions_reference_user 
  ON public.cost_submissions (user_id, reference_id) 
  WHERE (reference_id IS NOT NULL);

COMMENT ON TABLE public.cost_submissions IS 'Cost claims submitted by field staff for site visits';
COMMENT ON COLUMN public.cost_submissions.reference_id IS 'Client-generated UUID for offline deduplication';
COMMENT ON COLUMN public.cost_submissions.status IS 'Lifecycle: pending → under_review → approved → paid | rejected | cancelled';

-- ============================================================================
-- 2. ENHANCE withdrawal_requests TABLE
-- ============================================================================

-- Add supervisor approval step (two-step approval process)
DO $$ 
BEGIN
  -- Add columns if they don't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'withdrawal_requests' AND column_name = 'supervisor_id') THEN
    ALTER TABLE public.withdrawal_requests
      ADD COLUMN supervisor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
      ADD COLUMN supervisor_notes text,
      ADD COLUMN supervisor_approved_at timestamptz,
      ADD COLUMN admin_processed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
      ADD COLUMN admin_processed_at timestamptz,
      ADD COLUMN admin_notes text,
      ADD COLUMN reference_id text;
  END IF;
END $$;

-- Update status constraint to include new states
ALTER TABLE public.withdrawal_requests DROP CONSTRAINT IF EXISTS withdrawal_requests_status_check;
ALTER TABLE public.withdrawal_requests 
  ADD CONSTRAINT withdrawal_requests_status_check 
  CHECK (status IN ('pending','supervisor_approved','processing','approved','rejected','cancelled'));

-- Unique constraint for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS ux_withdrawal_requests_reference_user 
  ON public.withdrawal_requests (user_id, reference_id) 
  WHERE (reference_id IS NOT NULL);

COMMENT ON COLUMN public.withdrawal_requests.supervisor_id IS 'Supervisor who performed first approval';
COMMENT ON COLUMN public.withdrawal_requests.reference_id IS 'Client-generated UUID for offline deduplication';

-- ============================================================================
-- 3. UPDATE wallet_transactions TABLE
-- ============================================================================

-- Add foreign keys to link transactions with cost submissions and withdrawals
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'wallet_transactions' AND column_name = 'cost_submission_id') THEN
    ALTER TABLE public.wallet_transactions
      ADD COLUMN cost_submission_id uuid REFERENCES public.cost_submissions(id) ON DELETE SET NULL,
      ADD COLUMN withdrawal_request_id uuid REFERENCES public.withdrawal_requests(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Prevent double-payment: one cost submission can only have one wallet transaction
CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_tx_cost_submission_id 
  ON public.wallet_transactions (cost_submission_id) 
  WHERE cost_submission_id IS NOT NULL;

-- Prevent double-processing: one withdrawal request can only have one wallet transaction
CREATE UNIQUE INDEX IF NOT EXISTS ux_wallet_tx_withdrawal_request_id 
  ON public.wallet_transactions (withdrawal_request_id) 
  WHERE withdrawal_request_id IS NOT NULL;

COMMENT ON COLUMN public.wallet_transactions.cost_submission_id IS 'Links transaction to cost submission payment';
COMMENT ON COLUMN public.wallet_transactions.withdrawal_request_id IS 'Links transaction to withdrawal request';

-- ============================================================================
-- 4. TRIGGERS FOR updated_at
-- ============================================================================

-- Create or replace the timestamp update function
CREATE OR REPLACE FUNCTION public.update_timestamp() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to cost_submissions
DROP TRIGGER IF EXISTS trig_cost_submissions_updated_at ON public.cost_submissions;
CREATE TRIGGER trig_cost_submissions_updated_at
  BEFORE UPDATE ON public.cost_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- Apply to withdrawal_requests
DROP TRIGGER IF EXISTS trig_withdrawal_requests_updated_at ON public.withdrawal_requests;
CREATE TRIGGER trig_withdrawal_requests_updated_at
  BEFORE UPDATE ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on cost_submissions
ALTER TABLE public.cost_submissions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can create cost submissions for their own site visits
DROP POLICY IF EXISTS "Users can create cost submissions for their visits" ON public.cost_submissions;
CREATE POLICY "Users can create cost submissions for their visits"
  ON public.cost_submissions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.mmp_site_entries mse
      WHERE mse.id = site_visit_id
      AND (
        mse.enumerator_id = auth.uid() 
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur 
          JOIN public.roles r ON ur.role_id = r.id
          WHERE ur.user_id = auth.uid() 
          AND r.name IN ('admin','supervisor','financialAdmin')
        )
      )
    )
  );

-- Policy: Users can view their own cost submissions; admins/supervisors can view all
DROP POLICY IF EXISTS "Users can view cost submissions" ON public.cost_submissions;
CREATE POLICY "Users can view cost submissions"
  ON public.cost_submissions FOR SELECT
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur 
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() 
      AND r.name IN ('admin','supervisor','financialAdmin')
    )
  );

-- Policy: Users can update their own pending cost submissions (cancel/edit)
DROP POLICY IF EXISTS "Users can update own pending cost submissions" ON public.cost_submissions;
CREATE POLICY "Users can update own pending cost submissions"
  ON public.cost_submissions FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending');

-- Policy: Financial admins can manage cost submissions (review, approve, pay)
DROP POLICY IF EXISTS "Financial admins can manage cost submissions" ON public.cost_submissions;
CREATE POLICY "Financial admins can manage cost submissions"
  ON public.cost_submissions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() 
      AND r.name IN ('financialAdmin','admin','supervisor')
    )
  );

-- Enhanced withdrawal_requests RLS
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Users can create their own withdrawal requests
DROP POLICY IF EXISTS "Users can create withdrawal requests" ON public.withdrawal_requests;
CREATE POLICY "Users can create withdrawal requests"
  ON public.withdrawal_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can view their own requests; supervisors/admins can view all
DROP POLICY IF EXISTS "Users can view withdrawal requests" ON public.withdrawal_requests;
CREATE POLICY "Users can view withdrawal requests"
  ON public.withdrawal_requests FOR SELECT
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur 
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() 
      AND r.name IN ('admin','supervisor','financialAdmin')
    )
  );

-- Policy: Users can update their own pending requests (cancel)
DROP POLICY IF EXISTS "Users can update own pending withdrawal requests" ON public.withdrawal_requests;
CREATE POLICY "Users can update own pending withdrawal requests"
  ON public.withdrawal_requests FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending');

-- Policy: Supervisors and admins can approve/process withdrawal requests
DROP POLICY IF EXISTS "Supervisors can manage withdrawal requests" ON public.withdrawal_requests;
CREATE POLICY "Supervisors can manage withdrawal requests"
  ON public.withdrawal_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid() 
      AND r.name IN ('admin','supervisor','financialAdmin')
    )
  );

-- ============================================================================
-- 6. ATOMIC RPC: Process Withdrawal (Two-step approval)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_admin_process_withdrawal(
  in_request_id uuid, 
  in_admin_id uuid, 
  in_notes text
)
RETURNS TABLE(success boolean, error_text text, transaction_id uuid) 
SECURITY DEFINER
AS $$
DECLARE
  req RECORD;
  wallet_row RECORD;
  new_balance_cents bigint;
  tx_id uuid;
  user_has_permission boolean;
BEGIN
  -- 1. Verify admin has permission (financialAdmin or admin role)
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur 
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = in_admin_id 
    AND r.name IN ('financialAdmin','admin')
  ) INTO user_has_permission;
  
  IF NOT user_has_permission THEN
    RETURN QUERY SELECT false, 'User does not have permission to process withdrawals', NULL::uuid;
    RETURN;
  END IF;

  -- 2. Lock withdrawal request
  SELECT * INTO req 
  FROM public.withdrawal_requests 
  WHERE id = in_request_id 
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Withdrawal request not found', NULL::uuid;
    RETURN;
  END IF;

  -- 3. Verify request is in supervisor_approved state
  IF req.status != 'supervisor_approved' THEN
    RETURN QUERY SELECT false, 
      'Request must be in supervisor_approved state. Current status: ' || req.status, 
      NULL::uuid;
    RETURN;
  END IF;

  -- 4. Lock wallet for update
  SELECT * INTO wallet_row 
  FROM public.wallets 
  WHERE id = req.wallet_id 
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Wallet not found', NULL::uuid;
    RETURN;
  END IF;

  -- 5. Check sufficient balance
  IF (COALESCE(wallet_row.balance_cents, 0) < (req.amount * 100)::bigint) THEN
    RETURN QUERY SELECT false, 
      'Insufficient wallet balance. Available: ' || 
      (COALESCE(wallet_row.balance_cents, 0)::numeric / 100.0) || 
      ', Requested: ' || req.amount,
      NULL::uuid;
    RETURN;
  END IF;

  -- 6. Calculate new balance
  new_balance_cents := wallet_row.balance_cents - (req.amount * 100)::bigint;

  -- 7. Create wallet transaction (negative amount for withdrawal)
  INSERT INTO public.wallet_transactions (
    wallet_id, 
    user_id, 
    amount_cents, 
    amount, 
    currency, 
    type, 
    status, 
    posted_at, 
    balance_before, 
    balance_after, 
    withdrawal_request_id, 
    description, 
    created_by
  )
  VALUES (
    wallet_row.id, 
    req.user_id, 
    -(req.amount * 100)::bigint, 
    -req.amount, 
    req.currency, 
    'withdrawal', 
    'posted', 
    now(), 
    (wallet_row.balance_cents::numeric / 100.0), 
    (new_balance_cents::numeric / 100.0), 
    in_request_id, 
    COALESCE('Withdrawal processed: ' || in_notes, 'Withdrawal processed'), 
    in_admin_id
  )
  RETURNING id INTO tx_id;

  -- 8. Update wallet balance
  UPDATE public.wallets 
  SET 
    balance_cents = new_balance_cents,
    total_withdrawn = COALESCE(total_withdrawn, 0) + req.amount,
    updated_at = now()
  WHERE id = wallet_row.id;

  -- 9. Update withdrawal request status
  UPDATE public.withdrawal_requests 
  SET 
    status = 'approved',
    admin_processed_by = in_admin_id,
    admin_processed_at = now(),
    admin_notes = in_notes
  WHERE id = in_request_id;

  -- 10. Return success
  RETURN QUERY SELECT true, NULL::text, tx_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.rpc_admin_process_withdrawal IS 
  'Atomically process a supervisor-approved withdrawal request. Validates balance, deducts from wallet, creates transaction. Returns success status and transaction ID.';

-- ============================================================================
-- 7. ATOMIC RPC: Pay Cost Submission
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_pay_cost_submission(
  in_cost_submission_id uuid, 
  in_admin_id uuid,
  in_notes text DEFAULT NULL
)
RETURNS TABLE(success boolean, error_text text, transaction_id uuid) 
SECURITY DEFINER
AS $$
DECLARE
  cs RECORD;
  wallet_row RECORD;
  tx_id uuid;
  new_balance_cents bigint;
  user_has_permission boolean;
BEGIN
  -- 1. Verify admin has permission
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur 
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = in_admin_id 
    AND r.name IN ('financialAdmin','admin')
  ) INTO user_has_permission;
  
  IF NOT user_has_permission THEN
    RETURN QUERY SELECT false, 'User does not have permission to pay cost submissions', NULL::uuid;
    RETURN;
  END IF;

  -- 2. Lock cost submission
  SELECT * INTO cs 
  FROM public.cost_submissions 
  WHERE id = in_cost_submission_id 
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Cost submission not found', NULL::uuid;
    RETURN;
  END IF;

  -- 3. Verify cost submission is approved
  IF cs.status != 'approved' THEN
    RETURN QUERY SELECT false, 
      'Cost submission must be approved before payment. Current status: ' || cs.status,
      NULL::uuid;
    RETURN;
  END IF;

  -- 4. Check if already paid (idempotency)
  IF cs.payment_wallet_tx_id IS NOT NULL THEN
    RETURN QUERY SELECT false, 
      'Cost submission already paid. Transaction ID: ' || cs.payment_wallet_tx_id::text,
      cs.payment_wallet_tx_id;
    RETURN;
  END IF;

  -- 5. Lock wallet for update
  SELECT * INTO wallet_row 
  FROM public.wallets 
  WHERE user_id = cs.user_id 
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Wallet not found for user', NULL::uuid;
    RETURN;
  END IF;

  -- 6. Calculate new balance
  new_balance_cents := COALESCE(wallet_row.balance_cents, 0) + (cs.amount * 100)::bigint;

  -- 7. Create wallet transaction (positive amount for payment)
  INSERT INTO public.wallet_transactions (
    wallet_id, 
    user_id, 
    amount_cents, 
    amount, 
    currency, 
    type, 
    status, 
    posted_at, 
    balance_before, 
    balance_after, 
    cost_submission_id, 
    description, 
    created_by
  )
  VALUES (
    wallet_row.id, 
    cs.user_id, 
    (cs.amount * 100)::bigint, 
    cs.amount, 
    cs.currency, 
    'site_visit_fee', 
    'posted', 
    now(), 
    (COALESCE(wallet_row.balance_cents, 0)::numeric / 100.0), 
    (new_balance_cents::numeric / 100.0), 
    in_cost_submission_id, 
    COALESCE('Payment for cost submission: ' || in_notes, 'Payment for cost submission'), 
    in_admin_id
  )
  RETURNING id INTO tx_id;

  -- 8. Update wallet balance
  UPDATE public.wallets 
  SET 
    balance_cents = new_balance_cents,
    total_earned = COALESCE(total_earned, 0) + cs.amount,
    updated_at = now()
  WHERE id = wallet_row.id;

  -- 9. Update cost submission to paid
  UPDATE public.cost_submissions 
  SET 
    status = 'paid',
    paid_by = in_admin_id,
    paid_at = now(),
    payment_wallet_tx_id = tx_id,
    notes = COALESCE(notes || ' | ' || in_notes, in_notes)
  WHERE id = in_cost_submission_id;

  -- 10. Return success
  RETURN QUERY SELECT true, NULL::text, tx_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.rpc_pay_cost_submission IS 
  'Atomically pay an approved cost submission. Credits user wallet, creates transaction, updates cost submission status. Prevents double-payment.';

-- ============================================================================
-- 8. SUPERVISOR APPROVAL RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_supervisor_approve_withdrawal(
  in_request_id uuid,
  in_supervisor_id uuid,
  in_notes text
)
RETURNS TABLE(success boolean, error_text text)
SECURITY DEFINER
AS $$
DECLARE
  req RECORD;
  wallet_row RECORD;
  user_has_permission boolean;
BEGIN
  -- 1. Verify supervisor has permission
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur 
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = in_supervisor_id 
    AND r.name IN ('supervisor','admin','financialAdmin')
  ) INTO user_has_permission;
  
  IF NOT user_has_permission THEN
    RETURN QUERY SELECT false, 'User does not have supervisor permission';
    RETURN;
  END IF;

  -- 2. Lock withdrawal request
  SELECT * INTO req 
  FROM public.withdrawal_requests 
  WHERE id = in_request_id 
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Withdrawal request not found';
    RETURN;
  END IF;

  -- 3. Verify request is pending
  IF req.status != 'pending' THEN
    RETURN QUERY SELECT false, 'Request must be in pending state. Current status: ' || req.status;
    RETURN;
  END IF;

  -- 4. Check wallet balance (validation only, no deduction)
  SELECT * INTO wallet_row 
  FROM public.wallets 
  WHERE id = req.wallet_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Wallet not found';
    RETURN;
  END IF;

  IF (COALESCE(wallet_row.balance_cents, 0) < (req.amount * 100)::bigint) THEN
    RETURN QUERY SELECT false, 
      'Insufficient wallet balance for approval. Available: ' || 
      (COALESCE(wallet_row.balance_cents, 0)::numeric / 100.0) || 
      ', Requested: ' || req.amount;
    RETURN;
  END IF;

  -- 5. Update request to supervisor_approved
  UPDATE public.withdrawal_requests 
  SET 
    status = 'supervisor_approved',
    supervisor_id = in_supervisor_id,
    supervisor_approved_at = now(),
    supervisor_notes = in_notes
  WHERE id = in_request_id;

  -- 6. Return success
  RETURN QUERY SELECT true, NULL::text;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.rpc_supervisor_approve_withdrawal IS 
  'First-step approval by supervisor. Validates balance but does not transfer funds.';

-- ============================================================================
-- 9. GRANT PERMISSIONS
-- ============================================================================

-- Grant execute on RPCs to authenticated users (RLS enforced within)
GRANT EXECUTE ON FUNCTION public.rpc_admin_process_withdrawal TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_pay_cost_submission TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_supervisor_approve_withdrawal TO authenticated;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
