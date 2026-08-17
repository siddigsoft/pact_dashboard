/**
 * AccountingGLBridgeAdvances.tsx
 *
 * GL Bridge panel for:
 *   • Field Advances (down_payment_requests → status = partially_paid OR fully_paid)
 *   • Operational Cost Submissions (operational_cost_submissions → status = paid)
 *
 * Each installment payment (total_paid_amount increase) is now journalled in
 * real-time via the acct_trig_down_payment_requests trigger. Retroactive
 * posting (for records paid before the trigger was active) is handled here.
 *
 * Bridge RPCs:
 *   post_downpayments_to_gl()      (see 20260820_installment_gl_posting.sql)
 *   post_cost_submissions_to_gl()  (see 20260817_gl_bridge_advances_ops.sql)
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Zap, CheckCircle2, AlertTriangle, RefreshCw, ArrowRight, Receipt, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import { parseJournalError } from '@/lib/journalErrors';
import { formatNumber } from '@/lib/accountingFormat';
import { dispatchNotification } from '@/lib/notify';
import { format } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BridgeLog {
  id: string;
  source_table: string;
  source_id: string;
  event_type: string;
  status: string;
  error_message: string | null;
  created_at: string;
  journal_entry_id: string | null;
  /** SDG amount covered by this log row (NULL for legacy rows pre-20260820) */
  amount: number | null;
  resolved_at: string | null;
}

/** Minimal row used only for amount-based gap calculation */
interface BridgeLogAmount {
  source_id: string;
  amount: number | null;
}

interface DownPayment {
  id: string;
  site_name: string | null;
  requested_amount: number;
  total_paid_amount: number;
  remaining_amount: number | null;
  status: string;
  updated_at: string;
  hub_name: string | null;
}

interface CostSubmission {
  id: string;
  expense_category: string;
  amount_cents: number;
  currency: string;
  description: string;
  expense_date: string;
  status: string;
  paid_at: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  success: 'bg-green-100 text-green-700 border-green-200',
  error:   'bg-red-100 text-red-700 border-red-200',
  skipped: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  pending: 'bg-blue-100 text-blue-700 border-blue-200',
};

const EVENT_LABEL: Record<string, string> = {
  installment_payment:     'Installment (live)',
  installment_retroactive: 'Retroactive lump-sum',
  down_payment_fully_paid: 'Full payment (legacy)',
  ops_cost_paid:           'Cost paid',
};

