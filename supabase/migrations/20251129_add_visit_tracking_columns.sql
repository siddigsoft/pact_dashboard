-- Add visit start/end tracking columns to mmp_site_entries
-- Safe-guarded with IF NOT EXISTS for idempotency

ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS visit_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS visit_started_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS visit_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS visit_completed_by uuid REFERENCES public.profiles(id);

-- Optional: basic indexes to speed up queries by started/completed status
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_visit_started_at ON public.mmp_site_entries(visit_started_at);
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_visit_completed_at ON public.mmp_site_entries(visit_completed_at);
