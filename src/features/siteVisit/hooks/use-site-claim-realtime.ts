import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/shared/hooks/use-toast';

interface UseSiteClaimRealtimeOptions {
  onSiteClaimed?: (siteId: string, claimedBy: string) => void;
  onRefresh?: () => void;
  enabled?: boolean;
  channelName?: string;
  currentUserId?: string;
  suppressToast?: boolean;
}

export function useSiteClaimRealtime({
  onSiteClaimed,
  onRefresh,
  enabled = true,
  channelName = 'site_claim_updates',
  currentUserId,
  suppressToast = false
}: UseSiteClaimRealtimeOptions = {}) {
  const { toast } = useToast();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const handleClaimUpdate = useCallback((payload: any) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    if (eventType !== 'UPDATE') return;
    
    const wasDispatched = oldRecord?.status?.toLowerCase() === 'dispatched';
    const isNowAssigned = newRecord?.status?.toLowerCase() === 'assigned';
    const wasAccepted = !oldRecord?.accepted_by && newRecord?.accepted_by;
    const claimedByUserId = newRecord?.accepted_by;
    
    if ((wasDispatched && isNowAssigned) || wasAccepted) {
      const isOwnClaim = currentUserId && claimedByUserId === currentUserId;
      
      if (!suppressToast && !isOwnClaim) {
        const siteName = newRecord?.site_name || 'A site';
        toast({
          title: 'Site Claimed',
          description: `${siteName} has been claimed by another enumerator.`,
          variant: 'default',
          duration: 3000
        });
      }
      
      onSiteClaimed?.(newRecord?.id, claimedByUserId);
      onRefresh?.();
    }
  }, [toast, onSiteClaimed, onRefresh, currentUserId, suppressToast]);

  useEffect(() => {
    if (!enabled) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    const channel = supabase
      .channel(channelName)
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
  }, [enabled, handleClaimUpdate, channelName]);

  return {
    isSubscribed: channelRef.current !== null
  };
}

export default useSiteClaimRealtime;
