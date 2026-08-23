-- Production requires a fiscal period on every journal entry. Pre-Fund
-- payment postings originate in a shared ledger RPC, so assign the matching
-- period at the journal boundary without changing the payment transaction.

CREATE OR REPLACE FUNCTION public.assign_pre_fund_journal_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.source_type = 'pre_fund_transactions' AND NEW.period_id IS NULL THEN
    SELECT id
    INTO NEW.period_id
    FROM public.acct_fiscal_periods
    WHERE status IN ('open', 'soft_closed')
      AND start_date <= NEW.posting_date
      AND end_date >= NEW.posting_date
    ORDER BY start_date DESC
    LIMIT 1;

    IF NEW.period_id IS NULL THEN
      RAISE EXCEPTION 'No open fiscal period covers Pre-Fund payment date %.', NEW.posting_date;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_pre_fund_journal_period ON public.acct_journal_entries;

CREATE TRIGGER trg_assign_pre_fund_journal_period
BEFORE INSERT ON public.acct_journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.assign_pre_fund_journal_period();