/**
 * Field Payments Centre
 * Route: /field-payments
 *
 * Unified Finance page for all field-level payment flows:
 *   Tab 1 – Enumerator Fees   : mark paid + receipt upload + GL auto-post
 *   Tab 2 – Transport Advances: read-only lifecycle view (links to /down-payment-approval)
 *   Tab 3 – Exception Actions : execute Roll/Hold/Return/Writeoff/Redirect + receipts
 *   Tab 4 – Recovery          : outstanding advances + overdue tracker
 *
 * Design principles:
 *  • No payment data is duplicated — each tab reads from its canonical source table
 *  • Read-only when cycle_status = 'closed' (enforced per-row)
 *  • GL entries fire automatically on payment (via DB trigger for fees,
 *    via post_exception_recovery_to_gl RPC for exception actions)
 *  • Receipt upload mandatory before marking paid (same pattern as down payments)
 *  • Super Admin sees all; Finance roles see their hub scope
 */

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO, differenceInDays } from 'date-fns';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Receipt, Truck, AlertTriangle, TrendingDown,
  Search, Download, RefreshCw, Upload, CheckCircle2,
  Clock, XCircle, RotateCcw, ArrowRightLeft, Banknote,
  ExternalLink, Info, Building2, User, Calendar,
  ChevronDown, ChevronRight, Lock, Filter, X,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface FeeRow {
  id: string;
  siteName: string;
  siteCode: string | null;
  state: string;
  locality: string;
  enumeratorName: string;
  enumeratorId: string | null;
  enumeratorFee: number;
  transportFee: number;
  totalFee: number;
  advancePaid: number;
  netPayable: number;
  feePaidStatus: 'unpaid' | 'paid' | 'partial';
  feePaidAmount: number | null;
  feePaidAt: string | null;
  feePaymentMethod: string | null;
  feeReceiptUrl: string | null;
  mmpId: string;
  mmpName: string;
  mmpHub: string;
  cycleStatus: string;
  siteStatus: string;
}

interface AdvanceSummaryRow {
  id: string;
  enumeratorName: string;
  siteName: string;
  state: string;
  hub: string;
  requestedAmount: number;
  paidAmount: number;
  status: string;
  mmpId: string;
  mmpName: string;
  cycleStatus: string;
  glBridgeStatus: 'posted' | 'error' | 'pending' | 'none';
  paidAt: string | null;
}

interface ExceptionActionRow {
  id: string;
  mmpFileId: string;
  mmpName: string;
  mmpSiteEntryId: string | null;
  advanceId: string | null;
  enumeratorName: string | null;
  siteName: string | null;
  state: string | null;
  advanceAmount: number;
  advanceStatus: string | null;
  decision: string;
  justification: string | null;
  executed: boolean;
  glPosted: boolean;
  receiptUrl: string | null;
  recoveryAmount: number | null;
  recoveryDate: string | null;
  createdAt: string;
  executedAt: string | null;
  approvedByName: string | null;
}

interface RecoveryRow {
  id: string;
  enumeratorName: string;
  siteName: string;
  state: string;
  hub: string;
  mmpId: string;
  mmpName: string;
  disbursedAmount: number;
  recoveredAmount: number;
  outstandingAmount: number;
  disbursedAt: string | null;
  daysOutstanding: number;
  status: string;
  advanceId: string;
}

type PayDialog = {
  open: boolean;
  rows: FeeRow[];
  amount: number;
  method: string;
  date: string;
  notes: string;
  receiptFile: File | null;
  receiptUrl: string | null;
  uploading: boolean;
  saving: boolean;
};

