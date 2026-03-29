-- Applied on remote as: rls_initplan_policy_batch
-- auth_rls_initplan: replace bare auth.role() / auth.uid() with (select ...) on listed policies.

DROP POLICY IF EXISTS "Service role can read all profiles" ON public.profiles;
CREATE POLICY "Service role can read all profiles"
  ON public.profiles FOR SELECT
  USING ((select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Service role can update profiles" ON public.profiles;
CREATE POLICY "Service role can update profiles"
  ON public.profiles FOR UPDATE
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
CREATE POLICY profiles_select_authenticated
  ON public.profiles FOR SELECT
  USING ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS roles_select_all_auth ON public.roles;
CREATE POLICY roles_select_all_auth
  ON public.roles FOR SELECT
  USING ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS permissions_select_all_auth ON public.permissions;
CREATE POLICY permissions_select_all_auth
  ON public.permissions FOR SELECT
  USING ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS chats_select_all_auth ON public.chats;
CREATE POLICY chats_select_all_auth
  ON public.chats FOR SELECT
  USING ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS chats_insert_creator ON public.chats;
CREATE POLICY chats_insert_creator
  ON public.chats FOR INSERT
  WITH CHECK (created_by = (select auth.uid()));

DROP POLICY IF EXISTS project_activities_all_auth ON public.project_activities;
CREATE POLICY project_activities_all_auth
  ON public.project_activities FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS sub_activities_all_auth ON public.sub_activities;
CREATE POLICY sub_activities_all_auth
  ON public.sub_activities FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS user_settings_insert_own ON public.user_settings;
CREATE POLICY user_settings_insert_own
  ON public.user_settings FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS wallet_settings_insert_own ON public.wallet_settings;
CREATE POLICY wallet_settings_insert_own
  ON public.wallet_settings FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert their own incident reports" ON public.incident_reports;
CREATE POLICY "Users can insert their own incident reports"
  ON public.incident_reports FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS location_logs_insert_own ON public.location_logs;
CREATE POLICY location_logs_insert_own
  ON public.location_logs FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Allow delete reports for authenticated" ON public.reports;
CREATE POLICY "Allow delete reports for authenticated"
  ON public.reports FOR DELETE
  USING ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Allow insert reports for authenticated" ON public.reports;
CREATE POLICY "Allow insert reports for authenticated"
  ON public.reports FOR INSERT
  WITH CHECK ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Allow select reports for authenticated" ON public.reports;
CREATE POLICY "Allow select reports for authenticated"
  ON public.reports FOR SELECT
  USING ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Allow update reports for authenticated" ON public.reports;
CREATE POLICY "Allow update reports for authenticated"
  ON public.reports FOR UPDATE
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Allow delete report_photos for authenticated" ON public.report_photos;
CREATE POLICY "Allow delete report_photos for authenticated"
  ON public.report_photos FOR DELETE
  USING ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Allow insert report_photos for authenticated" ON public.report_photos;
CREATE POLICY "Allow insert report_photos for authenticated"
  ON public.report_photos FOR INSERT
  WITH CHECK ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Allow select report_photos for authenticated" ON public.report_photos;
CREATE POLICY "Allow select report_photos for authenticated"
  ON public.report_photos FOR SELECT
  USING ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Allow update report_photos for authenticated" ON public.report_photos;
CREATE POLICY "Allow update report_photos for authenticated"
  ON public.report_photos FOR UPDATE
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Allow insert site_locations for authenticated" ON public.site_locations;
CREATE POLICY "Allow insert site_locations for authenticated"
  ON public.site_locations FOR INSERT
  WITH CHECK (
    (select auth.role()) = 'authenticated'
    AND user_id = (select auth.uid())
  );

DROP POLICY IF EXISTS "Allow select site_locations for authenticated" ON public.site_locations;
CREATE POLICY "Allow select site_locations for authenticated"
  ON public.site_locations FOR SELECT
  USING ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Users can insert their own wallet" ON public.wallets;
CREATE POLICY "Users can insert their own wallet"
  ON public.wallets FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS wallet_transactions_insert_admin ON public.wallet_transactions;
CREATE POLICY wallet_transactions_insert_admin
  ON public.wallet_transactions FOR INSERT
  WITH CHECK ((
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
        AND profiles.role = ANY (ARRAY['admin'::text, 'supervisor'::text, 'financialAdmin'::text])
    )
  ));

DROP POLICY IF EXISTS wallet_transactions_insert_visit_completion ON public.wallet_transactions;
CREATE POLICY wallet_transactions_insert_visit_completion
  ON public.wallet_transactions FOR INSERT
  WITH CHECK (
    (select auth.uid()) = user_id
    AND type = 'earning'::wallet_tx_type
    AND (status = ANY (ARRAY['pending'::wallet_tx_status, 'posted'::wallet_tx_status]))
    AND CASE
      WHEN amount_cents IS NOT NULL THEN amount_cents > 0
      ELSE COALESCE(amount, 0::numeric) > 0::numeric
    END
  );

DROP POLICY IF EXISTS wallet_tx_insert_earning_self_or_admin ON public.wallet_transactions;
CREATE POLICY wallet_tx_insert_earning_self_or_admin
  ON public.wallet_transactions FOR INSERT
  WITH CHECK (
    (type = 'earning'::wallet_tx_type AND user_id = (select auth.uid()))
    OR has_role('admin'::text)
    OR has_role('financialAdmin'::text)
  );

DROP POLICY IF EXISTS budget_alerts_all_auth ON public.budget_alerts;
CREATE POLICY budget_alerts_all_auth ON public.budget_alerts FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS budget_transactions_all_auth ON public.budget_transactions;
CREATE POLICY budget_transactions_all_auth ON public.budget_transactions FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS project_budgets_all_auth ON public.project_budgets;
CREATE POLICY project_budgets_all_auth ON public.project_budgets FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS mmp_budgets_all_auth ON public.mmp_budgets;
CREATE POLICY mmp_budgets_all_auth ON public.mmp_budgets FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS wallet_balances_all_auth ON public.wallet_balances;
CREATE POLICY wallet_balances_all_auth ON public.wallet_balances FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS cost_adjustment_audit_view ON public.cost_adjustment_audit;
CREATE POLICY cost_adjustment_audit_view ON public.cost_adjustment_audit FOR SELECT
  USING ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS document_index_all_auth ON public.document_index;
CREATE POLICY document_index_all_auth ON public.document_index FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS site_visit_photos_all_auth ON public.site_visit_photos;
CREATE POLICY site_visit_photos_all_auth ON public.site_visit_photos FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS state_permits_all_auth ON public.state_permits;
CREATE POLICY state_permits_all_auth ON public.state_permits FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS local_permits_all_auth ON public.local_permits;
CREATE POLICY local_permits_all_auth ON public.local_permits FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS federal_permits_all_auth ON public.federal_permits;
CREATE POLICY federal_permits_all_auth ON public.federal_permits FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Authorized roles can create operational cost submissions" ON public.operational_cost_submissions;
CREATE POLICY "Authorized roles can create operational cost submissions"
  ON public.operational_cost_submissions FOR INSERT
  WITH CHECK (
    (select auth.uid()) = submitted_by
    AND can_submit_operational_costs()
  );

DROP POLICY IF EXISTS super_admins_insert_policy ON public.super_admins;
CREATE POLICY super_admins_insert_policy
  ON public.super_admins FOR INSERT TO authenticated
  WITH CHECK ((
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role = ANY (ARRAY[
          'superAdmin'::text, 'SuperAdmin'::text, 'super_admin'::text,
          'admin'::text, 'Admin'::text, 'ict'::text, 'ICT'::text
        ])
    )
  ));
