import { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Loader2, RefreshCw, Download, Search, ShieldAlert, ShieldCheck,
  AlertTriangle, CheckCircle2, User, Info, Lock, Unlock, Eye,
} from 'lucide-react';
import { format, parseISO, subMonths } from 'date-fns';
import { downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';

interface JournalEntry {
  id: string; entry_no: string; posting_date: string;
  description_en: string | null; source_type: string | null;
  created_by: string; posted_by: string | null;
  posted_at: string | null; created_at: string; status: string;
}
interface Profile { id: string; full_name: string | null; username: string | null; email: string | null }
interface SODFlag { key: string; is_enabled: boolean }

interface Violation {
  entry: JournalEntry;
  creatorName: string;
  violationType: 'self_posted';
}

const DATE_RANGES = [
  { value: '1m',  label: 'Last 1 month' },
  { value: '3m',  label: 'Last 3 months' },
  { value: '6m',  label: 'Last 6 months' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'all', label: 'All time' },
];

export default function AccountingSOD() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed     = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'auditor']);
  const canToggle   = hasAnyRole(['super_admin']);
  const { toast }   = useToast();

  const [entries, setEntries]     = useState<JournalEntry[]>([]);
  const [profiles, setProfiles]   = useState<Profile[]>([]);
  const [sodFlag, setSodFlag]     = useState<SODFlag | null>(null);
  const [loading, setLoading]     = useState(true);
  const [toggling, setToggling]   = useState(false);

  const [search, setSearch]       = useState('');
  const [dateRange, setDateRange] = useState('3m');

  const load = useCallback(async () => {
    setLoading(true);
    const cutoff = dateRange === 'all' ? null : subMonths(new Date(), parseInt(dateRange)).toISOString();

    let q = supabase.from('acct_journal_entries')
      .select('id, entry_no, posting_date, description_en, source_type, created_by, posted_by, posted_at, created_at, status')
      .eq('status', 'posted')
      .not('posted_by', 'is', null)
      .order('posting_date', { ascending: false })
      .limit(5000);
    if (cutoff) q = q.gte('created_at', cutoff);

    const [{ data: jData }, { data: fData }] = await Promise.all([
      q,
      supabase.from('feature_flags').select('key, is_enabled').eq('key', 'acct.sod.enforce').single(),
    ]);

    const postedEntries = ((jData ?? []) as JournalEntry[]).filter(e => e.created_by === e.posted_by);
    setEntries(postedEntries);
    setSodFlag(fData ? { key: fData.key, is_enabled: fData.is_enabled } : null);

    if (postedEntries.length > 0) {
      const userIds = [...new Set(postedEntries.map(e => e.created_by).filter(Boolean))];
      const { data: pData } = await supabase.from('profiles').select('id, full_name, username, email').in('id', userIds);
      setProfiles((pData ?? []) as Profile[]);
    }
    setLoading(false);
  }, [dateRange]);

  useEffect(() => { if (allowed) void load(); }, [allowed, dateRange]);

  const getName = (id: string) => {
    const p = profiles.find(p => p.id === id);
    return p?.full_name || p?.username || p?.email || id.slice(0, 8) + '…';
  };

  const violations = useMemo((): Violation[] =>
    entries.map(e => ({
      entry: e,
      creatorName: getName(e.created_by),
      violationType: 'self_posted' as const,
    })).filter(v => {
      if (search) {
        const q = search.toLowerCase();
        if (!v.entry.entry_no.toLowerCase().includes(q) && !v.creatorName.toLowerCase().includes(q)) return false;
      }
      return true;
    }),
    [entries, profiles, search]
  );

  const violationsByUser = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of violations) m.set(v.creatorName, (m.get(v.creatorName) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [violations]);

  const toggleSOD = async () => {
    if (!sodFlag || !canToggle) return;
    setToggling(true);
    const { error } = await supabase.from('feature_flags')
      .update({ is_enabled: !sodFlag.is_enabled, updated_at: new Date().toISOString() })
      .eq('key', 'acct.sod.enforce');
    setToggling(false);
    if (error) toast({ title: 'Toggle failed', description: error.message, variant: 'destructive' });
    else {
      setSodFlag({ ...sodFlag, is_enabled: !sodFlag.is_enabled });
      toast({ title: `SOD enforcement ${!sodFlag.is_enabled ? 'enabled' : 'disabled'}` });
    }
  };

  const exportCsv = () => {
    downloadCsv('sod_violations.csv', [
      ['Entry No', 'Posting Date', 'Created & Posted By', 'Source Type', 'Description', 'Posted At'],
      ...violations.map(v => [
        v.entry.entry_no, v.entry.posting_date, v.creatorName,
        v.entry.source_type ?? '', v.entry.description_en ?? '',
        v.entry.posted_at ?? '',
      ]),
    ]);
  };

  if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed)   return <Navigate to="/" replace />;

  const isEnforcing = sodFlag?.is_enabled ?? false;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-[1050px]">
      <PageInfoBanner
        title="Segregation of Duties (SOD)"
        description="Detects journal entries where the same user both created and posted (self-approved). SOD violations indicate a control weakness — either enforce mode (blocks posting) or log-only mode."
        workflowSteps={['Journal Created by User A', 'Must be reviewed & approved by User B', 'SOD violation if A = B', 'Log or Block based on enforcement flag']}
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-rose-600" /> Segregation of Duties
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Journal entries where the creator and approver are the same person.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} data-testid="button-refresh-sod"><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={violations.length === 0} data-testid="button-export-sod"><Download className="w-4 h-4 mr-1" /> Export</Button>
        </div>
      </div>

      {/* SOD Flag Control */}
      <Card className={cn('border', isEnforcing ? 'border-rose-200 bg-rose-50/40 dark:border-rose-800/50 dark:bg-rose-950/10' : 'border-amber-200 bg-amber-50/40 dark:border-amber-800/50 dark:bg-amber-950/10')}>
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className={cn('p-3 rounded-xl', isEnforcing ? 'bg-rose-100 dark:bg-rose-900/30' : 'bg-amber-100 dark:bg-amber-900/30')}>
            {isEnforcing ? <Lock className="w-6 h-6 text-rose-600" /> : <Unlock className="w-6 h-6 text-amber-600" />}
          </div>
          <div className="flex-1">
            <p className={cn('font-semibold text-sm', isEnforcing ? 'text-rose-800 dark:text-rose-400' : 'text-amber-800 dark:text-amber-400')}>
              SOD Enforcement: {isEnforcing ? 'BLOCKING' : 'LOG ONLY'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isEnforcing
                ? 'Self-approval is currently blocked — users cannot post their own journal entries.'
                : 'Self-approvals are being logged but not blocked. Enable enforcement to prevent them.'}
            </p>
          </div>
          {canToggle && sodFlag && (
            <div className="flex items-center gap-2 shrink-0">
              <Label htmlFor="sod-toggle" className="text-xs text-muted-foreground">{isEnforcing ? 'Enforcing' : 'Log Only'}</Label>
              <Switch
                id="sod-toggle"
                checked={isEnforcing}
                disabled={toggling}
                onCheckedChange={toggleSOD}
                data-testid="switch-sod-enforce"
              />
            </div>
          )}
          {!sodFlag && (
            <div className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Feature flag not found — apply Phase 4 migration.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className={cn('rounded-xl border p-4', violations.length === 0 ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200' : 'bg-rose-50 dark:bg-rose-950/20 border-rose-200')}>
          <div className="flex items-center gap-3">
            {violations.length === 0 ? <CheckCircle2 className="w-8 h-8 text-emerald-500" /> : <ShieldAlert className="w-8 h-8 text-rose-500" />}
            <div>
              <p className={cn('text-3xl font-bold', violations.length === 0 ? 'text-emerald-600' : 'text-rose-600')}>{violations.length}</p>
              <p className="text-xs text-muted-foreground">SOD violations detected</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border p-4 bg-muted/30 sm:col-span-2">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Top Offenders</p>
          {violationsByUser.length === 0 ? (
            <p className="text-sm text-muted-foreground">No violations in selected range.</p>
          ) : (
            <div className="space-y-1.5">
              {violationsByUser.map(([name, count]) => (
                <div key={name} className="flex items-center gap-2" data-testid={`row-offender-${name}`}>
                  <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm flex-1">{name}</span>
                  <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[10px]">{count} violation{count !== 1 ? 's' : ''}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Violation List */}
      <Card className="border shadow-sm">
        <CardHeader className="p-4 border-b">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search entry no or user…" className="pl-9 h-9 text-sm" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-sod" />
            </div>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[150px] h-9" data-testid="select-range-sod"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DATE_RANGES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : violations.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ShieldCheck className="w-10 h-10 mx-auto mb-3 text-emerald-400 opacity-60" />
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">No SOD violations detected</p>
              <p className="text-xs mt-1">All posted journal entries in the selected period have separate creators and approvers.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-b">
                    <tr>
                      {['Entry No', 'Posting Date', 'Created & Posted By', 'Source Type', 'Description', 'Posted At'].map(h => (
                        <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {violations.map(v => (
                      <tr key={v.entry.id} className="hover:bg-rose-50/30 dark:hover:bg-rose-950/10" data-testid={`row-sod-${v.entry.id}`}>
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-rose-700">{v.entry.entry_no}</td>
                        <td className="px-4 py-3 text-xs">{format(parseISO(v.entry.posting_date), 'dd MMM yyyy')}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                              <User className="w-3 h-3 text-rose-600" />
                            </div>
                            <span className="text-sm font-medium">{v.creatorName}</span>
                            <Badge variant="outline" className="text-[9px] bg-rose-50 text-rose-600 border-rose-200 px-1">self</Badge>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground capitalize">{v.entry.source_type?.replace(/_/g, ' ') ?? '—'}</td>
                        <td className="px-4 py-3 text-xs max-w-[200px] truncate" title={v.entry.description_en ?? ''}>
                          {v.entry.description_en || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {v.entry.posted_at ? format(parseISO(v.entry.posted_at), 'dd MMM yyyy HH:mm') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-4 border-t">
                <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50/40 dark:bg-amber-950/10 rounded p-3 border border-amber-200">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <div>
                    <strong>Remediation:</strong> Review each violation with the audit committee. For historical violations, document a management override justification. Going forward, ensure journal entries are reviewed and posted by a different authorized user.
                    {!isEnforcing && <span className="ml-1">Enable SOD enforcement above to block future self-approvals.</span>}
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
