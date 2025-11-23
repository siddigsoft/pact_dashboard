-- =====================================================
-- COMPLETE SUPABASE SETUP FOR PACT PLATFORM
-- =====================================================
-- This script creates ALL required tables for the PACT platform
-- Run this ONCE in Supabase SQL Editor
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- SITE VISITS TABLE (if not exists)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.site_visits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  site_name text,
  site_code text,
  locality text,
  state text,
  hub text,
  status text DEFAULT 'pending',
  assigned_to uuid,
  assigned_by uuid,
  assigned_at timestamptz,
  due_date timestamptz,
  scheduled_date timestamptz,
  completed_at timestamptz,
  mmp_id text,
  mmp_file_id uuid,
  mmp_site_entry_id uuid,
  main_activity text,
  activity text,
  project_activities text[],
  visit_type text,
  monitoring_type text,
  complexity text,
  priority text DEFAULT 'medium',
  location jsonb DEFAULT '{}'::jsonb,
  coordinates jsonb DEFAULT '{}'::jsonb,
  fees jsonb DEFAULT '{}'::jsonb,
  cost numeric,
  enumerator_fee numeric,
  transport_fee numeric,
  permit_details jsonb DEFAULT '{}'::jsonb,
  description text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT site_visits_pkey PRIMARY KEY (id)
);

-- =====================================================
-- WALLET TRANSACTIONS TABLE (if not exists)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  amount numeric,
  currency text DEFAULT 'SDG',
  transaction_type text,
  description text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id)
);

-- =====================================================
-- COST SUBMISSION TABLES
-- =====================================================

-- Main cost submissions table
CREATE TABLE IF NOT EXISTS public.site_visit_cost_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_visit_id UUID REFERENCES public.site_visits(id) ON DELETE CASCADE,
  mmp_file_id UUID,
  project_id UUID,
  
  -- Submitter information
  submitted_by UUID,
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
  reviewed_by UUID,
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

-- Cost approval history table
CREATE TABLE IF NOT EXISTS public.cost_approval_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES public.site_visit_cost_submissions(id) ON DELETE CASCADE,
  
  -- Action details
  action VARCHAR(50) NOT NULL,
  actor_id UUID,
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

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_site_visits_status ON public.site_visits(status);
CREATE INDEX IF NOT EXISTS idx_site_visits_assigned_to ON public.site_visits(assigned_to);
CREATE INDEX IF NOT EXISTS idx_site_visits_created_at ON public.site_visits(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_trans_user ON public.wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_trans_created ON public.wallet_transactions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cost_submissions_site_visit ON site_visit_cost_submissions(site_visit_id);
CREATE INDEX IF NOT EXISTS idx_cost_submissions_submitted_by ON site_visit_cost_submissions(submitted_by);
CREATE INDEX IF NOT EXISTS idx_cost_submissions_status ON site_visit_cost_submissions(status);
CREATE INDEX IF NOT EXISTS idx_cost_submissions_created_at ON site_visit_cost_submissions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cost_history_submission ON cost_approval_history(submission_id);
CREATE INDEX IF NOT EXISTS idx_cost_history_actor ON cost_approval_history(actor_id);

-- =====================================================
-- TRIGGER FUNCTIONS
-- =====================================================

-- Auto-calculate total cost
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
  BEFORE INSERT OR UPDATE ON site_visit_cost_submissions
  FOR EACH ROW
  EXECUTE FUNCTION calculate_total_cost_submission();

-- Auto-update timestamp
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

-- =====================================================
-- DISABLE RLS (Development Mode)
-- =====================================================
ALTER TABLE public.site_visits DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_visit_cost_submissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_approval_history DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================
GRANT ALL ON public.site_visits TO anon, authenticated, service_role;
GRANT ALL ON public.wallet_transactions TO anon, authenticated, service_role;
GRANT ALL ON public.site_visit_cost_submissions TO anon, authenticated, service_role;
GRANT ALL ON public.cost_approval_history TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- =====================================================
-- VERIFICATION QUERY
-- =====================================================
-- Run this after to verify tables were created:
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE '%cost%' OR tablename IN ('site_visits', 'wallet_transactions');
