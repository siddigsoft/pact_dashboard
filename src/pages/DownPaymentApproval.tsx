import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@/context/user/UserContext';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { useDownPayment } from '@/context/downPayment/DownPaymentContext';
import { DownPaymentApprovalPanel } from '@/components/downPayment/DownPaymentApprovalPanel';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DollarSign, Shield, AlertTriangle, Info, Users, UserCheck,
  TrendingUp, Receipt, Wallet, MapPin, FolderKanban, ClipboardList,
  ClipboardCheck, FileText,
} from 'lucide-react';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { format, parseISO } from 'date-fns';

function getStatusBadge(status: string, metadata?: any) {
  if (status === 'cancelled' && metadata?.written_off === true) {
    return (
      <Badge variant="secondary" className="bg-gray-100 text-gray-700 border border-gray-400 text-[10px] whitespace-nowrap">
        Written Off / مشطوب
      </Badge>
    );
  }
  if (status === 'cancelled' && metadata?.auto_cancelled_on_reclaim) {
    return (
      <Badge variant="secondary" className="bg-orange-100 text-orange-700 border border-orange-300 text-[10px] whitespace-nowrap">
        Cancelled – Site Reclaimed / ملغي – الموقع استُرجع
      </Badge>
    );
  }
  if (status === 'approved' && metadata?.site_reclaimed) {
    return (
      <div className="flex flex-col gap-1">
        <Badge variant="default" className="bg-green-500 text-[10px]">Approved / تمت الموافقة</Badge>
        <Badge variant="outline" className="border-red-500 text-red-600 text-[10px] whitespace-nowrap">⚠ Site Reclaimed</Badge>
      </div>
    );
  }
  const statusConfig: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string; className: string }> = {
    pending_supervisor: { variant: 'outline', label: 'Pending Supervisor / بانتظار المشرف', className: 'border-amber-500 text-amber-600' },
    pending_admin: { variant: 'outline', label: 'Pending Admin / بانتظار الإدارة', className: 'border-blue-500 text-blue-600' },
    approved: { variant: 'default', label: 'Approved / تمت الموافقة', className: 'bg-green-500' },
    rejected: { variant: 'destructive', label: 'Rejected / مرفوض', className: '' },
    partially_paid: { variant: 'secondary', label: 'Partially Paid / مدفوع جزئياً', className: 'bg-purple-100 text-purple-700' },
    fully_paid: { variant: 'default', label: 'Fully Paid / مدفوع بالكامل', className: 'bg-emerald-500' },
    cancelled: { variant: 'secondary', label: 'Cancelled / ملغي', className: 'bg-gray-100 text-gray-600' },
  };
  const config = statusConfig[status] || { variant: 'outline' as const, label: status, className: '' };
  return <Badge variant={config.variant} className={config.className}>{config.label}</Badge>;
}

type GroupRow = { id: string; name: string; requests: number; totalRequested: number; totalApproved: number; pending: number };

