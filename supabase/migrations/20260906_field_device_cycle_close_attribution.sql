-- Field-device ownership and durable WFP/Cycle Close attribution.
-- WFP evidence is deliberately append-only: resolution never replaces raw values.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE OR REPLACE FUNCTION public.normalize_odk_source_key(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT NULLIF(regexp_replace(lower(trim(coalesce(p_value, ''))), '[^a-z0-9]+', '', 'g'), '');
$$;

CREATE OR REPLACE FUNCTION public.is_field_attribution_manager(p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_uid AND (
      regexp_replace(lower(coalesce(p.role, '')), '[^a-z0-9]+', '', 'g') IN
        ('superadmin','superadministrator','admin','fom','fieldoperationmanager',
         'fieldoperationmanagerfom','fieldoperationsmanager','countrydirector','director','ict',
         'informationcommunicationtechnology')
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p.additional_roles) = 'array'
          THEN p.additional_roles ELSE '[]'::jsonb END) r
        WHERE regexp_replace(lower(coalesce(r->>'role', '')), '[^a-z0-9]+', '', 'g') IN
          ('superadmin','superadministrator','admin','fom','fieldoperationmanager',
           'fieldoperationmanagerfom','fieldoperationsmanager','countrydirector','director','ict',
           'informationcommunicationtechnology')
      )
    )
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_uid
      AND regexp_replace(lower(coalesce(ur.role::text, '')), '[^a-z0-9]+', '', 'g') IN
        ('superadmin','superadministrator','admin','fom','fieldoperationmanager',
         'fieldoperationmanagerfom','fieldoperationsmanager','countrydirector','director','ict',
         'informationcommunicationtechnology')
  );
$$;

CREATE TABLE IF NOT EXISTS public.field_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  odk_source_key text NOT NULL,
  odk_source_key_normalized text NOT NULL,
  display_name text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT field_devices_normalized_key_unique UNIQUE (odk_source_key_normalized),
  CONSTRAINT field_devices_normalized_key_check
    CHECK (odk_source_key_normalized = public.normalize_odk_source_key(odk_source_key))
);

CREATE OR REPLACE FUNCTION public.normalize_field_device_key()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.odk_source_key := nullif(trim(NEW.odk_source_key), '');
  NEW.odk_source_key_normalized := public.normalize_odk_source_key(NEW.odk_source_key);
  IF NEW.odk_source_key_normalized IS NULL THEN RAISE EXCEPTION 'ODK device source key is required'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_normalize_field_device_key ON public.field_devices;
CREATE TRIGGER trg_normalize_field_device_key BEFORE INSERT OR UPDATE OF odk_source_key
  ON public.field_devices FOR EACH ROW EXECUTE FUNCTION public.normalize_field_device_key();

CREATE TABLE IF NOT EXISTS public.field_device_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_device_id uuid NOT NULL REFERENCES public.field_devices(id) ON DELETE RESTRICT,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  role_scope text NOT NULL CHECK (role_scope IN ('collector','coordinator')),
  valid_from date NOT NULL,
  valid_to date,
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  assigned_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
ALTER TABLE public.field_device_assignments DROP CONSTRAINT IF EXISTS field_device_assignments_no_overlap;
ALTER TABLE public.field_device_assignments ADD CONSTRAINT field_device_assignments_no_overlap
  EXCLUDE USING gist (field_device_id WITH =,
    daterange(valid_from, coalesce(valid_to, 'infinity'::date), '[)') WITH &&);
CREATE INDEX IF NOT EXISTS field_device_assignments_profile_dates_idx
  ON public.field_device_assignments(profile_id, valid_from, valid_to);

-- The names intentionally distinguish raw incoming evidence from resolved IDs.
ALTER TABLE public.mmp_site_entries
  ADD COLUMN IF NOT EXISTS wfp_raw_device_key text,
  ADD COLUMN IF NOT EXISTS wfp_raw_collector_name text,
  ADD COLUMN IF NOT EXISTS wfp_raw_submission_id text,
  ADD COLUMN IF NOT EXISTS wfp_submission_date date,
  ADD COLUMN IF NOT EXISTS attribution_device_id uuid REFERENCES public.field_devices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attribution_collector_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attribution_coordinator_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attribution_method text,
  ADD COLUMN IF NOT EXISTS attribution_confidence numeric(5,4),
  ADD COLUMN IF NOT EXISTS attribution_exception_code text,
  ADD COLUMN IF NOT EXISTS attribution_correction_reason text,
  ADD COLUMN IF NOT EXISTS attribution_status text NOT NULL DEFAULT 'unresolved';
ALTER TABLE public.mmp_site_entries DROP CONSTRAINT IF EXISTS mmp_site_entries_attribution_status_check;
ALTER TABLE public.mmp_site_entries ADD CONSTRAINT mmp_site_entries_attribution_status_check
  CHECK (attribution_status IN ('unresolved','auto','corrected'));
ALTER TABLE public.mmp_site_entries DROP CONSTRAINT IF EXISTS mmp_site_entries_attribution_exception_code_check;
ALTER TABLE public.mmp_site_entries ADD CONSTRAINT mmp_site_entries_attribution_exception_code_check
  CHECK (attribution_exception_code IS NULL OR attribution_exception_code IN ('missing_device_evidence','unknown_device'));
