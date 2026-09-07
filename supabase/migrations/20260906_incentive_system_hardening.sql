-- Canonical, server-authoritative MMP incentive calculation and settlement.
-- This migration deliberately does not trust totals, recipients, or currencies supplied
-- by a browser.  Amounts are integer minor units throughout the payment lifecycle.
-- Snapshot total_dc_fee_pool_cents is the overall reliably-evidenced DC pool;
-- individual role rows use their own what_counts-selected submitted/evidenced pool.

CREATE OR REPLACE FUNCTION public.incentive_role_key(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '', 'g')
    WHEN 'superadmin' THEN 'superadmin'
    WHEN 'financialadmin' THEN 'financialadmin'
    WHEN 'finance' THEN 'financialadmin'
    WHEN 'fieldoperationmanager' THEN 'fom'
    WHEN 'fieldoperationsmanager' THEN 'fom'
    WHEN 'fieldoperationsmanagerfom' THEN 'fom'
    WHEN 'hubsupervisor' THEN 'supervisor'
    WHEN 'datacollector' THEN 'datacollector'
    WHEN 'datacollectionofficer' THEN 'datacollector'
    WHEN 'teamleader' THEN 'teamleader'
    ELSE regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '', 'g')
  END;
$$;

CREATE OR REPLACE FUNCTION public.incentive_scope_key(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '', 'g');
$$;

-- Complete missing foundation fields on installations that ran an early version.
ALTER TABLE public.mmp_incentive_snapshots
  ADD COLUMN IF NOT EXISTS total_site_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confirmed_site_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coordinator_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supervisor_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'SDG',
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_reason text;

ALTER TABLE public.mmp_incentive_payments
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_reason text,
  ADD COLUMN IF NOT EXISTS reversal_reference text;

ALTER TABLE public.mmp_incentive_snapshots DROP CONSTRAINT IF EXISTS mmp_incentive_snapshots_status_check;
ALTER TABLE public.mmp_incentive_snapshots ADD CONSTRAINT mmp_incentive_snapshots_status_check
  CHECK (status IN ('calculating','pre_approved','approved','paid','failed','reversed'));
ALTER TABLE public.mmp_incentive_payments DROP CONSTRAINT IF EXISTS mmp_incentive_payments_status_check;
ALTER TABLE public.mmp_incentive_payments ADD CONSTRAINT mmp_incentive_payments_status_check
  CHECK (status IN ('pending','paid','failed','reversed'));
ALTER TABLE public.mmp_incentive_payments DROP CONSTRAINT IF EXISTS mmp_incentive_payments_nonnegative_amount;
ALTER TABLE public.mmp_incentive_payments
  ADD CONSTRAINT mmp_incentive_payments_nonnegative_amount CHECK (bonus_amount_cents >= 0) NOT VALID;

-- One payment scope is immutable once paid.  Pending scopes may be replaced by a
-- recalculation; paid scopes are never updated or deleted by the calculator.
DROP INDEX IF EXISTS public.idx_mmp_incentive_payments_unique_person;
CREATE UNIQUE INDEX IF NOT EXISTS mmp_incentive_payment_scope_unique
  ON public.mmp_incentive_payments
  (mmp_id, user_id, role, (coalesce(state_id, '')), (coalesce(hub_id, '')));

CREATE TABLE IF NOT EXISTS public.mmp_incentive_settlements (
  payment_id uuid PRIMARY KEY REFERENCES public.mmp_incentive_payments(id) ON DELETE RESTRICT,
  method text NOT NULL CHECK (method IN ('wallet','payroll')),
  payment_reference text NOT NULL UNIQUE,
  payroll_item_id uuid,
  wallet_transaction_id uuid,
  settled_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  reversal_reference text UNIQUE,
  reversal_reason text
);

-- Repair duplicate legacy global/override rows before installing the conflict
-- arbiter used by save_incentive_settings.
DELETE FROM public.incentive_configs old
USING public.incentive_configs keep
WHERE old.hub_id IS NOT DISTINCT FROM keep.hub_id AND old.role=keep.role
  AND (old.updated_at,old.id) < (keep.updated_at,keep.id);
CREATE UNIQUE INDEX IF NOT EXISTS incentive_configs_hub_role_nulls_unique
  ON public.incentive_configs(hub_id,role) NULLS NOT DISTINCT;

-- Only coordinator and supervisor incentives are supported in production.
-- Preserve legacy rows for audit/configuration history, but never leave them active.
UPDATE public.incentive_configs
SET is_active=false,updated_at=now()
WHERE is_active AND public.incentive_role_key(role) IN ('datacollector','fom','teamleader');

