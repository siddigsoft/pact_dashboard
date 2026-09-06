-- Live integration checks for 20260906_field_device_cycle_close_attribution.sql.
-- This file is loaded by scripts/test-field-device-cycle-close-attribution.sh
-- into a disposable PostgreSQL cluster. It intentionally exercises the real
-- SECURITY DEFINER RPCs and trigger guards.

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE authenticated;
CREATE SCHEMA auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text,
  email text,
  role text,
  additional_roles jsonb DEFAULT '[]'::jsonb
);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  role text
);
CREATE TABLE public.mmp_files (
  id uuid PRIMARY KEY,
  name text,
  cycle_status text DEFAULT 'open',
  cycle_closed_at timestamptz,
  cycle_closed_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.mmp_site_entries (
  id uuid PRIMARY KEY,
  mmp_file_id uuid NOT NULL REFERENCES public.mmp_files(id),
  site_name text,
  state text,
  status text,
  not_covered_flag boolean DEFAULT false,
  accepted_by uuid,
  claimed_by uuid,
  visit_started_by uuid,
  enumerator_fee numeric DEFAULT 0,
  transport_fee numeric DEFAULT 0
);
CREATE TABLE public.mmp_incentive_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mmp_id uuid NOT NULL,
  status text,
  skipped boolean DEFAULT false,
  skipped_reason text,
  total_dc_fee_pool_cents bigint DEFAULT 0,
  total_bonus_cents bigint DEFAULT 0,
  approved_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

\ir ../migrations/20260906_field_device_cycle_close_attribution.sql

-- Mirror the legacy broad site-entry access present in the application. This
-- proves the migration's protection trigger blocks attribution bypasses even
-- when an older permissive policy still allows ordinary row updates.
ALTER TABLE public.mmp_site_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY test_legacy_site_update ON public.mmp_site_entries
 FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY test_legacy_site_select ON public.mmp_site_entries
 FOR SELECT TO authenticated USING (true);
CREATE POLICY test_legacy_site_insert ON public.mmp_site_entries
 FOR INSERT TO authenticated WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON public.mmp_site_entries TO authenticated;

INSERT INTO public.profiles (id, full_name, email, role) VALUES
 ('00000000-0000-0000-0000-000000000001','Official Manager','manager@test.invalid','FOM'),
 ('00000000-0000-0000-0000-000000000002','Official Collector A','a@test.invalid','Data Collector'),
 ('00000000-0000-0000-0000-000000000003','Official Collector B','b@test.invalid','Data Collector'),
 ('00000000-0000-0000-0000-000000000004','Official Coordinator','c@test.invalid','Coordinator'),
 ('00000000-0000-0000-0000-000000000009','Unauthorized User','u@test.invalid','Data Collector');

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);

SELECT public.admin_assign_field_device(
  '00000000-0000-0000-0000-000000000002','ODK Device-01','collector',
  '2026-01-01 00:00:00+00','Initial dated custody'
);
SELECT public.admin_assign_field_device(
  '00000000-0000-0000-0000-000000000003','ODK Device-02','collector',
  '2026-01-01 00:00:00+00','Second device custody'
);
SELECT public.admin_assign_field_device(
  '00000000-0000-0000-0000-000000000004','ODK Coordinator-01','coordinator',
  '2026-01-01 00:00:00+00','Coordinator custody'
);

-- Dated reassignment: Device-03 belongs to A before July and B from July.
SELECT public.admin_assign_field_device(
  '00000000-0000-0000-0000-000000000002','ODK Device-03','collector',
  '2026-01-01 00:00:00+00','First dated owner'
);
SELECT public.admin_retire_field_device_assignment(
  (SELECT a.id FROM field_device_assignments a JOIN field_devices d ON d.id=a.field_device_id
    WHERE d.odk_source_key_normalized='odkdevice03'),
  '2026-06-30 00:00:00+00','Custody ended for reassignment'
);
SELECT public.admin_assign_field_device(
  '00000000-0000-0000-0000-000000000003','ODK Device-03','collector',
  '2026-07-01 00:00:00+00','Second dated owner'
);

INSERT INTO public.mmp_files (id,name) VALUES
 ('10000000-0000-0000-0000-000000000001','Edge cases'),
 ('10000000-0000-0000-0000-000000000002','Correction wins race'),
 ('10000000-0000-0000-0000-000000000003','Close wins race');

