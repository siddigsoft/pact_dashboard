BEGIN;

-- MMP incentive eligibility is deliberately stored separately from a profile's
-- mutable job title.  This gives an administrator a reviewed exception path
-- without allowing a browser to supply recipients or amounts.
CREATE TABLE IF NOT EXISTS public.mmp_incentive_eligibility_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  hub_id text NOT NULL REFERENCES public.hubs(id) ON DELETE RESTRICT,
  state_id text,
  role text NOT NULL CHECK (role IN ('coordinator','supervisor','fom','support_team')),
  decision text NOT NULL CHECK (decision IN ('include','exclude')),
  note text NOT NULL CHECK (length(btrim(note)) > 0),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  revoke_note text,
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS mmp_incentive_eligibility_override_live_unique
  ON public.mmp_incentive_eligibility_overrides(user_id, hub_id, role, (coalesce(state_id,''))) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS mmp_incentive_eligibility_override_role_user
  ON public.mmp_incentive_eligibility_overrides(role, user_id) WHERE revoked_at IS NULL;

ALTER TABLE public.mmp_incentive_snapshots
  ADD COLUMN IF NOT EXISTS eligibility_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS role_counts jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.mmp_incentive_payments
  ADD COLUMN IF NOT EXISTS eligibility_evidence jsonb NOT NULL DEFAULT '{}'::jsonb;

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
    WHEN 'supportteam' THEN 'support_team'
    WHEN 'datacollector' THEN 'datacollector'
    WHEN 'datacollectionofficer' THEN 'datacollector'
    WHEN 'teamleader' THEN 'teamleader'
    ELSE regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '', 'g')
  END;
$$;

-- A role can be held by the canonical profile role, an assigned additional
-- role, or a currently-effective classification.  Multiple active sources
-- for different incentive roles are deliberately exposed to the calculator so
-- it can reject ambiguity instead of guessing.
CREATE OR REPLACE FUNCTION public.profile_incentive_role_evidence(
  p_user_id uuid, p_role text, p_hub_id text
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('source', source, 'classification', classification,
   'hub_id', assignment_hub_id, 'state_id', assignment_state_id,
   'scope', CASE WHEN p_role='coordinator' THEN 'state' ELSE 'hub' END)
 FROM (
   SELECT 'primary_role'::text source,p.role::text classification,
     p_hub_id assignment_hub_id,
     coalesce(p.state_id,p.location->>'state_id',p.location->>'state') assignment_state_id,1 priority
   FROM profiles p WHERE p.id=p_user_id AND incentive_role_key(p.role)=p_role
     AND (incentive_scope_key(p.hub_id)=incentive_scope_key(p_hub_id)
       OR incentive_scope_key(p.secondary_hub_id)=incentive_scope_key(p_hub_id)
       OR incentive_scope_key(p.location->>'secondary_hub_id')=incentive_scope_key(p_hub_id))
   UNION ALL
   SELECT CASE WHEN jsonb_typeof(r.value)='object' THEN 'additional_role_object' ELSE 'additional_role_scalar' END,
     CASE WHEN jsonb_typeof(r.value)='object' THEN r.value->>'role' ELSE r.value#>>'{}' END,
     CASE WHEN jsonb_typeof(r.value)='object' THEN r.value->>'hub_id' ELSE p_hub_id END,
     CASE WHEN jsonb_typeof(r.value)='object' THEN r.value->>'state_id' ELSE coalesce(p.state_id,p.location->>'state_id',p.location->>'state') END,
     CASE WHEN jsonb_typeof(r.value)='object' THEN 2 ELSE 3 END
   FROM profiles p CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.additional_roles)='array' THEN p.additional_roles ELSE '[]'::jsonb END) r
   WHERE p.id=p_user_id
     AND incentive_role_key(CASE WHEN jsonb_typeof(r.value)='object' THEN r.value->>'role' ELSE r.value#>>'{}' END)=p_role
     AND ((jsonb_typeof(r.value)='object' AND public.incentive_scope_key(r.value->>'hub_id')=public.incentive_scope_key(p_hub_id)
       AND (p_role<>'coordinator' OR (nullif(r.value->>'state_id','') IS NOT NULL AND EXISTS(
         SELECT 1 FROM hub_states hs WHERE incentive_scope_key(hs.hub_id)=incentive_scope_key(p_hub_id)
           AND incentive_scope_key(r.value->>'state_id') IN(incentive_scope_key(hs.state_id),incentive_scope_key(hs.state_name))))))
       OR (jsonb_typeof(r.value)<>'object' AND (incentive_scope_key(p.hub_id)=incentive_scope_key(p_hub_id)
         OR incentive_scope_key(p.secondary_hub_id)=incentive_scope_key(p_hub_id)
         OR incentive_scope_key(p.location->>'secondary_hub_id')=incentive_scope_key(p_hub_id))))
   UNION ALL
   SELECT 'active_classification',uc.role_scope::text,p_hub_id,coalesce(p.state_id,p.location->>'state_id',p.location->>'state'),4
   FROM user_classifications uc JOIN profiles p ON p.id=uc.user_id WHERE uc.user_id=p_user_id AND uc.is_active
     AND uc.effective_from<=now() AND (uc.effective_until IS NULL OR uc.effective_until>now())
     AND incentive_role_key(uc.role_scope::text)=p_role
     AND (incentive_scope_key(p.hub_id)=incentive_scope_key(p_hub_id)
       OR incentive_scope_key(p.secondary_hub_id)=incentive_scope_key(p_hub_id)
       OR incentive_scope_key(p.location->>'secondary_hub_id')=incentive_scope_key(p_hub_id))
 ) s
 ORDER BY priority, source, classification
 LIMIT 1
