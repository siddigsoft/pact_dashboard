import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export type ChangeEventType = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

export interface SubscriptionConfig {
  table: string;
  schema?: string;
  event?: ChangeEventType;
  filter?: string;
}

export interface SubscriptionHandler<T = any> {
  onInsert?: (payload: T) => void;
  onUpdate?: (payload: { old: T; new: T }) => void;
  onDelete?: (payload: T) => void;
  onAny?: (payload: RealtimePostgresChangesPayload<T>) => void;
}

interface HandlerEntry {
  handler: (payload: any) => void;
  configKey: string;
}

interface ManagedSubscription {
  channelName: string;
  channel: RealtimeChannel;
  refCount: number;
  handlers: Map<string, Set<HandlerEntry>>;
}

const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 5;

function getConfigKey(config: SubscriptionConfig): string {
  return `${config.schema || 'public'}.${config.table}.${config.event || '*'}.${config.filter || ''}`;
}

function getChannelKey(configs: SubscriptionConfig[]): string {
  const tableKeys = configs
    .map(c => `${c.schema || 'public'}.${c.table}`)
    .sort()
    .join('|');
  return `realtime_${tableKeys}`;
}

class RealtimeSubscriptionManager {
  private subscriptions: Map<string, ManagedSubscription> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }
  }

  private handleOnline = () => {
    this.isOnline = true;
    console.log('[RealtimeManager] Network restored, reconnecting subscriptions...');
    this.reconnectAll();
  };

  private handleOffline = () => {
    this.isOnline = false;
    console.log('[RealtimeManager] Network lost, pausing subscriptions');
  };

  private async reconnectAll(): Promise<void> {
    for (const [key, sub] of this.subscriptions.entries()) {
      try {
        await sub.channel.subscribe();
        this.reconnectAttempts.set(key, 0);
      } catch (error) {
        console.error(`[RealtimeManager] Failed to reconnect ${key}:`, error);
        this.scheduleReconnect(key, sub);
      }
    }
  }

  private scheduleReconnect(key: string, sub: ManagedSubscription): void {
    const attempts = this.reconnectAttempts.get(key) || 0;
    if (attempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`[RealtimeManager] Max reconnect attempts reached for ${key}`);
      return;
    }

    const delay = RECONNECT_DELAY_MS * Math.pow(2, attempts);
    this.reconnectAttempts.set(key, attempts + 1);

    setTimeout(async () => {
      if (!this.isOnline) return;
      try {
        await sub.channel.subscribe();
        this.reconnectAttempts.set(key, 0);
        console.log(`[RealtimeManager] Reconnected ${key}`);
      } catch (error) {
        console.error(`[RealtimeManager] Reconnect failed for ${key}:`, error);
        this.scheduleReconnect(key, sub);
      }
    }, delay);
  }

  private matchesFilter(config: SubscriptionConfig, payload: any): boolean {
    if (!config.filter) return true;
    
    const match = config.filter.match(/^(\w+)=eq\.(.+)$/);
    if (!match) return true;
    
    const [, column, value] = match;
    const record = payload.new || payload.old || {};
    return String(record[column]) === value;
  }

  subscribe<T = any>(
    configs: SubscriptionConfig | SubscriptionConfig[],
    handlers: SubscriptionHandler<T>
  ): () => void {
    const configArray = Array.isArray(configs) ? configs : [configs];
    const channelKey = getChannelKey(configArray);

    let managedSub = this.subscriptions.get(channelKey);

    if (!managedSub) {
      const channel = supabase.channel(channelKey);

      const tablesAdded = new Set<string>();
      for (const config of configArray) {
        const tableKey = `${config.schema || 'public'}.${config.table}`;
        if (tablesAdded.has(tableKey)) continue;
        tablesAdded.add(tableKey);

        const pgConfig: any = {
          event: '*',
          schema: config.schema || 'public',
          table: config.table,
        };

        channel.on(
          'postgres_changes',
          pgConfig,
          (payload: RealtimePostgresChangesPayload<T>) => {
            this.notifyHandlers(channelKey, config.table, payload);
          }
        );
      }

      managedSub = {
        channelName: channelKey,
        channel,
        refCount: 0,
        handlers: new Map(),
      };

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[RealtimeManager] Subscribed to ${channelKey}`);
          this.reconnectAttempts.set(channelKey, 0);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`[RealtimeManager] Channel error for ${channelKey}: ${status}`);
          if (this.isOnline) {
            this.scheduleReconnect(channelKey, managedSub!);
          }
        }
      });

      this.subscriptions.set(channelKey, managedSub);
    }

    managedSub.refCount++;

    const handlerEntries: HandlerEntry[] = [];

    for (const config of configArray) {
      const configKey = getConfigKey(config);

      const wrappedHandler = (payload: RealtimePostgresChangesPayload<T>) => {
        if (!this.matchesFilter(config, payload)) return;
        
        const eventType = config.event || '*';
        if (eventType !== '*' && payload.eventType !== eventType) return;

        if (payload.eventType === 'INSERT' && handlers.onInsert) {
          handlers.onInsert(payload.new as T);
        } else if (payload.eventType === 'UPDATE' && handlers.onUpdate) {
          handlers.onUpdate({ old: payload.old as T, new: payload.new as T });
        } else if (payload.eventType === 'DELETE' && handlers.onDelete) {
          handlers.onDelete(payload.old as T);
        }
        if (handlers.onAny) {
          handlers.onAny(payload);
        }
      };

      const entry: HandlerEntry = { handler: wrappedHandler, configKey };
      handlerEntries.push(entry);

      const tableHandlers = managedSub.handlers.get(config.table) || new Set();
      tableHandlers.add(entry);
      managedSub.handlers.set(config.table, tableHandlers);
    }

    return () => {
      this.unsubscribe(channelKey, handlerEntries);
    };
  }

  private notifyHandlers<T>(
    channelKey: string,
    table: string,
    payload: RealtimePostgresChangesPayload<T>
  ): void {
    const managedSub = this.subscriptions.get(channelKey);
    if (!managedSub) return;

    const entries = managedSub.handlers.get(table);
    if (entries) {
      entries.forEach((entry) => entry.handler(payload));
    }
  }

  private unsubscribe(channelKey: string, handlerEntries: HandlerEntry[]): void {
    const managedSub = this.subscriptions.get(channelKey);
    if (!managedSub) return;

    for (const entry of handlerEntries) {
      for (const [table, entries] of managedSub.handlers.entries()) {
        entries.delete(entry);
        if (entries.size === 0) {
          managedSub.handlers.delete(table);
        }
      }
    }

    managedSub.refCount--;

    if (managedSub.refCount <= 0) {
      console.log(`[RealtimeManager] Unsubscribing from ${channelKey}`);
      supabase.removeChannel(managedSub.channel);
      this.subscriptions.delete(channelKey);
      this.reconnectAttempts.delete(channelKey);
    }
  }

  getActiveSubscriptions(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  getSubscriptionStats(): { total: number; tables: string[] } {
    const tables = new Set<string>();
    for (const sub of this.subscriptions.values()) {
      for (const table of sub.handlers.keys()) {
        tables.add(table);
      }
    }
    return {
      total: this.subscriptions.size,
      tables: Array.from(tables),
    };
  }

  destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }

    for (const sub of this.subscriptions.values()) {
      supabase.removeChannel(sub.channel);
    }
    this.subscriptions.clear();
    this.reconnectAttempts.clear();
  }
}

export const realtimeManager = new RealtimeSubscriptionManager();
