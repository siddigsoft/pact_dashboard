-- Fixture-backed regression checks for the claimed-sites feed and filter RPCs.
\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE profiles (
  id uuid PRIMARY KEY, full_name text, username text, email text, role text
);
CREATE TABLE page_access_overrides (
  user_id uuid, page_slug text, is_blocked boolean, expires_at timestamptz
);
CREATE TABLE page_role_configs (page_slug text, roles text[]);
CREATE TABLE mmp_files (
  id uuid PRIMARY KEY, name text, project_name text, mmp_id text
);
CREATE TABLE mmp_site_entries (
  id uuid PRIMARY KEY, site_name text, site_code text, state text, locality text,
  status text, accepted_by text, claimed_by text, accepted_at timestamptz,
  dispatched_at timestamptz, enumerator_fee numeric, transport_fee numeric,
  created_at timestamptz, main_activity text, activity_at_site text,
  mmp_file_id uuid, hub_office uuid, additional_data jsonb DEFAULT '{}'::jsonb
);
CREATE TABLE site_effective_claimants (
  site_entry_id uuid PRIMARY KEY, effective_claimant_id uuid
);

\ir ../migrations/20260919180000_harden_claimed_sites_query.sql

INSERT INTO profiles(id,full_name,role) VALUES
 ('00000000-0000-0000-0000-000000000001','Admin','admin'),
 ('00000000-0000-0000-0000-000000000002','Blocked Admin','admin'),
 ('00000000-0000-0000-0000-00000000000a','Collector A','Data Collector'),
 ('00000000-0000-0000-0000-00000000000b','Collector B','Data Collector');
INSERT INTO page_access_overrides VALUES
 ('00000000-0000-0000-0000-000000000002','data-management',true,NULL);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);

-- Empty datasets and offsets beyond the end return a well-formed empty page.
DO $$
DECLARE r jsonb;
BEGIN
 r := superadmin_claimed_sites_query(p_limit=>2);
 IF r->'rows'<>'[]'::jsonb OR (r->>'filtered_count')::int<>0 OR (r->>'has_more')::boolean
 THEN RAISE EXCEPTION 'empty feed response is invalid: %',r; END IF;
 r := superadmin_claimed_sites_query(p_global_search=>'no result');
 IF r->'rows'<>'[]'::jsonb OR (r->>'filtered_count')::int<>0
 THEN RAISE EXCEPTION 'zero-result response is invalid: %',r; END IF;
END $$;

INSERT INTO mmp_files VALUES ('30000000-0000-0000-0000-000000000001','MMP One',NULL,NULL);

-- Every normalized claimed status group must be represented.
INSERT INTO mmp_site_entries(id,site_name,site_code,state,locality,status,accepted_by,
 created_at,main_activity,mmp_file_id,transport_fee)
SELECT ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 'Status '||s,'S-'||n,'North','Alpha',s,
 '00000000-0000-0000-0000-00000000000a',
 '2026-09-18 12:00Z'::timestamptz-n*interval '1 minute','Survey',
 '30000000-0000-0000-0000-000000000001',0
FROM unnest(ARRAY['accepted','assigned','ongoing','completed','submitted','wfp_confirmed',
 'not_covered','verified','rejected','costed','returned_to_fom','recalled',
 'forwarded_to_coordinator']) WITH ORDINALITY x(s,n);

DO $$
DECLARE s text; r jsonb;
BEGIN
 FOREACH s IN ARRAY ARRAY['accepted','assigned','ongoing','completed','submitted','wfp_confirmed',
  'not_covered','verified','rejected','costed','returned_to_fom','recalled',
  'forwarded_to_coordinator']
 LOOP
  r:=superadmin_claimed_sites_query(p_status=>s);
  IF (r->>'filtered_count')::int<>1 THEN RAISE EXCEPTION 'status % was not queryable: %',s,r; END IF;
 END LOOP;
END $$;

-- LIKE metacharacters are literal, including a literal backslash.
INSERT INTO mmp_site_entries(
 id,site_name,site_code,state,locality,status,accepted_by,enumerator_fee,
 transport_fee,created_at,main_activity,additional_data
) VALUES
 ('20000000-0000-0000-0000-000000000001','Percent % Site','P%1','West','Pct','accepted',
  '00000000-0000-0000-0000-00000000000a',1,0,'2026-09-18 13:01Z','Audit','{}'),
 ('20000000-0000-0000-0000-000000000002','Under_score Site','U_1','West','Under','accepted',
  '00000000-0000-0000-0000-00000000000a',1,0,'2026-09-18 13:02Z','Audit','{}'),
 ('20000000-0000-0000-0000-000000000003','Back\slash Site','B\1','West','Slash','accepted',
  '00000000-0000-0000-0000-00000000000a',1,0,'2026-09-18 13:03Z','Audit','{}');
