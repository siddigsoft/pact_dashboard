import { supabase } from '@/integrations/supabase/client';
import { isTerminalCompletionRawStatus } from '@/utils/siteCompletionStatus';

const RECENT_RETRY_WINDOW_MS = 5 * 60 * 1000;

export function isTerminalVisitStatus(status: string | null | undefined): boolean {
  return isTerminalCompletionRawStatus(status);
}

export type UpsertVisitReportResult = {
  report: { id: string; [key: string]: unknown };
  reused: boolean;
};

/** Find a report that should be reused instead of inserting another row. */
export async function findReusableVisitReport(params: {
  siteVisitId: string;
  submittedBy?: string | null;
  siteStatus?: string | null;
}): Promise<{ id: string; submitted_at?: string | null; submitted_by?: string | null } | null> {
  const { data, error } = await (supabase as any)
    .from('reports')
    .select('id, submitted_at, submitted_by')
    .eq('site_visit_id', params.siteVisitId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  if (isTerminalVisitStatus(params.siteStatus)) {
    return data;
  }

  const submittedAt = data.submitted_at ? new Date(data.submitted_at).getTime() : NaN;
  const sameUser = !!params.submittedBy && data.submitted_by === params.submittedBy;
  if (
    sameUser &&
    Number.isFinite(submittedAt) &&
    Date.now() - submittedAt <= RECENT_RETRY_WINDOW_MS
  ) {
    return data;
  }

  return null;
}

/** Client-side fallback when RPC is unavailable. */
async function upsertVisitReportClient(params: {
  siteVisitId: string;
  siteStatus?: string | null;
  reportInsert: Record<string, unknown>;
}): Promise<UpsertVisitReportResult> {
  const reusable = await findReusableVisitReport({
    siteVisitId: params.siteVisitId,
    submittedBy: (params.reportInsert.submitted_by as string | null | undefined) ?? null,
    siteStatus: params.siteStatus,
  });
  if (reusable) {
    return { report: reusable as { id: string }, reused: true };
  }

  const { data, error } = await (supabase as any)
    .from('reports')
    .insert(params.reportInsert)
    .select()
    .single();

  if (error) throw error;
  return { report: data, reused: false };
}

/**
 * Insert a visit report, or reuse an existing one for retries / already-completed sites.
 * Prefers the DB RPC for atomicity; falls back to client-side check+insert.
 */
export async function upsertVisitReport(params: {
  siteVisitId: string;
  siteStatus?: string | null;
  reportInsert: Record<string, unknown>;
}): Promise<UpsertVisitReportResult> {
  try {
    const { data, error } = await (supabase as any).rpc('upsert_visit_report', {
      p_site_visit_id: params.siteVisitId,
      p_report: params.reportInsert,
    });
    if (error) throw error;
    if (data?.id) {
      return {
        report: { id: data.id, site_visit_id: data.site_visit_id ?? params.siteVisitId },
        reused: !!data.reused,
      };
    }
  } catch (rpcError) {
    console.warn('[visitReport] RPC upsert failed, using client fallback:', rpcError);
  }

  return upsertVisitReportClient(params);
}
