import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Users, RefreshCw, AlertTriangle, Search, ChevronDown, ChevronRight,
  Wallet, TrendingDown, CheckCircle2,
} from 'lucide-react';
import { formatNumber } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';

interface AllocRow {
  id: string;
  user_id: string;
  pre_fund_request_id: string;
  allocated_amount: number;
  spent_amount: number;
  currency: string;
  notes: string | null;
  created_at: string;
  fund_name: string;
  fund_status: string;
  user_name: string;
  user_email: string;
  user_role: string;
}

interface StaffSummary {
  user_id: string;
  user_name: string;
  user_email: string;
  user_role: string;
  total_allocated: number;
  total_spent: number;
  funds_count: number;
  allocations: AllocRow[];
  primary_currency: string;
}

function healthColor(pct: number) {
  if (pct >= 90) return 'text-rose-600';
  if (pct >= 70) return 'text-amber-600';
  return 'text-emerald-600';
}

function progressColor(pct: number) {
  if (pct >= 90) return '[&>div]:bg-rose-500';
  if (pct >= 70) return '[&>div]:bg-amber-500';
  return '[&>div]:bg-emerald-500';
}

function roleBadge(role: string) {
  const cfg: Record<string, string> = {
    super_admin: 'bg-gray-100 text-gray-700',
    admin: 'bg-red-100 text-red-700',
    financialAdmin: 'bg-green-100 text-green-700',
    financial_admin: 'bg-green-100 text-green-700',
    coordinator: 'bg-violet-100 text-violet-700',
    supervisor: 'bg-orange-100 text-orange-700',
    data_collector: 'bg-blue-100 text-blue-700',
    employee: 'bg-slate-100 text-slate-700',
  };
  const cls = cfg[role] ?? 'bg-muted text-muted-foreground';
  return (
    <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0', cls)}>
      {role.replace(/_/g, ' ')}
    </Badge>
  );
}

