/**
 * RolledAllocationsPanel — Phase D
 * Shows money pre-allocated into THIS MMP from roll-over decisions in a previous MMP.
 *
 * Display locations:
 *   1. Down-Payment Approval page (target MMP selected) — finance/admin view
 *   2. MMPCycleClose Finance tab — summary for the cycle
 *
 * Fetches from rolled_advance_allocations WHERE target_mmp_id = mmpId AND status = 'pending'.
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ArrowRightLeft, Loader2, RefreshCw, User, MapPin, Info, CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface RolledRow {
  id: string;
  source_mmp_name: string | null;
  source_site_name: string | null;
  source_site_code: string | null;
  target_site_name: string | null;
  target_site_auto_inserted: boolean;
  amount: number;
  amount_currency: string;
  enumerator_name: string | null;
  allocated_by_name: string | null;
  allocated_at: string;
  status: string;
  note: string | null;
}

interface RolledAllocationsPanelProps {
  mmpId: string | null;
  mmpName?: string | null;
  compact?: boolean;
}

export function RolledAllocationsPanel({ mmpId, mmpName, compact = false }: RolledAllocationsPanelProps) {
  const [rows, setRows] = useState<RolledRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!mmpId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('rolled_advance_allocations')
        .select(
          'id, source_mmp_name, source_site_name, source_site_code, target_site_name, target_site_auto_inserted, amount, amount_currency, enumerator_name, allocated_by_name, allocated_at, status, note',
        )
        .eq('target_mmp_id', mmpId)
        .eq('status', 'pending')
        .order('allocated_at', { ascending: false });

      if (error) {
        // Table not yet created — silently hide panel
        if (error.code === '42P01') { setRows([]); return; }
        console.warn('[RolledAllocationsPanel]', error.message);
        return;
      }

      setRows((data || []) as RolledRow[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [mmpId]);

  // Don't render anything until we know there's data (or an explicit MMP chosen)
  if (!mmpId) return null;
  if (!loading && rows.length === 0) return null;

  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
  const currency = rows[0]?.amount_currency || 'SDG';
  const autoInserted = rows.filter(r => r.target_site_auto_inserted);

  return (
    <Card className="border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-violet-700 dark:text-violet-300">
            <ArrowRightLeft className="h-4 w-4" />
            Pre-Allocated from Rolled Advances
            <span dir="rtl" className="text-xs font-normal text-muted-foreground">مبالغ مُرحَّلة</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge
              className="text-xs font-mono bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200 border-violet-300 dark:border-violet-700"
              variant="outline"
              data-testid="badge-pre-allocated-total"
            >
              {totalAmount.toLocaleString()} {currency} total
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={load}
              disabled={loading}
              data-testid="button-refresh-rolled"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading pre-allocations…
          </div>
        )}

        {!loading && autoInserted.length > 0 && (
          <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
            <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertDescription className="text-xs text-amber-700 dark:text-amber-300">
              {autoInserted.length} site{autoInserted.length > 1 ? 's were' : ' was'} not found in{' '}
              {mmpName || 'this MMP'} and{' '}
              {autoInserted.length > 1 ? 'were' : 'was'} auto-added as a placeholder. Please verify
              the site assignment before the cycle begins.
            </AlertDescription>
          </Alert>
        )}

        {!loading && rows.map(row => (
          <div
            key={row.id}
            className="rounded-md border border-violet-200 dark:border-violet-800 bg-white dark:bg-card p-3 space-y-2"
            data-testid={`rolled-allocation-${row.id}`}
          >
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="space-y-0.5 min-w-0">
                {/* Source MMP link */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                  <ArrowRightLeft className="h-3 w-3 shrink-0 text-violet-500" />
                  <span>From:</span>
                  <span className="font-medium text-foreground">{row.source_mmp_name || '—'}</span>
                  {row.source_site_name && (
                    <>
                      <span className="text-muted-foreground/50">·</span>
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span>{row.source_site_name}</span>
                      {row.source_site_code && (
                        <span className="text-muted-foreground/60">({row.source_site_code})</span>
                      )}
                    </>
                  )}
                </div>

                {/* Target site */}
                {row.target_site_name && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span>Site in this MMP:</span>
                    <span className="font-medium text-foreground">{row.target_site_name}</span>
                    {row.target_site_auto_inserted && (
                      <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 dark:text-amber-300 py-0 h-4">
                        Auto-added
                      </Badge>
                    )}
                  </div>
                )}

                {/* Enumerator */}
                {row.enumerator_name && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <User className="h-3 w-3 shrink-0" />
                    <span>{row.enumerator_name}</span>
                  </div>
                )}

                {/* Note */}
                {row.note && (
                  <p className="text-xs text-foreground/60 italic mt-1">{row.note}</p>
                )}
              </div>

              <div className="text-right shrink-0 space-y-1">
                <Badge
                  variant="outline"
                  className="text-xs font-mono bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200 border-violet-300 dark:border-violet-700"
                  data-testid={`badge-amount-${row.id}`}
                >
                  {row.amount.toLocaleString()} {row.amount_currency}
                </Badge>
                <Badge
                  variant="outline"
                  className="text-xs flex items-center gap-1 text-green-700 dark:text-green-300 border-green-400 bg-green-50 dark:bg-green-950/30"
                  data-testid={`badge-pre-approved-${row.id}`}
                >
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  Pre-Approved
                </Badge>
                <p className="text-xs text-muted-foreground">
                  {new Date(row.allocated_at).toLocaleDateString()}
                </p>
                {row.allocated_by_name && (
                  <p className="text-xs text-muted-foreground">by {row.allocated_by_name}</p>
                )}
              </div>
            </div>
          </div>
        ))}

        {!compact && rows.length > 0 && (
          <p className="text-xs text-muted-foreground text-center pt-1">
            These amounts are already approved — no new advance request is needed for these sites.
            <span dir="rtl" className="block mt-0.5">هذه المبالغ معتمدة مسبقاً — لا حاجة لطلب سلفة جديد لهذه المواقع.</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
