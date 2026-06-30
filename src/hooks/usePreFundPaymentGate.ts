import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';

export type PaymentGateStatus = 'loading' | 'allowed' | 'prefund_only' | 'no_access';

export interface AllocatedFundInfo {
  id: string;
  name: string;
  currency: string;
  remaining: number;
  status: string;
}

export interface PreFundPaymentGateResult {
  /** loading → checking; allowed → super admin; prefund_only → has allocation (must use Pre-Funding page); no_access → no allocation and not super admin */
  status: PaymentGateStatus;
  allocatedFunds: AllocatedFundInfo[];
}

/**
 * Pre-fund payment gate:
 *   - allowed      → no active pre-fund allocation (standard submission flow)
 *   - prefund_only → user has an active pre-fund allocation (must use Pre-Funding page)
 *   - no_access    → reserved for future explicit org-level lockdown (not emitted in current logic)
 *
 * The gate should NEVER block standard down-payment/cost requests. It only redirects users
 * who have been explicitly allocated to a pre-fund so their advances are linked to that fund.
 */
export function usePreFundPaymentGate(): PreFundPaymentGateResult {
  const { currentUser } = useAppContext();
  const { isSuperAdmin } = useAuthorization();
  const [status, setStatus] = useState<PaymentGateStatus>('loading');
  const [allocatedFunds, setAllocatedFunds] = useState<AllocatedFundInfo[]>([]);

  useEffect(() => {
    if (!currentUser?.id) return;

    let cancelled = false;

    const check = async () => {
      const { data: allocs, error: allocErr } = await (supabase as any)
        .from('pre_fund_allocations')
        .select('allocated_amount, spent_amount, currency, pre_fund_request_id')
        .eq('user_id', currentUser.id);

      if (cancelled) return;

      // No allocation (or query error) → standard flow, no pre-fund constraints
      if (allocErr || !allocs || (allocs as any[]).length === 0) {
        setStatus('allowed');
        return;
      }

      const fundIds = (allocs as any[]).map((a: any) => a.pre_fund_request_id);

      const { data: funds, error: fundErr } = await (supabase as any)
        .from('pre_fund_requests')
        .select('id, name, status, currency')
        .in('id', fundIds)
        .in('status', ['active', 'low_balance']);

      if (cancelled) return;

      // Allocation rows exist but no active fund → standard flow (fund may be closed/expired)
      if (fundErr || !funds || (funds as any[]).length === 0) {
        setStatus('allowed');
        return;
      }

      const result: AllocatedFundInfo[] = (funds as any[]).map((f: any) => {
        const alloc = (allocs as any[]).find((a: any) => a.pre_fund_request_id === f.id);
        return {
          id: f.id,
          name: f.name,
          currency: f.currency,
          status: f.status,
          remaining: (alloc?.allocated_amount ?? 0) - (alloc?.spent_amount ?? 0),
        };
      });

      // Active pre-fund allocation exists → redirect user to Pre-Funding page
      setStatus('prefund_only');
      setAllocatedFunds(result);
    };

    check();
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  return { status, allocatedFunds };
}
