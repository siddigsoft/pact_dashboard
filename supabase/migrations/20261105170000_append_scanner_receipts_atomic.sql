-- Session-style bank_transaction_scans (receipts JSON array) already used by
-- TransactionScanner is required. No table policies or access rights are widened.
CREATE OR REPLACE FUNCTION public.append_bank_scan_receipts(
  p_session_id uuid, p_receipts jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing jsonb;
  merged jsonb;
  additions jsonb;
  rec record;
  total numeric := 0;
  updated_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_receipts) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_receipts) = 0 THEN
    RAISE EXCEPTION 'A non-empty receipt array is required';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_receipts) r
    WHERE jsonb_typeof(r) <> 'object' OR nullif(r->>'id', '') IS NULL) THEN
    RAISE EXCEPTION 'Each receipt requires a stable row ID';
  END IF;
  IF (SELECT count(DISTINCT r->>'id') FROM jsonb_array_elements(p_receipts) r)
     <> jsonb_array_length(p_receipts) THEN
    RAISE EXCEPTION 'Each receipt row ID must be unique within the snapshot';
  END IF;
  -- RLS and caller privileges govern both lookup and update. Row lock prevents
  -- two appends from overwriting each other's receipts.
  SELECT coalesce(receipts::jsonb, '[]'::jsonb) INTO existing
  FROM public.bank_transaction_scans WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Saved session not found or access denied' USING ERRCODE = '42501';
  END IF;
  -- Same row ID is a retry, not a repeated receipt. Refresh its metadata.
  -- Different row IDs sharing a transaction ID are retained as audit evidence.
  SELECT coalesce(jsonb_agg(
    coalesce((SELECT n FROM jsonb_array_elements(p_receipts) n
      WHERE n->>'id' = e->>'id' LIMIT 1), e) ORDER BY ord), '[]'::jsonb)
  INTO merged FROM jsonb_array_elements(existing) WITH ORDINALITY AS old(e, ord);
  SELECT coalesce(jsonb_agg(item ORDER BY ord), '[]'::jsonb) INTO additions
  FROM (
    SELECT DISTINCT ON (n->>'id') n AS item, ord
    FROM jsonb_array_elements(p_receipts) WITH ORDINALITY AS incoming(n, ord)
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(existing) e
      WHERE e->>'id' = n->>'id')
    ORDER BY n->>'id', ord
  ) s;
  merged := merged || additions;
  FOR rec IN SELECT value AS r FROM jsonb_array_elements(merged) LOOP
    IF coalesce(rec.r->>'status', 'done') = 'done'
       AND replace(coalesce(rec.r->>'amount', '0'), ',', '') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
      total := total + round(replace(rec.r->>'amount', ',', '')::numeric, 2);
    END IF;
  END LOOP;
  UPDATE public.bank_transaction_scans
  SET receipts = merged, receipt_count = jsonb_array_length(merged), total_amount = total
  WHERE id = p_session_id;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count <> 1 THEN
    RAISE EXCEPTION 'Session update denied' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('success', true, 'added_count', jsonb_array_length(additions),
    'receipt_count', jsonb_array_length(merged), 'total_amount', total);
END;
$$;
REVOKE ALL ON FUNCTION public.append_bank_scan_receipts(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.append_bank_scan_receipts(uuid,jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
