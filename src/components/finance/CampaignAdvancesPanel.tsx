// src/components/finance/CampaignAdvancesPanel.tsx
//
// Finance Hub panel: shows all advance_requests submitted from Village Campaigns.
// All state mutations (approve, reject, pay) go through SECURITY DEFINER RPCs
// that enforce role checks and sequential tier preconditions server-side.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  CheckCircle2, XCircle, DollarSign, RefreshCw, Wallet, Loader2,
  Building2, FileText, AlertCircle,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CampaignAdvance {
  id: string;
  campaign_id: string | null;
  project_id: string | null;
  site_name: string | null;
  requested_amount: number;
  total_paid_amount: number | null;
  status: string;
  created_at: string;
  description: string | null;
  expense_category: string | null;
  // Tier fields (added by migration 20260818)
  tier1_status: string;
  tier1_approved_by: string | null;
  tier1_approved_at: string | null;
  tier2_status: string;
  tier2_approved_by: string | null;
  tier2_approved_at: string | null;
  rejection_reason: string | null;
  // Enriched
  campaign_name?: string;
  project_name?: string;
  is_legacy?: boolean;
}

type StatusFilter = 'all' | 'pending' | 'under_review' | 'approved' | 'paid' | 'rejected';

// Action type encodes both what to do and at which tier
type ActionType = 'tier1_approve' | 'tier2_approve' | 'tier1_reject' | 'tier2_reject' | 'pay';

const STATUS_COLORS: Record<string, string> = {
  pending:      'bg-amber-100  text-amber-700  border-amber-200',
  under_review: 'bg-purple-100 text-purple-700 border-purple-200',
  approved:     'bg-blue-100   text-blue-700   border-blue-200',
  paid:         'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected:     'bg-red-100    text-red-700    border-red-200',
};

const STATUS_LABELS: Record<string, string> = {
  pending:      'Pending',
  under_review: 'Tier 1 Approved',
  approved:     'Tier 2 Approved',
  paid:         'Paid',
  rejected:     'Rejected',
};

const CATEGORY_LABELS: Record<string, string> = {
  transport:      'Transportation',
  enumerator_fees:'Enumerator Fees',
  accommodation:  'Accommodation',
  meals:          'Meals & Allowances',
  supplies:       'Supplies',
  communication:  'Communication',
  other:          'Other',
};

// ── Main component ─────────────────────────────────────────────────────────────

