import { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useDownPayment } from '@/context/downPayment/DownPaymentContext';
import { useUser } from '@/context/user/UserContext';
import { DownPaymentRequest, DownPaymentFilter, ApprovalType, DownPaymentStatus } from '@/types/down-payment';
import {
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  FileText,
  User,
  MapPin,
  AlertTriangle,
  Filter,
  Download,
  FileSpreadsheet,
  FileDown,
  Percent,
  History,
  ChevronDown,
  ChevronRight,
  Search,
  RefreshCw,
  CheckSquare,
  X,
  Calendar,
  Building,
  Globe,
  Activity,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { format } from 'date-fns';
import { filterDownPayments, exportToCSV, exportToExcel, exportToPDF, getDownPaymentStats } from '@/utils/downPaymentExport';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface DownPaymentApprovalPanelProps {
  userRole: 'supervisor' | 'admin';
}

const STATUS_OPTIONS: { value: DownPaymentStatus; label: string }[] = [
  { value: 'pending_supervisor', label: 'Pending Supervisor' },
  { value: 'pending_admin', label: 'Pending Admin' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'partially_paid', label: 'Partially Paid' },
  { value: 'fully_paid', label: 'Fully Paid' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function DownPaymentApprovalPanel({ userRole }: DownPaymentApprovalPanelProps) {
  const { currentUser } = useUser();
  const { requests, loading, refreshRequests, supervisorApprove, supervisorReject, adminApprove, adminReject, processPayment, bulkApprove } = useDownPayment();

  const [selectedRequest, setSelectedRequest] = useState<DownPaymentRequest | null>(null);
  const [action, setAction] = useState<'approve' | 'reject' | 'pay' | 'view_audit' | null>(null);
  const [notes, setNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [approvalType, setApprovalType] = useState<ApprovalType>('full');
  const [customPercentage, setCustomPercentage] = useState(100);
  const [customAmount, setCustomAmount] = useState(0);

  const [filters, setFilters] = useState<DownPaymentFilter>({});

  const uniqueHubs = useMemo(() => [...new Set(requests.map(r => r.hubName).filter(Boolean))], [requests]);
  const uniqueStates = useMemo(() => [...new Set(requests.map(r => r.stateName).filter(Boolean))], [requests]);
  const uniqueLocalities = useMemo(() => [...new Set(requests.map(r => r.localityName).filter(Boolean))], [requests]);

  const filteredRequests = useMemo(() => filterDownPayments(requests, filters), [requests, filters]);
  const stats = useMemo(() => getDownPaymentStats(filteredRequests), [filteredRequests]);

  const pendingRequests = useMemo(() => {
    if (userRole === 'supervisor') {
      return filteredRequests.filter(req => req.status === 'pending_supervisor');
    }
    return filteredRequests.filter(req => req.status === 'pending_admin');
  }, [filteredRequests, userRole]);

  const processingRequests = useMemo(() => {
    if (userRole === 'admin') {
      return filteredRequests.filter(req => req.status === 'approved' || req.status === 'partially_paid');
    }
    return filteredRequests.filter(req => req.status === 'pending_admin');
  }, [filteredRequests, userRole]);

  const completedRequests = useMemo(() => {
    return filteredRequests.filter(req => 
      req.status === 'fully_paid' || req.status === 'rejected' || req.status === 'cancelled'
    );
  }, [filteredRequests]);

  const calculateApprovedAmount = () => {
    if (!selectedRequest) return 0;
    switch (approvalType) {
      case 'full':
        return selectedRequest.requestedAmount;
      case 'half':
        return selectedRequest.requestedAmount / 2;
      case 'percentage':
        return selectedRequest.requestedAmount * (customPercentage / 100);
      case 'custom':
        return customAmount;
      default:
        return selectedRequest.requestedAmount;
    }
  };

  const handleApprove = async () => {
    if (!selectedRequest || !currentUser) return;

    const finalAmount = calculateApprovedAmount();
    
    setProcessing(true);
    const success = userRole === 'supervisor'
      ? await supervisorApprove({
          requestId: selectedRequest.id,
          approvedBy: currentUser.id,
          approvedByName: currentUser.displayName || currentUser.email,
          notes,
          approvalType,
          approvalPercentage: approvalType === 'percentage' ? customPercentage : undefined,
          customAmount: approvalType === 'custom' || approvalType === 'half' ? finalAmount : undefined,
        })
      : await adminApprove({
          requestId: selectedRequest.id,
          approvedBy: currentUser.id,
          approvedByName: currentUser.displayName || currentUser.email,
          notes,
          approvalType,
          approvalPercentage: approvalType === 'percentage' ? customPercentage : undefined,
          customAmount: approvalType === 'custom' || approvalType === 'half' ? finalAmount : undefined,
        });

    setProcessing(false);
    if (success) {
      closeDialog();
    }
  };

  const handleReject = async () => {
    if (!selectedRequest || !currentUser) return;

    if (!rejectionReason.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }

    setProcessing(true);
    const success = userRole === 'supervisor'
      ? await supervisorReject({
          requestId: selectedRequest.id,
          rejectedBy: currentUser.id,
          rejectedByName: currentUser.displayName || currentUser.email,
          rejectionReason,
        })
      : await adminReject({
          requestId: selectedRequest.id,
          rejectedBy: currentUser.id,
          rejectedByName: currentUser.displayName || currentUser.email,
          rejectionReason,
        });

    setProcessing(false);
    if (success) {
      closeDialog();
    }
  };

  const handleProcessPayment = async () => {
    if (!selectedRequest || !currentUser) return;

    if (paymentAmount <= 0) {
      alert('Please enter a valid payment amount');
      return;
    }

    setProcessing(true);
    const success = await processPayment({
      requestId: selectedRequest.id,
      amount: paymentAmount,
      processedBy: currentUser.id,
      processedByName: currentUser.displayName || currentUser.email,
      notes,
    });

    setProcessing(false);
    if (success) {
      closeDialog();
    }
  };

  const handleBulkApprove = async () => {
    if (!currentUser || selectedIds.size === 0) return;

    setProcessing(true);
    await bulkApprove({
      requestIds: Array.from(selectedIds),
      approvalType,
      approvalPercentage: approvalType === 'percentage' ? customPercentage : undefined,
      customAmount: approvalType === 'custom' ? customAmount : undefined,
      notes,
      approvedBy: currentUser.id,
      approvedByName: currentUser.displayName || currentUser.email,
    });
    setProcessing(false);
    setSelectedIds(new Set());
    closeDialog();
  };

  const closeDialog = () => {
    setSelectedRequest(null);
    setAction(null);
    setNotes('');
    setRejectionReason('');
    setPaymentAmount(0);
    setApprovalType('full');
    setCustomPercentage(100);
    setCustomAmount(0);
  };

  const openActionDialog = (request: DownPaymentRequest, actionType: 'approve' | 'reject' | 'pay' | 'view_audit') => {
    setSelectedRequest(request);
    setAction(actionType);
    if (actionType === 'pay') {
      setPaymentAmount(request.remainingAmount || request.requestedAmount);
    }
    if (actionType === 'approve') {
      setCustomAmount(request.requestedAmount);
    }
  };

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const selectAll = (reqs: DownPaymentRequest[]) => {
    setSelectedIds(new Set(reqs.map(r => r.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const resetFilters = () => {
    setFilters({});
  };

  const handleExport = (type: 'csv' | 'excel' | 'pdf') => {
    const data = filteredRequests;
    if (type === 'csv') {
      exportToCSV(data, 'down-payments');
    } else if (type === 'excel') {
      exportToExcel(data, 'down-payments');
    } else {
      exportToPDF(data, {
        filters,
        includeAuditLog: true,
        includeSignature: false,
        reportTitle: 'Down-Payment Requests Report',
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any; color?: string }> = {
      pending_supervisor: { variant: 'secondary', icon: Clock },
      pending_admin: { variant: 'outline', icon: Clock },
      approved: { variant: 'default', icon: CheckCircle2 },
      rejected: { variant: 'destructive', icon: XCircle },
      partially_paid: { variant: 'outline', icon: DollarSign },
      fully_paid: { variant: 'default', icon: CheckCircle2 },
      cancelled: { variant: 'secondary', icon: X },
    };

    const config = statusMap[status] || { variant: 'secondary' as const, icon: Clock };
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {status.replace(/_/g, ' ').toUpperCase()}
      </Badge>
    );
  };

  const WorkflowTimeline = ({ request }: { request: DownPaymentRequest }) => {
    const status = request.status;
    const supervisorPassed = status !== 'pending_supervisor';
    const adminPassed = status === 'approved' || status === 'partially_paid' || status === 'fully_paid';
    const isComplete = status === 'fully_paid';
    const isRejected = status === 'rejected';
    
    const steps = [
      { key: 'submitted', label: 'Submitted', done: true },
      { key: 'supervisor', label: 'Supervisor', done: supervisorPassed && !isRejected },
      { key: 'admin', label: 'Admin', done: adminPassed },
      { key: 'complete', label: 'Complete', done: isComplete },
    ];
    
    const rejectedStep = isRejected 
      ? ((request as any).adminRejectedById ? 2 : 1)
      : -1;
    
    return (
      <div className="flex items-center gap-1 text-xs">
        {steps.map((step, idx) => (
          <div key={step.key} className="flex items-center">
            <div className={`w-2 h-2 rounded-full ${
              rejectedStep === idx 
                ? 'bg-red-500' 
                : isRejected && idx > rejectedStep
                  ? 'bg-muted-foreground/30'
                  : step.done 
                    ? 'bg-emerald-500' 
                    : 'bg-muted-foreground/30'
            }`} />
            {idx < steps.length - 1 && (
              <div className={`w-4 h-0.5 ${
                step.done && steps[idx + 1]?.done 
                  ? 'bg-emerald-500' 
                  : 'bg-muted-foreground/30'
              }`} />
            )}
          </div>
        ))}
        <span className="ml-1 text-muted-foreground">{
          status === 'rejected' ? 'Rejected' :
          status === 'fully_paid' ? 'Completed' :
          status === 'partially_paid' ? 'Partial Payment' :
          status === 'approved' ? 'Approved' :
          status === 'pending_admin' ? 'With Admin' :
          'Pending Supervisor'
        }</span>
      </div>
    );
  };

  const RequestCard = ({ request, showCheckbox = false }: { request: DownPaymentRequest; showCheckbox?: boolean }) => (
    <Card key={request.id} className="hover-elevate" data-testid={`card-request-${request.id}`}>
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex justify-between items-start gap-2">
            <div className="flex items-start gap-2">
              {showCheckbox && (
                <Checkbox
                  checked={selectedIds.has(request.id)}
                  onCheckedChange={() => toggleSelection(request.id)}
                  className="mt-1"
                  data-testid={`checkbox-select-${request.id}`}
                />
              )}
              <div>
                <h4 className="font-medium flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  {request.siteName}
                </h4>
                <div className="text-sm text-muted-foreground space-y-0.5 mt-1">
                  <p className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {request.requestedByName || 'Unknown'} - {format(new Date(request.requestedAt), 'MMM d, yyyy')}
                  </p>
                  {request.hubName && (
                    <p className="flex items-center gap-1">
                      <Building className="h-3 w-3" />
                      {request.hubName}
                    </p>
                  )}
                  {request.stateName && (
                    <p className="flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      {request.stateName}{request.localityName ? ` / ${request.localityName}` : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>
            {getStatusBadge(request.status)}
          </div>

          <div className="mt-2">
            <WorkflowTimeline request={request} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <Label className="text-xs text-muted-foreground">Budget</Label>
              <p className="font-medium">{request.totalTransportationBudget.toLocaleString()} SDG</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Requested</Label>
              <p className="font-medium text-primary">{request.requestedAmount.toLocaleString()} SDG</p>
            </div>
            {request.approvedAmount && (
              <div>
                <Label className="text-xs text-muted-foreground">Approved</Label>
                <p className="font-medium text-green-600">{request.approvedAmount.toLocaleString()} SDG</p>
              </div>
            )}
            {request.remainingAmount > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground">Remaining</Label>
                <p className="font-medium text-orange-600">{request.remainingAmount.toLocaleString()} SDG</p>
              </div>
            )}
          </div>

          {request.justification && (
            <div className="bg-muted/50 p-3 rounded-md">
              <Label className="text-xs flex items-center gap-1 mb-1">
                <FileText className="h-3 w-3" />
                Justification
              </Label>
              <p className="text-sm line-clamp-2">{request.justification}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {userRole === 'supervisor' && request.status === 'pending_supervisor' && (
              <>
                <Button
                  size="sm"
                  onClick={() => openActionDialog(request, 'approve')}
                  data-testid={`button-approve-${request.id}`}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => openActionDialog(request, 'reject')}
                  data-testid={`button-reject-${request.id}`}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Reject
                </Button>
              </>
            )}

            {userRole === 'admin' && request.status === 'pending_admin' && (
              <>
                <Button
                  size="sm"
                  onClick={() => openActionDialog(request, 'approve')}
                  data-testid={`button-admin-approve-${request.id}`}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => openActionDialog(request, 'reject')}
                  data-testid={`button-admin-reject-${request.id}`}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Reject
                </Button>
              </>
            )}

            {userRole === 'admin' && (request.status === 'approved' || request.status === 'partially_paid') && (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => openActionDialog(request, 'pay')}
                data-testid={`button-process-payment-${request.id}`}
              >
                <DollarSign className="h-4 w-4 mr-1" />
                Process Payment
              </Button>
            )}

            {request.auditLog && request.auditLog.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => openActionDialog(request, 'view_audit')}
                data-testid={`button-view-audit-${request.id}`}
              >
                <History className="h-4 w-4 mr-1" />
                Audit ({request.auditLog.length})
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const StatsCards = () => (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
      <Card>
        <CardContent className="p-4">
          <div className="text-2xl font-bold">{stats.counts.total}</div>
          <div className="text-sm text-muted-foreground">Total Requests</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-2xl font-bold text-yellow-600">{stats.counts.pendingSupervisor + stats.counts.pendingAdmin}</div>
          <div className="text-sm text-muted-foreground">Pending</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-2xl font-bold text-green-600">{stats.amounts.totalPaid.toLocaleString()}</div>
          <div className="text-sm text-muted-foreground">Total Paid (SDG)</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-2xl font-bold text-orange-600">{stats.amounts.totalRemaining.toLocaleString()}</div>
          <div className="text-sm text-muted-foreground">Remaining (SDG)</div>
        </CardContent>
      </Card>
    </div>
  );

  const FilterPanel = () => (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </h3>
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={filters.searchTerm || ''}
                onChange={e => setFilters(f => ({ ...f, searchTerm: e.target.value }))}
                className="pl-8"
                data-testid="input-filter-search"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Hub</Label>
            <Select
              value={filters.hubId || 'all'}
              onValueChange={v => setFilters(f => ({ ...f, hubId: v === 'all' ? undefined : v }))}
            >
              <SelectTrigger data-testid="select-filter-hub">
                <SelectValue placeholder="All Hubs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Hubs</SelectItem>
                {uniqueHubs.map(hub => (
                  <SelectItem key={hub} value={hub || ''}>{hub}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">State</Label>
            <Select
              value={filters.stateName || 'all'}
              onValueChange={v => setFilters(f => ({ ...f, stateName: v === 'all' ? undefined : v }))}
            >
              <SelectTrigger data-testid="select-filter-state">
                <SelectValue placeholder="All States" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {uniqueStates.map(state => (
                  <SelectItem key={state} value={state || ''}>{state}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Locality</Label>
            <Select
              value={filters.localityName || 'all'}
              onValueChange={v => setFilters(f => ({ ...f, localityName: v === 'all' ? undefined : v }))}
            >
              <SelectTrigger data-testid="select-filter-locality">
                <SelectValue placeholder="All Localities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Localities</SelectItem>
                {uniqueLocalities.map(loc => (
                  <SelectItem key={loc} value={loc || ''}>{loc}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Date From</Label>
            <Input
              type="date"
              value={filters.dateFrom || ''}
              onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value || undefined }))}
              data-testid="input-filter-date-from"
            />
          </div>
          <div>
            <Label className="text-xs">Date To</Label>
            <Input
              type="date"
              value={filters.dateTo || ''}
              onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value || undefined }))}
              data-testid="input-filter-date-to"
            />
          </div>
          <div>
            <Label className="text-xs">Min Amount (SDG)</Label>
            <Input
              type="number"
              placeholder="0"
              value={filters.amountMin || ''}
              onChange={e => setFilters(f => ({ ...f, amountMin: e.target.value ? parseFloat(e.target.value) : undefined }))}
              data-testid="input-filter-amount-min"
            />
          </div>
          <div>
            <Label className="text-xs">Max Amount (SDG)</Label>
            <Input
              type="number"
              placeholder="No limit"
              value={filters.amountMax || ''}
              onChange={e => setFilters(f => ({ ...f, amountMax: e.target.value ? parseFloat(e.target.value) : undefined }))}
              data-testid="input-filter-amount-max"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const hasHubId = !!currentUser?.hubId;

  return (
    <>
      {userRole === 'supervisor' && !hasHubId && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Hub Configuration Missing:</strong> Your profile doesn't have a hub assigned. 
            You can only see your own requests. Please contact an administrator to assign you to a hub 
            so you can review requests from your team members.
          </AlertDescription>
        </Alert>
      )}

      <StatsCards />

      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Button
            variant={showFilters ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            data-testid="button-toggle-filters"
          >
            <Filter className="h-4 w-4 mr-1" />
            Filters
            {Object.values(filters).some(v => v !== undefined && v !== '') && (
              <Badge variant="secondary" className="ml-1">Active</Badge>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refreshRequests()} disabled={loading} data-testid="button-refresh">
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-export">
                <Download className="h-4 w-4 mr-1" />
                Export
                <ChevronDown className="h-4 w-4 ml-1" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-1">
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => handleExport('csv')} data-testid="button-export-csv">
                <FileDown className="h-4 w-4 mr-2" />
                CSV
              </Button>
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => handleExport('excel')} data-testid="button-export-excel">
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel
              </Button>
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => handleExport('pdf')} data-testid="button-export-pdf">
                <FileText className="h-4 w-4 mr-2" />
                PDF
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {showFilters && <FilterPanel />}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-4">
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending
            <Badge variant="secondary" className="ml-2">{pendingRequests.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="processing" data-testid="tab-processing">
            Processing
            <Badge variant="secondary" className="ml-2">{processingRequests.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed">
            Completed
            <Badge variant="secondary" className="ml-2">{completedRequests.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all">
            All
            <Badge variant="secondary" className="ml-2">{filteredRequests.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          {selectedIds.size > 0 && pendingRequests.length > 0 && (
            <Card className="mb-4 border-primary">
              <CardContent className="p-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <CheckSquare className="h-5 w-5 text-primary" />
                  <span className="font-medium">{selectedIds.size} selected</span>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={approvalType} onValueChange={v => setApprovalType(v as ApprovalType)}>
                    <SelectTrigger className="w-32" data-testid="select-bulk-approval-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Full Amount</SelectItem>
                      <SelectItem value="half">50%</SelectItem>
                      <SelectItem value="percentage">Custom %</SelectItem>
                    </SelectContent>
                  </Select>
                  {approvalType === 'percentage' && (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        value={customPercentage}
                        onChange={e => setCustomPercentage(parseFloat(e.target.value) || 0)}
                        className="w-16"
                        min={1}
                        max={100}
                        data-testid="input-bulk-percentage"
                      />
                      <span>%</span>
                    </div>
                  )}
                  <Button size="sm" onClick={handleBulkApprove} disabled={processing} data-testid="button-bulk-approve">
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Approve All
                  </Button>
                  <Button size="sm" variant="ghost" onClick={clearSelection} data-testid="button-clear-selection">
                    Clear
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {pendingRequests.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No pending requests</CardContent></Card>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Button variant="ghost" size="sm" onClick={() => selectAll(pendingRequests)} data-testid="button-select-all">
                  Select All
                </Button>
              </div>
              {pendingRequests.map(request => (
                <RequestCard key={request.id} request={request} showCheckbox />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="processing">
          {processingRequests.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No requests in processing</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {processingRequests.map(request => (
                <RequestCard key={request.id} request={request} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed">
          {completedRequests.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No completed requests</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {completedRequests.map(request => (
                <RequestCard key={request.id} request={request} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all">
          {filteredRequests.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No requests found</CardContent></Card>
          ) : (
            <div className="space-y-3">
              {filteredRequests.map(request => (
                <RequestCard key={request.id} request={request} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={action === 'approve'} onOpenChange={() => closeDialog()}>
        <DialogContent data-testid="dialog-approve">
          <DialogHeader>
            <DialogTitle>Approve Request</DialogTitle>
            <DialogDescription>
              Choose the approval amount and add any notes.
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-3 rounded-md space-y-2">
                <p><strong>Site:</strong> {selectedRequest.siteName}</p>
                <p><strong>Requested Amount:</strong> {selectedRequest.requestedAmount.toLocaleString()} SDG</p>
              </div>

              <div className="space-y-3">
                <Label>Approval Amount</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={approvalType === 'full' ? 'default' : 'outline'}
                    onClick={() => setApprovalType('full')}
                    data-testid="button-approval-full"
                  >
                    Full Amount
                  </Button>
                  <Button
                    variant={approvalType === 'half' ? 'default' : 'outline'}
                    onClick={() => setApprovalType('half')}
                    data-testid="button-approval-half"
                  >
                    50%
                  </Button>
                  <Button
                    variant={approvalType === 'percentage' ? 'default' : 'outline'}
                    onClick={() => setApprovalType('percentage')}
                    data-testid="button-approval-percentage"
                  >
                    <Percent className="h-4 w-4 mr-1" />
                    Custom %
                  </Button>
                  <Button
                    variant={approvalType === 'custom' ? 'default' : 'outline'}
                    onClick={() => setApprovalType('custom')}
                    data-testid="button-approval-custom"
                  >
                    <DollarSign className="h-4 w-4 mr-1" />
                    Fixed Amount
                  </Button>
                </div>

                {approvalType === 'percentage' && (
                  <div className="flex items-center gap-2">
                    <Label>Percentage:</Label>
                    <Input
                      type="number"
                      value={customPercentage}
                      onChange={e => setCustomPercentage(parseFloat(e.target.value) || 0)}
                      min={1}
                      max={100}
                      className="w-24"
                      data-testid="input-custom-percentage"
                    />
                    <span>%</span>
                  </div>
                )}

                {approvalType === 'custom' && (
                  <div className="flex items-center gap-2">
                    <Label>Amount (SDG):</Label>
                    <Input
                      type="number"
                      value={customAmount}
                      onChange={e => setCustomAmount(parseFloat(e.target.value) || 0)}
                      max={selectedRequest.requestedAmount}
                      className="w-32"
                      data-testid="input-custom-amount"
                    />
                  </div>
                )}

                <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-md">
                  <p className="text-sm text-green-700 dark:text-green-300">
                    <strong>Approved Amount:</strong> {calculateApprovedAmount().toLocaleString()} SDG
                    {approvalType === 'percentage' && ` (${customPercentage}% of ${selectedRequest.requestedAmount.toLocaleString()})`}
                    {approvalType === 'half' && ` (50% of ${selectedRequest.requestedAmount.toLocaleString()})`}
                  </p>
                </div>
              </div>

              <div>
                <Label htmlFor="approval-notes">Notes (Optional)</Label>
                <Textarea
                  id="approval-notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add any notes or comments..."
                  rows={3}
                  data-testid="textarea-approval-notes"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel-approve">
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={processing} data-testid="button-confirm-approve">
              {processing ? 'Processing...' : 'Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={action === 'reject'} onOpenChange={() => closeDialog()}>
        <DialogContent data-testid="dialog-reject">
          <DialogHeader>
            <DialogTitle>Reject Request</DialogTitle>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-3 rounded-md space-y-2">
                <p><strong>Site:</strong> {selectedRequest.siteName}</p>
                <p><strong>Amount:</strong> {selectedRequest.requestedAmount.toLocaleString()} SDG</p>
              </div>

              <div>
                <Label htmlFor="rejection-reason">Rejection Reason *</Label>
                <Textarea
                  id="rejection-reason"
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  placeholder="Explain why this request is being rejected..."
                  rows={3}
                  data-testid="textarea-rejection-reason"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel-reject">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={processing} data-testid="button-confirm-reject">
              {processing ? 'Processing...' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={action === 'pay'} onOpenChange={() => closeDialog()}>
        <DialogContent data-testid="dialog-payment">
          <DialogHeader>
            <DialogTitle>Process Payment</DialogTitle>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-3 rounded-md space-y-2">
                <p><strong>Site:</strong> {selectedRequest.siteName}</p>
                <p><strong>Requested:</strong> {selectedRequest.requestedAmount.toLocaleString()} SDG</p>
                <p><strong>Remaining:</strong> {selectedRequest.remainingAmount.toLocaleString()} SDG</p>
              </div>

              <div>
                <Label htmlFor="payment-amount">Payment Amount (SDG)</Label>
                <Input
                  id="payment-amount"
                  type="number"
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(parseFloat(e.target.value) || 0)}
                  max={selectedRequest.remainingAmount}
                  data-testid="input-payment-amount"
                />
              </div>

              <div>
                <Label htmlFor="payment-notes">Notes (Optional)</Label>
                <Textarea
                  id="payment-notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add payment notes..."
                  rows={2}
                  data-testid="textarea-payment-notes"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel-payment">
              Cancel
            </Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={handleProcessPayment} disabled={processing} data-testid="button-confirm-payment">
              {processing ? 'Processing...' : 'Process Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={action === 'view_audit'} onOpenChange={() => closeDialog()}>
        <DialogContent className="max-w-2xl" data-testid="dialog-audit">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Audit History
            </DialogTitle>
          </DialogHeader>

          {selectedRequest && (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-3">
                {selectedRequest.auditLog && selectedRequest.auditLog.length > 0 ? (
                  selectedRequest.auditLog.map((entry, idx) => (
                    <div key={entry.id || idx} className="flex items-start gap-3 p-3 bg-muted/50 rounded-md">
                      <div className="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-primary" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium capitalize">
                            {entry.action.replace(/_/g, ' ')}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(entry.timestamp), 'MMM d, yyyy h:mm a')}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          By: {entry.performedByName || entry.performedBy}
                          {entry.performedByRole && ` (${entry.performedByRole})`}
                        </p>
                        {entry.notes && (
                          <p className="text-sm mt-1">{entry.notes}</p>
                        )}
                        {(entry.previousValue || entry.newValue) && (
                          <div className="text-xs mt-2 p-2 bg-background rounded">
                            {entry.previousValue && <span>Previous: {JSON.stringify(entry.previousValue)} </span>}
                            {entry.newValue && <span>New: {JSON.stringify(entry.newValue)}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-muted-foreground py-4">No audit entries</p>
                )}
              </div>
            </ScrollArea>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-close-audit">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
