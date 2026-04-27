-- =============================================================================
-- PHASE D MIGRATION — Roll-to-Next-MMP Pre-Allocation Tracking
-- Apply AFTER phase_b_migration.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: rolled_advance_allocations — tracks money rolled from source → target MMP
-- One row per roll decision (1:1 with cost_recovery_log where decision = 'rolled').
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rolled_advance_allocations (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source (where the original advance and not-covered decision were)
  source_cost_recovery_id   UUID REFERENCES public.cost_recovery_log(id) ON DELETE SET NULL,
  source_mmp_id             TEXT NOT NULL,
  source_mmp_name           TEXT,
  source_site_entry_id      UUID REFERENCES public.mmp_site_entries(id) ON DELETE SET NULL,
  source_site_name          TEXT,
  source_site_code          TEXT,

  -- Target (where the money is pre-allocated)
  target_mmp_id             TEXT NOT NULL,
  target_mmp_name           TEXT,
  target_site_entry_id      UUID REFERENCES public.mmp_site_entries(id) ON DELETE SET NULL,
  target_site_name          TEXT,
  -- NULL means site was not found in target MMP (auto-inserted or not matched)
  target_site_auto_inserted BOOLEAN DEFAULT FALSE,

  -- Money
  amount                    NUMERIC(12,2) NOT NULL,
  amount_currency           TEXT NOT NULL DEFAULT 'SDG',

  -- Who / when
  enumerator_id             UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  enumerator_name           TEXT,
  allocated_by              UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  allocated_by_name         TEXT,
  allocated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Status lifecycle: pending → fulfilled (once WFP-confirmed in target MMP) | cancelled
  status                    TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'fulfilled', 'cancelled')),
  fulfilled_at              TIMESTAMPTZ,
  cancelled_at              TIMESTAMPTZ,
  cancel_reason             TEXT,

  note                      TEXT,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raa_source_mmp      ON public.rolled_advance_allocations(source_mmp_id);
CREATE INDEX IF NOT EXISTS idx_raa_target_mmp      ON public.rolled_advance_allocations(target_mmp_id);
CREATE INDEX IF NOT EXISTS idx_raa_enumerator      ON public.rolled_advance_allocations(enumerator_id);
CREATE INDEX IF NOT EXISTS idx_raa_source_site     ON public.rolled_advance_allocations(source_site_entry_id);
CREATE INDEX IF NOT EXISTS idx_raa_target_site     ON public.rolled_advance_allocations(target_site_entry_id);
CREATE INDEX IF NOT EXISTS idx_raa_status          ON public.rolled_advance_allocations(status);

CREATE OR REPLACE FUNCTION public.set_raa_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_raa_updated_at ON public.rolled_advance_allocations;
CREATE TRIGGER trg_raa_updated_at
  BEFORE UPDATE ON public.rolled_advance_allocations
  FOR EACH ROW EXECUTE FUNCTION public.set_raa_updated_at();

-- RLS
ALTER TABLE public.rolled_advance_allocations ENABLE ROW LEVEL SECURITY;

-- Enumerator: see own allocations (source or target)
CREATE POLICY "raa_select_own" ON public.rolled_advance_allocations
  FOR SELECT USING (
    enumerator_id = auth.uid()
  );

-- Admin / Finance / Supervisor / FOM: see all
CREATE POLICY "raa_select_admin" ON public.rolled_advance_allocations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN (
          'admin','Admin','super_admin','Super Admin','superAdmin','SuperAdmin',
          'supervisor','Supervisor','finance','Finance','fom',
          'Field Operation Manager (FOM)'
        )
    )
  );

-- Admin / FOM: insert
CREATE POLICY "raa_insert" ON public.rolled_advance_allocations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN (
          'admin','Admin','super_admin','Super Admin','superAdmin','SuperAdmin',
          'fom','Field Operation Manager (FOM)'
        )
    )
  );

-- Admin / Finance: update (for status changes: fulfilled / cancelled)
CREATE POLICY "raa_update" ON public.rolled_advance_allocations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN (
          'admin','Admin','super_admin','Super Admin','superAdmin','SuperAdmin',
          'finance','Finance','fom','Field Operation Manager (FOM)'
        )
    )
  );

-- -----------------------------------------------------------------------------
-- STEP 2: Helper view — pre-allocations visible per target MMP
-- Used by the RolledAllocationsPanel on the down-payment / MMP view.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_target_mmp_pre_allocations AS
SELECT
  raa.id,
  raa.target_mmp_id,
  raa.target_mmp_name,
  raa.target_site_entry_id,
  raa.target_site_name,
  raa.target_site_auto_inserted,
  raa.source_mmp_id,
  raa.source_mmp_name,
  raa.source_site_name,
  raa.source_site_code,
  raa.amount,
  raa.amount_currency,
  raa.enumerator_id,
  raa.enumerator_name,
  raa.allocated_by_name,
  raa.allocated_at,
  raa.status,
  raa.note
FROM public.rolled_advance_allocations raa
WHERE raa.status = 'pending';

DO $$ BEGIN
  RAISE NOTICE 'Phase D migration complete: rolled_advance_allocations + v_target_mmp_pre_allocations created.';
END $$;