CREATE OR REPLACE FUNCTION public.save_incentive_settings(p_settings jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_role text; r jsonb; v_role_key text;
  v_duplicate boolean;
BEGIN
  SELECT public.incentive_role_key(role) INTO v_role FROM public.profiles WHERE id=v_actor;
  IF v_actor IS NULL OR v_role NOT IN ('admin','superadmin') THEN RAISE EXCEPTION 'only administrators may save incentive settings' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_settings) <> 'array' THEN RAISE EXCEPTION 'settings must be an array'; END IF;
  SELECT count(*) <> count(DISTINCT coalesce(value->>'hub_id', '<global>') || '|' || public.incentive_role_key(value->>'role'))
    INTO v_duplicate FROM jsonb_array_elements(p_settings);
  IF v_duplicate THEN RAISE EXCEPTION 'settings contains duplicate hub/role keys'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(p_settings) LOOP
    v_role_key := public.incentive_role_key(r->>'role');
    IF v_role_key NOT IN ('coordinator','supervisor','datacollector','fom','teamleader')
       OR (coalesce((r->>'is_active')::boolean,false) AND v_role_key NOT IN ('coordinator','supervisor'))
       OR coalesce((r->>'bonus_pct')::numeric, -1) NOT BETWEEN 0 AND 100
       OR coalesce((r->>'coverage_threshold_pct')::numeric, -1) NOT BETWEEN 0 AND 100
       OR coalesce(r->>'split_method','') NOT IN ('equal','proportional')
       OR coalesce(r->>'what_counts','') NOT IN ('wfp_confirmed','submitted') THEN
      RAISE EXCEPTION 'invalid incentive setting';
    END IF;
    INSERT INTO public.incentive_configs(hub_id,role,is_active,bonus_pct,split_method,coverage_threshold_pct,what_counts,created_by)
    VALUES (nullif(r->>'hub_id',''),v_role_key,coalesce((r->>'is_active')::boolean,false),
      (r->>'bonus_pct')::numeric,r->>'split_method',(r->>'coverage_threshold_pct')::numeric,r->>'what_counts',v_actor)
    ON CONFLICT (hub_id,role) DO UPDATE SET is_active=excluded.is_active, bonus_pct=excluded.bonus_pct,
      split_method=excluded.split_method, coverage_threshold_pct=excluded.coverage_threshold_pct,
      what_counts=excluded.what_counts, updated_at=now();
  END LOOP;
  -- This RPC owns the complete set, not merely the rows sent by a UI delta.
  DELETE FROM public.incentive_configs c
  WHERE NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_settings) s
    WHERE c.hub_id IS NOT DISTINCT FROM nullif(s->>'hub_id','')
      AND c.role=public.incentive_role_key(s->>'role')
  );
  RETURN jsonb_build_object('ok',true);
END $$;

