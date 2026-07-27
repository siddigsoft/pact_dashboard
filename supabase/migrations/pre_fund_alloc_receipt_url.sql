-- pre_fund_alloc_receipt_url.sql
-- Adds receipt_url column to pre_fund_allocations so that
-- supporting documents can be attached when distributing funds
-- or adjusting (topping up) an existing allocation.
-- Safe to run multiple times.

ALTER TABLE public.pre_fund_allocations
  ADD COLUMN IF NOT EXISTS receipt_url TEXT;
