-- ============================================================
-- PACT Command Center — Permission System Upgrade
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- ── 1. Add missing roles to the app_role enum ──────────────
-- Postgres allows adding values to an existing enum but not removing them.
-- Run each ALTER separately; "IF NOT EXISTS" prevents duplicate-value errors.

ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'superAdmin';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'countryDirector';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'projectManager';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'seniorOperationsLead';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'dataTeam';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'employee';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'hr';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'hrManager';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'auditor';

-- ── 2. Add notification_level to profiles ──────────────────
-- Five tiers that control which notification categories flow to the user.
-- field      → task/site-visit alerts only
-- coordinator → above + coverage & MMP alerts
-- manager    → above + team & approval alerts
-- director   → above + budget, project, financial alerts
-- executive  → all categories
-- system     → reserved for Super Admin / IT (receives everything including system events)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notification_level TEXT
    NOT NULL DEFAULT 'coordinator'
    CHECK (notification_level IN ('field','coordinator','manager','director','executive','system'));

COMMENT ON COLUMN profiles.notification_level IS
  'Controls which notification categories the user receives. '
  'Tiers: field < coordinator < manager < director < executive < system. '
  'Managed by Super Admin only.';

-- ── 3. Create user_permission_overrides table ───────────────
-- Per-user action-level overrides that win over role defaults.
-- is_granted = true  → explicitly GRANT this action (even if role doesn't have it)
-- is_granted = false → explicitly BLOCK this action (even if role has it)
-- No row            → inherit from role (default behaviour)

CREATE TABLE IF NOT EXISTS user_permission_overrides (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource     TEXT        NOT NULL,
  action       TEXT        NOT NULL,
  is_granted   BOOLEAN     NOT NULL,
  granted_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  reason       TEXT,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, resource, action)
);

COMMENT ON TABLE user_permission_overrides IS
  'Per-user, per-action permission overrides set by Super Admin. '
  'Overrides win over role-level permissions. '
  'Rows with expires_at in the past are treated as non-existent by the frontend.';

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_user_permission_overrides_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_upo_updated_at ON user_permission_overrides;
CREATE TRIGGER trg_upo_updated_at
  BEFORE UPDATE ON user_permission_overrides
  FOR EACH ROW EXECUTE FUNCTION update_user_permission_overrides_updated_at();

-- ── 4. Create permission_override_audit_log table ───────────
-- Full history of every change to user_permission_overrides.

CREATE TABLE IF NOT EXISTS permission_override_audit_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  override_id   UUID        REFERENCES user_permission_overrides(id) ON DELETE SET NULL,
  user_id       UUID        NOT NULL,
  resource      TEXT        NOT NULL,
  action        TEXT        NOT NULL,
  old_granted   BOOLEAN,
  new_granted   BOOLEAN,
  changed_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  reason        TEXT,
  event_type    TEXT        NOT NULL CHECK (event_type IN ('created','updated','deleted')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE permission_override_audit_log IS
  'Immutable audit trail for all Super Admin permission override changes.';

-- ── 5. RLS policies ────────────────────────────────────────

ALTER TABLE user_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_override_audit_log ENABLE ROW LEVEL SECURITY;

-- Helper: check if the calling user is a super admin
CREATE OR REPLACE FUNCTION is_super_admin(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = uid
      AND role IN ('superAdmin','SuperAdmin','super_admin','Super Admin','admin','Admin')
  );
$$;

-- user_permission_overrides: Super Admin can do everything; others can only read their own
DROP POLICY IF EXISTS upo_super_admin_all ON user_permission_overrides;
CREATE POLICY upo_super_admin_all ON user_permission_overrides
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS upo_self_read ON user_permission_overrides;
CREATE POLICY upo_self_read ON user_permission_overrides
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- permission_override_audit_log: Super Admin can read all; users can read their own
DROP POLICY IF EXISTS poal_super_admin_read ON permission_override_audit_log;
CREATE POLICY poal_super_admin_read ON permission_override_audit_log
  FOR SELECT TO authenticated
  USING (is_super_admin());

DROP POLICY IF EXISTS poal_self_read ON permission_override_audit_log;
CREATE POLICY poal_self_read ON permission_override_audit_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS poal_super_admin_insert ON permission_override_audit_log;
CREATE POLICY poal_super_admin_insert ON permission_override_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

-- profiles: allow super admin to update notification_level for any user
DROP POLICY IF EXISTS profiles_super_admin_update_notif_level ON profiles;
CREATE POLICY profiles_super_admin_update_notif_level ON profiles
  FOR UPDATE TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ── 6. Indexes ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_upo_user_id    ON user_permission_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_upo_resource   ON user_permission_overrides(resource, action);
CREATE INDEX IF NOT EXISTS idx_poal_user_id   ON permission_override_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_poal_changed   ON permission_override_audit_log(changed_by);

-- ── 7. Notification level defaults for existing users ───────
-- Assign sensible defaults based on current role
UPDATE profiles SET notification_level = CASE
  WHEN role IN ('superAdmin','SuperAdmin','super_admin','admin','Admin') THEN 'system'
  WHEN role IN ('countryDirector','CountryDirector','fom','FOM','financialAdmin') THEN 'executive'
  WHEN role IN ('projectManager','seniorOperationsLead','ict','ICT') THEN 'director'
  WHEN role IN ('supervisor','Supervisor','hrManager','hr','HR') THEN 'manager'
  WHEN role IN ('coordinator','Coordinator','dataTeam','reviewer','Reviewer','auditor') THEN 'coordinator'
  ELSE 'field'
END
WHERE notification_level = 'coordinator'; -- only update rows still at the default

-- Done. Run the above in one transaction in the Supabase SQL Editor.
-- After running, refresh your Supabase client types if needed.
