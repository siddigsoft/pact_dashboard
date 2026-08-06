-- Migration: Operational Budget Requests
-- Coordinators, supervisors, and project managers submit forward-looking
-- operational spend plans for a period, reviewed through a two-tier approval chain.

CREATE TABLE IF NOT EXISTS operational_budget_requests (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title         text NOT NULL,
  period_label  text NOT NULL,           -- human label e.g. "August 2026"
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  hub           text,
  project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
  currency      text NOT NULL DEFAULT 'SDG',
  notes         text,
  lines         jsonb NOT NULL DEFAULT '[]',   -- [{id,category,description,vendor,estimated_amount,notes}]
  total_amount  numeric NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','submitted','approved','rejected','cancelled')),
  submitted_by  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  submitted_at  timestamptz,
  tier1_status  text NOT NULL DEFAULT 'pending'
                  CHECK (tier1_status IN ('pending','approved','rejected')),
  tier1_reviewed_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  tier1_reviewed_at  timestamptz,
  tier1_notes   text,
  tier2_status  text NOT NULL DEFAULT 'pending'
                  CHECK (tier2_status IN ('pending','approved','rejected')),
  tier2_reviewed_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  tier2_reviewed_at  timestamptz,
  tier2_notes   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS obr_submitted_by_idx  ON operational_budget_requests(submitted_by);
CREATE INDEX IF NOT EXISTS obr_status_idx        ON operational_budget_requests(status);
CREATE INDEX IF NOT EXISTS obr_period_start_idx  ON operational_budget_requests(period_start);
CREATE INDEX IF NOT EXISTS obr_hub_idx           ON operational_budget_requests(hub);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION _obr_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS obr_updated_at_trigger ON operational_budget_requests;
CREATE TRIGGER obr_updated_at_trigger
  BEFORE UPDATE ON operational_budget_requests
  FOR EACH ROW EXECUTE FUNCTION _obr_set_updated_at();

-- RLS
ALTER TABLE operational_budget_requests ENABLE ROW LEVEL SECURITY;

-- SELECT: own OR elevated roles
CREATE POLICY "obr_select" ON operational_budget_requests FOR SELECT TO authenticated
  USING (
    submitted_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid()
        AND p.role IN (
          'super_admin','admin','fom','FOM',
          'financialAdmin','financial_admin','FinancialAdmin',
          'auditor','projectManager','countryDirector','cd','coordinator'
        )
    )
  );

-- INSERT: any authenticated user submitting for themselves
CREATE POLICY "obr_insert" ON operational_budget_requests FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid());

-- UPDATE: own drafts OR approvers
CREATE POLICY "obr_update" ON operational_budget_requests FOR UPDATE TO authenticated
  USING (
    (submitted_by = auth.uid() AND status = 'draft')
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid()
        AND p.role IN (
          'super_admin','admin','fom','FOM',
          'financialAdmin','financial_admin','FinancialAdmin','coordinator'
        )
    )
  );

-- DELETE: own drafts only
CREATE POLICY "obr_delete" ON operational_budget_requests FOR DELETE TO authenticated
  USING (submitted_by = auth.uid() AND status = 'draft');
