/**
 * MoneyTrailPanel — Phase B
 * Displays the full chronological money trail for a site entry or an entire MMP.
 *
 * Mode "site"  → fetches events for one site_entry_id (enumerator view)
 * Mode "mmp"   → fetches all events for the MMP (admin / finance view)
 *
 * Color coding matches the event type. Arabic labels shown where available.
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DollarSign, RotateCcw, AlertTriangle, Trash2, CheckCircle2,
  Clock, ArrowDown, ArrowUp, Loader2, RefreshCw, Info, ArrowRightLeft, Download,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  fetchPaymentTrail, fetchMmpPaymentTrail,
  paymentEventLabel, PaymentEventType,
} from '@/services/paymentEventLogger';

interface MoneyTrailPanelProps {
  mode: 'site' | 'mmp';
  siteEntryId?: string | null;
  mmpId?: string | null;
  title?: string;
  maxRows?: number;
}

interface TrailRow {
  id: string;
  event_type: string;
  amount: number | null;
  amount_currency: string | null;
  payment_ref_id: string | null;
  performed_by_name: string | null;
  performed_by_role: string | null;
  enumerator_id: string | null;
  note: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  site_entry_id?: string | null;
}

const EVENT_CONFIG: Record<string, { icon: React.ReactNode; color: string; bgColor: string }> = {
  site_confirmed:               { icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-green-600 dark:text-green-400',   bgColor: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' },
  site_rejected:                { icon: <AlertTriangle className="h-4 w-4" />, color: 'text-red-600 dark:text-red-400',     bgColor: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' },
  advance_approved:             { icon: <ArrowDown className="h-4 w-4" />,    color: 'text-blue-600 dark:text-blue-400',    bgColor: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' },
  advance_paid:                 { icon: <ArrowDown className="h-4 w-4" />,    color: 'text-blue-600 dark:text-blue-400',    bgColor: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' },
  advance_reconciled:           { icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-teal-600 dark:text-teal-400',   bgColor: 'bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800' },
  advance_deducted_from_fee:    { icon: <ArrowUp className="h-4 w-4" />,      color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800' },
  recovery_decision_rolled:     { icon: <RotateCcw className="h-4 w-4" />,        color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800' },
  payment_pre_allocated:        { icon: <ArrowRightLeft className="h-4 w-4" />,  color: 'text-violet-600 dark:text-violet-400', bgColor: 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800' },
  recovery_decision_return_required: { icon: <AlertTriangle className="h-4 w-4" />, color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' },
  recovery_decision_writeoff:   { icon: <Trash2 className="h-4 w-4" />,       color: 'text-red-600 dark:text-red-400',     bgColor: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' },
  repayment_received:           { icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' },
  repayment_overdue:            { icon: <Clock className="h-4 w-4" />,        color: 'text-red-600 dark:text-red-400',     bgColor: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' },
  settlement_requested:         { icon: <DollarSign className="h-4 w-4" />,   color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800' },
  settlement_disbursed:         { icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' },
  overpayment_detected:         { icon: <AlertTriangle className="h-4 w-4" />, color: 'text-red-600 dark:text-red-400',    bgColor: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' },
  fee_locked:                   { icon: <Info className="h-4 w-4" />,          color: 'text-slate-600 dark:text-slate-400', bgColor: 'bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-700' },
  fee_adjusted:                 { icon: <Info className="h-4 w-4" />,          color: 'text-slate-600 dark:text-slate-400', bgColor: 'bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-700' },
};

const DEFAULT_CONFIG = {
  icon: <DollarSign className="h-4 w-4" />,
  color: 'text-muted-foreground',
  bgColor: 'bg-muted/40 border-border',
};

function getConfig(eventType: string) {
  return EVENT_CONFIG[eventType] ?? DEFAULT_CONFIG;
}

export function MoneyTrailPanel({
  mode, siteEntryId, mmpId, title, maxRows,
}: MoneyTrailPanelProps) {
  const [rows, setRows] = useState<TrailRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      if (mode === 'site' && siteEntryId) {
        const data = await fetchPaymentTrail(siteEntryId);
        setRows(data as TrailRow[]);
      } else if (mode === 'mmp' && mmpId) {
        const data = await fetchMmpPaymentTrail(mmpId);
        setRows(data as TrailRow[]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (rows.length === 0) return;

    const sheetData = rows.map(r => {
      const label = paymentEventLabel(r.event_type as PaymentEventType);
      const ts = new Date(r.created_at);
      const meta = r.metadata
        ? Object.entries(r.metadata)
            .map(([k, v]) => `${k}: ${v}`)
            .join(' | ')
        : '';
      return {
        'Date':           ts.toLocaleDateString(),
        'Time':           ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        'Event (EN)':     label.en,
        'Event (AR)':     label.ar,
        'Amount':         r.amount ?? '',
        'Currency':       r.amount_currency || 'SDG',
        'Performed By':   r.performed_by_name || '',
        'Role':           r.performed_by_role || '',
        'Note':           r.note || '',
        'Metadata':       meta,
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetData);
    ws['!cols'] = [
      { wch: 12 }, { wch: 8 }, { wch: 30 }, { wch: 32 },
      { wch: 12 }, { wch: 8 }, { wch: 22 }, { wch: 16 }, { wch: 30 }, { wch: 40 },
    ];

    const sheetName = mode === 'site' ? 'Site Trail' : 'MMP Trail';
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const id = mode === 'site' ? (siteEntryId || 'site') : (mmpId || 'mmp');
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `money-trail-${id.slice(0, 8)}-${dateStr}.xlsx`);
  };

  useEffect(() => {
    load();
  }, [mode, siteEntryId, mmpId]);

  const displayRows = maxRows && !showAll ? rows.slice(0, maxRows) : rows;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            {title || (mode === 'site' ? 'Money Timeline' : 'Money Trail')}
            <span dir="rtl" className="text-xs text-muted-foreground font-normal">
              {mode === 'site' ? 'جدول المال' : 'مسار الأموال'}
            </span>
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExport}
              disabled={loading || rows.length === 0}
              title="Export to Excel"
              data-testid="button-export-trail"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={load} disabled={loading} data-testid="button-refresh-trail">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center justify-center py-6 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading trail…</span>
          </div>
        )}

        {!loading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No payment events recorded yet.
            <span dir="rtl" className="block text-xs mt-1">لا توجد أحداث مالية مسجلة بعد.</span>
          </p>
        )}

        {!loading && rows.length > 0 && (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

            <div className="space-y-3 pl-10">
              {displayRows.map((row, i) => {
                const cfg = getConfig(row.event_type);
                const label = paymentEventLabel(row.event_type as PaymentEventType);
                const ts = new Date(row.created_at);

                return (
                  <div
                    key={row.id}
                    className={`relative rounded-md border p-3 ${cfg.bgColor}`}
                    data-testid={`trail-event-${row.id}`}
                  >
                    {/* Dot on the timeline */}
                    <div className={`absolute -left-[2.15rem] top-3.5 h-4 w-4 rounded-full border-2 border-background bg-background ${cfg.color} flex items-center justify-center`}>
                      {cfg.icon}
                    </div>

                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-medium ${cfg.color}`}>{label.en}</span>
                          <span dir="rtl" className="text-xs text-muted-foreground">{label.ar}</span>
                        </div>
                        {row.performed_by_name && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            By {row.performed_by_name}
                            {row.performed_by_role && ` · ${row.performed_by_role}`}
                          </p>
                        )}
                        {row.note && (
                          <p className="text-xs text-foreground/70 mt-1 italic">{row.note}</p>
                        )}
                        {/* recovery_decision_rolled: source trail shows where money went */}
                        {row.event_type === 'recovery_decision_rolled' && row.metadata?.target_mmp_name && (
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <RotateCcw className="h-3 w-3 shrink-0" />
                            Rolled to: <span className="font-medium ml-1">{row.metadata.target_mmp_name as string}</span>
                          </p>
                        )}
                        {/* payment_pre_allocated: target trail shows where money came from */}
                        {row.event_type === 'payment_pre_allocated' && row.metadata?.source_mmp_name && (
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <ArrowRightLeft className="h-3 w-3 shrink-0" />
                            From: <span className="font-medium ml-1">{row.metadata.source_mmp_name as string}</span>
                            {row.metadata.source_site_name && (
                              <span className="text-muted-foreground/70 ml-1">· {row.metadata.source_site_name as string}</span>
                            )}
                          </p>
                        )}
                        {row.metadata?.target_site_auto_inserted && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                            ⚠ Site was not in target MMP — auto-added for this allocation.
                          </p>
                        )}
                        {row.metadata && row.metadata.repayment_deadline && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Deadline: <span className="font-medium">{row.metadata.repayment_deadline as string}</span>
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {row.amount != null && (
                          <Badge variant="outline" className={`text-xs font-mono ${cfg.color}`}>
                            {row.amount.toLocaleString()} {row.amount_currency || 'SDG'}
                          </Badge>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {ts.toLocaleDateString()} {ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {maxRows && rows.length > maxRows && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 w-full text-xs"
                onClick={() => setShowAll(!showAll)}
                data-testid="button-toggle-all-trail"
              >
                {showAll ? 'Show less' : `Show all ${rows.length} events`}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
