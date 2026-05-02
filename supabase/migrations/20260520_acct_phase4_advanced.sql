-- ============================================================
-- PACT Accounting Phase 4 — Advanced Controls
-- Apply this migration in your Supabase SQL editor or CLI.
-- Run once; idempotent (uses IF NOT EXISTS / ON CONFLICT).
-- ============================================================

-- ── 1. Tax Codes Registry ────────────────────────────────────

CREATE TABLE IF NOT EXISTS acct_tax_codes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL UNIQUE,          -- e.g. VAT17, WHT10
  name_en          text NOT NULL,
  name_ar          text,
  tax_type         text NOT NULL DEFAULT 'vat',   -- vat | wht | customs | stamp | other
  rate_pct         numeric(8,4) NOT NULL CHECK (rate_pct >= 0 AND rate_pct <= 100),
  country_id       uuid REFERENCES countries(id) ON DELETE SET NULL,
  applicable_to    text NOT NULL DEFAULT 'invoices', -- invoices | purchases | payroll | all
  gl_account_id    uuid REFERENCES acct_accounts(id) ON DELETE SET NULL,
  description      text,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Seed standard tax codes (upsert-safe)
INSERT INTO acct_tax_codes (code, name_en, name_ar, tax_type, rate_pct, applicable_to, description) VALUES
  ('VAT17',  'Standard VAT 17%',              'ضريبة القيمة المضافة 17٪',    'vat',     17.00, 'invoices', 'Standard Sudan VAT rate'),
  ('VAT0',   'Zero-Rated VAT',                'ضريبة صفرية',                 'vat',      0.00, 'invoices', 'Exports and exempt supplies'),
  ('WHT5',   'Withholding Tax 5% (Services)', 'خصم المنبع 5٪ (خدمات)',       'wht',      5.00, 'invoices', 'Services WHT — Sudan'),
  ('WHT10',  'Withholding Tax 10% (Goods)',   'خصم المنبع 10٪ (بضائع)',      'wht',     10.00, 'purchases','Goods WHT — Sudan'),
  ('STAMP',  'Stamp Duty',                    'رسوم الدمغة',                  'stamp',    0.50, 'invoices', '0.5% stamp duty on contracts'),
  ('CUSTOMS','Import Duty',                   'رسوم الاستيراد',               'customs',  5.00, 'purchases','Standard import duty')
ON CONFLICT (code) DO NOTHING;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION acct_tax_codes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_acct_tax_codes_updated_at ON acct_tax_codes;
CREATE TRIGGER trg_acct_tax_codes_updated_at
  BEFORE UPDATE ON acct_tax_codes
  FOR EACH ROW EXECUTE FUNCTION acct_tax_codes_updated_at();

-- RLS
ALTER TABLE acct_tax_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS acct_tax_codes_read  ON acct_tax_codes;
DROP POLICY IF EXISTS acct_tax_codes_write ON acct_tax_codes;
CREATE POLICY acct_tax_codes_read  ON acct_tax_codes FOR SELECT USING (true);
CREATE POLICY acct_tax_codes_write ON acct_tax_codes FOR ALL
  USING (auth.role() = 'authenticated');

