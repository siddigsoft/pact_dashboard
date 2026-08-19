-- =============================================================================
-- Cycle Close Redirect: Fee-payment traceability
-- A Redirect reclassifies an already-disbursed transport advance; it is not a
-- second cash payment. Label the resulting fee settlement accordingly so the
-- Field Payments Centre preserves its source record and audit trail.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.record_cycle_redirect_fee_payment_trace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.decision = 'redirect'
     AND NEW.executed = true
     AND (TG_OP = 'INSERT' OR OLD.executed IS DISTINCT FROM true) THEN
    UPDATE public.mmp_site_entries
    SET
      fee_payment_method = 'advance_offset',
      fee_payment_notes = concat(
        'Settled by Cycle Close Redirect from transport advance ',
        NEW.advance_id::text,
        '; exception action ',
        NEW.id::text,
        COALESCE('; GL journal ' || NEW.gl_journal_entry_id::text, '')
      )
    WHERE id = NEW.mmp_site_entry_id
      AND fee_paid_status = 'paid';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cycle_redirect_fee_payment_trace
  ON public.cycle_exception_actions;

CREATE TRIGGER trg_cycle_redirect_fee_payment_trace
AFTER INSERT OR UPDATE OF executed ON public.cycle_exception_actions
FOR EACH ROW
EXECUTE FUNCTION public.record_cycle_redirect_fee_payment_trace();

-- Existing Redirect actions were correctly posted but lacked an explicit
-- fee-payment method. Backfill only blank methods; never overwrite a manual
-- fee-payment audit entry.
UPDATE public.mmp_site_entries AS site
SET
  fee_payment_method = 'advance_offset',
  fee_payment_notes = concat(
    'Settled by Cycle Close Redirect from transport advance ',
    action.advance_id::text,
    '; exception action ',
    action.id::text,
    COALESCE('; GL journal ' || action.gl_journal_entry_id::text, '')
  )
FROM public.cycle_exception_actions AS action
WHERE action.mmp_site_entry_id = site.id
  AND action.decision = 'redirect'
  AND action.executed = true
  AND site.fee_paid_status = 'paid'
  AND NULLIF(trim(COALESCE(site.fee_payment_method, '')), '') IS NULL;

COMMIT;