import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { dispatchNotification } from '@/lib/notify';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Banknote, RefreshCw, Users, Search, Plus, Pencil, Trash2,
  AlertTriangle, Check, X, ChevronDown, ChevronRight, Wallet,
  TrendingDown, Info, Paperclip, ExternalLink, Upload,
} from 'lucide-react';
import { formatNumber } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface HeldFund {
  id: string;
  name: string;
  source: string | null;
  amount: number;
  currency: string;
  available_balance: number;
  paid_amount: number;
  status: string;
}

interface Allocation {
  id: string;
  pre_fund_request_id: string;
  user_id: string;
  allocated_amount: number;
  spent_amount: number;
  currency: string;
  notes: string | null;
  receipt_url: string | null;
  created_at: string;
  user_name?: string;
  user_email?: string;
  user_role?: string;
}

interface StaffProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

const STATUS_BADGE: Record<string, string> = {
  active:      'bg-emerald-100 text-emerald-700 border-emerald-200',
  low_balance: 'bg-orange-100 text-orange-700 border-orange-200',
  paused:      'bg-violet-100 text-violet-700 border-violet-200',
  closed:      'bg-slate-100 text-slate-500 border-slate-200',
  draft:       'bg-slate-100 text-slate-600 border-slate-200',
};

export default function PreFundingDistribute() {
  const { hasAnyRole } = useAuthorization();
  const { currentUser } = useAppContext();
  const { toast } = useToast();

  const isFinanceAdmin = hasAnyRole(['super_admin', 'admin', 'financialAdmin']);

  const [funds, setFunds]               = useState<HeldFund[]>([]);
  const [loading, setLoading]           = useState(true);
  const [staffProfiles, setStaff]       = useState<StaffProfile[]>([]);
  const [expanded, setExpanded]         = useState<Set<string>>(new Set());
  const [fundAllocs, setFundAllocs]     = useState<Map<string, Allocation[]>>(new Map());
  const [allocLoading, setAllocLoading] = useState<Set<string>>(new Set());

  // Add allocation dialog
  const [addDialog, setAddDialog] = useState<{ open: boolean; fund: HeldFund | null }>({ open: false, fund: null });
  const [addForm, setAddForm]     = useState({ userId: '', amount: '', notes: '' });
  const [userSearch, setUserSearch] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  // Add dialog receipt
  const [addReceiptFile, setAddReceiptFile] = useState<File | null>(null);

  // Top-up dialog (replaces inline edit — also collects a receipt)
  const [topUpDialog, setTopUpDialog] = useState<{ open: boolean; alloc: Allocation | null; fundId: string }>({ open: false, alloc: null, fundId: '' });
  const [topUpAmt, setTopUpAmt]           = useState('');
  const [topUpReceiptFile, setTopUpReceiptFile] = useState<File | null>(null);
  const [topUpSaving, setTopUpSaving]     = useState(false);

  // Remove confirmation
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  /** Upload a receipt file to Supabase storage and return the public URL. */
  const uploadReceipt = async (file: File, fundId: string, userId: string): Promise<string | null> => {
    const ext  = file.name.split('.').pop() ?? 'bin';
    const path = `pre-fund-alloc-receipts/${fundId}/${userId}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('attachments').upload(path, file, { upsert: true });
    if (error) { toast({ title: 'Receipt upload failed', description: error.message, variant: 'destructive' }); return null; }
    return supabase.storage.from('attachments').getPublicUrl(path).data.publicUrl;
  };

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      // Load funds held by this user (or all funds for finance admin in overview mode)
      let q = (supabase as any)
        .from('pre_fund_requests')
        .select('id,name,source,amount,currency,available_balance,paid_amount,status')
        .order('created_at', { ascending: false });
      if (!isFinanceAdmin) q = q.eq('holder_user_id', currentUser.id);
      else q = q.not('holder_user_id', 'is', null); // finance admin sees all assigned funds
      const { data: fundsData, error: fErr } = await q;
      if (fErr && !fErr.message.includes('does not exist')) throw fErr;
      setFunds((fundsData as HeldFund[]) ?? []);

      // Load staff profiles for the user picker
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id,full_name,email,role')
        .order('full_name');
      setStaff((profiles as any) ?? []);
    } catch (e: any) {
      toast({ title: 'Error loading funds', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id, isFinanceAdmin]);

  useEffect(() => { load(); }, [load]);

  const loadAllocations = useCallback(async (fundId: string) => {
    setAllocLoading(prev => new Set(prev).add(fundId));
    try {
      const { data: allocs, error } = await (supabase as any)
        .from('pre_fund_allocations')
        .select('id,pre_fund_request_id,user_id,allocated_amount,spent_amount,currency,notes,receipt_url,created_at')
        .eq('pre_fund_request_id', fundId)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const profileIds: string[] = [...new Set((allocs ?? []).map((a: any) => a.user_id).filter(Boolean))];
      let profileMap: Record<string, StaffProfile> = {};
      if (profileIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id,full_name,email,role')
          .in('id', profileIds);
        (profs ?? []).forEach((p: any) => { profileMap[p.id] = p; });
      }

      const enriched: Allocation[] = (allocs ?? []).map((a: any) => ({
        ...a,
        user_name:  profileMap[a.user_id]?.full_name ?? 'Unknown',
        user_email: profileMap[a.user_id]?.email ?? '',
        user_role:  profileMap[a.user_id]?.role ?? '',
      }));

      setFundAllocs(prev => new Map(prev).set(fundId, enriched));
    } catch (e: any) {
      toast({ title: 'Error loading allocations', description: e.message, variant: 'destructive' });
    } finally {
      setAllocLoading(prev => { const n = new Set(prev); n.delete(fundId); return n; });
    }
  }, []);

  const toggleExpand = (fundId: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(fundId)) { n.delete(fundId); }
      else { n.add(fundId); loadAllocations(fundId); }
      return n;
    });
  };

  const openAdd = (fund: HeldFund) => {
    setAddForm({ userId: '', amount: '', notes: '' });
    setUserSearch('');
    setAddDialog({ open: true, fund });
    // Ensure allocations are loaded so the duplicate check in handleAddAllocation works
    if (!fundAllocs.has(fund.id)) loadAllocations(fund.id);
  };

  const handleAddAllocation = async () => {
    const fund = addDialog.fund;
    if (!fund || !addForm.userId || !addForm.amount) {
      toast({ title: 'Please select a staff member and enter an amount', variant: 'destructive' });
      return;
    }
    const amt = parseFloat(addForm.amount);
    if (isNaN(amt) || amt <= 0) {
      toast({ title: 'Amount must be greater than zero', variant: 'destructive' });
      return;
    }
    const existing = fundAllocs.get(fund.id) ?? [];
    const totalAllocated = existing.reduce((s, a) => s + Number(a.allocated_amount), 0);
    if (totalAllocated + amt > fund.amount) {
      toast({
        title: 'Over-allocation',
        description: `Total allocations would exceed fund amount of ${formatNumber(fund.amount, 0)} ${fund.currency}.`,
        variant: 'destructive',
      });
      return;
    }
    // Check for existing allocation for this user+fund (in-memory first, then DB)
    const inMemoryDupe = existing.find(a => a.user_id === addForm.userId);
    if (inMemoryDupe) {
      toast({ title: 'User already allocated', description: 'Edit the existing allocation instead of adding a new one.', variant: 'destructive' });
      return;
    }
    // DB-level check as safety net (catches case where allocations weren't loaded yet)
    const { data: dbDupe } = await (supabase as any)
      .from('pre_fund_allocations')
      .select('id')
      .eq('pre_fund_request_id', fund.id)
      .eq('user_id', addForm.userId)
      .maybeSingle();
    if (dbDupe) {
      toast({ title: 'User already allocated', description: 'This staff member already has an allocation for this fund. Edit the existing one instead.', variant: 'destructive' });
      await loadAllocations(fund.id); // refresh so UI shows it
      return;
    }
    setAddSaving(true);
    try {
      // Upload receipt first if provided
      let receiptUrl: string | null = null;
      if (addReceiptFile) {
        receiptUrl = await uploadReceipt(addReceiptFile, fund.id, addForm.userId);
        if (!receiptUrl) { setAddSaving(false); return; } // upload failed, error already toasted
      }
      const { error } = await (supabase as any).from('pre_fund_allocations').insert({
        pre_fund_request_id: fund.id,
        user_id: addForm.userId,
        allocated_amount: amt,
        spent_amount: 0,
        currency: fund.currency,
        notes: addForm.notes || null,
        receipt_url: receiptUrl,
      });
      if (error) throw error;
      // Notify the user
      await (supabase as any).from('notification_events').insert({
        event_type: 'pre_fund_allocation_assigned',
        reference_id: fund.id,
        reference_type: 'pre_fund_request',
        title: 'Fund Allocation Assigned',
        message: `You have been allocated ${formatNumber(amt, 0)} ${fund.currency} from fund "${fund.name}".`,
        target_user_ids: [addForm.userId],
        created_by: currentUser?.id ?? null,
        metadata: { fund_id: fund.id, fund_name: fund.name, amount: amt, currency: fund.currency },
      }).catch(() => null);
      dispatchNotification({
        event: 'pre_fund_allocation_assigned', recipientIds: [addForm.userId],
        titleEn: 'Fund Allocation Assigned to You', titleAr: 'تم تعيين تخصيص الصندوق لك',
        messageEn: `You have been allocated ${formatNumber(amt, 0)} ${fund.currency} from fund "${fund.name}".`,
        messageAr: `تم تخصيص مبلغ ${formatNumber(amt, 0)} ${fund.currency} لك من صندوق "${fund.name}".`,
        entityType: 'pre_fund_request', entityId: fund.id,
        triggeredBy: currentUser?.id, priority: 'normal',
        metadata: { fund_name: fund.name, amount: amt, currency: fund.currency },
      });
      toast({ title: 'Allocation added', description: `${formatNumber(amt, 0)} ${fund.currency} assigned.` });
      setAddDialog({ open: false, fund: null });
      setAddReceiptFile(null);
      await loadAllocations(fund.id);
    } catch (e: any) {
      toast({ title: 'Failed to add allocation', description: e.message, variant: 'destructive' });
    } finally {
      setAddSaving(false);
    }
  };

  const openTopUp = (alloc: Allocation, fundId: string) => {
    setTopUpAmt(String(alloc.allocated_amount));
    setTopUpReceiptFile(null);
    setTopUpDialog({ open: true, alloc, fundId });
  };

  const saveTopUp = async () => {
    const { alloc, fundId } = topUpDialog;
    if (!alloc) return;
    const newAmt = parseFloat(topUpAmt);
    if (isNaN(newAmt) || newAmt < 0) { toast({ title: 'Enter a valid amount', variant: 'destructive' }); return; }
    setTopUpSaving(true);
    try {
      let receiptUrl: string | null = alloc.receipt_url ?? null;
      if (topUpReceiptFile) {
        const uploaded = await uploadReceipt(topUpReceiptFile, fundId, alloc.user_id);
        if (!uploaded) { setTopUpSaving(false); return; }
        receiptUrl = uploaded;
      }
      const { error } = await (supabase as any)
        .from('pre_fund_allocations')
        .update({ allocated_amount: newAmt, receipt_url: receiptUrl })
        .eq('id', alloc.id);
      if (error) throw error;
      toast({ title: 'Allocation updated', description: `Amount set to ${formatNumber(newAmt, 0)} ${alloc.currency}.` });
      setTopUpDialog({ open: false, alloc: null, fundId: '' });
      setTopUpReceiptFile(null);
      await loadAllocations(fundId);
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    } finally {
      setTopUpSaving(false);
    }
  };

  const handleRemoveAlloc = async () => {
    if (!removeId) return;
    setRemoving(true);
    try {
      const { error } = await (supabase as any).from('pre_fund_allocations').delete().eq('id', removeId);
      if (error) throw error;
      toast({ title: 'Allocation removed' });
      setRemoveId(null);
      // Refresh all expanded funds
      for (const fundId of expanded) loadAllocations(fundId);
    } catch (e: any) {
      toast({ title: 'Remove failed', description: e.message, variant: 'destructive' });
    } finally {
      setRemoving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
    );
  }

  const selectedUser = staffProfiles.find(p => p.id === addForm.userId);

  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Banknote className="h-5 w-5 text-sky-600" />
            {isFinanceAdmin ? 'All Fund Holders' : 'My Fund — Distribute to Staff'}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isFinanceAdmin
              ? 'All pre-funds that have a designated holder — view and manage allocations'
              : 'You have been assigned as a fund holder. Select staff to allocate portions of your fund.'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} data-testid="button-refresh-distribute">
          <RefreshCw className="h-4 w-4 mr-1.5" />Refresh
        </Button>
      </div>

      {/* Empty state */}
      {funds.length === 0 && (
        <div className="text-center py-20 text-muted-foreground border rounded-xl">
          <Banknote className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">
            {isFinanceAdmin ? 'No funds have a designated holder yet' : 'No fund assigned to you yet'}
          </p>
          <p className="text-sm mt-1">
            {isFinanceAdmin
              ? 'Open Fund Registry → Edit a fund → assign a Fund Holder'
              : 'Ask Finance Admin to assign you as a Fund Holder for a pre-fund.'}
          </p>
        </div>
      )}

      {/* Fund cards */}
      <div className="space-y-3">
        {funds.map(fund => {
          const isOpen = expanded.has(fund.id);
          const allocs = fundAllocs.get(fund.id) ?? [];
          const totalAllocated = allocs.reduce((s, a) => s + Number(a.allocated_amount), 0);
          const totalSpent     = allocs.reduce((s, a) => s + Number(a.spent_amount), 0);
          const remaining      = fund.amount - totalAllocated;
          const usagePct       = fund.amount > 0 ? Math.min(100, Math.round((totalAllocated / fund.amount) * 100)) : 0;
          const isAllocLoading = allocLoading.has(fund.id);

          return (
            <Card key={fund.id} className="overflow-hidden">
              {/* Fund summary row */}
              <CardContent className="pt-4 pb-4 px-5">
                <div className="flex items-start justify-between gap-3">
                  <button
                    className="flex items-center gap-2 text-left flex-1 min-w-0"
                    onClick={() => toggleExpand(fund.id)}
                    data-testid={`button-toggle-fund-${fund.id}`}
                  >
                    {isOpen
                      ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{fund.name}</div>
                      {fund.source && <div className="text-xs text-muted-foreground truncate">{fund.source}</div>}
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', STATUS_BADGE[fund.status] ?? 'bg-slate-100 text-slate-600')}>
                      {fund.status.replace(/_/g, ' ')}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => openAdd(fund)}
                      disabled={fund.status === 'closed' || fund.status === 'paused'}
                      data-testid={`button-add-alloc-${fund.id}`}
                    >
                      <Plus className="h-3.5 w-3.5" />Add Staff
                    </Button>
                  </div>
                </div>

                {/* KPI mini-row */}
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
                  {[
                    { label: 'Fund Total',   value: formatNumber(fund.amount, 0),           icon: Wallet,       cls: 'text-sky-600' },
                    { label: 'Allocated',    value: formatNumber(totalAllocated, 0),         icon: Users,        cls: 'text-violet-600' },
                    { label: 'Spent',        value: formatNumber(totalSpent, 0),             icon: TrendingDown, cls: totalSpent > totalAllocated ? 'text-rose-600' : 'text-emerald-600' },
                    { label: 'Unallocated',  value: formatNumber(Math.max(0, remaining), 0), icon: Check,        cls: remaining < 0 ? 'text-rose-600' : 'text-teal-600' },
                  ].map(k => (
                    <div key={k.label} className="flex flex-col">
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</span>
                      <span className={cn('text-sm font-bold tabular-nums', k.cls)}>{fund.currency} {k.value}</span>
                    </div>
                  ))}
                </div>

                {/* Progress bar */}
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                    <span>Allocated {usagePct}%</span>
                    <span>{formatNumber(remaining, 0)} {fund.currency} still available to allocate</span>
                  </div>
                  <Progress
                    value={usagePct}
                    className={cn('h-1.5', usagePct >= 100 ? '[&>div]:bg-rose-500' : usagePct >= 80 ? '[&>div]:bg-amber-500' : '[&>div]:bg-sky-500')}
                  />
                </div>

                {/* Expanded allocations list */}
                {isOpen && (
                  <div className="mt-4 pt-4 border-t space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />Staff Allocations
                    </p>
                    {isAllocLoading && (
                      <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>
                    )}
                    {!isAllocLoading && allocs.length === 0 && (
                      <div className="text-center py-6 text-muted-foreground text-sm border rounded-lg">
                        <Users className="h-6 w-6 mx-auto mb-2 opacity-30" />
                        No staff allocated yet — click <strong>Add Staff</strong> to get started.
                      </div>
                    )}
                    {!isAllocLoading && allocs.map(a => {
                      const pct = a.allocated_amount > 0 ? Math.min(100, Math.round((a.spent_amount / a.allocated_amount) * 100)) : 0;
                      const rem = a.allocated_amount - a.spent_amount;
                      return (
                        <div
                          key={a.id}
                          className="group/arow flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-sm bg-muted/20 hover:bg-muted/40 transition-colors"
                          data-testid={`row-staff-alloc-${a.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-[13px] truncate">{a.user_name}</div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 truncate">
                              {a.user_email} · {a.user_role?.replace(/_/g, ' ')}
                              {a.receipt_url && (
                                <a href={a.receipt_url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-0.5 text-sky-600 hover:text-sky-700 underline shrink-0"
                                  title="View receipt"
                                  data-testid={`link-receipt-${a.id}`}
                                  onClick={e => e.stopPropagation()}
                                >
                                  <Paperclip className="h-3 w-3" />Receipt
                                </a>
                              )}
                            </div>
                          </div>
                          {/* Amount + top-up button */}
                          <div className="text-right">
                            <div className="font-mono text-[12px] font-semibold flex items-center gap-1 justify-end">
                              {fund.currency} {formatNumber(a.allocated_amount, 0)}
                              <button
                                onClick={() => openTopUp(a, fund.id)}
                                className="opacity-0 group-hover/arow:opacity-100 text-muted-foreground hover:text-foreground transition-opacity ml-0.5"
                                title="Edit amount / upload receipt"
                                data-testid={`button-topup-alloc-${a.id}`}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {formatNumber(a.spent_amount, 0)} spent · {rem >= 0 ? formatNumber(rem, 0) : `−${formatNumber(-rem, 0)}`} left
                            </div>
                          </div>
                          {/* Mini progress */}
                          <div className="w-16 shrink-0 hidden sm:block">
                            <Progress
                              value={pct}
                              className={cn('h-1', pct >= 100 ? '[&>div]:bg-rose-500' : pct >= 80 ? '[&>div]:bg-amber-500' : '[&>div]:bg-sky-500')}
                            />
                            <span className="text-[9px] text-muted-foreground">{pct}%</span>
                          </div>
                          {/* Remove */}
                          <button
                            onClick={() => setRemoveId(a.id)}
                            className="opacity-0 group-hover/arow:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
                            title="Remove allocation"
                            data-testid={`button-remove-alloc-${a.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add Allocation Dialog */}
      <Dialog open={addDialog.open} onOpenChange={o => !o && setAddDialog({ open: false, fund: null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-sky-600" />
              Add Staff Allocation — {addDialog.fund?.name}
            </DialogTitle>
          </DialogHeader>
          {addDialog.fund && (
            <div className="space-y-4 py-2">
              {/* Fund summary */}
              <Alert className="border-sky-200 bg-sky-50 dark:bg-sky-950/20 py-2">
                <Info className="h-4 w-4 text-sky-600" />
                <AlertDescription className="text-xs text-sky-800 dark:text-sky-300">
                  Available to allocate:{' '}
                  <span className="font-mono font-semibold">
                    {formatNumber(
                      addDialog.fund.amount - (fundAllocs.get(addDialog.fund.id) ?? []).reduce((s, a) => s + Number(a.allocated_amount), 0),
                      0
                    )} {addDialog.fund.currency}
                  </span>
                </AlertDescription>
              </Alert>

              {/* Staff picker */}
              <div>
                <Label className="text-xs mb-1 block">Staff Member *</Label>
                {selectedUser ? (
                  <div className="flex items-center justify-between border rounded-md px-3 py-2 bg-muted/30">
                    <div>
                      <div className="text-sm font-medium">{selectedUser.full_name}</div>
                      <div className="text-[11px] text-muted-foreground">{selectedUser.email} · {selectedUser.role?.replace(/_/g, ' ')}</div>
                    </div>
                    <button onClick={() => setAddForm(p => ({ ...p, userId: '' }))} className="text-muted-foreground hover:text-foreground" data-testid="button-clear-user">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="relative mb-1">
                      <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={userSearch}
                        onChange={e => setUserSearch(e.target.value)}
                        placeholder="Search staff by name or email…"
                        className="pl-8 h-8 text-sm"
                        data-testid="input-user-search"
                      />
                    </div>
                    {userSearch.trim() && (
                      <div className="border border-border rounded-md max-h-40 overflow-y-auto divide-y divide-border">
                        {staffProfiles
                          .filter(p =>
                            (p.full_name?.toLowerCase().includes(userSearch.toLowerCase()) ||
                             p.email?.toLowerCase().includes(userSearch.toLowerCase())) &&
                            !(fundAllocs.get(addDialog.fund!.id) ?? []).some(a => a.user_id === p.id)
                          )
                          .slice(0, 8)
                          .map(p => (
                            <button
                              key={p.id}
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors flex items-center justify-between gap-2"
                              onClick={() => { setAddForm(prev => ({ ...prev, userId: p.id })); setUserSearch(''); }}
                              data-testid={`button-select-user-${p.id}`}
                            >
                              <div>
                                <div className="text-sm font-medium">{p.full_name || '(no name)'}</div>
                                <div className="text-[11px] text-muted-foreground">{p.email} · {p.role}</div>
                              </div>
                              <Plus className="h-4 w-4 text-sky-600 shrink-0" />
                            </button>
                          ))}
                        {staffProfiles.filter(p =>
                          p.full_name?.toLowerCase().includes(userSearch.toLowerCase()) ||
                          p.email?.toLowerCase().includes(userSearch.toLowerCase())
                        ).length === 0 && (
                          <p className="text-sm text-center text-muted-foreground py-3">No matching staff</p>
                        )}
                      </div>
                    )}
                    {!userSearch && <p className="text-[11px] text-muted-foreground mt-0.5">Type to search staff</p>}
                  </div>
                )}
              </div>

              {/* Amount */}
              <div>
                <Label className="text-xs mb-1 block">Amount ({addDialog.fund.currency}) *</Label>
                <Input
                  type="number"
                  value={addForm.amount}
                  onChange={e => setAddForm(p => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00"
                  className="h-8 text-sm"
                  data-testid="input-alloc-amount"
                />
              </div>

              {/* Notes */}
              <div>
                <Label className="text-xs mb-1 block">Notes (optional)</Label>
                <Input
                  value={addForm.notes}
                  onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Purpose of this allocation…"
                  className="h-8 text-sm"
                  data-testid="input-alloc-notes"
                />
              </div>

              {/* Receipt upload */}
              <div>
                <Label className="text-xs mb-1 block flex items-center gap-1">
                  <Paperclip className="h-3 w-3" />Receipt / Supporting Document (optional)
                </Label>
                {addReceiptFile ? (
                  <div className="flex items-center gap-2 border rounded-md px-3 py-1.5 bg-muted/30 text-sm">
                    <Paperclip className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                    <span className="truncate flex-1 text-[12px]">{addReceiptFile.name}</span>
                    <button onClick={() => setAddReceiptFile(null)} className="text-muted-foreground hover:text-destructive shrink-0" data-testid="button-clear-add-receipt">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 border border-dashed rounded-md px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors" data-testid="label-add-receipt-upload">
                    <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[12px] text-muted-foreground">Click to attach a receipt (image or PDF)</span>
                    <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => setAddReceiptFile(e.target.files?.[0] ?? null)} data-testid="input-add-receipt-file" />
                  </label>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddDialog({ open: false, fund: null }); setAddReceiptFile(null); }}>Cancel</Button>
            <Button onClick={handleAddAllocation} disabled={addSaving} data-testid="button-confirm-add-alloc">
              {addSaving ? 'Saving…' : 'Add Allocation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Top-Up / Edit Allocation Dialog */}
      <Dialog open={topUpDialog.open} onOpenChange={o => !o && setTopUpDialog({ open: false, alloc: null, fundId: '' })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-sky-600" />
              Edit Allocation — {topUpDialog.alloc?.user_name}
            </DialogTitle>
          </DialogHeader>
          {topUpDialog.alloc && (
            <div className="space-y-4 py-1">
              <div>
                <Label className="text-xs mb-1 block">New Amount ({topUpDialog.alloc.currency})</Label>
                <Input
                  type="number"
                  value={topUpAmt}
                  onChange={e => setTopUpAmt(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                  data-testid="input-topup-amount"
                />
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Currently allocated: {formatNumber(topUpDialog.alloc.allocated_amount, 0)} · Spent: {formatNumber(topUpDialog.alloc.spent_amount, 0)}
                </p>
              </div>
              <div>
                <Label className="text-xs mb-1 block flex items-center gap-1">
                  <Paperclip className="h-3 w-3" />Receipt / Supporting Document
                </Label>
                {topUpDialog.alloc.receipt_url && !topUpReceiptFile && (
                  <a href={topUpDialog.alloc.receipt_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sky-600 hover:text-sky-700 text-[12px] underline mb-1"
                  >
                    <ExternalLink className="h-3 w-3" />View current receipt
                  </a>
                )}
                {topUpReceiptFile ? (
                  <div className="flex items-center gap-2 border rounded-md px-3 py-1.5 bg-muted/30 text-sm">
                    <Paperclip className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                    <span className="truncate flex-1 text-[12px]">{topUpReceiptFile.name}</span>
                    <button onClick={() => setTopUpReceiptFile(null)} className="text-muted-foreground hover:text-destructive shrink-0" data-testid="button-clear-topup-receipt">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 border border-dashed rounded-md px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors" data-testid="label-topup-receipt-upload">
                    <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[12px] text-muted-foreground">
                      {topUpDialog.alloc.receipt_url ? 'Replace receipt…' : 'Attach receipt (image or PDF)'}
                    </span>
                    <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => setTopUpReceiptFile(e.target.files?.[0] ?? null)} data-testid="input-topup-receipt-file" />
                  </label>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTopUpDialog({ open: false, alloc: null, fundId: '' })}>Cancel</Button>
            <Button onClick={saveTopUp} disabled={topUpSaving} data-testid="button-confirm-topup">
              {topUpSaving ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <Dialog open={!!removeId} onOpenChange={o => !o && setRemoveId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />Remove Allocation
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will remove the staff member's allocation. Any payments already linked to this allocation will remain but become unattributed.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemoveAlloc} disabled={removing} data-testid="button-confirm-remove-alloc">
              {removing ? 'Removing…' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