CREATE INDEX IF NOT EXISTS mmp_site_entries_attribution_cycle_idx
  ON public.mmp_site_entries(mmp_file_id, attribution_status);

DO $$
BEGIN
  IF to_regclass('public.field_data_submissions') IS NOT NULL THEN
    ALTER TABLE public.field_data_submissions
      ADD COLUMN IF NOT EXISTS wfp_raw_device_key text,
      ADD COLUMN IF NOT EXISTS wfp_raw_collector_name text,
      ADD COLUMN IF NOT EXISTS wfp_raw_submission_id text,
      ADD COLUMN IF NOT EXISTS wfp_submission_date date,
      ADD COLUMN IF NOT EXISTS attribution_device_id uuid REFERENCES public.field_devices(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS attribution_collector_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS attribution_coordinator_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS attribution_method text,
      ADD COLUMN IF NOT EXISTS attribution_confidence numeric(5,4),
      ADD COLUMN IF NOT EXISTS attribution_status text NOT NULL DEFAULT 'unresolved';
  END IF;
END $$;

-- Existing installations have legacy broad site-entry policies.  Keep those
-- policies from bypassing the protected resolution workflows above.
CREATE OR REPLACE FUNCTION public.guard_collection_attribution_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_owner name;
BEGIN
  SELECT pg_get_userbyid(relowner) INTO v_owner
    FROM pg_class WHERE oid = 'public.mmp_site_entries'::regclass;
  IF current_user <> v_owner AND (
     (TG_OP = 'INSERT' AND (
       NEW.attribution_device_id IS NOT NULL
       OR NEW.attribution_collector_id IS NOT NULL
       OR NEW.attribution_coordinator_id IS NOT NULL
       OR NEW.attribution_method IS NOT NULL
       OR NEW.attribution_confidence IS NOT NULL
       OR NEW.attribution_exception_code IS NOT NULL
       OR NEW.attribution_correction_reason IS NOT NULL
       OR NEW.attribution_status IS DISTINCT FROM 'unresolved'
       OR NEW.wfp_raw_device_key IS NOT NULL
       OR NEW.wfp_raw_collector_name IS NOT NULL
       OR NEW.wfp_raw_submission_id IS NOT NULL
       OR NEW.wfp_submission_date IS NOT NULL
     ))
     OR (TG_OP = 'UPDATE' AND (
       NEW.attribution_device_id IS DISTINCT FROM OLD.attribution_device_id
       OR NEW.attribution_collector_id IS DISTINCT FROM OLD.attribution_collector_id
       OR NEW.attribution_coordinator_id IS DISTINCT FROM OLD.attribution_coordinator_id
       OR NEW.attribution_method IS DISTINCT FROM OLD.attribution_method
       OR NEW.attribution_confidence IS DISTINCT FROM OLD.attribution_confidence
       OR NEW.attribution_exception_code IS DISTINCT FROM OLD.attribution_exception_code
       OR NEW.attribution_correction_reason IS DISTINCT FROM OLD.attribution_correction_reason
       OR NEW.attribution_status IS DISTINCT FROM OLD.attribution_status
       OR NEW.wfp_raw_device_key IS DISTINCT FROM OLD.wfp_raw_device_key
       OR NEW.wfp_raw_collector_name IS DISTINCT FROM OLD.wfp_raw_collector_name
       OR NEW.wfp_raw_submission_id IS DISTINCT FROM OLD.wfp_raw_submission_id
       OR NEW.wfp_submission_date IS DISTINCT FROM OLD.wfp_submission_date
     ))
  ) THEN
    RAISE EXCEPTION 'PROTECTED_ATTRIBUTION_STATE: use the authorized attribution RPC';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_guard_collection_attribution_write ON public.mmp_site_entries;
CREATE TRIGGER trg_guard_collection_attribution_write BEFORE INSERT OR UPDATE ON public.mmp_site_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_collection_attribution_write();

CREATE TABLE IF NOT EXISTS public.collection_attribution_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mmp_site_entry_id uuid NOT NULL REFERENCES public.mmp_site_entries(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('evidence_ingested','auto_attributed','corrected')),
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  reason text,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.cycle_close_attribution_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mmp_id uuid NOT NULL REFERENCES public.mmp_files(id) ON DELETE RESTRICT,
  closed_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  attribution_state jsonb NOT NULL,
  UNIQUE(mmp_id)
);

CREATE OR REPLACE FUNCTION public.reject_attribution_history_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Attribution audit and Cycle Close snapshots are immutable'; END; $$;
DROP TRIGGER IF EXISTS trg_collection_attribution_audit_immutable ON public.collection_attribution_audit;
CREATE TRIGGER trg_collection_attribution_audit_immutable BEFORE UPDATE OR DELETE ON public.collection_attribution_audit
  FOR EACH ROW EXECUTE FUNCTION public.reject_attribution_history_mutation();
DROP TRIGGER IF EXISTS trg_cycle_close_attribution_snapshots_immutable ON public.cycle_close_attribution_snapshots;
CREATE TRIGGER trg_cycle_close_attribution_snapshots_immutable BEFORE UPDATE OR DELETE ON public.cycle_close_attribution_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.reject_attribution_history_mutation();

ALTER TABLE public.field_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_device_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_attribution_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cycle_close_attribution_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS field_devices_manager_read ON public.field_devices;
CREATE POLICY field_devices_manager_read ON public.field_devices FOR SELECT TO authenticated
  USING (public.is_field_attribution_manager());
