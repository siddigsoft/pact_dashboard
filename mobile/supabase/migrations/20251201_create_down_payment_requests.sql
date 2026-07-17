-- Create down payment requests table for data collectors
CREATE TABLE down_payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Request details
  site_visit_id UUID,
  mmp_site_entry_id UUID,
  site_name TEXT NOT NULL,

  -- Requester information (DATA COLLECTOR ONLY)
  requested_by UUID NOT NULL REFERENCES profiles(id),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  requester_role TEXT NOT NULL CHECK (requester_role IN ('dataCollector', 'coordinator')),
  hub_id TEXT,
  hub_name TEXT,

  -- Payment details
  total_transportation_budget NUMERIC(12,2) NOT NULL,
  requested_amount NUMERIC(12,2) NOT NULL,
  payment_type TEXT NOT NULL DEFAULT 'full_advance' CHECK (payment_type IN ('full_advance', 'installments')),

  -- Installment details
  installment_plan JSONB DEFAULT '[]',
  paid_installments JSONB DEFAULT '[]',

  -- Justification
  justification TEXT NOT NULL,
  supporting_documents JSONB DEFAULT '[]',

  -- Approval workflow (TIER 1 - SUPERVISOR)
  supervisor_id UUID REFERENCES profiles(id),
  supervisor_status TEXT CHECK (supervisor_status IN ('pending', 'approved', 'rejected', 'changes_requested')),
  supervisor_approved_by UUID,
  supervisor_approved_at TIMESTAMPTZ,
  supervisor_notes TEXT,
  supervisor_rejection_reason TEXT,

  -- Approval workflow (TIER 2 - ADMIN)
  admin_status TEXT CHECK (admin_status IN ('pending', 'approved', 'rejected')),
  admin_processed_by UUID,
  admin_processed_at TIMESTAMPTZ,
  admin_notes TEXT,
  admin_rejection_reason TEXT,

  -- Payment tracking
  status TEXT NOT NULL DEFAULT 'pending_supervisor' CHECK (status IN (
    'pending_supervisor',  -- Waiting for hub supervisor
    'pending_admin',       -- Supervisor approved, waiting for admin
    'approved',            -- Admin approved but not yet paid
    'rejected',            -- Rejected by supervisor or admin
    'partially_paid',      -- Some installments paid
    'fully_paid',          -- All installments paid
    'cancelled'            -- Cancelled by requester or system
  )),

  total_paid_amount NUMERIC(12,2) DEFAULT 0,
  remaining_amount NUMERIC(12,2),

  -- Wallet transactions
  wallet_transaction_ids JSONB DEFAULT '[]',

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- Create indexes for performance
CREATE INDEX idx_down_payment_requests_requested_by ON down_payment_requests(requested_by);
CREATE INDEX idx_down_payment_requests_mmp_site_entry_id ON down_payment_requests(mmp_site_entry_id);
CREATE INDEX idx_down_payment_requests_status ON down_payment_requests(status);
CREATE INDEX idx_down_payment_requests_supervisor_id ON down_payment_requests(supervisor_id);
CREATE INDEX idx_down_payment_requests_hub_id ON down_payment_requests(hub_id);

-- Row Level Security (RLS) Policies
ALTER TABLE down_payment_requests ENABLE ROW LEVEL SECURITY;

-- Data collectors/coordinators can view their own requests
CREATE POLICY "down_payment_requests_user_view" ON down_payment_requests
  FOR SELECT USING (requested_by = auth.uid());

-- Data collectors/coordinators can create their own requests
CREATE POLICY "down_payment_requests_user_create" ON down_payment_requests
  FOR INSERT WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('dataCollector', 'datacollector', 'coordinator')
    )
  );

-- Data collectors can update their own requests (for cancellation)
CREATE POLICY "down_payment_requests_user_update" ON down_payment_requests
  FOR UPDATE USING (
    requested_by = auth.uid()
    AND status IN ('pending_supervisor', 'pending_admin', 'approved')
  );

-- Supervisors can view and update requests for their hub
CREATE POLICY "down_payment_requests_supervisor_view" ON down_payment_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('supervisor', 'hubSupervisor')
      AND hub_id = down_payment_requests.hub_id
    )
  );

CREATE POLICY "down_payment_requests_supervisor_update" ON down_payment_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('supervisor', 'hubSupervisor')
      AND hub_id = down_payment_requests.hub_id
    )
    AND status = 'pending_supervisor'
  );

-- Admins can view and update all requests
CREATE POLICY "down_payment_requests_admin_view" ON down_payment_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "down_payment_requests_admin_update" ON down_payment_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'superadmin')
    )
  );

-- Supervisor Assignment Trigger
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

CREATE TRIGGER auto_assign_supervisor
  BEFORE INSERT ON down_payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION assign_supervisor_to_down_payment_request();

-- Function to update remaining amount
CREATE OR REPLACE FUNCTION update_down_payment_remaining_amount()
RETURNS TRIGGER AS $$
BEGIN
  NEW.remaining_amount := NEW.requested_amount - COALESCE(NEW.total_paid_amount, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_remaining_amount_trigger
  BEFORE INSERT OR UPDATE ON down_payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_down_payment_remaining_amount();

-- Function to create wallet transaction when down payment is approved
CREATE OR REPLACE FUNCTION process_down_payment_approval()
RETURNS TRIGGER AS $$
DECLARE
  user_wallet RECORD;
  transaction_record RECORD;
BEGIN
  -- Only process when status changes to 'approved' and no transaction exists yet
  IF NEW.status = 'approved' AND OLD.status != 'approved' AND array_length(NEW.wallet_transaction_ids, 1) IS NULL THEN
    -- Get user's wallet
    SELECT * INTO user_wallet
    FROM wallets
    WHERE user_id = NEW.requested_by;

    IF user_wallet IS NULL THEN
      RAISE EXCEPTION 'Wallet not found for user %', NEW.requested_by;
    END IF;

    -- Create wallet transaction
    INSERT INTO wallet_transactions (
      wallet_id,
      user_id,
      type,
      amount,
      amount_cents,
      currency,
      description,
      balance_before,
      balance_after,
      metadata,
      created_at
    ) VALUES (
      user_wallet.id,
      NEW.requested_by,
      'down_payment_advance',
      NEW.requested_amount,
      (NEW.requested_amount * 100)::bigint,
      'SDG',
      format('Down-payment advance for %s', NEW.site_name),
      user_wallet.current_balance,
      user_wallet.current_balance + NEW.requested_amount,
      jsonb_build_object(
        'down_payment_request_id', NEW.id,
        'site_name', NEW.site_name,
        'payment_type', NEW.payment_type
      ),
      NOW()
    ) RETURNING id INTO transaction_record;

    -- Update wallet balance
    UPDATE wallets
    SET
      balances = jsonb_set(balances, '{SDG}', (current_balance + NEW.requested_amount)::text::jsonb),
      total_earned = total_earned + NEW.requested_amount,
      updated_at = NOW()
    WHERE id = user_wallet.id;

    -- Update down payment request with transaction ID
    NEW.wallet_transaction_ids := array_append(COALESCE(NEW.wallet_transaction_ids, ARRAY[]::uuid[]), transaction_record.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER process_down_payment_approval_trigger
  AFTER UPDATE ON down_payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION process_down_payment_approval();