-- Keep the cycle-close selector fast as historical MMP files grow.
-- The partial index matches the selector's open/non-rejected predicate and
-- supports its newest-first ordering without scanning the full archive.
CREATE INDEX IF NOT EXISTS idx_mmp_files_cycle_close_selector
  ON public.mmp_files (created_at DESC)
  INCLUDE (id, name, status, hub, month, cycle_status)
  WHERE status IS DISTINCT FROM 'rejected'
    AND cycle_status IS DISTINCT FROM 'closed';