/* Obsolete one-argument calculator removed.  Retained as a comment only to
   preserve migration history; DROP below removes it from upgraded databases.
CREATE OR REPLACE FUNCTION public.calculate_and_preapprove_mmp_incentives(p_mmp_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
 v_actor uuid:=auth.uid(); v_role text; v_snapshot uuid; v_status text; v_currency text:='SDG';
 v_total integer; v_confirmed integer; v_pool bigint; v_bonus bigint:=0; c record; g record;
 v_config jsonb:='[]'::jsonb; v_now timestamptz:=now(); v_rows integer:=0;
BEGIN
 SELECT public.incentive_role_key(role) INTO v_role FROM public.profiles WHERE id=v_actor;
 IF v_actor IS NULL OR v_role NOT IN ('admin','superadmin','financialadmin') THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.mmp_files WHERE id=p_mmp_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MMP not found'; END IF;
 SELECT currency INTO v_currency FROM (SELECT coalesce(to_jsonb(f)->>'currency','SDG') currency FROM public.mmp_files f WHERE id=p_mmp_id) x;
 SELECT count(*), count(*) FILTER (WHERE lower(coalesce(status,''))='wfp_confirmed'),
        coalesce(sum(round(coalesce(enumerator_fee,0)*100)::bigint) FILTER (WHERE lower(coalesce(status,''))='wfp_confirmed'),0)
 INTO v_total,v_confirmed,v_pool FROM public.mmp_site_entries WHERE mmp_file_id=p_mmp_id;
 IF v_total=0 THEN RAISE EXCEPTION 'cannot calculate incentives: MMP has no site entries'; END IF;
 SELECT id,status INTO v_snapshot,v_status FROM public.mmp_incentive_snapshots WHERE mmp_id=p_mmp_id FOR UPDATE;
 IF v_status IN ('paid','reversed') THEN RAISE EXCEPTION 'paid or reversed incentives are immutable'; END IF;

 -- Every active rule must meet its coverage requirement.  Configs are selected
 -- globally; hub overrides are applied below where a scope has a matching hub id.
 FOR c IN SELECT * FROM public.incentive_configs WHERE hub_id IS NULL AND is_active LOOP
   IF (CASE WHEN c.what_counts='submitted' THEN 100 ELSE v_confirmed::numeric*100/v_total END) < c.coverage_threshold_pct THEN
     RAISE EXCEPTION 'coverage %.2f%% is below %%% for role %', v_confirmed::numeric*100/v_total,c.coverage_threshold_pct,c.role;
   END IF;
 END LOOP;
 INSERT INTO public.mmp_incentive_snapshots(mmp_id,status,total_site_count,confirmed_site_count,total_dc_fee_pool_cents,total_bonus_cents,currency,config_snapshot,pre_approved_by,pre_approved_at)
 VALUES(p_mmp_id,'calculating',v_total,v_confirmed,v_pool,0,v_currency,'[]',v_actor,v_now)
 ON CONFLICT(mmp_id) DO UPDATE SET status='calculating',total_site_count=excluded.total_site_count,
 confirmed_site_count=excluded.confirmed_site_count,total_dc_fee_pool_cents=excluded.total_dc_fee_pool_cents,currency=excluded.currency
 RETURNING id INTO v_snapshot;

 CREATE TEMP TABLE _incentive_rows(user_id uuid, role text, state_id text, hub_id text, dc_count int, pool bigint, pct numeric, amount bigint, split text) ON COMMIT DROP;
 -- Coordinators are assigned only from their real profile state_id/location state.
 FOR g IN SELECT public.incentive_scope_key(state) scope, count(*) n,
                  coalesce(sum(round(coalesce(enumerator_fee,0)*100)::bigint),0) pool
            FROM public.mmp_site_entries WHERE mmp_file_id=p_mmp_id AND lower(coalesce(status,''))='wfp_confirmed'
            GROUP BY public.incentive_scope_key(state) LOOP
   FOR c IN SELECT * FROM public.incentive_configs WHERE role='coordinator' AND hub_id IS NULL AND is_active LOOP
     IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE public.incentive_role_key(p.role)='coordinator'
       AND public.incentive_scope_key(coalesce(p.state_id,p.location->>'state_id',p.location->>'state'))=g.scope) THEN
       RAISE EXCEPTION 'unresolved proportional coordinator assignment for state %', g.scope;
     END IF;
     INSERT INTO _incentive_rows
     SELECT p.id,'coordinator',g.scope,null,g.n,g.pool,c.bonus_pct,
       CASE WHEN c.split_method='equal' THEN (g.pool*c.bonus_pct/100)::bigint / count(*) over ()
            ELSE (g.pool*c.bonus_pct/100)::bigint END,c.split_method
     FROM public.profiles p WHERE public.incentive_role_key(p.role)='coordinator'
       AND public.incentive_scope_key(coalesce(p.state_id,p.location->>'state_id',p.location->>'state'))=g.scope;
   END LOOP;
 END LOOP;
 -- Hub-scoped roles likewise come only from a matching profile hub; no round robin.
 FOR g IN SELECT public.incentive_scope_key(hub_office) scope,count(*) n,coalesce(sum(round(coalesce(enumerator_fee,0)*100)::bigint),0) pool
   FROM public.mmp_site_entries WHERE mmp_file_id=p_mmp_id AND lower(coalesce(status,''))='wfp_confirmed' GROUP BY 1 LOOP
   FOR c IN SELECT * FROM public.incentive_configs WHERE role IN ('supervisor','fom','teamleader') AND is_active
     AND (hub_id IS NULL OR public.incentive_scope_key(hub_id)=g.scope) LOOP
     IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE public.incentive_role_key(p.role)=c.role AND public.incentive_scope_key(p.hub_id)=g.scope) THEN
       RAISE EXCEPTION 'unresolved assignment for % hub %',c.role,g.scope;
     END IF;
     INSERT INTO _incentive_rows SELECT p.id,c.role,null,g.scope,g.n,g.pool,c.bonus_pct,
       CASE WHEN c.split_method='equal' THEN (g.pool*c.bonus_pct/100)::bigint/count(*) over() ELSE (g.pool*c.bonus_pct/100)::bigint END,c.split_method
     FROM public.profiles p WHERE public.incentive_role_key(p.role)=c.role AND public.incentive_scope_key(p.hub_id)=g.scope;
   END LOOP;
 END LOOP;
 -- exact equal split remainders (also for hub roles).
 UPDATE _incentive_rows r SET amount=amount+1 WHERE split='equal' AND ctid IN (
   SELECT ctid FROM (SELECT ctid,row_number() over(partition by role,state_id,hub_id order by user_id) rn,
    pool*pct::numeric/100::numeric exact_amount FROM _incentive_rows) q
   WHERE rn <= (floor(exact_amount)::bigint % (SELECT count(*) FROM _incentive_rows z WHERE z.role=(SELECT role FROM _incentive_rows y WHERE y.ctid=q.ctid) AND z.state_id IS NOT DISTINCT FROM (SELECT state_id FROM _incentive_rows y WHERE y.ctid=q.ctid) AND z.hub_id IS NOT DISTINCT FROM (SELECT hub_id FROM _incentive_rows y WHERE y.ctid=q.ctid)))
 );
 DELETE FROM public.mmp_incentive_payments WHERE snapshot_id=v_snapshot AND status='pending';
 INSERT INTO public.mmp_incentive_payments(snapshot_id,mmp_id,user_id,role,state_id,hub_id,dc_count,dc_fee_pool_cents,bonus_pct,bonus_amount_cents,currency,status)
 SELECT v_snapshot,p_mmp_id,user_id,role,state_id,hub_id,dc_count,pool,pct,amount,v_currency,'pending' FROM _incentive_rows;
 SELECT coalesce(sum(amount),0),count(*) INTO v_bonus,v_rows FROM _incentive_rows;
 SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') INTO v_config FROM public.incentive_configs c WHERE c.is_active;
 UPDATE public.mmp_incentive_snapshots SET status='pre_approved',total_bonus_cents=v_bonus,config_snapshot=v_config,pre_approved_by=v_actor,pre_approved_at=v_now WHERE id=v_snapshot;
 RETURN jsonb_build_object('ok',true,'snapshot_id',v_snapshot,'payments',v_rows,'total_bonus_cents',v_bonus,'currency',v_currency);
END $$;

*/
-- Canonical public calculator.  The DROP is upgrade cleanup only.
-- contract.  This deliberately uses the MMP's real hub identity (id/name),
-- never the display text stored on individual site entries.
DROP FUNCTION IF EXISTS public.calculate_and_preapprove_mmp_incentives(uuid);
CREATE OR REPLACE FUNCTION public.calculate_and_preapprove_mmp_incentives(
  p_mmp_id uuid, p_exclusions jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid:=auth.uid(); v_role text; v_snap uuid; v_currency text; v_hub text;
 v_total int; v_confirmed int; v_pool bigint; v_submitted_pool bigint; v_bonus bigint; v_coord int; v_super int;
 r record; x jsonb; v_mmp jsonb; v_snap_status text;
BEGIN
 SELECT public.incentive_role_key(role) INTO v_role FROM public.profiles WHERE id=v_actor;
 IF v_actor IS NULL OR v_role NOT IN ('admin','superadmin','financialadmin') THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_exclusions)<>'array' THEN RAISE EXCEPTION 'exclusions must be an array'; END IF;
 SELECT to_jsonb(f) INTO v_mmp FROM public.mmp_files f WHERE id=p_mmp_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MMP not found'; END IF;
 IF lower(coalesce(v_mmp->>'cycle_status','')) IN ('closed','historical','archived')
    OR nullif(coalesce(v_mmp->>'cycle_closed_at',v_mmp->>'archivedat'),'') IS NOT NULL THEN
   RAISE EXCEPTION 'closed or historical MMP incentives cannot be activated';
 END IF;
 IF coalesce(nullif(v_mmp->>'uploaded_at','')::timestamptz,
             nullif(v_mmp->>'created_at','')::timestamptz) IS NULL
    OR coalesce(nullif(v_mmp->>'uploaded_at','')::timestamptz,
                nullif(v_mmp->>'created_at','')::timestamptz) < timestamptz '2026-08-01 00:00:00+00' THEN
   RAISE EXCEPTION 'MMP predates the 2026-08-01 incentive activation cutoff';
 END IF;
 SELECT coalesce(to_jsonb(f)->>'currency','SDG'),
        public.incentive_scope_key(coalesce(f.hub_id::text,to_jsonb(f)->>'hub_name',h.id::text,h.name))
 INTO v_currency,v_hub FROM public.mmp_files f LEFT JOIN public.hubs h ON h.id=f.hub_id WHERE f.id=p_mmp_id;
 IF v_hub='' THEN RAISE EXCEPTION 'MMP hub is unresolved'; END IF;
 SELECT count(*),count(*) FILTER (WHERE verified_by IS NOT NULL),
   coalesce(sum(round(coalesce(enumerator_fee,0)*100)::bigint) FILTER (WHERE verified_by IS NOT NULL),0),
   coalesce(sum(round(coalesce(enumerator_fee,0)*100)::bigint),0)
 INTO v_total,v_confirmed,v_pool,v_submitted_pool FROM public.mmp_site_entries WHERE mmp_file_id=p_mmp_id;
 IF v_total=0 THEN RAISE EXCEPTION 'MMP has no site entries'; END IF;
 SELECT status INTO v_snap_status FROM public.mmp_incentive_snapshots WHERE mmp_id=p_mmp_id FOR UPDATE;
 IF v_snap_status IN ('approved','paid','reversed') THEN RAISE EXCEPTION 'locked incentive snapshot cannot be recalculated'; END IF;
 IF EXISTS(SELECT 1 FROM public.mmp_incentive_payments WHERE mmp_id=p_mmp_id AND status IN ('paid','reversed')) THEN RAISE EXCEPTION 'cannot recalculate paid or reversed incentives'; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_exclusions) LOOP
   IF nullif(x->>'user_id','') IS NULL OR public.incentive_role_key(x->>'role')='' OR nullif(btrim(x->>'note'),'') IS NULL
      OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=(x->>'user_id')::uuid) THEN
     RAISE EXCEPTION 'each exclusion requires an existing user_id, role, and note';
   END IF;
 END LOOP;
 -- A config for this MMP hub replaces, rather than supplements, its global rule.
 IF EXISTS (
   SELECT 1 FROM public.incentive_configs
   WHERE is_active AND public.incentive_role_key(role) NOT IN ('coordinator','supervisor')
 ) THEN RAISE EXCEPTION 'unsupported active incentive configuration exists'; END IF;
 CREATE TEMP TABLE _cfg ON COMMIT DROP AS
 SELECT DISTINCT ON (role) * FROM public.incentive_configs
 WHERE is_active AND role IN ('coordinator','supervisor')
   AND (hub_id IS NULL OR public.incentive_scope_key(hub_id)=v_hub)
 ORDER BY role,(hub_id IS NOT NULL) DESC;
 FOR r IN SELECT * FROM _cfg LOOP
   IF r.what_counts='wfp_confirmed' AND v_confirmed::numeric*100/v_total < r.coverage_threshold_pct THEN
     RAISE EXCEPTION 'reliable WFP evidence coverage is below threshold for %',r.role;
   END IF;
 END LOOP;
 INSERT INTO public.mmp_incentive_snapshots(mmp_id,status,total_site_count,confirmed_site_count,total_dc_fee_pool_cents,total_bonus_cents,currency,config_snapshot,pre_approved_by,pre_approved_at)
 VALUES(p_mmp_id,'calculating',v_total,v_confirmed,v_pool,0,v_currency,(SELECT coalesce(jsonb_agg(to_jsonb(_cfg)),'[]') FROM _cfg),v_actor,now())
 ON CONFLICT(mmp_id) DO UPDATE SET status='calculating',total_site_count=excluded.total_site_count,confirmed_site_count=excluded.confirmed_site_count,total_dc_fee_pool_cents=excluded.total_dc_fee_pool_cents,currency=excluded.currency,config_snapshot=excluded.config_snapshot
 RETURNING id INTO v_snap;
 CREATE TEMP TABLE _pay(row_id bigint GENERATED ALWAYS AS IDENTITY,user_id uuid,role text,state_id text,hub_id text,dc_count int,pool bigint,pct numeric,split text,excluded boolean,note text,amount bigint) ON COMMIT DROP;
 -- Start from every qualifying entry scope, including malformed scopes. Nothing
 -- can disappear merely because a reference-table join failed.
 CREATE TEMP TABLE _coord_states ON COMMIT DROP AS
 SELECT public.incentive_scope_key(se.state) entry_scope,hs.state_id,hs.state_name,
   count(*)::int dc_count,coalesce(sum(round(coalesce(se.enumerator_fee,0)*100)::bigint),0) pool
 FROM _cfg c JOIN public.mmp_site_entries se ON se.mmp_file_id=p_mmp_id
 LEFT JOIN public.hub_states hs ON public.incentive_scope_key(hs.hub_id)=v_hub
   AND public.incentive_scope_key(se.state) IN
     (public.incentive_scope_key(hs.state_id),public.incentive_scope_key(hs.state_name))
 WHERE c.role='coordinator' AND c.split_method='proportional'
   AND (c.what_counts='submitted' OR se.verified_by IS NOT NULL)
 GROUP BY public.incentive_scope_key(se.state),hs.state_id,hs.state_name;
 IF EXISTS(SELECT 1 FROM _coord_states WHERE entry_scope='' OR state_id IS NULL) THEN
   RAISE EXCEPTION 'qualifying MMP state is blank or is not mapped to the MMP hub';
 END IF;
 IF EXISTS (
   SELECT 1 FROM _coord_states s WHERE NOT EXISTS (
     SELECT 1 FROM public.profiles p
     WHERE public.incentive_role_key(p.role)='coordinator'
       AND (public.incentive_scope_key(p.hub_id)=v_hub OR public.incentive_scope_key(p.secondary_hub_id)=v_hub
         OR public.incentive_scope_key(p.location->>'secondary_hub_id')=v_hub)
       AND public.incentive_scope_key(coalesce(p.state_id,p.location->>'state_id',p.location->>'state'))
         IN (public.incentive_scope_key(s.state_id),public.incentive_scope_key(s.state_name))
   )
 ) THEN RAISE EXCEPTION 'one or more qualifying MMP states lack an eligible coordinator'; END IF;
 INSERT INTO _pay(user_id,role,state_id,hub_id,dc_count,pool,pct,split,excluded,note,amount)
 SELECT p.id,'coordinator',public.incentive_scope_key(s.state_id),v_hub,s.dc_count,s.pool,c.bonus_pct,c.split_method,
   EXISTS(SELECT 1 FROM jsonb_array_elements(p_exclusions) e WHERE e->>'user_id'=p.id::text AND public.incentive_role_key(e->>'role')='coordinator'),
   (SELECT e->>'note' FROM jsonb_array_elements(p_exclusions) e WHERE e->>'user_id'=p.id::text AND public.incentive_role_key(e->>'role')='coordinator' LIMIT 1),0
 FROM _cfg c JOIN _coord_states s ON c.role='coordinator' AND c.split_method='proportional'
 JOIN public.profiles p ON public.incentive_role_key(p.role)='coordinator'
   AND (public.incentive_scope_key(p.hub_id)=v_hub OR public.incentive_scope_key(p.secondary_hub_id)=v_hub
     OR public.incentive_scope_key(p.location->>'secondary_hub_id')=v_hub)
   AND public.incentive_scope_key(coalesce(p.state_id,p.location->>'state_id',p.location->>'state'))
     IN (public.incentive_scope_key(s.state_id),public.incentive_scope_key(s.state_name));
 INSERT INTO _pay(user_id,role,state_id,hub_id,dc_count,pool,pct,split,excluded,note,amount)
 SELECT p.id,'coordinator',NULL,v_hub,CASE WHEN c.what_counts='submitted' THEN v_total ELSE v_confirmed END,
   CASE WHEN c.what_counts='submitted' THEN v_submitted_pool ELSE v_pool END,c.bonus_pct,c.split_method,
   EXISTS(SELECT 1 FROM jsonb_array_elements(p_exclusions) e WHERE e->>'user_id'=p.id::text AND public.incentive_role_key(e->>'role')='coordinator'),
   (SELECT e->>'note' FROM jsonb_array_elements(p_exclusions) e WHERE e->>'user_id'=p.id::text AND public.incentive_role_key(e->>'role')='coordinator' LIMIT 1),0
 FROM _cfg c JOIN public.profiles p ON public.incentive_role_key(p.role)='coordinator'
 WHERE c.role='coordinator' AND c.split_method='equal'
   AND (public.incentive_scope_key(p.hub_id)=v_hub OR public.incentive_scope_key(p.secondary_hub_id)=v_hub
     OR public.incentive_scope_key(p.location->>'secondary_hub_id')=v_hub);
 IF EXISTS(SELECT 1 FROM _cfg WHERE role='coordinator')
    AND NOT EXISTS(SELECT 1 FROM _pay WHERE role='coordinator') THEN
   RAISE EXCEPTION 'unresolved coordinator assignment';
 END IF;
 INSERT INTO _pay(user_id,role,state_id,hub_id,dc_count,pool,pct,split,excluded,note,amount)
 SELECT p.id,c.role,NULL,v_hub,CASE WHEN c.what_counts='submitted' THEN v_total ELSE v_confirmed END,
   CASE WHEN c.what_counts='submitted' THEN v_submitted_pool ELSE v_pool END,c.bonus_pct,c.split_method,
   EXISTS(SELECT 1 FROM jsonb_array_elements(p_exclusions) e WHERE e->>'user_id'=p.id::text AND public.incentive_role_key(e->>'role')=c.role),
   (SELECT e->>'note' FROM jsonb_array_elements(p_exclusions) e WHERE e->>'user_id'=p.id::text AND public.incentive_role_key(e->>'role')=c.role LIMIT 1),0
 FROM _cfg c JOIN public.profiles p ON public.incentive_role_key(p.role)=c.role
 WHERE c.role='supervisor' AND public.incentive_scope_key(p.hub_id)=v_hub;
 IF EXISTS(SELECT 1 FROM _cfg WHERE role='supervisor') AND NOT EXISTS(SELECT 1 FROM _pay WHERE role='supervisor') THEN RAISE EXCEPTION 'unresolved supervisor assignment'; END IF;
 -- Exact integer allocation, partitioned by role/scope. Exclusions receive zero;
 -- eligible UUID order receives each remainder cent once.
 WITH a AS (SELECT row_id,count(*) FILTER(WHERE NOT excluded) OVER(PARTITION BY role,state_id,hub_id) n,
   excluded,pool,pct,
   sum((NOT excluded)::integer) OVER(PARTITION BY role,state_id,hub_id ORDER BY user_id) rn FROM _pay)
 UPDATE _pay q SET amount=CASE WHEN a.excluded OR a.n=0 THEN 0 ELSE
   floor(a.pool*a.pct/100/a.n)::bigint + CASE WHEN a.rn <= (floor(a.pool*a.pct/100)::bigint % a.n) THEN 1 ELSE 0 END END FROM a WHERE q.row_id=a.row_id;
 DELETE FROM public.mmp_incentive_payments WHERE mmp_id=p_mmp_id AND status IN ('pending','failed');
 INSERT INTO public.mmp_incentive_payments(snapshot_id,mmp_id,user_id,role,state_id,hub_id,dc_count,dc_fee_pool_cents,bonus_pct,bonus_amount_cents,currency,excluded,exclusion_note,status)
 SELECT v_snap,p_mmp_id,user_id,role,state_id,hub_id,dc_count,pool,pct,amount,v_currency,excluded,note,'pending' FROM _pay;
 SELECT coalesce(sum(amount),0),count(*) FILTER(WHERE role='coordinator'),count(*) FILTER(WHERE role='supervisor') INTO v_bonus,v_coord,v_super FROM _pay;
 UPDATE public.mmp_incentive_snapshots SET status='pre_approved',total_bonus_cents=v_bonus,coordinator_count=v_coord,supervisor_count=v_super,pre_approved_by=v_actor,pre_approved_at=now() WHERE id=v_snap;
 RETURN jsonb_build_object('ok',true,'snapshot_id',v_snap,'total_bonus_cents',v_bonus,'currency',v_currency);
