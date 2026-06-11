import { supabase } from '@/integrations/supabase/client';
import { mmpCostSubmissionOrFilter } from '@/utils/cycleCloseGates';

export interface CycleCloseRecord {
  id: string;
  scope: string;
  scopeValue: string;
  closedAt: string;
  closedBy: string;
  closedByName: string;
  siteCount: number;
  status: 'closing' | 'pending_approval' | 'closed';
}

export interface ClosedCycleFinancialSnapshot {
  enumeratorFees: number;
  transportFees: number;
  opCosts: number;
  advancesRecovered: number;
  currency: string;
  payableSiteCount: number;
}

interface MmpSnapshot {
  id: string;
  name?: string | null;
  hub?: string | null;
  region?: string | null;
  month?: string | number | null;
  cycle_close_records?: CycleCloseRecord[];
}

interface ApproveCloseParams {
  mmpId: string;
  mmp: MmpSnapshot | undefined;
  userId: string;
  userName?: string;
  skipFinanceCheck?: boolean;
  overrideJustification?: string | null;
}

const PAYABLE_STATUSES = ['wfp_confirmed', 'verified', 'completed', 'approved'];

export async function buildApproveCloseRecords(
  mmpId: string,
  mmp: MmpSnapshot | undefined,
  userId: string,
  userName?: string,
): Promise<{ finalRecords: object[]; financialSnapshot: ClosedCycleFinancialSnapshot | null }> {
  const existingRecords: CycleCloseRecord[] = (mmp?.cycle_close_records as CycleCloseRecord[]) || [];
  const updatedRecords = existingRecords.map((r) => ({ ...r, status: 'closed' as const }));

  let financialSnapshot: ClosedCycleFinancialSnapshot | null = null;

  try {
    const [siteRes, opRes] = await Promise.all([
      supabase
        .from('mmp_site_entries')
        .select('id, enumerator_fee, transport_fee, status')
        .eq('mmp_file_id', mmpId),
      supabase
        .from('operational_cost_submissions')
        .select('amount_cents, currency')
        .or(mmpCostSubmissionOrFilter(mmpId))
        .eq('status', 'approved'),
    ]);

    const payable = (siteRes.data || []).filter((e: { status: string }) =>
      PAYABLE_STATUSES.includes(e.status),
    );
    const enumeratorFees = payable.reduce(
      (s: number, e: { enumerator_fee?: number }) => s + (e.enumerator_fee ?? 0),
      0,
    );
    const transportFees = payable.reduce(
      (s: number, e: { transport_fee?: number }) => s + (e.transport_fee ?? 0),
      0,
    );
    const opCosts = (opRes.data || []).reduce(
      (s: number, c: { amount_cents?: number }) => s + ((c.amount_cents ?? 0) / 100),
      0,
    );
    const currency = (opRes.data?.[0] as { currency?: string } | undefined)?.currency || 'SDG';

    const siteIds = (siteRes.data || []).map((e: { id: string }) => e.id).filter(Boolean);
    let advancesRecovered = 0;
    if (siteIds.length > 0) {
      const { data: advData } = await supabase
        .from('down_payment_requests')
        .select('remaining_amount, requested_amount, total_paid_amount')
        .in('mmp_site_entry_id', siteIds)
        .in('status', ['partially_paid', 'approved', 'pending_payment']);
      advancesRecovered = (advData || []).reduce(
        (s: number, a: { remaining_amount?: number; requested_amount?: number; total_paid_amount?: number }) => {
          const rem =
            a.remaining_amount ?? Math.max(0, (a.requested_amount ?? 0) - (a.total_paid_amount ?? 0));
          return s + Math.max(0, rem);
        },
        0,
      );
    }

    financialSnapshot = {
      enumeratorFees,
      transportFees,
      opCosts,
      advancesRecovered,
      currency,
      payableSiteCount: payable.length,
    };
  } catch (err) {
    console.warn('Could not build financial snapshot at close time', err);
  }

  const now = new Date().toISOString();
  const snapshotRecord = {
    id: `snapshot-${now}`,
    scope: 'full',
    status: 'closed' as const,
    closedAt: now,
    closedBy: userId,
    closedByName: userName,
    hubOrRegion: mmp?.hub || mmp?.region || null,
    month: mmp?.month ?? null,
    name: mmp?.name ?? null,
    financialSnapshot,
  };

  return {
    finalRecords: [...updatedRecords, snapshotRecord],
    financialSnapshot,
  };
}

export async function approveCycleClose(params: ApproveCloseParams): Promise<{ error: Error | null }> {
  const { mmpId, mmp, userId, userName, skipFinanceCheck, overrideJustification } = params;

  const { finalRecords } = await buildApproveCloseRecords(mmpId, mmp, userId, userName);

  const { error } = await supabase.rpc('cycle_approve_close', {
    p_mmp_id: mmpId,
    p_close_records: JSON.parse(JSON.stringify(finalRecords)),
    p_super_admin_override: Boolean(skipFinanceCheck && overrideJustification),
    p_override_justification: overrideJustification || null,
  });

  return { error: error ? new Error(error.message) : null };
}
