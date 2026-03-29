-- Priority 2: withdrawal_requests — replace FOR ALL super_admin with explicit commands; merge SELECT/UPDATE.

DROP POLICY IF EXISTS withdrawal_requests_super_admin_all ON public.withdrawal_requests;

DROP POLICY IF EXISTS "Supervisors can view all withdrawal requests" ON public.withdrawal_requests;
DROP POLICY IF EXISTS "Users can view their own withdrawal requests" ON public.withdrawal_requests;

CREATE POLICY withdrawal_requests_select_combined
  ON public.withdrawal_requests FOR SELECT
  USING (
    (EXISTS (
      SELECT 1
      FROM user_roles
      WHERE user_roles.user_id = ( SELECT auth.uid() AS uid)
        AND user_roles.role = ANY (
          ARRAY['admin'::text, 'supervisor'::text, 'fom'::text, 'financialAdmin'::text]
        )
    ))
    OR (( SELECT auth.uid() AS uid) = user_id)
    OR (( SELECT auth.uid() AS uid) IN (
      SELECT id FROM public.profiles WHERE profiles.role = 'super_admin'::text
    ))
  );

DROP POLICY IF EXISTS "Users can create their own withdrawal requests" ON public.withdrawal_requests;

CREATE POLICY withdrawal_requests_insert_combined
  ON public.withdrawal_requests FOR INSERT
  WITH CHECK (
    (user_id = ( SELECT auth.uid() AS uid))
    OR (( SELECT auth.uid() AS uid) IN (
      SELECT id FROM public.profiles WHERE profiles.role = 'super_admin'::text
    ))
  );

DROP POLICY IF EXISTS "Supervisors can approve/reject withdrawal requests" ON public.withdrawal_requests;
DROP POLICY IF EXISTS "Users can update their own pending withdrawal requests" ON public.withdrawal_requests;

CREATE POLICY withdrawal_requests_update_combined
  ON public.withdrawal_requests FOR UPDATE
  USING (
    (EXISTS (
      SELECT 1
      FROM user_roles
      WHERE user_roles.user_id = ( SELECT auth.uid() AS uid)
        AND user_roles.role = ANY (
          ARRAY['admin'::text, 'supervisor'::text, 'fom'::text, 'financialAdmin'::text]
        )
    ))
    OR ((( SELECT auth.uid() AS uid) = user_id) AND (status = 'pending'::text))
    OR (( SELECT auth.uid() AS uid) IN (
      SELECT id FROM public.profiles WHERE profiles.role = 'super_admin'::text
    ))
  )
  WITH CHECK (
    (EXISTS (
      SELECT 1
      FROM user_roles
      WHERE user_roles.user_id = ( SELECT auth.uid() AS uid)
        AND user_roles.role = ANY (
          ARRAY['admin'::text, 'supervisor'::text, 'fom'::text, 'financialAdmin'::text]
        )
    ))
    OR ((( SELECT auth.uid() AS uid) = user_id) AND (status = 'pending'::text))
    OR (( SELECT auth.uid() AS uid) IN (
      SELECT id FROM public.profiles WHERE profiles.role = 'super_admin'::text
    ))
  );

CREATE POLICY withdrawal_requests_super_admin_delete
  ON public.withdrawal_requests FOR DELETE
  USING (
    ( SELECT auth.uid() AS uid) IN (
      SELECT id FROM public.profiles WHERE profiles.role = 'super_admin'::text
    )
  );
