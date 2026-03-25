import { useEffect, useCallback, useRef, useState } from 'react';
import { useQueryClient, QueryKey } from '@tanstack/react-query';
import { realtimeManager, SubscriptionConfig } from '@/lib/realtime-manager';

export interface UseRealtimeTableOptions {
  table: string;
  schema?: string;
  filter?: string;
  queryKey: QueryKey;
  enabled?: boolean;
  debounceMs?: number;
  onInsert?: (payload: any) => void;
  onUpdate?: (payload: { old: any; new: any }) => void;
  onDelete?: (payload: any) => void;
}

export interface UseRealtimeTableReturn {
  isSubscribed: boolean;
  lastUpdateAt: Date | null;
}

export function useRealtimeTable(options: UseRealtimeTableOptions): UseRealtimeTableReturn {
  const {
    table,
    schema = 'public',
    filter,
    queryKey,
    enabled = true,
    debounceMs = 100,
    onInsert,
    onUpdate,
    onDelete,
  } = options;

  const queryClient = useQueryClient();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [lastUpdateAt, setLastUpdateAt] = useState<Date | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedInvalidate = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey });
      setLastUpdateAt(new Date());
    }, debounceMs);
  }, [queryClient, queryKey, debounceMs]);

  useEffect(() => {
    if (!enabled) {
      setIsSubscribed(false);
      return;
    }

    const config: SubscriptionConfig = {
      table,
      schema,
      event: '*',
      filter,
    };

    const handlers = {
      onInsert: (item: any) => {
        debouncedInvalidate();
        onInsert?.(item);
      },
      onUpdate: (data: { old: any; new: any }) => {
        debouncedInvalidate();
        onUpdate?.(data);
      },
      onDelete: (item: any) => {
        debouncedInvalidate();
        onDelete?.(item);
      },
    };

    const unsubscribe = realtimeManager.subscribe([config], handlers);
    setIsSubscribed(true);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      unsubscribe();
      setIsSubscribed(false);
    };
  }, [table, schema, filter, enabled, debouncedInvalidate, onInsert, onUpdate, onDelete]);

  return {
    isSubscribed,
    lastUpdateAt,
  };
}

export function useMultiTableRealtime(
  tables: Array<{ table: string; schema?: string; filter?: string }>,
  queryKeys: QueryKey[],
  options: { enabled?: boolean; debounceMs?: number } = {}
) {
  const { enabled = true, debounceMs = 100 } = options;
  const queryClient = useQueryClient();
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedInvalidateAll = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      queryKeys.forEach((qk) => {
        queryClient.invalidateQueries({ queryKey: qk });
      });
    }, debounceMs);
  }, [queryClient, queryKeys, debounceMs]);

  useEffect(() => {
    if (!enabled || tables.length === 0) return;

    const configs: SubscriptionConfig[] = tables.map((t) => ({
      table: t.table,
      schema: t.schema || 'public',
      event: '*' as const,
      filter: t.filter,
    }));

    const handlers = {
      onInsert: () => debouncedInvalidateAll(),
      onUpdate: () => debouncedInvalidateAll(),
      onDelete: () => debouncedInvalidateAll(),
    };

    const unsubscribe = realtimeManager.subscribe(configs, handlers);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      unsubscribe();
    };
  }, [tables, enabled, debouncedInvalidateAll]);
}
