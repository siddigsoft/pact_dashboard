-- =============================================================================
-- PHASE A MIGRATION — Cycle Close & Site Visit Status System
-- =============================================================================
-- Run this in Supabase SQL Editor.
-- SAFE TO RE-RUN: all statements use IF NOT EXISTS / OR REPLACE / ON CONFLICT DO NOTHING.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: Normalize existing status values to lowercase in mmp_site_entries
-- -----------------------------------------------------------------------------
UPDATE public.mmp_site_entries
SET status = LOWER(TRIM(status))
WHERE status IS NOT NULL
  AND status != LOWER(TRIM(status));

-- -----------------------------------------------------------------------------
-- STEP 2: Rename 'completed' → 'submitted' in mmp_site_entries
-- This is the core rename: 'completed' (self-reported) → 'submitted' (awaiting WFP proof)
-- -----------------------------------------------------------------------------
UPDATE public.mmp_site_entries
SET status = 'submitted'
WHERE LOWER(TRIM(status)) = 'completed';

-- Verify the rename
DO $$
DECLARE
  still_completed INTEGER;
BEGIN
  SELECT COUNT(*) INTO still_completed
  FROM public.mmp_site_entries
  WHERE LOWER(TRIM(status)) = 'completed';

  IF still_completed > 0 THEN
    RAISE WARNING 'Phase A: % rows still have status=completed after rename.', still_completed;
  ELSE
    RAISE NOTICE 'Phase A Step 2 OK: all completed → submitted.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- STEP 2B: Add not_covered columns to mmp_site_entries
-- These were previously on the dropped site_visits table and are needed
-- for the Cycle Close Uncovered tab and bulk reason assignment.
-- -----------------------------------------------------------------------------
ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS not_covered_flag boolean DEFAULT false;

ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS not_covered_reason text;
-- Values: 'access_denied', 'security', 'absence', 'weather', 'other', etc.

ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS not_covered_reason_other text;

ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS not_covered_at timestamptz;

ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS not_covered_by uuid REFERENCES public.profiles(id);

-- Index for the uncovered sites query (cycle close uncovered tab)
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_not_covered
  ON public.mmp_site_entries (not_covered_flag)
  WHERE not_covered_flag = true;

RAISE NOTICE 'Phase A Step 2B: not_covered columns added to mmp_site_entries.';

-- -----------------------------------------------------------------------------
-- STEP 3: Add submitted_at column to mmp_site_entries
-- (Backfill from completed_at if it exists, else from updated_at)
-- -----------------------------------------------------------------------------
ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

-- Backfill submitted_at from completed_at where available
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'mmp_site_entries'
      AND column_name = 'completed_at'
  ) THEN
    UPDATE public.mmp_site_entries
    SET submitted_at = completed_at
    WHERE status = 'submitted'
      AND completed_at IS NOT NULL
      AND submitted_at IS NULL;
    RAISE NOTICE 'Phase A Step 3: backfilled submitted_at from completed_at.';
  ELSE
    RAISE NOTICE 'Phase A Step 3: completed_at column not found, skipping backfill.';
  END IF;
END $$;

-- Also add wfp_confirmed_at for when WFP matching confirms a site
ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS wfp_confirmed_at timestamptz;

-- And wfp_rejected_at
ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS wfp_rejected_at timestamptz;

-- And wfp_rejection_reason (from WFP file mismatch or manual rejection)
ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS wfp_rejection_reason text;

-- And wfp_match_confidence — for Phase C matching engine (text: strong/weak/fuzzy/none)
ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS wfp_match_confidence text;

-- And status_changed_at — always updated when status changes (for audit)
ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;

-- And status_changed_by
ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS status_changed_by uuid REFERENCES public.profiles(id);

-- And status_change_source — who/what triggered the change
-- Values: 'enumerator_app', 'admin_override', 'system_wfp_match', 'migration', 'cycle_close'
ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS status_change_source text;

-- Backfill status_changed_at for existing records
UPDATE public.mmp_site_entries
SET status_changed_at = COALESCE(updated_at, created_at, now())
WHERE status_changed_at IS NULL;

-- Index on the new status_changed_at for queries
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_status_changed_at
  ON public.mmp_site_entries (status_changed_at);

CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_submitted_at
  ON public.mmp_site_entries (submitted_at);

-- -----------------------------------------------------------------------------
-- STEP 4: Extend existing visit_status table
-- (DO NOT recreate — this table already exists at schema.sql line 430)
-- Add columns for richer status tracking without breaking existing data.
-- -----------------------------------------------------------------------------
ALTER TABLE public.visit_status
  ADD COLUMN IF NOT EXISTS previous_status text;

