import { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { realtimeManager, SubscriptionConfig, SubscriptionHandler } from '@/lib/realtime-manager';

export interface UseRealtimeResourceOptions<T = any> {
  configs: SubscriptionConfig | SubscriptionConfig[];
  onInsert?: (item: T) => void;
  onUpdate?: (data: { old: T; new: T }) => void;
  onDelete?: (item: T) => void;
  onAny?: (payload: any) => void;
  onRefresh?: () => void | Promise<void>;
  enabled?: boolean;
}

export interface UseRealtimeResourceReturn {
  isSubscribed: boolean;
  lastEventAt: Date | null;
  eventCount: number;
  refresh: () => void;
}

function serializeConfigs(configs: SubscriptionConfig | SubscriptionConfig[]): string {
  const arr = Array.isArray(configs) ? configs : [configs];
  return arr
    .map(c => `${c.schema || 'public'}.${c.table}.${c.event || '*'}.${c.filter || ''}`)
    .sort()
    .join('|');
}

export function useRealtimeResource<T = any>(
  options: UseRealtimeResourceOptions<T>
): UseRealtimeResourceReturn {
  const {
    configs,
    onInsert,
    onUpdate,
    onDelete,
    onAny,
    onRefresh,
    enabled = true,
  } = options;

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);
  const [eventCount, setEventCount] = useState(0);

  const configsKey = useMemo(() => serializeConfigs(configs), [configs]);
  
  const stableConfigs = useMemo(() => {
    return Array.isArray(configs) ? configs : [configs];
  }, [configsKey]);

  const handlersRef = useRef({
    onInsert,
    onUpdate,
    onDelete,
    onAny,
    onRefresh,
  });

  useEffect(() => {
    handlersRef.current = {
      onInsert,
      onUpdate,
      onDelete,
      onAny,
      onRefresh,
    };
  }, [onInsert, onUpdate, onDelete, onAny, onRefresh]);

  const refresh = useCallback(() => {
    if (handlersRef.current.onRefresh) {
      handlersRef.current.onRefresh();
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsSubscribed(false);
      return;
    }

    const handlers: SubscriptionHandler<T> = {
      onInsert: (item) => {
        setLastEventAt(new Date());
        setEventCount((c) => c + 1);
        if (handlersRef.current.onInsert) {
          handlersRef.current.onInsert(item);
        }
        if (handlersRef.current.onRefresh) {
          handlersRef.current.onRefresh();
        }
      },
      onUpdate: (data) => {
        setLastEventAt(new Date());
        setEventCount((c) => c + 1);
        if (handlersRef.current.onUpdate) {
          handlersRef.current.onUpdate(data);
        }
        if (handlersRef.current.onRefresh) {
          handlersRef.current.onRefresh();
        }
      },
      onDelete: (item) => {
        setLastEventAt(new Date());
        setEventCount((c) => c + 1);
        if (handlersRef.current.onDelete) {
          handlersRef.current.onDelete(item);
        }
        if (handlersRef.current.onRefresh) {
          handlersRef.current.onRefresh();
        }
      },
      onAny: (payload) => {
        if (handlersRef.current.onAny) {
          handlersRef.current.onAny(payload);
        }
      },
    };

    const unsubscribe = realtimeManager.subscribe(stableConfigs, handlers);
    setIsSubscribed(true);

    return () => {
      unsubscribe();
      setIsSubscribed(false);
    };
  }, [stableConfigs, enabled]);

  return {
    isSubscribed,
    lastEventAt,
    eventCount,
    refresh,
  };
}

export function useRealtimeTable<T = any>(
  table: string,
  onRefresh: () => void | Promise<void>,
  options: {
    schema?: string;
    filter?: string;
    enabled?: boolean;
  } = {}
): UseRealtimeResourceReturn {
  const config = useMemo(
    () => ({
      table,
      schema: options.schema || 'public',
      filter: options.filter,
    }),
    [table, options.schema, options.filter]
  );

  return useRealtimeResource<T>({
    configs: config,
    onRefresh,
    enabled: options.enabled,
  });
}

export function useRealtimeTables<T = any>(
  tables: string[],
  onRefresh: () => void | Promise<void>,
  options: {
    schema?: string;
    enabled?: boolean;
  } = {}
): UseRealtimeResourceReturn {
  const tablesKey = tables.sort().join(',');
  
  const configs = useMemo(
    () =>
      tables.map((t) => ({
        table: t,
        schema: options.schema || 'public',
      })),
    [tablesKey, options.schema]
  );

  return useRealtimeResource<T>({
    configs,
    onRefresh,
    enabled: options.enabled,
  });
}