INSERT INTO public.mmp_site_entries
 (id,mmp_file_id,site_name,state,status,accepted_by,enumerator_fee,transport_fee) VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Exact match','North','wfp_confirmed','00000000-0000-0000-0000-000000000002',100,20),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Claimant mismatch','North','wfp_confirmed','00000000-0000-0000-0000-000000000002',100,20),
 ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Unknown device','West','wfp_confirmed','00000000-0000-0000-0000-000000000002',100,20),
 ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','Missing device','West','wfp_confirmed','00000000-0000-0000-0000-000000000002',100,20),
 ('20000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','Dated old owner','East','wfp_confirmed','00000000-0000-0000-0000-000000000002',100,20),
 ('20000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001','Dated new owner','East','wfp_confirmed','00000000-0000-0000-0000-000000000003',100,20),
 ('20000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000002','Race correction first','South','wfp_confirmed','00000000-0000-0000-0000-000000000002',100,20),
 ('20000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000003','Race close first','South','wfp_confirmed','00000000-0000-0000-0000-000000000002',100,20);

SELECT public.persist_cycle_attribution_evidence(
 '10000000-0000-0000-0000-000000000001',
 jsonb_build_array(
  jsonb_build_object('site_id','20000000-0000-0000-0000-000000000001','raw_device','odk DEVICE 01','raw_collector_name','Raw A','submission_id','dup-1','submission_date','2026-02-01'),
  jsonb_build_object('site_id','20000000-0000-0000-0000-000000000002','raw_device','ODK Device-02','raw_collector_name','Raw claimant A','submission_id','mismatch-1','submission_date','2026-02-01'),
  jsonb_build_object('site_id','20000000-0000-0000-0000-000000000003','raw_device','UNKNOWN-99','raw_collector_name','Raw unknown','submission_id','unknown-1','submission_date','2026-02-01'),
  jsonb_build_object('site_id','20000000-0000-0000-0000-000000000004','raw_collector_name','Raw missing','submission_id','missing-1','submission_date','2026-02-01'),
  jsonb_build_object('site_id','20000000-0000-0000-0000-000000000005','raw_device','ODK Device-03','raw_collector_name','Raw old','submission_id','dated-old','submission_date','2026-06-15'),
  jsonb_build_object('site_id','20000000-0000-0000-0000-000000000006','raw_device','ODK Device-03','raw_collector_name','Raw new','submission_id','dated-new','submission_date','2026-07-15')
 )
);

-- Duplicate evidence is first-write-wins, even when the duplicate differs.
SELECT public.persist_cycle_attribution_evidence(
 '10000000-0000-0000-0000-000000000001',
 jsonb_build_array(jsonb_build_object(
  'site_id','20000000-0000-0000-0000-000000000001',
  'raw_device','ODK Device-02','raw_collector_name','Tampered duplicate',
  'submission_id','dup-2','submission_date','2026-08-01'
 ))
);