$$;

-- Admin-only, audited exceptions.  A missing row means automatic eligibility;
-- support_team is never automatic because there is no canonical profile role.
CREATE OR REPLACE FUNCTION public.set_mmp_incentive_eligibility_override(
  p_user_id uuid, p_hub_id text, p_role text, p_decision text, p_note text, p_state_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid:=auth.uid(); v_actor_role text; v_role text:=public.incentive_role_key(p_role);
BEGIN
  SELECT public.incentive_role_key(role) INTO v_actor_role FROM public.profiles WHERE id=v_actor;
  IF v_actor IS NULL OR v_actor_role NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'only administrators may change incentive eligibility' USING ERRCODE='42501';
  END IF;
  IF v_role NOT IN ('coordinator','supervisor','fom','support_team')
     OR p_decision NOT IN ('include','exclude') OR nullif(btrim(p_note),'') IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.hubs WHERE id::text=p_hub_id)
     OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=p_user_id
       AND (public.incentive_scope_key(p.hub_id)=public.incentive_scope_key(p_hub_id)
         OR public.incentive_scope_key(p.secondary_hub_id)=public.incentive_scope_key(p_hub_id)
          OR public.incentive_scope_key(p.location->>'secondary_hub_id')=public.incentive_scope_key(p_hub_id)))
     OR (v_role='coordinator' AND (nullif(btrim(p_state_id),'') IS NULL OR NOT EXISTS(
       SELECT 1 FROM public.hub_states hs WHERE public.incentive_scope_key(hs.hub_id)=public.incentive_scope_key(p_hub_id)
        AND public.incentive_scope_key(p_state_id) IN(public.incentive_scope_key(hs.state_id),public.incentive_scope_key(hs.state_name))))) THEN
    RAISE EXCEPTION 'invalid eligibility override';
  END IF;
  UPDATE public.mmp_incentive_eligibility_overrides
    SET revoked_at=now(), revoked_by=v_actor, revoke_note='superseded: '||btrim(p_note)
    WHERE user_id=p_user_id AND hub_id=p_hub_id AND role=v_role AND state_id IS NOT DISTINCT FROM nullif(btrim(p_state_id),'') AND revoked_at IS NULL;
  INSERT INTO public.mmp_incentive_eligibility_overrides(user_id,hub_id,state_id,role,decision,note,created_by)
    VALUES(p_user_id,p_hub_id,nullif(btrim(p_state_id),''),v_role,p_decision,btrim(p_note),v_actor);
  RETURN jsonb_build_object('ok',true);
