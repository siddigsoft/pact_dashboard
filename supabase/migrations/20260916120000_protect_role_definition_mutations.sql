-- Manual application after the September 16 canonical access migrations.
-- Browser role/permission definition writes must use the audited lifecycle.
BEGIN;

REVOKE INSERT, UPDATE, DELETE ON public.roles, public.permissions,
  public.canonical_user_role_assignments, public.role_access_audit FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.delete_role_access(p_role_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  target public.roles%ROWTYPE;
  before_state jsonb;
BEGIN
  PERFORM public.assert_resource_permission('roles', 'delete');
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(16103000);
  SELECT * INTO target FROM public.roles WHERE id = p_role_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Role not found' USING ERRCODE = 'P0002'; END IF;
  IF target.is_system_role OR regexp_replace(lower(target.name), '[^a-z]', '', 'g')
    IN ('superadmin', 'superadministrator', 'admin', 'administrator', 'ict') THEN
    RAISE EXCEPTION 'Protected roles cannot be deleted' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.canonical_user_role_assignments WHERE role_id = target.id)
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE role_id = target.id)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE role = target.name) THEN
    RAISE EXCEPTION 'Remove role assignments before deleting this role' USING ERRCODE = '23503';
  END IF;
  SELECT jsonb_build_object('role', to_jsonb(target),
    'permissions', coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM public.permissions p WHERE p.role_id = target.id), '[]'::jsonb),
    'page_slugs', coalesce((SELECT jsonb_agg(c.page_slug) FROM public.page_role_configs c WHERE target.name = ANY(c.roles)), '[]'::jsonb),
    'tab_rules', coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM public.role_tab_configs c WHERE c.role_id = target.id), '[]'::jsonb),
    'column_rules', coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM public.column_visibility_config c WHERE c.role = target.name AND c.user_id IS NULL), '[]'::jsonb),
    'data_scopes', coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM public.data_scope_config c WHERE c.role = target.name AND c.user_id IS NULL), '[]'::jsonb)
  ) INTO before_state;
  INSERT INTO public.role_access_audit(role_id, actor_id, action, reason, before_state, after_state)
    VALUES(target.id, actor, 'delete', coalesce(nullif(btrim(p_reason), ''), 'Deleted from Role Management'), before_state, jsonb_build_object('deleted_role_id', target.id));
  UPDATE public.page_role_configs SET roles = array_remove(roles, target.name), updated_by = actor, updated_at = now()
    WHERE target.name = ANY(roles);
  DELETE FROM public.column_visibility_config WHERE role = target.name AND user_id IS NULL;
  DELETE FROM public.data_scope_config WHERE role = target.name AND user_id IS NULL;
  DELETE FROM public.permissions WHERE role_id = target.id;
  DELETE FROM public.roles WHERE id = target.id;
  RETURN jsonb_build_object('role_id', target.id, 'deleted', true);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_role_access(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_role_access(uuid,text) TO authenticated;

-- Enforce invariants even inside SECURITY DEFINER RPCs. A role manager must
-- not deactivate/delete the final owner role or strip its protected identity.
CREATE OR REPLACE FUNCTION public.guard_protected_role_definition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(16103000);
  IF regexp_replace(lower(OLD.name), '[^a-z]', '', 'g') IN ('superadmin','superadministrator') THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Super Admin role definitions cannot be deleted' USING ERRCODE = '42501';
    END IF;
    IF NEW.name IS DISTINCT FROM OLD.name OR NOT NEW.is_system_role THEN
      RAISE EXCEPTION 'Super Admin role identity is immutable' USING ERRCODE = '42501';
    END IF;
    IF OLD.is_active AND NOT NEW.is_active AND (
      EXISTS (SELECT 1 FROM public.canonical_user_role_assignments a
        WHERE a.role_id = OLD.id AND a.user_id = 'eeaf10a4-84ad-42d7-8042-ab0a42e69e5b'::uuid)
      OR NOT EXISTS (SELECT 1 FROM public.roles r WHERE r.id <> OLD.id AND r.is_active
        AND regexp_replace(lower(r.name), '[^a-z]', '', 'g') IN ('superadmin','superadministrator')
        AND EXISTS (SELECT 1 FROM public.canonical_user_role_assignments a WHERE a.role_id = r.id))
    ) THEN
      RAISE EXCEPTION 'Cannot deactivate the protected owner or last active Super Admin role' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_protected_role_definition ON public.roles;
CREATE TRIGGER guard_protected_role_definition BEFORE UPDATE OR DELETE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_protected_role_definition();
REVOKE ALL ON FUNCTION public.guard_protected_role_definition() FROM PUBLIC, authenticated, anon;

-- The protected owner's canonical assignments cannot be removed/repointed,
-- including through a definer RPC called by another Super Admin.
CREATE OR REPLACE FUNCTION public.guard_protected_owner_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.user_id = 'eeaf10a4-84ad-42d7-8042-ab0a42e69e5b'::uuid AND (
    TG_OP = 'DELETE' OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.role_id IS DISTINCT FROM OLD.role_id
  ) THEN
    RAISE EXCEPTION 'Protected owner assignments cannot be removed or repointed' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_protected_owner_assignment ON public.canonical_user_role_assignments;
CREATE TRIGGER guard_protected_owner_assignment BEFORE UPDATE OR DELETE ON public.canonical_user_role_assignments
  FOR EACH ROW EXECUTE FUNCTION public.guard_protected_owner_assignment();
REVOKE ALL ON FUNCTION public.guard_protected_owner_assignment() FROM PUBLIC, authenticated, anon;

-- Appointment policy matches the existing platform owner rule in the app.
-- Restrictive policy cannot be bypassed by an older permissive admin policy.
DROP POLICY IF EXISTS super_admin_owner_write ON public.super_admins;
CREATE POLICY super_admin_owner_write ON public.super_admins AS RESTRICTIVE FOR ALL TO authenticated
  USING (auth.uid() = 'eeaf10a4-84ad-42d7-8042-ab0a42e69e5b'::uuid OR public.is_super_admin(auth.uid()))
  WITH CHECK (auth.uid() = 'eeaf10a4-84ad-42d7-8042-ab0a42e69e5b'::uuid OR public.is_super_admin(auth.uid()));
CREATE OR REPLACE FUNCTION public.guard_super_admin_appointment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(16103000);
  IF actor IS NULL AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF TG_OP <> 'INSERT' AND OLD.user_id = 'eeaf10a4-84ad-42d7-8042-ab0a42e69e5b'::uuid THEN
    RAISE EXCEPTION 'Protected owner appointment is immutable' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (NEW.user_id IS DISTINCT FROM OLD.user_id OR (NEW.is_active AND NOT OLD.is_active))) THEN
    IF actor IS DISTINCT FROM 'eeaf10a4-84ad-42d7-8042-ab0a42e69e5b'::uuid THEN
      RAISE EXCEPTION 'Only the platform owner can appoint Super Admins' USING ERRCODE = '42501';
    END IF;
    NEW.appointed_by := actor;
  ELSIF NOT public.is_super_admin(actor) THEN
    RAISE EXCEPTION 'Only a Super Admin can revoke appointments' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_super_admin_appointment ON public.super_admins;
CREATE TRIGGER guard_super_admin_appointment BEFORE INSERT OR UPDATE OR DELETE ON public.super_admins
  FOR EACH ROW EXECUTE FUNCTION public.guard_super_admin_appointment();
REVOKE ALL ON FUNCTION public.guard_super_admin_appointment() FROM PUBLIC, authenticated, anon;
COMMIT;