DO $$
DECLARE v_device_1 uuid; v_device_2 uuid; v_report jsonb;
BEGIN
 SELECT id INTO v_device_1 FROM field_devices WHERE odk_source_key_normalized='odkdevice01';
 SELECT id INTO v_device_2 FROM field_devices WHERE odk_source_key_normalized='odkdevice02';

 IF NOT EXISTS (SELECT 1 FROM mmp_site_entries WHERE id='20000000-0000-0000-0000-000000000001'
   AND attribution_device_id=v_device_1 AND attribution_collector_id='00000000-0000-0000-0000-000000000002'
   AND attribution_status='auto' AND wfp_raw_submission_id='dup-1') THEN
   RAISE EXCEPTION 'exact match or duplicate first-write-wins failed';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM mmp_site_entries WHERE id='20000000-0000-0000-0000-000000000002'
   AND attribution_device_id=v_device_2 AND attribution_collector_id='00000000-0000-0000-0000-000000000003'
   AND attribution_status='unresolved') THEN
   RAISE EXCEPTION 'claimant mismatch was not held for review';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM mmp_site_entries WHERE id='20000000-0000-0000-0000-000000000005'
   AND attribution_collector_id='00000000-0000-0000-0000-000000000002' AND attribution_status='auto')
   OR NOT EXISTS (SELECT 1 FROM mmp_site_entries WHERE id='20000000-0000-0000-0000-000000000006'
   AND attribution_collector_id='00000000-0000-0000-0000-000000000003' AND attribution_status='auto') THEN
   RAISE EXCEPTION 'dated reassignment resolution failed';
 END IF;

 -- Registered evidence cannot be corrected while omitting its device.
 BEGIN
   PERFORM public.correct_collection_attribution(
    '20000000-0000-0000-0000-000000000002',NULL,
    '00000000-0000-0000-0000-000000000003',NULL,'Registered device must be supplied');
   RAISE EXCEPTION 'registered-device/null-device correction was accepted';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='registered-device/null-device correction was accepted' OR SQLERRM NOT LIKE 'REGISTERED_DEVICE_REQUIRED:%' THEN RAISE; END IF;
 END;

 -- A selected device must match immutable raw evidence.
 BEGIN
   PERFORM public.correct_collection_attribution(
    '20000000-0000-0000-0000-000000000002',v_device_1,
    '00000000-0000-0000-0000-000000000003',NULL,'Mismatched device must be rejected');
   RAISE EXCEPTION 'mismatched selected device was accepted';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='mismatched selected device was accepted' OR SQLERRM NOT LIKE 'DEVICE_EVIDENCE_MISMATCH:%' THEN RAISE; END IF;
 END;

 PERFORM public.correct_collection_attribution(
  '20000000-0000-0000-0000-000000000002',v_device_2,
  '00000000-0000-0000-0000-000000000003',NULL,'Resolve claimant mismatch explicitly');
 PERFORM public.correct_collection_attribution(
  '20000000-0000-0000-0000-000000000003',NULL,
  '00000000-0000-0000-0000-000000000002',NULL,'Approve unknown device exception');
 PERFORM public.correct_collection_attribution(
  '20000000-0000-0000-0000-000000000004',NULL,
  '00000000-0000-0000-0000-000000000002',NULL,'Approve missing device exception');

 IF NOT EXISTS (SELECT 1 FROM mmp_site_entries WHERE id='20000000-0000-0000-0000-000000000003'
   AND attribution_status='corrected' AND attribution_exception_code='unknown_device')
   OR NOT EXISTS (SELECT 1 FROM mmp_site_entries WHERE id='20000000-0000-0000-0000-000000000004'
   AND attribution_status='corrected' AND attribution_exception_code='missing_device_evidence') THEN
   RAISE EXCEPTION 'unknown/missing device exception codes failed';
 END IF;

 v_report:=public.get_cycle_attribution_report('10000000-0000-0000-0000-000000000001');
 IF (v_report#>>'{totals,unresolved}')::int<>0
   OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_report->'rows') r
    WHERE r->>'site_id'='20000000-0000-0000-0000-000000000002'
      AND r->>'resolved_collector_id'='00000000-0000-0000-0000-000000000003'
      AND r->>'resolved_collector_name'='Official Collector B'
   ) THEN RAISE EXCEPTION 'attribution report did not use official corrected profile'; END IF;
END $$;

-- Unauthorized direct RPC calls and protected direct writes both fail.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000009',false);
DO $$
BEGIN
 BEGIN
  PERFORM public.get_cycle_attribution_report('10000000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'unauthorized report RPC succeeded';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='unauthorized report RPC succeeded' OR SQLERRM<>'FORBIDDEN' THEN RAISE; END IF;
 END;
 BEGIN
  UPDATE public.mmp_site_entries SET attribution_status='corrected'
   WHERE id='20000000-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'protected direct update succeeded';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='protected direct update succeeded' OR SQLERRM NOT LIKE 'PROTECTED_ATTRIBUTION_STATE:%' THEN RAISE; END IF;
 END;
 BEGIN
  INSERT INTO public.mmp_site_entries(
   id,mmp_file_id,site_name,status,attribution_collector_id,attribution_status
  ) VALUES (
   '20000000-0000-0000-0000-000000000099',
   '10000000-0000-0000-0000-000000000001',
   'Fabricated attribution','wfp_confirmed',
   '00000000-0000-0000-0000-000000000009','corrected'
  );
  RAISE EXCEPTION 'protected direct insert succeeded';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='protected direct insert succeeded' OR SQLERRM NOT LIKE 'PROTECTED_ATTRIBUTION_STATE:%' THEN RAISE; END IF;
 END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);

-- Seed both race rows as valid auto-attributions.
SELECT public.persist_cycle_attribution_evidence(
 '10000000-0000-0000-0000-000000000002',
 '[{"site_id":"20000000-0000-0000-0000-000000000007","raw_device":"ODK Device-01","submission_id":"race-a","submission_date":"2026-02-01"}]'::jsonb
);
SELECT public.persist_cycle_attribution_evidence(
 '10000000-0000-0000-0000-000000000003',
 '[{"site_id":"20000000-0000-0000-0000-000000000008","raw_device":"ODK Device-01","submission_id":"race-b","submission_date":"2026-02-01"}]'::jsonb
);

GRANT SELECT, UPDATE ON public.mmp_files, public.mmp_site_entries TO authenticated;

\echo 'Field-device attribution edge-case checks passed.'