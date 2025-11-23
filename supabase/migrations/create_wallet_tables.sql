-- Wallet System Tables Migration
-- This migration creates all wallet-related tables based on codebase analysis
-- Date: 2025-01-XX
-- Description: Creates wallet system tables (wallets, wallet_transactions, payout_requests, site_visit_costs, wallet_settings)

-- Create ENUM types for wallet transactions and payouts (if they don't exist)
DO $$ BEGIN
  CREATE TYPE wallet_tx_type AS ENUM (
    'site_visit_fee',
    'withdrawal',
    'adjustment',
    'bonus',
    'penalty',
    'earning',
    'adjustment_credit',
    'adjustment_debit'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE wallet_tx_status AS ENUM (
    'pending',
    'posted',
    'reversed',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE payout_status AS ENUM (
    'requested',
    'approved',
    'declined',
    'paid',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE payout_method AS ENUM (
    'bank',
    'mobile_money',
    'manual'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- WALLETS TABLE
-- Main wallet table storing user wallet balances and totals
CREATE TABLE IF NOT EXISTS public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'SDG',
  balance_cents bigint NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  total_earned_cents bigint NOT NULL DEFAULT 0 CHECK (total_earned_cents >= 0),
  total_paid_out_cents bigint NOT NULL DEFAULT 0 CHECK (total_paid_out_cents >= 0),
  pending_payout_cents bigint NOT NULL DEFAULT 0 CHECK (pending_payout_cents >= 0),
  -- Additional fields for backward compatibility with WalletContext
  balances jsonb DEFAULT '{"SDG": 0}'::jsonb,
  total_earned numeric DEFAULT 0,
  total_withdrawn numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add missing columns if table already exists
DO $$ 
BEGIN
  -- Add balances column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'wallets' 
                 AND column_name = 'balances') THEN
    ALTER TABLE public.wallets ADD COLUMN balances jsonb DEFAULT '{"SDG": 0}'::jsonb;
  END IF;
  
  -- Add total_earned column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'wallets' 
                 AND column_name = 'total_earned') THEN
    ALTER TABLE public.wallets ADD COLUMN total_earned numeric DEFAULT 0;
  END IF;
  
  -- Add total_withdrawn column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'wallets' 
                 AND column_name = 'total_withdrawn') THEN
    ALTER TABLE public.wallets ADD COLUMN total_withdrawn numeric DEFAULT 0;
  END IF;
END $$;

-- WALLET TRANSACTIONS TABLE
-- Stores all wallet transactions (credits, debits, fees, etc.)
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid REFERENCES public.wallets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL,
  currency text NOT NULL DEFAULT 'SDG',
  type wallet_tx_type NOT NULL,
  status wallet_tx_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz,
  memo text,
  related_site_visit_id uuid REFERENCES public.mmp_site_entries(id) ON DELETE SET NULL,
  visit_code text,
  -- Additional fields for WalletContext compatibility
  amount numeric,
  site_visit_id uuid REFERENCES public.mmp_site_entries(id) ON DELETE SET NULL,
  withdrawal_request_id uuid,
  description text,
  metadata jsonb,
  balance_before numeric,
  balance_after numeric,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Add missing columns if table already exists
DO $$ 
BEGIN
  -- Add wallet_id column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'wallet_transactions' 
                 AND column_name = 'wallet_id') THEN
    ALTER TABLE public.wallet_transactions ADD COLUMN wallet_id uuid REFERENCES public.wallets(id) ON DELETE CASCADE;
  END IF;
  
  -- Add amount column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'wallet_transactions' 
                 AND column_name = 'amount') THEN
    ALTER TABLE public.wallet_transactions ADD COLUMN amount numeric;
  END IF;
  
  -- Add site_visit_id column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'wallet_transactions' 
                 AND column_name = 'site_visit_id') THEN
    ALTER TABLE public.wallet_transactions ADD COLUMN site_visit_id uuid REFERENCES public.mmp_site_entries(id) ON DELETE SET NULL;
  END IF;
  
  -- Add withdrawal_request_id column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'wallet_transactions' 
                 AND column_name = 'withdrawal_request_id') THEN
    ALTER TABLE public.wallet_transactions ADD COLUMN withdrawal_request_id uuid;
  END IF;
  
  -- Add description column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'wallet_transactions' 
                 AND column_name = 'description') THEN
    ALTER TABLE public.wallet_transactions ADD COLUMN description text;
  END IF;
  
  -- Add metadata column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'wallet_transactions' 
                 AND column_name = 'metadata') THEN
    ALTER TABLE public.wallet_transactions ADD COLUMN metadata jsonb;
  END IF;
  
  -- Add balance_before column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'wallet_transactions' 
                 AND column_name = 'balance_before') THEN
    ALTER TABLE public.wallet_transactions ADD COLUMN balance_before numeric;
  END IF;
  
  -- Add balance_after column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'wallet_transactions' 
                 AND column_name = 'balance_after') THEN
    ALTER TABLE public.wallet_transactions ADD COLUMN balance_after numeric;
  END IF;
  
  -- Add created_by column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'wallet_transactions' 
                 AND column_name = 'created_by') THEN
    ALTER TABLE public.wallet_transactions ADD COLUMN created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- PAYOUT REQUESTS TABLE (also used as withdrawal_requests)
