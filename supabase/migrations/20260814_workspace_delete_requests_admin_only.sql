-- Restrict workspace delete-request review to Admin and Super Admin.
-- Folder owners and requesters can no longer approve/reject.
-- Requesters may still SELECT their own rows (status visibility).

DROP POLICY IF EXISTS wdr_select ON workspace_delete_requests;
CREATE POLICY wdr_select ON workspace_delete_requests
  FOR SELECT TO authenticated
  USING (
    requested_by = auth.uid()
    OR public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND lower(replace(p.role::text, '_', '')) IN ('admin', 'superadmin')
    )
  );

DROP POLICY IF EXISTS wdr_update_owner ON workspace_delete_requests;
CREATE POLICY wdr_update_admin ON workspace_delete_requests
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND lower(replace(p.role::text, '_', '')) IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (true);
