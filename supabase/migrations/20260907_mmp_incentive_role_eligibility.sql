BEGIN;

-- This table intentionally stores the hub key as text.  Some older deployments
-- use UUID hub ids and others use text ids, so a foreign key here is not portable.
CREATE TABLE IF NOT EXISTS public.mmp_incentive_eligibility_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  hub_id text NOT NULL, state_id text,
  role text NOT NULL CHECK (role IN ('coordinator','supervisor','fom','support_team')),
  decision text NOT NULL CHECK (decision IN ('include','exclude')),
  note text NOT NULL CHECK (length(btrim(note)) > 0),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT, revoke_note text,
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS mmp_incentive_eligibility_override_live_unique
  ON public.mmp_incentive_eligibility_overrides(user_id,hub_id,role,(coalesce(state_id,'')))
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS mmp_incentive_eligibility_override_role_user
  ON public.mmp_incentive_eligibility_overrides(role,user_id) WHERE revoked_at IS NULL;

ALTER TABLE public.mmp_incentive_snapshots
  ADD COLUMN IF NOT EXISTS eligibility_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS role_counts jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.mmp_incentive_payments
  ADD COLUMN IF NOT EXISTS eligibility_evidence jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.incentive_role_key(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT CASE regexp_replace(lower(coalesce(p_value,'')),'[^a-z0-9]+','','g')
  WHEN 'superadmin' THEN 'superadmin' WHEN 'financialadmin' THEN 'financialadmin'
  WHEN 'finance' THEN 'financialadmin' WHEN 'fieldoperationmanager' THEN 'fom'
  WHEN 'fieldoperationsmanager' THEN 'fom' WHEN 'fieldoperationsmanagerfom' THEN 'fom'
  WHEN 'hubsupervisor' THEN 'supervisor' WHEN 'supportteam' THEN 'support_team'
  WHEN 'datacollector' THEN 'datacollector' WHEN 'datacollectionofficer' THEN 'datacollector'
  WHEN 'teamleader' THEN 'teamleader'
  ELSE regexp_replace(lower(coalesce(p_value,'')),'[^a-z0-9]+','','g') END $$;

-- A normalized value is usable only when it identifies exactly one state in
-- the hub.  This is deliberately shared by entries, profile evidence and
-- overrides so no path can silently choose between duplicate names/IDs.
CREATE OR REPLACE FUNCTION public.resolve_mmp_hub_state(p_hub_id text,p_state_value text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE matches text[]; normalized text:=incentive_scope_key(p_state_value);
BEGIN
 IF normalized='' THEN RETURN NULL; END IF;
 SELECT array_agg(DISTINCT hs.state_id ORDER BY hs.state_id) INTO matches
 FROM hub_states hs
 WHERE incentive_scope_key(hs.hub_id)=incentive_scope_key(p_hub_id)
   AND normalized IN(incentive_scope_key(hs.state_id),incentive_scope_key(hs.state_name));
 IF coalesce(cardinality(matches),0)>1 THEN
   RAISE EXCEPTION 'ambiguous state "%" in hub "%"; matches state IDs: %',
     p_state_value,p_hub_id,array_to_string(matches,', ');
 END IF;
 RETURN matches[1];
END $$;

-- Return every valid assignment, not a global LIMIT 1.  State IDs are converted
-- to the hub's canonical ID, whether the assignment used an ID or display name.
CREATE OR REPLACE FUNCTION public.profile_incentive_role_evidence(
 p_user_id uuid,p_role text,p_hub_id text
) RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH raw AS (
  SELECT 'primary_role'::text source,p.role::text classification,p_hub_id hub_id,
   coalesce(p.state_id,p.location->>'state_id',p.location->>'state') state_id,1 priority
  FROM profiles p WHERE p.id=p_user_id AND incentive_role_key(p.role)=p_role
   AND (incentive_scope_key(p.hub_id)=incentive_scope_key(p_hub_id)
     OR incentive_scope_key(p.secondary_hub_id)=incentive_scope_key(p_hub_id)
     OR incentive_scope_key(p.location->>'secondary_hub_id')=incentive_scope_key(p_hub_id))
  UNION ALL
  SELECT CASE WHEN jsonb_typeof(a.value)='object' THEN 'additional_role_object' ELSE 'additional_role_scalar' END,
   CASE WHEN jsonb_typeof(a.value)='object' THEN a.value->>'role' ELSE a.value#>>'{}' END,
   CASE WHEN jsonb_typeof(a.value)='object' THEN a.value->>'hub_id' ELSE p_hub_id END,
   CASE WHEN jsonb_typeof(a.value)='object' THEN a.value->>'state_id' ELSE coalesce(p.state_id,p.location->>'state_id',p.location->>'state') END,
   CASE WHEN jsonb_typeof(a.value)='object' THEN 2 ELSE 3 END
  FROM profiles p CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.additional_roles)='array' THEN p.additional_roles ELSE '[]'::jsonb END) a
  WHERE p.id=p_user_id AND incentive_role_key(CASE WHEN jsonb_typeof(a.value)='object' THEN a.value->>'role' ELSE a.value#>>'{}' END)=p_role
   AND (jsonb_typeof(a.value)<>'object' OR incentive_scope_key(a.value->>'hub_id')=incentive_scope_key(p_hub_id))
   AND (jsonb_typeof(a.value)='object' OR incentive_scope_key(p.hub_id)=incentive_scope_key(p_hub_id)
     OR incentive_scope_key(p.secondary_hub_id)=incentive_scope_key(p_hub_id)
     OR incentive_scope_key(p.location->>'secondary_hub_id')=incentive_scope_key(p_hub_id))
  UNION ALL
  SELECT 'active_classification',uc.role_scope::text,p_hub_id,
   coalesce(p.state_id,p.location->>'state_id',p.location->>'state'),4
  FROM user_classifications uc JOIN profiles p ON p.id=uc.user_id
  WHERE uc.user_id=p_user_id AND uc.is_active AND uc.effective_from<=now()
   AND (uc.effective_until IS NULL OR uc.effective_until>now())
   AND incentive_role_key(uc.role_scope::text)=p_role
   AND (incentive_scope_key(p.hub_id)=incentive_scope_key(p_hub_id)
     OR incentive_scope_key(p.secondary_hub_id)=incentive_scope_key(p_hub_id)
     OR incentive_scope_key(p.location->>'secondary_hub_id')=incentive_scope_key(p_hub_id))
 ), resolved AS MATERIALIZED (
  SELECT r.*,CASE WHEN p_role='coordinator' THEN resolve_mmp_hub_state(p_hub_id,r.state_id) END canonical_state
  FROM raw r
 )
 SELECT jsonb_build_object('source',r.source,'classification',r.classification,
   'hub_id',p_hub_id,'state_id',r.canonical_state,
   'scope',CASE WHEN p_role='coordinator' THEN 'state' ELSE 'hub' END)
 FROM resolved r
 WHERE p_role<>'coordinator' OR r.canonical_state IS NOT NULL
 ORDER BY r.priority,r.source,r.classification,r.canonical_state $$;

CREATE OR REPLACE FUNCTION public.set_mmp_incentive_eligibility_override(
 p_user_id uuid,p_hub_id text,p_role text,p_decision text,p_note text,p_state_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid:=auth.uid(); actor_role text; role_key text:=incentive_role_key(p_role); canonical_state text;
BEGIN
 SELECT incentive_role_key(role) INTO actor_role FROM profiles WHERE id=actor;
 IF actor IS NULL OR actor_role NOT IN ('admin','superadmin') THEN RAISE EXCEPTION 'only administrators may change incentive eligibility' USING ERRCODE='42501'; END IF;
 IF role_key NOT IN ('coordinator','supervisor','fom','support_team') OR p_decision NOT IN ('include','exclude') OR nullif(btrim(p_note),'') IS NULL
  OR NOT EXISTS(SELECT 1 FROM hubs WHERE incentive_scope_key(id::text)=incentive_scope_key(p_hub_id))
  OR NOT EXISTS(SELECT 1 FROM profiles p WHERE p.id=p_user_id AND (incentive_scope_key(p.hub_id)=incentive_scope_key(p_hub_id) OR incentive_scope_key(p.secondary_hub_id)=incentive_scope_key(p_hub_id) OR incentive_scope_key(p.location->>'secondary_hub_id')=incentive_scope_key(p_hub_id))) THEN
  RAISE EXCEPTION 'invalid eligibility override';
 END IF;
 IF role_key='coordinator' THEN
  canonical_state:=resolve_mmp_hub_state(p_hub_id,p_state_id);
  IF canonical_state IS NULL THEN RAISE EXCEPTION 'coordinator override requires a state mapped to this hub'; END IF;
 ELSIF nullif(btrim(p_state_id),'') IS NOT NULL THEN RAISE EXCEPTION 'only coordinator overrides may be state scoped'; END IF;
 UPDATE mmp_incentive_eligibility_overrides SET revoked_at=now(),revoked_by=actor,revoke_note='superseded: '||btrim(p_note)
  WHERE user_id=p_user_id AND incentive_scope_key(hub_id)=incentive_scope_key(p_hub_id) AND role=role_key
   AND (role_key<>'coordinator' OR resolve_mmp_hub_state(p_hub_id,state_id) IS NOT DISTINCT FROM canonical_state)
   AND revoked_at IS NULL;
 INSERT INTO mmp_incentive_eligibility_overrides(user_id,hub_id,state_id,role,decision,note,created_by) VALUES(p_user_id,p_hub_id,canonical_state,role_key,p_decision,btrim(p_note),actor);
 RETURN jsonb_build_object('ok',true,'state_id',canonical_state);
END $$;
CREATE OR REPLACE FUNCTION public.set_mmp_incentive_eligibility_override(p_user_id uuid,p_hub_id text,p_role text,p_decision text,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF incentive_role_key(p_role)='coordinator' THEN RAISE EXCEPTION 'state_id is required for coordinator eligibility overrides'; END IF;
 RETURN set_mmp_incentive_eligibility_override(p_user_id,p_hub_id,p_role,p_decision,p_note,NULL); END $$;
CREATE OR REPLACE FUNCTION public.set_mmp_incentive_eligibility_override(p_user_id uuid,p_role text,p_decision text,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'hub_id is required for incentive eligibility overrides'; END $$;

CREATE OR REPLACE FUNCTION public.revoke_mmp_incentive_eligibility_override(
 p_override_id uuid,p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid:=auth.uid(); actor_role text;
BEGIN
 SELECT incentive_role_key(role) INTO actor_role FROM profiles WHERE id=actor;
 IF actor IS NULL OR actor_role NOT IN ('admin','superadmin') THEN
  RAISE EXCEPTION 'only administrators may revoke incentive eligibility' USING ERRCODE='42501';
 END IF;
 IF nullif(btrim(p_note),'') IS NULL THEN RAISE EXCEPTION 'a revoke note is required'; END IF;
 UPDATE mmp_incentive_eligibility_overrides
 SET revoked_at=now(),revoked_by=actor,revoke_note=btrim(p_note)
 WHERE id=p_override_id AND revoked_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'active incentive eligibility override not found'; END IF;
 RETURN jsonb_build_object('ok',true,'override_id',p_override_id);
END $$;

ALTER TABLE public.mmp_incentive_eligibility_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS incentive_eligibility_override_read ON public.mmp_incentive_eligibility_overrides;
CREATE POLICY incentive_eligibility_override_read ON public.mmp_incentive_eligibility_overrides FOR SELECT USING (public.incentive_is_finance_or_admin());
DROP POLICY IF EXISTS incentive_eligibility_override_admin_write ON public.mmp_incentive_eligibility_overrides;
CREATE POLICY incentive_eligibility_override_admin_write ON public.mmp_incentive_eligibility_overrides FOR ALL USING (public.incentive_is_admin()) WITH CHECK (public.incentive_is_admin());

-- Settings owns the complete four-role set.  A hub row wins over the global row
-- during calculation, including an inactive hub row (which deliberately turns
-- that role off for the hub).
CREATE OR REPLACE FUNCTION public.save_incentive_settings(p_settings jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid:=auth.uid(); actor_role text; item jsonb; role_key text; duplicate_keys boolean;
BEGIN
 SELECT incentive_role_key(role) INTO actor_role FROM profiles WHERE id=actor;
 IF actor IS NULL OR actor_role NOT IN ('admin','superadmin') THEN RAISE EXCEPTION 'only administrators may save incentive settings' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_settings)<>'array' THEN RAISE EXCEPTION 'settings must be an array'; END IF;
 SELECT count(*)<>count(DISTINCT coalesce(value->>'hub_id','<global>')||'|'||incentive_role_key(value->>'role')) INTO duplicate_keys FROM jsonb_array_elements(p_settings);
 IF duplicate_keys THEN RAISE EXCEPTION 'settings contains duplicate hub/role keys'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_settings) LOOP
  role_key:=incentive_role_key(item->>'role');
  IF role_key NOT IN ('coordinator','supervisor','fom','support_team')
    OR coalesce((item->>'bonus_pct')::numeric,-1) NOT BETWEEN 0 AND 100
    OR coalesce((item->>'coverage_threshold_pct')::numeric,-1) NOT BETWEEN 0 AND 100
    OR coalesce(item->>'split_method','') NOT IN ('equal','proportional')
    OR coalesce(item->>'what_counts','') NOT IN ('wfp_confirmed','submitted') THEN RAISE EXCEPTION 'invalid incentive setting'; END IF;
  INSERT INTO incentive_configs(hub_id,role,is_active,bonus_pct,split_method,coverage_threshold_pct,what_counts,created_by)
   VALUES(nullif(item->>'hub_id',''),role_key,coalesce((item->>'is_active')::boolean,false),(item->>'bonus_pct')::numeric,item->>'split_method',(item->>'coverage_threshold_pct')::numeric,item->>'what_counts',actor)
   ON CONFLICT(hub_id,role) DO UPDATE SET is_active=excluded.is_active,bonus_pct=excluded.bonus_pct,split_method=excluded.split_method,coverage_threshold_pct=excluded.coverage_threshold_pct,what_counts=excluded.what_counts,updated_at=now();
 END LOOP;
 DELETE FROM incentive_configs c WHERE c.role IN ('coordinator','supervisor','fom','support_team')
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_settings) s WHERE c.hub_id IS NOT DISTINCT FROM nullif(s->>'hub_id','') AND c.role=incentive_role_key(s->>'role'));
 RETURN jsonb_build_object('ok',true);
END $$;

CREATE OR REPLACE FUNCTION public.calculate_and_preapprove_mmp_incentives(p_mmp_id uuid,p_exclusions jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid:=auth.uid(); actor_role text; snap uuid; old_status text; mmp jsonb; hub text; currency text; total int; confirmed int; confirmed_pool bigint; submitted_pool bigint; r record; bonus bigint;
BEGIN
 SELECT incentive_role_key(role) INTO actor_role FROM profiles WHERE id=actor;
 IF actor IS NULL OR actor_role NOT IN ('admin','superadmin','financialadmin') THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_exclusions)<>'array' THEN RAISE EXCEPTION 'eligibility decisions must be an array'; END IF;
 SELECT to_jsonb(f),incentive_scope_key(coalesce(f.hub_id::text,h.id::text,h.name,to_jsonb(f)->>'hub_name')),coalesce(to_jsonb(f)->>'currency','SDG') INTO mmp,hub,currency FROM mmp_files f LEFT JOIN hubs h ON h.id=f.hub_id WHERE f.id=p_mmp_id FOR UPDATE OF f;
 IF NOT FOUND OR hub='' THEN RAISE EXCEPTION 'MMP or MMP hub is unresolved'; END IF;
 IF lower(coalesce(mmp->>'cycle_status','')) IN ('closed','historical','archived') OR nullif(coalesce(mmp->>'cycle_closed_at',mmp->>'archivedat'),'') IS NOT NULL THEN RAISE EXCEPTION 'closed or historical MMP incentives cannot be activated'; END IF;
 IF coalesce(nullif(mmp->>'uploaded_at','')::timestamptz,nullif(mmp->>'created_at','')::timestamptz) IS NULL OR coalesce(nullif(mmp->>'uploaded_at','')::timestamptz,nullif(mmp->>'created_at','')::timestamptz)<timestamptz '2026-08-01' THEN RAISE EXCEPTION 'MMP predates the 2026-08-01 incentive activation cutoff'; END IF;
 SELECT status INTO old_status FROM mmp_incentive_snapshots WHERE mmp_id=p_mmp_id FOR UPDATE;
 IF old_status IN ('approved','paid','reversed') OR EXISTS(SELECT 1 FROM mmp_incentive_payments WHERE mmp_id=p_mmp_id AND status IN ('paid','reversed')) THEN RAISE EXCEPTION 'locked incentive snapshot cannot be recalculated'; END IF;
 SELECT count(*),count(*) FILTER(WHERE verified_by IS NOT NULL),coalesce(sum(round(coalesce(enumerator_fee,0)*100)::bigint) FILTER(WHERE verified_by IS NOT NULL),0),coalesce(sum(round(coalesce(enumerator_fee,0)*100)::bigint),0) INTO total,confirmed,confirmed_pool,submitted_pool FROM mmp_site_entries WHERE mmp_file_id=p_mmp_id;
 IF total=0 THEN RAISE EXCEPTION 'MMP has no site entries'; END IF;
 DROP TABLE IF EXISTS pg_temp._allocation,pg_temp._eligible,pg_temp._coord_states,pg_temp._cfg;
 CREATE TEMP TABLE _cfg ON COMMIT DROP AS SELECT * FROM (SELECT DISTINCT ON(role) * FROM incentive_configs WHERE role IN ('coordinator','supervisor','fom','support_team') AND (hub_id IS NULL OR incentive_scope_key(hub_id)=hub) ORDER BY role,(hub_id IS NOT NULL) DESC,updated_at DESC,id DESC) q WHERE is_active;
 FOR r IN SELECT * FROM _cfg LOOP IF r.what_counts='wfp_confirmed' AND confirmed::numeric*100/total<r.coverage_threshold_pct THEN RAISE EXCEPTION 'reliable WFP evidence coverage is below threshold for %',r.role; END IF; END LOOP;
 CREATE TEMP TABLE _coord_states(state_id text PRIMARY KEY,dc_count int,pool bigint) ON COMMIT DROP;
 INSERT INTO _coord_states
 SELECT resolved.state_id,count(*)::int,coalesce(sum(round(coalesce(e.enumerator_fee,0)*100)::bigint),0)
 FROM _cfg c JOIN mmp_site_entries e ON e.mmp_file_id=p_mmp_id
 CROSS JOIN LATERAL (SELECT resolve_mmp_hub_state(hub,e.state) state_id) resolved
 WHERE c.role='coordinator' AND c.split_method='proportional'
   AND (c.what_counts='submitted' OR e.verified_by IS NOT NULL) AND resolved.state_id IS NOT NULL
 GROUP BY resolved.state_id;
 IF EXISTS(SELECT 1 FROM _cfg c JOIN mmp_site_entries e ON e.mmp_file_id=p_mmp_id
   CROSS JOIN LATERAL (SELECT resolve_mmp_hub_state(hub,e.state) state_id) resolved
   WHERE c.role='coordinator' AND c.split_method='proportional'
    AND (c.what_counts='submitted' OR e.verified_by IS NOT NULL) AND resolved.state_id IS NULL)
 THEN RAISE EXCEPTION 'qualifying MMP state is blank or is not mapped to the MMP hub'; END IF;
 IF EXISTS(SELECT 1 FROM _cfg c JOIN mmp_incentive_eligibility_overrides o ON incentive_scope_key(o.hub_id)=hub WHERE c.role='coordinator' AND c.split_method='equal' AND o.revoked_at IS NULL) THEN RAISE EXCEPTION 'state-scoped coordinator overrides require proportional split_method'; END IF;
 CREATE TEMP TABLE _eligible(user_id uuid,role text,state_key text NOT NULL,state_id text,evidence jsonb,priority int,PRIMARY KEY(user_id,role,state_key)) ON COMMIT DROP;
 INSERT INTO _eligible SELECT p.id,'coordinator',s.state_id,s.state_id,e,10 FROM _coord_states s CROSS JOIN profiles p CROSS JOIN LATERAL profile_incentive_role_evidence(p.id,'coordinator',hub) e WHERE e->>'state_id'=s.state_id ON CONFLICT(user_id,role,state_key) DO UPDATE SET evidence=excluded.evidence,priority=excluded.priority;
 INSERT INTO _eligible SELECT DISTINCT ON(p.id) p.id,'coordinator','',NULL,e,10 FROM _cfg c CROSS JOIN profiles p CROSS JOIN LATERAL profile_incentive_role_evidence(p.id,'coordinator',hub) e WHERE c.role='coordinator' AND c.split_method='equal' ORDER BY p.id,e->>'source',e->>'state_id' ON CONFLICT(user_id,role,state_key) DO UPDATE SET evidence=excluded.evidence,priority=excluded.priority;
 INSERT INTO _eligible SELECT p.id,c.role,'',NULL,e,10 FROM _cfg c CROSS JOIN profiles p CROSS JOIN LATERAL profile_incentive_role_evidence(p.id,c.role,hub) e WHERE c.role IN ('supervisor','fom') ON CONFLICT(user_id,role,state_key) DO UPDATE SET evidence=excluded.evidence;
 INSERT INTO _eligible SELECT (x->>'user_id')::uuid,'support_team','',NULL,jsonb_build_object('source','explicit_selection','note',x->>'note','hub_id',hub),20 FROM jsonb_array_elements(p_exclusions) x WHERE incentive_role_key(x->>'role')='support_team' AND coalesce(x->>'action','include')='include' AND nullif(btrim(x->>'note'),'') IS NOT NULL AND EXISTS(SELECT 1 FROM profiles p WHERE p.id=(x->>'user_id')::uuid AND (incentive_scope_key(p.hub_id)=hub OR incentive_scope_key(p.secondary_hub_id)=hub OR incentive_scope_key(p.location->>'secondary_hub_id')=hub)) ON CONFLICT(user_id,role,state_key) DO NOTHING;
 INSERT INTO _eligible
 SELECT o.user_id,o.role,CASE WHEN o.role='coordinator' THEN resolved.state_id ELSE '' END,
   CASE WHEN o.role='coordinator' THEN resolved.state_id END,
   jsonb_build_object('source','admin_override','decision','include','note',o.note,'override_id',o.id,'hub_id',o.hub_id,'state_id',resolved.state_id),30
 FROM mmp_incentive_eligibility_overrides o
 CROSS JOIN LATERAL (SELECT CASE WHEN o.role='coordinator' THEN resolve_mmp_hub_state(hub,o.state_id) END state_id) resolved
 WHERE o.revoked_at IS NULL AND o.decision='include' AND incentive_scope_key(o.hub_id)=hub
   AND (o.role<>'coordinator' OR resolved.state_id IS NOT NULL)
   AND (o.role<>'coordinator' OR EXISTS(SELECT 1 FROM _coord_states s WHERE s.state_id=resolved.state_id))
   AND EXISTS(SELECT 1 FROM _cfg c WHERE c.role=o.role)
 ON CONFLICT(user_id,role,state_key) DO UPDATE SET evidence=excluded.evidence,priority=excluded.priority;
 DELETE FROM _eligible e USING mmp_incentive_eligibility_overrides o
 WHERE o.revoked_at IS NULL AND o.decision='exclude' AND incentive_scope_key(o.hub_id)=hub
   AND o.user_id=e.user_id AND o.role=e.role
   AND (o.role<>'coordinator' OR resolve_mmp_hub_state(hub,o.state_id)=e.state_id);
 DELETE FROM _eligible e USING jsonb_array_elements(p_exclusions) x WHERE e.user_id=(x->>'user_id')::uuid AND e.role=incentive_role_key(x->>'role') AND coalesce(x->>'action','exclude')='exclude' AND nullif(btrim(x->>'note'),'') IS NOT NULL;
 IF EXISTS(SELECT 1 FROM _coord_states s WHERE NOT EXISTS(SELECT 1 FROM _eligible e WHERE e.role='coordinator' AND e.state_id=s.state_id)) THEN
   RAISE EXCEPTION 'one or more qualifying MMP states lack an eligible coordinator';
 END IF;
 IF EXISTS(SELECT 1 FROM _cfg c WHERE c.role<>'support_team' AND NOT EXISTS(SELECT 1 FROM _eligible e WHERE e.role=c.role)) THEN RAISE EXCEPTION 'unresolved incentive identity for an active role'; END IF;
 IF EXISTS(SELECT 1 FROM _eligible GROUP BY user_id HAVING count(DISTINCT role)>1) THEN RAISE EXCEPTION 'ambiguous incentive roles for user(s): %',(SELECT string_agg(user_id::text||' ['||roles||']','; ') FROM (SELECT user_id,string_agg(role,',' ORDER BY role) roles FROM _eligible GROUP BY user_id HAVING count(DISTINCT role)>1) a); END IF;
 INSERT INTO mmp_incentive_snapshots(mmp_id,status,total_site_count,confirmed_site_count,total_dc_fee_pool_cents,total_bonus_cents,currency,config_snapshot,eligibility_snapshot,role_counts,coordinator_count,supervisor_count,pre_approved_by,pre_approved_at) VALUES(p_mmp_id,'calculating',total,confirmed,confirmed_pool,0,currency,(SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') FROM _cfg c),(SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'role',role,'state_id',state_id,'evidence',evidence)),'[]') FROM _eligible),'{}',0,0,actor,now()) ON CONFLICT(mmp_id) DO UPDATE SET status='calculating',total_site_count=excluded.total_site_count,confirmed_site_count=excluded.confirmed_site_count,total_dc_fee_pool_cents=excluded.total_dc_fee_pool_cents,total_bonus_cents=0,currency=excluded.currency,config_snapshot=excluded.config_snapshot,eligibility_snapshot=excluded.eligibility_snapshot,role_counts='{}',coordinator_count=0,supervisor_count=0,pre_approved_by=excluded.pre_approved_by,pre_approved_at=excluded.pre_approved_at RETURNING id INTO snap;
 DELETE FROM mmp_incentive_payments WHERE snapshot_id=snap AND status IN ('pending','failed');
 CREATE TEMP TABLE _allocation(user_id uuid,role text,state_id text,hub_id text,dc_count int,pool bigint,pct numeric,evidence jsonb,amount bigint) ON COMMIT DROP;
 INSERT INTO _allocation SELECT e.user_id,c.role,e.state_id,hub,CASE WHEN c.role='coordinator' AND c.split_method='proportional' THEN s.dc_count ELSE CASE WHEN c.what_counts='submitted' THEN total ELSE confirmed END END,CASE WHEN c.role='coordinator' AND c.split_method='proportional' THEN s.pool ELSE CASE WHEN c.what_counts='submitted' THEN submitted_pool ELSE confirmed_pool END END,c.bonus_pct,e.evidence,0 FROM _cfg c JOIN _eligible e ON e.role=c.role LEFT JOIN _coord_states s ON c.role='coordinator' AND c.split_method='proportional' AND s.state_id=e.state_id WHERE c.role<>'coordinator' OR c.split_method='equal' OR s.state_id IS NOT NULL;
 WITH q AS (SELECT *,count(*) OVER(PARTITION BY role,state_id,hub_id) n,row_number() OVER(PARTITION BY role,state_id,hub_id ORDER BY user_id) rn FROM _allocation) UPDATE _allocation a SET amount=floor(q.pool*q.pct/100/q.n)::bigint+CASE WHEN q.rn<=mod(floor(q.pool*q.pct/100)::bigint,q.n) THEN 1 ELSE 0 END FROM q WHERE a.user_id=q.user_id AND a.role=q.role AND a.state_id IS NOT DISTINCT FROM q.state_id;
 INSERT INTO mmp_incentive_payments(snapshot_id,mmp_id,user_id,role,state_id,hub_id,dc_count,dc_fee_pool_cents,bonus_pct,bonus_amount_cents,currency,status,eligibility_evidence) SELECT snap,p_mmp_id,user_id,role,state_id,hub_id,dc_count,pool,pct,amount,currency,'pending',evidence FROM _allocation;
 SELECT coalesce(sum(bonus_amount_cents),0) INTO bonus FROM mmp_incentive_payments WHERE snapshot_id=snap;
 UPDATE mmp_incentive_snapshots SET status='pre_approved',total_bonus_cents=bonus,role_counts=(SELECT coalesce(jsonb_object_agg(role,n),'{}') FROM (SELECT role,count(*) n FROM _allocation GROUP BY role) x),coordinator_count=(SELECT count(*) FROM _allocation WHERE role='coordinator'),supervisor_count=(SELECT count(*) FROM _allocation WHERE role='supervisor') WHERE id=snap;
 RETURN jsonb_build_object('ok',true,'snapshot_id',snap,'payments',(SELECT count(*) FROM _allocation),'total_bonus_cents',bonus,'currency',currency);
END $$;

REVOKE ALL ON FUNCTION public.set_mmp_incentive_eligibility_override(uuid,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_mmp_incentive_eligibility_override(uuid,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_mmp_incentive_eligibility_override(uuid,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_mmp_incentive_eligibility_override(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_mmp_incentive_eligibility_override(uuid,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_mmp_incentive_eligibility_override(uuid,text,text,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.revoke_mmp_incentive_eligibility_override(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_mmp_incentive_eligibility_override(uuid,text) TO authenticated;
COMMIT;