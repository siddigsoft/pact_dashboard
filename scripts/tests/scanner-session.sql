-- ONLY run against a disposable PostgreSQL cluster, not the application DB.
\set ON_ERROR_STOP on
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE public.bank_transaction_scans (
  id uuid PRIMARY KEY, scanned_by uuid NOT NULL, receipts jsonb,
  receipt_count integer, total_amount numeric
);
ALTER TABLE public.bank_transaction_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_scans ON public.bank_transaction_scans TO authenticated
  USING (scanned_by = auth.uid()) WITH CHECK (scanned_by = auth.uid());
GRANT SELECT, UPDATE ON public.bank_transaction_scans TO authenticated;
\ir ../../supabase/migrations/20261105170000_append_scanner_receipts_atomic.sql
INSERT INTO public.bank_transaction_scans VALUES
 ('00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010', '[]', 0, 0);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000010', false);
SELECT public.append_bank_scan_receipts('00000000-0000-0000-0000-000000000001',
  '[{"id":"r1","transaction_id":"same","amount":"1,000.25","status":"done","note":"review","verified":true,"amount_confidence":90,"to_account":"00002","fileName":"one.jpg"},
    {"id":"r2","transaction_id":"same","amount":1000.25,"status":"done"},
    {"id":"r3","amount":999,"status":"error","error":"failed"}]');
DO $$
DECLARE s record;
BEGIN
  SELECT * INTO s FROM bank_transaction_scans;
  IF s.receipt_count <> 3 OR s.total_amount <> 2000.50 THEN RAISE EXCEPTION 'Incorrect totals or lost duplicate'; END IF;
  IF s.receipts->0->>'note' <> 'review' OR s.receipts->0->>'to_account' <> '00002'
    OR s.receipts->0->>'fileName' <> 'one.jpg' OR NOT (s.receipts->0->>'verified')::boolean
  THEN RAISE EXCEPTION 'Metadata lost'; END IF;
END $$;
-- A repeat save updates that exact source row, retaining separate duplicate IDs.
SELECT public.append_bank_scan_receipts('00000000-0000-0000-0000-000000000001',
  '[{"id":"r1","transaction_id":"same","amount":500,"status":"done","note":"edited","verified":false}]');
DO $$
DECLARE s record;
BEGIN
  SELECT * INTO s FROM bank_transaction_scans;
  IF s.receipt_count <> 3 OR s.total_amount <> 1500.25 OR s.receipts->0->>'note' <> 'edited'
  THEN RAISE EXCEPTION 'Idempotent row refresh failed'; END IF;
END $$;
DO $$ BEGIN
  BEGIN
    PERFORM public.append_bank_scan_receipts('00000000-0000-0000-0000-000000000001',
      '[{"id":"repeated"},{"id":"repeated"}]');
    RAISE EXCEPTION 'Repeated row IDs accepted' USING ERRCODE = '23514';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
END $$;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000020', false);
DO $$ BEGIN
  BEGIN
    PERFORM public.append_bank_scan_receipts('00000000-0000-0000-0000-000000000001', '[{"id":"forbidden"}]');
    RAISE EXCEPTION 'Unauthorized append succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
