-- =============================================================================
-- PACT COA — Recovery & 6-Digit Standardisation (Atomic)
-- =============================================================================
-- Run this if acct_coa_standardize_6digit.sql left the database in a partial
-- state, OR as a standalone replacement for that file.
--
-- Strategy (3 phases, all inside one transaction):
--   Phase 0 — strip any stuck OLD_XXXX codes from previous partial runs
--   Phase 1 — apply custom 6-digit codes for the 15 Odoo-conflict codes
--   Phase 2 — pad ALL remaining 4-digit codes with '00' automatically
--
-- Safe to re-run: each UPDATE targets only codes of the right length.
-- =============================================================================

BEGIN;

-- ─── Phase 0: Strip stuck OLD_ prefixes (8-char = OLD_ + 4-digit) ────────────
UPDATE public.acct_accounts
   SET code = substring(code FROM 5)   -- removes 'OLD_' (first 4 chars)
 WHERE code LIKE 'OLD_%'
   AND length(code) = 8;               -- only OLD_XXXX, not longer/shorter

-- ─── Phase 1: Conflict-aware codes (these would clash with Odoo if padded) ───
-- Must run BEFORE Phase 2 so these are already 6-digit and Phase 2 skips them.
UPDATE public.acct_accounts SET code = '110001' WHERE length(code) = 4 AND code = '1100';
UPDATE public.acct_accounts SET code = '111001' WHERE length(code) = 4 AND code = '1110';
UPDATE public.acct_accounts SET code = '210001' WHERE length(code) = 4 AND code = '2100';
UPDATE public.acct_accounts SET code = '210501' WHERE length(code) = 4 AND code = '2105';
UPDATE public.acct_accounts SET code = '211001' WHERE length(code) = 4 AND code = '2110';
UPDATE public.acct_accounts SET code = '220001' WHERE length(code) = 4 AND code = '2200';
UPDATE public.acct_accounts SET code = '224001' WHERE length(code) = 4 AND code = '2240';
UPDATE public.acct_accounts SET code = '300001' WHERE length(code) = 4 AND code = '3000';
UPDATE public.acct_accounts SET code = '400001' WHERE length(code) = 4 AND code = '4000';
UPDATE public.acct_accounts SET code = '500001' WHERE length(code) = 4 AND code = '5000';
UPDATE public.acct_accounts SET code = '520001' WHERE length(code) = 4 AND code = '5200';
UPDATE public.acct_accounts SET code = '531009' WHERE length(code) = 4 AND code = '5310';
UPDATE public.acct_accounts SET code = '532001' WHERE length(code) = 4 AND code = '5320';
UPDATE public.acct_accounts SET code = '600001' WHERE length(code) = 4 AND code = '6000';
UPDATE public.acct_accounts SET code = '240100' WHERE length(code) = 4 AND code = '2401';

-- ─── Phase 2: Pad ALL remaining 4-digit codes with '00' ──────────────────────
-- Covers every code not already handled above, including any unknown codes.
-- e.g. 1000→100000, 7000→700000, 4990→499000, 9990→999000, etc.
UPDATE public.acct_accounts
   SET code = code || '00'
 WHERE length(code) = 4;

-- ─── Safety check (causes full ROLLBACK if anything is wrong) ────────────────
DO $$
DECLARE v_4digit int; v_old int;
BEGIN
  SELECT count(*) INTO v_4digit FROM public.acct_accounts WHERE length(code) = 4;
  SELECT count(*) INTO v_old    FROM public.acct_accounts WHERE code LIKE 'OLD_%';

  IF v_4digit > 0 THEN
    RAISE EXCEPTION
      'STILL_4DIGIT: % account(s) still have 4-digit codes. '
      'Run: SELECT code, name_en FROM acct_accounts WHERE length(code)=4;', v_4digit;
  END IF;

  IF v_old > 0 THEN
    RAISE EXCEPTION
      'STILL_OLD: % account(s) still have OLD_ prefix. '
      'Run: SELECT code FROM acct_accounts WHERE code LIKE ''OLD_%%'';', v_old;
  END IF;

  RAISE NOTICE '✅ All account codes are now 6+ digits. No 4-digit or OLD_ codes remain.';
END $$;

COMMIT;

-- =============================================================================
-- Verification (run after COMMIT to confirm)
-- =============================================================================
SELECT length(code) AS code_length, count(*) AS cnt
  FROM public.acct_accounts
 GROUP BY length(code)
 ORDER BY code_length;
-- Expect: only 6-digit (and possibly 7-digit for pre-existing non-PACT accounts)
-- Expect: NO rows with code_length = 4
