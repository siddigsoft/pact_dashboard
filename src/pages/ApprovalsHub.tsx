import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { useUser } from '@/context/user/UserContext';
import { useWallet } from '@/context/wallet/WalletContext';
import { useToast } from '@/hooks/use-toast';
import { useApprovalsData, ApprovalItem, ApprovalItemType } from '@/hooks/useApprovalsData';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, Flame, Timer,
  RefreshCw, ExternalLink, Users, Wallet, DollarSign, Database,
  ClipboardList, ArrowRight, ChevronRight, Inbox, Filter,
  CheckCheck, Info, Landmark
} from 'lucide-react';
import { format, differenceInHours, differenceInDays } from 'date-fns';

const TYPE_LABELS: Record<ApprovalItemType, string> = {
  withdrawal: 'Withdrawal',
  cost: 'Cost',
  down_payment: 'Advance',
  user: 'User',
  mmp: 'MMP',
  pre_fund: 'Pre-Fund',
};

const TYPE_COLORS: Record<ApprovalItemType, { badge: string; bg: string; icon: string }> = {
  withdrawal:  { badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200', bg: 'border-l-blue-500', icon: 'text-blue-600' },
  cost:        { badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border-orange-200', bg: 'border-l-orange-500', icon: 'text-orange-600' },
  down_payment:{ badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200', bg: 'border-l-purple-500', icon: 'text-purple-600' },
  user:        { badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200', bg: 'border-l-emerald-500', icon: 'text-emerald-600' },
  mmp:         { badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-200', bg: 'border-l-indigo-500', icon: 'text-indigo-600' },
  pre_fund:    { badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 border-teal-200', bg: 'border-l-teal-500', icon: 'text-teal-600' },
};

const TYPE_ICONS: Record<ApprovalItemType, React.ElementType> = {
  withdrawal:  Wallet,
  cost:        ClipboardList,
  down_payment:DollarSign,
  user:        Users,
  mmp:         Database,
  pre_fund:    Landmark,
};

const URGENCY_CONFIG = {
  critical: { label: 'Critical', icon: Flame, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10' },
  high: { label: 'Overdue', icon: AlertTriangle, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/10' },
  medium: { label: 'Aging', icon: Timer, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' },
  normal: { label: 'New', icon: Clock, color: 'text-muted-foreground', bg: '' },
};

type SortOption = 'urgency' | 'oldest' | 'newest' | 'amount';
type FilterType = ApprovalItemType | 'all';

function formatCurrency(amount?: number, currency: string = 'SDG'): string {
  if (amount === undefined || amount === null) return '—';
  return new Intl.NumberFormat('en-SD', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatSubmittedAt(iso: string): string {
  try {
    const d = new Date(iso);
    const hours = differenceInHours(new Date(), d);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = differenceInDays(new Date(), d);
    if (days < 7) return `${days}d ago`;
    return format(d, 'MMM d, yyyy');
  } catch {
    return '—';
  }
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

interface ActionDialogState {
  item: ApprovalItem;
  action: 'approve' | 'reject';
}

export default function ApprovalsHub() {
  const navigate = useNavigate();
  const { currentUser } = useAppContext();
  const { isSuperAdmin } = useSuperAdmin();
  const { hasAnyRole } = useAuthorization();
  const { approveUser, rejectUser } = useUser();
  const { approveWithdrawalRequest, rejectWithdrawalRequest } = useWallet();
  const { toast } = useToast();

  const isAdmin = isSuperAdmin || hasAnyRole(['admin', 'Admin']);
  const isFinancialAdmin = hasAnyRole(['financialAdmin', 'financialadmin']);
  const isFOM = hasAnyRole(['fom', 'FOM', 'Field Operation Manager (FOM)']);
  const isSupervisor = hasAnyRole(['supervisor', 'Supervisor', 'hubSupervisor', 'hub_supervisor']);
  const isFinance = isAdmin || isFinancialAdmin || isFOM;

  const canAccess = isAdmin || isFinancialAdmin || isFOM || isSupervisor;

  const { items, loading, error, refresh } = useApprovalsData({
    currentUserId: currentUser?.id,
    hubId: currentUser?.hubId ?? null,
    roleIsSupervisor: isSupervisor && !isAdmin,
    roleIsFinance: isFinance,
    roleIsAdmin: isAdmin,
    roleIsFinancialAdmin: isFinancialAdmin,
    roleIsFOM: isFOM,
  });

  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [sortOption, setSortOption] = useState<SortOption>('urgency');
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'normal'>('all');
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const filteredItems = useMemo(() => {
    let result = [...items];

    if (typeFilter !== 'all') {
      result = result.filter(i => i.type === typeFilter);
    }

    if (urgencyFilter !== 'all') {
      result = result.filter(i => i.urgencyLevel === urgencyFilter);
    }

    switch (sortOption) {
      case 'oldest':
        result.sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
        break;
      case 'newest':
        result.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
        break;
      case 'amount':
        result.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
        break;
      case 'urgency':
      default: {
        const urgencyOrder = { critical: 0, high: 1, medium: 2, normal: 3 };
        result.sort((a, b) => {
          const diff = urgencyOrder[a.urgencyLevel] - urgencyOrder[b.urgencyLevel];
          if (diff !== 0) return diff;
          return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
        });
      }
    }

    return result;
  }, [items, typeFilter, urgencyFilter, sortOption]);

  const typeCounts = useMemo(() => {
    const counts: Partial<Record<FilterType, number>> = { all: items.length };
    items.forEach(i => {
      counts[i.type] = (counts[i.type] ?? 0) + 1;
    });
    return counts;
  }, [items]);

  const urgencyCounts = useMemo(() => {
    const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, normal: 0 };
    items.forEach(i => { counts[i.urgencyLevel]++; });
    return counts;
  }, [items]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const openActionDialog = (item: ApprovalItem, action: 'approve' | 'reject') => {
    setActionDialog({ item, action });
    setActionNotes('');
  };

  const handleConfirmAction = async () => {
    if (!actionDialog) return;
    const { item, action } = actionDialog;

    setProcessing(true);
    try {
      if (item.type === 'user') {
        const userId = item.rawData?.id;
        if (action === 'approve') {
          const ok = await approveUser(userId);
          if (ok) {
            toast({ title: 'User Approved', description: `${item.requesterName} has been approved.` });
          }
        } else {
          const ok = await rejectUser(userId);
          if (ok) {
            toast({ title: 'User Rejected', description: `${item.requesterName} has been rejected.` });
          }
        }
      } else if (item.type === 'withdrawal' && item.subtype === 'Supervisor') {
        const rawId = item.id;
        if (action === 'approve') {
          await approveWithdrawalRequest(rawId, actionNotes || 'Approved via Approvals Hub');
          toast({ title: 'Withdrawal Approved', description: `Forwarded to Finance for processing.` });
        } else {
          await rejectWithdrawalRequest(rawId, actionNotes || 'Rejected via Approvals Hub');
          toast({ title: 'Withdrawal Rejected', description: `Request has been rejected.` });
        }
      } else if (item.type === 'cost' && item.subtype === 'Tier 1') {
        const costId = item.rawData?.id;
        const now = new Date().toISOString();
        const updates = action === 'approve'
          ? {
              tier1_status: 'approved',
              tier1_approved_by: currentUser?.id,
              tier1_approved_at: now,
              tier1_notes: actionNotes || 'Approved via Approvals Hub',
              status: 'under_review',
            }
          : {
              tier1_status: 'rejected',
              tier1_approved_by: currentUser?.id,
              tier1_approved_at: now,
              tier1_notes: actionNotes || 'Rejected via Approvals Hub',
              rejection_reason: actionNotes || 'Rejected via Approvals Hub',
              status: 'rejected',
            };
        const { error } = await supabase
          .from('operational_cost_submissions')
          .update(updates)
          .eq('id', costId);
        if (error) throw error;
        toast({
          title: action === 'approve' ? 'Cost Approved' : 'Cost Rejected',
          description: action === 'approve' ? 'Forwarded for Tier 2 review.' : 'Submission has been rejected.',
        });
      } else if (item.type === 'cost' && item.subtype === 'Tier 2') {
        const costId = item.rawData?.id;
        const now = new Date().toISOString();
        const updates = action === 'approve'
          ? {
              tier2_status: 'approved',
              tier2_approved_by: currentUser?.id,
              tier2_approved_at: now,
              tier2_notes: actionNotes || 'Approved via Approvals Hub',
              status: 'approved',
            }
          : {
              tier2_status: 'rejected',
              tier2_approved_by: currentUser?.id,
              tier2_approved_at: now,
              tier2_notes: actionNotes || 'Rejected via Approvals Hub',
              rejection_reason: actionNotes || 'Rejected via Approvals Hub',
              status: 'rejected',
            };
        const { error } = await supabase
          .from('operational_cost_submissions')
          .update(updates)
          .eq('id', costId);
        if (error) throw error;

        if (action === 'approve') {
          // DB bridge trigger fires automatically; verify GL posting status
          await new Promise(r => setTimeout(r, 800));
          const { data: bridgeLog } = await supabase
            .from('acct_gl_bridge_log' as any)
            .select('status, error_message, created_at')
            .eq('source_table', 'operational_cost_submissions')
            .eq('source_id', costId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          const glStatus = (bridgeLog as any)?.status;
          toast({
            title: 'Cost Approved',
            description: glStatus === 'posted'
              ? 'Cost approved. GL journal entry posted automatically.'
              : glStatus === 'skipped'
              ? 'Cost approved. GL bridge skipped (posting engine disabled or period closed).'
              : 'Cost approved. GL posting in progress via bridge engine.',
          });
        } else {
          toast({ title: 'Cost Rejected', description: 'Submission has been rejected.' });
        }
      } else if (item.type === 'down_payment') {
        const dpId = item.rawData?.id;
        const now = new Date().toISOString();
        const updates = action === 'approve'
          ? { status: 'approved', approved_by: currentUser?.id, approved_at: now, approval_notes: actionNotes || 'Approved via Approvals Hub' }
          : { status: 'rejected', approved_by: currentUser?.id, approved_at: now, approval_notes: actionNotes || 'Rejected via Approvals Hub' };
        const { error } = await supabase
          .from('down_payment_requests')
          .update(updates)
          .eq('id', dpId);
        if (error) throw error;

        if (action === 'approve') {
          await new Promise(r => setTimeout(r, 800));
          const { data: bridgeLog } = await supabase
            .from('acct_gl_bridge_log' as any)
            .select('status, error_message, created_at')
            .eq('source_table', 'down_payment_requests')
            .eq('source_id', dpId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          const glStatus = (bridgeLog as any)?.status;
          toast({
            title: 'Advance Approved',
            description: glStatus === 'posted'
              ? 'Advance approved. GL journal entry posted automatically.'
              : 'Advance approved. GL bridge engine will post the journal entry.',
          });
        } else {
          toast({ title: 'Advance Rejected', description: 'Request has been rejected.' });
        }
      } else if (item.type === 'pre_fund') {
        // Step-aware pre-fund approval via pre_fund_approval_steps
        const fundId = item.rawData?.id;
        const now = new Date().toISOString();

        // 1. Find the current pending step for this fund (lowest step_order pending)
        const { data: stepsData } = await supabase
          .from('pre_fund_approval_steps' as any)
          .select('id, step_order, is_required, status')
          .eq('pre_fund_request_id', fundId)
          .order('step_order', { ascending: true });
        const steps: any[] = (stepsData as any) ?? [];
        const pendingStep = steps.find((s: any) => s.status === 'pending');

        // 2. Update the pending step (or fall back to updating fund directly if no steps)
        if (pendingStep) {
          const { error: stepErr } = await supabase
            .from('pre_fund_approval_steps' as any)
            .update({
              status: action === 'approve' ? 'approved' : 'rejected',
              approved_by: currentUser?.id ?? null,
              approved_at: now,
              notes: actionNotes || (action === 'approve' ? 'Approved via Approvals Hub' : 'Rejected via Approvals Hub'),
            })
            .eq('id', pendingStep.id);
          if (stepErr) throw stepErr;
        }

        // 3. Determine new fund status
        let newFundStatus: string | null = null;
        if (action === 'reject') {
          newFundStatus = 'rejected'; // now allowed by updated CHECK
        } else {
          // Check if any required steps remain pending after this approval
          const remainingRequired = steps.filter(
            (s: any) => s.id !== pendingStep?.id && s.status === 'pending' && s.is_required
          );
          if (remainingRequired.length === 0) {
            newFundStatus = 'awaiting_receipt'; // all required steps cleared
          }
          // else keep as pending_approval — more steps remain
        }

        // 4. Update fund-level columns
        const fundUpdate: any = {
          approved_by: action === 'approve' ? currentUser?.id : null,
          approved_at: action === 'approve' ? now : null,
          rejection_reason: action === 'reject' ? (actionNotes || 'Rejected via Approvals Hub') : null,
        };
        if (newFundStatus) fundUpdate.status = newFundStatus;

        const { error: fundErr } = await supabase
          .from('pre_fund_requests' as any)
          .update(fundUpdate)
          .eq('id', fundId);
        if (fundErr) throw fundErr;

        toast({
          title: action === 'approve' ? 'Pre-Fund Approved' : 'Pre-Fund Rejected',
          description: action === 'approve'
            ? newFundStatus === 'awaiting_receipt'
              ? 'All steps cleared — fund is awaiting receipt confirmation.'
              : 'Step approved. Further approval steps are pending.'
            : 'Pre-fund request has been rejected.',
        });
      }

      setActionDialog(null);
      setActionNotes('');
      await refresh();
    } catch (err) {
      console.error('Action failed:', err);
      toast({ title: 'Error', description: 'Action failed. Please try again.', variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  if (!canAccess) {
    return (
      <div className="container mx-auto px-4 py-16">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="text-destructive">Access Denied</CardTitle>
            <CardDescription>You don't have permission to access the Approvals Hub.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      <PageInfoBanner
        title="Approvals Hub"
        description="One inbox for every approval waiting on you — cost submissions, advance requests, leave applications, down-payments, withdrawals, payroll runs, and more. Filter by type, urgency, or amount. Click any item to review the full request and approve or reject inline. Items disappear from your queue the moment you act."
        descriptionAr="صندوق وارد واحد لكل طلب موافقة ينتظرك — تقديم التكاليف، طلبات السلف، طلبات الإجازة، الدفعات المقدمة، السحوبات، رواتب الدفع، والمزيد. صفِّ حسب النوع أو الأولوية أو المبلغ. انقر على أي عنصر لمراجعة الطلب الكامل والموافقة أو الرفض مباشرة. تختفي العناصر من قائمتك بمجرد اتخاذ الإجراء."
      />
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Inbox className="h-6 w-6 text-primary" />
            Approvals Hub
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            All pending approvals across every workflow in one place
          </p>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <Badge className="bg-red-500 text-white text-sm px-3 py-1" data-testid="badge-total-pending">
              {items.length} Pending
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            data-testid="button-refresh-approvals"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Urgency summary cards */}
      {!loading && items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {(['critical', 'high', 'medium', 'normal'] as const).map(level => {
            const cfg = URGENCY_CONFIG[level];
            const count = urgencyCounts[level] || 0;
            const Icon = cfg.icon;
            return (
              <button
                key={level}
                onClick={() => setUrgencyFilter(urgencyFilter === level ? 'all' : level)}
                className={`rounded-lg border p-3 text-left transition-all hover:shadow-sm ${
                  urgencyFilter === level ? 'ring-2 ring-primary ring-offset-1' : ''
                } ${count === 0 ? 'opacity-50' : ''}`}
                data-testid={`card-urgency-${level}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`h-4 w-4 ${cfg.color}`} />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{cfg.label}</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{count}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filter:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['all', 'withdrawal', 'cost', 'down_payment', 'user', 'mmp', 'pre_fund'] as FilterType[]).map(type => {
            const count = typeCounts[type] ?? 0;
            const isAll = type === 'all';
            const label = isAll ? 'All' : TYPE_LABELS[type as ApprovalItemType];
            return (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border transition-all ${
                  typeFilter === type
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                }`}
                data-testid={`filter-type-${type}`}
              >
                {label}
                {count > 0 && (
                  <span className={`inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[10px] font-bold ${
                    typeFilter === type ? 'bg-primary-foreground text-primary' : 'bg-muted text-muted-foreground'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="ml-auto">
          <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
            <SelectTrigger className="w-36 h-8 text-sm" data-testid="select-sort-approvals">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="urgency">By Urgency</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="amount">By Amount</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(n => (
            <Card key={n} className="border-l-4 border-l-muted">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
            <CheckCheck className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-1">All caught up!</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            {typeFilter === 'all'
              ? 'No pending approvals at this time.'
              : `No pending ${TYPE_LABELS[typeFilter as ApprovalItemType]} approvals.`}
          </p>
        </div>
      )}

      {/* Items list */}
      {!loading && filteredItems.length > 0 && (
        <div className="space-y-2">
          {filteredItems.map(item => (
            <ApprovalCard
              key={item.id}
              item={item}
              onApprove={() => openActionDialog(item, 'approve')}
              onReject={() => openActionDialog(item, 'reject')}
              onNavigate={() => navigate(item.navigationPath || '#')}
            />
          ))}
        </div>
      )}

      {/* Action confirmation dialog */}
      {actionDialog && (
        <Dialog open onOpenChange={() => !processing && setActionDialog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className={actionDialog.action === 'approve' ? 'text-emerald-600' : 'text-red-600'}>
                {actionDialog.action === 'approve' ? (
                  <span className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" />Confirm Approval</span>
                ) : (
                  <span className="flex items-center gap-2"><XCircle className="h-5 w-5" />Confirm Rejection</span>
                )}
              </DialogTitle>
              <DialogDescription>
                {actionDialog.action === 'approve'
                  ? `Approve the ${TYPE_LABELS[actionDialog.item.type]} request from ${actionDialog.item.requesterName}?`
                  : `Reject the ${TYPE_LABELS[actionDialog.item.type]} request from ${actionDialog.item.requesterName}?`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-medium">{TYPE_LABELS[actionDialog.item.type]} — {actionDialog.item.subtype}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Requester</span>
                  <span className="font-medium">{actionDialog.item.requesterName}</span>
                </div>
                {actionDialog.item.amount !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-medium">{formatCurrency(actionDialog.item.amount, actionDialog.item.currency)}</span>
                  </div>
                )}
              </div>
              {(actionDialog.item.type === 'withdrawal' || actionDialog.action === 'reject') && (
                <div>
                  <Label htmlFor="action-notes" className="text-sm">
                    Notes {actionDialog.action === 'reject' ? '(required)' : '(optional)'}
                  </Label>
                  <Textarea
                    id="action-notes"
                    value={actionNotes}
                    onChange={e => setActionNotes(e.target.value)}
                    placeholder={actionDialog.action === 'reject' ? 'Reason for rejection...' : 'Optional notes...'}
                    rows={3}
                    className="mt-1"
                    data-testid="textarea-action-notes"
                  />
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setActionDialog(null)} disabled={processing}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirmAction}
                disabled={processing || (actionDialog.action === 'reject' && !actionNotes.trim() && actionDialog.item.type !== 'user')}
                className={actionDialog.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}
                data-testid={`button-confirm-${actionDialog.action}`}
              >
                {processing ? (
                  <span className="flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5 animate-spin" />Processing...</span>
                ) : (
                  actionDialog.action === 'approve' ? 'Approve' : 'Reject'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

interface ApprovalCardProps {
  item: ApprovalItem;
  onApprove: () => void;
  onReject: () => void;
  onNavigate: () => void;
}

function ApprovalCard({ item, onApprove, onReject, onNavigate }: ApprovalCardProps) {
  const colors = TYPE_COLORS[item.type];
  const typeIcon = TYPE_ICONS[item.type];
  const TypeIcon = typeIcon;
  const urgency = URGENCY_CONFIG[item.urgencyLevel];
  const UrgencyIcon = urgency.icon;
  const isUrgent = item.urgencyLevel !== 'normal';

  return (
    <Card
      className={`border-l-4 ${colors.bg} transition-all duration-200 hover:shadow-md`}
      data-testid={`card-approval-${item.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <Avatar className="h-10 w-10 shrink-0 border-2 border-muted">
            <AvatarFallback className="bg-muted text-muted-foreground text-sm font-medium">
              {getInitials(item.requesterName)}
            </AvatarFallback>
          </Avatar>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-foreground truncate">{item.requesterName}</span>
              <Badge variant="outline" className={`text-[11px] px-1.5 py-0 h-5 border ${colors.badge}`}>
                <TypeIcon className="h-2.5 w-2.5 mr-1" />
                {TYPE_LABELS[item.type]}
                {item.subtype ? ` · ${item.subtype}` : ''}
              </Badge>
              {isUrgent && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className={`text-[11px] px-1.5 py-0 h-5 border-0 ${urgency.bg} ${urgency.color}`}>
                      <UrgencyIcon className="h-2.5 w-2.5 mr-1" />
                      {urgency.label}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Submitted {formatSubmittedAt(item.submittedAt)}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>

            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
              {item.description && (
                <span className="truncate max-w-xs" data-testid={`text-description-${item.id}`}>{item.description}</span>
              )}
              {item.requesterHub && (
                <span className="shrink-0">{item.requesterHub}</span>
              )}
              <span className="shrink-0" data-testid={`text-status-${item.id}`}>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted/60 font-medium text-[11px] text-muted-foreground border border-border/50">
                  {item.status.replace(/_/g, ' ')}
                </span>
              </span>
              <span className="shrink-0">{formatSubmittedAt(item.submittedAt)}</span>
            </div>
          </div>

          {/* Amount + actions */}
          <div className="flex items-center gap-2 shrink-0">
            {item.amount !== undefined && (
              <div className="text-right mr-1">
                <p className="text-base font-bold tabular-nums text-foreground" data-testid={`text-amount-${item.id}`}>
                  {formatCurrency(item.amount, item.currency)}
                </p>
              </div>
            )}

            {item.canInlineApprove ? (
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                  onClick={onApprove}
                  data-testid={`button-approve-${item.id}`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 border-red-300 text-red-600 hover:bg-red-50 text-xs"
                  onClick={onReject}
                  data-testid={`button-reject-${item.id}`}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                  Reject
                </Button>
              </div>
            ) : item.navigationPath ? (
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2.5 text-xs"
                onClick={onNavigate}
                data-testid={`button-view-${item.id}`}
              >
                Review
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
