-- Applied on remote as: rls_initplan_policy_batch2b
-- auth_rls_initplan (final batch in this series).

DROP POLICY IF EXISTS "Users can insert into offline queue" ON public.offline_call_queue;
CREATE POLICY "Users can insert into offline queue"
  ON public.offline_call_queue FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert favorites" ON public.favorite_contacts;
CREATE POLICY "Users can insert favorites"
  ON public.favorite_contacts FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert DND settings" ON public.dnd_settings;
CREATE POLICY "Users can insert DND settings"
  ON public.dnd_settings FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert emergency contacts" ON public.emergency_contacts;
CREATE POLICY "Users can insert emergency contacts"
  ON public.emergency_contacts FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can create their own withdrawal requests" ON public.withdrawal_requests;
CREATE POLICY "Users can create their own withdrawal requests"
  ON public.withdrawal_requests FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS superadmin_overrides_insert ON public.action_status_overrides;
CREATE POLICY superadmin_overrides_insert
  ON public.action_status_overrides FOR INSERT
  WITH CHECK (
    is_super_admin()
    AND set_by = (select auth.uid())
  );

DROP POLICY IF EXISTS superadmin_query_log_insert ON public.dashboard_query_log;
CREATE POLICY superadmin_query_log_insert
  ON public.dashboard_query_log FOR INSERT
  WITH CHECK (
    is_super_admin()
    AND queried_by = (select auth.uid())
  );

DROP POLICY IF EXISTS approval_requests_self_read ON public.approval_requests;
CREATE POLICY approval_requests_self_read
  ON public.approval_requests FOR SELECT
  USING (requested_by = (select auth.uid()));

DROP POLICY IF EXISTS user_activity_logs_insert_policy ON public.user_activity_logs;
CREATE POLICY user_activity_logs_insert_policy
  ON public.user_activity_logs FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Admins can insert user_classifications" ON public.user_classifications;
CREATE POLICY "Admins can insert user_classifications"
  ON public.user_classifications FOR INSERT TO authenticated
  WITH CHECK ((
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
        AND profiles.role = ANY (ARRAY[
          'admin'::text, 'super_admin'::text, 'superadmin'::text, 'superAdmin'::text, 'ict'::text
        ])
    )
  ));

DROP POLICY IF EXISTS cost_adjustment_audit_admin_create ON public.cost_adjustment_audit;
CREATE POLICY cost_adjustment_audit_admin_create
  ON public.cost_adjustment_audit FOR INSERT
  WITH CHECK ((
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
        AND profiles.role = ANY (ARRAY['admin'::text, 'financialAdmin'::text, 'ict'::text])
    )
  ));
