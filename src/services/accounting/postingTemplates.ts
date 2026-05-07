/**
 * PACT Accounting — Phase 2 GL Bridge · Posting Template Registry
 *
 * This file is the single source of truth for which source-table events
 * generate journal entries, which accounts are debited/credited, and what
 * human-readable labels appear in the Finance Audit Trail.
 *
 * The DB-side trigger functions (Part F–K of the Phase 2 SQL migration) are
 * the authoritative executors; this TypeScript registry exists so that:
 *  1. The UI (AccountingGLBridge.tsx) can document every bridge without
 *     hitting the DB.
 *  2. Any future on-the-fly posting (edge-function path) can import and reuse
 *     the same template definitions.
 *  3. Finance staff and auditors can see the posting logic in one place.
 */

export type DebitCredit = 'DR' | 'CR';
export type GLFunction  = 'program' | 'mng' | 'fundraising' | 'none';

export interface PostingLine {
  accountCode: string;
  accountName: string;
  debitCredit: DebitCredit;
  amountSource: string;      // Human description of where the amount comes from
  currency: string;
  glFunction: GLFunction;
  description: string;
}

export interface PostingTemplate {
  id: string;
  sourceTable: string;
  eventType: string;
  triggerStatus: string;
  triggerCondition: string;
  labelEn: string;
  labelAr: string;
  featureFlag: string;
  lines: PostingLine[];
  notes?: string;
}

// ─── Sudan COA reference (key accounts used by bridges) ───────────────────────
export const COA_ACCOUNTS: Record<string, string> = {
  '1100': 'Cash on Hand',
  '1110': 'Petty Cash',
  '1200': 'Cash at Bank — SDG',
  '1300': 'Mobile Money Wallet — EBS',
  '1500': 'Staff Advances',
  '1510': 'Travel Advances',
  '1520': 'Salary Advance Receivable',
  '2100': 'Accounts Payable — Vendors',
  '2110': 'Accrued Expenses',
  '2200': 'Payroll Payable',
  '2210': 'PAYE Withheld',
  '2220': 'Pension Contributions Payable',
  '2230': 'Zakat Payable',
  '2300': 'Withholding Tax Payable',
  '2105': 'PO Encumbrance Reserve',
  '2240': 'Leave Payable',
  '2350': 'EOSB Provision Liability',
  '2600': 'Staff Electronic Wallet Payable',
  '2610': 'Site Visit Incentives Payable',
  '2620': 'Task Rewards Payable',
  '5050': 'Operational Field Costs',
  '5060': 'Staff Retainer Payments',
  '5070': 'Data Collector Incentives',
  '5100': 'Programme Salaries',
  '5200': 'Programme Supplies',
  '5310': 'Per Diem & Subsistence',
  '5320': 'Training & Workshops',
  '5400': 'Beneficiary Cash Transfers',
  '5600': 'Grant Programme Expense',
  '5700': 'Programme Vehicle & Fuel',
  '5800': 'Programme Communications',
  '6100': 'Management Salaries',
  '6110': 'Management Benefits',
  '6200': 'EOSB Expense — Staff Gratuity',
  '6310': 'Legal Fees',
  '6400': 'Depreciation Expense',
};

// ─── Category → account code map for ops cost submissions ────────────────────
export const OPS_COST_ACCOUNT_MAP: Record<string, string> = {
  incentives:        '5070',
  communications:    '5800',
  training:          '5320',
  general_transport: '5700',
  equipment:         '5200',
  printing:          '5200',
  meetings:          '5320',
  permits:           '6310',
  other:             '5050',
};