export default function PreFundingAllocations() {
  const { hasAnyRole } = useAuthorization();
  const canAccess = hasAnyRole(['super_admin', 'admin', 'financialAdmin']);

  const [allAllocations, setAll] = useState<AllocRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [fundFilter, setFund]   = useState('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [funds, setFunds]       = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: allocData, error } = await (supabase as any)
        .from('pre_fund_allocations')
        .select('id,user_id,pre_fund_request_id,allocated_amount,spent_amount,currency,notes,created_at')
        .order('created_at', { ascending: false });
      if (error && !error.message.includes('does not exist')) throw error;
      const allocs: any[] = allocData ?? [];

      if (allocs.length === 0) { setAll([]); setFunds([]); setLoading(false); return; }

      const userIds  = [...new Set(allocs.map((a: any) => a.user_id).filter(Boolean))];
      const fundIds  = [...new Set(allocs.map((a: any) => a.pre_fund_request_id).filter(Boolean))];

      // Compute spent dynamically from actual payment transactions.
      // We aggregate at FUND level (not per-user) because the allocated users are
      // budget holders / accountable officers — not necessarily the same people who
      // submitted the individual payments. Each allocated user sees the full fund
      // spend so they know how much of their allocation has been consumed.
      const { data: txnData } = await (supabase as any)
        .from('pre_fund_transactions')
        .select('pre_fund_request_id,amount')
        .in('pre_fund_request_id', fundIds)
        .eq('transaction_type', 'payment');

      // Build a map: fundId → total spent (all payments from that fund)
      const spentMap = new Map<string, number>();
      for (const t of (txnData ?? [])) {
        const key = t.pre_fund_request_id;
        spentMap.set(key, (spentMap.get(key) ?? 0) + Number(t.amount));
      }

      const [profilesRes, fundsRes] = await Promise.all([
        supabase.from('profiles').select('id,full_name,email,role').in('id', userIds),
        supabase.from('pre_fund_requests').select('id,name,status').in('id', fundIds),
      ]);

      const profileMap = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]));
      const fundMap    = new Map((fundsRes.data ?? []).map((f: any) => [f.id, f]));

      const enriched: AllocRow[] = allocs.map((a: any) => {
        const p = profileMap.get(a.user_id) as any;
        const f = fundMap.get(a.pre_fund_request_id) as any;
        // Fund-level spend: total payments from this fund regardless of who submitted
        const dynamicSpent = spentMap.get(a.pre_fund_request_id);
        return {
          ...a,
          allocated_amount: Number(a.allocated_amount),
          spent_amount: dynamicSpent !== undefined ? dynamicSpent : Number(a.spent_amount ?? 0),
          fund_name:   f?.name   ?? 'Unknown Fund',
          fund_status: f?.status ?? 'unknown',
          user_name:   p?.full_name ?? p?.email ?? 'Unknown',
          user_email:  p?.email  ?? '',
          user_role:   p?.role   ?? 'employee',
        };
      });

      setAll(enriched);
      setFunds((fundsRes.data ?? []).map((f: any) => ({ id: f.id, name: f.name })));
    } catch (e: any) {
      console.error('Allocations load error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = allAllocations.filter(a => {
    if (fundFilter !== 'all' && a.pre_fund_request_id !== fundFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!a.user_name.toLowerCase().includes(q) && !a.user_email.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const byStaff = new Map<string, StaffSummary>();
  for (const a of filtered) {
    if (!byStaff.has(a.user_id)) {
      byStaff.set(a.user_id, {
        user_id: a.user_id, user_name: a.user_name, user_email: a.user_email,
        user_role: a.user_role, total_allocated: 0, total_spent: 0,
        funds_count: 0, allocations: [], primary_currency: a.currency,
      });
    }
    const s = byStaff.get(a.user_id)!;
    s.total_allocated += a.allocated_amount;
    s.total_spent     += a.spent_amount;
    s.funds_count     += 1;
    s.allocations.push(a);
  }
  const staff = Array.from(byStaff.values()).sort((a, b) => b.total_allocated - a.total_allocated);

  const totalAllocated = staff.reduce((s, p) => s + p.total_allocated, 0);
  const totalSpent     = staff.reduce((s, p) => s + p.total_spent, 0);
  const overUsed       = staff.filter(p => p.total_spent > p.total_allocated).length;

  const toggleExpand = (uid: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(uid) ? n.delete(uid) : n.add(uid); return n; });

  if (!canAccess) return (
    <div className="p-8 text-center">
      <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" />
      <p className="text-muted-foreground">You don't have access to Allocation Dashboard.</p>
    </div>
  );

  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5 text-violet-600" />
            Allocation Dashboard
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Per-staff fund allocations — how much each person was assigned, spent, and has remaining
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} data-testid="button-refresh-allocs">
          <RefreshCw className="h-4 w-4 mr-1.5" />Refresh
        </Button>
      </div>

      {/* KPI row */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Staff Allocated', value: String(staff.length), sub: 'unique people', icon: Users, accent: 'bg-violet-600' },
            { label: 'Total Allocated', value: formatNumber(totalAllocated, 0), sub: 'across all funds', icon: Wallet, accent: 'bg-sky-600' },
            { label: 'Total Spent',     value: formatNumber(totalSpent, 0),     sub: 'from allocations', icon: TrendingDown, accent: 'bg-emerald-600' },
            { label: 'Over Budget',     value: String(overUsed),    sub: 'staff exceeded limit', icon: AlertTriangle, accent: overUsed > 0 ? 'bg-rose-600' : 'bg-slate-400' },
          ].map(k => (
            <Card key={k.label}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</div>
                    <div className="text-2xl font-bold mt-1 tabular-nums leading-none">{k.value}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{k.sub}</div>
                  </div>
                  <div className={cn('flex items-center justify-center h-10 w-10 rounded-xl shrink-0 text-white', k.accent)}>
                    <k.icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search staff…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 w-48 text-sm"
            data-testid="input-search-staff"
          />
        </div>
        <Select value={fundFilter} onValueChange={setFund}>
          <SelectTrigger className="h-8 w-52 text-sm" data-testid="select-fund-filter">
            <SelectValue placeholder="All funds" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Funds</SelectItem>
            {funds.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Staff list */}
      {loading ? (
        <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : staff.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border rounded-xl">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No allocations found</p>
          <p className="text-sm mt-1">Allocate staff in the Fund Registry → User Allocations dialog</p>
        </div>
      ) : (
        <div className="space-y-2">
          {staff.map(s => {
            const usedPct = s.total_allocated > 0 ? Math.min(100, Math.round((s.total_spent / s.total_allocated) * 100)) : 0;
            const remaining = s.total_allocated - s.total_spent;
            const isExpanded = expanded.has(s.user_id);

            return (
              <Card key={s.user_id} className={cn('transition-shadow', usedPct >= 90 && 'ring-1 ring-rose-300')} data-testid={`card-staff-${s.user_id}`}>
                <CardContent className="px-4 py-3">
                  {/* Staff header row */}
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className={cn('h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0',
                      usedPct >= 90 ? 'bg-rose-500' : usedPct >= 70 ? 'bg-amber-500' : 'bg-violet-500'
                    )}>
                      {s.user_name.charAt(0).toUpperCase()}
                    </div>

                    {/* Name + role */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm truncate">{s.user_name}</span>
                        {roleBadge(s.user_role)}
                        <span className="text-[10px] text-muted-foreground">{s.funds_count} fund{s.funds_count !== 1 ? 's' : ''}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">{s.user_email}</span>
                    </div>

                    {/* Amounts */}
                    <div className="hidden sm:flex flex-col items-end text-[11px] shrink-0">
                      <span className="font-mono font-semibold">{s.primary_currency} {formatNumber(s.total_allocated, 0)}</span>
                      <span className="text-muted-foreground">allocated</span>
                    </div>
                    <div className="hidden md:flex flex-col items-end text-[11px] shrink-0">
                      <span className={cn('font-mono font-semibold', healthColor(usedPct))}>{s.primary_currency} {formatNumber(s.total_spent, 0)}</span>
                      <span className="text-muted-foreground">spent</span>
                    </div>
                    <div className="hidden md:flex flex-col items-end text-[11px] shrink-0">
                      <span className={cn('font-mono font-semibold', remaining < 0 ? 'text-rose-600' : 'text-emerald-600')}>
                        {s.primary_currency} {formatNumber(Math.max(0, remaining), 0)}
                      </span>
                      <span className="text-muted-foreground">remaining</span>
                    </div>

                    {/* Used % + expand */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn('text-sm font-bold tabular-nums', healthColor(usedPct))}>{usedPct}%</span>
                      <button onClick={() => toggleExpand(s.user_id)} className="p-1 hover:bg-muted rounded" data-testid={`button-expand-${s.user_id}`}>
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-2.5">
                    <Progress value={usedPct} className={cn('h-1.5', progressColor(usedPct))} />
                  </div>

                  {/* Expanded per-fund breakdown */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Fund Breakdown</p>
                      {s.allocations.map(a => {
                        const fp = a.allocated_amount > 0 ? Math.min(100, Math.round((a.spent_amount / a.allocated_amount) * 100)) : 0;
                        const fRem = a.allocated_amount - a.spent_amount;
                        return (
                          <div key={a.id} className="flex items-center gap-2 text-[11px]" data-testid={`row-alloc-${a.id}`}>
                            <div className={cn('h-2 w-2 rounded-full shrink-0',
                              a.fund_status === 'active' ? 'bg-emerald-500' :
                              a.fund_status === 'low_balance' ? 'bg-amber-500' :
                              a.fund_status === 'closed' ? 'bg-slate-400' : 'bg-sky-500'
                            )} />
                            <span className="flex-1 truncate font-medium">{a.fund_name}</span>
                            <span className="font-mono text-muted-foreground">{a.currency} {formatNumber(a.allocated_amount, 0)} allocated</span>
                            <span className={cn('font-mono', healthColor(fp))}>{formatNumber(a.spent_amount, 0)} spent</span>
                            <span className={cn('font-mono', fRem < 0 ? 'text-rose-600' : 'text-emerald-600')}>
                              {fRem >= 0 ? formatNumber(fRem, 0) : `−${formatNumber(-fRem, 0)}`} left
                            </span>
                            {a.spent_amount >= a.allocated_amount && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 bg-rose-50 text-rose-700 border-rose-200">Over</Badge>
                            )}
                            {a.spent_amount === 0 && a.allocated_amount > 0 && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 bg-sky-50 text-sky-700 border-sky-200">Unused</Badge>
                            )}
                          </div>
                        );
                      })}
                      {/* Per-staff total bar */}
                      <div className="flex items-center gap-2 mt-1 pt-1 border-t text-[11px]">
                        <span className="flex-1 font-semibold">Total</span>
                        <span className="font-mono">{s.primary_currency} {formatNumber(s.total_allocated, 0)}</span>
                        <span className={cn('font-mono font-semibold', healthColor(usedPct))}>{usedPct}% used</span>
                        {usedPct >= 90 && <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />}
                        {usedPct < 50 && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
