/**
 * accounting-core.ts
 *
 * Canonical TypeScript types for the PACT accounting system.
 * All components should import from here rather than using `as any`.
 *
 * Mirrors the Supabase schema defined in:
 *   supabase/migrations/20260501_acct_phase1_sprint1_1.sql  (core tables)
 *   supabase/migrations/accounting_gl_bridges_phase4.sql    (bridge log)
 *   supabase/migrations/20260803_acct_extensions.sql        (new tables)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Enums / union types
// ─────────────────────────────────────────────────────────────────────────────

export type JournalStatus   = 'draft' | 'posted' | 'reversed' | 'cancelled';
export type DebitCredit     = 'DR' | 'CR';
export type AccountType     = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type BridgeStatus    = 'success' | 'error' | 'skipped';
export type BudgetStatus    = 'draft' | 'submitted' | 'approved' | 'active' | 'closed' | 'exceeded';
export type AssetStatus     = 'active' | 'fully_depreciated' | 'disposed' | 'impaired' | 'held_for_sale';
export type DepreciationMethod = 'straight_line' | 'declining_balance' | 'units_of_production' | 'sum_of_years';
export type APInvoiceStatus = 'draft' | 'received' | 'approved' | 'partially_paid' | 'paid' | 'disputed' | 'cancelled';
export type ARInvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
export type ReconStatus     = 'unmatched' | 'matched' | 'adjusted' | 'cleared';

// ─────────────────────────────────────────────────────────────────────────────
// Chart of Accounts
// ─────────────────────────────────────────────────────────────────────────────

export interface Account {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
  account_type: AccountType;
  subtype: string | null;
  parent_id: string | null;
  is_postable: boolean;
  is_active: boolean;
  currency_code: string | null;
  country_id: string | null;
  description: string | null;
  version: number;
  created_at: string;
  updated_at: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Journal Entries & Lines
// ─────────────────────────────────────────────────────────────────────────────

export interface JournalEntry {
  id: string;
  entry_no: number;
  period_id: string;
  posting_date: string;
  description_en: string;
  description_ar: string | null;
  source_type: string | null;          // 'opening_balance' | 'prefunding' | 'payroll' | 'manual' | …
  source_id: string | null;
  status: JournalStatus;
  branch_id: string | null;
  idempotency_key: string | null;
  posted_at: string | null;
  posted_by: string | null;
  reversed_by_entry_id: string | null;
  country_id: string | null;
  created_at: string;
  created_by: string | null;
}

export interface JournalLine {
  id: string;
  entry_id: string;
  line_no: number;
  account_id: string;
  fund_id: string | null;
  function: 'program' | 'mng' | 'fundraising' | 'none' | null;
  project_id: string | null;
  grant_id: string | null;
  cost_center_id: string | null;
  partner_id: string | null;
  original_amount: number;
  original_currency: string;
  functional_amount: number;
  functional_currency: string;
  fx_rate: number;
  debit_credit: DebitCredit;
  description: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Opening Balances
// ─────────────────────────────────────────────────────────────────────────────

export interface OpeningBalance {
  id: string;
  fiscal_year_id: string;
  account_id: string;
  debit_amount: number;
  credit_amount: number;
  notes: string | null;
  journal_entry_id: string | null;
  posted_by: string | null;
  posted_at: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// GL Bridge
// ─────────────────────────────────────────────────────────────────────────────

export interface GLBridgeLog {
  id: string;
  source_table: string;
  source_id: string;
  event_type: string;
  status: BridgeStatus;
  journal_entry_id: string | null;
  error_message: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fiscal Year / Period
// ─────────────────────────────────────────────────────────────────────────────

export interface FiscalYear {
  id: string;
  code: string;
  start_date: string;
  end_date: string;
  status: 'draft' | 'open' | 'closed' | 'locked';
  country_id: string | null;
  created_at: string;
}

export interface FiscalPeriod {
  id: string;
  fiscal_year_id: string;
  period_no: number;
  start_date: string;
  end_date: string;
  status: 'open' | 'closed' | 'locked';
}

// ─────────────────────────────────────────────────────────────────────────────
// Funds
// ─────────────────────────────────────────────────────────────────────────────

export interface Fund {
  id: string;
  code: string;
  name_en: string;
  name_ar: string | null;
  donor: string | null;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixed Assets
// ─────────────────────────────────────────────────────────────────────────────

export interface FixedAsset {
  id: string;
  asset_code: string;
  name: string;
  description: string | null;
  asset_category: string;               // Computer / Vehicle / Furniture / etc.
  asset_class_id: string | null;
  acquisition_date: string;
  acquisition_cost: number;
  currency: string;
  salvage_value: number;
  useful_life_years: number;
  depreciation_method: DepreciationMethod;
  accumulated_depreciation: number;
  net_book_value: number;
  status: AssetStatus;
  location: string | null;
  hub: string | null;
  custodian_id: string | null;          // profiles.id
  serial_number: string | null;
  asset_account_id: string | null;      // acct_accounts
  dep_expense_account_id: string | null;
  accum_dep_account_id: string | null;
  disposal_date: string | null;
  disposal_proceeds: number | null;
  disposal_notes: string | null;
  created_at: string;
  created_by: string | null;
}

export interface DepreciationScheduleLine {
  id: string;
  asset_id: string;
  period_id: string;
  depreciation_amount: number;
  accumulated_to_date: number;
  net_book_value: number;
  journal_entry_id: string | null;
  posted: boolean;
  period_start_date: string;
  period_end_date: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// AP / AR
// ─────────────────────────────────────────────────────────────────────────────

export interface APInvoice {
  id: string;
  invoice_number: string;
  vendor_id: string;
  invoice_date: string;
  due_date: string | null;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  currency: string;
  status: APInvoiceStatus;
  description: string | null;
  period_id: string | null;
  journal_entry_id: string | null;
  created_at: string;
  created_by: string | null;
}

export interface ARInvoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_id: string | null;
  invoice_date: string;
  due_date: string | null;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  currency: string;
  status: ARInvoiceStatus;
  description: string | null;
  period_id: string | null;
  journal_entry_id: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bank Reconciliation
// ─────────────────────────────────────────────────────────────────────────────

export interface BankStatement {
  id: string;
  account_id: string;      // acct_accounts (bank account)
  period_id: string | null;
  statement_date: string;
  opening_balance: number;
  closing_balance: number;
  currency: string;
  imported_at: string;
  imported_by: string | null;
}

export interface BankStatementLine {
  id: string;
  statement_id: string;
  transaction_date: string;
  description: string;
  debit: number;
  credit: number;
  reference: string | null;
  status: ReconStatus;
  matched_journal_line_id: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Annual Budget (org-wide)
// ─────────────────────────────────────────────────────────────────────────────

export interface AnnualBudget {
  id: string;
  fiscal_year_id: string;
  fiscal_year_code: string;
  total_amount: number;
  currency: string;
  status: BudgetStatus;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  created_by: string | null;
}

export interface AnnualBudgetLine {
  id: string;
  budget_id: string;
  hub: string | null;
  donor: string | null;
  fund_id: string | null;
  account_code: string | null;
  category: string;
  allocated_amount: number;
  spent_amount: number;
  currency: string;
  notes: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified Asset Master (merges HRAssets + Equipment + FixedAssets)
// ─────────────────────────────────────────────────────────────────────────────

export interface UnifiedAsset {
  id: string;
  asset_code: string;
  name: string;
  asset_type: 'hr' | 'field_equipment' | 'fixed_asset';
  category: string;
  serial_number: string | null;
  model: string | null;
  purchase_date: string | null;
  purchase_value: number | null;
  currency: string | null;
  useful_life_years: number | null;
  depreciation_method: DepreciationMethod | null;
  accumulated_depreciation: number;
  net_book_value: number | null;
  status: string;
  condition: 'excellent' | 'good' | 'fair' | 'poor' | 'beyond_repair' | null;
  hub: string | null;
  location: string | null;
  custodian_id: string | null;
  assigned_to_id: string | null;
  assigned_date: string | null;
  warranty_expiry: string | null;
  insurance_policy: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

export interface AssetAssignmentLog {
  id: string;
  asset_id: string;
  assigned_to_id: string;
  assigned_by_id: string;
  assigned_date: string;
  returned_date: string | null;
  condition_on_assignment: string | null;
  condition_on_return: string | null;
  notes: string | null;
  created_at: string;
}

export interface AssetDisposal {
  id: string;
  asset_id: string;
  disposal_type: 'sale' | 'write_off' | 'donation' | 'loss' | 'stolen' | 'destroyed';
  disposal_date: string;
  proceeds: number;
  currency: string;
  reason: string;
  approved_by: string | null;
  journal_entry_id: string | null;
  created_at: string;
  created_by: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Budget Version Control
// ─────────────────────────────────────────────────────────────────────────────

export interface BudgetVersion {
  id: string;
  budget_id: string;
  version_no: number;
  snapshot: AnnualBudgetLine[];
  reason: string;
  created_at: string;
  created_by: string | null;
}