-- Stores user requests to withdraw money from their wallet
CREATE TABLE IF NOT EXISTS public.payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  method payout_method NOT NULL,
  destination jsonb NOT NULL DEFAULT '{}'::jsonb,
  status payout_status NOT NULL DEFAULT 'requested',
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  paid_at timestamptz,
  -- Additional fields for WalletContext compatibility
  wallet_id uuid REFERENCES public.wallets(id) ON DELETE CASCADE,
  currency text DEFAULT 'SDG',
  request_reason text,
  supervisor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  supervisor_notes text,
  approved_at timestamptz,
  rejected_at timestamptz,
  payment_method text,
  payment_details jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add missing columns if table already exists
DO $$ 
BEGIN
  -- Add wallet_id column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'payout_requests' 
                 AND column_name = 'wallet_id') THEN
    ALTER TABLE public.payout_requests ADD COLUMN wallet_id uuid REFERENCES public.wallets(id) ON DELETE CASCADE;
  END IF;
  
  -- Add currency column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'payout_requests' 
                 AND column_name = 'currency') THEN
    ALTER TABLE public.payout_requests ADD COLUMN currency text DEFAULT 'SDG';
  END IF;
  
  -- Add request_reason column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'payout_requests' 
                 AND column_name = 'request_reason') THEN
    ALTER TABLE public.payout_requests ADD COLUMN request_reason text;
  END IF;
  
  -- Add supervisor_id column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'payout_requests' 
                 AND column_name = 'supervisor_id') THEN
    ALTER TABLE public.payout_requests ADD COLUMN supervisor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  
  -- Add supervisor_notes column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'payout_requests' 
                 AND column_name = 'supervisor_notes') THEN
    ALTER TABLE public.payout_requests ADD COLUMN supervisor_notes text;
  END IF;
  
  -- Add approved_at column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'payout_requests' 
                 AND column_name = 'approved_at') THEN
    ALTER TABLE public.payout_requests ADD COLUMN approved_at timestamptz;
  END IF;
  
  -- Add rejected_at column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'payout_requests' 
                 AND column_name = 'rejected_at') THEN
    ALTER TABLE public.payout_requests ADD COLUMN rejected_at timestamptz;
  END IF;
  
  -- Add payment_method column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'payout_requests' 
                 AND column_name = 'payment_method') THEN
    ALTER TABLE public.payout_requests ADD COLUMN payment_method text;
  END IF;
  
  -- Add payment_details column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'payout_requests' 
                 AND column_name = 'payment_details') THEN
    ALTER TABLE public.payout_requests ADD COLUMN payment_details jsonb;
  END IF;
  
  -- Add created_at column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'payout_requests' 
                 AND column_name = 'created_at') THEN
    ALTER TABLE public.payout_requests ADD COLUMN created_at timestamptz DEFAULT now();
  END IF;
  
  -- Add updated_at column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'payout_requests' 
                 AND column_name = 'updated_at') THEN
    ALTER TABLE public.payout_requests ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- WITHDRAWAL REQUESTS TABLE (primary table used by WalletContext)
