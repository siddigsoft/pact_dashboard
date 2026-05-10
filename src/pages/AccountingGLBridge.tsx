import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2, XCircle, AlertCircle, Zap, Clock, ChevronDown,
  ChevronRight, RefreshCw, Shield, ArrowRight, BookOpen, Database,
  Activity, BarChart3, FileText
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { POSTING_TEMPLATES, COA_ACCOUNTS, type PostingTemplate } from '@/services/accounting/postingTemplates';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { format } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BridgeSummaryRow {
  source_table:  string;
  event_type:    string;
  success_count: number;
  error_count:   number;
  skipped_count: number;
  last_fired_at: string | null;
  last_error:    string | null;
}

interface BridgeLogRow {
  id:               string;
  source_table:     string;
  source_id:        string;
  event_type:       string;
  status:           'success' | 'error' | 'skipped';
  journal_entry_id: string | null;
  error_message:    string | null;
  created_at:       string;
}

interface FeatureFlagRow {
  key:        string;
  is_enabled: boolean;
  description: string;
}

interface ReconRow {
  check_name:       string;
  gl_balance:       number;
  subledger_total:  number;
  variance:         number;
  passed:           boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  success: 'text-green-600 dark:text-green-400',
  error:   'text-red-600 dark:text-red-400',
  skipped: 'text-amber-600 dark:text-amber-400',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  error:   <XCircle      className="h-4 w-4 text-red-500" />,
  skipped: <AlertCircle  className="h-4 w-4 text-amber-500" />,
};

function fmt(n: number | string | null | undefined): string {
  if (n == null) return '0';
  return Number(n).toLocaleString();
}

// ─── Bridge health card ───────────────────────────────────────────────────────