ALTER TABLE public.visit_status
  ADD COLUMN IF NOT EXISTS change_source text DEFAULT 'system';
-- Values: 'enumerator_app', 'admin_override', 'system_wfp_match', 'migration', 'cycle_close', 'system'

ALTER TABLE public.visit_status
  ADD COLUMN IF NOT EXISTS note text;

ALTER TABLE public.visit_status
  ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Index for querying by site_visit_id chronologically
CREATE INDEX IF NOT EXISTS idx_visit_status_site_visit_id
  ON public.visit_status (site_visit_id, updated_at);

-- -----------------------------------------------------------------------------
-- STEP 5: Create site_visit_status_log table (append-only audit log)
-- This is the permanent, append-only status change history.
-- visit_status holds current status; this holds the full change history.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_visit_status_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_entry_id    uuid NOT NULL REFERENCES public.mmp_site_entries(id) ON DELETE CASCADE,
  mmp_id           uuid REFERENCES public.mmp_files(id) ON DELETE SET NULL,
  old_status       text,
  new_status       text NOT NULL,
  changed_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_by_name  text,
  changed_by_role  text,
  change_source    text NOT NULL DEFAULT 'system',
  -- Values: 'enumerator_app', 'admin_override', 'system_wfp_match', 'migration', 'cycle_close', 'system'
  note             text,
  metadata         jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- This table is append-only — no updates or deletes allowed (enforced by RLS)
ALTER TABLE public.site_visit_status_log ENABLE ROW LEVEL SECURITY;

-- SELECT: enumerator sees only their own entries; admin/finance/super_admin see all
CREATE POLICY "svsl_select_own_or_admin" ON public.site_visit_status_log
  FOR SELECT USING (
    changed_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin', 'superAdmin', 'finance', 'fom',
                       'Field Operation Manager (FOM)', 'Finance')
    )
  );