// ─── Complete posting template registry ──────────────────────────────────────
export const POSTING_TEMPLATES: PostingTemplate[] = [
  // ── 1. Payroll Runs → Approved ────────────────────────────────────────────
  {
    id:               'payroll_runs_approved',
    sourceTable:      'payroll_runs',
    eventType:        'payroll_approved',
    triggerStatus:    'approved',
    triggerCondition: 'status changes FROM any → TO \'approved\'',
    labelEn:          'Payroll Expense Recognised',
    labelAr:          'تسجيل مصروف الرواتب',
    featureFlag:      'acct.bridge.payroll_runs',
    lines: [
      {
        accountCode:  '6100',
        accountName:  'Management Salaries',
        debitCredit:  'DR',
        amountSource: 'SUM(payroll_run_items.gross_salary) for this run',
        currency:     'SDG',
        glFunction:   'mng',
        description:  'Gross Salaries — [period_label]',
      },
      {
        accountCode:  '2200',
        accountName:  'Payroll Payable',
        debitCredit:  'CR',
        amountSource: 'SUM(payroll_run_items.net_salary) for this run',
        currency:     'SDG',
        glFunction:   'none',
        description:  'Net Payroll Payable — [period_label]',
      },
      {
        accountCode:  '2110',
        accountName:  'Accrued Expenses',
        debitCredit:  'CR',
        amountSource: 'SUM(payroll_run_items.deductions_total) for this run',
        currency:     'SDG',
        glFunction:   'none',
        description:  'Accrued Statutory Deductions — [period_label]',
      },
    ],
    notes: 'Gross = Net + Deductions. DR 6100 = CR 2200 + CR 2110. Fires once per run on approval.',
  },

  // ── 2. Payroll Runs → Locked (cash disbursement) ─────────────────────────
  {
    id:               'payroll_runs_locked',
    sourceTable:      'payroll_runs',
    eventType:        'payroll_locked',
    triggerStatus:    'locked',
    triggerCondition: 'status changes FROM any → TO \'locked\'',
    labelEn:          'Payroll Cash Disbursement',
    labelAr:          'صرف الرواتب',
    featureFlag:      'acct.bridge.payroll_runs',
    lines: [
      {
        accountCode:  '2200',
        accountName:  'Payroll Payable',
        debitCredit:  'DR',
        amountSource: 'SUM(payroll_run_items.net_salary) for this run',
        currency:     'SDG',
        glFunction:   'none',
        description:  'Clear Payroll Payable — [period_label]',
      },
      {
        accountCode:  '1200',
        accountName:  'Cash at Bank — SDG',
        debitCredit:  'CR',
        amountSource: 'SUM(payroll_run_items.net_salary) for this run',
        currency:     'SDG',
        glFunction:   'none',
        description:  'Cash at Bank — Payroll Payment — [period_label]',
      },
    ],
    notes: 'Clears the Payroll Payable balance. Net salary leaves the bank.',
  },

  // ── 3. Withdrawal Requests → Approved ────────────────────────────────────
  {
    id:               'withdrawal_requests_approved',
    sourceTable:      'withdrawal_requests',
    eventType:        'withdrawal_approved',
    triggerStatus:    'approved',
    triggerCondition: 'status changes FROM pending → TO \'approved\'',
    labelEn:          'Wallet Withdrawal Approved',
    labelAr:          'سحب محفظة معتمد',
    featureFlag:      'acct.bridge.withdrawal_requests',
    lines: [
      {
        accountCode:  '2600',
        accountName:  'Staff Electronic Wallet Payable',
        debitCredit:  'DR',
        amountSource: 'withdrawal_requests.amount',
        currency:     'SDG',
        glFunction:   'none',
        description:  'Staff Wallet Payable — Withdrawal #[id]',
      },
      {
        accountCode:  '1200',
        accountName:  'Cash at Bank — SDG',
        debitCredit:  'CR',
        amountSource: 'withdrawal_requests.amount',
        currency:     'SDG',
        glFunction:   'none',
        description:  'Cash Disbursement — Wallet Withdrawal #[id]',
      },
    ],
    notes: 'Reduces the wallet liability and the bank balance simultaneously.',
  },

  // ── 4. Operational Cost Submissions → Paid ────────────────────────────────
  {
    id:               'operational_cost_submissions_paid',
    sourceTable:      'operational_cost_submissions',
    eventType:        'ops_cost_paid',
    triggerStatus:    'paid',
    triggerCondition: 'status changes FROM approved → TO \'paid\'',
    labelEn:          'Operational Cost Paid',
    labelAr:          'تكلفة تشغيلية مدفوعة',
    featureFlag:      'acct.bridge.operational_cost_submissions',
    lines: [
      {
        accountCode:  '[category-mapped: 5070/5800/5320/5700/5200/6310/5050]',
        accountName:  'Category-mapped expense account',
        debitCredit:  'DR',
        amountSource: 'operational_cost_submissions.amount_cents / 100',
        currency:     'SDG',
        glFunction:   'program',
        description:  '[description or expense_category]',
      },
      {
        accountCode:  '1200',
        accountName:  'Cash at Bank — SDG',
        debitCredit:  'CR',
        amountSource: 'operational_cost_submissions.amount_cents / 100',
        currency:     'SDG',
        glFunction:   'none',
        description:  'Cash Payment — Ops Cost #[id]',
      },
    ],
    notes: 'Expense category → account: incentives→5070, communications→5800, training→5320, ' +
           'general_transport→5700, equipment/printing→5200, permits→6310, other→5050.',
  },

  // ── 5. Down Payment Requests → Fully Paid ────────────────────────────────
  {
    id:               'down_payment_requests_fully_paid',
    sourceTable:      'down_payment_requests',
    eventType:        'down_payment_fully_paid',
    triggerStatus:    'fully_paid',
    triggerCondition: 'status changes FROM partially_paid/approved → TO \'fully_paid\'',
    labelEn:          'Field Advance Disbursed',
    labelAr:          'صرف سلفة ميدانية',
    featureFlag:      'acct.bridge.down_payment_requests',
    lines: [
      {
        accountCode:  '1510',
        accountName:  'Travel Advances',
        debitCredit:  'DR',
        amountSource: 'down_payment_requests.total_paid_amount (or requested_amount)',
        currency:     'SDG',
        glFunction:   'program',
        description:  'Travel Advance — [site_name]',
      },
      {
        accountCode:  '1200',
        accountName:  'Cash at Bank — SDG',
        debitCredit:  'CR',
        amountSource: 'down_payment_requests.total_paid_amount (or requested_amount)',
        currency:     'SDG',
        glFunction:   'none',
        description:  'Cash — Field Advance #[id]',
      },
    ],
    notes: 'Records the disbursement of field cash advances. Staff must reconcile against actual spend.',
  },

  // ── 6. Salary Advances → Disbursed ────────────────────────────────────────
  {
    id:               'salary_advances_disbursed',
    sourceTable:      'salary_advances',
    eventType:        'salary_advance_disbursed',
    triggerStatus:    'disbursed',
    triggerCondition: 'status changes FROM approved → TO \'disbursed\'',
    labelEn:          'Salary Advance Disbursed',
    labelAr:          'صرف سلفة راتب',
    featureFlag:      'acct.bridge.salary_advances',
    lines: [
      {
        accountCode:  '1500',
        accountName:  'Staff Advances',
        debitCredit:  'DR',
        amountSource: 'salary_advances.amount',
        currency:     'SDG',
        glFunction:   'mng',
        description:  'Staff Advance — [id]',
      },
      {
        accountCode:  '1200',
        accountName:  'Cash at Bank — SDG',
        debitCredit:  'CR',
        amountSource: 'salary_advances.amount',
        currency:     'SDG',
        glFunction:   'none',
        description:  'Cash — Salary Advance #[id]',
      },
    ],
    notes: 'The advance is an asset (receivable from staff) until repaid.',
  },

  // ── 7. Wallet Transactions — Reward INSERT ────────────────────────────────
  {
    id:               'wallet_transactions_reward',
    sourceTable:      'wallet_transactions',
    eventType:        'reward_credit',
    triggerStatus:    'INSERT (type=reward)',
    triggerCondition: 'INSERT row with type = \'reward\'',
    labelEn:          'Task Reward Earned',
    labelAr:          'مكافأة مهمة مكتسبة',
    featureFlag:      'acct.bridge.wallet_transactions',
    lines: [
      {
        accountCode:  '5310',
        accountName:  'Per Diem & Subsistence',
        debitCredit:  'DR',
        amountSource: 'wallet_transactions.amount (or amount_cents / 100)',
        currency:     'SDG',
        glFunction:   'program',
        description:  '[memo or description]',
      },
      {
        accountCode:  '2600',
        accountName:  'Staff Electronic Wallet Payable',
        debitCredit:  'CR',
        amountSource: 'wallet_transactions.amount (or amount_cents / 100)',
        currency:     'SDG',
        glFunction:   'none',
        description:  'Staff Wallet Payable — Reward',
      },
    ],
    notes: 'Every reward credit is expensed immediately and creates a payable to the staff member.',
  },

  // ── 8. AP Invoice → Approved ──────────────────────────────────────────────
  {
    id:               'acct_invoices_approved',
    sourceTable:      'acct_invoices',
    eventType:        'invoice_approved',
    triggerStatus:    'approved',
    triggerCondition: 'status changes FROM submitted → TO \'approved\'',
    labelEn:          'AP Invoice Approved',
    labelAr:          'فاتورة موردين معتمدة',
    featureFlag:      'acct.bridge.acct_invoices',
    lines: [
      {
        accountCode:  '[per invoice line: gl_account_code or 5050]',
        accountName:  'Expense (per line)',
        debitCredit:  'DR',
        amountSource: 'acct_invoice_lines.total_price per line',
        currency:     'SDG',
        glFunction:   'program',
        description:  '[line description]',
      },
      {
        accountCode:  '2100',
        accountName:  'Accounts Payable — Vendors',
        debitCredit:  'CR',
        amountSource: 'acct_invoices.total_amount',
        currency:     'SDG',
        glFunction:   'none',
        description:  'AP Payable — Invoice [invoice_number]',
      },
    ],
    notes: 'Multi-line support: each invoice line can point to a different GL account. Falls back to 5050.',
  },

  // ── 9. AP Payment → Processed ────────────────────────────────────────────
  {
    id:               'acct_payments_processed',
    sourceTable:      'acct_payments',
    eventType:        'payment_processed',
    triggerStatus:    'processed',
    triggerCondition: 'status changes FROM approved → TO \'processed\'',
    labelEn:          'Vendor Payment Processed',
    labelAr:          'صرف دفعة مورد',
    featureFlag:      'acct.bridge.acct_payments',
    lines: [
      {
        accountCode:  '2100',
        accountName:  'Accounts Payable — Vendors',
        debitCredit:  'DR',
        amountSource: 'acct_payments.amount',
        currency:     'SDG',
        glFunction:   'none',
        description:  'Clear AP — Payment [payment_number]',
      },
      {
        accountCode:  '1200',
        accountName:  'Cash at Bank — SDG',
        debitCredit:  'CR',
        amountSource: 'acct_payments.amount',
        currency:     'SDG',
        glFunction:   'none',
        description:  'Cash at Bank — Vendor Payment [payment_number]',
      },
    ],
    notes: 'Clears the AP payable and reduces the bank balance.',
  },

  // ── Phase 3 bridges ───────────────────────────────────────────────────────

  // ── 10. EOSB Accruals → Monthly Provision Posted ─────────────────────────
  {
    id:               'eosb_accruals_posted',
    sourceTable:      'eosb_accruals',
    eventType:        'accrual_posted',
    triggerStatus:    'INSERT',
    triggerCondition: 'INSERT on eosb_accruals (any row, positive amount)',
    labelEn:          'EOSB Monthly Provision Recognised',
    labelAr:          'إثبات مخصص مكافأة نهاية الخدمة الشهري',
    featureFlag:      'acct.bridge.eosb_accruals',
    lines: [
      {
        accountCode:  '6200',
        accountName:  'EOSB Expense — Staff Gratuity',
        debitCredit:  'DR',
        amountSource: 'eosb_accruals.amount (monthly accrual)',
        currency:     'SDG',
        glFunction:   'mng',
        description:  'EOSB Expense — [staff_name] [month]',
      },
      {
        accountCode:  '2350',
        accountName:  'EOSB Provision Liability',
        debitCredit:  'CR',
        amountSource: 'eosb_accruals.amount (monthly accrual)',
        currency:     'SDG',
        glFunction:   'none',
        description:  'EOSB Provision — [staff_name] [month]',
      },
    ],
    notes: 'Posted by "Post Monthly Provision" in HR → EOSB Panel. Sudan Labour Law formula: ' +
           '21 days/yr (≤5 yrs), 30 days/yr (>5 yrs). Liability clears on staff settlement.',
  },

  // ── 11. HR Salary Advances → Disbursed ────────────────────────────────────
  {
    id:               'hr_salary_advances_disbursed',
    sourceTable:      'hr_salary_advances',
    eventType:        'advance_disbursed',
    triggerStatus:    'INSERT (status = active)',
    triggerCondition: 'INSERT on hr_salary_advances with status = \'active\' and amount > 0',
    labelEn:          'HR Salary Advance Disbursed',
    labelAr:          'صرف سلفة راتب (موارد بشرية)',
    featureFlag:      'acct.bridge.hr_salary_advances',
    lines: [
      {
        accountCode:  '1520',
        accountName:  'Salary Advance Receivable',
        debitCredit:  'DR',
        amountSource: 'hr_salary_advances.amount',
        currency:     'SDG',
        glFunction:   'mng',
        description:  'Advance Receivable: [staff_name]',
      },
      {
        accountCode:  '1200',
        accountName:  'Cash at Bank — SDG',
        debitCredit:  'CR',
        amountSource: 'hr_salary_advances.amount',
        currency:     'SDG',
        glFunction:   'none',
        description:  'Cash disbursed for salary advance',
      },
    ],
    notes: 'Fires on INSERT when the advance is issued. Receivable clears as instalments are recovered.',
  },

  // ── 12. HR Salary Advance Recoveries → Recovery Instalment ───────────────
  {
    id:               'hr_salary_advance_recoveries_posted',
    sourceTable:      'hr_salary_advance_recoveries',
    eventType:        'advance_recovered',
    triggerStatus:    'INSERT (amount > 0)',
    triggerCondition: 'INSERT on hr_salary_advance_recoveries with amount > 0',
    labelEn:          'Salary Advance Recovery Received',
    labelAr:          'استرداد سلفة راتب',
    featureFlag:      'acct.bridge.hr_salary_advance_recoveries',
    lines: [
      {
        accountCode:  '1200',
        accountName:  'Cash at Bank — SDG',
        debitCredit:  'DR',
        amountSource: 'hr_salary_advance_recoveries.amount',
        currency:     'SDG',
        glFunction:   'mng',
        description:  'Advance recovery received',
      },
      {
        accountCode:  '1520',
        accountName:  'Salary Advance Receivable',
        debitCredit:  'CR',
        amountSource: 'hr_salary_advance_recoveries.amount',
        currency:     'SDG',
        glFunction:   'none',
        description:  'Clearing Salary Advance Receivable: [staff_name]',
      },
    ],
    notes: 'Each payroll-deduction or manual repayment instalment fires this bridge. ' +
           'Multiple instalments reduce the receivable balance until fully cleared.',
  },

  // ── 13. Grant Expenses → Posted ──────────────────────────────────────────
  {
    id:               'acct_grant_expenses_posted',
    sourceTable:      'acct_grant_expenses',
    eventType:        'grant_expense_posted',
    triggerStatus:    'INSERT (amount > 0)',
    triggerCondition: 'INSERT on acct_grant_expenses with amount > 0',
    labelEn:          'Grant Expense Recognised',
    labelAr:          'إثبات مصروف المنحة',
    featureFlag:      'acct.bridge.acct_grant_expenses',
    lines: [
      {
        accountCode:  '5600',
        accountName:  'Grant Programme Expense',
        debitCredit:  'DR',
        amountSource: 'acct_grant_expenses.amount',
        currency:     'SDG',
        glFunction:   'program',
        description:  'Grant Expense — [grant_name]: [description]',
      },
      {
        accountCode:  '2100',
        accountName:  'Accounts Payable — Vendors',
        debitCredit:  'CR',
        amountSource: 'acct_grant_expenses.amount',
        currency:     'SDG',
        glFunction:   'none',
        description:  'AP Payable — Grant Expense [id]',
      },
    ],
    notes: 'Fires when a grant expense entry is recorded in Accounting → Grants. ' +
           'Links back to the grant via grant_id for donor reporting.',
  },

  // ── Phase 4 bridges ───────────────────────────────────────────────────────

  // ── 14. Depreciation Runs → Completed ────────────────────────────────────
  {
    id:               'acct_depreciation_runs_posted',
    sourceTable:      'acct_depreciation_runs',
    eventType:        'depreciation_run_posted',
    triggerStatus:    'INSERT (status = completed)',
    triggerCondition: 'INSERT on acct_depreciation_runs where status = \'completed\'',
    labelEn:          'Depreciation Run Logged to GL Bridge',
    labelAr:          'تسجيل دورة الاستهلاك في جسر دفتر الأستاذ',
    featureFlag:      'acct.bridge.acct_depreciation_runs',
    lines: [
      {
        accountCode:  '6400',
        accountName:  'Depreciation Expense',
        debitCredit:  'DR',
        amountSource: 'acct_depreciation_runs.total_depreciation',
        currency:     'SDG',
        glFunction:   'mng',
        description:  'Depreciation Expense — [period_label]',
      },
      {
        accountCode:  '1600',
        accountName:  'Accumulated Depreciation',
        debitCredit:  'CR',
        amountSource: 'acct_depreciation_runs.total_depreciation',
        currency:     'SDG',
        glFunction:   'none',
        description:  'Accumulated Depreciation — [period_label]',
      },
    ],
    notes: 'Visibility-only bridge: the UI (AccountingFixedAssets) posts per-asset draft journals. ' +
           'The trigger logs the run event to acct_gl_bridge_log; journal_entry_id may be null ' +
           'when the run page does not consolidate per-asset journals into a single entry.',
  },

  // ── 15. Cost Allocation Runs → Completed ─────────────────────────────────
  {
    id:               'acct_allocation_runs_posted',
    sourceTable:      'acct_allocation_runs',
    eventType:        'allocation_run_posted',
    triggerStatus:    'INSERT (status = completed)',
    triggerCondition: 'INSERT on acct_allocation_runs where status = \'completed\' and journal_entry_id IS NOT NULL',
    labelEn:          'Cost Allocation Run Logged to GL Bridge',
    labelAr:          'تسجيل دورة توزيع التكاليف في جسر دفتر الأستاذ',
    featureFlag:      'acct.bridge.acct_allocation_runs',
    lines: [
      {
        accountCode:  '[per-rule target account]',
        accountName:  'Allocated Cost Target Account',
        debitCredit:  'DR',
        amountSource: 'rule.weight_pct × source amount per target',
        currency:     'SDG',
        glFunction:   'program',
        description:  'Cost Allocation — [rule_name] → [target]',
      },
      {
        accountCode:  '[per-rule source account]',
        accountName:  'Cost Allocation Source Account',
        debitCredit:  'CR',
        amountSource: 'rule.weight_pct × source amount per target',
        currency:     'SDG',
        glFunction:   'program',
        description:  'Cost Allocation Clearing — [rule_name]',
      },
    ],
    notes: 'Visibility-only bridge: the UI (AccountingCostAllocation) posts the multi-line journal ' +
           'and stores journal_entry_id on the run row. The trigger logs the existing journal_entry_id ' +
           'to acct_gl_bridge_log so it appears in the GL Audit trail.',
  },

  // ── 16. Fixed Assets → Disposed ──────────────────────────────────────────
  {
    id:               'acct_fixed_assets_disposed',
    sourceTable:      'acct_fixed_assets',
    eventType:        'asset_disposed',
    triggerStatus:    'UI action (status → disposed)',
    triggerCondition: 'handleDispose() in AccountingFixedAssets.tsx; inserts to acct_gl_bridge_log after journal created',
    labelEn:          'Fixed Asset Disposal Journal Logged',
    labelAr:          'تسجيل قيد التخلص من الأصل',
    featureFlag:      'acct.bridge.acct_fixed_assets',
    lines: [
      {
        accountCode:  '1600',
        accountName:  'Accumulated Depreciation',
        debitCredit:  'DR',
        amountSource: 'calculated accumulated depreciation at disposal date',
        currency:     'SDG',
        glFunction:   'none',
        description:  'Accum depreciation cleared — [asset_name]',
      },
      {
        accountCode:  '[proceeds account if > 0]',
        accountName:  'Cash / Receivable (Disposal Proceeds)',
        debitCredit:  'DR',
        amountSource: 'disposal_proceeds',
        currency:     'SDG',
        glFunction:   'none',
        description:  'Proceeds on disposal — [asset_name]',
      },
      {
        accountCode:  '[dep_account_id → asset cost account]',
        accountName:  'Fixed Asset — Cost (derecognition)',
        debitCredit:  'CR',
        amountSource: 'acquisition_cost',
        currency:     'SDG',
        glFunction:   'none',
        description:  'Fixed asset derecognised — [asset_name]',
      },
    ],
    notes: 'Draft journal posted from UI on dispose action. Gain/loss on disposal line added as needed. ' +
           'Bridge log insert is in AccountingFixedAssets.tsx handleDispose() after journal creation.',
  },

  // ── 17. Fixed Assets → Written Off ───────────────────────────────────────
  {
    id:               'acct_fixed_assets_written_off',
    sourceTable:      'acct_fixed_assets',
    eventType:        'asset_written_off',
    triggerStatus:    'UI action (status → written_off)',
    triggerCondition: 'handleWriteOff() in AccountingFixedAssets.tsx; inserts to acct_gl_bridge_log after journal created',
    labelEn:          'Fixed Asset Write-off Journal Logged',
    labelAr:          'تسجيل قيد شطب الأصل',
    featureFlag:      'acct.bridge.acct_fixed_assets',
    lines: [
      {
        accountCode:  '1600',
        accountName:  'Accumulated Depreciation',
        debitCredit:  'DR',
        amountSource: 'calculated accumulated depreciation at write-off date',
        currency:     'SDG',
        glFunction:   'none',
        description:  'Accum depreciation cleared — [asset_name]',
      },
      {
        accountCode:  '[loss account]',
        accountName:  'Loss on Write-off',
        debitCredit:  'DR',
        amountSource: 'book_value (acquisition_cost − accumulated)',
        currency:     'SDG',
        glFunction:   'mng',
        description:  'Loss on write-off — [asset_name]',
      },
      {
        accountCode:  '[dep_account_id → asset cost account]',
        accountName:  'Fixed Asset — Cost (derecognition)',
        debitCredit:  'CR',
        amountSource: 'acquisition_cost',
        currency:     'SDG',
        glFunction:   'none',
        description:  'Fixed asset derecognised — [asset_name]',
      },
    ],
    notes: 'Draft journal posted from UI on write-off action. Book value = acquisition cost − accumulated depreciation. ' +
           'Bridge log insert is in AccountingFixedAssets.tsx handleWriteOff() after journal creation.',
  },

  // ── 18. Budget Encumbrances → Created ────────────────────────────────────
  {
    id:               'acct_budget_encumbrances_created',
    sourceTable:      'acct_budget_encumbrances',
    eventType:        'encumbrance_created',
    triggerStatus:    'INSERT (status = open, amount > 0)',
    triggerCondition: 'INSERT on acct_budget_encumbrances where status = \'open\' and amount > 0',
    labelEn:          'Budget Encumbrance Posted',
    labelAr:          'إثبات الالتزام الميزاني',
    featureFlag:      'acct.bridge.acct_budget_encumbrances',
    lines: [
      {
        accountCode:  '[gl_account_id → code, fallback 5050]',
        accountName:  'Programme / Operating Expense (Encumbrance)',
        debitCredit:  'DR',
        amountSource: 'acct_budget_encumbrances.amount',
        currency:     'SDG',
        glFunction:   'program',
        description:  'Budget Encumbrance — [source_type] [source_id]',
      },
      {
        accountCode:  '2105',
        accountName:  'PO Encumbrance Reserve',
        debitCredit:  'CR',
        amountSource: 'acct_budget_encumbrances.amount',
        currency:     'SDG',
        glFunction:   'none',
        description:  'PO Encumbrance Reserve — [source_type]',
      },
    ],
    notes: 'Disabled by default — enable acct.bridge.acct_budget_encumbrances once COA and GENERAL fund ' +
           'are configured. Reversal journal should be posted when encumbrance is liquidated or cancelled.',
  },

  // ── 19. Leave Requests → Approved ────────────────────────────────────────
  {
    id:               'leave_requests_approved',
    sourceTable:      'leave_requests',
    eventType:        'leave_approved',
    triggerStatus:    'UPDATE (status → approved)',
    triggerCondition: 'AFTER UPDATE on leave_requests when status changes TO \'approved\' and days_count > 0',
    labelEn:          'Leave Liability Recognised',
    labelAr:          'إثبات التزام الإجازة',
    featureFlag:      'acct.bridge.leave_requests',
    lines: [
      {
        accountCode:  '6110',
        accountName:  'Management Benefits',
        debitCredit:  'DR',
        amountSource: '(eosb_accruals.base_salary ÷ 30) × leave_requests.days_count',
        currency:     'SDG',
        glFunction:   'mng',
        description:  '[leave_type] Leave Expense — [staff_name] ([days] days)',
      },
      {
        accountCode:  '2240',
        accountName:  'Leave Payable',
        debitCredit:  'CR',
        amountSource: '(eosb_accruals.base_salary ÷ 30) × leave_requests.days_count',
        currency:     'SDG',
        glFunction:   'none',
        description:  'Leave Payable — [staff_name]',
      },
    ],
    notes: 'Disabled by default — enable acct.bridge.leave_requests once EOSB accruals are populated. ' +
           'Daily rate = latest base_salary from eosb_accruals ÷ 30. Logs "skipped" if no salary found. ' +
           'Leave liability clears when leave encashment or payroll deduction is processed.',
  },

  // ── Phase 5 bridges ───────────────────────────────────────────────────────

  // ── 20. Cash Flow Adjustments → Created ──────────────────────────────────
  {
    id:               'acct_cash_flow_adj_created',
    sourceTable:      'acct_cash_flow_adjustments',
    eventType:        'created',
    triggerStatus:    'INSERT',
    triggerCondition: 'AFTER INSERT on acct_cash_flow_adjustments',
    labelEn:          'Cash Flow Adjustment Posted to GL',
    labelAr:          'تسجيل تسوية التدفق النقدي في دفتر الأستاذ',
    featureFlag:      'acct.bridge.cash_flow_adj',
    lines: [
      {
        accountCode:  '1110',
        accountName:  'Cash (Inflow: DR / Outflow: CR)',
        debitCredit:  'DR',
        amountSource: 'acct_cash_flow_adjustments.amount (abs)',
        currency:     'USD',
        glFunction:   'none',
        description:  'CF Adjustment — [label] [month_key]',
      },
      {
        accountCode:  '4990',
        accountName:  'Adjustment Clearing (Inflow: CR / Outflow: DR)',
        debitCredit:  'CR',
        amountSource: 'acct_cash_flow_adjustments.amount (abs)',
        currency:     'USD',
        glFunction:   'none',
        description:  'CF Adjustment Clearing — [label]',
      },
    ],
    notes: 'Disabled by default — enable acct.bridge.cash_flow_adj after COA seeded with ' +
           'account 1110 (Cash) and 4990 (Adjustment Clearing). ' +
           'Inflow (amount ≥ 0): DR Cash / CR Clearing. Outflow (amount < 0): DR Clearing / CR Cash. ' +
           'Requires an open fiscal period and active fund; logs "skipped" otherwise.',
  },

  // ── 21. Grants → Status Changed ──────────────────────────────────────────
  {
    id:               'acct_grants_status_change',
    sourceTable:      'acct_grants',
    eventType:        'status_active | status_closed | status_expired',
    triggerStatus:    'UPDATE (status changes)',
    triggerCondition: 'AFTER UPDATE on acct_grants when old.status IS DISTINCT FROM new.status',
    labelEn:          'Grant Status Change Logged (GL Visibility)',
    labelAr:          'تسجيل تغيير حالة المنحة في جسر دفتر الأستاذ',
    featureFlag:      'acct.bridge.grants',
    lines: [],
    notes: 'Visibility-only bridge — no journal posted. Logs a bridge entry to acct_gl_bridge_log ' +
           'whenever a grant transitions between statuses (draft → active → closed → expired). ' +
           'Enabled by default. Appears in GL Bridge Audit under "Grants" source table.',
  },

  // ── Phase 6 bridges ───────────────────────────────────────────────────────

  // ── 23. Bank Statement Lines → Matched ───────────────────────────────────
  {
    id:               'acct_bank_stmt_line_matched',
    sourceTable:      'acct_bank_statement_lines',
    eventType:        'line_matched | line_unmatched',
    triggerStatus:    'UPDATE (is_matched changes)',
    triggerCondition: 'AFTER UPDATE on acct_bank_statement_lines when is_matched changes',
    labelEn:          'Bank Statement Line Matched to Journal Entry',
    labelAr:          'مطابقة سطر كشف الحساب البنكي مع قيد دفتر الأستاذ',
    featureFlag:      'acct.bridge.bank_recon',
    lines: [],
    notes: 'Visibility-only bridge — no new journal posted. Logs a bridge entry linking ' +
           'the bank statement line to its matched journal entry for reconciliation audit. ' +
           'Also logs an "un-matched" entry when a match is reversed. ' +
           'Enabled by default. Appears in GL Bridge Audit under "Bank Statement Lines".',
  },

  // ── 22. Grant Milestones → Accepted ──────────────────────────────────────
  {
    id:               'acct_grant_milestones_accepted',
    sourceTable:      'acct_grant_milestones',
    eventType:        'milestone_accepted',
    triggerStatus:    'UPDATE (status → accepted)',
    triggerCondition: 'AFTER UPDATE on acct_grant_milestones when new.status = \'accepted\'',
    labelEn:          'Grant Milestone Accepted (GL Visibility)',
    labelAr:          'تسجيل قبول مرحلة المنحة في جسر دفتر الأستاذ',
    featureFlag:      'acct.bridge.milestones',
    lines: [],
    notes: 'Visibility-only bridge — no journal posted. Logs a bridge entry when a grant milestone ' +
           'status moves to "accepted" (the final positive state in the milestone lifecycle). ' +
           'Enabled by default. Used for donor milestone reporting and grant compliance audit.',
  },

  // ── Phase 7 bridges ───────────────────────────────────────────────────────

  // ── 24. Statutory Filings → Submitted ────────────────────────────────────
  {
    id:               'acct_statutory_filing_submitted',
    sourceTable:      'acct_statutory_filings',
    eventType:        'statutory_filing_submitted',
    triggerStatus:    'UPDATE (status → submitted)',
    triggerCondition: 'AFTER UPDATE on acct_statutory_filings when new.status = \'submitted\'',
    labelEn:          'Statutory Filing Submitted (GL Visibility)',
    labelAr:          'تسجيل تقديم الإقرار الضريبي في جسر دفتر الأستاذ',
    featureFlag:      'acct.bridge.statutory_filing',
    lines: [],
    notes: 'Visibility-only bridge — no journal posted. Logs a bridge entry when a statutory ' +
           'filing (PIT monthly/annual, social monthly, zakat annual) is submitted to the authority. ' +
           'Enabled by default. Appears in GL Bridge Audit under "Statutory Filings".',
  },

  // ── 25. Statutory Filings → Paid ─────────────────────────────────────────
  {
    id:               'acct_statutory_filing_paid',
    sourceTable:      'acct_statutory_filings',
    eventType:        'statutory_filing_paid',
    triggerStatus:    'UPDATE (status → paid)',
    triggerCondition: 'AFTER UPDATE on acct_statutory_filings when new.status = \'paid\'',
    labelEn:          'Statutory Filing Payment to Tax Authority',
    labelAr:          'سداد الإقرار الضريبي للجهة الضريبية',
    featureFlag:      'acct.bridge.statutory_filing',
    lines: [
      {
        accountCode:  '2310',
        accountName:  'PIT Payable',
        debitCredit:  'DR',
        amountSource: 'acct_statutory_filings.total_amount (PIT filings)',
        currency:     'SDG',
        glFunction:   'mng',
        description:  'Clear PIT payable liability on payment to tax authority',
      },
      {
        accountCode:  '2320',
        accountName:  'Social Insurance Payable',
        debitCredit:  'DR',
        amountSource: 'acct_statutory_filings.total_amount (social filings)',
        currency:     'SDG',
        glFunction:   'mng',
        description:  'Clear SIPC payable on payment',
      },
      {
        accountCode:  '1200',
        accountName:  'Cash at Bank — SDG',
        debitCredit:  'CR',
        amountSource: 'acct_statutory_filings.total_amount',
        currency:     'SDG',
        glFunction:   'mng',
        description:  'Bank outflow for statutory payment',
      },
    ],
    notes: 'Full journal bridge — DR Tax Payable / CR Cash at Bank. ' +
           'Fires when a statutory filing status moves to "paid". ' +
           'The GL bridge log records the payment reference and filing type. ' +
           'Enabled by default. Applies to PIT, social, and zakat filings.',
  },

  // ── Phase 8 bridges ───────────────────────────────────────────────────────

  // ── 27. Audit Pack → Finalized ────────────────────────────────────────────
  {
    id:               'acct_audit_pack_finalized',
    sourceTable:      'acct_audit_packs',
    eventType:        'audit_pack_finalized | audit_pack_shared',
    triggerStatus:    'UPDATE (status → finalized or shared)',
    triggerCondition: 'AFTER UPDATE on acct_audit_packs when new.status in (\'finalized\',\'shared\')',
    labelEn:          'Audit Pack Finalized / Shared with External Auditors',
    labelAr:          'إتمام حزمة المراجعة ومشاركتها مع المراجعين الخارجيين',
    featureFlag:      'acct.bridge.audit_pack',
    lines: [],
    notes: 'Visibility-only bridge — no journal posted. Logs a GL bridge entry when an audit ' +
           'pack is finalized or shared, recording the pack title, item count, and finding count. ' +
           'Provides an immutable audit trail of when external auditors were given access. ' +
           'Enabled by default. Appears in GL Bridge Audit under "Audit Packs".',
  },

  // ── 26. Tax Withholding — PIT + Social Posted ─────────────────────────────
  {
    id:               'acct_tax_withholding_pit',
    sourceTable:      'acct_tax_withholding',
    eventType:        'withholding_computed',
    triggerStatus:    'INSERT or UPDATE (status = submitted)',
    triggerCondition: 'Manual: computed via acct_compute_pit() RPC + social rate lookup',
    labelEn:          'Employee PIT Withholding & Social Insurance Accrual',
    labelAr:          'استقطاع ضريبة الدخل الشخصي واستحقاق التأمين الاجتماعي',
    featureFlag:      'acct.statutory.pit',
    lines: [
      {
        accountCode:  '5110',
        accountName:  'Salary Expense',
        debitCredit:  'DR',
        amountSource: 'acct_tax_withholding.gross_salary',
        currency:     'SDG',
        glFunction:   'program',
        description:  'Gross salary charge to program/department',
      },
      {
        accountCode:  '5210',
        accountName:  'Employer Social Insurance Expense',
        debitCredit:  'DR',
        amountSource: 'acct_tax_withholding.social_employer_amount',
        currency:     'SDG',
        glFunction:   'mng',
        description:  'Employer share of SIPC contribution (17%)',
      },
      {
        accountCode:  '2310',
        accountName:  'PIT Payable',
        debitCredit:  'CR',
        amountSource: 'acct_tax_withholding.pit_amount',
        currency:     'SDG',
        glFunction:   'mng',
        description:  'PIT withheld from employee — payable to Taxation Chamber',
      },
      {
        accountCode:  '2320',
        accountName:  'Social Insurance Payable',
        debitCredit:  'CR',
        amountSource: 'total_employee_deduction + social_employer_amount',
        currency:     'SDG',
        glFunction:   'mng',
        description:  'Total SIPC (employee 8% + employer 17%) payable to SIPC',
      },
      {
        accountCode:  '2100',
        accountName:  'Salaries & Wages Payable',
        debitCredit:  'CR',
        amountSource: 'gross_salary − total_employee_deduction (net pay)',
        currency:     'SDG',
        glFunction:   'mng',
        description:  'Net salary payable to employee after deductions',
      },
    ],
    notes: 'Full payroll withholding journal. DR Salary Expense + DR Employer Social / ' +
           'CR PIT Payable + CR Social Payable + CR Net Salaries Payable. ' +
           'Uses acct_compute_pit() RPC for PIT bracket calculation. ' +
           'Enabled by default when acct.statutory.pit is on. ' +
           'Sudan SIPC rates (2024): employee 8%, employer 17%.',
  },
];

// ─── Helper utilities ────────────────────────────────────────────────────────

export function getTemplateById(id: string): PostingTemplate | undefined {
  return POSTING_TEMPLATES.find(t => t.id === id);
}

export function getTemplatesBySource(sourceTable: string): PostingTemplate[] {
  return POSTING_TEMPLATES.filter(t => t.sourceTable === sourceTable);
}

export function resolveAccountName(code: string): string {
  return COA_ACCOUNTS[code] ?? `Account ${code}`;
}

export function resolveOpsCostAccount(category: string): string {
  return OPS_COST_ACCOUNT_MAP[category] ?? '5050';
}

export const BRIDGE_FEATURE_FLAGS = POSTING_TEMPLATES.map(t => t.featureFlag)
  .filter((v, i, a) => a.indexOf(v) === i);

export const SOURCE_TABLES_BRIDGED = POSTING_TEMPLATES.map(t => t.sourceTable)
  .filter((v, i, a) => a.indexOf(v) === i);
