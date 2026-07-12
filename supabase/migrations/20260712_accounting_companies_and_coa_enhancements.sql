-- ══════════════════════════════════════════════════════════════════════════════
-- PACT Command Center — Accounting Companies + COA Enhancements
-- Date: 2026-07-12
-- Description: Adds companies table (separate entity per country), enhances
--   acct_accounts with Odoo-parity fields, adds all missing accounting tables.
-- ══════════════════════════════════════════════════════════════════════════════

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 1. COMPANIES TABLE                                                      │
-- └─────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS companies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT NOT NULL UNIQUE,
  name_en           TEXT NOT NULL,
  name_ar           TEXT,
  country_id        UUID REFERENCES countries(id) ON DELETE SET NULL,
  currency_code     TEXT NOT NULL DEFAULT 'USD',
  functional_currency TEXT NOT NULL DEFAULT 'USD',
  logo_url          TEXT,
  address           TEXT,
  phone             TEXT,
  email             TEXT,
  tax_id            TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  is_parent         BOOLEAN NOT NULL DEFAULT FALSE,
  parent_company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  fiscal_year_start INT  DEFAULT 1,  -- Month number (1=Jan)
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_country ON companies(country_id);
CREATE INDEX IF NOT EXISTS idx_companies_parent  ON companies(parent_company_id);

-- Seed default companies from PACT screenshot context
-- (Users can add/edit via the UI — these are just examples)
-- INSERT INTO companies (code, name_en, currency_code, is_parent) VALUES
--   ('PACT-GRP', 'PACT Consultancy Group', 'USD', TRUE),
--   ('PACT-SDN', 'PACT Sudan',             'SDG', FALSE);

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 2. COA ENHANCEMENTS — missing Odoo-parity fields                        │
-- └─────────────────────────────────────────────────────────────────────────┘
ALTER TABLE acct_accounts
  ADD COLUMN IF NOT EXISTS company_id           UUID REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS allow_reconciliation BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS account_currency     TEXT,          -- NULL = use company functional currency
  ADD COLUMN IF NOT EXISTS notes                TEXT,
  ADD COLUMN IF NOT EXISTS deprecated           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS account_tags         JSONB   NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS internal_group       TEXT;          -- e.g. 'receivable','payable','liquidity','other'

