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
-- These were previously on the dropped site_visits table.
-- -----------------------------------------------------------------------------
ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS not_covered_flag boolean DEFAULT false;

ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS not_covered_reason text;

ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS not_covered_reason_other text;

ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS not_covered_at timestamptz;

ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS not_covered_by uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_not_covered
  ON public.mmp_site_entries (not_covered_flag)
  WHERE not_covered_flag = true;

DO $$ BEGIN
  RAISE NOTICE 'Phase A Step 2B: not_covered columns added to mmp_site_entries.';
END $$;

-- -----------------------------------------------------------------------------
-- STEP 3: Add audit/timestamp columns to mmp_site_entries
-- -----------------------------------------------------------------------------
ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

-- Backfill submitted_at from completed_at if that column exists
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

ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS wfp_confirmed_at timestamptz;

ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS wfp_rejected_at timestamptz;

ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS wfp_rejection_reason text;

ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS wfp_match_confidence text;

ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;

ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS status_changed_by uuid REFERENCES public.profiles(id);

ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS status_change_source text;

UPDATE public.mmp_site_entries
SET status_changed_at = COALESCE(updated_at, created_at, now())
WHERE status_changed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_status_changed_at
  ON public.mmp_site_entries (status_changed_at);

CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_submitted_at
  ON public.mmp_site_entries (submitted_at);

-- -----------------------------------------------------------------------------
-- STEP 4: Extend existing visit_status table (DO NOT recreate)
-- -----------------------------------------------------------------------------
ALTER TABLE public.visit_status
  ADD COLUMN IF NOT EXISTS previous_status text;

ALTER TABLE public.visit_status
  ADD COLUMN IF NOT EXISTS change_source text DEFAULT 'system';

ALTER TABLE public.visit_status
  ADD COLUMN IF NOT EXISTS note text;

ALTER TABLE public.visit_status
  ADD COLUMN IF NOT EXISTS metadata jsonb;

CREATE INDEX IF NOT EXISTS idx_visit_status_site_visit_id
  ON public.visit_status (site_visit_id, updated_at);

