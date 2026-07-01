import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO, addDays } from 'date-fns';
import {
  ShieldCheck, Plus, Trash2, Loader2, AlertTriangle, CheckCircle,
  XCircle, Eye, RefreshCw, Search, BarChart2, Users, Target,
  Copy, Filter, Clock, TrendingUp, Zap, Flag, Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type TabId = 'rules' | 'flags' | 'duplicates' | 'enumerators' | 'targets';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'rules', label: 'Quality Rules', icon: <Settings className="w-3.5 h-3.5" /> },
  { id: 'flags', label: 'Flags', icon: <Flag className="w-3.5 h-3.5" /> },
  { id: 'duplicates', label: 'Duplicates', icon: <Copy className="w-3.5 h-3.5" /> },
  { id: 'enumerators', label: 'Enumerators', icon: <Users className="w-3.5 h-3.5" /> },
  { id: 'targets', label: 'Target Tracking', icon: <Target className="w-3.5 h-3.5" /> },
];

interface FdForm { id: string; name: string; submission_count: number; status: string; }
interface FdRule {
  id: string; form_id: string; name: string;
  rule_type: string; field_name: string | null;
  config: Record<string, any>; severity: string; is_active: boolean; created_at: string;
}
interface FdFlag {
  id: string; form_id: string; submission_id: string | null;
  rule_id: string | null; field_name: string | null; actual_value: string | null;
  expected: string | null; severity: string; status: string; notes: string | null; created_at: string;
  fd_quality_rules?: { name: string } | null;
}
interface FdEnumStat {
  id: string; form_id: string; enumerator_id: string; enumerator_name: string | null;
  submission_count: number; avg_duration_seconds: number | null; flag_count: number;
  flag_rate: number | null; gps_accuracy_avg: number | null; score: number | null;
  score_label: string | null; last_submission_at: string | null;
}
interface FdTarget {
  id: string; form_id: string; target_count: number;
  target_date: string | null; geographic_scope: string | null; notes: string | null;
}

const RULE_TYPES = [
  { value: 'required_field', label: 'Required Field' },
  { value: 'value_range', label: 'Value Range' },
  { value: 'regex', label: 'Regex Pattern' },
  { value: 'gps_bounds', label: 'GPS Bounds' },
  { value: 'duration_range', label: 'Survey Duration' },
  { value: 'no_duplicate', label: 'No Duplicate' },
];
const SEVERITY_COLOR: Record<string, string> = {
  error: 'bg-red-100 text-red-700',
  warning: 'bg-amber-100 text-amber-700',
  info: 'bg-blue-100 text-blue-700',
};
const FLAG_STATUS_COLOR: Record<string, string> = {
  open: 'bg-red-50 text-red-700',
  resolved: 'bg-emerald-50 text-emerald-700',
  dismissed: 'bg-slate-100 text-slate-500',
  false_positive: 'bg-purple-50 text-purple-700',
};
const SCORE_COLOR: Record<string, string> = {
  excellent: 'bg-emerald-100 text-emerald-700',
  good: 'bg-blue-100 text-blue-700',
  needs_review: 'bg-amber-100 text-amber-700',
  poor: 'bg-red-100 text-red-700',
};