CREATE INDEX IF NOT EXISTS idx_acct_accounts_company  ON acct_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_acct_accounts_currency ON acct_accounts(account_currency);

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 3. PROJECT ↔ ACCOUNT LINKS (flexible, many COAs per project)            │
-- └─────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS project_account_links (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id)       ON DELETE CASCADE,
  account_id   UUID NOT NULL REFERENCES acct_accounts(id)  ON DELETE CASCADE,
  company_id   UUID REFERENCES companies(id) ON DELETE SET NULL,
  link_type    TEXT NOT NULL DEFAULT 'expense',  -- expense | revenue | asset | liability | clearing
  description  TEXT,
  is_default   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE(project_id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_pal_project ON project_account_links(project_id);
CREATE INDEX IF NOT EXISTS idx_pal_account ON project_account_links(account_id);

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 4. FISCAL POSITIONS (tax mapping per jurisdiction)                      │
-- └─────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS acct_fiscal_positions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en      TEXT NOT NULL,
  name_ar      TEXT,
  company_id   UUID REFERENCES companies(id) ON DELETE CASCADE,
  country_id   UUID REFERENCES countries(id) ON DELETE SET NULL,
  auto_apply   BOOLEAN NOT NULL DEFAULT FALSE,
  notes        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS acct_fiscal_position_tax_map (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_position_id  UUID NOT NULL REFERENCES acct_fiscal_positions(id) ON DELETE CASCADE,
  tax_source_id       UUID,  -- references acct_taxes when that table exists
  tax_dest_id         UUID,  -- references acct_taxes when that table exists
  notes               TEXT
);

CREATE TABLE IF NOT EXISTS acct_fiscal_position_account_map (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_position_id  UUID NOT NULL REFERENCES acct_fiscal_positions(id) ON DELETE CASCADE,
  account_source_id   UUID REFERENCES acct_accounts(id) ON DELETE SET NULL,
  account_dest_id     UUID REFERENCES acct_accounts(id) ON DELETE SET NULL,
  notes               TEXT
);

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 5. ANALYTIC PLANS + ACCOUNTS (Odoo analytic accounting)                 │
-- └─────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS acct_analytic_plans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en           TEXT NOT NULL,
  name_ar           TEXT,
  code              TEXT,
  company_id        UUID REFERENCES companies(id) ON DELETE SET NULL,
  parent_id         UUID REFERENCES acct_analytic_plans(id) ON DELETE SET NULL,
  default_applicability TEXT DEFAULT 'optional',  -- optional | mandatory | unavailable
  color             TEXT DEFAULT '#6366f1',
  sequence          INT  DEFAULT 10,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS acct_analytic_accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT,
  name_en     TEXT NOT NULL,
  name_ar     TEXT,
  plan_id     UUID NOT NULL REFERENCES acct_analytic_plans(id) ON DELETE CASCADE,
  company_id  UUID REFERENCES companies(id) ON DELETE SET NULL,
  project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,
  partner_id  UUID,
  balance     NUMERIC(18,4) DEFAULT 0,
  debit       NUMERIC(18,4) DEFAULT 0,
  credit      NUMERIC(18,4) DEFAULT 0,
  currency_code TEXT DEFAULT 'USD',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS acct_analytic_distribution_models (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en     TEXT NOT NULL,
  company_id  UUID REFERENCES companies(id) ON DELETE SET NULL,
  analytic_distribution JSONB NOT NULL DEFAULT '{}',  -- {analytic_account_id: percentage}
  product_id  UUID,
  partner_id  UUID,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 6. LOCK DATES (prevent posting before a date)                           │
-- └─────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS acct_lock_dates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  lock_type       TEXT NOT NULL DEFAULT 'all',  -- all | tax | hard
  lock_date       DATE NOT NULL,
  description     TEXT,
  locked_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  locked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unlocked_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  unlocked_at     TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_lock_dates_company ON acct_lock_dates(company_id);

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 7. LOANS MODULE                                                         │
-- └─────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS acct_loans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_number         TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  loan_type           TEXT NOT NULL DEFAULT 'received',  -- received | given
  company_id          UUID REFERENCES companies(id) ON DELETE SET NULL,
  partner_name        TEXT,
  principal_amount    NUMERIC(18,4) NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'USD',
  interest_rate       NUMERIC(10,6) NOT NULL DEFAULT 0,
  interest_type       TEXT DEFAULT 'fixed',  -- fixed | variable
  start_date          DATE NOT NULL,
  maturity_date       DATE NOT NULL,
  payment_frequency   TEXT DEFAULT 'monthly',  -- monthly | quarterly | annual
  outstanding_balance NUMERIC(18,4) NOT NULL,
  total_paid          NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_interest_paid NUMERIC(18,4) NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'active',  -- draft | active | overdue | closed
  liability_account_id UUID REFERENCES acct_accounts(id) ON DELETE SET NULL,
  interest_account_id  UUID REFERENCES acct_accounts(id) ON DELETE SET NULL,
  bank_account_id      UUID,
  description         TEXT,
  collateral          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acct_loan_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id         UUID NOT NULL REFERENCES acct_loans(id) ON DELETE CASCADE,
  payment_date    DATE NOT NULL,
  payment_number  INT  NOT NULL,
  principal       NUMERIC(18,4) NOT NULL DEFAULT 0,
  interest        NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_payment   NUMERIC(18,4) NOT NULL DEFAULT 0,
  opening_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  closing_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | paid | overdue
  paid_at         DATE,
  je_id           UUID REFERENCES acct_journal_entries(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loan_payments_loan ON acct_loan_payments(loan_id);

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 8. DEFERRED REVENUE / EXPENSE                                           │
-- └─────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS acct_deferred_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  deferred_type       TEXT NOT NULL DEFAULT 'expense',  -- expense | revenue
  company_id          UUID REFERENCES companies(id) ON DELETE SET NULL,
  original_amount     NUMERIC(18,4) NOT NULL,
  remaining_amount    NUMERIC(18,4) NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'USD',
  start_date          DATE NOT NULL,
  end_date            DATE NOT NULL,
  recognition_method  TEXT DEFAULT 'straight_line',  -- straight_line | manual
  source_account_id   UUID REFERENCES acct_accounts(id) ON DELETE SET NULL,
  target_account_id   UUID REFERENCES acct_accounts(id) ON DELETE SET NULL,
  project_id          UUID REFERENCES projects(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'active',  -- active | closed | paused
  description         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS acct_deferred_recognition_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deferred_item_id UUID NOT NULL REFERENCES acct_deferred_items(id) ON DELETE CASCADE,
  period_date     DATE NOT NULL,
  amount          NUMERIC(18,4) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | posted
  je_id           UUID REFERENCES acct_journal_entries(id) ON DELETE SET NULL,
  posted_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 9. PAYMENT TERMS                                                        │
-- └─────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS acct_payment_terms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en       TEXT NOT NULL,
  name_ar       TEXT,
  company_id    UUID REFERENCES companies(id) ON DELETE SET NULL,
  note          TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS acct_payment_term_lines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_term_id  UUID NOT NULL REFERENCES acct_payment_terms(id) ON DELETE CASCADE,
  sequence         INT  NOT NULL DEFAULT 10,
  value_type       TEXT NOT NULL DEFAULT 'percent',  -- percent | fixed | balance
  value            NUMERIC(10,4) NOT NULL DEFAULT 100,
  days             INT  NOT NULL DEFAULT 0,
  days_after       TEXT DEFAULT 'invoice_date',  -- invoice_date | end_of_month | end_of_next_month
  discount_pct     NUMERIC(6,4) DEFAULT 0
);

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ 10. FOLLOW-UP LEVELS (AR dunning)                                       │
-- └─────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS acct_follow_up_levels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
  name_en         TEXT NOT NULL,
  delay_days      INT  NOT NULL DEFAULT 0,
  action          TEXT NOT NULL DEFAULT 'email',  -- email | letter | phone | manual
  description     TEXT,
  email_template  TEXT,
  sequence        INT  NOT NULL DEFAULT 10,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ RLS — enable row-level security on all new tables                       │
-- └─────────────────────────────────────────────────────────────────────────┘
ALTER TABLE companies                           ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_account_links               ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_fiscal_positions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_fiscal_position_tax_map        ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_fiscal_position_account_map    ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_analytic_plans                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_analytic_accounts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_analytic_distribution_models   ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_lock_dates                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_loans                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_loan_payments                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_deferred_items                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_deferred_recognition_lines     ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_payment_terms                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_payment_term_lines             ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_follow_up_levels               ENABLE ROW LEVEL SECURITY;

-- All-authenticated read policies
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies','project_account_links',
    'acct_fiscal_positions','acct_fiscal_position_tax_map','acct_fiscal_position_account_map',
    'acct_analytic_plans','acct_analytic_accounts','acct_analytic_distribution_models',
    'acct_lock_dates','acct_loans','acct_loan_payments',
    'acct_deferred_items','acct_deferred_recognition_lines',
    'acct_payment_terms','acct_payment_term_lines','acct_follow_up_levels'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "auth_read_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "auth_read_%s" ON %I FOR SELECT USING (auth.role() = ''authenticated'')', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_write_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "auth_write_%s" ON %I FOR ALL USING (auth.role() = ''authenticated'')', t, t);
  END LOOP;
END $$;

-- Done. Run: SELECT count(*) FROM companies; to verify.
