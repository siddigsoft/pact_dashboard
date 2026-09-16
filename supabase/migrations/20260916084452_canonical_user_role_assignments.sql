-- Canonical multi-role assignments live separately from the legacy one-row
-- user_roles table. This preserves existing text-role policies while new
-- access code can safely use role IDs and additive assignments.

CREATE TABLE IF NOT EXISTS public.canonical_user_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_canonical_role_assignments_user
  ON public.canonical_user_role_assignments (user_id);
CREATE INDEX IF NOT EXISTS idx_canonical_role_assignments_role
  ON public.canonical_user_role_assignments (role_id);

ALTER TABLE public.canonical_user_role_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY canonical_role_assignments_read
  ON public.canonical_user_role_assignments
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR public.is_super_admin((select auth.uid()))
    OR public.profile_can_manage_user_roles((select auth.uid()))
  );

-- Copy every unambiguous legacy user_roles/profile assignment into the new
-- multi-role table. Legacy records remain unchanged for compatibility.
INSERT INTO public.canonical_user_role_assignments (user_id, role_id, assigned_at, reason)
SELECT DISTINCT source.user_id, source.role_id, source.assigned_at, 'legacy_role_backfill'
FROM (
  SELECT assignment.user_id, canonical_role.id AS role_id,
         coalesce(assignment.assigned_at, now()) AS assigned_at
    FROM public.user_roles AS assignment
    JOIN public.roles AS canonical_role
      ON canonical_role.is_active = true
     AND (
       canonical_role.id = assignment.role_id
       OR (
         assignment.role_id IS NULL
         AND lower(regexp_replace(coalesce(assignment.role, ''), '[^a-z0-9]+', '', 'g'))
             = lower(regexp_replace(canonical_role.name, '[^a-z0-9]+', '', 'g'))
       )
     )
  UNION
  SELECT profile.id, canonical_role.id, now()
    FROM public.profiles AS profile
    JOIN public.roles AS canonical_role
      ON canonical_role.is_active = true
     AND lower(regexp_replace(coalesce(profile.role, ''), '[^a-z0-9]+', '', 'g'))
         = lower(regexp_replace(canonical_role.name, '[^a-z0-9]+', '', 'g'))
   WHERE nullif(btrim(coalesce(profile.role, '')), '') IS NOT NULL
) AS source
ON CONFLICT (user_id, role_id) DO NOTHING;

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
  v_inserted_count integer := 0;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_super_admin(v_actor_id)
    OR public.profile_can_manage_user_roles(v_actor_id)
    OR EXISTS (
      SELECT 1
      FROM public.canonical_user_role_assignments assignment
      JOIN public.permissions permission ON permission.role_id = assignment.role_id
      JOIN public.roles assigned_role ON assigned_role.id = assignment.role_id AND assigned_role.is_active = true
      WHERE assignment.user_id = v_actor_id
        AND permission.resource = 'roles'
        AND permission.action = 'assign'
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to assign roles' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'Target user not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_role FROM public.roles WHERE id = p_target_role_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role not found or inactive' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.canonical_user_role_assignments (user_id, role_id, assigned_by, reason)
  VALUES (p_target_user_id, v_role.id, v_actor_id, NULLIF(btrim(p_reason), ''))
  ON CONFLICT (user_id, role_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  v_inserted := v_inserted_count > 0;

  IF v_inserted THEN
    INSERT INTO public.role_access_audit (role_id, actor_id, action, reason, before_state, after_state)
    VALUES (
      v_role.id, v_actor_id, 'assign', NULLIF(btrim(p_reason), ''),
      jsonb_build_object('user_id', p_target_user_id, 'assigned', false),
      jsonb_build_object('user_id', p_target_user_id, 'assigned', true, 'role_id', v_role.id)
    );
  END IF;

  RETURN jsonb_build_object('user_id', p_target_user_id, 'role_id', v_role.id, 'role_name', v_role.name, 'created', v_inserted);
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
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_super_admin(v_actor_id)
    OR public.profile_can_manage_user_roles(v_actor_id)
    OR EXISTS (
      SELECT 1
      FROM public.canonical_user_role_assignments assignment
      JOIN public.permissions permission ON permission.role_id = assignment.role_id
      JOIN public.roles assigned_role ON assigned_role.id = assignment.role_id AND assigned_role.is_active = true
      WHERE assignment.user_id = v_actor_id
        AND permission.resource = 'roles'
        AND permission.action = 'assign'
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to remove roles' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_role FROM public.roles WHERE id = p_target_role_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role not found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.canonical_user_role_assignments
   WHERE user_id = p_target_user_id AND role_id = p_target_role_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  v_deleted := v_deleted_count > 0;

  IF v_deleted THEN
    INSERT INTO public.role_access_audit (role_id, actor_id, action, reason, before_state, after_state)
    VALUES (
      v_role.id, v_actor_id, 'remove_assignment', NULLIF(btrim(p_reason), ''),
      jsonb_build_object('user_id', p_target_user_id, 'assigned', true, 'role_id', v_role.id),
      jsonb_build_object('user_id', p_target_user_id, 'assigned', false)
    );
  END IF;

  RETURN jsonb_build_object('user_id', p_target_user_id, 'role_id', v_role.id, 'role_name', v_role.name, 'removed', v_deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.assign_role_to_user(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_role_from_user(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_role_to_user(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_role_from_user(uuid, uuid, text) TO authenticated;
