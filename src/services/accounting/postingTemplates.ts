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
