-- Migration: Global Recycle Bin
-- Purpose: Soft-delete safety net — every hard delete saves a JSON snapshot here
--          for 28 days before permanent purge.  Super Admin can restore any record.
--
-- Usage from application code:
--   1. Before deleting, INSERT the full row into recycle_bin as record_data JSONB
--   2. Proceed with the normal hard delete
--   3. To restore: re-INSERT record_data into the original table and mark restored_at

CREATE TABLE IF NOT EXISTS public.recycle_bin (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name    TEXT         NOT NULL,
  record_id     TEXT         NOT NULL,
  record_data   JSONB        NOT NULL,
  deleted_by    UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_by_name TEXT,
  deleted_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  purge_after   TIMESTAMPTZ  NOT NULL DEFAULT NOW() + INTERVAL '28 days',
  restored_at   TIMESTAMPTZ,
  restored_by   UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  restored_by_name TEXT,
  notes         TEXT,
  context       JSONB        DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_recycle_bin_table     ON public.recycle_bin(table_name);
CREATE INDEX IF NOT EXISTS idx_recycle_bin_deleted_at ON public.recycle_bin(deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_recycle_bin_purge_after ON public.recycle_bin(purge_after) WHERE restored_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_recycle_bin_record_id  ON public.recycle_bin(record_id);

COMMENT ON TABLE public.recycle_bin IS
  'Global soft-delete recycle bin. Records stay 28 days then are eligible for purge. Super Admin can restore at any time.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.recycle_bin ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super Admin full access to recycle bin" ON public.recycle_bin;
CREATE POLICY "Super Admin full access to recycle bin"
  ON public.recycle_bin
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('Super Admin', 'super_admin', 'ICT', 'ict')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('Super Admin', 'super_admin', 'ICT', 'ict')
    )
  );

-- ── Auto-purge (requires pg_cron extension — enable in Supabase Dashboard) ───
-- Uncomment after enabling pg_cron under Database → Extensions:
--
-- SELECT cron.schedule(
--   'purge-recycle-bin-28d',
--   '0 3 * * *',   -- 3 AM daily
--   $$
--     DELETE FROM public.recycle_bin
--     WHERE purge_after < NOW()
--       AND restored_at IS NULL;
--   $$
-- );
