-- Priority 2: audit_logs (effective access already dominated by permissive true / broad read)
-- and operational_cost_submissions (drop redundant super_admin FOR ALL; merge SELECT + DELETE).

-- -----------------------------------------------------------------------------
-- audit_logs: single INSERT + single SELECT (same net access as before: open insert + open read)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated users to insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Users can insert own audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS admin_insert_system_audit_logs ON public.audit_logs;
DROP POLICY IF EXISTS authenticated_insert_own_audit_logs ON public.audit_logs;

CREATE POLICY audit_logs_insert_authenticated
  ON public.audit_logs FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can read all audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins can read audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow authenticated users to read audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Super admins can read audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS admin_select_all_audit_logs ON public.audit_logs;
DROP POLICY IF EXISTS authenticated_select_own_audit_logs ON public.audit_logs;

CREATE POLICY audit_logs_select_authenticated
  ON public.audit_logs FOR SELECT
  USING (true);

-- -----------------------------------------------------------------------------
-- operational_cost_submissions: remove redundant super_admin FOR ALL (covered by other policies)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS operational_cost_submissions_super_admin_all ON public.operational_cost_submissions;

-- Merge SELECT (admin / supervisors-FOM / own submitter)
DROP POLICY IF EXISTS "Admins can view all operational cost submissions" ON public.operational_cost_submissions;
DROP POLICY IF EXISTS "Supervisors and FOM can view operational cost submissions" ON public.operational_cost_submissions;
DROP POLICY IF EXISTS "Users can view own operational cost submissions" ON public.operational_cost_submissions;

CREATE POLICY operational_cost_submissions_select_combined
  ON public.operational_cost_submissions FOR SELECT
  USING (
    public.is_admin_or_super_admin()
    OR (( SELECT auth.uid() AS uid) = submitted_by)
    OR (EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = ( SELECT auth.uid() AS uid)
        AND p.role = ANY (
          ARRAY[
            'Field Operation Manager (FOM)'::text,
            'fom'::text,
            'Country Director'::text,
            'country_director'::text
          ]
        )
    ))
    OR (EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = ( SELECT auth.uid() AS uid)
        AND p.role = ANY (ARRAY['hubSupervisor'::text, 'supervisor'::text])
        AND (
          p.hub_id = operational_cost_submissions.hub_id
          OR (p.location ->> 'secondary_hub_id'::text) = operational_cost_submissions.hub_id
        )
    ))
  );

-- Merge DELETE (admins vs own pending)
DROP POLICY IF EXISTS "Admins can delete operational cost submissions" ON public.operational_cost_submissions;
DROP POLICY IF EXISTS "Users can delete own pending operational cost submissions" ON public.operational_cost_submissions;

CREATE POLICY operational_cost_submissions_delete_combined
  ON public.operational_cost_submissions FOR DELETE
  USING (
    (EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = ( SELECT auth.uid() AS uid)
        AND p.role = ANY (
          ARRAY[
            'admin'::text,
            'Admin'::text,
            'SuperAdmin'::text,
            'superAdmin'::text,
            'super_admin'::text,
            'Super Admin'::text
          ]
        )
    ))
    OR (
      (( SELECT auth.uid() AS uid) = submitted_by)
      AND (status = 'pending'::text)
      AND (tier1_status = 'pending'::text)
    )
  );
