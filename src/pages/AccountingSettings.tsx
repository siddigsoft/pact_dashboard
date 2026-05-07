import { useEffect, useState, useCallback } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Loader2, RefreshCw, Settings2, FlaskConical, AlertTriangle, CheckCircle2,
  Globe, Save, Database, Activity, Zap, Shield, BookOpen, BarChart3,
  TrendingUp, Package, Landmark, Clock, FileText, ShoppingCart, Receipt,
  ClipboardList, ChevronRight, ExternalLink, Wallet, CreditCard, PiggyBank,
  ListChecks, Circle, AlertCircle, Info,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAccountingCountry } from '@/hooks/use-accounting-country';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatNumber } from '@/lib/accountingFormat';

interface FeatureFlag {
  key: string; description: string; is_enabled: boolean;
  rolled_out_pct: number; updated_at: string;
}
interface SeedResult {
  reset_performed: boolean; funds_inserted: number; partners_inserted: number;
  sanctions_inserted: number; entries_inserted: number; entries_skipped: number;
  fy_id: string; period_count: number;
}
interface TableHealth {
  table: string; label: string; icon: React.ElementType;
  count: number | null; loading: boolean; error: boolean; link?: string;
}

const FLAG_DANGER: Record<string, string> = {
  'acct.parallel_run.enabled':  'Enabling this marks the system as live-cutover. The synthetic seed tool will refuse to run.',
  'acct.sanctions.block_on_match': 'When ON, journals referencing a sanctioned partner are hard-blocked. When OFF, matches are logged only.',
  'acct.sod.enforce': 'When ON, Segregation-of-Duties violations block posting. When OFF, violations are logged only.',
};

const DEFAULT_FLAGS: Omit<FeatureFlag, 'updated_at'>[] = [
  { key: 'acct.parallel_run.enabled',    description: 'Live-cutover mode. Disables synthetic seed.',           is_enabled: false, rolled_out_pct: 100 },
  { key: 'acct.sanctions.block_on_match',description: 'Hard-block journals matching sanctioned partners.',      is_enabled: false, rolled_out_pct: 100 },
  { key: 'acct.sod.enforce',             description: 'Enforce Segregation-of-Duties on journal posting.',      is_enabled: false, rolled_out_pct: 100 },
  { key: 'acct.gl_bridge.enabled',       description: 'Enable automatic GL posting from operational modules.',  is_enabled: true,  rolled_out_pct: 100 },
  { key: 'acct.budget_check.enabled',    description: 'Block journal posting when budget is exceeded.',         is_enabled: false, rolled_out_pct: 100 },
  { key: 'acct.multi_currency.enabled',  description: 'Allow journals in non-base currency with auto-revaluation.', is_enabled: false, rolled_out_pct: 100 },
  { key: 'acct.po_three_way_match',      description: 'Require PO + GRN + Invoice 3-way match before payment.', is_enabled: true,  rolled_out_pct: 100 },
  { key: 'acct.auto_period_close',       description: 'Automatically close fiscal periods 5 days after period end.', is_enabled: false, rolled_out_pct: 100 },
  { key: 'acct.bridge.acct_depreciation_runs',   description: 'Phase 4: Log GL bridge entry when a depreciation run completes. Enable after applying accounting_gl_bridges_phase4.sql.',          is_enabled: false, rolled_out_pct: 100 },
  { key: 'acct.bridge.acct_allocation_runs',     description: 'Phase 4: Log GL visibility entry for cost allocation runs. Enable after applying accounting_gl_bridges_phase4.sql.',               is_enabled: false, rolled_out_pct: 100 },
  { key: 'acct.bridge.acct_budget_encumbrances', description: 'Phase 4: Post encumbrance journal (DR Expense / CR 2105) on PO/PR creation. Enable only after Chart of Accounts and a GENERAL fund are configured.', is_enabled: false, rolled_out_pct: 100 },
  { key: 'acct.bridge.leave_requests',           description: 'Phase 4: Post leave liability journal (DR Leave Expense / CR 2240 Leave Payable) when a leave request is approved.',               is_enabled: false, rolled_out_pct: 100 },
  { key: 'acct.bridge.cash_flow_adj',            description: 'Phase 5: Post GL journal for cash flow adjustments (Inflow: DR Cash / CR Clearing; Outflow reversed). Disabled by default — enable after COA seeded with 1110 + 4990.', is_enabled: false, rolled_out_pct: 100 },
  { key: 'acct.bridge.grants',                   description: 'Phase 5: Log GL bridge entry when a grant status changes (draft → active → closed → expired). Enabled for audit visibility.',      is_enabled: true,  rolled_out_pct: 100 },
  { key: 'acct.bridge.milestones',               description: 'Phase 5: Log GL bridge entry when a grant milestone is accepted. Enabled for grant compliance tracking.',                          is_enabled: true,  rolled_out_pct: 100 },
  { key: 'acct.bridge.bank_recon',               description: 'Phase 6: Log GL bridge entry when a bank statement line is matched or un-matched to a journal entry. Enabled for audit trail.',    is_enabled: true,  rolled_out_pct: 100 },
  { key: 'acct.bank_recon.auto_suggest',         description: 'Phase 6: (Future) Auto-suggest journal entry matches for bank statement lines based on amount + date proximity.',                  is_enabled: false, rolled_out_pct: 100 },
  { key: 'acct.posting_engine.enabled',          description: 'Master GL posting engine switch. Disabling this blocks all Phase 4 bridge postings.',                                              is_enabled: true,  rolled_out_pct: 100 },
];

