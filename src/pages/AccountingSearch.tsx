import { useState, useEffect, useCallback } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Search, BookOpen, Building2, FileText, ClipboardList,
  ShoppingCart, ListOrdered, CreditCard, Package, ChevronRight,
  TrendingUp, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/accountingFormat';

/* ─── types ───────────────────────────────────────────────────────────────── */
interface SearchResult {
  id: string; title: string; subtitle: string; badge?: string;
  badgeColor?: string; amount?: number; currency?: string; href: string;
}
interface CategoryResult {
  key: string; label: string; labelAr: string;
  icon: React.ElementType; color: string; results: SearchResult[];
  loading: boolean; error: boolean;
}

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function useDebounce<T>(value: T, delay: number): T {
  const [deb, setDeb] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDeb(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return deb;
}

const STATUS_COLORS: Record<string, string> = {
  draft:     'bg-slate-100 text-slate-600',
  pending:   'bg-amber-100 text-amber-700',
  submitted: 'bg-blue-100 text-blue-700',
  approved:  'bg-emerald-100 text-emerald-700',
  posted:    'bg-emerald-100 text-emerald-700',
  active:    'bg-emerald-100 text-emerald-700',
  paid:      'bg-green-100 text-green-700',
  overdue:   'bg-rose-100 text-rose-700',
  rejected:  'bg-rose-100 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-500',
  cleared:   'bg-teal-100 text-teal-700',
};

function statusColor(s: string) {
  return STATUS_COLORS[s?.toLowerCase()] ?? 'bg-slate-100 text-slate-600';
}

/* ─── main component ──────────────────────────────────────────────────────── */
export default function AccountingSearch() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query.trim(), 320);

  const [categories, setCategories] = useState<CategoryResult[]>([
    { key: 'journals',  label: 'Journal Entries',        labelAr: 'قيود المحاسبة',    icon: BookOpen,      color: 'text-amber-600',   results: [], loading: false, error: false },
    { key: 'accounts',  label: 'Chart of Accounts',      labelAr: 'دليل الحسابات',    icon: ListOrdered,   color: 'text-violet-600',  results: [], loading: false, error: false },
    { key: 'vendors',   label: 'Vendors',                 labelAr: 'الموردون',          icon: Building2,     color: 'text-orange-600',  results: [], loading: false, error: false },
    { key: 'invoices',  label: 'AP Invoices',             labelAr: 'فواتير الدفع',      icon: FileText,      color: 'text-rose-600',    results: [], loading: false, error: false },
    { key: 'prs',       label: 'Purchase Requisitions',   labelAr: 'طلبات الشراء',      icon: ClipboardList, color: 'text-blue-600',    results: [], loading: false, error: false },
    { key: 'pos',       label: 'Purchase Orders',         labelAr: 'أوامر الشراء',      icon: ShoppingCart,  color: 'text-indigo-600',  results: [], loading: false, error: false },
    { key: 'cheques',   label: 'Cheque Register',         labelAr: 'سجل الشيكات',      icon: CreditCard,    color: 'text-teal-600',    results: [], loading: false, error: false },
    { key: 'grns',      label: 'Goods Receipts',          labelAr: 'إشعارات الاستلام', icon: Package,       color: 'text-cyan-600',    results: [], loading: false, error: false },
  ]);

  const setLoading = (key: string, loading: boolean) =>
    setCategories(prev => prev.map(c => c.key === key ? { ...c, loading } : c));
  const setResults = (key: string, results: SearchResult[], error = false) =>
    setCategories(prev => prev.map(c => c.key === key ? { ...c, results, loading: false, error } : c));

  const runSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setCategories(prev => prev.map(c => ({ ...c, results: [], loading: false, error: false })));
      return;
    }
    const like = `%${q}%`;

    /* journals */
    setLoading('journals', true);
    supabase.from('acct_journal_entries')
      .select('id, entry_number, description_en, status, posting_date')
      .or(`description_en.ilike.${like},entry_number.ilike.${like},reference_number.ilike.${like}`)
      .order('posting_date', { ascending: false }).limit(8)
      .then(({ data, error }) => {
        if (error?.code === '42P01') { setResults('journals', []); return; }
        if (error) { setResults('journals', [], true); return; }
        setResults('journals', (data ?? []).map((r: any) => ({
          id: r.id, title: r.entry_number || r.id.slice(0, 8),
          subtitle: r.description_en || 'Journal Entry',
          badge: r.status, badgeColor: statusColor(r.status),
          href: '/accounting/journals',
        })));
      });

    /* accounts */
    setLoading('accounts', true);
    supabase.from('acct_accounts')
      .select('id, code, name_en, account_type')
      .or(`code.ilike.${like},name_en.ilike.${like},name_ar.ilike.${like}`)
      .order('code').limit(8)
      .then(({ data, error }) => {
        if (error?.code === '42P01') { setResults('accounts', []); return; }
        if (error) { setResults('accounts', [], true); return; }
        setResults('accounts', (data ?? []).map((r: any) => ({
          id: r.id, title: r.code,
          subtitle: r.name_en,
          badge: r.account_type, badgeColor: 'bg-violet-100 text-violet-700',
          href: '/accounting/coa',
        })));
      });

    /* vendors */
    setLoading('vendors', true);
    supabase.from('acct_vendors')
      .select('id, code, name_en, vendor_type, is_active')
      .or(`name_en.ilike.${like},code.ilike.${like},email.ilike.${like}`)
      .order('name_en').limit(8)
      .then(({ data, error }) => {
        if (error?.code === '42P01') { setResults('vendors', []); return; }
        if (error) { setResults('vendors', [], true); return; }
        setResults('vendors', (data ?? []).map((r: any) => ({
          id: r.id, title: r.name_en,
          subtitle: `${r.code ?? ''}${r.vendor_type ? ' · ' + r.vendor_type : ''}`,
          badge: r.is_active === false ? 'inactive' : 'active',
          badgeColor: r.is_active === false ? 'bg-slate-100 text-slate-500' : 'bg-emerald-100 text-emerald-700',
          href: '/accounting/vendors',
        })));
      });

    /* invoices */
    setLoading('invoices', true);
    supabase.from('acct_invoices')
      .select('id, invoice_number, status, total_amount, currency, due_date')
      .or(`invoice_number.ilike.${like}`)
      .order('created_at', { ascending: false }).limit(8)
      .then(({ data, error }) => {
        if (error?.code === '42P01') { setResults('invoices', []); return; }
        if (error) { setResults('invoices', [], true); return; }
        setResults('invoices', (data ?? []).map((r: any) => {
          const isOverdue = r.due_date && new Date(r.due_date) < new Date() && !['paid','cancelled'].includes(r.status);
          return {
            id: r.id, title: r.invoice_number || r.id.slice(0, 8),
            subtitle: `${r.currency} ${formatNumber(r.total_amount)}${r.due_date ? ' · Due ' + r.due_date : ''}`,
            badge: isOverdue ? 'overdue' : r.status,
            badgeColor: statusColor(isOverdue ? 'overdue' : r.status),
            href: '/accounting/ap-invoices',
          };
        }));
      });

    /* purchase requisitions */
    setLoading('prs', true);
    supabase.from('acct_purchase_requisitions')
      .select('id, pr_number, title_en, status, priority, estimated_amount')
      .or(`pr_number.ilike.${like},title_en.ilike.${like}`)
      .order('created_at', { ascending: false }).limit(8)
      .then(({ data, error }) => {
        if (error?.code === '42P01') { setResults('prs', []); return; }
        if (error) { setResults('prs', [], true); return; }
        setResults('prs', (data ?? []).map((r: any) => ({
          id: r.id, title: r.pr_number || r.id.slice(0, 8),
          subtitle: r.title_en || '—',
          badge: r.status, badgeColor: statusColor(r.status),
          amount: r.estimated_amount, currency: 'USD',
          href: '/accounting/purchase-requisitions',
        })));
      });

    /* purchase orders */
    setLoading('pos', true);
    supabase.from('acct_purchase_orders')
      .select('id, po_number, description_en, status, total_amount, currency')
      .or(`po_number.ilike.${like},description_en.ilike.${like}`)
      .order('created_at', { ascending: false }).limit(8)
      .then(({ data, error }) => {
        if (error?.code === '42P01') { setResults('pos', []); return; }
        if (error) { setResults('pos', [], true); return; }
        setResults('pos', (data ?? []).map((r: any) => ({
          id: r.id, title: r.po_number || r.id.slice(0, 8),
          subtitle: r.description_en || '—',
          badge: r.status, badgeColor: statusColor(r.status),
          amount: r.total_amount, currency: r.currency,
          href: '/accounting/purchase-orders',
        })));
      });

    /* cheques */
    setLoading('cheques', true);
    supabase.from('acct_cheque_register')
      .select('id, cheque_number, payee_name, status, amount, currency')
      .or(`cheque_number.ilike.${like},payee_name.ilike.${like}`)
      .order('created_at', { ascending: false }).limit(8)
      .then(({ data, error }) => {
        if (error?.code === '42P01') { setResults('cheques', []); return; }
        if (error) { setResults('cheques', [], true); return; }
        setResults('cheques', (data ?? []).map((r: any) => ({
          id: r.id, title: r.cheque_number || r.id.slice(0, 8),
          subtitle: r.payee_name || '—',
          badge: r.status, badgeColor: statusColor(r.status),
          amount: r.amount, currency: r.currency,
          href: '/accounting/cheque-register',
        })));
      });

    /* GRNs */
    setLoading('grns', true);
    supabase.from('acct_grn_receipts')
      .select('id, grn_number, title_en, status, condition_on_receipt')
      .or(`grn_number.ilike.${like},title_en.ilike.${like}`)
      .order('created_at', { ascending: false }).limit(8)
      .then(({ data, error }) => {
        if (error?.code === '42P01') { setResults('grns', []); return; }
        if (error) { setResults('grns', [], true); return; }
        setResults('grns', (data ?? []).map((r: any) => ({
          id: r.id, title: r.grn_number || r.id.slice(0, 8),
          subtitle: r.title_en || '—',
          badge: r.status, badgeColor: statusColor(r.status),
          href: '/accounting/grn',
        })));
      });

  }, []);

  useEffect(() => { void runSearch(debouncedQuery); }, [debouncedQuery, runSearch]);

  const anyLoading  = categories.some(c => c.loading);
  const anyResults  = categories.some(c => c.results.length > 0);
  const totalHits   = categories.reduce((s, c) => s + c.results.length, 0);
  const activeCategories = categories.filter(c => c.results.length > 0 || c.loading);

  if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed)   return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-[900px] space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Search className="w-6 h-6 text-blue-600" /> Accounting Search
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5" dir="auto">
          Search across journal entries, vendors, invoices, PRs, POs, accounts, cheques, and GRNs.
        </p>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
        {anyLoading && <Loader2 className="absolute right-3 top-3 w-4 h-4 animate-spin text-muted-foreground" />}
        <Input
          autoFocus
          placeholder="Search accounting records… (min 2 characters)"
          className="pl-10 pr-10 h-11 text-sm"
          value={query}
          onChange={e => setQuery(e.target.value)}
          data-testid="input-accounting-search"
        />
      </div>

      {/* Stats bar */}
      {debouncedQuery.length >= 2 && !anyLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span className="font-semibold text-foreground">{totalHits}</span> results for
          <span className="font-mono bg-muted px-1.5 py-0.5 rounded">"{debouncedQuery}"</span>
          {categories.filter(c => c.results.length > 0).map(c => (
            <Badge key={c.key} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{c.label}: {c.results.length}</Badge>
          ))}
        </div>
      )}

      {/* Empty / prompt state */}
      {debouncedQuery.length < 2 && (
        <div className="text-center py-20 text-muted-foreground">
          <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-sm font-medium">Type at least 2 characters to search</p>
          <p className="text-xs mt-1 opacity-70">Searches across journals, vendors, invoices, PRs, POs, accounts, cheques & GRNs</p>

          {/* Category quick-reference */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-8 max-w-xl mx-auto">
            {categories.map(c => (
              <Link key={c.key} to={c.href ?? '#'}>
                <div className="rounded-lg border p-3 hover:bg-muted/40 transition-colors text-left cursor-pointer">
                  <c.icon className={cn('h-4 w-4 mb-1', c.color)} />
                  <p className="text-xs font-medium">{c.label}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* No results */}
      {debouncedQuery.length >= 2 && !anyLoading && !anyResults && (
        <div className="text-center py-16 text-muted-foreground">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No results for <span className="font-mono">"{debouncedQuery}"</span></p>
          <p className="text-xs mt-1 opacity-70">Try a shorter term, a reference number, or an account code.</p>
        </div>
      )}

      {/* Results by category */}
      {debouncedQuery.length >= 2 && (
        <div className="space-y-4">
          {categories.map(cat => {
            if (!cat.loading && cat.results.length === 0) return null;
            const Icon = cat.icon;
            return (
              <div key={cat.key}>
                {/* Category header */}
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={cn('h-4 w-4 shrink-0', cat.color)} />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{cat.label}</span>
                  <span className="text-[10px] text-muted-foreground" dir="rtl">{cat.labelAr}</span>
                  {!cat.loading && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 ml-1">{cat.results.length}</Badge>
                  )}
                  <div className="flex-1 h-px bg-border" />
                  <Link to={cat.results[0]?.href ?? '#'} className="text-[10px] text-primary hover:underline shrink-0">
                    View all →
                  </Link>
                </div>

                {cat.loading ? (
                  <div className="space-y-1.5">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-12 rounded-lg bg-muted/40 animate-pulse" />
                    ))}
                  </div>
                ) : cat.error ? (
                  <div className="text-xs text-amber-600 flex items-center gap-1 px-2 py-1">
                    <AlertTriangle className="h-3 w-3" /> Table not available — run migration first
                  </div>
                ) : (
                  <Card className="border shadow-sm overflow-hidden">
                    <CardContent className="p-0">
                      {cat.results.map((result, idx) => (
                        <Link
                          key={result.id}
                          to={result.href}
                          className={cn(
                            'flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors group',
                            idx > 0 && 'border-t',
                          )}
                          data-testid={`search-result-${cat.key}-${result.id}`}
                        >
                          <Icon className={cn('h-4 w-4 shrink-0', cat.color)} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{result.title}</div>
                            <div className="text-[11px] text-muted-foreground truncate">{result.subtitle}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {result.amount != null && result.amount > 0 && (
                              <span className="text-xs tabular-nums font-medium">
                                {result.currency} {formatNumber(result.amount)}
                              </span>
                            )}
                            {result.badge && (
                              <Badge className={cn('text-[10px] px-1.5 py-0 h-4 font-medium border-0 capitalize', result.badgeColor)}>
                                {result.badge}
                              </Badge>
                            )}
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                          </div>
                        </Link>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
