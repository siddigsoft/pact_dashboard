-- Migration: Add allow_overpay column to pre_fund_requests and pre_fund_settings
-- Apply via Supabase SQL Editor

-- 1. Per-fund override (NULL = use global default, TRUE = allow, FALSE = block)
ALTER TABLE pre_fund_requests
  ADD COLUMN IF NOT EXISTS allow_overpay boolean DEFAULT NULL;

-- 2. Global default in settings (TRUE = allow by default, FALSE = block by default)
ALTER TABLE pre_fund_settings
  ADD COLUMN IF NOT EXISTS allow_overpay_default boolean NOT NULL DEFAULT true;

-- Done. No RLS changes needed — pre_fund_requests RLS policies already cover this column.
