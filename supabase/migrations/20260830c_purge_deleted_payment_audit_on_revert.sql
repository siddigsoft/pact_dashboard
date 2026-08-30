-- Permanently remove deleted-payment snapshots when a paid Down Payment is
-- deliberately reverted through the controlled financial workflow.
--
-- The normal audit table remains immutable. Only the existing
-- reopen_down_payment_after_reversal_rpc marker may authorize this cleanup;
-- direct/browser deletes remain blocked.

CREATE OR REPLACE FUNCTION public.guard_payment_delete_audit_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('app.payment_delete_audit_cleanup', true) = 'on'
     AND current_user NOT IN ('authenticated', 'anon') THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Payment deletion audit records are immutable.';
END;
$$;

-- Cleanup is attached to the controlled reopen marker already set by
-- reopen_down_payment_after_reversal_rpc. This keeps reversal, source reset,
-- and audit cleanup in the same transaction without exposing a new client RPC.
CREATE OR REPLACE FUNCTION public.purge_deleted_payment_audit_after_reopen()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.down_payment_paid_reopen_rpc', true) = 'on'
     AND OLD.status IN ('partially_paid', 'fully_paid', 'paid', 'reconciled')
     AND NEW.status IN ('pending_supervisor', 'pending_admin', 'approved')
     AND NEW.status IS DISTINCT FROM OLD.status
  THEN
    PERFORM set_config('app.payment_delete_audit_cleanup', 'on', true);

    DELETE FROM public.payment_event_delete_audit
    WHERE source_table = 'down_payment_requests'
      AND source_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purge_deleted_payment_audit_after_reopen
  ON public.down_payment_requests;

CREATE TRIGGER trg_purge_deleted_payment_audit_after_reopen
  AFTER UPDATE OF status ON public.down_payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.purge_deleted_payment_audit_after_reopen();

REVOKE ALL ON FUNCTION public.purge_deleted_payment_audit_after_reopen() FROM PUBLIC;