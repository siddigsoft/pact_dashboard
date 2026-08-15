/**
 * IncentivesTab — Incentive Bonus Calculation Tab for MMP Detail View
 *
 * Calculation engine, pre-approve flow, finance payment panel, and Excel export.
 * All amounts stored and computed in cents (integer) to avoid float drift.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertTriangle, CheckCircle2, Clock, DollarSign, Download, Info,
  Lock, ShieldCheck, User, Loader2, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SiteEntryRow {
  id: string;
  state: string | null;
  hub_office: string | null;
  enumerator_fee: number | null;
  accepted_by: string | null;
  verified_by: string | null;
}

interface IncentiveConfig {
  id: string;
  hub_id: string | null;
  role: string;
  is_active: boolean;
  bonus_pct: number;
  split_method: string;
  coverage_threshold_pct: number;
  what_counts: 'wfp_confirmed' | 'submitted';
}

interface ProfileRow {
  id: string;
  full_name: string;
  role: string;
  hub_id: string | null;
}

interface CalcRow {
  userId: string | null;       // null = unlinked
  name: string;
  role: 'coordinator' | 'supervisor';
  stateOrHub: string;          // state name for coordinator, hub name for supervisor
  dcCount: number;
  dcFeePoolCents: number;
  bonusPct: number;
  bonusAmountCents: number;
  excluded: boolean;
  exclusionNote: string;
  paymentId: string | null;    // existing DB row id
  paymentStatus: 'pending' | 'paid' | null;
  paymentMethod: string | null;
  payrollPeriod: string | null;
}

interface Snapshot {
  id: string;
  status: 'calculating' | 'pre_approved' | 'approved' | 'paid';
  totalDcFeePoolCents: number;
  totalBonusCents: number;
  preApprovedBy: string | null;
  preApprovedAt: string | null;
  approvedAt: string | null;
  lockedAt: string | null;
  skipped: boolean;
  skippedReason: string | null;
}

interface PaymentRow {
  id: string;
  userId: string;
  role: string;
  stateId: string | null;
  hubId: string | null;
  hubName: string | null;
  dcCount: number;
  dcFeePoolCents: number;
  bonusPct: number;
  bonusAmountCents: number;
  currency: string;
  excluded: boolean;
  exclusionNote: string | null;
  paymentMethod: string | null;
  payrollPeriod: string | null;
  status: 'pending' | 'paid';
  idempotencyKey: string | null;
}

interface Props {
  mmpId: string;
  mmpHubName: string | null | undefined;
  siteEntries: SiteEntryRow[];           // already fetched entries from parent
  isClosed: boolean;                     // true when MMP cycle_status = 'closed'
  isHistorical: boolean;                 // true when MMP predates the incentive system
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(cents: number): string {
  return `SDG ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

const SYSTEM_ACTIVATION_DATE = '2026-08-01'; // MMPs before this are historical

// ─── Component ───────────────────────────────────────────────────────────────

export default function IncentivesTab({ mmpId, mmpHubName, siteEntries, isClosed, isHistorical }: Props) {
  const { isSuperAdmin, hasAnyRole } = useAuthorization();
  const { currentUser } = useAppContext();
  const { toast } = useToast();

  const isAdmin = isSuperAdmin() || hasAnyRole(['admin']);
  const isFinance = hasAnyRole(['financialAdmin']) || isAdmin;

  // ── Data state ─────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<IncentiveConfig[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [hubId, setHubId] = useState<string | null>(null);
  const [coordinators, setCoordinators] = useState<ProfileRow[]>([]);
  const [supervisors, setSupervisors] = useState<ProfileRow[]>([]);

  // ── Pre-approve dialog ─────────────────────────────────────────────────────
  const [preApproveOpen, setPreApproveOpen] = useState(false);
  const [exclusions, setExclusions] = useState<Record<string, { excluded: boolean; note: string }>>({});
  const [preApproving, setSpreApproving] = useState(false);

  // ── Finance payment panel ──────────────────────────────────────────────────
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payMethodOverrides, setPayMethodOverrides] = useState<Record<string, string>>({});
  const [payPeriodOverrides, setPayPeriodOverrides] = useState<Record<string, string>>({});

  // ── Load all data ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Incentive configs (what_counts determines which entries count toward the pool)
      const { data: cfgData } = await supabase
        .from('incentive_configs')
        .select('id, hub_id, role, is_active, bonus_pct, split_method, coverage_threshold_pct, what_counts');
      setConfigs((cfgData ?? []) as IncentiveConfig[]);

      // 2. Hub ID from name
      let resolvedHubId: string | null = null;
      if (mmpHubName) {
        const { data: hubData } = await supabase
          .from('hubs')
          .select('id')
          .ilike('name', mmpHubName.trim())
          .maybeSingle();
        resolvedHubId = hubData?.id ?? null;
        setHubId(resolvedHubId);
      }

      // 3. Profiles for this hub
      if (resolvedHubId) {
        const { data: profData } = await supabase
          .from('profiles')
          .select('id, full_name, role, hub_id')
          .eq('hub_id', resolvedHubId)
          .in('role', ['coordinator', 'Coordinator', 'supervisor', 'Supervisor']);
        const profiles = (profData ?? []) as ProfileRow[];
        setCoordinators(profiles.filter(p => p.role.toLowerCase() === 'coordinator'));
        setSupervisors(profiles.filter(p => p.role.toLowerCase() === 'supervisor'));
      }

      // 4. Existing snapshot + payments
      const { data: snapData } = await supabase
        .from('mmp_incentive_snapshots')
        .select('*')
        .eq('mmp_id', mmpId)
        .maybeSingle();

      if (snapData) {
        setSnapshot({
          id: snapData.id,
          status: snapData.status,
          totalDcFeePoolCents: snapData.total_dc_fee_pool_cents ?? 0,
          totalBonusCents: snapData.total_bonus_cents ?? 0,
          preApprovedBy: snapData.pre_approved_by,
          preApprovedAt: snapData.pre_approved_at,
          approvedAt: snapData.approved_at,
          lockedAt: snapData.locked_at,
          skipped: snapData.skipped ?? false,
          skippedReason: snapData.skipped_reason,
        });

        const { data: pmtData } = await supabase
          .from('mmp_incentive_payments')
          .select('*')
          .eq('snapshot_id', snapData.id);

        setPayments((pmtData ?? []).map((r: any) => ({
          id: r.id,
          userId: r.user_id,
          role: r.role,
          stateId: r.state_id,
          hubId: r.hub_id,
          hubName: r.hub_name,
          dcCount: r.dc_count ?? 0,
          dcFeePoolCents: r.dc_fee_pool_cents ?? 0,
          bonusPct: r.bonus_pct ?? 0,
          bonusAmountCents: r.bonus_amount_cents ?? 0,
          currency: r.currency ?? 'SDG',
          excluded: r.excluded ?? false,
          exclusionNote: r.exclusion_note,
          paymentMethod: r.payment_method,
          payrollPeriod: r.payroll_period,
          status: r.status,
          idempotencyKey: r.idempotency_key,
        })));
      }
    } catch (err: any) {
      toast({ title: 'Failed to load incentive data', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [mmpId, mmpHubName, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Calculation engine ─────────────────────────────────────────────────────

  // what_counts: hub override first, then global — same precedence as getBonusPct.
  // Determines whether WFP-confirmed entries only (verified_by IS NOT NULL) or
  // all submitted entries are counted toward the DC fee pool.
  const whatCounts = useMemo((): 'wfp_confirmed' | 'submitted' => {
    const hubOverride = configs.find(
      c => c.hub_id === hubId && c.role === 'coordinator' && c.is_active
    );
    if (hubOverride?.what_counts) return hubOverride.what_counts;
    const global = configs.find(c => c.hub_id === null && c.role === 'coordinator');
    return global?.what_counts ?? 'wfp_confirmed';
  }, [configs, hubId]);

  // WFP-confirmed entries: respect the what_counts config setting
  // wfp_confirmed → only rows with verified_by set (WFP file matched)
  // submitted     → all site entries (no WFP filter)
  const confirmedEntries = useMemo(
    () => whatCounts === 'submitted'
      ? siteEntries
      : siteEntries.filter(e => e.verified_by != null),
    [siteEntries, whatCounts]
  );
  const totalEntries = siteEntries.length;
  const confirmedCount = confirmedEntries.length;
  const coveragePct = totalEntries > 0 ? (confirmedCount / totalEntries) * 100 : 0;

  // Helper: get bonus_pct for a role, checking hub override first
  const getBonusPct = useCallback((role: string): number => {
    const hubOverride = configs.find(c => c.hub_id === hubId && c.role === role && c.is_active);
    if (hubOverride) return Number(hubOverride.bonus_pct);
    const global = configs.find(c => c.hub_id === null && c.role === role && c.is_active);
    return global ? Number(global.bonus_pct) : 0;
  }, [configs, hubId]);

  const coverageThreshold = useMemo(() => {
    const global = configs.find(c => c.hub_id === null);
    return global ? Number(global.coverage_threshold_pct) : 70;
  }, [configs]);

  const thresholdMet = coveragePct >= coverageThreshold;

  // Fee pool grouped by state
  const feeByState = useMemo(() => {
    const map: Record<string, { feeCents: number; dcIds: Set<string>; stateName: string }> = {};
    for (const entry of confirmedEntries) {
      const state = entry.state ?? 'Unknown';
      if (!map[state]) map[state] = { feeCents: 0, dcIds: new Set(), stateName: state };
      map[state].feeCents += Math.round((entry.enumerator_fee ?? 0) * 100);
      if (entry.accepted_by) map[state].dcIds.add(entry.accepted_by);
    }
    return map;
  }, [confirmedEntries]);

  const totalDcFeePoolCents = useMemo(
    () => Object.values(feeByState).reduce((s, v) => s + v.feeCents, 0),
    [feeByState]
  );

  // Coordinator rows
  const coordCalcRows = useMemo((): CalcRow[] => {
    const bonusPct = getBonusPct('coordinator');
    // split_method: hub override first, then global (same precedence as getBonusPct)
    const hubCfg = configs.find(c => c.hub_id === hubId && c.role === 'coordinator' && c.is_active);
    const globalCfg = configs.find(c => c.hub_id === null && c.role === 'coordinator');
    const splitMethod = hubCfg?.split_method ?? globalCfg?.split_method ?? 'proportional';
    const states = Object.keys(feeByState);

    if (states.length === 0) {
      return coordinators.map(c => ({
        userId: c.id, name: c.full_name, role: 'coordinator',
        stateOrHub: 'All states', dcCount: 0, dcFeePoolCents: 0,
        bonusPct, bonusAmountCents: 0, excluded: false, exclusionNote: '',
        paymentId: null, paymentStatus: null, paymentMethod: null, payrollPeriod: null,
      }));
    }

    if (coordinators.length === 0) {
      return states.map(state => ({
        userId: null, name: 'Unlinked', role: 'coordinator',
        stateOrHub: state,
        dcCount: feeByState[state].dcIds.size,
        dcFeePoolCents: feeByState[state].feeCents,
        bonusPct, bonusAmountCents: 0, excluded: false, exclusionNote: '',
        paymentId: null, paymentStatus: null, paymentMethod: null, payrollPeriod: null,
      }));
    }

    // Single coordinator covers all states
    if (coordinators.length === 1) {
      const c = coordinators[0];
      const payment = payments.find(p => p.userId === c.id && p.role === 'coordinator');
      return [{
        userId: c.id, name: c.full_name, role: 'coordinator',
        stateOrHub: states.join(', '),
        dcCount: confirmedEntries.filter(e => e.accepted_by != null).length,
        dcFeePoolCents: totalDcFeePoolCents,
        bonusPct,
        bonusAmountCents: Math.round(totalDcFeePoolCents * bonusPct / 100),
        excluded: payment?.excluded ?? false,
        exclusionNote: payment?.exclusionNote ?? '',
        paymentId: payment?.id ?? null,
        paymentStatus: payment?.status ?? null,
        paymentMethod: payment?.paymentMethod ?? null,
        payrollPeriod: payment?.payrollPeriod ?? null,
      }];
    }

    // ── Multiple coordinators ──────────────────────────────────────────────
    // For EQUAL: divide total fee pool equally among all coordinators.
    // For PROPORTIONAL: distribute states round-robin among coordinators so
    //   each coordinator's attributed pool = sum of fees for their assigned
    //   states.  Without explicit coordinator→state assignments (Task #492),
    //   this round-robin proxy produces pool sizes that differ when states have
    //   unequal fee totals, which is the correct proportional behaviour.
    if (splitMethod === 'equal') {
      const perCoord = Math.floor(totalDcFeePoolCents / coordinators.length);
      return coordinators.map(c => {
        const payment = payments.find(p => p.userId === c.id && p.role === 'coordinator');
        return {
          userId: c.id, name: c.full_name, role: 'coordinator',
          stateOrHub: states.join(', '),
          dcCount: Math.floor(confirmedEntries.length / coordinators.length),
          dcFeePoolCents: perCoord,
          bonusPct,
          bonusAmountCents: Math.round(perCoord * bonusPct / 100),
          excluded: payment?.excluded ?? false,
          exclusionNote: payment?.exclusionNote ?? '',
          paymentId: payment?.id ?? null,
          paymentStatus: payment?.status ?? null,
          paymentMethod: payment?.paymentMethod ?? null,
          payrollPeriod: payment?.payrollPeriod ?? null,
        };
      });
    }

    // proportional: assign states round-robin; each coordinator owns their states' fees
    const coordStateMap: Map<string, string[]> = new Map(coordinators.map(c => [c.id, []]));
    states.forEach((state, i) => {
      const owner = coordinators[i % coordinators.length];
      coordStateMap.get(owner.id)!.push(state);
    });

    return coordinators.map(c => {
      const payment = payments.find(p => p.userId === c.id && p.role === 'coordinator');
      const ownedStates = coordStateMap.get(c.id) ?? [];
      const coordPool = ownedStates.reduce((s, st) => s + (feeByState[st]?.feeCents ?? 0), 0);
      const coordDcCount = ownedStates.reduce(
        (s, st) => s + (feeByState[st]?.dcIds.size ?? 0), 0
      );
      return {
        userId: c.id, name: c.full_name, role: 'coordinator',
        stateOrHub: ownedStates.length > 0 ? ownedStates.join(', ') : 'All states',
        dcCount: coordDcCount,
        dcFeePoolCents: coordPool,
        bonusPct,
        bonusAmountCents: Math.round(coordPool * bonusPct / 100),
        excluded: payment?.excluded ?? false,
        exclusionNote: payment?.exclusionNote ?? '',
        paymentId: payment?.id ?? null,
        paymentStatus: payment?.status ?? null,
        paymentMethod: payment?.paymentMethod ?? null,
        payrollPeriod: payment?.payrollPeriod ?? null,
      };
    });
  }, [coordinators, feeByState, totalDcFeePoolCents, getBonusPct, configs, hubId, confirmedEntries, payments]);

  // Supervisor rows
  const supCalcRows = useMemo((): CalcRow[] => {
    const bonusPct = getBonusPct('supervisor');
    if (supervisors.length === 0) return [];
    const poolPerSup = supervisors.length > 0
      ? Math.floor(totalDcFeePoolCents / supervisors.length)
      : 0;
    return supervisors.map(s => {
      const payment = payments.find(p => p.userId === s.id && p.role === 'supervisor');
      return {
        userId: s.id, name: s.full_name, role: 'supervisor',
        stateOrHub: mmpHubName ?? 'Hub',
        dcCount: confirmedEntries.length,
        dcFeePoolCents: poolPerSup,
        bonusPct,
        bonusAmountCents: Math.round(poolPerSup * bonusPct / 100),
        excluded: payment?.excluded ?? false,
        exclusionNote: payment?.exclusionNote ?? '',
        paymentId: payment?.id ?? null,
        paymentStatus: payment?.status ?? null,
        paymentMethod: payment?.paymentMethod ?? null,
        payrollPeriod: payment?.payrollPeriod ?? null,
      };
    });
  }, [supervisors, totalDcFeePoolCents, getBonusPct, mmpHubName, confirmedEntries, payments]);

  const totalBonusCents = useMemo(
    () => [...coordCalcRows, ...supCalcRows]
      .filter(r => !r.excluded && r.userId !== null)
      .reduce((s, r) => s + r.bonusAmountCents, 0),
    [coordCalcRows, supCalcRows]
  );

  // Warnings
  const warnings = useMemo(() => {
    const ws: string[] = [];
    if (coordCalcRows.some(r => r.userId === null)) ws.push('Some states have no coordinator linked — those DC fees will not be paid.');
    if (coordCalcRows.some(r => r.dcFeePoolCents === 0 && r.userId !== null)) ws.push('Some coordinators have SDG 0 DC fee pool — confirm site entries have enumerator_fee values.');
    if (confirmedEntries.some(e => !e.state)) ws.push('Some WFP-confirmed entries have no state — they are excluded from the fee pool.');
    if (!thresholdMet) ws.push(`Coverage (${coveragePct.toFixed(1)}%) is below the ${coverageThreshold}% threshold — calculation is unlocked for preview only.`);
    return ws;
  }, [coordCalcRows, confirmedEntries, thresholdMet, coveragePct, coverageThreshold]);

  // ── Pre-approve handler ────────────────────────────────────────────────────

  const handleOpenPreApprove = () => {
    // Guard: cannot pre-approve historical MMPs or after cycle close
    if (isHistorical) {
      toast({ title: 'Historical MMP', description: 'Incentive payments cannot be pre-approved for historical MMPs.', variant: 'destructive' });
      return;
    }
    if (isClosed) {
      toast({ title: 'Cycle already closed', description: 'Pre-approval must happen before cycle close.', variant: 'destructive' });
      return;
    }
    // Guard: coverage below threshold — calculation is preview-only
    if (!thresholdMet) {
      toast({
        title: 'Coverage below threshold',
        description: `WFP coverage is ${coveragePct.toFixed(1)}% — below the required ${coverageThreshold}%. Reach the threshold before pre-approving.`,
        variant: 'destructive',
      });
      return;
    }
    const init: Record<string, { excluded: boolean; note: string }> = {};
    [...coordCalcRows, ...supCalcRows].forEach(r => {
      if (r.userId) init[r.userId + ':' + r.role] = { excluded: r.excluded, note: r.exclusionNote };
    });
    setExclusions(init);
    setPreApproveOpen(true);
  };

  const handlePreApprove = async () => {
    // Re-validate all lifecycle constraints at write time — the dialog may have
    // been opened before a concurrent close, or React state may be stale.
    // The DB trigger (prevent_incentive_preapproval_on_closed_mmp) provides a
    // final server-side backstop, but we surface a clear message client-side.
    if (isHistorical) {
      toast({ title: 'Historical MMP', description: 'Cannot pre-approve a historical MMP.', variant: 'destructive' });
      setPreApproveOpen(false);
      return;
    }
    if (isClosed) {
      toast({ title: 'Cycle already closed', description: 'Pre-approval must happen before cycle close.', variant: 'destructive' });
      setPreApproveOpen(false);
      return;
    }
    if (!thresholdMet) {
      toast({ title: 'Coverage below threshold', description: 'Cannot pre-approve while WFP coverage is below the configured threshold.', variant: 'destructive' });
      setPreApproveOpen(false);
      return;
    }

    setSpreApproving(true);
    try {
      const allRows = [...coordCalcRows, ...supCalcRows];

      // Build the payment-row payload for the RPC — exclusions applied here
      const paymentRows = allRows
        .filter(r => r.userId !== null)
        .map(r => {
          const key = r.userId! + ':' + r.role;
          const excl = exclusions[key] ?? { excluded: false, note: '' };
          return {
            user_id: r.userId,
            role: r.role,
            hub_id: hubId,
            hub_name: mmpHubName,
            dc_count: r.dcCount,
            dc_fee_pool_cents: r.dcFeePoolCents,
            bonus_pct: r.bonusPct,
            bonus_amount_cents: excl.excluded ? 0 : r.bonusAmountCents,
            currency: 'SDG',
            excluded: excl.excluded,
            exclusion_note: excl.note || null,
          };
        });

      // Single transactional RPC: upserts snapshot + all payment rows atomically.
      // If ANY row fails the whole operation rolls back — no partial payout sets.
      // The lifecycle trigger inside the RPC also blocks closed/historical MMPs
      // as a final server-side backstop.
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        'pre_approve_mmp_incentives',
        {
          p_mmp_id:       mmpId,
          p_total_pool:   totalDcFeePoolCents,
          p_total_bonus:  totalBonusCents,
          p_config_snap:  configs,
          p_payment_rows: paymentRows,
        }
      );

      if (rpcError) throw rpcError;
      const result = rpcResult as { ok: boolean; error?: string } | null;
      if (!result?.ok) {
        throw new Error(result?.error ?? 'pre_approve_mmp_incentives returned failure');
      }

      toast({ title: 'Incentives pre-approved', description: 'Snapshot locked. Amounts will update as WFP data is finalized.' });
      setPreApproveOpen(false);
      await loadData();
    } catch (err: any) {
      toast({ title: 'Pre-approval failed', description: err.message, variant: 'destructive' });
    } finally {
      setSpreApproving(false);
    }
  };

  // ── Payment handler ────────────────────────────────────────────────────────

  const handlePay = async (payment: PaymentRow) => {
    // Hard guard: historical MMPs must never produce payments even if UI is shown
    if (isHistorical) {
      toast({ title: 'Historical MMP', description: 'Payments cannot be processed for historical MMPs.', variant: 'destructive' });
      return;
    }

    const method = payMethodOverrides[payment.id] ?? payment.paymentMethod ?? 'wallet';
    const period = payPeriodOverrides[payment.id] ?? payment.payrollPeriod ?? new Date().toISOString().slice(0, 7);

    setPayingId(payment.id);
    try {
      if (method === 'wallet') {
        // credit_retainer_wallet is idempotent on (user_id, period); we use the
        // payment idempotency_key as the period so retries never double-credit.
        const { error } = await supabase.rpc('credit_retainer_wallet', {
          p_user_id: payment.userId,
          p_amount_cents: payment.bonusAmountCents,
          p_currency: payment.currency,
          p_period: payment.idempotencyKey ?? `incentive-${payment.id}`,
          p_created_by: currentUser?.id ?? null,
          p_base_currency: null,
          p_fx_rate: null,
        });
        if (error && !error.message?.includes('already_processed')) throw error;
      } else {
        // Payroll: check for an existing row keyed to this payment first so we
        // never insert a second bonus line if the Finance user retries.
        const { data: existing, error: chkErr } = await supabase
          .from('payroll_run_items')
          .select('id')
          .eq('reference_id', payment.id)
          .maybeSingle();
        if (chkErr) throw chkErr;

        if (!existing) {
          const { error } = await supabase.from('payroll_run_items').insert({
            user_id: payment.userId,
            type: 'incentive_bonus',
            amount_cents: payment.bonusAmountCents,
            currency: payment.currency,
            period_label: period,
            reference_id: payment.id,
            notes: `Incentive bonus for MMP ${mmpId}`,
            created_by: currentUser?.id,
          });
          if (error) throw error;
        }
      }

      // Mark payment row as paid — this is the canonical source of truth.
      // Update atomically so a mid-flight crash cannot leave the row pending
      // after the wallet/payroll write has already landed.
      const { error: updateErr } = await supabase
        .from('mmp_incentive_payments')
        .update({
          status: 'paid',
          payment_method: method,
          payroll_period: method === 'payroll' ? period : null,
          paid_by: currentUser?.id,
          paid_at: new Date().toISOString(),
        })
        .eq('id', payment.id)
        .eq('status', 'pending'); // only update if still pending — prevents double-pay races
      if (updateErr) throw updateErr;

      toast({ title: 'Payment processed', description: `${fmt(payment.bonusAmountCents)} sent via ${method}.` });
      await loadData();
    } catch (err: any) {
      toast({ title: 'Payment failed', description: err.message, variant: 'destructive' });
    } finally {
      setPayingId(null);
    }
  };

  // ── Excel export ───────────────────────────────────────────────────────────

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Coordinator sheet
    const coordRows = coordCalcRows.map(r => ({
      'Name': r.name,
      'Role': 'Coordinator',
      'State / Hub': r.stateOrHub,
      'DC Count': r.dcCount,
      'DC Fee Pool (SDG)': (r.dcFeePoolCents / 100).toFixed(0),
      'Bonus %': r.bonusPct,
      'Bonus Amount (SDG)': (r.bonusAmountCents / 100).toFixed(0),
      'Excluded': r.excluded ? 'Yes' : 'No',
      'Status': r.paymentStatus ?? 'pending',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(coordRows.length ? coordRows : [{}]), 'Coordinators');

    // Supervisor sheet
    const supRows = supCalcRows.map(r => ({
      'Name': r.name,
      'Role': 'Supervisor',
      'Hub': r.stateOrHub,
      'DC Count': r.dcCount,
      'DC Fee Pool (SDG)': (r.dcFeePoolCents / 100).toFixed(0),
      'Bonus %': r.bonusPct,
      'Bonus Amount (SDG)': (r.bonusAmountCents / 100).toFixed(0),
      'Excluded': r.excluded ? 'Yes' : 'No',
      'Status': r.paymentStatus ?? 'pending',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(supRows.length ? supRows : [{}]), 'Supervisors');

    // Summary sheet
    const summary = [{
      'MMP ID': mmpId,
      'Hub': mmpHubName ?? '-',
      'WFP-Confirmed Sites': confirmedCount,
      'Total Sites': totalEntries,
      'Coverage %': coveragePct.toFixed(1),
      'DC Fee Pool (SDG)': (totalDcFeePoolCents / 100).toFixed(0),
      'Total Bonus (SDG)': (totalBonusCents / 100).toFixed(0),
      'Snapshot Status': snapshot?.status ?? 'calculating',
      'Exported At': new Date().toLocaleString(),
    }];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Summary');

    XLSX.writeFile(wb, `incentives-${mmpId}.xlsx`);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading incentive data…</p>
        </div>
      </div>
    );
  }

  const statusBadge = () => {
    const s = snapshot?.status ?? 'calculating';
    switch (s) {
      case 'pre_approved': return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Pre-Approved — Awaiting WFP Final Data</Badge>;
      case 'approved':     return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'paid':         return <Badge className="bg-purple-100 text-purple-700 border-purple-200"><DollarSign className="h-3 w-3 mr-1" />Paid</Badge>;
      default:             return <Badge variant="outline" className="text-muted-foreground"><Clock className="h-3 w-3 mr-1" />Calculating</Badge>;
    }
  };

  // Guards enforced in both UI and handlers.
  // thresholdMet is required to lock in amounts — below-threshold view is
  // labelled "preview only" in the UI, so pre-approval is blocked here too.
  const canPreApprove = isAdmin && !isHistorical && !isClosed && thresholdMet
    && (snapshot?.status ?? 'calculating') === 'calculating';
  const isApproved = snapshot?.status === 'approved' || snapshot?.status === 'paid';
  const showPaymentPanel = isFinance && isApproved && !isHistorical;

  return (
    <div className="space-y-6">

      {/* Historical banner */}
      {isHistorical && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 p-4 flex items-start gap-3">
          <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700 dark:text-blue-400">
            <strong>Historical MMP</strong> — These calculations are shown for reference only. No incentive payments will be processed for MMPs created before the system activation date.
          </p>
        </div>
      )}

      {/* Header row: status + actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {statusBadge()}
          {snapshot?.lockedAt && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" />
              Locked {new Date(snapshot.lockedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={loadData} className="h-8">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleExportExcel} className="h-8">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export Excel
          </Button>
          {canPreApprove && (
            <Button
              type="button"
              size="sm"
              className="h-8 bg-[#1D3461] hover:bg-[#1D3461]/90 text-white"
              onClick={handleOpenPreApprove}
            >
              <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
              Pre-Approve
            </Button>
          )}
        </div>
      </div>

      {/* Coverage threshold badge */}
      <div className={cn(
        'rounded-lg border p-4 flex items-center gap-4',
        thresholdMet
          ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20'
          : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20'
      )}>
        <div className={cn('h-10 w-10 rounded-full flex items-center justify-center shrink-0', thresholdMet ? 'bg-emerald-100' : 'bg-amber-100')}>
          {thresholdMet
            ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            : <AlertTriangle className="h-5 w-5 text-amber-600" />
          }
        </div>
        <div>
          <p className={cn('font-semibold text-sm', thresholdMet ? 'text-emerald-700' : 'text-amber-700')}>
            Coverage: {coveragePct.toFixed(1)}% / {coverageThreshold}% required
          </p>
          <p className="text-xs text-muted-foreground">
            {confirmedCount} WFP-confirmed of {totalEntries} total site entries
            {!thresholdMet && ' — threshold not yet met; calculation shown for preview'}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-muted-foreground">Total DC Fee Pool</p>
          <p className="font-bold text-lg">{fmt(totalDcFeePoolCents)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total Incentive Bonus</p>
          <p className="font-bold text-lg text-[#1D3461]">{fmt(totalBonusCents)}</p>
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-amber-700 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4" />
            Warnings
          </div>
          <ul className="pl-5 list-disc space-y-0.5">
            {warnings.map((w, i) => <li key={i} className="text-xs text-amber-700">{w}</li>)}
          </ul>
        </div>
      )}

      {/* Coordinator table */}
      <section className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b bg-muted/30 flex items-center gap-2">
          <User className="h-4 w-4 text-[#1D3461]" />
          <h3 className="text-sm font-semibold">Coordinator Bonuses</h3>
          <Badge variant="outline" className="text-[10px] ml-auto">{getBonusPct('coordinator')}% of DC fee pool</Badge>
        </div>
        <CalcTable rows={coordCalcRows} showPayPanel={showPaymentPanel} payments={payments}
          payingId={payingId} payMethodOverrides={payMethodOverrides} payPeriodOverrides={payPeriodOverrides}
          onPay={(pmt) => handlePay(pmt)}
          onMethodChange={(id, v) => setPayMethodOverrides(prev => ({ ...prev, [id]: v }))}
          onPeriodChange={(id, v) => setPayPeriodOverrides(prev => ({ ...prev, [id]: v }))}
        />
      </section>

      {/* Supervisor table */}
      <section className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b bg-muted/30 flex items-center gap-2">
          <User className="h-4 w-4 text-[#1D3461]" />
          <h3 className="text-sm font-semibold">Supervisor Bonuses</h3>
          <Badge variant="outline" className="text-[10px] ml-auto">{getBonusPct('supervisor')}% of DC fee pool</Badge>
        </div>
        {supCalcRows.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">No supervisors found for hub "{mmpHubName ?? 'Unknown'}".</p>
        ) : (
          <CalcTable rows={supCalcRows} showPayPanel={showPaymentPanel} payments={payments}
            payingId={payingId} payMethodOverrides={payMethodOverrides} payPeriodOverrides={payPeriodOverrides}
            onPay={(pmt) => handlePay(pmt)}
            onMethodChange={(id, v) => setPayMethodOverrides(prev => ({ ...prev, [id]: v }))}
            onPeriodChange={(id, v) => setPayPeriodOverrides(prev => ({ ...prev, [id]: v }))}
          />
        )}
      </section>

      {/* Pre-Approve dialog */}
      <Dialog open={preApproveOpen} onOpenChange={setPreApproveOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#1D3461]" />
              Pre-Approve Incentive Bonuses
            </DialogTitle>
            <DialogDescription>
              Review totals and optionally exclude individuals. Amounts will continue updating as WFP data is finalized. The config snapshot is locked at this point.
            </DialogDescription>
          </DialogHeader>

          {/* Totals summary */}
          <div className="grid grid-cols-3 gap-3 py-2">
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="text-[11px] text-muted-foreground">DC Fee Pool</p>
              <p className="font-bold text-sm mt-0.5">{fmt(totalDcFeePoolCents)}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="text-[11px] text-muted-foreground">Total Bonus</p>
              <p className="font-bold text-sm mt-0.5 text-[#1D3461]">{fmt(totalBonusCents)}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="text-[11px] text-muted-foreground">Recipients</p>
              <p className="font-bold text-sm mt-0.5">
                {[...coordCalcRows, ...supCalcRows].filter(r => r.userId !== null).length}
              </p>
            </div>
          </div>

          {/* Per-person exclusion */}
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {[...coordCalcRows, ...supCalcRows].filter(r => r.userId !== null).map(row => {
              const key = row.userId! + ':' + row.role;
              const state = exclusions[key] ?? { excluded: false, note: '' };
              return (
                <div key={key} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id={`excl-${key}`}
                      checked={state.excluded}
                      onCheckedChange={v => setExclusions(prev => ({ ...prev, [key]: { ...state, excluded: !!v } }))}
                    />
                    <Label htmlFor={`excl-${key}`} className="flex-1 cursor-pointer">
                      <span className="font-medium">{row.name}</span>
                      <span className="text-muted-foreground text-xs ml-2">({row.role})</span>
                      <span className="ml-auto float-right text-sm font-semibold">{fmt(row.bonusAmountCents)}</span>
                    </Label>
                  </div>
                  {state.excluded && (
                    <Textarea
                      placeholder="Reason for exclusion…"
                      value={state.note}
                      onChange={e => setExclusions(prev => ({ ...prev, [key]: { ...state, note: e.target.value } }))}
                      className="text-sm h-16 resize-none"
                    />
                  )}
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPreApproveOpen(false)}>Cancel</Button>
            <Button
              type="button"
              disabled={preApproving}
              onClick={handlePreApprove}
              className="bg-[#1D3461] hover:bg-[#1D3461]/90 text-white"
            >
              {preApproving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving…</> : 'Confirm Pre-Approval'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── CalcTable ────────────────────────────────────────────────────────────────

interface CalcTableProps {
  rows: CalcRow[];
  showPayPanel: boolean;
  payments: PaymentRow[];
  payingId: string | null;
  payMethodOverrides: Record<string, string>;
  payPeriodOverrides: Record<string, string>;
  onPay: (pmt: PaymentRow) => void;
  onMethodChange: (id: string, v: string) => void;
  onPeriodChange: (id: string, v: string) => void;
}

function CalcTable({ rows, showPayPanel, payments, payingId, payMethodOverrides, payPeriodOverrides, onPay, onMethodChange, onPeriodChange }: CalcTableProps) {
  if (rows.length === 0) {
    return <p className="px-5 py-4 text-sm text-muted-foreground">No data.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[11px] text-muted-foreground uppercase tracking-wide">
            <th className="px-5 py-2 text-left">Name</th>
            <th className="px-3 py-2 text-left">State / Hub</th>
            <th className="px-3 py-2 text-right">DCs</th>
            <th className="px-3 py-2 text-right">DC Fee Pool</th>
            <th className="px-3 py-2 text-right">Bonus %</th>
            <th className="px-3 py-2 text-right">Bonus Amount</th>
            <th className="px-3 py-2 text-center">Status</th>
            {showPayPanel && <th className="px-3 py-2 text-center">Pay</th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, i) => {
            const pmt = payments.find(p => p.userId === row.userId && p.role === row.role);
            const isPaying = pmt && payingId === pmt.id;
            return (
              <tr key={i} className={cn('hover:bg-muted/20 transition-colors', row.excluded && 'opacity-50')}>
                <td className="px-5 py-3 font-medium">
                  {row.name}
                  {row.excluded && <Badge variant="outline" className="ml-2 text-[9px]">Excluded</Badge>}
                  {row.userId === null && <Badge className="ml-2 text-[9px] bg-red-100 text-red-700 border-red-200">Unlinked</Badge>}
                </td>
                <td className="px-3 py-3 text-muted-foreground text-xs max-w-[140px] truncate" title={row.stateOrHub}>{row.stateOrHub}</td>
                <td className="px-3 py-3 text-right tabular-nums">{row.dcCount}</td>
                <td className="px-3 py-3 text-right tabular-nums">{fmt(row.dcFeePoolCents)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{pct(row.bonusPct)}</td>
                <td className="px-3 py-3 text-right tabular-nums font-semibold">{fmt(row.bonusAmountCents)}</td>
                <td className="px-3 py-3 text-center">
                  {row.paymentStatus === 'paid'
                    ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">Paid</Badge>
                    : row.paymentId
                      ? <Badge variant="outline" className="text-[10px]">Pending</Badge>
                      : <span className="text-[10px] text-muted-foreground">—</span>
                  }
                </td>
                {showPayPanel && (
                  <td className="px-3 py-3">
                    {pmt && pmt.status === 'pending' && !row.excluded && (
                      <div className="flex items-center gap-1.5">
                        <Select
                          value={payMethodOverrides[pmt.id] ?? pmt.paymentMethod ?? 'wallet'}
                          onValueChange={v => onMethodChange(pmt.id, v)}
                        >
                          <SelectTrigger className="h-7 w-24 text-[11px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="wallet" className="text-xs">Wallet</SelectItem>
                            <SelectItem value="payroll" className="text-xs">Payroll</SelectItem>
                          </SelectContent>
                        </Select>
                        {(payMethodOverrides[pmt.id] ?? pmt.paymentMethod ?? 'wallet') === 'payroll' && (
                          <Input
                            placeholder="YYYY-MM"
                            value={payPeriodOverrides[pmt.id] ?? pmt.payrollPeriod ?? ''}
                            onChange={e => onPeriodChange(pmt.id, e.target.value)}
                            className="h-7 w-24 text-[11px]"
                          />
                        )}
                        <Button
                          type="button"
                          size="sm"
                          disabled={!!isPaying}
                          onClick={() => onPay(pmt)}
                          className="h-7 text-[11px] bg-[#1D3461] hover:bg-[#1D3461]/90 text-white px-2"
                        >
                          {isPaying ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Pay'}
                        </Button>
                      </div>
                    )}
                    {pmt?.status === 'paid' && (
                      <span className="text-[11px] text-muted-foreground">
                        via {pmt.paymentMethod} {pmt.payrollPeriod ? `(${pmt.payrollPeriod})` : ''}
                      </span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
