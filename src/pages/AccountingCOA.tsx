import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { usePageManageOverride } from '@/hooks/usePageManageOverride';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, Search, Download, RefreshCw, BookOpen,
  ChevronRight, ChevronDown, Plus, Pencil, Trash2, Globe,
} from 'lucide-react';
import { ACCT_TYPE_LABELS, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { useAccountingCountry } from '@/hooks/use-accounting-country';

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
  country_id: string | null;
}

interface Country {
  id: string;
  code: string;
  name_en: string;
  name_ar: string | null;
  currency_code: string;
  currency_symbol: string;
  flag_emoji: string | null;
}

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const;

const TYPE_TONE: Record<Account['account_type'], string> = {
  asset:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  liability: 'bg-rose-50 text-rose-700 border-rose-200',
  equity:    'bg-violet-50 text-violet-700 border-violet-200',
  revenue:   'bg-sky-50 text-sky-700 border-sky-200',
  expense:   'bg-amber-50 text-amber-700 border-amber-200',
};

const BLANK_FORM = {
  code: '',
  name_en: '',
  name_ar: '',
  account_type: 'expense' as Account['account_type'],
  subtype: '',
  parent_id: '' as string,
  is_active: true,
  is_postable: true,
  country_id: '' as string,
};

type FormState = typeof BLANK_FORM;