-- Stores user requests to withdraw money from their wallet
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'SDG',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  request_reason text,
  supervisor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  supervisor_notes text,
  approved_at timestamptz,
  rejected_at timestamptz,
  payment_method text,
  payment_details jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for withdrawal_requests
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user_id ON public.withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_wallet_id ON public.withdrawal_requests(wallet_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON public.withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_created_at ON public.withdrawal_requests(created_at DESC);

-- SITE VISIT COSTS TABLE
-- Stores cost breakdown for site visits (transportation, accommodation, meals, etc.)
CREATE TABLE IF NOT EXISTS public.site_visit_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_visit_id uuid NOT NULL REFERENCES public.mmp_site_entries(id) ON DELETE CASCADE,
  transportation_cost numeric NOT NULL DEFAULT 0 CHECK (transportation_cost >= 0),
  accommodation_cost numeric NOT NULL DEFAULT 0 CHECK (accommodation_cost >= 0),
  meal_allowance numeric NOT NULL DEFAULT 0 CHECK (meal_allowance >= 0),
  other_costs numeric NOT NULL DEFAULT 0 CHECK (other_costs >= 0),
  total_cost numeric GENERATED ALWAYS AS (
    transportation_cost + accommodation_cost + meal_allowance + other_costs
  ) STORED,
  currency text NOT NULL DEFAULT 'SDG',
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  adjusted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  adjustment_reason text,
  cost_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(site_visit_id)
);

-- WALLET SETTINGS TABLE
-- Stores user preferences for wallet notifications and auto-withdraw settings
CREATE TABLE IF NOT EXISTS public.wallet_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_prefs jsonb DEFAULT '{}'::jsonb,
  auto_withdraw boolean DEFAULT false,
  last_updated timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON public.wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON public.wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type ON public.wallet_transactions(type);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_status ON public.wallet_transactions(status);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON public.wallet_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_site_visit_id ON public.wallet_transactions(related_site_visit_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_user_id ON public.payout_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON public.payout_requests(status);
CREATE INDEX IF NOT EXISTS idx_payout_requests_requested_at ON public.payout_requests(requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_visit_costs_site_visit_id ON public.site_visit_costs(site_visit_id);

-- Create function to update wallet balances automatically
CREATE OR REPLACE FUNCTION public.update_wallet_balance()
RETURNS TRIGGER AS $$
DECLARE
  amount_change bigint;
  new_balance_cents bigint;
  abs_amount_cents bigint;
BEGIN
  -- Update wallet balance when transaction is posted
  IF NEW.status = 'posted' AND (OLD.status IS NULL OR OLD.status != 'posted') THEN
    -- Get absolute amount for calculations
    abs_amount_cents := ABS(NEW.amount_cents);
    
    -- Determine amount change (positive for credits, negative for debits)
    -- If amount_cents is negative, it's already a debit; if positive, check type
    amount_change := CASE 
      WHEN NEW.amount_cents < 0 THEN NEW.amount_cents  -- Already negative
      WHEN NEW.type IN ('withdrawal', 'adjustment_debit', 'penalty') THEN -abs_amount_cents
      ELSE abs_amount_cents
    END;
    
    -- Get current balance and calculate new balance
    SELECT balance_cents INTO new_balance_cents FROM public.wallets WHERE id = NEW.wallet_id;
    new_balance_cents := new_balance_cents + amount_change;
    
    -- Ensure balance doesn't go negative (should be handled by application, but safety check)
    IF new_balance_cents < 0 THEN
      RAISE EXCEPTION 'Insufficient wallet balance. Current: %, Requested: %', 
        (SELECT balance_cents FROM public.wallets WHERE id = NEW.wallet_id),
        abs_amount_cents;
    END IF;
    
    -- Update wallet
    UPDATE public.wallets
    SET 
      balance_cents = new_balance_cents,
      total_earned_cents = CASE 
        WHEN NEW.type IN ('site_visit_fee', 'earning', 'bonus', 'adjustment_credit') 
          OR (NEW.amount_cents > 0 AND NEW.type NOT IN ('withdrawal', 'adjustment_debit', 'penalty'))
        THEN total_earned_cents + abs_amount_cents
        ELSE total_earned_cents
      END,
      total_paid_out_cents = CASE 
        WHEN NEW.type IN ('withdrawal', 'adjustment_debit') 
          OR (NEW.amount_cents < 0)
        THEN total_paid_out_cents + abs_amount_cents
        ELSE total_paid_out_cents
      END,
      -- Update backward compatibility fields
      total_earned = CASE 
        WHEN NEW.type IN ('site_visit_fee', 'earning', 'bonus', 'adjustment_credit')
          OR (NEW.amount_cents > 0 AND NEW.type NOT IN ('withdrawal', 'adjustment_debit', 'penalty'))
        THEN COALESCE(total_earned, 0) + (abs_amount_cents::numeric / 100.0)
        ELSE COALESCE(total_earned, 0)
      END,
      total_withdrawn = CASE 
        WHEN NEW.type IN ('withdrawal', 'adjustment_debit')
          OR (NEW.amount_cents < 0)
        THEN COALESCE(total_withdrawn, 0) + (abs_amount_cents::numeric / 100.0)
        ELSE COALESCE(total_withdrawn, 0)
      END,
      balances = jsonb_set(
        COALESCE(balances, '{"SDG": 0}'::jsonb),
        ARRAY[COALESCE(NEW.currency, 'SDG')],
        to_jsonb((new_balance_cents::numeric / 100.0)::text::numeric)
      ),
      updated_at = now()
    WHERE id = NEW.wallet_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update wallet balances
DROP TRIGGER IF EXISTS trigger_update_wallet_balance ON public.wallet_transactions;
CREATE TRIGGER trigger_update_wallet_balance
  AFTER INSERT OR UPDATE ON public.wallet_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_wallet_balance();

-- Create function to update wallet updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_wallet_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for wallets updated_at
DROP TRIGGER IF EXISTS trigger_wallet_updated_at ON public.wallets;
CREATE TRIGGER trigger_wallet_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_wallet_updated_at();

-- Create function to update site_visit_costs updated_at
CREATE OR REPLACE FUNCTION public.update_site_visit_costs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for site_visit_costs updated_at
DROP TRIGGER IF EXISTS trigger_site_visit_costs_updated_at ON public.site_visit_costs;
CREATE TRIGGER trigger_site_visit_costs_updated_at
  BEFORE UPDATE ON public.site_visit_costs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_site_visit_costs_updated_at();

-- Enable Row Level Security
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_visit_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for wallets
CREATE POLICY "Users can view their own wallet"
  ON public.wallets FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own wallet"
  ON public.wallets FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own wallet"
  ON public.wallets FOR UPDATE
  USING (user_id = auth.uid());

-- RLS Policies for wallet_transactions
CREATE POLICY "Users can view their own transactions"
  ON public.wallet_transactions FOR SELECT
  USING (user_id = auth.uid() OR created_by = auth.uid());

CREATE POLICY "System can insert transactions"
  ON public.wallet_transactions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can update transactions"
  ON public.wallet_transactions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.name IN ('admin', 'financialAdmin')
    )
  );

