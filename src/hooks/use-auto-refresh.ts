import { useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRealtimeTable, useRealtimeTables } from './useRealtimeResource';

interface UseAutoRefreshOptions {
  tables: string[];
  queryKeys: string[][];
  enabled?: boolean;
  onUpdate?: () => void;
}

export function useAutoRefresh({
  tables,
  queryKeys,
  enabled = true,
  onUpdate
}: UseAutoRefreshOptions) {
  const queryClient = useQueryClient();
  const onUpdateRef = useRef(onUpdate);
  
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const handleRefresh = useCallback(() => {
    queryKeys.forEach(key => {
      queryClient.invalidateQueries({ queryKey: key });
    });
    onUpdateRef.current?.();
  }, [queryClient, queryKeys]);

  const { isSubscribed, lastEventAt, eventCount } = useRealtimeTables(
    tables,
    handleRefresh,
    { enabled }
  );

  return {
    isSubscribed,
    lastEventAt,
    eventCount,
    refresh: handleRefresh
  };
}

export function useAutoRefreshTable({
  table,
  queryKeys,
  enabled = true,
  filter,
  onUpdate
}: {
  table: string;
  queryKeys: string[][];
  enabled?: boolean;
  filter?: string;
  onUpdate?: () => void;
}) {
  const queryClient = useQueryClient();
  const onUpdateRef = useRef(onUpdate);
  
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const handleRefresh = useCallback(() => {
    queryKeys.forEach(key => {
      queryClient.invalidateQueries({ queryKey: key });
    });
    onUpdateRef.current?.();
  }, [queryClient, queryKeys]);

  const { isSubscribed, lastEventAt, eventCount } = useRealtimeTable(
    table,
    handleRefresh,
    { enabled, filter }
  );

  return {
    isSubscribed,
    lastEventAt,
    eventCount,
    refresh: handleRefresh
  };
}

export default useAutoRefresh;
