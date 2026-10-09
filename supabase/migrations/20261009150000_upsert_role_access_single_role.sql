-- canonical_user_role_assignments is unique on user_id (one role per person), so
-- upsert_role_access must replace the existing assignment instead of targeting (user_id, role_id).
DO $$
DECLARE
  v_def text;
  v_old text := 'on conflict (user_id, role_id) do nothing;';
  v_new text := 'on conflict (user_id) do update
      set role_id = excluded.role_id,
          assigned_by = excluded.assigned_by,
          reason = excluded.reason,
          assigned_at = now();';
BEGIN
  SELECT pg_get_functiondef('public.upsert_role_access(jsonb)'::regprocedure) INTO v_def;
  IF position(v_old IN v_def) = 0 THEN
    IF position('on conflict (user_id) do update' IN v_def) > 0 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'upsert_role_access: expected ON CONFLICT clause not found';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$$;
