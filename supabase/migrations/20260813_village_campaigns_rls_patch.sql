-- ============================================================
-- Village Campaigns RLS hardening — patch
-- Replaces the permissive "allow all authenticated" write
-- policies on adhoc_daily_logs and adhoc_village_teams with
-- server-side enforcement:
--   - adhoc_daily_logs  INSERT/UPDATE: only the team lead of
--     the assigned team may submit/edit, plus ops/admin staff.
--   - adhoc_village_teams INSERT/UPDATE/DELETE: ops/admin only
--     (team leads are read-only for their own assignments).
-- ============================================================

-- ── Helper: is the calling user an ops/admin role? ────────────────────────────

CREATE OR REPLACE FUNCTION is_village_campaign_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  -- Matches all role variants that can manage Village Campaigns on the web
  -- (MMP.tsx: isAdmin / isFOM / isSupervisor / isCoordinator / isICT / isDataTeam).
  -- Uses lower() normalization so case differences in stored role strings
  -- (e.g. 'Admin', 'admin', 'SuperAdmin') are all covered.
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND lower(role) IN (
        -- Super Admin / Admin variants
        'super_admin', 'superadmin', 'super admin', 'admin',
        -- FOM variants
        'fom', 'field operation manager', 'field operation manager (fom)',
        -- Supervisor variants
        'supervisor', 'hubsupervisor', 'hub_supervisor',
        -- Coordinator variants
        'coordinator', 'field_coordinator', 'state_coordinator',
        -- ICT
        'ict',
        -- Data Team
        'datateam', 'data_team', 'data team',
        -- Country Director
        'countrydirector', 'country_director', 'country director',
        -- Senior Management
        'senior management', 'senior_management', 'seniormanagement'
      )
  );
$$;

-- ── adhoc_daily_logs — replace permissive write with explicit per-op policies ──
-- Using explicit FOR SELECT / FOR INSERT / FOR UPDATE / FOR DELETE avoids the
-- ambiguity of FOR ALL (where USING governs DELETE and WITH CHECK is ignored).

DROP POLICY IF EXISTS "adhoc_daily_logs_write"            ON adhoc_daily_logs;
DROP POLICY IF EXISTS "adhoc_daily_logs_write_team_lead"  ON adhoc_daily_logs;
DROP POLICY IF EXISTS "adhoc_daily_logs_insert"           ON adhoc_daily_logs;
DROP POLICY IF EXISTS "adhoc_daily_logs_update"           ON adhoc_daily_logs;
DROP POLICY IF EXISTS "adhoc_daily_logs_delete"           ON adhoc_daily_logs;

-- SELECT: any authenticated user can read logs (unchanged)
-- (the existing "adhoc_daily_logs_read" policy already covers this;
--  no action needed unless it was dropped above)

-- INSERT: team lead submitting for their own assignment, or admin/ops staff
CREATE POLICY "adhoc_daily_logs_insert"
  ON adhoc_daily_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Caller must be the team lead for the exact assignment being logged.
    -- Join through adhoc_village_teams verifies that assignment_id, team_id,
    -- campaign_id, and village_id are all internally consistent and active,
    -- preventing a lead from forging entries for another team's assignment.
    (
      submitted_by = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM adhoc_village_teams avt
        JOIN adhoc_teams         at  ON at.id = avt.team_id
        WHERE avt.id          = adhoc_daily_logs.assignment_id
          AND avt.team_id     = adhoc_daily_logs.team_id
          AND avt.campaign_id = adhoc_daily_logs.campaign_id
          AND avt.village_id  = adhoc_daily_logs.village_id
          AND avt.status      = 'active'
          AND at.team_lead_id = auth.uid()
      )
    )
    OR is_village_campaign_admin()
  );

-- UPDATE: team lead may correct their own mobile submissions;
--         admins may edit any log.
CREATE POLICY "adhoc_daily_logs_update"
  ON adhoc_daily_logs
  FOR UPDATE
  TO authenticated
  USING (
    -- Can only update rows originally submitted by themselves (or admin can update any)
    submitted_by = auth.uid()
    OR is_village_campaign_admin()
  )
  WITH CHECK (
    -- Same assignment-consistency check as INSERT
    (
      submitted_by = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM adhoc_village_teams avt
        JOIN adhoc_teams         at  ON at.id = avt.team_id
        WHERE avt.id          = adhoc_daily_logs.assignment_id
          AND avt.team_id     = adhoc_daily_logs.team_id
          AND avt.campaign_id = adhoc_daily_logs.campaign_id
          AND avt.village_id  = adhoc_daily_logs.village_id
          AND avt.status      = 'active'
          AND at.team_lead_id = auth.uid()
      )
    )
    OR is_village_campaign_admin()
  );

-- DELETE: ops/admin only — team leads cannot delete logs
CREATE POLICY "adhoc_daily_logs_delete"
  ON adhoc_daily_logs
  FOR DELETE
  TO authenticated
  USING (is_village_campaign_admin());

-- ── adhoc_village_teams — restrict writes to ops/admin only ──────────────────

DROP POLICY IF EXISTS "adhoc_village_teams_write"            ON adhoc_village_teams;
DROP POLICY IF EXISTS "adhoc_village_teams_write_admin_only" ON adhoc_village_teams;

-- READ: all authenticated users (unchanged — team leads need to see their assignments)
-- WRITE: ops/admin only (assignment management is a coordinator/admin action)
CREATE POLICY "adhoc_village_teams_write_admin_only"
  ON adhoc_village_teams
  FOR ALL
  TO authenticated
  USING (is_village_campaign_admin())
  WITH CHECK (is_village_campaign_admin());

-- ── adhoc_campaigns — restrict writes to ops/admin only ──────────────────────

DROP POLICY IF EXISTS "village_campaigns_write"            ON adhoc_campaigns;
DROP POLICY IF EXISTS "village_campaigns_write_admin_only" ON adhoc_campaigns;

CREATE POLICY "village_campaigns_write_admin_only"
  ON adhoc_campaigns
  FOR ALL
  TO authenticated
  USING (is_village_campaign_admin())
  WITH CHECK (is_village_campaign_admin());

-- ── adhoc_villages — restrict writes to ops/admin only ───────────────────────

DROP POLICY IF EXISTS "adhoc_villages_write"            ON adhoc_villages;
DROP POLICY IF EXISTS "adhoc_villages_write_admin_only" ON adhoc_villages;

CREATE POLICY "adhoc_villages_write_admin_only"
  ON adhoc_villages
  FOR ALL
  TO authenticated
  USING (is_village_campaign_admin())
  WITH CHECK (is_village_campaign_admin());

-- ── adhoc_teams — restrict writes to ops/admin only ──────────────────────────
-- (team registry is managed by coordinators/admins, not team leads themselves)

DROP POLICY IF EXISTS "adhoc_teams_write"            ON adhoc_teams;
DROP POLICY IF EXISTS "adhoc_teams_write_admin_only" ON adhoc_teams;

CREATE POLICY "adhoc_teams_write_admin_only"
  ON adhoc_teams
  FOR ALL
  TO authenticated
  USING (is_village_campaign_admin())
  WITH CHECK (is_village_campaign_admin());
