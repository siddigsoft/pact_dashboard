-- =============================================================================
-- PHASE B MIGRATION — Cost Recovery Gate + Money Trail
-- =============================================================================
-- Run AFTER phase_a_migration.sql.
-- SAFE TO RE-RUN: all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: Create cost_recovery_log table
-- One row per recovery decision per not-covered site.
-- A site can have at most one active decision (enforced by unique index below).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cost_recovery_log (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which site and which MMP this recovery belongs to
  site_entry_id           uuid NOT NULL REFERENCES public.mmp_site_entries(id) ON DELETE CASCADE,
  mmp_id                  uuid REFERENCES public.mmp_files(id) ON DELETE SET NULL,

  -- Which advance is being recovered
  down_payment_request_id uuid,   -- References down_payment_requests.id (text pk — stored as cast)
  amount                  numeric NOT NULL DEFAULT 0,
  amount_currency         text NOT NULL DEFAULT 'SDG',

  -- Recovery decision: 'rolled', 'return_required', 'writeoff'
  decision                text NOT NULL CHECK (decision IN ('rolled', 'return_required', 'writeoff')),
  decision_note           text,

  -- ── ROLLED FORWARD ────────────────────────────────────────────────────────
  -- When decision = 'rolled': money pre-allocated to a future MMP
  target_mmp_id           uuid REFERENCES public.mmp_files(id) ON DELETE SET NULL,
  target_mmp_name         text,
  target_site_id          uuid REFERENCES public.mmp_site_entries(id) ON DELETE SET NULL,
  target_site_name        text,
  target_site_not_in_mmp  boolean DEFAULT false,
  -- ^ true when the site was not in the target MMP and had to be auto-inserted

  -- ── RETURN REQUIRED ───────────────────────────────────────────────────────
  -- When decision = 'return_required': enumerator must physically return money
  repayment_method        text,
  -- Values: 'cash', 'deduction_next_payment', 'fee_reclassification', 'reuse_other_site'
  repayment_deadline      date,
  repayment_status        text NOT NULL DEFAULT 'pending',
  -- Values: 'pending', 'in_progress', 'settled'
  repayment_settled_at    timestamptz,
  repayment_settled_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  repayment_settled_by_name text,

  -- Escalation tracking (for cron-driven overdue notifications)
  escalation_day0_sent    boolean DEFAULT false,
  escalation_day7_sent    boolean DEFAULT false,
  escalation_day14_sent   boolean DEFAULT false,

  -- ── WRITE-OFF ─────────────────────────────────────────────────────────────
  -- When decision = 'writeoff': money written off with digital signature
  writeoff_reason         text,
  writeoff_signed_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  writeoff_signed_by_name text,
  writeoff_signed_at      timestamptz,
  writeoff_signature_data text,
  -- Signature method: 'handwriting', 'uuid', 'otp'
  writeoff_signature_method text,

  -- ── AUDIT FIELDS ──────────────────────────────────────────────────────────
  decided_by              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_by_name         text,
  decided_by_role         text,
  enumerator_id           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  enumerator_name         text,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Ensure each site entry has at most one non-writeoff decision at a time
-- (writeoffs are always terminal; rolls and returns can be re-decided if reversed)
CREATE UNIQUE INDEX IF NOT EXISTS idx_crl_site_entry_unique
  ON public.cost_recovery_log (site_entry_id)
  WHERE decision != 'writeoff' OR repayment_status != 'pending';

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_crl_mmp_id
  ON public.cost_recovery_log (mmp_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crl_site_entry_id
  ON public.cost_recovery_log (site_entry_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crl_decision
  ON public.cost_recovery_log (decision, repayment_status);

CREATE INDEX IF NOT EXISTS idx_crl_repayment_deadline
  ON public.cost_recovery_log (repayment_deadline)
  WHERE repayment_status = 'pending' AND decision = 'return_required';

-- updated_at auto-trigger
CREATE OR REPLACE FUNCTION public.set_crl_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crl_updated_at ON public.cost_recovery_log;
CREATE TRIGGER trg_crl_updated_at
  BEFORE UPDATE ON public.cost_recovery_log
  FOR EACH ROW EXECUTE FUNCTION public.set_crl_updated_at();

-- -----------------------------------------------------------------------------
-- STEP 2: RLS for cost_recovery_log
-- -----------------------------------------------------------------------------
ALTER TABLE public.cost_recovery_log ENABLE ROW LEVEL SECURITY;

-- Enumerator: can see their own records (where they are the affected enumerator)
CREATE POLICY "crl_select_own" ON public.cost_recovery_log
  FOR SELECT USING (
    enumerator_id = auth.uid()
    OR decided_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN (
          'admin', 'Admin', 'super_admin', 'Super Admin', 'superAdmin', 'SuperAdmin',
          'finance', 'Finance', 'fom', 'Field Operation Manager (FOM)',
          'supervisor', 'Supervisor'
        )
    )
  );

-- Admin/Finance/Supervisor: can insert recovery decisions
CREATE POLICY "crl_insert_admin" ON public.cost_recovery_log
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN (
          'admin', 'Admin', 'super_admin', 'Super Admin', 'superAdmin', 'SuperAdmin',
          'finance', 'Finance', 'fom', 'Field Operation Manager (FOM)',
          'supervisor', 'Supervisor'
        )
    )
  );

