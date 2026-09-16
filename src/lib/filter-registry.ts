/**
 * Canonical UI filter registry.  These keys identify controls (not data
 * permissions); changing a label must not change a key or persisted setting.
 */
export interface FilterDefinition {
  key: string;
  page: string;
  pageLabel: string;
  label: string;
  description: string;
  defaultVisible?: boolean;
}

const f = (page: string, pageLabel: string, key: string, label: string, description: string): FilterDefinition =>
  ({ key, page, pageLabel, label, description, defaultVisible: true });

const pageFilters = (
  page: string,
  pageLabel: string,
  filters: readonly (readonly [string, string])[],
): FilterDefinition[] => filters.map(([key, label]) =>
  f(page, pageLabel, `${page}.${key}`, label, `Show the ${label.toLowerCase()} filter`),
);

export const FILTER_REGISTRY: readonly FilterDefinition[] = [
  ...[
    ['status', 'Status', 'Filter by MMP/site status'], ['hub', 'Hub', 'Filter sites by hub'],
    ['state', 'State', 'Filter sites by state'], ['locality', 'Locality', 'Filter sites by locality'],
    ['mmp', 'MMP', 'Filter sites by MMP'],
  ].map(([key, label, description]) => f('mmp-management', 'MMP Management', `mmp-management.${key}`, label, description)),
  ...[
    ['status', 'Status', 'Filter cost submissions by status'], ['mmp', 'MMP', 'Filter cost submissions by MMP'],
    ['user', 'Submitted By', 'Filter cost submissions by submitter'],
    ['state', 'State', 'Filter cost submissions by state'],
    ['pre-fund', 'Pre-Fund', 'Filter cost submissions by Pre-Fund source'],
    ['tier', 'Approval Tier', 'Filter submissions by current approval tier'],
    ['search', 'Search', 'Search cost submissions'],
    ['date', 'Expense Date', 'Filter cost submissions by expense date'],
    ['amount', 'Amount', 'Filter cost submissions by amount'],
  ].map(([key, label, description]) => f('cost-submission', 'Cost Submission', `cost-submission.${key}`, label, description)),
  ...[
    ['status', 'Status', 'Filter down payments by status'], ['hub', 'Hub', 'Filter down payments by hub'],
    ['state', 'State', 'Filter down payments by state'], ['locality', 'Locality', 'Filter down payments by locality'],
    ['mmp', 'MMP', 'Filter down payments by MMP'], ['site', 'Site', 'Filter down payments by site'],
    ['date', 'Date', 'Filter down payments by requested date'],
    ['user', 'Data Collector', 'Filter down payments by data collector'],
    ['pre-fund', 'Pre-Fund', 'Filter down payments by Pre-Fund source'],
    ['search', 'Search', 'Search down payment requests'],
    ['amount', 'Amount', 'Filter down payments by requested amount'],
  ].map(([key, label, description]) => f('down-payment-approval', 'Down Payment Approval / Finance Hub', `down-payment-approval.${key}`, label, description)),
  ...pageFilters('advance-requests-report', 'Advance Requests Report', [
    ['search', 'Search'], ['status', 'Status'], ['hub', 'Hub'], ['mmp', 'MMP'],
    ['date', 'Date'], ['paid', 'Payment Status'], ['reconciled', 'Reconciliation Status'],
  ]),
  ...pageFilters('wallet-reports', 'Wallet Reports', [['search', 'Search']]),
  ...pageFilters('duplicate-payments-report', 'Duplicate Payments Report', [
    ['search', 'Search'], ['hub', 'Hub'], ['state', 'State'], ['mmp', 'MMP'],
    ['enumerator', 'Enumerator'], ['month', 'Month'], ['severity', 'Severity'],
  ]),
  ...pageFilters('salary-retainer-report', 'Salary & Retainer Report', [
    ['search', 'Search'], ['department', 'Department'], ['type', 'Employment Type'],
  ]),
  ...pageFilters('hr-hub.org-chart', 'HR Hub · Organization Chart', [
    ['search', 'Search'], ['department', 'Department'],
  ]),
  ...pageFilters('hr-assets', 'HR Assets', [
    ['search', 'Search'], ['type', 'Asset Type'], ['status', 'Status'],
    ['assigned-to', 'Assigned To'], ['department', 'Department'],
  ]),
  ...pageFilters('hr-policy-library', 'HR Policy Library', [
    ['search', 'Policy Search'], ['category', 'Policy Category'], ['status', 'Policy Status'],
    ['compliance-policy', 'Compliance Policy'], ['compliance-department', 'Compliance Department'],
    ['compliance-hub', 'Compliance Hub'], ['compliance-status', 'Compliance Status'],
  ]),
  ...pageFilters('leave-requests', 'Leave Requests', [['status', 'Status'], ['type', 'Leave Type']]),
  ...pageFilters('payroll-admin', 'Payroll Admin', [
    ['salary-search', 'Salary Search'], ['salary-status', 'Salary Status'],
  ]),
  ...pageFilters('crm-partners', 'CRM Partners', [
    ['search', 'Search'], ['type', 'Partner Type'], ['status', 'Status'],
  ]),
  ...pageFilters('crm-contacts', 'CRM Contacts', [['search', 'Search'], ['partner', 'Partner']]),
  ...pageFilters('crm-opportunities', 'CRM Opportunities', [['search', 'Search'], ['stage', 'Stage']]),
  ...pageFilters('crm-engagements', 'CRM Engagements', [
    ['search', 'Search'], ['type', 'Engagement Type'], ['partner', 'Partner'],
  ]),
  ...pageFilters('hub-operations', 'Hub Operations', [
    ['search', 'Search'], ['state', 'State'], ['hub', 'Hub'], ['locality', 'Locality'],
    ['activity', 'Activity Type'], ['status', 'Status'], ['source', 'Site Source'],
  ]),
  ...pageFilters('field-operation-manager', 'Field Operation Manager', [
    ['search', 'Search'], ['month', 'Month'], ['hub', 'Hub'],
  ]),
  ...pageFilters('field-team', 'Field Team', [['search', 'Search'], ['role', 'Role'], ['status', 'Status']]),
  ...pageFilters('field-payments-centre', 'Field Payments Centre', [
    ['hub', 'Hub'], ['state', 'State'], ['mmp', 'MMP'], ['enumerator', 'Enumerator'],
    ['fees-search', 'Fees Search'], ['fees-status', 'Fees Status'],
    ['advances-search', 'Advances Search'], ['advances-status', 'Advances Status'],
    ['exceptions-search', 'Exceptions Search'], ['exceptions-decision', 'Exception Decision'],
    ['exceptions-status', 'Exception Status'], ['recovery-search', 'Recovery Search'],
  ]),
  ...pageFilters('field-data-exports', 'Field Data Exports', [
    ['history-search', 'History Search'], ['format', 'Export Format'],
  ]),
  ...pageFilters('projects', 'Projects', [
    ['search', 'Search'], ['type', 'Project Type'], ['status', 'Status'], ['manager', 'Project Manager'],
  ]),
  ...pageFilters('task-admin', 'Task Administration', [
    ['template-search', 'Template Search'], ['template-priority', 'Template Priority'],
    ['template-department', 'Template Department'], ['template-recurrence', 'Template Recurrence'],
    ['template-type', 'Template Task Type'],
  ]),
  ...pageFilters('users', 'User Administration', [
    ['search', 'Search'], ['role', 'Role'], ['classification', 'Classification'],
    ['hub', 'Hub'], ['state', 'State'],
  ]),
  ...pageFilters('departments', 'Departments', [['department', 'Department'], ['search', 'Search']]),
  ...pageFilters('admin-cycle-health', 'Cycle Health Administration', [['search', 'Search']]),
  ...pageFilters('admin-wallets', 'Wallet Administration', [['search', 'Search']]),
  ...pageFilters('admin-whatsapp', 'WhatsApp Administration', [['log-type', 'Log Type']]),
];

export const FILTER_REGISTRY_BY_KEY = Object.fromEntries(FILTER_REGISTRY.map(item => [item.key, item]));