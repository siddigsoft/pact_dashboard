import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAppContext } from '@/context/AppContext';

interface WithdrawalRealtimeOptions {
  onUpdate?: () => void;
  role?: 'user' | 'supervisor' | 'finance';
}

export const useWithdrawalRealtime = (options: WithdrawalRealtimeOptions = {}) => {
  const { toast } = useToast();
  const { currentUser } = useAppContext();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const getStatusMessage = useCallback((oldStatus: string, newStatus: string): { title: string; description: string; variant?: 'default' | 'destructive' } | null => {
    if (oldStatus === 'pending' && newStatus === 'supervisor_approved') {
      return {
        title: 'Request Approved by Supervisor',
        description: 'Your withdrawal request has been forwarded to Finance for processing.',
      };
    }
    if (oldStatus === 'supervisor_approved' && newStatus === 'approved') {
      return {
        title: 'Payment Processed',
        description: 'Your withdrawal has been completed. Funds have been released.',
      };
    }
    if (newStatus === 'rejected') {
      return {
        title: 'Request Rejected',
        description: 'Your withdrawal request was not approved. Check details for more info.',
        variant: 'destructive',
      };
    }
    return null;
  }, []);

  const handleChange = useCallback((payload: any) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    if (eventType === 'UPDATE' && newRecord && oldRecord) {
      const oldStatus = oldRecord.status;
      const newStatus = newRecord.status;

      if (oldStatus !== newStatus) {
        if (options.role === 'user' && newRecord.user_id === currentUser?.id) {
          const message = getStatusMessage(oldStatus, newStatus);
          if (message) {
            toast({
              title: message.title,
              description: message.description,
              variant: message.variant || 'default',
              duration: 5000,
            });
          }
        }

        if (options.role === 'supervisor' && oldStatus !== 'pending' && newStatus === 'pending') {
          toast({
            title: 'Request Returned',
            description: 'A withdrawal request has been returned to pending status.',
            duration: 4000,
          });
          options.onUpdate?.();
        }

        if (options.role === 'finance' && oldStatus === 'pending' && newStatus === 'supervisor_approved') {
          toast({
            title: 'Request Ready for Payment',
            description: 'A supervisor-approved request is ready for processing.',
            duration: 4000,
          });
          options.onUpdate?.();
        }

        if (options.role === 'user') {
          options.onUpdate?.();
        }
      }
    }

    if (eventType === 'INSERT') {
      if (options.role === 'supervisor') {
        toast({
          title: 'New Withdrawal Request',
          description: 'A team member has submitted a withdrawal request.',
          duration: 4000,
        });
        options.onUpdate?.();
      }
    }
  }, [currentUser?.id, options, getStatusMessage, toast]);

  useEffect(() => {
    if (!currentUser?.id) return;

    console.log('[WithdrawalRealtime] Setting up subscription for role:', options.role);

    const channel = supabase
      .channel(`withdrawal_updates_${currentUser.id}_${options.role || 'user'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'withdrawal_requests',
        },
        handleChange
      )
      .subscribe((status) => {
        console.log('[WithdrawalRealtime] Channel status:', status);
      });

    channelRef.current = channel;

    return () => {
      console.log('[WithdrawalRealtime] Cleaning up subscription');
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [currentUser?.id, options.role, handleChange]);

  return null;
};
