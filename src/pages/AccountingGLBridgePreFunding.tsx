/**
 * AccountingGLBridgePreFunding.tsx
 *
 * Pre-Funding → GL Bridge panel.
 * Shows pre-fund disbursement transactions that have not yet been posted
 * to the general ledger, lets Finance review them, and triggers the bridge
 * function that creates acct_journal_entries + acct_journal_lines rows.
 *
 * Bridge function: post_prefunding_to_gl()  (see SQL migration)
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Zap, CheckCircle2, AlertTriangle, RefreshCw, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber } from '@/lib/accountingFormat';
import { format } from 'date-fns';

interface BridgeLog { id: string; source_table: string; source_id: string; event_type: string; status: string; error_message: string | null; created_at: string; journal_entry_id: string | null }
interface PreFundTxn { id: string; amount: number; currency: string; transaction_type: string; created_at: string; fund_id: string; description: string | null }
interface Fund { id: string; name: string; code: string }

const STATUS_COLOR: Record<string, string> = {
  success: 'bg-green-100 text-green-700 border-green-200',
  error:   'bg-red-100 text-red-700 border-red-200',
  skipped: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  pending: 'bg-blue-100 text-blue-700 border-blue-200',
};

export default function AccountingGLBridgePreFunding() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant']);

  const [logs, setLogs] = useState<BridgeLog[]>([]);
  const [unposted, setUnposted] = useState<PreFundTxn[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  const [bridging, setBridging] = useState(false);

  async function load() {
    setLoading(true);
    const [logRes, txnRes, fundRes] = await Promise.all([
      supabase
        .from('acct_gl_bridge_log')
        .select('id,source_table,source_id,event_type,status,error_message,created_at,journal_entry_id')
        .eq('source_table', 'pre_fund_transactions')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('pre_fund_transactions')
        .select('id,amount,currency,transaction_type,created_at,fund_id,description')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('pre_funding_funds')
        .select('id,name,code')
        .eq('is_active', true),
    ]);

    const bridgedIds = new Set((logRes.data ?? []).filter(l => l.status === 'success').map(l => l.source_id));
    const allTxns = (txnRes.data ?? []) as PreFundTxn[];
    setUnposted(allTxns.filter(t => !bridgedIds.has(t.id)));
    setLogs((logRes.data ?? []) as BridgeLog[]);
    setFunds((fundRes.data ?? []) as Fund[]);
    setLoading(false);
  }

  useEffect(() => { if (isAuthenticated && allowed) load(); }, [isAuthenticated]);

  async function runBridge() {
    setBridging(true);
    try {
      const { data, error } = await supabase.rpc('post_prefunding_to_gl' as any, {});
      if (error) throw error;
      const result = data as { posted: number; skipped: number; errors: number } | null;
      toast.success(
        `Bridge complete — Posted: ${result?.posted ?? '?'}, Skipped: ${result?.skipped ?? '?'}, Errors: ${result?.errors ?? 0}`
      );
      await load();
    } catch (err: any) {
      toast.error(`Bridge failed: ${err.message}`);
    } finally {
      setBridging(false);
    }
  }

  const fundMap: Record<string, Fund> = {};
  funds.forEach(f => { fundMap[f.id] = f; });

  const successCount = logs.filter(l => l.status === 'success').length;
  const errorCount   = logs.filter(l => l.status === 'error').length;

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Pre-Funding → GL Bridge</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Post pre-fund disbursement transactions to the General Ledger as double-entry journal entries.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button onClick={runBridge} disabled={bridging || unposted.length === 0} className="gap-2">
            {bridging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Run Bridge ({unposted.length} pending)
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Pending</p>
            <p className="text-3xl font-bold text-blue-600">{loading ? '…' : unposted.length}</p>
            <p className="text-xs text-muted-foreground mt-1">transactions awaiting GL posting</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Posted</p>
            <p className="text-3xl font-bold text-green-600">{loading ? '…' : successCount}</p>
            <p className="text-xs text-muted-foreground mt-1">successfully bridged to GL</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Errors</p>
            <p className={`text-3xl font-bold ${errorCount > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>{loading ? '…' : errorCount}</p>
            <p className="text-xs text-muted-foreground mt-1">bridge failures requiring review</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending transactions */}
      {unposted.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-blue-500" />
              Pending Transactions ({unposted.length})
            </CardTitle>
            <CardDescription>These disbursements have not yet been posted to the GL.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b text-xs">
                      <th className="text-left pb-2 pr-3">Date</th>
                      <th className="text-left pb-2 pr-3">Fund</th>
                      <th className="text-left pb-2 pr-3">Type</th>
                      <th className="text-left pb-2 pr-3">Description</th>
                      <th className="text-right pb-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unposted.slice(0, 50).map(t => (
                      <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-1.5 pr-3 text-xs">{format(new Date(t.created_at), 'dd/MM/yyyy')}</td>
                        <td className="py-1.5 pr-3 text-xs">{fundMap[t.fund_id]?.name ?? t.fund_id?.slice(0,8)}</td>
                        <td className="py-1.5 pr-3">
                          <Badge variant="outline" className="text-xs">{t.transaction_type}</Badge>
                        </td>
                        <td className="py-1.5 pr-3 text-xs text-muted-foreground truncate max-w-[200px]">{t.description ?? '—'}</td>
                        <td className="py-1.5 text-right font-mono text-xs">{formatNumber(t.amount)} {t.currency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {unposted.length > 50 && (
                  <p className="text-xs text-muted-foreground mt-2">Showing first 50 of {unposted.length}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Bridge log */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bridge Log (last 200)</CardTitle>
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
                    <th className="text-left pb-2 pr-3">Source ID</th>
                    <th className="text-left pb-2 pr-3">Event</th>
                    <th className="text-left pb-2 pr-3">Status</th>
                    <th className="text-left pb-2">Journal Entry</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-1.5 pr-3 text-xs">{format(new Date(l.created_at), 'dd/MM/yyyy HH:mm')}</td>
                      <td className="py-1.5 pr-3 font-mono text-xs">{l.source_id?.slice(0, 12)}…</td>
                      <td className="py-1.5 pr-3 text-xs">{l.event_type}</td>
                      <td className="py-1.5 pr-3">
                        <Badge className={`text-xs border ${STATUS_COLOR[l.status] ?? ''}`}>{l.status}</Badge>
                      </td>
                      <td className="py-1.5 text-xs font-mono text-muted-foreground">
                        {l.journal_entry_id ? l.journal_entry_id.slice(0, 12) + '…' : (l.error_message ? <span className="text-red-500">{l.error_message.slice(0, 60)}</span> : '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
