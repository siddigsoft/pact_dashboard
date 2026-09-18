-- Harden the claimed-site feed.  Keep status normalization in one place so
-- this feed and its counts cannot drift from the UI's normalizeStatus rules.
DROP FUNCTION IF EXISTS public.superadmin_claimed_sites_query(text,text,text,text,text,uuid,uuid,boolean,integer,integer);
DROP FUNCTION IF EXISTS public.superadmin_claimed_sites_filter_options(text,text,text,text,uuid);
CREATE OR REPLACE FUNCTION public.superadmin_claimed_status_key(v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(regexp_replace(coalesce(v,''), '\s+', '_', 'g'))
    WHEN 'inprogress' THEN 'ongoing' WHEN 'in_progress' THEN 'ongoing'
    WHEN 'ongoing' THEN 'ongoing' WHEN 'approved_and_costed' THEN 'costed'
    WHEN 'declined' THEN 'rejected'
    ELSE nullif(lower(regexp_replace(coalesce(v,''), '\s+', '_', 'g')),'') END
$$;
CREATE OR REPLACE FUNCTION public.superadmin_is_claimed_status(v text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT public.superadmin_claimed_status_key(v) IN
    ('accepted','assigned','ongoing','completed','submitted','wfp_confirmed',
     'not_covered','verified','rejected','costed','returned_to_fom',
     'recalled','forwarded_to_coordinator')
$$;

-- Escapes user text before LIKE so %, _, and backslash remain literals.
-- Both the feed and every option dimension use this same predicate.
-- A literal '%', '_' or '\' therefore matches those characters; claimant UUID
-- searches use the same path, and changing claimant_key only removes that
-- dimension from the claimant option CTE (not from the other option lists).
CREATE OR REPLACE FUNCTION public.superadmin_claimed_search_match(haystack text, needle text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(btrim(needle),'') IS NULL OR lower(coalesce(haystack,'')) LIKE
    '%' || replace(replace(replace(lower(btrim(needle)),'\','\\'),'%','\%'),'_','\_') || '%' ESCAPE '\'
$$;

CREATE INDEX IF NOT EXISTS mmp_site_entries_claimed_created_idx
  ON public.mmp_site_entries (created_at DESC, id DESC)
  WHERE public.superadmin_is_claimed_status(status);
CREATE INDEX IF NOT EXISTS mmp_site_entries_claimed_activity_idx
  ON public.mmp_site_entries ((coalesce(main_activity, activity_at_site)))
  WHERE public.superadmin_is_claimed_status(status);

CREATE OR REPLACE FUNCTION public.superadmin_can_access_data_management()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT auth.uid() IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM page_access_overrides o
      WHERE o.page_slug='data-management' AND o.user_id=auth.uid() AND o.is_blocked=true
        AND (o.expires_at IS NULL OR o.expires_at > now()))
    AND (
      EXISTS (SELECT 1 FROM page_access_overrides o WHERE o.page_slug='data-management'
        AND o.user_id=auth.uid() AND o.is_blocked=false
        AND (o.expires_at IS NULL OR o.expires_at > now()))
      OR EXISTS (SELECT 1 FROM profiles u WHERE u.id=auth.uid()
        AND lower(coalesce(u.role,'')) IN ('superadmin','super_admin','admin','ict'))
      OR EXISTS (SELECT 1 FROM page_role_configs c JOIN profiles u ON u.id=auth.uid()
        WHERE c.page_slug='data-management'
          AND lower(coalesce(u.role,''))=ANY(SELECT lower(x) FROM unnest(c.roles) x))
    )
$$;

CREATE OR REPLACE FUNCTION public.superadmin_claimed_sites_query(
  p_global_search text DEFAULT NULL, p_site_search text DEFAULT NULL,
  p_status text DEFAULT NULL, p_state text DEFAULT NULL,
  p_locality text DEFAULT NULL, p_activity text DEFAULT NULL,
  p_mmp_file_id uuid DEFAULT NULL, p_claimant_key text DEFAULT NULL,
  p_no_transport boolean DEFAULT false, p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE lim integer:=least(greatest(coalesce(p_limit,200),1),200);
        off integer:=greatest(coalesce(p_offset,0),0);
        rows jsonb; filtered bigint; total bigint;
BEGIN
  IF NOT public.superadmin_can_access_data_management() THEN RAISE EXCEPTION 'User is not authorized to query data management.'; END IF;

  WITH base AS (
    SELECT e.id,e.site_name,e.site_code,e.state,e.locality,e.status,e.accepted_by,
      e.claimed_by,e.accepted_at,e.dispatched_at,e.enumerator_fee,e.transport_fee,
      e.created_at,coalesce(e.main_activity,e.activity_at_site) main_activity,
      e.mmp_file_id,e.hub_office,
      coalesce(c.effective_claimant_id::text,nullif(e.accepted_by,''),nullif(e.claimed_by,''),
        e.additional_data->>'claimed_by',e.additional_data->>'assigned_to') claimant_key,
      coalesce(nullif(p.full_name,''),nullif(p.username,''),nullif(p.email,''),
        c.effective_claimant_id::text,e.accepted_by,e.claimed_by,
        e.additional_data->>'claimed_by',e.additional_data->>'assigned_to') effective_claimant_name,
      coalesce(m.name,m.project_name,m.mmp_id) mmp_name
    FROM mmp_site_entries e
    LEFT JOIN site_effective_claimants c ON c.site_entry_id=e.id
    LEFT JOIN profiles p ON p.id::text=coalesce(c.effective_claimant_id::text,nullif(e.accepted_by,''),nullif(e.claimed_by,''),
      e.additional_data->>'claimed_by',e.additional_data->>'assigned_to')
    LEFT JOIN mmp_files m ON m.id=e.mmp_file_id
    WHERE public.superadmin_is_claimed_status(e.status)
  ), filtered AS (
    SELECT * FROM base b WHERE
      public.superadmin_claimed_search_match(b.site_name||' '||b.site_code,p_site_search)
      AND public.superadmin_claimed_search_match(concat_ws(' ',b.site_name,b.site_code,b.effective_claimant_name,b.claimant_key,b.state,b.locality,b.mmp_name),p_global_search)
      AND (nullif(btrim(p_status),'') IS NULL OR public.superadmin_claimed_status_key(b.status)=public.superadmin_claimed_status_key(p_status))
      AND (nullif(btrim(p_state),'') IS NULL OR b.state=p_state)
      AND (nullif(btrim(p_locality),'') IS NULL OR b.locality=p_locality)
      AND (nullif(btrim(p_activity),'') IS NULL OR b.main_activity=p_activity)
      AND (p_mmp_file_id IS NULL OR b.mmp_file_id=p_mmp_file_id)
      AND (nullif(btrim(p_claimant_key),'') IS NULL OR b.claimant_key=p_claimant_key)
      AND (not coalesce(p_no_transport,false) OR b.transport_fee IS NULL OR b.transport_fee=0)
  ), counted AS (SELECT count(*) n FROM filtered),
  page AS (SELECT f.* FROM filtered f ORDER BY f.created_at DESC NULLS LAST,f.id DESC LIMIT lim OFFSET off)
  SELECT coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY page.created_at DESC NULLS LAST,page.id DESC) FROM page),'[]'::jsonb),
         (SELECT n FROM counted) INTO rows,filtered;
  SELECT count(*) INTO total FROM mmp_site_entries e WHERE public.superadmin_is_claimed_status(e.status);
  RETURN jsonb_build_object('rows',rows,'filtered_count',filtered,'total_count',total,'offset',off,'next_offset',off+jsonb_array_length(rows),'limit',lim,
    'has_more',off+jsonb_array_length(rows)<filtered);
END $$;

CREATE OR REPLACE FUNCTION public.superadmin_claimed_sites_filter_options(
  p_global_search text DEFAULT NULL,p_site_search text DEFAULT NULL,p_status text DEFAULT NULL,
  p_state text DEFAULT NULL,p_locality text DEFAULT NULL,p_activity text DEFAULT NULL,
  p_mmp_file_id uuid DEFAULT NULL,p_claimant_key text DEFAULT NULL,
  p_no_transport boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT public.superadmin_can_access_data_management() THEN RAISE EXCEPTION 'User is not authorized to query data management.'; END IF;
  RETURN (WITH base AS (
    SELECT e.state,e.locality,coalesce(e.main_activity,e.activity_at_site) activity,
      public.superadmin_claimed_status_key(e.status) status_key,e.mmp_file_id,
      coalesce(c.effective_claimant_id::text,nullif(e.accepted_by,''),nullif(e.claimed_by,''),
        e.additional_data->>'claimed_by',e.additional_data->>'assigned_to') claimant_key,
      coalesce(e.site_name,'') site_name,coalesce(e.site_code,'') site_code,
      coalesce(nullif(p.full_name,''),nullif(p.username,''),nullif(p.email,''),
        c.effective_claimant_id::text,e.accepted_by,e.claimed_by,e.additional_data->>'claimed_by',e.additional_data->>'assigned_to') claimant_name,
      coalesce(m.name,m.project_name,m.mmp_id) mmp_name,e.transport_fee
    FROM mmp_site_entries e LEFT JOIN site_effective_claimants c ON c.site_entry_id=e.id
      LEFT JOIN profiles p ON p.id::text=coalesce(c.effective_claimant_id::text,nullif(e.accepted_by,''),nullif(e.claimed_by,''),e.additional_data->>'claimed_by',e.additional_data->>'assigned_to')
      LEFT JOIN mmp_files m ON m.id=e.mmp_file_id
    WHERE public.superadmin_is_claimed_status(e.status)
  ), searched AS (
    SELECT * FROM base b WHERE
      public.superadmin_claimed_search_match(b.site_name||' '||b.site_code,p_site_search)
      AND public.superadmin_claimed_search_match(concat_ws(' ',b.site_name,b.site_code,b.claimant_name,b.claimant_key,b.state,b.locality,b.mmp_name),p_global_search)
  ), states AS (
    SELECT DISTINCT state FROM searched b WHERE state IS NOT NULL AND
      (nullif(btrim(p_status),'') IS NULL OR b.status_key=public.superadmin_claimed_status_key(p_status)) AND
      (nullif(btrim(p_locality),'') IS NULL OR b.locality=p_locality) AND (nullif(btrim(p_activity),'') IS NULL OR b.activity=p_activity) AND
      (p_mmp_file_id IS NULL OR b.mmp_file_id=p_mmp_file_id) AND (nullif(btrim(p_claimant_key),'') IS NULL OR b.claimant_key=p_claimant_key) AND
      (NOT coalesce(p_no_transport,false) OR b.transport_fee IS NULL OR b.transport_fee=0)
  ), localities AS (
    SELECT DISTINCT locality FROM searched b WHERE locality IS NOT NULL AND
      (nullif(btrim(p_status),'') IS NULL OR b.status_key=public.superadmin_claimed_status_key(p_status)) AND (nullif(btrim(p_state),'') IS NULL OR b.state=p_state) AND
      (nullif(btrim(p_activity),'') IS NULL OR b.activity=p_activity) AND (p_mmp_file_id IS NULL OR b.mmp_file_id=p_mmp_file_id) AND
      (nullif(btrim(p_claimant_key),'') IS NULL OR b.claimant_key=p_claimant_key) AND (NOT coalesce(p_no_transport,false) OR b.transport_fee IS NULL OR b.transport_fee=0)
  ), activities AS (
    SELECT DISTINCT activity FROM searched b WHERE activity IS NOT NULL AND
      (nullif(btrim(p_status),'') IS NULL OR b.status_key=public.superadmin_claimed_status_key(p_status)) AND (nullif(btrim(p_state),'') IS NULL OR b.state=p_state) AND
      (nullif(btrim(p_locality),'') IS NULL OR b.locality=p_locality) AND (p_mmp_file_id IS NULL OR b.mmp_file_id=p_mmp_file_id) AND
      (nullif(btrim(p_claimant_key),'') IS NULL OR b.claimant_key=p_claimant_key) AND (NOT coalesce(p_no_transport,false) OR b.transport_fee IS NULL OR b.transport_fee=0)
  ), statuses AS (
    SELECT DISTINCT status_key FROM searched b WHERE status_key IS NOT NULL AND (nullif(btrim(p_state),'') IS NULL OR b.state=p_state) AND (nullif(btrim(p_locality),'') IS NULL OR b.locality=p_locality) AND
      (nullif(btrim(p_activity),'') IS NULL OR b.activity=p_activity) AND (p_mmp_file_id IS NULL OR b.mmp_file_id=p_mmp_file_id) AND
      (nullif(btrim(p_claimant_key),'') IS NULL OR b.claimant_key=p_claimant_key) AND (NOT coalesce(p_no_transport,false) OR b.transport_fee IS NULL OR b.transport_fee=0)
  ), mmps AS (
    SELECT DISTINCT mmp_file_id,mmp_name FROM searched b WHERE mmp_file_id IS NOT NULL AND (nullif(btrim(p_status),'') IS NULL OR b.status_key=public.superadmin_claimed_status_key(p_status)) AND
      (nullif(btrim(p_state),'') IS NULL OR b.state=p_state) AND (nullif(btrim(p_locality),'') IS NULL OR b.locality=p_locality) AND (nullif(btrim(p_activity),'') IS NULL OR b.activity=p_activity) AND
      (nullif(btrim(p_claimant_key),'') IS NULL OR b.claimant_key=p_claimant_key) AND (NOT coalesce(p_no_transport,false) OR b.transport_fee IS NULL OR b.transport_fee=0)
  ), claimants AS (
    SELECT DISTINCT claimant_key,claimant_name FROM searched b WHERE claimant_key IS NOT NULL AND (nullif(btrim(p_status),'') IS NULL OR b.status_key=public.superadmin_claimed_status_key(p_status)) AND
      (nullif(btrim(p_state),'') IS NULL OR b.state=p_state) AND (nullif(btrim(p_locality),'') IS NULL OR b.locality=p_locality) AND (nullif(btrim(p_activity),'') IS NULL OR b.activity=p_activity) AND
      (p_mmp_file_id IS NULL OR b.mmp_file_id=p_mmp_file_id) AND (NOT coalesce(p_no_transport,false) OR b.transport_fee IS NULL OR b.transport_fee=0)
  )
  SELECT jsonb_build_object(
    'states',(SELECT coalesce(jsonb_agg(state ORDER BY state),'[]') FROM states),
    'localities',(SELECT coalesce(jsonb_agg(locality ORDER BY locality),'[]') FROM localities),
    'activities',(SELECT coalesce(jsonb_agg(activity ORDER BY activity),'[]') FROM activities),
    'statuses',(SELECT coalesce(jsonb_agg(status_key ORDER BY status_key),'[]') FROM statuses),
    'mmps',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',mmp_file_id,'name',mmp_name) ORDER BY mmp_name),'[]') FROM mmps),
    'claimants',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',claimant_key,'name',claimant_name) ORDER BY claimant_name),'[]') FROM claimants)
  ) FROM (SELECT 1) one);
END $$;

REVOKE ALL ON FUNCTION public.superadmin_claimed_sites_query(text,text,text,text,text,text,uuid,text,boolean,integer,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.superadmin_claimed_sites_filter_options(text,text,text,text,text,text,uuid,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_claimed_sites_query(text,text,text,text,text,text,uuid,text,boolean,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_claimed_sites_filter_options(text,text,text,text,text,text,uuid,text,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_can_access_data_management() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_can_access_data_management() TO authenticated;