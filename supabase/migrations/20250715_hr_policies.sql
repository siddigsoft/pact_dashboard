-- ─────────────────────────────────────────────────────────────────────────────
-- Task #83: Policy Library & Employee Acknowledgement
-- Tables: hr_policies, hr_policy_acknowledgements
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Policy registry
CREATE TABLE IF NOT EXISTS hr_policies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  category        text NOT NULL DEFAULT 'HR'
                  CHECK (category IN ('HR','IT','Finance','Safeguarding','Operations','Other')),
  version         text NOT NULL DEFAULT '1.0',
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','published','archived')),
  effective_date  date,
  content_text    text,
  file_url        text,
  required_roles  text[] NOT NULL DEFAULT '{}',
  published_at    timestamptz,
  created_by      uuid REFERENCES profiles(id),
  hub_id          uuid REFERENCES hubs(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 2. Acknowledgement records
CREATE TABLE IF NOT EXISTS hr_policy_acknowledgements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id         uuid NOT NULL REFERENCES hr_policies(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  acknowledged_at   timestamptz NOT NULL DEFAULT now(),
  policy_version    text NOT NULL,
  confirmed_name    text,
  ip_address        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (policy_id, user_id, policy_version)
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_hr_policies_status   ON hr_policies(status);
CREATE INDEX IF NOT EXISTS idx_hr_policies_category ON hr_policies(category);
CREATE INDEX IF NOT EXISTS idx_hr_ack_policy        ON hr_policy_acknowledgements(policy_id);
CREATE INDEX IF NOT EXISTS idx_hr_ack_user          ON hr_policy_acknowledgements(user_id);
CREATE INDEX IF NOT EXISTS idx_hr_ack_policy_user   ON hr_policy_acknowledgements(policy_id, user_id);

-- 4. Row Level Security
ALTER TABLE hr_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_policy_acknowledgements ENABLE ROW LEVEL SECURITY;

-- ── hr_policies policies ──────────────────────────────────────────────────────
-- Drop first (idempotent re-run safety) then recreate.

DROP POLICY IF EXISTS "hr_policies_select_admin" ON hr_policies;
CREATE POLICY "hr_policies_select_admin"
  ON hr_policies FOR SELECT USING (
    -- HR/admin can read all policies regardless of status or targeting
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin','super_admin','hr_admin','ict')
    )
    -- Other authenticated users can only read published policies that apply
    -- to their role: required_roles empty (= all staff) OR their role is listed
    OR (
      status = 'published'
      AND (
        array_length(required_roles, 1) IS NULL
        OR array_length(required_roles, 1) = 0
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid() AND role = ANY(required_roles)
        )
      )
    )
  );

DROP POLICY IF EXISTS "hr_policies_insert_admin" ON hr_policies;
CREATE POLICY "hr_policies_insert_admin"
  ON hr_policies FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
            AND role IN ('admin','super_admin','hr_admin','ict'))
  );

DROP POLICY IF EXISTS "hr_policies_update_admin" ON hr_policies;
CREATE POLICY "hr_policies_update_admin"
  ON hr_policies FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
            AND role IN ('admin','super_admin','hr_admin','ict'))
  );

DROP POLICY IF EXISTS "hr_policies_delete_admin" ON hr_policies;
CREATE POLICY "hr_policies_delete_admin"
  ON hr_policies FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
            AND role IN ('admin','super_admin','hr_admin','ict'))
  );

-- ── hr_policy_acknowledgements policies ──────────────────────────────────────

DROP POLICY IF EXISTS "hr_ack_select" ON hr_policy_acknowledgements;
CREATE POLICY "hr_ack_select"
  ON hr_policy_acknowledgements FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
               AND role IN ('admin','super_admin','hr_admin','ict'))
  );

DROP POLICY IF EXISTS "hr_ack_insert_self" ON hr_policy_acknowledgements;
CREATE POLICY "hr_ack_insert_self"
  ON hr_policy_acknowledgements FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "hr_ack_delete_admin" ON hr_policy_acknowledgements;
CREATE POLICY "hr_ack_delete_admin"
  ON hr_policy_acknowledgements FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
            AND role IN ('admin','super_admin','hr_admin','ict'))
  );
