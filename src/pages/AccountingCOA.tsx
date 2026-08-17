import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { usePageManageOverride } from '@/hooks/usePageManageOverride';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/page-loader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, Search, Download, RefreshCw, BookOpen, Upload,
  ChevronRight, ChevronDown, Plus, Pencil, Trash2, Globe, Building2, CheckCircle2, XCircle, AlertCircle,
  TrendingUp, TrendingDown, Minus, ExternalLink,
} from 'lucide-react';
import { ACCT_TYPE_LABELS, formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { exportToExcel } from '@/utils/report-export';
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
  company_id: string | null;
  allow_reconciliation: boolean;
  account_currency: string | null;
  notes: string | null;
  deprecated: boolean;
  account_tags: string[];
}

interface Company { id: string; name_en: string; currency_code: string }

// ── Odoo-compatible import row ──────────────────────────────────────────────
interface ImportRow {
  code: string; name_en: string; name_ar: string; account_type: string; subtype: string;
  allow_reconciliation: boolean; account_currency: string; company_code: string;
  is_active: boolean; notes: string;
  _status: 'new' | 'update' | 'error'; _msg: string;
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

const CURRENCIES = ['USD','SDG','EUR','GBP','SAR','AED','EGP','ETB','KES','UGX','TZS','NGN','XAF'];

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
  company_id: '' as string,
  allow_reconciliation: false,
  account_currency: '' as string,
  notes: '' as string,
  deprecated: false,
};

type FormState = typeof BLANK_FORM;