const MODULE_TABLES: { table: string; label: string; icon: React.ElementType; link?: string }[] = [
  { table: 'acct_accounts',            label: 'Chart of Accounts',    icon: BarChart3,    link: '/accounting/coa' },
  { table: 'acct_journal_entries',    label: 'Journal Entries',       icon: BookOpen,     link: '/accounting/journals' },
  { table: 'acct_journal_lines',      label: 'Journal Lines',         icon: Receipt,      link: '/accounting/journals' },
  { table: 'acct_fiscal_years',       label: 'Fiscal Years',          icon: Clock,        link: '/accounting/fiscal-years' },
  { table: 'acct_fiscal_periods',     label: 'Fiscal Periods',        icon: Clock,        link: '/accounting/fiscal-years' },
  { table: 'acct_funds',              label: 'Funds',                 icon: Wallet,       link: '/accounting/funds' },
  { table: 'acct_vendors',            label: 'Vendors',               icon: Landmark,     link: '/accounting/vendors' },
  { table: 'acct_purchase_orders',    label: 'Purchase Orders',       icon: ShoppingCart, link: '/accounting/purchase-orders' },
  { table: 'acct_purchase_requisitions', label: 'Purchase Requisitions', icon: ClipboardList, link: '/accounting/purchase-requisitions' },
  { table: 'acct_grn_receipts',       label: 'Goods Receipt Notes',   icon: Package,      link: '/accounting/grn' },
  { table: 'acct_invoices',           label: 'AP Invoices',           icon: FileText,     link: '/accounting/ap-invoices' },
  { table: 'acct_cheque_register',    label: 'Cheque Register',       icon: CreditCard,   link: '/accounting/cheque-register' },
  { table: 'acct_bank_accounts',      label: 'Bank Accounts',         icon: Landmark,     link: '/accounting/bank-recon' },
  { table: 'acct_bank_statement_lines', label: 'Bank Statement Lines', icon: Activity,    link: '/accounting/bank-recon' },
  { table: 'acct_fixed_assets',       label: 'Fixed Assets',          icon: Package,      link: '/accounting/fixed-assets' },
  { table: 'acct_budget_lines',       label: 'Budget Lines',          icon: PiggyBank,    link: '/accounting/budget-planning' },
  { table: 'acct_gl_bridge_log',      label: 'GL Bridge Log',         icon: Zap,          link: '/accounting/gl-bridge' },
  { table: 'feature_flags',           label: 'Feature Flags',         icon: Settings2,    link: '/accounting/settings' },
  { table: 'acct_tax_codes',          label: 'Tax Codes',             icon: Receipt,      link: '/accounting/tax' },
  { table: 'acct_exchange_rates',     label: 'Exchange Rates',        icon: TrendingUp,   link: '/accounting/multi-currency' },
  { table: 'acct_period_close_log',   label: 'Period Close Log',      icon: Shield,       link: '/accounting/period-close' },
  { table: 'acct_budget_encumbrances',  label: 'Budget Encumbrances',  icon: Wallet,       link: '/accounting/budget-encumbrance' },
  { table: 'acct_grants',              label: 'Grants',                icon: TrendingUp,   link: '/accounting/grants' },
  { table: 'acct_grant_expenses',      label: 'Grant Expenses',        icon: Receipt,      link: '/accounting/grants' },
  { table: 'acct_cost_allocation_rules', label: 'Allocation Rules',    icon: Zap,          link: '/accounting/cost-allocation' },
  { table: 'acct_allocation_runs',     label: 'Allocation Runs',       icon: Activity,     link: '/accounting/cost-allocation' },
  { table: 'acct_depreciation_runs',   label: 'Depreciation Runs',     icon: Package,      link: '/accounting/depreciation-run' },
];