type ExceptionDialog = {
  open: boolean;
  action: ExceptionActionRow | null;
  receiptFile: File | null;
  receiptUrl: string | null;
  recoveryAmount: string;
  recoveryDate: string;
  redirectHub: string;
  notes: string;
  uploading: boolean;
  saving: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Bankak', 'Mobile Money', 'Other'];
const STORAGE_BUCKET = 'mmp-files';

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return n.toLocaleString();
}
function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'd MMM yyyy'); } catch { return iso; }
}
function ageBadge(days: number) {
  if (days <= 30) return <Badge className="bg-green-100 text-green-700 border-green-300 text-xs">{days}d</Badge>;
  if (days <= 60) return <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs">{days}d</Badge>;
  return <Badge className="bg-red-100 text-red-700 border-red-300 text-xs">⚠ {days}d</Badge>;
}
function decisionBadge(d: string) {
  const map: Record<string, string> = {
    roll:     'bg-blue-100 text-blue-700 border-blue-300',
    hold:     'bg-slate-100 text-slate-700 border-slate-300',
    return:   'bg-amber-100 text-amber-700 border-amber-300',
    writeoff: 'bg-red-100 text-red-700 border-red-300',
    redirect: 'bg-purple-100 text-purple-700 border-purple-300',
    cancel:   'bg-gray-100 text-gray-600 border-gray-300',
    reassign: 'bg-teal-100 text-teal-700 border-teal-300',
    reduce:   'bg-orange-100 text-orange-700 border-orange-300',
  };
  const label: Record<string, string> = {
    roll: 'Roll to Next MMP', hold: 'Hold', return: 'Return Required',
    writeoff: 'Write-Off', redirect: 'Redirect to Fees', cancel: 'Cancelled',
    reassign: 'Reassigned', reduce: 'Reduced',
  };
  return (
    <Badge className={`text-[10px] ${map[d] ?? 'bg-slate-100 text-slate-700 border-slate-300'}`}>
      {label[d] ?? d}
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function FieldPaymentsCentre() {
  const { currentUser } = useUser();
  const { isSuperAdmin } = useSuperAdmin();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = searchParams.get('tab') ?? 'fees';
  const mmpFilter = searchParams.get('mmp') ?? '';

  const userRole = currentUser?.role?.toLowerCase() ?? '';
  const isFinance = isSuperAdmin || ['admin', 'financialadmin', 'superadmin', 'accountant'].includes(userRole);

  // ── Shared cross-tab filters ────────────────────────────────────────────────
  const [filterHub, setFilterHub]   = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterMmp, setFilterMmp]   = useState(mmpFilter); // pre-seed from URL ?mmp=
  const [mmps, setMmps] = useState<{ id: string; name: string; hub: string }[]>([]);

  // Load MMP list once on mount (lightweight — id/name/hub only)
  useEffect(() => {
    supabase.from('mmp_files').select('id, name, hub').order('created_at', { ascending: false }).limit(300)
      .then(({ data }) => setMmps(data ?? []));
  }, []);

  // ── Tab 1: Fees state ──────────────────────────────────────────────────────
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [feesLoading, setFeesLoading] = useState(false);
  const [feeSearch, setFeeSearch] = useState('');
  const [feeStatusFilter, setFeeStatusFilter] = useState<'all' | 'unpaid' | 'paid'>('all');
  const [feeSelected, setFeeSelected] = useState<Set<string>>(new Set());
  const [payDialog, setPayDialog] = useState<PayDialog>({
    open: false, rows: [], amount: 0, method: 'Cash',
    date: new Date().toISOString().slice(0, 10),
    notes: '', receiptFile: null, receiptUrl: null,
    uploading: false, saving: false,
  });

  // ── Tab 2: Advances state ──────────────────────────────────────────────────
  const [advances, setAdvances] = useState<AdvanceSummaryRow[]>([]);
  const [advancesLoading, setAdvancesLoading] = useState(false);
  const [advSearch, setAdvSearch] = useState('');
  const [advStatusFilter, setAdvStatusFilter] = useState('all');

  // ── Tab 3: Exceptions state ────────────────────────────────────────────────
  const [exceptions, setExceptions] = useState<ExceptionActionRow[]>([]);
  const [excLoading, setExcLoading] = useState(false);
  const [excSearch, setExcSearch] = useState('');
  const [excDecisionFilter, setExcDecisionFilter] = useState('all');
  const [excStatusFilter, setExcStatusFilter] = useState<'pending' | 'done' | 'all'>('pending');
  const [excDialog, setExcDialog] = useState<ExceptionDialog>({
    open: false, action: null, receiptFile: null, receiptUrl: null,
    recoveryAmount: '', recoveryDate: new Date().toISOString().slice(0, 10),
    redirectHub: '', notes: '', uploading: false, saving: false,
  });

  // ── Tab 4: Recovery state ──────────────────────────────────────────────────
  const [recovery, setRecovery] = useState<RecoveryRow[]>([]);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recSearch, setRecSearch] = useState('');

  // ── Load on tab change ─────────────────────────────────────────────────────
  useEffect(() => {
    if (tab === 'fees')      loadFees();
    if (tab === 'advances')  loadAdvances();
    if (tab === 'exceptions') loadExceptions();
    if (tab === 'recovery')  loadRecovery();
  }, [tab]);

  // ─────────────────────────────────────────────────────────────────────────
  // Tab 1: Load enumerator fees
  // ─────────────────────────────────────────────────────────────────────────
  const loadFees = useCallback(async () => {
    setFeesLoading(true);
    try {
      const { data: sites, error } = await supabase
        .from('mmp_site_entries')
        .select(`
          id, site_name, site_code, state, locality, status,
          accepted_by, enumerator_fee, transport_fee,
          fee_paid_status, fee_paid_amount, fee_paid_at, fee_payment_method, fee_payment_notes,
          fee_receipt_url,
          mmp_file_id,
          mmp_files!mmp_file_id(id, name, hub, cycle_status)
        `)
        .not('accepted_by', 'is', null)
        .order('state');

      if (error) throw error;

      // Resolve enumerator names
      const enumIds = [...new Set((sites ?? []).map((s: any) => s.accepted_by).filter(Boolean))];
      const nameMap: Record<string, string> = {};
      if (enumIds.length) {
        const { data: profiles } = await supabase
          .from('profiles').select('id, full_name').in('id', enumIds);
        for (const p of profiles ?? []) { if (p.full_name) nameMap[p.id] = p.full_name; }
      }

      // Resolve advance amounts per site
      const siteIds = (sites ?? []).map((s: any) => s.id);
      const advMap: Record<string, number> = {};
      if (siteIds.length) {
        const { data: advs } = await supabase
          .from('down_payment_requests')
          .select('mmp_site_entry_id, total_paid_amount')
          .in('mmp_site_entry_id', siteIds)
          .in('status', ['paid', 'fully_paid', 'partially_paid']);
        for (const a of advs ?? []) {
          const prev = advMap[a.mmp_site_entry_id] ?? 0;
          advMap[a.mmp_site_entry_id] = Math.max(prev, a.total_paid_amount ?? 0);
        }
      }

      const rows: FeeRow[] = (sites ?? []).map((s: any) => {
        const mmp = s.mmp_files ?? {};
        const ef = s.enumerator_fee ?? 0;
        const tf = s.transport_fee ?? 0;
        const total = ef + tf;
        const adv = advMap[s.id] ?? 0;
        return {
          id: s.id,
          siteName: s.site_name ?? '—',
          siteCode: s.site_code ?? null,
          state: s.state ?? '—',
          locality: s.locality ?? '—',
          enumeratorId: s.accepted_by,
          enumeratorName: nameMap[s.accepted_by] ?? 'Unknown',
          enumeratorFee: ef,
          transportFee: tf,
          totalFee: total,
          advancePaid: adv,
          netPayable: Math.max(total - adv, 0),
          feePaidStatus: (s.fee_paid_status ?? 'unpaid') as FeeRow['feePaidStatus'],
          feePaidAmount: s.fee_paid_amount,
          feePaidAt: s.fee_paid_at,
          feePaymentMethod: s.fee_payment_method,
          feeReceiptUrl: s.fee_receipt_url ?? null,
          mmpId: mmp.id ?? s.mmp_file_id,
          mmpName: mmp.name ?? '—',
          mmpHub: mmp.hub ?? '—',
          cycleStatus: mmp.cycle_status ?? '—',
          siteStatus: s.status ?? '—',
        };
      }).filter(r => r.totalFee > 0);

      setFees(rows);
    } catch (e: any) {
      toast({ title: 'Error loading fees', description: e.message, variant: 'destructive' });
    } finally {
      setFeesLoading(false);
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Tab 2: Load advance summaries
  // ─────────────────────────────────────────────────────────────────────────
  const loadAdvances = useCallback(async () => {
    setAdvancesLoading(true);
    try {
      // Step 1: fetch advances (no join — FK to mmp_site_entries is not declared)
      const { data, error } = await supabase
        .from('down_payment_requests')
        .select('id, status, requested_amount, total_paid_amount, updated_at, site_name, hub_name, state, mmp_site_entry_id')
        .in('status', ['approved', 'paid', 'partially_paid', 'fully_paid', 'cancelled'])
        .order('updated_at', { ascending: false })
        .limit(500);
      if (error) throw error;

      // Step 2: resolve mmp_site_entries → mmp_files in two separate queries
      const siteEntryIds = [...new Set((data ?? []).map((r: any) => r.mmp_site_entry_id).filter(Boolean))];
      const entryMap: Record<string, { accepted_by: string | null; mmp_file_id: string | null }> = {};
      if (siteEntryIds.length) {
        const { data: entries } = await supabase
          .from('mmp_site_entries')
          .select('id, accepted_by, mmp_file_id')
          .in('id', siteEntryIds);
        for (const e of entries ?? []) entryMap[e.id] = { accepted_by: e.accepted_by, mmp_file_id: e.mmp_file_id };
      }

      const mmpFileIds = [...new Set(Object.values(entryMap).map(e => e.mmp_file_id).filter(Boolean))] as string[];
      const mmpMap: Record<string, { id: string; name: string; cycle_status: string }> = {};
      if (mmpFileIds.length) {
        const { data: mmpFiles } = await supabase
          .from('mmp_files')
          .select('id, name, cycle_status')
          .in('id', mmpFileIds);
        for (const m of mmpFiles ?? []) mmpMap[m.id] = m;
      }

      // Step 3: resolve enumerator names + GL bridge in parallel
      const enumIds = [...new Set(Object.values(entryMap).map(e => e.accepted_by).filter(Boolean))] as string[];
      const advIds  = (data ?? []).map((r: any) => r.id as string);
      const nameMap: Record<string, string> = {};
      const glMap:   Record<string, 'posted' | 'error' | 'pending'> = {};

      await Promise.all([
        enumIds.length ? supabase.from('profiles').select('id, full_name').in('id', enumIds).then(({ data: prs }) => {
          for (const p of prs ?? []) { if (p.full_name) nameMap[p.id] = p.full_name; }
        }) : Promise.resolve(),
        advIds.length ? supabase.from('acct_gl_bridge_log').select('source_id, status')
          .eq('source_table', 'down_payment_requests').in('source_id', advIds).then(({ data: logs }) => {
            for (const l of logs ?? []) {
              glMap[l.source_id] = l.status === 'success' ? 'posted' : l.status === 'error' ? 'error' : 'pending';
            }
          }) : Promise.resolve(),
      ]);

      const rows: AdvanceSummaryRow[] = (data ?? []).map((r: any) => {
        const entry  = entryMap[r.mmp_site_entry_id] ?? {};
        const mmpFid = entry.mmp_file_id ?? '';
        const mmp    = mmpMap[mmpFid] ?? {};
        return {
          id: r.id,
          enumeratorName: entry.accepted_by ? (nameMap[entry.accepted_by] ?? '—') : '—',
          siteName: r.site_name ?? '—',
          state: r.state ?? '—',
          hub: r.hub_name ?? '—',
          requestedAmount: r.requested_amount ?? 0,
          paidAmount: r.total_paid_amount ?? 0,
          status: r.status,
          mmpId: mmp.id ?? '',
          mmpName: (mmp as any).name ?? '—',
          cycleStatus: (mmp as any).cycle_status ?? '—',
          glBridgeStatus: glMap[r.id] ?? 'none',
          paidAt: r.updated_at,
        };
      });

      setAdvances(rows);
    } catch (e: any) {
      toast({ title: 'Error loading advances', description: e.message, variant: 'destructive' });
    } finally {
      setAdvancesLoading(false);
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Tab 3: Load exception actions
  // ─────────────────────────────────────────────────────────────────────────
  const loadExceptions = useCallback(async () => {
    setExcLoading(true);
    try {
      const { data, error } = await supabase
        .from('cycle_exception_actions')
        .select('*, mmp_files!mmp_file_id(name)')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Resolve approver names
      const approverIds = [...new Set(
        (data ?? []).map((r: any) => r.executed_by).filter(Boolean)
      )];
      const nameMap: Record<string, string> = {};
      if (approverIds.length) {
        const { data: prs } = await supabase.from('profiles').select('id, full_name').in('id', approverIds);
        for (const p of prs ?? []) { if (p.full_name) nameMap[p.id] = p.full_name; }
      }

      const rows: ExceptionActionRow[] = (data ?? []).map((r: any) => ({
        id: r.id,
        mmpFileId: r.mmp_file_id,
        mmpName: r.mmp_files?.name ?? '—',
        mmpSiteEntryId: r.mmp_site_entry_id,
        advanceId: r.advance_id,
        enumeratorName: r.enumerator_name ?? '—',
        siteName: r.site_name ?? '—',
        state: r.state ?? null,
        advanceAmount: r.advance_amount ?? 0,
        advanceStatus: r.advance_status,
        decision: r.decision,
        justification: r.justification,
        executed: r.executed ?? false,
        glPosted: r.gl_posted ?? false,
        receiptUrl: r.receipt_url ?? null,
        recoveryAmount: r.recovery_amount ?? null,
        recoveryDate: r.recovery_date ?? null,
        createdAt: r.created_at,
        executedAt: r.executed_at ?? null,
        approvedByName: nameMap[r.executed_by] ?? null,
      }));

      setExceptions(rows);
    } catch (e: any) {
      toast({ title: 'Error loading exceptions', description: e.message, variant: 'destructive' });
    } finally {
      setExcLoading(false);
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Tab 4: Load recovery / outstanding
  // ─────────────────────────────────────────────────────────────────────────
  const loadRecovery = useCallback(async () => {
    setRecoveryLoading(true);
    try {
      // Step 1: fetch advances (no join — FK to mmp_site_entries is not declared)
      const { data, error } = await supabase
        .from('down_payment_requests')
        .select('id, requested_amount, total_paid_amount, status, updated_at, hub_name, state, site_name, mmp_site_entry_id')
        .in('status', ['paid', 'partially_paid', 'fully_paid'])
        .order('updated_at');
      if (error) throw error;

      // Step 2: resolve mmp_site_entries → mmp_files
      const siteEntryIds = [...new Set((data ?? []).map((r: any) => r.mmp_site_entry_id).filter(Boolean))];
      const entryMap: Record<string, { id: string; accepted_by: string | null; mmp_file_id: string | null }> = {};
      if (siteEntryIds.length) {
        const { data: entries } = await supabase
          .from('mmp_site_entries')
          .select('id, accepted_by, mmp_file_id')
          .in('id', siteEntryIds);
        for (const e of entries ?? []) entryMap[e.id] = { id: e.id, accepted_by: e.accepted_by, mmp_file_id: e.mmp_file_id };
      }

      const mmpFileIds = [...new Set(Object.values(entryMap).map(e => e.mmp_file_id).filter(Boolean))] as string[];
      const mmpMap: Record<string, { id: string; name: string }> = {};
      if (mmpFileIds.length) {
        const { data: mmpFiles } = await supabase.from('mmp_files').select('id, name').in('id', mmpFileIds);
        for (const m of mmpFiles ?? []) mmpMap[m.id] = m;
      }

      // Step 3: enumerator names + fee-offset check in parallel
      const enumIds    = [...new Set(Object.values(entryMap).map(e => e.accepted_by).filter(Boolean))] as string[];
      const siteIdList = Object.values(entryMap).map(e => e.id).filter(Boolean);
      const nameMap:  Record<string, string>  = {};
      const offsetMap: Record<string, number> = {};

      await Promise.all([
        enumIds.length ? supabase.from('profiles').select('id, full_name').in('id', enumIds).then(({ data: prs }) => {
          for (const p of prs ?? []) { if (p.full_name) nameMap[p.id] = p.full_name; }
        }) : Promise.resolve(),
        siteIdList.length ? supabase.from('mmp_site_entries')
          .select('id, fee_paid_status').in('id', siteIdList).eq('fee_paid_status', 'paid')
          .then(({ data: feeSites }) => {
            const paidSiteIds = new Set((feeSites ?? []).map((s: any) => s.id));
            for (const r of (data ?? []) as any[]) {
              const entry = entryMap[r.mmp_site_entry_id];
              if (entry?.id && paidSiteIds.has(entry.id)) {
                offsetMap[r.id] = r.total_paid_amount ?? 0;
              }
            }
          }) : Promise.resolve(),
      ]);

      const rows: RecoveryRow[] = (data ?? [])
        .map((r: any): RecoveryRow => {
          const entry     = entryMap[r.mmp_site_entry_id] ?? {};
          const mmpFid    = (entry as any).mmp_file_id ?? '';
          const mmp       = mmpMap[mmpFid] ?? {};
          const disbursed  = r.total_paid_amount ?? 0;
          const recovered  = offsetMap[r.id] ?? 0;
          const outstanding = Math.max(disbursed - recovered, 0);
          const daysOut = differenceInDays(new Date(), new Date(r.updated_at ?? Date.now()));
          return {
            id: r.id,
            advanceId: r.id,
            enumeratorName: (entry as any).accepted_by ? (nameMap[(entry as any).accepted_by] ?? '—') : '—',
            siteName: r.site_name ?? '—',
            state: r.state ?? '—',
            hub: r.hub_name ?? '—',
            mmpId: (mmp as any).id ?? '',
            mmpName: (mmp as any).name ?? '—',
            disbursedAmount: disbursed,
            recoveredAmount: recovered,
            outstandingAmount: outstanding,
            disbursedAt: r.updated_at,
            daysOutstanding: daysOut,
            status: r.status,
          };
        })
        .filter(r => r.outstandingAmount > 0);

      setRecovery(rows);
    } catch (e: any) {
      toast({ title: 'Error loading recovery data', description: e.message, variant: 'destructive' });
    } finally {
      setRecoveryLoading(false);
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Tab 1 actions: receipt upload + mark paid
  // ─────────────────────────────────────────────────────────────────────────
  const uploadReceipt = async (file: File, folder: string): Promise<string> => {
    const path = `${folder}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return publicUrl;
  };

  const openPayDialog = (rows: FeeRow[]) => {
    const totalNet = rows.reduce((s, r) => s + r.netPayable, 0);
    setPayDialog(d => ({
      ...d, open: true, rows,
      amount: totalNet,
      method: 'Cash',
      date: new Date().toISOString().slice(0, 10),
      notes: '', receiptFile: null, receiptUrl: null,
      uploading: false, saving: false,
    }));
  };

  const handleFeeReceiptUpload = async (file: File) => {
    setPayDialog(d => ({ ...d, uploading: true, receiptFile: file }));
    try {
      const url = await uploadReceipt(file, 'field-payments/fees');
      setPayDialog(d => ({ ...d, receiptUrl: url, uploading: false }));
      toast({ title: 'Receipt uploaded' });
    } catch (e: any) {
      setPayDialog(d => ({ ...d, uploading: false }));
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    }
  };

  const submitFeePay = async () => {
    if (!payDialog.receiptUrl) {
      toast({ title: 'Receipt required', description: 'Upload a payment receipt before marking as paid.', variant: 'destructive' });
      return;
    }
    setPayDialog(d => ({ ...d, saving: true }));
    try {
      const now = new Date().toISOString();
      const updates = payDialog.rows.map(row =>
        supabase.from('mmp_site_entries').update({
          fee_paid_status:           'paid',
          fee_paid_amount:           row.netPayable,
          fee_paid_at:               payDialog.date ? new Date(payDialog.date).toISOString() : now,
          fee_paid_by:               currentUser?.id,
          fee_payment_method:        payDialog.method,
          fee_payment_notes:         payDialog.notes || null,
          fee_receipt_url:           payDialog.receiptUrl,
          fee_receipt_uploaded_at:   now,
          fee_receipt_uploaded_by:   currentUser?.id,
        }).eq('id', row.id)
      );
      const results = await Promise.all(updates);
      const errs = results.filter(r => r.error);
      if (errs.length) throw new Error(errs[0].error!.message);

      toast({
        title: `${payDialog.rows.length} fee${payDialog.rows.length !== 1 ? 's' : ''} marked paid`,
        description: 'GL entry will be posted automatically.',
      });
      setPayDialog(d => ({ ...d, open: false, saving: false }));
      setFeeSelected(new Set());
      loadFees();
    } catch (e: any) {
      setPayDialog(d => ({ ...d, saving: false }));
      toast({ title: 'Payment failed', description: e.message, variant: 'destructive' });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Tab 3 actions: execute exception + receipt + GL
  // ─────────────────────────────────────────────────────────────────────────
  const openExcDialog = (action: ExceptionActionRow) => {
    setExcDialog(d => ({
      ...d, open: true, action,
      receiptFile: null, receiptUrl: null,
      recoveryAmount: String(action.advanceAmount),
      recoveryDate: new Date().toISOString().slice(0, 10),
      redirectHub: '', notes: '', uploading: false, saving: false,
    }));
  };

  const handleExcReceiptUpload = async (file: File) => {
    setExcDialog(d => ({ ...d, uploading: true, receiptFile: file }));
    try {
      const url = await uploadReceipt(file, 'field-payments/exceptions');
      setExcDialog(d => ({ ...d, receiptUrl: url, uploading: false }));
      toast({ title: 'Receipt uploaded' });
    } catch (e: any) {
      setExcDialog(d => ({ ...d, uploading: false }));
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    }
  };

  const submitException = async () => {
    const { action, receiptUrl, recoveryAmount, recoveryDate, redirectHub, notes } = excDialog;
    if (!action) return;

    const needsReceipt = ['writeoff', 'return', 'redirect'].includes(action.decision);
    if (needsReceipt && !receiptUrl) {
      toast({ title: 'Receipt required', description: 'Upload a receipt or approval document first.', variant: 'destructive' });
      return;
    }

    setExcDialog(d => ({ ...d, saving: true }));
    try {
      const now = new Date().toISOString();
      const updatePayload: Record<string, any> = {
        executed:          true,
        executed_at:       now,
        executed_by:       currentUser?.id,
        executed_by_name:  currentUser?.fullName ?? currentUser?.email,
        execution_note:    notes || null,
        receipt_url:       receiptUrl ?? null,
        receipt_uploaded_at: receiptUrl ? now : null,
        receipt_uploaded_by: receiptUrl ? currentUser?.id : null,
      };

      if (action.decision === 'return') {
        updatePayload.recovery_amount       = parseFloat(recoveryAmount) || action.advanceAmount;
        updatePayload.recovery_date         = recoveryDate || null;
        updatePayload.recovery_collected_by = currentUser?.id;
        updatePayload.recovery_collected_by_name = currentUser?.fullName ?? null;
        // Flag the advance for return tracking
        if (action.advanceId) {
          await supabase.from('down_payment_requests').update({
            metadata: { return_requested: true, return_requested_at: now, return_requested_by: currentUser?.id, return_collection_note: notes },
          }).eq('id', action.advanceId);
        }
      }

      if (action.decision === 'redirect' && redirectHub) {
        updatePayload.execution_note = `Redirected to: ${redirectHub}${notes ? ' — ' + notes : ''}`;
        if (action.advanceId) {
          await supabase.from('down_payment_requests').update({
            hub_name: redirectHub,
            metadata: { redirect_to_fees: true, redirect_hub: redirectHub, redirect_at: now },
          }).eq('id', action.advanceId);
        }
      }

      if (action.decision === 'writeoff' && action.advanceId) {
        await supabase.from('down_payment_requests').update({ status: 'cancelled' }).eq('id', action.advanceId);
      }

      const { error: updErr } = await supabase
        .from('cycle_exception_actions')
        .update(updatePayload)
        .eq('id', action.id);

      if (updErr) throw updErr;

      // Fire GL entry via RPC
      if (['return', 'writeoff', 'redirect'].includes(action.decision)) {
        const { data: glResult } = await supabase.rpc('post_exception_recovery_to_gl', { p_action_id: action.id });
        if (glResult?.error) {
          toast({
            title: 'GL posting queued',
            description: 'Payment recorded. GL entry will be retried automatically.',
            variant: 'default',
          });
        }
      }

      toast({ title: 'Exception executed', description: `${action.decision} action completed successfully.` });
      setExcDialog(d => ({ ...d, open: false, saving: false }));
      loadExceptions();
    } catch (e: any) {
      setExcDialog(d => ({ ...d, saving: false }));
      toast({ title: 'Execution failed', description: e.message, variant: 'destructive' });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Shared filter option lists (derived from loaded data + MMP list)
  // ─────────────────────────────────────────────────────────────────────────
  const uniqueHubs = useMemo(() =>
    [...new Set(mmps.map(m => m.hub).filter(Boolean))].sort() as string[],
  [mmps]);

  // Cascade: state options come from whichever tabs have been loaded
  const uniqueStates = useMemo(() => {
    const states = new Set<string>();
    fees.forEach(r => r.state && r.state !== '—' && states.add(r.state));
    advances.forEach(r => r.state && r.state !== '—' && states.add(r.state));
    exceptions.forEach(r => r.state && r.state !== '—' && states.add(r.state));
    recovery.forEach(r => r.state && r.state !== '—' && states.add(r.state));
    return [...states].sort();
  }, [fees, advances, exceptions, recovery]);

  // MMP options cascade by hub
  const uniqueMmpOptions = useMemo(() =>
    filterHub ? mmps.filter(m => m.hub === filterHub) : mmps,
  [mmps, filterHub]);

  const activeFilterCount = [filterHub, filterState, filterMmp].filter(Boolean).length;

  const clearFilters = () => { setFilterHub(''); setFilterState(''); setFilterMmp(''); };

  // ─────────────────────────────────────────────────────────────────────────
  // Filtered data
  // ─────────────────────────────────────────────────────────────────────────
  const filteredFees = useMemo(() => {
    let rows = fees;
    if (filterHub)    rows = rows.filter(r => r.mmpHub === filterHub);
    if (filterState)  rows = rows.filter(r => r.state === filterState);
    if (filterMmp)    rows = rows.filter(r => r.mmpId === filterMmp);
    if (feeStatusFilter !== 'all') rows = rows.filter(r => r.feePaidStatus === feeStatusFilter);
    if (feeSearch) {
      const q = feeSearch.toLowerCase();
      rows = rows.filter(r =>
        r.siteName.toLowerCase().includes(q) ||
        r.enumeratorName.toLowerCase().includes(q) ||
        r.state.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [fees, filterHub, filterState, filterMmp, feeStatusFilter, feeSearch]);

  const filteredAdvances = useMemo(() => {
    let rows = advances;
    if (filterHub)   rows = rows.filter(r => r.hub === filterHub);
    if (filterState) rows = rows.filter(r => r.state === filterState);
    if (filterMmp)   rows = rows.filter(r => r.mmpId === filterMmp);
    if (advStatusFilter !== 'all') rows = rows.filter(r => r.status === advStatusFilter);
    if (advSearch) {
      const q = advSearch.toLowerCase();
      rows = rows.filter(r =>
        r.enumeratorName.toLowerCase().includes(q) ||
        r.siteName.toLowerCase().includes(q) ||
        r.mmpName.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [advances, filterHub, filterState, filterMmp, advStatusFilter, advSearch]);

  const filteredExceptions = useMemo(() => {
    let rows = exceptions;
    if (filterState) rows = rows.filter(r => r.state === filterState);
    if (filterMmp)   rows = rows.filter(r => r.mmpFileId === filterMmp);
    if (excDecisionFilter !== 'all') rows = rows.filter(r => r.decision === excDecisionFilter);
    if (excStatusFilter === 'pending') rows = rows.filter(r => !r.executed);
    if (excStatusFilter === 'done')    rows = rows.filter(r => r.executed);
    if (excSearch) {
      const q = excSearch.toLowerCase();
      rows = rows.filter(r =>
        (r.siteName ?? '').toLowerCase().includes(q) ||
        (r.enumeratorName ?? '').toLowerCase().includes(q) ||
        r.mmpName.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [exceptions, filterState, filterMmp, excDecisionFilter, excStatusFilter, excSearch]);

  const filteredRecovery = useMemo(() => {
    let rows = recovery;
    if (filterHub)   rows = rows.filter(r => r.hub === filterHub);
    if (filterState) rows = rows.filter(r => r.state === filterState);
    if (filterMmp)   rows = rows.filter(r => r.mmpId === filterMmp);
    if (recSearch) {
      const q = recSearch.toLowerCase();
      rows = rows.filter(r =>
        r.enumeratorName.toLowerCase().includes(q) ||
        r.siteName.toLowerCase().includes(q) ||
        r.mmpName.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [recovery, filterHub, filterState, filterMmp, recSearch]);

  // ─────────────────────────────────────────────────────────────────────────
  // Summary cards
  // ─────────────────────────────────────────────────────────────────────────
  const feeStats = useMemo(() => {
    const unpaid = fees.filter(r => r.feePaidStatus !== 'paid');
    const paid   = fees.filter(r => r.feePaidStatus === 'paid');
    return {
      totalUnpaid: unpaid.length,
      totalUnpaidAmt: unpaid.reduce((s, r) => s + r.netPayable, 0),
      totalPaid: paid.length,
      totalPaidAmt: paid.reduce((s, r) => s + (r.feePaidAmount ?? r.netPayable), 0),
    };
  }, [fees]);

  const excStats = useMemo(() => ({
    pending: exceptions.filter(r => !r.executed).length,
    done:    exceptions.filter(r => r.executed).length,
    noGl:    exceptions.filter(r => r.executed && !r.glPosted && ['return','writeoff','redirect'].includes(r.decision)).length,
  }), [exceptions]);

  const recStats = useMemo(() => ({
    total: recovery.length,
    totalAmt: recovery.reduce((s, r) => s + r.outstandingAmount, 0),
    overdue: recovery.filter(r => r.daysOutstanding > 30).length,
  }), [recovery]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (!isFinance) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-8">
        <Alert className="max-w-md border-red-200 bg-red-50">
          <Lock className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            Access restricted. Finance roles only.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" />
            Field Payments Centre
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Enumerator fees · Transport advances · Exception recovery · Outstanding tracker
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/down-payment-approval')}>
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Advance Approval
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/cost-submission')}>
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Cost Submission
          </Button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Fees Unpaid</p>
          <p className="text-xl font-bold text-amber-600">{feeStats.totalUnpaid}</p>
          <p className="text-xs text-muted-foreground">SDG {fmt(feeStats.totalUnpaidAmt)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Fees Paid</p>
          <p className="text-xl font-bold text-green-600">{feeStats.totalPaid}</p>
          <p className="text-xs text-muted-foreground">SDG {fmt(feeStats.totalPaidAmt)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Exceptions Pending</p>
          <p className={`text-xl font-bold ${excStats.pending > 0 ? 'text-red-600' : 'text-green-600'}`}>{excStats.pending}</p>
          {excStats.noGl > 0 && <p className="text-xs text-red-500">{excStats.noGl} GL not posted</p>}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Outstanding Advances</p>
          <p className={`text-xl font-bold ${recStats.total > 0 ? 'text-amber-600' : 'text-green-600'}`}>{recStats.total}</p>
          {recStats.overdue > 0 && <p className="text-xs text-red-500">{recStats.overdue} overdue &gt;30d</p>}
        </Card>
      </div>

      {/* ── Shared cross-tab filters ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap bg-slate-50 dark:bg-slate-900/50 border rounded-lg px-3 py-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-muted-foreground">Filter all tabs:</span>

        {/* Hub */}
        <Select value={filterHub || '__all__'} onValueChange={v => {
          setFilterHub(v === '__all__' ? '' : v);
          setFilterState('');
          setFilterMmp('');
        }}>
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue placeholder="All Hubs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Hubs</SelectItem>
            {uniqueHubs.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* State */}
        <Select value={filterState || '__all__'} onValueChange={v => setFilterState(v === '__all__' ? '' : v)}>
          <SelectTrigger className="h-8 text-xs w-40">
            <SelectValue placeholder="All States" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All States</SelectItem>
            {uniqueStates.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* MMP */}
        <Select value={filterMmp || '__all__'} onValueChange={v => setFilterMmp(v === '__all__' ? '' : v)}>
          <SelectTrigger className="h-8 text-xs w-52">
            <SelectValue placeholder="All MMPs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All MMPs</SelectItem>
            {uniqueMmpOptions.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>

        {activeFilterCount > 0 && (
          <>
            <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">
              {activeFilterCount} active
            </Badge>
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-muted-foreground" onClick={clearFilters}>
              <X className="h-3 w-3" /> Clear
            </Button>
          </>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={t => setSearchParams({ tab: t })}>
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="fees" className="gap-1.5">
            <Receipt className="h-3.5 w-3.5" />
            Enumerator Fees
            {feeStats.totalUnpaid > 0 && (
              <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-[10px] ml-1">{feeStats.totalUnpaid}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="advances" className="gap-1.5">
            <Truck className="h-3.5 w-3.5" />
            Transport Advances
          </TabsTrigger>
          <TabsTrigger value="exceptions" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Exception Actions
            {excStats.pending > 0 && (
              <Badge className="bg-red-100 text-red-700 border-red-300 text-[10px] ml-1">{excStats.pending}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="recovery" className="gap-1.5">
            <TrendingDown className="h-3.5 w-3.5" />
            Recovery
            {recStats.overdue > 0 && (
              <Badge className="bg-red-100 text-red-700 border-red-300 text-[10px] ml-1">⚠ {recStats.overdue}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 1 — ENUMERATOR FEES
        ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="fees" className="space-y-4 mt-4">
          <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800 dark:text-blue-200 text-sm">
              Mark fees as paid after cash / bank transfer is made to enumerators. A receipt must be uploaded.
              GL entries (DR 5200 Enumerator Fees / CR 1010 Cash or 1020 Bank) are posted automatically.
              Advances are deducted from the net payable shown below.
            </AlertDescription>
          </Alert>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-8 h-8 text-xs" placeholder="Search site, enumerator, state…" value={feeSearch} onChange={e => setFeeSearch(e.target.value)} />
            </div>
            <Select value={feeStatusFilter} onValueChange={v => setFeeStatusFilter(v as any)}>
              <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={loadFees}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
            {feeSelected.size > 0 && (
              <Button size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white" onClick={() => openPayDialog(filteredFees.filter(r => feeSelected.has(r.id)))}>
                <Banknote className="h-3 w-3 mr-1" /> Pay {feeSelected.size} selected
              </Button>
            )}
          </div>

          {feesLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-900">
                    <TableHead className="w-8">
                      <Checkbox
                        checked={feeSelected.size === filteredFees.filter(r => r.feePaidStatus !== 'paid').length && filteredFees.filter(r => r.feePaidStatus !== 'paid').length > 0}
                        onCheckedChange={checked => {
                          if (checked) setFeeSelected(new Set(filteredFees.filter(r => r.feePaidStatus !== 'paid').map(r => r.id)));
                          else setFeeSelected(new Set());
                        }}
                      />
                    </TableHead>
                    <TableHead className="text-xs">Site</TableHead>
                    <TableHead className="text-xs">Enumerator</TableHead>
                    <TableHead className="text-xs">MMP</TableHead>
                    <TableHead className="text-xs text-right">Fee</TableHead>
                    <TableHead className="text-xs text-right">Advance</TableHead>
                    <TableHead className="text-xs text-right font-semibold">Net Payable</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Receipt</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFees.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground text-sm">No records found</TableCell></TableRow>
                  ) : filteredFees.map(row => (
                    <TableRow key={row.id} className={row.feePaidStatus === 'paid' ? 'opacity-60' : ''}>
                      <TableCell>
                        {row.feePaidStatus !== 'paid' && (
                          <Checkbox
                            checked={feeSelected.has(row.id)}
                            onCheckedChange={c => {
                              const s = new Set(feeSelected);
                              if (c) s.add(row.id); else s.delete(row.id);
                              setFeeSelected(s);
                            }}
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        <p className="font-medium">{row.siteName}</p>
                        <p className="text-muted-foreground">{row.state} / {row.locality}</p>
                      </TableCell>
                      <TableCell className="text-xs">{row.enumeratorName}</TableCell>
                      <TableCell className="text-xs">
                        <p>{row.mmpName}</p>
                        {row.cycleStatus === 'closed' && <Badge className="bg-slate-100 text-slate-600 text-[10px] mt-0.5">Closed</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-right">SDG {fmt(row.totalFee)}</TableCell>
                      <TableCell className="text-xs text-right text-amber-600">{row.advancePaid > 0 ? `− SDG ${fmt(row.advancePaid)}` : '—'}</TableCell>
                      <TableCell className="text-xs text-right font-semibold">{row.netPayable > 0 ? `SDG ${fmt(row.netPayable)}` : <span className="text-green-600 text-[10px]">Covered by advance</span>}</TableCell>
                      <TableCell>
                        {row.feePaidStatus === 'paid'
                          ? <Badge className="bg-green-100 text-green-700 border-green-300 text-[10px]">✓ Paid</Badge>
                          : <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-[10px]">Unpaid</Badge>
                        }
                        {row.feePaidAt && <p className="text-[10px] text-muted-foreground mt-0.5">{fmtDate(row.feePaidAt)}</p>}
                      </TableCell>
                      <TableCell>
                        {row.feeReceiptUrl
                          ? <a href={row.feeReceiptUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-[10px] flex items-center gap-1 hover:underline"><ExternalLink className="h-3 w-3" /> View</a>
                          : <span className="text-[10px] text-muted-foreground">—</span>
                        }
                      </TableCell>
                      <TableCell>
                        {row.feePaidStatus !== 'paid' && row.cycleStatus !== 'closed' && (
                          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => openPayDialog([row])}>
                            <Banknote className="h-3 w-3 mr-1" /> Pay
                          </Button>
                        )}
                        {row.cycleStatus === 'closed' && row.feePaidStatus !== 'paid' && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" /> Cycle closed</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 2 — TRANSPORT ADVANCES (read-only summary)
        ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="advances" className="space-y-4 mt-4">
          <Alert className="border-slate-200 bg-slate-50 dark:bg-slate-900/30">
            <Info className="h-4 w-4 text-slate-600" />
            <AlertDescription className="text-slate-700 dark:text-slate-300 text-sm">
              Read-only summary of transport advances and their lifecycle. To approve, disburse, or manage individual advances go to{' '}
              <button className="text-blue-600 hover:underline font-medium" onClick={() => navigate('/down-payment-approval')}>
                Down Payment Approval →
              </button>
            </AlertDescription>
          </Alert>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-8 h-8 text-xs" placeholder="Search enumerator, site, MMP…" value={advSearch} onChange={e => setAdvSearch(e.target.value)} />
            </div>
            <Select value={advStatusFilter} onValueChange={setAdvStatusFilter}>
              <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="partially_paid">Partially Paid</SelectItem>
                <SelectItem value="fully_paid">Fully Paid</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={loadAdvances}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          </div>

          {advancesLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-900">
                    <TableHead className="text-xs">Enumerator</TableHead>
                    <TableHead className="text-xs">Site</TableHead>
                    <TableHead className="text-xs">MMP</TableHead>
                    <TableHead className="text-xs text-right">Requested</TableHead>
                    <TableHead className="text-xs text-right">Paid</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">GL</TableHead>
                    <TableHead className="text-xs">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAdvances.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">No advances found</TableCell></TableRow>
                  ) : filteredAdvances.map(row => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs font-medium">{row.enumeratorName}</TableCell>
                      <TableCell className="text-xs">
                        <p>{row.siteName}</p>
                        <p className="text-muted-foreground">{row.state} · {row.hub}</p>
                      </TableCell>
                      <TableCell className="text-xs">
                        <p>{row.mmpName}</p>
                        {row.cycleStatus === 'closed' && <Badge className="bg-slate-100 text-slate-600 text-[10px]">Closed</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-right">SDG {fmt(row.requestedAmount)}</TableCell>
                      <TableCell className="text-xs text-right">{row.paidAmount > 0 ? `SDG ${fmt(row.paidAmount)}` : '—'}</TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${
                          row.status === 'fully_paid' ? 'bg-green-100 text-green-700 border-green-300' :
                          row.status === 'paid'       ? 'bg-green-100 text-green-700 border-green-300' :
                          row.status === 'approved'   ? 'bg-amber-100 text-amber-700 border-amber-300' :
                          row.status === 'cancelled'  ? 'bg-red-100 text-red-700 border-red-300' :
                          'bg-slate-100 text-slate-600 border-slate-300'
                        }`}>
                          {row.status.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${
                          row.glBridgeStatus === 'posted' ? 'bg-green-100 text-green-700 border-green-300' :
                          row.glBridgeStatus === 'error'  ? 'bg-red-100 text-red-700 border-red-300' :
                          'bg-slate-100 text-slate-500 border-slate-300'
                        }`}>
                          {row.glBridgeStatus === 'posted' ? '✓ GL' : row.glBridgeStatus === 'error' ? '✗ GL Error' : 'Not posted'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => navigate('/down-payment-approval')}>
                          <ExternalLink className="h-3 w-3 mr-1" /> Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 3 — EXCEPTION ACTIONS
        ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="exceptions" className="space-y-4 mt-4">
          <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800 dark:text-amber-200 text-sm">
              These are exception decisions made during cycle close. Execute each pending action — upload receipts for Return/Writeoff/Redirect decisions.
              GL entries post automatically on execution.
            </AlertDescription>
          </Alert>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-8 h-8 text-xs" placeholder="Search site, enumerator, MMP…" value={excSearch} onChange={e => setExcSearch(e.target.value)} />
            </div>
            <Select value={excDecisionFilter} onValueChange={setExcDecisionFilter}>
              <SelectTrigger className="h-8 text-xs w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Decisions</SelectItem>
                <SelectItem value="roll">Roll to Next MMP</SelectItem>
                <SelectItem value="hold">Hold</SelectItem>
                <SelectItem value="return">Return Required</SelectItem>
                <SelectItem value="writeoff">Write-Off</SelectItem>
                <SelectItem value="redirect">Redirect to Fees</SelectItem>
                <SelectItem value="cancel">Cancel & Void</SelectItem>
                <SelectItem value="reassign">Reassign</SelectItem>
                <SelectItem value="reduce">Reduce</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex rounded-md border overflow-hidden">
              {(['pending', 'all', 'done'] as const).map(s => (
                <button key={s} type="button"
                  onClick={() => setExcStatusFilter(s)}
                  className={`px-3 h-8 text-xs transition-colors ${excStatusFilter === s ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                >
                  {s === 'pending' ? `Pending (${excStats.pending})` : s === 'done' ? `Done (${excStats.done})` : 'All'}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={loadExceptions}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          </div>

          {excLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
          ) : (
            <div className="space-y-3">
              {filteredExceptions.length === 0 ? (
                <div className="border rounded-lg py-12 text-center text-muted-foreground text-sm">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                  {excStatusFilter === 'pending' ? 'No pending exception actions — all done!' : 'No exception actions found.'}
                </div>
              ) : filteredExceptions.map(action => (
                <div key={action.id} className={`border rounded-lg p-4 space-y-2 ${
                  action.executed
                    ? 'border-green-200 bg-green-50/20 dark:bg-green-950/10'
                    : action.decision === 'return' || action.decision === 'writeoff'
                      ? 'border-red-200 bg-red-50/10'
                      : 'border-amber-200 bg-amber-50/10'
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{action.siteName}</p>
                        {decisionBadge(action.decision)}
                        {action.executed
                          ? <Badge className="bg-green-100 text-green-700 border-green-300 text-[10px]">✓ Executed</Badge>
                          : <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-[10px]">Pending</Badge>
                        }
                        {action.executed && !action.glPosted && ['return','writeoff','redirect'].includes(action.decision) && (
                          <Badge className="bg-red-100 text-red-700 border-red-300 text-[10px]">GL pending</Badge>
                        )}
                        {action.glPosted && <Badge className="bg-blue-100 text-blue-700 border-blue-300 text-[10px]">✓ GL posted</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {action.enumeratorName} · {action.mmpName} · SDG {fmt(action.advanceAmount)}
                      </p>
                      {action.justification && <p className="text-xs text-muted-foreground italic">"{action.justification}"</p>}
                      {action.executed && (
                        <p className="text-xs text-muted-foreground">
                          Executed {fmtDate(action.executedAt)}
                          {action.approvedByName && ` by ${action.approvedByName}`}
                          {action.recoveryAmount && ` · SDG ${fmt(action.recoveryAmount)} collected`}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {action.receiptUrl && (
                        <a href={action.receiptUrl} target="_blank" rel="noopener noreferrer"
                          className="text-blue-600 text-[10px] flex items-center gap-1 hover:underline">
                          <ExternalLink className="h-3 w-3" /> Receipt
                        </a>
                      )}
                      {!action.executed && (
                        <Button size="sm" className="h-7 text-xs" onClick={() => openExcDialog(action)}>
                          Execute →
                        </Button>
                      )}
                      {/* Roll/Hold actions link to rollover tracker */}
                      {!action.executed && (action.decision === 'roll' || action.decision === 'hold') && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate('/cycle-exceptions/rollover')}>
                          <ExternalLink className="h-3 w-3 mr-1" /> Rollover Tracker
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 4 — RECOVERY & OUTSTANDING
        ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="recovery" className="space-y-4 mt-4">
          <Alert className="border-slate-200 bg-slate-50 dark:bg-slate-900/30">
            <TrendingDown className="h-4 w-4 text-slate-600" />
            <AlertDescription className="text-slate-700 text-sm">
              Advances that have been disbursed but not yet fully recovered through fee payments or cash returns.
              Overdue items (&gt;30 days) are highlighted. Use this view to chase outstanding balances.
            </AlertDescription>
          </Alert>

          {recStats.total > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <Card className="p-3 border-amber-200 bg-amber-50/30">
                <p className="text-xs text-muted-foreground">Total Outstanding</p>
                <p className="text-lg font-bold text-amber-700">SDG {fmt(recStats.totalAmt)}</p>
                <p className="text-xs text-muted-foreground">{recStats.total} advance{recStats.total !== 1 ? 's' : ''}</p>
              </Card>
              <Card className="p-3 border-red-200 bg-red-50/30">
                <p className="text-xs text-muted-foreground">Overdue &gt;30 days</p>
                <p className="text-lg font-bold text-red-700">{recStats.overdue}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground">Current ≤30 days</p>
                <p className="text-lg font-bold">{recStats.total - recStats.overdue}</p>
              </Card>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-8 h-8 text-xs" placeholder="Search enumerator, site, MMP…" value={recSearch} onChange={e => setRecSearch(e.target.value)} />
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={loadRecovery}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          </div>

          {recoveryLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-900">
                    <TableHead className="text-xs">Enumerator</TableHead>
                    <TableHead className="text-xs">Site</TableHead>
                    <TableHead className="text-xs">MMP</TableHead>
                    <TableHead className="text-xs text-right">Disbursed</TableHead>
                    <TableHead className="text-xs text-right">Recovered</TableHead>
                    <TableHead className="text-xs text-right font-semibold">Outstanding</TableHead>
                    <TableHead className="text-xs">Age</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecovery.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                        <CheckCircle2 className="h-6 w-6 mx-auto mb-1 text-green-500" />
                        No outstanding advances — all clear!
                      </TableCell>
                    </TableRow>
                  ) : filteredRecovery.map(row => (
                    <TableRow key={row.id} className={row.daysOutstanding > 30 ? 'bg-red-50/20 dark:bg-red-950/10' : ''}>
                      <TableCell className="text-xs font-medium">{row.enumeratorName}</TableCell>
                      <TableCell className="text-xs">
                        <p>{row.siteName}</p>
                        <p className="text-muted-foreground">{row.state} · {row.hub}</p>
                      </TableCell>
                      <TableCell className="text-xs">{row.mmpName}</TableCell>
                      <TableCell className="text-xs text-right">SDG {fmt(row.disbursedAmount)}</TableCell>
                      <TableCell className="text-xs text-right text-green-600">
                        {row.recoveredAmount > 0 ? `SDG ${fmt(row.recoveredAmount)}` : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-right font-semibold text-amber-700">
                        SDG {fmt(row.outstandingAmount)}
                      </TableCell>
                      <TableCell>{ageBadge(row.daysOutstanding)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => navigate('/down-payment-approval')}>
                          <ExternalLink className="h-3 w-3 mr-1" /> Manage
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ══════════════════════════════════════════════════════════════════════
          DIALOG: Mark Fee Paid
      ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={payDialog.open} onOpenChange={open => !payDialog.saving && setPayDialog(d => ({ ...d, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark {payDialog.rows.length > 1 ? `${payDialog.rows.length} Fees` : 'Fee'} as Paid</DialogTitle>
            <DialogDescription>
              {payDialog.rows.length === 1
                ? `${payDialog.rows[0]?.siteName} — ${payDialog.rows[0]?.enumeratorName}`
                : `${payDialog.rows.length} sites selected`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Summary */}
            <div className="bg-muted rounded-lg p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Fees</span>
                <span>SDG {fmt(payDialog.rows.reduce((s, r) => s + r.totalFee, 0))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Advance Deductions</span>
                <span className="text-amber-600">− SDG {fmt(payDialog.rows.reduce((s, r) => s + r.advancePaid, 0))}</span>
              </div>
              <Separator className="my-1" />
              <div className="flex justify-between font-semibold">
                <span>Net Payable</span>
                <span className="text-green-700">SDG {fmt(payDialog.rows.reduce((s, r) => s + r.netPayable, 0))}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs">Payment Method *</Label>
                <Select value={payDialog.method} onValueChange={v => setPayDialog(d => ({ ...d, method: v }))}>
                  <SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Payment Date *</Label>
                <Input type="date" className="h-9 text-sm mt-1" value={payDialog.date}
                  onChange={e => setPayDialog(d => ({ ...d, date: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Receipt / Proof of Payment *</Label>
                <div className="mt-1 border-2 border-dashed rounded-lg p-3 text-center hover:bg-muted/50 transition-colors cursor-pointer relative">
                  <input type="file" accept="image/*,.pdf" className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={e => e.target.files?.[0] && handleFeeReceiptUpload(e.target.files[0])} />
                  {payDialog.uploading ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <RefreshCw className="h-4 w-4 animate-spin" /> Uploading…
                    </div>
                  ) : payDialog.receiptUrl ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      <a href={payDialog.receiptUrl} target="_blank" rel="noopener noreferrer" className="hover:underline" onClick={e => e.stopPropagation()}>
                        Receipt uploaded — click to view
                      </a>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-muted-foreground">
                      <Upload className="h-5 w-5" />
                      <span className="text-xs">Click to upload (JPG, PNG, PDF)</span>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-xs">Notes (optional)</Label>
                <Textarea className="mt-1 text-sm" rows={2} placeholder="Any additional notes…"
                  value={payDialog.notes} onChange={e => setPayDialog(d => ({ ...d, notes: e.target.value }))} />
              </div>
            </div>

            <Alert className="border-blue-200 bg-blue-50 py-2">
              <Info className="h-3.5 w-3.5 text-blue-600" />
              <AlertDescription className="text-blue-700 text-xs">
                A GL entry (DR 5200 / CR {payDialog.method === 'Bank Transfer' ? '1020 Bank' : '1010 Cash'}) will post automatically on save.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog(d => ({ ...d, open: false }))} disabled={payDialog.saving}>
              Cancel
            </Button>
            <Button onClick={submitFeePay} disabled={payDialog.saving || payDialog.uploading || !payDialog.receiptUrl}
              className="bg-green-600 hover:bg-green-700 text-white">
              {payDialog.saving ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…</> : '✓ Mark Paid'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════════
          DIALOG: Execute Exception Action
      ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={excDialog.open} onOpenChange={open => !excDialog.saving && setExcDialog(d => ({ ...d, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Execute: {excDialog.action && decisionBadge(excDialog.action.decision)}
            </DialogTitle>
            <DialogDescription>
              {excDialog.action?.siteName} — {excDialog.action?.enumeratorName}
              <br />SDG {fmt(excDialog.action?.advanceAmount)} · {excDialog.action?.mmpName}
            </DialogDescription>
          </DialogHeader>

          {excDialog.action && (
            <div className="space-y-4 py-2">
              {/* Return-specific fields */}
              {excDialog.action.decision === 'return' && (
                <>
                  <div>
                    <Label className="text-xs">Amount Collected (SDG) *</Label>
                    <Input type="number" className="h-9 mt-1 text-sm"
                      value={excDialog.recoveryAmount}
                      onChange={e => setExcDialog(d => ({ ...d, recoveryAmount: e.target.value }))}
                      placeholder={`Max: ${excDialog.action.advanceAmount}`} />
                  </div>
                  <div>
                    <Label className="text-xs">Date Collected *</Label>
                    <Input type="date" className="h-9 mt-1 text-sm"
                      value={excDialog.recoveryDate}
                      onChange={e => setExcDialog(d => ({ ...d, recoveryDate: e.target.value }))} />
                  </div>
                </>
              )}

              {/* Redirect-specific fields */}
              {excDialog.action.decision === 'redirect' && (
                <div>
                  <Label className="text-xs">Redirect to Hub / Project *</Label>
                  <Input className="h-9 mt-1 text-sm"
                    value={excDialog.redirectHub}
                    onChange={e => setExcDialog(d => ({ ...d, redirectHub: e.target.value }))}
                    placeholder="Hub or project name…" />
                </div>
              )}

              {/* Receipt upload (required for return, writeoff, redirect) */}
              {['return', 'writeoff', 'redirect'].includes(excDialog.action.decision) && (
                <div>
                  <Label className="text-xs">
                    {excDialog.action.decision === 'writeoff' ? 'Write-Off Approval Document *' :
                     excDialog.action.decision === 'return'   ? 'Collection Receipt *' :
                     'Supporting Document *'}
                  </Label>
                  <div className="mt-1 border-2 border-dashed rounded-lg p-3 text-center hover:bg-muted/50 transition-colors cursor-pointer relative">
                    <input type="file" accept="image/*,.pdf" className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={e => e.target.files?.[0] && handleExcReceiptUpload(e.target.files[0])} />
                    {excDialog.uploading ? (
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <RefreshCw className="h-4 w-4 animate-spin" /> Uploading…
                      </div>
                    ) : excDialog.receiptUrl ? (
                      <div className="flex items-center justify-center gap-2 text-sm text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        <a href={excDialog.receiptUrl} target="_blank" rel="noopener noreferrer" className="hover:underline" onClick={e => e.stopPropagation()}>
                          Document uploaded — click to view
                        </a>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-muted-foreground">
                        <Upload className="h-5 w-5" />
                        <span className="text-xs">Click to upload (JPG, PNG, PDF)</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <Label className="text-xs">Execution Notes</Label>
                <Textarea className="mt-1 text-sm" rows={2} placeholder="Optional notes…"
                  value={excDialog.notes} onChange={e => setExcDialog(d => ({ ...d, notes: e.target.value }))} />
              </div>

              {/* GL preview */}
              {['return', 'writeoff', 'redirect'].includes(excDialog.action.decision) && (
                <Alert className="border-blue-200 bg-blue-50 py-2">
                  <Info className="h-3.5 w-3.5 text-blue-600" />
                  <AlertDescription className="text-blue-700 text-xs">
                    GL entry on execution:{' '}
                    {excDialog.action.decision === 'return'   ? 'DR 1010 Cash / CR 1510 Travel Advances' :
                     excDialog.action.decision === 'writeoff' ? 'DR 5900 Bad Debt / CR 1510 Travel Advances' :
                     'DR 5200 Enumerator Fees / CR 1510 Travel Advances'}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setExcDialog(d => ({ ...d, open: false }))} disabled={excDialog.saving}>Cancel</Button>
            <Button onClick={submitException}
              disabled={excDialog.saving || excDialog.uploading ||
                (['return','writeoff','redirect'].includes(excDialog.action?.decision ?? '') && !excDialog.receiptUrl)}
              className="bg-primary">
              {excDialog.saving ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Executing…</> : 'Confirm & Execute'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