END $$;

-- Compatibility endpoint: non-coordinator exceptions remain hub-scoped; a
-- coordinator must use the state-aware signature above.
CREATE OR REPLACE FUNCTION public.set_mmp_incentive_eligibility_override(
  p_user_id uuid, p_hub_id text, p_role text, p_decision text, p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF public.incentive_role_key(p_role)='coordinator' THEN
    RAISE EXCEPTION 'state_id is required for coordinator eligibility overrides';
  END IF;
  RETURN public.set_mmp_incentive_eligibility_override(p_user_id,p_hub_id,p_role,p_decision,p_note,NULL);
END $$;

-- The retired unscoped mutation endpoint must fail rather than accidentally
-- applying an exception to every MMP a person may later work on.
CREATE OR REPLACE FUNCTION public.set_mmp_incentive_eligibility_override(
  p_user_id uuid, p_role text, p_decision text, p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'hub_id is required for incentive eligibility overrides'; END $$;

ALTER TABLE public.mmp_incentive_eligibility_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS incentive_eligibility_override_read ON public.mmp_incentive_eligibility_overrides;
CREATE POLICY incentive_eligibility_override_read ON public.mmp_incentive_eligibility_overrides
  FOR SELECT USING (public.incentive_is_finance_or_admin());
DROP POLICY IF EXISTS incentive_eligibility_override_admin_write ON public.mmp_incentive_eligibility_overrides;
CREATE POLICY incentive_eligibility_override_admin_write ON public.mmp_incentive_eligibility_overrides
  FOR ALL USING (public.incentive_is_admin()) WITH CHECK (public.incentive_is_admin());

-- The settings RPC continues to own the complete set.  FOM and Support Team
-- are now first-class configurable roles; obsolete roles cannot be activated.
CREATE OR REPLACE FUNCTION public.save_incentive_settings(p_settings jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid:=auth.uid(); v_actor_role text; r jsonb; v_role text; v_duplicate boolean;
BEGIN
 SELECT public.incentive_role_key(role) INTO v_actor_role FROM public.profiles WHERE id=v_actor;
 IF v_actor IS NULL OR v_actor_role NOT IN ('admin','superadmin') THEN RAISE EXCEPTION 'only administrators may save incentive settings' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_settings)<>'array' THEN RAISE EXCEPTION 'settings must be an array'; END IF;
 SELECT count(*)<>count(DISTINCT coalesce(value->>'hub_id','<global>')||'|'||public.incentive_role_key(value->>'role'))
 INTO v_duplicate FROM jsonb_array_elements(p_settings);
 IF v_duplicate THEN RAISE EXCEPTION 'settings contains duplicate hub/role keys'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_settings) LOOP
   v_role:=public.incentive_role_key(r->>'role');
   IF v_role NOT IN ('coordinator','supervisor','fom','support_team')
      OR coalesce((r->>'bonus_pct')::numeric,-1) NOT BETWEEN 0 AND 100
      OR coalesce((r->>'coverage_threshold_pct')::numeric,-1) NOT BETWEEN 0 AND 100
      OR coalesce(r->>'split_method','') NOT IN ('equal','proportional')
      OR coalesce(r->>'what_counts','') NOT IN ('wfp_confirmed','submitted') THEN RAISE EXCEPTION 'invalid incentive setting'; END IF;
   INSERT INTO public.incentive_configs(hub_id,role,is_active,bonus_pct,split_method,coverage_threshold_pct,what_counts,created_by)
   VALUES(nullif(r->>'hub_id',''),v_role,coalesce((r->>'is_active')::boolean,false),(r->>'bonus_pct')::numeric,r->>'split_method',(r->>'coverage_threshold_pct')::numeric,r->>'what_counts',v_actor)
   ON CONFLICT (hub_id,role) DO UPDATE SET is_active=excluded.is_active,bonus_pct=excluded.bonus_pct,split_method=excluded.split_method,coverage_threshold_pct=excluded.coverage_threshold_pct,what_counts=excluded.what_counts,updated_at=now();
 END LOOP;
 DELETE FROM public.incentive_configs c WHERE c.role IN ('coordinator','supervisor','fom','support_team')
   AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_settings) s WHERE c.hub_id IS NOT DISTINCT FROM nullif(s->>'hub_id','') AND c.role=public.incentive_role_key(s->>'role'));
 RETURN jsonb_build_object('ok',true);