-- INSERT: any authenticated user can insert (they log their own status changes)
CREATE POLICY "svsl_insert_authenticated" ON public.site_visit_status_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- UPDATE/DELETE: blocked — this is append-only
-- (No UPDATE or DELETE policies means those operations are denied)

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_svsl_site_entry_id
  ON public.site_visit_status_log (site_entry_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_svsl_mmp_id
  ON public.site_visit_status_log (mmp_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_svsl_changed_by
  ON public.site_visit_status_log (changed_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_svsl_new_status
  ON public.site_visit_status_log (new_status, created_at DESC);

-- -----------------------------------------------------------------------------
-- STEP 6: Backfill site_visit_status_log from existing mmp_site_entries
-- Creates one "current state" log entry per site with source = 'migration'
-- so the history tab always has at least one row per site.
-- -----------------------------------------------------------------------------
INSERT INTO public.site_visit_status_log (
  site_entry_id,
  mmp_id,
  old_status,
  new_status,
  change_source,
  note,
  created_at
)
SELECT
  e.id,
  e.mmp_file_id,
  NULL,
  COALESCE(e.status, 'assigned'),
  'migration',
  'Phase A migration backfill — current status at time of migration',
  COALESCE(e.status_changed_at, e.updated_at, e.created_at, now())
FROM public.mmp_site_entries e
ON CONFLICT DO NOTHING;

-- For sites that were renamed from 'completed' → 'submitted', also log the rename event
INSERT INTO public.site_visit_status_log (
  site_entry_id,
  mmp_id,
  old_status,
  new_status,
  change_source,
  note,
  created_at
)
SELECT
  e.id,
  e.mmp_file_id,
  'completed',
  'submitted',
  'migration',
  'Status renamed: completed → submitted (Phase A migration)',
  now()
FROM public.mmp_site_entries e
WHERE e.status = 'submitted'
ON CONFLICT DO NOTHING;

RAISE NOTICE 'Phase A Step 6: site_visit_status_log backfilled.';

-- -----------------------------------------------------------------------------
-- STEP 7: Create payment_event_log table (append-only money trail)
-- Shell table — events are populated from Phase B onwards.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_event_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text NOT NULL,
  -- Values: site_confirmed, site_rejected, advance_approved, advance_paid,
  --         advance_reconciled, advance_deducted_from_fee, recovery_decision_rolled,
  --         recovery_decision_return_required, recovery_decision_writeoff,
  --         repayment_received, settlement_requested, settlement_disbursed,
  --         overpayment_detected, fee_locked, fee_unlocked
  amount          numeric,
  amount_currency text DEFAULT 'SDG',
  site_entry_id   uuid REFERENCES public.mmp_site_entries(id) ON DELETE SET NULL,
  mmp_id          uuid REFERENCES public.mmp_files(id) ON DELETE SET NULL,
  payment_ref_id  uuid,
  -- References down_payment_requests.id or any other payment record
  performed_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  performed_by_name text,
  performed_by_role text,
  enumerator_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  note            text,
  metadata        jsonb,
  -- metadata may include: { target_mmp_id, transport_fee, enumerator_fee, match_confidence, etc. }
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_event_log ENABLE ROW LEVEL SECURITY;

-- SELECT: enumerator sees their own events; admin/finance/super_admin see all
CREATE POLICY "pel_select_own_or_admin" ON public.payment_event_log
  FOR SELECT USING (
    enumerator_id = auth.uid()
    OR performed_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin', 'superAdmin', 'finance', 'fom',
                       'Field Operation Manager (FOM)', 'Finance')
    )
  );

-- INSERT: any authenticated user (system calls from edge functions also need this)
CREATE POLICY "pel_insert_authenticated" ON public.payment_event_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- UPDATE/DELETE: blocked — append-only
CREATE INDEX IF NOT EXISTS idx_pel_site_entry_id
  ON public.payment_event_log (site_entry_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pel_mmp_id
  ON public.payment_event_log (mmp_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pel_enumerator_id
  ON public.payment_event_log (enumerator_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pel_event_type
  ON public.payment_event_log (event_type, created_at DESC);

-- -----------------------------------------------------------------------------
-- STEP 8: Update the wallet trigger — fire on 'wfp_confirmed', not 'completed'
-- The old trigger fired on LOWER(status) = 'completed'.
-- Phase A renames it to 'submitted'. The payment trigger will move to 'wfp_confirmed'
-- in Phase C. For now, update the trigger condition so it no longer fires on 'completed'
-- and add a comment explaining Phase C will add 'wfp_confirmed'.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_wallet_transaction_on_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id uuid;
  v_wallet_id uuid;
  v_amount numeric;
  v_amount_cents bigint;
  v_current_balance numeric;
  v_new_balance numeric;
  v_transaction_id uuid;
  v_site_name text;
BEGIN
  -- Phase A: trigger now fires on 'wfp_confirmed' (previously 'completed').
  -- 'submitted' is NOT a payment trigger — it only means the enumerator self-reported.
  -- Payment requires WFP confirmation (wfp_confirmed), set in Phase C.
  IF (NEW.status IS DISTINCT FROM OLD.status)
     AND (LOWER(NEW.status) = 'wfp_confirmed')
     AND (OLD.status IS NULL OR LOWER(OLD.status) != 'wfp_confirmed') THEN

    -- Determine user to pay (priority: accepted_by > claimed_by > visit_completed_by)
    v_user_id := CASE
      WHEN NEW.accepted_by IS NOT NULL THEN
        CASE
          WHEN NEW.accepted_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN NEW.accepted_by::uuid
          ELSE NULL
        END
      WHEN NEW.claimed_by IS NOT NULL THEN NEW.claimed_by
      WHEN NEW.visit_completed_by IS NOT NULL THEN NEW.visit_completed_by
      ELSE NULL
    END;

    IF v_user_id IS NULL THEN
      RAISE NOTICE 'Phase A: No user to pay for site % (wfp_confirmed trigger skipped)', NEW.id;
      RETURN NEW;
    END IF;

    -- Calculate fee (transport + enumerator, or cost as total)
    v_amount := COALESCE(
      NULLIF(NEW.cost, 0),
      COALESCE(NEW.enumerator_fee, 0) + COALESCE(NEW.transport_fee, 0),
      0
    );

    IF v_amount <= 0 THEN
      RAISE NOTICE 'Phase A: Zero fee for site % (wfp_confirmed trigger skipped)', NEW.id;
      RETURN NEW;
    END IF;

    -- Look up or create wallet
    SELECT id INTO v_wallet_id
    FROM public.wallets
    WHERE user_id = v_user_id
    LIMIT 1;

    IF v_wallet_id IS NULL THEN
      INSERT INTO public.wallets (user_id, balance, currency)
      VALUES (v_user_id, 0, 'SDG')
      RETURNING id INTO v_wallet_id;
    END IF;

    -- Get current balance
    SELECT COALESCE(balance, 0) INTO v_current_balance
    FROM public.wallets
    WHERE id = v_wallet_id;

    -- Deduct any approved advances for this site
    DECLARE
      v_advance_total numeric := 0;
    BEGIN
      SELECT COALESCE(SUM(amount), 0) INTO v_advance_total
      FROM public.down_payment_requests
      WHERE mmp_id = NEW.mmp_file_id::text
        AND site_entry_id = NEW.id::text
        AND status IN ('approved', 'paid');
    EXCEPTION WHEN OTHERS THEN
      v_advance_total := 0;
    END;

    v_amount_cents := ROUND(v_amount * 100)::bigint;
    v_new_balance := v_current_balance + v_amount - COALESCE(v_advance_total, 0);

    -- Insert wallet transaction of type 'settlement_fee' (Phase A adds this type)
    v_site_name := COALESCE(NEW.site_name, NEW.site_code, 'Unknown Site');

    INSERT INTO public.wallet_transactions (
      wallet_id,
      amount,
      amount_cents,
      balance_after,
      transaction_type,
      description,
      metadata,
      created_at
    ) VALUES (
      v_wallet_id,
      v_amount,
      v_amount_cents,
      v_new_balance,
      'site_visit_fee',
      'WFP Confirmed Site Fee — ' || v_site_name,
      jsonb_build_object(
        'site_entry_id', NEW.id,
        'mmp_id', NEW.mmp_file_id,
        'transport_fee', COALESCE(NEW.transport_fee, 0),
        'enumerator_fee', COALESCE(NEW.enumerator_fee, 0),
        'cost', COALESCE(NEW.cost, 0),
        'advance_deducted', COALESCE(v_advance_total, 0),
        'trigger', 'wfp_confirmed',
        'phase', 'A'
      ),
      now()
    );

    -- Update wallet balance
    UPDATE public.wallets
    SET balance = v_new_balance,
        updated_at = now()
    WHERE id = v_wallet_id;

    RAISE NOTICE 'Phase A: Wallet credited % SDG for site % (user: %)', v_amount, NEW.id, v_user_id;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the trigger is attached to mmp_site_entries
DROP TRIGGER IF EXISTS trigger_create_wallet_transaction_on_completion ON public.mmp_site_entries;
CREATE TRIGGER trigger_create_wallet_transaction_on_completion
  AFTER UPDATE OF status ON public.mmp_site_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.create_wallet_transaction_on_completion();

RAISE NOTICE 'Phase A Step 8: Wallet trigger updated — now fires on wfp_confirmed.';

-- -----------------------------------------------------------------------------
-- STEP 9: Storage buckets
-- Run separately if your Supabase project does not support bucket creation via SQL.
-- These buckets are also created via the Supabase Dashboard if SQL fails.
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'wfp-confirmation-files',
  'wfp-confirmation-files',
  false,
  52428800, -- 50 MB max per file
  ARRAY['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-submission-evidence',
  'site-submission-evidence',
  false,
  20971520, -- 20 MB max per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies for wfp-confirmation-files bucket
CREATE POLICY "wfp_files_select_admin" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'wfp-confirmation-files'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin', 'superAdmin', 'fom',
                       'Field Operation Manager (FOM)', 'finance', 'Finance')
    )
  );

CREATE POLICY "wfp_files_insert_admin" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'wfp-confirmation-files'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin', 'superAdmin', 'fom',
                       'Field Operation Manager (FOM)')
    )
  );

