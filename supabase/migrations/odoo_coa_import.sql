-- ═══════════════════════════════════════════════════════════════════════════
-- Odoo COA → PACT Command Center — STAGING IMPORT
-- Source  : Account_(account.account) export — 309 accounts
-- Companies: PACT Consultancy Group, PACT Sudan
-- Generated: 2026-07-14
--
-- SAFE TO RUN: This script loads into a staging table only.
-- Nothing in acct_accounts is touched until you run Step 4.
-- All steps are idempotent (re-runnable).
-- ═══════════════════════════════════════════════════════════════════════════

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ STEP 1 — Create staging table (safe, idempotent)                        │
-- └─────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS odoo_coa_staging (
  id                  SERIAL PRIMARY KEY,
  odoo_code           TEXT NOT NULL,
  odoo_name           TEXT NOT NULL,
  odoo_type           TEXT NOT NULL,
  odoo_company        TEXT NOT NULL,
  allow_reconciliation BOOLEAN NOT NULL DEFAULT FALSE,
  account_currency    TEXT,
  pact_account_type   TEXT,   -- mapped from odoo_type
  pact_subtype        TEXT,   -- mapped from odoo_type
  internal_group      TEXT,   -- mapped from odoo_type
  already_exists      BOOLEAN GENERATED ALWAYS AS (FALSE) STORED, -- updated by Step 2
  imported_at         TIMESTAMPTZ
);

-- Clear and reload so this is idempotent
TRUNCATE odoo_coa_staging RESTART IDENTITY;

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ STEP 2 — Load all 309 Odoo accounts into staging                        │
-- └─────────────────────────────────────────────────────────────────────────┘
INSERT INTO odoo_coa_staging
  (odoo_code, odoo_name, odoo_type, odoo_company, allow_reconciliation, account_currency, pact_account_type, pact_subtype, internal_group)
