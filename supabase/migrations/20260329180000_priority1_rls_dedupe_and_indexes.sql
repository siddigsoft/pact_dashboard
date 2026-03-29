-- Priority 1 completion: remaining duplicate index, wallets_backup PK, and RLS deduplication
-- (merge identical permissive policies; split approval_requests ALL vs SELECT; consolidate wallet_settings
-- and site_visit_costs FOR ALL pairs). Semantics: permissive policies combine with OR; dropping a
-- duplicate of the same expression does not change effective access.

-- -----------------------------------------------------------------------------
-- Indexes / constraints
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.notifications_user_id_idx1;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'wallets_backup'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.wallets_backup'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.wallets_backup ADD PRIMARY KEY (id);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Exact duplicate policies (same USING / WITH CHECK as another policy on table+cmd)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow service role to insert audit logs" ON public.audit_logs;

DROP POLICY IF EXISTS chat_messages_select_participant ON public.chat_messages;

DROP POLICY IF EXISTS "Authenticated users can read down_payment_requests" ON public.down_payment_requests;

DROP POLICY IF EXISTS hub_states_select ON public.hub_states;

DROP POLICY IF EXISTS hubs_select ON public.hubs;

DROP POLICY IF EXISTS sites_select ON public.sites_registry;

DROP POLICY IF EXISTS mse_select_authenticated ON public.mmp_site_entries;

DROP POLICY IF EXISTS "Service role inserts" ON public.notifications;

DROP POLICY IF EXISTS payout_insert_self ON public.payout_requests;

DROP POLICY IF EXISTS wallets_select_own ON public.wallets;

-- -----------------------------------------------------------------------------
-- approval_requests: one SELECT policy; separate super_admin mutations (replaces FOR ALL + SELECT)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS approval_requests_superadmin ON public.approval_requests;
DROP POLICY IF EXISTS approval_requests_self_read ON public.approval_requests;

CREATE POLICY approval_requests_select
  ON public.approval_requests FOR SELECT
  USING (
    public.is_super_admin()
    OR (requested_by = (SELECT auth.uid()))
  );

CREATE POLICY approval_requests_superadmin_insert
  ON public.approval_requests FOR INSERT
  WITH CHECK (public.is_super_admin());

CREATE POLICY approval_requests_superadmin_update
  ON public.approval_requests FOR UPDATE
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY approval_requests_superadmin_delete
  ON public.approval_requests FOR DELETE
  USING (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- wallet_settings: replace overlapping FOR ALL + per-cmd policies with a single FOR ALL
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS wallet_settings_manage_own ON public.wallet_settings;
DROP POLICY IF EXISTS wallet_settings_modify_own ON public.wallet_settings;
DROP POLICY IF EXISTS wallet_settings_insert_own ON public.wallet_settings;
DROP POLICY IF EXISTS wallet_settings_delete_own_v2 ON public.wallet_settings;
DROP POLICY IF EXISTS wallet_settings_select_own_v2 ON public.wallet_settings;
DROP POLICY IF EXISTS wallet_settings_update_own_v2 ON public.wallet_settings;

CREATE POLICY wallet_settings_own_all
  ON public.wallet_settings FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- -----------------------------------------------------------------------------
-- site_visit_costs: merge two FOR ALL policies (same role families, different user_roles shapes);
-- drop redundant SELECT (USING true already allows all readers)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and supervisors can manage site visit costs" ON public.site_visit_costs;
DROP POLICY IF EXISTS "Supervisors can manage site visit costs" ON public.site_visit_costs;
DROP POLICY IF EXISTS "Users can view site visit costs for their assigned visits" ON public.site_visit_costs;

CREATE POLICY site_visit_costs_roles_manage_all
  ON public.site_visit_costs FOR ALL
  USING (
    (EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = (SELECT auth.uid())
        AND (r.name)::text = ANY (
          ARRAY['admin','supervisor','coordinator','financialAdmin']::text[]
        )
    ))
    OR
    (EXISTS (
      SELECT 1
      FROM user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
        AND user_roles.role = ANY (
          ARRAY['admin','supervisor','fom','financialAdmin']::text[]
        )
    ))
  );