export default function AccountingCOA() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed   = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const roleCanManage = hasAnyRole(['super_admin', 'admin']);

  const overrideCanManage = usePageManageOverride('acct-coa', roleCanManage);

  const canManage = roleCanManage || overrideCanManage;
  const { toast } = useToast();
  const { countryId: defaultCountryId, loading: acctCountryLoading } = useAccountingCountry();

  const [rows, setRows]               = useState<Account[]>([]);
  const [countries, setCountries]     = useState<Country[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [search, setSearch]           = useState('');
  const [typeFilter, setTypeFilter]   = useState<string>('all');
  const [activeFilter, setActiveFilter]     = useState<string>('all');
  const [postableFilter, setPostableFilter] = useState<string>('all');
  const [countryFilter, setCountryFilter]   = useState<string>('all');
  const [countryFilterInitialized, setCountryFilterInitialized] = useState(false);
  const [expanded, setExpanded]       = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!acctCountryLoading && !countryFilterInitialized) {
      setCountryFilter(defaultCountryId);
      setCountryFilterInitialized(true);
    }
  }, [acctCountryLoading, defaultCountryId, countryFilterInitialized]);

  // ── dialog states ─────────────────────────────────────────
  const [formOpen, setFormOpen]       = useState(false);
  const [editTarget, setEditTarget]   = useState<Account | null>(null);
  const [form, setForm]               = useState<FormState>(BLANK_FORM);
  const [saving, setSaving]           = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [deleteChecking, setDeleteChecking] = useState(false);
  const [deleteBlocked, setDeleteBlocked]   = useState(false);
  const [deleteUsageMsg, setDeleteUsageMsg] = useState('');

  // ── load ──────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    setError(null);
    const [acctRes, ctrRes] = await Promise.all([
      supabase
        .from('acct_accounts')
        .select('id, code, name_en, name_ar, account_type, subtype, parent_id, is_active, is_postable, version, country_id')
        .order('code', { ascending: true }),
      supabase
        .from('countries')
        .select('id, code, name_en, name_ar, currency_code, currency_symbol, flag_emoji')
        .eq('is_active', true)
        .order('name_en'),
    ]);
    if (acctRes.error) setError(acctRes.error.message);
    setRows((acctRes.data ?? []) as Account[]);
    setCountries((ctrRes.data ?? []) as Country[]);
    setLoading(false);
  };

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  // ── derived ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (typeFilter !== 'all' && r.account_type !== typeFilter) return false;
      if (activeFilter === 'active' && !r.is_active) return false;
      if (activeFilter === 'inactive' && r.is_active) return false;
      if (postableFilter === 'postable' && !r.is_postable) return false;
      if (postableFilter === 'header' && r.is_postable) return false;
      if (countryFilter !== 'all' && r.country_id !== countryFilter) return false;
      if (q) {
        return r.code.toLowerCase().includes(q)
          || r.name_en.toLowerCase().includes(q)
          || (r.name_ar ?? '').toLowerCase().includes(q)
          || r.subtype.toLowerCase().includes(q);
      }
      return true;
    });
  }, [rows, search, typeFilter, activeFilter, postableFilter, countryFilter]);

  const childrenOf = useMemo(() => {
    const map = new Map<string | null, Account[]>();
    for (const r of filtered) {
      const k = r.parent_id;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return map;
  }, [filtered]);

  const filteredIds   = useMemo(() => new Set(filtered.map(r => r.id)), [filtered]);
  const visibleRoots  = useMemo(
    () => filtered.filter(r => !r.parent_id || !filteredIds.has(r.parent_id)),
    [filtered, filteredIds],
  );

  const counts = useMemo(() => {
    const t = {
      total: rows.length, active: 0, postable: 0,
      by: { asset: 0, liability: 0, equity: 0, revenue: 0, expense: 0 } as Record<Account['account_type'], number>,
    };
    for (const r of rows) {
      if (r.is_active) t.active++;
      if (r.is_postable) t.postable++;
      t.by[r.account_type]++;
    }
    return t;
  }, [rows]);

  // ── export ────────────────────────────────────────────────
  const exportCsv = () => {
    const header = ['Code', 'Name (EN)', 'Name (AR)', 'Type', 'Subtype', 'Active', 'Postable', 'Parent ID', 'Country', 'Version'];
    const body = filtered.map(r => {
      const ctr = countries.find(c => c.id === r.country_id);
      return [r.code, r.name_en, r.name_ar, r.account_type, r.subtype, r.is_active ? 'Yes' : 'No', r.is_postable ? 'Yes' : 'No', r.parent_id ?? '', ctr?.code ?? '', r.version];
    });
    downloadCsv(`chart-of-accounts-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── form helpers ──────────────────────────────────────────
  const openAdd = () => {
    const defaultCountry = countries.find(c => c.code === 'SD')?.id ?? countries[0]?.id ?? '';
    setEditTarget(null);
    setForm({ ...BLANK_FORM, country_id: defaultCountry });
    setFormOpen(true);
  };

  const openEdit = (acct: Account) => {
    setEditTarget(acct);
    setForm({
      code:         acct.code,
      name_en:      acct.name_en,
      name_ar:      acct.name_ar ?? '',
      account_type: acct.account_type,
      subtype:      acct.subtype ?? '',
      parent_id:    acct.parent_id ?? '',
      is_active:    acct.is_active,
      is_postable:  acct.is_postable,
      country_id:   acct.country_id ?? '',
    });
    setFormOpen(true);
  };

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!form.code.trim() || !form.name_en.trim()) {
      toast({ title: 'Code and English name are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      code:         form.code.trim(),
      name_en:      form.name_en.trim(),
      name_ar:      form.name_ar.trim() || null,
      account_type: form.account_type,
      subtype:      form.subtype.trim() || 'general',
      parent_id:    form.parent_id || null,
      is_active:    form.is_active,
      is_postable:  form.is_postable,
      country_id:   form.country_id || null,
    };

    let err;
    if (editTarget) {
      ({ error: err } = await supabase
        .from('acct_accounts')
        .update({ ...payload, version: editTarget.version + 1 })
        .eq('id', editTarget.id));
    } else {
      ({ error: err } = await supabase
        .from('acct_accounts')
        .insert({ ...payload, version: 1 }));
    }

    setSaving(false);
    if (err) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    } else {
      toast({ title: editTarget ? 'Account updated' : 'Account created' });
      setFormOpen(false);
      void load();
    }
  };

  // ── delete helpers ────────────────────────────────────────
  const openDelete = async (acct: Account) => {
    setDeleteTarget(acct);
    setDeleteBlocked(false);
    setDeleteUsageMsg('');
    setDeleteChecking(true);

    const checks = await Promise.all([
      supabase.from('acct_journal_lines').select('id', { count: 'exact', head: true }).eq('account_id', acct.id),
      supabase.from('acct_accounts').select('id', { count: 'exact', head: true }).eq('parent_id', acct.id),
    ]);

    setDeleteChecking(false);
    const lineCount = checks[0].count ?? 0;
    const childCount = checks[1].count ?? 0;
    const msgs: string[] = [];
    if (lineCount > 0) msgs.push(`${lineCount} journal line${lineCount !== 1 ? 's' : ''}`);
    if (childCount > 0) msgs.push(`${childCount} child account${childCount !== 1 ? 's' : ''}`);
    if (msgs.length) {
      setDeleteBlocked(true);
      setDeleteUsageMsg(`Cannot delete — this account is referenced by ${msgs.join(' and ')}.`);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleteBlocked) return;
    const { error: err } = await supabase
      .from('acct_accounts')
      .delete()
      .eq('id', deleteTarget.id);
    if (err) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    } else {
      toast({ title: 'Account deleted' });
      setDeleteTarget(null);
      void load();
    }
  };

  // ── row renderer ──────────────────────────────────────────
  const renderRow = (acct: Account, depth: number): React.ReactNode => {
    const kids  = childrenOf.get(acct.id) ?? [];
    const isOpen = expanded.has(acct.id);
    const ctr   = countries.find(c => c.id === acct.country_id);
    return (
      <div key={acct.id} data-testid={`row-acct-${acct.id}`}>
        <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b items-center hover:bg-muted/40 group">
          {/* Code */}
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

          {/* Names */}
          <div className="col-span-2 text-sm">{acct.name_en}</div>
          <div className="col-span-2 text-sm text-muted-foreground" dir="rtl" lang="ar">{acct.name_ar}</div>

          {/* Type */}
          <div className="col-span-1">
            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', TYPE_TONE[acct.account_type])}>
              {ACCT_TYPE_LABELS[acct.account_type]?.en ?? acct.account_type}
            </Badge>
          </div>

          {/* Subtype */}
          <div className="col-span-1 text-[11px] text-muted-foreground truncate">{acct.subtype}</div>

          {/* Country */}
          <div className="col-span-1 text-[11px] text-muted-foreground">
            {ctr ? (
              <span title={ctr.name_en}>{ctr.flag_emoji ?? ''} {ctr.code}</span>
            ) : (
              <span className="opacity-40">—</span>
            )}
          </div>

          {/* Flags + actions */}
          <div className="col-span-2 flex gap-1 justify-end items-center">
            {!acct.is_active   && <Badge variant="outline" className="text-[10px] bg-zinc-100 text-zinc-700">Inactive</Badge>}
            {!acct.is_postable && <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-700">Header</Badge>}
            {canManage && (
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                <button
                  type="button"
                  onClick={() => openEdit(acct)}
                  className="p-1 rounded hover:bg-blue-50 text-blue-600"
                  title="Edit account"
                  data-testid={`button-edit-${acct.id}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void openDelete(acct)}
                  className="p-1 rounded hover:bg-rose-50 text-rose-600"
                  title="Delete account"
                  data-testid={`button-delete-${acct.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
        {isOpen && kids.map(k => renderRow(k, depth + 1))}
      </div>
    );
  };

  // ── guards ────────────────────────────────────────────────
  if (authLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (!allowed) return <Navigate to="/" replace />;

  // ── potential parent accounts for the form ────────────────
  const parentOptions = rows.filter(r => !editTarget || r.id !== editTarget.id);

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 max-w-[1400px]">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-blue-600" /> Chart of Accounts
            <span className="text-sm font-normal text-muted-foreground" dir="rtl" lang="ar">دليل الحسابات</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Postable accounts feed every journal line. Headers organise the hierarchy.
          </p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <Button size="sm" onClick={openAdd} data-testid="button-add-account">
              <Plus className="w-4 h-4 mr-1" /> Add Account
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void load()} data-testid="button-refresh">
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length} data-testid="button-export-csv">
            <Download className="w-4 h-4 mr-1" /> CSV
          </Button>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">Total</div><div className="text-xl font-bold" data-testid="kpi-total">{counts.total}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">Active</div><div className="text-xl font-bold text-emerald-700" data-testid="kpi-active">{counts.active}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">Postable</div><div className="text-xl font-bold text-blue-700" data-testid="kpi-postable">{counts.postable}</div></CardContent></Card>
        {ACCOUNT_TYPES.map(t => (
          <Card key={t}><CardContent className="p-3">
            <div className="text-[11px] text-muted-foreground capitalize">{t}</div>
            <div className="text-xl font-bold" data-testid={`kpi-${t}`}>{counts.by[t]}</div>
          </CardContent></Card>
        ))}
      </div>

      {/* ── Account list ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">

          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
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
                {ACCOUNT_TYPES.map(t => (
                  <SelectItem key={t} value={t}>{ACCT_TYPE_LABELS[t].en}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={countryFilter} onValueChange={setCountryFilter}>
              <SelectTrigger data-testid="select-country">
                <Globe className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All countries</SelectItem>
                {countries.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.flag_emoji ?? ''} {c.name_en} ({c.code})
                  </SelectItem>
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
                If this is a missing-relation error, apply the coa_countries_migration.sql in Supabase first.
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
                <div className="col-span-2">Name (EN)</div>
                <div className="col-span-2">Name (AR)</div>
                <div className="col-span-1">Type</div>
                <div className="col-span-1">Subtype</div>
                <div className="col-span-1">Country</div>
                <div className="col-span-2 text-right">Flags</div>
              </div>
              {visibleRoots.map(r => renderRow(r, 0))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ════════════════════════════════════════════════════
          ADD / EDIT DIALOG
      ════════════════════════════════════════════════════ */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-account-form">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Account' : 'Add Account'}</DialogTitle>
            <DialogDescription>
              {editTarget
                ? `Editing ${editTarget.code} — ${editTarget.name_en}`
                : 'Create a new account in the Chart of Accounts.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Code + Type */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="f-code">Account Code *</Label>
                <Input
                  id="f-code"
                  placeholder="e.g. 6100"
                  value={form.code}
                  onChange={e => setField('code', e.target.value)}
                  data-testid="input-account-code"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="f-type">Account Type *</Label>
                <Select value={form.account_type} onValueChange={v => setField('account_type', v as Account['account_type'])}>
                  <SelectTrigger id="f-type" data-testid="select-account-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{ACCT_TYPE_LABELS[t].en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Name EN */}
            <div className="space-y-1">
              <Label htmlFor="f-name-en">Name (English) *</Label>
              <Input
                id="f-name-en"
                placeholder="e.g. Field Operations Expense"
                value={form.name_en}
                onChange={e => setField('name_en', e.target.value)}
                data-testid="input-name-en"
              />
            </div>

            {/* Name AR */}
            <div className="space-y-1">
              <Label htmlFor="f-name-ar">Name (Arabic)</Label>
              <Input
                id="f-name-ar"
                dir="rtl"
                lang="ar"
                placeholder="اسم الحساب بالعربي"
                value={form.name_ar}
                onChange={e => setField('name_ar', e.target.value)}
                data-testid="input-name-ar"
              />
            </div>

            {/* Subtype + Parent */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="f-subtype">Subtype</Label>
                <Input
                  id="f-subtype"
                  placeholder="e.g. program_expense"
                  value={form.subtype}
                  onChange={e => setField('subtype', e.target.value)}
                  data-testid="input-subtype"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="f-parent">Parent Account</Label>
                <Select
                  value={form.parent_id || '__none__'}
                  onValueChange={v => setField('parent_id', v === '__none__' ? '' : v)}
                >
                  <SelectTrigger id="f-parent" data-testid="select-parent">
                    <SelectValue placeholder="None (root)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None (root)</SelectItem>
                    {parentOptions.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.code} — {a.name_en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Country */}
            <div className="space-y-1">
              <Label htmlFor="f-country">Country</Label>
              <Select
                value={form.country_id || '__none__'}
                onValueChange={v => setField('country_id', v === '__none__' ? '' : v)}
              >
                <SelectTrigger id="f-country" data-testid="select-form-country">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Unassigned —</SelectItem>
                  {countries.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.flag_emoji ?? ''} {c.name_en} ({c.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Toggles */}
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="f-active"
                  checked={form.is_active}
                  onCheckedChange={v => setField('is_active', v)}
                  data-testid="switch-is-active"
                />
                <Label htmlFor="f-active">Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="f-postable"
                  checked={form.is_postable}
                  onCheckedChange={v => setField('is_postable', v)}
                  data-testid="switch-is-postable"
                />
                <Label htmlFor="f-postable">Postable (accepts journal lines)</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving} data-testid="button-save-account">
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {editTarget ? 'Save Changes' : 'Create Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════
          DELETE CONFIRM DIALOG
      ════════════════════════════════════════════════════ */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent data-testid="dialog-delete-account">
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>
              {deleteTarget && `${deleteTarget.code} — ${deleteTarget.name_en}`}
            </DialogDescription>
          </DialogHeader>

          {deleteChecking ? (
            <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Checking usage…
            </div>
          ) : deleteBlocked ? (
            <div className="p-3 rounded border border-rose-200 bg-rose-50 text-rose-800 text-sm" data-testid="text-delete-blocked">
              {deleteUsageMsg}
              <div className="mt-1 text-xs text-rose-700/80">
                Reassign or delete the referenced records first.
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              This account will be permanently removed from the Chart of Accounts. This action cannot be undone.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteChecking || deleteBlocked}
              onClick={() => void confirmDelete()}
              data-testid="button-confirm-delete"
            >
              Delete Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
