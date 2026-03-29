-- Priority 1 (continued): merge overlapping policies on chat_messages, checklists, coordinator permits, digital_signatures.

-- -----------------------------------------------------------------------------
-- chat_messages: duplicate INSERT policies (equivalent WITH CHECK)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert messages in their chats" ON public.chat_messages;
DROP POLICY IF EXISTS chat_messages_insert_participant ON public.chat_messages;

CREATE POLICY chat_messages_insert_combined
  ON public.chat_messages FOR INSERT
  WITH CHECK (
    (sender_id = ( SELECT auth.uid() AS uid))
    AND (EXISTS (
      SELECT 1
      FROM chat_participants cp
      WHERE cp.chat_id = chat_messages.chat_id
        AND cp.user_id = ( SELECT auth.uid() AS uid)
    ))
  );

-- -----------------------------------------------------------------------------
-- comprehensive_monitoring_checklists: admin + own SELECT
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view all checklists" ON public.comprehensive_monitoring_checklists;
DROP POLICY IF EXISTS "Users can view own checklists" ON public.comprehensive_monitoring_checklists;

CREATE POLICY comprehensive_monitoring_checklists_select_combined
  ON public.comprehensive_monitoring_checklists FOR SELECT
  USING (
    (EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = ( SELECT auth.uid() AS uid)
        AND profiles.role = ANY (ARRAY['admin'::text, 'supervisor'::text, 'coordinator'::text])
    ))
    OR (( SELECT auth.uid() AS uid) = user_id)
  );

-- -----------------------------------------------------------------------------
-- coordinator_locality_permits: SELECT and UPDATE admin + own
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS coordinator_locality_permits_select_admin ON public.coordinator_locality_permits;
DROP POLICY IF EXISTS coordinator_locality_permits_select_own ON public.coordinator_locality_permits;

CREATE POLICY coordinator_locality_permits_select_combined
  ON public.coordinator_locality_permits FOR SELECT
  USING (
    (EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = ( SELECT auth.uid() AS uid)
        AND lower(COALESCE(p.role, ''::text)) = ANY (
          ARRAY[
            'admin'::text,
            'super_admin'::text,
            'superadmin'::text,
            'fom'::text,
            'field operation manager (fom)'::text,
            'field operations manager'::text,
            'ict'::text
          ]
        )
    ))
    OR (( SELECT auth.uid() AS uid) = coordinator_id)
  );

DROP POLICY IF EXISTS coordinator_locality_permits_update_admin ON public.coordinator_locality_permits;
DROP POLICY IF EXISTS coordinator_locality_permits_update_own ON public.coordinator_locality_permits;

CREATE POLICY coordinator_locality_permits_update_combined
  ON public.coordinator_locality_permits FOR UPDATE
  USING (
    (EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = ( SELECT auth.uid() AS uid)
        AND lower(COALESCE(p.role, ''::text)) = ANY (
          ARRAY[
            'admin'::text,
            'super_admin'::text,
            'superadmin'::text,
            'fom'::text,
            'field operation manager (fom)'::text,
            'field operations manager'::text,
            'ict'::text
          ]
        )
    ))
    OR (( SELECT auth.uid() AS uid) = coordinator_id)
  )
  WITH CHECK (
    (EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = ( SELECT auth.uid() AS uid)
        AND lower(COALESCE(p.role, ''::text)) = ANY (
          ARRAY[
            'admin'::text,
            'super_admin'::text,
            'superadmin'::text,
            'fom'::text,
            'field operation manager (fom)'::text,
            'field operations manager'::text,
            'ict'::text
          ]
        )
    ))
    OR (( SELECT auth.uid() AS uid) = coordinator_id)
  );

-- -----------------------------------------------------------------------------
-- digital_signatures: admin + own for SELECT and UPDATE
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view all signatures" ON public.digital_signatures;
DROP POLICY IF EXISTS "Users can view own signatures" ON public.digital_signatures;

CREATE POLICY digital_signatures_select_combined
  ON public.digital_signatures FOR SELECT
  USING (
    (EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = ( SELECT auth.uid() AS uid)
        AND (r.name)::text = ANY (ARRAY['admin'::text, 'super_admin'::text])
    ))
    OR (( SELECT auth.uid() AS uid) = user_id)
  );

DROP POLICY IF EXISTS "Admins can update all signatures" ON public.digital_signatures;
DROP POLICY IF EXISTS "Users can update own signatures" ON public.digital_signatures;

CREATE POLICY digital_signatures_update_combined
  ON public.digital_signatures FOR UPDATE
  USING (
    (EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = ( SELECT auth.uid() AS uid)
        AND (r.name)::text = ANY (ARRAY['admin'::text, 'super_admin'::text])
    ))
    OR (( SELECT auth.uid() AS uid) = user_id)
  )
  WITH CHECK (
    (EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = ( SELECT auth.uid() AS uid)
        AND (r.name)::text = ANY (ARRAY['admin'::text, 'super_admin'::text])
    ))
    OR (( SELECT auth.uid() AS uid) = user_id)
  );
