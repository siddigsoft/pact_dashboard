import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getYear } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/lib/queryKeys';

export type LeaveRequestRow = {
  id: string;
  user_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  created_at: string;
  user_name?: string;
  reviewer_name?: string;
};

export type LeaveEntitlement = {
  annual_days: number;
  sick_days: number;
  emergency_days: number;
  maternity_days: number;
  paternity_days: number;
  unpaid_days: number;
};

export const DEFAULT_LEAVE_ENTITLEMENT: LeaveEntitlement = {
  annual_days: 21,
  sick_days: 14,
  emergency_days: 5,
  maternity_days: 90,
  paternity_days: 5,
  unpaid_days: 30,
};

const LEAVE_COLUMNS =
  'id, user_id, leave_type, start_date, end_date, days_count, reason, status, reviewed_by, reviewed_at, reviewer_notes, created_at';

/** Cap admin list so remounts do not dump the entire history. */
const ADMIN_LEAVE_LIMIT = 500;

export type LeaveRequestsBundle = {
  requests: LeaveRequestRow[];
  glLogBySourceId: Record<string, string>;
};

export async function fetchLeaveRequestsBundle(
  userId: string,
  isAdmin: boolean
): Promise<LeaveRequestsBundle> {
  let query = supabase
    .from('leave_requests')
    .select(LEAVE_COLUMNS)
    .order('created_at', { ascending: false });

  if (isAdmin) {
    query = query.limit(ADMIN_LEAVE_LIMIT);
  } else {
    query = query.eq('user_id', userId);
  }

  const { data: reqs, error } = await query;
  if (error) throw error;

  const rows = reqs || [];
  const userIds = [
    ...new Set(
      rows
        .map((r: any) => r.user_id)
        .concat(rows.map((r: any) => r.reviewed_by).filter(Boolean))
    ),
  ];

  let profileMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds);
    (profiles || []).forEach((p: any) => {
      profileMap[p.id] = p.full_name;
    });
  }

  const requests: LeaveRequestRow[] = rows.map((r: any) => ({
    ...r,
    user_name: profileMap[r.user_id] || 'Unknown',
    reviewer_name: r.reviewed_by ? profileMap[r.reviewed_by] || null : null,
  }));

  const glLogBySourceId: Record<string, string> = {};
  if (isAdmin && requests.length > 0) {
    const approvedIds = requests.filter((r) => r.status === 'approved').map((r) => r.id);
    if (approvedIds.length > 0) {
      const { data: logData } = await supabase
        .from('acct_gl_bridge_log' as any)
        .select('source_id, status')
        .eq('source_table', 'leave_requests')
        .in('source_id', approvedIds)
        .order('created_at', { ascending: false });
      for (const row of (logData ?? []) as { source_id: string; status: string }[]) {
        if (!glLogBySourceId[row.source_id]) glLogBySourceId[row.source_id] = row.status;
      }
    }
  }

  return { requests, glLogBySourceId };
}

export async function fetchLeaveEntitlement(
  userId: string,
  year = getYear(new Date())
): Promise<LeaveEntitlement> {
  const { data } = await supabase
    .from('leave_entitlements')
    .select(
      'annual_days, sick_days, emergency_days, maternity_days, paternity_days, unpaid_days'
    )
    .eq('user_id', userId)
    .eq('year', year)
    .maybeSingle();

  return data ? (data as LeaveEntitlement) : DEFAULT_LEAVE_ENTITLEMENT;
}

export function useLeaveRequestsQuery(
  userId: string | undefined,
  isAdmin: boolean,
  enabled = true
) {
  return useQuery({
    queryKey: queryKeys.hr.leaveRequests({ userId: userId ?? null, isAdmin }),
    queryFn: () => fetchLeaveRequestsBundle(userId!, isAdmin),
    enabled: enabled && !!userId,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useLeaveEntitlementQuery(userId: string | undefined, enabled = true) {
  const year = getYear(new Date());
  return useQuery({
    queryKey: queryKeys.hr.leaveEntitlement(userId ?? '', year),
    queryFn: () => fetchLeaveEntitlement(userId!, year),
    enabled: enabled && !!userId,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev ?? DEFAULT_LEAVE_ENTITLEMENT,
  });
}

export function useInvalidateLeaveQueries() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.hr.all });
}
