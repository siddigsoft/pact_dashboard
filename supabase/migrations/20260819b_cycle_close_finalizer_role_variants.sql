-- Keep the database close authorization aligned with the Cycle Close UI.
-- The app normalizes "Super Administrator" / "superadministrator" as Super
-- Admin, so this SECURITY DEFINER RPC must recognize those stored role values.

CREATE OR REPLACE FUNCTION public.close_mmp_and_lock_incentives(
  p_mmp_id      uuid,
  p_skip_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        uuid        := auth.uid();
  v_is_authorized  boolean     := false;
  v_now            timestamptz := now();
  v_already_closed timestamptz;
  v_snap_id        uuid;
  v_snap_status    text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  -- Keep final-close authorization aligned with the Cycle Close role flags:
  -- primary role, additional_roles, and user_roles are all valid role sources.
  -- Normalization handles spaces, punctuation, snake_case, and camelCase.
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_user_id
      AND (
        regexp_replace(lower(trim(coalesce(p.role, ''))), '[^a-z0-9]+', '', 'g') IN (
          'superadmin',
          'superadministrator',
          'admin',
          'fom',
          'fieldoperationmanager',
          'fieldoperationmanagerfom',
          'fieldoperationsmanager',
          'countrydirector',
          'director',
          'ict'
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(p.additional_roles) = 'array' THEN p.additional_roles
              ELSE '[]'::jsonb
            END
          ) AS r
          WHERE regexp_replace(lower(trim(coalesce(r->>'role', ''))), '[^a-z0-9]+', '', 'g') IN (
            'superadmin',
            'superadministrator',
            'admin',
            'fom',
            'fieldoperationmanager',
            'fieldoperationmanagerfom',
            'fieldoperationsmanager',
            'countrydirector',
            'director',
            'ict'
          )
        )
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_user_id
      AND regexp_replace(lower(trim(coalesce(ur.role::text, ''))), '[^a-z0-9]+', '', 'g') IN (
        'superadmin',
        'superadministrator',
        'admin',
        'fom',
        'fieldoperationmanager',
        'fieldoperationmanagerfom',
        'fieldoperationsmanager',
        'countrydirector',
        'director',
        'ict'
      )
  )
  INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Only FOM / Director / Admin / Super Admin can close a cycle'
    );
  END IF;

  SELECT cycle_closed_at INTO v_already_closed
  FROM public.mmp_files
  WHERE id = p_mmp_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'MMP not found');
  END IF;

  IF v_already_closed IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Cycle is already closed (closed at ' || v_already_closed::text || '). Use the reopen flow if a correction is needed.'
    );
  END IF;

  UPDATE public.mmp_files
  SET
    cycle_status    = 'closed',
    cycle_closed_at = v_now,
    cycle_closed_by = v_user_id,
    updated_at      = v_now
  WHERE id = p_mmp_id;

  BEGIN
    SELECT id, status
    INTO   v_snap_id, v_snap_status
    FROM   public.mmp_incentive_snapshots
    WHERE  mmp_id = p_mmp_id
    LIMIT  1;

    IF v_snap_id IS NOT NULL THEN
      IF v_snap_status = 'pre_approved' THEN
        UPDATE public.mmp_incentive_snapshots
        SET
          status      = 'approved',
          approved_at = v_now,
          locked_at   = v_now,
          updated_at  = v_now
        WHERE id = v_snap_id;
      END IF;
    ELSE
      INSERT INTO public.mmp_incentive_snapshots (
        mmp_id,
        status,
        skipped,
        skipped_reason,
        total_dc_fee_pool_cents,
        total_bonus_cents,
        created_at,
        updated_at
      ) VALUES (
        p_mmp_id,
        'approved',
        true,
        COALESCE(
          NULLIF(trim(p_skip_reason), ''),
          'Cycle closed without incentive pre-approval (admin confirmed)'
        ),
        0,
        0,
        v_now,
        v_now
      );
    END IF;
  EXCEPTION
    WHEN undefined_table OR undefined_column THEN
      NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'closed_at', v_now::text);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- The inline exception RPC uses these helpers. Recreate them with the same
-- normalization rule so "Field Operation Manager (FOM)" is accepted on every
-- Cycle Close action, not only on Final Close.
CREATE OR REPLACE FUNCTION public.is_cycle_exception_executor(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_uid
      AND (
        regexp_replace(lower(coalesce(p.role, '')), '[^a-z0-9]+', '', 'g') IN (
          'superadmin', 'superadministrator', 'admin',
          'finance', 'financialadmin', 'financeadmin', 'accountant',
          'fom', 'fieldoperationmanager', 'fieldoperationmanagerfom', 'fieldoperationsmanager'
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(p.additional_roles) = 'array'
                 THEN p.additional_roles ELSE '[]'::jsonb END
          ) AS r
          WHERE regexp_replace(lower(coalesce(r->>'role', '')), '[^a-z0-9]+', '', 'g') IN (
            'superadmin', 'superadministrator', 'admin',
            'finance', 'financialadmin', 'financeadmin', 'accountant',
            'fom', 'fieldoperationmanager', 'fieldoperationmanagerfom', 'fieldoperationsmanager'
          )
        )
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_uid
      AND regexp_replace(lower(coalesce(ur.role::text, '')), '[^a-z0-9]+', '', 'g') IN (
        'superadmin', 'superadministrator', 'admin',
        'finance', 'financialadmin', 'financeadmin', 'accountant',
        'fom', 'fieldoperationmanager', 'fieldoperationmanagerfom', 'fieldoperationsmanager'
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.is_cycle_exception_super_admin(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_uid
      AND (
        regexp_replace(lower(coalesce(p.role, '')), '[^a-z0-9]+', '', 'g')
          IN ('superadmin', 'superadministrator')
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(p.additional_roles) = 'array'
                 THEN p.additional_roles ELSE '[]'::jsonb END
          ) AS r
          WHERE regexp_replace(lower(coalesce(r->>'role', '')), '[^a-z0-9]+', '', 'g')
            IN ('superadmin', 'superadministrator')
        )
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_uid
      AND regexp_replace(lower(coalesce(ur.role::text, '')), '[^a-z0-9]+', '', 'g')
        IN ('superadmin', 'superadministrator')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_cycle_exception_manager(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_uid
      AND (
        regexp_replace(lower(coalesce(p.role, '')), '[^a-z0-9]+', '', 'g') IN (
          'superadmin', 'superadministrator', 'admin',
          'fom', 'fieldoperationmanager', 'fieldoperationmanagerfom', 'fieldoperationsmanager'
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(p.additional_roles) = 'array'
                 THEN p.additional_roles ELSE '[]'::jsonb END
          ) AS r
          WHERE regexp_replace(lower(coalesce(r->>'role', '')), '[^a-z0-9]+', '', 'g') IN (
            'superadmin', 'superadministrator', 'admin',
            'fom', 'fieldoperationmanager', 'fieldoperationmanagerfom', 'fieldoperationsmanager'
          )
        )
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_uid
      AND regexp_replace(lower(coalesce(ur.role::text, '')), '[^a-z0-9]+', '', 'g') IN (
        'superadmin', 'superadministrator', 'admin',
        'fom', 'fieldoperationmanager', 'fieldoperationmanagerfom', 'fieldoperationsmanager'
      )
  )
$$;

GRANT EXECUTE ON FUNCTION public.close_mmp_and_lock_incentives(uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.close_mmp_and_lock_incentives(uuid, text) IS
  'Atomically closes an MMP cycle and locks its incentive snapshot. '
  'Server authorization normalizes supported finalizer roles across profile, additional_roles, and user_roles.';