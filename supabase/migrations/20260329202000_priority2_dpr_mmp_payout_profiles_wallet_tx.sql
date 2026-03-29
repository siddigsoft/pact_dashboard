-- Priority 2: down_payment_requests (drop redundant policies dominated by permissive true),
-- mmp_site_entries, payout_requests, profiles SELECT, wallet_transactions SELECT.

-- -----------------------------------------------------------------------------
-- down_payment_requests: keep admin_all + admin_delete; collapse duplicate read/update/insert paths
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Role-based read access for down_payment_requests" ON public.down_payment_requests;
DROP POLICY IF EXISTS down_payment_requests_supervisor_view ON public.down_payment_requests;
DROP POLICY IF EXISTS down_payment_requests_user_view ON public.down_payment_requests;

DROP POLICY IF EXISTS "Authenticated users can insert down_payment_requests" ON public.down_payment_requests;
DROP POLICY IF EXISTS down_payment_requests_user_create ON public.down_payment_requests;

CREATE POLICY down_payment_requests_insert_authenticated
  ON public.down_payment_requests FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update down_payment_requests" ON public.down_payment_requests;
DROP POLICY IF EXISTS "Finance can set advance payment proof" ON public.down_payment_requests;
DROP POLICY IF EXISTS "Requester can confirm advance receipt" ON public.down_payment_requests;
DROP POLICY IF EXISTS down_payment_requests_supervisor_update ON public.down_payment_requests;

CREATE POLICY down_payment_requests_update_authenticated
  ON public.down_payment_requests FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- mmp_site_entries
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS mmp_site_entries_insert ON public.mmp_site_entries;
DROP POLICY IF EXISTS mse_insert_editors ON public.mmp_site_entries;

CREATE POLICY mmp_site_entries_insert_combined
  ON public.mmp_site_entries FOR INSERT
  WITH CHECK (
    (( SELECT auth.uid() AS uid) IS NOT NULL)
    OR (EXISTS (
      SELECT 1
      FROM user_roles ur
      WHERE ur.user_id = ( SELECT auth.uid() AS uid)
        AND ur.role = ANY (ARRAY['admin'::text, 'ict'::text, 'coordinator'::text, 'fom'::text])
    ))
  );

DROP POLICY IF EXISTS "Allow delete mmp_site_entries for authenticated" ON public.mmp_site_entries;
DROP POLICY IF EXISTS mmp_site_entries_delete ON public.mmp_site_entries;
DROP POLICY IF EXISTS mse_delete_editors ON public.mmp_site_entries;

CREATE POLICY mmp_site_entries_delete_combined
  ON public.mmp_site_entries FOR DELETE
  USING (
    (
      (( SELECT auth.uid() AS uid) = (accepted_by)::uuid)
      OR (accepted_by IS NULL)
    )
    OR public.is_admin_or_super()
    OR (EXISTS (
      SELECT 1
      FROM user_roles ur
      WHERE ur.user_id = ( SELECT auth.uid() AS uid)
        AND ur.role = ANY (ARRAY['admin'::text, 'ict'::text, 'coordinator'::text, 'fom'::text])
    ))
  );

DROP POLICY IF EXISTS mmp_site_entries_select ON public.mmp_site_entries;
DROP POLICY IF EXISTS mmp_site_entries_select_authenticated ON public.mmp_site_entries;

CREATE POLICY mmp_site_entries_select_combined
  ON public.mmp_site_entries FOR SELECT
  USING (
    (( SELECT auth.uid() AS uid) IS NOT NULL)
    OR (( SELECT auth.role() AS role) = 'authenticated'::text)
  );

DROP POLICY IF EXISTS mmp_site_entries_update ON public.mmp_site_entries;
DROP POLICY IF EXISTS mmp_site_entries_update_authenticated ON public.mmp_site_entries;
DROP POLICY IF EXISTS mse_update_editors ON public.mmp_site_entries;

CREATE POLICY mmp_site_entries_update_combined
  ON public.mmp_site_entries FOR UPDATE
  USING (
    (( SELECT auth.uid() AS uid) IS NOT NULL)
    OR (( SELECT auth.role() AS role) = 'authenticated'::text)
    OR (EXISTS (
      SELECT 1
      FROM user_roles ur
      WHERE ur.user_id = ( SELECT auth.uid() AS uid)
        AND ur.role = ANY (ARRAY['admin'::text, 'ict'::text, 'coordinator'::text, 'fom'::text])
    ))
  )
  WITH CHECK (
    (( SELECT auth.uid() AS uid) IS NOT NULL)
    OR (( SELECT auth.role() AS role) = 'authenticated'::text)
    OR (EXISTS (
      SELECT 1
      FROM user_roles ur
      WHERE ur.user_id = ( SELECT auth.uid() AS uid)
        AND ur.role = ANY (ARRAY['admin'::text, 'ict'::text, 'coordinator'::text, 'fom'::text])
    ))
  );

-- -----------------------------------------------------------------------------
-- payout_requests
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS payout_select ON public.payout_requests;
DROP POLICY IF EXISTS "Users can view their own payout requests" ON public.payout_requests;

CREATE POLICY payout_requests_select_combined
  ON public.payout_requests FOR SELECT
  USING (
    (user_id = ( SELECT auth.uid() AS uid))
    OR (decided_by = ( SELECT auth.uid() AS uid))
    OR public.has_role('admin'::text)
    OR public.has_role('financialAdmin'::text)
  );

-- payout UPDATE policies left as-is (distinct WITH CHECK semantics per policy)

-- -----------------------------------------------------------------------------
-- profiles: collapse duplicate SELECT (already effectively open read + service_role path)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can read profiles" ON public.profiles;
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
DROP POLICY IF EXISTS "Service role can read all profiles" ON public.profiles;

CREATE POLICY profiles_select_combined
  ON public.profiles FOR SELECT
  USING (true);

-- -----------------------------------------------------------------------------
-- wallet_transactions: merge SELECT policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS wallet_tx_select ON public.wallet_transactions;
DROP POLICY IF EXISTS wallet_tx_select_admin ON public.wallet_transactions;
DROP POLICY IF EXISTS wallet_tx_select_own_v2 ON public.wallet_transactions;

CREATE POLICY wallet_tx_select_combined
  ON public.wallet_transactions FOR SELECT
  USING (
    (user_id = ( SELECT auth.uid() AS uid))
    OR (EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = ( SELECT auth.uid() AS uid)
        AND profiles.role = ANY (ARRAY['admin'::text, 'supervisor'::text, 'financialAdmin'::text])
    ))
    OR (
      (( SELECT auth.uid() AS uid) = user_id)
      OR (EXISTS (
        SELECT 1
        FROM wallets
        WHERE wallets.id = wallet_transactions.wallet_id
          AND wallets.user_id = ( SELECT auth.uid() AS uid)
      ))
    )
  );
