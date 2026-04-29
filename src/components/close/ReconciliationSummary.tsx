import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ClipboardCheck, AlertTriangle, CheckCircle, ExternalLink } from 'lucide-react';

interface ReconciliationSummaryProps {
  projectId?: string;
  mmpId?: string;
  mmpContextLabel?: string;
  className?: string;
}

interface SummaryData {
  pendingCosts: number;
  clearedCosts: number;
  totalCosts: number;
  scopeLabel: string;
}

export function ReconciliationSummary({
  projectId,
  mmpId,
  mmpContextLabel,
  className = '',
}: ReconciliationSummaryProps) {
  const navigate = useNavigate();
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from('operational_cost_submissions')
          .select('id, tier1_status, tier2_status, expense_date');

        let resolvedScopeLabel = '(all pending)';

        if (projectId) {
          query = query.eq('project_id', projectId);
          resolvedScopeLabel = '(this project)';
        } else if (mmpId) {
          const mmpRes = await supabase
            .from('mmp_files')
            .select('month, year, name')
            .eq('id', mmpId)
            .single();
          const mmpRow = mmpRes.data as { month: number | null; year: number | null; name: string | null } | null;
          const month = mmpRow?.month ?? null;
          const year = mmpRow?.year ?? null;

          if (year !== null && month !== null) {
            const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            query = query.gte('expense_date', startDate).lte('expense_date', endDate);
            resolvedScopeLabel = mmpContextLabel
              ? `(${mmpContextLabel} — ${new Date(year, month - 1).toLocaleString('default', { month: 'short', year: 'numeric' })})`
              : `(cycle: ${new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })})`;
          } else {
            resolvedScopeLabel = mmpContextLabel ? `(cycle: ${mmpContextLabel})` : '(this cycle)';
          }
        }

        const { data: costData } = await query;

        const costSubs = costData || [];
        const pendingCosts = costSubs.filter(
          s => s.tier1_status === 'pending' || s.tier2_status === 'pending',
        ).length;
        const clearedCosts = costSubs.filter(s => {
          const t1Done = s.tier1_status === 'approved' || s.tier1_status === 'rejected';
          const t2Done =
            s.tier2_status === 'approved' ||
            s.tier2_status === 'rejected' ||
            s.tier2_status === null;
          return t1Done && t2Done;
        }).length;

        setData({
          pendingCosts,
          clearedCosts,
          totalCosts: costSubs.length,
          scopeLabel: resolvedScopeLabel,
        });
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    fetchSummary();
  }, [projectId, mmpId, mmpContextLabel]);

  const hasIssues = data !== null && data.pendingCosts > 0;

  return (
    <Card
      className={`border ${hasIssues ? 'border-amber-500/40' : 'border-green-500/30'} ${className}`}
      data-testid="card-reconciliation-summary"
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          Finance Reconciliation Review
          {data && (
            <span className="text-xs font-normal text-muted-foreground ml-1">{data.scopeLabel}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">Unable to load reconciliation data.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md bg-muted p-2 text-center">
                <p className="text-lg font-bold" data-testid="recon-total-count">
                  {data.totalCosts}
                </p>
                <p className="text-[11px] text-muted-foreground">Total</p>
              </div>
              <div
                className={`rounded-md p-2 text-center ${data.pendingCosts > 0 ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-muted'}`}
              >
                <p
                  className={`text-lg font-bold ${data.pendingCosts > 0 ? 'text-amber-700 dark:text-amber-400' : ''}`}
                  data-testid="recon-pending-count"
                >
                  {data.pendingCosts}
                </p>
                <p className="text-[11px] text-muted-foreground">Pending</p>
              </div>
              <div className="rounded-md bg-green-50 dark:bg-green-950/40 p-2 text-center">
                <p
                  className="text-lg font-bold text-green-600 dark:text-green-400"
                  data-testid="recon-cleared-count"
                >
                  {data.clearedCosts}
                </p>
                <p className="text-[11px] text-muted-foreground">Cleared</p>
              </div>
            </div>

            {hasIssues ? (
              <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md p-2 border border-amber-500/20">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  {data.pendingCosts} cost submission
                  {data.pendingCosts !== 1 ? 's' : ''} pending approval. Resolve before closing.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
                <CheckCircle className="h-3.5 w-3.5" />
                No pending finance approvals.
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="text-xs w-full"
              onClick={() => navigate('/finance')}
              data-testid="button-open-reconciliation"
            >
              <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />
              Review & Approve Cost Submissions
              <ExternalLink className="h-3 w-3 ml-1.5" />
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
