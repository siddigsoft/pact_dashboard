/**
 * AccountingGLBridgePayroll.tsx
 *
 * Payroll → GL Bridge panel.
 * Shows payroll runs whose salary/EOSB/advance-recovery journal entries
 * have not yet been posted to the GL, lets Finance review and trigger posting.
 *
 * Bridge function: post_payroll_to_gl()  (see SQL migration)
 * Source tables tracked: payroll_runs, hr_salary_advances, eosb_accrual
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Zap, RefreshCw, AlertTriangle, CheckCircle2, DollarSign, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { parseJournalError } from '@/lib/journalErrors';
import { formatNumber } from '@/lib/accountingFormat';
import { dispatchNotification } from '@/lib/notify';
import { format } from 'date-fns';

interface BridgeLog { id: string; source_table: string; source_id: string; event_type: string; status: string; error_message: string | null; created_at: string; journal_entry_id: string | null; resolved_at: string | null }
interface PayrollRun { id: string; period_label: string; total_amount: number; currency: string; status: string; processed_at: string | null; created_at: string }
interface EosbRow { id: string; user_id: string; period: string; accrued_amount: number; currency: string; created_at: string }

const STATUS_COLOR: Record<string, string> = {
  success: 'bg-green-100 text-green-700 border-green-200',
  error:   'bg-red-100 text-red-700 border-red-200',
  skipped: 'bg-yellow-100 text-yellow-700 border-yellow-200',
};

export default function AccountingGLBridgePayroll() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'hr_admin']);

  const [logs, setLogs] = useState<BridgeLog[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [eosbRows, setEosbRows] = useState<EosbRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [bridging, setBridging] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [logRes, runRes, eosbRes] = await Promise.all([
      supabase
        .from('acct_gl_bridge_log')
        .select('id,source_table,source_id,event_type,status,error_message,created_at,journal_entry_id,resolved_at')
        .in('source_table', ['payroll_runs', 'eosb_accrual', 'hr_salary_advances'])
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('payroll_runs')
        .select('id,period_label,total_amount,currency,status,processed_at,created_at')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('eosb_accrual')
        .select('id,user_id,period,accrued_amount,currency,created_at')
        .order('created_at', { ascending: false })
        .limit(200),
    ]);
    setLogs((logRes.data ?? []) as BridgeLog[]);
    setPayrollRuns((runRes.data ?? []) as PayrollRun[]);
    setEosbRows((eosbRes.data ?? []) as EosbRow[]);
    setLoading(false);
  }

  useEffect(() => { if (isAuthenticated && allowed) load(); }, [isAuthenticated]);

  const bridgedPayrollIds  = new Set(logs.filter(l => l.source_table === 'payroll_runs'  && l.status === 'success').map(l => l.source_id));
  const bridgedEosbIds     = new Set(logs.filter(l => l.source_table === 'eosb_accrual'  && l.status === 'success').map(l => l.source_id));
  const unpostedRuns  = payrollRuns.filter(r => r.status === 'completed' && !bridgedPayrollIds.has(r.id));
  const unpostedEosb  = eosbRows.filter(e => !bridgedEosbIds.has(e.id));

  async function bridgePayroll() {
    setBridging('payroll');
    try {
      const { data, error } = await supabase.rpc('post_payroll_to_gl' as any, {});
      if (error) throw error;
      const res = data as { posted: number; skipped: number; errors: number } | null;
      const errCount = res?.errors ?? 0;
      toast.success(`Payroll bridge done — Posted: ${res?.posted ?? '?'}, Skipped: ${res?.skipped ?? '?'}, Errors: ${errCount}`);
      if (errCount > 0) {
        dispatchNotification({
          event: 'gl_bridge_error',
          recipientRoles: ['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant'],
          titleEn: 'GL Bridge Error — Payroll',
          titleAr: 'خطأ في جسر الأستاذ العام — الرواتب',
          messageEn: `${errCount} payroll posting${errCount > 1 ? 's' : ''} failed during the GL bridge run. Review the bridge log to identify and resolve the errors before COA balances diverge further.`,
          messageAr: `فشل ترحيل ${errCount} قيد راتب خلال تشغيل جسر الأستاذ العام. راجع سجل الجسر لتحديد الأخطاء وحلها قبل أن تتباعد أرصدة الأستاذ العام.`,
          priority: 'high',
          entityType: 'gl_bridge',
          actionUrl: '/accounting?tab=gl-bridge',
          sendEmail: true,
          sendWhatsApp: false,
          metadata: { errors: errCount, posted: res?.posted ?? 0, source_table: 'payroll_runs' },
        });
      }
      await load();
    } catch (err: any) {
      toast.error(`Bridge failed: ${parseJournalError(err)}`);
    } finally {
      setBridging(null);
    }
  }

  async function bridgeEosb() {
    setBridging('eosb');
    try {
      const { data, error } = await supabase.rpc('post_eosb_to_gl' as any, {});
      if (error) throw error;
      const res = data as { posted: number; errors: number } | null;
      const errCount = res?.errors ?? 0;
      toast.success(`EOSB bridge done — Posted: ${res?.posted ?? '?'}, Errors: ${errCount}`);
      if (errCount > 0) {
        dispatchNotification({
          event: 'gl_bridge_error',
          recipientRoles: ['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant'],
          titleEn: 'GL Bridge Error — EOSB Accruals',
          titleAr: 'خطأ في جسر الأستاذ العام — مكافأة نهاية الخدمة',
          messageEn: `${errCount} EOSB accrual posting${errCount > 1 ? 's' : ''} failed during the GL bridge run. Review the bridge log to identify and resolve the errors before COA balances diverge further.`,
          messageAr: `فشل ترحيل ${errCount} قيد مكافأة نهاية خدمة خلال تشغيل جسر الأستاذ العام. راجع سجل الجسر لتحديد الأخطاء وحلها قبل أن تتباعد أرصدة الأستاذ العام.`,
          priority: 'high',
          entityType: 'gl_bridge',
          actionUrl: '/accounting?tab=gl-bridge',
          sendEmail: true,
          sendWhatsApp: false,
          metadata: { errors: errCount, posted: res?.posted ?? 0, source_table: 'eosb_accrual' },
        });
      }
      await load();
    } catch (err: any) {
      toast.error(`EOSB bridge failed: ${parseJournalError(err)}`);
    } finally {
      setBridging(null);
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

  if (!isAuthenticated || !allowed) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <AlertTriangle className="h-5 w-5 mr-2" />
        Access restricted to Finance / HR Admin roles.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Payroll → GL Bridge</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Post completed payroll runs, EOSB accruals, and advance recoveries to the General Ledger.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Action cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-500" /> Payroll Runs
            </CardTitle>
            <CardDescription>{unpostedRuns.length} completed run{unpostedRuns.length !== 1 ? 's' : ''} pending GL posting</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-3xl font-bold text-blue-600">{loading ? '…' : unpostedRuns.length}</div>
            {unpostedRuns.slice(0, 5).map(r => (
              <div key={r.id} className="flex justify-between text-xs text-muted-foreground">
                <span>{r.period_label}</span>
                <span className="font-mono">{formatNumber(r.total_amount)} {r.currency}</span>
              </div>
            ))}
            <Button
              size="sm" className="w-full gap-2"
              disabled={bridging !== null || unpostedRuns.length === 0}
              onClick={bridgePayroll}
            >
              {bridging === 'payroll' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Post Payroll to GL
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-orange-500" /> EOSB Accruals
            </CardTitle>
            <CardDescription>{unpostedEosb.length} accrual row{unpostedEosb.length !== 1 ? 's' : ''} pending GL posting</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-3xl font-bold text-orange-600">{loading ? '…' : unpostedEosb.length}</div>
            {unpostedEosb.slice(0, 5).map(e => (
              <div key={e.id} className="flex justify-between text-xs text-muted-foreground">
                <span>{e.period}</span>
                <span className="font-mono">{formatNumber(e.accrued_amount)} {e.currency}</span>
              </div>
            ))}
            <Button
              size="sm" className="w-full gap-2"
              disabled={bridging !== null || unpostedEosb.length === 0}
              onClick={bridgeEosb}
            >
              {bridging === 'eosb' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Post EOSB to GL
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Bridge log */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bridge Log (last 300)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bridge activity yet.</p>
          ) : (
            <Tabs defaultValue="all">
              <TabsList className="mb-3">
                <TabsTrigger value="all">All ({logs.length})</TabsTrigger>
                <TabsTrigger value="error">Errors ({logs.filter(l=>l.status==='error' && !l.resolved_at).length})</TabsTrigger>
              </TabsList>
              {(['all', 'error'] as const).map(tab => (
                <TabsContent key={tab} value={tab}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-muted-foreground border-b text-xs">
                          <th className="text-left pb-2 pr-3">Date</th>
                          <th className="text-left pb-2 pr-3">Source Table</th>
                          <th className="text-left pb-2 pr-3">Source ID</th>
                          <th className="text-left pb-2 pr-3">Event</th>
                          <th className="text-left pb-2 pr-3">Status</th>
                          <th className="text-left pb-2 pr-3">Detail</th>
                          <th className="text-left pb-2">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(tab === 'error' ? logs.filter(l=>l.status==='error') : logs).map(l => (
                          <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-1.5 pr-3 text-xs">{format(new Date(l.created_at), 'dd/MM/yy HH:mm')}</td>
                            <td className="py-1.5 pr-3 text-xs font-mono">{l.source_table}</td>
                            <td className="py-1.5 pr-3 font-mono text-xs">{l.source_id?.slice(0,12)}…</td>
                            <td className="py-1.5 pr-3 text-xs">{l.event_type}</td>
                            <td className="py-1.5 pr-3">
                              <Badge className={`text-xs border ${STATUS_COLOR[l.status] ?? ''}`}>{l.status}</Badge>
                            </td>
                            <td className="py-1.5 pr-3 text-xs text-muted-foreground">
                              {l.error_message
                                ? <span className="text-red-500">{l.error_message.slice(0,80)}</span>
                                : l.journal_entry_id ? <span className="font-mono">{l.journal_entry_id.slice(0,12)}…</span> : '—'}
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
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