DROP POLICY IF EXISTS field_device_assignments_manager_read ON public.field_device_assignments;
CREATE POLICY field_device_assignments_manager_read ON public.field_device_assignments FOR SELECT TO authenticated
  USING (public.is_field_attribution_manager());
DROP POLICY IF EXISTS collection_attribution_audit_manager_read ON public.collection_attribution_audit;
CREATE POLICY collection_attribution_audit_manager_read ON public.collection_attribution_audit FOR SELECT TO authenticated
  USING (public.is_field_attribution_manager());
DROP POLICY IF EXISTS cycle_close_attribution_snapshots_manager_read ON public.cycle_close_attribution_snapshots;
CREATE POLICY cycle_close_attribution_snapshots_manager_read ON public.cycle_close_attribution_snapshots FOR SELECT TO authenticated
  USING (public.is_field_attribution_manager());

CREATE OR REPLACE FUNCTION public.is_field_attribution_user(p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=p_uid AND (
      regexp_replace(lower(coalesce(p.role,'')),'[^a-z0-9]+','','g') IN ('datacollector','coordinator')
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p.additional_roles)='array'
        THEN p.additional_roles ELSE '[]'::jsonb END) r
        WHERE regexp_replace(lower(coalesce(r->>'role','')),'[^a-z0-9]+','','g') IN ('datacollector','coordinator'))
      OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p.id
        AND regexp_replace(lower(coalesce(ur.role::text,'')),'[^a-z0-9]+','','g') IN ('datacollector','coordinator'))
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.list_field_attribution_users()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_field_attribution_manager() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'email',p.email,'role',p.role)
    ORDER BY p.full_name) FROM public.profiles p
    WHERE public.is_field_attribution_user(p.id)
  ), '[]'::jsonb);