VALUES
  ('110000', 'Debtors Control Account', 'Receivable', 'PACT Consultancy Group', true, 'USD', 'asset', 'current_asset', 'receivable'),
  ('110010', 'Debtors Control Account (POS)', 'Receivable', 'PACT Consultancy Group', true, 'USD', 'asset', 'current_asset', 'receivable'),
  ('110100', 'Accounts Receivable USD', 'Receivable', 'PACT Sudan', true, 'USD', 'asset', 'current_asset', 'receivable'),
  ('110100', 'Sundry Debtors USD', 'Receivable', 'PACT Consultancy Group', true, 'USD', 'asset', 'current_asset', 'receivable'),
  ('110200', 'Other Debtors', 'Current Assets', 'PACT Sudan', false, NULL, 'asset', 'current_asset', NULL),
  ('110200', 'Other Debtors', 'Current Assets', 'PACT Consultancy Group', false, 'USD', 'asset', 'current_asset', NULL),
  ('110300', 'Prepayments', 'Current Assets', 'PACT Consultancy Group', false, 'USD', 'asset', 'current_asset', NULL),
  ('110311', 'null', 'Prepayments', 'PACT Sudan', false, NULL, 'asset', 'current_asset', NULL),
  ('111000', 'Purchase Tax Control Account', 'Current Assets', 'PACT Consultancy Group', false, 'USD', 'asset', 'current_asset', NULL),
  ('111000', 'Purchase Tax Control Account', 'Current Assets', 'PACT Sudan', false, NULL, 'asset', 'current_asset', NULL),
  ('112000', 'Withholding Tax Advance on Sales', 'Current Assets', 'PACT Sudan', true, NULL, 'asset', 'current_asset', NULL),
  ('112000', 'Withholding Tax Advance on Sales', 'Current Assets', 'PACT Consultancy Group', true, 'USD', 'asset', 'current_asset', NULL),
  ('112500', 'Due To / Due From PACT Sudan', 'Non-current Liabilities', 'PACT Sudan', false, 'USD', 'liability', 'non_current_liability', NULL),
  ('112500', 'Due To / Due From PACT Uganda', 'Non-current Liabilities', 'PACT Consultancy Group', false, 'USD', 'liability', 'non_current_liability', NULL),
  ('120001', 'Bank Suspense Account', 'Current Assets', 'PACT Consultancy Group', false, 'USD', 'asset', 'current_asset', NULL),
  ('120001', 'Bank Suspense Account', 'Current Assets', 'PACT Sudan', false, NULL, 'asset', 'current_asset', NULL),
  ('120002', 'Outstanding Receipts', 'Current Assets', 'PACT Sudan', true, NULL, 'asset', 'current_asset', NULL),
  ('120002', 'Outstanding Receipts', 'Current Assets', 'PACT Consultancy Group', true, 'USD', 'asset', 'current_asset', NULL),
  ('120003', 'Employee Loans', 'Current Assets', 'PACT Sudan', true, NULL, 'asset', 'current_asset', NULL),
  ('120003', 'Employee Loans', 'Current Assets', 'PACT Consultancy Group', true, 'USD', 'asset', 'current_asset', NULL),
  ('120004', 'Bank', 'Bank and Cash', 'PACT Sudan', false, NULL, 'asset', 'current_asset', 'liquidity'),
  ('120005', 'Blue Nile Mashreg Bank SDG', 'Bank and Cash', 'PACT Sudan', false, 'SDG', 'asset', 'current_asset', 'liquidity'),
  ('120006', 'Blue Nile Mashreg Bank USD', 'Bank and Cash', 'PACT Sudan', false, 'USD', 'asset', 'current_asset', 'liquidity'),
  ('120008', 'Outstanding Payments', 'Current Assets', 'PACT Consultancy Group', true, NULL, 'asset', 'current_asset', NULL),
  ('120009', 'Ecobank South Sudan', 'Bank and Cash', 'PACT Consultancy Group', false, 'USD', 'asset', 'current_asset', 'liquidity'),
  ('120100', 'Blue Nile Mashreg Bank SDG', 'Bank and Cash', 'PACT Sudan', false, 'SDG', 'asset', 'current_asset', 'liquidity'),
  ('120101', 'Blue Nile Mashreg Bank USD', 'Bank and Cash', 'PACT Consultancy Group', false, 'USD', 'asset', 'current_asset', 'liquidity'),
  ('120102', 'Cash SDG - Sudan', 'Bank and Cash', 'PACT Consultancy Group', false, 'SDG', 'asset', 'current_asset', 'liquidity'),
  ('120103', 'Cash USD - Sudan', 'Bank and Cash', 'PACT Consultancy Group', false, 'USD', 'asset', 'current_asset', 'liquidity'),
  ('120200', 'KCB BANK RWANDA', 'Bank and Cash', 'PACT Consultancy Group', false, 'USD', 'asset', 'current_asset', 'liquidity'),
  ('120400', 'Cairo Intl Bank - USD - Settlement Account (1000371145)', 'Bank and Cash', 'PACT Consultancy Group', false, 'USD', 'asset', 'current_asset', 'liquidity'),
  ('120401', 'Cairo Intl Bank - USD - Operational Account (1000615648)', 'Bank and Cash', 'PACT Consultancy Group', false, NULL, 'asset', 'current_asset', 'liquidity'),
  ('120403', 'Cairo Intl Bank - UGX Account (1000371088)', 'Bank and Cash', 'PACT Consultancy Group', false, 'UGX', 'asset', 'current_asset', 'liquidity'),
  ('120404', 'PACT Sudan - Escrow Account', 'Bank and Cash', 'PACT Consultancy Group', false, 'USD', 'asset', 'current_asset', 'liquidity'),
  ('121000', 'Accounts Receivable', 'Receivable', 'PACT Sudan', true, NULL, 'asset', 'current_asset', 'receivable'),
  ('121001', 'Liquidity Transfer', 'Current Assets', 'PACT Sudan', true, NULL, 'asset', 'current_asset', NULL),
  ('121001', 'Liquidity Transfer', 'Current Assets', 'PACT Consultancy Group', true, 'USD', 'asset', 'current_asset', NULL),
  ('125001', 'Cash Account', 'Bank and Cash', 'PACT Consultancy Group', false, 'USD', 'asset', 'current_asset', 'liquidity'),
  ('125001', 'Cash SDG', 'Bank and Cash', 'PACT Sudan', false, 'SDG', 'asset', 'current_asset', 'liquidity'),
  ('125002', 'Cash USD', 'Bank and Cash', 'PACT Sudan', false, 'USD', 'asset', 'current_asset', 'liquidity'),
  ('125002', 'Cash Account: Brendah Babirye', 'Bank and Cash', 'PACT Consultancy Group', false, 'USD', 'asset', 'current_asset', 'liquidity'),
  ('125003', 'Cash Account:Dalmas Menya', 'Bank and Cash', 'PACT Consultancy Group', false, 'USD', 'asset', 'current_asset', 'liquidity'),
  ('125003', 'Cash Gizooly USD', 'Bank and Cash', 'PACT Sudan', false, 'USD', 'asset', 'current_asset', 'liquidity'),
  ('125004', 'Cash Gizooly SDG', 'Bank and Cash', 'PACT Sudan', false, 'SDG', 'asset', 'current_asset', 'liquidity'),
  ('125004', 'Cash Account: ELSIDDG IBRAHIM', 'Bank and Cash', 'PACT Consultancy Group', false, 'USD', 'asset', 'current_asset', 'liquidity'),
  ('125005', 'Cash Abdallah  SDG', 'Bank and Cash', 'PACT Sudan', false, 'SDG', 'asset', 'current_asset', 'liquidity'),
  ('131000', 'Tax Paid', 'Current Assets', 'PACT Consultancy Group', false, 'USD', 'asset', 'current_asset', NULL),
  ('131000', 'Tax Paid', 'Current Assets', 'PACT Sudan', false, NULL, 'asset', 'current_asset', NULL),
  ('132000', 'Tax Receivable', 'Current Assets', 'PACT Consultancy Group', false, 'USD', 'asset', 'current_asset', NULL),
  ('132000', 'Tax Receivable', 'Current Assets', 'PACT Sudan', false, NULL, 'asset', 'current_asset', NULL),
  ('200100', 'Stock', 'Current Assets', 'PACT Consultancy Group', false, 'USD', 'asset', 'current_asset', NULL),
  ('200110', 'Stock Interim (Received)', 'Current Assets', 'PACT Consultancy Group', false, 'USD', 'asset', 'current_asset', NULL),
  ('200120', 'Stock Interim (Delivered)', 'Current Assets', 'PACT Consultancy Group', false, 'USD', 'asset', 'current_asset', NULL),
  ('200200', 'Work in Progress', 'Current Assets', 'PACT Consultancy Group', false, 'USD', 'asset', 'current_asset', NULL),
  ('200300', 'Finished Goods', 'Current Assets', 'PACT Consultancy Group', false, 'USD', 'asset', 'current_asset', NULL),
  ('201000', 'Software', 'Non-current Assets', 'PACT Consultancy Group', false, 'USD', 'asset', 'non_current_asset', NULL),
  ('202000', 'Patents & Trademarks', 'Non-current Assets', 'PACT Consultancy Group', false, 'USD', 'asset', 'non_current_asset', NULL),
  ('203000', 'Office Furniture and Equipment', 'Fixed Assets', 'PACT Consultancy Group', true, 'USD', 'asset', 'non_current_asset', NULL),
  ('204000', 'Land and buildings', 'Fixed Assets', 'PACT Consultancy Group', false, 'USD', 'asset', 'non_current_asset', NULL),
  ('205000', 'Motor vehicles', 'Fixed Assets', 'PACT Consultancy Group', false, 'USD', 'asset', 'non_current_asset', NULL),
  ('206000', 'Computer hardware and software', 'Fixed Assets', 'PACT Consultancy Group', false, 'USD', 'asset', 'non_current_asset', NULL),
  ('207000', 'Plant and machinery', 'Fixed Assets', 'PACT Consultancy Group', false, 'USD', 'asset', 'non_current_asset', NULL),
  ('208000', 'Financial assets', 'Non-current Assets', 'PACT Consultancy Group', false, 'USD', 'asset', 'non_current_asset', NULL),
  ('209000', 'Biological assets', 'Non-current Assets', 'PACT Consultancy Group', false, 'USD', 'asset', 'non_current_asset', NULL),
  ('209001', 'Accumulated Depreciation', 'Fixed Assets', 'PACT Consultancy Group', true, 'USD', 'asset', 'non_current_asset', NULL),
  ('209005', 'Deferred Tax Asset', 'Non-current Assets', 'PACT Consultancy Group', false, NULL, 'asset', 'non_current_asset', NULL),
  ('209015', 'Deferred Tax Liability', 'Non-current Liabilities', 'PACT Consultancy Group', false, NULL, 'liability', 'non_current_liability', NULL),
  ('210000', 'Creditors Control Account', 'Payable', 'PACT Sudan', true, NULL, 'liability', 'current_liability', 'payable'),
  ('210000', 'Creditors Control Account', 'Payable', 'PACT Consultancy Group', true, 'USD', 'liability', 'current_liability', 'payable'),
  ('210100', 'Accounts Payable USD', 'Current Liabilities', 'PACT Sudan', false, 'USD', 'liability', 'current_liability', NULL),
  ('210100', 'Accounts Payable', 'Current Liabilities', 'PACT Consultancy Group', false, 'USD', 'liability', 'current_liability', NULL),
  ('210200', 'Other Creditors', 'Current Liabilities', 'PACT Sudan', false, NULL, 'liability', 'current_liability', NULL),
  ('210200', 'Accounts Payable - UGX', 'Current Liabilities', 'PACT Consultancy Group', false, 'UGX', 'liability', 'current_liability', NULL),
  ('210300', 'Accruals', 'Current Liabilities', 'PACT Consultancy Group', false, 'USD', 'liability', 'current_liability', NULL),
  ('210300', 'Accruals', 'Current Liabilities', 'PACT Sudan', false, NULL, 'liability', 'current_liability', NULL),
  ('210500', 'Bad debt provision', 'Current Liabilities', 'PACT Sudan', false, NULL, 'liability', 'current_liability', NULL),
  ('210500', 'Bad debt provision', 'Current Liabilities', 'PACT Consultancy Group', false, 'USD', 'liability', 'current_liability', NULL),
  ('211000', 'Accounts Payable', 'Payable', 'PACT Sudan', true, NULL, 'liability', 'current_liability', 'payable'),
  ('220000', 'Sales Tax Control Account', 'Current Liabilities', 'PACT Sudan', false, NULL, 'liability', 'current_liability', NULL),
  ('220000', 'Sales Tax Control Account', 'Current Liabilities', 'PACT Consultancy Group', false, 'USD', 'liability', 'current_liability', NULL),
  ('220100', 'VAT Payable', 'Payable', 'PACT Sudan', true, NULL, 'liability', 'current_liability', 'payable'),
  ('220100', 'VAT Payable', 'Payable', 'PACT Consultancy Group', true, 'USD', 'liability', 'current_liability', 'payable'),
  ('220200', 'Manual Adjustments & VAT', 'Current Liabilities', 'PACT Sudan', false, NULL, 'liability', 'current_liability', NULL),
  ('220200', 'Manual Adjustments & VAT', 'Current Liabilities', 'PACT Consultancy Group', false, 'USD', 'liability', 'current_liability', NULL),
  ('220300', 'Withholding Tax Payable', 'Current Liabilities', 'PACT Sudan', true, NULL, 'liability', 'current_liability', NULL),
  ('220300', 'Withholding Tax Payable', 'Current Liabilities', 'PACT Consultancy Group', true, 'USD', 'liability', 'current_liability', NULL),
  ('220400', 'Other Current Liabilities: Payroll Liabilities', 'Current Liabilities', 'PACT Sudan', false, NULL, 'liability', 'current_liability', NULL),
  ('220400', 'Other Current Liabilities: Payroll Liabilities', 'Current Liabilities', 'PACT Consultancy Group', false, 'USD', 'liability', 'current_liability', NULL),
  ('220500', 'Other Current Liabilities: Payroll Liabilities - Social Insurance', 'Current Liabilities', 'PACT Sudan', false, NULL, 'liability', 'current_liability', NULL),
  ('220500', 'Other Current Liabilities: Payroll Liabilities - Social Insurance', 'Current Liabilities', 'PACT Consultancy Group', false, 'USD', 'liability', 'current_liability', NULL),
  ('220600', 'Outstanding Payments', 'Current Liabilities', 'PACT Sudan', true, NULL, 'liability', 'current_liability', NULL),
  ('220600', 'Outstanding Payments', 'Current Liabilities', 'PACT Consultancy Group', true, 'USD', 'liability', 'current_liability', NULL),
  ('221000', 'PAYE Payable', 'Payable', 'PACT Sudan', true, NULL, 'liability', 'current_liability', 'payable'),
  ('221000', 'PAYE Payable', 'Payable', 'PACT Consultancy Group', true, 'USD', 'liability', 'current_liability', 'payable'),
  ('222000', 'Net Wages', 'Payable', 'PACT Sudan', true, NULL, 'liability', 'current_liability', 'payable'),
  ('222000', 'Net Wages', 'Payable', 'PACT Consultancy Group', true, 'USD', 'liability', 'current_liability', 'payable'),
  ('223000', 'Pension Fund', 'Payable', 'PACT Consultancy Group', true, 'USD', 'liability', 'current_liability', 'payable'),
  ('223000', 'Pension Fund', 'Payable', 'PACT Sudan', true, NULL, 'liability', 'current_liability', 'payable'),
  ('224000', 'Corporate Tax', 'Payable', 'PACT Sudan', true, NULL, 'liability', 'current_liability', 'payable'),
  ('224000', 'Corporate Tax', 'Expenses', 'PACT Consultancy Group', false, 'USD', 'expense', 'program_expense', NULL),
  ('230000', 'Loans', 'Non-current Liabilities', 'PACT Sudan', false, NULL, 'liability', 'non_current_liability', NULL),
  ('230000', 'Loans Due to Related Parties', 'Non-current Liabilities', 'PACT Consultancy Group', true, 'USD', 'liability', 'non_current_liability', NULL),
  ('230010', 'Short Term Revolver Loan', 'Current Liabilities', 'PACT Consultancy Group', true, 'USD', 'liability', 'current_liability', NULL),
  ('231000', 'Hire Purchase', 'Non-current Liabilities', 'PACT Consultancy Group', false, 'USD', 'liability', 'non_current_liability', NULL),
  ('231000', 'Hire Purchase', 'Non-current Liabilities', 'PACT Sudan', false, NULL, 'liability', 'non_current_liability', NULL),
  ('232000', 'Mortgages', 'Non-current Liabilities', 'PACT Consultancy Group', false, 'USD', 'liability', 'non_current_liability', NULL),
  ('232000', 'Mortgages', 'Non-current Liabilities', 'PACT Sudan', false, NULL, 'liability', 'non_current_liability', NULL),
  ('233000', 'Third Party Funds in Escrow: Craft Silicon', 'Current Liabilities', 'PACT Consultancy Group', false, 'USD', 'liability', 'current_liability', NULL),
  ('233001', 'Third Party Funds in Escrow: PACT - Sudan', 'Current Liabilities', 'PACT Consultancy Group', true, 'USD', 'liability', 'current_liability', NULL),
  ('233002', 'Third Party Funds in Escrow: PACT - Sudan: Accommodation - Consulting', 'Current Liabilities', 'PACT Consultancy Group', false, 'USD', 'liability', 'current_liability', NULL),
  ('233003', 'Third Party Funds in Escrow: PACT - Sudan: Business Meetings', 'Current Liabilities', 'PACT Consultancy Group', false, 'USD', 'liability', 'current_liability', NULL),
  ('233004', 'Third Party Funds in Escrow: PACT - Sudan: Consulting Expenses', 'Current Liabilities', 'PACT Consultancy Group', false, 'USD', 'liability', 'current_liability', NULL),
  ('233005', 'Third Party Funds in Escrow: PACT - Sudan:DSA', 'Current Liabilities', 'PACT Consultancy Group', false, 'USD', 'liability', 'current_liability', NULL),
  ('233006', 'Third Party Funds in Escrow: PACT - Sudan:Travel Expenses', 'Current Liabilities', 'PACT Consultancy Group', false, 'USD', 'liability', 'current_liability', NULL),
  ('233007', 'Third Party Funds in Escrow: PACT - Sudan:Visas & Permits', 'Current Liabilities', 'PACT Consultancy Group', false, 'USD', 'liability', 'current_liability', NULL),
  ('233008', 'Third Party Funds in Escrow: Partners in Development (PDS)', 'Current Liabilities', 'PACT Consultancy Group', false, 'USD', 'liability', 'current_liability', NULL),
  ('233009', 'Third Party Funds in Escrow: University of Khartoum - UKCC', 'Current Liabilities', 'PACT Consultancy Group', false, 'USD', 'liability', 'current_liability', NULL),
  ('233010', 'Third Party Funds in Escrow: PACT - Rwanda', 'Current Liabilities', 'PACT Consultancy Group', true, 'USD', 'liability', 'current_liability', NULL),
  ('233101', 'Third Party Funds in Escrow: PACT - South Sudan', 'Current Liabilities', 'PACT Consultancy Group', true, 'USD', 'liability', 'current_liability', NULL),
  ('233102', 'Third Party Funds in Escrow: PACT - South Sudan: Accommodation - Consulting', 'Current Liabilities', 'PACT Consultancy Group', false, 'USD', 'liability', 'current_liability', NULL),
  ('233103', 'Third Party Funds in Escrow: PACT - South Sudan: Business Meetings', 'Current Liabilities', 'PACT Consultancy Group', false, 'USD', 'liability', 'current_liability', NULL),
  ('233104', 'Third Party Funds in Escrow: PACT - South Sudan: Consulting Expenses', 'Current Liabilities', 'PACT Consultancy Group', false, 'USD', 'liability', 'current_liability', NULL),
  ('233105', 'Third Party Funds in Escrow: PACT - South Sudan: DSA', 'Current Liabilities', 'PACT Consultancy Group', false, 'USD', 'liability', 'current_liability', NULL),
  ('233106', 'Third Party Funds in Escrow: PACT - South Sudan: Travel Expenses', 'Current Liabilities', 'PACT Consultancy Group', false, 'USD', 'liability', 'current_liability', NULL),
  ('233107', 'Third Party Funds in Escrow: PACT - South Sudan: Visas & Permits', 'Current Liabilities', 'PACT Consultancy Group', false, 'USD', 'liability', 'current_liability', NULL),
  ('252000', 'Tax Payable', 'Current Liabilities', 'PACT Consultancy Group', false, NULL, 'liability', 'current_liability', NULL),
  ('300000', 'Called up share capital', 'Equity', 'PACT Sudan', false, NULL, 'equity', 'contributed_equity', 'equity'),
  ('301000', 'Share premium account', 'Equity', 'PACT Sudan', false, NULL, 'equity', 'contributed_equity', 'equity'),
  ('302000', 'Revaluation reserve', 'Equity', 'PACT Sudan', false, NULL, 'equity', 'contributed_equity', 'equity'),
  ('303000', 'Other reserves', 'Equity', 'PACT Sudan', false, NULL, 'equity', 'contributed_equity', 'equity'),
  ('304000', 'Capital', 'Equity', 'PACT Sudan', false, NULL, 'equity', 'contributed_equity', 'equity'),
  ('305000', 'Retained Earnings', 'Equity', 'PACT Sudan', false, NULL, 'equity', 'contributed_equity', 'equity'),
  ('306000', 'Dividends Paid', 'Equity', 'PACT Sudan', false, NULL, 'equity', 'contributed_equity', 'equity'),
  ('400000', 'Product Sales', 'Income', 'PACT Sudan', false, NULL, 'revenue', 'operating_revenue', 'income'),
  ('400100', 'Consulting Income', 'Income', 'PACT Consultancy Group', false, 'USD', 'revenue', 'operating_revenue', 'income'),
  ('400200', 'Training Income', 'Income', 'PACT Consultancy Group', false, 'USD', 'revenue', 'operating_revenue', 'income'),
  ('400200', 'Training Income', 'Income', 'PACT Sudan', false, NULL, 'revenue', 'operating_revenue', 'income'),
  ('400300', 'ITQAN Commission Income', 'Income', 'PACT Consultancy Group', true, 'USD', 'revenue', 'operating_revenue', 'income'),
  ('400300', 'ITQAN Commission Income', 'Income', 'PACT Sudan', false, NULL, 'revenue', 'operating_revenue', 'income'),
  ('400400', 'Management Fees', 'Income', 'PACT Consultancy Group', true, 'USD', 'revenue', 'operating_revenue', 'income'),
  ('400401', 'Consulting Income', 'Income', 'PACT Sudan', false, 'USD', 'revenue', 'operating_revenue', 'income'),
  ('400500', 'Bank Interest received', 'Income', 'PACT Consultancy Group', false, 'USD', 'revenue', 'operating_revenue', 'income'),
  ('400500', 'Bank Interest received', 'Income', 'PACT Sudan', false, NULL, 'revenue', 'operating_revenue', 'income'),
  ('400600', 'Investment Interest received', 'Income', 'PACT Sudan', false, NULL, 'revenue', 'operating_revenue', 'income'),
  ('400600', 'Investment Interest received', 'Income', 'PACT Consultancy Group', false, 'USD', 'revenue', 'operating_revenue', 'income'),
  ('400700', 'Exchange Gain or Loss', 'Other Income', 'PACT Consultancy Group', false, 'USD', 'revenue', 'non_operating_revenue', 'income'),
  ('400700', 'Exchange Gain', 'Other Income', 'PACT Sudan', false, NULL, 'revenue', 'non_operating_revenue', 'income'),
  ('400800', 'Proceeds from Sale of Assets', 'Income', 'PACT Consultancy Group', false, 'USD', 'revenue', 'operating_revenue', 'income'),
  ('400800', 'Proceeds from sale of assets', 'Income', 'PACT Sudan', false, NULL, 'revenue', 'operating_revenue', 'income'),
  ('401000', 'Other Income', 'Other Income', 'PACT Consultancy Group', true, 'USD', 'revenue', 'non_operating_revenue', 'income'),
  ('401000', 'Other Income', 'Other Income', 'PACT Sudan', false, NULL, 'revenue', 'non_operating_revenue', 'income'),
  ('42000', 'Deferred Revenue', 'Current Liabilities', 'PACT Consultancy Group', true, 'USD', 'liability', 'current_liability', NULL),
  ('500000', 'Expenses', 'Expenses', 'PACT Consultancy Group', false, 'USD', 'expense', 'program_expense', NULL),
  ('500100', 'Cost of Goods Sold', 'Cost of Revenue', 'PACT Consultancy Group', true, 'USD', 'expense', 'cogs', NULL),
  ('500101', 'Subcontracted Services', 'Cost of Revenue', 'PACT Consultancy Group', true, 'USD', 'expense', 'cogs', NULL),
  ('510100', 'Bonds & Guarantees', 'Expenses', 'PACT Consultancy Group', false, 'USD', 'expense', 'program_expense', NULL),
  ('510200', 'Consulting Expenses: Consultant Fees', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('510201', 'Consulting Expenses: Consultant Fees: Withholding Tax', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('510300', 'Consulting Expenses: Data Collection: Data Collection', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('510301', 'Consulting Expenses: Data Collection: Data Cost', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('510302', 'Consulting Expenses: Data Collection: Data Entry', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('510303', 'Consulting Expenses: Data Collection: Monthly allowance', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('510304', 'Consulting Expenses: Data Collection: Telecom & internet', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('510305', 'Consulting Expenses: Data Collection: Training', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('510306', 'Consulting Expenses:Communication', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('510307', 'Consulting Expenses: Enumerators Fees', 'Expenses', 'PACT Sudan', false, 'USD', 'expense', 'program_expense', NULL),
  ('510308', 'Consulting Expenses: State Coordinators Fee', 'Expenses', 'PACT Consultancy Group', false, 'USD', 'expense', 'program_expense', NULL),
  ('510309', 'Consulting Expenses: State Supervisor''s', 'Expenses', 'PACT Consultancy Group', false, 'USD', 'expense', 'program_expense', NULL),
  ('510310', 'Consulting Expenses: Data Collection: Supplies & Equipment', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('510400', 'Consulting Expenses: Transportations & Facilities Rental', 'Expenses', 'PACT Sudan', true, 'USD', 'expense', 'program_expense', NULL),
  ('510401', 'Consulting Expenses: Movement Permits', 'Expenses', 'PACT Sudan', true, 'USD', 'expense', 'program_expense', NULL),
  ('510402', 'null', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('510403', 'Consulting Expenses: Transportations & Facilities Rental (copy)', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('510500', 'Consulting Expenses: Money Transfer Fee', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('510600', 'Consulting Expenses: Printing & Reproduction', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('510700', 'Consulting Expenses: Subcontracts - Consulting', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('510800', 'Consulting Expenses: Supplies & Equipment', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('510900', 'Consulting Expenses: Translation', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('510901', 'Gross Salaries', 'Other Income', 'PACT Sudan', false, 'USD', 'revenue', 'non_operating_revenue', 'income'),
  ('511000', 'Consulting Expenses: Travel: Accommodation & Meals', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511001', 'Consulting Expenses: Travel: Airfare', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511002', 'Consulting Expenses: Travel: Car Rental', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511003', 'Consulting Expenses: Travel: Fees & Visas', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511004', 'Consulting Expenses: Travel: Fuel', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511005', 'Consulting Expenses: Travel: Gratuity & Tips', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511006', 'Consulting Expenses: Travel: Meals', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511007', 'Consulting Expenses: Travel: Miscellaneous', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511008', 'Consulting Expenses: Travel: Other', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511009', 'Consulting Expenses:Travel:DSA - Consulting', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511010', 'Consulting Expenses: Travel: Transport', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511011', 'null', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511100', 'Depreciation Expense', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511200', 'Miscellaneous Expense', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511300', 'Operating Expense: Advertising and Promotion', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511400', 'Operating Expense: Automobile Expense: Licenses and Fees', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511401', 'Operating Expense: Automobile Expense: Car Rental', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511402', 'Operating Expense: Automobile Expense: Fuel & Oil', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511404', 'Operating Expense: Automobile Expense: Maintenance', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511500', '511500 Operating Expense: Bank Service Charges Other', 'Expenses', 'PACT Sudan', true, NULL, 'expense', 'program_expense', NULL),
  ('511500', 'Operating Expense: Bank Service Charges', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511600', 'Operating Expense: Business Development: Newspapers & Publications', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511601', 'Operating Expense: Business Development: Travel - Meals', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511602', 'Operating Expense: Business Development: Travel: Accommodation', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511603', 'Operating Expense: Business Development: Travel: Airfare', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511604', 'Operating Expense: Business Development: Travel: Visa Fees', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511605', 'Operating Expense: Business Development: Travel: DSA', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511606', 'Operating Expense: Business Development: Travel: Transportation', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511607', 'Operating Expense: Business Development: Business Meetings, Workshop and Conferences', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511700', 'Operating Expense: Business Licenses and Permits', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511800', 'Operating Expense: Charitable Contributions', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('511900', 'Operating Expense: Computer and Software', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('512000', 'Operating Expense: Staff Continuing Education', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('513000', 'Operating Expense: Dues and Subscriptions: Web & hosting services', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('513001', 'Operating Expense: Dues and Subscriptions: Other', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('514000', 'Operating Expense: Equipment Rental', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('515000', 'Operating Expense: Gifts', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('516000', 'Operating Expense: General Insurance Expense', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('516001', 'Operating Expense: Insurance Expense:General Liability Insurance', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('516002', 'Operating Expense: Insurance Expense:Health Insurance', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('516100', 'Operating Expense: Interest Expense', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('517000', 'Operating Expense: Meals and Entertainment', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('518000', 'Operating Expense: Office Rent', 'Expenses', 'PACT Sudan', true, 'USD', 'expense', 'program_expense', NULL),
  ('518001', 'Operating Expense: Office Supplies', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('518002', 'Operating Expense: Office Rent (copy)', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('519000', 'Operating Expense: Payroll Expenses: Salaries', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('519001', 'Operating Expense: Payroll Expenses: Annual Leave Substitution', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('519002', 'Operating Expense: Payroll Expenses: Bonus', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('519003', 'Operating Expense: Payroll Expenses: NSSF', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('519004', 'Operating Expense: Payroll Expenses: Termination pay', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('519005', 'Operating Expense: Payroll Expenses: PAYE', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('519007', 'Operating Expense: Employee Welfare and Other Benefits', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('519100', 'Operating Expense: Corporate Income Tax', 'Expenses', 'PACT Consultancy Group', false, 'USD', 'expense', 'program_expense', NULL),
  ('520000', 'Operating Expense: Postage and Delivery', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('520100', 'Software Depreciation', 'Depreciation', 'PACT Consultancy Group', true, 'USD', 'expense', 'other_expense', NULL),
  ('520200', 'Patents & Trademarks Depreciation', 'Depreciation', 'PACT Consultancy Group', true, 'USD', 'expense', 'other_expense', NULL),
  ('520300', 'Office Furniture and Equipment Depreciation', 'Depreciation', 'PACT Consultancy Group', true, 'USD', 'expense', 'other_expense', NULL),
  ('520400', 'Land and buildings Depreciation', 'Depreciation', 'PACT Consultancy Group', true, 'USD', 'expense', 'other_expense', NULL),
  ('520500', 'Motor vehicles Depreciation', 'Depreciation', 'PACT Consultancy Group', true, 'USD', 'expense', 'other_expense', NULL),
  ('520600', 'Computer hardware and software Depreciation', 'Depreciation', 'PACT Consultancy Group', true, 'USD', 'expense', 'other_expense', NULL),
  ('520700', 'Plant and machinery Depreciation', 'Depreciation', 'PACT Consultancy Group', true, 'USD', 'expense', 'other_expense', NULL),
  ('521000', 'Operating Expense: Printing and Reproduction', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('522000', 'Operating Expense: Professional Fees: Accounting & Tax', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('522001', 'Operating Expense: Professional Fees: Legal Fees', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('522002', 'Operating Expense: Professional Fees:Auditing', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('522003', 'Operating Expense: Professional Fees: Withholding Tax', 'Expenses', 'PACT Consultancy Group', false, 'USD', 'expense', 'program_expense', NULL),
  ('522004', 'Operating Expense: Professional Fees: IT/Software Development', 'Expenses', 'PACT Consultancy Group', false, 'USD', 'expense', 'program_expense', NULL),
  ('523000', 'Operating Expense: Repairs and Maintenance', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('523001', 'Operating Expense: Cleaning and Janitorial services', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('523011', 'Operating Expense: Staff Training', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('524000', 'Operating Expense: Telecom', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('524001', 'Operating Expense: Telecom:Internet', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('524002', 'Operating Expense: Telecom:Telephone Expense', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('525000', 'Operating Expense: Tender Doc. & Proposal Writing', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('525001', 'Operating Expense: Tender Doc. & Proposal Writing:Bid Bond tender', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('526000', 'Operating Expense: Transportation', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('527000', 'Operating Expense: Travel Expense:Accommodation', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('527001', 'Operating Expense: Travel Expense:Air Fare', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('527002', 'Operating Expense: Travel Expense:Car Rental', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('527003', 'Operating Expense: Travel Expense: Fees & Visas & Accommodation', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('527004', 'Operating Expense: Travel Expense:Fuel', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('527005', 'Operating Expense: Travel Expense:Gratuity & Tips', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('527006', 'Operating Expense: Travel Expense:Meals', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('527007', 'Operating Expense: Travel Expense:Miscellaneous', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('527008', 'Operating Expense: Travel Expense: DSA', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('527009', 'Operating Expense: Travel Expense:Transport', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('528000', 'Operating Expense: Utilities:Electricity & Water', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('528001', 'Operating Expense: Garbage Collection & Waste Disposal', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('528002', 'Operating Expense: Security Services', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('529000', 'Operating Expense: Local Services Tax (LST)', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('529001', 'Taxes: Garbage Tax', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('529002', 'Taxes: Personal Income Tax', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('529003', 'Taxes: Property Tax', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('529004', 'Taxes: VAT', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('529005', 'Taxes: Zakat', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('530000', 'Training Expense: Equipment Rental', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('530001', 'Training Expense: Hall Rental', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('530002', 'Training Expense: Logistics & Coordinators', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('530003', 'Training Expense: Meals', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('530004', 'Training Expense: Printing & Reproduction', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('530005', 'Training Expense: Subcontract - Training', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('530006', 'Training Expense: Supplies & Stationery', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('530007', 'Training Expense: Trainees Meals', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('530008', 'Training Expense: Trainers Fees', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('530009', 'Training Expense: Training Material', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('530010', 'Training Expense: Other', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('531000', 'Training Expense: Travel: Accommodation', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('531001', 'Training Expense: Travel: Airfare', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('531002', 'Training Expense: Travel: Car Rental', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('531003', 'Training Expense: Travel: Fees & Visas', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('531004', 'Training Expense: Travel: Fuel', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('531005', 'Training Expense: Travel: Gratuity & Tips', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('531006', 'Training Expense: Travel: Miscellaneous', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('531007', 'Training Expense: Travel: DSA', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('531008', 'Training Expense: Travel: Transport', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('532000', 'Exchange Gain or Loss', 'Expenses', 'PACT Consultancy Group', true, 'USD', 'expense', 'program_expense', NULL),
  ('5320001', 'Deprecation', 'Expenses', 'PACT Consultancy Group', false, 'USD', 'expense', 'program_expense', NULL),
  ('600000', 'Called up share capital', 'Equity', 'PACT Consultancy Group', false, 'USD', 'equity', 'contributed_equity', 'equity'),
  ('600000', 'Expenses', 'Expenses', 'PACT Sudan', false, NULL, 'expense', 'program_expense', NULL),
  ('601000', 'Share premium account', 'Equity', 'PACT Consultancy Group', false, 'USD', 'equity', 'contributed_equity', 'equity'),
  ('602000', 'Revaluation reserve', 'Equity', 'PACT Consultancy Group', false, 'USD', 'equity', 'contributed_equity', 'equity'),
  ('603000', 'Other reserves', 'Equity', 'PACT Consultancy Group', false, 'USD', 'equity', 'contributed_equity', 'equity'),
  ('604000', 'Share Capital', 'Equity', 'PACT Consultancy Group', false, 'USD', 'equity', 'contributed_equity', 'equity'),
  ('604001', 'Undistributed Profits/Losses', 'Current Year Earnings', 'PACT Consultancy Group', false, 'USD', 'equity', 'retained_equity', 'equity'),
  ('605000', 'Retained Earnings', 'Equity', 'PACT Consultancy Group', false, 'USD', 'equity', 'contributed_equity', 'equity'),
  ('606000', 'Dividends Paid', 'Equity', 'PACT Consultancy Group', false, 'USD', 'equity', 'contributed_equity', 'equity'),
  ('800000', 'Program Expenses', 'Expenses', 'PACT Consultancy Group', false, 'USD', 'expense', 'program_expense', NULL),
  ('909001', 'Cash Difference Gain', 'Other Income', 'PACT Consultancy Group', false, NULL, 'revenue', 'non_operating_revenue', 'income'),
  ('999001', 'Cash Difference Gain', 'Other Income', 'PACT Sudan', false, NULL, 'revenue', 'non_operating_revenue', 'income'),
  ('999999', 'Undistributed Profits/Losses', 'Current Year Earnings', 'PACT Sudan', false, NULL, 'equity', 'retained_equity', 'equity');

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ STEP 3 — Diff report: what already exists in acct_accounts?             │
-- └─────────────────────────────────────────────────────────────────────────┘
-- Run this SELECT to see what's new vs already in PACT:
SELECT
  s.odoo_code,
  s.odoo_name,
  s.odoo_company,
  s.odoo_type,
  CASE WHEN a.id IS NOT NULL THEN '✅ EXISTS in PACT' ELSE '🆕 NEW' END AS status,
  a.name_en AS pact_name,
  a.code    AS pact_code
FROM odoo_coa_staging s
LEFT JOIN acct_accounts a ON a.code = s.odoo_code
ORDER BY s.odoo_code, s.odoo_company;

-- Summary counts:
SELECT
  CASE WHEN a.id IS NOT NULL THEN 'EXISTS in PACT' ELSE 'NEW (will be imported)' END AS status,
  COUNT(*) AS accounts
FROM odoo_coa_staging s
LEFT JOIN acct_accounts a ON a.code = s.odoo_code
GROUP BY 1;

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ STEP 4 — Ensure companies exist (run ONCE, idempotent)                  │
-- │ NOTE: Edit currency_code to match your actual setup if needed.          │
-- └─────────────────────────────────────────────────────────────────────────┘
INSERT INTO companies (code, name_en, currency_code, functional_currency, is_active)
VALUES
  ('PACT-GRP', 'PACT Consultancy Group', 'USD', 'USD', TRUE),
  ('PACT-SDN', 'PACT Sudan',             'SDG', 'SDG', TRUE)
ON CONFLICT (code) DO NOTHING;

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ STEP 5 — Import NEW accounts from staging → acct_accounts               │
-- │ SAFE: only inserts codes that don't already exist. Skips duplicates.    │
-- │ Review Step 3 diff output before running this.                          │
-- └─────────────────────────────────────────────────────────────────────────┘
INSERT INTO acct_accounts (
  code, name_en, name_ar,
  account_type, subtype,
  is_active, is_postable,
  allow_reconciliation, account_currency,
  internal_group, company_id,
  country_id
)
SELECT DISTINCT ON (s.odoo_code)
  s.odoo_code,
  s.odoo_name,
  s.odoo_name,  -- Arabic name: same as English until translated
  s.pact_account_type::acct_account_type,
  s.pact_subtype::acct_account_subtype,
  TRUE,   -- is_active
  TRUE,   -- is_postable
  s.allow_reconciliation,
  s.account_currency,
  s.internal_group,
  c.id,   -- company_id resolved by name
  NULL    -- country_id: set manually if needed per country partitioning
FROM odoo_coa_staging s
LEFT JOIN companies c ON c.name_en = s.odoo_company
-- Skip any code that already exists as a global account (country_id IS NULL)
-- This matches the actual partial unique index: acct_accounts_code_global_uq
WHERE NOT EXISTS (
  SELECT 1 FROM acct_accounts a
  WHERE a.code = s.odoo_code
    AND a.country_id IS NULL
)
ORDER BY s.odoo_code, s.odoo_company  -- deterministic pick when same code spans companies
ON CONFLICT ON CONSTRAINT acct_accounts_code_global_uq DO NOTHING;

-- After import: update staging to mark what was imported
UPDATE odoo_coa_staging s
SET imported_at = NOW()
FROM acct_accounts a
JOIN companies c ON c.id = a.company_id
WHERE a.code = s.odoo_code AND c.name_en = s.odoo_company;

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ STEP 6 — Verify results                                                 │
-- └─────────────────────────────────────────────────────────────────────────┘
SELECT
  account_type,
  COUNT(*) AS count
FROM acct_accounts
WHERE company_id IN (SELECT id FROM companies WHERE code IN ('PACT-GRP','PACT-SDN'))
GROUP BY account_type
ORDER BY account_type;

-- Full list of imported Odoo accounts:
SELECT
  a.code, a.name_en, a.account_type::text, a.subtype::text, c.name_en AS company
FROM acct_accounts a
LEFT JOIN companies c ON c.id = a.company_id
WHERE c.code IN ('PACT-GRP','PACT-SDN')
ORDER BY a.code, c.name_en;

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ STEP 7 — Cleanup (run only after you're happy with the import)          │
-- └─────────────────────────────────────────────────────────────────────────┘
-- DROP TABLE IF EXISTS odoo_coa_staging;