export default function FieldDataQuality() {
  const { user } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<TabId>('rules');
  const [selectedForm, setSelectedForm] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Rule dialog
  const [ruleDialog, setRuleDialog] = useState(false);
  const [rName, setRName] = useState('');
  const [rType, setRType] = useState('required_field');
  const [rField, setRField] = useState('');
  const [rSeverity, setRSeverity] = useState('warning');
  const [rConfigMin, setRConfigMin] = useState('');
  const [rConfigMax, setRConfigMax] = useState('');
  const [rConfigPattern, setRConfigPattern] = useState('');
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);

  // Target dialog
  const [targetDialog, setTargetDialog] = useState(false);
  const [tFormId, setTFormId] = useState('');
  const [tCount, setTCount] = useState('');
  const [tDate, setTDate] = useState('');
  const [tScope, setTScope] = useState('All');
  const [tNotes, setTNotes] = useState('');

  const { data: forms = [] } = useQuery<FdForm[]>({
    queryKey: ['fd_forms_quality'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('field_data_forms').select('id,name,submission_count,status')
        .order('name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: rules = [], isLoading: rulesLoading, refetch: refetchRules } = useQuery<FdRule[]>({
    queryKey: ['fd_quality_rules', selectedForm],
    queryFn: async () => {
      let q = (supabase as any).from('fd_quality_rules').select('*').order('created_at', { ascending: false });
      if (selectedForm !== 'all') q = q.eq('form_id', selectedForm);
      const { data, error } = await q;
      if (error && error.code !== '42P01') throw error;
      return data ?? [];
    },
  });

  const { data: flags = [], isLoading: flagsLoading, refetch: refetchFlags } = useQuery<FdFlag[]>({
    queryKey: ['fd_quality_flags', selectedForm],
    queryFn: async () => {
      let q = (supabase as any).from('fd_quality_flags')
        .select('*, fd_quality_rules(name)')
        .order('created_at', { ascending: false }).limit(200);
      if (selectedForm !== 'all') q = q.eq('form_id', selectedForm);
      const { data, error } = await q;
      if (error && error.code !== '42P01') throw error;
      return data ?? [];
    },
  });

  const { data: enumStats = [] } = useQuery<FdEnumStat[]>({
    queryKey: ['fd_enumerator_stats', selectedForm],
    queryFn: async () => {
      let q = (supabase as any).from('fd_enumerator_stats').select('*').order('score', { ascending: false });
      if (selectedForm !== 'all') q = q.eq('form_id', selectedForm);
      const { data, error } = await q;
      if (error && error.code !== '42P01') throw error;
      return data ?? [];
    },
  });

  const { data: targets = [], refetch: refetchTargets } = useQuery<FdTarget[]>({
    queryKey: ['fd_form_targets', selectedForm],
    queryFn: async () => {
      let q = (supabase as any).from('fd_form_targets').select('*').order('created_at', { ascending: false });
      if (selectedForm !== 'all') q = q.eq('form_id', selectedForm);
      const { data, error } = await q;
      if (error && error.code !== '42P01') throw error;
      return data ?? [];
    },
  });

  const createRuleMutation = useMutation({
    mutationFn: async () => {
      if (selectedForm === 'all') throw new Error('Select a form first.');
      const config: Record<string, any> = {};
      if (rConfigMin) config.min = parseFloat(rConfigMin);
      if (rConfigMax) config.max = parseFloat(rConfigMax);
      if (rConfigPattern) config.pattern = rConfigPattern;
      const { error } = await (supabase as any).from('fd_quality_rules').insert({
        form_id: selectedForm, name: rName.trim(), rule_type: rType,
        field_name: rField.trim() || null, config, severity: rSeverity,
        is_active: true, created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd_quality_rules'] });
      setRuleDialog(false);
      setRName(''); setRType('required_field'); setRField(''); setRSeverity('warning');
      setRConfigMin(''); setRConfigMax(''); setRConfigPattern('');
      toast({ title: 'Rule created' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('fd_quality_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fd_quality_rules'] }); setDeleteRuleId(null); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const resolveFlagMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase as any).from('fd_quality_flags')
        .update({ status, resolved_by: user?.id, resolved_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fd_quality_flags'] }),
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const createTargetMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from('fd_form_targets').upsert({
        form_id: tFormId, target_count: parseInt(tCount),
        target_date: tDate || null, geographic_scope: tScope.trim() || 'All',
        notes: tNotes.trim() || null, created_by: user?.id ?? null,
      }, { onConflict: 'form_id,geographic_scope' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd_form_targets'] });
      setTargetDialog(false);
      setTFormId(''); setTCount(''); setTDate(''); setTScope('All'); setTNotes('');
      toast({ title: 'Target saved' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const filteredFlags = flags.filter(f => {
    if (search) {
      const q = search.toLowerCase();
      return (f.field_name ?? '').toLowerCase().includes(q)
        || (f.fd_quality_rules?.name ?? '').toLowerCase().includes(q)
        || (f.actual_value ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  const openFlags = flags.filter(f => f.status === 'open').length;
  const totalRules = rules.length;

  const targetProgress = useMemo(() => {
    return targets.map(t => {
      const form = forms.find(f => f.id === t.form_id);
      const actual = form?.submission_count ?? 0;
      const pct = t.target_count > 0 ? Math.min(100, Math.round((actual / t.target_count) * 100)) : 0;
      const remaining = Math.max(0, t.target_count - actual);
      let forecastDate: string | null = null;
      if (t.target_date && actual > 0) {
        const daysLeft = Math.ceil(remaining / Math.max(1, actual / 30));
        forecastDate = format(addDays(new Date(), daysLeft), 'dd MMM yyyy');
      }
      return { ...t, form, actual, pct, remaining, forecastDate };
    });
  }, [targets, forms]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg">
                <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h1 className="font-semibold text-slate-800 dark:text-slate-100">Data Quality</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Rules · Flags · Duplicates · Enumerator scoring · Target tracking
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={selectedForm} onValueChange={setSelectedForm}>
                <SelectTrigger className="w-52 text-sm" data-testid="select-quality-form">
                  <SelectValue placeholder="All forms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All forms</SelectItem>
                  {forms.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" onClick={() => { refetchRules(); refetchFlags(); refetchTargets(); }} data-testid="button-refresh-quality">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Stats strip */}
          <div className="flex items-center gap-6 pb-3 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5 text-indigo-500" />
              <span className="font-medium text-slate-700">{totalRules}</span> rules
            </span>
            <span className="flex items-center gap-1.5">
              <Flag className="w-3.5 h-3.5 text-red-500" />
              <span className={cn('font-medium', openFlags > 0 ? 'text-red-600' : 'text-slate-700')}>{openFlags}</span> open flags
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-purple-500" />
              <span className="font-medium text-slate-700">{enumStats.length}</span> enumerators tracked
            </span>
            <span className="flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-emerald-500" />
              <span className="font-medium text-slate-700">{targets.length}</span> targets set
            </span>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 overflow-x-auto scrollbar-hide -mb-px">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
                  tab === t.id
                    ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700',
                )}
                data-testid={`tab-quality-${t.id}`}
              >
                {t.icon} {t.label}
                {t.id === 'flags' && openFlags > 0 && (
                  <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                    {openFlags}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* ══════════════════════════ RULES ════════════════════════════════ */}
        {tab === 'rules' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium text-slate-800 dark:text-slate-100">Quality Rules</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Define automated checks applied to every incoming submission.
                </p>
              </div>
              <Button
                size="sm" className="gap-1.5" onClick={() => setRuleDialog(true)}
                disabled={selectedForm === 'all'}
                data-testid="button-add-rule"
              >
                <Plus className="w-4 h-4" /> Add Rule
              </Button>
            </div>
            {selectedForm === 'all' && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Select a form above to add rules or see rules for a specific form.
              </div>
            )}
            {rulesLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
            ) : rules.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
                <ShieldCheck className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No rules yet</p>
                <p className="text-sm text-slate-400">Quality rules automatically flag submissions that fail checks.</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      {['Rule Name', 'Type', 'Field', 'Severity', 'Active', ''].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((r, i) => (
                      <tr key={r.id} className={cn('border-b border-slate-50 dark:border-slate-800', i % 2 === 1 && 'bg-slate-50/50 dark:bg-slate-800/20')} data-testid={`row-rule-${r.id}`}>
                        <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{r.name}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {RULE_TYPES.find(t => t.value === r.rule_type)?.label ?? r.rule_type}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.field_name ?? '—'}</td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary" className={cn('text-xs capitalize', SEVERITY_COLOR[r.severity])}>
                            {r.severity}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {r.is_active
                            ? <CheckCircle className="w-4 h-4 text-emerald-500" />
                            : <XCircle className="w-4 h-4 text-slate-300" />}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => setDeleteRuleId(r.id)} data-testid={`button-delete-rule-${r.id}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════ FLAGS ════════════════════════════════ */}
        {tab === 'flags' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <h2 className="font-medium text-slate-800 dark:text-slate-100">
                Quality Flags
                {openFlags > 0 && <span className="ml-2 text-sm font-normal text-red-600">({openFlags} open)</span>}
              </h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input placeholder="Search flags…" className="pl-9 w-56 text-sm" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-flags" />
              </div>
            </div>
            {flagsLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
            ) : filteredFlags.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
                <CheckCircle className="w-8 h-8 text-emerald-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No flags found</p>
                <p className="text-sm text-slate-400">Submissions that fail quality rules will appear here.</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      {['Rule', 'Field', 'Actual Value', 'Severity', 'Status', 'Date', 'Actions'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFlags.map((f, i) => (
                      <tr key={f.id} className={cn('border-b border-slate-50 dark:border-slate-800', i % 2 === 1 && 'bg-slate-50/50 dark:bg-slate-800/20')} data-testid={`row-flag-${f.id}`}>
                        <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200 max-w-[160px] truncate">{f.fd_quality_rules?.name ?? '—'}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{f.field_name ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-[140px] truncate">{f.actual_value ?? '—'}</td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary" className={cn('text-xs capitalize', SEVERITY_COLOR[f.severity])}>
                            {f.severity}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary" className={cn('text-xs capitalize', FLAG_STATUS_COLOR[f.status])}>
                            {f.status.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">
                          {format(parseISO(f.created_at), 'dd MMM yy')}
                        </td>
                        <td className="px-4 py-3">
                          {f.status === 'open' && (
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-emerald-600 hover:text-emerald-700"
                                onClick={() => resolveFlagMutation.mutate({ id: f.id, status: 'resolved' })}
                                data-testid={`button-resolve-flag-${f.id}`}
                              >
                                Resolve
                              </Button>
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-slate-500"
                                onClick={() => resolveFlagMutation.mutate({ id: f.id, status: 'dismissed' })}
                                data-testid={`button-dismiss-flag-${f.id}`}
                              >
                                Dismiss
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {flags.length >= 200 && (
                  <p className="text-xs text-slate-400 text-center py-2">Showing latest 200 flags.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════ DUPLICATES ══════════════════════════════ */}
        {tab === 'duplicates' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-purple-50 dark:bg-purple-900/30 rounded-lg shrink-0">
                  <Copy className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-slate-800 dark:text-slate-100 mb-1">Duplicate Detection</h3>
                  <p className="text-sm text-slate-500 mb-4">
                    Define a <strong>No Duplicate</strong> rule in the Rules tab for any field (e.g., <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded text-xs">household_id</code>, <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded text-xs">phone</code>) to automatically flag submissions where the same value appears more than once.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                    {[
                      { label: 'Exact duplicate rules', value: rules.filter(r => r.rule_type === 'no_duplicate').length.toString() },
                      { label: 'Duplicate flags (open)', value: flags.filter(f => f.fd_quality_rules?.name?.toLowerCase().includes('duplicate') && f.status === 'open').length.toString() },
                      { label: 'Resolved duplicate flags', value: flags.filter(f => f.fd_quality_rules?.name?.toLowerCase().includes('duplicate') && f.status !== 'open').length.toString() },
                    ].map(s => (
                      <div key={s.label} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-slate-700 dark:text-slate-200">{s.value}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h3 className="font-medium text-slate-800 dark:text-slate-100 mb-3">How duplicate detection works</h3>
              <div className="space-y-3">
                {[
                  { step: '1', title: 'Add a "No Duplicate" rule', desc: 'Go to Rules tab → Add Rule → Type: No Duplicate → Field: household_id (or any unique field).' },
                  { step: '2', title: 'Rule runs on every sync', desc: 'When submissions are imported or synced, each new record is checked against existing submissions for the same form.' },
                  { step: '3', title: 'Flag raised on match', desc: 'If a duplicate value is found, a Flag is created with severity set by the rule (error/warning). The submission ID and duplicate value are recorded.' },
                  { step: '4', title: 'Resolve in Flags tab', desc: 'Review flagged duplicates. Resolve (corrected), Dismiss (intentional), or mark as False Positive.' },
                ].map(s => (
                  <div key={s.step} className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center text-xs font-bold text-purple-700 dark:text-purple-400 shrink-0 mt-0.5">
                      {s.step}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{s.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <Button size="sm" className="mt-4 gap-1.5" onClick={() => { setTab('rules'); setRType('no_duplicate'); setRuleDialog(true); }} disabled={selectedForm === 'all'} data-testid="button-goto-add-duplicate-rule">
                <Plus className="w-4 h-4" /> Add Duplicate Rule
              </Button>
            </div>
          </div>
        )}

        {/* ══════════════════════════ ENUMERATORS ═══════════════════════════ */}
        {tab === 'enumerators' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium text-slate-800 dark:text-slate-100">Enumerator Performance</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Composite score (0–100) based on submission volume, flag rate, duration, and GPS accuracy.
                </p>
              </div>
            </div>
            {enumStats.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No enumerator data yet</p>
                <p className="text-sm text-slate-400 mb-4">
                  Enumerator stats are computed from submission metadata (submitted_by field) and quality flags. Stats are populated in the <code className="bg-slate-100 px-1 rounded text-xs">fd_enumerator_stats</code> table.
                </p>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 text-left max-w-md mx-auto text-xs text-slate-500 space-y-1">
                  <p className="font-medium text-slate-700">Score components:</p>
                  <p>• Submission volume (25%)</p>
                  <p>• Flag rate — lower is better (35%)</p>
                  <p>• Avg interview duration within expected range (25%)</p>
                  <p>• GPS accuracy (15%)</p>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      {['Enumerator', 'Submissions', 'Avg Duration', 'Flags', 'Flag Rate', 'GPS Accuracy', 'Score', 'Last Active'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {enumStats.map((e, i) => (
                      <tr key={e.id} className={cn('border-b border-slate-50 dark:border-slate-800', i % 2 === 1 && 'bg-slate-50/50 dark:bg-slate-800/20')} data-testid={`row-enumerator-${e.id}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-700 dark:text-slate-200">{e.enumerator_name ?? e.enumerator_id}</div>
                          <div className="text-xs text-slate-400 font-mono">{e.enumerator_id}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{e.submission_count.toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-500">
                          {e.avg_duration_seconds
                            ? `${Math.round(e.avg_duration_seconds / 60)}m`
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('font-medium', e.flag_count > 0 ? 'text-red-600' : 'text-slate-400')}>
                            {e.flag_count}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {e.flag_rate != null ? `${e.flag_rate}%` : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {e.gps_accuracy_avg != null ? `${Math.round(e.gps_accuracy_avg)}m` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {e.score != null ? (
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div
                                  className={cn('h-full rounded-full', e.score >= 80 ? 'bg-emerald-500' : e.score >= 60 ? 'bg-blue-500' : e.score >= 40 ? 'bg-amber-500' : 'bg-red-500')}
                                  style={{ width: `${e.score}%` }}
                                />
                              </div>
                              <Badge variant="secondary" className={cn('text-xs', SCORE_COLOR[e.score_label ?? 'needs_review'])}>
                                {e.score}
                              </Badge>
                            </div>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">
                          {e.last_submission_at ? format(parseISO(e.last_submission_at), 'dd MMM yy') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════ TARGETS ═══════════════════════════════ */}
        {tab === 'targets' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium text-slate-800 dark:text-slate-100">Target Tracking & Forecast</h2>
                <p className="text-xs text-slate-500 mt-0.5">Set targets per form and track progress towards completion.</p>
              </div>
              <Button size="sm" className="gap-1.5" onClick={() => setTargetDialog(true)} data-testid="button-add-target">
                <Plus className="w-4 h-4" /> Set Target
              </Button>
            </div>
            {targetProgress.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
                <Target className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No targets yet</p>
                <p className="text-sm text-slate-400 mb-4">Set a target for each form to track progress and get completion forecasts.</p>
                <Button size="sm" className="gap-1.5" onClick={() => setTargetDialog(true)}>
                  <Plus className="w-4 h-4" /> Set Target
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {targetProgress.map(tp => (
                  <div key={tp.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5" data-testid={`card-target-${tp.id}`}>
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div>
                        <h3 className="font-semibold text-slate-800 dark:text-slate-100">
                          {tp.form?.name ?? 'Unknown form'}
                        </h3>
                        <p className="text-xs text-slate-400">
                          Scope: {tp.geographic_scope ?? 'All'}
                          {tp.target_date ? ` · Due: ${format(parseISO(tp.target_date), 'dd MMM yyyy')}` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className={cn('text-2xl font-bold', tp.pct >= 100 ? 'text-emerald-600' : tp.pct >= 75 ? 'text-blue-600' : tp.pct >= 50 ? 'text-amber-600' : 'text-slate-700')}>
                          {tp.pct}%
                        </div>
                        <div className="text-xs text-slate-400">{tp.actual.toLocaleString()} / {tp.target_count.toLocaleString()}</div>
                      </div>
                    </div>
                    <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-3">
                      <div
                        className={cn('h-full rounded-full transition-all', tp.pct >= 100 ? 'bg-emerald-500' : tp.pct >= 75 ? 'bg-blue-500' : tp.pct >= 50 ? 'bg-amber-500' : 'bg-indigo-500')}
                        style={{ width: `${tp.pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
                        {tp.remaining.toLocaleString()} remaining
                      </span>
                      {tp.forecastDate && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-emerald-500" />
                          Forecast completion: <strong className="text-slate-700 dark:text-slate-200 ml-1">{tp.forecastDate}</strong>
                        </span>
                      )}
                      {tp.pct >= 100 && (
                        <span className="flex items-center gap-1 text-emerald-600 font-medium">
                          <CheckCircle className="w-3.5 h-3.5" /> Target reached!
                        </span>
                      )}
                    </div>
                    {tp.notes && <p className="text-xs text-slate-400 mt-2 italic">{tp.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Add Rule Dialog ──────────────────────────────────────────────── */}
      <Dialog open={ruleDialog} onOpenChange={setRuleDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Quality Rule</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Rule Name <span className="text-red-500">*</span></Label>
              <Input className="mt-1" placeholder="e.g. Household ID must be unique" value={rName} onChange={e => setRName(e.target.value)} data-testid="input-rule-name" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Rule Type</Label>
                <Select value={rType} onValueChange={setRType}>
                  <SelectTrigger className="mt-1" data-testid="select-rule-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RULE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Severity</Label>
                <Select value={rSeverity} onValueChange={setRSeverity}>
                  <SelectTrigger className="mt-1" data-testid="select-rule-severity"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="error">Error</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Field / Variable Name</Label>
              <Input className="mt-1" placeholder="e.g. household_id, gps_location, duration" value={rField} onChange={e => setRField(e.target.value)} data-testid="input-rule-field" />
              <p className="text-xs text-slate-400 mt-0.5">The XLSForm variable name this rule applies to.</p>
            </div>
            {(rType === 'value_range' || rType === 'duration_range') && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Min</Label>
                  <Input className="mt-1" type="number" placeholder="e.g. 0" value={rConfigMin} onChange={e => setRConfigMin(e.target.value)} data-testid="input-rule-min" />
                </div>
                <div>
                  <Label>Max</Label>
                  <Input className="mt-1" type="number" placeholder="e.g. 100" value={rConfigMax} onChange={e => setRConfigMax(e.target.value)} data-testid="input-rule-max" />
                </div>
              </div>
            )}
            {rType === 'regex' && (
              <div>
                <Label>Pattern</Label>
                <Input className="mt-1 font-mono text-sm" placeholder="e.g. ^HH-\d{5}$" value={rConfigPattern} onChange={e => setRConfigPattern(e.target.value)} data-testid="input-rule-pattern" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDialog(false)}>Cancel</Button>
            <Button onClick={() => createRuleMutation.mutate()} disabled={!rName.trim() || createRuleMutation.isPending} data-testid="button-save-rule">
              {createRuleMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Set Target Dialog ──────────────────────────────────────────── */}
      <Dialog open={targetDialog} onOpenChange={setTargetDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Set Submission Target</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Form <span className="text-red-500">*</span></Label>
              <Select value={tFormId} onValueChange={setTFormId}>
                <SelectTrigger className="mt-1" data-testid="select-target-form"><SelectValue placeholder="Select form…" /></SelectTrigger>
                <SelectContent>
                  {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Target Count <span className="text-red-500">*</span></Label>
                <Input className="mt-1" type="number" min={1} placeholder="e.g. 500" value={tCount} onChange={e => setTCount(e.target.value)} data-testid="input-target-count" />
              </div>
              <div>
                <Label>Target Date</Label>
                <Input className="mt-1" type="date" value={tDate} onChange={e => setTDate(e.target.value)} data-testid="input-target-date" />
              </div>
            </div>
            <div>
              <Label>Geographic Scope</Label>
              <Input className="mt-1" placeholder="e.g. North Darfur, All" value={tScope} onChange={e => setTScope(e.target.value)} data-testid="input-target-scope" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea className="mt-1" rows={2} value={tNotes} onChange={e => setTNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTargetDialog(false)}>Cancel</Button>
            <Button onClick={() => createTargetMutation.mutate()} disabled={!tFormId || !tCount || createTargetMutation.isPending} data-testid="button-save-target">
              {createTargetMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Target
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Rule Confirm ──────────────────────────────────────────── */}
      <AlertDialog open={!!deleteRuleId} onOpenChange={v => !v && setDeleteRuleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the rule and all its associated flags. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteRuleId && deleteRuleMutation.mutate(deleteRuleId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
