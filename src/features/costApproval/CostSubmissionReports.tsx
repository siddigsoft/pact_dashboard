import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/shared/hooks/use-toast";
import { 
  ChevronLeft, 
  Download, 
  FileSpreadsheet, 
  FileText, 
  Filter, 
  DollarSign,
  Wallet,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  Building2,
  Users,
  Receipt,
  RefreshCw,
  X
} from "lucide-react";
import { format } from "date-fns";
import { 
  CostSubmissionStatus, 
  CostRequestType,
  BalanceStatus,
  COST_REQUEST_TYPE_LABELS,
  BALANCE_STATUS_LABELS,
  BUDGET_LINE_LABELS,
  BudgetLineCategory,
  EnhancedCostRequest,
  CostReportData
} from "@/types/cost-submission";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const STATUS_CONFIG: Record<CostSubmissionStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
  pending: { label: 'Pending', variant: 'secondary', icon: Clock },
  under_review: { label: 'Under Review', variant: 'outline', icon: Clock },
  approved: { label: 'Approved', variant: 'default', icon: CheckCircle },
  rejected: { label: 'Rejected', variant: 'destructive', icon: X },
  disbursed: { label: 'Disbursed', variant: 'default', icon: Wallet },
  reconciliation_pending: { label: 'Reconciliation Pending', variant: 'secondary', icon: AlertTriangle },
  reconciled: { label: 'Reconciled', variant: 'default', icon: CheckCircle },
  paid: { label: 'Paid', variant: 'default', icon: CheckCircle },
  closed: { label: 'Closed', variant: 'outline', icon: CheckCircle },
  cancelled: { label: 'Cancelled', variant: 'destructive', icon: X },
};

interface CostSubmissionReportsProps {
  requests?: EnhancedCostRequest[];
  projects?: Array<{ id: string; name: string }>;
  isLoading?: boolean;
}

