-- Add not-covered tracking columns to mmp_site_entries.
-- These columns are referenced by cycle-close RPCs and the frontend
-- but were never added via a migration, causing "Failed to load
-- uncovered sites" runtime errors.
--
-- Safe to re-run: all ADD COLUMN statements use IF NOT EXISTS.
-- Apply in Supabase Dashboard → SQL Editor → New Query → Run.

ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS not_covered_flag        boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS not_covered_reason       text        DEFAULT NULL
    CHECK (not_covered_reason IS NULL OR not_covered_reason IN (
      'not_distributed', 'cp_not_confirmed', 'security_concerns',
      'access_denied', 'staff_unavailable', 'weather_disaster',
      'budget_constraints', 'time_constraints', 'duplicate_site', 'other'
    )),
  ADD COLUMN IF NOT EXISTS not_covered_reason_other text        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS not_covered_at           timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS not_covered_by           uuid        REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Index for fast "show me all not-covered entries for this MMP" queries.
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_not_covered
  ON public.mmp_site_entries (mmp_file_id)
  WHERE not_covered_flag = true;
