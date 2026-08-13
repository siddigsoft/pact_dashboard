// src/components/finance/CampaignAdvancesPanel.tsx
//
// Finance Hub panel: shows all advance_requests submitted from Village Campaigns
// so finance/admin staff can approve, reject, and mark them as paid.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CheckCircle2, XCircle, DollarSign, RefreshCw, Wallet, Loader2,
  Clock, Building2, FileText, AlertCircle,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CampaignAdvance {
  id: string;
  project_id: string | null;
  site_name: string | null;
  requested_amount: number;
  total_paid_amount: number | null;
  status: string;
  created_at: string;
  description: string | null;
  expense_category: string | null;
  // enriched
  campaign_name?: string;
  project_name?: string;
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'paid' | 'rejected';

const STATUS_COLORS: Record<string, string> = {
  pending:  'bg-amber-100  text-amber-700  border-amber-200',
  approved: 'bg-blue-100   text-blue-700   border-blue-200',
  paid:     'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-100    text-red-700    border-red-200',
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
  const { currentUser } = useAppContext();
  const { hasAnyRole } = useAuthorization();
  const { toast } = useToast();

  const isAdmin = hasAnyRole(['admin', 'super_admin', 'fom', 'countryDirector', 'financialAdmin']);

  const [advances, setAdvances] = useState<CampaignAdvance[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [actionTarget, setActionTarget] = useState<CampaignAdvance | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'pay' | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [actioning, setActioning] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch all advance_requests
      const { data: rows, error } = await supabase
        .from('advance_requests')
        .select('id, project_id, site_name, requested_amount, total_paid_amount, status, created_at, description, expense_category')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const list = (rows || []) as CampaignAdvance[];

      // 2. Enrich with campaign/project names via project_id → adhoc_campaigns
      const projectIds = [...new Set(list.map(r => r.project_id).filter(Boolean))] as string[];
      const campaignMap: Record<string, { campaign_name: string; project_name: string }> = {};

      if (projectIds.length > 0) {
        const { data: campaigns } = await supabase
          .from('adhoc_campaigns')
          .select('project_id, campaign_name, project:project_id(name)')
          .in('project_id', projectIds)
          .is('deleted_at', null);

        for (const c of (campaigns || []) as any[]) {
          campaignMap[c.project_id] = {
            campaign_name: c.campaign_name,
            project_name:  c.project?.name || '—',
          };
        }
      }

      setAdvances(list.map(r => ({
        ...r,
        campaign_name: r.project_id ? campaignMap[r.project_id]?.campaign_name : undefined,
        project_name:  r.project_id ? campaignMap[r.project_id]?.project_name  : undefined,
      })));
    } catch (e: any) {
      toast({ title: 'Error loading campaign advances', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const openAction = (adv: CampaignAdvance, type: 'approve' | 'reject' | 'pay') => {
    setActionTarget(adv);
    setActionType(type);
    setPayAmount(String(adv.requested_amount ?? ''));
    setNotes('');
  };

  const commitAction = async () => {
    if (!actionTarget || !actionType) return;
    setActioning(true);
    try {
      let update: Record<string, any> = {};

      if (actionType === 'approve') {
        update = {
          status: 'approved',
          approved_by: currentUser?.id ?? null,
          approved_at: new Date().toISOString(),
          approval_notes: notes.trim() || null,
        };
      } else if (actionType === 'reject') {
        update = {
          status: 'rejected',
          approved_by: currentUser?.id ?? null,
          approved_at: new Date().toISOString(),
          approval_notes: notes.trim() || null,
        };
      } else if (actionType === 'pay') {
        const amt = parseFloat(payAmount);
        if (isNaN(amt) || amt <= 0) {
          toast({ title: 'Enter a valid payment amount', variant: 'destructive' });
          setActioning(false);
          return;
        }
        update = {
          status: 'paid',
          total_paid_amount: amt,
          paid_by: currentUser?.id ?? null,
          paid_at: new Date().toISOString(),
          approval_notes: notes.trim() || null,
        };
      }

      const { error } = await supabase
        .from('advance_requests')
        .update(update)
        .eq('id', actionTarget.id);

      if (error) throw error;

      const labels: Record<string, string> = { approve: 'approved', reject: 'rejected', pay: 'marked as paid' };
      toast({ title: `Advance request ${labels[actionType]}` });
      setActionTarget(null);
      setActionType(null);
      await load();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setActioning(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const filtered = statusFilter === 'all'
    ? advances
    : advances.filter(a => a.status === statusFilter);

  const pendingCount  = advances.filter(a => a.status === 'pending').length;
  const approvedCount = advances.filter(a => a.status === 'approved').length;
  const totalRequested = advances
    .filter(a => a.status === 'pending' || a.status === 'approved')
    .reduce((s, a) => s + (a.requested_amount || 0), 0);

  function fmt(d: string) {
    try { return format(parseISO(d), 'dd MMM yyyy'); } catch { return d; }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
        <AlertCircle className="h-8 w-8 opacity-30" />
        <p className="text-sm">Access restricted to Finance and Admin staff.</p>
      </div>
    );
  }

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
            Advance requests submitted from Village Campaigns — approve, reject, or mark as paid.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">Pending Approval</p>
            <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
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
        {(['all', 'pending', 'approved', 'paid', 'rejected'] as StatusFilter[]).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              statusFilter === s
                ? 'bg-[#1D3461] text-white border-[#1D3461]'
                : 'border-border text-muted-foreground hover:bg-muted/40'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
            {s === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white rounded-full px-1.5 text-[10px]">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No advance requests with status: {statusFilter}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
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
              <TableBody>
                {filtered.map(adv => (
                  <TableRow key={adv.id}>
                    <TableCell>
                      <div>
                        <p className="text-xs font-semibold text-foreground">
                          {adv.campaign_name || '—'}
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
                    <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
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
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${STATUS_COLORS[adv.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                        {adv.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {adv.status === 'pending' && (
                          <>
                            <Button size="sm" variant="outline"
                              className="h-7 text-[11px] border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                              onClick={() => openAction(adv, 'approve')}>
                              <CheckCircle2 className="h-3 w-3 mr-1" />Approve
                            </Button>
                            <Button size="sm" variant="outline"
                              className="h-7 text-[11px] border-red-300 text-red-600 hover:bg-red-50"
                              onClick={() => openAction(adv, 'reject')}>
                              <XCircle className="h-3 w-3 mr-1" />Reject
                            </Button>
                          </>
                        )}
                        {adv.status === 'approved' && (
                          <Button size="sm" variant="outline"
                            className="h-7 text-[11px] border-blue-300 text-blue-700 hover:bg-blue-50"
                            onClick={() => openAction(adv, 'pay')}>
                            <DollarSign className="h-3 w-3 mr-1" />Mark Paid
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Action dialog */}
      <Dialog open={!!actionTarget} onOpenChange={v => { if (!v) { setActionTarget(null); setActionType(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' && 'Approve Advance Request'}
              {actionType === 'reject'  && 'Reject Advance Request'}
              {actionType === 'pay'     && 'Mark Advance as Paid'}
            </DialogTitle>
            {actionTarget && (
              <DialogDescription>
                {actionTarget.campaign_name || actionTarget.site_name || 'Campaign advance'} ·
                SDG {(actionTarget.requested_amount || 0).toLocaleString()}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-3 py-1">
            {actionType === 'pay' && (
              <div>
                <label className="text-xs font-semibold mb-1 block">Payment Amount (SDG)</label>
                <Input
                  type="number"
                  min="0"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  placeholder="0"
                  className="h-8 text-sm"
                />
              </div>
            )}
            <div>
              <label className="text-xs font-semibold mb-1 block">
                Notes {actionType === 'reject' ? '' : '(optional)'}
              </label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={
                  actionType === 'approve' ? 'Approval notes…'
                  : actionType === 'reject' ? 'Reason for rejection…'
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
              disabled={actioning || (actionType === 'reject' && !notes.trim())}
              onClick={commitAction}
              className={
                actionType === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : actionType === 'reject' ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-[#1D3461] hover:bg-[#0F2041] text-white'
              }
            >
              {actioning && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {actionType === 'approve' ? 'Approve'
               : actionType === 'reject' ? 'Reject'
               : 'Confirm Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