DO $$
DECLARE r jsonb;
BEGIN
 r:=superadmin_claimed_sites_query(p_site_search=>'%');
 IF (r->>'filtered_count')::int<>1 THEN RAISE EXCEPTION 'literal percent search failed'; END IF;
 r:=superadmin_claimed_sites_query(p_site_search=>'_');
 IF (r->>'filtered_count')::int<>5
 OR NOT EXISTS (
   SELECT 1 FROM jsonb_array_elements(r->'rows') x
   WHERE x->>'id'='20000000-0000-0000-0000-000000000002'
 )
 THEN RAISE EXCEPTION 'literal underscore search failed: %',r; END IF;
 r:=superadmin_claimed_sites_query(p_site_search=>'\');
 IF (r->>'filtered_count')::int<>1 THEN RAISE EXCEPTION 'literal backslash search failed'; END IF;
END $$;

-- Effective claimant replaces all legacy claimant evidence.
INSERT INTO site_effective_claimants VALUES
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b');
DO $$
DECLARE a jsonb; b jsonb;
BEGIN
 a:=superadmin_claimed_sites_query(p_claimant_key=>'00000000-0000-0000-0000-00000000000a');
 b:=superadmin_claimed_sites_query(p_claimant_key=>'00000000-0000-0000-0000-00000000000b');
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(a->'rows') x WHERE x->>'id'='10000000-0000-0000-0000-000000000001')
 OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(b->'rows') x WHERE x->>'id'='10000000-0000-0000-0000-000000000001')
 THEN RAISE EXCEPTION 'effective claimant filtering failed'; END IF;
END $$;

-- Keyset pagination is stable when a newer row is inserted and a prior-page
-- row changes status between requests. Offset pagination would skip one row.
DO $$
DECLARE p1 jsonb; p2 jsonb; ids text[];
BEGIN
 p1:=superadmin_claimed_sites_query(p_state=>'North',p_limit=>2);
 INSERT INTO mmp_site_entries(id,site_name,status,created_at)
 VALUES ('40000000-0000-0000-0000-000000000001','New live row','accepted','2026-09-18 14:00Z');
 UPDATE mmp_site_entries SET status='dispatched'
 WHERE id=(p1->'rows'->0->>'id')::uuid;
 p2:=superadmin_claimed_sites_query(
   p_state=>'North',p_limit=>200,
   p_before_created_at=>(p1->>'next_before_created_at')::timestamptz,
   p_before_id=>(p1->>'next_before_id')::uuid);
 SELECT array_agg(x->>'id') INTO ids
 FROM jsonb_array_elements((p1->'rows')||(p2->'rows')) x;
 IF cardinality(ids)<>13 OR cardinality(ARRAY(SELECT DISTINCT unnest(ids)))<>13
 THEN RAISE EXCEPTION 'live pagination skipped or duplicated rows: %, %',p1,p2; END IF;
END $$;

-- Claimant-filtered keyset pages do not skip a row when a site from the first
-- page is reassigned before the second request.
DO $$
DECLARE p1 jsonb; p2 jsonb; ids text[]; moved_id uuid;
BEGIN
 p1:=superadmin_claimed_sites_query(
   p_state=>'North',
   p_claimant_key=>'00000000-0000-0000-0000-00000000000a',
   p_limit=>2);
 moved_id:=(p1->'rows'->0->>'id')::uuid;
 INSERT INTO site_effective_claimants(site_entry_id,effective_claimant_id)
 VALUES (moved_id,'00000000-0000-0000-0000-00000000000b')
 ON CONFLICT (site_entry_id) DO UPDATE
 SET effective_claimant_id=excluded.effective_claimant_id;
 p2:=superadmin_claimed_sites_query(
   p_state=>'North',
   p_claimant_key=>'00000000-0000-0000-0000-00000000000a',
   p_limit=>200,
   p_before_created_at=>(p1->>'next_before_created_at')::timestamptz,
   p_before_id=>(p1->>'next_before_id')::uuid);
 SELECT array_agg(x->>'id') INTO ids
 FROM jsonb_array_elements((p1->'rows')||(p2->'rows')) x;
 IF cardinality(ids)<>12 OR cardinality(ARRAY(SELECT DISTINCT unnest(ids)))<>12
 THEN RAISE EXCEPTION 'claimant reassignment skipped or duplicated rows: %, %',p1,p2; END IF;
END $$;

-- Option dimensions and row results apply the same fixed predicates.
DO $$
DECLARE r jsonb; o jsonb;
BEGIN
 r:=superadmin_claimed_sites_query(p_state=>'West',p_activity=>'Audit',p_no_transport=>true);
 o:=superadmin_claimed_sites_filter_options(p_state=>'West',p_activity=>'Audit',p_no_transport=>true);
 IF (r->>'filtered_count')::int<>3
 OR o->'localities' <> '["Pct","Slash","Under"]'::jsonb
 OR o->'activities' <> '["Audit"]'::jsonb
 OR o->'states' <> '["West"]'::jsonb
 THEN RAISE EXCEPTION 'row/option predicates drifted: rows %, options %',r,o; END IF;
END $$;

-- An explicit block wins over role access for both definer RPCs.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
DO $$
BEGIN
 BEGIN
  PERFORM superadmin_claimed_sites_query();
  RAISE EXCEPTION 'blocked user called query RPC';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='blocked user called query RPC' OR SQLERRM NOT LIKE '%not authorized%' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM superadmin_claimed_sites_filter_options();
  RAISE EXCEPTION 'blocked user called options RPC';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='blocked user called options RPC' OR SQLERRM NOT LIKE '%not authorized%' THEN RAISE; END IF;
 END;
END $$;

\echo 'Claimed-sites query pagination checks passed.'