-- RLS Policies for payout_requests
CREATE POLICY "Users can view their own payout requests"
  ON public.payout_requests FOR SELECT
  USING (user_id = auth.uid() OR decided_by = auth.uid());

CREATE POLICY "Users can create their own payout requests"
  ON public.payout_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own pending payout requests"
  ON public.payout_requests FOR UPDATE
  USING (
    user_id = auth.uid() AND status = 'requested'
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.name IN ('admin', 'financialAdmin', 'supervisor')
    )
  );

-- RLS Policies for site_visit_costs
CREATE POLICY "Users can view site visit costs"
  ON public.site_visit_costs FOR SELECT
  USING (true);

CREATE POLICY "Admins and supervisors can manage site visit costs"
  ON public.site_visit_costs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.name IN ('admin', 'supervisor', 'coordinator', 'financialAdmin')
    )
  );

-- RLS Policies for wallet_settings
CREATE POLICY "Users can manage their own wallet settings"
  ON public.wallet_settings FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ====================================
-- PACT WALLET MIGRATION SUPPORT
-- ====================================
-- Step 1: Backup existing wallet data (if tables exist)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'wallets') THEN
    CREATE TABLE IF NOT EXISTS wallets_backup AS 
    SELECT * FROM wallets;
  END IF;
END $$;

-- Step 2: Migrate existing wallet data to new multi-currency structure
-- This handles migration from old single-currency to new multi-currency format
DO $$ 
BEGIN
  -- Migrate old balance_cents to balances jsonb if balances is empty/default
  UPDATE public.wallets w
  SET 
    balances = CASE 
      WHEN balances IS NULL OR balances = '{"SDG": 0}'::jsonb OR balances = '{}'::jsonb
      THEN jsonb_build_object('SDG', COALESCE(balance_cents::numeric / 100.0, 0))
      ELSE balances
    END,
    total_earned = CASE 
      WHEN total_earned IS NULL OR total_earned = 0
      THEN COALESCE(total_earned_cents::numeric / 100.0, 0)
      ELSE total_earned
    END,
    total_withdrawn = CASE 
      WHEN total_withdrawn IS NULL OR total_withdrawn = 0
      THEN COALESCE(total_paid_out_cents::numeric / 100.0, 0)
      ELSE total_withdrawn
    END
  WHERE EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'wallets' 
    AND column_name = 'balance_cents'
  )
  AND (balances IS NULL OR balances = '{"SDG": 0}'::jsonb OR balances = '{}'::jsonb);