function SummaryTable({ rows, groupLabel, loading }: { rows: GroupRow[]; groupLabel: string; loading: boolean }) {
  if (loading) {
    return (
      <div className="p-6 space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }
  if (rows.length === 0) {
    return <div className="p-12 text-center text-muted-foreground">No data available</div>;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{groupLabel}</TableHead>
            <TableHead className="text-right">Requests</TableHead>
            <TableHead className="text-right">Total Requested (SDG)</TableHead>
            <TableHead className="text-right">Total Approved (SDG)</TableHead>
            <TableHead className="text-right">Pending</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, idx) => (
            <TableRow key={idx}>
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell className="text-right">{row.requests}</TableCell>
              <TableCell className="text-right font-mono">{row.totalRequested.toLocaleString()}</TableCell>
              <TableCell className="text-right font-mono text-green-600">{row.totalApproved.toLocaleString()}</TableCell>
              <TableCell className="text-right">
                {row.pending > 0 && <Badge variant="outline" className="border-amber-500 text-amber-600">{row.pending}</Badge>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <tfoot>
          <TableRow className="bg-muted/50 border-t-2">
            <TableCell className="font-bold">Subtotal</TableCell>
            <TableCell className="text-right font-bold">{rows.reduce((s, r) => s + r.requests, 0)}</TableCell>
            <TableCell className="text-right font-mono font-bold">{rows.reduce((s, r) => s + r.totalRequested, 0).toLocaleString()}</TableCell>
            <TableCell className="text-right font-mono font-bold text-green-600">{rows.reduce((s, r) => s + r.totalApproved, 0).toLocaleString()}</TableCell>
            <TableCell className="text-right font-bold">{rows.reduce((s, r) => s + r.pending, 0)}</TableCell>
          </TableRow>
        </tfoot>
      </Table>
    </div>
  );
}

export default function DownPaymentApproval() {
  const navigate = useNavigate();
  const { currentUser, users } = useUser();
  const { isSuperAdmin } = useSuperAdmin();
  const { requests, loading } = useDownPayment();

  const userRole = currentUser?.role?.toLowerCase();
  const isSupervisor = userRole === 'supervisor' || userRole === 'hubsupervisor';
  const isAdmin = userRole === 'admin' || userRole === 'financialadmin' || userRole === 'superadmin' || userRole === 'ict' || isSuperAdmin;
  const isFOM = userRole === 'fom' || userRole === 'field operation manager';

  const [selectedTier, setSelectedTier] = useState<'tier1' | 'tier2'>(isAdmin ? 'tier2' : 'tier1');
  const [viewTab, setViewTab] = useState('approval');

  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach(u => map.set(u.id, u.fullName || u.email || 'Unknown'));
    return map;
  }, [users]);

  const getProfileName = useCallback((userId: string) => userMap.get(userId) || 'Unknown', [userMap]);

  function groupRequests(keyFn: (r: any) => string): GroupRow[] {
    const grouped: Record<string, GroupRow> = {};
    requests.forEach(req => {
      const key = keyFn(req) || 'Unknown';
      if (!grouped[key]) grouped[key] = { id: key, name: key, requests: 0, totalRequested: 0, totalApproved: 0, pending: 0 };
      grouped[key].requests++;
      grouped[key].totalRequested += req.requestedAmount;
      if (['approved', 'partially_paid', 'fully_paid'].includes(req.status)) grouped[key].totalApproved += req.requestedAmount;
      if (['pending_supervisor', 'pending_admin'].includes(req.status)) grouped[key].pending++;
    });
    return Object.values(grouped).sort((a, b) => b.totalRequested - a.totalRequested);
  }

  const byState = useMemo(() => groupRequests(r => r.stateName), [requests]);
  const byProject = useMemo(() => groupRequests(r => r.projectName), [requests]);
  const byMMP = useMemo(() => groupRequests(r => r.mmpName || 'Unknown MMP'), [requests]);

  if (!isSupervisor && !isAdmin && !isFOM) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <AlertTriangle className="h-12 w-12 text-destructive" />
              <h2 className="text-xl font-semibold">Access Denied</h2>
              <p className="text-muted-foreground max-w-md">
                You don't have permission to access this page. Only supervisors and administrators can approve down-payment requests.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const approvalRole = selectedTier === 'tier1' ? 'supervisor' : 'admin';

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-7 w-7 text-primary" />
            Down-Payment Approval
          </h1>
          <p className="text-muted-foreground mt-1">
            {selectedTier === 'tier1'
              ? 'Review and approve transportation advance requests from team members'
              : 'Process approved down-payment requests and manage payments'}
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 p-1 bg-muted rounded-lg">
            <Button variant={selectedTier === 'tier1' ? 'default' : 'ghost'} size="sm" onClick={() => setSelectedTier('tier1')} className="gap-2" data-testid="button-tier1">
              <Users className="h-4 w-4" />
              Tier 1: Supervisor
            </Button>
            <Button variant={selectedTier === 'tier2' ? 'default' : 'ghost'} size="sm" onClick={() => setSelectedTier('tier2')} className="gap-2" data-testid="button-tier2">
              <UserCheck className="h-4 w-4" />
              Tier 2: Admin
            </Button>
          </div>
        )}
        {!isAdmin && (
          <Badge variant="outline" className="self-start flex items-center gap-1">
            <Shield className="h-3 w-3" />
            {isSupervisor ? 'Tier 1: Supervisor Review' : 'Tier 2: Admin Processing'}
          </Badge>
        )}
      </div>

      {/* Quick nav */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => navigate('/financial-operations')} data-testid="button-goto-financial-ops">
          <TrendingUp className="h-4 w-4 mr-2" />
          Financial Ops
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate('/budget')} data-testid="button-goto-budget">
          <DollarSign className="h-4 w-4 mr-2" />
          Budget
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate('/cost-submission')} data-testid="button-goto-cost-submissions">
          <Receipt className="h-4 w-4 mr-2" />
          Cost Submissions
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate('/wallet')} data-testid="button-goto-wallet">
          <Wallet className="h-4 w-4 mr-2" />
          Wallet
        </Button>
      </div>

      <PageInfoBanner
        title="Down-Payment Approval - Transportation Advances"
        description="This page handles TRANSPORTATION ADVANCE requests -- money given to field staff BEFORE they do their work, to cover travel costs for site visits. This is DIFFERENT from Tier 1/Tier 2 Approvals, which handle wallet withdrawals (money already earned). Advances approved here are automatically deducted later when the site visit fee is credited to the staff member's wallet, so there is no double-paying."
        descriptionAr="تتعامل هذه الصفحة مع طلبات السلف المسبقة للنقل -- أموال تُعطى للموظفين الميدانيين قبل قيامهم بالعمل لتغطية تكاليف التنقل للزيارات الميدانية. هذه الصفحة مختلفة عن موافقات المستوى الأول والثاني التي تتعامل مع سحب المحفظة (أموال مكتسبة بالفعل). السلف المعتمدة هنا تُخصم تلقائياً لاحقاً عند إضافة أتعاب الزيارة الميدانية لمحفظة الموظف، مما يمنع الدفع المزدوج."
        workflowSteps={[
          { step: 1, role: 'Data Collector', action: 'Requests travel advance', description: 'A field staff member requests upfront money for transportation before going on a site visit.' },
          { step: 2, role: 'Supervisor', action: 'Reviews request (Tier 1)', description: 'Supervisor reviews and approves or rejects the advance request.' },
          { step: 3, role: 'Admin', action: 'Authorizes payment (Tier 2)', description: 'Admin or Finance Admin approves the advance amount and authorizes payment.' },
          { step: 4, role: 'Finance Admin', action: 'Sends advance', description: 'Finance sends the advance money to the staff member. The amount is recorded as a pending advance.' },
          { step: 5, role: 'System', action: 'Auto-deducts when work is done', description: 'When the site visit is completed and fees are credited to the wallet, the advance is automatically subtracted -- no manual action needed.' },
        ]}
        workflowStepsAr={[
          { step: 1, role: 'جامع بيانات', action: 'يطلب سلفة نقل', description: 'يطلب الموظف الميداني أموالاً مقدمة لتغطية تكاليف النقل قبل القيام بزيارة ميدانية.' },
          { step: 2, role: 'المشرف', action: 'يراجع الطلب (المستوى الأول)', description: 'يراجع المشرف طلب السلفة ويوافق عليه أو يرفضه.' },
          { step: 3, role: 'المدير', action: 'يعتمد الصرف (المستوى الثاني)', description: 'يوافق المدير أو مدير المالية على مبلغ السلفة ويعتمد الصرف.' },
          { step: 4, role: 'مدير المالية', action: 'يُرسل السلفة', description: 'يقوم قسم المالية بإرسال مبلغ السلفة للموظف. يُسجَّل المبلغ كسلفة معلقة.' },
          { step: 5, role: 'النظام', action: 'يخصم تلقائياً عند إنجاز العمل', description: 'عند اكتمال الزيارة الميدانية وإضافة الأتعاب للمحفظة، تُخصم السلفة تلقائياً -- لا حاجة لأي إجراء يدوي.' },
        ]}
      />

      {/* View tabs */}
      <Tabs value={viewTab} onValueChange={setViewTab} className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="approval" className="gap-1.5" data-testid="tab-approval">
            <ClipboardCheck className="h-4 w-4" />
            Approval
          </TabsTrigger>
          <TabsTrigger value="byState" className="gap-1.5" data-testid="tab-down-by-state">
            <MapPin className="h-4 w-4" />
            By State
          </TabsTrigger>
          <TabsTrigger value="byProject" className="gap-1.5" data-testid="tab-down-by-project">
            <FolderKanban className="h-4 w-4" />
            By Project
          </TabsTrigger>
          <TabsTrigger value="byMMP" className="gap-1.5" data-testid="tab-down-by-mmp">
            <ClipboardList className="h-4 w-4" />
            By MMP
          </TabsTrigger>
          <TabsTrigger value="allRequests" className="gap-1.5" data-testid="tab-down-all-requests">
            <FileText className="h-4 w-4" />
            All Requests
          </TabsTrigger>
        </TabsList>

        {/* ─── Approval (default) ─── */}
        <TabsContent value="approval" className="space-y-4">
          <Alert className={selectedTier === 'tier1' ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30' : ''}>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {selectedTier === 'tier1' ? (
                <>
                  <strong>Tier 1 - Supervisor Approval Flow:</strong> Review down-payment requests from data collectors and coordinators.
                  Approved requests will be forwarded to Tier 2 (Admin) for final processing and payment.
                </>
              ) : (
                <>
                  <strong>Tier 2 - Admin Processing Flow:</strong> Process requests that have been approved by supervisors.
                  You can approve, reject, or process payments directly to the requester's wallet.
                </>
              )}
            </AlertDescription>
          </Alert>
          <DownPaymentApprovalPanel userRole={approvalRole} />
        </TabsContent>

        {/* ─── By State ─── */}
        <TabsContent value="byState" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Summary by State
              </CardTitle>
              <CardDescription>Breakdown of down-payment requests per state / region</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <SummaryTable rows={byState} groupLabel="State" loading={loading} />
            </CardContent>
          </Card>

          {/* Detailed table below summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">All Requests (Detailed)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <AllRequestsTable requests={requests} getProfileName={getProfileName} groupKey="state" loading={loading} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── By Project ─── */}
        <TabsContent value="byProject" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderKanban className="h-5 w-5" />
                Summary by Project
              </CardTitle>
              <CardDescription>Breakdown of down-payment requests per cooperating partner / project</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <SummaryTable rows={byProject} groupLabel="Project" loading={loading} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">All Requests (Detailed)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <AllRequestsTable requests={requests} getProfileName={getProfileName} groupKey="project" loading={loading} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── By MMP ─── */}
        <TabsContent value="byMMP" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Down-Payment by MMP
              </CardTitle>
              <CardDescription>Breakdown of down-payment requests per Monthly Monitoring Plan</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <SummaryTable rows={byMMP} groupLabel="MMP" loading={loading} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">All Requests (Detailed)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <AllRequestsTable requests={requests} getProfileName={getProfileName} groupKey="mmp" loading={loading} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── All Requests (Detailed) ─── */}
        <TabsContent value="allRequests" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                All Requests (Detailed)
              </CardTitle>
              <CardDescription>Complete list of all down-payment requests with full details</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <AllRequestsTable requests={requests} getProfileName={getProfileName} groupKey="all" loading={loading} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AllRequestsTable({
  requests,
  getProfileName,
  groupKey,
  loading,
}: {
  requests: any[];
  getProfileName: (id: string) => string;
  groupKey: 'state' | 'project' | 'mmp' | 'all';
  loading: boolean;
}) {
  const groupColLabel = groupKey === 'state' ? 'State' : groupKey === 'project' ? 'Project' : groupKey === 'mmp' ? 'MMP' : 'State';

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  if (requests.length === 0) {
    return <div className="p-12 text-center text-muted-foreground">No requests found</div>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>{groupColLabel}</TableHead>
            <TableHead>Team Member</TableHead>
            <TableHead>Site</TableHead>
            <TableHead>Hub</TableHead>
            <TableHead className="text-right">Amount (SDG)</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Paid</TableHead>
            <TableHead className="text-right">Remaining</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map(req => {
            const remaining = req.remainingAmount ?? (req.requestedAmount - (req.totalPaidAmount || 0));
            const groupValue =
              groupKey === 'state' ? req.stateName || 'Unknown'
              : groupKey === 'project' ? req.projectName || 'Unknown'
              : groupKey === 'mmp' ? req.mmpName || 'Unknown MMP'
              : req.stateName || 'Unknown';

            let dateStr = '—';
            try { dateStr = format(parseISO(req.requestedAt), 'MMM dd, yyyy'); } catch { /* */ }

            return (
              <TableRow key={req.id} data-testid={`row-down-request-${req.id}`}>
                <TableCell className="text-sm whitespace-nowrap">{dateStr}</TableCell>
                <TableCell className="font-medium max-w-[140px] truncate">{groupValue}</TableCell>
                <TableCell className="max-w-[140px] truncate">{getProfileName(req.requestedBy)}</TableCell>
                <TableCell className="max-w-[160px] truncate">{req.siteName}</TableCell>
                <TableCell className="whitespace-nowrap">{req.hubName || 'N/A'}</TableCell>
                <TableCell className="text-right font-mono">{req.requestedAmount.toLocaleString()}</TableCell>
                <TableCell>{getStatusBadge(req.status, req.metadata)}</TableCell>
                <TableCell className="text-right font-mono text-green-600">{(req.totalPaidAmount || 0).toLocaleString()}</TableCell>
                <TableCell className="text-right font-mono">
                  {remaining > 0 ? <span className="text-amber-600">{remaining.toLocaleString()}</span> : '0'}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