export default function CampaignAdvancesPanel() {
  const { hasAnyRole } = useAuthorization();
  const { toast } = useToast();

  // Role-based tier capability
  // Tier-1 actors: FOM, Supervisor, Admin, SuperAdmin, CountryDirector, FinancialAdmin
  // Tier-2 actors: Admin, SuperAdmin, CountryDirector, FinancialAdmin (no FOM/Supervisor)
  const canViewPanel = hasAnyRole(['admin', 'Admin', 'super_admin', 'SuperAdmin', 'Super Admin',
    'fom', 'Field Operation Manager (FOM)', 'fieldOpManager',
    'supervisor', 'Supervisor', 'hubSupervisor', 'HubSupervisor', 'hubsupervisor', 'hub_supervisor',
    'countryDirector', 'CountryDirector', 'country_director', 'Country Director',
    'financialAdmin', 'financial_admin', 'FinancialAdmin']);

  const canTier2 = hasAnyRole(['admin', 'Admin', 'super_admin', 'SuperAdmin', 'Super Admin',
    'countryDirector', 'CountryDirector', 'country_director', 'Country Director',
    'financialAdmin', 'financial_admin', 'FinancialAdmin']);

  const [advances, setAdvances]       = useState<CampaignAdvance[]>([]);
  const [loading, setLoading]         = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [actionTarget, setActionTarget] = useState<CampaignAdvance | null>(null);
  const [actionType, setActionType]   = useState<ActionType | null>(null);
  const [payAmount, setPayAmount]     = useState('');
  const [notes, setNotes]             = useState('');
  const [actioning, setActioning]     = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [attrRes, legacyRes] = await Promise.all([
        supabase
          .from('advance_requests')
          .select('id, campaign_id, project_id, site_name, requested_amount, total_paid_amount, status, created_at, description, expense_category, tier1_status, tier1_approved_by, tier1_approved_at, tier2_status, tier2_approved_by, tier2_approved_at, rejection_reason')
          .not('campaign_id', 'is', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('advance_requests')
          .select('id, campaign_id, project_id, site_name, requested_amount, total_paid_amount, status, created_at, description, expense_category, tier1_status, tier1_approved_by, tier1_approved_at, tier2_status, tier2_approved_by, tier2_approved_at, rejection_reason')
          .is('campaign_id', null)
          .not('project_id', 'is', null)
          .order('created_at', { ascending: false }),
      ]);

      if (attrRes.error) throw attrRes.error;

      const attributed = (attrRes.data || []) as CampaignAdvance[];
      const legacy     = (legacyRes.data || []) as CampaignAdvance[];

      // Enrich attributed rows: join campaign name + project name
      const campaignIds = [...new Set(attributed.map(r => r.campaign_id).filter(Boolean))] as string[];
      const campaignById: Record<string, { campaign_name: string; project_name: string }> = {};

      if (campaignIds.length > 0) {
        const { data: campaigns } = await supabase
          .from('adhoc_campaigns')
          .select('id, campaign_name, project:project_id(name)')
          .in('id', campaignIds);

        for (const c of (campaigns || []) as any[]) {
          campaignById[c.id] = {
            campaign_name: c.campaign_name,
            project_name:  c.project?.name || '—',
          };
        }
      }

      // Enrich legacy rows: best-effort project name via project_id
      const legacyProjectIds = [...new Set(legacy.map(r => r.project_id).filter(Boolean))] as string[];
      const projectById: Record<string, string> = {};
      if (legacyProjectIds.length > 0) {
        const { data: projects } = await supabase
          .from('projects').select('id, name').in('id', legacyProjectIds);
        for (const p of (projects || []) as any[]) projectById[p.id] = p.name;
      }

      setAdvances([
        ...attributed.map(r => ({
          ...r,
          is_legacy:     false,
          campaign_name: r.campaign_id ? campaignById[r.campaign_id]?.campaign_name : undefined,
          project_name:  r.campaign_id ? campaignById[r.campaign_id]?.project_name  : undefined,
        })),
        ...legacy.map(r => ({
          ...r,
          is_legacy:     true,
          campaign_name: undefined,
          project_name:  r.project_id ? projectById[r.project_id] : undefined,
        })),
      ]);
    } catch (e: any) {
      toast({ title: 'Error loading campaign advances', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const openAction = (adv: CampaignAdvance, type: ActionType) => {
    setActionTarget(adv);
    setActionType(type);
    setPayAmount(String(adv.requested_amount ?? ''));
    setNotes('');
  };

  // Derive which actions are available for a given advance row
  const availableActions = (adv: CampaignAdvance): ActionType[] => {
    const t1 = adv.tier1_status || 'pending';
    const t2 = adv.tier2_status || 'pending';
    const s  = adv.status;
    if (s === 'paid' || s === 'rejected') return [];
    if (t1 === 'pending') return ['tier1_approve', 'tier1_reject'];
    if (t1 === 'approved' && t2 === 'pending') {
      const actions: ActionType[] = [];
      if (canTier2) actions.push('tier2_approve', 'tier2_reject');
      return actions;
    }
    if (t1 === 'approved' && t2 === 'approved' && s === 'approved') {
      return canTier2 ? ['pay'] : [];
    }
    return [];
  };

  const commitAction = async () => {
    if (!actionTarget || !actionType) return;
    setActioning(true);
    try {
      if (actionType === 'tier1_approve') {
        const { error } = await supabase.rpc('approve_campaign_advance_tier1', {
          p_advance_id: actionTarget.id,
          p_notes:      notes.trim() || null,
        });
        if (error) throw error;
        setAdvances(avs => avs.map(a => a.id === actionTarget.id
          ? { ...a, status: 'under_review', tier1_status: 'approved', tier1_notes: notes.trim() || null } : a));
        toast({ title: 'Tier 1 approved — awaiting Tier 2 review' });

      } else if (actionType === 'tier2_approve') {
        const { error } = await supabase.rpc('approve_campaign_advance_tier2', {
          p_advance_id: actionTarget.id,
          p_notes:      notes.trim() || null,
        });
        if (error) throw error;
        setAdvances(avs => avs.map(a => a.id === actionTarget.id
          ? { ...a, status: 'approved', tier2_status: 'approved', tier2_notes: notes.trim() || null } : a));
        toast({ title: 'Tier 2 approved — ready for payment' });

      } else if (actionType === 'tier1_reject') {
        if (!notes.trim()) { toast({ title: 'Please enter a rejection reason', variant: 'destructive' }); setActioning(false); return; }
        const { error } = await supabase.rpc('reject_campaign_advance', {
          p_advance_id: actionTarget.id, p_tier: 1, p_reason: notes.trim(),
        });
        if (error) throw error;
        setAdvances(avs => avs.map(a => a.id === actionTarget.id
          ? { ...a, status: 'rejected', tier1_status: 'rejected', rejection_reason: notes.trim() } : a));
        toast({ title: 'Tier 1 rejected' });

      } else if (actionType === 'tier2_reject') {
        if (!notes.trim()) { toast({ title: 'Please enter a rejection reason', variant: 'destructive' }); setActioning(false); return; }
        const { error } = await supabase.rpc('reject_campaign_advance', {
          p_advance_id: actionTarget.id, p_tier: 2, p_reason: notes.trim(),
        });
        if (error) throw error;
        setAdvances(avs => avs.map(a => a.id === actionTarget.id
          ? { ...a, status: 'rejected', tier2_status: 'rejected', rejection_reason: notes.trim() } : a));
        toast({ title: 'Tier 2 rejected' });

      } else if (actionType === 'pay') {
        const amt = parseFloat(payAmount);
        if (isNaN(amt) || amt <= 0) {
          toast({ title: 'Enter a valid payment amount', variant: 'destructive' });
          setActioning(false);
          return;
        }
        const { error } = await supabase.rpc('mark_campaign_advance_paid', {
          p_advance_id: actionTarget.id, p_paid_amount: amt,
        });
        if (error) throw error;
        setAdvances(avs => avs.map(a => a.id === actionTarget.id
          ? { ...a, status: 'paid', total_paid_amount: amt } : a));
        toast({ title: 'Advance marked as paid', description: `SDG ${amt.toLocaleString()}` });
      }

      setActionTarget(null);
      setActionType(null);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setActioning(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const attributedAdvances = advances.filter(a => !a.is_legacy);
  const legacyAdvances     = advances.filter(a =>  a.is_legacy);

  const filtered = statusFilter === 'all'
    ? attributedAdvances
    : attributedAdvances.filter(a => a.status === statusFilter);

  const pendingCount    = attributedAdvances.filter(a => a.status === 'pending').length;
  const reviewCount     = attributedAdvances.filter(a => a.status === 'under_review').length;
  const approvedCount   = attributedAdvances.filter(a => a.status === 'approved').length;
  const totalRequested  = attributedAdvances
    .filter(a => ['pending', 'under_review', 'approved'].includes(a.status))
    .reduce((s, a) => s + (a.requested_amount || 0), 0);

  function fmt(d: string) {
    try { return format(parseISO(d), 'dd MMM yyyy'); } catch { return d; }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!canViewPanel) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
        <AlertCircle className="h-8 w-8 opacity-30" />
        <p className="text-sm">Access restricted to Finance and Admin staff.</p>
      </div>
    );
  }

  // Shared row renderer for both attributed and legacy tables
  const renderRow = (adv: CampaignAdvance) => {
    const actions = availableActions(adv);
    const t1label = adv.tier1_status === 'approved' ? 'T1 ✓' : adv.tier1_status === 'rejected' ? 'T1 ✗' : null;
    const t2label = adv.tier2_status === 'approved' ? 'T2 ✓' : adv.tier2_status === 'rejected' ? 'T2 ✗' : null;

    return (
      <TableRow key={adv.id} className={adv.is_legacy ? 'bg-amber-50/30' : undefined}>
        <TableCell>
          <div>
            <p className="text-xs font-semibold text-foreground">
              {adv.campaign_name || adv.site_name || '—'}
            </p>
            {adv.site_name && adv.site_name !== adv.campaign_name && (
              <p className="text-[11px] text-muted-foreground">{adv.site_name}</p>
            )}
            {adv.project_name && (
              <p className="text-[10px] text-blue-600 flex items-center gap-0.5 mt-0.5">
                <Building2 className="h-2.5 w-2.5" />{adv.project_name}
              </p>
            )}
          </div>
        </TableCell>
        <TableCell className="text-xs">
          {CATEGORY_LABELS[adv.expense_category || ''] || adv.expense_category || '—'}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate" title={adv.description || undefined}>
          {adv.description || '—'}
        </TableCell>
        <TableCell className="text-right font-semibold text-sm">
          {(adv.requested_amount || 0).toLocaleString()}
        </TableCell>
        <TableCell className="text-right text-sm">
          {adv.total_paid_amount != null
            ? adv.total_paid_amount.toLocaleString()
            : <span className="text-muted-foreground">—</span>}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
          {fmt(adv.created_at)}
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-0.5">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold self-start ${STATUS_COLORS[adv.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
              {STATUS_LABELS[adv.status] || adv.status}
            </span>
            {(t1label || t2label) && (
              <span className="text-[9px] text-muted-foreground">
                {[t1label, t2label].filter(Boolean).join(' · ')}
              </span>
            )}
            {adv.rejection_reason && adv.status === 'rejected' && (
              <span className="text-[9px] text-red-400 truncate max-w-[100px]" title={adv.rejection_reason}>
                {adv.rejection_reason}
              </span>
            )}
          </div>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1 flex-wrap">
            {actions.includes('tier1_approve') && (
              <Button size="sm" variant="outline"
                className="h-7 text-[11px] border-purple-300 text-purple-700 hover:bg-purple-50"
                onClick={() => openAction(adv, 'tier1_approve')}>
                <CheckCircle2 className="h-3 w-3 mr-1" />T1 Approve
              </Button>
            )}
            {actions.includes('tier1_reject') && (
              <Button size="sm" variant="outline"
                className="h-7 text-[11px] border-red-300 text-red-600 hover:bg-red-50"
                onClick={() => openAction(adv, 'tier1_reject')}>
                <XCircle className="h-3 w-3 mr-1" />Reject
              </Button>
            )}
            {actions.includes('tier2_approve') && (
              <Button size="sm" variant="outline"
                className="h-7 text-[11px] border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                onClick={() => openAction(adv, 'tier2_approve')}>
                <CheckCircle2 className="h-3 w-3 mr-1" />T2 Approve
              </Button>
            )}
            {actions.includes('tier2_reject') && (
              <Button size="sm" variant="outline"
                className="h-7 text-[11px] border-red-300 text-red-600 hover:bg-red-50"
                onClick={() => openAction(adv, 'tier2_reject')}>
                <XCircle className="h-3 w-3 mr-1" />Reject
              </Button>
            )}
            {actions.includes('pay') && (
              <Button size="sm" variant="outline"
                className="h-7 text-[11px] border-blue-300 text-blue-700 hover:bg-blue-50"
                onClick={() => openAction(adv, 'pay')}>
                <DollarSign className="h-3 w-3 mr-1" />Mark Paid
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  };

  const tableHeader = (
    <TableHeader>
      <TableRow>
        <TableHead>Campaign / Village</TableHead>
        <TableHead>Category</TableHead>
        <TableHead>Description</TableHead>
        <TableHead className="text-right">Amount (SDG)</TableHead>
        <TableHead className="text-right">Paid (SDG)</TableHead>
        <TableHead>Date</TableHead>
        <TableHead>Status</TableHead>
        <TableHead className="text-right">Actions</TableHead>
      </TableRow>
    </TableHeader>
  );

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Wallet className="h-5 w-5 text-blue-600" />
            Campaign Advance Requests
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Two-tier approval: <span className="font-medium">Tier 1</span> (FOM/Supervisor) →{' '}
            <span className="font-medium">Tier 2</span> (Admin) → Paid
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">Pending Tier 1</p>
            <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">Awaiting Tier 2</p>
            <p className="text-2xl font-bold text-purple-600">{reviewCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">Approved · Awaiting Payment</p>
            <p className="text-2xl font-bold text-blue-600">{approvedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">Total Requested (open)</p>
            <p className="text-2xl font-bold text-foreground">SDG {totalRequested.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'pending', 'under_review', 'approved', 'paid', 'rejected'] as StatusFilter[]).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              statusFilter === s
                ? 'bg-[#1D3461] text-white border-[#1D3461]'
                : 'border-border text-muted-foreground hover:bg-muted/40'
            }`}
          >
            {STATUS_LABELS[s] || (s.charAt(0).toUpperCase() + s.slice(1))}
            {s === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white rounded-full px-1.5 text-[10px]">{pendingCount}</span>
            )}
            {s === 'under_review' && reviewCount > 0 && (
              <span className="ml-1.5 bg-purple-500 text-white rounded-full px-1.5 text-[10px]">{reviewCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Attributed advances table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No advance requests with status: {STATUS_LABELS[statusFilter] || statusFilter}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              {tableHeader}
              <TableBody>{filtered.map(renderRow)}</TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Unattributed legacy rows */}
      {legacyAdvances.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-800">
                {legacyAdvances.length} Unattributed advance{legacyAdvances.length !== 1 ? 's' : ''}
              </p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                These requests were submitted before campaign tracking was added and could not be
                automatically attributed. Approval goes through the same two-tier flow.
              </p>
            </div>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                {tableHeader}
                <TableBody>{legacyAdvances.map(renderRow)}</TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Action dialog */}
      <Dialog open={!!actionTarget} onOpenChange={v => { if (!v) { setActionTarget(null); setActionType(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionType === 'tier1_approve' && 'Tier 1 Approve'}
              {actionType === 'tier2_approve' && 'Tier 2 Approve'}
              {actionType === 'tier1_reject'  && 'Tier 1 Reject'}
              {actionType === 'tier2_reject'  && 'Tier 2 Reject'}
              {actionType === 'pay'           && 'Mark Advance as Paid'}
            </DialogTitle>
            {actionTarget && (
              <DialogDescription>
                {actionTarget.campaign_name || actionTarget.site_name || 'Campaign advance'} ·{' '}
                SDG {(actionTarget.requested_amount || 0).toLocaleString()}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-3 py-1">
            {actionType === 'pay' && (
              <div>
                <label className="text-xs font-semibold mb-1 block">Payment Amount (SDG)</label>
                <Input
                  type="number" min="0"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  placeholder="0"
                  className="h-8 text-sm"
                />
              </div>
            )}
            <div>
              <label className="text-xs font-semibold mb-1 block">
                {actionType?.includes('reject') ? 'Rejection reason *' : 'Notes (optional)'}
              </label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={
                  actionType?.includes('approve') ? 'Approval notes…'
                  : actionType?.includes('reject') ? 'Reason for rejection…'
                  : 'Payment reference or notes…'
                }
                className="text-xs min-h-[72px] resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setActionTarget(null); setActionType(null); }}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={actioning || (actionType?.includes('reject') && !notes.trim())}
              onClick={commitAction}
              className={
                actionType?.includes('approve') ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : actionType?.includes('reject')  ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-[#1D3461] hover:bg-[#0F2041] text-white'
              }
            >
              {actioning && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {actionType === 'tier1_approve' ? 'Tier 1 Approve'
               : actionType === 'tier2_approve' ? 'Tier 2 Approve'
               : actionType?.includes('reject') ? 'Reject'
               : 'Confirm Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