function BridgeHealthCard({
  template,
  summary,
  flagEnabled,
}: {
  template: PostingTemplate;
  summary?: BridgeSummaryRow;
  flagEnabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasErrors = (summary?.error_count ?? 0) > 0;
  const totalFired = (summary?.success_count ?? 0) + (summary?.error_count ?? 0);

  return (
    <Card className={cn(
      'border transition-all',
      hasErrors
        ? 'border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-950/20'
        : flagEnabled
        ? 'border-green-200 dark:border-green-800'
        : 'border-amber-200 dark:border-amber-800 opacity-70'
    )}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer select-none pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {open
                  ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                }
                <div className="min-w-0">
                  <CardTitle className="text-sm font-semibold truncate">
                    {template.labelEn}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5 font-arabic">
                    {template.labelAr}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {flagEnabled
                  ? <Badge variant="outline" className="text-green-600 border-green-300 text-xs">Active</Badge>
                  : <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">Disabled</Badge>
                }
                {hasErrors && (
                  <Badge variant="destructive" className="text-xs">
                    {summary!.error_count} error{summary!.error_count > 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2 pl-6">
              <span className="flex items-center gap-1">
                <Database className="h-3 w-3" />
                {template.sourceTable}
              </span>
              <span className="flex items-center gap-1">
                <Activity className="h-3 w-3" />
                Trigger: <code className="text-xs bg-muted px-1 rounded">{template.triggerStatus}</code>
              </span>
              {totalFired > 0 && (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  {fmt(summary?.success_count)} posted
                </span>
              )}
              {summary?.last_fired_at && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Last: {format(new Date(summary.last_fired_at), 'MMM d, HH:mm')}
                </span>
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pl-6 space-y-4">
            {/* Trigger condition */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Trigger Condition</p>
              <code className="text-xs bg-muted rounded px-2 py-1 block">
                {template.triggerCondition}
              </code>
            </div>

            {/* Journal entry template */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Journal Entry Template</p>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-xs w-20">DR / CR</TableHead>
                      <TableHead className="text-xs w-20">Code</TableHead>
                      <TableHead className="text-xs">Account</TableHead>
                      <TableHead className="text-xs">Amount Source</TableHead>
                      <TableHead className="text-xs w-24">Function</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {template.lines.map((line, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-xs font-mono font-bold',
                              line.debitCredit === 'DR'
                                ? 'text-blue-700 border-blue-300 bg-blue-50 dark:bg-blue-950/30'
                                : 'text-purple-700 border-purple-300 bg-purple-50 dark:bg-purple-950/30'
                            )}
                          >
                            {line.debitCredit}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{line.accountCode.split('[')[0]}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {COA_ACCOUNTS[line.accountCode] ?? line.accountName}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground italic">
                          {line.amountSource}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">{line.glFunction}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Notes */}
            {template.notes && (
              <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 border-l-2 border-primary/30">
                <span className="font-medium">Note: </span>{template.notes}
              </div>
            )}

            {/* Last error */}
            {summary?.last_error && (
              <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded p-2 border border-red-200 dark:border-red-800">
                <span className="font-medium">Last error: </span>
                <code>{summary.last_error}</code>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AccountingGLBridge() {
  const [reconDate, setReconDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Bridge summary from DB view
  const { data: summaryRows = [], refetch: refetchSummary, isFetching: loadingSummary } =
    useQuery<BridgeSummaryRow[]>({
      queryKey: ['acct-bridge-summary'],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('v_acct_gl_bridge_summary')
          .select('*')
          .order('source_table');
        if (error) throw error;
        return data ?? [];
      },
      staleTime: 30_000,
    });

  // Recent bridge log
  const { data: logRows = [], refetch: refetchLog, isFetching: loadingLog } =
    useQuery<BridgeLogRow[]>({
      queryKey: ['acct-bridge-log-recent'],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('acct_gl_bridge_log')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
        if (error) throw error;
        return data ?? [];
      },
      staleTime: 30_000,
    });

  // Feature flags
  const { data: flags = [] } = useQuery<FeatureFlagRow[]>({
    queryKey: ['acct-bridge-flags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('key, is_enabled, description')
        .like('key', 'acct.bridge.%');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  // Reconciliation check
  const {
    data: reconRows = [],
    refetch: refetchRecon,
    isFetching: loadingRecon,
  } = useQuery<ReconRow[]>({
    queryKey: ['acct-bridge-recon', reconDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('acct_recon_subledger_check', {
        p_check_date: reconDate,
      });
      if (error) throw error;
      return (data ?? []) as ReconRow[];
    },
    staleTime: 60_000,
  });

  const handleRefresh = useCallback(() => {
    refetchSummary();
    refetchLog();
    refetchRecon();
  }, [refetchSummary, refetchLog, refetchRecon]);

  // Compute KPIs
  const totalSuccess = summaryRows.reduce((s, r) => s + Number(r.success_count), 0);
  const totalErrors  = summaryRows.reduce((s, r) => s + Number(r.error_count), 0);
  const reconPassed  = reconRows.filter(r => r.passed).length;
  const reconFailed  = reconRows.filter(r => !r.passed).length;
  const activeFlags  = flags.filter(f => f.is_enabled).length;

  // Map summaries by source_table + event_type
  const summaryMap = new Map<string, BridgeSummaryRow>();
  summaryRows.forEach(r => summaryMap.set(`${r.source_table}::${r.event_type}`, r));

  // Map flags by key
  const flagMap = new Map<string, boolean>();
  flags.forEach(f => flagMap.set(f.key, f.is_enabled));

  const isFetching = loadingSummary || loadingLog || loadingRecon;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">GL Bridge Engine</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Automatic journal posting from operational PACT modules into the General Ledger
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isFetching}
          data-testid="button-refresh-bridge"
          className="shrink-0"
        >
          <RefreshCw className={cn('h-4 w-4 mr-1.5', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Page Info Banner */}
      <PageInfoBanner
        title="GL Bridge Engine — محرك الجسر المالي"
        description="The GL Bridge Engine automatically converts operational activity into General Ledger journal entries — without any manual data entry. Whenever a cost submission is marked as paid, or a down-payment request is fully settled, a database trigger fires and posts the correct double-entry journal directly to the GL. This page lets you monitor each bridge's health, view the full audit log of every posting event, run a reconciliation check to confirm the GL matches the source sub-ledgers, and read the complete posting map showing exactly which accounts are debited and credited for each event type. Each bridge can be individually enabled or disabled via its feature flag."
        descriptionAr="محرك الجسر المالي يحوّل النشاط التشغيلي تلقائياً إلى قيود يومية في دفتر الأستاذ العام — دون أي إدخال يدوي. عندما يُسجَّل صرف مستحقات كـ«مدفوع»، أو يُسدَّد طلب دفعة مقدّمة بالكامل، تنطلق إشارة قاعدة البيانات وتُنشئ القيد المزدوج الصحيح مباشرةً في الأستاذ العام. تتيح هذه الصفحة مراقبة حالة كل جسر، وعرض سجل المراجعة الكامل لكل عملية ترحيل، وتشغيل فحص التوفيق للتحقق من تطابق الأستاذ العام مع دفاتر المصادر الفرعية، والاطلاع على خريطة الترحيل الكاملة التي تبيّن الحسابات المدينة والدائنة لكل نوع من أنواع الأحداث. يمكن تفعيل كل جسر أو تعطيله بشكل مستقل عبر علامة الميزة الخاصة به."
        workflowSteps={[
          { step: 1, role: 'Finance Admin', action: 'Approve / Mark Paid', description: 'A cost submission status changes to "paid", or a down-payment is fully settled in the system.' },
          { step: 2, role: 'System', action: 'DB Trigger Fires', description: 'A PostgreSQL trigger on the source table detects the status change and calls the bridge function.' },
          { step: 3, role: 'System', action: 'Journal Posted to GL', description: 'The bridge function creates a balanced double-entry journal in acct_journal_entries and logs the result in acct_gl_bridge_log.' },
          { step: 4, role: 'Super Admin', action: 'Monitor & Reconcile', description: 'Use this page to check bridge health, review the audit log, and run the reconciliation check to confirm GL = sub-ledger totals.' },
        ]}
        workflowStepsAr={[
          { step: 1, role: 'مدير المالية', action: 'الموافقة / التسجيل كمدفوع', description: 'يتغير حالة طلب التكاليف إلى «مدفوع»، أو يُسدَّد طلب الدفعة المقدّمة بالكامل في النظام.' },
          { step: 2, role: 'النظام', action: 'اشتعال إشارة قاعدة البيانات', description: 'تكتشف إشارة PostgreSQL على جدول المصدر تغيير الحالة وتستدعي دالة الجسر.' },
          { step: 3, role: 'النظام', action: 'ترحيل القيد إلى الأستاذ العام', description: 'تنشئ دالة الجسر قيداً مزدوجاً متوازناً في acct_journal_entries وتسجّل النتيجة في acct_gl_bridge_log.' },
          { step: 4, role: 'المشرف والمدير', action: 'المراقبة والتوفيق', description: 'استخدم هذه الصفحة للتحقق من صحة الجسر ومراجعة سجل المراجعة وتشغيل فحص التوفيق لتأكيد مطابقة الأستاذ العام للأرصدة الفرعية.' },
        ]}
      />

      {/* KPI bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-xs text-muted-foreground">Total Posted</span>
          </div>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400"
             data-testid="kpi-total-posted">{fmt(totalSuccess)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="text-xs text-muted-foreground">Bridge Errors</span>
          </div>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400"
             data-testid="kpi-bridge-errors">{fmt(totalErrors)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-muted-foreground">Active Bridges</span>
          </div>
          <p className="text-2xl font-bold" data-testid="kpi-active-bridges">
            {activeFlags} / {flags.length}
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="h-4 w-4 text-purple-500" />
            <span className="text-xs text-muted-foreground">Recon Checks</span>
          </div>
          <p className="text-2xl font-bold" data-testid="kpi-recon-checks">
            <span className="text-green-600 dark:text-green-400">{reconPassed}</span>
            {reconRows.length > 0 && (
              <>
                {' '}/{' '}
                {reconFailed > 0
                  ? <span className="text-red-600 dark:text-red-400">{reconRows.length}</span>
                  : reconRows.length}
              </>
            )}
          </p>
        </Card>
      </div>

      {/* Main tabs */}
      <Tabs defaultValue="bridges">
        <TabsList className="mb-4">
          <TabsTrigger value="bridges">
            <Zap className="h-4 w-4 mr-1.5" />Bridges
          </TabsTrigger>
          <TabsTrigger value="log">
            <FileText className="h-4 w-4 mr-1.5" />Audit Log
          </TabsTrigger>
          <TabsTrigger value="recon">
            <BarChart3 className="h-4 w-4 mr-1.5" />Recon Check
          </TabsTrigger>
          <TabsTrigger value="docs">
            <BookOpen className="h-4 w-4 mr-1.5" />Posting Map
          </TabsTrigger>
        </TabsList>

        {/* ── Bridges tab ───────────────────────────────────────────────────── */}
        <TabsContent value="bridges" className="space-y-3">
          {POSTING_TEMPLATES.map(template => {
            const summary = summaryMap.get(
              `${template.sourceTable}::${template.eventType}`
            );
            const flagEnabled = flagMap.get(template.featureFlag) ?? false;
            return (
              <BridgeHealthCard
                key={template.id}
                template={template}
                summary={summary}
                flagEnabled={flagEnabled}
                data-testid={`bridge-card-${template.id}`}
              />
            );
          })}

          {POSTING_TEMPLATES.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No posting templates registered.
            </div>
          )}
        </TabsContent>

        {/* ── Audit Log tab ─────────────────────────────────────────────────── */}
        <TabsContent value="log">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Bridge Execution Log
                <span className="font-normal text-muted-foreground ml-2">(last 100 events)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Source Table</TableHead>
                      <TableHead className="text-xs">Event</TableHead>
                      <TableHead className="text-xs">Source ID</TableHead>
                      <TableHead className="text-xs">Journal Entry</TableHead>
                      <TableHead className="text-xs">Error</TableHead>
                      <TableHead className="text-xs">Fired At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-8">
                          No bridge events logged yet. Events appear here the first time a trigger fires.
                        </TableCell>
                      </TableRow>
                    )}
                    {logRows.map(row => (
                      <TableRow key={row.id} data-testid={`log-row-${row.id}`}>
                        <TableCell>
                          <span className={cn('flex items-center gap-1 text-xs', STATUS_COLOR[row.status])}>
                            {STATUS_ICON[row.status]}
                            {row.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{row.source_table}</TableCell>
                        <TableCell className="text-xs">{row.event_type}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {row.source_id.slice(0, 8)}…
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {row.journal_entry_id ? row.journal_entry_id.slice(0, 8) + '…' : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-red-600 max-w-48 truncate">
                          {row.error_message ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(row.created_at), 'MMM d, HH:mm:ss')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Recon Check tab ───────────────────────────────────────────────── */}
        <TabsContent value="recon" className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">Check Date</label>
            <input
              type="date"
              value={reconDate}
              onChange={e => setReconDate(e.target.value)}
              className="border rounded px-2 py-1 text-sm bg-background"
              data-testid="input-recon-date"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetchRecon()}
              disabled={loadingRecon}
              data-testid="button-run-recon"
            >
              <RefreshCw className={cn('h-4 w-4 mr-1.5', loadingRecon && 'animate-spin')} />
              Run
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Check</TableHead>
                    <TableHead className="text-xs text-right">GL Balance</TableHead>
                    <TableHead className="text-xs text-right">Sub-ledger</TableHead>
                    <TableHead className="text-xs text-right">Variance</TableHead>
                    <TableHead className="text-xs text-center">Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reconRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-8">
                        {loadingRecon
                          ? 'Running reconciliation…'
                          : 'Click Run to execute the reconciliation check.'}
                      </TableCell>
                    </TableRow>
                  )}
                  {reconRows.map((row, i) => (
                    <TableRow key={i} data-testid={`recon-row-${i}`}>
                      <TableCell className="text-sm">{row.check_name}</TableCell>
                      <TableCell className="text-sm text-right font-mono">
                        {Number(row.gl_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-sm text-right font-mono">
                        {Number(row.subledger_total).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className={cn(
                        'text-sm text-right font-mono font-semibold',
                        Math.abs(Number(row.variance)) > 1
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-green-600 dark:text-green-400'
                      )}>
                        {Number(row.variance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.passed
                          ? <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                          : <XCircle      className="h-4 w-4 text-red-500 mx-auto" />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Reconciliation checks compare GL control account balances against source sub-ledger totals.
            Variances over SDG 1 are flagged as failures. Triggers on the source tables must be enabled
            for the GL to reflect operational activity.
          </p>
        </TabsContent>

        {/* ── Posting Map (docs) tab ────────────────────────────────────────── */}
        <TabsContent value="docs" className="space-y-4">
          <div className="grid gap-4">
            {POSTING_TEMPLATES.map(template => (
              <Card key={template.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      {template.labelEn}
                      <span className="text-muted-foreground font-normal ml-2 text-xs font-arabic">
                        {template.labelAr}
                      </span>
                    </CardTitle>
                    <Badge variant="secondary" className="text-xs font-mono">
                      {template.featureFlag}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Database className="h-3 w-3" />{template.sourceTable}
                    </span>
                    <ArrowRight className="h-3 w-3" />
                    <code className="bg-muted px-1 rounded">{template.eventType}</code>
                    <span>when</span>
                    <code className="bg-muted px-1 rounded">{template.triggerStatus}</code>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-1">
                    {template.lines.map((line, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <Badge
                          variant="outline"
                          className={cn(
                            'w-8 justify-center font-mono font-bold shrink-0',
                            line.debitCredit === 'DR'
                              ? 'text-blue-700 border-blue-300'
                              : 'text-purple-700 border-purple-300'
                          )}
                        >
                          {line.debitCredit}
                        </Badge>
                        <code className="text-muted-foreground w-12 shrink-0">{line.accountCode.split('[')[0]}</code>
                        <span className="text-muted-foreground truncate">{line.description}</span>
                      </div>
                    ))}
                  </div>
                  {template.notes && (
                    <p className="text-xs text-muted-foreground mt-2 italic">{template.notes}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
