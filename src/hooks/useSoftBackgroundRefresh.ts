import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Soft background refresh hook for silent periodic DB sync
 * Usage: useSoftBackgroundRefresh('mmp_files', 60000)
 */
export function useSoftBackgroundRefresh(table: string, intervalMs = 60000, onData?: (data: any) => void) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      const { data } = await supabase.from(table).select('*');
      if (isMounted && onData && data) {
        onData(data);
      }
      // Optionally: update your global state/store here
    };

    timerRef.current = setInterval(fetchData, intervalMs);
    fetchData(); // Initial fetch

    return () => {
      isMounted = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [table, intervalMs, onData]);
}
