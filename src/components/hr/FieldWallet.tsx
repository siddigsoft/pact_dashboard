import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { format, subMonths } from 'date-fns';
import { Wallet, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';

function fmtM(n: number, cur = 'SDG') { return `${cur} ${Math.round(n).toLocaleString()}`; }

const MONTHS_BACK = 6;

export default function FieldWallet() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: retainerStaff = [], isLoading: loadR } = useQuery({
    queryKey: ['field-wallet-staff'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('current_user_classifications')
        .select('user_id, amount_cents, currency, classification_level, is_active, profiles:user_id(full_name, email, role, employee_id, contract_type, bank_account)')
        .eq('is_active', true);
      return (data ?? []).filter((r: any) => r.profiles);
    },
    staleTime: 60_000,
  });

  const { data: advances = [], isLoading: loadA } = useQuery({
    queryKey: ['field-wallet-advances'],
    queryFn: async () => {
      const { data } = await supabase
        .from('hr_salary_advances')
        .select('id,user_id,amount,currency,status,issued_at,reason,recovered_amount')
        .order('issued_at', { ascending: false });
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const advMap = useMemo(() => {
    const m: Record<string, any[]> = {};
    advances.forEach((a: any) => {
      if (!m[a.user_id]) m[a.user_id] = [];
      m[a.user_id].push(a);
    });
    return m;
  }, [advances]);

  const staffRows = useMemo(() => {
    const q = search.toLowerCase();
    return retainerStaff
      .filter((r: any) => !q || (r.profiles?.full_name ?? '').toLowerCase().includes(q) || (r.profiles?.email ?? '').toLowerCase().includes(q))
      .map((r: any) => {
        const monthly = (r.amount_cents ?? 0) / 100;
        const adv = advMap[r.user_id] ?? [];
        const totalAdv = adv.reduce((s: number, a: any) => s + Number(a.amount || 0), 0);
        const recovered = adv.reduce((s: number, a: any) => s + Number(a.recovered_amount || 0), 0);
        const outstanding = Math.max(0, totalAdv - recovered);
        const netWallet = monthly - outstanding;
        return { ...r, monthly, adv, totalAdv, recovered, outstanding, netWallet };
      });
  }, [retainerStaff, advMap, search]);

  const totals = useMemo(() => ({
    monthly:     staffRows.reduce((s: number, r: any) => s + r.monthly, 0),
    outstanding: staffRows.reduce((s: number, r: any) => s + r.outstanding, 0),
    net:         staffRows.reduce((s: number, r: any) => s + r.netWallet, 0),
  }), [staffRows]);

  /* Monthly timeline for a selected member */
  const selectedData = useMemo(() => {
    if (!selectedId) return null;
    const member = staffRows.find(r => r.user_id === selectedId);
    if (!member) return null;
    const months = Array.from({ length: MONTHS_BACK }, (_, i) => {
      const d = subMonths(new Date(), MONTHS_BACK - 1 - i);
      return { label: format(d, 'MMM yy'), key: format(d, 'yyyy-MM') };
    });
    const timeline = months.map(({ label, key }) => {
      const advInMonth = member.adv.filter((a: any) => (a.issued_at ?? '').startsWith(key));
      const advTotal = advInMonth.reduce((s: number, a: any) => s + Number(a.amount || 0), 0);
      const recovInMonth = advInMonth.reduce((s: number, a: any) => s + Number(a.recovered_amount || 0), 0);
      const net = member.monthly - advTotal + recovInMonth;
      return { label, retainer: member.monthly, advance: advTotal, net: Math.max(0, net) };
    });
    return { member, timeline };
  }, [selectedId, staffRows]);

  const currency = retainerStaff[0]?.currency ?? 'SDG';
  const isLoading = loadR || loadA;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Monthly Retainer Pool',  value: totals.monthly,     color: 'text-violet-700 dark:text-violet-300', accent: 'bg-violet-500'  },
          { label: 'Outstanding Advances',   value: totals.outstanding, color: totals.outstanding > 0 ? 'text-red-600' : 'text-emerald-700',   accent: totals.outstanding > 0 ? 'bg-red-500' : 'bg-emerald-500' },
          { label: 'Net Payable This Month', value: totals.net,         color: 'text-emerald-700 dark:text-emerald-300', accent: 'bg-emerald-500' },
        ].map(k => (
          <Card key={k.label} className="overflow-hidden">
            <div className={`h-1 ${k.accent}`} />
            <CardContent className="pt-3 pb-3 px-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-xl font-bold ${k.color}`}>{isLoading ? '—' : fmtM(k.value, currency)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by name or email…"
        className="w-full border rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading field team wallet data…</div>
      ) : staffRows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <Wallet className="h-10 w-10 opacity-30" />
          <p className="text-sm">No active retainer staff found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {staffRows.map((r: any) => {
            const isSelected = selectedId === r.user_id;
            const hasDebt = r.outstanding > 0;
            const ba = r.profiles?.bank_account as any;
            const hasBank = !!(ba?.accountNumber || ba?.accountName);
            return (
              <Card key={r.user_id} className={cn('overflow-hidden transition-all', isSelected ? 'ring-2 ring-[#0F2041] dark:ring-blue-400' : '')}>
                <div className="px-5 py-4 flex items-center gap-4 cursor-pointer" onClick={() => setSelectedId(isSelected ? null : r.user_id)}>
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {(r.profiles?.full_name ?? '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{r.profiles?.full_name ?? '—'}</p>
                      {r.classification_level && (
                        <span className="text-[10px] font-bold bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 rounded-full">
                          {r.classification_level}
                        </span>
                      )}
                      {hasBank
                        ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" title="Bank account registered" />
                        : <AlertCircle className="h-3.5 w-3.5 text-amber-500" title="No bank account" />}
                    </div>
                    <p className="text-xs text-muted-foreground">{r.profiles?.role ?? '—'}</p>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="text-sm font-bold text-violet-700 dark:text-violet-300">{fmtM(r.monthly, r.currency)}/mo</p>
                    {hasDebt && <p className="text-xs font-semibold text-red-600">−{fmtM(r.outstanding, r.currency)} advance</p>}
                    <p className={cn('text-sm font-bold', hasDebt ? 'text-amber-700' : 'text-emerald-700')}>
                      Net: {fmtM(r.netWallet, r.currency)}
                    </p>
                  </div>
                </div>

                {/* Expanded — timeline */}
                {isSelected && selectedData && selectedData.member.user_id === r.user_id && (
                  <div className="border-t bg-muted/20 px-5 py-4 space-y-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Last {MONTHS_BACK} Months — Payment Timeline</p>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {selectedData.timeline.map((t, i) => (
                        <div key={i} className="rounded-xl border bg-card p-3 text-center">
                          <p className="text-[10px] text-muted-foreground mb-1">{t.label}</p>
                          <p className="text-sm font-bold text-violet-700 dark:text-violet-300">{Math.round(t.retainer / 1000)}K</p>
                          {t.advance > 0 && <p className="text-[10px] text-red-600 font-semibold">−{Math.round(t.advance / 1000)}K adv</p>}
                          <p className={cn('text-xs font-bold mt-1', t.advance > 0 ? 'text-amber-700' : 'text-emerald-700')}>
                            Net {Math.round(t.net / 1000)}K
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Advances list */}
                    {r.adv.length > 0 && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Active Advances</p>
                        <div className="space-y-2">
                          {r.adv.map((a: any) => {
                            const pct = Number(a.amount) > 0 ? Math.min(100, Math.round(Number(a.recovered_amount || 0) / Number(a.amount) * 100)) : 100;
                            return (
                              <div key={a.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold">{fmtM(Number(a.amount), a.currency)}</p>
                                  <p className="text-[10px] text-muted-foreground">{a.reason ?? '—'} · {a.issued_at ? format(new Date(a.issued_at), 'dd MMM yy') : '—'}</p>
                                  <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0', pct >= 100 ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700')}>
                                  {pct}% recovered
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Bank info */}
                    <div className={cn('rounded-xl border px-4 py-3 text-xs', hasBank ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20' : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20')}>
                      {hasBank ? (
                        <>
                          <p className="font-bold text-emerald-800 dark:text-emerald-300 mb-1">✓ Bank Account Registered</p>
                          <p className="text-emerald-700 dark:text-emerald-400">{ba?.accountName ?? '—'} · {ba?.accountNumber ?? '—'} · {ba?.bankName ?? ''}</p>
                        </>
                      ) : (
                        <p className="font-semibold text-amber-800 dark:text-amber-300">⚠ No bank account registered — cash-out method unclear</p>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
