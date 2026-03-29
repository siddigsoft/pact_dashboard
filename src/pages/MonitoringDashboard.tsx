import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { useToast } from '@/hooks/use-toast';
import { format, formatDistanceToNow, parseISO, isToday, differenceInHours } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Shield, RefreshCw, Download, Search, CheckCircle, XCircle,
  Clock, AlertTriangle, User, Activity, Eye, Layers, TrendingUp,
  AlertCircle, CheckSquare, X, Loader2, Calendar, Mail, Phone,
  Zap, Database, BarChart2, ChevronDown, ChevronUp, ChevronRight,
  Circle, ArrowUpRight, Timer, Filter, Info, MapPin, ArrowRight,
  FileText, CheckCircle2, CalendarDays, Bell, Send, Users, Globe,
} from 'lucide-react';
import { insertNotifications } from '@/services/mmpActions';

// ── Types ─────────────────────────────────────────────────────────────────────

type DashboardStatus = 'received' | 'acted' | 'ignored' | 'no_response';
type ActionTypeKey =
  | 'mmp_lifecycle' | 'mmp_site_entry' | 'site_visit'
  | 'cost_reimbursement' | 'operational_cost' | 'advance_payment'
  | 'wallet_withdrawal' | 'feedback' | 'role_change';

interface RawAction {
  action_id: string;
  action_type: string;
  source_table: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  recipient_role: string;
  native_status: string;
  created_at: string;
  updated_at: string;
  details: Record<string, unknown>;
}

interface OverrideRow {
  action_id: string;
  action_type: string;
  status: string;
  notes: string | null;
  set_at: string;
}

interface DashboardAction extends RawAction {
  action_type: ActionTypeKey;
  dashboard_status: DashboardStatus;
  latest_notes?: string | null;
  sender_email?: string | null;
  sender_phone?: string | null;
  mmp_name?: string;
}

interface StatusOverrideEntry {
  id: string;
  status: string;
  notes: string | null;
  set_at: string;
  set_by: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ACTION_TYPES: Array<{ key: ActionTypeKey; label: string; short: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'mmp_lifecycle',     label: 'MMP Lifecycle',        short: 'MMP',  icon: BarChart2 },
  { key: 'mmp_site_entry',    label: 'MMP Site Entries',     short: 'Site', icon: Layers },
  { key: 'site_visit',        label: 'Site Visits',          short: 'Visit',icon: Activity },
  { key: 'cost_reimbursement',label: 'Cost Reimbursements',  short: 'Reimb',icon: TrendingUp },
  { key: 'operational_cost',  label: 'Operational Costs',    short: 'OpEx', icon: Database },
  { key: 'advance_payment',   label: 'Advance Payments',     short: 'Adv',  icon: CheckSquare },
  { key: 'wallet_withdrawal', label: 'Wallet Withdrawals',   short: 'Wdrl', icon: ArrowUpRight },
  { key: 'feedback',          label: 'Feedback',             short: 'Fdbk', icon: AlertCircle },
  { key: 'role_change',       label: 'Role Changes',         short: 'Role', icon: Shield },
];

const STATUS_CFG: Record<DashboardStatus, { label: string; color: string; dot: string; icon: React.ComponentType<{ className?: string }> }> = {
  received:    { label: 'Received',    color: 'text-blue-600 bg-blue-50 border-blue-200',           dot: 'bg-blue-500',   icon: Eye },
  acted:       { label: 'Acted',       color: 'text-emerald-700 bg-emerald-50 border-emerald-200',  dot: 'bg-emerald-500',icon: CheckCircle },
  ignored:     { label: 'Ignored',     color: 'text-slate-600 bg-slate-50 border-slate-200',         dot: 'bg-slate-400',  icon: XCircle },
  no_response: { label: 'No Response', color: 'text-amber-700 bg-amber-50 border-amber-200',         dot: 'bg-amber-500',  icon: AlertTriangle },
};

const CHART_COLORS = ['#3b82f6', '#10b981', '#64748b', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316'];

const WORKFLOW_CONTROLS: Record<ActionTypeKey, Array<{ action: string; label: string; variant: 'default' | 'destructive' | 'outline' }>> = {
  mmp_lifecycle:      [{ action: 'approve', label: 'Approve', variant: 'default' }, { action: 'reject', label: 'Reject', variant: 'destructive' }, { action: 'request_revision', label: 'Request Revision', variant: 'outline' }],
  mmp_site_entry:     [{ action: 'accept', label: 'Accept', variant: 'default' }, { action: 'dispatch', label: 'Dispatch', variant: 'outline' }, { action: 'complete', label: 'Complete', variant: 'default' }, { action: 'cancel', label: 'Cancel', variant: 'destructive' }],
  site_visit:         [{ action: 'assign', label: 'Assign', variant: 'outline' }, { action: 'accept', label: 'Accept', variant: 'default' }, { action: 'complete', label: 'Complete', variant: 'default' }, { action: 'cancel', label: 'Cancel', variant: 'destructive' }],
  cost_reimbursement: [{ action: 'approve', label: 'Approve', variant: 'default' }, { action: 'reject', label: 'Reject', variant: 'destructive' }, { action: 'request_info', label: 'Request Info', variant: 'outline' }, { action: 'pay', label: 'Mark Paid', variant: 'default' }],
  operational_cost:   [{ action: 'approve', label: 'Approve', variant: 'default' }, { action: 'reject', label: 'Reject', variant: 'destructive' }, { action: 'request_info', label: 'Request Info', variant: 'outline' }],
  advance_payment:    [{ action: 'approve', label: 'Approve', variant: 'default' }, { action: 'reject', label: 'Reject', variant: 'destructive' }, { action: 'pay', label: 'Mark Paid', variant: 'default' }, { action: 'cancel', label: 'Cancel', variant: 'destructive' }],
  wallet_withdrawal:  [{ action: 'approve', label: 'Approve', variant: 'default' }, { action: 'reject', label: 'Reject', variant: 'destructive' }, { action: 'complete', label: 'Complete', variant: 'default' }],
  feedback:           [{ action: 'resolve', label: 'Resolve', variant: 'default' }, { action: 'reject', label: 'Dismiss', variant: 'destructive' }],
  role_change:        [{ action: 'approve', label: 'Approve', variant: 'default' }, { action: 'reject', label: 'Reject', variant: 'destructive' }, { action: 'cancel', label: 'Cancel', variant: 'outline' }],
};

function urgencyLevel(action: DashboardAction): 'critical' | 'high' | 'normal' {
  const hrs = differenceInHours(new Date(), parseISO(action.created_at));
  if (action.dashboard_status === 'no_response' || hrs > 48) return 'critical';
  if (hrs > 24) return 'high';
  return 'normal';
}
const URGENCY = {
  critical: { dot: 'bg-red-500 animate-pulse', label: 'CRITICAL', text: 'text-red-600', bg: 'bg-red-50 border-red-200' },
  high:     { dot: 'bg-amber-400',             label: 'HIGH',     text: 'text-amber-600',bg: 'bg-amber-50 border-amber-200' },
  normal:   { dot: 'bg-emerald-400',           label: 'OK',       text: 'text-emerald-600',bg: '' },
};

// ── Root guard ────────────────────────────────────────────────────────────────

export default function MonitoringDashboard() {
  const { isSuperAdmin, loading } = useSuperAdmin();
  if (loading) return <DashboardSkeleton />;
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;
  return <MonitoringContent />;
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5 p-6 max-w-7xl mx-auto">
      <Skeleton className="h-10 w-72" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-52" />)}
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
      </div>
    </div>
  );
}

// ── Main content ──────────────────────────────────────────────────────────────

