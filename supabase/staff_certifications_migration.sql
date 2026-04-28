-- ============================================================
-- PACT Command Center — Staff Certifications & Training Log
-- Activates the TrainingCertifications HR component
-- (src/components/hr/TrainingCertifications.tsx)
-- Apply in Supabase SQL Editor.
-- SAFE TO RE-RUN: uses IF NOT EXISTS.
-- ============================================================

CREATE TABLE IF NOT EXISTS staff_certifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  issuing_org     TEXT,
  cert_type       TEXT NOT NULL DEFAULT 'training',
  -- training | certification | license | course | workshop
  issue_date      DATE,
  expiry_date     DATE,
  cert_number     TEXT,
  file_url        TEXT,
  status          TEXT NOT NULL DEFAULT 'active',
  -- active | expired | revoked
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_cert_user    ON staff_certifications(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_cert_type    ON staff_certifications(cert_type);
CREATE INDEX IF NOT EXISTS idx_staff_cert_expiry  ON staff_certifications(expiry_date);
CREATE INDEX IF NOT EXISTS idx_staff_cert_status  ON staff_certifications(status);

ALTER TABLE staff_certifications ENABLE ROW LEVEL SECURITY;

-- Staff can view/add their own; HR/Admin can view all
CREATE POLICY "cert_own_select" ON staff_certifications
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin','admin','hr','hr_manager')
    )
  );

CREATE POLICY "cert_own_insert" ON staff_certifications
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin','admin','hr','hr_manager')
    )
  );

CREATE POLICY "cert_admin_update" ON staff_certifications
  FOR UPDATE TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin','admin','hr','hr_manager')
    )
  );

CREATE POLICY "cert_admin_delete" ON staff_certifications
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin','admin','hr','hr_manager')
    )
  );

CREATE OR REPLACE FUNCTION update_staff_cert_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER staff_cert_updated_at
  BEFORE UPDATE ON staff_certifications
  FOR EACH ROW EXECUTE FUNCTION update_staff_cert_updated_at();

-- Instructions:
-- 1. Supabase Dashboard → SQL Editor → New query → Run this file
-- 2. The Training & Certifications tab in the HR page will then be fully active
