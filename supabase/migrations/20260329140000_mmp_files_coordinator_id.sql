-- mmp_files.coordinator_id: supports nav badge counts and digest queries.
-- Backfill from site entries (accepted_by) for forwarded / pending_acceptance MMPs.

ALTER TABLE public.mmp_files
  ADD COLUMN IF NOT EXISTS coordinator_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mmp_files_coordinator_status
  ON public.mmp_files (coordinator_id, status)
  WHERE coordinator_id IS NOT NULL;

UPDATE public.mmp_files mf
SET coordinator_id = sub.cid::uuid
FROM (
  SELECT DISTINCT ON (mse.mmp_file_id)
    mse.mmp_file_id AS mmp_id,
    mse.accepted_by AS cid
  FROM public.mmp_site_entries mse
  WHERE mse.accepted_by IS NOT NULL
    AND mse.mmp_file_id IS NOT NULL
  ORDER BY mse.mmp_file_id, mse.updated_at DESC NULLS LAST
) sub
WHERE mf.id = sub.mmp_id
  AND mf.coordinator_id IS NULL
  AND mf.status IN ('forwarded_to_coordinator', 'pending_acceptance')
  AND sub.cid ~* '^[0-9a-f-]{36}$';
