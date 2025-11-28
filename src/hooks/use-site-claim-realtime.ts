import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface UseSiteClaimRealtimeOptions {
  onSiteClaimed?: (siteId: string, claimedBy: string) => void;
  onRefresh?: () => void;
  enabled?: boolean;
}

export function useSiteClaimRealtime({
  onSiteClaimed,
  onRefresh,
  enabled = true
}: UseSiteClaimRealtimeOptions = {}) {
  const { toast } = useToast();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const handleClaimUpdate = useCallback((payload: any) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    if (eventType !== 'UPDATE') return;
    
    const wasDispatched = oldRecord?.status?.toLowerCase() === 'dispatched';
    const isNowAssigned = newRecord?.status?.toLowerCase() === 'assigned';
    const wasClaimed = !oldRecord?.claimed_by && newRecord?.claimed_by;
    const wasAccepted = !oldRecord?.accepted_by && newRecord?.accepted_by;
    
    if ((wasDispatched && isNowAssigned) || wasClaimed || wasAccepted) {
      const siteName = newRecord?.site_name || 'A site';
      
      toast({
        title: 'Site Claimed',
        description: `${siteName} has been claimed by another enumerator.`,
        variant: 'default',
        duration: 3000
      });
      
      onSiteClaimed?.(newRecord?.id, newRecord?.claimed_by || newRecord?.accepted_by);
      onRefresh?.();
    }
  }, [toast, onSiteClaimed, onRefresh]);

  useEffect(() => {
    if (!enabled) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    const channel = supabase
      .channel('site_claim_updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'mmp_site_entries',
          filter: 'status=eq.Assigned'
        },
        handleClaimUpdate
      )
      .subscribe((status) => {
        console.log('[SiteClaimRealtime] Channel status:', status);
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [enabled, handleClaimUpdate]);

  return {
    isSubscribed: channelRef.current !== null
  };
}

export default useSiteClaimRealtime;
