/**
 * column-registry.ts
 * Defines which columns in key tables/reports can have per-role or per-user
 * visibility rules. Used by the Permissions tab of the Unified Access Manager.
 */

export interface ColumnDef {
  key: string;
  label: string;
  description?: string;
  sensitive?: boolean;   // financial or personal data — highlighted in UI
}

export interface PageColumnDef {
  pageSlug: string;
  pageLabel: string;
  columns: ColumnDef[];
}

export const COLUMN_REGISTRY: PageColumnDef[] = [
  {
    pageSlug: 'site-visits',
    pageLabel: 'Site Visits',
    columns: [
      { key: 'name',            label: 'Site Name' },
      { key: 'hub',             label: 'Hub' },
      { key: 'state',           label: 'State' },
      { key: 'locality',        label: 'Locality' },
      { key: 'collector',       label: 'Collector' },
      { key: 'claimed_by',      label: 'Claimed By' },
      { key: 'transport_fee',   label: 'Transport Fee',   sensitive: true },
      { key: 'enumerator_fee',  label: 'Enumerator Fee',  sensitive: true },
      { key: 'verified_by',     label: 'Verified By' },
      { key: 'status',          label: 'Status' },
      { key: 'date',            label: 'Visit Date' },
    ],
  },
  {
    pageSlug: 'payroll-admin',
    pageLabel: 'Payroll Admin',
    columns: [
      { key: 'name',          label: 'Employee Name' },
      { key: 'position',      label: 'Position' },
      { key: 'contract_type', label: 'Contract Type' },
      { key: 'gross_pay',     label: 'Gross Pay',      sensitive: true },
      { key: 'deductions',    label: 'Deductions',     sensitive: true },
      { key: 'net_pay',       label: 'Net Pay',        sensitive: true },
      { key: 'npf',           label: 'NPF Contribution', sensitive: true },
      { key: 'tax',           label: 'Tax Withheld',   sensitive: true },
      { key: 'bank_account',  label: 'Bank Account',   sensitive: true },
      { key: 'hub',           label: 'Hub' },
    ],
  },
  {
    pageSlug: 'employees',
    pageLabel: 'Employees',
    columns: [
      { key: 'name',              label: 'Full Name' },
      { key: 'national_id',       label: 'National ID',         sensitive: true },
      { key: 'salary',            label: 'Base Salary',         sensitive: true },
      { key: 'bank_account',      label: 'Bank Account',        sensitive: true },
      { key: 'contract_type',     label: 'Contract Type' },
      { key: 'start_date',        label: 'Start Date' },
      { key: 'emergency_contact', label: 'Emergency Contact',   sensitive: true },
      { key: 'position',          label: 'Position' },
      { key: 'hub',               label: 'Hub' },
    ],
  },
  {
    pageSlug: 'users',
    pageLabel: 'User Management',
    columns: [
      { key: 'name',        label: 'Full Name' },
      { key: 'email',       label: 'Email Address',   sensitive: true },
      { key: 'phone',       label: 'Phone Number',    sensitive: true },
      { key: 'role',        label: 'Role' },
      { key: 'hub',         label: 'Hub' },
      { key: 'national_id', label: 'National ID',     sensitive: true },
      { key: 'last_login',  label: 'Last Login' },
      { key: 'status',      label: 'Status' },
    ],
  },
  {
    pageSlug: 'admin-wallets',
    pageLabel: 'Wallets Admin',
    columns: [
      { key: 'user',              label: 'User / Owner' },
      { key: 'hub',               label: 'Hub' },
      { key: 'balance',           label: 'Current Balance',   sensitive: true },
      { key: 'currency',          label: 'Currency' },
      { key: 'last_transaction',  label: 'Last Transaction Date' },
      { key: 'status',            label: 'Status' },
    ],
  },
  {
    pageSlug: 'cost-submission',
    pageLabel: 'Cost Submission',
    columns: [
      { key: 'submitted_by',  label: 'Submitted By' },
      { key: 'hub',           label: 'Hub' },
      { key: 'state',         label: 'State' },
      { key: 'amount',        label: 'Amount',         sensitive: true },
      { key: 'approved_by',   label: 'Approved By' },
      { key: 'status',        label: 'Status' },
      { key: 'date',          label: 'Date' },
    ],
  },
  {
    pageSlug: 'transaction-scanner',
    pageLabel: 'Transaction Scanner',
    columns: [
      { key: 'amount',      label: 'Amount',          sensitive: true },
      { key: 'currency',    label: 'Currency' },
      { key: 'type',        label: 'Transaction Type' },
      { key: 'hub',         label: 'Hub' },
      { key: 'user',        label: 'Recipient / User' },
      { key: 'created_by',  label: 'Created By' },
      { key: 'reference',   label: 'Reference' },
      { key: 'status',      label: 'Status' },
      { key: 'date',        label: 'Date' },
    ],
  },
  {
    pageSlug: 'finance-hub',
    pageLabel: 'Finance Hub',
    columns: [
      { key: 'project',     label: 'Project / Hub' },
      { key: 'inflow',      label: 'Inflow',            sensitive: true },
      { key: 'outflow',     label: 'Outflow',           sensitive: true },
      { key: 'net',         label: 'Net Balance',       sensitive: true },
      { key: 'budget',      label: 'Budget Amount',     sensitive: true },
      { key: 'fund_source', label: 'Fund Source' },
      { key: 'allocation',  label: 'Allocation Amount', sensitive: true },
    ],
  },
  {
    pageSlug: 'accounting-general-ledger',
    pageLabel: 'General Ledger',
    columns: [
      { key: 'date',        label: 'Date' },
      { key: 'entry_no',    label: 'Entry #' },
      { key: 'description', label: 'Description' },
      { key: 'debit',       label: 'Debit',   sensitive: true },
      { key: 'credit',      label: 'Credit',  sensitive: true },
      { key: 'balance',     label: 'Balance', sensitive: true },
    ],
  },
  {
    pageSlug: 'accounting-journals',
    pageLabel: 'Journal Entries',
    columns: [
      { key: 'entry_no',    label: 'Entry #' },
      { key: 'date',        label: 'Posting Date' },
      { key: 'period',      label: 'Period' },
      { key: 'source',      label: 'Source' },
      { key: 'description', label: 'Description' },
      { key: 'amount',      label: 'Amount',    sensitive: true },
      { key: 'fund',        label: 'Fund',      sensitive: true },
      { key: 'debit',       label: 'Debit',     sensitive: true },
      { key: 'credit',      label: 'Credit',    sensitive: true },
      { key: 'gl_status',   label: 'GL Status' },
    ],
  },
  {
    pageSlug: 'down-payment-approval',
    pageLabel: 'Down Payment Approval',
    columns: [
      { key: 'team_member',     label: 'Team Member' },
      { key: 'site',            label: 'Site' },
      { key: 'hub',             label: 'Hub' },
      { key: 'mmp_budget',      label: 'MMP Budget',      sensitive: true },
      { key: 'total_requested', label: 'Total Requested', sensitive: true },
      { key: 'total_approved',  label: 'Total Approved',  sensitive: true },
      { key: 'total_paid',      label: 'Total Paid',      sensitive: true },
      { key: 'remaining',       label: 'Remaining',       sensitive: true },
      { key: 'status',          label: 'Status' },
    ],
  },
  {
    pageSlug: 'wallet',
    pageLabel: 'My Wallet',
    columns: [
      { key: 'type',        label: 'Transaction Type' },
      { key: 'description', label: 'Description' },
      { key: 'amount',      label: 'Amount',        sensitive: true },
      { key: 'balance',     label: 'Balance After', sensitive: true },
      { key: 'date',        label: 'Date' },
      { key: 'status',      label: 'Status' },
    ],
  },
  {
    pageSlug: 'hr',
    pageLabel: 'HR Hub',
    columns: [
      { key: 'staff',          label: 'Staff Name' },
      { key: 'leave_balances', label: 'Leave Balances (All)', sensitive: true },
      { key: 'base_salary',    label: 'Base Salary',          sensitive: true },
      { key: 'gross_pay',      label: 'Monthly Gross',        sensitive: true },
      { key: 'net_pay',        label: 'Monthly Net',          sensitive: true },
      { key: 'annual_net',     label: 'Annual Net',           sensitive: true },
    ],
  },
];
