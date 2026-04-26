import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Search, Download, RefreshCw, BookOpen, ChevronRight, ChevronDown } from 'lucide-react';
import { ACCT_TYPE_LABELS, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';

interface Account {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
  account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  subtype: string;
  parent_id: string | null;
  is_active: boolean;
  is_postable: boolean;
  version: number;
}

const TYPE_TONE: Record<Account['account_type'], string> = {
  asset:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  liability: 'bg-rose-50 text-rose-700 border-rose-200',
  equity:    'bg-violet-50 text-violet-700 border-violet-200',
  revenue:   'bg-sky-50 text-sky-700 border-sky-200',
  expense:   'bg-amber-50 text-amber-700 border-amber-200',
};

export default function AccountingCOA() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);

  const [rows, setRows] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [postableFilter, setPostableFilter] = useState<string>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('acct_accounts')
      .select('id, code, name_en, name_ar, account_type, subtype, parent_id, is_active, is_postable, version')
      .order('code', { ascending: true });
    if (err) setError(err.message);
    setRows((data ?? []) as Account[]);
    setLoading(false);
  };

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (typeFilter !== 'all' && r.account_type !== typeFilter) return false;
      if (activeFilter === 'active' && !r.is_active) return false;
      if (activeFilter === 'inactive' && r.is_active) return false;
      if (postableFilter === 'postable' && !r.is_postable) return false;
      if (postableFilter === 'header' && r.is_postable) return false;
      if (q) {
        return r.code.toLowerCase().includes(q)
          || r.name_en.toLowerCase().includes(q)
          || (r.name_ar ?? '').toLowerCase().includes(q)
          || r.subtype.toLowerCase().includes(q);
      }
      return true;
    });
  }, [rows, search, typeFilter, activeFilter, postableFilter]);

  const childrenOf = useMemo(() => {
    const map = new Map<string | null, Account[]>();
    for (const r of filtered) {
      const k = r.parent_id;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return map;
  }, [filtered]);

  const filteredIds = useMemo(() => new Set(filtered.map(r => r.id)), [filtered]);
  const visibleRoots = useMemo(() => {
    return filtered.filter(r => !r.parent_id || !filteredIds.has(r.parent_id));
  }, [filtered, filteredIds]);

  const counts = useMemo(() => {
    const t = { total: rows.length, active: 0, postable: 0, by: { asset: 0, liability: 0, equity: 0, revenue: 0, expense: 0 } as Record<Account['account_type'], number> };
    for (const r of rows) {
      if (r.is_active) t.active++;
      if (r.is_postable) t.postable++;
      t.by[r.account_type]++;
    }
    return t;
  }, [rows]);

  const exportCsv = () => {
    const header = ['Code', 'Name (EN)', 'Name (AR)', 'Type', 'Subtype', 'Active', 'Postable', 'Parent ID', 'Version'];
    const body = filtered.map(r => [r.code, r.name_en, r.name_ar, r.account_type, r.subtype, r.is_active ? 'Yes' : 'No', r.is_postable ? 'Yes' : 'No', r.parent_id ?? '', r.version]);
    downloadCsv(`chart-of-accounts-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const renderRow = (acct: Account, depth: number): React.ReactNode => {
    const kids = childrenOf.get(acct.id) ?? [];
    const isOpen = expanded.has(acct.id);
    return (
      <div key={acct.id} data-testid={`row-acct-${acct.id}`}>
        <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b items-center hover:bg-muted/40">
          <div className="col-span-3 flex items-center gap-1" style={{ paddingLeft: `${depth * 16}px` }}>
            {kids.length > 0 ? (
              <button
                type="button"
                onClick={() => toggle(acct.id)}
                className="p-0.5 hover:bg-muted rounded"
                aria-expanded={isOpen}
                data-testid={`button-expand-${acct.id}`}
              >
                {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <span className="w-4" />
            )}
            <span className="font-mono text-xs font-semibold">{acct.code}</span>
          </div>
          <div className="col-span-3 text-sm">{acct.name_en}</div>
          <div className="col-span-3 text-sm text-muted-foreground" dir="rtl" lang="ar">{acct.name_ar}</div>
          <div className="col-span-1">
            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', TYPE_TONE[acct.account_type])}>
              {ACCT_TYPE_LABELS[acct.account_type]?.en ?? acct.account_type}
            </Badge>
          </div>
          <div className="col-span-1 text-[11px] text-muted-foreground truncate">{acct.subtype}</div>
          <div className="col-span-1 flex gap-1 justify-end">
            {!acct.is_active && <Badge variant="outline" className="text-[10px] bg-zinc-100 text-zinc-700">Inactive</Badge>}
            {!acct.is_postable && <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-700">Header</Badge>}
          </div>
        </div>
        {isOpen && kids.map(k => renderRow(k, depth + 1))}
      </div>
    );
  };

  if (authLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 max-w-[1400px]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-blue-600" /> Chart of Accounts
            <span className="text-sm font-normal text-muted-foreground" dir="rtl" lang="ar">دليل الحسابات</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sudan COA — postable accounts feed every journal line. Headers organise the hierarchy.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} data-testid="button-refresh">
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length} data-testid="button-export-csv">
            <Download className="w-4 h-4 mr-1" /> CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">Total</div><div className="text-xl font-bold" data-testid="kpi-total">{counts.total}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">Active</div><div className="text-xl font-bold text-emerald-700" data-testid="kpi-active">{counts.active}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">Postable</div><div className="text-xl font-bold text-blue-700" data-testid="kpi-postable">{counts.postable}</div></CardContent></Card>
        {(['asset', 'liability', 'equity', 'revenue', 'expense'] as const).map(t => (
          <Card key={t}><CardContent className="p-3">
            <div className="text-[11px] text-muted-foreground capitalize">{t}</div>
            <div className="text-xl font-bold" data-testid={`kpi-${t}`}>{counts.by[t]}</div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <div className="relative sm:col-span-2">
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search code, name (EN/AR), subtype…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8"
                data-testid="input-search"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger data-testid="select-type"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {(['asset', 'liability', 'equity', 'revenue', 'expense'] as const).map(t => (
                  <SelectItem key={t} value={t}>{ACCT_TYPE_LABELS[t].en}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Select value={activeFilter} onValueChange={setActiveFilter}>
                <SelectTrigger data-testid="select-active"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <Select value={postableFilter} onValueChange={setPostableFilter}>
                <SelectTrigger data-testid="select-postable"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="postable">Postable</SelectItem>
                  <SelectItem value="header">Header only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded border border-rose-200 bg-rose-50 text-rose-800 text-sm" data-testid="text-error">
              {error}
              <div className="text-xs mt-1 text-rose-700/80">
                If this is a missing-relation error, Sprint 1.1 SQL has not been pasted into pactdb yet.
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading accounts…
            </div>
          ) : visibleRoots.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm" data-testid="text-empty">
              No accounts match the current filters.
            </div>
          ) : (
            <div className="border rounded-md">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b bg-muted/40 text-[11px] font-semibold uppercase text-muted-foreground">
                <div className="col-span-3">Code</div>
                <div className="col-span-3">Name (EN)</div>
                <div className="col-span-3">Name (AR)</div>
                <div className="col-span-1">Type</div>
                <div className="col-span-1">Subtype</div>
                <div className="col-span-1 text-right">Flags</div>
              </div>
              {visibleRoots.map(r => renderRow(r, 0))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
