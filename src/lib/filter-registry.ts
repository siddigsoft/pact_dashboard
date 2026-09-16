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
];

export const FILTER_REGISTRY_BY_KEY = Object.fromEntries(FILTER_REGISTRY.map(item => [item.key, item]));