const PHASE_ROADMAP = [
  {
    phase: 'Phase 1', label: 'Core Accounting Foundation', status: 'complete' as const,
    items: [
      'Chart of Accounts (COA) with bilingual support',
      'Fiscal Years & Accounting Periods',
      'Fund Registry & multi-fund tracking',
      'Manual Journal Entry creation & approval workflow',
      'Trial Balance & General Ledger',
      'Income Statement & Balance Sheet',
      'Bank Reconciliation module',
      'Budget vs. Actual variance analysis',
      'Budget Planning — set account targets per period & fund with CSV import',
    ],
  },
  {
    phase: 'Phase 2', label: 'GL Bridge & P2P Setup', status: 'complete' as const,
    items: [
      'GL Bridge Engine — auto-post from operational modules',
      'Payroll → GL bridge (approved & disbursed)',
      'Withdrawal requests → GL bridge',
      'Operational cost submissions → GL bridge',
      'Down-payment advances → GL bridge',
      'Salary advances → GL bridge',
      'P2P table schema (PR, PO, GRN, AP Invoice, Cheque)',
      'Sub-ledger reconciliation RPC',
    ],
  },
  {
    phase: 'Phase 3', label: 'Full P2P Cycle UI', status: 'complete' as const,
    items: [
      'Purchase Requisitions — lifecycle management',
      'Purchase Orders — approval workflow',
      'Goods Receipt Notes — 3-way match support',
      'AP Invoices — match to PO & GRN, post to GL',
      'Cheque Register — payment tracking & clearing',
      'Vendor Registry — contact, banking & rating',
      'AP Aging Report — overdue payables tracking',
    ],
  },
  {
    phase: 'Phase 5', label: 'Expansion & Consolidation', status: 'complete' as const,
    items: [
      'Cash Flow Forecast — 12-month rolling projection from bank balances, AP, POs, encumbrances',
      'Grant Tracking — donor grant registry with award vs spent vs remaining, burn rate, expiry alerts',
      'Cost Allocation Engine — overhead pool distribution with equal/budget %/headcount bases',
      'Depreciation Run — one-click batch straight-line depreciation with GL posting & run history',
      'Financial Consolidation — multi-entity roll-up, entity comparison, inter-entity eliminations',
      'Phase 5 SQL migration — acct_grants, acct_grant_expenses, acct_cost_allocation_rules, acct_allocation_runs, acct_depreciation_runs, acct_cash_flow_adjustments',
    ],
  },
  {
    phase: 'Phase 4', label: 'Advanced Controls', status: 'complete' as const,
    items: [
      'Multi-currency exchange rate registry & converter',
      'Period-close checklist (Open → Soft → Hard → Locked) with pre-close health checks',
      'Tax management — VAT / WHT / Customs code registry with GL mapping',
      'SOD (Segregation of Duties) violation log & enforcement flag',
      'Budget encumbrance & commitment accounting (PR/PO → liquidate)',
      'Intercompany / inter-fund eliminations report',
      'Donor-restricted fund reporting by restriction type',
      'Phase 4 SQL migration — acct_tax_codes, acct_exchange_rates, acct_period_close_log, acct_budget_encumbrances',
    ],
  },
];

