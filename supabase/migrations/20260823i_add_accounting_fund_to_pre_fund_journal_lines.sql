-- Pre-Fund payment ledger events use the active Accounting Fund Registry entry
-- for their debit and credit journal-line dimensions. This is distinct from
-- the operational pre_fund_requests identifier.

CREATE OR REPLACE FUNCTION public.assign_pre_fund_journal_line_fund()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_type TEXT;
  v_active_fund_count INTEGER;
BEGIN
  IF NEW.fund_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT source_type
  INTO v_source_type
  FROM public.acct_journal_entries
  WHERE id = NEW.entry_id;

  IF v_source_type = 'pre_fund_transactions' THEN
    SELECT count(*)
    INTO v_active_fund_count
    FROM public.acct_funds
    WHERE is_active = true;

    IF v_active_fund_count <> 1 THEN
      RAISE EXCEPTION 'Exactly one active Accounting Fund must be configured for Pre-Fund payment posting (found %).',
        v_active_fund_count;
    END IF;

    SELECT id
    INTO NEW.fund_id
    FROM public.acct_funds
    WHERE is_active = true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_pre_fund_journal_line_fund ON public.acct_journal_lines;

CREATE TRIGGER trg_assign_pre_fund_journal_line_fund
BEFORE INSERT ON public.acct_journal_lines
FOR EACH ROW
EXECUTE FUNCTION public.assign_pre_fund_journal_line_fund();