END $$;

-- Step 3: Migrate wallet_transactions from old to new structure
-- Convert amount_cents to amount if needed
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'wallet_transactions' 
    AND column_name = 'amount_cents'
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'wallet_transactions' 
      AND column_name = 'amount'
    )
  ) THEN
    ALTER TABLE public.wallet_transactions 
    ADD COLUMN amount numeric;
    
    UPDATE public.wallet_transactions
    SET amount = amount_cents::numeric / 100.0
    WHERE amount IS NULL;
  END IF;
END $$;

-- Step 4: Create function to automatically create wallet for new users
CREATE OR REPLACE FUNCTION create_wallet_for_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.wallets (user_id, balances, total_earned, total_withdrawn, balance_cents, total_earned_cents, total_paid_out_cents)
  VALUES (
    NEW.id, 
    '{"SDG": 0}'::jsonb, 
    0, 
    0,
    0,
    0,
    0
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-create wallet
DROP TRIGGER IF EXISTS auto_create_wallet ON public.profiles;
CREATE TRIGGER auto_create_wallet
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION create_wallet_for_user();

-- Step 5: Add RLS policies for withdrawal_requests (PACT requirements)
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own withdrawal requests" ON public.withdrawal_requests;
DROP POLICY IF EXISTS "Users can create their own withdrawal requests" ON public.withdrawal_requests;
DROP POLICY IF EXISTS "Users can update their own pending withdrawal requests" ON public.withdrawal_requests;
DROP POLICY IF EXISTS "Supervisors can view all withdrawal requests" ON public.withdrawal_requests;
DROP POLICY IF EXISTS "Supervisors can approve/reject withdrawal requests" ON public.withdrawal_requests;

-- Create RLS policies for withdrawal_requests (PACT style)
CREATE POLICY "Users can view their own withdrawal requests"
  ON public.withdrawal_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own withdrawal requests"
  ON public.withdrawal_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pending withdrawal requests"
  ON public.withdrawal_requests FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Supervisors can view all withdrawal requests"
  ON public.withdrawal_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'supervisor', 'fom', 'financialAdmin')
    )
  );

CREATE POLICY "Supervisors can approve/reject withdrawal requests"
  ON public.withdrawal_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'supervisor', 'fom', 'financialAdmin')
    )
  );

-- Step 6: Update site_visit_costs RLS policies (PACT requirements)
DROP POLICY IF EXISTS "Users can view site visit costs for their assigned visits" ON public.site_visit_costs;
DROP POLICY IF EXISTS "Supervisors can manage site visit costs" ON public.site_visit_costs;

CREATE POLICY "Users can view site visit costs for their assigned visits"
  ON public.site_visit_costs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.mmp_site_entries mse
      WHERE mse.id = site_visit_costs.site_visit_id
      AND (
        mse.monitoring_by = (SELECT email FROM public.profiles WHERE id = auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.user_roles 
          WHERE user_id = auth.uid() 
          AND role IN ('admin', 'supervisor', 'fom', 'financialAdmin')
        )
      )
    )
  );

CREATE POLICY "Supervisors can manage site visit costs"
  ON public.site_visit_costs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'supervisor', 'fom', 'financialAdmin')
    )
  );

-- Step 7: Create updated_at trigger for withdrawal_requests
CREATE OR REPLACE FUNCTION update_withdrawal_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_withdrawal_requests_updated_at ON public.withdrawal_requests;
CREATE TRIGGER update_withdrawal_requests_updated_at
  BEFORE UPDATE ON public.withdrawal_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_withdrawal_requests_updated_at();

-- Comments for documentation
COMMENT ON TABLE public.wallets IS 'Main wallet table storing user balances and financial totals';
COMMENT ON TABLE public.wallet_transactions IS 'All wallet transactions including earnings, withdrawals, and adjustments';
COMMENT ON TABLE public.payout_requests IS 'User requests to withdraw money from their wallet (alternative to withdrawal_requests)';
COMMENT ON TABLE public.withdrawal_requests IS 'User requests to withdraw money from their wallet (primary table used by WalletContext)';
COMMENT ON TABLE public.site_visit_costs IS 'Cost breakdown for site visits (transportation, accommodation, meals, etc.)';
COMMENT ON TABLE public.wallet_settings IS 'User preferences for wallet notifications and auto-withdraw settings';