END $$;

-- Preserve the existing two-argument RPC contract.  p_exclusions accepts the
-- old {user_id,role,note} exclusion shape plus {action:'include'|'exclude'}.
-- Automatic identity comes only from profiles; unresolved automatic scopes
-- abort before any pending payment is replaced.
CREATE OR REPLACE FUNCTION public.calculate_and_preapprove_mmp_incentives(p_mmp_id uuid, p_exclusions jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid:=auth.uid(); v_actor_role text; v_snap uuid; v_status text; v_mmp jsonb; v_hub text; v_currency text;
  v_total int; v_confirmed int; v_confirmed_pool bigint; v_submitted_pool bigint; r record; x jsonb; v_total_bonus bigint;
BEGIN
 SELECT public.incentive_role_key(role) INTO v_actor_role FROM public.profiles WHERE id=v_actor;
 IF v_actor IS NULL OR v_actor_role NOT IN ('admin','superadmin','financialadmin') THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_exclusions)<>'array' THEN RAISE EXCEPTION 'eligibility decisions must be an array'; END IF;
 SELECT to_jsonb(f),public.incentive_scope_key(coalesce(f.hub_id::text,h.id::text,h.name)),coalesce(to_jsonb(f)->>'currency','SDG')
 INTO v_mmp,v_hub,v_currency FROM public.mmp_files f LEFT JOIN public.hubs h ON h.id=f.hub_id WHERE f.id=p_mmp_id FOR UPDATE;
 IF NOT FOUND OR v_hub='' THEN RAISE EXCEPTION 'MMP or MMP hub is unresolved'; END IF;
 IF lower(coalesce(v_mmp->>'cycle_status','')) IN ('closed','historical','archived')
    OR nullif(coalesce(v_mmp->>'cycle_closed_at',v_mmp->>'archivedat'),'') IS NOT NULL THEN
   RAISE EXCEPTION 'closed or historical MMP incentives cannot be activated';
 END IF;
 IF coalesce(nullif(v_mmp->>'uploaded_at','')::timestamptz,nullif(v_mmp->>'created_at','')::timestamptz) IS NULL
    OR coalesce(nullif(v_mmp->>'uploaded_at','')::timestamptz,nullif(v_mmp->>'created_at','')::timestamptz) < timestamptz '2026-08-01 00:00:00+00' THEN
   RAISE EXCEPTION 'MMP predates the 2026-08-01 incentive activation cutoff';
 END IF;
 SELECT status INTO v_status FROM public.mmp_incentive_snapshots WHERE mmp_id=p_mmp_id FOR UPDATE;
 IF v_status IN ('approved','paid','reversed') OR EXISTS(SELECT 1 FROM public.mmp_incentive_payments WHERE mmp_id=p_mmp_id AND status IN ('paid','reversed')) THEN RAISE EXCEPTION 'locked incentive snapshot cannot be recalculated'; END IF;
 SELECT count(*),count(*) FILTER(WHERE verified_by IS NOT NULL),coalesce(sum(round(coalesce(enumerator_fee,0)*100)::bigint) FILTER(WHERE verified_by IS NOT NULL),0),coalesce(sum(round(coalesce(enumerator_fee,0)*100)::bigint),0)
 INTO v_total,v_confirmed,v_confirmed_pool,v_submitted_pool FROM public.mmp_site_entries WHERE mmp_file_id=p_mmp_id;
 IF v_total=0 THEN RAISE EXCEPTION 'MMP has no site entries'; END IF;
 CREATE TEMP TABLE _cfg ON COMMIT DROP AS
 SELECT * FROM (SELECT DISTINCT ON(role) * FROM public.incentive_configs
   WHERE role IN ('coordinator','supervisor','fom','support_team')
     AND (hub_id IS NULL OR public.incentive_scope_key(hub_id)=v_hub)
   ORDER BY role,(hub_id IS NOT NULL) DESC) chosen WHERE is_active;
 FOR r IN SELECT * FROM _cfg LOOP
   IF r.what_counts='wfp_confirmed' AND v_confirmed::numeric*100/v_total<r.coverage_threshold_pct THEN RAISE EXCEPTION 'reliable WFP evidence coverage is below threshold for %',r.role; END IF;
 END LOOP;
 CREATE TEMP TABLE _eligible(user_id uuid,role text,state_id text,evidence jsonb,PRIMARY KEY(user_id,role,state_id)) ON COMMIT DROP;
 -- coordinator is state-scoped; rejecting unmapped states avoids a silent
 -- assignment.  The other canonical roles are hub-scoped.
 IF EXISTS(SELECT 1 FROM _cfg WHERE role='coordinator') AND EXISTS(SELECT 1 FROM public.mmp_site_entries e LEFT JOIN public.hub_states hs ON public.incentive_scope_key(hs.hub_id)=v_hub AND public.incentive_scope_key(e.state) IN(public.incentive_scope_key(hs.state_id),public.incentive_scope_key(hs.state_name)) WHERE e.mmp_file_id=p_mmp_id AND (public.incentive_scope_key(e.state)='' OR hs.state_id IS NULL)) THEN RAISE EXCEPTION 'qualifying MMP state is blank or is not mapped to the MMP hub'; END IF;
 CREATE TEMP TABLE _coord_states ON COMMIT DROP AS
 SELECT public.incentive_scope_key(hs.state_id) state_id,max(hs.state_name) state_name,
   count(*)::int dc_count,coalesce(sum(round(coalesce(se.enumerator_fee,0)*100)::bigint),0) pool
 FROM _cfg c JOIN public.mmp_site_entries se ON se.mmp_file_id=p_mmp_id
 JOIN public.hub_states hs ON public.incentive_scope_key(hs.hub_id)=v_hub
   AND public.incentive_scope_key(se.state) IN(public.incentive_scope_key(hs.state_id),public.incentive_scope_key(hs.state_name))
 WHERE c.role='coordinator' AND c.split_method='proportional'
   AND (c.what_counts='submitted' OR se.verified_by IS NOT NULL)
 GROUP BY public.incentive_scope_key(hs.state_id);
 IF EXISTS(SELECT 1 FROM _cfg WHERE role='coordinator' AND split_method='proportional')
    AND EXISTS(SELECT 1 FROM _coord_states s WHERE NOT EXISTS(
      SELECT 1 FROM public.profiles p CROSS JOIN LATERAL public.profile_incentive_role_evidence(p.id,'coordinator',v_hub) e
      WHERE public.incentive_scope_key(e->>'state_id') IN(s.state_id,public.incentive_scope_key(s.state_name)))) THEN
   RAISE EXCEPTION 'one or more qualifying MMP states lack an eligible coordinator';
 END IF;
 INSERT INTO _eligible SELECT p.id,'coordinator',s.state_id,e FROM _coord_states s
   JOIN public.profiles p ON true CROSS JOIN LATERAL public.profile_incentive_role_evidence(p.id,'coordinator',v_hub) e
   WHERE public.incentive_scope_key(e->>'state_id') IN(s.state_id,public.incentive_scope_key(s.state_name));
 INSERT INTO _eligible SELECT p.id,'coordinator',NULL,e FROM _cfg c JOIN public.profiles p ON true
   CROSS JOIN LATERAL public.profile_incentive_role_evidence(p.id,'coordinator',v_hub) e
   WHERE c.role='coordinator' AND c.split_method='equal';
 INSERT INTO _eligible SELECT p.id,c.role,NULL,e FROM _cfg c JOIN public.profiles p ON true CROSS JOIN LATERAL public.profile_incentive_role_evidence(p.id,c.role,v_hub) e WHERE c.role IN ('supervisor','fom');
 -- Support Team must be deliberately selected for this calculation.
 INSERT INTO _eligible SELECT (x->>'user_id')::uuid,'support_team',NULL,jsonb_build_object('source','explicit_selection','note',x->>'note','hub_id',v_hub) FROM jsonb_array_elements(p_exclusions) x WHERE public.incentive_role_key(x->>'role')='support_team' AND coalesce(x->>'action','include')='include' AND nullif(btrim(x->>'note'),'') IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=(x->>'user_id')::uuid AND (public.incentive_scope_key(p.hub_id)=v_hub OR public.incentive_scope_key(p.secondary_hub_id)=v_hub OR public.incentive_scope_key(p.location->>'secondary_hub_id')=v_hub));
 INSERT INTO _eligible SELECT o.user_id,o.role,
   CASE WHEN o.role='coordinator' AND EXISTS(SELECT 1 FROM _cfg c WHERE c.role='coordinator' AND c.split_method='proportional') THEN public.incentive_scope_key(o.state_id) ELSE NULL END,
   jsonb_build_object('source','admin_override','decision','include','note',o.note,'override_id',o.id,'hub_id',o.hub_id,'state_id',o.state_id)
 FROM public.mmp_incentive_eligibility_overrides o WHERE o.revoked_at IS NULL AND o.decision='include'
   AND public.incentive_scope_key(o.hub_id)=v_hub AND EXISTS(SELECT 1 FROM _cfg c WHERE c.role=o.role);
 DELETE FROM _eligible e USING public.mmp_incentive_eligibility_overrides o WHERE o.user_id=e.user_id AND o.role=e.role AND public.incentive_scope_key(o.hub_id)=v_hub AND o.revoked_at IS NULL AND o.decision='exclude' AND (o.role<>'coordinator' OR e.state_id IS NULL OR e.state_id=public.incentive_scope_key(o.state_id));
 DELETE FROM _eligible e USING jsonb_array_elements(p_exclusions) x WHERE e.user_id=(x->>'user_id')::uuid AND e.role=public.incentive_role_key(x->>'role') AND coalesce(x->>'action','exclude')='exclude' AND nullif(btrim(x->>'note'),'') IS NOT NULL;
 IF EXISTS(SELECT 1 FROM _cfg c WHERE c.role<>'support_team' AND NOT EXISTS(SELECT 1 FROM _eligible e WHERE e.role=c.role)) THEN RAISE EXCEPTION 'unresolved incentive identity for an active role'; END IF;
 INSERT INTO public.mmp_incentive_snapshots(mmp_id,status,total_site_count,confirmed_site_count,total_dc_fee_pool_cents,total_bonus_cents,currency,config_snapshot,eligibility_snapshot,role_counts,coordinator_count,supervisor_count,pre_approved_by,pre_approved_at)
 VALUES(p_mmp_id,'calculating',v_total,v_confirmed,v_confirmed_pool,0,v_currency,(SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') FROM _cfg c),(SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'role',role,'state_id',state_id,'evidence',evidence)),'[]') FROM _eligible),'{}',0,0,v_actor,now())
 ON CONFLICT(mmp_id) DO UPDATE SET status='calculating',total_site_count=excluded.total_site_count,confirmed_site_count=excluded.confirmed_site_count,total_dc_fee_pool_cents=excluded.total_dc_fee_pool_cents,total_bonus_cents=0,currency=excluded.currency,config_snapshot=excluded.config_snapshot,eligibility_snapshot=excluded.eligibility_snapshot,role_counts=excluded.role_counts,coordinator_count=excluded.coordinator_count,supervisor_count=excluded.supervisor_count,pre_approved_by=excluded.pre_approved_by,pre_approved_at=excluded.pre_approved_at RETURNING id INTO v_snap;
 DELETE FROM public.mmp_incentive_payments WHERE snapshot_id=v_snap AND status IN ('pending','failed');
 CREATE TEMP TABLE _allocation(user_id uuid,role text,state_id text,hub_id text,dc_count int,pool bigint,pct numeric,evidence jsonb,amount bigint) ON COMMIT DROP;
 INSERT INTO _allocation(user_id,role,state_id,hub_id,dc_count,pool,pct,evidence,amount)
 SELECT e.user_id,c.role,e.state_id,v_hub,
   CASE WHEN c.role='coordinator' AND c.split_method='proportional' THEN s.dc_count ELSE CASE WHEN c.what_counts='submitted' THEN v_total ELSE v_confirmed END END,
   CASE WHEN c.role='coordinator' AND c.split_method='proportional' THEN s.pool ELSE CASE WHEN c.what_counts='submitted' THEN v_submitted_pool ELSE v_confirmed_pool END END,
   c.bonus_pct,e.evidence,0
 FROM _cfg c JOIN _eligible e ON e.role=c.role
 LEFT JOIN _coord_states s ON c.role='coordinator' AND c.split_method='proportional' AND e.state_id=s.state_id
 WHERE c.role<>'coordinator' OR c.split_method='equal' OR s.state_id IS NOT NULL;
 WITH q AS (SELECT *,count(*) OVER(PARTITION BY role,state_id,hub_id) n,row_number() OVER(PARTITION BY role,state_id,hub_id ORDER BY user_id) rn FROM _allocation)
 UPDATE _allocation a SET amount=floor(q.pool*q.pct/100/q.n)::bigint + CASE WHEN q.rn<=mod(floor(q.pool*q.pct/100)::bigint,q.n) THEN 1 ELSE 0 END FROM q WHERE a.user_id=q.user_id AND a.role=q.role AND a.state_id IS NOT DISTINCT FROM q.state_id;
 INSERT INTO public.mmp_incentive_payments(snapshot_id,mmp_id,user_id,role,state_id,hub_id,dc_count,dc_fee_pool_cents,bonus_pct,bonus_amount_cents,currency,status,eligibility_evidence)
 SELECT v_snap,p_mmp_id,user_id,role,state_id,hub_id,dc_count,pool,pct,amount,v_currency,'pending',evidence FROM _allocation;
 SELECT coalesce(sum(bonus_amount_cents),0) INTO v_total_bonus FROM public.mmp_incentive_payments WHERE snapshot_id=v_snap;
 UPDATE public.mmp_incentive_snapshots SET status='pre_approved',total_bonus_cents=v_total_bonus,
   role_counts=(SELECT coalesce(jsonb_object_agg(role,n),'{}') FROM (SELECT role,count(*) n FROM _allocation GROUP BY role) q),
   coordinator_count=(SELECT count(*) FROM _allocation WHERE role='coordinator'),
   supervisor_count=(SELECT count(*) FROM _allocation WHERE role='supervisor')
 WHERE id=v_snap;
 RETURN jsonb_build_object('ok',true,'snapshot_id',v_snap,'payments',(SELECT count(*) FROM public.mmp_incentive_payments WHERE snapshot_id=v_snap),'total_bonus_cents',v_total_bonus,'currency',v_currency);
END $$;

REVOKE ALL ON FUNCTION public.set_mmp_incentive_eligibility_override(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_mmp_incentive_eligibility_override(uuid,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.set_mmp_incentive_eligibility_override(uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_mmp_incentive_eligibility_override(uuid,text,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.set_mmp_incentive_eligibility_override(uuid,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_mmp_incentive_eligibility_override(uuid,text,text,text,text,text) TO authenticated;
COMMIT;