export default function AccountingCOA() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const { authReady } = useAppContext();
  const navigate = useNavigate();
  const allowed   = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const roleCanManage = hasAnyRole(['super_admin', 'admin']);

  const overrideCanManage = usePageManageOverride('acct-coa', roleCanManage);

  const canManage = roleCanManage || overrideCanManage;
  const { toast } = useToast();
  const { countryId: defaultCountryId, loading: acctCountryLoading } = useAccountingCountry();

  const [rows, setRows]               = useState<Account[]>([]);
  const [countries, setCountries]     = useState<Country[]>([]);
  const [companies, setCompanies]     = useState<Company[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [search, setSearch]           = useState('');
  const [typeFilter, setTypeFilter]   = useState<string>('all');
  const [activeFilter, setActiveFilter]     = useState<string>('all');
  const [postableFilter, setPostableFilter] = useState<string>('all');
  const [countryFilter, setCountryFilter]   = useState<string>('all');
  const [companyFilter, setCompanyFilter]   = useState<string>('all');
  const [countryFilterInitialized, setCountryFilterInitialized] = useState(false);
  const [companyFilterInitialized, setCompanyFilterInitialized] = useState(false);
  const [showGlobalAccounts, setShowGlobalAccounts] = useState<boolean>(true);
  const [expanded, setExpanded]       = useState<Set<string>>(new Set());
  const [balances, setBalances]       = useState<Map<string, { dr: number; cr: number; net: number }>>(new Map());
  const [balanceMigrationNeeded, setBalanceMigrationNeeded] = useState(false);
  const [detailAccount, setDetailAccount] = useState<Account | null>(null);

  const COA_COMPANY_KEY = 'pact-coa-company-filter';

  useEffect(() => {
    if (!acctCountryLoading && !countryFilterInitialized) {
      setCountryFilter(defaultCountryId);
      setCountryFilterInitialized(true);
    }
  }, [acctCountryLoading, defaultCountryId, countryFilterInitialized]);

  // Initialise company filter from localStorage once companies are loaded
  useEffect(() => {
    if (companyFilterInitialized || companies.length === 0) return;
    const saved = localStorage.getItem(COA_COMPANY_KEY);
    const valid = saved && (saved === 'all' || companies.some(c => c.id === saved));
    setCompanyFilter(valid ? saved! : (companies[0]?.id ?? 'all'));
    setCompanyFilterInitialized(true);
  }, [companies, companyFilterInitialized]);

  const handleCompanyFilter = (v: string) => {
    setCompanyFilter(v);
    localStorage.setItem(COA_COMPANY_KEY, v);
  };

  // ── dialog states ─────────────────────────────────────────
  const [formOpen, setFormOpen]       = useState(false);
  const [editTarget, setEditTarget]   = useState<Account | null>(null);
  const [form, setForm]               = useState<FormState>(BLANK_FORM);
  const [saving, setSaving]           = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [deleteChecking, setDeleteChecking] = useState(false);
  const [deleteBlocked, setDeleteBlocked]   = useState(false);
  const [deleteUsageMsg, setDeleteUsageMsg] = useState('');

  // ── import states ─────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen]   = useState(false);
  const [importRows, setImportRows]   = useState<ImportRow[]>([]);
  const [importing, setImporting]     = useState(false);

  // ── load ──────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    setError(null);
    const [acctRes, ctrRes, coRes, balRes] = await Promise.all([
      supabase
        .from('acct_accounts')
        .select('id, code, name_en, name_ar, account_type, subtype, parent_id, is_active, is_postable, version, country_id, company_id, allow_reconciliation, account_currency, notes, deprecated, account_tags')
        .order('code', { ascending: true }),
      supabase
        .from('countries')
        .select('id, code, name_en, name_ar, currency_code, currency_symbol, flag_emoji')
        .eq('is_active', true)
        .order('name_en'),
      supabase
        .from('companies' as any)
        .select('id, name_en, currency_code')
        .eq('is_active', true)
        .order('name_en'),
      supabase
        .from('vw_account_balances' as any)
        .select('account_id, total_dr, total_cr, net_balance'),
    ]);
    if (acctRes.error) setError(acctRes.error.message);
    setRows((acctRes.data ?? []) as Account[]);
    setCountries((ctrRes.data ?? []) as Country[]);
    setCompanies(((coRes.data ?? []) as Company[]));

    // Build balance map — priority:
    //   1. RPC  get_account_balances()  (server-side aggregate, no row-cap)
    //   2. View vw_account_balances     (if migration was already run)
    //   3. Skip — balances stay empty until migration is run
    const bmap = new Map<string, { dr: number; cr: number; net: number }>();

    const buildMap = (rows: any[]) => {
      for (const b of rows) {
        bmap.set(b.account_id, {
          dr:  Number(b.total_dr    ?? 0),
          cr:  Number(b.total_cr    ?? 0),
          net: Number(b.net_balance ?? 0),
        });
      }
    };

    // Try RPC first (works even before the view exists)
    const { data: rpcData, error: rpcErr } = await (supabase as any).rpc('get_account_balances');
    if (!rpcErr && rpcData && rpcData.length > 0) {
      buildMap(rpcData);
      setBalanceMigrationNeeded(false);
    } else if (!balRes.error && balRes.data && balRes.data.length > 0) {
      // RPC not yet deployed → use view data
      buildMap(balRes.data as any[]);
      setBalanceMigrationNeeded(false);
    } else {
      // Neither exists yet — show migration banner
      setBalanceMigrationNeeded(true);
    }

    setBalances(bmap);
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
      if (companyFilter !== 'all') {
        // Show the company's own accounts; also show unassigned (global) accounts if toggle is on
        const isGlobal = r.company_id === null || r.company_id === '';
        if (isGlobal && !showGlobalAccounts) return false;
        if (!isGlobal && r.company_id !== companyFilter) return false;
      }
      if (q) {
        return r.code.toLowerCase().includes(q)
          || r.name_en.toLowerCase().includes(q)
          || (r.name_ar ?? '').toLowerCase().includes(q)
          || r.subtype.toLowerCase().includes(q);
      }
      return true;
    });
  }, [rows, search, typeFilter, activeFilter, postableFilter, countryFilter, companyFilter]);

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
    const header = [
      'Code', 'Name (EN)', 'Name (AR)', 'Type', 'Subtype',
      'Allow Reconciliation', 'Account Currency', 'Company', 'Country',
      'Active', 'Postable', 'Deprecated', 'Notes', 'Parent Code', 'Version',
    ];
    const codeOf = (id: string | null) => rows.find(r => r.id === id)?.code ?? '';
    const body = filtered.map(r => {
      const ctr = countries.find(c => c.id === r.country_id);
      const co  = companies.find(c => c.id === r.company_id);
      return [
        r.code, r.name_en, r.name_ar ?? '', r.account_type, r.subtype ?? '',
        r.allow_reconciliation ? 'Yes' : 'No', r.account_currency ?? '', co?.name_en ?? '', ctr?.code ?? '',
        r.is_active ? 'Yes' : 'No', r.is_postable ? 'Yes' : 'No', r.deprecated ? 'Yes' : 'No',
        r.notes ?? '', codeOf(r.parent_id), r.version,
      ];
    });
    downloadCsv(`chart-of-accounts-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  const exportExcel = () => {
    const codeOf = (id: string | null) => rows.find(r => r.id === id)?.code ?? '';
    const data = filtered.map(r => {
      const ctr = countries.find(c => c.id === r.country_id);
      const co  = companies.find(c => c.id === r.company_id);
      return {
        Code: r.code, 'Name (EN)': r.name_en, 'Name (AR)': r.name_ar ?? '',
        Type: r.account_type, Subtype: r.subtype ?? '',
        'Allow Reconciliation': r.allow_reconciliation ? 'Yes' : 'No',
        'Account Currency': r.account_currency ?? '', Company: co?.name_en ?? '', Country: ctr?.code ?? '',
        Active: r.is_active ? 'Yes' : 'No', Postable: r.is_postable ? 'Yes' : 'No',
        Deprecated: r.deprecated ? 'Yes' : 'No', Notes: r.notes ?? '',
        'Parent Code': codeOf(r.parent_id), Version: r.version,
      };
    });
    exportToExcel(data, `chart-of-accounts-${new Date().toISOString().slice(0, 10)}`);
  };

  // ── CSV/XLSX import parse ──────────────────────────────────
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const text = await file.text();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) { toast({ title: 'File is empty', variant: 'destructive' }); return; }
    const header = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
    const idx = (name: string) => header.findIndex(h => h.includes(name));
    const iCode = idx('code'); const iNameEn = idx('name (en)'); const iNameAr = idx('name (ar)');
    const iType = idx('type'); const iSubtype = idx('subtype'); const iRecon = idx('reconciliation');
    const iCurr = idx('currency'); const iCo = idx('company'); const iActive = idx('active');
    const iNotes = idx('notes');
    const existing = new Map(rows.map(r => [r.code, r]));
    const parsed: ImportRow[] = lines.slice(1).map(line => {
      const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
      const code = cols[iCode] ?? '';
      const accountType = (cols[iType] ?? 'expense').toLowerCase();
      const validTypes = ['asset','liability','equity','revenue','expense'];
      let _status: ImportRow['_status'] = existing.has(code) ? 'update' : 'new';
      let _msg = '';
      if (!code) { _status = 'error'; _msg = 'Missing code'; }
      else if (!validTypes.includes(accountType)) { _status = 'error'; _msg = `Unknown type: ${accountType}`; }
      return {
        code,
        name_en: cols[iNameEn] ?? '',
        name_ar: cols[iNameAr] ?? '',
        account_type: accountType,
        subtype: cols[iSubtype] ?? 'general',
        allow_reconciliation: (cols[iRecon] ?? '').toLowerCase() === 'yes',
        account_currency: cols[iCurr] ?? '',
        company_code: cols[iCo] ?? '',
        is_active: (cols[iActive] ?? 'yes').toLowerCase() !== 'no',
        notes: cols[iNotes] ?? '',
        _status, _msg,
      };
    });
    setImportRows(parsed);
    setImportOpen(true);
  };

  const executeImport = async () => {
    const valid = importRows.filter(r => r._status !== 'error');
    if (!valid.length) return;
    setImporting(true);
    let ok = 0; let fail = 0;
    for (const r of valid) {
      const co = companies.find(c => c.name_en.toLowerCase() === r.company_code.toLowerCase());
      const payload = {
        code: r.code, name_en: r.name_en, name_ar: r.name_ar || null,
        account_type: r.account_type, subtype: r.subtype || 'general',
        allow_reconciliation: r.allow_reconciliation,
        account_currency: r.account_currency || null,
        company_id: co?.id ?? null,
        is_active: r.is_active, notes: r.notes || null,
      };
      const { error: err } = r._status === 'update'
        ? await supabase.from('acct_accounts').update(payload).eq('code', r.code)
        : await supabase.from('acct_accounts').insert({ ...payload, version: 1, is_postable: true });
      if (err) fail++; else ok++;
    }
    setImporting(false);
    setImportOpen(false);
    setImportRows([]);
    toast({ title: `Import complete — ${ok} succeeded, ${fail} failed` });
    await load();
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
      code:                 acct.code,
      name_en:              acct.name_en,
      name_ar:              acct.name_ar ?? '',
      account_type:         acct.account_type,
      subtype:              acct.subtype ?? '',
      parent_id:            acct.parent_id ?? '',
      is_active:            acct.is_active,
      is_postable:          acct.is_postable,
      country_id:           acct.country_id ?? '',
      company_id:           acct.company_id ?? '',
      allow_reconciliation: acct.allow_reconciliation ?? false,
      account_currency:     acct.account_currency ?? '',
      notes:                acct.notes ?? '',
      deprecated:           acct.deprecated ?? false,
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
      code:                 form.code.trim(),
      name_en:              form.name_en.trim(),
      name_ar:              form.name_ar.trim() || null,
      account_type:         form.account_type,
      subtype:              form.subtype.trim() || 'general',
      parent_id:            form.parent_id || null,
      is_active:            form.is_active,
      is_postable:          form.is_postable,
      country_id:           form.country_id || null,
      company_id:           form.company_id || null,
      allow_reconciliation: form.allow_reconciliation,
      account_currency:     form.account_currency || null,
      notes:                form.notes.trim() || null,
      deprecated:           form.deprecated,
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
  // Debit-normal account types: positive net = normal state
  const DEBIT_NORMAL = new Set<Account['account_type']>(['asset', 'expense']);

  const renderRow = (acct: Account, depth: number): React.ReactNode => {
    const kids   = childrenOf.get(acct.id) ?? [];
    const isOpen = expanded.has(acct.id);
    const ctr    = countries.find(c => c.id === acct.country_id);
    const bal    = balances.get(acct.id);
    const net    = bal?.net ?? 0;
    const hasActivity = !!bal;
    const isDebitNormal = DEBIT_NORMAL.has(acct.account_type);
    // "Normal" means the balance is on the expected side for the account type
    const isNormalBalance = isDebitNormal ? net >= 0 : net <= 0;
    const balColor = !hasActivity
      ? 'text-muted-foreground'
      : isNormalBalance
        ? 'text-emerald-700 dark:text-emerald-400'
        : 'text-rose-600 dark:text-rose-400';

    return (
      <div key={acct.id} data-testid={`row-acct-${acct.id}`}>
        <div
          className="grid grid-cols-12 gap-2 px-3 py-2 border-b items-center hover:bg-muted/40 group cursor-pointer"
          onClick={() => setDetailAccount(acct)}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && setDetailAccount(acct)}
          aria-label={`View details for ${acct.code} ${acct.name_en}`}
        >
          {/* Code */}
          <div className="col-span-2 flex items-center gap-1" style={{ paddingLeft: `${depth * 16}px` }}>
            {kids.length > 0 ? (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); toggle(acct.id); }}
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
          <div className="col-span-2 text-sm truncate">{acct.name_en}</div>
          <div className="col-span-1 text-sm text-muted-foreground truncate" dir="rtl" lang="ar">{acct.name_ar}</div>

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

          {/* Balance */}
          <div
            className={cn('col-span-2 text-right font-mono text-xs tabular-nums', balColor)}
            title={hasActivity ? `DR: ${formatNumber(bal!.dr)}  |  CR: ${formatNumber(bal!.cr)}` : 'No posted entries'}
          >
            {hasActivity
              ? formatNumber(Math.abs(net))
              : <span className="opacity-30">—</span>
            }
          </div>

          {/* Flags + actions */}
          <div className="col-span-2 flex gap-1 justify-end items-center">
            {!acct.is_active   && <Badge variant="outline" className="text-[10px] bg-zinc-100 text-zinc-700">Inactive</Badge>}
            {!acct.is_postable && <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-700">Header</Badge>}
            {canManage && (
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); openEdit(acct); }}
                  className="p-1 rounded hover:bg-blue-50 text-blue-600"
                  title="Edit account"
                  data-testid={`button-edit-${acct.id}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); void openDelete(acct); }}
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
  if (!authReady || !isAuthenticated) {
    return <PageLoader label="Checking session…" />;
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
        <div className="flex gap-2 flex-wrap justify-end">
          {canManage && (
            <Button size="sm" onClick={openAdd} data-testid="button-add-account">
              <Plus className="w-4 h-4 mr-1" /> Add Account
            </Button>
          )}
          {canManage && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={handleImportFile}
              />
              <Button
                variant="outline" size="sm"
                onClick={() => fileRef.current?.click()}
                data-testid="button-import-coa"
              >
                <Upload className="w-4 h-4 mr-1" /> Import CSV
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => void load()} data-testid="button-refresh">
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={!filtered.length} data-testid="button-export-coa">
            <Download className="w-4 h-4 mr-1" /> Excel
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
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

            <div className="space-y-1">
              <Select value={companyFilter} onValueChange={handleCompanyFilter}>
                <SelectTrigger data-testid="select-company-filter">
                  <Building2 className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
                  <SelectValue placeholder="Company" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All companies</SelectItem>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {companyFilter !== 'all' && (
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer pl-0.5">
                  <input
                    type="checkbox"
                    className="w-3 h-3 accent-primary"
                    checked={showGlobalAccounts}
                    onChange={e => setShowGlobalAccounts(e.target.checked)}
                  />
                  Include global accounts
                </label>
              )}
            </div>

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

          {balanceMigrationNeeded && !loading && (
            <div className="p-3 rounded border border-amber-200 bg-amber-50 text-amber-900 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" />
              <div>
                <span className="font-medium">Account balances are not available yet.</span>
                {' '}Run <code className="bg-amber-100 rounded px-1 text-xs">20260817_vw_account_balances.sql</code> in{' '}
                <span className="font-medium">Supabase Studio → SQL Editor</span> to activate live balances for all accounts.
                This also enables DR/CR breakdowns in the account detail panel.
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
                <div className="col-span-2">Code</div>
                <div className="col-span-2">Name (EN)</div>
                <div className="col-span-1">Name (AR)</div>
                <div className="col-span-1">Type</div>
                <div className="col-span-1">Subtype</div>
                <div className="col-span-1">Country</div>
                <div className="col-span-2 text-right">Balance</div>
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
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col" data-testid="dialog-account-form">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{editTarget ? 'Edit Account' : 'Add Account'}</DialogTitle>
            <DialogDescription>
              {editTarget
                ? `Editing ${editTarget.code} — ${editTarget.name_en}`
                : 'Create a new account in the Chart of Accounts.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
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

            {/* Country + Company */}
            <div className="grid grid-cols-2 gap-3">
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
              <div className="space-y-1">
                <Label htmlFor="f-company">Company</Label>
                <Select
                  value={form.company_id || '__none__'}
                  onValueChange={v => setField('company_id', v === '__none__' ? '' : v)}
                >
                  <SelectTrigger id="f-company" data-testid="select-form-company">
                    <SelectValue placeholder="Select company" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Unassigned —</SelectItem>
                    {companies.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Account Currency */}
            <div className="space-y-1">
              <Label htmlFor="f-currency">Account Currency <span className="text-muted-foreground text-[11px]">(leave blank to use company default)</span></Label>
              <Select
                value={form.account_currency || '__none__'}
                onValueChange={v => setField('account_currency', v === '__none__' ? '' : v)}
              >
                <SelectTrigger id="f-currency" data-testid="select-form-currency">
                  <SelectValue placeholder="Use company default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Use company default —</SelectItem>
                  {CURRENCIES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label htmlFor="f-notes">Notes</Label>
              <Textarea
                id="f-notes"
                placeholder="Optional internal notes…"
                value={form.notes}
                onChange={e => setField('notes', e.target.value)}
                rows={2}
                data-testid="textarea-notes"
              />
            </div>

            {/* Toggles */}
            <div className="flex flex-wrap gap-6">
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
                <Label htmlFor="f-postable">Postable</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="f-recon"
                  checked={form.allow_reconciliation}
                  onCheckedChange={v => setField('allow_reconciliation', v)}
                  data-testid="switch-allow-reconciliation"
                />
                <Label htmlFor="f-recon">Allow Reconciliation</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="f-deprecated"
                  checked={form.deprecated}
                  onCheckedChange={v => setField('deprecated', v)}
                  data-testid="switch-deprecated"
                />
                <Label htmlFor="f-deprecated">Deprecated</Label>
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
          IMPORT PREVIEW DIALOG
      ════════════════════════════════════════════════════ */}
      <Dialog open={importOpen} onOpenChange={open => { if (!open) { setImportOpen(false); setImportRows([]); } }}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col" data-testid="dialog-import-coa">
          <DialogHeader>
            <DialogTitle>Import Preview — {importRows.length} rows</DialogTitle>
            <DialogDescription>
              Review before importing. Rows marked <span className="text-rose-600 font-medium">Error</span> will be skipped.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-auto flex-1 border rounded">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Name (EN)</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Subtype</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importRows.map((r, i) => (
                  <TableRow key={i} className={r._status === 'error' ? 'bg-rose-50' : r._status === 'update' ? 'bg-amber-50' : ''}>
                    <TableCell>
                      {r._status === 'error'  && <XCircle className="w-4 h-4 text-rose-500" />}
                      {r._status === 'update' && <AlertCircle className="w-4 h-4 text-amber-500" />}
                      {r._status === 'new'    && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.code}</TableCell>
                    <TableCell className="text-xs">{r.name_en}</TableCell>
                    <TableCell className="text-xs">{r.account_type}</TableCell>
                    <TableCell className="text-xs">{r.subtype}</TableCell>
                    <TableCell className="text-xs">{r.company_code}</TableCell>
                    <TableCell className="text-xs">{r.account_currency}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn('text-[10px]',
                          r._status === 'error'  ? 'border-rose-300 text-rose-700 bg-rose-50' :
                          r._status === 'update' ? 'border-amber-300 text-amber-700 bg-amber-50' :
                          'border-emerald-300 text-emerald-700 bg-emerald-50'
                        )}
                      >
                        {r._status === 'new' ? 'New' : r._status === 'update' ? 'Update' : 'Error'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">{r._msg}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between pt-2 text-sm text-muted-foreground">
            <span>
              <span className="text-emerald-700 font-medium">{importRows.filter(r => r._status === 'new').length} new</span>
              {' · '}
              <span className="text-amber-700 font-medium">{importRows.filter(r => r._status === 'update').length} update</span>
              {' · '}
              <span className="text-rose-700 font-medium">{importRows.filter(r => r._status === 'error').length} skip</span>
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setImportOpen(false); setImportRows([]); }}>Cancel</Button>
              <Button
                onClick={() => void executeImport()}
                disabled={importing || importRows.every(r => r._status === 'error')}
                data-testid="button-confirm-import"
              >
                {importing && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Import {importRows.filter(r => r._status !== 'error').length} rows
              </Button>
            </div>
          </div>
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

      {/* ════════════════════════════════════════════════════
          ACCOUNT DETAIL SHEET
      ════════════════════════════════════════════════════ */}
      <Sheet open={!!detailAccount} onOpenChange={open => { if (!open) setDetailAccount(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
          {detailAccount && (() => {
            const acct  = detailAccount;
            const ctr   = countries.find(c => c.id === acct.country_id);
            const co    = companies.find(c => c.id === acct.company_id);
            const bal   = balances.get(acct.id);
            const net   = bal?.net ?? 0;
            const hasActivity = !!bal;
            const isDebitNormal = new Set(['asset','expense']).has(acct.account_type);
            const isNormal = isDebitNormal ? net >= 0 : net <= 0;
            const parentAcct = acct.parent_id ? rows.find(r => r.id === acct.parent_id) : null;

            return (
              <>
                {/* Header */}
                <div className={cn('px-6 pt-6 pb-4 flex-shrink-0 border-b', TYPE_TONE[acct.account_type])}>
                  <SheetHeader className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn('text-[10px] px-1.5', TYPE_TONE[acct.account_type])}>
                        {ACCT_TYPE_LABELS[acct.account_type]?.en ?? acct.account_type}
                      </Badge>
                      {!acct.is_active && <Badge variant="outline" className="text-[10px] bg-zinc-100 text-zinc-700">Inactive</Badge>}
                      {!acct.is_postable && <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-700">Header</Badge>}
                      {acct.deprecated && <Badge variant="outline" className="text-[10px] bg-rose-100 text-rose-700">Deprecated</Badge>}
                    </div>
                    <SheetTitle className="text-xl font-bold leading-tight">{acct.code}</SheetTitle>
                    <SheetDescription asChild>
                      <div>
                        <p className="text-sm font-medium text-foreground">{acct.name_en}</p>
                        {acct.name_ar && (
                          <p className="text-sm text-muted-foreground" dir="rtl" lang="ar">{acct.name_ar}</p>
                        )}
                      </div>
                    </SheetDescription>
                  </SheetHeader>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

                  {/* Balance card */}
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                    <p className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wide">Account Balance (Posted)</p>
                    {hasActivity ? (
                      <>
                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-0.5">Debit Total</p>
                            <p className="font-mono text-sm font-semibold text-blue-700">{formatNumber(bal!.dr)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-0.5">Credit Total</p>
                            <p className="font-mono text-sm font-semibold text-violet-700">{formatNumber(bal!.cr)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-0.5">Net Balance</p>
                            <p className={cn('font-mono text-sm font-bold flex items-center justify-center gap-1',
                              isNormal ? 'text-emerald-700' : 'text-rose-600'
                            )}>
                              {net > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : net < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                              {formatNumber(Math.abs(net))}
                            </p>
                          </div>
                        </div>
                        <p className="text-[10px] text-center text-muted-foreground">
                          {isDebitNormal ? 'Debit-normal' : 'Credit-normal'} account
                          {isNormal ? ' — balance is on the expected side' : ' — balance is on the abnormal side'}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-2">No posted journal entries yet</p>
                    )}
                  </div>

                  <Separator />

                  {/* Classification */}
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wide">Classification</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <div>
                        <p className="text-[10px] text-muted-foreground">Type</p>
                        <p className="font-medium capitalize">{acct.account_type}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Subtype</p>
                        <p className="font-medium">{acct.subtype || <span className="text-muted-foreground">—</span>}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Country</p>
                        <p className="font-medium">{ctr ? `${ctr.flag_emoji ?? ''} ${ctr.name_en}` : <span className="text-muted-foreground">Unassigned</span>}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Company</p>
                        <p className="font-medium">{co?.name_en ?? <span className="text-muted-foreground">Unassigned</span>}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Currency</p>
                        <p className="font-medium">{acct.account_currency ?? <span className="text-muted-foreground">Company default</span>}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Parent Account</p>
                        <p className="font-medium font-mono text-xs">{parentAcct ? `${parentAcct.code} — ${parentAcct.name_en}` : <span className="text-muted-foreground">Root</span>}</p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Settings */}
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wide">Settings</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Active',               value: acct.is_active },
                        { label: 'Postable',             value: acct.is_postable },
                        { label: 'Allow Reconciliation', value: acct.allow_reconciliation },
                        { label: 'Deprecated',           value: acct.deprecated },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex items-center gap-2 text-sm">
                          {value
                            ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                            : <XCircle      className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
                          }
                          <span className={value ? '' : 'text-muted-foreground'}>{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {acct.notes && (
                    <>
                      <Separator />
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wide">Notes</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{acct.notes}</p>
                      </div>
                    </>
                  )}

                  <div className="text-[10px] text-muted-foreground">Version {acct.version}</div>
                </div>

                {/* Footer actions */}
                <div className="flex-shrink-0 border-t px-6 py-3 flex gap-2">
                  {canManage && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => { setDetailAccount(null); openEdit(acct); }}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Edit Account
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      navigate(`/accounting?tab=ledger&account=${acct.id}`);
                    }}
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1" /> View in Ledger
                  </Button>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

    </div>
  );
}
