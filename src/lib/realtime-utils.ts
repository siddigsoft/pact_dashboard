/**
 * Realtime Utilities
 * Debouncing, batching, and smart refresh utilities for realtime updates
 */

import { queryClient } from './queryClient';

type DebouncedFunction = (...args: any[]) => void;

interface DebouncedRefreshState {
  timeoutId: ReturnType<typeof setTimeout> | null;
  pendingTables: Set<string>;
  pendingEvents: Map<string, Set<string>>;
}

const refreshState: DebouncedRefreshState = {
  timeoutId: null,
  pendingTables: new Set(),
  pendingEvents: new Map(),
};

const DEBOUNCE_DELAY_MS = 300;
const BATCH_WINDOW_MS = 500;

export function createDebouncedRefresh(
  refreshFn: () => void | Promise<void>,
  delayMs: number = DEBOUNCE_DELAY_MS
): DebouncedFunction {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: any[]) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      refreshFn();
      timeoutId = null;
    }, delayMs);
  };
}

export function queueTableRefresh(table: string, eventType: string): void {
  refreshState.pendingTables.add(table);
  
  const events = refreshState.pendingEvents.get(table) || new Set();
  events.add(eventType);
  refreshState.pendingEvents.set(table, events);

  if (refreshState.timeoutId) {
    clearTimeout(refreshState.timeoutId);
  }

  refreshState.timeoutId = setTimeout(() => {
    processPendingRefreshes();
  }, BATCH_WINDOW_MS);
}

function processPendingRefreshes(): void {
  const tables = Array.from(refreshState.pendingTables);
  const events = new Map(refreshState.pendingEvents);

  refreshState.pendingTables.clear();
  refreshState.pendingEvents.clear();
  refreshState.timeoutId = null;

  if (tables.length === 0) return;

  console.log(`[RealtimeUtils] Processing batched refresh for tables:`, tables);

  for (const table of tables) {
    const queryKeys = getQueryKeysForTable(table);
    for (const key of queryKeys) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  }
}

function getQueryKeysForTable(table: string): string[][] {
  const tableToQueryKeys: Record<string, string[][]> = {
    'projects': [['/api/projects'], ['projects']],
    'mmp_files': [['/api/mmp'], ['mmp'], ['mmp-files']],
    'mmp_site_entries': [['/api/mmp'], ['mmp'], ['site-entries'], ['sites']],
    'site_visits': [['/api/site-visits'], ['site-visits'], ['visits']],
    'profiles': [['/api/profiles'], ['profiles'], ['users']],
    'notifications': [['/api/notifications'], ['notifications']],
    'wallets': [['/api/wallets'], ['wallets']],
    'cost_submissions': [['/api/costs'], ['costs'], ['cost-submissions']],
    'messages': [['/api/messages'], ['messages'], ['chat']],
    'team_locations': [['/api/locations'], ['locations'], ['team-locations']],
  };

  return tableToQueryKeys[table] || [[table]];
}

export interface RealtimeToastConfig {
  enabled: boolean;
  batchWindow: number;
  maxToastsPerBatch: number;
}

const defaultToastConfig: RealtimeToastConfig = {
  enabled: true,
  batchWindow: 2000,
  maxToastsPerBatch: 3,
};

interface PendingToast {
  table: string;
  eventType: string;
  count: number;
  timestamp: Date;
}

const pendingToasts: Map<string, PendingToast> = new Map();
let toastTimeoutId: ReturnType<typeof setTimeout> | null = null;

export function queueRealtimeToast(
  table: string,
  eventType: string,
  showToast: (config: { title: string; description: string; duration?: number }) => void,
  config: Partial<RealtimeToastConfig> = {}
): void {
  const mergedConfig = { ...defaultToastConfig, ...config };
  
  if (!mergedConfig.enabled) return;

  const key = `${table}:${eventType}`;
  const existing = pendingToasts.get(key);
  
  if (existing) {
    existing.count++;
    existing.timestamp = new Date();
  } else {
    pendingToasts.set(key, {
      table,
      eventType,
      count: 1,
      timestamp: new Date(),
    });
  }

  if (toastTimeoutId) {
    clearTimeout(toastTimeoutId);
  }

  toastTimeoutId = setTimeout(() => {
    processToastBatch(showToast, mergedConfig);
  }, mergedConfig.batchWindow);
}

function processToastBatch(
  showToast: (config: { title: string; description: string; duration?: number }) => void,
  config: RealtimeToastConfig
): void {
  const toasts = Array.from(pendingToasts.values());
  pendingToasts.clear();
  toastTimeoutId = null;

  if (toasts.length === 0) return;

  const sortedToasts = toasts.sort((a, b) => b.count - a.count);
  const toastsToShow = sortedToasts.slice(0, config.maxToastsPerBatch);

  if (toastsToShow.length === 1) {
    const t = toastsToShow[0];
    const title = getToastTitle(t.table, t.eventType);
    const description = t.count > 1 
      ? `${t.count} updates received`
      : 'Data refreshed automatically';
    
    showToast({ title, description, duration: 2000 });
  } else {
    const totalUpdates = toasts.reduce((sum, t) => sum + t.count, 0);
    const tables = [...new Set(toasts.map(t => getTableDisplayName(t.table)))];
    
    showToast({
      title: 'Data Updated',
      description: `${totalUpdates} updates across ${tables.join(', ')}`,
      duration: 3000,
    });
  }
}

function getToastTitle(table: string, eventType: string): string {
  const tableNames: Record<string, string> = {
    'projects': 'Project',
    'mmp_files': 'MMP File',
    'mmp_site_entries': 'Site Entry',
    'site_visits': 'Site Visit',
    'profiles': 'User Profile',
    'notifications': 'Notification',
    'wallets': 'Wallet',
    'cost_submissions': 'Cost Submission',
    'messages': 'Message',
    'team_locations': 'Team Location',
  };

  const eventLabels: Record<string, string> = {
    'INSERT': 'Created',
    'UPDATE': 'Updated',
    'DELETE': 'Removed',
  };

  const tableName = tableNames[table] || table;
  const action = eventLabels[eventType] || 'Changed';

  return `${tableName} ${action}`;
}

function getTableDisplayName(table: string): string {
  const names: Record<string, string> = {
    'projects': 'Projects',
    'mmp_files': 'MMPs',
    'mmp_site_entries': 'Sites',
    'site_visits': 'Visits',
    'profiles': 'Users',
    'notifications': 'Notifications',
    'wallets': 'Wallets',
    'cost_submissions': 'Costs',
    'messages': 'Messages',
    'team_locations': 'Locations',
  };
  return names[table] || table;
}

export function cancelPendingRefreshes(): void {
  if (refreshState.timeoutId) {
    clearTimeout(refreshState.timeoutId);
    refreshState.timeoutId = null;
  }
  refreshState.pendingTables.clear();
  refreshState.pendingEvents.clear();
}

export function cancelPendingToasts(): void {
  if (toastTimeoutId) {
    clearTimeout(toastTimeoutId);
    toastTimeoutId = null;
  }
  pendingToasts.clear();
}
