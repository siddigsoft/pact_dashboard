-- Canonical role assignments use roles.id.  profiles.role remains a legacy
-- primary/navigation pointer and is intentionally not changed by these RPCs.
-- This allows us to move assignment UI traffic without rewriting existing users
-- or breaking older policies that still read profiles.role / user_roles.role.

CREATE OR REPLACE FUNCTION public.assign_role_to_user(
  p_target_user_id uuid,
  p_target_role_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_role public.roles%ROWTYPE;
  v_inserted boolean := false;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT (
    public.is_super_admin(v_actor_id)
    OR public.profile_can_manage_user_roles(v_actor_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles assigned_role
        ON assigned_role.id = ur.role_id
      JOIN public.permissions permission
        ON permission.role_id = assigned_role.id
      WHERE ur.user_id = v_actor_id
        AND assigned_role.is_active = true
        AND permission.resource = 'roles'
        AND permission.action = 'assign'
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to assign roles';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  SELECT * INTO v_role
  FROM public.roles
  WHERE id = p_target_role_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role not found or inactive';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_target_user_id AND role_id = v_role.id
  ) THEN
    BEGIN
      -- Do not use ON CONFLICT here: older environments have a partial unique
      -- index, while newer ones have a full unique constraint.
      INSERT INTO public.user_roles (user_id, role, role_id, assigned_by, assigned_at)
      VALUES (p_target_user_id, NULL, v_role.id, v_actor_id, now());
      v_inserted := true;
    EXCEPTION WHEN unique_violation THEN
      -- A concurrent assignment won the race; the desired final state exists.
      v_inserted := false;
    END;
  END IF;

  IF v_inserted THEN
    INSERT INTO public.role_access_audit (role_id, actor_id, action, reason, before_state, after_state)
    VALUES (
      v_role.id,
      v_actor_id,
      'assign',
      NULLIF(btrim(p_reason), ''),
      jsonb_build_object('user_id', p_target_user_id, 'assigned', false),
      jsonb_build_object('user_id', p_target_user_id, 'assigned', true, 'role_id', v_role.id)
    );
  END IF;

  RETURN jsonb_build_object(
    'user_id', p_target_user_id,
    'role_id', v_role.id,
    'role_name', v_role.name,
    'created', v_inserted,
    'legacy_profile_role_changed', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_role_from_user(
  p_target_user_id uuid,
  p_target_role_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_role public.roles%ROWTYPE;
  v_deleted boolean := false;
  v_deleted_count integer := 0;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT (
    public.is_super_admin(v_actor_id)
    OR public.profile_can_manage_user_roles(v_actor_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles assigned_role
        ON assigned_role.id = ur.role_id
      JOIN public.permissions permission
        ON permission.role_id = assigned_role.id
      WHERE ur.user_id = v_actor_id
        AND assigned_role.is_active = true
        AND permission.resource = 'roles'
        AND permission.action = 'assign'
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to remove roles';
  END IF;

  SELECT * INTO v_role FROM public.roles WHERE id = p_target_role_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role not found';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = p_target_user_id
    AND role_id = p_target_role_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted := v_deleted_count > 0;

  IF v_deleted THEN
    INSERT INTO public.role_access_audit (role_id, actor_id, action, reason, before_state, after_state)
    VALUES (
      v_role.id,
      v_actor_id,
      'remove_assignment',
      NULLIF(btrim(p_reason), ''),
      jsonb_build_object('user_id', p_target_user_id, 'assigned', true, 'role_id', v_role.id),
      jsonb_build_object('user_id', p_target_user_id, 'assigned', false)
    );
  END IF;

  RETURN jsonb_build_object(
    'user_id', p_target_user_id,
    'role_id', v_role.id,
    'role_name', v_role.name,
    'removed', v_deleted,
    'legacy_profile_role_changed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_role_to_user(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_role_from_user(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_role_to_user(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_role_from_user(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.assign_role_to_user(uuid, uuid, text) IS
  'Additive, idempotent role-id assignment. Does not mutate profiles.role.';
COMMENT ON FUNCTION public.remove_role_from_user(uuid, uuid, text) IS
  'Removes only a canonical role-id assignment. Does not mutate profiles.role or legacy text assignments.';
