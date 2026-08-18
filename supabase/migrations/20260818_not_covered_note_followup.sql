-- Columns referenced by set_not_covered_reason and Step 4 UI.
-- Production already had not_covered_reason_other / not_covered_flag; the RPC writes these names.

ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS not_covered_note text,
  ADD COLUMN IF NOT EXISTS needs_followup boolean DEFAULT false;

UPDATE public.mmp_site_entries
SET not_covered_note = not_covered_reason_other
WHERE not_covered_note IS NULL
  AND not_covered_reason_other IS NOT NULL
  AND btrim(not_covered_reason_other) <> '';

UPDATE public.mmp_site_entries
SET needs_followup = COALESCE(not_covered_flag, false)
WHERE needs_followup IS NULL OR needs_followup = false;
