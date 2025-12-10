/**
 * RetainerDashboard Component
 * Comprehensive retainer management dashboard for Finance Admins and Operations Leads
 */

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { 
  DollarSign, 
  Clock, 
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Search,
  Filter,
  Plus,
  FileSignature,
  History,
  TrendingUp,
  TrendingDown,
  Users,
  Calendar,
  Download,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  XCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, differenceInDays, addDays } from 'date-fns';
import { SignaturePad } from '@/components/signature/SignaturePad';
import type { 
  Retainer, 
  RetainerStatus, 
  RetainerKPIs, 
  RetainerFilter,
  RetainerPriority,
  CreateRetainerRequest 
} from '@/types/retainer';

interface RetainerDashboardProps {
  userId: string;
  userRole: string;
  className?: string;
}

const statusConfig: Record<RetainerStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof Clock }> = {
  pending: { label: 'Pending', variant: 'secondary', icon: Clock },
  approved: { label: 'Approved', variant: 'default', icon: CheckCircle2 },
  released: { label: 'Released', variant: 'outline', icon: ArrowUpRight },
  expired: { label: 'Expired', variant: 'destructive', icon: AlertTriangle },
  cancelled: { label: 'Cancelled', variant: 'outline', icon: XCircle },
};

const priorityConfig: Record<RetainerPriority, { label: string; className: string }> = {
  low: { label: 'Low', className: 'bg-black/10 text-black dark:bg-white/10 dark:text-white' },
  normal: { label: 'Normal', className: 'bg-black/20 text-black dark:bg-white/20 dark:text-white' },
  high: { label: 'High', className: 'bg-black/40 text-black dark:bg-white/40 dark:text-white' },
  urgent: { label: 'Urgent', className: 'bg-black text-white dark:bg-white dark:text-black' },
};

