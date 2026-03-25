import { supabase } from '@/integrations/supabase/client';

export async function fetchDbHubsForStaffDirectory(): Promise<any[]> {
  const { data, error } = await supabase
    .from('hubs')
    .select('id, name')
    .order('name');
  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchProfilesForStaffDirectory(): Promise<any[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, full_name, email, phone, role, employee_id, hub_id, state_id, locality_id, availability, status, location, location_sharing, updated_at, created_at, bank_account, last_activity, device_info, app_version',
    )
    .order('full_name');

  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchLatestUserActivityLogs(limit: number = 500): Promise<any[]> {
  const { data, error } = await supabase
    .from('user_activity_logs')
    .select('user_id, created_at, metadata, device_info')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as any[];
}

export function subscribeStaffDirectoryPresenceRealtime(
  onProfilesUpdate: (payload: any) => void,
): () => void {
  const ch = supabase
    .channel('staff-directory-presence')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
      },
      (payload: any) => {
        onProfilesUpdate(payload);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(ch);
  };
}

export async function fetchStaffFinanceMonthRows(params: {
  thisStartIso: string;
  prevStartIso: string;
  prevEndIso: string;
}): Promise<{
  dpCur: any[];
  dpPrv: any[];
  ocCur: any[];
  ocPrv: any[];
  wtCur: any[];
  wtPrv: any[];
  awaitingAckCount: number;
}> {
  const { thisStartIso, prevStartIso, prevEndIso } = params;

  const [
    dpCurRes,
    dpPrvRes,
    ocCurRes,
    ocPrvRes,
    wtCurRes,
    wtPrvRes,
    ackRes,
  ] = await Promise.all([
    supabase
      .from('down_payment_requests')
      .select('requested_amount,status')
      .gte('created_at', thisStartIso),
    supabase
      .from('down_payment_requests')
      .select('requested_amount,status')
      .gte('created_at', prevStartIso)
      .lte('created_at', prevEndIso),
    supabase
      .from('operational_cost_submissions')
      .select('amount_cents,tier2_status')
      .gte('created_at', thisStartIso),
    supabase
      .from('operational_cost_submissions')
      .select('amount_cents,tier2_status')
      .gte('created_at', prevStartIso)
      .lte('created_at', prevEndIso),
    supabase
      .from('wallet_transactions')
      .select('amount,type,transaction_type')
      .gte('created_at', thisStartIso)
      .or('type.eq.withdrawal,type.eq.debit,transaction_type.eq.withdrawal'),
    supabase
      .from('wallet_transactions')
      .select('amount,type,transaction_type')
      .gte('created_at', prevStartIso)
      .lte('created_at', prevEndIso)
      .or('type.eq.withdrawal,type.eq.debit,transaction_type.eq.withdrawal'),
    supabase
      .from('withdrawal_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved')
      .neq('fund_receipt_confirmed', true),
  ]);

  if (dpCurRes.error) throw dpCurRes.error;
  if (dpPrvRes.error) throw dpPrvRes.error;
  if (ocCurRes.error) throw ocCurRes.error;
  if (ocPrvRes.error) throw ocPrvRes.error;
  if (wtCurRes.error) throw wtCurRes.error;
  if (wtPrvRes.error) throw wtPrvRes.error;
  if (ackRes.error) throw ackRes.error;

  return {
    dpCur: (dpCurRes.data || []) as any[],
    dpPrv: (dpPrvRes.data || []) as any[],
    ocCur: (ocCurRes.data || []) as any[],
    ocPrv: (ocPrvRes.data || []) as any[],
    wtCur: (wtCurRes.data || []) as any[],
    wtPrv: (wtPrvRes.data || []) as any[],
    awaitingAckCount: ackRes.count ?? 0,
  };
}

export async function fetchStaffFinanceDetailsForProfile(profileId: string): Promise<{
  advanceRows: any[];
  costRows: any[];
  withdrawalRows: any[];
  mmpSiteEntriesRows: any[];
  mmpFilesRows: any[];
}> {
  const [dpRes, ocRes, wrRes, mseRes] = await Promise.all([
    supabase
      .from('down_payment_requests')
      .select('id,status,requested_amount,requested_at,justification,hub_name,site_name')
      .eq('requested_by', profileId)
      .order('requested_at', { ascending: false })
      .limit(100),
    supabase
      .from('operational_cost_submissions')
      .select('id,tier1_status,tier2_status,amount_cents,expense_category,description,submitted_at,created_at')
      .eq('submitted_by', profileId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('withdrawal_requests')
      .select(
        'id,status,amount,currency,request_reason,fund_receipt_confirmed,fund_receipt_confirmed_at,fund_receipt_notes,admin_processed_at,created_at',
      )
      .eq('user_id', profileId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('mmp_site_entries')
      .select('id,mmp_file_id,cost,enumerator_fee,transport_fee,status,site_name,state,main_activity')
      .or(
        `claimed_by.eq.${profileId},completed_by_user_id.eq.${profileId},forwarded_to_user_id.eq.${profileId}`,
      )
      .limit(500),
  ]);

  if (dpRes.error) console.error('[StaffDirectory] down_payment_requests error:', dpRes.error);
  if (ocRes.error) console.error('[StaffDirectory] operational_cost_submissions error:', ocRes.error);
  if (wrRes.error) console.error('[StaffDirectory] withdrawal_requests error:', wrRes.error);
  if (mseRes.error) console.error('[StaffDirectory] mmp_site_entries error:', mseRes.error);

  const advanceRows = (dpRes.data || []) as any[];
  const costRows = (ocRes.data || []) as any[];
  const withdrawalRows = (wrRes.data || []) as any[];
  const mmpSiteEntriesRows = (mseRes.data || []) as any[];

  const mmpFileIds = [
    ...new Set(mmpSiteEntriesRows.map((e: any) => e.mmp_file_id).filter(Boolean)),
  ];

  let mmpFilesRows: any[] = [];
  if (mmpFileIds.length > 0) {
    const { data: mmpFilesData, error: mmpFilesErr } = await supabase
      .from('mmp_files')
      .select('id,name,mmp_id,month,status')
      .in('id', mmpFileIds);
    if (mmpFilesErr) console.error('[StaffDirectory] mmp_files error:', mmpFilesErr);
    mmpFilesRows = (mmpFilesData || []) as any[];
  }

  return { advanceRows, costRows, withdrawalRows, mmpSiteEntriesRows, mmpFilesRows };
}

