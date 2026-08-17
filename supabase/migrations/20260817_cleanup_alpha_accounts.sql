-- =============================================================================
-- Cleanup: Remove alpha-prefixed (country-coded) accounts and their zero-value
-- journal lines. All 49 affected accounts have total_dr = 0 and total_cr = 0
-- confirmed via diagnostic query — no real monetary value exists on these lines.
-- =============================================================================

-- Step 1: Re-activate all alpha accounts so this script can reference them
-- (they may have been set inactive in a previous session)
UPDATE public.acct_accounts
SET    is_active = true
WHERE  code ~ '^[A-Z]{2}-';

-- Step 2: Delete journal lines that reference alpha accounts
-- Safe: all functional_amount values on these lines are confirmed 0
DELETE FROM public.acct_journal_lines
WHERE  account_id IN (
  SELECT id FROM public.acct_accounts WHERE code ~ '^[A-Z]{2}-'
);

-- Step 3: Delete any journal entries (headers) that are now empty
-- (all their lines were alpha-account lines)
DELETE FROM public.acct_journal_entries
WHERE  id NOT IN (
  SELECT DISTINCT entry_id FROM public.acct_journal_lines
);

-- Step 4: Delete all alpha-prefixed accounts
-- parent_id self-references within alpha accounts: delete children first, then parents
-- Round 1 — leaf nodes (no children pointing to them from within alpha set)
DELETE FROM public.acct_accounts
WHERE  code ~ '^[A-Z]{2}-'
  AND  id NOT IN (
    SELECT DISTINCT parent_id FROM public.acct_accounts
    WHERE  parent_id IS NOT NULL
      AND  code ~ '^[A-Z]{2}-'
  );

-- Round 2 — remaining parent nodes (now safe to delete)
DELETE FROM public.acct_accounts
WHERE  code ~ '^[A-Z]{2}-';

-- Verify: should return 0 rows
SELECT code, name_en FROM public.acct_accounts WHERE code ~ '^[A-Z]{2}-';
