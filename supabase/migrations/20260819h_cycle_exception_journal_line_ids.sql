-- =============================================================================
-- Cycle Close — include the final journal UUID in GL line descriptions
-- =============================================================================
-- A journal UUID only exists after its draft header has been inserted.  Cycle
-- Close posting functions construct their line text before that point, so they
-- cannot safely embed the UUID themselves.  This BEFORE INSERT trigger runs
-- after the header exists but before immutable journal lines are persisted.
--
-- Scope is deliberately limited to cycle_exception_actions.  Historical posted
-- lines remain immutable and are not rewritten; all new Cycle Close GL lines
-- (Return, Write-Off, Redirect, including multi-site Redirect) receive the
-- final parent journal UUID exactly once.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.acct_append_cycle_exception_journal_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_type text;
  v_marker text;
BEGIN
  v_marker := 'GL journal ID ' || NEW.entry_id::text;

  SELECT source_type
  INTO v_source_type
  FROM public.acct_journal_entries
  WHERE id = NEW.entry_id;

  IF v_source_type = 'cycle_exception_actions'
     AND position(v_marker IN coalesce(NEW.description, '')) = 0 THEN
    NEW.description := concat_ws(
      '; ',
      nullif(btrim(coalesce(NEW.description, '')), ''),
      v_marker
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Do not DROP/CREATE this trigger on every rerun.  DROP TRIGGER takes an
-- AccessExclusiveLock and can deadlock with a long-running accounting read or
-- another migration.  The trigger definition is stable; CREATE it only when
-- the first application does not already have it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_acct_cycle_exception_journal_id'
      AND tgrelid = 'public.acct_journal_lines'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_acct_cycle_exception_journal_id
      BEFORE INSERT ON public.acct_journal_lines
      FOR EACH ROW
      EXECUTE FUNCTION public.acct_append_cycle_exception_journal_id();
  END IF;
END;
$$;

COMMENT ON FUNCTION public.acct_append_cycle_exception_journal_id() IS
  'Adds the immutable parent journal UUID to every new Cycle Close GL line after its draft header exists.';

COMMIT;