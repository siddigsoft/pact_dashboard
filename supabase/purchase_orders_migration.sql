-- ============================================================
-- PACT Command Center — Purchase Orders (Procurement)
-- Activates /accounting/purchase-orders page
-- Apply in Supabase SQL Editor after vendors_migration.sql.
-- SAFE TO RE-RUN: uses IF NOT EXISTS.
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS acct_po_seq START 1 INCREMENT 1;

CREATE TABLE IF NOT EXISTS acct_purchase_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number       TEXT UNIQUE NOT NULL
                    DEFAULT ('PO-' || to_char(NOW(), 'YYYY') || '-' || LPAD(nextval('acct_po_seq')::TEXT, 4, '0')),
  title           TEXT NOT NULL,
  description     TEXT,
  vendor_id       UUID REFERENCES acct_vendors(id)   ON DELETE SET NULL,
  country_id      UUID REFERENCES countries(id)       ON DELETE SET NULL,
  fund_id         UUID REFERENCES acct_funds(id)      ON DELETE SET NULL,
  gl_account_id   UUID REFERENCES acct_accounts(id)  ON DELETE SET NULL,
  amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'USD',
  required_date   DATE,
  status          TEXT NOT NULL DEFAULT 'draft',
  -- draft | submitted | approved | rejected | ordered | received | completed | cancelled
  requested_by    UUID REFERENCES auth.users(id),
  submitted_at    TIMESTAMPTZ,
  approved_by     UUID REFERENCES auth.users(id),
  approved_at     TIMESTAMPTZ,
  rejection_note  TEXT,
  received_date   DATE,
  invoice_ref     TEXT,
  journal_entry_id UUID REFERENCES acct_journal_entries(id) ON DELETE SET NULL,
  notes           TEXT,
  tags            TEXT[],
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acct_po_vendor   ON acct_purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_acct_po_status   ON acct_purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_acct_po_country  ON acct_purchase_orders(country_id);
CREATE INDEX IF NOT EXISTS idx_acct_po_fund     ON acct_purchase_orders(fund_id);
CREATE INDEX IF NOT EXISTS idx_acct_po_req_by   ON acct_purchase_orders(requested_by);

ALTER TABLE acct_purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acct_po_select" ON acct_purchase_orders
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "acct_po_insert" ON acct_purchase_orders
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN (
          'super_admin','admin','finance','financialAdmin','financial_admin',
          'accountant','finance_officer','project_manager','program_manager'
        )
    )
  );

CREATE POLICY "acct_po_update" ON acct_purchase_orders
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN (
          'super_admin','admin','finance','financialAdmin','financial_admin','accountant'
        )
    )
  );

CREATE POLICY "acct_po_delete" ON acct_purchase_orders
  FOR DELETE TO authenticated USING (
    status = 'draft'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin','admin','finance','financialAdmin','accountant')
    )
  );

CREATE OR REPLACE FUNCTION update_acct_po_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER acct_po_updated_at
  BEFORE UPDATE ON acct_purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_acct_po_updated_at();

-- Instructions:
-- 1. Supabase → SQL Editor → Run this file (after vendors_migration.sql)
-- 2. /accounting/purchase-orders page will then be active