export function RetainerDashboard({
  userId,
  userRole,
  className,
}: RetainerDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [retainers, setRetainers] = useState<Retainer[]>([]);
  const [kpis, setKpis] = useState<RetainerKPIs | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<RetainerStatus | 'all'>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [selectedRetainer, setSelectedRetainer] = useState<Retainer | null>(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [approvalSignature, setApprovalSignature] = useState<string | null>(null);
  const [approvalComments, setApprovalComments] = useState('');
  const [processing, setProcessing] = useState(false);

  const canManageRetainers = ['finance_admin', 'operations_lead', 'super_admin'].includes(userRole);
  const canApproveRetainers = ['finance_admin', 'super_admin'].includes(userRole);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Mock data for demonstration
      const mockRetainers: Retainer[] = [
        {
          id: '1',
          userId: 'user1',
          userName: 'Ahmed Hassan',
          userEmail: 'ahmed@example.com',
          projectId: 'proj1',
          projectName: 'Field Survey Q4',
          amountCents: 50000,
          currency: 'SDG',
          period: '2024-12',
          status: 'pending',
          priority: 'high',
          holdReason: 'Performance bond for field equipment',
          approvalStatus: 'pending',
          createdBy: userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '2',
          userId: 'user2',
          userName: 'Fatima Ali',
          userEmail: 'fatima@example.com',
          projectId: 'proj2',
          projectName: 'Data Collection Phase 2',
          amountCents: 75000,
          currency: 'SDG',
          period: '2024-12',
          status: 'approved',
          priority: 'normal',
          holdReason: 'Contract completion guarantee',
          approvalStatus: 'approved',
          approvedBy: 'admin1',
          approvedAt: new Date(Date.now() - 86400000).toISOString(),
          expiresAt: addDays(new Date(), 5).toISOString(),
          createdBy: userId,
          createdAt: new Date(Date.now() - 172800000).toISOString(),
          updatedAt: new Date(Date.now() - 86400000).toISOString(),
        },
        {
          id: '3',
          userId: 'user3',
          userName: 'Mohamed Osman',
          userEmail: 'mohamed@example.com',
          amountCents: 30000,
          currency: 'SDG',
          period: '2024-11',
          status: 'released',
          priority: 'low',
          holdReason: 'Monthly performance retainer',
          approvalStatus: 'approved',
          approvedBy: 'admin1',
          approvedAt: new Date(Date.now() - 604800000).toISOString(),
          releasedBy: 'admin1',
          releasedAt: new Date(Date.now() - 172800000).toISOString(),
          createdBy: userId,
          createdAt: new Date(Date.now() - 2592000000).toISOString(),
          updatedAt: new Date(Date.now() - 172800000).toISOString(),
        },
      ];

      const mockKPIs: RetainerKPIs = {
        totalOutstanding: 125000,
        totalOutstandingCount: 2,
        pendingApproval: 50000,
        pendingApprovalCount: 1,
        expiringThisWeek: 75000,
        expiringThisWeekCount: 1,
        releasedThisMonth: 30000,
        releasedThisMonthCount: 1,
        averageHoldDays: 15,
        currency: 'SDG',
      };

      setRetainers(mockRetainers);
      setKpis(mockKPIs);
    } catch (error) {
      console.error('Failed to load retainers:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredRetainers = useMemo(() => {
    return retainers.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          r.userName?.toLowerCase().includes(query) ||
          r.projectName?.toLowerCase().includes(query) ||
          r.holdReason?.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [retainers, statusFilter, searchQuery]);

  const handleApprove = async (retainer: Retainer) => {
    setSelectedRetainer(retainer);
    setShowApprovalDialog(true);
  };

  const handleConfirmApproval = async () => {
    if (!selectedRetainer || !approvalSignature) return;
    
    setProcessing(true);
    try {
      // Mock approval
      setRetainers(prev => prev.map(r => 
        r.id === selectedRetainer.id 
          ? { ...r, status: 'approved' as RetainerStatus, approvalStatus: 'approved', approvedBy: userId, approvedAt: new Date().toISOString() }
          : r
      ));
      setShowApprovalDialog(false);
      setApprovalSignature(null);
      setApprovalComments('');
      setSelectedRetainer(null);
    } catch (error) {
      console.error('Failed to approve retainer:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleRelease = async (retainer: Retainer) => {
    setProcessing(true);
    try {
      setRetainers(prev => prev.map(r => 
        r.id === retainer.id 
          ? { ...r, status: 'released' as RetainerStatus, releasedBy: userId, releasedAt: new Date().toISOString() }
          : r
      ));
    } catch (error) {
      console.error('Failed to release retainer:', error);
    } finally {
      setProcessing(false);
    }
  };

  const formatAmount = (cents: number, currency: string) => {
    return `${currency} ${(cents / 100).toLocaleString()}`;
  };

  if (loading) {
    return (
      <div className={cn('space-y-6', className)}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-kpi-outstanding">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Outstanding</p>
                <p className="text-2xl font-bold">
                  {kpis ? formatAmount(kpis.totalOutstanding, kpis.currency) : '-'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {kpis?.totalOutstandingCount || 0} retainers
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center">
                <DollarSign className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-kpi-pending">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Approval</p>
                <p className="text-2xl font-bold">
                  {kpis ? formatAmount(kpis.pendingApproval, kpis.currency) : '-'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {kpis?.pendingApprovalCount || 0} waiting
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center">
                <Clock className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-kpi-expiring">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Expiring This Week</p>
                <p className="text-2xl font-bold">
                  {kpis ? formatAmount(kpis.expiringThisWeek, kpis.currency) : '-'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {kpis?.expiringThisWeekCount || 0} retainers
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-kpi-released">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Released This Month</p>
                <p className="text-2xl font-bold">
                  {kpis ? formatAmount(kpis.releasedThisMonth, kpis.currency) : '-'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {kpis?.releasedThisMonthCount || 0} completed
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Retainer Management
              </CardTitle>
              <CardDescription>
                Manage holds, approvals, and releases
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadData}
                disabled={loading}
                data-testid="button-refresh-retainers"
                aria-label="Refresh retainers"
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                data-testid="button-export-retainers"
                aria-label="Export retainers"
              >
                <Download className="h-4 w-4" />
              </Button>
              {canManageRetainers && (
                <Button
                  onClick={() => setShowCreateDialog(true)}
                  data-testid="button-create-retainer"
                  aria-label="Create new retainer"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Retainer
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, project, or reason..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-retainers"
                aria-label="Search retainers"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as RetainerStatus | 'all')}>
              <SelectTrigger className="w-[180px]" data-testid="select-status-filter" aria-label="Filter by status">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="released">Released</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Retainer List */}
          <ScrollArea className="h-[500px]">
            <div className="space-y-4">
              {filteredRetainers.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No retainers found</p>
                </div>
              ) : (
                filteredRetainers.map((retainer) => {
                  const config = statusConfig[retainer.status];
                  const priorityCfg = priorityConfig[retainer.priority];
                  const StatusIcon = config.icon;
                  const daysUntilExpiry = retainer.expiresAt 
                    ? differenceInDays(new Date(retainer.expiresAt), new Date())
                    : null;

                  return (
                    <div
                      key={retainer.id}
                      className="border rounded-lg p-4 space-y-3"
                      data-testid={`retainer-item-${retainer.id}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{retainer.userName}</span>
                            <Badge variant={config.variant} className="text-xs">
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {config.label}
                            </Badge>
                            <Badge className={cn("text-xs", priorityCfg.className)}>
                              {priorityCfg.label}
                            </Badge>
                          </div>
                          {retainer.projectName && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {retainer.projectName}
                            </p>
                          )}
                          {retainer.holdReason && (
                            <p className="text-sm mt-2">{retainer.holdReason}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg">
                            {formatAmount(retainer.amountCents, retainer.currency)}
                          </p>
                          <p className="text-xs text-muted-foreground">{retainer.period}</p>
                        </div>
                      </div>

                      {daysUntilExpiry !== null && daysUntilExpiry <= 7 && daysUntilExpiry >= 0 && (
                        <Alert>
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>
                            Expires in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? 's' : ''}
                          </AlertDescription>
                        </Alert>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t">
                        <div className="text-xs text-muted-foreground">
                          Created {format(new Date(retainer.createdAt), 'MMM d, yyyy')}
                          {retainer.approvedAt && (
                            <span> | Approved {format(new Date(retainer.approvedAt), 'MMM d, yyyy')}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {canApproveRetainers && retainer.status === 'pending' && (
                            <Button
                              size="sm"
                              onClick={() => handleApprove(retainer)}
                              data-testid={`button-approve-${retainer.id}`}
                              aria-label={`Approve retainer for ${retainer.userName}`}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                          )}
                          {canApproveRetainers && retainer.status === 'approved' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRelease(retainer)}
                              data-testid={`button-release-${retainer.id}`}
                              aria-label={`Release retainer for ${retainer.userName}`}
                            >
                              <ArrowUpRight className="h-4 w-4 mr-1" />
                              Release
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            data-testid={`button-history-${retainer.id}`}
                            aria-label={`View history for ${retainer.userName}`}
                          >
                            <History className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Approval Dialog with Signature */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5" />
              Approve Retainer
            </DialogTitle>
            <DialogDescription>
              Review and sign to approve this retainer hold
            </DialogDescription>
          </DialogHeader>

          {selectedRetainer && (
            <div className="space-y-4">
              <div className="border rounded-lg p-4 bg-muted/30">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{selectedRetainer.userName}</p>
                    <p className="text-sm text-muted-foreground">{selectedRetainer.holdReason}</p>
                  </div>
                  <p className="font-bold">
                    {formatAmount(selectedRetainer.amountCents, selectedRetainer.currency)}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="comments">Comments (Optional)</Label>
                <Textarea
                  id="comments"
                  placeholder="Add any notes about this approval..."
                  value={approvalComments}
                  onChange={(e) => setApprovalComments(e.target.value)}
                  data-testid="textarea-approval-comments"
                  aria-label="Approval comments"
                />
              </div>

              {!approvalSignature ? (
                <div className="space-y-2">
                  <Label>Signature Required</Label>
                  <Button
                    variant="outline"
                    className="w-full h-24 border-dashed"
                    onClick={() => setShowSignaturePad(true)}
                    data-testid="button-add-signature"
                    aria-label="Add signature"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <FileSignature className="h-6 w-6" />
                      <span>Click to add your signature</span>
                    </div>
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Your Signature</Label>
                  <div className="border rounded-lg p-4 bg-white dark:bg-neutral-900">
                    <img src={approvalSignature} alt="Signature" className="h-16 mx-auto" />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setApprovalSignature(null)}
                    data-testid="button-clear-signature"
                    aria-label="Clear signature"
                  >
                    Clear and re-sign
                  </Button>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowApprovalDialog(false);
                setApprovalSignature(null);
                setApprovalComments('');
              }}
              data-testid="button-cancel-approval"
              aria-label="Cancel approval"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmApproval}
              disabled={!approvalSignature || processing}
              data-testid="button-confirm-approval"
              aria-label="Confirm approval"
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Approve Retainer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Signature Pad Dialog */}
      <Dialog open={showSignaturePad} onOpenChange={setShowSignaturePad}>
        <DialogContent className="max-w-lg p-0">
          <SignaturePad
            title="Sign to Approve"
            description="Draw your signature to authorize this retainer approval"
            onSignatureComplete={(data) => {
              setApprovalSignature(data);
              setShowSignaturePad(false);
            }}
            onCancel={() => setShowSignaturePad(false)}
            showSavedSignatures={false}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RetainerDashboard;
