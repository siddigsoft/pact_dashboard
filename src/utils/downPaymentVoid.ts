import { supabase } from '@/integrations/supabase/client';

type VoidAdvanceResponse = {
  ok?: boolean;
  error?: string;
};

/**
 * A deleted down-payment request must have no payment, wallet, pre-fund, or
 * Cycle Close trail. The database performs every validation and the state
 * transition atomically so a browser-side delete cannot leave the request
 * visible in finance or Cycle Close.
 */
export async function voidUnpaidDownPaymentRequest(requestId: string): Promise<void> {
  const { data, error } = await supabase.rpc('void_unpaid_down_payment_request', {
    p_request_id: requestId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const response = (data ?? {}) as VoidAdvanceResponse;
  if (!response.ok) {
    throw new Error(response.error ?? 'The down-payment request could not be deleted.');
  }
}

export function isSoftDeletedDownPayment(record: { metadata?: unknown } | null | undefined): boolean {
  const metadata = record?.metadata;
  return !!metadata
    && typeof metadata === 'object'
    && !Array.isArray(metadata)
    && (metadata as Record<string, unknown>).deleted === true;
}