END; $$;
CREATE OR REPLACE FUNCTION public.list_field_devices()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_field_attribution_manager() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'odk_source_key',d.odk_source_key,
    'display_name',d.display_name,'active',d.active) ORDER BY d.display_name NULLS LAST,d.odk_source_key)
    FROM public.field_devices d), '[]'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.assign_or_replace_field_device(
  p_device_id uuid, p_profile_id uuid, p_role_scope text, p_valid_from date,
  p_valid_to date DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_old_count int;
BEGIN
  IF NOT public.is_field_attribution_manager(v_actor) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_profile_id = v_actor THEN RAISE EXCEPTION 'SELF_ASSIGNMENT_FORBIDDEN'; END IF;
  IF p_role_scope NOT IN ('collector','coordinator') OR p_valid_from IS NULL
     OR nullif(trim(coalesce(p_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'VALIDATION: role, date, and reason are required'; END IF;
  IF NOT public.is_field_attribution_user(p_profile_id) THEN
    RAISE EXCEPTION 'INVALID_TARGET_ROLE: target must be a Data Collector or Coordinator';
  END IF;
  PERFORM 1 FROM public.field_devices WHERE id=p_device_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEVICE_NOT_FOUND'; END IF;
  UPDATE public.field_device_assignments SET valid_to=p_valid_from-1
   WHERE field_device_id=p_device_id AND role_scope=p_role_scope AND valid_to IS NULL AND valid_from < p_valid_from;
  GET DIAGNOSTICS v_old_count = ROW_COUNT;
  INSERT INTO public.field_device_assignments(field_device_id,profile_id,role_scope,valid_from,valid_to,reason,assigned_by)
    VALUES(p_device_id,p_profile_id,p_role_scope,p_valid_from,p_valid_to,trim(p_reason),v_actor);
  RETURN jsonb_build_object('ok',true,'replaced',v_old_count);
END; $$;

CREATE OR REPLACE FUNCTION public.apply_field_device_attribution(p_mmp_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid:=auth.uid(); v_count int; v_closed_at timestamptz; v_cycle_status text;
BEGIN
  IF NOT public.is_field_attribution_manager(v_actor) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT cycle_closed_at,cycle_status INTO v_closed_at,v_cycle_status
    FROM public.mmp_files WHERE id=p_mmp_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MMP_NOT_FOUND'; END IF;
  IF v_closed_at IS NOT NULL OR lower(coalesce(v_cycle_status,''))='closed' THEN
    RAISE EXCEPTION 'CYCLE_CLOSED: attribution cannot change after Cycle Close';
  END IF;
  WITH candidates AS (
    SELECT s.id,d.id device_id,a.profile_id collector_id,
      CASE WHEN a.role_scope='coordinator' THEN a.profile_id END coordinator_id,
      jsonb_build_object('device_id',s.attribution_device_id,'collector_id',s.attribution_collector_id,
        'coordinator_id',s.attribution_coordinator_id,'method',s.attribution_method,
        'confidence',s.attribution_confidence,'status',s.attribution_status,
        'exception_code',s.attribution_exception_code,
        'correction_reason',s.attribution_correction_reason) AS before_state
    FROM public.mmp_site_entries s JOIN public.field_devices d
      ON d.odk_source_key_normalized=public.normalize_odk_source_key(s.wfp_raw_device_key)
    LEFT JOIN LATERAL (
      SELECT fa.profile_id,fa.role_scope FROM public.field_device_assignments fa
       WHERE fa.field_device_id=d.id
          AND s.wfp_submission_date >= fa.valid_from
          AND (fa.valid_to IS NULL OR s.wfp_submission_date < fa.valid_to)
    ) a ON true
    WHERE s.mmp_file_id=p_mmp_id AND lower(coalesce(s.status,''))='wfp_confirmed'
      AND s.wfp_raw_device_key IS NOT NULL AND s.wfp_submission_date IS NOT NULL
  ), changed AS (
    UPDATE public.mmp_site_entries s SET attribution_device_id=c.device_id,attribution_collector_id=c.collector_id,
      attribution_coordinator_id=c.coordinator_id,attribution_method='device_assignment',
      attribution_confidence=1.0000,
      attribution_exception_code=NULL,attribution_correction_reason=NULL,
      attribution_status=CASE
        WHEN c.collector_id IS NULL THEN 'unresolved'
        WHEN (
          ((to_jsonb(s)->>'accepted_by') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND (to_jsonb(s)->>'accepted_by')::uuid <> c.collector_id)
          OR ((to_jsonb(s)->>'claimed_by') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND (to_jsonb(s)->>'claimed_by')::uuid <> c.collector_id)
          OR ((to_jsonb(s)->>'visit_started_by') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND (to_jsonb(s)->>'visit_started_by')::uuid <> c.collector_id)
        ) THEN 'unresolved'
        ELSE 'auto'
      END
    FROM candidates c WHERE s.id=c.id AND c.collector_id IS NOT NULL
    RETURNING s.*, c.before_state
  )
  INSERT INTO public.collection_attribution_audit(mmp_site_entry_id,action,before_state,after_state,actor_id)
    SELECT id,'auto_attributed',before_state,jsonb_build_object('device_id',attribution_device_id,
      'collector_id',attribution_collector_id,'coordinator_id',attribution_coordinator_id,
      'exception_code',attribution_exception_code,'correction_reason',attribution_correction_reason),v_actor FROM changed;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('ok',true,'attributed',v_count);
END; $$;

CREATE OR REPLACE FUNCTION public.correct_collection_attribution(
 p_site_id uuid,p_device_id uuid,p_collector_id uuid,p_coordinator_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid:=auth.uid(); v_before jsonb; v_mmp_id uuid; v_closed_at timestamptz;
  v_cycle_status text; v_raw_device text; v_device_key text; v_exception_code text;
BEGIN
 IF NOT public.is_field_attribution_manager(v_actor) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF length(trim(coalesce(p_reason,'')))<10 OR p_collector_id IS NULL THEN
   RAISE EXCEPTION 'VALIDATION: collector and a correction reason of at least 10 characters are required';
 END IF;
 IF NOT public.is_field_attribution_user(p_collector_id) THEN
   RAISE EXCEPTION 'INVALID_COLLECTOR: correction target must be a Data Collector or Coordinator';
 END IF;
 IF p_coordinator_id IS NOT NULL AND NOT public.is_field_attribution_user(p_coordinator_id) THEN
   RAISE EXCEPTION 'INVALID_COORDINATOR: correction coordinator must be eligible field staff';
 END IF;
 SELECT mmp_file_id INTO v_mmp_id FROM public.mmp_site_entries WHERE id=p_site_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'SITE_NOT_FOUND'; END IF;
 SELECT cycle_closed_at,cycle_status INTO v_closed_at,v_cycle_status
   FROM public.mmp_files WHERE id=v_mmp_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MMP_NOT_FOUND'; END IF;
 IF v_closed_at IS NOT NULL OR lower(coalesce(v_cycle_status,''))='closed' THEN
   RAISE EXCEPTION 'CYCLE_CLOSED: attribution cannot change after Cycle Close';
 END IF;
 SELECT jsonb_build_object('device_id',attribution_device_id,'collector_id',attribution_collector_id,
   'coordinator_id',attribution_coordinator_id,'status',attribution_status,
   'exception_code',attribution_exception_code,'correction_reason',attribution_correction_reason),wfp_raw_device_key
   INTO v_before,v_raw_device FROM public.mmp_site_entries
   WHERE id=p_site_id AND mmp_file_id=v_mmp_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SITE_NOT_FOUND'; END IF;
 IF p_device_id IS NOT NULL THEN
   SELECT odk_source_key_normalized INTO v_device_key FROM public.field_devices WHERE id=p_device_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'DEVICE_NOT_FOUND'; END IF;
   IF v_device_key IS DISTINCT FROM public.normalize_odk_source_key(v_raw_device) THEN
     RAISE EXCEPTION 'DEVICE_EVIDENCE_MISMATCH: selected device does not match the raw WFP device';
   END IF;
   v_exception_code:=NULL;
 ELSE
   IF public.normalize_odk_source_key(v_raw_device) IS NULL THEN
     v_exception_code:='missing_device_evidence';
   ELSIF EXISTS (
     SELECT 1 FROM public.field_devices d
      WHERE d.odk_source_key_normalized=public.normalize_odk_source_key(v_raw_device)
   ) THEN
     RAISE EXCEPTION 'REGISTERED_DEVICE_REQUIRED: raw WFP evidence matches a registered device';
   ELSE
     v_exception_code:='unknown_device';
   END IF;
 END IF;
 UPDATE public.mmp_site_entries SET attribution_device_id=p_device_id,
   attribution_collector_id=p_collector_id,attribution_coordinator_id=p_coordinator_id,
   attribution_method='manual_correction',attribution_confidence=1.0000,
   attribution_exception_code=v_exception_code,attribution_correction_reason=trim(p_reason),
   attribution_status='corrected' WHERE id=p_site_id;
 INSERT INTO public.collection_attribution_audit(mmp_site_entry_id,action,before_state,after_state,reason,actor_id)
 VALUES(p_site_id,'corrected',v_before,jsonb_build_object('device_id',p_device_id,
   'collector_id',p_collector_id,'coordinator_id',p_coordinator_id,'status','corrected',
   'exception_code',v_exception_code,'correction_reason',trim(p_reason)),trim(p_reason),v_actor);
 RETURN jsonb_build_object('ok',true);
END; $$;

CREATE OR REPLACE FUNCTION public.get_cycle_attribution_state(p_mmp_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NOT public.is_field_attribution_manager() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 RETURN coalesce((SELECT jsonb_object_agg(state, rows) FROM (
   SELECT attribution_status state,jsonb_agg(jsonb_build_object('site_id',id,'site_name',site_name,
     'raw_device_key',wfp_raw_device_key,'submission_date',wfp_submission_date,'collector_id',attribution_collector_id,
     'collector_name',p.full_name,'coordinator_id',attribution_coordinator_id) ORDER BY site_name) rows
   FROM public.mmp_site_entries s LEFT JOIN public.profiles p ON p.id=s.attribution_collector_id
   WHERE s.mmp_file_id=p_mmp_id AND lower(coalesce(s.status,''))='wfp_confirmed' GROUP BY attribution_status
 ) q),'{}'::jsonb);
END; $$;

-- Production API names used by Command Center.  Assignment dates are stored as
-- dates because device custody is a business-day interval, while callers send
-- timestamptz values from the UI.
CREATE OR REPLACE FUNCTION public.admin_list_field_device_assignments(p_profile uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_field_attribution_manager() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('id',a.id,'profile_id',a.profile_id,
      'profile_name',p.full_name,'profile_role',p.role,'device_id',d.id,
      'raw_device',d.odk_source_key,'raw_device_id',d.odk_source_key,
      'normalized_device_id',d.odk_source_key_normalized,
      'status',CASE WHEN a.valid_to IS NULL OR a.valid_to>=current_date THEN 'active' ELSE 'retired' END,
      'role_scope',a.role_scope,
      'valid_from',a.valid_from,'valid_to',a.valid_to,'reason',a.reason,
      'assigned_by',a.assigned_by,'created_at',a.created_at) ORDER BY a.valid_from DESC,a.created_at DESC)
    FROM public.field_device_assignments a
    JOIN public.field_devices d ON d.id=a.field_device_id
    JOIN public.profiles p ON p.id=a.profile_id
    WHERE a.profile_id=p_profile
  ),'[]'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_assign_field_device(
  p_profile uuid, p_raw_device text, p_role_scope text, p_valid_from timestamptz, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid:=auth.uid(); v_device uuid; v_day date; v_target_ok boolean;
BEGIN
  IF NOT public.is_field_attribution_manager(v_actor) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_profile IS NULL OR p_profile=v_actor THEN RAISE EXCEPTION 'SELF_ASSIGNMENT_FORBIDDEN'; END IF;
  IF nullif(trim(coalesce(p_raw_device,'')),'') IS NULL OR p_valid_from IS NULL
     OR nullif(trim(coalesce(p_reason,'')),'') IS NULL OR p_role_scope NOT IN ('collector','coordinator') THEN
    RAISE EXCEPTION 'VALIDATION: profile, device, supported scope, effective date, and reason are required';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=p_profile AND (
      regexp_replace(lower(coalesce(p.role,'')),'[^a-z0-9]+','','g') IN
        (CASE WHEN p_role_scope='collector' THEN 'datacollector' ELSE 'coordinator' END)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p.additional_roles)='array'
        THEN p.additional_roles ELSE '[]'::jsonb END) r
        WHERE regexp_replace(lower(coalesce(r->>'role','')),'[^a-z0-9]+','','g') IN
          (CASE WHEN p_role_scope='collector' THEN 'datacollector' ELSE 'coordinator' END))
      OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p.id
        AND regexp_replace(lower(coalesce(ur.role::text,'')),'[^a-z0-9]+','','g') IN
          (CASE WHEN p_role_scope='collector' THEN 'datacollector' ELSE 'coordinator' END))
    )
  ) INTO v_target_ok;
  IF NOT v_target_ok THEN RAISE EXCEPTION 'INVALID_TARGET_ROLE: target profile must be a Data Collector or Coordinator for this scope'; END IF;
  v_day:=p_valid_from::date;
  INSERT INTO public.field_devices(odk_source_key,odk_source_key_normalized,created_by)
    VALUES(trim(p_raw_device),public.normalize_odk_source_key(p_raw_device),v_actor)
    ON CONFLICT (odk_source_key_normalized) DO UPDATE SET updated_at=now()
    RETURNING id INTO v_device;
  -- Do not silently rewrite historical or scheduled custody.  A caller must
  -- retire it first where the requested day falls inside its interval.
  IF EXISTS (SELECT 1 FROM public.field_device_assignments a WHERE a.field_device_id=v_device
      AND coalesce(a.valid_to,'infinity'::date)>v_day) THEN
    RAISE EXCEPTION 'OVERLAPPING_ACTIVE_ASSIGNMENT: retire the active assignment before replacing it';
  END IF;
  INSERT INTO public.field_device_assignments(field_device_id,profile_id,role_scope,valid_from,reason,assigned_by)
    VALUES(v_device,p_profile,p_role_scope,v_day,trim(p_reason),v_actor);
  RETURN jsonb_build_object('ok',true,'device_id',v_device);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_retire_field_device_assignment(
  p_assignment uuid, p_valid_to timestamptz, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid:=auth.uid(); v_from date; v_to date;
BEGIN
  IF NOT public.is_field_attribution_manager(v_actor) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_valid_to IS NULL OR nullif(trim(coalesce(p_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'VALIDATION: retirement date and reason are required'; END IF;
  v_to:=p_valid_to::date;
  SELECT valid_from INTO v_from FROM public.field_device_assignments WHERE id=p_assignment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND'; END IF;
  IF v_to<v_from THEN RAISE EXCEPTION 'VALIDATION: retirement date precedes assignment'; END IF;
  UPDATE public.field_device_assignments SET valid_to=v_to,reason=reason||E'\nRetired: '||trim(p_reason) WHERE id=p_assignment;
  RETURN jsonb_build_object('ok',true);
END; $$;

CREATE OR REPLACE FUNCTION public.persist_cycle_attribution_evidence(p_mmp_id uuid,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid:=auth.uid();
  r jsonb;
  v_site uuid;
  v_count int:=0;
  v_result jsonb;
  v_before jsonb;
  v_after jsonb;
  v_closed_at timestamptz;
  v_cycle_status text;
BEGIN
  IF NOT public.is_field_attribution_manager(v_actor) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF jsonb_typeof(p_rows)<>'array' THEN RAISE EXCEPTION 'VALIDATION: rows must be an array'; END IF;
  SELECT cycle_closed_at,cycle_status INTO v_closed_at,v_cycle_status
    FROM public.mmp_files WHERE id=p_mmp_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MMP_NOT_FOUND'; END IF;
  IF v_closed_at IS NOT NULL OR lower(coalesce(v_cycle_status,''))='closed' THEN
    RAISE EXCEPTION 'CYCLE_CLOSED: WFP evidence cannot change after Cycle Close';
  END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_site:=CASE WHEN nullif(r->>'site_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN (r->>'site_id')::uuid END;
    IF v_site IS NULL OR NOT EXISTS(SELECT 1 FROM public.mmp_site_entries WHERE id=v_site AND mmp_file_id=p_mmp_id) THEN
      RAISE EXCEPTION 'SITE_MMP_MISMATCH: every evidence row must belong to this MMP';
    END IF;
    -- Evidence is first-write-wins; later corrections remain in the audit trail
    -- and cannot replace original WFP evidence.
    SELECT jsonb_build_object(
      'raw_device_key',wfp_raw_device_key,
      'raw_collector_name',wfp_raw_collector_name,
      'raw_submission_id',wfp_raw_submission_id,
      'submission_date',wfp_submission_date
    ) INTO v_before
    FROM public.mmp_site_entries WHERE id=v_site FOR UPDATE;
    UPDATE public.mmp_site_entries SET
      wfp_raw_device_key=coalesce(wfp_raw_device_key,nullif(trim(coalesce(r->>'raw_device',r->>'device_key',r->>'wfp_raw_device_id')),'')),
      wfp_raw_collector_name=coalesce(wfp_raw_collector_name,nullif(trim(coalesce(r->>'raw_collector_name',r->>'collector_name',r->>'wfp_raw_interviewer_name')),'')),
      wfp_raw_submission_id=coalesce(wfp_raw_submission_id,nullif(trim(coalesce(r->>'raw_submission_id',r->>'submission_id',r->>'submission_uuid')),'')),
      wfp_submission_date=coalesce(wfp_submission_date,nullif(coalesce(r->>'submission_date',r->>'raw_submission_date'),'')::date)
    WHERE id=v_site;
    SELECT jsonb_build_object(
      'raw_device_key',wfp_raw_device_key,
      'raw_collector_name',wfp_raw_collector_name,
      'raw_submission_id',wfp_raw_submission_id,
      'submission_date',wfp_submission_date
    ) INTO v_after
    FROM public.mmp_site_entries WHERE id=v_site;
    IF v_after IS DISTINCT FROM v_before THEN
      INSERT INTO public.collection_attribution_audit(
        mmp_site_entry_id,action,before_state,after_state,reason,actor_id
      ) VALUES (
        v_site,'evidence_ingested',v_before,v_after,
        'WFP clean-data evidence imported during Cycle Close',v_actor
      );
    END IF;
    v_count:=v_count+1;
  END LOOP;
  v_result:=public.apply_field_device_attribution(p_mmp_id);
  RETURN v_result || jsonb_build_object('ok',true,'evidence_rows',v_count);
END; $$;

CREATE OR REPLACE FUNCTION public.get_cycle_attribution_report(p_mmp_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows jsonb; v_summary jsonb; v_totals jsonb;
BEGIN
  IF NOT public.is_field_attribution_manager() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  WITH x AS (
    SELECT s.*,
      CASE WHEN (to_jsonb(s)->>'accepted_by') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (to_jsonb(s)->>'accepted_by')::uuid END accepted_id,
      CASE WHEN (to_jsonb(s)->>'claimed_by') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (to_jsonb(s)->>'claimed_by')::uuid END claimed_by_id,
      CASE WHEN (to_jsonb(s)->>'visit_started_by') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (to_jsonb(s)->>'visit_started_by')::uuid END visit_started_by_id
    FROM public.mmp_site_entries s WHERE s.mmp_file_id=p_mmp_id
  ), rows AS (
    SELECT x.*,coalesce(x.accepted_id,x.claimed_by_id,x.visit_started_by_id) claimed_id,
      cp.full_name claimed_name,rp.full_name resolved_name,op.full_name coordinator_name,
      CASE WHEN lower(coalesce(x.status,''))='not_covered' OR coalesce(x.not_covered_flag,false) THEN 'not_covered'
           WHEN lower(coalesce(x.status,''))='wfp_confirmed' AND x.attribution_collector_id IS NULL THEN 'missing_attribution'
           WHEN lower(coalesce(x.status,''))='wfp_confirmed' AND (
             (x.accepted_id IS NOT NULL AND x.accepted_id<>x.attribution_collector_id)
             OR (x.claimed_by_id IS NOT NULL AND x.claimed_by_id<>x.attribution_collector_id)
             OR (x.visit_started_by_id IS NOT NULL AND x.visit_started_by_id<>x.attribution_collector_id))
             THEN 'device_owner_mismatch'
           WHEN lower(coalesce(x.status,''))<>'wfp_confirmed'
             AND coalesce(x.accepted_id,x.claimed_by_id,x.visit_started_by_id) IS NOT NULL THEN 'claimed_not_submitted'
           ELSE NULL END issue_type
    FROM x LEFT JOIN public.profiles cp ON cp.id=coalesce(x.accepted_id,x.claimed_by_id,x.visit_started_by_id)
      LEFT JOIN public.profiles rp ON rp.id=x.attribution_collector_id
      LEFT JOIN public.profiles op ON op.id=x.attribution_coordinator_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('state',state,'site_id',id,'site_name',site_name,
    'requires_attribution',lower(coalesce(status,''))='wfp_confirmed',
    'claimed_collector_id',claimed_id,'claimed_collector_name',claimed_name,'raw_wfp_name',wfp_raw_collector_name,
    'raw_wfp_device',wfp_raw_device_key,'raw_wfp_submission',wfp_raw_submission_id,'raw_wfp_date',wfp_submission_date,
    'wfp_raw_device_id',wfp_raw_device_key,'wfp_raw_interviewer_name',wfp_raw_collector_name,
    'submission_uuid',wfp_raw_submission_id,'submission_date',wfp_submission_date,
    'device_id',attribution_device_id,'resolved_collector_id',attribution_collector_id,'resolved_collector_name',resolved_name,
    'coordinator_id',attribution_coordinator_id,'coordinator_name',coordinator_name,'status',attribution_status,'method',attribution_method,
    'confidence',attribution_confidence,'issue_type',issue_type,
    'correction_reason',attribution_correction_reason,'exception_code',attribution_exception_code) ORDER BY site_name),'[]'::jsonb),
    jsonb_build_object('total',count(*),'submitted',count(*) FILTER(WHERE wfp_submission_date IS NOT NULL OR wfp_raw_submission_id IS NOT NULL),
      'resolved',count(*) FILTER(WHERE lower(coalesce(status,''))='wfp_confirmed' AND attribution_collector_id IS NOT NULL AND attribution_status IN ('auto','corrected')),
      'unresolved',count(*) FILTER(WHERE lower(coalesce(status,''))='wfp_confirmed' AND (attribution_collector_id IS NULL OR attribution_status NOT IN ('auto','corrected'))),
      'claimed_not_submitted',count(*) FILTER(WHERE issue_type='claimed_not_submitted'),
      'mismatches',count(*) FILTER(WHERE issue_type='device_owner_mismatch'))
  INTO v_rows,v_totals FROM rows;
  SELECT coalesce(jsonb_object_agg(state,n),'{}'::jsonb) INTO v_summary
    FROM (SELECT coalesce(state,'Unspecified') AS state,
      jsonb_build_object('total',count(*),
        'submitted',count(*) FILTER (WHERE wfp_submission_date IS NOT NULL OR wfp_raw_submission_id IS NOT NULL),
        'resolved',count(*) FILTER (WHERE lower(coalesce(status,''))='wfp_confirmed' AND attribution_collector_id IS NOT NULL AND attribution_status IN ('auto','corrected')),
        'unresolved',count(*) FILTER (WHERE lower(coalesce(status,''))='wfp_confirmed' AND (attribution_collector_id IS NULL OR attribution_status NOT IN ('auto','corrected'))),
        'claimed_not_submitted',count(*) FILTER (WHERE lower(coalesce(status,''))<>'wfp_confirmed' AND (to_jsonb(mmp_site_entries)->>'accepted_by' IS NOT NULL OR to_jsonb(mmp_site_entries)->>'claimed_by' IS NOT NULL OR to_jsonb(mmp_site_entries)->>'visit_started_by' IS NOT NULL)),
        'mismatches',count(*) FILTER (WHERE lower(coalesce(status,''))='wfp_confirmed'
          AND attribution_collector_id IS NOT NULL AND (
            ((to_jsonb(mmp_site_entries)->>'accepted_by') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND (to_jsonb(mmp_site_entries)->>'accepted_by')<>attribution_collector_id::text)
            OR ((to_jsonb(mmp_site_entries)->>'claimed_by') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND (to_jsonb(mmp_site_entries)->>'claimed_by')<>attribution_collector_id::text)
            OR ((to_jsonb(mmp_site_entries)->>'visit_started_by') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND (to_jsonb(mmp_site_entries)->>'visit_started_by')<>attribution_collector_id::text)
          ))) n
      FROM public.mmp_site_entries WHERE mmp_file_id=p_mmp_id
      GROUP BY coalesce(state,'Unspecified')) q;
  RETURN jsonb_build_object('rows',v_rows,'state_summary',v_summary,'totals',v_totals);
END; $$;

-- Latest finalizer behavior plus an attribution gate and immutable close snapshot.
CREATE OR REPLACE FUNCTION public.close_mmp_and_lock_incentives(p_mmp_id uuid,p_skip_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id uuid:=auth.uid(); v_now timestamptz:=now(); v_closed timestamptz; v_id uuid; v_status text; v_unresolved int;
BEGIN
 IF v_user_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Not authenticated'); END IF;
 IF NOT public.is_field_attribution_manager(v_user_id) THEN RETURN jsonb_build_object('ok',false,'error','Only FOM / Director / Admin / Super Admin can close a cycle'); END IF;
 SELECT cycle_closed_at INTO v_closed FROM public.mmp_files WHERE id=p_mmp_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','MMP not found'); END IF;
 IF v_closed IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','Cycle is already closed (closed at '||v_closed::text||'). Use the reopen flow if a correction is needed.'); END IF;
 SELECT count(*) INTO v_unresolved FROM public.mmp_site_entries s WHERE s.mmp_file_id=p_mmp_id
   AND lower(coalesce(s.status,''))='wfp_confirmed'
   AND (s.attribution_collector_id IS NULL OR s.attribution_status NOT IN ('auto','corrected'));
 IF v_unresolved>0 THEN RETURN jsonb_build_object('ok',false,'error',format('ATTRIBUTION_UNRESOLVED: %s confirmed WFP row(s) require device attribution or an explicit correction.',v_unresolved)); END IF;
 UPDATE public.mmp_files SET cycle_status='closed',cycle_closed_at=v_now,cycle_closed_by=v_user_id,updated_at=v_now WHERE id=p_mmp_id;
 BEGIN
   SELECT id,status INTO v_id,v_status FROM public.mmp_incentive_snapshots WHERE mmp_id=p_mmp_id LIMIT 1;
   IF v_id IS NOT NULL AND v_status='pre_approved' THEN UPDATE public.mmp_incentive_snapshots SET status='approved',approved_at=v_now,locked_at=v_now,updated_at=v_now WHERE id=v_id;
   ELSIF v_id IS NULL THEN INSERT INTO public.mmp_incentive_snapshots(mmp_id,status,skipped,skipped_reason,total_dc_fee_pool_cents,total_bonus_cents,created_at,updated_at)
     VALUES(p_mmp_id,'approved',true,coalesce(nullif(trim(p_skip_reason),''),'Cycle closed without incentive pre-approval (admin confirmed)'),0,0,v_now,v_now); END IF;
 EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
 INSERT INTO public.cycle_close_attribution_snapshots(mmp_id,closed_by,attribution_state)
 SELECT p_mmp_id,v_user_id,coalesce(jsonb_agg(jsonb_build_object('site_id',s.id,'raw_device_key',s.wfp_raw_device_key,'raw_collector_name',s.wfp_raw_collector_name,'raw_submission_id',s.wfp_raw_submission_id,'submission_date',s.wfp_submission_date,'device_id',s.attribution_device_id,'collector_id',s.attribution_collector_id,'coordinator_id',s.attribution_coordinator_id,'method',s.attribution_method,'confidence',s.attribution_confidence,'status',s.attribution_status,'correction_reason',s.attribution_correction_reason,'exception_code',s.attribution_exception_code)),'[]'::jsonb)
 FROM public.mmp_site_entries s WHERE s.mmp_file_id=p_mmp_id;
 RETURN jsonb_build_object('ok',true,'closed_at',v_now::text);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'error',SQLERRM); END; $$;

REVOKE ALL ON FUNCTION public.list_field_attribution_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_field_attribution_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_field_devices() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_or_replace_field_device(uuid,uuid,text,date,date,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_field_device_attribution(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.correct_collection_attribution(uuid,uuid,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_cycle_attribution_state(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_field_device_assignments(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_assign_field_device(uuid,text,text,timestamptz,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_retire_field_device_assignment(uuid,timestamptz,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.persist_cycle_attribution_evidence(uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_cycle_attribution_report(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_odk_source_key(text),public.list_field_attribution_users(),public.list_field_devices(),public.assign_or_replace_field_device(uuid,uuid,text,date,date,text),public.apply_field_device_attribution(uuid),public.correct_collection_attribution(uuid,uuid,uuid,uuid,text),public.get_cycle_attribution_state(uuid),public.close_mmp_and_lock_incentives(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_field_device_assignments(uuid),public.admin_assign_field_device(uuid,text,text,timestamptz,text),public.admin_retire_field_device_assignment(uuid,timestamptz,text),public.persist_cycle_attribution_evidence(uuid,jsonb),public.get_cycle_attribution_report(uuid) TO authenticated;