function MonitoringContent() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [filters, setFilters] = useState({
    type: '' as ActionTypeKey | '',
    status: '' as DashboardStatus | '',
    from: '', to: '', sender: '',
    urgency: '' as 'critical' | 'high' | '',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [workflowDialog, setWorkflowDialog] = useState<{ action: DashboardAction; workflowAction: string; workflowLabel: string } | null>(null);
  const [workflowNotes, setWorkflowNotes] = useState('');
  const [statusDialog, setStatusDialog] = useState<{ actions: DashboardAction[]; targetStatus: DashboardStatus; label: string } | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [statusNotes, setStatusNotes] = useState('');
  // Pipeline click-to-filter: clicking a stage box narrows the action feed
  const [pipelineFilter, setPipelineFilter] = useState<{ type: ActionTypeKey; status: string; label: string } | null>(null);
  const actionFeedRef = useRef<HTMLDivElement>(null);

  const scrollToFeed = () =>
    setTimeout(() => actionFeedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);

  const applyPipelineFilter = (next: { type: ActionTypeKey; status: string; label: string } | null) => {
    setPipelineFilter(next);
    if (next) scrollToFeed();
  };

  const applyKpiFilter = (patch: Partial<typeof filters>) => {
    setPipelineFilter(null);
    setFilters(f => ({ ...f, ...patch }));
    scrollToFeed();
  };

  // ── Transportation Advance Coverage ──────────────────────────────────────────
  type CoverageEntry = {
    id: string; site_name: string; hub_name: string; state_name: string;
    locality_name: string; mmp_file_id: string; mmp_name: string;
    advance_status: string | null; data_collector_name: string;
  };
  const { data: coverageData = [], isLoading: coverageLoading } = useQuery<CoverageEntry[]>({
    queryKey: ['advance-site-coverage'],
    staleTime: 0,
    queryFn: async () => {
      const BATCH = 1000;
      let all: Record<string, unknown>[] = [];
      let offset = 0;
      while (true) {
        const { data, error } = await (supabase.rpc('get_advance_coverage_data') as ReturnType<typeof supabase.rpc>).range(offset, offset + BATCH - 1);
        if (error) { console.error('[MonCoverage] RPC error:', error); break; }
        if (!data || (data as unknown[]).length === 0) break;
        all = all.concat(data as Record<string, unknown>[]);
        if ((data as unknown[]).length < BATCH) break;
        offset += BATCH;
      }
      return all.map((r) => ({
        id:                   String(r.entry_id ?? ''),
        site_name:            String(r.site_name ?? '—'),
        hub_name:             String(r.hub_name ?? '—'),
        state_name:           String(r.state_name ?? '—'),
        locality_name:        String(r.locality_name ?? '—'),
        mmp_file_id:          String(r.mmp_file_id ?? ''),
        mmp_name:             String(r.mmp_name ?? '—'),
        advance_status:       r.advance_status ? String(r.advance_status) : null,
        data_collector_name:  String(r.data_collector_name ?? '—'),
      }));
    },
  });
  const [showCoverage, setShowCoverage] = useState(false);
  const [coverageHubFilter,    setCoverageHubFilter]    = useState<string>('all');
  const [coverageStatusFilter, setCoverageStatusFilter] = useState<string>('all');
  const [coverageMmpFilter,    setCoverageMmpFilter]    = useState<string>('all');
  const [coverageStateFilter,  setCoverageStateFilter]  = useState<string>('all');
  const [coverageDcFilter,     setCoverageDcFilter]     = useState<string>('all');
  const coverageSummary = useMemo(() => {
    const cnt = (statuses: (string | null)[]) => coverageData.filter(e => statuses.includes(e.advance_status)).length;
    const total            = coverageData.length;
    const pendingSupervisor = cnt(['pending_supervisor']);
    const pendingAdmin     = cnt(['pending_admin']);
    const approved         = cnt(['approved']);
    const fullyPaid        = cnt(['fully_paid']);
    const partiallyPaid    = cnt(['partially_paid']);
    const confirmed        = cnt(['confirmed']);
    const acknowledged     = cnt(['acknowledged']);
    const rejected         = cnt(['rejected']);
    const cancelled        = cnt(['cancelled']);
    const noRequest        = cnt([null]);
    const totalWithReq     = total - noRequest;
    const pct = total > 0 ? Math.round((totalWithReq / total) * 100) : 0;
    return { total, pendingSupervisor, pendingAdmin, approved, fullyPaid, partiallyPaid, confirmed, acknowledged, rejected, cancelled, noRequest, totalWithReq, pct };
  }, [coverageData]);
  const coverageFiltered = useMemo(() => {
    let subset: CoverageEntry[];
    if (coverageStatusFilter === 'all')             subset = coverageData;
    else if (coverageStatusFilter === 'no_request') subset = coverageData.filter(e => !e.advance_status);
    else                                             subset = coverageData.filter(e => e.advance_status === coverageStatusFilter);
    if (coverageMmpFilter   !== 'all') subset = subset.filter(e => e.mmp_name            === coverageMmpFilter);
    if (coverageHubFilter   !== 'all') subset = subset.filter(e => e.hub_name            === coverageHubFilter);
    if (coverageStateFilter !== 'all') subset = subset.filter(e => e.state_name          === coverageStateFilter);
    if (coverageDcFilter    !== 'all') subset = subset.filter(e => e.data_collector_name === coverageDcFilter);
    return subset;
  }, [coverageData, coverageHubFilter, coverageStatusFilter, coverageMmpFilter, coverageStateFilter, coverageDcFilter]);
  const coverageHubs           = useMemo(() => [...new Set(coverageData.map(e => e.hub_name).filter(Boolean))].sort() as string[], [coverageData]);
  const coverageMmps           = useMemo(() => [...new Set(coverageData.map(e => e.mmp_name).filter(m => m && m !== '—'))].sort() as string[], [coverageData]);
  const coverageStates         = useMemo(() => [...new Set(coverageData.map(e => e.state_name).filter(s => s && s !== '—'))].sort() as string[], [coverageData]);
  const coverageDataCollectors = useMemo(() => [...new Set(coverageData.map(e => e.data_collector_name).filter(d => d && d !== '—'))].sort() as string[], [coverageData]);

  // ── Fetch via SECURITY DEFINER RPC (bypasses all RLS) ─────────────────────
  const { data: allActions = [], isLoading, isFetching, refetch, dataUpdatedAt, error } = useQuery<DashboardAction[]>({
    queryKey: ['/admin/monitoring/actions', filters],
    queryFn: async () => {
      // Step 1: Call get_monitoring_actions — paginate past the PostgREST 1000-row default limit
      const PAGE_SIZE = 1000;
      const allRows: RawAction[] = [];
      let pageStart = 0;
      const rpcArgs = {
        p_type:   filters.type   || null,
        p_from:   filters.from   ? filters.from + 'T00:00:00Z' : null,
        p_to:     filters.to     ? filters.to   + 'T23:59:59Z' : null,
        p_sender: filters.sender || null,
      };
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const result = await (supabase.rpc('get_monitoring_actions', rpcArgs) as ReturnType<typeof supabase.rpc>)
          .range(pageStart, pageStart + PAGE_SIZE - 1);
        const rpcErr = result.error;
        const page = result.data as RawAction[] | null;
        if (rpcErr) throw new Error((rpcErr as { message?: string })?.message ?? String(rpcErr));
        if (!page || page.length === 0) break;
        allRows.push(...page);
        if (page.length < PAGE_SIZE) break;
        pageStart += PAGE_SIZE;
      }
      const rows = allRows;
      if (rows.length === 0) return [];

      // Step 2: Batch-fetch latest awareness overrides via RPC
      const ids = rows.map(r => r.action_id);
      const { data: overrides } = await supabase.rpc('get_monitoring_overrides', { action_ids: ids }) as { data: OverrideRow[] | null; error: unknown };

      const overrideMap = new Map<string, OverrideRow>();
      for (const ov of (overrides ?? [])) {
        const key = `${ov.action_type}:${ov.action_id}`;
        if (!overrideMap.has(key)) overrideMap.set(key, ov);
      }

      // Step 3: Batch-fetch sender contact info + full_name (profiles)
      const isUUIDStr = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s);
      const rawSenderIds = [...new Set(rows.map(r => r.sender_id).filter(Boolean))];
      // Collect accepted_by UUIDs from mmp_site_entry details
      const extraUUIDs = rows
        .filter(r => r.action_type === 'mmp_site_entry')
        .flatMap(r => {
          const d = (r.details ?? {}) as Record<string, unknown>;
          return [String(d.accepted_by ?? '')].filter(v => v && isUUIDStr(v));
        });
      const senderIds = [...new Set([...rawSenderIds, ...extraUUIDs])];
      const { data: profiles } = senderIds.length > 0
        ? await supabase.from('profiles').select('id, full_name, email, phone').in('id', senderIds)
        : { data: [] as Array<{ id: string; full_name: string | null; email: string | null; phone: string | null }> };
      const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

      // Secondary lookup: monitoring_by holds the enumerator's EMAIL for mmp_site_entry records
      const isEmail = (s: string) => s.includes('@');
      const monitoringEmails = [...new Set(
        rows
          .filter(r => r.action_type === 'mmp_site_entry')
          .map(r => String((r.details as Record<string, unknown>)?.monitoring_by ?? '').trim())
          .filter(e => e && isEmail(e))
      )];
      const { data: emailProfiles } = monitoringEmails.length > 0
        ? await supabase.from('profiles').select('id, full_name, email, phone').in('email', monitoringEmails)
        : { data: [] as Array<{ id: string; full_name: string | null; email: string | null; phone: string | null }> };
      const profileByEmail = new Map((emailProfiles ?? []).map(p => [p.email ?? '', p]));

      // Step 4: Merge
      const merged = rows
        .map((r): DashboardAction => {
          const key = `${r.action_type}:${r.action_id}`;
          const ov = overrideMap.get(key);
          const profile = profileMap.get(r.sender_id);

          let resolvedName: string | null = null;
          let resolvedEmail: string | null = profile?.email ?? null;
          let resolvedPhone: string | null = profile?.phone ?? null;

          if (r.action_type === 'mmp_site_entry') {
            // For site entries the authoritative person is the enumerator (monitoring_by email)
            const d = (r.details ?? {}) as Record<string, unknown>;
            const monEmail = String(d.monitoring_by ?? '').trim();
            const monProfile = isEmail(monEmail) ? profileByEmail.get(monEmail) : undefined;
            if (monProfile?.full_name) {
              resolvedName = monProfile.full_name;
              resolvedEmail = monProfile.email ?? resolvedEmail;
              resolvedPhone = monProfile.phone ?? resolvedPhone;
            } else {
              // Fall back: accepted_by UUID lookup, then sender profile
              const abProfile = profileMap.get(String(d.accepted_by ?? ''));
              resolvedName = abProfile?.full_name ?? profile?.full_name ?? r.sender_name ?? null;
            }
          } else {
            resolvedName = profile?.full_name ?? r.sender_name ?? null;
          }

          // Never surface a raw UUID as a display name
          const finalName = (resolvedName && !isUUIDStr(resolvedName)) ? resolvedName : 'Unknown';
          return {
            ...r,
            action_type: r.action_type as ActionTypeKey,
            dashboard_status: (ov?.status ?? 'received') as DashboardStatus,
            latest_notes: ov?.notes ?? null,
            sender_name: finalName,
            sender_email: resolvedEmail,
            sender_phone: resolvedPhone,
            details: (r.details ?? {}) as Record<string, unknown>,
          };
        });

      // Step 5: Resolve MMP names for all actions
      const mmpFileIds = [...new Set(
        merged.map(r => {
          const d = r.details as Record<string, unknown>;
          if (r.action_type === 'mmp_lifecycle') return String(d.id ?? '');
          if (r.action_type === 'mmp_site_entry') return String(d.mmp_file_id ?? '');
          return '';
        }).filter(Boolean)
      )];
      const { data: mmpFiles } = mmpFileIds.length > 0
        ? await supabase.from('mmp_files').select('id, name').in('id', mmpFileIds)
        : { data: [] as Array<{ id: string; name: string | null }> };
      const mmpNameMap = new Map((mmpFiles ?? []).map(f => [f.id, f.name ?? '—']));

      return merged.map(r => {
        const d = r.details as Record<string, unknown>;
        let mmp_name = '—';
        if (r.action_type === 'mmp_lifecycle') mmp_name = mmpNameMap.get(String(d.id ?? '')) ?? '—';
        else if (r.action_type === 'mmp_site_entry') mmp_name = mmpNameMap.get(String(d.mmp_file_id ?? '')) ?? '—';
        return { ...r, mmp_name };
      }).filter(r => !filters.status || r.dashboard_status === filters.status);
    },
    refetchInterval: 90_000,
    staleTime: 30_000,
    retry: 1,
  });

  // ── Realtime refresh ───────────────────────────────────────────────────────
  useEffect(() => {
    const tables = [
      'action_status_overrides','mmp_files','mmp_site_entries','site_visits',
      'site_visit_cost_submissions','operational_cost_submissions',
      'down_payment_requests','wallet_transactions','feedback','approval_requests',
    ];
    const channels = tables.map(table =>
      supabase.channel(`mon_${table}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
          qc.invalidateQueries({ queryKey: ['/admin/monitoring/actions'] });
        })
        .subscribe()
    );
    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  }, [qc]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total      = allActions.length;
    const acted      = allActions.filter(a => a.dashboard_status === 'acted').length;
    const ignored    = allActions.filter(a => a.dashboard_status === 'ignored').length;
    const noResponse = allActions.filter(a => a.dashboard_status === 'no_response').length;
    const received   = allActions.filter(a => a.dashboard_status === 'received').length;
    const actedToday = allActions.filter(a => isToday(parseISO(a.updated_at))).length;
    const critical   = allActions.filter(a => urgencyLevel(a) === 'critical').length;
    const responseRate = total > 0 ? Math.round((acted / total) * 100) : 0;
    return { total, acted, ignored, noResponse, received, actedToday, critical, responseRate };
  }, [allActions]);

  const barData = useMemo(() =>
    ACTION_TYPES.map(at => ({
      name: at.short,
      total: allActions.filter(a => a.action_type === at.key).length,
      acted: allActions.filter(a => a.action_type === at.key && a.dashboard_status === 'acted').length,
      pending: allActions.filter(a => a.action_type === at.key && a.dashboard_status === 'received').length,
    })), [allActions]);

  const pieData = useMemo(() => [
    { name: 'Received',    value: stats.received,    fill: '#3b82f6' },
    { name: 'Acted',       value: stats.acted,        fill: '#10b981' },
    { name: 'Ignored',     value: stats.ignored,      fill: '#64748b' },
    { name: 'No Response', value: stats.noResponse,   fill: '#f59e0b' },
  ].filter(d => d.value > 0), [stats]);

  // ── Site Status Pipeline — direct DB query (no 2000-row RPC cap) ──────────
  // Normalise any status string (camelCase, snake_case, spaces → lowercase, no separator)
  const normStatus = (s: string) => (s ?? '').toLowerCase().replace(/[_\s-]/g, '');

  // Full mmp_site_entries workflow stages (all real DB values covered)
  const ENTRY_STAGES: Array<{ key: string; label: string; color: string; dot: string }> = [
    { key: 'pending',           label: 'Pending',            color: 'bg-slate-100 text-slate-700 border-slate-200',    dot: 'bg-slate-400'   },
    { key: 'assigned',          label: 'Assigned',           color: 'bg-sky-50 text-sky-700 border-sky-200',            dot: 'bg-sky-500'     },
    { key: 'dispatched',        label: 'Dispatched',         color: 'bg-blue-50 text-blue-700 border-blue-200',         dot: 'bg-blue-500'    },
    { key: 'approvedandcosted', label: 'Approved & Costed',  color: 'bg-indigo-50 text-indigo-700 border-indigo-200',   dot: 'bg-indigo-500'  },
    { key: 'accepted',          label: 'Accepted',           color: 'bg-violet-50 text-violet-700 border-violet-200',   dot: 'bg-violet-500'  },
    { key: 'inprogress',        label: 'In Progress',        color: 'bg-purple-50 text-purple-700 border-purple-200',   dot: 'bg-purple-500'  },
    { key: 'completed',         label: 'Completed',          color: 'bg-emerald-50 text-emerald-700 border-emerald-200',dot: 'bg-emerald-500' },
    { key: 'returned',          label: 'Returned',           color: 'bg-amber-50 text-amber-700 border-amber-200',      dot: 'bg-amber-500'   },
    { key: 'rejected',          label: 'Rejected',           color: 'bg-rose-50 text-rose-700 border-rose-200',         dot: 'bg-rose-500'    },
    { key: 'cancelled',         label: 'Cancelled',          color: 'bg-red-50 text-red-700 border-red-200',            dot: 'bg-red-400'     },
  ];

  // site_visits stages (full set used in the field visit lifecycle)
  const VISIT_STAGES: Array<{ key: string; label: string; color: string; dot: string }> = [
    { key: 'pending',        label: 'Pending',         color: 'bg-slate-100 text-slate-700 border-slate-200',    dot: 'bg-slate-400'  },
    { key: 'assigned',       label: 'Assigned',        color: 'bg-blue-50 text-blue-700 border-blue-200',         dot: 'bg-blue-500'   },
    { key: 'claimed',        label: 'Claimed',         color: 'bg-sky-50 text-sky-700 border-sky-200',            dot: 'bg-sky-500'    },
    { key: 'accepted',       label: 'Accepted',        color: 'bg-indigo-50 text-indigo-700 border-indigo-200',   dot: 'bg-indigo-500' },
    { key: 'dispatched',     label: 'Dispatched',      color: 'bg-cyan-50 text-cyan-700 border-cyan-200',         dot: 'bg-cyan-500'   },
    { key: 'inprogress',     label: 'In Progress',     color: 'bg-purple-50 text-purple-700 border-purple-200',   dot: 'bg-purple-500' },
    { key: 'permitverified', label: 'Permit Verified', color: 'bg-teal-50 text-teal-700 border-teal-200',         dot: 'bg-teal-500'   },
    { key: 'verified',       label: 'Verified',        color: 'bg-green-50 text-green-700 border-green-200',      dot: 'bg-green-500'  },
    { key: 'completed',      label: 'Completed',       color: 'bg-emerald-50 text-emerald-700 border-emerald-200',dot: 'bg-emerald-500'},
    { key: 'returned',       label: 'Returned',        color: 'bg-amber-50 text-amber-700 border-amber-200',      dot: 'bg-amber-500'  },
    { key: 'rejected',       label: 'Rejected',        color: 'bg-rose-50 text-rose-700 border-rose-200',         dot: 'bg-rose-500'   },
    { key: 'cancelled',      label: 'Cancelled',       color: 'bg-red-50 text-red-700 border-red-200',            dot: 'bg-red-400'    },
  ];

  const { data: sitePipeline, isLoading: pipelineLoading } = useQuery({
    queryKey: ['/admin/monitoring/site-pipeline'],
    queryFn: async () => {
      // Paginate mmp_site_entries to bypass PostgREST's 1000-row default cap
      const entryRows: Array<{ status: string | null }> = [];
      let ePage = 0;
      while (true) {
        const { data: eChunk } = await supabase
          .from('mmp_site_entries')
          .select('status')
          .not('status', 'is', null)
          .range(ePage * 1000, ePage * 1000 + 999);
        if (!eChunk || eChunk.length === 0) break;
        entryRows.push(...eChunk);
        if (eChunk.length < 1000) break;
        ePage++;
      }

      // Query site_visits via SECURITY DEFINER RPC (direct table query is blocked by RLS)
      const visitRows: Array<{ status: string | null }> = [];
      let vPage = 0;
      while (true) {
        const { data: vChunk } = await (supabase.rpc('get_monitoring_actions', {
          p_type: 'site_visit',
          p_from: null,
          p_to: null,
          p_sender: null,
        }) as ReturnType<typeof supabase.rpc>).range(vPage * 1000, vPage * 1000 + 999);
        if (!vChunk || vChunk.length === 0) break;
        for (const r of vChunk as Array<Record<string,unknown>>) {
          visitRows.push({ status: (r['native_status'] ?? r['status']) as string | null });
        }
        if (vChunk.length < 1000) break;
        vPage++;
      }

      // Count by normalised status key
      const tally = (rows: Array<{ status: string | null }>) => {
        const m = new Map<string, number>();
        for (const row of rows) {
          const k = normStatus(row.status ?? '');
          m.set(k, (m.get(k) ?? 0) + 1);
        }
        return m;
      };

      const entryCounts = tally(entryRows ?? []);
      const visitCounts = tally(visitRows ?? []);

      // Map stages — also collect counts for unknown statuses so nothing is silently lost
      const entryStages = ENTRY_STAGES.map(s => ({ ...s, count: entryCounts.get(normStatus(s.key)) ?? 0 }));
      const visitStages = VISIT_STAGES.map(s => ({ ...s, count: visitCounts.get(normStatus(s.key)) ?? 0 }));

      const knownEntryKeys = new Set(ENTRY_STAGES.map(s => normStatus(s.key)));
      const knownVisitKeys = new Set(VISIT_STAGES.map(s => normStatus(s.key)));
      const otherEntries = (entryRows ?? []).filter(r => !knownEntryKeys.has(normStatus(r.status ?? '')));
      const otherVisits  = (visitRows ?? []).filter(r => !knownVisitKeys.has(normStatus(r.status ?? '')));

      return {
        entryStages,
        visitStages,
        entryTotal: entryRows?.length ?? 0,
        visitTotal: visitRows?.length ?? 0,
        otherEntryStatuses: Array.from(new Set(otherEntries.map(r => r.status))),
        otherVisitStatuses:  Array.from(new Set(otherVisits.map(r => r.status))),
      };
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  // ── MMP Files — status + cycle close overview ──────────────────────────────
  const { data: mmpOverview, isLoading: mmpOverviewLoading } = useQuery({
    queryKey: ['/admin/monitoring/mmp-overview'],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('mmp_files')
        .select('id, name, month, hub, status, cycle_status, cycle_closed_at')
        .order('cycle_closed_at', { ascending: false });

      if (!rows) return { mmpStatusCounts: {}, cycleStatusCounts: {}, recentlyClosed: [] };

      const mmpStatusCounts: Record<string, number> = {};
      const cycleStatusCounts: Record<string, number> = {};
      for (const r of rows) {
        const s = (r.status ?? 'pending').toLowerCase();
        const cs = (r.cycle_status ?? 'active').toLowerCase();
        mmpStatusCounts[s]  = (mmpStatusCounts[s]  ?? 0) + 1;
        cycleStatusCounts[cs] = (cycleStatusCounts[cs] ?? 0) + 1;
      }

      const recentlyClosed = rows
        .filter(r => r.cycle_status === 'closed' && r.cycle_closed_at)
        .slice(0, 8)
        .map(r => ({ id: r.id as string, name: r.name as string, month: r.month as string, hub: r.hub as string, cycle_closed_at: r.cycle_closed_at as string }));

      return { mmpStatusCounts, cycleStatusCounts, recentlyClosed, total: rows.length };
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: async (payload: Array<{ action_id: string; action_type: string; source_table?: string; status: DashboardStatus; notes?: string }>) => {
      const results = await Promise.all(payload.map(p =>
        supabase.rpc('insert_monitoring_override', {
          p_action_id:    p.action_id,
          p_action_type:  p.action_type,
          p_source_table: p.source_table ?? null,
          p_status:       p.status,
          p_notes:        p.notes ?? null,
        })
      ));
      const failed = results.filter(r => r.error);
      if (failed.length > 0) throw new Error((failed[0].error as { message?: string })?.message ?? 'Insert failed');
      return { count: payload.length };
    },
    onSuccess: (res) => {
      toast({ title: `Status updated for ${res.count} item(s)` });
      qc.invalidateQueries({ queryKey: ['/admin/monitoring/actions'] });
      setSelectedIds(new Set()); setStatusDialog(null); setStatusNotes('');
    },
    onError: (err: Error) => toast({ title: 'Failed to update status', description: err.message, variant: 'destructive' }),
  });

  const workflowMutation = useMutation({
    mutationFn: async (payload: { action_id: string; source_table: string; workflow_action: string; notes?: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dashboard-actions-workflow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error((b as { error?: string }).error ?? `HTTP ${res.status}`); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Workflow action applied' });
      qc.invalidateQueries({ queryKey: ['/admin/monitoring/actions'] });
      setWorkflowDialog(null); setWorkflowNotes('');
    },
    onError: (err: Error) => toast({ title: 'Workflow action failed', description: err.message, variant: 'destructive' }),
  });

  // ── CSV Export ─────────────────────────────────────────────────────────────
  const handleExportCSV = useCallback(async () => {
    const headers = ['action_id','action_type','sender_name','sender_email','sender_phone','native_status','dashboard_status','created_at'];
    const rows = allActions.map(a =>
      headers.map(h => `"${String((a as Record<string, unknown>)[h] ?? '').replace(/"/g,'""')}"`).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `monitoring-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, [allActions]);

  // ── Pipeline filter application ────────────────────────────────────────────
  // When a stage box is clicked, displayedActions narrows to just that type+status.
  const displayedActions = useMemo(() => {
    let actions = allActions;
    // Pipeline stage filter (from clicking a stage box)
    if (pipelineFilter) {
      actions = actions.filter(a => {
        if (a.action_type !== pipelineFilter.type) return false;
        const norm = (s: string) => (s ?? '').toLowerCase().replace(/[_\s]/g, '');
        return norm(a.native_status) === norm(pipelineFilter.status);
      });
    }
    // Dashboard status filter (client-side — the RPC has no p_status param)
    if (filters.status) {
      actions = actions.filter(a => a.dashboard_status === filters.status);
    }
    // Urgency quick-filter (client-side computed)
    if (filters.urgency) {
      actions = actions.filter(a => urgencyLevel(a) === filters.urgency);
    }
    return actions;
  }, [allActions, pipelineFilter, filters.status, filters.urgency]);

  // ── Selection ──────────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectedActions = displayedActions.filter(a => selectedIds.has(a.action_id));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 p-4 md:p-6 max-w-7xl mx-auto" data-testid="monitoring-dashboard">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight" data-testid="page-title">System Monitoring</h1>
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${stats.critical > 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${stats.critical > 0 ? 'bg-red-500 animate-pulse' : 'bg-emerald-400'}`} />
                {stats.critical > 0 ? `${stats.critical} CRITICAL` : 'SYSTEMS NORMAL'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              9 modules · {allActions.length} total actions
              {dataUpdatedAt ? ` · synced ${formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowFilters(f => !f)} data-testid="button-toggle-filters">
            <Filter className="h-4 w-4 mr-1" />{showFilters ? 'Hide Filters' : 'Filters'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh">
            <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} />Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={allActions.length === 0} data-testid="button-export-csv">
            <Download className="h-4 w-4 mr-1" />Export CSV
          </Button>
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white"
            onClick={() => setNotifyOpen(true)}
            disabled={allActions.length === 0}
            data-testid="button-notify-users"
          >
            <Bell className="h-4 w-4 mr-1" />Notify Users
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3" data-testid="error-banner">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-700">Data load failed</p>
            <p className="text-xs text-red-600 font-mono break-words mt-0.5">{(error as Error).message}</p>
            <p className="text-xs text-red-500 mt-1">
              Run the migration <code className="bg-red-100 px-1 rounded">20260328_monitoring_grants_and_rpc.sql</code> in your Supabase SQL editor, then refresh.
            </p>
          </div>
          <Button variant="ghost" size="sm" className="text-red-600 shrink-0" onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="Total Actions" value={stats.total}
            sub={`${stats.actedToday} record${stats.actedToday !== 1 ? 's' : ''} updated today`}
            icon={<BarChart2 className="h-4 w-4" />} accent="blue" testId="stat-total"
            active={!filters.status && !filters.urgency && !pipelineFilter}
            onClick={() => { applyKpiFilter({ status: '', urgency: '' }); }}
          />
          <KpiCard
            label="Acted" value={stats.acted}
            sub={`${stats.responseRate}% response rate`}
            icon={<CheckCircle className="h-4 w-4" />} accent="green" testId="stat-acted"
            active={filters.status === 'acted'}
            onClick={() => applyKpiFilter({ status: filters.status === 'acted' ? '' : 'acted', urgency: '' })}
          />
          <KpiCard
            label="No Response" value={stats.noResponse}
            sub="awaiting action"
            icon={<AlertTriangle className="h-4 w-4" />} accent="amber" testId="stat-no-response"
            active={filters.status === 'no_response'}
            onClick={() => applyKpiFilter({ status: filters.status === 'no_response' ? '' : 'no_response', urgency: '' })}
          />
          <KpiCard
            label="Critical" value={stats.critical}
            sub=">48h or flagged as no-response"
            icon={<Zap className="h-4 w-4" />} accent="red" testId="stat-critical"
            active={filters.urgency === 'critical'}
            onClick={() => applyKpiFilter({ urgency: filters.urgency === 'critical' ? '' : 'critical', status: '' })}
          />
        </div>
      )}

      {/* Charts — only when we have data */}
      {!isLoading && !error && allActions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Bar chart — 3 cols */}
          <Card className="md:col-span-3">
            <CardHeader className="py-3 px-4 border-b">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
                <BarChart2 className="h-3.5 w-3.5" />Actions by Module
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pt-3 pb-3">
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={barData} margin={{ top: 2, right: 8, left: -24, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 6 }}
                    cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                  />
                  <Bar dataKey="acted"   name="Acted"   stackId="a" radius={[0,0,0,0]} fill="#10b981" />
                  <Bar dataKey="pending" name="Pending"  stackId="a" radius={[0,0,0,0]} fill="#3b82f6" />
                  <Bar dataKey="total"   name="Other"   stackId="a" radius={[3,3,0,0]} fill="#e2e8f0" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Pie chart — 2 cols */}
          <Card className="md:col-span-2">
            <CardHeader className="py-3 px-4 border-b">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
                <Activity className="h-3.5 w-3.5" />Status Split
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3 pb-3">
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={38} outerRadius={62} paddingAngle={3} dataKey="value">
                    {pieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                  <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Site Status Pipeline ─────────────────────────────────────────── */}
      {pipelineLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
      )}
      {!pipelineLoading && ((sitePipeline?.entryTotal ?? 0) > 0 || (sitePipeline?.visitTotal ?? 0) > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* MMP Site Entries */}
          <Card>
            <CardHeader className="py-3 px-4 border-b">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
                <Layers className="h-3.5 w-3.5" />
                MMP Site Entries Flow
                <span className="ml-auto text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">
                  {sitePipeline?.entryTotal ?? 0} total
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 py-3">
              <p className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1">
                <Filter className="h-3 w-3" />Click a stage to filter the list below
              </p>
              <div className="flex flex-wrap gap-2 items-center">
                {(sitePipeline?.entryStages ?? []).map((stage, i, arr) => {
                  const isActive = pipelineFilter?.type === 'mmp_site_entry' && pipelineFilter?.status === stage.key;
                  const total = sitePipeline?.entryTotal ?? 0;
                  return (
                    <div key={stage.key} className="flex items-center gap-1.5">
                      <button
                        onClick={() => applyPipelineFilter(isActive ? null : { type: 'mmp_site_entry', status: stage.key, label: `Site Entries — ${stage.label}` })}
                        disabled={stage.count === 0}
                        className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-2 min-w-[72px] text-center transition-all
                          ${stage.count === 0 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:scale-105 hover:shadow-sm active:scale-95'}
                          ${isActive ? 'ring-2 ring-primary shadow-md scale-105' : ''}
                          ${stage.color}`}
                        data-testid={`pipeline-entry-${stage.key}`}
                      >
                        <span className="text-[10px] font-medium leading-tight">{stage.label}</span>
                        <span className="text-xl font-bold leading-none">{stage.count}</span>
                        {total > 0 && (
                          <span className="text-[9px] opacity-60">{Math.round((stage.count / total) * 100)}%</span>
                        )}
                      </button>
                      {i < arr.length - 1 && (
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
              {(sitePipeline?.entryTotal ?? 0) > 0 && (
                <div className="mt-3 flex h-2 rounded-full overflow-hidden gap-px">
                  {(sitePipeline?.entryStages ?? []).filter(s => s.count > 0).map(stage => (
                    <div key={stage.key} className={`${stage.dot} h-full transition-all`}
                      style={{ width: `${(stage.count / (sitePipeline?.entryTotal ?? 1)) * 100}%` }}
                      title={`${stage.label}: ${stage.count}`} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Site Visits */}
          <Card>
            <CardHeader className="py-3 px-4 border-b">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                Site Visits Flow
                <span className="ml-auto text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">
                  {sitePipeline?.visitTotal ?? 0} total
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 py-3">
              <p className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1">
                <Filter className="h-3 w-3" />Click a stage to filter the list below
              </p>
              <div className="flex flex-wrap gap-2 items-center">
                {(sitePipeline?.visitStages ?? []).map((stage, i, arr) => {
                  const isActive = pipelineFilter?.type === 'site_visit' && pipelineFilter?.status === stage.key;
                  const total = sitePipeline?.visitTotal ?? 0;
                  return (
                    <div key={stage.key} className="flex items-center gap-1.5">
                      <button
                        onClick={() => applyPipelineFilter(isActive ? null : { type: 'site_visit', status: stage.key, label: `Site Visits — ${stage.label}` })}
                        disabled={stage.count === 0}
                        className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-2 min-w-[72px] text-center transition-all
                          ${stage.count === 0 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:scale-105 hover:shadow-sm active:scale-95'}
                          ${isActive ? 'ring-2 ring-primary shadow-md scale-105' : ''}
                          ${stage.color}`}
                        data-testid={`pipeline-visit-${stage.key}`}
                      >
                        <span className="text-[10px] font-medium leading-tight">{stage.label}</span>
                        <span className="text-xl font-bold leading-none">{stage.count}</span>
                        {total > 0 && (
                          <span className="text-[9px] opacity-60">{Math.round((stage.count / total) * 100)}%</span>
                        )}
                      </button>
                      {i < arr.length - 1 && (
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
              {(sitePipeline?.visitTotal ?? 0) > 0 && (
                <div className="mt-3 flex h-2 rounded-full overflow-hidden gap-px">
                  {(sitePipeline?.visitStages ?? []).filter(s => s.count > 0).map(stage => (
                    <div key={stage.key} className={`${stage.dot} h-full transition-all`}
                      style={{ width: `${(stage.count / (sitePipeline?.visitTotal ?? 1)) * 100}%` }}
                      title={`${stage.label}: ${stage.count}`} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      )}

      {/* ── MMP Status + Cycle Close Overview ─────────────────────────────── */}
      {mmpOverviewLoading && <Skeleton className="h-44 w-full rounded-xl" />}
      {!mmpOverviewLoading && mmpOverview && (
        <Card>
          <CardHeader className="py-3 px-4 border-b">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              MMP Status &amp; Cycle Close
              <span className="ml-auto text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">
                {mmpOverview.total ?? 0} MMPs total
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 py-4 flex flex-col gap-4">
            {/* Top row: MMP approval status + Cycle status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* MMP Approval Status */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">MMP Approval Status</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'pending',              label: 'Pending',              color: 'bg-amber-50 text-amber-700 border-amber-200' },
                    { key: 'forwarded',            label: 'Forwarded',            color: 'bg-blue-50 text-blue-700 border-blue-200' },
                    { key: 'coordinator_accepted', label: 'Coord. Accepted',      color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
                    { key: 'approved',             label: 'Approved',             color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                    { key: 'rejected',             label: 'Rejected',             color: 'bg-rose-50 text-rose-700 border-rose-200' },
                    { key: 'recalled',             label: 'Recalled',             color: 'bg-orange-50 text-orange-700 border-orange-200' },
                  ].map(({ key, label, color }) => {
                    const count = mmpOverview.mmpStatusCounts[key] ?? 0;
                    if (count === 0) return null;
                    return (
                      <div key={key} className={`flex flex-col items-center rounded-lg border px-3 py-1.5 min-w-[64px] text-center ${color}`} data-testid={`mmp-status-${key}`}>
                        <span className="text-[10px] font-medium leading-tight">{label}</span>
                        <span className="text-lg font-bold leading-none mt-0.5">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cycle Status */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Cycle Status</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'active',            label: 'Active',            color: 'bg-emerald-50 text-emerald-700 border-emerald-200',  zeroColor: 'bg-slate-50 text-slate-400 border-slate-200' },
                    { key: 'closing',           label: 'Closing',           color: 'bg-amber-50 text-amber-700 border-amber-200',        zeroColor: 'bg-slate-50 text-slate-400 border-slate-200' },
                    { key: 'pending_approval',  label: 'Pending Approval',  color: 'bg-blue-50 text-blue-700 border-blue-200',           zeroColor: 'bg-slate-50 text-slate-400 border-slate-200' },
                    { key: 'closed',            label: 'Closed',            color: 'bg-slate-100 text-slate-700 border-slate-300',       zeroColor: 'bg-slate-50 text-slate-400 border-slate-200' },
                  ].map(({ key, label, color, zeroColor }) => {
                    const count = mmpOverview.cycleStatusCounts[key] ?? 0;
                    return (
                      <div key={key} className={`flex flex-col items-center rounded-lg border px-3 py-1.5 min-w-[64px] text-center ${count > 0 ? color : zeroColor}`} data-testid={`cycle-status-${key}`}>
                        <span className="text-[10px] font-medium leading-tight">{label}</span>
                        <span className="text-lg font-bold leading-none mt-0.5">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Recently closed MMPs — always visible */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-slate-500" />Recently Closed Cycles
                <span className="ml-1 font-mono bg-slate-100 text-slate-500 px-1 rounded">{mmpOverview.recentlyClosed.length}</span>
              </p>
              {mmpOverview.recentlyClosed.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-md px-3 py-2.5" data-testid="no-closed-mmps">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>No MMP cycles have been closed yet</span>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {mmpOverview.recentlyClosed.map(mmp => (
                    <div key={mmp.id} className="flex items-center gap-3 text-xs bg-slate-50 border border-slate-200 rounded-md px-3 py-1.5" data-testid={`closed-mmp-${mmp.id}`}>
                      <span className="font-medium truncate flex-1">{mmp.name}</span>
                      {mmp.hub && <span className="text-muted-foreground shrink-0">{mmp.hub}</span>}
                      {mmp.month && <span className="text-muted-foreground shrink-0 font-mono">{mmp.month}</span>}
                      <span className="shrink-0 text-slate-500 font-mono flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {format(new Date(mmp.cycle_closed_at), 'MMM d, yyyy')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter panel */}
      {showFilters && (
        <Card className="border-dashed">
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <Select value={filters.status} onValueChange={v => setFilters(f => ({ ...f, status: v === 'all' ? '' : v as DashboardStatus }))}>
                <SelectTrigger data-testid="filter-status"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(STATUS_CFG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.type} onValueChange={v => setFilters(f => ({ ...f, type: v === 'all' ? '' : v as ActionTypeKey }))}>
                <SelectTrigger data-testid="filter-type"><SelectValue placeholder="All Modules" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Modules</SelectItem>
                  {ACTION_TYPES.map(at => <SelectItem key={at.key} value={at.key}>{at.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input type="date" className="pl-9 text-sm" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} data-testid="filter-from" />
              </div>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input type="date" className="pl-9 text-sm" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} data-testid="filter-to" />
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9 text-sm" placeholder="Search sender…" value={filters.sender} onChange={e => setFilters(f => ({ ...f, sender: e.target.value }))} data-testid="filter-sender" />
              </div>
            </div>
            {(filters.type || filters.status || filters.from || filters.to || filters.sender) && (
              <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setFilters({ type:'', status:'', from:'', to:'', sender:'' })} data-testid="button-clear-filters">
                <X className="h-3 w-3 mr-1" />Clear all filters
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Bulk bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5 flex-wrap" data-testid="bulk-action-bar">
          <span className="text-sm font-semibold font-mono text-primary">{selectedIds.size} selected</span>
          <Separator orientation="vertical" className="h-4" />
          <Button size="sm" onClick={() => { setStatusDialog({ actions: selectedActions, targetStatus: 'acted', label: 'Mark All as Acted' }); setStatusNotes(''); }} data-testid="button-bulk-acted">
            <CheckCircle className="h-3.5 w-3.5 mr-1" />Mark Acted
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setStatusDialog({ actions: selectedActions, targetStatus: 'ignored', label: 'Mark All as Ignored' }); setStatusNotes(''); }} data-testid="button-bulk-ignored">
            <XCircle className="h-3.5 w-3.5 mr-1" />Mark Ignored
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set(allActions.map(a => a.action_id)))} data-testid="button-select-all">Select All</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} data-testid="button-clear-selection"><X className="h-3.5 w-3.5" /></Button>
        </div>
      )}

      {/* Migration hint when no data and no error */}
      {!isLoading && !error && allActions.length === 0 && (
        <Card className="border-dashed border-amber-200 bg-amber-50/50">
          <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
            <div className="p-3 rounded-full bg-amber-100">
              <Info className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-800">No data found</p>
              <p className="text-xs text-amber-600 mt-1 max-w-md">
                If you just set up the monitoring dashboard, make sure you have run the latest migration in your Supabase SQL editor:
              </p>
              <code className="text-xs bg-amber-100 border border-amber-200 rounded px-2 py-1 mt-2 inline-block font-mono text-amber-700">
                20260328_monitoring_grants_and_rpc.sql
              </code>
              <p className="text-xs text-amber-600 mt-2">
                Then refresh the page. If you have data in the system tables it will appear here.
              </p>
            </div>
            <Button variant="outline" size="sm" className="border-amber-300 text-amber-700" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading rows */}
      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      )}

      {/* Pipeline filter active banner */}
      {pipelineFilter && (
        <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2.5" data-testid="pipeline-filter-banner">
          <MapPin className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium text-primary flex-1">
            Showing: <span className="font-bold">{pipelineFilter.label}</span>
            <span className="ml-2 font-mono text-xs bg-primary/10 px-1.5 py-0.5 rounded">{displayedActions.length} records</span>
          </span>
          <Button size="sm" variant="ghost" className="text-primary text-xs h-7" onClick={() => setPipelineFilter(null)} data-testid="button-clear-pipeline-filter">
            <X className="h-3 w-3 mr-1" />Clear filter
          </Button>
        </div>
      )}

      {/* KPI quick-filter active banner */}
      {(filters.status || filters.urgency) && (
        <div className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-lg px-4 py-2.5" data-testid="kpi-filter-banner">
          <Filter className="h-4 w-4 text-violet-600 shrink-0" />
          <span className="text-sm font-medium text-violet-700 flex-1">
            Filtering by:{' '}
            {filters.status && <span className="font-bold capitalize">{filters.status.replace(/_/g, ' ')}</span>}
            {filters.urgency && <span className="font-bold capitalize">{filters.urgency} urgency</span>}
            <span className="ml-2 font-mono text-xs bg-violet-100 px-1.5 py-0.5 rounded">{displayedActions.length} records</span>
          </span>
          <Button size="sm" variant="ghost" className="text-violet-600 text-xs h-7"
            onClick={() => setFilters(f => ({ ...f, status: '', urgency: '' }))}
            data-testid="button-clear-kpi-filter">
            <X className="h-3 w-3 mr-1" />Clear
          </Button>
        </div>
      )}

      {/* ── Transportation Advance Coverage Card ─────────────────────────── */}
      <Card data-testid="card-advance-coverage">
        <button
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left rounded-t-lg"
          onClick={() => setShowCoverage(v => !v)}
          data-testid="button-toggle-advance-coverage"
        >
          <span className="p-1.5 rounded-md bg-orange-100 text-orange-600 shrink-0"><ArrowRight className="h-3.5 w-3.5" /></span>
          <span className="text-sm font-bold text-foreground flex-1">Transportation Advance Coverage</span>
          {coverageLoading
            ? <Skeleton className="h-5 w-24" />
            : (
              <>
                <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {coverageSummary.total.toLocaleString()} active sites
                </span>
                {coverageSummary.noRequest > 0 && (
                  <span className="text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded-full">
                    {coverageSummary.noRequest.toLocaleString()} NO REQUEST
                  </span>
                )}
                {coverageSummary.noRequest === 0 && coverageSummary.total > 0 && (
                  <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                    100% covered
                  </span>
                )}
              </>
            )
          }
          {showCoverage ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
        </button>

        {/* Summary stat cards — always visible, click to filter */}
        {!coverageLoading && coverageSummary.total > 0 && (
          <div className="px-4 pb-3 border-t pt-3 space-y-3">
            {(() => {
              const cards = [
                { label: 'Total Sites',        value: coverageSummary.total,             cls: 'text-foreground',   status: 'all',               ring: 'ring-gray-400' },
                { label: 'Pending Supervisor', value: coverageSummary.pendingSupervisor, cls: 'text-orange-500',   status: 'pending_supervisor', ring: 'ring-orange-400' },
                { label: 'Pending Admin',      value: coverageSummary.pendingAdmin,      cls: 'text-amber-500',    status: 'pending_admin',      ring: 'ring-amber-400' },
                { label: 'Approved',           value: coverageSummary.approved,          cls: 'text-emerald-600',  status: 'approved',           ring: 'ring-emerald-500' },
                { label: 'Fully Paid',         value: coverageSummary.fullyPaid,         cls: 'text-emerald-700',  status: 'fully_paid',         ring: 'ring-emerald-600' },
                { label: 'Partially Paid',     value: coverageSummary.partiallyPaid,     cls: 'text-teal-600',     status: 'partially_paid',     ring: 'ring-teal-500' },
                { label: 'Confirmed',          value: coverageSummary.confirmed,         cls: 'text-blue-600',     status: 'confirmed',          ring: 'ring-blue-500' },
                { label: 'Acknowledged',       value: coverageSummary.acknowledged,      cls: 'text-indigo-600',   status: 'acknowledged',       ring: 'ring-indigo-500' },
                { label: 'Rejected',           value: coverageSummary.rejected,          cls: 'text-rose-600',     status: 'rejected',           ring: 'ring-rose-500' },
                { label: 'Cancelled',          value: coverageSummary.cancelled,         cls: 'text-red-400',      status: 'cancelled',          ring: 'ring-red-300' },
                { label: 'No Request Yet',     value: coverageSummary.noRequest,         cls: coverageSummary.noRequest > 0 ? 'text-red-600' : 'text-emerald-600', status: 'no_request', ring: 'ring-red-400' },
              ];
              return (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1.5">
                  {cards.map(c => {
                    const active = coverageStatusFilter === c.status;
                    return (
                      <button
                        key={c.label}
                        onClick={() => { setCoverageStatusFilter(active ? 'all' : c.status); setShowCoverage(true); }}
                        className={`rounded-lg border p-2 text-center cursor-pointer transition-all hover:shadow-sm select-none bg-card ${active ? `ring-2 ${c.ring} shadow-sm` : 'hover:ring-1 hover:ring-muted-foreground/30'}`}
                        data-testid={`card-mon-cov-${c.status}`}
                      >
                        <div className={`text-base font-bold ${c.cls}`}>{c.value.toLocaleString()}</div>
                        <div className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{c.label}</div>
                        {active && <div className="text-[8px] text-muted-foreground mt-0.5 font-medium">● ON</div>}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
            {/* Coverage bar */}
            <div>
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span>Coverage: {coverageSummary.pct}%</span>
                <span>{coverageSummary.totalWithReq.toLocaleString()} of {coverageSummary.total.toLocaleString()} sites have requests</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                <div className="bg-orange-400 h-full transition-all" style={{ width: `${coverageSummary.total > 0 ? (coverageSummary.pendingSupervisor / coverageSummary.total) * 100 : 0}%` }} />
                <div className="bg-amber-400  h-full transition-all" style={{ width: `${coverageSummary.total > 0 ? (coverageSummary.pendingAdmin / coverageSummary.total) * 100 : 0}%` }} />
                <div className="bg-emerald-500 h-full transition-all" style={{ width: `${coverageSummary.total > 0 ? (coverageSummary.approved / coverageSummary.total) * 100 : 0}%` }} />
                <div className="bg-emerald-700 h-full transition-all" style={{ width: `${coverageSummary.total > 0 ? (coverageSummary.fullyPaid / coverageSummary.total) * 100 : 0}%` }} />
                <div className="bg-teal-500   h-full transition-all" style={{ width: `${coverageSummary.total > 0 ? (coverageSummary.partiallyPaid / coverageSummary.total) * 100 : 0}%` }} />
                <div className="bg-blue-500   h-full transition-all" style={{ width: `${coverageSummary.total > 0 ? (coverageSummary.confirmed / coverageSummary.total) * 100 : 0}%` }} />
                <div className="bg-indigo-500 h-full transition-all" style={{ width: `${coverageSummary.total > 0 ? (coverageSummary.acknowledged / coverageSummary.total) * 100 : 0}%` }} />
                <div className="bg-rose-500   h-full transition-all" style={{ width: `${coverageSummary.total > 0 ? (coverageSummary.rejected / coverageSummary.total) * 100 : 0}%` }} />
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[9px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />Pending Sup. ({coverageSummary.pendingSupervisor})</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />Pending Admin ({coverageSummary.pendingAdmin})</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />Approved ({coverageSummary.approved})</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-700 inline-block" />Fully Paid ({coverageSummary.fullyPaid})</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-teal-500 inline-block" />Partially Paid ({coverageSummary.partiallyPaid})</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />Confirmed ({coverageSummary.confirmed})</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block" />Acknowledged ({coverageSummary.acknowledged})</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />Rejected ({coverageSummary.rejected})</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-300 inline-block" />Cancelled ({coverageSummary.cancelled})</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 inline-block" />No Request ({coverageSummary.noRequest})</span>
              </div>
            </div>
          </div>
        )}

        {/* Expanded: sites grouped by hub for selected status */}
        {showCoverage && (
          <div className="border-t">
            {/* Filter bar: MMP → State → Locality → Hub */}
            <div className="px-4 py-2.5 bg-slate-50 border-b space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-slate-500 shrink-0" />
                <span className="text-xs font-semibold text-slate-700 flex-1">
                  {(() => {
                    const m: Record<string, string> = {
                      all: 'All Sites', no_request: 'Sites with No Advance Request',
                      pending_supervisor: 'Pending Supervisor', pending_admin: 'Pending Admin',
                      approved: 'Approved', fully_paid: 'Fully Paid', partially_paid: 'Partially Paid',
                      confirmed: 'Confirmed', acknowledged: 'Acknowledged',
                      rejected: 'Rejected', cancelled: 'Cancelled',
                    };
                    return m[coverageStatusFilter] ?? 'Sites';
                  })()}
                </span>
                <span className="text-[10px] text-muted-foreground">{coverageFiltered.length.toLocaleString()} sites</span>
                {(coverageMmpFilter !== 'all' || coverageHubFilter !== 'all' || coverageStateFilter !== 'all' || coverageDcFilter !== 'all') && (
                  <button
                    onClick={() => { setCoverageMmpFilter('all'); setCoverageHubFilter('all'); setCoverageStateFilter('all'); setCoverageDcFilter('all'); }}
                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 px-1.5 py-0.5 rounded border border-muted hover:border-foreground/30 transition-colors"
                    data-testid="button-clear-coverage-filters"
                  >
                    <X className="h-2.5 w-2.5" />Clear
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {/* Order: MMP → Hub → State → Data Collector (mirrors MMP Site Entries tree) */}
                <Select value={coverageMmpFilter} onValueChange={setCoverageMmpFilter}>
                  <SelectTrigger className="h-7 text-xs w-[160px]" data-testid="select-coverage-mmp-filter">
                    <SelectValue placeholder="All MMPs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All MMPs</SelectItem>
                    {coverageMmps.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={coverageHubFilter} onValueChange={setCoverageHubFilter}>
                  <SelectTrigger className="h-7 text-xs w-[150px]" data-testid="select-coverage-hub-filter">
                    <SelectValue placeholder="All Hubs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Hubs</SelectItem>
                    {coverageHubs.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={coverageStateFilter} onValueChange={setCoverageStateFilter}>
                  <SelectTrigger className="h-7 text-xs w-[150px]" data-testid="select-coverage-state-filter">
                    <SelectValue placeholder="All States" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All States</SelectItem>
                    {coverageStates.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={coverageDcFilter} onValueChange={setCoverageDcFilter}>
                  <SelectTrigger className="h-7 text-xs w-[180px]" data-testid="select-coverage-dc-filter">
                    <SelectValue placeholder="All Data Collectors" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Data Collectors</SelectItem>
                    {coverageDataCollectors.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Flat table — same style as Down Payment Approval page */}
            {coverageFiltered.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                {coverageStatusFilter !== 'all' || coverageMmpFilter !== 'all' || coverageHubFilter !== 'all' || coverageStateFilter !== 'all' || coverageDcFilter !== 'all'
                  ? 'No sites match this filter'
                  : 'No sites found'}
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead>Site Name</TableHead>
                      <TableHead>Hub</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Data Collector</TableHead>
                      <TableHead>MMP</TableHead>
                      <TableHead>Advance Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coverageFiltered.map(s => {
                      const st = s.advance_status;
                      const chip = !st
                        ? 'bg-slate-100 text-slate-500'
                        : st === 'pending_supervisor' ? 'bg-amber-100 text-amber-800'
                        : st === 'pending_admin'      ? 'bg-orange-100 text-orange-800'
                        : st === 'approved'           ? 'bg-green-100 text-green-800'
                        : st === 'fully_paid'         ? 'bg-teal-100 text-teal-800'
                        : st === 'partially_paid'     ? 'bg-cyan-100 text-cyan-800'
                        : st === 'confirmed'          ? 'bg-blue-100 text-blue-800'
                        : st === 'acknowledged'       ? 'bg-violet-100 text-violet-800'
                        : st === 'rejected'           ? 'bg-red-100 text-red-800'
                        : st === 'cancelled'          ? 'bg-slate-100 text-slate-600'
                        : 'bg-slate-100 text-slate-600';
                      const label = !st ? 'No Request'
                        : st === 'pending_supervisor' ? 'Pending Supervisor'
                        : st === 'pending_admin'      ? 'Pending Admin'
                        : st === 'approved'           ? 'Approved'
                        : st === 'fully_paid'         ? 'Fully Paid'
                        : st === 'partially_paid'     ? 'Partially Paid'
                        : st === 'confirmed'          ? 'Confirmed'
                        : st === 'acknowledged'       ? 'Acknowledged'
                        : st === 'rejected'           ? 'Rejected'
                        : st === 'cancelled'          ? 'Cancelled'
                        : st;
                      return (
                        <TableRow key={s.id} className="text-xs" data-testid={`row-cov-${s.id}`}>
                          <TableCell className="font-medium">{s.site_name}</TableCell>
                          <TableCell>{s.hub_name}</TableCell>
                          <TableCell>{s.state_name}</TableCell>
                          <TableCell className="text-muted-foreground">{s.data_collector_name}</TableCell>
                          <TableCell className="text-muted-foreground max-w-[130px] truncate">{s.mmp_name}</TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] px-2 py-0.5 ${chip}`}>{label}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {showCoverage && coverageSummary.noRequest === 0 && coverageSummary.total > 0 && (
          <div className="px-4 py-6 border-t text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-emerald-700">All active sites have advance requests</p>
          </div>
        )}
      </Card>

      {/* Action Feed — grouped by module */}
      {!isLoading && !error && allActions.length > 0 && (
        <div ref={actionFeedRef} className="flex flex-col gap-3" data-testid="action-feed">
          {ACTION_TYPES.map(at => {
            const items = displayedActions.filter(a => a.action_type === at.key);
            if (items.length === 0) return null;
            const sharedProps = {
              selectedIds, expandedId,
              onToggleSelect: toggleSelect,
              onToggleExpand: (id: string) => setExpandedId(p => p === id ? null : id),
              onStatusChange: (action: DashboardAction, status: DashboardStatus, label: string) => { setStatusDialog({ actions: [action], targetStatus: status, label }); setStatusNotes(''); },
              onWorkflow: (action: DashboardAction, wa: string, wl: string) => { setWorkflowDialog({ action, workflowAction: wa, workflowLabel: wl }); setWorkflowNotes(''); },
              workflowPending: workflowMutation.isPending,
            };
            const Icon = at.icon;

            // 4 target modules → collapsible summary card with stats
            if (CARD_MODULES.has(at.key)) {
              return <ModuleSummaryCard key={at.key} at={at} items={items} {...sharedProps} />;
            }

            // Other modules → flat list with simple header
            return (
              <div key={at.key}>
                <div className="flex items-center gap-2 px-1 mb-1.5">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{at.label}</span>
                  <Badge variant="secondary" className="text-[9px] h-4 px-1.5 rounded font-mono">{items.length}</Badge>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="flex flex-col gap-1">
                  {items.map(action => (
                    <ActionRow
                      key={action.action_id}
                      action={action}
                      selected={selectedIds.has(action.action_id)}
                      expanded={expandedId === action.action_id}
                      onToggleSelect={() => toggleSelect(action.action_id)}
                      onToggleExpand={() => setExpandedId(p => p === action.action_id ? null : action.action_id)}
                      onStatusChange={(status, label) => { setStatusDialog({ actions: [action], targetStatus: status, label }); setStatusNotes(''); }}
                      onWorkflow={(wa, wl) => { setWorkflowDialog({ action, workflowAction: wa, workflowLabel: wl }); setWorkflowNotes(''); }}
                      workflowPending={workflowMutation.isPending}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Notify Users Dialog */}
      <NotifyUsersDialog open={notifyOpen} onClose={() => setNotifyOpen(false)} allActions={allActions} />

      {/* Workflow Dialog */}
      <Dialog open={!!workflowDialog} onOpenChange={open => { if (!open) setWorkflowDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm: {workflowDialog?.workflowLabel}</DialogTitle>
            <DialogDescription>
              Applying <strong>{workflowDialog?.workflowLabel}</strong> to{' '}
              {workflowDialog?.action.action_type.replace(/_/g, ' ')}{' '}
              <code className="text-xs bg-muted px-1 rounded">{workflowDialog?.action.action_id.slice(0, 8)}…</code>.
              This updates the source record.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Notes (optional)</label>
            <Textarea placeholder="Context or reason…" value={workflowNotes} onChange={e => setWorkflowNotes(e.target.value)} data-testid="input-workflow-notes" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWorkflowDialog(null)} data-testid="button-workflow-cancel">Cancel</Button>
            <Button disabled={workflowMutation.isPending} onClick={() => {
              if (!workflowDialog) return;
              workflowMutation.mutate({ action_id: workflowDialog.action.action_id, source_table: workflowDialog.action.source_table, workflow_action: workflowDialog.workflowAction, notes: workflowNotes || undefined });
            }} data-testid="button-workflow-confirm">
              {workflowMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status Dialog */}
      <Dialog open={!!statusDialog} onOpenChange={open => { if (!open) setStatusDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{statusDialog?.label}</DialogTitle>
            <DialogDescription>
              Setting {statusDialog?.actions.length === 1 ? 'this item' : `${statusDialog?.actions.length} items`} to "{statusDialog?.targetStatus}".
              Dashboard awareness only — does not change the source record.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Notes (optional)</label>
            <Textarea placeholder="Reason for this change…" value={statusNotes} onChange={e => setStatusNotes(e.target.value)} data-testid="input-status-notes" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialog(null)} data-testid="button-status-cancel">Cancel</Button>
            <Button disabled={statusMutation.isPending} onClick={() => {
              if (!statusDialog) return;
              statusMutation.mutate(statusDialog.actions.map(a => ({
                action_id: a.action_id, action_type: a.action_type,
                source_table: a.source_table, status: statusDialog.targetStatus,
                notes: statusNotes || undefined,
              })));
            }} data-testid="button-status-confirm">
              {statusMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Notify Users Dialog ────────────────────────────────────────────────────────

function NotifyUsersDialog({ open, onClose, allActions }: {
  open: boolean; onClose: () => void; allActions: DashboardAction[];
}) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode] = useState<'pending' | 'no_response' | 'all'>('pending');
  const [priority, setPriority] = useState<'normal' | 'high' | 'urgent'>('normal');
  const [msgEn, setMsgEn] = useState('You have pending actions in the PACT system that require your attention. Please log in and complete your assigned tasks.');
  const [msgAr, setMsgAr] = useState('لديك إجراءات معلقة في نظام PACT تحتاج إلى اهتمامك. يرجى تسجيل الدخول وإكمال المهام المُسنَدة إليك.');

  // Build unique user list from allActions
  const userList = useMemo(() => {
    const map = new Map<string, {
      id: string; name: string; email: string | null;
      pending: number; noResponse: number; modules: Set<string>;
    }>();
    for (const a of allActions) {
      if (!a.sender_id) continue;
      if (!map.has(a.sender_id)) {
        map.set(a.sender_id, { id: a.sender_id, name: a.sender_name || 'Unknown', email: a.sender_email || null, pending: 0, noResponse: 0, modules: new Set() });
      }
      const u = map.get(a.sender_id)!;
      if (a.dashboard_status === 'received') u.pending++;
      if (a.dashboard_status === 'no_response') u.noResponse++;
      const at = ACTION_TYPES.find(t => t.key === a.action_type);
      if (at) u.modules.add(at.label);
    }
    return [...map.values()].sort((a, b) => (b.noResponse + b.pending) - (a.noResponse + a.pending));
  }, [allActions]);

  // Filter visible users by mode
  const filteredUsers = useMemo(() => {
    if (filterMode === 'pending')     return userList.filter(u => u.pending > 0);
    if (filterMode === 'no_response') return userList.filter(u => u.noResponse > 0);
    return userList;
  }, [userList, filterMode]);

  // Auto-select all filtered users when filter changes
  useEffect(() => {
    setSelectedIds(new Set(filteredUsers.map(u => u.id)));
  }, [filteredUsers]);

  const toggleUser = (id: string) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const selectedUsers = filteredUsers.filter(u => selectedIds.has(u.id));

  const send = async () => {
    if (selectedUsers.length === 0) { toast({ title: 'No recipients selected', variant: 'destructive' }); return; }
    setSending(true);
    try {
      const rows = selectedUsers.map(u => ({
        recipient_id: u.id,
        title_en: priority === 'urgent' ? '🚨 URGENT: Action Required' : priority === 'high' ? '⚠️ Action Required' : '📋 Action Required',
        title_ar: priority === 'urgent' ? '🚨 عاجل: إجراء مطلوب' : priority === 'high' ? '⚠️ إجراء مطلوب' : '📋 إجراء مطلوب',
        message_en: msgEn,
        message_ar: msgAr,
        event_type: 'monitoring_reminder',
        action_url: '/dashboard',
        priority,
        status: 'unread',
      }));
      await insertNotifications(rows);
      toast({ title: `Notification sent to ${selectedUsers.length} user${selectedUsers.length !== 1 ? 's' : ''}` });
      onClose();
    } catch (err) {
      toast({ title: 'Failed to send notifications', description: String(err), variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const priorityColors = { normal: 'bg-slate-100 text-slate-700', high: 'bg-amber-100 text-amber-700', urgent: 'bg-red-100 text-red-700' };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0" data-testid="notify-users-dialog">
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4 text-violet-600" />Send Action Reminder
          </DialogTitle>
          <DialogDescription className="text-xs">
            Send an in-app notification to users who have pending actions in the system.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* Recipient filter tabs */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><Users className="h-3.5 w-3.5" />Recipients</p>
            <div className="flex gap-2 flex-wrap mb-3">
              {([['pending', 'Pending Actions', userList.filter(u=>u.pending>0).length], ['no_response', 'No Response', userList.filter(u=>u.noResponse>0).length], ['all', 'All Users', userList.length]] as const).map(([mode, label, n]) => (
                <button key={mode} onClick={() => setFilterMode(mode)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${filterMode === mode ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}
                  data-testid={`notify-filter-${mode}`}>
                  {label} <span className="font-mono ml-1 opacity-70">{n}</span>
                </button>
              ))}
              <button onClick={() => setSelectedIds(new Set(filteredUsers.map(u => u.id)))} className="text-xs text-violet-600 hover:underline ml-auto" data-testid="notify-select-all">Select all</button>
              <button onClick={() => setSelectedIds(new Set())} className="text-xs text-slate-500 hover:underline" data-testid="notify-clear-all">Clear</button>
            </div>

            {/* User list */}
            <div className="border rounded-lg divide-y max-h-44 overflow-y-auto" data-testid="notify-user-list">
              {filteredUsers.length === 0 && (
                <div className="px-4 py-3 text-xs text-muted-foreground text-center">No users match this filter</div>
              )}
              {filteredUsers.map(u => (
                <label key={u.id} className={`flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors ${selectedIds.has(u.id) ? 'bg-violet-50/40' : ''}`} data-testid={`notify-user-${u.id}`}>
                  <Checkbox checked={selectedIds.has(u.id)} onCheckedChange={() => toggleUser(u.id)} className="mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-slate-800 truncate">{u.name}</span>
                      {u.noResponse > 0 && <span className="text-[9px] bg-amber-100 text-amber-700 border border-amber-200 px-1 rounded-full font-bold">{u.noResponse} no-response</span>}
                      {u.pending > 0    && <span className="text-[9px] bg-blue-50 text-blue-700 border border-blue-200 px-1 rounded-full font-bold">{u.pending} pending</span>}
                    </div>
                    {u.email && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{u.email}</p>}
                    <p className="text-[10px] text-slate-500 mt-0.5 truncate">{[...u.modules].join(' · ')}</p>
                  </div>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{selectedIds.size} of {filteredUsers.length} selected</p>
          </div>

          {/* Priority */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Priority</p>
            <div className="flex gap-2">
              {(['normal', 'high', 'urgent'] as const).map(p => (
                <button key={p} onClick={() => setPriority(p)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium capitalize transition-colors ${priority === p ? priorityColors[p] + ' border-current font-bold' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                  data-testid={`notify-priority-${p}`}>{p}</button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-muted-foreground">Message (English)</p>
            <Textarea rows={3} value={msgEn} onChange={e => setMsgEn(e.target.value)} className="text-xs resize-none" data-testid="notify-message-en" />
            <p className="text-xs font-semibold text-muted-foreground">Message (Arabic)</p>
            <Textarea rows={3} value={msgAr} onChange={e => setMsgAr(e.target.value)} className="text-xs resize-none text-right" dir="rtl" data-testid="notify-message-ar" />
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t shrink-0 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground flex-1">
            Will send in-app notification to <span className="font-bold text-foreground">{selectedIds.size}</span> user{selectedIds.size !== 1 ? 's' : ''}
          </p>
          <Button variant="outline" size="sm" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white" onClick={send} disabled={sending || selectedIds.size === 0} data-testid="notify-send-btn">
            {sending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
            Send {selectedIds.size > 0 ? `to ${selectedIds.size}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon, accent, testId, onClick, active }: {
  label: string; value: number; sub: string;
  icon: React.ReactNode; accent: 'blue' | 'green' | 'amber' | 'red';
  testId: string; onClick?: () => void; active?: boolean;
}) {
  const map = {
    blue:  { icon: 'text-blue-600 bg-blue-50 border-blue-100',   val: 'text-blue-700',    ring: 'ring-2 ring-blue-300 border-blue-300' },
    green: { icon: 'text-emerald-600 bg-emerald-50 border-emerald-100', val: 'text-emerald-700', ring: 'ring-2 ring-emerald-300 border-emerald-300' },
    amber: { icon: 'text-amber-600 bg-amber-50 border-amber-100',  val: 'text-amber-700',   ring: 'ring-2 ring-amber-300 border-amber-300' },
    red:   { icon: 'text-red-600 bg-red-50 border-red-100',        val: 'text-red-700',     ring: 'ring-2 ring-red-300 border-red-300' },
  };
  return (
    <Card
      className={`transition-all ${onClick ? 'cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-100' : 'hover:shadow-sm'} ${active ? map[accent].ring : ''}`}
      onClick={onClick}
      data-testid={testId}
    >
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground truncate flex items-center gap-1">
              {label}
              {onClick && <span className="text-[9px] opacity-40">↓ click to filter</span>}
            </p>
            <p className={`text-3xl font-bold font-mono mt-1 ${value > 0 && (accent === 'red' || accent === 'amber') ? map[accent].val : ''}`}>
              {value}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>
          </div>
          <span className={`p-2 rounded-lg border ${map[accent].icon} shrink-0`}>{icon}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Module Summary Card ────────────────────────────────────────────────────────
// Wraps a module's action rows inside a collapsible card with hub/requester/status stats.

const CARD_MODULES = new Set(['mmp_lifecycle', 'mmp_site_entry', 'operational_cost', 'advance_payment']);

function ModuleSummaryCard({
  at, items, selectedIds, expandedId,
  onToggleSelect, onToggleExpand, onStatusChange, onWorkflow, workflowPending,
}: {
  at: { key: ActionTypeKey; label: string; icon: React.ComponentType<{ className?: string }> };
  items: DashboardAction[];
  selectedIds: Set<string>;
  expandedId: string | null;
  onToggleSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onStatusChange: (action: DashboardAction, status: DashboardStatus, label: string) => void;
  onWorkflow: (action: DashboardAction, wa: string, wl: string) => void;
  workflowPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const Icon = at.icon;

  const getHub   = (a: DashboardAction) => {
    const d = a.details as Record<string, unknown>;
    return String(d?.hub_name ?? d?.hub_office ?? '—');
  };
  const getSender = (a: DashboardAction) => a.sender_name || 'Unknown';

  // Status breakdown
  const statusMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of items) {
      const k = a.native_status || 'unknown';
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  // Hub breakdown (top 6)
  const hubMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of items) { const k = getHub(a); m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [items]);

  // Requester breakdown (top 6)
  const senderMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of items) { const k = getSender(a); m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [items]);

  // Dashboard status counts
  const actedCount      = items.filter(a => a.dashboard_status === 'acted').length;
  const noRespCount     = items.filter(a => a.dashboard_status === 'no_response').length;
  const criticalCount   = items.filter(a => urgencyLevel(a) === 'critical').length;
  const maxHubCount     = hubMap[0]?.[1] ?? 1;
  const maxSenderCount  = senderMap[0]?.[1] ?? 1;

  const statusColors: Record<string, string> = {
    approved: 'bg-emerald-100 text-emerald-700', completed: 'bg-emerald-100 text-emerald-700',
    pending:  'bg-amber-100 text-amber-700',     dispatched: 'bg-blue-100 text-blue-700',
    rejected: 'bg-rose-100 text-rose-700',       returned:   'bg-orange-100 text-orange-700',
    accepted: 'bg-indigo-100 text-indigo-700',   cancelled:  'bg-red-100 text-red-700',
  };
  const statusColor = (k: string) => statusColors[k.toLowerCase().replace(/[\s_-]/g, '')] ?? statusColors[k] ?? 'bg-slate-100 text-slate-600';

  return (
    <div className="rounded-xl border border-border overflow-hidden shadow-sm" data-testid={`module-card-${at.key}`}>
      {/* ── Card header — always visible, click to toggle rows ── */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/40 transition-colors text-left"
        onClick={() => setOpen(v => !v)}
        data-testid={`module-card-toggle-${at.key}`}
      >
        <span className="p-1.5 rounded-md bg-primary/10 text-primary shrink-0"><Icon className="h-3.5 w-3.5" /></span>
        <span className="text-sm font-bold text-foreground flex-1">{at.label}</span>
        <span className="font-mono text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full shrink-0">{items.length} records</span>
        {criticalCount > 0 && <span className="text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded-full">{criticalCount} CRITICAL</span>}
        {actedCount > 0    && <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full">{actedCount} acted</span>}
        {noRespCount > 0   && <span className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">{noRespCount} no response</span>}
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 rotate-180" />}
      </button>

      {/* ── Stats panel — always visible ── */}
      <div className="px-4 py-3 border-t border-border/60 bg-slate-50/60 grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* Status distribution */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Status Distribution</p>
          <div className="flex flex-wrap gap-1">
            {statusMap.slice(0, 8).map(([k, n]) => (
              <span key={k} className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${statusColor(k)}`}>
                {k} <span className="font-mono font-bold">{n}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Hub breakdown */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">By Hub</p>
          <div className="flex flex-col gap-1">
            {hubMap.map(([hub, n]) => (
              <div key={hub} className="flex items-center gap-2">
                <span className="text-[10px] text-slate-600 w-28 truncate shrink-0">{hub}</span>
                <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-primary/60 h-full rounded-full" style={{ width: `${Math.round((n / maxHubCount) * 100)}%` }} />
                </div>
                <span className="text-[10px] font-mono font-bold text-slate-700 shrink-0 w-6 text-right">{n}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Requester breakdown */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">By Requester</p>
          <div className="flex flex-col gap-1">
            {senderMap.map(([sender, n]) => (
              <div key={sender} className="flex items-center gap-2">
                <span className="text-[10px] text-slate-600 w-28 truncate shrink-0">{sender}</span>
                <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-violet-400/70 h-full rounded-full" style={{ width: `${Math.round((n / maxSenderCount) * 100)}%` }} />
                </div>
                <span className="text-[10px] font-mono font-bold text-slate-700 shrink-0 w-6 text-right">{n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Detail rows — visible only when expanded ── */}
      {open && (
        <div className="border-t border-border/60 bg-card px-2 py-2">
          <StatusHubTree
            items={items} selectedIds={selectedIds} expandedId={expandedId}
            onToggleSelect={onToggleSelect} onToggleExpand={onToggleExpand}
            onStatusChange={onStatusChange} onWorkflow={onWorkflow}
            workflowPending={workflowPending}
            actionType={at.key}
          />
        </div>
      )}
    </div>
  );
}

// ── Status → Hub tree (all module cards) ──────────────────────────────────────

const STATUS_CHIP_COLORS: Record<string, string> = {
  pending:              'bg-amber-100 text-amber-800 border-amber-200',
  dispatched:           'bg-blue-100 text-blue-800 border-blue-200',
  accepted:             'bg-emerald-100 text-emerald-800 border-emerald-200',
  completed:            'bg-green-100 text-green-800 border-green-200',
  approved:             'bg-green-100 text-green-800 border-green-200',
  rejected:             'bg-red-100 text-red-800 border-red-200',
  returned:             'bg-orange-100 text-orange-800 border-orange-200',
  returnedtofom:        'bg-orange-100 text-orange-800 border-orange-200',
  returnedtocoordinator:'bg-orange-100 text-orange-800 border-orange-200',
  forwarded:            'bg-violet-100 text-violet-800 border-violet-200',
  forwardedtocoordinator:'bg-violet-100 text-violet-800 border-violet-200',
  verified:             'bg-teal-100 text-teal-800 border-teal-200',
  costed:               'bg-cyan-100 text-cyan-800 border-cyan-200',
  permitsattached:      'bg-sky-100 text-sky-800 border-sky-200',
  // advance-coverage statuses
  pendingsupervisor:    'bg-amber-100 text-amber-800 border-amber-200',
  pendingadmin:         'bg-orange-100 text-orange-800 border-orange-200',
  fullypaid:            'bg-teal-100 text-teal-800 border-teal-200',
  partiallypaid:        'bg-cyan-100 text-cyan-800 border-cyan-200',
  confirmed:            'bg-blue-100 text-blue-800 border-blue-200',
  acknowledged:         'bg-violet-100 text-violet-800 border-violet-200',
  cancelled:            'bg-slate-100 text-slate-600 border-slate-200',
  norequest:            'bg-slate-100 text-slate-500 border-slate-200',
};
function statusChipClass(raw: string) {
  const k = raw.toLowerCase().replace(/[\s_-]/g, '');
  return STATUS_CHIP_COLORS[k] ?? 'bg-slate-100 text-slate-700 border-slate-200';
}

function StatusHubTree({
  items, selectedIds, expandedId,
  onToggleSelect, onToggleExpand, onStatusChange, onWorkflow, workflowPending,
  actionType,
}: {
  items: DashboardAction[];
  selectedIds: Set<string>;
  expandedId: string | null;
  onToggleSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onStatusChange: (action: DashboardAction, status: DashboardStatus, label: string) => void;
  onWorkflow: (action: DashboardAction, wa: string, wl: string) => void;
  workflowPending: boolean;
  actionType?: string;
}) {
  // Detect modules with no MMP association (all items grouped under '—')
  // For these modules (operational_cost, advance_payment) skip the MMP level
  const noMmpMode = useMemo(() => {
    const keys = [...new Set(items.map(a => a.mmp_name || '—'))];
    return keys.length === 1 && keys[0] === '—';
  }, [items]);

  const [openMMPs,       setOpenMMPs]       = useState<Set<string>>(() => noMmpMode ? new Set([`mmp::—`]) : new Set());
  const [openStatuses,   setOpenStatuses]   = useState<Set<string>>(() => new Set());
  const [openHubs,       setOpenHubs]       = useState<Set<string>>(() => new Set());
  const [openStates,     setOpenStates]     = useState<Set<string>>(() => new Set());
  const [openLocalities, setOpenLocalities] = useState<Set<string>>(() => new Set());
  const [openCollectors, setOpenCollectors] = useState<Set<string>>(() => new Set());

  const getHub = (a: DashboardAction) => {
    const d = a.details as Record<string, unknown>;
    // advance_payment has hub_name directly; operational_cost gets it injected via SQL join;
    // mmp_site_entry and others use hub_office
    const raw = d?.hub_name ?? d?.hub_office ?? '—';
    return String(raw || '—');
  };
  const getState = (a: DashboardAction) => {
    const d = a.details as Record<string, unknown>;
    // For operational costs, group by expense category instead of geographic state
    if (a.action_type === 'operational_cost') {
      const cat = String(d?.expense_category ?? '').replace(/_/g, ' ');
      return cat || '—';
    }
    return String(d?.state ?? '—');
  };
  const getCollector = (a: DashboardAction) => {
    const d = a.details as Record<string, unknown>;
    // For MMP site entries the data collector is stored in monitoring_by (text: email or name)
    // or accepted_by; fall back to sender_name if neither is available
    if (a.action_type === 'mmp_site_entry') {
      // monitoring_by is a text email/name field — safe to use directly
      // accepted_by is a UUID column — never use it as a display name
      const monBy = String(d?.monitoring_by ?? '').trim();
      const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s);
      if (monBy && !isUUID(monBy)) return monBy;
      // sender_name is resolved via profile joins in the SQL (p_dc or p_ab)
      const senderOk = a.sender_name && !isUUID(a.sender_name) && a.sender_name !== a.details?.['site_name'];
      return senderOk ? a.sender_name : 'Unknown';
    }
    return a.sender_name || 'Unknown';
  };

  const getMMP     = (a: DashboardAction) => a.mmp_name || '—';
  const getLocality = (a: DashboardAction) =>
    String((a.details as Record<string, unknown>)?.locality ?? '—');

  // Build MMP → Status → Hub → State → Locality → DataCollector → items
  type DCMap  = Map<string, DashboardAction[]>;
  type LocMap = Map<string, DCMap>;
  type StMap  = Map<string, LocMap>;
  type HubMap = Map<string, StMap>;
  type StsMap = Map<string, HubMap>;
  type MMPMap = Map<string, StsMap>;

  const mmpMap = useMemo<MMPMap>(() => {
    const map: MMPMap = new Map();
    for (const a of items) {
      const mmp = getMMP(a);
      const s   = a.native_status || 'unknown';
      const h   = getHub(a), st = getState(a), loc = getLocality(a), dc = getCollector(a);
      if (!map.has(mmp))                                             map.set(mmp, new Map());
      const sm = map.get(mmp)!;
      if (!sm.has(s))                                                sm.set(s, new Map());
      if (!sm.get(s)!.has(h))                                        sm.get(s)!.set(h, new Map());
      if (!sm.get(s)!.get(h)!.has(st))                               sm.get(s)!.get(h)!.set(st, new Map());
      if (!sm.get(s)!.get(h)!.get(st)!.has(loc))                    sm.get(s)!.get(h)!.get(st)!.set(loc, new Map());
      if (!sm.get(s)!.get(h)!.get(st)!.get(loc)!.has(dc))           sm.get(s)!.get(h)!.get(st)!.get(loc)!.set(dc, []);
      sm.get(s)!.get(h)!.get(st)!.get(loc)!.get(dc)!.push(a);
    }
    const mmpTotal = (sm: StsMap) => [...sm.values()].flatMap(hm => [...hm.values()]).flatMap(stm => [...stm.values()]).flatMap(lm => [...lm.values()]).flatMap(dm => [...dm.values()]).flat().length;
    return new Map([...map.entries()].sort(([, a], [, b]) => mmpTotal(b) - mmpTotal(a)));
  }, [items]);

  // ── key helpers ──────────────────────────────────────────────────────────────
  const mmpKey = (mmp: string)                                                      => `mmp::${mmp}`;
  const hKey   = (mmp: string, s: string, h: string)                               => `${mmp}::${s}::${h}`;
  const stKey  = (mmp: string, s: string, h: string, st: string)                   => `${mmp}::${s}::${h}::${st}`;
  const locKey = (mmp: string, s: string, h: string, st: string, loc: string)      => `${mmp}::${s}::${h}::${st}::${loc}`;
  const dcKey  = (mmp: string, s: string, h: string, st: string, loc: string, dc: string) => `${mmp}::${s}::${h}::${st}::${loc}::${dc}`;

  const allStsKeys = (mmp: string, sm: StsMap) => [...sm.keys()].map(s => `sts::${mmp}::${s}`);
  const allHubKeys = (mmp: string, s: string, hm: HubMap) => [...hm.keys()].map(h => hKey(mmp, s, h));
  const allStKeys  = (mmp: string, s: string, h: string, stm: StMap) => [...stm.keys()].map(st => stKey(mmp, s, h, st));
  const allLocKeys = (mmp: string, s: string, h: string, st: string, lm: LocMap) => [...lm.keys()].map(loc => locKey(mmp, s, h, st, loc));
  const allDcKeys  = (mmp: string, s: string, h: string, st: string, loc: string, dm: DCMap) => [...dm.keys()].map(dc => dcKey(mmp, s, h, st, loc, dc));

  // ── toggle helpers ──────────────────────────────────────────────────────────
  const removeFrom = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, keys: string[]) =>
    setter(prev => { const n = new Set(prev); keys.forEach(k => n.delete(k)); return n; });

  const toggleMMP = (mmp: string, sm: StsMap) => {
    const k = mmpKey(mmp);
    setOpenMMPs(prev => {
      const n = new Set(prev); const opening = !n.has(k);
      opening ? n.add(k) : n.delete(k);
      if (!opening) {
        removeFrom(setOpenStatuses, allStsKeys(mmp, sm));
        for (const [s, hm] of sm) {
          removeFrom(setOpenHubs, allHubKeys(mmp, s, hm));
          for (const [h, stm] of hm) {
            removeFrom(setOpenStates, allStKeys(mmp, s, h, stm));
            for (const [st, lm] of stm) {
              removeFrom(setOpenLocalities, allLocKeys(mmp, s, h, st, lm));
              for (const [loc, dm] of lm) removeFrom(setOpenCollectors, allDcKeys(mmp, s, h, st, loc, dm));
            }
          }
        }
      }
      return n;
    });
  };

  const toggleStatus = (mmp: string, s: string, hm: HubMap) => {
    const k = `sts::${mmp}::${s}`;
    setOpenStatuses(prev => {
      const n = new Set(prev); const opening = !n.has(k);
      opening ? n.add(k) : n.delete(k);
      if (!opening) {
        removeFrom(setOpenHubs, allHubKeys(mmp, s, hm));
        for (const [h, sm] of hm) {
          removeFrom(setOpenStates, allStKeys(mmp, s, h, sm));
          for (const [st, lm] of sm) {
            removeFrom(setOpenLocalities, allLocKeys(mmp, s, h, st, lm));
            for (const [loc, dm] of lm) removeFrom(setOpenCollectors, allDcKeys(mmp, s, h, st, loc, dm));
          }
        }
      }
      return n;
    });
  };

  const toggleHub = (mmp: string, s: string, h: string, sm: StMap) => {
    const k = hKey(mmp, s, h);
    setOpenHubs(prev => {
      const n = new Set(prev); const opening = !n.has(k);
      opening ? n.add(k) : n.delete(k);
      if (!opening) {
        removeFrom(setOpenStates, allStKeys(mmp, s, h, sm));
        for (const [st, lm] of sm) {
          removeFrom(setOpenLocalities, allLocKeys(mmp, s, h, st, lm));
          for (const [loc, dm] of lm) removeFrom(setOpenCollectors, allDcKeys(mmp, s, h, st, loc, dm));
        }
      }
      return n;
    });
  };

  const toggleState = (mmp: string, s: string, h: string, st: string, lm: LocMap) => {
    const k = stKey(mmp, s, h, st);
    setOpenStates(prev => {
      const n = new Set(prev); const opening = !n.has(k);
      opening ? n.add(k) : n.delete(k);
      if (!opening) {
        removeFrom(setOpenLocalities, allLocKeys(mmp, s, h, st, lm));
        for (const [loc, dm] of lm) removeFrom(setOpenCollectors, allDcKeys(mmp, s, h, st, loc, dm));
      }
      return n;
    });
  };

  const toggleLocality = (mmp: string, s: string, h: string, st: string, loc: string, dm: DCMap) => {
    const k = locKey(mmp, s, h, st, loc);
    setOpenLocalities(prev => {
      const n = new Set(prev); const opening = !n.has(k);
      opening ? n.add(k) : n.delete(k);
      if (!opening) removeFrom(setOpenCollectors, allDcKeys(mmp, s, h, st, loc, dm));
      return n;
    });
  };

  const toggleCollector = (k: string) =>
    setOpenCollectors(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  // ── render ──────────────────────────────────────────────────────────────────
  const hubTotal = (hm: HubMap) => [...hm.values()].flatMap(sm => [...sm.values()]).flatMap(lm => [...lm.values()]).flatMap(dm => [...dm.values()]).flat().length;
  const mmpTotal = (sm: StsMap) => [...sm.values()].flatMap(hm => [...hm.values()]).flatMap(stm => [...stm.values()]).flatMap(lm => [...lm.values()]).flatMap(dm => [...dm.values()]).flat().length;

  return (
    <div className="flex flex-col gap-1">
      {[...mmpMap.entries()].map(([mmpName, stsMap]) => {
        const mmpTot  = mmpTotal(stsMap);
        const mk      = mmpKey(mmpName);
        const mmpOpen = noMmpMode ? true : openMMPs.has(mk);
        return (
          <div key={mk} className="rounded-lg border border-border overflow-hidden">

            {/* ── MMP — indigo — hidden when there is no MMP association ── */}
            {!noMmpMode && (
              <button className="w-full flex items-center gap-2 px-3 py-2.5 bg-indigo-50 hover:bg-indigo-100 border-l-4 border-l-indigo-500 text-left transition-colors"
                onClick={() => toggleMMP(mmpName, stsMap)} data-testid={`mmp-group-${mk}`}>
                {mmpOpen ? <ChevronDown className="h-3.5 w-3.5 text-indigo-500 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-indigo-400 shrink-0" />}
                <FileText className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                <span className="text-xs font-bold flex-1 text-indigo-900">{mmpName}</span>
                <span className="text-[9px] font-mono bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">{mmpTot}</span>
              </button>
            )}

            {mmpOpen && (
              <div className="flex flex-col divide-y divide-violet-100">
                {[...stsMap.entries()].sort(([, a], [, b]) => hubTotal(b) - hubTotal(a)).map(([sName, hMap]) => {
                  const statusTotal = hubTotal(hMap);
                  const sk          = `sts::${mmpName}::${sName}`;
                  const statusOpen  = openStatuses.has(sk);
                  const chipCls     = statusChipClass(sName);
                  return (
                    <div key={sk}>

                      {/* ── Status — violet ── */}
                      <button className="w-full flex items-center gap-2 px-4 py-2 bg-violet-50 hover:bg-violet-100 border-l-4 border-l-violet-400 text-left transition-colors"
                        onClick={() => toggleStatus(mmpName, sName, hMap)} data-testid={`status-group-${sk}`}>
                        {statusOpen ? <ChevronDown className="h-3 w-3 text-violet-500 shrink-0" /> : <ChevronRight className="h-3 w-3 text-violet-400 shrink-0" />}
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border capitalize ${chipCls}`}>{sName.replace(/_/g, ' ')}</span>
                        <span className="text-xs font-bold flex-1 text-violet-800 text-right">{statusTotal} record{statusTotal !== 1 ? 's' : ''}</span>
                      </button>

                      {statusOpen && (
                        <div className="flex flex-col divide-y divide-blue-100">
                          {[...hMap.entries()].sort(([, a], [, b]) =>
                            [...b.values()].flatMap(sm => [...sm.values()]).flatMap(lm => [...lm.values()]).flat().length -
                            [...a.values()].flatMap(sm => [...sm.values()]).flatMap(lm => [...lm.values()]).flat().length
                          ).map(([hName, stMap]) => {
                            const hTot   = [...stMap.values()].flatMap(lm => [...lm.values()]).flatMap(dm => [...dm.values()]).flat().length;
                            const hk     = hKey(mmpName, sName, hName);
                            const hubOpen = openHubs.has(hk);
                            return (
                              <div key={hk}>

                                {/* ── Hub — blue ── */}
                                <button className="w-full flex items-center gap-2 px-6 py-2 bg-blue-50 hover:bg-blue-100 border-l-4 border-l-blue-400 text-left transition-colors"
                                  onClick={() => toggleHub(mmpName, sName, hName, stMap)} data-testid={`hub-group-${hk}`}>
                                  {hubOpen ? <ChevronDown className="h-3 w-3 text-blue-500 shrink-0" /> : <ChevronRight className="h-3 w-3 text-blue-400 shrink-0" />}
                                  <Database className="h-3 w-3 text-blue-500 shrink-0" />
                                  <span className="text-xs font-semibold flex-1 text-blue-900">{hName}</span>
                                  <span className="text-[9px] font-mono bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">{hTot}</span>
                                </button>

                      {hubOpen && (
                        <div className="flex flex-col divide-y divide-emerald-100">
                          {[...stMap.entries()].sort(([, a], [, b]) =>
                            [...b.values()].flatMap(dm => [...dm.values()]).flat().length -
                            [...a.values()].flatMap(dm => [...dm.values()]).flat().length
                          ).map(([stName, locMap]) => {
                            const stateTotal = [...locMap.values()].flatMap(dm => [...dm.values()]).flat().length;
                            const stOpen     = openStates.has(stKey(mmpName, sName, hName, stName));
                            return (
                              <div key={stKey(mmpName, sName, hName, stName)}>

                                {/* ── State / Category — emerald ── */}
                                {(() => {
                                  const sampleAction = [...locMap.values()][0] ? [...[...locMap.values()][0].values()][0]?.[0] : undefined;
                                  const isCategory = sampleAction?.action_type === 'operational_cost';
                                  const StateIcon = isCategory ? Layers : MapPin;
                                  return (
                                  <button className="w-full flex items-center gap-2 px-6 py-1.5 bg-emerald-50 hover:bg-emerald-100 border-l-4 border-l-emerald-400 text-left transition-colors"
                                    onClick={() => toggleState(mmpName, sName, hName, stName, locMap)} data-testid={`state-group-${stKey(mmpName, sName, hName, stName)}`}>
                                    {stOpen ? <ChevronDown className="h-3 w-3 text-emerald-600 shrink-0" /> : <ChevronRight className="h-3 w-3 text-emerald-500 shrink-0" />}
                                    <StateIcon className="h-3 w-3 text-emerald-600 shrink-0" />
                                    <span className="text-xs font-medium flex-1 text-emerald-900 capitalize">{stName}</span>
                                    <span className="text-[9px] font-mono bg-emerald-100 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded">{stateTotal}</span>
                                  </button>
                                  );
                                })()}

                                {stOpen && (() => {
                                  const isMSE     = actionType === 'mmp_site_entry';
                                  const isPending = sName.toLowerCase() === 'pending';

                                  /* ── Helper: render individual ActionRows ── */
                                  const renderRows = (actions: DashboardAction[]) => (
                                    <div className="flex flex-col gap-0.5 px-1 py-1 bg-white">
                                      {actions.map(action => (
                                        <ActionRow
                                          key={action.action_id}
                                          action={action}
                                          selected={selectedIds.has(action.action_id)}
                                          expanded={expandedId === action.action_id}
                                          onToggleSelect={() => onToggleSelect(action.action_id)}
                                          onToggleExpand={() => onToggleExpand(action.action_id)}
                                          onStatusChange={(status, label) => onStatusChange(action, status, label)}
                                          onWorkflow={(wa, wl) => onWorkflow(action, wa, wl)}
                                          workflowPending={workflowPending}
                                        />
                                      ))}
                                    </div>
                                  );

                                  /* ── Mode A: MSE non-pending → Enumerator → Locality → Records ── */
                                  if (isMSE && !isPending) {
                                    // Invert locMap: build dcName → Map<locName, actions[]>
                                    const dcToLocMap = new Map<string, Map<string, DashboardAction[]>>();
                                    for (const [locName, dcMap] of locMap.entries()) {
                                      for (const [dcName, actions] of dcMap.entries()) {
                                        if (!dcToLocMap.has(dcName)) dcToLocMap.set(dcName, new Map());
                                        if (!dcToLocMap.get(dcName)!.has(locName)) dcToLocMap.get(dcName)!.set(locName, []);
                                        for (const a of actions) dcToLocMap.get(dcName)!.get(locName)!.push(a);
                                      }
                                    }
                                    const sortedDCs = [...dcToLocMap.entries()].sort(([, a], [, b]) =>
                                      [...b.values()].flat().length - [...a.values()].flat().length
                                    );
                                    return (
                                      <div className="flex flex-col divide-y divide-amber-100">
                                        {sortedDCs.map(([dcName, locToActions]) => {
                                          const ck      = `${mmpName}::${sName}::${hName}::${stName}::__dc__::${dcName}`;
                                          const dcOpen  = openCollectors.has(ck);
                                          const dcTotal = [...locToActions.values()].flat().length;
                                          return (
                                            <div key={ck}>
                                              {/* ── Enumerator — amber (px-8) ── */}
                                              <button className="w-full flex items-center gap-2 px-8 py-1.5 bg-amber-50 hover:bg-amber-100 border-l-4 border-l-amber-400 text-left transition-colors"
                                                onClick={() => toggleCollector(ck)} data-testid={`dc-group-${ck}`}>
                                                {dcOpen ? <ChevronDown className="h-3 w-3 text-amber-600 shrink-0" /> : <ChevronRight className="h-3 w-3 text-amber-500 shrink-0" />}
                                                <User className="h-3 w-3 text-amber-600 shrink-0" />
                                                <span className="text-xs font-medium flex-1 text-amber-900">{dcName}</span>
                                                <span className="text-[9px] font-mono bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">{dcTotal} site{dcTotal !== 1 ? 's' : ''}</span>
                                              </button>
                                              {dcOpen && (
                                                <div className="flex flex-col divide-y divide-teal-100">
                                                  {[...locToActions.entries()].sort(([, a], [, b]) => b.length - a.length).map(([locName, actions]) => {
                                                    const lk2     = `${ck}::${locName}`;
                                                    const locOpen2 = openLocalities.has(lk2);
                                                    return (
                                                      <div key={lk2}>
                                                        {/* ── Locality — teal (px-10) ── */}
                                                        <button className="w-full flex items-center gap-2 px-10 py-1.5 bg-teal-50 hover:bg-teal-100 border-l-4 border-l-teal-400 text-left transition-colors"
                                                          onClick={() => setOpenLocalities(prev => { const n = new Set(prev); n.has(lk2) ? n.delete(lk2) : n.add(lk2); return n; })}
                                                          data-testid={`loc-group-${lk2}`}>
                                                          {locOpen2 ? <ChevronDown className="h-3 w-3 text-teal-600 shrink-0" /> : <ChevronRight className="h-3 w-3 text-teal-500 shrink-0" />}
                                                          <MapPin className="h-3 w-3 text-teal-600 shrink-0" />
                                                          <span className="text-xs font-medium flex-1 text-teal-900">{locName}</span>
                                                          <span className="text-[9px] font-mono bg-teal-100 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded">{actions.length}</span>
                                                        </button>
                                                        {locOpen2 && renderRows(actions)}
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    );

                                  /* ── Mode B: MSE pending → Locality → Records (no Enumerator) ── */
                                  } else if (isMSE && isPending) {
                                    const sortedLocs = [...locMap.entries()].sort(([, a], [, b]) =>
                                      [...b.values()].flat().length - [...a.values()].flat().length
                                    );
                                    return (
                                      <div className="flex flex-col divide-y divide-teal-100">
                                        {sortedLocs.map(([locName, dcMap]) => {
                                          const lk      = locKey(mmpName, sName, hName, stName, locName);
                                          const locOpen = openLocalities.has(lk);
                                          const allActs = [...dcMap.values()].flat();
                                          return (
                                            <div key={lk}>
                                              {/* ── Locality — teal (px-8) ── */}
                                              <button className="w-full flex items-center gap-2 px-8 py-1.5 bg-teal-50 hover:bg-teal-100 border-l-4 border-l-teal-400 text-left transition-colors"
                                                onClick={() => setOpenLocalities(prev => { const n = new Set(prev); n.has(lk) ? n.delete(lk) : n.add(lk); return n; })}
                                                data-testid={`loc-group-${lk}`}>
                                                {locOpen ? <ChevronDown className="h-3 w-3 text-teal-600 shrink-0" /> : <ChevronRight className="h-3 w-3 text-teal-500 shrink-0" />}
                                                <MapPin className="h-3 w-3 text-teal-600 shrink-0" />
                                                <span className="text-xs font-medium flex-1 text-teal-900">{locName}</span>
                                                <span className="text-[9px] font-mono bg-teal-100 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded">{allActs.length}</span>
                                              </button>
                                              {locOpen && renderRows(allActs)}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    );

                                  /* ── Mode C: all other types → Locality → Enumerator → Records ── */
                                  } else {
                                    return (
                                      <div className="flex flex-col divide-y divide-teal-100">
                                        {[...locMap.entries()].sort(([, a], [, b]) =>
                                          [...b.values()].flat().length - [...a.values()].flat().length
                                        ).map(([locName, dcMap]) => {
                                          const lk      = locKey(mmpName, sName, hName, stName, locName);
                                          const locTotal = [...dcMap.values()].flat().length;
                                          const locOpen  = openLocalities.has(lk);
                                          return (
                                            <div key={lk}>
                                              {/* ── Locality — teal ── */}
                                              <button className="w-full flex items-center gap-2 px-8 py-1.5 bg-teal-50 hover:bg-teal-100 border-l-4 border-l-teal-400 text-left transition-colors"
                                                onClick={() => toggleLocality(mmpName, sName, hName, stName, locName, dcMap)} data-testid={`loc-group-${lk}`}>
                                                {locOpen ? <ChevronDown className="h-3 w-3 text-teal-600 shrink-0" /> : <ChevronRight className="h-3 w-3 text-teal-500 shrink-0" />}
                                                <MapPin className="h-3 w-3 text-teal-600 shrink-0" />
                                                <span className="text-xs font-medium flex-1 text-teal-900">{locName}</span>
                                                <span className="text-[9px] font-mono bg-teal-100 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded">{locTotal}</span>
                                              </button>
                                              {locOpen && (
                                                <div className="flex flex-col divide-y divide-amber-100">
                                                  {[...dcMap.entries()].sort(([, a], [, b]) => b.length - a.length).map(([dcName, actions]) => {
                                                    const ck     = dcKey(mmpName, sName, hName, stName, locName, dcName);
                                                    const dcOpen = openCollectors.has(ck);
                                                    return (
                                                      <div key={ck}>
                                                        {/* ── Data Collector — amber ── */}
                                                        <button className="w-full flex items-center gap-2 px-10 py-1.5 bg-amber-50 hover:bg-amber-100 border-l-4 border-l-amber-400 text-left transition-colors"
                                                          onClick={() => toggleCollector(ck)} data-testid={`dc-group-${ck}`}>
                                                          {dcOpen ? <ChevronDown className="h-3 w-3 text-amber-600 shrink-0" /> : <ChevronRight className="h-3 w-3 text-amber-500 shrink-0" />}
                                                          <User className="h-3 w-3 text-amber-600 shrink-0" />
                                                          <span className="text-xs font-medium flex-1 text-amber-900">{dcName}</span>
                                                          <span className="text-[9px] font-mono bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">
                                                            {actions.length} record{actions.length !== 1 ? 's' : ''}
                                                          </span>
                                                        </button>
                                                        {dcOpen && renderRows(actions)}
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    );
                                  }
                                })()}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Action Row ────────────────────────────────────────────────────────────────

function ActionRow({ action, selected, expanded, onToggleSelect, onToggleExpand, onStatusChange, onWorkflow, workflowPending }: {
  action: DashboardAction; selected: boolean; expanded: boolean;
  onToggleSelect: () => void; onToggleExpand: () => void;
  onStatusChange: (s: DashboardStatus, l: string) => void;
  onWorkflow: (a: string, l: string) => void; workflowPending: boolean;
}) {
  const dsCfg = STATUS_CFG[action.dashboard_status];
  const DsIcon = dsCfg.icon;
  const urgency = urgencyLevel(action);
  const urg = URGENCY[urgency];
  const workflows = WORKFLOW_CONTROLS[action.action_type] ?? [];
  const hoursOld = differenceInHours(new Date(), parseISO(action.created_at));

  return (
    <div
      className={`border rounded-lg bg-card transition-all ${expanded ? 'shadow-md border-primary/30 ring-1 ring-primary/10' : 'hover:border-muted-foreground/30 hover:shadow-sm'} ${urgency === 'critical' ? 'border-l-4 border-l-red-400' : urgency === 'high' ? 'border-l-4 border-l-amber-400' : ''}`}
      data-testid={`action-row-${action.action_id}`}
    >
      {/* Row header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Urgency LED */}
        <span className={`h-2 w-2 rounded-full shrink-0 ${urg.dot}`} title={urg.label} />

        <Checkbox checked={selected} onCheckedChange={onToggleSelect} data-testid={`checkbox-${action.action_id}`} />

        <button onClick={onToggleExpand} className="flex-1 flex items-center gap-2.5 text-left min-w-0" data-testid={`expand-${action.action_id}`}>
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 flex items-center justify-center shrink-0">
            <User className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-sm leading-tight">{action.sender_name}</span>
              {action.sender_email && <Mail className="h-3 w-3 text-muted-foreground/60 shrink-0" title={action.sender_email} />}
              {action.sender_phone && <Phone className="h-3 w-3 text-muted-foreground/60 shrink-0" title={action.sender_phone} />}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
              <Timer className="h-2.5 w-2.5 shrink-0" />
              <span>{hoursOld < 1 ? 'just now' : hoursOld < 24 ? `${hoursOld}h ago` : `${Math.floor(hoursOld/24)}d ago`}</span>
              <span>·</span>
              <span className="truncate capitalize">{action.native_status.replace(/_/g, ' ')}</span>
            </div>
          </div>
        </button>

        {/* Status badges */}
        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          <Badge variant="outline" className={`text-[10px] h-5 px-1.5 ${dsCfg.color}`} data-testid={`badge-dashboard-${action.action_id}`}>
            <DsIcon className="h-2.5 w-2.5 mr-0.5" />{dsCfg.label}
          </Badge>
        </div>

        {/* Quick contact buttons */}
        {(action.sender_email || action.sender_phone) && (
          <div className="hidden md:flex items-center gap-1 shrink-0">
            {action.sender_email && (
              <a href={`mailto:${action.sender_email}`} title={`Email ${action.sender_name}`} onClick={e => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-blue-50 hover:text-blue-600" data-testid={`btn-email-${action.action_id}`}>
                  <Mail className="h-3.5 w-3.5" />
                </Button>
              </a>
            )}
            {action.sender_phone && (
              <a href={`tel:${action.sender_phone}`} title={`Call ${action.sender_name}`} onClick={e => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-emerald-50 hover:text-emerald-600" data-testid={`btn-call-${action.action_id}`}>
                  <Phone className="h-3.5 w-3.5" />
                </Button>
              </a>
            )}
          </div>
        )}

        <button onClick={onToggleExpand} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t px-4 py-4 flex flex-col gap-4 bg-muted/10" data-testid={`detail-${action.action_id}`}>

          {/* Sender + timeline cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Sender */}
            {(() => {
              const det = action.details as Record<string, unknown>;
              const isMSE = action.action_type === 'mmp_site_entry';
              const enumeratorRaw = isMSE ? String(det?.monitoring_by ?? det?.accepted_by ?? '').trim() : '';
              const displayName = enumeratorRaw || action.sender_name || 'Unknown';
              return (
              <div className="bg-background border rounded-lg px-3 py-3 flex flex-col gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{isMSE ? 'Enumerator / Data Collector' : 'Sender'}</p>
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight">{displayName}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{action.sender_role} → {action.recipient_role}</p>
                  {isMSE && enumeratorRaw && action.sender_name && enumeratorRaw !== action.sender_name && (
                    <p className="text-[10px] text-muted-foreground">Account: {action.sender_name}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-1">
                {action.sender_email && (
                  <a href={`mailto:${action.sender_email}`} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline truncate">
                    <Mail className="h-3 w-3 shrink-0" /><span className="truncate">{action.sender_email}</span>
                  </a>
                )}
                {action.sender_phone && (
                  <a href={`tel:${action.sender_phone}`} className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 hover:underline">
                    <Phone className="h-3 w-3 shrink-0" />{action.sender_phone}
                  </a>
                )}
                {!action.sender_email && !action.sender_phone && (
                  <span className="text-xs text-muted-foreground italic">No contact info on file</span>
                )}
              </div>
            </div>
              );
            })()}

            {/* Timeline */}
            <div className="bg-background border rounded-lg px-3 py-3 flex flex-col gap-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Timeline</p>
              <p className="text-sm font-mono font-semibold">{format(parseISO(action.created_at), 'dd MMM yyyy · HH:mm')}</p>
              <p className="text-xs text-muted-foreground">{formatDistanceToNow(parseISO(action.created_at), { addSuffix: true })}</p>
              <div className={`mt-1 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${urgency === 'critical' ? 'bg-red-100 text-red-700' : urgency === 'high' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${urg.dot}`} />
                {urg.label} · {hoursOld}h old
              </div>
            </div>

            {/* Native status */}
            <div className="bg-background border rounded-lg px-3 py-3 flex flex-col gap-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Record Status</p>
              <Badge variant="outline" className="text-xs w-fit capitalize">{action.native_status.replace(/_/g,' ')}</Badge>
              <p className="text-[10px] text-muted-foreground">Source: <span className="font-mono">{action.source_table}</span></p>
              <p className="text-[10px] text-muted-foreground font-mono truncate" title={action.action_id}>ID: {action.action_id.slice(0, 12)}…</p>
              {action.latest_notes && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                  {action.latest_notes}
                </p>
              )}
            </div>
          </div>

          {/* Record Details — full, with date formatting and copy support */}
          {Object.keys(action.details ?? {}).length > 0 && (() => {
            // Separate key operational fields from secondary/audit fields
            const KEY_FIELDS = new Set([
              'site_name','site_code','state','locality','status','hub_office','hub_name','cp_name',
              'visit_date','visit_type','cost','enumerator_fee','transport_fee',
              'monitoring_by','survey_tool','main_activity','activity_at_site',
              'dispatched_by','dispatched_at','accepted_by','accepted_at',
              'claimed_by','claimed_at','completed_at','returned_at','rejected_at',
              'not_covered_flag','not_covered_reason','comments','mmp_file_id',
              // Operational cost fields
              'expense_category','total_amount','amount','description','period','purpose',
              'payment_method','receipt_number','expense_date','approved_by','approved_at',
              // Advance payment fields
              'requested_amount','approved_amount','disbursed_amount','due_date',
              'beneficiary_name','project_code','activity_description','hub_id',
            ]);
            const DATE_KEYS = new Set([
              'dispatched_at','accepted_at','claimed_at','completed_at','returned_at',
              'rejected_at','created_at','updated_at','visit_date','not_covered_at',
              'verified_at','cycle_closed_at','expense_date','approved_at','due_date',
            ]);
            const formatVal = (k: string, v: unknown): string => {
              if (v === null || v === undefined || v === '') return '—';
              if (typeof v === 'boolean') return v ? 'Yes' : 'No';
              const str = String(v);
              if (DATE_KEYS.has(k) && str.includes('T')) {
                try {
                  const d = parseISO(str);
                  return `${format(d, 'dd MMM yyyy  HH:mm')}  (${formatDistanceToNow(d, { addSuffix: true })})`;
                } catch { return str; }
              }
              return str;
            };

            const allEntries = Object.entries(action.details ?? {});
            const keyEntries = allEntries.filter(([k]) => KEY_FIELDS.has(k));
            const otherEntries = allEntries.filter(([k]) => !KEY_FIELDS.has(k));

            const DetailRow = ({ k, v }: { k: string; v: unknown }) => {
              const formatted = formatVal(k, v);
              const isEmpty = formatted === '—';
              const isUUID = typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(v);
              return (
                <div className="flex flex-col min-w-0 gap-0.5">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{k.replace(/_/g,' ')}</span>
                  <span className={`text-xs break-all ${isEmpty ? 'text-muted-foreground italic' : ''} ${isUUID ? 'font-mono text-[10px]' : ''}`}
                    title={typeof v === 'string' ? v : ''}>
                    {isUUID ? String(v) : formatted}
                  </span>
                </div>
              );
            };

            return (
              <div className="bg-background border rounded-lg p-3 flex flex-col gap-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Record Details
                  <span className="ml-2 normal-case font-normal text-muted-foreground/70">({allEntries.length} fields)</span>
                </p>

                {/* Full record ID with copy */}
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded px-2 py-1">
                  <span className="text-[9px] text-muted-foreground uppercase">Record ID</span>
                  <span className="font-mono text-[10px] flex-1 truncate">{action.action_id}</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(action.action_id); }}
                    className="text-[10px] text-blue-600 hover:text-blue-800 shrink-0"
                    title="Copy ID"
                  >Copy</button>
                </div>

                {/* Primary operational fields */}
                {keyEntries.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-3">
                    {keyEntries.map(([k, v]) => <DetailRow key={k} k={k} v={v} />)}
                  </div>
                )}

                {/* Additional / audit fields */}
                {otherEntries.length > 0 && (
                  <>
                    <div className="border-t pt-2">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wide mb-2">Additional Fields</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-3">
                        {otherEntries.map(([k, v]) => <DetailRow key={k} k={k} v={v} />)}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* History timeline */}
          <StatusHistoryTimeline actionId={action.action_id} actionType={action.action_type} />

          <Separator />

          {/* Controls */}
          <div className="flex flex-wrap gap-5">
            {workflows.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Workflow Actions</p>
                <div className="flex flex-wrap gap-1.5">
                  {workflows.map(wf => (
                    <Button key={wf.action} size="sm" variant={wf.variant} disabled={workflowPending}
                      onClick={() => onWorkflow(wf.action, wf.label)} data-testid={`workflow-${wf.action}-${action.action_id}`}>
                      {wf.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Awareness Status</p>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => onStatusChange('acted', 'Mark as Acted')} data-testid={`awareness-acted-${action.action_id}`}>
                  <CheckCircle className="h-3 w-3 mr-1" />Acted
                </Button>
                <Button size="sm" variant="outline" onClick={() => onStatusChange('ignored', 'Mark as Ignored')} data-testid={`awareness-ignored-${action.action_id}`}>
                  <XCircle className="h-3 w-3 mr-1" />Ignored
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onStatusChange('no_response', 'Flag as No Response')} data-testid={`awareness-no-response-${action.action_id}`}>
                  <Clock className="h-3 w-3 mr-1" />No Response
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Status History Timeline ───────────────────────────────────────────────────

function StatusHistoryTimeline({ actionId, actionType }: { actionId: string; actionType: string }) {
  const { data: history, isLoading } = useQuery<StatusOverrideEntry[]>({
    queryKey: ['/admin/monitoring/history', actionId, actionType],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_monitoring_history', {
        p_action_id: actionId,
        p_action_type: actionType,
      }) as { data: StatusOverrideEntry[] | null; error: unknown };
      if (error) throw new Error((error as { message?: string })?.message ?? String(error));
      return data ?? [];
    },
    staleTime: 30_000,
  });

  if (isLoading) return <Skeleton className="h-8 w-full" />;
  if (!history?.length) return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid={`history-empty-${actionId}`}>
      <Circle className="h-2.5 w-2.5" />No awareness history yet
    </div>
  );

  return (
    <div data-testid={`history-timeline-${actionId}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Awareness History</p>
      <ol className="relative border-l border-muted ml-2 flex flex-col">
        {history.map((entry, idx) => {
          const cfg = STATUS_CFG[entry.status as DashboardStatus] ?? STATUS_CFG.received;
          const EntryIcon = cfg.icon;
          return (
            <li key={entry.id} className="ml-4 pb-2.5" data-testid={`history-entry-${entry.id}`}>
              <span className="absolute -left-[7px] flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background border border-muted">
                <EntryIcon className="h-2 w-2 text-muted-foreground" />
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={`text-[10px] h-4 px-1 ${cfg.color}`}>{cfg.label}</Badge>
                <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(parseISO(entry.set_at), { addSuffix: true })}</span>
                {idx === 0 && <Badge variant="secondary" className="text-[9px] h-3.5 px-1">latest</Badge>}
              </div>
              {entry.notes && <p className="text-[10px] text-muted-foreground mt-0.5 italic">{entry.notes}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ── Coverage Tree ─────────────────────────────────────────────────────────────
// Collapsible MMP → Status → Hub → State → Data Collector → Sites tree.
// Mirrors StatusHubTree layout, colours, and badge style exactly.

const ADV_STATUS_LABEL: Record<string, string> = {
  pending_supervisor: 'Pending Supervisor',
  pending_admin:      'Pending Admin',
  approved:           'Approved',
  fully_paid:         'Fully Paid',
  partially_paid:     'Partially Paid',
  confirmed:          'Confirmed',
  acknowledged:       'Acknowledged',
  rejected:           'Rejected',
  cancelled:          'Cancelled',
  no_request:         'No Request',
};

function CoverageTree({ entries }: { entries: CoverageEntry[] }) {
  // Build MMP → Status → Hub → State → DC → sites
  type DCMap  = Map<string, CoverageEntry[]>;
  type StMap  = Map<string, DCMap>;
  type HubMap = Map<string, StMap>;
  type StsMap = Map<string, HubMap>;
  type MMPMap = Map<string, StsMap>;

  const tree = useMemo<MMPMap>(() => {
    const map: MMPMap = new Map();
    for (const e of entries) {
      const mmp = e.mmp_name || '—';
      const sts = e.advance_status || 'no_request';
      const hub = e.hub_name || '—';
      const st  = e.state_name || '—';
      const dc  = e.data_collector_name || '—';
      if (!map.has(mmp))                                      map.set(mmp, new Map());
      if (!map.get(mmp)!.has(sts))                            map.get(mmp)!.set(sts, new Map());
      if (!map.get(mmp)!.get(sts)!.has(hub))                  map.get(mmp)!.get(sts)!.set(hub, new Map());
      if (!map.get(mmp)!.get(sts)!.get(hub)!.has(st))         map.get(mmp)!.get(sts)!.get(hub)!.set(st, new Map());
      if (!map.get(mmp)!.get(sts)!.get(hub)!.get(st)!.has(dc)) map.get(mmp)!.get(sts)!.get(hub)!.get(st)!.set(dc, []);
      map.get(mmp)!.get(sts)!.get(hub)!.get(st)!.get(dc)!.push(e);
    }
    const mmpCount = (sm: StsMap) =>
      [...sm.values()].flatMap(hm => [...hm.values()]).flatMap(stm => [...stm.values()]).flatMap(dm => [...dm.values()]).flat().length;
    return new Map([...map.entries()].sort(([, a], [, b]) => mmpCount(b) - mmpCount(a)));
  }, [entries]);

  const [openMMPs, setOpenMMPs] = useState<Set<string>>(() => new Set());
  const [openStss, setOpenStss] = useState<Set<string>>(() => new Set());
  const [openHubs, setOpenHubs] = useState<Set<string>>(() => new Set());
  const [openSts,  setOpenSts]  = useState<Set<string>>(() => new Set());
  const [openDCs,  setOpenDCs]  = useState<Set<string>>(() => new Set());

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) =>
    setter(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const stsCount = (sm: StsMap) =>
    [...sm.values()].flatMap(hm => [...hm.values()]).flatMap(stm => [...stm.values()]).flatMap(dm => [...dm.values()]).flat().length;
  const hubCount = (hm: HubMap) =>
    [...hm.values()].flatMap(stm => [...stm.values()]).flatMap(dm => [...dm.values()]).flat().length;
  const stCount  = (stm: StMap) =>
    [...stm.values()].flatMap(dm => [...dm.values()]).flat().length;
  const dcCount  = (dm: DCMap) =>
    [...dm.values()].flat().length;

  if (entries.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-sm text-muted-foreground">
        No sites match this filter
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-3 max-h-[560px] overflow-y-auto" data-testid="coverage-tree">
      {[...tree.entries()].map(([mmp, stsMap]) => {
        const mmpTot  = stsCount(stsMap);
        const mmpOpen = openMMPs.has(mmp);
        return (
          <div key={mmp} className="rounded-lg border border-border overflow-hidden">

            {/* ── MMP — indigo ── */}
            <button
              className="w-full flex items-center gap-2 px-3 py-2.5 bg-indigo-50 hover:bg-indigo-100 border-l-4 border-l-indigo-500 text-left transition-colors"
              onClick={() => toggle(setOpenMMPs, mmp)}
              data-testid={`coverage-mmp-${mmp}`}
            >
              {mmpOpen ? <ChevronDown className="h-3.5 w-3.5 text-indigo-500 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-indigo-400 shrink-0" />}
              <FileText className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
              <span className="text-xs font-bold flex-1 text-indigo-900 truncate">{mmp}</span>
              <span className="text-[9px] font-mono bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">{mmpTot}</span>
            </button>

            {mmpOpen && (
              <div className="flex flex-col divide-y divide-violet-100">
                {[...stsMap.entries()].sort(([, a], [, b]) => hubCount(b) - hubCount(a)).map(([advSts, hubMap]) => {
                  const stsTot  = hubCount(hubMap);
                  const stsKey  = `${mmp}::${advSts}`;
                  const stsOpen = openStss.has(stsKey);
                  const label   = ADV_STATUS_LABEL[advSts] ?? advSts.replace(/_/g, ' ');
                  return (
                    <div key={stsKey}>

                      {/* ── Status — violet ── */}
                      <button
                        className="w-full flex items-center gap-2 px-4 py-2 bg-violet-50 hover:bg-violet-100 border-l-4 border-l-violet-400 text-left transition-colors"
                        onClick={() => toggle(setOpenStss, stsKey)}
                        data-testid={`coverage-status-${stsKey}`}
                      >
                        {stsOpen ? <ChevronDown className="h-3 w-3 text-violet-500 shrink-0" /> : <ChevronRight className="h-3 w-3 text-violet-400 shrink-0" />}
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border capitalize ${statusChipClass(advSts)}`}>{label}</span>
                        <span className="text-xs font-bold flex-1 text-violet-800 text-right">{stsTot} site{stsTot !== 1 ? 's' : ''}</span>
                      </button>

                      {stsOpen && (
                        <div className="flex flex-col divide-y divide-blue-100">
                          {[...hubMap.entries()].sort(([, a], [, b]) => stCount(b) - stCount(a)).map(([hub, stMap]) => {
                            const hubTot  = stCount(stMap);
                            const hKey    = `${mmp}::${advSts}::${hub}`;
                            const hubOpen = openHubs.has(hKey);
                            return (
                              <div key={hKey}>

                                {/* ── Hub — blue ── */}
                                <button
                                  className="w-full flex items-center gap-2 px-6 py-2 bg-blue-50 hover:bg-blue-100 border-l-4 border-l-blue-400 text-left transition-colors"
                                  onClick={() => toggle(setOpenHubs, hKey)}
                                  data-testid={`coverage-hub-${hKey}`}
                                >
                                  {hubOpen ? <ChevronDown className="h-3 w-3 text-blue-500 shrink-0" /> : <ChevronRight className="h-3 w-3 text-blue-400 shrink-0" />}
                                  <Database className="h-3 w-3 text-blue-500 shrink-0" />
                                  <span className="text-xs font-semibold flex-1 text-blue-900 truncate">{hub}</span>
                                  <span className="text-[9px] font-mono bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">{hubTot}</span>
                                </button>

                                {hubOpen && (
                                  <div className="flex flex-col divide-y divide-emerald-100">
                                    {[...stMap.entries()].sort(([, a], [, b]) => dcCount(b) - dcCount(a)).map(([state, dcMap]) => {
                                      const stTot  = dcCount(dcMap);
                                      const stKey  = `${mmp}::${advSts}::${hub}::${state}`;
                                      const stOpen = openSts.has(stKey);
                                      return (
                                        <div key={stKey}>

                                          {/* ── State — emerald ── */}
                                          <button
                                            className="w-full flex items-center gap-2 px-8 py-1.5 bg-emerald-50 hover:bg-emerald-100 border-l-4 border-l-emerald-400 text-left transition-colors"
                                            onClick={() => toggle(setOpenSts, stKey)}
                                            data-testid={`coverage-state-${stKey}`}
                                          >
                                            {stOpen ? <ChevronDown className="h-3 w-3 text-emerald-500 shrink-0" /> : <ChevronRight className="h-3 w-3 text-emerald-400 shrink-0" />}
                                            <Globe className="h-3 w-3 text-emerald-500 shrink-0" />
                                            <span className="text-xs font-semibold flex-1 text-emerald-900 truncate">{state}</span>
                                            <span className="text-[9px] font-mono bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">{stTot}</span>
                                          </button>

                                          {stOpen && (
                                            <div className="flex flex-col divide-y divide-amber-100">
                                              {[...dcMap.entries()].sort(([, a], [, b]) => b.length - a.length).map(([dc, sites]) => {
                                                const dKey   = `${mmp}::${advSts}::${hub}::${state}::${dc}`;
                                                const dcOpen = openDCs.has(dKey);
                                                return (
                                                  <div key={dKey}>

                                                    {/* ── Data Collector — amber ── */}
                                                    <button
                                                      className="w-full flex items-center gap-2 px-10 py-1.5 bg-amber-50 hover:bg-amber-100 border-l-4 border-l-amber-400 text-left transition-colors"
                                                      onClick={() => toggle(setOpenDCs, dKey)}
                                                      data-testid={`coverage-dc-${dKey}`}
                                                    >
                                                      {dcOpen ? <ChevronDown className="h-3 w-3 text-amber-500 shrink-0" /> : <ChevronRight className="h-3 w-3 text-amber-400 shrink-0" />}
                                                      <User className="h-3 w-3 text-amber-500 shrink-0" />
                                                      <span className="text-xs font-semibold flex-1 text-amber-900 truncate">{dc}</span>
                                                      <span className="text-[9px] font-mono bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">{sites.length}</span>
                                                    </button>

                                                    {/* ── Sites ── */}
                                                    {dcOpen && (
                                                      <div className="flex flex-col">
                                                        {sites.map(s => (
                                                          <div
                                                            key={s.id}
                                                            className="flex items-center gap-2 px-12 py-1.5 bg-white hover:bg-slate-50 border-l-4 border-l-slate-200 text-xs"
                                                            data-testid={`coverage-site-${s.id}`}
                                                          >
                                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                                                            <span className="font-medium text-slate-700 flex-1 truncate">{s.site_name || '—'}</span>
                                                          </div>
                                                        ))}
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
