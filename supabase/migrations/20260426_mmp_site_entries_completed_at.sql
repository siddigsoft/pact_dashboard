-- Track when MMP site entries are actually completed (not just last-updated).
--
-- The landing-page "Tasks Completed" trend, and several MMP analytics queries,
-- previously used `mmp_site_entries.updated_at` as a proxy for completion time
-- because the table had no `completed_at` column. Any later edit to a completed
-- site (notes, fee adjustments, audit triggers, etc.) re-stamped `updated_at`
-- and pushed the row into the wrong 30-day bucket, skewing the trend.
--
-- This migration:
--   1. Adds `completed_at timestamptz` to `mmp_site_entries`.
--   2. Backfills existing completed rows from the most accurate signal
--      available (verified_at → visit_completed_at → audit_logs status change
--      → updated_at).
--   3. Installs a trigger that stamps `completed_at` whenever the status
--      transitions into a completed/verified/closed state, and clears it if
--      the status moves back out of the terminal set (so re-opens are honest).
--   4. Indexes the new column for the trend queries.

-- =========================================================================
-- 1. Column
-- =========================================================================

ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

COMMENT ON COLUMN public.mmp_site_entries.completed_at IS
  'Timestamp the site entry first transitioned into a terminal "done" state '
  '(Completed / Verified / Closed / CP Verified). Set by trigger; preserved '
  'across later edits so analytics windows remain accurate.';

CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_completed_at
  ON public.mmp_site_entries(completed_at);

-- =========================================================================
-- 2. Backfill
-- =========================================================================
--
-- "Done" matches the same set used by the landing-page KPI strip
-- (src/pages/Index.tsx): completed, verified, closed, cp verified — case
-- and whitespace insensitive.

WITH done_entries AS (
  SELECT s.id,
         s.status,
         s.verified_at,
         s.visit_completed_at,
         s.updated_at,
         s.additional_data
    FROM public.mmp_site_entries s
   WHERE LOWER(REGEXP_REPLACE(COALESCE(s.status, ''), '[\s_-]+', '', 'g'))
         IN ('completed', 'verified', 'closed', 'cpverified')
),
audit_done AS (
  SELECT DISTINCT ON (a.entity_id)
         a.entity_id,
         a.timestamp AS done_at
    FROM public.audit_logs a
   WHERE a.entity_type = 'mmp_site_entry'
     AND a.changes ? 'status'
     AND LOWER(REGEXP_REPLACE(COALESCE(a.changes->'status'->>'to', ''), '[\s_-]+', '', 'g'))
         IN ('completed', 'verified', 'closed', 'cpverified')
   ORDER BY a.entity_id, a.timestamp ASC
)
UPDATE public.mmp_site_entries s
   SET completed_at = COALESCE(
         -- 1. verified_at is the strongest signal if present
         s.verified_at,
         -- 2. visit_completed_at is the next-best (visit submission moment)
         s.visit_completed_at,
         -- 3. additional_data may carry a stringified verified_at on older rows
         CASE
           WHEN s.additional_data IS NOT NULL
            AND jsonb_typeof(s.additional_data::jsonb) = 'object'
            AND (s.additional_data::jsonb)->>'verified_at' IS NOT NULL
           THEN ((s.additional_data::jsonb)->>'verified_at')::timestamptz
         END,
         -- 4. earliest audit_log row that recorded a transition into a done state
         ad.done_at,
         -- 5. last-resort: updated_at (matches the previous proxy)
         s.updated_at
       )
  FROM done_entries d
  LEFT JOIN audit_done ad ON ad.entity_id = d.id::text
 WHERE s.id = d.id
   AND s.completed_at IS NULL;

-- =========================================================================
-- 3. Trigger
-- =========================================================================

CREATE OR REPLACE FUNCTION public.set_mmp_site_entry_completed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_status text := COALESCE(NEW.status, '');
  v_old_status text := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.status, '') ELSE '' END;
  v_new_norm   text := LOWER(REGEXP_REPLACE(v_new_status, '[\s_-]+', '', 'g'));
  v_old_norm   text := LOWER(REGEXP_REPLACE(v_old_status, '[\s_-]+', '', 'g'));
  v_done       boolean := v_new_norm IN ('completed', 'verified', 'closed', 'cpverified');
  v_was_done   boolean := v_old_norm IN ('completed', 'verified', 'closed', 'cpverified');
BEGIN
  -- Only act when status actually changed (or on INSERT). This keeps the
  -- many other UPDATE paths (notes, fee adjustments, audit-trigger writes)
  -- from re-stamping the column.
  IF TG_OP = 'UPDATE' AND v_new_norm = v_old_norm THEN
    RETURN NEW;
  END IF;

  -- Status moved INTO a done state (and wasn't already there): stamp it once.
  IF v_done AND NOT v_was_done AND NEW.completed_at IS NULL THEN
    NEW.completed_at := COALESCE(NEW.verified_at, NEW.visit_completed_at, NOW());
  END IF;

  -- Status moved OUT of the done set (reopen): clear so the row stops counting
  -- as completed. If it later re-enters, we'll restamp with the new timestamp.
  IF v_was_done AND NOT v_done THEN
    NEW.completed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mmp_site_entry_completed_at_trigger ON public.mmp_site_entries;

-- The OF column-list clause is only valid for UPDATE, so we register two
-- triggers sharing the same function rather than `BEFORE INSERT OR UPDATE OF status`.
CREATE TRIGGER mmp_site_entry_completed_at_insert_trigger
  BEFORE INSERT ON public.mmp_site_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_mmp_site_entry_completed_at();

CREATE TRIGGER mmp_site_entry_completed_at_update_trigger
  BEFORE UPDATE OF status ON public.mmp_site_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_mmp_site_entry_completed_at();