END $$;

COMMENT ON FUNCTION public.calculate_and_preapprove_mmp_incentives(uuid,jsonb) IS
 'Calculates incentives solely from MMP entries, configs and profile assignments; fails closed for missing coverage or assignments.';

CREATE OR REPLACE FUNCTION public.pay_mmp_incentive(
  p_payment_id uuid, p_method text, p_payroll_run_id uuid DEFAULT NULL, p_payroll_period text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.mmp_incentive_payments%ROWTYPE; v_actor uuid:=auth.uid(); v_role text;
  v_snapshot text; v_wallet uuid; v_balances jsonb; v_earned numeric; v_before numeric; v_after numeric;
  v_ref text; v_tx uuid; v_payroll uuid;
BEGIN
 SELECT public.incentive_role_key(role) INTO v_role FROM public.profiles WHERE id=v_actor;
 IF v_actor IS NULL OR v_role NOT IN ('admin','superadmin','financialadmin') THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 IF p_method NOT IN ('wallet','payroll') THEN RAISE EXCEPTION 'payment method must be wallet or payroll'; END IF;
 SELECT x.* INTO p FROM public.mmp_incentive_payments x WHERE x.id=p_payment_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'incentive payment not found'; END IF;
 SELECT status INTO v_snapshot FROM public.mmp_incentive_snapshots WHERE id=p.snapshot_id FOR UPDATE;
 IF v_snapshot NOT IN ('approved','paid') THEN RAISE EXCEPTION 'snapshot must be approved before settlement'; END IF;
 IF p.status='paid' THEN RETURN jsonb_build_object('ok',true,'already_paid',true,'reference',p.payment_reference); END IF;
 IF p.status IN ('reversed') OR p.excluded OR p.bonus_amount_cents=0 THEN RAISE EXCEPTION 'payment cannot be settled'; END IF;
 v_ref := 'mmp-incentive:'||p.id::text;
 INSERT INTO public.mmp_incentive_settlements(payment_id,method,payment_reference)
 VALUES(p.id,p_method,v_ref) ON CONFLICT(payment_id) DO NOTHING;
 IF NOT FOUND THEN
   SELECT payment_reference INTO v_ref FROM public.mmp_incentive_settlements WHERE payment_id=p.id;
   RETURN jsonb_build_object('ok',true,'already_paid',true,'reference',v_ref);
 END IF;
 IF p_method='wallet' THEN
   SELECT id,balances,total_earned INTO v_wallet,v_balances,v_earned FROM public.wallets WHERE user_id=p.user_id FOR UPDATE;
   IF NOT FOUND THEN
     INSERT INTO public.wallets(user_id,balances,total_earned) VALUES(p.user_id,jsonb_build_object(p.currency,p.bonus_amount_cents::numeric/100),p.bonus_amount_cents::numeric/100)
       RETURNING id,balances,total_earned INTO v_wallet,v_balances,v_earned;
     v_before:=0;
   ELSE v_before:=coalesce((v_balances->>p.currency)::numeric,0); END IF;
   v_after:=round(v_before+p.bonus_amount_cents::numeric/100,2);
   UPDATE public.wallets SET balances=jsonb_set(v_balances,array[p.currency],to_jsonb(v_after)),total_earned=coalesce(v_earned,0)+p.bonus_amount_cents::numeric/100,updated_at=now() WHERE id=v_wallet;
   INSERT INTO public.wallet_transactions(wallet_id,user_id,type,status,amount,amount_cents,currency,description,balance_before,balance_after,created_by,metadata)
   VALUES(v_wallet,p.user_id,'adjustment','posted',p.bonus_amount_cents::numeric/100,p.bonus_amount_cents,p.currency,'MMP incentive '||p.mmp_id,v_before,v_after,v_actor,jsonb_build_object('incentive_payment_id',p.id,'idempotency_key',p.idempotency_key))
   RETURNING id INTO v_tx;
   UPDATE public.mmp_incentive_settlements SET wallet_transaction_id=v_tx WHERE payment_id=p.id;
 ELSE
   IF to_regclass('public.payroll_run_items') IS NULL THEN RAISE EXCEPTION 'payroll is unavailable'; END IF;
   -- reference_id is unique.  These are the canonical payroll bonus columns;
   -- this creates a line without requiring a payroll run to be posted first.
   EXECUTE 'INSERT INTO public.payroll_run_items(user_id,type,amount_cents,currency,period_label,reference_id,notes,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id'
      INTO v_payroll USING p.user_id,'incentive_bonus',p.bonus_amount_cents,p.currency,
        coalesce(p_payroll_period,'MMP incentive'),p.id,'MMP incentive '||p.mmp_id,v_actor;
   UPDATE public.mmp_incentive_settlements SET payroll_item_id=v_payroll WHERE payment_id=p.id;
 END IF;
 UPDATE public.mmp_incentive_payments SET status='paid',payment_method=p_method,payroll_period=p_payroll_period,paid_by=v_actor,paid_at=now(),payment_reference=v_ref WHERE id=p.id;
 IF NOT EXISTS(SELECT 1 FROM public.mmp_incentive_payments WHERE snapshot_id=p.snapshot_id AND NOT excluded AND status<>'paid') THEN
   UPDATE public.mmp_incentive_snapshots SET status='paid',paid_at=now(),paid_by=v_actor WHERE id=p.snapshot_id;
 END IF;
 RETURN jsonb_build_object('ok',true,'reference',v_ref);
END $$;

CREATE OR REPLACE FUNCTION public.reverse_mmp_incentive(p_payment_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.mmp_incentive_payments%ROWTYPE; s public.mmp_incentive_settlements%ROWTYPE;
 v_actor uuid:=auth.uid(); v_role text; v_bal jsonb; v_wallet uuid; v_earned numeric; v_before numeric; v_after numeric; v_tx uuid; v_ref text;
BEGIN
 SELECT public.incentive_role_key(role) INTO v_role FROM public.profiles WHERE id=v_actor;
 IF v_actor IS NULL OR v_role NOT IN ('admin','superadmin','financialadmin') THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'a reversal reason is required'; END IF;
 SELECT * INTO p FROM public.mmp_incentive_payments WHERE id=p_payment_id FOR UPDATE;
 SELECT * INTO s FROM public.mmp_incentive_settlements WHERE payment_id=p_payment_id FOR UPDATE;
 IF p.status='reversed' THEN RETURN jsonb_build_object('ok',true,'already_reversed',true); END IF;
 IF p.status<>'paid' OR NOT FOUND THEN RAISE EXCEPTION 'only settled payments can be reversed'; END IF;
 IF s.method='payroll' THEN RAISE EXCEPTION 'payroll incentive cannot be reversed here; use the payroll reversal process'; END IF;
 SELECT id,balances,total_earned INTO v_wallet,v_bal,v_earned FROM public.wallets WHERE user_id=p.user_id FOR UPDATE;
 v_before:=coalesce((v_bal->>p.currency)::numeric,0); v_after:=round(v_before-p.bonus_amount_cents::numeric/100,2);
 IF v_before < p.bonus_amount_cents::numeric/100 THEN RAISE EXCEPTION 'wallet balance is insufficient for reversal'; END IF;
 v_ref:='mmp-incentive-reversal:'||p.id::text;
 INSERT INTO public.wallet_transactions(wallet_id,user_id,type,status,amount,amount_cents,currency,description,balance_before,balance_after,created_by,metadata)
 VALUES(v_wallet,p.user_id,'adjustment','posted',-p.bonus_amount_cents::numeric/100,-p.bonus_amount_cents,p.currency,'Reversal: MMP incentive',v_before,v_after,v_actor,jsonb_build_object('incentive_payment_id',p.id,'reversal_reference',v_ref,'reason',p_reason))
 RETURNING id INTO v_tx;
 UPDATE public.wallets SET balances=jsonb_set(v_bal,array[p.currency],to_jsonb(v_after)),
   total_earned=coalesce(v_earned,0)-p.bonus_amount_cents::numeric/100,updated_at=now() WHERE id=v_wallet;
 UPDATE public.mmp_incentive_settlements SET reversed_at=now(),reversal_reference=v_ref,reversal_reason=p_reason WHERE payment_id=p.id;
 UPDATE public.mmp_incentive_payments SET status='reversed',reversed_at=now(),reversed_by=v_actor,reversal_reason=p_reason,reversal_reference=v_ref WHERE id=p.id;
 UPDATE public.mmp_incentive_snapshots SET
   status=CASE WHEN EXISTS(SELECT 1 FROM public.mmp_incentive_payments WHERE snapshot_id=p.snapshot_id AND status='paid')
          THEN 'paid' WHEN EXISTS(SELECT 1 FROM public.mmp_incentive_payments WHERE snapshot_id=p.snapshot_id AND status='pending')
          THEN 'approved' ELSE 'reversed' END,
   reversed_at=now(),reversed_by=v_actor,reversal_reason=p_reason WHERE id=p.snapshot_id;
 RETURN jsonb_build_object('ok',true,'reference',v_ref,'wallet_transaction_id',v_tx);
END $$;

CREATE OR REPLACE FUNCTION public.get_my_incentive_payments()
RETURNS TABLE(
  id uuid, role text, hub_name text, bonus_pct numeric,
  bonus_amount_cents bigint, currency text, excluded boolean,
  payment_status text, payment_method text, paid_at timestamptz,
  snapshot_status text, mmp_id uuid, mmp_name text
) LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public AS $$
  SELECT p.id,p.role,coalesce(p.hub_name,h.name),p.bonus_pct,
    p.bonus_amount_cents,p.currency,p.excluded,p.status AS payment_status,
    p.payment_method,p.paid_at,s.status AS snapshot_status,p.mmp_id,f.name::text
  FROM public.mmp_incentive_payments p
  JOIN public.mmp_incentive_snapshots s ON s.id=p.snapshot_id
  JOIN public.mmp_files f ON f.id=p.mmp_id
  LEFT JOIN public.hubs h ON h.id::text=p.hub_id
  WHERE auth.uid() IS NOT NULL AND p.user_id=auth.uid()
  ORDER BY p.created_at DESC,p.id
$$;

REVOKE ALL ON FUNCTION public.save_incentive_settings(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_incentive_settings(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.calculate_and_preapprove_mmp_incentives(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_and_preapprove_mmp_incentives(uuid,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.pay_mmp_incentive(uuid,text,uuid,text), public.reverse_mmp_incentive(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_mmp_incentive(uuid,text,uuid,text), public.reverse_mmp_incentive(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_incentive_payments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_incentive_payments() TO authenticated;