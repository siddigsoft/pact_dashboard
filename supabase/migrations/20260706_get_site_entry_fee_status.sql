-- SECURITY DEFINER function: exposes the Enumerator Fees ledger (fee_paid_status /
-- fee_paid_amount / enumerator_fee / transport_fee) for a batch of mmp_site_entries
-- IDs, bypassing RLS the same way get_entry_enrichment / get_dp_requests_for_user do.
--
-- Why: the Down Payment / Transport Advance page needs to know, per site, whether
-- the enumerator fee + transport fee have already been paid outside the app
-- (tracked via the Enumerator Fees Report), so it can highlight "already paid"
-- vs "still owed" without every supervisor/admin needing direct RLS access to
-- mmp_site_entries for sites outside their hub.
--
-- Safe to re-run: CREATE OR REPLACE, no data changes.

CREATE OR REPLACE FUNCTION public.get_site_entry_fee_status(entry_ids uuid[])
RETURNS TABLE (
  id uuid,
  fee_paid_status text,
  fee_paid_amount numeric,
  fee_paid_at timestamptz,
  fee_payment_method text,
  enumerator_fee numeric,
  transport_fee numeric
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT
    mse.id,
    mse.fee_paid_status,
    mse.fee_paid_amount,
    mse.fee_paid_at,
    mse.fee_payment_method,
    mse.enumerator_fee,
    mse.transport_fee
  FROM public.mmp_site_entries mse
  WHERE mse.id = ANY(entry_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_site_entry_fee_status(uuid[])
  TO authenticated, anon, service_role;
