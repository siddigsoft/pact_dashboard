-- Keep the existing, role-aware badge implementation as the core and extend
-- its single RPC response with the two overdue-task counts that were
-- previously fetched through separate PostgREST requests on every refresh.
ALTER FUNCTION public.get_nav_badge_counts(
  text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean
) RENAME TO get_nav_badge_counts_core;

CREATE FUNCTION public.get_nav_badge_counts(
  p_hub_id text DEFAULT NULL,
  p_role_supervisor boolean DEFAULT false,
  p_role_finance boolean DEFAULT false,
  p_role_coordinator boolean DEFAULT false,
  p_role_fom_or_admin boolean DEFAULT false,
  p_role_incident boolean DEFAULT false,
  p_is_data_collector boolean DEFAULT false,
  p_include_admin_bell boolean DEFAULT false,
  p_include_fom_verified boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT public.get_nav_badge_counts_core(
    p_hub_id,
    p_role_supervisor,
    p_role_finance,
    p_role_coordinator,
    p_role_fom_or_admin,
    p_role_incident,
    p_is_data_collector,
    p_include_admin_bell,
    p_include_fom_verified
  ) || jsonb_build_object(
    'myTasksOverdue',
    CASE WHEN auth.uid() IS NULL THEN 0 ELSE
      (SELECT count(*)::int
       FROM public.personal_tasks t
       WHERE t.status NOT IN ('done', 'cancelled')
         AND t.due_date < CURRENT_DATE)
      +
      (SELECT count(*)::int
       FROM public.project_field_tasks t
       WHERE t.assigned_to = auth.uid()
         AND t.status NOT IN ('done', 'cancelled')
         AND t.due_date < CURRENT_DATE)
    END
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_nav_badge_counts(
  text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean
) TO authenticated;

COMMENT ON FUNCTION public.get_nav_badge_counts(
  text, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean
) IS 'Returns all navigation badge counts, including overdue tasks, in one request.';