const CATEGORY_LABEL: Record<string, string> = {
  permits:          'Permits',
  incentives:       'Incentives',
  communications:   'Communications',
  training:         'Training',
  general_transport:'General Transport',
  equipment:        'Equipment',
  printing:         'Printing',
  meetings:         'Meetings',
  other:            'Other',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AccountingGLBridgeAdvances() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant']);

  const [dpUnposted,  setDpUnposted]  = useState<DownPayment[]>([]);
  const [opsUnposted, setOpsUnposted] = useState<CostSubmission[]>([]);
  const [logs,        setLogs]        = useState<BridgeLog[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [bridgingDp,  setBridgingDp]  = useState(false);
  const [bridgingOps, setBridgingOps] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────
  async function load() {
    setLoading(true);

    const [logRes, dpRes, opsRes, dpAmtRes] = await Promise.all([
      // Bridge log for display (last 300, both tables)
      supabase
        .from('acct_gl_bridge_log')
        .select('id,source_table,source_id,event_type,status,error_message,created_at,journal_entry_id,amount,resolved_at')
        .in('source_table', ['down_payment_requests', 'operational_cost_submissions'])
        .order('created_at', { ascending: false })
        .limit(300),

      // All partially-paid and fully-paid down-payments with payments > 0
      supabase
        .from('down_payment_requests' as any)
        .select('id,site_name,requested_amount,total_paid_amount,remaining_amount,status,updated_at,hub_name')
        .in('status', ['partially_paid', 'fully_paid'])
        .gt('total_paid_amount', 0)
        .order('updated_at', { ascending: false })
        .limit(500),

      // Paid cost submissions
      supabase
        .from('operational_cost_submissions' as any)
        .select('id,expense_category,amount_cents,currency,description,expense_date,status,paid_at')
        .eq('status', 'paid')
        .order('paid_at', { ascending: false })
        .limit(500),

      // All success log amounts for down_payment_requests (no row limit)
      // Used for amount-based gap calculation — distinct from the display log above.
      supabase
        .from('acct_gl_bridge_log')
        .select('source_id,amount')
        .eq('source_table', 'down_payment_requests')
        .eq('status', 'success'),
    ]);

    const allLogs = (logRes.data ?? []) as BridgeLog[];
    setLogs(allLogs);

    // Amount-based gap detection for down-payment advances:
    // An advance is "pending" (needs retroactive posting) when
    //   total_paid_amount − SUM(successful log amounts) > 0.005
    // This correctly surfaces advances where some installments previously
    // errored and a gap remains, even though other installments succeeded.
    const dpPostedByAdvance = new Map<string, number>();
    ((dpAmtRes.data ?? []) as BridgeLogAmount[]).forEach(row => {
      const prev = dpPostedByAdvance.get(row.source_id) ?? 0;
      // amount may be NULL for legacy rows; treat NULL as 0.
      // The migration backfill (step 0b) will populate these for existing rows,
      // but we guard here for safety.
      dpPostedByAdvance.set(row.source_id, prev + (row.amount ?? 0));
    });

    // Ops costs still use binary success detection (one JE per submission, not installments)
    const bridgedOpsIds = new Set(
      allLogs
        .filter(l => l.source_table === 'operational_cost_submissions' && l.status === 'success')
        .map(l => l.source_id)
    );

    setDpUnposted(
      ((dpRes.data ?? []) as DownPayment[]).filter(r => {
        const posted = dpPostedByAdvance.get(r.id) ?? 0;
        return (r.total_paid_amount - posted) > 0.005;
      })
    );
    setOpsUnposted(((opsRes.data ?? []) as CostSubmission[]).filter(r => !bridgedOpsIds.has(r.id)));
    setLoading(false);
  }

  useEffect(() => { if (isAuthenticated && allowed) load(); }, [isAuthenticated]);

  // ── Bridge runners ────────────────────────────────────────────────────────
  async function runDpBridge() {
    setBridgingDp(true);
    try {
      const { data, error } = await (supabase as any).rpc('post_downpayments_to_gl', {});
      if (error) throw error;
      const r = data as { posted: number; skipped: number; errors: number } | null;
      const errCount = r?.errors ?? 0;
      toast.success(`Advances bridge — Posted: ${r?.posted ?? '?'}, Skipped: ${r?.skipped ?? '?'}, Errors: ${errCount}`);
      if (errCount > 0) {
        dispatchNotification({
          event: 'gl_bridge_error',
          recipientRoles: ['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant'],
          titleEn: 'GL Bridge Error — Field Advances',
          titleAr: 'خطأ في جسر الأستاذ العام — السلف الميدانية',
          messageEn: `${errCount} field advance posting${errCount > 1 ? 's' : ''} failed during the GL bridge run. Review the bridge log to identify and resolve the errors before COA balances diverge further.`,
          messageAr: `فشل ترحيل ${errCount} سلفة ميدانية خلال تشغيل جسر الأستاذ العام. راجع سجل الجسر لتحديد الأخطاء وحلها قبل أن تتباعد أرصدة الأستاذ العام.`,
          priority: 'high',
          entityType: 'gl_bridge',
          actionUrl: '/accounting?tab=gl-bridge',
          sendEmail: true,
          sendWhatsApp: false,
          metadata: { errors: errCount, posted: r?.posted ?? 0, source_table: 'down_payment_requests' },
        });
      }
      await load();
    } catch (err: any) {
      toast.error(`Bridge failed: ${parseJournalError(err)}`);
    } finally {
      setBridgingDp(false);
    }
  }

  async function runOpsBridge() {
    setBridgingOps(true);
    try {
      const { data, error } = await (supabase as any).rpc('post_cost_submissions_to_gl', {});
      if (error) throw error;
      const r = data as { posted: number; skipped: number; errors: number } | null;
      const errCount = r?.errors ?? 0;
      toast.success(`Costs bridge — Posted: ${r?.posted ?? '?'}, Skipped: ${r?.skipped ?? '?'}, Errors: ${errCount}`);
      if (errCount > 0) {
        dispatchNotification({
          event: 'gl_bridge_error',
          recipientRoles: ['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant'],
          titleEn: 'GL Bridge Error — Operational Costs',
          titleAr: 'خطأ في جسر الأستاذ العام — التكاليف التشغيلية',
          messageEn: `${errCount} operational cost posting${errCount > 1 ? 's' : ''} failed during the GL bridge run. Review the bridge log to identify and resolve the errors before COA balances diverge further.`,
          messageAr: `فشل ترحيل ${errCount} تكلفة تشغيلية خلال تشغيل جسر الأستاذ العام. راجع سجل الجسر لتحديد الأخطاء وحلها قبل أن تتباعد أرصدة الأستاذ العام.`,
          priority: 'high',
          entityType: 'gl_bridge',
          actionUrl: '/accounting?tab=gl-bridge',
          sendEmail: true,
          sendWhatsApp: false,
          metadata: { errors: errCount, posted: r?.posted ?? 0, source_table: 'operational_cost_submissions' },
        });
      }
      await load();
    } catch (err: any) {
      toast.error(`Bridge failed: ${parseJournalError(err)}`);
    } finally {
      setBridgingOps(false);
    }
  }

  // ── Resolve a log error row ────────────────────────────────────────────────
  async function resolveLogRow(logId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase
      .from('acct_gl_bridge_log')
      .update({ resolved_at: new Date().toISOString(), resolved_by: user?.id ?? null })
      .eq('id', logId);
    if (err) { toast.error('Failed to mark resolved'); return; }
    setLogs(prev => prev.map(l => l.id === logId ? { ...l, resolved_at: new Date().toISOString() } : l));
    toast.success('Error marked as resolved — it will no longer appear in the Finance Dashboard alert.');
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const dpSuccessCount  = logs.filter(l => l.source_table === 'down_payment_requests'        && l.status === 'success').length;
  const opsSuccessCount = logs.filter(l => l.source_table === 'operational_cost_submissions'  && l.status === 'success').length;
  // Only count unresolved errors for the banner (resolved = acknowledged by Finance)
  const dpErrorCount    = logs.filter(l => l.source_table === 'down_payment_requests'        && l.status === 'error' && !l.resolved_at).length;
  const opsErrorCount   = logs.filter(l => l.source_table === 'operational_cost_submissions'  && l.status === 'error' && !l.resolved_at).length;

  if (!isAuthenticated || !allowed) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <AlertTriangle className="h-5 w-5 mr-2" />
        Access restricted to Finance roles.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Advances &amp; Costs → GL Bridge</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Post paid field advances and operational cost submissions to the General Ledger as double-entry journal entries.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* ── KPI strip ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <TrendingDown className="h-4 w-4" /> Advances Pending
            </div>
            <p className="text-3xl font-bold text-blue-600">{loading ? '…' : dpUnposted.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Receipt className="h-4 w-4" /> Costs Pending
            </div>
            <p className="text-3xl font-bold text-violet-600">{loading ? '…' : opsUnposted.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground mb-1">Posted (Advances)</p>
            <p className="text-3xl font-bold text-green-600">{loading ? '…' : dpSuccessCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground mb-1">Posted (Costs)</p>
            <p className="text-3xl font-bold text-green-600">{loading ? '…' : opsSuccessCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {(dpErrorCount + opsErrorCount) > 0 && (
        <div className="p-3 rounded border border-red-200 bg-red-50 text-red-800 text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {dpErrorCount + opsErrorCount} bridge error(s) require attention. Check the Log tab below.
        </div>
      )}

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="advances">
        <TabsList>
          <TabsTrigger value="advances">
            Field Advances
            {dpUnposted.length > 0 && (
              <Badge className="ml-2 bg-blue-100 text-blue-700 border-blue-200 text-[10px]">{dpUnposted.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="costs">
            Operational Costs
            {opsUnposted.length > 0 && (
              <Badge className="ml-2 bg-violet-100 text-violet-700 border-violet-200 text-[10px]">{opsUnposted.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="log">Bridge Log</TabsTrigger>
        </TabsList>

        {/* ── Field Advances ─────────────────────────────────────────────── */}
        <TabsContent value="advances" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                {dpUnposted.length === 0
                  ? 'All paid field advances are posted to the GL.'
                  : `${dpUnposted.length} advance(s) awaiting retroactive GL posting.`}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                New payments post automatically per installment · Retroactive bridge posts the net paid amount · DR 1510 / CR 1200
              </p>
            </div>
            <Button
              onClick={runDpBridge}
              disabled={bridgingDp || dpUnposted.length === 0}
              className="gap-2"
            >
              {bridgingDp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Run Bridge ({dpUnposted.length})
            </Button>
          </div>

          {dpUnposted.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-blue-500" />
                  Pending Field Advances
                </CardTitle>
                <CardDescription>
                  Advances with payments not yet posted to the GL (includes partial and full payments).
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-muted-foreground border-b text-xs">
                          <th className="text-left pb-2 pr-3">Date</th>
                          <th className="text-left pb-2 pr-3">Hub</th>
                          <th className="text-left pb-2 pr-3">Site</th>
                          <th className="text-left pb-2 pr-3">Stage</th>
                          <th className="text-right pb-2 pr-3">Paid (SDG)</th>
                          <th className="text-right pb-2">Remaining (SDG)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dpUnposted.slice(0, 100).map(r => (
                          <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-1.5 pr-3 text-xs">{format(new Date(r.updated_at), 'dd/MM/yyyy')}</td>
                            <td className="py-1.5 pr-3 text-xs text-muted-foreground">{r.hub_name ?? '—'}</td>
                            <td className="py-1.5 pr-3 text-xs truncate max-w-[160px]">{r.site_name ?? '—'}</td>
                            <td className="py-1.5 pr-3">
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  r.status === 'fully_paid'
                                    ? 'bg-green-50 text-green-700 border-green-200'
                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                }`}
                              >
                                {r.status === 'fully_paid' ? 'Final' : 'Partial'}
                              </Badge>
                            </td>
                            <td className="py-1.5 pr-3 text-right font-mono text-xs">
                              {formatNumber(r.total_paid_amount)}
                            </td>
                            <td className="py-1.5 text-right font-mono text-xs text-muted-foreground">
                              {r.remaining_amount != null && r.remaining_amount > 0
                                ? formatNumber(r.remaining_amount)
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {dpUnposted.length > 100 && (
                      <p className="text-xs text-muted-foreground mt-2">Showing first 100 of {dpUnposted.length}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Operational Costs ──────────────────────────────────────────── */}
        <TabsContent value="costs" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                {opsUnposted.length === 0
                  ? 'All paid cost submissions are posted to the GL.'
                  : `${opsUnposted.length} submission(s) awaiting GL posting.`}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Account mapping: DR category-mapped expense account · CR 1200 Cash/Bank
              </p>
            </div>
            <Button
              onClick={runOpsBridge}
              disabled={bridgingOps || opsUnposted.length === 0}
              className="gap-2"
            >
              {bridgingOps ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Run Bridge ({opsUnposted.length})
            </Button>
          </div>

          {opsUnposted.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-violet-500" />
                  Pending Cost Submissions
                </CardTitle>
                <CardDescription>Paid cost submissions not yet posted to the GL.</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-muted-foreground border-b text-xs">
                          <th className="text-left pb-2 pr-3">Date</th>
                          <th className="text-left pb-2 pr-3">Category</th>
                          <th className="text-left pb-2 pr-3">Description</th>
                          <th className="text-right pb-2">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {opsUnposted.slice(0, 100).map(r => (
                          <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-1.5 pr-3 text-xs">
                              {r.expense_date ? format(new Date(r.expense_date), 'dd/MM/yyyy') : '—'}
                            </td>
                            <td className="py-1.5 pr-3">
                              <Badge variant="outline" className="text-[10px]">
                                {CATEGORY_LABEL[r.expense_category] ?? r.expense_category}
                              </Badge>
                            </td>
                            <td className="py-1.5 pr-3 text-xs text-muted-foreground truncate max-w-[200px]">
                              {r.description ?? '—'}
                            </td>
                            <td className="py-1.5 text-right font-mono text-xs">
                              {formatNumber(r.amount_cents / 100)} {r.currency}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {opsUnposted.length > 100 && (
                      <p className="text-xs text-muted-foreground mt-2">Showing first 100 of {opsUnposted.length}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Bridge Log ─────────────────────────────────────────────────── */}
        <TabsContent value="log" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Bridge Log (last 300)</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No bridge activity yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground border-b text-xs">
                        <th className="text-left pb-2 pr-3">Date</th>
                        <th className="text-left pb-2 pr-3">Source</th>
                        <th className="text-left pb-2 pr-3">Event</th>
                        <th className="text-left pb-2 pr-3">Status</th>
                        <th className="text-left pb-2 pr-3">Journal Entry / Error</th>
                        <th className="text-left pb-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map(l => (
                        <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-1.5 pr-3 text-xs">{format(new Date(l.created_at), 'dd/MM/yy HH:mm')}</td>
                          <td className="py-1.5 pr-3 text-[10px] text-muted-foreground">
                            {l.source_table === 'down_payment_requests' ? 'Advance' : 'Ops Cost'}
                          </td>
                          <td className="py-1.5 pr-3 text-xs">{EVENT_LABEL[l.event_type] ?? l.event_type}</td>
                          <td className="py-1.5 pr-3">
                            <Badge className={`text-[10px] border ${STATUS_COLOR[l.status] ?? ''}`}>
                              {l.status}
                            </Badge>
                          </td>
                          <td className="py-1.5 pr-3 text-xs font-mono text-muted-foreground">
                            {l.journal_entry_id
                              ? l.journal_entry_id.slice(0, 12) + '…'
                              : l.error_message
                              ? <span className="text-red-500">{l.error_message.slice(0, 80)}</span>
                              : '—'}
                          </td>
                          <td className="py-1.5">
                            {l.status === 'error' && (
                              l.resolved_at
                                ? <span className="inline-flex items-center gap-1 text-[10px] text-green-600 font-medium">
                                    <CheckCircle2 className="h-3 w-3" /> Resolved
                                  </span>
                                : <Button type="button" size="sm" variant="ghost"
                                    className="h-6 px-2 text-[10px] text-muted-foreground hover:text-green-700 hover:bg-green-50"
                                    onClick={() => resolveLogRow(l.id)}>
                                    <CheckCircle2 className="h-3 w-3 mr-1" /> Mark resolved
                                  </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
