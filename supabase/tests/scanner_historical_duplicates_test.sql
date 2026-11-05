\set ON_ERROR_STOP on
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
CREATE TABLE public.bank_transaction_scans (
  id uuid PRIMARY KEY, session_name text, scanned_at timestamptz DEFAULT now(),
  scanned_by uuid, receipts jsonb
);
ALTER TABLE public.bank_transaction_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_sessions ON public.bank_transaction_scans FOR SELECT TO authenticated
  USING (scanned_by = auth.uid());
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
GRANT SELECT ON public.bank_transaction_scans TO authenticated;
INSERT INTO bank_transaction_scans(id, scanned_by, session_name, receipts) VALUES
('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','active',
 '[{"transaction_id":"TX1","amount":100,"status":"done"}]'),
('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','earlier',
 '[{"transaction_id":" TX1 ","amount":100,"from_account":"111","to_account":"222"},
   {"transaction_id":"TX1","amount":200,"from_account":"333","to_account":"444"},
   {"transaction_id":"TX1","status":"error"},{"transaction_id":"unknown"}]'),
('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002','inaccessible',
 '[{"transaction_id":"TX1","amount":999,"from_account":"SECRET"}]');
-- Existing sessions must be backfilled without resaving. Re-running must not
-- double their evidence.
\ir ../migrations/20261105180000_scanner_historical_duplicates.sql
\ir ../migrations/20261105180000_scanner_historical_duplicates.sql
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
-- Prove the indexed predicate stays usable for non-owner callers under RLS.
SET enable_seqscan = off;
DO $$
DECLARE plan json;
BEGIN
  EXECUTE 'EXPLAIN (FORMAT JSON, COSTS OFF) SELECT * FROM bank_scan_receipt_lookup WHERE transaction_id = ''TX1'''
    INTO plan;
  IF plan::text NOT LIKE '%idx_bank_scan_receipt_lookup_transaction%' THEN
    RAISE EXCEPTION 'Historical lookup must use its transaction index under RLS: %', plan;
  END IF;
END $$;
RESET enable_seqscan;
DO $$
BEGIN
  IF (SELECT count(*) FROM find_bank_scan_receipt_matches(ARRAY['TX1','TX1'],
    '10000000-0000-0000-0000-000000000001')) <> 2 THEN
    RAISE EXCEPTION 'Expected only two accessible historical receipts';
  END IF;
  IF EXISTS (SELECT 1 FROM find_bank_scan_receipt_matches(ARRAY['TX1']) WHERE from_account = 'SECRET') THEN
    RAISE EXCEPTION 'Inaccessible history leaked';
  END IF;
  IF EXISTS (SELECT 1 FROM bank_scan_receipt_lookup WHERE from_account = 'SECRET') THEN
    RAISE EXCEPTION 'Direct index access leaked inaccessible history';
  END IF;
  BEGIN
    DELETE FROM bank_scan_receipt_lookup WHERE transaction_id = 'TX1';
    RAISE EXCEPTION 'Authenticated callers must not mutate lookup evidence';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF (SELECT count(*) FROM find_bank_scan_receipt_matches(ARRAY['TX1'])) <> 3 THEN
    RAISE EXCEPTION 'Overlapping sessions must retain all evidence';
  END IF;
  IF EXISTS (SELECT 1 FROM find_bank_scan_receipt_matches(ARRAY['unknown','','no-match'])) THEN
    RAISE EXCEPTION 'Missing or unmatched IDs must not match';
  END IF;
  BEGIN
    PERFORM * FROM find_bank_scan_receipt_matches(array_fill('TX1'::text, ARRAY[26]));
    RAISE EXCEPTION 'Expected request limit';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;
-- The second user sees their own evidence only.
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',false);
DO $$ BEGIN
  IF (SELECT count(*) FROM find_bank_scan_receipt_matches(ARRAY['TX1'])) <> 1 THEN
    RAISE EXCEPTION 'History must follow existing RLS';
  END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','',false);
DO $$ BEGIN
  BEGIN
    PERFORM * FROM find_bank_scan_receipt_matches(ARRAY['TX1']);
    RAISE EXCEPTION 'Expected unauthenticated rejection';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
-- Update/append and delete must immediately update indexed evidence.
UPDATE bank_transaction_scans SET receipts = '[{"transaction_id":"TX2","amount":50}]'
WHERE id = '10000000-0000-0000-0000-000000000002';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
DO $$ BEGIN
  IF (SELECT count(*) FROM find_bank_scan_receipt_matches(ARRAY['TX1','TX2'],
    '10000000-0000-0000-0000-000000000001')) <> 1 THEN
    RAISE EXCEPTION 'Updated index is stale';
  END IF;
END $$;
RESET ROLE;
INSERT INTO bank_transaction_scans(id, scanned_by, receipts)
SELECT gen_random_uuid(), '20000000-0000-0000-0000-000000000001',
  '[{"transaction_id":"MANY","amount":10}]' FROM generate_series(1,30);
SET ROLE authenticated;
DO $$ BEGIN
  IF (SELECT count(*) FROM find_bank_scan_receipt_matches(ARRAY['MANY'])) <> 21 THEN
    RAISE EXCEPTION 'Response must be bounded including sentinel';
  END IF;
END $$;
RESET ROLE;
DELETE FROM bank_transaction_scans WHERE receipts @> '[{"transaction_id":"MANY"}]';
SET ROLE authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM find_bank_scan_receipt_matches(ARRAY['MANY'])) THEN
    RAISE EXCEPTION 'Deleted evidence remains';
  END IF;
END $$;
RESET ROLE;
\echo 'Scanner history SQL regression checks passed'
