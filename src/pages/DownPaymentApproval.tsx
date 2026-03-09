import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@/context/user/UserContext';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { useDownPayment } from '@/context/downPayment/DownPaymentContext';
import { useDebounce } from '@/hooks/useDebounce';
import { DownPaymentApprovalPanel } from '@/components/downPayment/DownPaymentApprovalPanel';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DollarSign, Shield, AlertTriangle, Info, Users, UserCheck,
  TrendingUp, Receipt, Wallet, MapPin, FolderKanban, ClipboardList,
  ClipboardCheck, FileText, Search, ChevronDown, ChevronRight,
  Calendar, Building2, User, CheckCircle2, XCircle, BarChart3,
} from 'lucide-react';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { format, parseISO } from 'date-fns';
import type { DownPaymentRequest } from '@/types/down-payment';

// ─── helpers ────────────────────────────────────────────────────────────────

function getStatusBadge(status: string, metadata?: any) {
  if (status === 'cancelled' && metadata?.written_off === true)
    return <Badge variant="secondary" className="bg-gray-100 text-gray-700 border border-gray-400 text-[10px]">Written Off / مشطوب</Badge>;
  if (status === 'cancelled' && metadata?.auto_cancelled_on_reclaim)
    return <Badge variant="secondary" className="bg-orange-100 text-orange-700 border border-orange-300 text-[10px]">Cancelled – Reclaimed / ملغي</Badge>;
  if (status === 'approved' && metadata?.site_reclaimed)
    return (
      <div className="flex flex-col gap-0.5">
        <Badge variant="default" className="bg-green-500 text-[10px]">Approved / تمت الموافقة</Badge>
        <Badge variant="outline" className="border-red-500 text-red-600 text-[10px]">⚠ Reclaimed</Badge>
      </div>
    );
  const cfg: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string; cls: string }> = {
    pending_supervisor: { variant: 'outline', label: 'Pending Supervisor / بانتظار المشرف', cls: 'border-amber-500 text-amber-600' },
    pending_admin: { variant: 'outline', label: 'Pending Admin / بانتظار الإدارة', cls: 'border-blue-500 text-blue-600' },
    approved: { variant: 'default', label: 'Approved / تمت الموافقة', cls: 'bg-green-500' },
    rejected: { variant: 'destructive', label: 'Rejected / مرفوض', cls: '' },
    partially_paid: { variant: 'secondary', label: 'Partially Paid / مدفوع جزئياً', cls: 'bg-purple-100 text-purple-700' },
    fully_paid: { variant: 'default', label: 'Fully Paid / مدفوع بالكامل', cls: 'bg-emerald-500' },
    cancelled: { variant: 'secondary', label: 'Cancelled / ملغي', cls: 'bg-gray-100 text-gray-600' },
  };
  const c = cfg[status] || { variant: 'outline' as const, label: status, cls: '' };
  return <Badge variant={c.variant} className={c.cls}>{c.label}</Badge>;
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'MMM dd, yyyy'); } catch { return '—'; }
}

/** Returns the WFP project name (e.g. "WFP TPM", "WFP VAM") — falls back to activityType. */
function projectLabel(req: DownPaymentRequest): string {
  if (req.wfpProjectName) return req.wfpProjectName;
  const p = req.projectName;
  if (p && p !== 'PACT') return p;
  return req.activityType || 'General / عام';
}

// ─── types ───────────────────────────────────────────────────────────────────

type GroupRow = {
  key: string;
  name: string;
  requests: number;
  totalRequested: number;
  totalApproved: number;
  totalPaid: number;
  pending: number;
  items: DownPaymentRequest[];
};

// ─── sub-components ──────────────────────────────────────────────────────────

