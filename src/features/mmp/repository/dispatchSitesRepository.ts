import { supabase } from '@/integrations/supabase/client';

export async function fetchCollectorClassificationFeeForDispatch(collectorUserId: string): Promise<{
  level: string | null;
  baseFee: number;
  multiplier: number;
  totalFee: number;
} | null> {
  const { data: classification, error: classError } = await supabase
    .from('user_classifications')
    .select('classification_level, role_scope')
    .eq('user_id', collectorUserId)
    .eq('is_active', true)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (classError) throw classError;
  if (!classification) return null;

  const { data: feeStructure, error: feeError } = await supabase
    .from('classification_fee_structures')
    .select('site_visit_base_fee_cents, complexity_multiplier')
    .eq('classification_level', (classification as any).classification_level)
    .eq('role_scope', (classification as any).role_scope)
    .eq('is_active', true)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (feeError) throw feeError;
  if (!feeStructure) return null;

  const baseFee = Number((feeStructure as any).site_visit_base_fee_cents) || 0;
  const multiplier = Number((feeStructure as any).complexity_multiplier) || 1;
  const totalFee = Math.round(baseFee * multiplier * 100) / 100;

  return {
    level: (classification as any).classification_level ?? null,
    baseFee,
    multiplier,
    totalFee,
  };
}

export async function fetchDispatchCollectorsProfiles(): Promise<any[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, username, email, hub_id, state_id, locality_id, role')
    .order('full_name', { ascending: true });

  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchLastVisitsBySiteCodesForDispatch(siteCodes: string[]): Promise<any[]> {
  if (siteCodes.length === 0) return [];

  const { data, error } = await supabase
    .from('site_visits')
    .select('mmp_site_entry_id, site_code, transport_fee, cost, visit_date, status')
    .in('site_code', siteCodes)
    .in('status', ['completed', 'claimed', 'accepted'])
    .order('visit_date', { ascending: false });

  if (error) throw error;
  return (data || []) as any[];
}

export async function returnSelectedMmpSiteEntriesToFom(siteIds: string[], verificationNotes: string) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('mmp_site_entries')
    .update({
      status: 'returned_to_fom',
      verification_notes: verificationNotes,
      verified_at: now,
    })
    .in('id', siteIds);

  if (error) throw error;
}

export async function fetchPriorAdvancesForDispatch(siteIds: string[]): Promise<any[]> {
  if (siteIds.length === 0) return [];
  const { data, error } = await supabase
    .from('down_payment_requests')
    .select('id, requested_amount, currency, status, mmp_site_entry_id, metadata')
    .in('mmp_site_entry_id', siteIds)
    .in('status', ['approved', 'pending_supervisor', 'pending_admin']);

  if (error) throw error;
  return (data || []) as any[];
}

export function getSupabaseAuthSession() {
  // Keep same return shape as `supabase.auth.getSession()`
  return supabase.auth.getSession();
}

export async function updateMmpSiteEntryTransportFeeAndDispatchAdditionalData(
  siteEntryId: string,
  payload: {
    transport_fee: number;
    additional_data: Record<string, unknown>;
  },
): Promise<{ data: any; error: any }> {
  return supabase
    .from('mmp_site_entries')
    .update(payload)
    .eq('id', siteEntryId);
}

export async function fetchDispatchTeamMembers(params: {
  roles: string[];
  stateIds?: string[];
}): Promise<{ data: any[] | null; error: any }> {
  let q = supabase
    .from('profiles')
    .select('id, full_name, role, state_id, locality_id')
    .in('role', params.roles);

  if (params.stateIds && params.stateIds.length > 0) {
    q = q.in('state_id', params.stateIds);
  }

  return q;
}

export async function fetchProfileBasicByUserId(userId: string): Promise<{ data: any; error: any }> {
  return supabase
    .from('profiles')
    .select('full_name, username, email')
    .eq('id', userId)
    .single();
}

export async function fetchMmpSiteEntryDispatchSnapshot(entryId: string): Promise<{ data: any; error: any }> {
  return supabase
    .from('mmp_site_entries')
    .select('status, additional_data, site_name')
    .eq('id', entryId)
    .single();
}

export async function updateMmpSiteEntryDispatch(entryId: string, updateData: Record<string, unknown>): Promise<{ data: any; error: any }> {
  return supabase.from('mmp_site_entries').update(updateData).eq('id', entryId);
}