-- ── 2. Exchange Rates ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS acct_exchange_rates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency   text NOT NULL,                 -- ISO 4217 e.g. USD
  to_currency     text NOT NULL,                 -- ISO 4217 e.g. SDG
  rate            numeric(20,8) NOT NULL CHECK (rate > 0),
  effective_date  date NOT NULL,
  source          text,                          -- manual | central_bank | reuters | bloomberg | ecb
  country_id      uuid REFERENCES countries(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_currency, to_currency, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_acct_exchange_rates_pair_date
  ON acct_exchange_rates (from_currency, to_currency, effective_date DESC);

-- RLS
ALTER TABLE acct_exchange_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS acct_exchange_rates_read  ON acct_exchange_rates;
DROP POLICY IF EXISTS acct_exchange_rates_write ON acct_exchange_rates;
CREATE POLICY acct_exchange_rates_read  ON acct_exchange_rates FOR SELECT USING (true);
CREATE POLICY acct_exchange_rates_write ON acct_exchange_rates FOR ALL
  USING (auth.role() = 'authenticated');

-- Helper: get active rate for a pair on a given date
CREATE OR REPLACE FUNCTION acct_get_exchange_rate(
  p_from text, p_to text, p_date date DEFAULT CURRENT_DATE
) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT rate FROM acct_exchange_rates
  WHERE from_currency = p_from AND to_currency = p_to AND effective_date <= p_date
  ORDER BY effective_date DESC LIMIT 1;
$$;

-- ── 3. Tax Summary View / RPC ─────────────────────────────────
-- Returns aggregated tax by tax_code from ap_invoices.
-- Requires ap_invoices to have tax_code_id column (add if missing).

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ap_invoices' AND column_name = 'tax_code_id'
  ) THEN
    ALTER TABLE ap_invoices ADD COLUMN tax_code_id uuid REFERENCES acct_tax_codes(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION acct_tax_summary()
RETURNS TABLE (
  tax_code     text,
  tax_type     text,
  rate_pct     numeric,
  base_amount  numeric,
  tax_amount   numeric,
  invoice_count bigint
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    tc.code,
    tc.tax_type,
    tc.rate_pct,
    COALESCE(SUM(ai.subtotal), 0)::numeric,
    COALESCE(SUM(ai.tax_amount), 0)::numeric,
    COUNT(ai.id)
  FROM acct_tax_codes tc
  LEFT JOIN ap_invoices ai
    ON ai.tax_code_id = tc.id
   AND ai.status IN ('posted', 'paid')
  GROUP BY tc.id, tc.code, tc.tax_type, tc.rate_pct
  ORDER BY tc.code;
$$;

-- ── 4. Period Close Log ───────────────────────────────────────
-- Audit trail for period status transitions

CREATE TABLE IF NOT EXISTS acct_period_close_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id   uuid NOT NULL REFERENCES acct_fiscal_periods(id) ON DELETE CASCADE,
  from_status text NOT NULL,
  to_status   text NOT NULL,
  changed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE acct_period_close_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY acct_period_close_log_read ON acct_period_close_log FOR SELECT USING (true);
CREATE POLICY acct_period_close_log_write ON acct_period_close_log FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- ── 5. Budget Encumbrance Tracking ───────────────────────────

CREATE TABLE IF NOT EXISTS acct_budget_encumbrances (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_line_id   uuid,                          -- references budget_lines if exists
  source_type      text NOT NULL,                 -- purchase_requisition | purchase_order
  source_id        uuid NOT NULL,
  amount           numeric(18,2) NOT NULL CHECK (amount >= 0),
  currency         text NOT NULL DEFAULT 'USD',
  status           text NOT NULL DEFAULT 'open',  -- open | liquidated | cancelled
  fund_id          uuid REFERENCES acct_funds(id) ON DELETE SET NULL,
  country_id       uuid REFERENCES countries(id) ON DELETE SET NULL,
  gl_account_id    uuid REFERENCES acct_accounts(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE acct_budget_encumbrances ENABLE ROW LEVEL SECURITY;
CREATE POLICY acct_budget_encumbrances_read  ON acct_budget_encumbrances FOR SELECT USING (true);
CREATE POLICY acct_budget_encumbrances_write ON acct_budget_encumbrances FOR ALL
  USING (auth.role() = 'authenticated');

-- ── 6. Feature flags for Phase 4 ─────────────────────────────

INSERT INTO feature_flags (key, description, is_enabled, rolled_out_pct, updated_at) VALUES
  ('acct.multi_currency.enabled',   'Allow journals in non-base currency with auto-revaluation.', false, 100, now()),
  ('acct.tax.auto_apply',           'Automatically apply tax codes to new AP invoices based on vendor country.', false, 100, now()),
  ('acct.encumbrance.enabled',      'Track budget encumbrances from PRs and POs.', false, 100, now()),
  ('acct.period_auto_close',        'Automatically soft-close periods 5 days after their end date.', false, 100, now())
ON CONFLICT (key) DO NOTHING;

-- ── Done ─────────────────────────────────────────────────────
-- Tables created:
--   acct_tax_codes          (tax code registry)
--   acct_exchange_rates     (FX rate history)
--   acct_period_close_log   (period close audit trail)
--   acct_budget_encumbrances (commitment accounting)
-- Functions:
--   acct_get_exchange_rate(from, to, date)
--   acct_tax_summary()
-- Columns added to ap_invoices:
--   tax_code_id