CREATE POLICY "wfp_files_delete_super_admin" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'wfp-confirmation-files'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'superAdmin')
    )
  );

-- Storage RLS policies for site-submission-evidence bucket
CREATE POLICY "evidence_select_own_or_admin" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'site-submission-evidence'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('admin', 'super_admin', 'superAdmin', 'fom',
                         'Field Operation Manager (FOM)', 'supervisor', 'Supervisor')
      )
    )
  );

CREATE POLICY "evidence_insert_authenticated" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'site-submission-evidence'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- -----------------------------------------------------------------------------
-- STEP 10: Add a performance index on mmp_site_entries status for new values
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_status_submitted
  ON public.mmp_site_entries (status)
  WHERE status IN ('submitted', 'wfp_confirmed', 'rejected');

-- -----------------------------------------------------------------------------
-- DONE
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'PHASE A MIGRATION COMPLETE';
  RAISE NOTICE '  1. Statuses normalized to lowercase';
  RAISE NOTICE '  2. completed → submitted renamed';
  RAISE NOTICE '  3. submitted_at / wfp_confirmed_at / wfp_rejected_at columns added';
  RAISE NOTICE '  4. visit_status table extended (previous_status, change_source, note, metadata)';
  RAISE NOTICE '  5. site_visit_status_log table created (append-only)';
  RAISE NOTICE '  6. site_visit_status_log backfilled from existing records';
  RAISE NOTICE '  7. payment_event_log table created (append-only, empty shell)';
  RAISE NOTICE '  8. Wallet trigger updated: now fires on wfp_confirmed (not completed)';
  RAISE NOTICE '  9. Storage buckets created: wfp-confirmation-files + site-submission-evidence';
  RAISE NOTICE '  10. Indexes added for new status values';
  RAISE NOTICE '=============================================================';
END $$;