function RequestDetailsDialog({ req, onClose, getProfileName }: { req: DownPaymentRequest | null; onClose: () => void; getProfileName: (id: string) => string }) {
  if (!req) return null;
  const remaining = req.remainingAmount ?? (req.requestedAmount - (req.totalPaidAmount || 0));
  return (
    <Dialog open={!!req} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Request Details — {req.siteName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div><span className="text-muted-foreground">Date</span><p className="font-medium">{fmtDate(req.requestedAt)}</p></div>
            <div><span className="text-muted-foreground">Status</span><p>{getStatusBadge(req.status, req.metadata)}</p></div>
            <div><span className="text-muted-foreground">Team Member</span><p className="font-medium">{req.requestedByName || getProfileName(req.requestedBy)}</p></div>
            <div><span className="text-muted-foreground">Role</span><p className="capitalize">{req.requesterRole}</p></div>
            <div><span className="text-muted-foreground">State</span><p>{req.stateName || '—'}</p></div>
            <div><span className="text-muted-foreground">Locality</span><p>{req.localityName || '—'}</p></div>
            <div><span className="text-muted-foreground">Hub</span><p>{req.hubName || '—'}</p></div>
            <div><span className="text-muted-foreground">MMP</span><p>{req.mmpName || '—'}</p></div>
            <div><span className="text-muted-foreground">Project / Activity</span><p>{projectLabel(req)}</p></div>
            <div><span className="text-muted-foreground">Activity Type</span><p>{req.activityType || '—'}</p></div>
          </div>
          <div className="border-t pt-3 grid grid-cols-3 gap-3 text-center">
            <div className="bg-muted/40 rounded-lg p-2">
              <p className="text-xs text-muted-foreground">Requested</p>
              <p className="font-bold text-base">{req.requestedAmount.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">SDG</p>
            </div>
            <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-2">
              <p className="text-xs text-muted-foreground">Paid</p>
              <p className="font-bold text-base text-green-600">{(req.totalPaidAmount || 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">SDG</p>
            </div>
            <div className={`rounded-lg p-2 ${remaining > 0 ? 'bg-amber-50 dark:bg-amber-950/20' : 'bg-muted/40'}`}>
              <p className="text-xs text-muted-foreground">Remaining</p>
              <p className={`font-bold text-base ${remaining > 0 ? 'text-amber-600' : ''}`}>{remaining.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">SDG</p>
            </div>
          </div>
          {req.justification && (
            <div className="border-t pt-3">
              <p className="text-muted-foreground text-xs mb-1">Justification</p>
              <p className="text-sm">{req.justification}</p>
            </div>
          )}
          {req.supervisorApprovedByName && (
            <div className="border-t pt-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Tier 1 – Supervisor</p>
              <p className="text-sm">{req.supervisorApprovedByName} · {fmtDate(req.supervisorApprovedAt)}</p>
              {req.supervisorNotes && <p className="text-xs text-muted-foreground">{req.supervisorNotes}</p>}
            </div>
          )}
          {req.adminProcessedByName && (
            <div className="border-t pt-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Tier 2 – Admin</p>
              <p className="text-sm">{req.adminProcessedByName} · {fmtDate(req.adminProcessedAt)}</p>
              {req.adminNotes && <p className="text-xs text-muted-foreground">{req.adminNotes}</p>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Expandable grouped summary table */
function GroupedSummaryTable({
  rows,
  groupLabel,
  loading,
  getProfileName,
}: {
  rows: GroupRow[];
  groupLabel: string;
  loading: boolean;
  getProfileName: (id: string) => string;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [detailsReq, setDetailsReq] = useState<DownPaymentRequest | null>(null);

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }
  if (rows.length === 0) {
    return <div className="p-12 text-center text-muted-foreground">No data available / لا توجد بيانات</div>;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-6" />
              <TableHead>{groupLabel}</TableHead>
              <TableHead className="text-right">Requests</TableHead>
              <TableHead className="text-right">Total Requested (SDG)</TableHead>
              <TableHead className="text-right">Total Approved (SDG)</TableHead>
              <TableHead className="text-right">Total Paid (SDG)</TableHead>
              <TableHead className="text-right">Pending</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => (
              <>
                <TableRow
                  key={row.key}
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => setExpandedKey(expandedKey === row.key ? null : row.key)}
                  data-testid={`row-group-${row.key}`}
                >
                  <TableCell>
                    {expandedKey === row.key
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-right">{row.requests}</TableCell>
                  <TableCell className="text-right font-mono">{row.totalRequested.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono text-green-600">{row.totalApproved.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono text-emerald-600">{row.totalPaid.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    {row.pending > 0 && <Badge variant="outline" className="border-amber-500 text-amber-600">{row.pending}</Badge>}
                  </TableCell>
                </TableRow>

                {/* ─── Expanded sub-table ─── */}
                {expandedKey === row.key && (
                  <TableRow key={`${row.key}-expanded`}>
                    <TableCell colSpan={7} className="p-0 bg-muted/20">
                      <div className="border-l-4 border-primary/30 pl-0">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/40">
                              <TableHead className="text-xs py-2">Date</TableHead>
                              <TableHead className="text-xs py-2">Team Member</TableHead>
                              <TableHead className="text-xs py-2">Site</TableHead>
                              <TableHead className="text-xs py-2">Hub</TableHead>
                              <TableHead className="text-xs py-2 text-right">Requested</TableHead>
                              <TableHead className="text-xs py-2 text-right">Paid</TableHead>
                              <TableHead className="text-xs py-2 text-right">Remaining</TableHead>
                              <TableHead className="text-xs py-2">Status</TableHead>
                              <TableHead className="text-xs py-2 text-center">Details</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {row.items.map(req => {
                              const rem = req.remainingAmount ?? (req.requestedAmount - (req.totalPaidAmount || 0));
                              return (
                                <TableRow key={req.id} className="hover:bg-background/60">
                                  <TableCell className="text-xs py-2">{fmtDate(req.requestedAt)}</TableCell>
                                  <TableCell className="text-xs py-2 max-w-[130px] truncate">{req.requestedByName || getProfileName(req.requestedBy)}</TableCell>
                                  <TableCell className="text-xs py-2 max-w-[160px] truncate">{req.siteName}</TableCell>
                                  <TableCell className="text-xs py-2 whitespace-nowrap">{req.hubName || '—'}</TableCell>
                                  <TableCell className="text-xs py-2 text-right font-mono">{req.requestedAmount.toLocaleString()}</TableCell>
                                  <TableCell className="text-xs py-2 text-right font-mono text-green-600">{(req.totalPaidAmount || 0).toLocaleString()}</TableCell>
                                  <TableCell className="text-xs py-2 text-right font-mono">{rem > 0 ? <span className="text-amber-600">{rem.toLocaleString()}</span> : '0'}</TableCell>
                                  <TableCell className="text-xs py-2">{getStatusBadge(req.status, req.metadata)}</TableCell>
                                  <TableCell className="text-xs py-2 text-center">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-xs"
                                      onClick={e => { e.stopPropagation(); setDetailsReq(req); }}
                                      data-testid={`button-details-${req.id}`}
                                    >
                                      <FileText className="h-3.5 w-3.5 mr-1" />
                                      Details
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
          <tfoot>
            <TableRow className="bg-muted/50 border-t-2">
              <TableCell />
              <TableCell className="font-bold">Subtotal</TableCell>
              <TableCell className="text-right font-bold">{rows.reduce((s, r) => s + r.requests, 0)}</TableCell>
              <TableCell className="text-right font-mono font-bold">{rows.reduce((s, r) => s + r.totalRequested, 0).toLocaleString()}</TableCell>
              <TableCell className="text-right font-mono font-bold text-green-600">{rows.reduce((s, r) => s + r.totalApproved, 0).toLocaleString()}</TableCell>
              <TableCell className="text-right font-mono font-bold text-emerald-600">{rows.reduce((s, r) => s + r.totalPaid, 0).toLocaleString()}</TableCell>
              <TableCell className="text-right font-bold">{rows.reduce((s, r) => s + r.pending, 0)}</TableCell>
            </TableRow>
          </tfoot>
        </Table>
      </div>

      <RequestDetailsDialog req={detailsReq} onClose={() => setDetailsReq(null)} getProfileName={getProfileName} />
    </>
  );
}

/** Flat detailed requests table */
function AllRequestsTable({
  requests,
  getProfileName,
  loading,
}: {
  requests: DownPaymentRequest[];
  getProfileName: (id: string) => string;
  loading: boolean;
}) {
  const [detailsReq, setDetailsReq] = useState<DownPaymentRequest | null>(null);

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }
  if (requests.length === 0) {
    return <div className="p-12 text-center text-muted-foreground">No requests found / لا توجد طلبات</div>;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Team Member</TableHead>
              <TableHead>Site</TableHead>
              <TableHead>Hub</TableHead>
              <TableHead>MMP</TableHead>
              <TableHead className="text-right">Amount (SDG)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Remaining</TableHead>
              <TableHead className="text-center">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map(req => {
              const rem = req.remainingAmount ?? (req.requestedAmount - (req.totalPaidAmount || 0));
              return (
                <TableRow key={req.id} data-testid={`row-all-${req.id}`}>
                  <TableCell className="text-sm whitespace-nowrap">{fmtDate(req.requestedAt)}</TableCell>
                  <TableCell className="font-medium">{req.stateName || 'Unknown'}</TableCell>
                  <TableCell className="max-w-[130px] truncate">{req.requestedByName || getProfileName(req.requestedBy)}</TableCell>
                  <TableCell className="max-w-[160px] truncate">{req.siteName}</TableCell>
                  <TableCell className="whitespace-nowrap">{req.hubName || '—'}</TableCell>
                  <TableCell className="max-w-[120px] truncate text-sm">{req.mmpName || '—'}</TableCell>
                  <TableCell className="text-right font-mono">{req.requestedAmount.toLocaleString()}</TableCell>
                  <TableCell>{getStatusBadge(req.status, req.metadata)}</TableCell>
                  <TableCell className="text-right font-mono text-green-600">{(req.totalPaidAmount || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono">{rem > 0 ? <span className="text-amber-600">{rem.toLocaleString()}</span> : '0'}</TableCell>
                  <TableCell className="text-center">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setDetailsReq(req)} data-testid={`button-all-details-${req.id}`}>
                      <FileText className="h-3.5 w-3.5 mr-1" />
                      Details
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <RequestDetailsDialog req={detailsReq} onClose={() => setDetailsReq(null)} getProfileName={getProfileName} />
    </>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

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

  // ── shared filters (used across all analytics tabs) ──────────────────────
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [mmpFilter, setMmpFilter] = useState('all');
  const debouncedSearch = useDebounce(search, 300);

  // ── disbursement tracker specific filters ─────────────────────────────────
  const [disbState, setDisbState] = useState('all');
  const [disbHub, setDisbHub] = useState('all');
  const [disbLocality, setDisbLocality] = useState('all');
  const [disbMmp, setDisbMmp] = useState('all');
  const [disbEnumerator, setDisbEnumerator] = useState('all');
  const [disbGroupBy, setDisbGroupBy] = useState('none');

  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach(u => map.set(u.id, u.fullName || u.email || 'Unknown'));
    return map;
  }, [users]);

  const getProfileName = useCallback((id: string) => userMap.get(id) || 'Unknown', [userMap]);

  // Unique MMP names for filter dropdown
  const uniqueMmps = useMemo(() =>
    [...new Set(requests.map(r => r.mmpName).filter(Boolean))].sort() as string[],
    [requests]);

  // Filtered requests for analytics tabs
  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      if (statusFilter !== 'all' && req.status !== statusFilter) return false;
      if (mmpFilter !== 'all') {
        const idMatch = ((req as any).mmpId && (req as any).mmpId === mmpFilter) || ((req as any).mmpSiteEntryId && (req as any).mmpSiteEntryId === mmpFilter) || ((req as any).mmp_file_id && (req as any).mmp_file_id === mmpFilter);
        const nameMatch = (req.mmpName || '') === mmpFilter;
        if (!idMatch && !nameMatch) return false;
      }
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        if (
          !req.siteName?.toLowerCase().includes(q) &&
          !(req.requestedByName || getProfileName(req.requestedBy)).toLowerCase().includes(q) &&
          !req.hubName?.toLowerCase().includes(q) &&
          !req.stateName?.toLowerCase().includes(q) &&
          !req.mmpName?.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [requests, statusFilter, mmpFilter, debouncedSearch, getProfileName]);

  // Group helper
  function buildGroups(keyFn: (r: DownPaymentRequest) => string): GroupRow[] {
    const map: Record<string, GroupRow> = {};
    filteredRequests.forEach(req => {
      const k = keyFn(req) || 'Unknown';
      if (!map[k]) map[k] = { key: k, name: k, requests: 0, totalRequested: 0, totalApproved: 0, totalPaid: 0, pending: 0, items: [] };
      map[k].requests++;
      map[k].totalRequested += req.requestedAmount;
      map[k].totalPaid += req.totalPaidAmount || 0;
      map[k].items.push(req);
      if (['approved', 'partially_paid', 'fully_paid'].includes(req.status)) map[k].totalApproved += req.requestedAmount;
      if (['pending_supervisor', 'pending_admin'].includes(req.status)) map[k].pending++;
    });
    return Object.values(map).sort((a, b) => b.totalRequested - a.totalRequested);
  }

  const byState = useMemo(() => buildGroups(r => r.stateName || 'Unknown'), [filteredRequests]);
  const byProject = useMemo(() => buildGroups(projectLabel), [filteredRequests]);
  const byMMP = useMemo(() => buildGroups(r => r.mmpName || 'Unknown MMP'), [filteredRequests]);

  const activeFilterCount = [statusFilter !== 'all', mmpFilter !== 'all', !!debouncedSearch].filter(Boolean).length;

  if (!isSupervisor && !isAdmin && !isFOM) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
            <h2 className="text-xl font-semibold">Access Denied</h2>
            <p className="text-muted-foreground max-w-md mx-auto">Only supervisors and administrators can access this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const approvalRole = selectedTier === 'tier1' ? 'supervisor' : 'admin';

  return (
    <div className="p-6 space-y-6">
      {/* ── Page header ── */}
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
              <Users className="h-4 w-4" />Tier 1: Supervisor
            </Button>
            <Button variant={selectedTier === 'tier2' ? 'default' : 'ghost'} size="sm" onClick={() => setSelectedTier('tier2')} className="gap-2" data-testid="button-tier2">
              <UserCheck className="h-4 w-4" />Tier 2: Admin
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

      {/* ── Quick nav ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => navigate('/financial-operations')} data-testid="button-goto-financial-ops">
          <TrendingUp className="h-4 w-4 mr-2" />Financial Ops
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate('/budget')} data-testid="button-goto-budget">
          <DollarSign className="h-4 w-4 mr-2" />Budget
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate('/cost-submission')} data-testid="button-goto-cost-submissions">
          <Receipt className="h-4 w-4 mr-2" />Cost Submissions
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate('/wallet')} data-testid="button-goto-wallet">
          <Wallet className="h-4 w-4 mr-2" />Wallet
        </Button>
      </div>

      <PageInfoBanner
        title="Down-Payment Approval - Transportation Advances"
        description="This page handles TRANSPORTATION ADVANCE requests -- money given to field staff BEFORE they do their work, to cover travel costs for site visits. This is DIFFERENT from Tier 1/Tier 2 Approvals, which handle wallet withdrawals (money already earned). Advances approved here are automatically deducted later when the site visit fee is credited to the staff member's wallet, so there is no double-paying."
        descriptionAr="تتعامل هذه الصفحة مع طلبات السلف المسبقة للنقل -- أموال تُعطى للموظفين الميدانيين قبل قيامهم بالعمل لتغطية تكاليف التنقل للزيارات الميدانية."
        workflowSteps={[
          { step: 1, role: 'Data Collector', action: 'Requests travel advance', description: 'A field staff member requests upfront money for transportation before going on a site visit.' },
          { step: 2, role: 'Supervisor', action: 'Reviews request (Tier 1)', description: 'Supervisor reviews and approves or rejects the advance request.' },
          { step: 3, role: 'Admin', action: 'Authorizes payment (Tier 2)', description: 'Admin or Finance Admin approves the advance amount and authorizes payment.' },
          { step: 4, role: 'Finance Admin', action: 'Sends advance', description: 'Finance sends the advance money to the staff member.' },
          { step: 5, role: 'System', action: 'Auto-deducts when work is done', description: 'When the site visit fee is credited, the advance is automatically subtracted.' },
        ]}
        workflowStepsAr={[
          { step: 1, role: 'جامع بيانات', action: 'يطلب سلفة نقل', description: 'يطلب الموظف الميداني أموالاً مقدمة لتغطية تكاليف النقل.' },
          { step: 2, role: 'المشرف', action: 'يراجع الطلب (المستوى الأول)', description: 'يراجع المشرف ويوافق أو يرفض.' },
          { step: 3, role: 'المدير', action: 'يعتمد الصرف (المستوى الثاني)', description: 'يوافق المدير على مبلغ السلفة.' },
          { step: 4, role: 'مدير المالية', action: 'يُرسل السلفة', description: 'يرسل المبلغ للموظف.' },
          { step: 5, role: 'النظام', action: 'يخصم تلقائياً', description: 'تُخصم السلفة تلقائياً عند إضافة أتعاب الزيارة.' },
        ]}
      />

      {/* ── Shared filter bar (applies to all analytics tabs) ── */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search site, team member, hub, state…"
              className="pl-8 h-8 text-sm"
              data-testid="input-down-filter-search"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-sm w-[200px]" data-testid="select-down-filter-status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending_supervisor">Pending Supervisor</SelectItem>
              <SelectItem value="pending_admin">Pending Admin</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="partially_paid">Partially Paid</SelectItem>
              <SelectItem value="fully_paid">Fully Paid</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={mmpFilter} onValueChange={setMmpFilter}>
            <SelectTrigger className="h-8 text-sm w-[180px]" data-testid="select-down-filter-mmp">
              <SelectValue placeholder="All MMPs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All MMPs</SelectItem>
              {uniqueMmps.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground gap-1" onClick={() => { setSearch(''); setStatusFilter('all'); setMmpFilter('all'); }} data-testid="button-down-clear-filters">
              Clear ({activeFilterCount})
            </Button>
          )}
          <Badge variant="secondary" className="text-xs ml-auto">{filteredRequests.length} of {requests.length} requests</Badge>
        </div>
      </Card>

      {/* ── View tabs ── */}
      <Tabs value={viewTab} onValueChange={setViewTab} className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="approval" className="gap-1.5" data-testid="tab-approval">
            <ClipboardCheck className="h-4 w-4" />Approval
          </TabsTrigger>
          <TabsTrigger value="byState" className="gap-1.5" data-testid="tab-down-by-state">
            <MapPin className="h-4 w-4" />By State
          </TabsTrigger>
          <TabsTrigger value="byProject" className="gap-1.5" data-testid="tab-down-by-project">
            <FolderKanban className="h-4 w-4" />By Project
          </TabsTrigger>
          <TabsTrigger value="byMMP" className="gap-1.5" data-testid="tab-down-by-mmp">
            <ClipboardList className="h-4 w-4" />By MMP
          </TabsTrigger>
          <TabsTrigger value="allRequests" className="gap-1.5" data-testid="tab-down-all-requests">
            <FileText className="h-4 w-4" />All Requests
          </TabsTrigger>
          <TabsTrigger value="disbursement" className="gap-1.5" data-testid="tab-down-disbursement">
            <BarChart3 className="h-4 w-4" />Disbursement Tracker
          </TabsTrigger>
        </TabsList>

        {/* ─── Approval (default) ─── */}
        <TabsContent value="approval" className="space-y-4">
          <Alert className={selectedTier === 'tier1' ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30' : ''}>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {selectedTier === 'tier1' ? (
                <><strong>Tier 1 - Supervisor Approval Flow:</strong> Review down-payment requests from data collectors and coordinators. Approved requests will be forwarded to Tier 2 (Admin) for final processing and payment.</>
              ) : (
                <><strong>Tier 2 - Admin Processing Flow:</strong> Process requests that have been approved by supervisors. You can approve, reject, or process payments directly to the requester's wallet.</>
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
              <CardDescription>Click a row to expand and see individual requests · Breakdown per state / region</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <GroupedSummaryTable rows={byState} groupLabel="State" loading={loading} getProfileName={getProfileName} />
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
              <CardDescription>Grouped by cooperating partner / activity type · Click a row to expand requests</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <GroupedSummaryTable rows={byProject} groupLabel="Project / Activity" loading={loading} getProfileName={getProfileName} />
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
              <CardDescription>Grouped by Monthly Monitoring Plan · Click a row to expand requests</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <GroupedSummaryTable rows={byMMP} groupLabel="MMP" loading={loading} getProfileName={getProfileName} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── All Requests ─── */}
        <TabsContent value="allRequests" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                All Requests (Detailed)
              </CardTitle>
              <CardDescription>
                {filteredRequests.length} request{filteredRequests.length !== 1 ? 's' : ''} — click Details for full info
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <AllRequestsTable requests={filteredRequests} getProfileName={getProfileName} loading={loading} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Disbursement Tracker ─── */}
        <TabsContent value="disbursement" className="space-y-4">
          {(() => {
            const disbursed = filteredRequests.filter(r =>
              r.status === 'fully_paid' || r.status === 'partially_paid' || r.status === 'approved'
            );

            // Unique option lists for filter dropdowns
            const uStates = [...new Set(disbursed.map(r => r.stateName).filter(Boolean))].sort() as string[];
            const uHubs = [...new Set(disbursed.map(r => r.hubName).filter(Boolean))].sort() as string[];
            const uLocalities = [...new Set(disbursed.map(r => r.localityName).filter(Boolean))].sort() as string[];
            const uMmps = [...new Set(disbursed.map(r => r.mmpName).filter(Boolean))].sort() as string[];
            const uEnumerators = [...new Set(disbursed.map(r => r.requestedByName || getProfileName(r.requestedBy)).filter(Boolean))].sort() as string[];

            // Apply disbursement-specific filters
            const filtered = disbursed.filter(r => {
              if (disbState !== 'all' && r.stateName !== disbState) return false;
              if (disbHub !== 'all' && r.hubName !== disbHub) return false;
              if (disbLocality !== 'all' && r.localityName !== disbLocality) return false;
              if (disbMmp !== 'all' && r.mmpName !== disbMmp) return false;
              if (disbEnumerator !== 'all' && (r.requestedByName || getProfileName(r.requestedBy)) !== disbEnumerator) return false;
              return true;
            });

            const activeDisbFilters = [disbState, disbHub, disbLocality, disbMmp, disbEnumerator].filter(v => v !== 'all').length;

            const totalApproved = filtered.reduce((s, r) => s + (r.approvedAmount ?? r.requestedAmount), 0);
            const totalPaid = filtered.reduce((s, r) => s + r.totalPaidAmount, 0);
            const totalRemaining = filtered.reduce((s, r) => s + r.remainingAmount, 0);
            const fullyPaid = filtered.filter(r => r.status === 'fully_paid').length;
            const partiallyPaid = filtered.filter(r => r.status === 'partially_paid').length;
            const pendingDisburse = filtered.filter(r => r.status === 'approved').length;

            // Group by helper
            const getGroupKey = (r: DownPaymentRequest): string => {
              switch (disbGroupBy) {
                case 'enumerator': return r.requestedByName || getProfileName(r.requestedBy) || 'Unknown';
                case 'state': return r.stateName || 'Unknown';
                case 'hub': return r.hubName || 'Unknown';
                case 'locality': return r.localityName || 'Unknown';
                case 'mmp': return r.mmpName || 'Unknown';
                default: return '';
              }
            };

            const groups = disbGroupBy !== 'none'
              ? filtered.reduce((acc, r) => {
                  const k = getGroupKey(r);
                  if (!acc[k]) acc[k] = [];
                  acc[k].push(r);
                  return acc;
                }, {} as Record<string, DownPaymentRequest[]>)
              : {};
            const groupKeys = Object.keys(groups).sort();

            const renderRow = (req: DownPaymentRequest) => {
              const approved = req.approvedAmount ?? req.requestedAmount;
              const pctPaid = approved > 0 ? Math.round((req.totalPaidAmount / approved) * 100) : 0;
              return (
                <TableRow key={req.id} data-testid={`row-disbursement-${req.id}`}>
                  <TableCell className="font-medium text-sm">{req.requestedByName || getProfileName(req.requestedBy)}</TableCell>
                  <TableCell className="max-w-[120px] truncate text-sm" title={req.siteName}>{req.siteName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{req.stateName || '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{req.hubName || '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[90px] truncate" title={req.localityName}>{req.localityName || '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[90px] truncate" title={req.mmpName}>{req.mmpName || '—'}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{(req.approvedAmount ?? req.requestedAmount).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="font-mono text-sm">{req.totalPaidAmount.toLocaleString()}</span>
                      {pctPaid > 0 && <span className="text-xs text-muted-foreground">{pctPaid}%</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-amber-600 dark:text-amber-400">
                    {req.remainingAmount > 0 ? req.remainingAmount.toLocaleString() : '—'}
                  </TableCell>
                  <TableCell>
                    {req.status === 'fully_paid' ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-200 gap-1 text-[10px]">
                        <CheckCircle2 className="h-3 w-3" />Paid
                      </Badge>
                    ) : req.status === 'partially_paid' ? (
                      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-200 gap-1 text-[10px]">
                        <TrendingUp className="h-3 w-3" />Partial
                      </Badge>
                    ) : (
                      <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-200 gap-1 text-[10px]">
                        <DollarSign className="h-3 w-3" />Approved
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {req.updatedAt ? format(parseISO(req.updatedAt), 'dd/MM/yy') : '—'}
                  </TableCell>
                </TableRow>
              );
            };

            return (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/30">
                    <CardContent className="pt-4 pb-3">
                      <p className="text-xs text-muted-foreground mb-1">Total Approved</p>
                      <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{totalApproved.toLocaleString()} SDG</p>
                      <p className="text-xs text-muted-foreground">{filtered.length} request{filtered.length !== 1 ? 's' : ''}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-green-200 bg-green-50 dark:bg-green-950/30">
                    <CardContent className="pt-4 pb-3">
                      <p className="text-xs text-muted-foreground mb-1">Total Disbursed</p>
                      <p className="text-xl font-bold text-green-700 dark:text-green-300">{totalPaid.toLocaleString()} SDG</p>
                      <p className="text-xs text-muted-foreground">{fullyPaid} fully paid</p>
                    </CardContent>
                  </Card>
                  <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/30">
                    <CardContent className="pt-4 pb-3">
                      <p className="text-xs text-muted-foreground mb-1">Remaining</p>
                      <p className="text-xl font-bold text-amber-700 dark:text-amber-300">{totalRemaining.toLocaleString()} SDG</p>
                      <p className="text-xs text-muted-foreground">{partiallyPaid} partial</p>
                    </CardContent>
                  </Card>
                  <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/30">
                    <CardContent className="pt-4 pb-3">
                      <p className="text-xs text-muted-foreground mb-1">Pending Payment</p>
                      <p className="text-xl font-bold text-orange-700 dark:text-orange-300">{pendingDisburse}</p>
                      <p className="text-xs text-muted-foreground">approved, not yet paid</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Filter + Group By bar */}
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex flex-wrap gap-2 items-center">
                      <Select value={disbEnumerator} onValueChange={setDisbEnumerator}>
                        <SelectTrigger className="h-8 text-xs w-[160px]" data-testid="select-disb-enumerator">
                          <User className="h-3 w-3 mr-1 shrink-0" />
                          <SelectValue placeholder="Enumerator" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Enumerators</SelectItem>
                          {uEnumerators.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                        </SelectContent>
                      </Select>

                      <Select value={disbState} onValueChange={setDisbState}>
                        <SelectTrigger className="h-8 text-xs w-[140px]" data-testid="select-disb-state">
                          <MapPin className="h-3 w-3 mr-1 shrink-0" />
                          <SelectValue placeholder="State" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All States</SelectItem>
                          {uStates.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>

                      <Select value={disbHub} onValueChange={setDisbHub}>
                        <SelectTrigger className="h-8 text-xs w-[140px]" data-testid="select-disb-hub">
                          <Building2 className="h-3 w-3 mr-1 shrink-0" />
                          <SelectValue placeholder="Hub" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Hubs</SelectItem>
                          {uHubs.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>

                      <Select value={disbLocality} onValueChange={setDisbLocality}>
                        <SelectTrigger className="h-8 text-xs w-[140px]" data-testid="select-disb-locality">
                          <MapPin className="h-3 w-3 mr-1 shrink-0" />
                          <SelectValue placeholder="Locality" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Localities</SelectItem>
                          {uLocalities.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                        </SelectContent>
                      </Select>

                      <Select value={disbMmp} onValueChange={setDisbMmp}>
                        <SelectTrigger className="h-8 text-xs w-[140px]" data-testid="select-disb-mmp">
                          <ClipboardList className="h-3 w-3 mr-1 shrink-0" />
                          <SelectValue placeholder="MMP" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All MMPs</SelectItem>
                          {uMmps.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                        </SelectContent>
                      </Select>

                      <div className="flex items-center gap-1 ml-auto">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">Group by:</span>
                        <Select value={disbGroupBy} onValueChange={setDisbGroupBy}>
                          <SelectTrigger className="h-8 text-xs w-[130px]" data-testid="select-disb-groupby">
                            <SelectValue placeholder="Group by" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Grouping</SelectItem>
                            <SelectItem value="enumerator">Enumerator</SelectItem>
                            <SelectItem value="state">State</SelectItem>
                            <SelectItem value="hub">Hub</SelectItem>
                            <SelectItem value="locality">Locality</SelectItem>
                            <SelectItem value="mmp">MMP</SelectItem>
                          </SelectContent>
                        </Select>
                        {activeDisbFilters > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-muted-foreground hover:text-destructive"
                            onClick={() => { setDisbState('all'); setDisbHub('all'); setDisbLocality('all'); setDisbMmp('all'); setDisbEnumerator('all'); }}
                            data-testid="button-disb-clear-filters"
                          >
                            Clear ({activeDisbFilters})
                          </Button>
                        )}
                      </div>
                    </div>
                    {activeDisbFilters > 0 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Showing {filtered.length} of {disbursed.length} records
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Table */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      Disbursement Tracker
                      {activeDisbFilters > 0 && (
                        <Badge variant="secondary" className="text-[10px]">{activeDisbFilters} filter{activeDisbFilters !== 1 ? 's' : ''} active</Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      Approved / paid transport advance requests with disbursement status
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    {loading ? (
                      <div className="p-6 space-y-2">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                    ) : filtered.length === 0 ? (
                      <div className="p-12 text-center text-muted-foreground">No records match the selected filters / لا توجد سجلات</div>
                    ) : disbGroupBy !== 'none' ? (
                      // Grouped view
                      <div className="divide-y">
                        {groupKeys.map(gk => {
                          const rows = groups[gk];
                          const gTotal = rows.reduce((s, r) => s + (r.approvedAmount ?? r.requestedAmount), 0);
                          const gPaid = rows.reduce((s, r) => s + r.totalPaidAmount, 0);
                          const gRemaining = rows.reduce((s, r) => s + r.remainingAmount, 0);
                          return (
                            <div key={gk}>
                              <div className="px-4 py-2 bg-muted/40 flex items-center justify-between gap-4 flex-wrap">
                                <span className="font-semibold text-sm">{gk}</span>
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                  <span>{rows.length} request{rows.length !== 1 ? 's' : ''}</span>
                                  <span>Approved: <span className="font-mono text-foreground">{gTotal.toLocaleString()}</span></span>
                                  <span>Paid: <span className="font-mono text-green-700 dark:text-green-400">{gPaid.toLocaleString()}</span></span>
                                  <span>Remaining: <span className="font-mono text-amber-600">{gRemaining.toLocaleString()}</span></span>
                                </div>
                              </div>
                              <div className="overflow-x-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Enumerator</TableHead>
                                      <TableHead>Site</TableHead>
                                      <TableHead>State</TableHead>
                                      <TableHead>Hub</TableHead>
                                      <TableHead>Locality</TableHead>
                                      <TableHead>MMP</TableHead>
                                      <TableHead className="text-right">Approved</TableHead>
                                      <TableHead className="text-right">Paid</TableHead>
                                      <TableHead className="text-right">Remaining</TableHead>
                                      <TableHead>Status</TableHead>
                                      <TableHead>Updated</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>{rows.map(renderRow)}</TableBody>
                                </Table>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      // Flat view
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Enumerator</TableHead>
                              <TableHead>Site</TableHead>
                              <TableHead>State</TableHead>
                              <TableHead>Hub</TableHead>
                              <TableHead>Locality</TableHead>
                              <TableHead>MMP</TableHead>
                              <TableHead className="text-right">Approved</TableHead>
                              <TableHead className="text-right">Paid</TableHead>
                              <TableHead className="text-right">Remaining</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Updated</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>{filtered.map(renderRow)}</TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            );
          })()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
