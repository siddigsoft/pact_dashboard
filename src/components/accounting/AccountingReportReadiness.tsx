import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

interface AccountingReportReadinessProps {
  periodId: string;
  periodStart: string;
  periodEnd: string;
  hasRows: boolean;
}

interface ReadinessCounts {
  postedInPeriod: number;
  postedAnywhere: number;
  draft: number;
  bridgeErrors: number;
}

export function AccountingReportReadiness({
  periodId,
  periodStart,
  periodEnd,
  hasRows,
}: AccountingReportReadinessProps) {
  const [counts, setCounts] = useState<ReadinessCounts | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCounts(null);

    (async () => {
      const [periodResult, postedResult, draftResult, bridgeResult] = await Promise.all([
        supabase
          .from('acct_journal_entries')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'posted')
          .gte('posting_date', periodStart)
          .lte('posting_date', periodEnd),
        supabase
          .from('acct_journal_entries')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'posted'),
        supabase
          .from('acct_journal_entries')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'draft'),
        supabase
          .from('acct_gl_bridge_log' as any)
          .select('id', { count: 'exact', head: true })
          .eq('status', 'error')
          .is('resolved_at', null),
      ]);

      if (cancelled) return;
      setCounts({
        postedInPeriod: periodResult.error ? 0 : periodResult.count ?? 0,
        postedAnywhere: postedResult.error ? 0 : postedResult.count ?? 0,
        draft: draftResult.error ? 0 : draftResult.count ?? 0,
        bridgeErrors: bridgeResult.error ? 0 : bridgeResult.count ?? 0,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [periodId, periodStart, periodEnd]);

  if (hasRows) return null;

  return (
    <div
      className="mt-4 rounded-lg border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/60 dark:bg-amber-950/20"
      data-testid="accounting-report-readiness"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-amber-950 dark:text-amber-200">
            No posted activity in this reporting period
          </h3>
          <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-100/80">
            Reports include posted journal entries only. Payment requests, drafts, and failed
            GL Bridge records do not appear until they are successfully posted.
          </p>

          {counts ? (
            <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
              <div className="rounded-md border border-amber-200/80 bg-white/70 px-3 py-2 dark:border-amber-900/50 dark:bg-slate-900/50">
                <span className="font-semibold">{counts.postedInPeriod}</span> posted entries in this period
              </div>
              <div className="rounded-md border border-amber-200/80 bg-white/70 px-3 py-2 dark:border-amber-900/50 dark:bg-slate-900/50">
                <span className="font-semibold">{counts.postedAnywhere}</span> posted entries overall
              </div>
              <div className="rounded-md border border-amber-200/80 bg-white/70 px-3 py-2 dark:border-amber-900/50 dark:bg-slate-900/50">
                <span className="font-semibold">{counts.draft}</span> draft entries
                {counts.bridgeErrors > 0 && (
                  <span className="ml-1 text-rose-700 dark:text-rose-300">
                    · {counts.bridgeErrors} unresolved Bridge errors
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2 text-xs text-amber-900/70 dark:text-amber-100/70">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking ledger readiness…
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline" className="border-amber-300 bg-white/70 dark:bg-slate-900/60">
              <Link to="/accounting?tab=journals">
                <FileText className="mr-1.5 h-3.5 w-3.5" /> Journal Entries
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="border-amber-300 bg-white/70 dark:bg-slate-900/60">
              <Link to="/accounting?tab=gl-bridge">
                GL Bridge Engine <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}