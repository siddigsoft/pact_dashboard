import { supabase } from '@/integrations/supabase/client';

export interface CallLog {
  id: string;
  caller_id: string;
  callee_id: string;
  direction: 'outgoing' | 'incoming';
  status: 'completed' | 'missed' | 'rejected' | 'no_answer';
  duration: number;
  started_at: string;
  ended_at: string | null;
  call_type: 'audio' | 'video';
  created_at: string;
}

export class CallLogService {
  static async logCall(params: {
    callerId: string;
    calleeId: string;
    direction: 'outgoing' | 'incoming';
    status: 'completed' | 'missed' | 'rejected' | 'no_answer';
    duration?: number;
    startedAt?: string;
    callType?: 'audio' | 'video';
  }): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('call_logs')
        .insert({
          caller_id: params.callerId,
          callee_id: params.calleeId,
          direction: params.direction,
          status: params.status,
          duration: params.duration || 0,
          started_at: params.startedAt || new Date().toISOString(),
          ended_at: params.duration ? new Date().toISOString() : null,
          call_type: params.callType || 'audio',
        })
        .select('id')
        .single();

      if (error) {
        console.error('[CallLog] Failed to log call:', error);
        return null;
      }
      return data?.id || null;
    } catch (err) {
      console.error('[CallLog] Error logging call:', err);
      return null;
    }
  }

  static async updateCallLog(id: string, updates: {
    status?: 'completed' | 'missed' | 'rejected' | 'no_answer';
    duration?: number;
    ended_at?: string;
  }): Promise<void> {
    try {
      const { error } = await supabase
        .from('call_logs')
        .update(updates)
        .eq('id', id);

      if (error) {
        console.error('[CallLog] Failed to update call log:', error);
      }
    } catch (err) {
      console.error('[CallLog] Error updating call log:', err);
    }
  }

  static async getCallHistory(userId: string, limit: number = 50): Promise<CallLog[]> {
    try {
      const { data, error } = await supabase
        .from('call_logs')
        .select('*')
        .or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
        .order('started_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[CallLog] Failed to get call history:', error);
        return [];
      }
      return (data || []) as CallLog[];
    } catch (err) {
      console.error('[CallLog] Error getting call history:', err);
      return [];
    }
  }
}
