-- Make old mobile claimable SELECT finish under PostgREST timeout without an
-- app update. Per-row RLS was re-evaluating current_user_mmp_scope() and
-- resource_override_allows() for every mmp_site_entries / mmp_files row
-- (~8s seq scan → 57014). Wrap helpers in (SELECT ...) so Postgres InitPlans
-- them once per statement.

CREATE OR REPLACE FUNCTION public.resource_override_allows(p_resource text, p_action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN auth.role() = 'service_role' THEN true
    WHEN auth.uid() IS NULL THEN false
    WHEN public.is_super_admin(auth.uid()) THEN true
    ELSE coalesce(
      (
        SELECT o.is_granted
        FROM public.user_permission_overrides o
        WHERE o.user_id = auth.uid()
          AND o.resource = p_resource
          AND o.action = p_action
          AND (o.expires_at IS NULL OR o.expires_at > now())
        LIMIT 1
      ),
      true
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.resource_override_allows(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resource_override_allows(text, text) TO authenticated, service_role;

-- ── mmp_site_entries ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS mmp_site_entries_hub_scope_restrictive ON public.mmp_site_entries;
CREATE POLICY mmp_site_entries_hub_scope_restrictive
  ON public.mmp_site_entries
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    public.mmp_entry_is_in_scope(
      state,
      hub_office,
      (SELECT public.current_user_mmp_scope())
    )
  );

DROP POLICY IF EXISTS access_override_read_ceiling ON public.mmp_site_entries;
CREATE POLICY access_override_read_ceiling
  ON public.mmp_site_entries
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING ((SELECT public.resource_override_allows('mmp', 'read')));

-- Keep write ceilings InitPlan-friendly too.
DROP POLICY IF EXISTS access_override_create_ceiling ON public.mmp_site_entries;
CREATE POLICY access_override_create_ceiling
  ON public.mmp_site_entries
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.resource_override_allows('mmp', 'create')));

DROP POLICY IF EXISTS access_override_update_ceiling ON public.mmp_site_entries;
CREATE POLICY access_override_update_ceiling
  ON public.mmp_site_entries
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.resource_override_allows('mmp', 'update')))
  WITH CHECK ((SELECT public.resource_override_allows('mmp', 'update')));

DROP POLICY IF EXISTS access_override_delete_ceiling ON public.mmp_site_entries;
CREATE POLICY access_override_delete_ceiling
  ON public.mmp_site_entries
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING ((SELECT public.resource_override_allows('mmp', 'delete')));

-- ── mmp_files ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS mmp_files_hub_scope_restrictive ON public.mmp_files;
CREATE POLICY mmp_files_hub_scope_restrictive
  ON public.mmp_files
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    NOT coalesce(
      (((SELECT public.current_user_mmp_scope()) ->> 'hub_scoped')::boolean),
      false
    )
    OR EXISTS (
      SELECT 1
      FROM public.mmp_site_entries e
      WHERE e.mmp_file_id = mmp_files.id
        AND public.mmp_entry_is_in_scope(
          e.state,
          e.hub_office,
          (SELECT public.current_user_mmp_scope())
        )
    )
  );

DROP POLICY IF EXISTS access_override_read_ceiling ON public.mmp_files;
CREATE POLICY access_override_read_ceiling
  ON public.mmp_files
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING ((SELECT public.resource_override_allows('mmp', 'read')));

DROP POLICY IF EXISTS access_override_create_ceiling ON public.mmp_files;
CREATE POLICY access_override_create_ceiling
  ON public.mmp_files
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.resource_override_allows('mmp', 'create')));

DROP POLICY IF EXISTS access_override_update_ceiling ON public.mmp_files;
CREATE POLICY access_override_update_ceiling
  ON public.mmp_files
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.resource_override_allows('mmp', 'update')))
  WITH CHECK ((SELECT public.resource_override_allows('mmp', 'update')));

DROP POLICY IF EXISTS access_override_delete_ceiling ON public.mmp_files;
CREATE POLICY access_override_delete_ceiling
  ON public.mmp_files
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING ((SELECT public.resource_override_allows('mmp', 'delete')));
