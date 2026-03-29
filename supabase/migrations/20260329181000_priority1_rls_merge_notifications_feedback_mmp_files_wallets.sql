-- Priority 1 (continued): merge overlapping permissive policies using OR (same net access).

-- -----------------------------------------------------------------------------
-- notifications: two SELECT policies → one
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS notifications_read_own ON public.notifications;
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;

CREATE POLICY notifications_select_combined
  ON public.notifications FOR SELECT
  USING (
    ((( SELECT auth.uid() AS uid) = recipient_id) OR (( SELECT auth.uid() AS uid) = user_id))
    OR
    (
      ((recipient_id IS NOT NULL) AND (recipient_id = ( SELECT auth.uid() AS uid)))
      OR ((user_id IS NOT NULL) AND (user_id = ( SELECT auth.uid() AS uid)))
      OR (
        (entity_type = ANY (ARRAY['mmpFile'::text, 'siteVisit'::text]))
        AND (event_type = ANY (ARRAY['system'::text, 'assignments'::text, 'approvals'::text]))
        AND (EXISTS (
          SELECT 1
          FROM profiles
          WHERE profiles.id = ( SELECT auth.uid() AS uid)
            AND profiles.role = ANY (
              ARRAY['admin'::text, 'Admin'::text, 'super_admin'::text, 'superAdmin'::text, 'SuperAdmin'::text]
            )
        ))
      )
    )
  );

-- -----------------------------------------------------------------------------
-- feedback: admin + own/anonymous SELECT → one
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS feedback_select_admin ON public.feedback;
DROP POLICY IF EXISTS feedback_select_own ON public.feedback;

CREATE POLICY feedback_select_combined
  ON public.feedback FOR SELECT
  USING (
    (EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = ( SELECT auth.uid() AS uid)
        AND profiles.role = ANY (ARRAY['admin'::text, 'superAdmin'::text, 'ictSupport'::text])
    ))
    OR ((( SELECT auth.uid() AS uid) = user_id) OR (( SELECT auth.uid() AS uid) IS NULL))
  );

-- -----------------------------------------------------------------------------
-- mmp_files: mf_select_authenticated is redundant with "Allow read for all" (USING true)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS mf_select_authenticated ON public.mmp_files;

-- -----------------------------------------------------------------------------
-- wallets: merge SELECT / INSERT / UPDATE pairs (keep wallets_manage_admin FOR ALL)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS wallets_select ON public.wallets;
DROP POLICY IF EXISTS wallets_select_admin ON public.wallets;

CREATE POLICY wallets_select_combined
  ON public.wallets FOR SELECT
  USING (
    (user_id = ( SELECT auth.uid() AS uid))
    OR (EXISTS (
      SELECT 1
      FROM user_roles
      WHERE user_roles.user_id = ( SELECT auth.uid() AS uid)
        AND user_roles.role = ANY (ARRAY['admin'::text, 'supervisor'::text, 'fom'::text])
    ))
  );

DROP POLICY IF EXISTS "Users can insert their own wallet" ON public.wallets;
DROP POLICY IF EXISTS wallets_insert_admin ON public.wallets;

CREATE POLICY wallets_insert_combined
  ON public.wallets FOR INSERT
  WITH CHECK (
    (user_id = ( SELECT auth.uid() AS uid))
    OR public.has_role('admin'::text)
    OR public.has_role('financialAdmin'::text)
  );

DROP POLICY IF EXISTS wallets_update_own ON public.wallets;
DROP POLICY IF EXISTS wallets_update_admin ON public.wallets;

CREATE POLICY wallets_update_combined
  ON public.wallets FOR UPDATE
  USING (
    (user_id = ( SELECT auth.uid() AS uid))
    OR public.has_role('admin'::text)
    OR public.has_role('financialAdmin'::text)
  )
  WITH CHECK (
    (user_id = ( SELECT auth.uid() AS uid))
    OR public.has_role('admin'::text)
    OR public.has_role('financialAdmin'::text)
  );
