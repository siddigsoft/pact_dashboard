-- =============================================================================
-- GL Bridge Log extras — run ONCE after Phase 2 migration
-- Adds je_reference and je_description columns referenced by AccountingGLAudit
-- and creates helper RPC + compatibility view used by the frontend
-- =============================================================================

-- 1. Add optional enrichment columns to the bridge log table
--    These are NULL by default; Phase 5 triggers can populate them.
ALTER TABLE public.acct_gl_bridge_log
  ADD COLUMN IF NOT EXISTS je_reference  text,
  ADD COLUMN IF NOT EXISTS je_description text;

COMMENT ON COLUMN public.acct_gl_bridge_log.je_reference  IS
  'Journal entry reference number populated when bridge posts successfully.';
COMMENT ON COLUMN public.acct_gl_bridge_log.je_description IS
  'Short description of the posted journal entry.';

-- 2. Backfill je_reference from acct_journal_entries where linkable
UPDATE public.acct_gl_bridge_log bl
SET    je_reference  = je.reference,
       je_description = left(je.description_en, 200)
FROM   public.acct_journal_entries je
WHERE  bl.journal_entry_id = je.id
  AND  bl.je_reference IS NULL;

-- 3. Trigger to auto-populate je_reference / je_description on future inserts
CREATE OR REPLACE FUNCTION public.acct_bridge_log_enrich()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.journal_entry_id IS NOT NULL AND NEW.je_reference IS NULL THEN
    SELECT reference, left(description_en, 200)
      INTO NEW.je_reference, NEW.je_description
      FROM public.acct_journal_entries
     WHERE id = NEW.journal_entry_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bridge_log_enrich ON public.acct_gl_bridge_log;
CREATE TRIGGER trg_bridge_log_enrich
  BEFORE INSERT ON public.acct_gl_bridge_log
  FOR EACH ROW EXECUTE FUNCTION public.acct_bridge_log_enrich();

-- 4. Filtered RPC used by GL Audit log tab (falls back gracefully if RPC missing)
CREATE OR REPLACE FUNCTION public.get_gl_bridge_log(
  p_source_table text  DEFAULT NULL,
  p_status       text  DEFAULT NULL,
  p_date_from    date  DEFAULT NULL,
  p_date_to      date  DEFAULT NULL,
  p_limit        int   DEFAULT 500
)
RETURNS TABLE (
  id               uuid,
  source_table     text,
  source_id        uuid,
  event_type       text,
  status           text,
  journal_entry_id uuid,
  je_reference     text,
  je_description   text,
  error_message    text,
  created_at       timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    bl.id, bl.source_table, bl.source_id, bl.event_type,
    bl.status, bl.journal_entry_id,
    bl.je_reference, bl.je_description,
    bl.error_message, bl.created_at
  FROM public.acct_gl_bridge_log bl
  WHERE (p_source_table IS NULL OR bl.source_table = p_source_table)
    AND (p_status       IS NULL OR bl.status       = p_status)
    AND (p_date_from    IS NULL OR bl.created_at::date >= p_date_from)
    AND (p_date_to      IS NULL OR bl.created_at::date <= p_date_to)
  ORDER BY bl.created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_gl_bridge_log(text, text, date, date, int) TO authenticated;

-- 5. Smoke-test
-- SELECT * FROM public.acct_gl_bridge_log LIMIT 1;
-- SELECT * FROM public.get_gl_bridge_log(NULL, NULL, NULL, NULL, 5);
-- SELECT * FROM public.v_acct_gl_bridge_summary LIMIT 5;