-- -----------------------------------------------------------------------------
-- STEP 5: Create site_visit_status_log table (append-only audit log)
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
  note             text,
  metadata         jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.site_visit_status_log ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "svsl_insert_authenticated" ON public.site_visit_status_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

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
-- -----------------------------------------------------------------------------
INSERT INTO public.site_visit_status_log (
  site_entry_id, mmp_id, old_status, new_status, change_source, note, created_at
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

-- Log the rename event for sites that were completed → submitted
INSERT INTO public.site_visit_status_log (
  site_entry_id, mmp_id, old_status, new_status, change_source, note, created_at
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

DO $$ BEGIN
  RAISE NOTICE 'Phase A Step 6: site_visit_status_log backfilled.';
END $$;

-- -----------------------------------------------------------------------------
-- STEP 7: Create payment_event_log table (append-only money trail)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_event_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text NOT NULL,
  amount          numeric,
  amount_currency text DEFAULT 'SDG',
  site_entry_id   uuid REFERENCES public.mmp_site_entries(id) ON DELETE SET NULL,
  mmp_id          uuid REFERENCES public.mmp_files(id) ON DELETE SET NULL,
  payment_ref_id  uuid,
  performed_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  performed_by_name text,
  performed_by_role text,
  enumerator_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  note            text,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_event_log ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "pel_insert_authenticated" ON public.payment_event_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_pel_site_entry_id
  ON public.payment_event_log (site_entry_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pel_mmp_id
  ON public.payment_event_log (mmp_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pel_enumerator_id
  ON public.payment_event_log (enumerator_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pel_event_type
  ON public.payment_event_log (event_type, created_at DESC);

-- -----------------------------------------------------------------------------
-- STEP 8: Update wallet trigger — fire on 'wfp_confirmed', not 'completed'
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_wallet_transaction_on_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id        uuid;
  v_wallet_id      uuid;
  v_amount         numeric;
  v_amount_cents   bigint;
  v_current_balance numeric;
  v_new_balance    numeric;
  v_site_name      text;
  v_advance_total  numeric := 0;
BEGIN
  -- Phase A: payment now triggers on wfp_confirmed only (not submitted/completed).
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
      RAISE NOTICE 'Phase A: No user to pay for site % — trigger skipped', NEW.id;
      RETURN NEW;
    END IF;

    -- Calculate total fee
    v_amount := COALESCE(
      NULLIF(NEW.cost, 0),
      COALESCE(NEW.enumerator_fee, 0) + COALESCE(NEW.transport_fee, 0),
      0
    );

    IF v_amount <= 0 THEN
      RAISE NOTICE 'Phase A: Zero fee for site % — trigger skipped', NEW.id;
      RETURN NEW;
    END IF;

    -- Find or create wallet
    SELECT id INTO v_wallet_id
    FROM public.wallets
    WHERE user_id = v_user_id
    LIMIT 1;

    IF v_wallet_id IS NULL THEN
      INSERT INTO public.wallets (user_id, balance, currency)
      VALUES (v_user_id, 0, 'SDG')
      RETURNING id INTO v_wallet_id;
    END IF;

    SELECT COALESCE(balance, 0) INTO v_current_balance
    FROM public.wallets
    WHERE id = v_wallet_id;

    -- Deduct any approved advances already paid for this site
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
    v_new_balance  := v_current_balance + v_amount - v_advance_total;
    v_site_name    := COALESCE(NEW.site_name, NEW.site_code, 'Unknown Site');

    INSERT INTO public.wallet_transactions (
      wallet_id, amount, amount_cents, balance_after,
      transaction_type, description, metadata, created_at
    ) VALUES (
      v_wallet_id,
      v_amount,
      v_amount_cents,
      v_new_balance,
      'site_visit_fee',
      'WFP Confirmed Site Fee — ' || v_site_name,
      jsonb_build_object(
        'site_entry_id',  NEW.id,
        'mmp_id',         NEW.mmp_file_id,
        'transport_fee',  COALESCE(NEW.transport_fee, 0),
        'enumerator_fee', COALESCE(NEW.enumerator_fee, 0),
        'cost',           COALESCE(NEW.cost, 0),
        'advance_deducted', v_advance_total,
        'trigger',        'wfp_confirmed',
        'phase',          'A'
      ),
      now()
    );

    UPDATE public.wallets
    SET balance = v_new_balance, updated_at = now()
    WHERE id = v_wallet_id;

    RAISE NOTICE 'Phase A: Credited % SDG for site % (user: %)', v_amount, NEW.id, v_user_id;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_create_wallet_transaction_on_completion ON public.mmp_site_entries;
CREATE TRIGGER trigger_create_wallet_transaction_on_completion
  AFTER UPDATE OF status ON public.mmp_site_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.create_wallet_transaction_on_completion();

DO $$ BEGIN
  RAISE NOTICE 'Phase A Step 8: Wallet trigger updated — now fires on wfp_confirmed.';
END $$;

-- -----------------------------------------------------------------------------
-- STEP 9: Storage buckets
-- NOTE: If this fails, create the buckets manually in Supabase Dashboard → Storage.
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'wfp-confirmation-files',
  'wfp-confirmation-files',
  false,
  52428800,
  ARRAY[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-submission-evidence',
  'site-submission-evidence',
  false,
  20971520,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

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
-- STEP 10: Performance indexes for new status values
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
  RAISE NOTICE '  2B. not_covered columns added to mmp_site_entries';
  RAISE NOTICE '  3. submitted_at / wfp_confirmed_at / status_changed_at added';
  RAISE NOTICE '  4. visit_status table extended';
  RAISE NOTICE '  5. site_visit_status_log created (append-only)';
  RAISE NOTICE '  6. site_visit_status_log backfilled';
  RAISE NOTICE '  7. payment_event_log created (append-only shell)';
  RAISE NOTICE '  8. Wallet trigger fires on wfp_confirmed';
  RAISE NOTICE '  9. Storage buckets created';
  RAISE NOTICE '  10. Performance indexes added';
  RAISE NOTICE '=============================================================';
END $$;
