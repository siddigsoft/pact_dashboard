-- 2026-11-05: Indexed, permission-scoped historical scanner evidence.
-- Safe to re-run. Apply manually in Supabase SQL Editor.
-- Existing saved-session RLS remains the sole authority for reading evidence.
BEGIN;
CREATE TABLE IF NOT EXISTS public.bank_scan_receipt_lookup (
  session_id uuid NOT NULL REFERENCES public.bank_transaction_scans(id) ON DELETE CASCADE,
  receipt_ordinal bigint NOT NULL,
  transaction_id text NOT NULL,
  from_account text, to_account text, amount text, recipient_name text,
  transaction_date text, transaction_time text,
  PRIMARY KEY (session_id, receipt_ordinal)
);
CREATE INDEX IF NOT EXISTS idx_bank_scan_receipt_lookup_transaction
  ON public.bank_scan_receipt_lookup (transaction_id, session_id);
ALTER TABLE public.bank_scan_receipt_lookup ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS accessible_scan_evidence ON public.bank_scan_receipt_lookup;
CREATE POLICY accessible_scan_evidence ON public.bank_scan_receipt_lookup
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.bank_transaction_scans s WHERE s.id = session_id
  ));
REVOKE ALL ON public.bank_scan_receipt_lookup FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.bank_scan_receipt_lookup TO authenticated;

-- Only this trigger and the migration write the derived index. It cannot grant
-- access: both the lookup table and the RPC recheck parent-session RLS.
CREATE OR REPLACE FUNCTION public.sync_bank_scan_receipt_lookup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  DELETE FROM public.bank_scan_receipt_lookup WHERE session_id = NEW.id;
  INSERT INTO public.bank_scan_receipt_lookup (
    session_id, receipt_ordinal, transaction_id, from_account, to_account,
    amount, recipient_name, transaction_date, transaction_time
  )
  SELECT NEW.id, r.ordinality, btrim(r.value->>'transaction_id'),
    r.value->>'from_account', r.value->>'to_account', r.value->>'amount',
    r.value->>'recipient_name', r.value->>'transaction_date', r.value->>'transaction_time'
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.receipts) = 'array'
    THEN NEW.receipts ELSE '[]'::jsonb END) WITH ORDINALITY r
  WHERE coalesce(r.value->>'status', 'done') = 'done'
    AND btrim(coalesce(r.value->>'transaction_id', '')) <> ''
    AND lower(btrim(r.value->>'transaction_id')) NOT IN ('n/a', 'unknown', '-');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_bank_scan_receipt_lookup() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS sync_bank_scan_receipt_lookup ON public.bank_transaction_scans;
CREATE TRIGGER sync_bank_scan_receipt_lookup
  AFTER INSERT OR UPDATE OF receipts ON public.bank_transaction_scans
  FOR EACH ROW EXECUTE FUNCTION public.sync_bank_scan_receipt_lookup();

-- Build/rebuild the projection server-side; serialize with receipt writes.
LOCK TABLE public.bank_transaction_scans IN SHARE ROW EXCLUSIVE MODE;
DELETE FROM public.bank_scan_receipt_lookup;
INSERT INTO public.bank_scan_receipt_lookup (
  session_id, receipt_ordinal, transaction_id, from_account, to_account,
  amount, recipient_name, transaction_date, transaction_time
)
SELECT s.id, r.ordinality, btrim(r.value->>'transaction_id'),
  r.value->>'from_account', r.value->>'to_account', r.value->>'amount',
  r.value->>'recipient_name', r.value->>'transaction_date', r.value->>'transaction_time'
FROM public.bank_transaction_scans s
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.receipts) = 'array'
  THEN s.receipts ELSE '[]'::jsonb END) WITH ORDINALITY r
WHERE coalesce(r.value->>'status', 'done') = 'done'
  AND btrim(coalesce(r.value->>'transaction_id', '')) <> ''
  AND lower(btrim(r.value->>'transaction_id')) NOT IN ('n/a', 'unknown', '-');

CREATE OR REPLACE FUNCTION public.find_bank_scan_receipt_matches(
  p_transaction_ids text[], p_exclude_session_id uuid DEFAULT NULL
)
RETURNS TABLE (
  transaction_id text, session_id uuid, session_name text, scanned_at timestamptz,
  receipt_ordinal bigint, from_account text, to_account text, amount text, recipient_name text,
  transaction_date text, transaction_time text
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
SET row_security = on
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in before checking saved scans' USING ERRCODE = '42501';
  END IF;
  IF coalesce(cardinality(p_transaction_ids), 0) > 25 THEN
    RAISE EXCEPTION 'At most 25 transaction IDs per request' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT evidence.* FROM (
    SELECT DISTINCT btrim(id) id FROM unnest(p_transaction_ids) id
    WHERE btrim(coalesce(id, '')) <> '' AND lower(btrim(id)) NOT IN ('n/a', 'unknown', '-')
  ) requested
  CROSS JOIN LATERAL (
    SELECT r.transaction_id, s.id, s.session_name, s.scanned_at,
      r.receipt_ordinal, r.from_account, r.to_account, r.amount, r.recipient_name,
      r.transaction_date, r.transaction_time
    FROM public.bank_scan_receipt_lookup r
    JOIN public.bank_transaction_scans s ON s.id = r.session_id
    WHERE r.transaction_id = requested.id
      AND (p_exclude_session_id IS NULL OR s.id <> p_exclude_session_id)
    ORDER BY s.scanned_at DESC, s.id, r.receipt_ordinal
    -- One extra result signals truncation; maximum response is 25 * 21 = 525.
    LIMIT 21
  ) evidence;
END;
$$;
REVOKE ALL ON FUNCTION public.find_bank_scan_receipt_matches(text[],uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_bank_scan_receipt_matches(text[],uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