export default function AccountingSettings() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const { isSuperAdmin }                     = useSuperAdmin();
  const allowed   = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canToggle = isSuperAdmin;
  const { toast } = useToast();
  const { countryId, setCountryId, saveProfileCountry, countries: acctCountries, selectedCountry, loading: acctLoading } = useAccountingCountry();
  const [savingCountry, setSavingCountry] = useState(false);

  const [flags, setFlags]       = useState<FeatureFlag[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [seedingFlags, setSeedingFlags] = useState(false);

  const [tableHealth, setTableHealth] = useState<TableHealth[]>(
    MODULE_TABLES.map(t => ({ ...t, count: null, loading: true, error: false }))
  );

  const [seedEntries, setSeedEntries] = useState('20');
  const [seedReset, setSeedReset]     = useState(false);
  const [seeding, setSeeding]         = useState(false);
  const [seedResult, setSeedResult]   = useState<SeedResult | null>(null);

  const [activeSection, setActiveSection] = useState<string>('health');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('feature_flags')
      .select('key, description, is_enabled, rolled_out_pct, updated_at')
      .like('key', 'acct.%')
      .order('key');
    if (err) setError(err.message);
    setFlags((data ?? []) as FeatureFlag[]);
    setLoading(false);
  }, []);

  useEffect(() => { if (allowed) { void load(); void loadHealth(); } }, [allowed]);

  const loadHealth = async () => {
    setTableHealth(MODULE_TABLES.map(t => ({ ...t, count: null, loading: true, error: false })));
    const results = await Promise.all(
      MODULE_TABLES.map(async (t) => {
        try {
          const { count, error: err } = await supabase
            .from(t.table as any)
            .select('*', { count: 'exact', head: true });
          return { ...t, count: err ? null : (count ?? 0), loading: false, error: !!err };
        } catch {
          return { ...t, count: null, loading: false, error: true };
        }
      })
    );
    setTableHealth(results);
  };

  const toggleFlag = async (flag: FeatureFlag) => {
    setTogglingKey(flag.key);
    const { error: err } = await supabase
      .from('feature_flags')
      .update({ is_enabled: !flag.is_enabled, updated_at: new Date().toISOString() })
      .eq('key', flag.key);
    setTogglingKey(null);
    if (err) toast({ title: 'Failed to update flag', description: err.message, variant: 'destructive' });
    else { toast({ title: `${flag.key}: ${!flag.is_enabled ? 'Enabled' : 'Disabled'}` }); void load(); }
  };

  const seedDefaultFlags = async () => {
    setSeedingFlags(true);
    let inserted = 0;
    for (const f of DEFAULT_FLAGS) {
      const { error: err } = await supabase
        .from('feature_flags')
        .upsert({ ...f, updated_at: new Date().toISOString() }, { onConflict: 'key', ignoreDuplicates: true });
      if (!err) inserted++;
    }
    setSeedingFlags(false);
    toast({ title: `${inserted} default flags seeded` });
    void load();
  };

  const runSeed = async () => {
    const n = Number(seedEntries);
    if (!Number.isInteger(n) || n < 1 || n > 500) {
      toast({ title: 'Enter a number between 1 and 500', variant: 'destructive' });
      return;
    }
    setSeeding(true);
    setSeedResult(null);
    const { data, error: err } = await supabase.rpc('acct_seed_synthetic', {
      p_target_entries: n, p_reset: seedReset, p_seed: 0.42,
    });
    setSeeding(false);
    if (err) toast({ title: 'Seed failed', description: err.message, variant: 'destructive' });
    else { setSeedResult(data as SeedResult); toast({ title: 'Synthetic data seeded' }); }
  };

  if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  const totalTables = tableHealth.length;
  const activeTables = tableHealth.filter(t => !t.error && t.count !== null && t.count > 0).length;
  const errorTables  = tableHealth.filter(t => t.error).length;
  const healthPct = totalTables > 0 ? Math.round((activeTables / totalTables) * 100) : 0;

  const navItems = [
    { id: 'health',   label: 'Module Health',   icon: Activity },
    { id: 'phases',   label: 'Phase Roadmap',   icon: ListChecks },
    { id: 'flags',    label: 'Feature Flags',   icon: Settings2 },
    { id: 'country',  label: 'Country Scope',   icon: Globe },
    ...(isSuperAdmin ? [{ id: 'seed', label: 'Dev Tools', icon: FlaskConical }] : []),
  ];

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-[1100px] space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings2 className="w-6 h-6 text-blue-600" /> Accounting Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Module health, phase roadmap, feature flags, and developer tools.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { void load(); void loadHealth(); }} data-testid="button-refresh-all">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh All
        </Button>
      </div>

      {/* Horizontal nav */}
      <div className="flex gap-1 flex-wrap border-b">
        {navItems.map(nav => (
          <button
            key={nav.id}
            onClick={() => setActiveSection(nav.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeSection === nav.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
            data-testid={`tab-settings-${nav.id}`}
          >
            <nav.icon className="w-3.5 h-3.5" />
            {nav.label}
          </button>
        ))}
      </div>

      {/* ── MODULE HEALTH ─────────────────────────────────────────────── */}
      {activeSection === 'health' && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Modules', value: totalTables, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30' },
              { label: 'Active (has data)', value: activeTables, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
              { label: 'Empty / New', value: totalTables - activeTables - errorTables, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30' },
              { label: 'Errors / Missing', value: errorTables, color: 'text-rose-600', bg: 'bg-rose-50 dark:bg-rose-950/30' },
            ].map(s => (
              <div key={s.label} className={cn('rounded-xl border p-4', s.bg)}>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={cn('text-2xl font-bold mt-1', s.color)}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Health bar */}
          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Overall Module Health</span>
                <span className={cn('text-sm font-bold', healthPct >= 80 ? 'text-emerald-600' : healthPct >= 50 ? 'text-amber-600' : 'text-rose-600')}>
                  {healthPct}%
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', healthPct >= 80 ? 'bg-emerald-500' : healthPct >= 50 ? 'bg-amber-500' : 'bg-rose-500')}
                  style={{ width: `${healthPct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {activeTables} of {totalTables} tables populated · {errorTables > 0 ? `${errorTables} tables missing (run SQL migrations)` : 'No schema errors detected'}
              </p>
            </CardContent>
          </Card>

          {/* Table grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tableHealth.map(t => {
              const Icon = t.icon;
              const isLoading = t.loading;
              const hasError  = t.error;
              const hasData   = !hasError && t.count !== null && t.count > 0;
              const isEmpty   = !hasError && t.count === 0;
              return (
                <div
                  key={t.table}
                  className={cn(
                    'rounded-xl border p-3.5 flex items-start gap-3',
                    hasError  ? 'border-rose-200 bg-rose-50/50 dark:border-rose-800/50 dark:bg-rose-950/20' :
                    hasData   ? 'border-emerald-200 bg-emerald-50/30 dark:border-emerald-800/50 dark:bg-emerald-950/10' :
                    'border-border bg-muted/20'
                  )}
                  data-testid={`health-row-${t.table}`}
                >
                  <div className={cn('p-2 rounded-lg shrink-0',
                    hasError ? 'bg-rose-100 dark:bg-rose-900/40' :
                    hasData  ? 'bg-emerald-100 dark:bg-emerald-900/40' :
                    'bg-muted')}>
                    <Icon className={cn('w-4 h-4', hasError ? 'text-rose-600' : hasData ? 'text-emerald-600' : 'text-muted-foreground')} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-sm font-medium truncate">{t.label}</p>
                      {isLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0 mt-0.5" />
                      ) : hasError ? (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                      ) : hasData ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{t.table}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      {isLoading ? (
                        <span className="text-xs text-muted-foreground">Checking…</span>
                      ) : hasError ? (
                        <Badge variant="outline" className="text-[10px] border-rose-200 text-rose-700 bg-rose-50">Table missing</Badge>
                      ) : (
                        <Badge variant="outline" className={cn('text-[10px]',
                          hasData ? 'border-emerald-200 text-emerald-700 bg-emerald-50' : 'border-border text-muted-foreground')}>
                          {formatNumber(t.count ?? 0, 0)} rows
                        </Badge>
                      )}
                      {t.link && !hasError && (
                        <Link to={t.link} className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5">
                          Open <ExternalLink className="w-2.5 h-2.5" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {errorTables > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-4 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-400">Missing tables detected</p>
                <p className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">
                  {errorTables} accounting table(s) are missing. Apply the Phase 2 SQL migration
                  (<code className="font-mono text-xs">supabase/migrations/20260520_acct_phase2_gl_bridges.sql</code>) to your Supabase project.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PHASE ROADMAP ─────────────────────────────────────────────── */}
      {activeSection === 'phases' && (
        <div className="space-y-4">
          {PHASE_ROADMAP.map(phase => (
            <Card key={phase.phase} className={cn('border shadow-sm',
              phase.status === 'complete' ? 'border-emerald-200 dark:border-emerald-800/50' :
              phase.status === 'active'   ? 'border-blue-200 dark:border-blue-800/50' :
              'border-border'
            )}>
              <CardHeader className={cn('p-4 border-b',
                phase.status === 'complete' ? 'bg-emerald-50/60 dark:bg-emerald-950/20' :
                phase.status === 'active'   ? 'bg-blue-50/60 dark:bg-blue-950/20' :
                'bg-muted/30'
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
                    phase.status === 'complete' ? 'bg-emerald-500 text-white' :
                    phase.status === 'active'   ? 'bg-blue-500 text-white' :
                    'bg-muted text-muted-foreground border'
                  )}>
                    {phase.status === 'complete' ? '✓' : phase.phase.replace('Phase ', '')}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-base">{phase.phase}</CardTitle>
                      <Badge variant="outline" className={cn('text-[10px]',
                        phase.status === 'complete' ? 'border-emerald-300 text-emerald-700 bg-emerald-50' :
                        phase.status === 'active'   ? 'border-blue-300 text-blue-700 bg-blue-50' :
                        'border-border text-muted-foreground'
                      )}>
                        {phase.status === 'complete' ? '✓ Complete' : phase.status === 'active' ? '⚡ In Progress' : '○ Planned'}
                      </Badge>
                    </div>
                    <CardDescription className="text-xs mt-0.5">{phase.label}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {phase.items.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      {phase.status === 'complete' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      ) : phase.status === 'active' ? (
                        <Activity className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      )}
                      <span className={cn('text-sm', phase.status === 'complete' ? 'text-foreground' : 'text-muted-foreground')}>
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── FEATURE FLAGS ─────────────────────────────────────────────── */}
      {activeSection === 'flags' && (
        <div className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="p-4 border-b flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings2 className="w-4 h-4" /> Feature Flags
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {canToggle ? 'Toggle accounting feature flags. Changes take effect immediately for all users.' : 'Read-only view. Only super admins can toggle flags.'}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                {isSuperAdmin && (
                  <Button size="sm" variant="outline" onClick={seedDefaultFlags} disabled={seedingFlags} data-testid="button-seed-flags">
                    {seedingFlags ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5 mr-1" />}
                    Seed Defaults
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => void load()} data-testid="button-refresh-flags">
                  <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              {error && <div className="p-3 rounded border border-rose-200 bg-rose-50 text-rose-800 text-sm">{error}</div>}
              {loading ? (
                <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
              ) : flags.length === 0 ? (
                <div className="text-center py-10 space-y-3">
                  <Info className="w-10 h-10 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">No accounting feature flags found.</p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Apply the Sprint 1.1 SQL migration, or click "Seed Defaults" above to insert the standard accounting flags.
                  </p>
                  {isSuperAdmin && (
                    <Button size="sm" onClick={seedDefaultFlags} disabled={seedingFlags} data-testid="button-seed-flags-empty">
                      {seedingFlags ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FlaskConical className="w-4 h-4 mr-1" />}
                      Seed Default Flags
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {flags.map(flag => {
                    const danger = FLAG_DANGER[flag.key];
                    const isBusy = togglingKey === flag.key;
                    return (
                      <div key={flag.key}
                        className={cn('rounded-lg border p-3.5 space-y-1.5',
                          flag.is_enabled ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-800/50 dark:bg-emerald-950/10' : 'border-border bg-muted/20')}
                        data-testid={`flag-row-${flag.key}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-semibold">{flag.key}</span>
                              <Badge variant="outline" className={cn('text-[10px]',
                                flag.is_enabled ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-zinc-100 text-zinc-600 border-zinc-200')}>
                                {flag.is_enabled ? 'ON' : 'OFF'}
                              </Badge>
                              {flag.rolled_out_pct < 100 && (
                                <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                                  {flag.rolled_out_pct}% rollout
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-0.5">{flag.description}</p>
                            {danger && (
                              <div className="flex items-start gap-1.5 mt-1.5 text-xs text-amber-700">
                                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                <span>{danger}</span>
                              </div>
                            )}
                            <p className="text-[11px] text-muted-foreground mt-1">
                              Updated {format(parseISO(flag.updated_at), 'dd MMM yyyy HH:mm')}
                            </p>
                          </div>
                          {canToggle ? (
                            <Switch checked={flag.is_enabled} onCheckedChange={() => void toggleFlag(flag)} disabled={isBusy} data-testid={`switch-flag-${flag.key}`} />
                          ) : (
                            flag.is_enabled
                              ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              : <div className="w-4 h-4 rounded-full border-2 border-muted shrink-0" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── COUNTRY SCOPE ─────────────────────────────────────────────── */}
      {activeSection === 'country' && (
        <Card className="border shadow-sm">
          <CardHeader className="bg-gradient-to-r from-teal-50 to-teal-100 dark:from-teal-900/20 dark:to-teal-800/20 border-b p-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-teal-500 rounded-lg"><Globe className="h-4 w-4 text-white" /></div>
              <div>
                <CardTitle className="text-base">Active Country Scope</CardTitle>
                <CardDescription className="text-xs">
                  Your session default country for COA, Journals &amp; Trial Balance.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="space-y-1 flex-1">
                <Label className="text-sm font-medium">Country</Label>
                <Select value={countryId} onValueChange={setCountryId} disabled={acctLoading}>
                  <SelectTrigger className="h-10" data-testid="select-acct-settings-country">
                    <SelectValue placeholder="Select country…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <span className="flex items-center gap-2"><Globe className="h-4 w-4 text-muted-foreground" /> All countries</span>
                    </SelectItem>
                    {acctCountries.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          {c.flag_emoji && <span>{c.flag_emoji}</span>}
                          {c.name_en}
                          <span className="text-muted-foreground text-xs">({c.currency_code})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedCountry && (
                <div className="p-3 bg-muted/50 rounded-lg flex items-center gap-3 min-w-[200px]">
                  <span className="text-2xl">{selectedCountry.flag_emoji ?? '🌍'}</span>
                  <div>
                    <p className="text-sm font-medium">{selectedCountry.name_en}</p>
                    <p className="text-xs text-muted-foreground">{selectedCountry.currency_code} {selectedCountry.currency_symbol}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline"
                onClick={async () => {
                  setSavingCountry(true);
                  const ok = await saveProfileCountry(countryId);
                  setSavingCountry(false);
                  if (ok) toast({ title: 'Default country saved' });
                  else toast({ title: 'Save failed', variant: 'destructive' });
                }}
                disabled={savingCountry || acctLoading}
                data-testid="button-save-acct-country">
                {savingCountry ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                Set as My Default
              </Button>
              <p className="text-xs text-muted-foreground self-center">
                Saves permanently to your profile (same as Settings → Workspace).
              </p>
            </div>

            <Separator />

            {/* Quick links */}
            <div>
              <p className="text-sm font-medium mb-3">Quick Navigation</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { label: 'Chart of Accounts', to: '/accounting/coa', icon: BarChart3 },
                  { label: 'Journal Entries', to: '/accounting/journals', icon: BookOpen },
                  { label: 'Trial Balance', to: '/accounting/trial-balance', icon: TrendingUp },
                  { label: 'General Ledger', to: '/accounting/ledger', icon: BookOpen },
                  { label: 'Financial Statements', to: '/accounting/reports', icon: FileText },
                  { label: 'GL Bridge', to: '/accounting/gl-bridge', icon: Zap },
                ].map(link => (
                  <Link key={link.to} to={link.to}
                    className="flex items-center gap-2 p-2.5 rounded-lg border bg-muted/30 hover:bg-muted/60 transition-colors text-sm">
                    <link.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{link.label}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground ml-auto shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── DEV TOOLS ─────────────────────────────────────────────────── */}
      {activeSection === 'seed' && isSuperAdmin && (
        <div className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="border-b p-4">
              <CardTitle className="text-base flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-violet-600" /> Synthetic Data Generator
              </CardTitle>
              <CardDescription className="text-xs">
                Generate reproducible test journal entries for development and UAT.
                Blocked when <span className="font-mono text-xs">acct.parallel_run.enabled</span> is ON.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="seed-entries">Number of entries (1–500)</Label>
                  <Input id="seed-entries" type="number" min={1} max={500}
                    value={seedEntries} onChange={e => setSeedEntries(e.target.value)}
                    data-testid="input-seed-entries" />
                </div>
                <div className="flex items-end">
                  <div className="flex items-center gap-2">
                    <Switch id="seed-reset" checked={seedReset} onCheckedChange={setSeedReset} data-testid="switch-seed-reset" />
                    <Label htmlFor="seed-reset" className="text-sm">Reset first (delete previous synthetic rows)</Label>
                  </div>
                </div>
              </div>
              <Button onClick={() => void runSeed()} disabled={seeding} variant="outline" data-testid="button-run-seed">
                {seeding ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Seeding…</> : <><FlaskConical className="w-4 h-4 mr-1" /> Run Seed</>}
              </Button>
              {seedResult && (
                <div className="rounded border border-emerald-200 bg-emerald-50 p-4 text-sm space-y-2">
                  <p className="font-semibold text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Seed complete
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-emerald-700">
                    <div><span className="font-medium">Entries:</span> {seedResult.entries_inserted}</div>
                    <div><span className="font-medium">Skipped:</span> {seedResult.entries_skipped}</div>
                    <div><span className="font-medium">Funds:</span> {seedResult.funds_inserted}</div>
                    <div><span className="font-medium">Sanctions:</span> {seedResult.sanctions_inserted}</div>
                    <div><span className="font-medium">Partners:</span> {seedResult.partners_inserted}</div>
                    <div><span className="font-medium">Periods:</span> {seedResult.period_count}</div>
                    <div><span className="font-medium">Reset:</span> {seedResult.reset_performed ? 'Yes' : 'No'}</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border shadow-sm border-amber-200 bg-amber-50/30 dark:border-amber-800/50 dark:bg-amber-950/10">
            <CardContent className="p-4 flex gap-3">
              <Shield className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-400">Developer environment only</p>
                <p className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">
                  These tools generate synthetic data for testing. They are automatically blocked when
                  <code className="font-mono ml-1 text-xs">acct.parallel_run.enabled</code> is ON,
                  which indicates a live production environment.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