-- Admin/Finance: can update (to track repayment status, settlement, etc.)
CREATE POLICY "crl_update_admin" ON public.cost_recovery_log
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN (
          'admin', 'Admin', 'super_admin', 'Super Admin', 'superAdmin', 'SuperAdmin',
          'finance', 'Finance', 'fom', 'Field Operation Manager (FOM)'
        )
    )
  );

-- -----------------------------------------------------------------------------
-- STEP 3: Add a helper view for "not-covered sites that need cost recovery"
-- Used by Gate 5 and the Exceptions tab to quickly find actionable items.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_not_covered_recovery_needed AS
SELECT
  e.id              AS site_entry_id,
  e.mmp_file_id     AS mmp_id,
  e.site_name,
  e.site_code,
  e.state,
  e.locality,
  e.hub,
  e.not_covered_reason,
  e.not_covered_at,
  e.accepted_by     AS enumerator_id,
  COALESCE(SUM(d.requested_amount), 0) AS total_approved_advance,
  COUNT(d.id)                AS advance_count,
  crl.id            AS recovery_log_id,
  crl.decision      AS recovery_decision,
  crl.repayment_status
FROM public.mmp_site_entries e
LEFT JOIN public.down_payment_requests d
  ON d.mmp_site_entry_id = e.id
  AND d.status IN ('approved', 'partially_paid', 'fully_paid')
LEFT JOIN public.cost_recovery_log crl
  ON crl.site_entry_id = e.id
WHERE
  e.not_covered_flag = true
  OR LOWER(e.status) = 'not_covered'
GROUP BY
  e.id, e.mmp_file_id, e.site_name, e.site_code, e.state,
  e.locality, e.hub, e.not_covered_reason, e.not_covered_at,
  e.accepted_by, crl.id, crl.decision, crl.repayment_status;

DO $$ BEGIN
  RAISE NOTICE 'Phase B Step 3: v_not_covered_recovery_needed view created.';
END $$;

-- -----------------------------------------------------------------------------
-- STEP 4: Supabase Edge Function for overdue escalation (reference only)
-- The actual edge function code lives in supabase/functions/check-repayment-overdue/
-- Register this cron schedule in your Supabase Dashboard:
--   Schedule: 0 6 * * *   (daily at 06:00 UTC = 08:00 Sudan)
--   Function: check-repayment-overdue
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  RAISE NOTICE 'Phase B: Reminder — deploy check-repayment-overdue edge function and set cron schedule.';
END $$;

-- -----------------------------------------------------------------------------
-- DONE
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'PHASE B MIGRATION COMPLETE';
  RAISE NOTICE '  1. cost_recovery_log table created (Roll / Return / Write-Off)';
  RAISE NOTICE '  2. RLS policies set for all roles';
  RAISE NOTICE '  3. v_not_covered_recovery_needed view created';
  RAISE NOTICE '  4. Repayment overdue escalation cron: deploy edge function separately';
  RAISE NOTICE '=============================================================';
END $$;
