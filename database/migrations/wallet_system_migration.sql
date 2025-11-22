-- ====================================
-- PACT Wallet System Migration
-- Migrate from single-currency to multi-currency wallet system
-- ====================================

-- Step 1: Backup existing wallet data (create temporary table)
CREATE TABLE IF NOT EXISTS wallets_backup AS 
SELECT * FROM wallets;

-- Step 2: Modify wallets table to support multi-currency
ALTER TABLE wallets 
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS balance_cents,
  DROP COLUMN IF EXISTS total_earned_cents,
  DROP COLUMN IF EXISTS total_paid_out_cents,
  DROP COLUMN IF EXISTS pending_payout_cents;

-- Add new multi-currency fields
ALTER TABLE wallets 
  ADD COLUMN IF NOT EXISTS balances jsonb DEFAULT '{"SDG": 0}'::jsonb,
  ADD COLUMN IF NOT EXISTS total_earned numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_withdrawn numeric DEFAULT 0;

-- Step 3: Migrate old wallet data to new structure
UPDATE wallets w
SET 
  balances = jsonb_build_object('SDG', COALESCE(b.balance_cents / 100.0, 0)),
  total_earned = COALESCE(b.total_earned_cents / 100.0, 0),
  total_withdrawn = COALESCE(b.total_paid_out_cents / 100.0, 0)
FROM wallets_backup b
WHERE w.id = b.id;

-- Step 4: Create withdrawal_requests table
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'SDG',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  request_reason text,
  supervisor_id uuid REFERENCES profiles(id),
  supervisor_notes text,
  approved_at timestamptz,
  rejected_at timestamptz,
  payment_method text,
  payment_details jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Step 5: Create site_visit_costs table
CREATE TABLE IF NOT EXISTS site_visit_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_visit_id uuid NOT NULL REFERENCES mmp_site_entries(id) ON DELETE CASCADE,
  transportation_cost numeric DEFAULT 0,
  accommodation_cost numeric DEFAULT 0,
  meal_allowance numeric DEFAULT 0,
  other_costs numeric DEFAULT 0,
  total_cost numeric GENERATED ALWAYS AS (
    COALESCE(transportation_cost, 0) + 
    COALESCE(accommodation_cost, 0) + 
    COALESCE(meal_allowance, 0) + 
    COALESCE(other_costs, 0)
  ) STORED,
  currency text NOT NULL DEFAULT 'SDG',
  assigned_by uuid REFERENCES profiles(id),
  adjusted_by uuid REFERENCES profiles(id),
  adjustment_reason text,
  cost_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(site_visit_id)
);

-- Step 6: Update wallet_transactions table for new schema
ALTER TABLE wallet_transactions
  DROP COLUMN IF EXISTS amount_cents,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS posted_at,
  DROP COLUMN IF EXISTS visit_code;

ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS wallet_id uuid REFERENCES wallets(id),
  ADD COLUMN IF NOT EXISTS amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'site_visit_fee' 
    CHECK (type IN ('site_visit_fee', 'withdrawal', 'adjustment', 'bonus', 'penalty')),
  ADD COLUMN IF NOT EXISTS site_visit_id uuid REFERENCES mmp_site_entries(id),
  ADD COLUMN IF NOT EXISTS withdrawal_request_id uuid REFERENCES withdrawal_requests(id),
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS metadata jsonb,
  ADD COLUMN IF NOT EXISTS balance_before numeric,
  ADD COLUMN IF NOT EXISTS balance_after numeric,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id);

-- Step 7: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user_id ON withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_site_visit_costs_site_visit_id ON site_visit_costs(site_visit_id);

-- Step 8: Enable RLS (Row Level Security)
ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_visit_costs ENABLE ROW LEVEL SECURITY;

-- Step 9: Create RLS policies for withdrawal_requests
CREATE POLICY "Users can view their own withdrawal requests"
  ON withdrawal_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own withdrawal requests"
  ON withdrawal_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pending withdrawal requests"
  ON withdrawal_requests FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Supervisors can view all withdrawal requests"
  ON withdrawal_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'supervisor', 'fom')
    )
  );

CREATE POLICY "Supervisors can approve/reject withdrawal requests"
  ON withdrawal_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'supervisor', 'fom')
    )
  );

-- Step 10: Create RLS policies for site_visit_costs
CREATE POLICY "Users can view site visit costs for their assigned visits"
  ON site_visit_costs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mmp_site_entries mse
      WHERE mse.id = site_visit_costs.site_visit_id
      AND mse.monitoring_by = (SELECT email FROM profiles WHERE id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'supervisor', 'fom')
    )
  );

CREATE POLICY "Supervisors can manage site visit costs"
  ON site_visit_costs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'supervisor', 'fom')
    )
  );

-- Step 11: Create function to automatically create wallet for new users
CREATE OR REPLACE FUNCTION create_wallet_for_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO wallets (user_id, balances, total_earned, total_withdrawn)
  VALUES (NEW.id, '{"SDG": 0}'::jsonb, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-create wallet
DROP TRIGGER IF EXISTS auto_create_wallet ON profiles;
CREATE TRIGGER auto_create_wallet
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION create_wallet_for_user();

-- Step 12: Create updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_wallets_updated_at
  BEFORE UPDATE ON wallets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_withdrawal_requests_updated_at
  BEFORE UPDATE ON withdrawal_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_site_visit_costs_updated_at
  BEFORE UPDATE ON site_visit_costs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ====================================
-- Migration Complete!
-- ====================================
-- Summary:
-- ✅ Wallets table updated to multi-currency (balances as JSONB)
-- ✅ withdrawal_requests table created
-- ✅ site_visit_costs table created  
-- ✅ wallet_transactions table updated
-- ✅ RLS policies created
-- ✅ Auto-create wallet trigger added
-- ✅ Indexes created for performance
-- ====================================