export default function CostSubmissionReports({ 
  requests = [], 
  projects = [],
  isLoading = false 
}: CostSubmissionReportsProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState<'all' | 'advances' | 'reimbursements' | 'outstanding'>('all');
  const [filters, setFilters] = useState({
    projectId: '',
    status: '' as CostSubmissionStatus | '',
    requestType: '' as CostRequestType | '',
    budgetLine: '' as BudgetLineCategory | '',
    dateFrom: '',
    dateTo: '',
    search: '',
  });

  const filteredRequests = useMemo(() => {
    let result = [...requests];
    
    if (activeTab === 'advances') {
      result = result.filter(r => r.requestType === 'advance');
    } else if (activeTab === 'reimbursements') {
      result = result.filter(r => r.requestType === 'reimbursement');
    } else if (activeTab === 'outstanding') {
      result = result.filter(r => r.balanceStatus === 'open');
    }
    
    if (filters.projectId) {
      result = result.filter(r => r.projectId === filters.projectId);
    }
    if (filters.status) {
      result = result.filter(r => r.status === filters.status);
    }
    if (filters.requestType) {
      result = result.filter(r => r.requestType === filters.requestType);
    }
    if (filters.budgetLine) {
      result = result.filter(r => r.budgetLineCategory === filters.budgetLine);
    }
    if (filters.dateFrom) {
      result = result.filter(r => new Date(r.submittedAt) >= new Date(filters.dateFrom));
    }
    if (filters.dateTo) {
      result = result.filter(r => new Date(r.submittedAt) <= new Date(filters.dateTo));
    }
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(r => 
        r.title.toLowerCase().includes(searchLower) ||
        r.submitterName?.toLowerCase().includes(searchLower) ||
        r.projectName?.toLowerCase().includes(searchLower)
      );
    }
    
    return result;
  }, [requests, filters, activeTab]);

  const statistics = useMemo(() => {
    const total = filteredRequests.length;
    const totalRequested = filteredRequests.reduce((sum, r) => sum + r.requestedAmountCents, 0);
    const totalDisbursed = filteredRequests.reduce((sum, r) => sum + (r.disbursedAmountCents || 0), 0);
    const totalSpent = filteredRequests.reduce((sum, r) => sum + (r.actualSpentCents || 0), 0);
    const openBalances = filteredRequests.filter(r => r.balanceStatus === 'open');
    const totalOpenBalance = openBalances.reduce((sum, r) => sum + (r.balanceCents || 0), 0);
    
    return {
      total,
      totalRequested: totalRequested / 100,
      totalDisbursed: totalDisbursed / 100,
      totalSpent: totalSpent / 100,
      openBalanceCount: openBalances.length,
      totalOpenBalance: totalOpenBalance / 100,
      pending: filteredRequests.filter(r => r.status === 'pending').length,
      approved: filteredRequests.filter(r => ['approved', 'disbursed', 'paid', 'closed', 'reconciled'].includes(r.status)).length,
    };
  }, [filteredRequests]);

  const clearFilters = () => {
    setFilters({
      projectId: '',
      status: '',
      requestType: '',
      budgetLine: '',
      dateFrom: '',
      dateTo: '',
      search: '',
    });
  };

  const prepareReportData = (): CostReportData[] => {
    return filteredRequests.map(r => ({
      id: r.id,
      requestType: r.requestType,
      title: r.title,
      projectName: r.projectName || 'N/A',
      budgetLine: BUDGET_LINE_LABELS[r.budgetLineCategory]?.en || r.budgetLineCategory,
      submitterName: r.submitterName || 'N/A',
      requestedAmount: r.requestedAmountCents / 100,
      approvedAmount: r.approvedAmountCents ? r.approvedAmountCents / 100 : undefined,
      disbursedAmount: r.disbursedAmountCents ? r.disbursedAmountCents / 100 : undefined,
      actualSpent: r.actualSpentCents ? r.actualSpentCents / 100 : undefined,
      balance: r.balanceCents ? r.balanceCents / 100 : undefined,
      status: STATUS_CONFIG[r.status]?.label || r.status,
      balanceStatus: BALANCE_STATUS_LABELS[r.balanceStatus]?.en || r.balanceStatus,
      submittedDate: format(new Date(r.submittedAt), 'yyyy-MM-dd'),
      approvedDate: r.tier2ReviewedAt ? format(new Date(r.tier2ReviewedAt), 'yyyy-MM-dd') : undefined,
      disbursedDate: r.disbursedAt ? format(new Date(r.disbursedAt), 'yyyy-MM-dd') : undefined,
      reconciledDate: r.reconciledAt ? format(new Date(r.reconciledAt), 'yyyy-MM-dd') : undefined,
      currency: r.currency,
    }));
  };

  const exportToExcel = () => {
    const data = prepareReportData();
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cost Submissions');
    XLSX.writeFile(wb, `cost_submissions_report_${format(new Date(), 'yyyyMMdd')}.xlsx`);
    
    toast({
      title: "Export Successful",
      description: `Exported ${data.length} records to Excel`,
    });
  };

  const exportToPDF = () => {
    const data = prepareReportData();
    const doc = new jsPDF('landscape');
    
    doc.setFontSize(18);
    doc.text('Cost Submission Report', 14, 22);
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), 'PPpp')}`, 14, 30);
    
    doc.setFontSize(12);
    doc.text(`Total Requests: ${statistics.total}`, 14, 40);
    doc.text(`Total Requested: ${statistics.totalRequested.toLocaleString()} SDG`, 14, 48);
    doc.text(`Open Balances: ${statistics.openBalanceCount} (${statistics.totalOpenBalance.toLocaleString()} SDG)`, 14, 56);
    
    const tableData = data.map(r => [
      r.title.substring(0, 30),
      r.requestType === 'advance' ? 'Advance' : 'Reimburse',
      r.projectName.substring(0, 20),
      r.requestedAmount.toLocaleString(),
      r.disbursedAmount?.toLocaleString() || '-',
      r.actualSpent?.toLocaleString() || '-',
      r.status,
      r.submittedDate,
    ]);
    
    autoTable(doc, {
      head: [['Title', 'Type', 'Project', 'Requested', 'Disbursed', 'Spent', 'Status', 'Date']],
      body: tableData,
      startY: 65,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
    });
    
    doc.save(`cost_submissions_report_${format(new Date(), 'yyyyMMdd')}.pdf`);
    
    toast({
      title: "Export Successful",
      description: `Exported ${data.length} records to PDF`,
    });
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate(-1)}
            data-testid="button-back"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Cost Submission Reports
            </h1>
            <p className="text-muted-foreground">
              View, filter, and export cost submission data
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={exportToExcel}
            disabled={filteredRequests.length === 0}
            data-testid="button-export-excel"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export Excel
          </Button>
          <Button 
            variant="outline" 
            onClick={exportToPDF}
            disabled={filteredRequests.length === 0}
            data-testid="button-export-pdf"
          >
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Receipt className="h-4 w-4" />
              Total Requests
            </div>
            <p className="text-2xl font-bold">{statistics.total}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {statistics.pending} pending, {statistics.approved} approved
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              Total Requested
            </div>
            <p className="text-2xl font-bold">{statistics.totalRequested.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">SDG</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Wallet className="h-4 w-4" />
              Total Disbursed
            </div>
            <p className="text-2xl font-bold text-primary">{statistics.totalDisbursed.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">SDG</p>
          </CardContent>
        </Card>

        <Card className={statistics.openBalanceCount > 0 ? 'border-amber-200 bg-amber-50/50 dark:bg-amber-950/20' : ''}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Open Balances
            </div>
            <p className="text-2xl font-bold text-amber-600">{statistics.openBalanceCount}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {statistics.totalOpenBalance.toLocaleString()} SDG outstanding
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Search</Label>
              <Input
                placeholder="Search title, name..."
                value={filters.search}
                onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
                data-testid="input-search"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Project</Label>
              <Select 
                value={filters.projectId} 
                onValueChange={(v) => setFilters(f => ({ ...f, projectId: v }))}
              >
                <SelectTrigger data-testid="select-filter-project">
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Projects</SelectItem>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Status</Label>
              <Select 
                value={filters.status} 
                onValueChange={(v) => setFilters(f => ({ ...f, status: v as CostSubmissionStatus }))}
              >
                <SelectTrigger data-testid="select-filter-status">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Statuses</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>{config.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Budget Line</Label>
              <Select 
                value={filters.budgetLine} 
                onValueChange={(v) => setFilters(f => ({ ...f, budgetLine: v as BudgetLineCategory }))}
              >
                <SelectTrigger data-testid="select-filter-budget">
                  <SelectValue placeholder="All Budget Lines" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Budget Lines</SelectItem>
                  {Object.entries(BUDGET_LINE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label.en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>From Date</Label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
                data-testid="input-date-from"
              />
            </div>
            
            <div className="space-y-2">
              <Label>To Date</Label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters(f => ({ ...f, dateTo: e.target.value }))}
                data-testid="input-date-to"
              />
            </div>
            
            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={clearFilters}
                className="w-full"
                data-testid="button-clear-filters"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all" data-testid="tab-all">
            All ({requests.length})
          </TabsTrigger>
          <TabsTrigger value="advances" data-testid="tab-advances">
            Advances ({requests.filter(r => r.requestType === 'advance').length})
          </TabsTrigger>
          <TabsTrigger value="reimbursements" data-testid="tab-reimbursements">
            Reimbursements ({requests.filter(r => r.requestType === 'reimbursement').length})
          </TabsTrigger>
          <TabsTrigger value="outstanding" data-testid="tab-outstanding" className="text-amber-600">
            Outstanding ({requests.filter(r => r.balanceStatus === 'open').length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">
                {activeTab === 'all' && 'All Cost Requests'}
                {activeTab === 'advances' && 'Advance Payment Requests'}
                {activeTab === 'reimbursements' && 'Reimbursement Requests'}
                {activeTab === 'outstanding' && 'Outstanding Advances (Pending Reconciliation)'}
              </CardTitle>
              <CardDescription>
                {filteredRequests.length} records found
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No cost requests found matching your filters.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Budget Line</TableHead>
                        <TableHead className="text-right">Requested</TableHead>
                        <TableHead className="text-right">Disbursed</TableHead>
                        <TableHead className="text-right">Spent</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Balance</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRequests.map((request) => {
                        const statusConfig = STATUS_CONFIG[request.status];
                        return (
                          <TableRow key={request.id} data-testid={`row-request-${request.id}`}>
                            <TableCell className="font-medium max-w-[200px] truncate">
                              {request.title}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {request.requestType === 'advance' ? 'Advance' : 'Reimburse'}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[150px] truncate">
                              {request.projectName || 'N/A'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {BUDGET_LINE_LABELS[request.budgetLineCategory]?.en || request.budgetLineCategory}
                            </TableCell>
                            <TableCell className="text-right">
                              {(request.requestedAmountCents / 100).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              {request.disbursedAmountCents 
                                ? (request.disbursedAmountCents / 100).toLocaleString() 
                                : '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              {request.actualSpentCents 
                                ? (request.actualSpentCents / 100).toLocaleString() 
                                : '-'}
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusConfig?.variant || 'secondary'}>
                                {statusConfig?.label || request.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {request.balanceStatus !== 'not_applicable' && (
                                <Badge 
                                  variant="outline" 
                                  className={
                                    request.balanceStatus === 'open' 
                                      ? 'border-amber-500 text-amber-600' 
                                      : request.balanceStatus === 'settled'
                                        ? 'border-green-500 text-green-600'
                                        : 'border-blue-500 text-blue-600'
                                  }
                                >
                                  {BALANCE_STATUS_LABELS[request.balanceStatus]?.en}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(request.submittedAt), 'MMM d, yyyy')}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}