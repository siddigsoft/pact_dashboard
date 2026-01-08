export const queryKeys = {
  mmp: {
    all: ['mmp'] as const,
    lists: () => [...queryKeys.mmp.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.mmp.lists(), filters] as const,
    details: () => [...queryKeys.mmp.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.mmp.details(), id] as const,
    files: () => [...queryKeys.mmp.all, 'files'] as const,
    file: (id: string) => [...queryKeys.mmp.files(), id] as const,
  },
  
  siteVisits: {
    all: ['siteVisits'] as const,
    lists: () => [...queryKeys.siteVisits.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.siteVisits.lists(), filters] as const,
    details: () => [...queryKeys.siteVisits.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.siteVisits.details(), id] as const,
  },
  
  sites: {
    all: ['sites'] as const,
    lists: () => [...queryKeys.sites.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.sites.lists(), filters] as const,
    details: () => [...queryKeys.sites.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.sites.details(), id] as const,
  },
  
  profiles: {
    all: ['profiles'] as const,
    lists: () => [...queryKeys.profiles.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.profiles.lists(), filters] as const,
    details: () => [...queryKeys.profiles.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.profiles.details(), id] as const,
    current: () => [...queryKeys.profiles.all, 'current'] as const,
  },
  
  wallets: {
    all: ['wallets'] as const,
    lists: () => [...queryKeys.wallets.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.wallets.lists(), filters] as const,
    details: () => [...queryKeys.wallets.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.wallets.details(), id] as const,
    transactions: (walletId: string) => [...queryKeys.wallets.detail(walletId), 'transactions'] as const,
  },
  
  costs: {
    all: ['costs'] as const,
    lists: () => [...queryKeys.costs.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.costs.lists(), filters] as const,
    pending: () => [...queryKeys.costs.all, 'pending'] as const,
    approved: () => [...queryKeys.costs.all, 'approved'] as const,
  },
  
  dashboard: {
    all: ['dashboard'] as const,
    stats: () => [...queryKeys.dashboard.all, 'stats'] as const,
    activities: () => [...queryKeys.dashboard.all, 'activities'] as const,
    notifications: () => [...queryKeys.dashboard.all, 'notifications'] as const,
  },
  
  emails: {
    all: ['emails'] as const,
    lists: () => [...queryKeys.emails.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) => [...queryKeys.emails.lists(), filters] as const,
    tracking: () => [...queryKeys.emails.all, 'tracking'] as const,
  },
  
  chat: {
    all: ['chat'] as const,
    conversations: () => [...queryKeys.chat.all, 'conversations'] as const,
    conversation: (id: string) => [...queryKeys.chat.conversations(), id] as const,
    messages: (conversationId: string) => [...queryKeys.chat.conversation(conversationId), 'messages'] as const,
  },
  
  finance: {
    all: ['finance'] as const,
    approvals: () => [...queryKeys.finance.all, 'approvals'] as const,
    transactions: () => [...queryKeys.finance.all, 'transactions'] as const,
    budgets: () => [...queryKeys.finance.all, 'budgets'] as const,
  },
  
  signatures: {
    all: ['signatures'] as const,
    lists: () => [...queryKeys.signatures.all, 'list'] as const,
    pending: () => [...queryKeys.signatures.all, 'pending'] as const,
  },
} as const;

export type QueryKeyFactory = typeof queryKeys;
