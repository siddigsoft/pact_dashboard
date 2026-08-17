-- ============================================================
-- mmp_payment_records
-- Tracks payment/recovery/writeoff actions generated during
-- the Cycle Close Wizard Step 6 (Financial Reconciliation).
-- One row per enumerator action per cycle close.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.mmp_payment_records (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  mmp_file_id           uuid          NOT NULL REFERENCES public.mmp_files(id) ON DELETE CASCADE,
  enumerator_id         uuid          NOT NULL REFERENCES public.profiles(id),

  -- Amounts (nullable for writeoff rows)
  transport_amount      numeric(12,2),
  fee_amount            numeric(12,2),
  net_amount            numeric(12,2),

  -- Type: 'balance' | 'full' | 'recovery' | 'writeoff'
  payment_type          text          NOT NULL
    CHECK (payment_type IN ('balance', 'full', 'recovery', 'writeoff')),

  -- Status
  status                text          NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'pending_recovery', 'written_off', 'paid', 'recovered')),

  -- Write-off fields
  writeoff_justification text,
  writeoff_by           uuid          REFERENCES public.profiles(id),

  -- Audit
  created_by            uuid          REFERENCES public.profiles(id),
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mmp_payment_records_mmp_file
  ON public.mmp_payment_records (mmp_file_id);

CREATE INDEX IF NOT EXISTS idx_mmp_payment_records_enumerator
  ON public.mmp_payment_records (enumerator_id);

-- RLS
ALTER TABLE public.mmp_payment_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mmp_payment_records_select"
  ON public.mmp_payment_records FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "mmp_payment_records_insert"
  ON public.mmp_payment_records FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "mmp_payment_records_update"
  ON public.mmp_payment_records FOR UPDATE
  TO authenticated USING (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_mmp_payment_records_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_mmp_payment_records_updated_at ON public.mmp_payment_records;
CREATE TRIGGER trg_mmp_payment_records_updated_at
  BEFORE UPDATE ON public.mmp_payment_records
  FOR EACH ROW EXECUTE FUNCTION public.set_mmp_payment_records_updated_at();
