-- =============================================================================
-- Migration: Add retainer_payout_currency to user_classifications
-- Date: 2026-08-15
-- Run in: Supabase Studio → SQL Editor
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE
--
-- Fixes: classification save fails with "column retainer_payout_currency does
-- not exist" when assigning/updating a user classification.
-- =============================================================================

-- 1. Add the missing column
ALTER TABLE public.user_classifications
  ADD COLUMN IF NOT EXISTS retainer_payout_currency text;

-- 2. Recreate the view to expose the new column
--    (DROP + recreate because PostgreSQL only allows appending columns with
--     CREATE OR REPLACE VIEW, not inserting them mid-list)
DROP VIEW IF EXISTS public.current_user_classifications CASCADE;
CREATE VIEW public.current_user_classifications AS
SELECT DISTINCT ON (user_id)
  uc.id,
  uc.user_id,
  uc.classification_level,
  uc.role_scope,
  uc.effective_from,
  uc.effective_until,
  uc.has_retainer,
  uc.retainer_amount_cents,
  uc.retainer_currency,
  uc.retainer_payout_currency,
  uc.retainer_frequency,
  uc.is_active,
  uc.created_at,
  uc.updated_at,
  p.full_name,
  p.email,
  p.role AS user_role
FROM public.user_classifications uc
JOIN public.profiles p ON uc.user_id = p.id
WHERE uc.is_active = true
  AND uc.effective_from <= now()
  AND (uc.effective_until IS NULL OR uc.effective_until > now())
ORDER BY user_id, effective_from DESC;
