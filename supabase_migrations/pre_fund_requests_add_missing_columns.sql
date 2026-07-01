-- ============================================================
-- Migration: pre_fund_requests — add GL account & settings columns
-- Safe to run multiple times (all guards use IF NOT EXISTS).
-- Run in Supabase Dashboard → SQL Editor.
-- ============================================================

-- GL account mappings (added with Pre-Funding GL Bridge feature)
ALTER TABLE pre_fund_requests
  ADD COLUMN IF NOT EXISTS gl_receipt_account     text,
  ADD COLUMN IF NOT EXISTS gl_liability_account   text,
  ADD COLUMN IF NOT EXISTS gl_expense_account     text,
  ADD COLUMN IF NOT EXISTS gl_cf_account          text,
  ADD COLUMN IF NOT EXISTS gl_encumbrance_account text;

-- Low-balance / expiry alert settings
ALTER TABLE pre_fund_requests
  ADD COLUMN IF NOT EXISTS warning_days              integer,
  ADD COLUMN IF NOT EXISTS threshold_pct             numeric,
  ADD COLUMN IF NOT EXISTS threshold_amount          numeric;

-- Auto-renewal settings
ALTER TABLE pre_fund_requests
  ADD COLUMN IF NOT EXISTS auto_renewal_mode             text    NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS auto_renewal_days_before      integer,
  ADD COLUMN IF NOT EXISTS auto_renewal_bypass_approvals boolean NOT NULL DEFAULT false;

-- Fund period type linkage
ALTER TABLE pre_fund_requests
  ADD COLUMN IF NOT EXISTS period_type_id text;

-- Matching scope & cost category
ALTER TABLE pre_fund_requests
  ADD COLUMN IF NOT EXISTS matching_scope text NOT NULL DEFAULT 'country_project',
  ADD COLUMN IF NOT EXISTS cost_category  text;

-- Committed amount tracker (set to 0 on fund creation, updated by commitment engine)
ALTER TABLE pre_fund_requests
  ADD COLUMN IF NOT EXISTS committed_amount numeric NOT NULL DEFAULT 0;

-- Alert notification recipients (array of profile UUIDs)
ALTER TABLE pre_fund_requests
  ADD COLUMN IF NOT EXISTS notification_recipients text[] NOT NULL DEFAULT '{}';

-- Internal notes
ALTER TABLE pre_fund_requests
  ADD COLUMN IF NOT EXISTS notes text;

-- Force Supabase to reload its schema cache
NOTIFY pgrst, 'reload schema';
