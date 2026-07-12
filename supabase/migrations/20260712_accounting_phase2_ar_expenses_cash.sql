-- ============================================================
-- PACT Accounting Phase 2: AR, Expenses, Cash, Journals, Tax
-- Apply in Supabase SQL Editor
-- Tables: acct_customer_invoices/lines, acct_customer_payments,
--   acct_expense_categories, acct_per_diem_rates,
--   acct_expense_reports/lines, acct_petty_cash_boxes,
--   acct_petty_cash_transactions, acct_cash_count_sheets,
--   acct_wire_transfers, acct_recurring_journals/lines,
--   acct_journal_templates/lines, acct_withholding_tax_rates,
--   acct_withholding_tax_entries, acct_asset_revaluations
-- ============================================================

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 1. CUSTOMER INVOICES (AR)                                               │
-- └─────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS acct_customer_invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number  TEXT NOT NULL,
  invoice_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE,
  customer_name   TEXT NOT NULL,
  customer_ref    TEXT,
  company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  subtotal        NUMERIC(18,4) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(18,4) NOT NULL DEFAULT 0,
  amount_paid     NUMERIC(18,4) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'draft',
    -- draft | sent | partial | paid | overdue | cancelled | void
  notes           TEXT,
  payment_terms   TEXT,
  ar_account_id   UUID REFERENCES acct_accounts(id) ON DELETE SET NULL,
  revenue_account_id UUID REFERENCES acct_accounts(id) ON DELETE SET NULL,
  je_id           UUID REFERENCES acct_journal_entries(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acct_customer_invoice_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID NOT NULL REFERENCES acct_customer_invoices(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  quantity        NUMERIC(14,4) NOT NULL DEFAULT 1,
  unit_price      NUMERIC(18,4) NOT NULL DEFAULT 0,
  discount_pct    NUMERIC(6,4) NOT NULL DEFAULT 0,
  tax_pct         NUMERIC(6,4) NOT NULL DEFAULT 0,
  subtotal        NUMERIC(18,4) NOT NULL DEFAULT 0,
  account_id      UUID REFERENCES acct_accounts(id) ON DELETE SET NULL,
  analytic_account_id UUID,
  sequence        INT NOT NULL DEFAULT 10
);

CREATE INDEX IF NOT EXISTS idx_cust_inv_status   ON acct_customer_invoices(status);
CREATE INDEX IF NOT EXISTS idx_cust_inv_company  ON acct_customer_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_cust_inv_project  ON acct_customer_invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_cust_inv_due      ON acct_customer_invoices(due_date);

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 2. CUSTOMER PAYMENTS                                                    │
-- └─────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS acct_customer_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_name   TEXT NOT NULL,
  invoice_id      UUID REFERENCES acct_customer_invoices(id) ON DELETE SET NULL,
  company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
  amount          NUMERIC(18,4) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  payment_method  TEXT NOT NULL DEFAULT 'bank_transfer',
    -- bank_transfer | cheque | cash | mobile_money | card
  reference       TEXT,
  bank_account_id UUID REFERENCES acct_bank_accounts(id) ON DELETE SET NULL,
  ar_account_id   UUID REFERENCES acct_accounts(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'posted',
  je_id           UUID REFERENCES acct_journal_entries(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cust_pay_invoice  ON acct_customer_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_cust_pay_date     ON acct_customer_payments(payment_date);

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 3. EXPENSE MANAGEMENT (Accounting-linked)                               │
-- └─────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS acct_expense_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  code            TEXT,
  parent_id       UUID REFERENCES acct_expense_categories(id) ON DELETE SET NULL,
  account_id      UUID REFERENCES acct_accounts(id) ON DELETE SET NULL,
  requires_receipt BOOLEAN NOT NULL DEFAULT TRUE,
  max_amount      NUMERIC(14,4),
  currency        TEXT DEFAULT 'USD',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acct_per_diem_rates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id      UUID REFERENCES countries(id) ON DELETE CASCADE,
  city            TEXT,
  rate_usd        NUMERIC(14,4) NOT NULL,
  accommodation_usd NUMERIC(14,4),
  meals_usd       NUMERIC(14,4),
  transport_usd   NUMERIC(14,4),
  effective_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date        DATE,
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS acct_expense_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_number   TEXT NOT NULL,
  title           TEXT NOT NULL,
  employee_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  total_amount    NUMERIC(18,4) NOT NULL DEFAULT 0,
  advance_amount  NUMERIC(18,4) NOT NULL DEFAULT 0,
    -- advance already given to employee
  balance_due     NUMERIC(18,4) NOT NULL DEFAULT 0,
    -- negative = employee owes back, positive = company owes employee
  period_start    DATE,
  period_end      DATE,
  purpose         TEXT,
  status          TEXT NOT NULL DEFAULT 'draft',
    -- draft | submitted | under_review | approved | rejected | paid | closed
  submitted_at    TIMESTAMPTZ,
  approved_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  je_id           UUID REFERENCES acct_journal_entries(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acct_expense_report_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       UUID NOT NULL REFERENCES acct_expense_reports(id) ON DELETE CASCADE,
  expense_date    DATE NOT NULL,
  category_id     UUID REFERENCES acct_expense_categories(id) ON DELETE SET NULL,
  description     TEXT NOT NULL,
  amount          NUMERIC(14,4) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  exchange_rate   NUMERIC(14,6) NOT NULL DEFAULT 1,
  amount_base     NUMERIC(14,4) NOT NULL,
    -- amount converted to report currency
  is_per_diem     BOOLEAN NOT NULL DEFAULT FALSE,
  per_diem_days   NUMERIC(6,2),
  receipt_url     TEXT,
  account_id      UUID REFERENCES acct_accounts(id) ON DELETE SET NULL,
  analytic_account_id UUID,
  sequence        INT NOT NULL DEFAULT 10
);

CREATE INDEX IF NOT EXISTS idx_exp_report_employee ON acct_expense_reports(employee_id);
CREATE INDEX IF NOT EXISTS idx_exp_report_status   ON acct_expense_reports(status);
CREATE INDEX IF NOT EXISTS idx_exp_report_project  ON acct_expense_reports(project_id);

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 4. PETTY CASH / CASH BOX                                                │
-- └─────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS acct_petty_cash_boxes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  code            TEXT,
  location        TEXT,
  company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  float_limit     NUMERIC(14,4) NOT NULL DEFAULT 500,
  current_balance NUMERIC(14,4) NOT NULL DEFAULT 0,
  cashier_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  account_id      UUID REFERENCES acct_accounts(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'open',  -- open | closed
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS acct_petty_cash_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id          UUID NOT NULL REFERENCES acct_petty_cash_boxes(id) ON DELETE CASCADE,
  txn_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  txn_type        TEXT NOT NULL DEFAULT 'payment',
    -- payment | top_up | adjustment | count_adjustment
  description     TEXT NOT NULL,
  amount          NUMERIC(14,4) NOT NULL,
  -- positive = in (top-up), negative = out (payment)
  balance_after   NUMERIC(14,4) NOT NULL DEFAULT 0,
  category_id     UUID REFERENCES acct_expense_categories(id) ON DELETE SET NULL,
  account_id      UUID REFERENCES acct_accounts(id) ON DELETE SET NULL,
  receipt_ref     TEXT,
  approved_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  je_id           UUID REFERENCES acct_journal_entries(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS acct_cash_count_sheets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id          UUID NOT NULL REFERENCES acct_petty_cash_boxes(id) ON DELETE CASCADE,
  count_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  counted_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  witnessed_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  system_balance  NUMERIC(14,4) NOT NULL,
  counted_balance NUMERIC(14,4) NOT NULL,
  variance        NUMERIC(14,4) GENERATED ALWAYS AS (counted_balance - system_balance) STORED,
  denominations   JSONB,
    -- e.g. {"500": 2, "100": 5, "50": 3} = notes count
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'draft',  -- draft | confirmed
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_petty_box_company ON acct_petty_cash_boxes(company_id);
CREATE INDEX IF NOT EXISTS idx_petty_txn_box     ON acct_petty_cash_transactions(box_id);
CREATE INDEX IF NOT EXISTS idx_petty_txn_date    ON acct_petty_cash_transactions(txn_date);

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 5. WIRE / SWIFT TRANSFERS                                               │
-- └─────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS acct_wire_transfers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  value_date      DATE,
  reference       TEXT NOT NULL,
  swift_ref       TEXT,
  sender_account_id   UUID REFERENCES acct_bank_accounts(id) ON DELETE SET NULL,
  beneficiary_name    TEXT NOT NULL,
  beneficiary_bank    TEXT,
  beneficiary_iban    TEXT,
  beneficiary_swift   TEXT,
  beneficiary_country UUID REFERENCES countries(id) ON DELETE SET NULL,
  amount          NUMERIC(18,4) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  exchange_rate   NUMERIC(14,6) DEFAULT 1,
  amount_local    NUMERIC(18,4),
  charges         NUMERIC(14,4) DEFAULT 0,
  purpose         TEXT,
  status          TEXT NOT NULL DEFAULT 'initiated',
    -- initiated | pending | processing | completed | rejected | returned
  je_id           UUID REFERENCES acct_journal_entries(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wire_date    ON acct_wire_transfers(transfer_date);
CREATE INDEX IF NOT EXISTS idx_wire_status  ON acct_wire_transfers(status);

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 6. RECURRING JOURNAL ENTRIES                                            │
-- └─────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS acct_recurring_journals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
  frequency       TEXT NOT NULL DEFAULT 'monthly',
    -- daily | weekly | monthly | quarterly | yearly
  day_of_month    INT,  -- 1-28 for monthly
  next_run_date   DATE NOT NULL,
  last_run_date   DATE,
  end_date        DATE,
  journal_type    TEXT NOT NULL DEFAULT 'general',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  auto_post       BOOLEAN NOT NULL DEFAULT FALSE,
  run_count       INT NOT NULL DEFAULT 0,
  max_runs        INT,  -- NULL = unlimited
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS acct_recurring_journal_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_id    UUID NOT NULL REFERENCES acct_recurring_journals(id) ON DELETE CASCADE,
  account_id      UUID REFERENCES acct_accounts(id) ON DELETE SET NULL,
  label           TEXT,
  debit           NUMERIC(18,4) NOT NULL DEFAULT 0,
  credit          NUMERIC(18,4) NOT NULL DEFAULT 0,
  analytic_account_id UUID,
  sequence        INT NOT NULL DEFAULT 10
);

CREATE INDEX IF NOT EXISTS idx_recur_next_run ON acct_recurring_journals(next_run_date);
CREATE INDEX IF NOT EXISTS idx_recur_active   ON acct_recurring_journals(is_active);

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 7. JOURNAL ENTRY TEMPLATES                                              │
-- └─────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS acct_journal_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
  journal_type    TEXT NOT NULL DEFAULT 'general',
  tags            JSONB NOT NULL DEFAULT '[]',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  use_count       INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS acct_journal_template_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID NOT NULL REFERENCES acct_journal_templates(id) ON DELETE CASCADE,
  account_id      UUID REFERENCES acct_accounts(id) ON DELETE SET NULL,
  label           TEXT,
  side            TEXT NOT NULL DEFAULT 'debit',  -- debit | credit
  amount_type     TEXT NOT NULL DEFAULT 'fixed',  -- fixed | percent | input
  amount          NUMERIC(18,4),
  sequence        INT NOT NULL DEFAULT 10
);

CREATE INDEX IF NOT EXISTS idx_jt_company ON acct_journal_templates(company_id);

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 8. WITHHOLDING TAX                                                      │
-- └─────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS acct_withholding_tax_rates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  code            TEXT,
  rate_pct        NUMERIC(8,4) NOT NULL,
  applies_to      TEXT NOT NULL DEFAULT 'vendor',  -- vendor | employee | both
  country_id      UUID REFERENCES countries(id) ON DELETE SET NULL,
  company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
  liability_account_id UUID REFERENCES acct_accounts(id) ON DELETE SET NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS acct_withholding_tax_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_id         UUID NOT NULL REFERENCES acct_withholding_tax_rates(id) ON DELETE RESTRICT,
  entry_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  vendor_name     TEXT NOT NULL,
  invoice_ref     TEXT,
  gross_amount    NUMERIC(18,4) NOT NULL,
  wht_amount      NUMERIC(18,4) NOT NULL,
  net_amount      NUMERIC(18,4) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  remitted        BOOLEAN NOT NULL DEFAULT FALSE,
  remittance_date DATE,
  remittance_ref  TEXT,
  je_id           UUID REFERENCES acct_journal_entries(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wht_entry_date    ON acct_withholding_tax_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_wht_remitted      ON acct_withholding_tax_entries(remitted);

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 9. ASSET REVALUATIONS                                                   │
-- └─────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS acct_asset_revaluations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id        UUID NOT NULL,  -- references acct_fixed_assets when exists
  revaluation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  previous_cost   NUMERIC(18,4) NOT NULL,
  new_cost        NUMERIC(18,4) NOT NULL,
  previous_accumulated_dep NUMERIC(18,4) NOT NULL DEFAULT 0,
  new_accumulated_dep      NUMERIC(18,4) NOT NULL DEFAULT 0,
  gain_loss       NUMERIC(18,4) GENERATED ALWAYS AS (
    (new_cost - new_accumulated_dep) - (previous_cost - previous_accumulated_dep)
  ) STORED,
  revaluation_reserve_account UUID REFERENCES acct_accounts(id) ON DELETE SET NULL,
  reason          TEXT,
  approved_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  je_id           UUID REFERENCES acct_journal_entries(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_asset_reval_asset ON acct_asset_revaluations(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_reval_date  ON acct_asset_revaluations(revaluation_date);

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ RLS — enable on all new tables                                          │
-- └─────────────────────────────────────────────────────────────────────────┘
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'acct_customer_invoices','acct_customer_invoice_lines',
    'acct_customer_payments',
    'acct_expense_categories','acct_per_diem_rates',
    'acct_expense_reports','acct_expense_report_lines',
    'acct_petty_cash_boxes','acct_petty_cash_transactions','acct_cash_count_sheets',
    'acct_wire_transfers',
    'acct_recurring_journals','acct_recurring_journal_lines',
    'acct_journal_templates','acct_journal_template_lines',
    'acct_withholding_tax_rates','acct_withholding_tax_entries',
    'acct_asset_revaluations'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_read_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "auth_read_%s" ON %I FOR SELECT USING (auth.role() = ''authenticated'')', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_write_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "auth_write_%s" ON %I FOR ALL USING (auth.role() = ''authenticated'')', t, t);
  END LOOP;
END $$;

-- Seed default expense categories
INSERT INTO acct_expense_categories (name_en, name_ar, code, requires_receipt) VALUES
  ('Transportation', 'مواصلات', 'TRANS', true),
  ('Accommodation', 'إقامة', 'ACCOM', true),
  ('Meals & Subsistence', 'وجبات وإعاشة', 'MEALS', false),
  ('Communication', 'اتصالات', 'COMM', true),
  ('Office Supplies', 'مستلزمات مكتبية', 'SUPP', true),
  ('Medical', 'طبي', 'MED', true),
  ('Training & Capacity Building', 'تدريب وبناء قدرات', 'TRAIN', true),
  ('Vehicle Hire', 'استئجار مركبات', 'VEH', true),
  ('Fuel', 'وقود', 'FUEL', true),
  ('Other', 'أخرى', 'OTHER', false)
ON CONFLICT DO NOTHING;

-- Done. Verify: SELECT count(*) FROM acct_customer_invoices;
