import { useState, useMemo, useRef, useEffect, memo, useCallback, type ReactNode } from 'react';
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
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
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
  ChevronUp,
  Search,
  RefreshCw,
  CheckSquare,
  X,
  Calendar,
  Building,
  Globe,
  Activity,
  Undo2,
  PenLine,
  Trash2,
  Hash,
  Shield,
  ShieldCheck,
  Eye,
  Banknote,
  Pencil,
  Send,
  Fingerprint,
  Users,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { filterDownPayments, exportToCSV, exportToExcel, exportToPDF, getDownPaymentStats } from '@/utils/downPaymentExport';
import { generateFinancialStatementPdf, type StatementRow, type StatementConfig } from '@/utils/financialStatementPdf';
import { generateFinancialStatementExcel, generateFinancialStatementExcelBase64, generateAllSheetsStatementExcelBase64 } from '@/utils/financialStatementExcel';
import { buildEnhancedPaymentEmailHTML } from '@/services/email-notification.service';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { SignatureConfirmationModal } from '@/components/signatures/SignatureConfirmationModal';
import { supabase } from '@/integrations/supabase/client';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import { dispatchNotification } from '@/lib/notify';
import { generateTransportAdvanceCertificatePdf, generateTransportAdvanceCertificateBase64, generateBulkPaymentPdf, generateBulkPaymentPdfBase64 } from '@/utils/transportAdvanceCertificatePdf';
import { EmailNotificationService } from '@/services/email-notification.service';
import { EmailCCInput } from '@/components/EmailCCInput';
import { useToast } from '@/hooks/use-toast';
import { Mail, Wallet, Upload, ImageIcon } from 'lucide-react';

interface DownPaymentApprovalPanelProps {
  userRole: 'supervisor' | 'admin';
  externalFilters?: DownPaymentFilter;
  hideFiltersBar?: boolean;
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

type BulkSummaryEntry = { count: number; requested: number; approved: number };

// ── Module-scope pure helpers ─────────────────────────────────────────────────
// These don't close over any component state so they're stable references
// (same function identity across every render). Moving them here is the key
// prerequisite for wrapping RequestCard in useMemo([]) below.

function isApprovedOrPaid(status: string) {
  return ['approved', 'partially_paid', 'fully_paid'].includes(status);
}

function getStatusBadge(status: string) {
  const statusMap: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any; label: string; labelAr: string }> = {
    pending_supervisor: { variant: 'secondary', icon: Clock, label: 'Pending Supervisor', labelAr: 'بانتظار المشرف' },
    pending_admin: { variant: 'outline', icon: Clock, label: 'Pending Admin', labelAr: 'بانتظار الإدارة' },
    approved: { variant: 'default', icon: CheckCircle2, label: 'Approved', labelAr: 'تمت الموافقة' },
    rejected: { variant: 'destructive', icon: XCircle, label: 'Rejected', labelAr: 'مرفوض' },
    partially_paid: { variant: 'outline', icon: DollarSign, label: 'Partially Paid', labelAr: 'مدفوع جزئياً' },
    fully_paid: { variant: 'default', icon: CheckCircle2, label: 'Fully Paid', labelAr: 'مدفوع بالكامل' },
    cancelled: { variant: 'secondary', icon: X, label: 'Cancelled', labelAr: 'ملغي' },
  };
  const config = statusMap[status] || { variant: 'secondary' as const, icon: Clock, label: status.replace(/_/g, ' '), labelAr: '' };
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {config.label} / {config.labelAr}
    </Badge>
  );
}

function WorkflowTimeline({ request }: { request: DownPaymentRequest }) {
  const status = request.status;
  const supervisorPassed = status !== 'pending_supervisor';
  const adminPassed = status === 'approved' || status === 'partially_paid' || status === 'fully_paid';
  const isPaid = status === 'partially_paid' || status === 'fully_paid';
  const receiptConfirmed = !!(request.metadata as any)?.receipt_confirmation?.confirmed;
  const isRejected = status === 'rejected';
  const steps = [
    { key: 'submitted', label: 'T1', done: true },
    { key: 'supervisor', label: 'T2', done: supervisorPassed && !isRejected },
    { key: 'admin', label: 'Signed', done: adminPassed },
    { key: 'paid', label: 'Paid', done: isPaid },
    { key: 'confirmed', label: 'Confirmed', done: receiptConfirmed },
  ];
  const getRejectedStep = () => {
    if (!isRejected) return -1;
    if (request.adminProcessedBy && request.adminStatus === 'rejected') return 2;
    if (request.supervisorApprovedBy && request.supervisorStatus === 'rejected') return 1;
    return 1;
  };
  const rejectedStep = getRejectedStep();
  return (
    <div className="flex items-center gap-1 text-xs flex-wrap" data-testid={`timeline-${request.id}`}>
      {steps.map((step, idx) => (
        <div key={step.key} className="flex items-center gap-0.5">
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
            rejectedStep === idx
              ? 'bg-red-500'
              : isRejected && idx > rejectedStep
                ? 'bg-muted-foreground/30'
                : step.done
                  ? 'bg-emerald-500'
                  : 'bg-muted-foreground/30'
          }`} />
          <span className={`text-xs ${
            rejectedStep === idx
              ? 'text-red-500 font-medium'
              : step.done
                ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                : 'text-muted-foreground'
          }`}>{step.label}</span>
          {idx < steps.length - 1 && (
            <span className="text-muted-foreground/50 mx-0.5">&rarr;</span>
          )}
        </div>
      ))}
    </div>
  );
}

const VirtualizedRequestList = memo(function VirtualizedRequestList({
  requests,
  renderCard,
}: {
  requests: DownPaymentRequest[];
  renderCard: (request: DownPaymentRequest) => ReactNode;
}) {
  if (requests.length === 0) return null;
  return (
    <div className="max-h-[70vh] overflow-y-auto rounded-md space-y-3 pr-1">
      {requests.map((request) => (
        <div key={request.id} style={{ contentVisibility: 'auto', containIntrinsicSize: '0 250px' }}>
          {renderCard(request)}
        </div>
      ))}
    </div>
  );
});

const BulkSummaryTable = memo(function BulkSummaryTable({ requests, users }: {
  requests: Array<{ requestedBy?: string; requestedAmount: number; approvedAmount?: number; stateName?: string; hubName?: string; [key: string]: unknown }>;
  users?: Array<{ id: string; email?: string; [key: string]: unknown }>;
}) {
  const [activeTab, setActiveTab] = useState<'state' | 'hub' | 'locality' | 'requester'>('state');

  if (requests.length === 0) {
    return (
      <div className="border rounded-md flex items-center justify-center h-[200px]">
        <p className="text-sm text-muted-foreground animate-pulse">Computing summary… / جارٍ تحميل الملخص…</p>
      </div>
    );
  }

  // Pre-build O(1) user lookup map — avoids O(n×m) find() on every render
  const userMap = useMemo(() => {
    const m = new Map<string, string>();
    (users || []).forEach(u => {
      m.set(u.id, (u as any)?.fullName || (u as any)?.full_name || u?.email || 'Unknown');
    });
    return m;
  }, [users]);

  // Memoize group computations — only recalculate when `requests` or `userMap` actually change
  const buildGroups = useMemo(() => {
    const build = (keyFn: (r: typeof requests[0]) => string): [string, BulkSummaryEntry][] => {
      const m = new Map<string, BulkSummaryEntry>();
      requests.forEach(r => {
        const k = keyFn(r) || 'Unknown';
        const e = m.get(k) || { count: 0, requested: 0, approved: 0 };
        m.set(k, { count: e.count + 1, requested: e.requested + r.requestedAmount, approved: e.approved + (r.approvedAmount || r.requestedAmount) });
      });
      return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
    };
    return {
      state:     build(r => (r.stateName as string)    || '-'),
      hub:       build(r => (r.hubName as string)       || '-'),
      locality:  build(r => (r.localityName as string)  || '-'),
      requester: build(r => userMap.get(r.requestedBy as string) || 'Unknown'),
    };
  }, [requests, userMap]);

  const tabs = [
    { key: 'state'     as const, label: 'By State',     groups: buildGroups.state },
    { key: 'hub'       as const, label: 'By Hub',       groups: buildGroups.hub },
    { key: 'locality'  as const, label: 'By Locality',  groups: buildGroups.locality },
    { key: 'requester' as const, label: 'By Requester', groups: buildGroups.requester },
  ];

  const active = tabs.find(t => t.key === activeTab)!;
  const { totalReq, totalApp } = useMemo(() => ({
    totalReq: requests.reduce((s, r) => s + r.requestedAmount, 0),
    totalApp: requests.reduce((s, r) => s + (r.approvedAmount || r.requestedAmount), 0),
  }), [requests]);

  return (
    <div className="border rounded-md overflow-hidden text-xs">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="w-full rounded-none h-auto p-0 bg-muted/60 border-b gap-0">
          {tabs.map(t => (
            <TabsTrigger
              key={t.key}
              value={t.key}
              className="flex-1 text-[11px] rounded-none py-1.5 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
            >
              {t.label} <span className="ml-1 opacity-50">({t.groups.length})</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {/* Render only the active tab's table — avoids mounting all 4 heavy tables at once */}
        <TabsContent value={activeTab} className="mt-0">
          <ScrollArea className="h-[180px]">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-[11px] py-1.5 font-semibold">{active.label.replace('By ', '')}</TableHead>
                  <TableHead className="text-[11px] py-1.5 text-center font-semibold w-10">#</TableHead>
                  <TableHead className="text-[11px] py-1.5 text-right font-semibold">Requested</TableHead>
                  <TableHead className="text-[11px] py-1.5 text-right font-semibold">Approved</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {active.groups.map(([name, g], i) => (
                  <TableRow key={name} className={i % 2 === 1 ? 'bg-muted/20' : ''}>
                    <TableCell className="py-1 font-medium truncate max-w-[160px]">{name}</TableCell>
                    <TableCell className="py-1 text-center text-muted-foreground">{g.count}</TableCell>
                    <TableCell className="py-1 text-right font-mono text-muted-foreground">SDG {g.requested.toLocaleString()}</TableCell>
                    <TableCell className="py-1 text-right font-mono font-semibold text-green-700 dark:text-green-400">SDG {g.approved.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </TabsContent>
      </Tabs>
      <div className="flex items-center justify-between bg-muted/40 border-t px-3 py-1.5 text-[11px] font-semibold">
        <span className="text-muted-foreground">Grand Total — {requests.length} requests</span>
        <div className="flex gap-4">
          <span className="text-muted-foreground">SDG {totalReq.toLocaleString()}</span>
          <span className="text-green-700 dark:text-green-400">SDG {totalApp.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
});

export function DownPaymentApprovalPanel({ userRole, externalFilters, hideFiltersBar }: DownPaymentApprovalPanelProps) {
  const { currentUser, users } = useUser();
  const { isSuperAdmin } = useSuperAdmin();
  const { requests, loading, refreshRequests, supervisorApprove, supervisorReject, adminApprove, adminReject, processPayment, bulkApprove, revertToPending, bulkRevertToPending, confirmReceipt, reportNotReceived, resendPaymentNotification, deleteRequest, editRequest } = useDownPayment();
  const { toast } = useToast();


  const [selectedRequest, setSelectedRequest] = useState<DownPaymentRequest | null>(null);
  const [action, setAction] = useState<'approve' | 'reject' | 'pay' | 'view_audit' | 'revert' | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DownPaymentRequest | null>(null);
  const [signatureRequest, setSignatureRequest] = useState<DownPaymentRequest | null>(null);
  const [notes, setNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectConfirmStep, setRejectConfirmStep] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [payProofFile, setPayProofFile] = useState<File | null>(null);
  const [payProofPreviewUrl, setPayProofPreviewUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('pending');
  const [completedSubTab, setCompletedSubTab] = useState<'paid_waiting' | 'confirmed'>('paid_waiting');
  const [showFilters, setShowFilters] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [approvalType, setApprovalType] = useState<ApprovalType>('full');
  const [customPercentage, setCustomPercentage] = useState(100);
  const [customAmount, setCustomAmount] = useState(0);
  const [revertTarget, setRevertTarget] = useState<'pending_supervisor' | 'pending_admin' | 'approved'>('pending_supervisor');

  const [filters, setFilters] = useState<DownPaymentFilter>({});

  const [paymentRequestDialog, setPaymentRequestDialog] = useState<{
    open: boolean;
    request: DownPaymentRequest | null;
    bulkRequests: DownPaymentRequest[];
    isBulk: boolean;
    availableRecipients: Array<{ id: string; email: string; name: string; role: string }>;
    selectedRecipientIds: string[];
    ccEmails: string[];
    loading: boolean;
    sending: boolean;
    bulkGroupBy: string;
    bulkGroupValue: string;
    sendMode: 'pdf' | 'excel';
    showPreview: boolean;
    usdRate: string;
    bulkMeta: { count: number; total: number };
  }>({ open: false, request: null, bulkRequests: [], bulkMeta: { count: 0, total: 0 }, isBulk: false, availableRecipients: [], selectedRecipientIds: [], ccEmails: [], loading: false, sending: false, bulkGroupBy: '', bulkGroupValue: '', sendMode: 'pdf', showPreview: false, usdRate: '' });
  const [markPaidProcessing, setMarkPaidProcessing] = useState(false);
  const [bulkPaymentIds, setBulkPaymentIds] = useState<Set<string>>(new Set());
  const [markAsPaidDialog, setMarkAsPaidDialog] = useState<{
    open: boolean;
    request: DownPaymentRequest | null;
    proofFile: File | null;
    proofPreviewUrl: string | null;
    notes: string;
    uploading: boolean;
  }>({ open: false, request: null, proofFile: null, proofPreviewUrl: null, notes: '', uploading: false });

  const [batchPayDialog, setBatchPayDialog] = useState<{
    open: boolean;
    requests: DownPaymentRequest[];
    proofFiles: File[];
    proofPreviewUrls: string[];
    notes: string;
    uploading: boolean;
    partialPercent: number | null;
    preFundId: string | null;
    preFunds: Array<{ id: string; name: string; currency: string; available_balance: number }>;
  }>({ open: false, requests: [], proofFiles: [], proofPreviewUrls: [], notes: '', uploading: false, partialPercent: null, preFundId: null, preFunds: [] });

  const [bulkConfirmRequests, setBulkConfirmRequests] = useState<DownPaymentRequest[]>([]);

  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    request: DownPaymentRequest | null;
    requestedAmount: number;
    approvedAmount: number;
    justification: string;
    siteName: string;
    reason: string;
    processing: boolean;
  }>({ open: false, request: null, requestedAmount: 0, approvedAmount: 0, justification: '', siteName: '', reason: '', processing: false });

  // Stable ref holding all mutable closure values RequestCard needs.
  // Allows RequestCard to be wrapped in useMemo([]) — same function reference
  // on every render — so React does reconciliation instead of unmount+remount
  // for all 500+ list cards when only dialog state changes.
  const _cardCtxRef = useRef<any>(null);

  const uniqueHubs = useMemo(() => [...new Set(requests.map(r => r.hubName).filter(Boolean))], [requests]);

  const uniqueStates = useMemo(() => {
    const hubId = filters.hubId;
    const base = hubId
      ? requests.filter(r => r.hubId === hubId || r.hubName?.toLowerCase() === hubId.toLowerCase())
      : requests;
    return [...new Set(base.map(r => r.stateName).filter(Boolean))].sort() as string[];
  }, [requests, filters.hubId]);

  const uniqueLocalities = useMemo(() => {
    const hubId = filters.hubId;
    const stateName = filters.stateName;
    let base = hubId
      ? requests.filter(r => r.hubId === hubId || r.hubName?.toLowerCase() === hubId.toLowerCase())
      : requests;
    if (stateName) {
      base = base.filter(r => r.stateName?.toLowerCase() === stateName.toLowerCase());
    }
    return [...new Set(base.map(r => r.localityName).filter(Boolean))].sort() as string[];
  }, [requests, filters.hubId, filters.stateName]);
  const uniqueMMPs = useMemo(() => [...new Set(requests.map(r => r.mmpName).filter(Boolean))].sort(), [requests]);
  const uniqueSites = useMemo(() => [...new Set(requests.filter(r => ['approved', 'partially_paid', 'fully_paid'].includes(r.status)).map(r => r.siteName).filter(Boolean))].sort(), [requests]);

  // Sites with more than one active (non-cancelled, non-rejected) request — used to flag duplicates
  const duplicateSiteNames = useMemo(() => {
    const active = requests.filter(r => !['cancelled', 'rejected', 'deleted'].includes(r.status));
    const counts = new Map<string, number>();
    active.forEach(r => { if (r.siteName) counts.set(r.siteName, (counts.get(r.siteName) || 0) + 1); });
    return new Set([...counts.entries()].filter(([, c]) => c > 1).map(([name]) => name));
  }, [requests]);

  // Resolve a user display name — prefers stored name, falls back to users list lookup
  const resolveUserName = (userId: string, storedName?: string) => {
    if (storedName && storedName !== 'Unknown') return storedName;
    const u = users?.find(u => u.id === userId);
    return (u as any)?.fullName || (u as any)?.full_name || u?.email || 'Unknown';
  };
  const uniqueSupervisors = useMemo(() => {
    const approvedReqs = requests.filter(r => ['approved', 'partially_paid', 'fully_paid'].includes(r.status));
    const supervisorIds = [...new Set(approvedReqs.map(r => r.supervisorApprovedBy).filter(Boolean))];
    return supervisorIds.map(id => {
      const u = users?.find(u => u.id === id);
      return { id: id!, name: (u as any)?.fullName || (u as any)?.full_name || u?.email || 'Unknown' };
    });
  }, [requests, users]);
  const uniqueEnumerators = useMemo(() => {
    const approvedReqs = requests.filter(r => ['approved', 'partially_paid', 'fully_paid'].includes(r.status));
    const seen = new Map<string, string>();
    approvedReqs.forEach(r => {
      if (r.requestedBy && !seen.has(r.requestedBy as string)) {
        const stored = r.requestedByName;
        const u = users?.find(u => u.id === r.requestedBy);
        const name = (stored && stored !== 'Unknown') ? stored : ((u as any)?.fullName || (u as any)?.full_name || u?.email || 'Unknown');
        seen.set(r.requestedBy as string, name);
      }
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [requests, users]);

  const allUniqueRequesters = useMemo(() => {
    const ids = [...new Set(requests.map(r => r.requestedBy).filter(Boolean))];
    return ids.map(id => {
      const stored = requests.find(r => r.requestedBy === id)?.requestedByName;
      const u = users?.find(u => u.id === id);
      const name = (stored && stored !== 'Unknown') ? stored : ((u as any)?.fullName || (u as any)?.full_name || u?.email || 'Unknown');
      return { id: id!, name };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [requests, users]);

  const effectiveFilters = externalFilters ?? filters;
  const filteredRequests = useMemo(() => filterDownPayments(requests, effectiveFilters), [requests, effectiveFilters]);

  const approvedForPayment = useMemo(() =>
    filteredRequests.filter(r => r.status === 'approved'),
    [filteredRequests]
  );
  const stats = useMemo(() => getDownPaymentStats(filteredRequests), [filteredRequests]);

  // O(1) set lookup for recipient checkboxes — avoids O(n²) .includes() on every render
  const selectedRecipientSet = useMemo(
    () => new Set(paymentRequestDialog.selectedRecipientIds),
    [paymentRequestDialog.selectedRecipientIds]
  );

  // Grouped breakdown of bulkRequests for email breakdowns & send logic.
  // Mirrors BulkSummaryTable's internal buildGroups but lives in the outer
  // component so handleSendPaymentRequest and buildEmailPreviewHtml can use it.
  const buildGroups = useMemo(() => {
    const reqs = paymentRequestDialog.bulkRequests;
    const userNameMap = new Map<string, string>();
    (users || []).forEach((u: any) => {
      userNameMap.set(u.id, u.fullName || u.full_name || u.email || 'Unknown');
    });
    const build = (keyFn: (r: DownPaymentRequest) => string): [string, BulkSummaryEntry][] => {
      const m = new Map<string, BulkSummaryEntry>();
      reqs.forEach(r => {
        const k = keyFn(r) || 'Unknown';
        const e = m.get(k) || { count: 0, requested: 0, approved: 0 };
        m.set(k, { count: e.count + 1, requested: e.requested + r.requestedAmount, approved: e.approved + (r.approvedAmount || r.requestedAmount) });
      });
      return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
    };
    return {
      state:     build(r => r.stateName    || '-'),
      hub:       build(r => r.hubName      || '-'),
      locality:  build(r => r.localityName || '-'),
      requester: build(r => userNameMap.get(r.requestedBy || '') || 'Unknown'),
    };
  }, [paymentRequestDialog.bulkRequests, users]);

  const pendingRequests = useMemo(() => {
    if (userRole === 'supervisor') {
      return filteredRequests.filter(req => req.status === 'pending_supervisor');
    }
    return filteredRequests.filter(req => req.status === 'pending_admin');
  }, [filteredRequests, userRole]);

  const approvedRequests = useMemo(() => {
    if (userRole === 'admin') {
      return filteredRequests.filter(req => req.status === 'approved');
    }
    return [];
  }, [filteredRequests, userRole]);

  const processingRequests = useMemo(() => {
    if (userRole === 'admin') {
      return filteredRequests.filter(req => req.status === 'partially_paid');
    }
    return filteredRequests.filter(req => req.status === 'pending_admin');
  }, [filteredRequests, userRole]);

  const completedRequests = useMemo(() => {
    return filteredRequests.filter(req => req.status === 'fully_paid');
  }, [filteredRequests]);

  const closedRequests = useMemo(() => {
    return filteredRequests.filter(req => req.status === 'rejected' || req.status === 'cancelled');
  }, [filteredRequests]);

  const paidWaitingRequests = useMemo(() => {
    return completedRequests.filter(req => !(req.metadata as any)?.receipt_confirmation?.confirmed);
  }, [completedRequests]);

  const paidConfirmedRequests = useMemo(() => {
    return completedRequests.filter(req => !!(req.metadata as any)?.receipt_confirmation?.confirmed);
  }, [completedRequests]);

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
    try {
      const useSupervisorPath = userRole === 'supervisor';

    const success = useSupervisorPath
        ? await supervisorApprove({
            requestId: selectedRequest.id,
            approvedBy: currentUser.id,
            approvedByName: currentUser.fullName || currentUser.email,
            notes,
            approvalType,
            approvalPercentage: approvalType === 'percentage' ? customPercentage : undefined,
            customAmount: finalAmount,
          })
        : await adminApprove({
            requestId: selectedRequest.id,
            approvedBy: currentUser.id,
            approvedByName: currentUser.fullName || currentUser.email,
            notes,
            approvalType,
            approvalPercentage: approvalType === 'percentage' ? customPercentage : undefined,
            customAmount: finalAmount,
          });

      if (success) {
        // H7 — Notify the requester (bilingual EN/AR) via the central service
        if (selectedRequest.requestedBy) {
          try {
            await NotificationTriggerService.send({
              userId: selectedRequest.requestedBy,
              title: useSupervisorPath ? 'Advance approved by supervisor' : 'Advance fully approved',
              titleAr: useSupervisorPath ? 'تمت موافقة المشرف على السلفة' : 'تمت الموافقة النهائية على السلفة',
              message: `Your advance request for ${selectedRequest.siteName ?? 'site visit'} (${finalAmount.toLocaleString()} SDG) has been ${useSupervisorPath ? 'approved by your supervisor and is now awaiting finance review.' : 'approved by finance and is ready for payment.'}`,
              messageAr: `تمت ${useSupervisorPath ? 'موافقة المشرف على' : 'الموافقة النهائية على'} طلب السلفة (${finalAmount.toLocaleString()} جنيه) ${useSupervisorPath ? 'وهو قيد مراجعة المالية الآن.' : 'وهو جاهز للدفع.'}`,
              type: 'success',
              category: 'approvals',
              priority: useSupervisorPath ? 'normal' : 'high',
              link: '/wallet',
              relatedEntityId: selectedRequest.id,
              relatedEntityType: 'downPayment',
              sendEmail: true,
              emailActionUrl: '/wallet',
              emailActionLabel: 'View Wallet',
            });
          } catch (e) { console.error('NotificationTriggerService (advance approve) failed', e); }
        }
        closeDialog();
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest || !currentUser || !rejectionReason.trim()) return;

    setProcessing(true);
    try {
      const useSupervisorPath = userRole === 'supervisor';
      const success = useSupervisorPath
        ? await supervisorReject({
            requestId: selectedRequest.id,
            rejectedBy: currentUser.id,
            rejectedByName: currentUser.fullName || currentUser.email,
            rejectionReason,
          })
        : await adminReject({
            requestId: selectedRequest.id,
            rejectedBy: currentUser.id,
            rejectedByName: currentUser.fullName || currentUser.email,
            rejectionReason,
          });

      if (success) {
        // H7 — Notify the requester of rejection (bilingual)
        if (selectedRequest.requestedBy) {
          try {
            await NotificationTriggerService.send({
              userId: selectedRequest.requestedBy,
              title: useSupervisorPath ? 'Advance rejected by supervisor' : 'Advance rejected by finance',
              titleAr: useSupervisorPath ? 'تم رفض السلفة من المشرف' : 'تم رفض السلفة من المالية',
              message: `Your advance request for ${selectedRequest.siteName ?? 'site visit'} was rejected. Reason: ${rejectionReason}`,
              messageAr: `تم رفض طلب السلفة. السبب: ${rejectionReason}`,
              type: 'error',
              category: 'approvals',
              priority: 'high',
              link: '/wallet',
              relatedEntityId: selectedRequest.id,
              relatedEntityType: 'downPayment',
              sendEmail: true,
            });
          } catch (e) { console.error('NotificationTriggerService (advance reject) failed', e); }
        }
        closeDialog();
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleProcessPayment = async () => {
    if (!selectedRequest || !currentUser) return;

    if (paymentAmount <= 0) {
      toast({ title: 'Invalid Amount / مبلغ غير صالح', description: 'Please enter a payment amount greater than zero.', variant: 'destructive' });
      return;
    }

    if (paymentAmount > selectedRequest.remainingAmount) {
      toast({ title: 'Amount Exceeds Remaining / المبلغ يتجاوز المتبقي', description: `Payment of ${paymentAmount.toLocaleString()} SDG exceeds the remaining balance of ${selectedRequest.remainingAmount.toLocaleString()} SDG.`, variant: 'destructive' });
      return;
    }

    if (!payProofFile) {
      toast({ title: 'Receipt Required / الإيصال مطلوب', description: 'Please attach a payment receipt before confirming. / يرجى إرفاق إيصال الدفع قبل التأكيد.', variant: 'destructive' });
      return;
    }

    setProcessing(true);
    let receiptUrl: string | null = null;
    try {
      if (payProofFile) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const extension = payProofFile.name.split('.').pop()?.toLowerCase() || 'file';
        const filePath = `payment-proofs/process_${timestamp}_${random}.${extension}`;
        const { error: uploadErr } = await supabase.storage
          .from('mmp-files')
          .upload(filePath, payProofFile, { cacheControl: '3600', upsert: false });
        if (uploadErr) throw new Error(uploadErr.message);
        receiptUrl = supabase.storage.from('mmp-files').getPublicUrl(filePath).data.publicUrl;
      }

      const success = await processPayment({
        requestId: selectedRequest.id,
        amount: paymentAmount,
        processedBy: currentUser.id,
        processedByName: currentUser.fullName || currentUser.email,
        notes,
        receiptUrl,
      });

      if (success) {
        closeDialog();
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleBulkApprove = async (opts?: { notifyStakeholders?: boolean; collectorName?: string }) => {
    if (!currentUser || selectedIds.size === 0) return;

    setProcessing(true);
    try {
      await bulkApprove({
        requestIds: Array.from(selectedIds),
        approvalType,
        approvalPercentage: approvalType === 'percentage' ? customPercentage : undefined,
        customAmount: approvalType === 'custom' ? customAmount : undefined,
        notes,
        approvedBy: currentUser.id,
        approvedByName: currentUser.fullName || currentUser.email,
        notifyStakeholders: opts?.notifyStakeholders ?? false,
        collectorName: opts?.collectorName,
      });
      setSelectedIds(new Set());
      closeDialog();
    } finally {
      setProcessing(false);
    }
  };

  const handleQuickApproveByCollector = async () => {
    if (!currentUser || !filters.dataCollectorId) return;
    const collectorReqs = pendingRequests.filter(r => r.requestedBy === filters.dataCollectorId);
    if (collectorReqs.length === 0) return;
    selectAll(collectorReqs);
    const collectorName = allUniqueRequesters.find(e => e.id === filters.dataCollectorId)?.name;
    setProcessing(true);
    try {
      await bulkApprove({
        requestIds: collectorReqs.map(r => r.id),
        approvalType,
        approvalPercentage: approvalType === 'percentage' ? customPercentage : undefined,
        customAmount: approvalType === 'custom' ? customAmount : undefined,
        notes,
        approvedBy: currentUser.id,
        approvedByName: currentUser.fullName || currentUser.email,
        notifyStakeholders: true,
        collectorName,
      });
      setSelectedIds(new Set());
    } finally {
      setProcessing(false);
    }
  };

  const handleRevert = async () => {
    if (!selectedRequest || !currentUser) return;

    setProcessing(true);
    try {
      const success = await revertToPending({
        requestId: selectedRequest.id,
        revertedBy: currentUser.id,
        revertedByName: currentUser.fullName || currentUser.email,
        reason: notes || undefined,
        targetStatus: revertTarget,
      });
      if (success) closeDialog();
    } finally {
      setProcessing(false);
    }
  };

  const handleBulkRevert = async (targetStatus: 'pending_supervisor' | 'pending_admin' | 'approved', ids?: string[]) => {
    if (!currentUser) return;
    const revertIds = ids ?? Array.from(selectedIds);
    if (revertIds.length === 0) return;
    setProcessing(true);
    try {
      await bulkRevertToPending({
        requestIds: revertIds,
        revertedBy: currentUser.id,
        revertedByName: currentUser.fullName || currentUser.email,
        targetStatus,
      });
      setSelectedIds(new Set());
    } finally {
      setProcessing(false);
    }
  };


  const handleBulkDelete = async () => {
    if (!currentUser || selectedIds.size === 0) return;
    setProcessing(true);
    try {
      let successCount = 0;
      let failCount = 0;
      const now = new Date().toISOString();
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        try {
          const { data: existingMeta } = await supabase
            .from('down_payment_requests')
            .select('metadata')
            .eq('id', id)
            .maybeSingle();
          const meta = (existingMeta?.metadata as Record<string, any>) || {};

          const { error: softErr } = await supabase
            .from('down_payment_requests')
            .update({
              status: 'cancelled',
              site_visit_id: null,
              mmp_site_entry_id: null,
              updated_at: now,
              metadata: { ...meta, deleted: true, deleted_at: now },
            } as any)
            .eq('id', id);

          if (softErr) { failCount++; continue; }

          const { error: deleteError } = await supabase
            .from('down_payment_requests')
            .delete()
            .eq('id', id)
            .eq('status', 'cancelled');

          if (deleteError) {
            console.log('Hard delete blocked for', id, '(RLS), record stays as cancelled+deleted');
          }
          successCount++;
        } catch (e: any) {
          console.error('Delete error for', id, ':', e?.message || e);
          failCount++;
        }
      }
      setSelectedIds(new Set());
      await refreshRequests();
      toast({
        title: `Bulk Delete Complete / اكتمال الحذف الجماعي`,
        description: `${successCount} deleted, they can now submit new requests. / تم حذف ${successCount}، يمكنهم الآن تقديم طلبات جديدة.${failCount > 0 ? ` ${failCount} failed / فشل` : ''}`,
      });
    } finally {
      setProcessing(false);
    }
  };

  const closeDialog = () => {
    setSelectedRequest(null);
    setAction(null);
    setNotes('');
    setRejectionReason('');
    setRejectConfirmStep(false);
    setPaymentAmount(0);
    setApprovalType('full');
    setCustomPercentage(100);
    setCustomAmount(0);
    setRevertTarget('pending_supervisor');
    if (payProofPreviewUrl) URL.revokeObjectURL(payProofPreviewUrl);
    setPayProofFile(null);
    setPayProofPreviewUrl(null);
  };

  const handlePayProofFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (payProofPreviewUrl) URL.revokeObjectURL(payProofPreviewUrl);
    const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    setPayProofFile(file);
    setPayProofPreviewUrl(preview);
  };

  const openActionDialog = (request: DownPaymentRequest, actionType: 'approve' | 'reject' | 'pay' | 'view_audit' | 'revert') => {
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

  const getActiveTabData = (): { data: DownPaymentRequest[]; tabLabel: string } => {
    switch (activeTab) {
      case 'pending':
        return { data: pendingRequests, tabLabel: 'Pending' };
      case 'approved':
        return { data: approvedRequests, tabLabel: 'Approved' };
      case 'processing':
        return { data: processingRequests, tabLabel: 'Processing' };
      case 'completed':
        return {
          data: completedSubTab === 'confirmed' ? paidConfirmedRequests : paidWaitingRequests,
          tabLabel: completedSubTab === 'confirmed' ? 'Confirmed' : 'Paid - Waiting Confirmation',
        };
      case 'all':
      default:
        return { data: filteredRequests, tabLabel: 'All' };
    }
  };

  const handleExport = (type: 'csv' | 'excel' | 'pdf') => {
    const { data, tabLabel } = getActiveTabData();
    const suffix = `down-payments-${tabLabel.toLowerCase()}`;
    if (type === 'csv') {
      exportToCSV(data, suffix);
    } else if (type === 'excel') {
      handleStatementExport('excel');
    } else {
      handleStatementExport('pdf');
    }
  };

  const STATUS_AR_MAP: Record<string, string> = {
    pending_supervisor: 'بانتظار المشرف',
    pending_admin: 'بانتظار المدير',
    approved: 'تمت الموافقة',
    rejected: 'مرفوض',
    partially_paid: 'مدفوع جزئياً',
    fully_paid: 'مدفوع بالكامل',
    cancelled: 'ملغي',
    all: 'الكل',
  };

  const getName = (u: any) => u?.fullName || u?.full_name || u?.name || u?.email || 'Unknown';

  const mapRequestToStatementRow = (req: DownPaymentRequest): StatementRow => {
    const reqUser = users?.find(u => u.id === req.requestedBy);
    const t1User = req.supervisorApprovedBy ? users?.find(u => u.id === req.supervisorApprovedBy) : null;
    const t2User = req.adminProcessedBy ? users?.find(u => u.id === req.adminProcessedBy) : null;
    const approvalTypeLabel = req.approvalType
      ? ({ full: 'Full (100%)', half: 'Half (50%)', percentage: `${req.approvalPercentage ?? ''}%`, custom: 'Custom Amount' }[req.approvalType] ?? req.approvalType)
      : undefined;
    return {
      refId: `PACT-TA-${req.id.substring(0, 8).toUpperCase()}`,
      date: req.requestedAt,
      description: req.justification || req.siteName,
      requester: req.requestedByName || getName(reqUser),
      accountNumber: reqUser?.bankAccount?.accountNumber || '',
      site: req.siteName,
      hub: req.hubName || '',
      state: req.stateName || '',
      locality: req.localityName || '',
      mmpName: req.mmpName || '',
      activityType: req.activityType || '',
      transportationBudget: req.totalTransportationBudget,
      approvalType: approvalTypeLabel,
      paymentType: req.paymentType === 'full_advance' ? 'Full Advance' : req.paymentType === 'installments' ? 'Installments' : req.paymentType,
      justification: req.justification || '',
      status: req.status,
      statusAr: STATUS_AR_MAP[req.status] || '',
      requestedAmount: req.requestedAmount,
      approvedAmount: req.approvedAmount || req.requestedAmount,
      paidAmount: req.totalPaidAmount || 0,
      t1Approver: req.supervisorApprovedByName || (t1User ? getName(t1User) : undefined),
      t1Date: req.supervisorApprovedAt || undefined,
      t1Status: req.supervisorStatus || undefined,
      t2Approver: req.adminProcessedByName || (t2User ? getName(t2User) : undefined),
      t2Date: req.adminProcessedAt || undefined,
      t2Status: req.adminStatus || undefined,
      rejectionReason: req.supervisorRejectionReason || req.adminRejectionReason || undefined,
      notes: req.supervisorNotes || req.adminNotes || undefined,
    };
  };

  const handleStatementExport = async (exportFormat: 'pdf' | 'excel') => {
    const { data: dataToExport } = getActiveTabData();
    if (dataToExport.length === 0) {
      toast({ title: 'No Data', description: 'No requests match the current filters.', variant: 'destructive' });
      return;
    }

    const statementRows: StatementRow[] = dataToExport.map(mapRequestToStatementRow);
    const currentStatusFilter = (filters.status && filters.status.length > 0) ? filters.status.join(', ') : 'All Statuses';
    const config: StatementConfig = {
      title: 'Transportation Advance',
      titleAr: 'سلفة النقل',
      statementType: 'transport_advance',
      statusFilter: currentStatusFilter,
      statusFilterAr: (filters.status && filters.status.length === 1) ? (STATUS_AR_MAP[filters.status[0]] || currentStatusFilter) : 'الكل',
      currency: 'SDG',
    };

    try {
      if (exportFormat === 'pdf') {
        await generateFinancialStatementPdf(statementRows, config);
        toast({ title: 'Statement Downloaded / تم تحميل الكشف', description: `PDF statement exported successfully.` });
      } else {
        generateFinancialStatementExcel(statementRows, config);
        toast({ title: 'Statement Downloaded / تم تحميل الكشف', description: `Excel statement exported successfully.` });
      }
    } catch (err) {
      console.error('Statement export error:', err);
      toast({ title: 'Export Failed', description: 'Could not generate statement. Please try again.', variant: 'destructive' });
    }
  };

  const getSignatureImageData = async (req: DownPaymentRequest): Promise<string | null> => {
    let signatureImageData: string | null = null;
    if (req.adminNotes) {
      const sigMatch = req.adminNotes.match(/ID:\s*(\S+?)(?:\s*\||$)/);
      if (sigMatch?.[1]) {
        try {
          const { data: sigRow } = await supabase
            .from('document_signatures')
            .select('signature_data, signature_method, signer_id')
            .eq('id', sigMatch[1])
            .single();
          if (sigRow?.signature_data && typeof sigRow.signature_data === 'string' && sigRow.signature_data.startsWith('data:')) {
            signatureImageData = sigRow.signature_data;
          }
          if (!signatureImageData && sigRow?.signer_id) {
            try {
              const { data: savedSigs } = await supabase
                .from('handwriting_signatures')
                .select('signature_image')
                .eq('user_id', sigRow.signer_id)
                .eq('is_active', true)
                .order('is_default', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(1);
              if (savedSigs?.[0]?.signature_image && typeof savedSigs[0].signature_image === 'string' && savedSigs[0].signature_image.startsWith('data:')) {
                signatureImageData = savedSigs[0].signature_image;
              }
            } catch { /* continue */ }
          }
        } catch { /* signature fetch failed */ }
      }
    }
    if (!signatureImageData && req.adminProcessedBy) {
      try {
        const { data: savedSigs } = await supabase
          .from('handwriting_signatures')
          .select('signature_image')
          .eq('user_id', req.adminProcessedBy)
          .eq('is_active', true)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1);
        if (savedSigs?.[0]?.signature_image && typeof savedSigs[0].signature_image === 'string' && savedSigs[0].signature_image.startsWith('data:')) {
          signatureImageData = savedSigs[0].signature_image;
        }
      } catch { /* no saved signature */ }
    }
    return signatureImageData;
  };

  const buildCertData = (req: DownPaymentRequest, signatureImageData: string | null) => {
    const requester = users?.find(u => u.id === req.requestedBy);
    const supervisorApprover = req.supervisorApprovedBy ? users?.find(u => u.id === req.supervisorApprovedBy) : null;
    const adminApproverUser = req.adminProcessedBy ? users?.find(u => u.id === req.adminProcessedBy) : null;
    const getName = (u: any) => u?.fullName || u?.full_name || u?.name || u?.email || 'Unknown';

    return {
      request: {
        id: req.id,
        siteName: req.siteName,
        stateName: req.stateName,
        localityName: req.localityName,
        projectName: req.projectName,
        hubName: req.hubName,
        activityType: req.activityType,
        requestedAmount: req.requestedAmount,
        approvedAmount: req.approvedAmount || req.adminApprovedAmount || req.supervisorApprovedAmount,
        totalPaidAmount: req.totalPaidAmount || 0,
        remainingAmount: req.remainingAmount || (req.requestedAmount - (req.totalPaidAmount || 0)),
        justification: req.justification,
        requestedAt: req.requestedAt,
        status: req.status,
        paymentType: req.paymentType,
        approvalType: req.approvalType,
        approvalPercentage: req.approvalPercentage,
      },
      requester: {
        name: getName(requester),
        email: requester?.email || '',
        role: req.requesterRole || null,
      },
      tier1: {
        approverName: getName(supervisorApprover) || 'N/A',
        status: req.supervisorStatus || 'approved',
        approvedAt: req.supervisorApprovedAt || '',
        notes: req.supervisorNotes || null,
      },
      tier2: {
        approverName: getName(adminApproverUser) || 'N/A',
        status: req.adminStatus || 'approved',
        approvedAt: req.adminProcessedAt || '',
        notes: req.adminNotes || null,
        signatureImageData,
      },
    };
  };

  const handleDownloadCertificate = async (req: DownPaymentRequest) => {
    const signatureImageData = await getSignatureImageData(req);
    await generateTransportAdvanceCertificatePdf(buildCertData(req, signatureImageData));
    toast({
      title: 'Certificate Downloaded / تم تحميل الشهادة',
      description: 'The approval certificate PDF has been saved. / تم حفظ شهادة الموافقة.',
    });
  };

  const handleDownloadBulkExcel = (reqs: DownPaymentRequest[], groupLabel?: string) => {
    try {
      const timestamp = new Date().toISOString().slice(0, 10);
      const safeName = (groupLabel || 'All').replace(/[^a-zA-Z0-9]/g, '_');
      exportToExcel(reqs, `PACT_Bulk_${safeName}_${timestamp}`, groupLabel || 'All');
      toast({
        title: 'Bulk Excel Downloaded / تم تحميل ملف Excel الجماعي',
        description: `${reqs.length} request(s) exported to Excel. / تم تصدير ${reqs.length} طلب(ات) في ملف Excel.`,
      });
    } catch {
      toast({
        title: 'Export Error / خطأ في التصدير',
        description: 'Failed to generate Excel file. / فشل في إنشاء ملف Excel.',
        variant: 'destructive',
      });
    }
  };

  const handleDownloadBulkPdf = async (reqs: DownPaymentRequest[], groupLabel?: string) => {
    try {
      const certDataList = await Promise.all(
        reqs.map(async (req) => {
          const sig = await getSignatureImageData(req);
          return buildCertData(req, sig);
        })
      );
      await generateBulkPaymentPdf(certDataList, groupLabel);
      toast({
        title: 'Bulk PDF Downloaded / تم تحميل ملف PDF الجماعي',
        description: `${reqs.length} request(s) exported to a single PDF. / تم تصدير ${reqs.length} طلب(ات) في ملف PDF واحد.`,
      });
    } catch (err) {
      toast({
        title: 'Export Error / خطأ في التصدير',
        description: 'Failed to generate bulk PDF. / فشل في إنشاء ملف PDF الجماعي.',
        variant: 'destructive',
      });
    }
  };

  const openEditDialog = (req: DownPaymentRequest) => {
    setEditDialog({
      open: true,
      request: req,
      requestedAmount: req.requestedAmount,
      approvedAmount: req.approvedAmount || req.requestedAmount,
      justification: req.justification || '',
      siteName: req.siteName || '',
      reason: '',
      processing: false,
    });
  };

  const handleEditSubmit = async () => {
    if (!editDialog.request || !currentUser) return;
    if (!editDialog.reason.trim()) {
      toast({ title: 'Reason Required / السبب مطلوب', description: 'Please provide a reason for the edit. / يرجى تقديم سبب للتعديل.', variant: 'destructive' });
      return;
    }
    setEditDialog(prev => ({ ...prev, processing: true }));
    try {
      const approverName = (currentUser as any).fullName || (currentUser as any).full_name || currentUser.email || 'Unknown';
      const success = await editRequest({
        requestId: editDialog.request.id,
        editedBy: currentUser.id,
        editedByName: approverName,
        editedByRole: currentUser.role || undefined,
        reason: editDialog.reason,
        changes: {
          requestedAmount: editDialog.requestedAmount,
          approvedAmount: editDialog.approvedAmount,
          justification: editDialog.justification,
          siteName: editDialog.siteName,
        },
      });
      if (success) {
        setEditDialog({ open: false, request: null, requestedAmount: 0, approvedAmount: 0, justification: '', siteName: '', reason: '', processing: false });
      }
    } finally {
      setEditDialog(prev => ({ ...prev, processing: false }));
    }
  };

  const cachedRecipientsRef = useRef<Array<{ id: string; email: string; name: string; role: string }> | null>(null);
  const [ccContacts, setCcContacts] = useState<Array<{ id: string; email: string; name: string; role: string }>>([]);
  // CC contacts excluding already-selected To recipients — memoized to avoid O(n²) filter on every render
  const ccAvailableContacts = useMemo(
    () => ccContacts.filter(c => !selectedRecipientSet.has(c.id)),
    [ccContacts, selectedRecipientSet]
  );

  useEffect(() => {
    loadFinanceRecipients().catch(() => {});
    supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .eq('status', 'approved')
      .not('email', 'is', null)
      .then(({ data }) => {
        if (data) {
          setCcContacts(data
            .filter((u: any) => u.email)
            .map((u: any) => ({ id: u.id, email: u.email, name: u.full_name || u.email, role: u.role || '' })));
        }
      });
  }, []);

  const loadFinanceRecipients = async (forceRefresh = false): Promise<Array<{ id: string; email: string; name: string; role: string }>> => {
    if (!forceRefresh && cachedRecipientsRef.current) {
      return cachedRecipientsRef.current;
    }
    const { data: financeUsers } = await supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .in('role', ['finance_admin', 'Finance Admin', 'superAdmin', 'SuperAdmin', 'super_admin', 'admin', 'Admin', 'Administrator'])
      .eq('status', 'approved');
    const recipients = (financeUsers || []).filter((u: any) => u.email).map((u: any) => ({ id: u.id, email: u.email, name: u.full_name || u.email, role: u.role }));
    cachedRecipientsRef.current = recipients;
    return recipients;
  };

  const openBulkPaymentRequestDialog = async (reqs: DownPaymentRequest[], groupBy: string, groupValue: string) => {
    const meta = { count: reqs.length, total: reqs.reduce((s, r) => s + (r.approvedAmount || r.requestedAmount), 0) };
    const cached = cachedRecipientsRef.current;
    if (cached && cached.length > 0) {
      setPaymentRequestDialog(prev => ({ ...prev, open: true, request: null, bulkRequests: reqs, bulkMeta: meta, isBulk: true, loading: false, selectedRecipientIds: cached.map(r => r.id), availableRecipients: cached, ccEmails: [], bulkGroupBy: groupBy, bulkGroupValue: groupValue }));
      loadFinanceRecipients(true).then(fresh => {
        setPaymentRequestDialog(prev => ({ ...prev, availableRecipients: fresh, selectedRecipientIds: fresh.map(r => r.id) }));
      }).catch(() => {});
    } else {
      const meta2 = meta;
      setPaymentRequestDialog(prev => ({ ...prev, open: true, request: null, bulkRequests: [], bulkMeta: meta2, isBulk: true, loading: true, selectedRecipientIds: [], availableRecipients: [], ccEmails: [], bulkGroupBy: groupBy, bulkGroupValue: groupValue }));
      try {
        const recipients = await loadFinanceRecipients();
        setPaymentRequestDialog(prev => ({ ...prev, availableRecipients: recipients, selectedRecipientIds: recipients.map(r => r.id), loading: false, bulkRequests: reqs }));
      } catch {
        setPaymentRequestDialog(prev => ({ ...prev, loading: false }));
        toast({ title: "Error / خطأ", description: "Failed to load recipients. / فشل في تحميل المستلمين.", variant: "destructive" });
      }
    }
  };

  const openBulkExcelRequestDialog = async (reqs: DownPaymentRequest[], groupBy: string, groupValue: string) => {
    const meta = { count: reqs.length, total: reqs.reduce((s, r) => s + (r.approvedAmount || r.requestedAmount), 0) };
    const cached = cachedRecipientsRef.current;
    if (cached && cached.length > 0) {
      setPaymentRequestDialog(prev => ({ ...prev, open: true, request: null, bulkRequests: reqs, bulkMeta: meta, isBulk: true, loading: false, selectedRecipientIds: cached.map(r => r.id), availableRecipients: cached, ccEmails: [], bulkGroupBy: groupBy, bulkGroupValue: groupValue, sendMode: 'excel' }));
      loadFinanceRecipients(true).then(fresh => {
        setPaymentRequestDialog(prev => ({ ...prev, availableRecipients: fresh, selectedRecipientIds: fresh.map(r => r.id) }));
      }).catch(() => {});
    } else {
      setPaymentRequestDialog(prev => ({ ...prev, open: true, request: null, bulkRequests: [], bulkMeta: meta, isBulk: true, loading: true, selectedRecipientIds: [], availableRecipients: [], ccEmails: [], bulkGroupBy: groupBy, bulkGroupValue: groupValue, sendMode: 'excel' }));
      try {
        const recipients = await loadFinanceRecipients();
        setPaymentRequestDialog(prev => ({ ...prev, availableRecipients: recipients, selectedRecipientIds: recipients.map(r => r.id), loading: false, bulkRequests: reqs }));
      } catch {
        setPaymentRequestDialog(prev => ({ ...prev, loading: false }));
        toast({ title: "Error / خطأ", description: "Failed to load recipients. / فشل في تحميل المستلمين.", variant: "destructive" });
      }
    }
  };

  const openPaymentRequestDialog = async (req: DownPaymentRequest) => {
    const cached = cachedRecipientsRef.current;
    if (cached && cached.length > 0) {
      setPaymentRequestDialog(prev => ({ ...prev, open: true, request: req, bulkRequests: [], isBulk: false, loading: false, selectedRecipientIds: cached.map(r => r.id), availableRecipients: cached, ccEmails: [], bulkGroupBy: '', bulkGroupValue: '' }));
      loadFinanceRecipients(true).then(fresh => {
        setPaymentRequestDialog(prev => ({ ...prev, availableRecipients: fresh, selectedRecipientIds: fresh.map(r => r.id) }));
      }).catch(() => {});
    } else {
      setPaymentRequestDialog(prev => ({ ...prev, open: true, request: req, bulkRequests: [], isBulk: false, loading: true, selectedRecipientIds: [], availableRecipients: [], ccEmails: [], bulkGroupBy: '', bulkGroupValue: '' }));
      try {
        const recipients = await loadFinanceRecipients();
        setPaymentRequestDialog(prev => ({
          ...prev,
          availableRecipients: recipients,
          selectedRecipientIds: recipients.map((r: any) => r.id),
          loading: false,
        }));
      } catch {
        setPaymentRequestDialog(prev => ({ ...prev, loading: false }));
        toast({ title: "Error / خطأ", description: "Failed to load recipients. / فشل في تحميل المستلمين.", variant: "destructive" });
      }
    }
  };

  const buildEmailPreviewHtml = (): string => {
    const { request: req, bulkRequests, isBulk, availableRecipients, selectedRecipientIds, bulkGroupBy, bulkGroupValue, sendMode, usdRate } = paymentRequestDialog;
    const approverName = (currentUser as any)?.fullName || (currentUser as any)?.full_name || currentUser?.email || 'Approver';
    const firstRecipient = availableRecipients.find(r => selectedRecipientIds.includes(r.id));
    const recipientName = firstRecipient?.name || 'Finance Team';
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const parsedRate = parseFloat(usdRate);
    const effectiveRate = !isNaN(parsedRate) && parsedRate > 0 ? parsedRate : undefined;

    if (isBulk && bulkRequests.length > 0) {
      const totalAmount = bulkRequests.reduce((s, r) => s + (r.approvedAmount || r.requestedAmount), 0);
      const groupLabel = bulkGroupBy ? `${bulkGroupBy}: ${bulkGroupValue}` : 'All Approved';
      const bulkMmps = [...new Set(bulkRequests.map(r => r.mmpName).filter(Boolean))];
      const mmpLabel = bulkMmps.length > 0 ? bulkMmps.join(', ') : groupLabel;
      const projectLabel = bulkRequests[0]?.wfpProjectName || bulkRequests[0]?.projectName || 'WFP TPM';
      const previewBreakdowns = [
        { label: 'By State',     rows: buildGroups.state.map(([name, e]) => ({ name, count: e.count, requested: e.requested, approved: e.approved })) },
        { label: 'By Hub',       rows: buildGroups.hub.map(([name, e]) => ({ name, count: e.count, requested: e.requested, approved: e.approved })) },
        { label: 'By Requester', rows: buildGroups.requester.map(([name, e]) => ({ name, count: e.count, requested: e.requested, approved: e.approved })) },
        { label: 'By Locality',  rows: buildGroups.locality.map(([name, e]) => ({ name, count: e.count, requested: e.requested, approved: e.approved })) },
      ].filter(b => b.rows.length > 0);
      return buildEnhancedPaymentEmailHTML({
        recipientName,
        approverName,
        requestId: `BULK-${bulkRequests.length}`,
        groupLabel,
        mmpLabel,
        totalAmount,
        count: bulkRequests.length,
        date: dateStr,
        project: projectLabel,
        actionUrl: '/down-payment-approval',
        fundingType: 'advance',
        category: sendMode === 'excel' ? 'Transportation Advance (Bulk — Excel)' : 'Transportation Advance (Bulk — PDF)',
        isBulk: true,
        currency: 'SDG',
        usdRate: effectiveRate,
        breakdowns: previewBreakdowns,
      });
    } else if (req) {
      const amount = req.approvedAmount || req.requestedAmount;
      const mmpLabel = req.mmpName || req.projectName || req.siteName || 'WFP TPM';
      const projectLabel = req.wfpProjectName || req.projectName || 'WFP TPM';
      return buildEnhancedPaymentEmailHTML({
        recipientName,
        approverName,
        requestId: req.id?.slice(0, 8)?.toUpperCase() || 'N/A',
        groupLabel: req.siteName || 'N/A',
        mmpLabel,
        totalAmount: amount,
        count: 1,
        date: dateStr,
        project: projectLabel,
        actionUrl: '/down-payment-approval',
        fundingType: 'advance',
        category: 'Transportation Advance',
        isBulk: false,
        currency: 'SDG',
        usdRate: effectiveRate,
      });
    }
    return '';
  };

  const handleSendPaymentRequest = async () => {
    const { request: req, bulkRequests, isBulk, selectedRecipientIds, availableRecipients, ccEmails, bulkGroupBy, bulkGroupValue, sendMode, usdRate } = paymentRequestDialog;
    if (!currentUser?.id || selectedRecipientIds.length === 0) return;
    if (!isBulk && !req) return;
    const parsedRate = parseFloat(usdRate);
    const effectiveRate = !isNaN(parsedRate) && parsedRate > 0 ? parsedRate : undefined;

    let _closeDialog = false; // only close the dialog on success; keep open on any failure so user can retry
    setPaymentRequestDialog(prev => ({ ...prev, sending: true }));
    try {
      const selectedRecipients = availableRecipients
        .filter(r => selectedRecipientIds.includes(r.id))
        .map(r => ({ email: r.email, name: r.name }));

      const approverName = (currentUser as any).fullName || (currentUser as any).full_name || currentUser.email || 'Approver';
      const approverEmail = currentUser.email || '';

      if (isBulk && bulkRequests.length > 0) {
        const totalAmount = bulkRequests.reduce((sum, r) => sum + (r.approvedAmount || r.requestedAmount), 0);
        const requestIds = bulkRequests.map(r => r.id.slice(0, 8).toUpperCase()).join(', ');
        const requesterNames = [...new Set(bulkRequests.map(r => {
          const u = users?.find(u => u.id === r.requestedBy);
          return (u as any)?.fullName || (u as any)?.full_name || u?.email || 'Unknown';
        }))].join(', ');
        const groupLabel = bulkGroupBy ? `${bulkGroupBy}: ${bulkGroupValue}` : '';

        // ── EXCEL MODE ────────────────────────────────────────────────────
        if (sendMode === 'excel') {
          // Use same row mapping and config as the Bank Statement "Excel" button
          const statementRows: StatementRow[] = bulkRequests.map(mapRequestToStatementRow);

          const config: StatementConfig = {
            title: 'Transportation Advance',
            titleAr: 'سلفة النقل',
            statementType: 'transport_advance',
            statusFilter: groupLabel || 'All Approved',
            statusFilterAr: groupLabel ? groupLabel : 'الكل',
            currency: 'SDG',
            generatedBy: approverName,
          };

          // Generate both Excel (6 sheets) and signed PDF certificates, attach both to the email.
          const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          const PDF_MIME  = 'application/pdf';
          let bothAttachments: Array<{ base64: string; filename: string; mimeType: string }> = [];
          try {
            const generated = await generateAllSheetsStatementExcelBase64(statementRows, config);
            if (generated) bothAttachments.push({ ...generated, mimeType: XLSX_MIME });
          } catch { /* continue without Excel */ }
          if (bulkRequests.length <= 100) {
            try {
              // Chunk signature fetching in groups of 10 to avoid browser OOM
              const CHUNK = 10;
              const certDataList: ReturnType<typeof buildCertData>[] = [];
              for (let i = 0; i < bulkRequests.length; i += CHUNK) {
                const slice = bulkRequests.slice(i, i + CHUNK);
                const chunk = await Promise.all(
                  slice.map(async (bReq) => {
                    const sig = await getSignatureImageData(bReq);
                    return buildCertData(bReq, sig);
                  })
                );
                certDataList.push(...chunk);
              }
              const pdfGen = await generateBulkPaymentPdfBase64(certDataList, groupLabel || 'All Approved');
              if (pdfGen) bothAttachments.push({ ...pdfGen, mimeType: PDF_MIME });
            } catch { /* continue without PDF */ }
          }
          const excelAttachments = bothAttachments; // kept for variable name compatibility below

          const bulkMmps1 = [...new Set(bulkRequests.map(r => r.mmpName).filter(Boolean))];
          const mmpLabel1 = bulkMmps1.length > 0 ? bulkMmps1.join(', ') : groupLabel || 'All Approved';
          const projectLabel1 = bulkRequests[0]?.wfpProjectName || bulkRequests[0]?.projectName || 'WFP TPM';
          const sendBreakdowns = [
            { label: 'By State',     rows: buildGroups.state.map(([name, e]) => ({ name, count: e.count, requested: e.requested, approved: e.approved })) },
            { label: 'By Hub',       rows: buildGroups.hub.map(([name, e]) => ({ name, count: e.count, requested: e.requested, approved: e.approved })) },
            { label: 'By Requester', rows: buildGroups.requester.map(([name, e]) => ({ name, count: e.count, requested: e.requested, approved: e.approved })) },
            { label: 'By Locality',  rows: buildGroups.locality.map(([name, e]) => ({ name, count: e.count, requested: e.requested, approved: e.approved })) },
          ].filter(b => b.rows.length > 0);
          const result = await EmailNotificationService.sendPaymentRequestToFinanceWithRecipients(
            selectedRecipients,
            approverName,
            approverEmail,
            requesterNames,
            groupLabel || 'All Approved',
            `BULK-${bulkRequests.length}`,
            'Transportation Advance (Bulk)',
            totalAmount,
            'advance',
            projectLabel1,
            'SDG',
            '',
            '/down-payment-approval',
            undefined,
            excelAttachments.length > 0 ? excelAttachments : undefined,
            ccEmails,
            mmpLabel1,
            effectiveRate,
            sendBreakdowns
          );

          const sentCount = result.success ? selectedRecipients.length - (result.error ? parseInt(result.error) || 0 : 0) : 0;
          const failedCount = result.error ? (parseInt(result.error) || (result.success ? 0 : selectedRecipients.length)) : 0;

          if (result.success && !result.error) {
            _closeDialog = true;
            toast({
              title: 'Sent with Both Attachments / تم الإرسال مع المرفقين',
              description: `${bulkRequests.length} requests sent to ${selectedRecipients.length} recipient(s) with Excel report (6 sheets) + signed PDF certificates attached. / تم إرسال ${bulkRequests.length} طلب مع ملف Excel (6 أوراق) وشهادات PDF الموقعة.`,
            });
          } else if (result.success && result.error) {
            _closeDialog = true;
            toast({
              title: 'Partially Sent / تم الإرسال جزئياً',
              description: `${sentCount} of ${selectedRecipients.length} recipient(s) received the email. ${failedCount} failed.`,
              variant: 'destructive',
            });
          } else {
            toast({
              title: 'Send Failed / فشل الإرسال',
              description: result.error || 'Could not deliver to the selected recipients.',
              variant: 'destructive',
            });
          }
          return;
        }

        // ── PDF + EXCEL MODE (always attach both) ──────────────────────────
        // PDF: batches ≤ 30 are attached directly; 31–100 are uploaded to storage
        //      and a 7-day download link is included; > 100 in-browser PDF
        //      generation is skipped entirely to avoid browser OOM — Finance
        //      can use the "Bulk PDF" button in the portal instead.
        // Excel: always generated and attached regardless of batch size.
        const PDF_ATTACH_LIMIT  = 30;   // attach directly up to here
        const PDF_GENERATE_LIMIT = 100; // skip in-browser PDF generation above here
        const pdfTooLarge  = bulkRequests.length > PDF_ATTACH_LIMIT;
        const pdfSkipGen   = bulkRequests.length > PDF_GENERATE_LIMIT;

        let summaryPdf: { base64: string; filename: string } | undefined;
        let pdfDownloadUrl: string | undefined;

        if (!pdfSkipGen) {
          try {
            // Chunk signature fetching to avoid firing hundreds of concurrent requests
            const CHUNK = 10;
            const certDataList: ReturnType<typeof buildCertData>[] = [];
            for (let i = 0; i < bulkRequests.length; i += CHUNK) {
              const slice = bulkRequests.slice(i, i + CHUNK);
              const chunk = await Promise.all(
                slice.map(async (bReq) => {
                  const sig = await getSignatureImageData(bReq);
                  return buildCertData(bReq, sig);
                })
              );
              certDataList.push(...chunk);
            }
            const generated = await generateBulkPaymentPdfBase64(certDataList, groupLabel || 'All Approved');

            if (!pdfTooLarge) {
              summaryPdf = generated;
            } else {
              // Upload to storage and get a signed download link (expires in 7 days)
              const batchFileName = generated.filename;
              const pdfBlob = new Blob(
                [Uint8Array.from(atob(generated.base64), c => c.charCodeAt(0))],
                { type: 'application/pdf' }
              );
              const uploadPath = `bulk-payment-pdfs/${batchFileName}`;
              const { error: uploadError } = await supabase.storage
                .from('mmp-files')
                .upload(uploadPath, pdfBlob, { contentType: 'application/pdf', upsert: true });

              if (!uploadError) {
                const { data: signedData } = await supabase.storage
                  .from('mmp-files')
                  .createSignedUrl(uploadPath, 60 * 60 * 24 * 7); // 7 days
                if (signedData?.signedUrl) {
                  pdfDownloadUrl = signedData.signedUrl;
                }
              }
            }
          } catch { /* continue without PDF */ }
        }

        // Always generate Excel and attach alongside the PDF
        const pdfModeExcelAttachments: Array<{ base64: string; filename: string; mimeType: string }> = [];
        try {
          const pdfStatementRows: StatementRow[] = bulkRequests.map(mapRequestToStatementRow);
          const pdfExcelConfig: StatementConfig = {
            title: 'Transportation Advance',
            titleAr: 'سلفة النقل',
            statementType: 'transport_advance',
            statusFilter: groupLabel || 'All Approved',
            statusFilterAr: groupLabel ? groupLabel : 'الكل',
            currency: 'SDG',
            generatedBy: approverName,
          };
          const pdfModeExcel = await generateAllSheetsStatementExcelBase64(pdfStatementRows, pdfExcelConfig);
          if (pdfModeExcel) {
            pdfModeExcelAttachments.push({ ...pdfModeExcel, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          }
        } catch { /* continue without Excel */ }

        const pdfNote = pdfSkipGen
          ? `\n\nNOTE: This batch (${bulkRequests.length} requests) is too large to generate the PDF in-browser. Please log in to PACT Command Center → Down Payment Approval → "Bulk PDF" button to download the full signed PDF.\nملاحظة: الدفعة كبيرة جداً لتوليد PDF في المتصفح. يرجى تسجيل الدخول إلى PACT وتنزيل PDF الكامل الموقع من زر "PDF الجماعي".`
          : pdfTooLarge
            ? pdfDownloadUrl
              ? `\n\nBULK PDF DOWNLOAD: This batch contains ${bulkRequests.length} requests. The full PDF (all ${bulkRequests.length} pages) is available for download here (link valid for 7 days):\n${pdfDownloadUrl}\n\nتنزيل PDF: الملف الكامل (${bulkRequests.length} صفحة) متاح للتنزيل عبر الرابط أعلاه (صالح لمدة 7 أيام).`
              : `\n\nNOTE: This batch contains ${bulkRequests.length} requests. Please log in to PACT Command Center → Processing tab → "Bulk PDF" to download the full PDF.\nملاحظة: يرجى تسجيل الدخول إلى PACT وتنزيل ملف PDF الكامل من تبويب المعالجة.`
            : '';

        const bulkMmps2 = [...new Set(bulkRequests.map(r => r.mmpName).filter(Boolean))];
        const mmpLabel2 = bulkMmps2.length > 0 ? bulkMmps2.join(', ') : groupLabel || 'All Approved';
        const projectLabel2 = bulkRequests[0]?.wfpProjectName || bulkRequests[0]?.projectName || 'WFP TPM';
        const pdfModeBreakdowns = [
          { label: 'By State',     rows: buildGroups.state.map(([name, e]) => ({ name, count: e.count, requested: e.requested, approved: e.approved })) },
          { label: 'By Hub',       rows: buildGroups.hub.map(([name, e]) => ({ name, count: e.count, requested: e.requested, approved: e.approved })) },
          { label: 'By Requester', rows: buildGroups.requester.map(([name, e]) => ({ name, count: e.count, requested: e.requested, approved: e.approved })) },
          { label: 'By Locality',  rows: buildGroups.locality.map(([name, e]) => ({ name, count: e.count, requested: e.requested, approved: e.approved })) },
        ].filter(b => b.rows.length > 0);
        const result = await EmailNotificationService.sendPaymentRequestToFinanceWithRecipients(
          selectedRecipients,
          approverName,
          approverEmail,
          requesterNames.length > 60 ? requesterNames.slice(0, 57) + '...' : requesterNames,
          groupLabel || 'All Approved',
          `BULK-${bulkRequests.length}`,
          'Transportation Advance (Bulk)',
          totalAmount,
          'advance',
          projectLabel2,
          'SDG',
          (() => {
            const preview = bulkRequests.slice(0, 20).map(r => `${r.siteName} (SDG ${(r.approvedAmount || r.requestedAmount).toLocaleString()})`).join('; ');
            const overflow = bulkRequests.length > 20 ? ` … and ${bulkRequests.length - 20} more (see attached Excel for full list)` : '';
            return `Bulk payment request for ${bulkRequests.length} approved advances${groupLabel ? ` grouped by ${groupLabel}` : ''}. Total: SDG ${totalAmount.toLocaleString()}. Individual requests: ${preview}${overflow}.\n\nRECONCILIATION NOTICE: All recipients must submit receipts and return any unused funds within 5 working days.\nملاحظة تسوية: يجب على جميع المستلمين تقديم الإيصالات وإرجاع أي أموال غير مستخدمة خلال 5 أيام عمل.${pdfNote}`;
          })(),
          '/down-payment-approval',
          summaryPdf,
          pdfModeExcelAttachments.length > 0 ? pdfModeExcelAttachments : undefined,
          ccEmails.length > 0 ? ccEmails : undefined,
          mmpLabel2,
          effectiveRate,
          pdfModeBreakdowns
        );

        const sentCount = result.success ? selectedRecipients.length - (result.error ? parseInt(result.error) || 0 : 0) : 0;
        const failedCount = result.error ? (parseInt(result.error) || (result.success ? 0 : selectedRecipients.length)) : 0;

        if (result.success && !result.error) {
          _closeDialog = true;
          toast({
            title: "Sent / تم الإرسال",
            description: pdfSkipGen
              ? `${bulkRequests.length} requests sent to ${selectedRecipients.length} recipient(s) with Excel (6 sheets) attached. PDF is too large for in-browser generation — use the "Bulk PDF" button in the portal. / تم الإرسال مع ملف Excel. استخدم زر PDF الجماعي لتنزيل الشهادات.`
              : pdfTooLarge
                ? pdfDownloadUrl
                  ? `${bulkRequests.length} requests sent with Excel + PDF download link (valid 7 days) in email body. / تم الإرسال مع Excel ورابط تنزيل PDF.`
                  : `${bulkRequests.length} requests sent with Excel attached. Use "Bulk PDF" to download the full PDF. / تم الإرسال مع Excel. استخدم زر PDF لتنزيل الملف الكامل.`
                : `${bulkRequests.length} requests sent to ${selectedRecipients.length} recipient(s) with Excel + signed PDF certificates attached. / تم إرسال ${bulkRequests.length} طلب مع Excel وشهادات PDF الموقعة.`,
          });
        } else if (result.success && result.error) {
          _closeDialog = true;
          toast({
            title: `Partially Sent / تم الإرسال جزئياً`,
            description: `${sentCount} of ${selectedRecipients.length} recipient(s) received the email. ${failedCount} failed — check that all recipient email addresses are valid. / تم الإرسال إلى ${sentCount} من ${selectedRecipients.length}. فشل ${failedCount} — تحقق من صحة عناوين البريد.`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Email Failed / فشل الإرسال",
            description: `Could not send to ${selectedRecipients.length} recipient(s). Please verify email addresses are valid and try again. / تعذر الإرسال. تحقق من عناوين البريد الإلكتروني وأعد المحاولة.`,
            variant: "destructive",
          });
        }
      } else if (req) {
        const requester = users?.find(u => u.id === req.requestedBy);
        const requesterName = (requester as any)?.fullName || (requester as any)?.full_name || requester?.email || 'Unknown';
        const requestId = req.id?.slice(0, 8)?.toUpperCase() || 'N/A';

        let pdfAttachment: { base64: string; filename: string } | undefined;
        try {
          const signatureImageData = await getSignatureImageData(req);
          pdfAttachment = await generateTransportAdvanceCertificateBase64(buildCertData(req, signatureImageData));
        } catch { /* continue without PDF */ }

        const result = await EmailNotificationService.sendPaymentRequestToFinanceWithRecipients(
          selectedRecipients, approverName, approverEmail, requesterName,
          req.mmpName || req.projectName || req.siteName || 'WFP TPM', requestId, 'Transportation Advance',
          req.approvedAmount || req.requestedAmount, 'advance',
          req.wfpProjectName || req.projectName || 'WFP TPM',
          'SDG', '', '/down-payment-approval', pdfAttachment,
          undefined, ccEmails.length > 0 ? ccEmails : undefined,
          req.mmpName || undefined
        );

        if (result.success && !result.error) {
          _closeDialog = true;
          toast({
            title: "Payment Request Sent / تم إرسال طلب الدفع",
            description: `Email sent to ${selectedRecipients.length} recipient(s). / تم إرسال البريد إلى ${selectedRecipients.length} مستلم(ين).`,
          });
        } else if (result.success && result.error) {
          _closeDialog = true;
          toast({
            title: "Partially Sent / تم الإرسال جزئياً",
            description: `Some recipients did not receive the email. ${result.error}. Check that all email addresses are valid. / بعض المستلمين لم يستلموا البريد. تحقق من عناوين البريد الإلكتروني.`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Email Failed / فشل الإرسال",
            description: `Could not deliver to the selected recipient. Please check the email address is valid and the inbox is reachable. / تعذر الإرسال. تحقق من عنوان البريد الإلكتروني وأعد المحاولة.`,
            variant: "destructive",
          });
        }
      }
    } catch (err) {
      console.error('[DownPayment] handleSendPaymentRequest failed:', err);
      toast({ title: "Error / خطأ", description: "Failed to send payment request. / فشل في إرسال طلب الدفع.", variant: "destructive" });
    } finally {
      if (_closeDialog) {
        // Success path — reset the dialog fully
        setPaymentRequestDialog({ open: false, request: null, bulkRequests: [], bulkMeta: { count: 0, total: 0 }, isBulk: false, availableRecipients: [], selectedRecipientIds: [], ccEmails: [], loading: false, sending: false, bulkGroupBy: '', bulkGroupValue: '', sendMode: 'pdf' as const, showPreview: false, usdRate: '' });
      } else {
        // Error path — keep the dialog open so the user can retry without re-selecting
        setPaymentRequestDialog(prev => ({ ...prev, sending: false }));
      }
    }
  };

  const handleMarkAsPaidProofFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    setMarkAsPaidDialog(prev => ({ ...prev, proofFile: file, proofPreviewUrl: previewUrl }));
  };

  const handleConfirmAdvanceMarkAsPaid = async () => {
    const { request: req, proofFile, notes } = markAsPaidDialog;
    if (!req || !currentUser?.id) return;
    if (!proofFile) {
      toast({ title: "Receipt Required / الإيصال مطلوب", description: "Please attach a payment receipt before confirming. / يرجى إرفاق إيصال الدفع قبل التأكيد.", variant: "destructive" });
      return;
    }
    setMarkAsPaidDialog(prev => ({ ...prev, uploading: true }));
    setMarkPaidProcessing(true);
    try {
      let proofUrl: string | null = null;
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      const extension = proofFile.name.split('.').pop()?.toLowerCase() || 'file';
      const filePath = `payment-proofs/advance_${timestamp}_${random}.${extension}`;
      const { error: uploadErr } = await supabase.storage
        .from('mmp-files')
        .upload(filePath, proofFile, { cacheControl: '3600', upsert: false });
      if (uploadErr) throw new Error(uploadErr.message);
      proofUrl = supabase.storage.from('mmp-files').getPublicUrl(filePath).data.publicUrl;

      const now = new Date().toISOString();
      const { error } = await supabase
        .from('down_payment_requests')
        .update({
          status: 'fully_paid',
          total_paid_amount: req.approvedAmount || req.requestedAmount,
          remaining_amount: 0,
          updated_at: now,
          payment_proof_url: proofUrl,
          ...(notes.trim() ? { payment_proof_notes: notes.trim() } : {}),
          payment_proof_uploaded_at: now,
        } as any)
        .eq('id', req.id);

      if (error) {
        toast({ title: "Failed / فشل", description: error.message, variant: "destructive" });
      } else {
        toast({
          title: "Marked as Paid / تم التحديد كمدفوع",
          description: "The advance has been marked as fully paid with receipt. / تم تحديد السلفة كمدفوعة بالكامل مع الإيصال.",
        });
        setMarkAsPaidDialog({ open: false, request: null, proofFile: null, proofPreviewUrl: null, notes: '', uploading: false });
        refreshRequests();
      }
    } catch (err: any) {
      toast({ title: "Error / خطأ", description: err.message || "Failed to mark as paid.", variant: "destructive" });
    } finally {
      setMarkAsPaidDialog(prev => ({ ...prev, uploading: false }));
      setMarkPaidProcessing(false);
    }
  };

  const handleMarkAsPaid = (req: DownPaymentRequest) => {
    setMarkAsPaidDialog({ open: true, request: req, proofFile: null, proofPreviewUrl: null, notes: '', uploading: false });
  };

  const handleOpenBatchPay = async (reqs: DownPaymentRequest[]) => {
    const eligible = reqs.filter(r => r.status === 'approved');
    if (eligible.length === 0) return;
    const { data: pfData } = await supabase
      .from('pre_fund_requests' as any)
      .select('id, name, currency, available_balance')
      .in('status', ['active', 'low_balance'])   // 'approved' excluded — only spendable funds
      .eq('currency', 'SDG')                      // enforce currency match with down-payment amounts
      .order('name');
    const preFunds = ((pfData ?? []) as any[]).map((f: any) => ({
      id: f.id, name: f.name, currency: f.currency, available_balance: f.available_balance ?? 0,
    }));
    setBatchPayDialog({ open: true, requests: eligible, proofFiles: [], proofPreviewUrls: [], notes: '', uploading: false, partialPercent: null, preFundId: null, preFunds });
  };

  const handleBatchPayProofFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    e.target.value = '';
    const newPreviews = files.map(f => f.type.startsWith('image/') ? URL.createObjectURL(f) : '');
    setBatchPayDialog(prev => ({
      ...prev,
      proofFiles: [...prev.proofFiles, ...files],
      proofPreviewUrls: [...prev.proofPreviewUrls, ...newPreviews],
    }));
  };

  const handleRemoveBatchProofFile = (index: number) => {
    setBatchPayDialog(prev => {
      const newFiles = [...prev.proofFiles];
      const newUrls = [...prev.proofPreviewUrls];
      if (newUrls[index]) URL.revokeObjectURL(newUrls[index]);
      newFiles.splice(index, 1);
      newUrls.splice(index, 1);
      return { ...prev, proofFiles: newFiles, proofPreviewUrls: newUrls };
    });
  };

  const handleConfirmBatchPay = async () => {
    const { requests: reqs, proofFiles, notes, partialPercent } = batchPayDialog;
    if (!currentUser?.id || reqs.length === 0) return;
    if (proofFiles.length === 0) {
      toast({ title: "Receipt Required / الإيصال مطلوب", description: "Attach at least one receipt before confirming.", variant: "destructive" });
      return;
    }
    setBatchPayDialog(prev => ({ ...prev, uploading: true }));
    try {
      const uploadedUrls: string[] = [];
      for (const proofFile of proofFiles) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const extension = proofFile.name.split('.').pop()?.toLowerCase() || 'file';
        const filePath = `payment-proofs/batch_${timestamp}_${random}.${extension}`;
        const { error: uploadErr } = await supabase.storage.from('mmp-files').upload(filePath, proofFile, { cacheControl: '3600', upsert: false });
        if (uploadErr) throw new Error(uploadErr.message);
        uploadedUrls.push(supabase.storage.from('mmp-files').getPublicUrl(filePath).data.publicUrl);
      }
      const proofUrl = uploadedUrls.length === 1 ? uploadedUrls[0] : JSON.stringify(uploadedUrls);
      const now = new Date().toISOString();
      const isPartial = partialPercent !== null && partialPercent > 0 && partialPercent < 100;

      // ── Try SECURITY DEFINER RPC first (bypasses RLS / trigger issues) ─────
      const { data: rpcData, error: rpcError } = await supabase.rpc('batch_mark_advances_paid', {
        p_request_ids: reqs.map(r => r.id),
        p_proof_url:   proofUrl,
        p_notes:       notes.trim() || null,
        p_partial_pct: isPartial ? partialPercent : null,
      });

      let successCount = 0;
      let failCount    = 0;

      const rpcMissing = rpcError && (
        rpcError.code === 'PGRST202' ||
        (rpcError.message ?? '').toLowerCase().includes('could not find the function') ||
        (rpcError.message ?? '').toLowerCase().includes('does not exist')
      );

      if (rpcError && !rpcMissing) {
        console.error('[BatchPay] RPC error:', rpcError);
        throw new Error(rpcError.message || 'Batch payment RPC failed');
      }

      if (rpcMissing) {
        // ── Fallback: direct row-by-row updates using exact DB column names ───────
        console.warn('[BatchPay] RPC not deployed yet — using direct updates as fallback');
        const fallbackNow = new Date().toISOString();
        for (const req of reqs) {
          const approvedAmt = req.approvedAmount || req.requestedAmount || 0;
          const paidAmt     = isPartial && partialPercent ? Math.round(approvedAmt * partialPercent / 100) : approvedAmt;
          const remaining   = isPartial && partialPercent ? approvedAmt - paidAmt : 0;
          const newStatus   = isPartial && partialPercent && partialPercent < 100 ? 'partially_paid' : 'fully_paid';
          const { error: rowErr } = await (supabase as any)
            .from('down_payment_requests')
            .update({
              status:                    newStatus,
              total_paid_amount:         paidAmt,
              remaining_amount:          remaining,
              payment_proof_url:         proofUrl,
              payment_proof_notes:       notes.trim() || null,
              payment_proof_uploaded_at: fallbackNow,
              updated_at:                fallbackNow,
            })
            .eq('id', req.id);
          if (rowErr) {
            failCount++;
            console.error('[BatchPay] Fallback row update failed:', req.id, rowErr.message, rowErr.code);
          } else {
            successCount++;
          }
        }
        if (failCount > 0 && successCount === 0) {
          throw new Error(`Payment blocked by database permissions. Please ask your admin to apply the batch_mark_advances_paid SQL in Supabase SQL Editor.`);
        }
      } else {
        // ── RPC path ─────────────────────────────────────────────────────────────
        successCount = (rpcData as any)?.success_count ?? 0;
        failCount    = (rpcData as any)?.fail_count    ?? 0;
        if (failCount > 0) {
          const errObj  = (rpcData as any)?.errors ?? {};
          const errMsgs = (Object.values(errObj) as string[]);
          console.warn('[BatchPay] Some advances failed:', errObj);

          if (successCount === 0) {
            // Directly verify the actual DB status — covers both:
            //  • v2 RPC: fails with "Cannot pay: current status is fully_paid"
            //  • v1 RPC: UPDATE succeeded but wallet INSERT failed → rows ARE paid in DB
            const { data: statusCheck } = await (supabase as any)
              .from('down_payment_requests')
              .select('id,status')
              .in('id', reqs.map(r => r.id));

            const allActuallyPaid = Array.isArray(statusCheck) &&
              statusCheck.length > 0 &&
              statusCheck.every((row: any) => ['fully_paid', 'partially_paid'].includes(row.status));

            if (allActuallyPaid) {
              // Rows are paid in DB — a previous attempt succeeded on the UPDATE
              toast({
                title: 'Already Paid / تم الدفع مسبقاً',
                description: `These ${failCount} advance(s) are already marked as paid in the database. The list will now refresh.`,
              });
              setBatchPayDialog({ open: false, requests: [], proofFiles: [], proofPreviewUrls: [], notes: '', uploading: false, partialPercent: null, preFundId: null, preFunds: [] });
              clearSelection();
              return; // finally block still runs → refreshRequests()
            }
            throw new Error(
              `All ${failCount} row(s) failed. Reason: ${errMsgs.join(' | ') || 'unknown — check Supabase logs'}`
            );
          }
        }
      }

      // ── Notifications ─────────────────────────────────────────────────────────
      const byUser = reqs.reduce<Record<string, Array<{ siteName: string; amount: number }>>>((acc, req) => {
        const uid = req.requestedBy;
        if (!acc[uid]) acc[uid] = [];
        acc[uid].push({ siteName: req.siteName, amount: req.approvedAmount || req.requestedAmount });
        return acc;
      }, {});
      Object.entries(byUser).forEach(([userId, items]) => {
        const isSingle = items.length === 1;
        const total = items.reduce((s, i) => s + i.amount, 0);
        const breakdown = items.map(i => `• ${i.siteName} — ${i.amount.toLocaleString()} SDG`).join('\n');
        const notifTitle = isSingle
          ? 'Transport Advance Paid / تم صرف السلفة'
          : `${items.length} Transport Advances Paid / تم صرف ${items.length} سلف`;
        const notifMsg = isSingle
          ? `Your transport advance for "${items[0].siteName}" (${items[0].amount.toLocaleString()} SDG) has been paid. Please confirm receipt in your wallet.`
          : `${items.length} of your transport advances have been paid.\n\nTotal: ${total.toLocaleString()} SDG\n\n${breakdown}\n\nPlease confirm receipt in your wallet.`;
        NotificationTriggerService.send({
          userId,
          title: notifTitle,
          message: notifMsg,
          type: 'success',
          category: 'financial',
          priority: 'high',
          link: '/wallet',
          sendEmail: true,
          emailActionLabel: 'Confirm in Wallet',
        }).catch(console.error);
        // WhatsApp — batch payment confirmation sent via WA for each requester
        dispatchNotification({
          event: 'payment_processed',
          recipientIds: [userId],
          titleEn: notifTitle,
          titleAr: isSingle ? 'تم صرف السلفة ✅' : `تم صرف ${items.length} سلف ✅`,
          messageEn: notifMsg,
          messageAr: notifMsg,
          priority: 'high',
          entityType: 'downPayment',
          actionUrl: '/wallet',
          sendEmail: false,
          sendWhatsApp: true,
        }).catch(console.error);
      });

      // ── Link to Pre-Fund if one was selected ───────────────────────────────
      // Uses link_payment_atomically_rpc (atomic: insert txn + debit fund balance +
      // allocation deduction in one DB transaction). Only charges rows that the
      // DB confirms are actually in a paid status — never assumes reqs === paid.
      const { preFundId, preFunds } = batchPayDialog;
      if (preFundId && successCount > 0) {
        try {
          // Authoritative paid-status check — covers partial RPC failures
          const { data: confirmedPaid, error: checkErr } = await (supabase as any)
            .from('down_payment_requests')
            .select('id, approved_amount, requested_amount, requested_by')
            .in('id', reqs.map(r => r.id))
            .in('status', ['fully_paid', 'partially_paid']);

          if (checkErr) throw new Error(`Could not verify paid status: ${checkErr.message}`);

          const paidIdSet = new Set((confirmedPaid ?? []).map((r: any) => r.id));
          // Map original req objects to confirmed-paid ones (preserving name etc.)
          const confirmedReqs = reqs.filter(r => paidIdSet.has(r.id));

          if (confirmedReqs.length === 0) {
            console.warn('[BatchPay] Pre-fund skip — no DB-confirmed paid rows found');
          } else {
            const selectedFund = preFunds.find(f => f.id === preFundId);
            const today = new Date().toISOString().split('T')[0];
            let pfLinked = 0;
            let pfTotal = 0;
            let rpcNotDeployed = false;

            for (const req of confirmedReqs) {
              const approvedAmt = req.approvedAmount || req.requestedAmount || 0;
              const paidAmt = isPartial && partialPercent
                ? Math.round(approvedAmt * partialPercent / 100)
                : approvedAmt;

              // Atomic: single RPC handles pre_fund_transactions insert +
              //         available_balance debit + allocation deduction in one tx.
              const { data: rpcResult, error: rpcErr } = await (supabase as any).rpc(
                'link_payment_atomically_rpc', {
                  p_fund_id:      preFundId,
                  p_amount:       paidAmt,
                  p_currency:     selectedFund?.currency ?? 'SDG',
                  p_source_table: 'down_payment_requests',
                  p_source_id:    req.id,
                  p_reference:    null,
                  p_description:  `Down-payment: ${req.siteName ?? req.id}`,
                  p_payment_date: today,
                  p_created_by:   currentUser?.id ?? null,
                  p_user_id:      req.requestedBy ?? null,
                  p_receipt_url:  proofUrl ?? null,
                }
              );

              if (rpcErr) {
                const notDeployed =
                  (rpcErr as any).code === 'PGRST202' ||
                  String(rpcErr.message).toLowerCase().includes('could not find the function') ||
                  String(rpcErr.message).toLowerCase().includes('does not exist');
                if (notDeployed) { rpcNotDeployed = true; break; }
                console.warn(`[BatchPay] Pre-fund atomic link failed for ${req.id}:`, rpcErr.message);
                continue;
              }
              if (rpcResult?.success === false) {
                console.warn(`[BatchPay] Pre-fund link rejected for ${req.id}:`, rpcResult.error);
                continue;
              }

              pfLinked++;
              pfTotal += paidAmt;

              // Best-effort back-link (non-critical — transaction + balance already committed)
              if (rpcResult?.transaction_id) {
                (supabase as any)
                  .from('down_payment_requests')
                  .update({ pre_fund_transaction_id: rpcResult.transaction_id })
                  .eq('id', req.id)
                  .then(({ error: blErr }: { error: any }) => {
                    if (blErr) console.warn('[BatchPay] Back-link update failed for', req.id, blErr.message);
                  });
              }
            }

            if (pfLinked > 0) {
              toast({
                title: 'Pre-Fund Updated / تم تحديث التمويل المسبق',
                description: `${pfLinked} payment${pfLinked !== 1 ? 's' : ''} (${pfTotal.toLocaleString()} ${selectedFund?.currency ?? 'SDG'}) deducted from "${selectedFund?.name ?? preFundId}".`,
              });
            } else if (rpcNotDeployed) {
              toast({
                title: '⚠️ SQL Migration Required',
                description: 'Run pre_funding_atomic_rpcs.sql in the Supabase SQL Editor to enable fund linking. Payments are saved — use Pre-Funding → Reconciliation → Link Now once deployed.',
                variant: 'destructive',
              });
            } else {
              toast({
                title: 'Pre-Fund Link Warning',
                description: 'Payments were recorded but could not be linked to the pre-fund automatically. Go to Pre-Funding → Reconciliation to link manually.',
                variant: 'destructive',
              });
            }
          }
        } catch (pfErr: any) {
          console.error('[BatchPay] Pre-fund link error:', pfErr);
          toast({
            title: 'Pre-Fund Link Warning',
            description: `Payments marked as paid, but pre-fund balance update failed: ${pfErr.message}. Go to Pre-Funding → Reconciliation to link manually.`,
            variant: 'destructive',
          });
        }
      }

      const isPartialFinal = partialPercent !== null && partialPercent > 0 && partialPercent < 100;
      toast({
        title: `Batch Payment Complete / اكتمل الدفع الجماعي`,
        description: `${successCount} ${isPartialFinal ? `partially paid (${partialPercent}%)` : 'fully paid'} with one shared receipt${failCount > 0 ? ` · ${failCount} failed` : ''}.`,
      });
      setBatchPayDialog({ open: false, requests: [], proofFiles: [], proofPreviewUrls: [], notes: '', uploading: false, partialPercent: null, preFundId: null, preFunds: [] });
      clearSelection();
    } catch (err: any) {
      toast({ title: "Error / خطأ", description: err.message || "Batch payment failed.", variant: "destructive" });
    } finally {
      // Always reset loading state AND refresh the list so UI stays in sync
      setBatchPayDialog(prev => ({ ...prev, uploading: false }));
      refreshRequests();
    }
  };

  const handleBulkConfirmComplete = async (signature: { signatureId: string; signatureHash: string; method: string; signedAt: string }) => {
    if (!currentUser?.id || bulkConfirmRequests.length === 0) return;
    let successCount = 0;
    let failCount = 0;
    for (const req of bulkConfirmRequests) {
      const ok = await confirmReceipt({
        requestId: req.id,
        userId: currentUser.id,
        userName: currentUser.fullName || currentUser.email || '',
        signatureId: signature.signatureId,
        signatureHash: signature.signatureHash,
        signatureMethod: signature.method,
        signedAt: signature.signedAt,
      });
      if (ok) successCount++; else failCount++;
    }
    toast({
      title: `Receipt${successCount > 1 ? 's' : ''} Confirmed / تم التأكيد`,
      description: `${successCount} confirmed with one signature${failCount > 0 ? ` · ${failCount} failed` : ''}.`,
    });
    setBulkConfirmRequests([]);
    clearSelection();
    refreshRequests();
  };

  const TabFilterBar = ({ testIdPrefix }: { testIdPrefix: string }) => (
    <div className="flex items-center gap-3 mb-3 flex-wrap">
      {allUniqueRequesters.length > 1 && (
        <>
          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Data Collector:</span>
          <Select value={filters.dataCollectorId || 'all'} onValueChange={v => setFilters(f => ({ ...f, dataCollectorId: v === 'all' ? undefined : v }))}>
            <SelectTrigger className="h-8 w-[200px] text-xs" data-testid={`select-${testIdPrefix}-dc`}><SelectValue placeholder="All Collectors" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Collectors</SelectItem>
              {allUniqueRequesters.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {filters.dataCollectorId && (
            <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setFilters(f => ({ ...f, dataCollectorId: undefined }))}><X className="h-3 w-3 mr-1" />Clear</Button>
          )}
          <span className="text-muted-foreground/40 text-xs">|</span>
        </>
      )}
      <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Status:</span>
      <Select value={(filters.status && filters.status.length === 1) ? filters.status[0] : 'all'} onValueChange={v => setFilters(f => ({ ...f, status: v === 'all' ? undefined : [v as DownPaymentStatus] }))}>
        <SelectTrigger className="h-8 w-[180px] text-xs" data-testid={`select-${testIdPrefix}-status`}><SelectValue placeholder="All Statuses" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {filters.status && filters.status.length > 0 && (
        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setFilters(f => ({ ...f, status: undefined }))}><X className="h-3 w-3 mr-1" />Clear</Button>
      )}
    </div>
  );

  // ── Populate _cardCtxRef each render so RequestCard reads fresh values ────────
  _cardCtxRef.current = {
    duplicateSiteNames, requests, resolveUserName, selectedIds, toggleSelection,
    openActionDialog, openPaymentRequestDialog, handleDownloadCertificate, openEditDialog,
    handleMarkAsPaid, setDeleteConfirm, setSignatureRequest, resendPaymentNotification,
    isSuperAdmin, markPaidProcessing, userRole, currentUser,
  };

  // useMemo([], []) → RequestCard has a STABLE function reference on every render.
  // React sees the same component type → reconciliation (cheap) instead of
  // unmount + remount (expensive) for all 500+ list cards when dialog state changes.
  const RequestCard = useMemo(() => function RequestCardInner({ request, showCheckbox = false, showConfirmationDetails = false }: { request: DownPaymentRequest; showCheckbox?: boolean; showConfirmationDetails?: boolean }) {
    // Always read the latest values from the ref — never stale.
    const {
      duplicateSiteNames, requests, resolveUserName, selectedIds, toggleSelection,
      openActionDialog, openPaymentRequestDialog, handleDownloadCertificate, openEditDialog,
      handleMarkAsPaid, setDeleteConfirm, setSignatureRequest, resendPaymentNotification,
      isSuperAdmin, markPaidProcessing, userRole, currentUser,
    } = _cardCtxRef.current;
    const [showAuditDetails, setShowAuditDetails] = useState(false);
    const [resending, setResending] = useState(false);
    const shortId = request.id.substring(0, 8).toUpperCase();
    const receiptConfirmation = (request.metadata as any)?.receipt_confirmation;
    const isNotReceived = receiptConfirmation?.denied === true && !receiptConfirmation?.confirmed;
    const isConfirmed = receiptConfirmation?.confirmed === true;

    const isDuplicate = duplicateSiteNames.has(request.siteName);
    const requesterName = resolveUserName(request.requestedBy, request.requestedByName);

    // All OTHER active requests for the same site (siblings)
    const sitemates = isDuplicate
      ? requests.filter(r => r.id !== request.id && r.siteName === request.siteName && !['cancelled', 'rejected', 'deleted'].includes(r.status))
      : [];

    const [showDuplicatePanel, setShowDuplicatePanel] = useState(false);

    return (
    <Card
      key={request.id}
      className={`hover-elevate${isDuplicate ? ' border-amber-400 dark:border-amber-500' : ''}`}
      style={isDuplicate ? { background: 'rgba(251,191,36,0.06)' } : undefined}
      data-testid={`card-request-${request.id}`}
    >
      <CardContent className="p-4">
        <div className="space-y-3">
          {isDuplicate && (
            <div className="space-y-2">
              {/* ── Duplicate warning banner ── */}
              <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400" data-testid={`banner-duplicate-${request.id}`}>
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                <span>Duplicate — {sitemates.length} other active advance{sitemates.length !== 1 ? 's' : ''} for this site</span>
                <span className="opacity-60">/ طلب مكرر</span>
                <button
                  type="button"
                  onClick={() => setShowDuplicatePanel(v => !v)}
                  className="ml-auto flex items-center gap-1 rounded px-2 py-0.5 bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-800/50 transition-colors text-amber-700 dark:text-amber-300 font-semibold text-xs"
                  data-testid={`button-view-duplicates-${request.id}`}
                >
                  {showDuplicatePanel ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {showDuplicatePanel ? 'Hide' : 'View all'}
                </button>
              </div>

              {/* ── Expandable sibling-requests panel ── */}
              {showDuplicatePanel && (
                <div className="rounded-lg border border-amber-300 dark:border-amber-700 overflow-hidden">
                  <div className="bg-amber-100/60 dark:bg-amber-950/40 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    All active advances for "{request.siteName}"
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-amber-50/50 dark:bg-amber-950/20 text-xs">
                        <TableHead className="py-2 text-xs">Requester</TableHead>
                        <TableHead className="py-2 text-xs">Date</TableHead>
                        <TableHead className="py-2 text-xs">Role</TableHead>
                        <TableHead className="py-2 text-xs">MMP</TableHead>
                        <TableHead className="py-2 text-xs">Activity</TableHead>
                        <TableHead className="py-2 text-xs text-right">Amount (SDG)</TableHead>
                        <TableHead className="py-2 text-xs">Status</TableHead>
                        <TableHead className="py-2 text-xs">Justification</TableHead>
                        <TableHead className="py-2 text-xs">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Current request — highlighted */}
                      <TableRow className="bg-amber-100/40 dark:bg-amber-900/20 text-xs font-medium">
                        <TableCell className="py-2">
                          <span className="flex items-center gap-1">
                            {requesterName}
                            <Badge variant="outline" className="text-[9px] py-0 px-1 border-amber-400 text-amber-700 ml-1">this</Badge>
                          </span>
                        </TableCell>
                        <TableCell className="py-2">{format(new Date(request.requestedAt), 'MMM d, yyyy')}</TableCell>
                        <TableCell className="py-2 capitalize">{request.requesterRole}</TableCell>
                        <TableCell className="py-2 max-w-[130px] truncate">{request.mmpName || '—'}</TableCell>
                        <TableCell className="py-2 max-w-[120px] truncate text-muted-foreground">{request.activityType || '—'}</TableCell>
                        <TableCell className="py-2 text-right font-mono">{(request.approvedAmount || request.requestedAmount).toLocaleString()}</TableCell>
                        <TableCell className="py-2">{getStatusBadge(request.status)}</TableCell>
                        <TableCell className="py-2 max-w-[160px] truncate text-muted-foreground">{request.justification || '—'}</TableCell>
                        <TableCell className="py-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteConfirm(request)}
                            data-testid={`button-delete-duplicate-current-${request.id}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {/* Sibling requests */}
                      {sitemates.map(s => (
                        <TableRow key={s.id} className="text-xs hover:bg-amber-50/30 dark:hover:bg-amber-950/10">
                          <TableCell className="py-2">{resolveUserName(s.requestedBy, s.requestedByName)}</TableCell>
                          <TableCell className="py-2">{format(new Date(s.requestedAt), 'MMM d, yyyy')}</TableCell>
                          <TableCell className="py-2 capitalize">{s.requesterRole}</TableCell>
                          <TableCell className="py-2 max-w-[130px] truncate">{s.mmpName || '—'}</TableCell>
                          <TableCell className="py-2 max-w-[120px] truncate text-muted-foreground">{s.activityType || '—'}</TableCell>
                          <TableCell className="py-2 text-right font-mono">{(s.approvedAmount || s.requestedAmount).toLocaleString()}</TableCell>
                          <TableCell className="py-2">{getStatusBadge(s.status)}</TableCell>
                          <TableCell className="py-2 max-w-[160px] truncate text-muted-foreground">{s.justification || '—'}</TableCell>
                          <TableCell className="py-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteConfirm(s)}
                              data-testid={`button-delete-duplicate-${s.id}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="bg-amber-50/40 dark:bg-amber-950/20 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400 flex justify-between">
                    <span>Total exposure: <strong>SDG {[request, ...sitemates].reduce((s, r) => s + (r.approvedAmount || r.requestedAmount), 0).toLocaleString()}</strong></span>
                    <span className="opacity-70">Review all requests before approving</span>
                  </div>
                </div>
              )}
            </div>
          )}
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
              <div className="space-y-1">
                <h4 className="font-semibold flex items-center gap-2 flex-wrap">
                  <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  {request.siteName}
                  {request.projectName && (
                    <span className="text-xs text-muted-foreground font-normal">{request.projectName}</span>
                  )}
                </h4>
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1 font-mono" data-testid={`text-request-id-${request.id}`}>
                    <Hash className="h-3 w-3" />
                    ID: {shortId}
                  </span>
                  <span className="flex items-center gap-1 font-medium text-foreground/80" data-testid={`text-requester-${request.id}`}>
                    <User className="h-3 w-3 text-muted-foreground" />
                    {requesterName}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(request.requestedAt), 'MMM d, yyyy')}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  {request.hubName && (
                    <span className="flex items-center gap-1">
                      <Building className="h-3 w-3" />
                      {request.hubName}
                    </span>
                  )}
                  {request.stateName && (
                    <span className="flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      {request.stateName}{request.localityName ? ` / ${request.localityName}` : ''}
                    </span>
                  )}
                  {request.activityType && (
                    <span className="flex items-center gap-1">
                      <Activity className="h-3 w-3" />
                      {request.activityType}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <div className="flex flex-col items-end" data-testid={`text-amount-${request.id}`}>
                <span className="text-lg font-bold">
                  SDG {(request.approvedAmount || request.requestedAmount).toLocaleString()}
                </span>
                {request.approvedAmount && request.approvedAmount !== request.requestedAmount && (
                  <span className="text-xs text-muted-foreground line-through">
                    req. {request.requestedAmount.toLocaleString()}
                  </span>
                )}
              </div>
              {getStatusBadge(request.status)}
            </div>
          </div>

          {/* ── MMP Focus Block (D2 — Grounded) ── */}
          {request.mmpName && (
            <div
              style={{
                marginTop: 10,
                background: '#F0F4FA',
                borderLeft: '5px solid #1D3461',
                borderRadius: 8,
                boxShadow: '0 2px 8px rgba(29,52,97,0.10), inset 0 0 0 1px rgba(29,52,97,0.08)',
                padding: '9px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 11,
              }}
              data-testid={`mmp-block-${request.id}`}
            >
              {/* Icon */}
              <div style={{
                width: 34, height: 34, borderRadius: 8,
                background: '#1D3461',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                outline: '3px solid rgba(29,52,97,0.15)',
                outlineOffset: 2,
              }}>
                <FileText className="h-4 w-4 text-white" />
              </div>
              {/* Text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{
                    background: '#1D3461', color: '#fff',
                    fontSize: 8.5, fontWeight: 700,
                    letterSpacing: 0.9, textTransform: 'uppercase',
                    borderRadius: 999, padding: '2px 7px',
                  }}>MMP</span>
                  <span style={{
                    background: 'rgba(29,52,97,0.1)', color: '#1D3461',
                    fontSize: 9, fontWeight: 600,
                    borderRadius: 999, padding: '2px 8px',
                    letterSpacing: 0.3,
                  }}>
                    {format(new Date(request.requestedAt), 'MMM yyyy')}
                  </span>
                </div>
                <div style={{
                  fontSize: 17, fontWeight: 900, color: '#0F2041',
                  letterSpacing: 0.15,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {request.mmpName}
                </div>
              </div>
              {/* Arrow button */}
              <button
                style={{
                  flexShrink: 0,
                  background: '#1D3461',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 7,
                  width: 28, height: 28,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 1px 4px rgba(29,52,97,0.3)',
                }}
                title="View MMP"
                data-testid={`btn-view-mmp-${request.id}`}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="mt-2">
            <WorkflowTimeline request={request} />
          </div>

          {request.status === 'rejected' && (request.supervisorRejectionReason || request.adminRejectionReason) && (
            <div className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-400" data-testid={`text-rejection-reason-${request.id}`}>
              <XCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <span><span className="font-semibold">Rejection reason: </span>{request.adminRejectionReason || request.supervisorRejectionReason}</span>
            </div>
          )}

          {request.paymentType === 'installments' && Array.isArray(request.installmentPlan) && request.installmentPlan.length > 0 && (
            <div className="space-y-1" data-testid={`installment-progress-${request.id}`}>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium">Installments</span>
                <span>{request.installmentPlan.filter((i: any) => i.paid).length} / {request.installmentPlan.length} paid</span>
              </div>
              <div className="flex gap-1">
                {request.installmentPlan.map((inst: any, idx: number) => (
                  <div
                    key={idx}
                    className={`h-2 flex-1 rounded-full ${inst.paid ? 'bg-emerald-500' : 'bg-muted-foreground/20'}`}
                    title={inst.paid ? `Installment ${idx + 1}: Paid` : `Installment ${idx + 1}: Pending`}
                    data-testid={`installment-bar-${request.id}-${idx}`}
                  />
                ))}
              </div>
            </div>
          )}

          {isNotReceived && (
            <div className="flex items-center gap-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-700 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-400" data-testid={`alert-not-received-${request.id}`}>
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              <div className="flex-1">
                <span className="font-semibold">Not Yet Received / لم يُستلم بعد</span>
                {receiptConfirmation?.deniedAt && (
                  <span className="ml-2 font-normal opacity-80">— {format(new Date(receiptConfirmation.deniedAt), 'MMM d, yyyy h:mm a')}</span>
                )}
                {receiptConfirmation?.deniedByName && (
                  <span className="ml-1 font-normal opacity-80">by {receiptConfirmation.deniedByName}</span>
                )}
              </div>
            </div>
          )}

          {(request.supervisorApprovedBy || request.adminProcessedBy) && (
            <div className="space-y-1 text-xs border-l-2 border-muted-foreground/20 pl-3">
              {request.supervisorApprovedBy && (
                <div className="flex items-start gap-1.5" data-testid={`text-t1-details-${request.id}`}>
                  <span className="font-semibold text-muted-foreground min-w-[22px]">T1:</span>
                  <span>
                    {request.supervisorStatus === 'rejected' ? (
                      <span className="text-destructive">Rejected</span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400">Approved</span>
                    )}
                    {request.supervisorNotes && <> &mdash; {request.supervisorNotes}</>}
                    {request.supervisorRejectionReason && <> &mdash; <span className="text-destructive italic">{request.supervisorRejectionReason}</span></>}
                    <span className="text-muted-foreground"> &mdash; {request.supervisorApprovedByName || 'Unknown'}</span>
                    {request.supervisorApprovedAt && (
                      <span className="text-muted-foreground"> ({format(new Date(request.supervisorApprovedAt), 'MMM d, yyyy h:mm a')})</span>
                    )}
                  </span>
                </div>
              )}
              {request.adminProcessedBy && (
                <div className="flex items-start gap-1.5" data-testid={`text-t2-details-${request.id}`}>
                  <span className="font-semibold text-muted-foreground min-w-[22px]">T2:</span>
                  <span>
                    {request.adminStatus === 'rejected' ? (
                      <span className="text-destructive">Rejected</span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400">Approved</span>
                    )}
                    {request.adminNotes && <> &mdash; {request.adminNotes}</>}
                    {request.adminRejectionReason && <> &mdash; <span className="text-destructive italic">{request.adminRejectionReason}</span></>}
                    <span className="text-muted-foreground"> &mdash; {request.adminProcessedByName || 'Unknown'}</span>
                    {request.adminProcessedAt && (
                      <span className="text-muted-foreground"> ({format(new Date(request.adminProcessedAt), 'MMM d, yyyy h:mm a')})</span>
                    )}
                  </span>
                </div>
              )}

              {(request.metadata as any)?.super_admin_bypass && request.supervisorApprovedBy && request.adminProcessedBy && (
                <div className="flex items-center gap-1.5" data-testid={`text-bypass-badge-${request.id}`}>
                  <span className="font-semibold text-muted-foreground min-w-[22px]" />
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] font-semibold px-2 py-0.5 border border-blue-200 dark:border-blue-700">
                    <ShieldCheck className="h-3 w-3" />
                    Both tiers approved by admin override
                  </span>
                </div>
              )}

              {request.paymentProofUrl && (
                <div className="flex items-start gap-1.5 pt-0.5" data-testid={`text-payment-receipt-${request.id}`}>
                  <span className="font-semibold text-muted-foreground min-w-[22px] mt-0.5">
                    <FileText className="h-3.5 w-3.5 inline" />
                  </span>
                  <span className="flex flex-col gap-1">
                    <span className="text-muted-foreground">Payment Receipt / إيصال الدفع:</span>
                    {(() => {
                      let urls: string[] = [];
                      try { const parsed = JSON.parse(request.paymentProofUrl!); urls = Array.isArray(parsed) ? parsed : [request.paymentProofUrl!]; }
                      catch { urls = [request.paymentProofUrl!]; }
                      return urls.map((url, i) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-medium"
                          data-testid={`link-payment-receipt-${request.id}-${i}`}
                        >
                          <Eye className="h-3 w-3" />
                          {urls.length > 1 ? `Receipt ${i + 1}` : 'View Receipt / عرض الإيصال'}
                        </a>
                      ));
                    })()}
                    {request.paymentProofUploadedAt && (
                      <span className="text-muted-foreground">
                        — {format(new Date(request.paymentProofUploadedAt), 'MMM d, yyyy h:mm a')}
                      </span>
                    )}
                    {request.paymentProofNotes && (
                      <span className="text-muted-foreground italic">— {request.paymentProofNotes}</span>
                    )}
                  </span>
                </div>
              )}
            </div>
          )}

          {request.status === 'rejected' && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {request.adminRejectionReason || request.supervisorRejectionReason || 'No rejection reason provided.'}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <Label className="text-xs text-muted-foreground">Budget</Label>
              <p className="font-medium">{request.totalTransportationBudget.toLocaleString()} SDG</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Requested</Label>
              <p className="font-medium">{request.requestedAmount.toLocaleString()} SDG</p>
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

          {request.auditLog && request.auditLog.length > 0 && (
            <div className="border rounded-md overflow-hidden">
              <Button
                variant="ghost"
                size="sm"
                className="w-full flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground"
                onClick={() => setShowAuditDetails(!showAuditDetails)}
                data-testid={`button-toggle-audit-${request.id}`}
              >
                <span className="flex items-center gap-1">
                  <History className="h-3.5 w-3.5" />
                  Audit Trail ({request.auditLog.length} events) &mdash; Request ID: {shortId}
                </span>
                {showAuditDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </Button>
              {showAuditDetails && (
                <div className="border-t bg-muted/30 p-2 space-y-1.5 max-h-60 overflow-y-auto">
                  {request.auditLog.map((entry, idx) => (
                    <div key={entry.id || idx} className="flex items-start gap-2 text-xs p-1.5 rounded bg-background" data-testid={`audit-entry-${request.id}-${idx}`}>
                      <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${
                        entry.action.includes('rejected') ? 'bg-red-500' :
                        entry.action.includes('approved') ? 'bg-emerald-500' :
                        entry.action.includes('payment') ? 'bg-blue-500' :
                        entry.action.includes('receipt') ? 'bg-purple-500' :
                        entry.action.includes('edited') ? 'bg-amber-500' :
                        'bg-muted-foreground/50'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">
                            {entry.action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                          </span>
                          <span className="text-muted-foreground">by {entry.performedByName || 'System'}</span>
                          {entry.performedByRole && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0">{entry.performedByRole}</Badge>
                          )}
                        </div>
                        <div className="text-muted-foreground mt-0.5">
                          {format(new Date(entry.timestamp), 'MMM d, yyyy h:mm:ss a')}
                        </div>
                        {entry.notes && (
                          <div className="mt-0.5 italic text-muted-foreground">{entry.notes}</div>
                        )}
                        {entry.action === 'request_edited' && entry.previousValue && entry.newValue && (
                          <div className="mt-1 space-y-0.5 text-[10px] bg-muted/50 p-1.5 rounded">
                            {Object.keys(entry.newValue).map(key => (
                              <div key={key} className="flex items-center gap-1 flex-wrap">
                                <span className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                                <span className="text-red-500 line-through">{typeof entry.previousValue[key] === 'number' ? entry.previousValue[key]?.toLocaleString() : entry.previousValue[key]}</span>
                                <span className="text-muted-foreground">&rarr;</span>
                                <span className="text-emerald-600 dark:text-emerald-400">{typeof entry.newValue[key] === 'number' ? entry.newValue[key]?.toLocaleString() : entry.newValue[key]}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openActionDialog(request, 'revert')}
                  data-testid={`button-revert-${request.id}`}
                >
                  <Undo2 className="h-4 w-4 mr-1" />
                  Revert
                </Button>
              </>
            )}

            {userRole === 'admin' && request.status === 'pending_supervisor' && (
              <>
                <Button
                  size="sm"
                  onClick={() => openActionDialog(request, 'approve')}
                  data-testid={`button-admin-override-approve-${request.id}`}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Approve (Override)
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => openActionDialog(request, 'reject')}
                  data-testid={`button-admin-override-reject-${request.id}`}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Reject
                </Button>
              </>
            )}

            {userRole === 'admin' && (request.status === 'rejected' || request.status === 'cancelled') && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => openActionDialog(request, 'revert')}
                data-testid={`button-revert-${request.id}`}
              >
                <Undo2 className="h-4 w-4 mr-1" />
                Restore to Pending
              </Button>
            )}

            {userRole === 'admin' && request.status === 'fully_paid' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => openActionDialog(request, 'revert')}
                data-testid={`button-revert-${request.id}`}
              >
                <Undo2 className="h-4 w-4 mr-1" />
                Revert Status
              </Button>
            )}

            {userRole === 'admin' && (request.status === 'approved' || request.status === 'partially_paid') && (
              <>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => openActionDialog(request, 'pay')}
                  data-testid={`button-process-payment-${request.id}`}
                >
                  <DollarSign className="h-4 w-4 mr-1" />
                  Process Payment
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openActionDialog(request, 'revert')}
                  data-testid={`button-revert-${request.id}`}
                >
                  <Undo2 className="h-4 w-4 mr-1" />
                  Revert to Pending
                </Button>
              </>
            )}

            {currentUser && request.requestedBy === currentUser.id && 
              (request.status === 'partially_paid' || request.status === 'fully_paid') && 
              !(request.metadata as any)?.receipt_confirmation?.confirmed && (
              <Button
                size="sm"
                variant="default"
                onClick={() => setSignatureRequest(request)}
                data-testid={`button-confirm-receipt-${request.id}`}
              >
                <PenLine className="h-4 w-4 mr-1" />
                Confirm Receipt / تأكيد الاستلام
              </Button>
            )}

            {isConfirmed && (
              <Badge variant="default" className="gap-1" data-testid={`badge-receipt-confirmed-${request.id}`}>
                <CheckCircle2 className="h-3 w-3" />
                Receipt Confirmed / تم التأكيد
              </Badge>
            )}

            {(userRole === 'admin' || isSuperAdmin) && request.status === 'fully_paid' && isNotReceived && (
              <Button
                size="sm"
                variant="outline"
                className="border-amber-400 text-amber-700 hover:bg-amber-50 dark:border-amber-500 dark:text-amber-400"
                disabled={resending}
                onClick={async () => {
                  setResending(true);
                  await resendPaymentNotification(request.id);
                  setResending(false);
                }}
                data-testid={`button-resend-notification-${request.id}`}
              >
                <Send className="h-4 w-4 mr-1" />
                {resending ? 'Resending…' : 'Resend Notification / إعادة الإرسال'}
              </Button>
            )}

            {isApprovedOrPaid(request.status) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDownloadCertificate(request)}
                data-testid={`button-download-cert-${request.id}`}
              >
                <Download className="h-4 w-4 mr-1" />
                PDF
              </Button>
            )}

            {(userRole === 'admin' || isSuperAdmin) && request.status !== 'pending_supervisor' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => openEditDialog(request)}
                data-testid={`button-edit-${request.id}`}
              >
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
            )}

            {isSuperAdmin && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive border-destructive/30"
                onClick={() => setDeleteConfirm(request)}
                data-testid={`button-delete-${request.id}`}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            )}

            {userRole === 'admin' && isApprovedOrPaid(request.status) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => openPaymentRequestDialog(request)}
                data-testid={`button-request-payment-${request.id}`}
              >
                <Mail className="h-4 w-4 mr-1" />
                Request Payment
              </Button>
            )}

            {userRole === 'admin' && request.status === 'approved' && (
              <Button
                size="sm"
                variant="default"
                onClick={() => handleMarkAsPaid(request)}
                disabled={markPaidProcessing}
                data-testid={`button-mark-paid-${request.id}`}
              >
                <Wallet className="h-4 w-4 mr-1" />
                Mark Paid
              </Button>
            )}
          </div>
        </div>

        {showConfirmationDetails && isConfirmed && (
          <div className="mt-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 space-y-3" data-testid={`panel-confirmation-details-${request.id}`}>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              Receipt Acknowledged / تفاصيل التأكيد
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <span className="text-muted-foreground block">Confirmed By / أكّد الاستلام</span>
                    <span className="font-medium">{receiptConfirmation.confirmedByName || 'Unknown'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <span className="text-muted-foreground block">Confirmed At / وقت التأكيد</span>
                    <span className="font-medium">
                      {receiptConfirmation.confirmedAt
                        ? format(new Date(receiptConfirmation.confirmedAt), 'MMM d, yyyy h:mm:ss a')
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Fingerprint className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <span className="text-muted-foreground block">Signature Method / طريقة التوقيع</span>
                    <span className="font-medium capitalize">{receiptConfirmation.signatureMethod || '—'}</span>
                  </div>
                </div>
                {receiptConfirmation.signatureId && (
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <div>
                      <span className="text-muted-foreground block">Signature ID / رقم التوقيع</span>
                      <span className="font-mono text-[10px] break-all">{receiptConfirmation.signatureId}</span>
                    </div>
                  </div>
                )}
                {receiptConfirmation.signatureHash && (
                  <div className="flex items-start gap-2">
                    <Hash className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="text-muted-foreground block">Hash / بصمة التوقيع</span>
                      <span className="font-mono text-[10px] break-all">{receiptConfirmation.signatureHash}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {request.auditLog && request.auditLog.length > 0 && (
              <div className="border-t border-emerald-200 dark:border-emerald-800 pt-2 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground mb-1">
                  <History className="h-3.5 w-3.5" />
                  Audit Log ({request.auditLog.length} events)
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {request.auditLog.map((entry, idx) => (
                    <div key={entry.id || idx} className="flex items-start gap-2 text-[11px] p-1.5 rounded bg-background/70" data-testid={`confirmation-audit-${request.id}-${idx}`}>
                      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                        entry.action.includes('rejected') || entry.action.includes('not_received') ? 'bg-red-500' :
                        entry.action.includes('confirmed') || entry.action.includes('approved') ? 'bg-emerald-500' :
                        entry.action.includes('payment') || entry.action.includes('resent') ? 'bg-blue-500' :
                        'bg-muted-foreground/40'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap gap-1 items-center">
                          <span className="font-medium">{entry.action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
                          <span className="text-muted-foreground">by {entry.performedByName || 'System'}</span>
                        </div>
                        <div className="text-muted-foreground">{format(new Date(entry.timestamp), 'MMM d, yyyy h:mm:ss a')}</div>
                        {entry.notes && <div className="italic text-muted-foreground">{entry.notes}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // empty deps → same function reference forever → no unmount/remount

  const StatsCards = () => (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4" data-testid="stats-cards-container">
      <Card data-testid="card-stats-total">
        <CardContent className="p-3">
          <div className="text-xl font-bold tabular-nums tracking-tight whitespace-nowrap" data-testid="text-stats-total-count">{stats.counts.total.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Total Requests</div>
          {(stats.counts.rejected > 0 || stats.counts.cancelled > 0) && (
            <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1 flex-wrap">
              {stats.counts.rejected > 0 && (
                <span className="text-red-500 dark:text-red-400">{stats.counts.rejected} rejected</span>
              )}
              {stats.counts.rejected > 0 && stats.counts.cancelled > 0 && <span>·</span>}
              {stats.counts.cancelled > 0 && (
                <span className="text-gray-500">{stats.counts.cancelled} cancelled</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <Card data-testid="card-stats-total-requested">
        <CardContent className="p-3">
          <div className="text-xl font-bold text-blue-600 tabular-nums tracking-tight whitespace-nowrap" data-testid="text-stats-total-requested">{stats.amounts.totalRequested.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Total Requested (SDG)</div>
        </CardContent>
      </Card>
      <Card data-testid="card-stats-pending">
        <CardContent className="p-3">
          <div className="text-xl font-bold text-yellow-600 tabular-nums tracking-tight whitespace-nowrap" data-testid="text-stats-pending-count">{(stats.counts.pendingSupervisor + stats.counts.pendingAdmin).toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Pending</div>
          <div className="text-[11px] font-medium text-yellow-700 dark:text-yellow-400 mt-0.5 whitespace-nowrap tabular-nums" data-testid="text-stats-pending-amount">{stats.amounts.totalPendingAmount.toLocaleString()} SDG</div>
          {stats.counts.pendingSupervisor > 0 && stats.counts.pendingAdmin > 0 && (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {stats.counts.pendingSupervisor} sup · {stats.counts.pendingAdmin} admin
            </div>
          )}
        </CardContent>
      </Card>
      <Card data-testid="card-stats-approved">
        <CardContent className="p-3">
          <div className="text-xl font-bold text-emerald-600 tabular-nums tracking-tight whitespace-nowrap" data-testid="text-stats-approved-amount">{stats.amounts.totalApproved.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Total Approved (SDG)</div>
          {stats.counts.approved > 0 && (
            <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 mt-0.5 tabular-nums" data-testid="text-stats-approved-count">
              {stats.counts.approved.toLocaleString()} {stats.counts.approved === 1 ? 'request' : 'requests'}
            </div>
          )}
        </CardContent>
      </Card>
      <Card data-testid="card-stats-paid">
        <CardContent className="p-3">
          <div className="text-xl font-bold text-green-600 tabular-nums tracking-tight whitespace-nowrap" data-testid="text-stats-paid-amount">{stats.amounts.totalPaid.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Total Paid (SDG)</div>
          {(stats.counts.partiallyPaid + stats.counts.fullyPaid) > 0 && (
            <div className="text-[11px] font-medium text-green-700 dark:text-green-400 mt-0.5 tabular-nums" data-testid="text-stats-paid-count">
              {(stats.counts.partiallyPaid + stats.counts.fullyPaid).toLocaleString()} {(stats.counts.partiallyPaid + stats.counts.fullyPaid) === 1 ? 'request' : 'requests'}
            </div>
          )}
        </CardContent>
      </Card>
      <Card data-testid="card-stats-remaining">
        <CardContent className="p-3">
          <div className="text-xl font-bold text-orange-600 tabular-nums tracking-tight whitespace-nowrap" data-testid="text-stats-remaining-amount">{stats.amounts.totalRemaining.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Remaining (SDG)</div>
        </CardContent>
      </Card>
    </div>
  );

  const FilterPanel = () => (
    <Card className="mb-4" data-testid="card-filters">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </h3>
          <Button variant="ghost" size="sm" onClick={resetFilters} data-testid="button-clear-filters">
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
              onValueChange={v => setFilters(f => ({ ...f, hubId: v === 'all' ? undefined : v, stateName: undefined, localityName: undefined }))}
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
              onValueChange={v => setFilters(f => ({ ...f, stateName: v === 'all' ? undefined : v, localityName: undefined }))}
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
            <Label className="text-xs">Data Collector</Label>
            <Select
              value={filters.dataCollectorId || 'all'}
              onValueChange={v => setFilters(f => ({ ...f, dataCollectorId: v === 'all' ? undefined : v }))}
            >
              <SelectTrigger data-testid="select-filter-data-collector">
                <SelectValue placeholder="All Collectors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Collectors</SelectItem>
                {allUniqueRequesters.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">MMP</Label>
            <Select
              value={filters.mmpName || 'all'}
              onValueChange={v => setFilters(f => ({ ...f, mmpName: v === 'all' ? undefined : v }))}
            >
              <SelectTrigger data-testid="select-filter-mmp">
                <SelectValue placeholder="All MMPs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All MMPs</SelectItem>
                {uniqueMMPs.map(mmp => (
                  <SelectItem key={mmp} value={mmp || ''}>{mmp}</SelectItem>
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

  const renderCardWithCheckbox = useCallback((r: DownPaymentRequest) => <RequestCard request={r} showCheckbox />, [RequestCard]);
  const renderCardPlain = useCallback((r: DownPaymentRequest) => <RequestCard request={r} />, [RequestCard]);
  const renderCardWithConfirmation = useCallback((r: DownPaymentRequest) => <RequestCard request={r} showConfirmationDetails />, [RequestCard]);

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
          {!hideFiltersBar && (
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
          )}
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
          <span className="text-xs text-muted-foreground whitespace-nowrap">Bank Statement / كشف مالي:</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleStatementExport('pdf')}
            disabled={filteredRequests.length === 0}
            data-testid="button-statement-pdf"
          >
            <Banknote className="h-4 w-4 mr-1" />
            PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleStatementExport('excel')}
            disabled={filteredRequests.length === 0}
            data-testid="button-statement-excel"
          >
            <FileSpreadsheet className="h-4 w-4 mr-1" />
            Excel
          </Button>
        </div>
      </div>

      {!hideFiltersBar && showFilters && <FilterPanel />}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={`grid w-full ${userRole === 'admin' ? 'grid-cols-6' : 'grid-cols-5'} mb-4`}>
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending
            <Badge variant="secondary" className="ml-2">{pendingRequests.length}</Badge>
          </TabsTrigger>
          {userRole === 'admin' && (
            <TabsTrigger value="approved" data-testid="tab-approved">
              Approved
              {approvedRequests.length > 0
                ? <Badge className="ml-2 bg-emerald-600 text-white hover:bg-emerald-600">{approvedRequests.length}</Badge>
                : <Badge variant="secondary" className="ml-2">0</Badge>
              }
            </TabsTrigger>
          )}
          <TabsTrigger value="processing" data-testid="tab-processing">
            Processing
            <Badge variant="secondary" className="ml-2">{processingRequests.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed">
            Completed
            <Badge variant="secondary" className="ml-2">{completedRequests.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="closed" data-testid="tab-closed">
            Closed
            {closedRequests.length > 0 && <Badge variant="destructive" className="ml-2">{closedRequests.length}</Badge>}
            {closedRequests.length === 0 && <Badge variant="secondary" className="ml-2">0</Badge>}
          </TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all">
            All
            <Badge variant="secondary" className="ml-2">{filteredRequests.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <TabFilterBar testIdPrefix="pending" />
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
                  <Button size="sm" onClick={() => handleBulkApprove()} disabled={processing} data-testid="button-bulk-approve">
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Approve All
                  </Button>
                  {isSuperAdmin && (
                    <Button size="sm" variant="outline" className="text-destructive border-destructive/30" onClick={handleBulkDelete} disabled={processing} data-testid="button-bulk-delete-pending">
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete ({selectedIds.size})
                    </Button>
                  )}
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
            <div>
              {filters.dataCollectorId && (() => {
                const collectorReqs = pendingRequests.filter(r => r.requestedBy === filters.dataCollectorId);
                const collectorName = allUniqueRequesters.find(e => e.id === filters.dataCollectorId)?.name || 'this collector';
                const totalAmount = collectorReqs.reduce((s, r) => s + r.requestedAmount, 0);
                if (collectorReqs.length === 0) return null;
                return (
                  <Card className="mb-3 border-primary/30 bg-primary/5">
                    <CardContent className="p-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold flex items-center gap-2">
                            <Users className="h-4 w-4 text-primary" />
                            {collectorName}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {collectorReqs.length} pending request{collectorReqs.length > 1 ? 's' : ''} · SDG {totalAmount.toLocaleString()} total
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Supervisors, FOM &amp; Coordinators will be notified automatically.
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={handleQuickApproveByCollector}
                          disabled={processing}
                          className="shrink-0"
                          data-testid="button-quick-approve-by-collector"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Approve All ({collectorReqs.length})
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}
              <div className="flex items-center gap-2 mb-2">
                <Button variant="ghost" size="sm" onClick={() => selectAll(pendingRequests)} data-testid="button-select-all">
                  Select All
                </Button>
              </div>
              <VirtualizedRequestList requests={pendingRequests} renderCard={renderCardWithCheckbox} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="approved">
          <TabFilterBar testIdPrefix="approved" />
          {selectedIds.size > 0 && approvedRequests.length > 0 && (() => {
            const selectedApproved = approvedRequests.filter(r => selectedIds.has(r.id));
            const totalAmount = selectedApproved.reduce((s, r) => s + (r.approvedAmount || r.requestedAmount), 0);
            return (
              <Card className="mb-4 border-emerald-500">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <CheckSquare className="h-5 w-5 text-emerald-600" />
                      <span className="font-medium">{selectedIds.size} selected</span>
                      <span className="text-xs text-muted-foreground">SDG {totalAmount.toLocaleString()}</span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={clearSelection}>
                      <X className="h-4 w-4 mr-1" /> Clear
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" onClick={() => {
                      if (selectedApproved.length > 0) openBulkPaymentRequestDialog(selectedApproved, '', `${selectedApproved.length} Selected`);
                    }} disabled={processing} data-testid="button-approved-request-payment">
                      <Mail className="h-4 w-4 mr-1" /> Request Payment ({selectedApproved.length})
                    </Button>
                    <Button size="sm" variant="default" onClick={() => {
                      if (selectedApproved.length > 0) openActionDialog(selectedApproved[0], 'pay');
                    }} disabled={processing} data-testid="button-approved-process-payment">
                      <DollarSign className="h-4 w-4 mr-1" /> Process Payment
                    </Button>
                    {selectedApproved.length > 1 && (
                      <Button size="sm" variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleOpenBatchPay(selectedApproved)} disabled={processing} data-testid="button-approved-batch-pay">
                        <Wallet className="h-4 w-4 mr-1" /> Batch Pay ({selectedApproved.length})
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => {
                      if (selectedApproved.length > 0) handleDownloadBulkPdf(selectedApproved, `${selectedApproved.length} Selected`);
                    }} disabled={processing} data-testid="button-approved-bulk-pdf">
                      <FileText className="h-4 w-4 mr-1" /> PDF ({selectedIds.size})
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => {
                      if (selectedApproved.length > 0) openBulkExcelRequestDialog(selectedApproved, '', `${selectedApproved.length} Selected`);
                    }} disabled={processing} data-testid="button-approved-bulk-excel">
                      <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel ({selectedIds.size})
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleBulkRevert('pending_admin')} disabled={processing} data-testid="button-approved-revert-admin">
                      <Undo2 className="h-4 w-4 mr-1" /> Revert to Pending Admin
                    </Button>
                    {isSuperAdmin && (
                      <Button size="sm" variant="outline" className="text-destructive border-destructive/30" onClick={handleBulkDelete} disabled={processing} data-testid="button-approved-delete">
                        <Trash2 className="h-4 w-4 mr-1" /> Delete ({selectedIds.size})
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })()}
          {approvedRequests.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No requests in approved status — all clear!
              </CardContent>
            </Card>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Checkbox
                  checked={approvedRequests.length > 0 && approvedRequests.every(r => selectedIds.has(r.id))}
                  onCheckedChange={(checked) => {
                    if (checked) selectAll(approvedRequests);
                    else clearSelection();
                  }}
                  data-testid="checkbox-select-all-approved"
                />
                <Button variant="ghost" size="sm" onClick={() => selectAll(approvedRequests)} data-testid="button-select-all-approved">
                  Select All ({approvedRequests.length})
                </Button>
              </div>
              <VirtualizedRequestList requests={approvedRequests} renderCard={renderCardWithCheckbox} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="processing">
          {userRole === 'admin' && approvedForPayment.length > 0 && (
            <Card className="mb-4">
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Bulk Payment Request / طلب دفع جماعي
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <p className="text-xs text-muted-foreground mb-3">Filter requests by location and send bulk payment emails. / تصفية الطلبات حسب الموقع وإرسال رسائل الدفع الجماعي.</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
                  <Select
                    value={filters.stateName || 'all'}
                    onValueChange={(val) => {
                      setFilters(f => ({ ...f, stateName: val === 'all' ? undefined : val, localityName: undefined }));
                    }}
                  >
                    <SelectTrigger data-testid="select-bulk-state">
                      <SelectValue placeholder="All States" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All States</SelectItem>
                      {uniqueStates.map(s => {
                        const count = requests.filter(r => r.stateName === s).length;
                        return count > 0 ? <SelectItem key={s} value={s!}>{s} ({count})</SelectItem> : null;
                      })}
                    </SelectContent>
                  </Select>
                  <Select
                    value={filters.hubId || 'all'}
                    onValueChange={(val) => {
                      setFilters(f => ({ ...f, hubId: val === 'all' ? undefined : val, stateName: undefined, localityName: undefined }));
                    }}
                  >
                    <SelectTrigger data-testid="select-bulk-hub">
                      <SelectValue placeholder="All Hubs" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Hubs</SelectItem>
                      {uniqueHubs.map(h => {
                        const count = requests.filter(r => r.hubName === h).length;
                        return count > 0 ? <SelectItem key={h} value={h!}>{h} ({count})</SelectItem> : null;
                      })}
                    </SelectContent>
                  </Select>
                  <Select
                    value={filters.mmpName || 'all'}
                    onValueChange={(val) => {
                      setFilters(f => ({ ...f, mmpName: val === 'all' ? undefined : val }));
                    }}
                  >
                    <SelectTrigger data-testid="select-bulk-mmp">
                      <SelectValue placeholder="All MMPs" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All MMPs</SelectItem>
                      {uniqueMMPs.map(mmp => {
                        const count = requests.filter(r => r.mmpName === mmp).length;
                        return count > 0 ? <SelectItem key={mmp} value={mmp!}>{mmp} ({count})</SelectItem> : null;
                      })}
                    </SelectContent>
                  </Select>
                  <Select
                    value={filters.localityName || 'all'}
                    onValueChange={(val) => {
                      setFilters(f => ({ ...f, localityName: val === 'all' ? undefined : val }));
                    }}
                  >
                    <SelectTrigger data-testid="select-bulk-locality">
                      <SelectValue placeholder="All Localities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Localities</SelectItem>
                      {uniqueLocalities.map(l => {
                        const count = requests.filter(r => r.localityName === l).length;
                        return count > 0 ? <SelectItem key={l} value={l!}>{l} ({count})</SelectItem> : null;
                      })}
                    </SelectContent>
                  </Select>
                  <Select
                    value={filters.dataCollectorId || 'all'}
                    onValueChange={(val) => {
                      setFilters(f => ({ ...f, dataCollectorId: val === 'all' ? undefined : val }));
                    }}
                  >
                    <SelectTrigger data-testid="select-bulk-enumerator">
                      <SelectValue placeholder="All Enumerators" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Enumerators</SelectItem>
                      {uniqueEnumerators.map(e => {
                        const count = requests.filter(r => r.requestedBy === e.id).length;
                        return count > 0 ? <SelectItem key={e.id} value={e.id}>{e.name} ({count})</SelectItem> : null;
                      })}
                    </SelectContent>
                  </Select>
                  <Select
                    value={filters.siteName || 'all'}
                    onValueChange={(val) => {
                      setFilters(f => ({ ...f, siteName: val === 'all' ? undefined : val }));
                    }}
                  >
                    <SelectTrigger data-testid="select-bulk-site">
                      <SelectValue placeholder="All Sites" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sites</SelectItem>
                      {uniqueSites.map(s => {
                        const count = requests.filter(r => r.siteName === s).length;
                        return count > 0 ? <SelectItem key={s} value={s!}>{s} ({count})</SelectItem> : null;
                      })}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setFilters({})}
                    className="h-9"
                    data-testid="button-clear-bulk-filters"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                </div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openBulkPaymentRequestDialog(approvedForPayment, '', 'All Approved')}
                    data-testid="button-bulk-request-all"
                  >
                    <Mail className="h-3.5 w-3.5 mr-1" />
                    Request All ({approvedForPayment.length})
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownloadBulkPdf(approvedForPayment, 'All Approved')}
                    data-testid="button-bulk-pdf-all"
                  >
                    <FileText className="h-3.5 w-3.5 mr-1" />
                    Bulk PDF ({approvedForPayment.length})
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openBulkExcelRequestDialog(approvedForPayment, '', 'All Approved')}
                    data-testid="button-bulk-excel-all"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
                    Bulk Excel ({approvedForPayment.length})
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Total: SDG {approvedForPayment.reduce((s, r) => s + (r.approvedAmount || r.requestedAmount), 0).toLocaleString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
          {selectedIds.size > 0 && processingRequests.length > 0 && (() => {
            const selectedProcessing = processingRequests.filter(r => selectedIds.has(r.id));
            const approvedCount = selectedProcessing.filter(r => r.status === 'approved').length;
            const totalAmount = selectedProcessing.reduce((s, r) => s + (r.approvedAmount || r.requestedAmount), 0);
            return (
            <Card className="mb-4 border-primary">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="h-5 w-5 text-primary" />
                    <span className="font-medium">{selectedIds.size} selected</span>
                    <span className="text-xs text-muted-foreground">
                      SDG {totalAmount.toLocaleString()}
                    </span>
                  </div>
                  <Button size="sm" variant="ghost" onClick={clearSelection} data-testid="button-clear-processing-selection">
                    <X className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button size="sm" onClick={() => {
                    const selected = selectedProcessing.filter(r => r.status === 'approved');
                    if (selected.length > 0) openBulkPaymentRequestDialog(selected, '', `${selected.length} Selected`);
                  }} disabled={approvedCount === 0 || processing} data-testid="button-selected-request-payment">
                    <Mail className="h-4 w-4 mr-1" />
                    Request Payment ({approvedCount})
                  </Button>
                  <Button size="sm" variant="default" onClick={() => {
                    const selected = selectedProcessing.filter(r => r.status === 'approved');
                    if (selected.length > 0) {
                      openActionDialog(selected[0], 'pay');
                    }
                  }} disabled={approvedCount === 0 || processing} data-testid="button-selected-process-payment">
                    <DollarSign className="h-4 w-4 mr-1" />
                    Process Payment
                  </Button>

                  {approvedCount > 1 && (
                    <Button size="sm" variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => {
                      const selected = selectedProcessing.filter(r => r.status === 'approved');
                      handleOpenBatchPay(selected);
                    }} disabled={processing} data-testid="button-batch-pay">
                      <Wallet className="h-4 w-4 mr-1" />
                      Batch Pay ({approvedCount})
                    </Button>
                  )}

                  <Button size="sm" variant="outline" onClick={() => {
                    if (selectedProcessing.length > 0) handleDownloadBulkPdf(selectedProcessing, `${selectedProcessing.length} Selected`);
                  }} disabled={processing} data-testid="button-selected-bulk-pdf">
                    <FileText className="h-4 w-4 mr-1" />
                    PDF ({selectedIds.size})
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    if (selectedProcessing.length > 0) openBulkExcelRequestDialog(selectedProcessing, '', `${selectedProcessing.length} Selected`);
                  }} disabled={processing} data-testid="button-selected-bulk-excel">
                    <FileSpreadsheet className="h-4 w-4 mr-1" />
                    Excel ({selectedIds.size})
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleBulkRevert('pending_supervisor')} disabled={processing} data-testid="button-selected-revert-supervisor">
                    <Undo2 className="h-4 w-4 mr-1" />
                    Revert to Pending
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleBulkRevert('pending_admin')} disabled={processing} data-testid="button-selected-revert-admin">
                    <Undo2 className="h-4 w-4 mr-1" />
                    Revert to Admin
                  </Button>
                  {isSuperAdmin && (
                    <Button size="sm" variant="outline" className="text-destructive border-destructive/30" onClick={handleBulkDelete} disabled={processing} data-testid="button-selected-delete">
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete ({selectedIds.size})
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
            );
          })()}
          {processingRequests.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No requests in processing</CardContent></Card>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Checkbox
                  checked={processingRequests.length > 0 && processingRequests.every(r => selectedIds.has(r.id))}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      selectAll(processingRequests);
                    } else {
                      clearSelection();
                    }
                  }}
                  data-testid="checkbox-select-all-processing"
                />
                <Button variant="ghost" size="sm" onClick={() => selectAll(processingRequests)} data-testid="button-select-all-processing">
                  Select All ({processingRequests.length})
                </Button>
              </div>
              <VirtualizedRequestList requests={processingRequests} renderCard={renderCardWithCheckbox} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed">
          <div className="space-y-4">
            <TabFilterBar testIdPrefix="completed" />
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={completedSubTab === 'paid_waiting' ? 'default' : 'outline'}
                onClick={() => setCompletedSubTab('paid_waiting')}
                className="gap-2"
                data-testid="tab-paid-waiting"
              >
                <Clock className="h-4 w-4" />
                Paid — Waiting Confirmation
                <Badge variant="secondary" className="ml-1">{paidWaitingRequests.length}</Badge>
              </Button>
              <Button
                variant={completedSubTab === 'confirmed' ? 'default' : 'outline'}
                onClick={() => setCompletedSubTab('confirmed')}
                className="gap-2"
                data-testid="tab-confirmed"
              >
                <CheckCircle2 className="h-4 w-4" />
                Confirmed
                <Badge variant="secondary" className="ml-1">{paidConfirmedRequests.length}</Badge>
              </Button>
            </div>
            {completedSubTab === 'paid_waiting' ? (
              paidWaitingRequests.length === 0 ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground">No requests awaiting confirmation / لا توجد طلبات بانتظار التأكيد</CardContent></Card>
              ) : (
                <div>
                  {/* Bulk confirm action bar */}
                  <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={paidWaitingRequests.every(r => selectedIds.has(r.id))}
                        onCheckedChange={(checked) => {
                          if (checked) selectAll(paidWaitingRequests);
                          else clearSelection();
                        }}
                        data-testid="checkbox-select-all-waiting"
                      />
                      <span className="text-sm text-muted-foreground">
                        {paidWaitingRequests.filter(r => selectedIds.has(r.id)).length > 0
                          ? `${paidWaitingRequests.filter(r => selectedIds.has(r.id)).length} selected`
                          : `${paidWaitingRequests.length} awaiting confirmation`}
                      </span>
                    </div>
                    {paidWaitingRequests.filter(r => selectedIds.has(r.id)).length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => setBulkConfirmRequests(paidWaitingRequests.filter(r => selectedIds.has(r.id)))}
                          data-testid="button-bulk-confirm-selected"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1.5" />
                          Confirm {paidWaitingRequests.filter(r => selectedIds.has(r.id)).length} with One Signature
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleBulkRevert('approved', paidWaitingRequests.filter(r => selectedIds.has(r.id)).map(r => r.id))}
                          disabled={processing}
                          data-testid="button-bulk-revert-approved"
                        >
                          <Undo2 className="h-4 w-4 mr-1" />
                          Revert to Approved
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleBulkRevert('pending_supervisor', paidWaitingRequests.filter(r => selectedIds.has(r.id)).map(r => r.id))}
                          disabled={processing}
                          data-testid="button-bulk-revert-supervisor"
                        >
                          <Undo2 className="h-4 w-4 mr-1" />
                          Revert to Pending
                        </Button>
                      </div>
                    )}
                  </div>
                  <VirtualizedRequestList requests={paidWaitingRequests} renderCard={renderCardWithCheckbox} />
                </div>
              )
            ) : (
              paidConfirmedRequests.length === 0 ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground">No confirmed requests / لا توجد طلبات مؤكدة</CardContent></Card>
              ) : (
                <VirtualizedRequestList requests={paidConfirmedRequests} renderCard={renderCardWithConfirmation} />
              )
            )}
          </div>
        </TabsContent>

        <TabsContent value="closed">
          <TabFilterBar testIdPrefix="closed" />
          {closedRequests.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No rejected or cancelled requests
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3 px-1">
                <Badge variant="destructive" className="text-sm px-3 py-1">
                  {closedRequests.filter(r => r.status === 'rejected').length} Rejected
                </Badge>
                <Badge variant="outline" className="text-sm px-3 py-1 text-muted-foreground">
                  {closedRequests.filter(r => r.status === 'cancelled').length} Cancelled
                </Badge>
              </div>
              <VirtualizedRequestList requests={closedRequests} renderCard={renderCardPlain} />
            </>
          )}
        </TabsContent>

        <TabsContent value="all">
          <TabFilterBar testIdPrefix="all" />
          {filteredRequests.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No requests found</CardContent></Card>
          ) : (
            <VirtualizedRequestList requests={filteredRequests} renderCard={renderCardPlain} />
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

              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium mb-2 block">Quick Approval Options</Label>
                  <div className="grid grid-cols-4 gap-2">
                    <div 
                      onClick={() => setApprovalType('full')}
                      className={`cursor-pointer rounded-md border p-3 text-center transition-colors hover-elevate ${
                        approvalType === 'full' 
                          ? 'border-primary bg-primary/10' 
                          : 'border-border bg-muted/30'
                      }`}
                      data-testid="button-approval-full"
                    >
                      <span className="text-lg font-bold block">100%</span>
                      <span className="text-xs text-muted-foreground" data-testid="text-amount-100">{selectedRequest.requestedAmount.toLocaleString()}</span>
                    </div>
                    <div 
                      onClick={() => { setApprovalType('percentage'); setCustomPercentage(75); }}
                      className={`cursor-pointer rounded-md border p-3 text-center transition-colors hover-elevate ${
                        approvalType === 'percentage' && customPercentage === 75 
                          ? 'border-primary bg-primary/10' 
                          : 'border-border bg-muted/30'
                      }`}
                      data-testid="button-approval-75"
                    >
                      <span className="text-lg font-bold block">75%</span>
                      <span className="text-xs text-muted-foreground" data-testid="text-amount-75">{Math.round(selectedRequest.requestedAmount * 0.75).toLocaleString()}</span>
                    </div>
                    <div 
                      onClick={() => setApprovalType('half')}
                      className={`cursor-pointer rounded-md border p-3 text-center transition-colors hover-elevate ${
                        approvalType === 'half' 
                          ? 'border-primary bg-primary/10' 
                          : 'border-border bg-muted/30'
                      }`}
                      data-testid="button-approval-half"
                    >
                      <span className="text-lg font-bold block">50%</span>
                      <span className="text-xs text-muted-foreground" data-testid="text-amount-50">{Math.round(selectedRequest.requestedAmount * 0.5).toLocaleString()}</span>
                    </div>
                    <div 
                      onClick={() => { setApprovalType('percentage'); setCustomPercentage(25); }}
                      className={`cursor-pointer rounded-md border p-3 text-center transition-colors hover-elevate ${
                        approvalType === 'percentage' && customPercentage === 25 
                          ? 'border-primary bg-primary/10' 
                          : 'border-border bg-muted/30'
                      }`}
                      data-testid="button-approval-25"
                    >
                      <span className="text-lg font-bold block">25%</span>
                      <span className="text-xs text-muted-foreground" data-testid="text-amount-25">{Math.round(selectedRequest.requestedAmount * 0.25).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <Label className="text-sm font-medium mb-2 block">Custom Approval</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={approvalType === 'percentage' && ![75, 25].includes(customPercentage) ? 'default' : 'outline'}
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
                </div>

                {approvalType === 'percentage' && (
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
                    <Label className="whitespace-nowrap">Percentage:</Label>
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
                    <span className="text-muted-foreground text-sm ml-auto">
                      = {Math.round(selectedRequest.requestedAmount * (customPercentage / 100)).toLocaleString()} SDG
                    </span>
                  </div>
                )}

                {approvalType === 'custom' && (
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
                    <Label className="whitespace-nowrap">Amount:</Label>
                    <Input
                      type="number"
                      value={customAmount}
                      onChange={e => setCustomAmount(parseFloat(e.target.value) || 0)}
                      max={selectedRequest.requestedAmount}
                      className="w-32"
                      data-testid="input-custom-amount"
                    />
                    <span>SDG</span>
                    <span className="text-muted-foreground text-sm ml-auto">
                      = {customAmount > 0 ? Math.round((customAmount / selectedRequest.requestedAmount) * 100) : 0}% of requested
                    </span>
                  </div>
                )}

                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-4 rounded-md" data-testid="container-approval-summary">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Final Approved Amount</p>
                      <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300" data-testid="text-final-approved-amount">
                        {calculateApprovedAmount().toLocaleString()} SDG
                      </p>
                    </div>
                    <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2" data-testid="text-approval-description">
                    {approvalType === 'full' && 'Approving the full requested amount.'}
                    {approvalType === 'half' && `Approving 50% of the ${selectedRequest.requestedAmount.toLocaleString()} SDG requested.`}
                    {approvalType === 'percentage' && `Approving ${customPercentage}% of the ${selectedRequest.requestedAmount.toLocaleString()} SDG requested.`}
                    {approvalType === 'custom' && `Approving a fixed amount of ${customAmount.toLocaleString()} SDG.`}
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
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              Reject Request
            </DialogTitle>
            <DialogDescription>
              This action will notify the requester and mark this request as rejected.
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 rounded-md space-y-2" data-testid="container-rejection-details">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Site:</span>
                    <p className="font-medium" data-testid="text-reject-site">{selectedRequest.siteName}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Amount:</span>
                    <p className="font-medium" data-testid="text-reject-amount">{selectedRequest.requestedAmount.toLocaleString()} SDG</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Requester:</span>
                    <p className="font-medium" data-testid="text-reject-requester">{selectedRequest.requestedByName || 'Unknown'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Requested:</span>
                    <p className="font-medium" data-testid="text-reject-date">{format(new Date(selectedRequest.requestedAt), 'MMM d, yyyy')}</p>
                  </div>
                </div>
              </div>

              <Alert variant="destructive" data-testid="alert-rejection-warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  The requester will receive a notification with your rejection reason.
                  They will need to submit a new request if they want to try again.
                </AlertDescription>
              </Alert>

              <div>
                <Label htmlFor="rejection-reason" className="flex items-center gap-1">
                  Rejection Reason <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="rejection-reason"
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  placeholder="Explain why this request is being rejected (e.g., insufficient justification, budget exceeded, duplicate request, etc.)..."
                  rows={4}
                  className="mt-2"
                  data-testid="textarea-rejection-reason"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Be specific so the requester understands what went wrong.
                </p>
              </div>
            </div>
          )}

          {rejectConfirmStep && selectedRequest && (
            <div className="rounded-md border border-destructive bg-red-50 dark:bg-red-950/30 p-3 space-y-1" data-testid="container-reject-confirm">
              <p className="text-sm font-semibold text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Confirm rejection — this cannot be undone
              </p>
              <p className="text-sm text-muted-foreground">
                Rejecting <strong>{selectedRequest.requestedByName || 'this requester'}</strong>'s advance of <strong>{selectedRequest.requestedAmount.toLocaleString()} SDG</strong> for <strong>{selectedRequest.siteName}</strong>.
              </p>
              <p className="text-xs text-muted-foreground italic">Reason: "{rejectionReason.trim()}"</p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { if (rejectConfirmStep) { setRejectConfirmStep(false); } else { closeDialog(); } }} data-testid="button-cancel-reject">
              {rejectConfirmStep ? 'Go Back' : 'Cancel'}
            </Button>
            {!rejectConfirmStep ? (
              <Button
                variant="destructive"
                onClick={() => setRejectConfirmStep(true)}
                disabled={!rejectionReason.trim()}
                data-testid="button-reject-step1"
              >
                Reject
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={processing}
                data-testid="button-confirm-reject"
              >
                {processing ? 'Processing...' : 'Yes, Reject'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={action === 'pay'} onOpenChange={() => closeDialog()}>
        <DialogContent data-testid="dialog-payment" className="flex flex-col max-h-[90vh]">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Process Payment</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1">
            {selectedRequest && (
              <div className="space-y-4 py-1">
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
                  {paymentAmount > selectedRequest.remainingAmount && (
                    <p className="text-xs text-destructive mt-1 flex items-center gap-1" data-testid="text-overpayment-warning">
                      <AlertTriangle className="h-3 w-3" />
                      Exceeds remaining balance ({selectedRequest.remainingAmount.toLocaleString()} SDG)
                    </p>
                  )}
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

                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Payment Receipt / إيصال الدفع <span className="text-red-500">*</span>
                  </Label>

                  {/* Upload zone */}
                  <div className={`border-2 border-dashed rounded-lg p-3 text-center transition-colors relative cursor-pointer ${
                    payProofFile ? 'border-green-500/50 hover:border-green-400 bg-green-500/5' : 'border-red-400/60 hover:border-red-400'
                  }`}>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      onChange={handlePayProofFileChange}
                      disabled={processing}
                      data-testid="input-pay-proof-file"
                    />
                    {payProofFile ? (
                      <div className="flex items-center justify-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                        <span className="truncate max-w-[200px] text-green-600 dark:text-green-400 font-medium">{payProofFile.name}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">— click to change</span>
                      </div>
                    ) : (
                      <div className="text-muted-foreground py-1">
                        <ImageIcon className="h-7 w-7 mx-auto mb-1 opacity-40" />
                        <p className="text-xs font-medium text-red-400">Receipt required / الإيصال مطلوب</p>
                        <p className="text-xs opacity-60 mt-0.5">Upload image or PDF — visible to recipient</p>
                      </div>
                    )}
                  </div>

                  {/* Preview panel shown after file is selected */}
                  {payProofFile && (
                    <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
                      {payProofPreviewUrl ? (
                        <a href={payProofPreviewUrl} target="_blank" rel="noopener noreferrer" className="block group relative">
                          <img
                            src={payProofPreviewUrl}
                            alt="Receipt preview"
                            className="w-full max-h-52 object-contain bg-black/5 group-hover:opacity-90 transition-opacity"
                          />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                            <span className="text-white text-xs font-medium bg-black/60 px-2 py-1 rounded">View full size</span>
                          </div>
                        </a>
                      ) : (
                        <div className="flex items-center gap-3 px-3 py-2.5">
                          <FileText className="h-8 w-8 text-red-500 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{payProofFile.name}</p>
                            <p className="text-xs text-muted-foreground">{(payProofFile.size / 1024).toFixed(1)} KB</p>
                          </div>
                          <a
                            href={URL.createObjectURL(payProofFile)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="ml-auto text-xs text-primary underline flex-shrink-0"
                          >
                            Preview
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-shrink-0 pt-3 border-t">
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel-payment">
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={handleProcessPayment}
              disabled={processing || !payProofFile}
              data-testid="button-confirm-payment"
            >
              {processing ? (payProofFile ? 'Uploading...' : 'Processing...') : 'Process Payment'}
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

      <Dialog open={action === 'revert'} onOpenChange={() => closeDialog()}>
        <DialogContent className="max-w-md" data-testid="dialog-revert">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo2 className="h-5 w-5" />
              Revert to Pending
            </DialogTitle>
            <DialogDescription>
              Revert this request back to a pending approval status
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-md">
                <p className="font-medium">{selectedRequest.siteName}</p>
                <p className="text-sm text-muted-foreground">
                  Current Status: <Badge variant="outline">{selectedRequest.status.replace(/_/g, ' ')}</Badge>
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Amount: {(selectedRequest.approvedAmount || selectedRequest.requestedAmount).toLocaleString()} SDG
                </p>
              </div>

              <div className="space-y-2">
                <Label>Revert To</Label>
                <Select
                  value={revertTarget}
                  onValueChange={(value) => setRevertTarget(value as 'pending_supervisor' | 'pending_admin' | 'approved')}
                >
                  <SelectTrigger data-testid="select-revert-target">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending_supervisor">Pending Supervisor Approval</SelectItem>
                    <SelectItem value="pending_admin">Pending Admin Approval</SelectItem>
                    {(selectedRequest.status === 'fully_paid' || selectedRequest.status === 'partially_paid') && (
                      <SelectItem value="approved">Approved (Ready for Payment)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Reason (Optional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Why is this being reverted?"
                  data-testid="input-revert-reason"
                />
              </div>

              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {revertTarget === 'pending_supervisor' 
                    ? 'All approval data will be cleared and the request will need to go through the full approval process again.' 
                    : revertTarget === 'pending_admin'
                    ? 'Admin approval data will be cleared but supervisor approval will be preserved.'
                    : 'Payment data will be reset and the request will return to approved status for reprocessing.'}
                </AlertDescription>
              </Alert>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel-revert">
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={handleRevert}
              disabled={processing}
              data-testid="button-confirm-revert"
            >
              <Undo2 className="h-4 w-4 mr-1" />
              {processing ? 'Reverting...' : 'Confirm Revert'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {signatureRequest && currentUser && (
        <SignatureConfirmationModal
          open={!!signatureRequest}
          onOpenChange={(open) => { if (!open) setSignatureRequest(null); }}
          transaction={{
            id: signatureRequest.id,
            type: 'advance_payment',
            title: `Advance Receipt Confirmation / تأكيد استلام السلفة`,
            description: `I confirm that I have received the transportation advance for site: ${signatureRequest.siteName}. / أؤكد أنني استلمت سلفة النقل لموقع: ${signatureRequest.siteName}`,
            amount: signatureRequest.totalPaidAmount,
            currency: 'SDG',
            counterparty: signatureRequest.adminProcessedByName || 'Finance',
            date: new Date().toISOString(),
            reference: signatureRequest.id,
          }}
          userId={currentUser.id}
          userName={currentUser.fullName || currentUser.email || ''}
          userEmail={currentUser.email}
          userRole={currentUser.role}
          allowedMethods={['handwriting', 'uuid']}
          onSignatureComplete={async (signature) => {
            await confirmReceipt({
              requestId: signatureRequest.id,
              userId: currentUser.id,
              userName: currentUser.fullName || currentUser.email || '',
              signatureId: signature.signatureId,
              signatureHash: signature.signatureHash,
              signatureMethod: signature.method,
              signedAt: signature.signedAt,
            });
            try {
              const dpAmt = signatureRequest.approvedAmount ?? signatureRequest.requestedAmount ?? 0;
              await NotificationTriggerService.transactionSigned(
                currentUser.id,
                signatureRequest.id,
                dpAmt,
                'SDG'
              );
            } catch (notifErr) {
              console.warn('[DP] Failed to send down payment signed notification:', notifErr);
            }
            setSignatureRequest(null);
          }}
          onCancel={() => setSignatureRequest(null)}
        />
      )}

      {bulkConfirmRequests.length > 0 && currentUser && (
        <SignatureConfirmationModal
          open={bulkConfirmRequests.length > 0}
          onOpenChange={(open) => { if (!open) setBulkConfirmRequests([]); }}
          transaction={{
            id: `bulk-${bulkConfirmRequests.map(r => r.id).join('-').slice(0, 40)}`,
            type: 'advance_payment',
            title: `Bulk Receipt Confirmation (${bulkConfirmRequests.length}) / تأكيد جماعي`,
            description: `I confirm receipt of ${bulkConfirmRequests.length} advance payment${bulkConfirmRequests.length > 1 ? 's' : ''} for sites: ${bulkConfirmRequests.map(r => r.siteName).join(', ')}. / أؤكد استلام ${bulkConfirmRequests.length} سلفة للمواقع المذكورة.`,
            amount: bulkConfirmRequests.reduce((sum, r) => sum + (r.totalPaidAmount || r.approvedAmount || r.requestedAmount || 0), 0),
            currency: 'SDG',
            counterparty: 'Finance',
            date: new Date().toISOString(),
            reference: `BULK-${bulkConfirmRequests.length}`,
          }}
          userId={currentUser.id}
          userName={currentUser.fullName || currentUser.email || ''}
          userEmail={currentUser.email}
          userRole={currentUser.role}
          allowedMethods={['handwriting', 'uuid']}
          onSignatureComplete={async (signature) => {
            await handleBulkConfirmComplete(signature);
          }}
          onCancel={() => setBulkConfirmRequests([])}
        />
      )}

      <Dialog open={paymentRequestDialog.open} onOpenChange={(open) => { if (!open) setPaymentRequestDialog({ open: false, request: null, bulkRequests: [], bulkMeta: { count: 0, total: 0 }, isBulk: false, availableRecipients: [], selectedRecipientIds: [], ccEmails: [], loading: false, sending: false, bulkGroupBy: '', bulkGroupValue: '', sendMode: 'pdf' as const, showPreview: false, usdRate: '' }); }}>
        <DialogContent
          className={paymentRequestDialog.isBulk ? "max-w-2xl max-h-[90vh] overflow-y-auto" : "max-w-lg max-h-[90vh] overflow-y-auto"}
          onPointerDownOutside={(e) => {
            if (
              paymentRequestDialog.loading ||
              paymentRequestDialog.sending ||
              (paymentRequestDialog.isBulk && paymentRequestDialog.bulkRequests.length === 0)
            ) {
              e.preventDefault();
            }
          }}
          onEscapeKeyDown={(e) => {
            if (paymentRequestDialog.sending) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {paymentRequestDialog.isBulk
                ? paymentRequestDialog.sendMode === 'excel'
                  ? 'Send Bulk Excel / إرسال Excel الجماعي'
                  : 'Bulk Payment Request / طلب دفع جماعي'
                : 'Request Payment / طلب دفع'}
            </DialogTitle>
            <DialogDescription>
              {paymentRequestDialog.isBulk
                ? paymentRequestDialog.sendMode === 'excel'
                  ? `Send a formatted Excel report for ${paymentRequestDialog.bulkMeta.count} advance(s) to the finance team. / إرسال تقرير Excel منسق لـ ${paymentRequestDialog.bulkMeta.count} سلفة إلى فريق المالية.`
                  : `Send one email with a summary PDF for ${paymentRequestDialog.bulkMeta.count} approved advance(s) to finance team.`
                : 'Send payment request email to finance team with the approval certificate attached.'}
            </DialogDescription>
            {paymentRequestDialog.isBulk && paymentRequestDialog.bulkMeta.count > 0 && (
              <div className="mt-2 flex items-center gap-3 text-sm">
                <Badge variant="secondary" className="font-semibold">{paymentRequestDialog.bulkMeta.count} request(s)</Badge>
                <span className="font-semibold text-green-600 dark:text-green-400">SDG {paymentRequestDialog.bulkMeta.total.toLocaleString()}</span>
                {paymentRequestDialog.bulkGroupBy && (
                  <Badge variant="outline" className="text-xs">{paymentRequestDialog.bulkGroupBy}: {paymentRequestDialog.bulkGroupValue}</Badge>
                )}
              </div>
            )}
          </DialogHeader>
          {paymentRequestDialog.loading ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading finance recipients... / جاري تحميل المستلمين...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {paymentRequestDialog.isBulk && paymentRequestDialog.bulkMeta.count > 0 && (
                <div className="space-y-3">
                  <div className="bg-muted/50 p-3 rounded-md text-sm space-y-2">
                    {paymentRequestDialog.bulkGroupBy && (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{paymentRequestDialog.bulkGroupBy}</Badge>
                        <span className="font-medium">{paymentRequestDialog.bulkGroupValue}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <p className="text-xs text-muted-foreground">Total Requests</p>
                        <p className="font-semibold">{paymentRequestDialog.bulkMeta.count}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total Amount</p>
                        <p className="font-semibold">SDG {paymentRequestDialog.bulkMeta.total.toLocaleString()}</p>
                      </div>
                    </div>
                    {/* USD Rate input */}
                    <div className="pt-2 border-t border-border/50 space-y-1.5">
                      <Label htmlFor="dp-usd-rate" className="text-xs font-semibold text-[#0F2041]">
                        USD Exchange Rate (1 USD = ? SDG) <span className="text-muted-foreground font-normal">— optional / اختياري</span>
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="dp-usd-rate"
                          type="number"
                          min="1"
                          step="0.01"
                          placeholder="e.g. 3500"
                          value={paymentRequestDialog.usdRate}
                          onChange={(e) => setPaymentRequestDialog(prev => ({ ...prev, usdRate: e.target.value }))}
                          data-testid="input-dp-usd-rate"
                          className="h-8 text-sm font-semibold w-36"
                        />
                        {paymentRequestDialog.usdRate && !isNaN(parseFloat(paymentRequestDialog.usdRate)) && parseFloat(paymentRequestDialog.usdRate) > 0 && (() => {
                          const rate = parseFloat(paymentRequestDialog.usdRate);
                          const totalSdg = paymentRequestDialog.bulkMeta.total;
                          const totalUsd = totalSdg / rate;
                          const perReq = paymentRequestDialog.bulkMeta.count > 0 ? totalUsd / paymentRequestDialog.bulkMeta.count : 0;
                          return (
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-blue-700">≈ USD {totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              <span className="text-[10px] text-muted-foreground">~USD {perReq.toFixed(2)} / request</span>
                            </div>
                          );
                        })()}
                      </div>
                      <p className="text-[11px] text-muted-foreground">If provided, the USD equivalent will appear in the email and attached files / إذا أُدخل، سيظهر المعادل بالدولار في البريد والمرفقات</p>
                    </div>
                  </div>
                  <BulkSummaryTable requests={paymentRequestDialog.bulkRequests as any} users={users as any} />
                  <div className="p-2 bg-destructive/10 rounded text-xs text-destructive flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">Reconciliation Required / التسوية مطلوبة</p>
                      <p>Recipients must submit receipts and return unused funds within 5 working days.</p>
                      <p>يجب على المستلمين تقديم الإيصالات وإرجاع الأموال غير المستخدمة خلال 5 أيام عمل.</p>
                    </div>
                  </div>
                  {/* Attachment mode toggle — PDF vs Excel */}
                  <div className="rounded-lg border bg-slate-50 dark:bg-slate-900 p-3 space-y-2">
                    <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Attachment Mode / نوع المرفق</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentRequestDialog(prev => ({ ...prev, sendMode: 'pdf' }))}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border-2 text-xs font-semibold transition-colors ${
                          paymentRequestDialog.sendMode !== 'excel'
                            ? 'border-[#0F2041] bg-[#0F2041]/8 text-[#0F2041] dark:border-blue-400 dark:text-blue-300'
                            : 'border-transparent bg-white dark:bg-slate-800 text-muted-foreground hover:border-slate-300'
                        }`}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        PDF Summary
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentRequestDialog(prev => ({ ...prev, sendMode: 'excel' }))}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border-2 text-xs font-semibold transition-colors ${
                          paymentRequestDialog.sendMode === 'excel'
                            ? 'border-green-600 bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300'
                            : 'border-transparent bg-white dark:bg-slate-800 text-muted-foreground hover:border-slate-300'
                        }`}
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                        Excel (6 sheets)
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {paymentRequestDialog.sendMode === 'excel'
                        ? `Excel workbook (6 sheets) + signed PDF certificates for all ${paymentRequestDialog.bulkMeta.count} requests will both be attached.`
                        : paymentRequestDialog.bulkMeta.count > 30
                          ? `Excel (6 sheets) will be attached. PDF is too large for direct attachment — a download link will be included in the email body.`
                          : `Excel workbook (6 sheets) + signed PDF certificates for all ${paymentRequestDialog.bulkMeta.count} requests will both be attached.`
                      }
                    </p>
                  </div>
                </div>
              )}
              {!paymentRequestDialog.isBulk && paymentRequestDialog.request && (() => {
                const req = paymentRequestDialog.request!;
                const requester = users?.find(u => u.id === req.requestedBy);
                const rName = (requester as any)?.fullName || (requester as any)?.full_name || requester?.email || 'Unknown';
                return (
                  <div className="bg-muted/50 p-3 rounded-md text-sm space-y-2">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      <div><p className="text-xs text-muted-foreground">Requester / مقدم الطلب</p><p className="font-medium text-sm">{rName}</p></div>
                      <div><p className="text-xs text-muted-foreground">Role / الدور</p><p className="font-medium text-sm">{req.requesterRole || 'N/A'}</p></div>
                      <div><p className="text-xs text-muted-foreground">Site / الموقع</p><p className="font-medium text-sm">{req.siteName}</p></div>
                      <div><p className="text-xs text-muted-foreground">Hub / المركز</p><p className="font-medium text-sm">{req.hubName || 'N/A'}</p></div>
                      <div><p className="text-xs text-muted-foreground">State / الولاية</p><p className="font-medium text-sm">{req.stateName || 'N/A'}</p></div>
                      <div><p className="text-xs text-muted-foreground">Locality / المحلية</p><p className="font-medium text-sm">{req.localityName || 'N/A'}</p></div>
                      <div><p className="text-xs text-muted-foreground">Requested Amount / المبلغ المطلوب</p><p className="font-medium text-sm">SDG {req.requestedAmount.toLocaleString()}</p></div>
                      <div><p className="text-xs text-muted-foreground">Approved Amount / المبلغ المعتمد</p><p className="font-semibold text-sm text-green-600">SDG {(req.approvedAmount || req.requestedAmount).toLocaleString()}</p></div>
                      {req.approvalPercentage && (
                        <div><p className="text-xs text-muted-foreground">Approval % / نسبة الموافقة</p><p className="font-medium text-sm">{req.approvalPercentage}%</p></div>
                      )}
                      <div><p className="text-xs text-muted-foreground">Project / المشروع</p><p className="font-medium text-sm">{req.projectName || 'N/A'}</p></div>
                    </div>
                    <div className="mt-2 p-2 bg-destructive/10 rounded text-xs text-destructive flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">Reconciliation Required / التسوية مطلوبة</p>
                        <p>Recipient must submit receipts and return unused funds.</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <FileText className="h-3.5 w-3.5" />
                      <span>PDF approval certificate will be attached to the email.</span>
                    </div>
                  </div>
                );
              })()}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Recipients</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPaymentRequestDialog(prev => ({
                        ...prev,
                        selectedRecipientIds: prev.selectedRecipientIds.length === prev.availableRecipients.length
                          ? [] : prev.availableRecipients.map(r => r.id),
                      }));
                    }}
                    data-testid="button-toggle-all-recipients"
                  >
                    {paymentRequestDialog.selectedRecipientIds.length === paymentRequestDialog.availableRecipients.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {paymentRequestDialog.availableRecipients.map(r => (
                      <div key={r.id} className="flex items-center gap-2 p-2 rounded-md hover-elevate">
                        <Checkbox
                          checked={selectedRecipientSet.has(r.id)}
                          onCheckedChange={() => {
                            setPaymentRequestDialog(prev => ({
                              ...prev,
                              selectedRecipientIds: prev.selectedRecipientIds.includes(r.id)
                                ? prev.selectedRecipientIds.filter(id => id !== r.id)
                                : [...prev.selectedRecipientIds, r.id],
                            }));
                          }}
                          data-testid={`checkbox-recipient-${r.id}`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{r.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                        </div>
                        <Badge variant="outline" className="text-xs">{r.role}</Badge>
                      </div>
                    ))}
                    {paymentRequestDialog.availableRecipients.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No finance recipients found.</p>
                    )}
                  </div>
                </ScrollArea>
              </div>

              <div className="border-t pt-3">
                <EmailCCInput
                  ccEmails={paymentRequestDialog.ccEmails}
                  onChange={(emails) => setPaymentRequestDialog(prev => ({ ...prev, ccEmails: emails }))}
                  contacts={ccAvailableContacts}
                />
              </div>
            </div>
          )}
          {paymentRequestDialog.showPreview && !paymentRequestDialog.loading && (
            <div className="border rounded-lg overflow-hidden" style={{ height: '420px' }}>
              <div className="bg-muted/60 px-3 py-2 flex items-center justify-between gap-2 border-b">
                <div className="flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Email Preview — as the recipient will see it</span>
                </div>
                <div className="flex items-center gap-1.5 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded px-2 py-0.5">
                  {paymentRequestDialog.sendMode === 'excel'
                    ? <FileSpreadsheet className="h-3 w-3 text-green-700 dark:text-green-400" />
                    : <FileText className="h-3 w-3 text-green-700 dark:text-green-400" />}
                  <span className="text-xs font-medium text-green-700 dark:text-green-400">
                    Attached: {paymentRequestDialog.bulkMeta.count > 30 ? 'Excel (6 sheets) + PDF download link in body' : 'Excel (6 sheets) + Signed PDF Certificates'}
                  </span>
                </div>
              </div>
              <iframe
                srcDoc={buildEmailPreviewHtml()}
                title="Email Preview"
                sandbox="allow-same-origin"
                className="w-full h-full border-0"
                style={{ height: 'calc(420px - 37px)' }}
              />
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2">
            {paymentRequestDialog.showPreview ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setPaymentRequestDialog(prev => ({ ...prev, showPreview: false }))}
                  data-testid="button-back-from-preview"
                >
                  ← Back / رجوع
                </Button>
                <Button
                  onClick={handleSendPaymentRequest}
                  disabled={paymentRequestDialog.sending || paymentRequestDialog.loading || paymentRequestDialog.selectedRecipientIds.length === 0 || (paymentRequestDialog.isBulk && paymentRequestDialog.bulkRequests.length === 0)}
                  data-testid="button-confirm-send-payment-request"
                  className="bg-green-700 hover:bg-green-800 text-white"
                >
                  {paymentRequestDialog.sending ? (
                    <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Sending...</>
                  ) : (
                    <><Mail className="h-4 w-4 mr-1" /> Confirm & Send</>
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setPaymentRequestDialog({ open: false, request: null, bulkRequests: [], bulkMeta: { count: 0, total: 0 }, isBulk: false, availableRecipients: [], selectedRecipientIds: [], ccEmails: [], loading: false, sending: false, bulkGroupBy: '', bulkGroupValue: '', sendMode: 'pdf' as const, showPreview: false, usdRate: '' })}
                  data-testid="button-cancel-payment-request"
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setPaymentRequestDialog(prev => ({ ...prev, showPreview: true }))}
                  disabled={paymentRequestDialog.selectedRecipientIds.length === 0 || paymentRequestDialog.loading}
                  data-testid="button-preview-email"
                >
                  <Eye className="h-4 w-4 mr-1" /> Preview Email
                </Button>
                <Button
                  onClick={handleSendPaymentRequest}
                  disabled={paymentRequestDialog.sending || paymentRequestDialog.loading || paymentRequestDialog.selectedRecipientIds.length === 0 || (paymentRequestDialog.isBulk && paymentRequestDialog.bulkRequests.length === 0)}
                  data-testid="button-send-payment-request"
                >
                  {paymentRequestDialog.sending ? (
                    <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Sending...</>
                  ) : paymentRequestDialog.sendMode === 'excel' ? (
                    <><FileSpreadsheet className="h-4 w-4 mr-1" /> Send Excel</>
                  ) : (
                    <><Mail className="h-4 w-4 mr-1" /> Send Request</>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Delete Request Permanently / حذف الطلب نهائياً
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. The request will be permanently removed from the system.
              If the person needs an advance again, they must submit a new request.
            </DialogDescription>
          </DialogHeader>
          {deleteConfirm && (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-medium">{deleteConfirm.siteName}</span>
                <Badge variant="secondary">{deleteConfirm.status}</Badge>
              </div>
              <div className="text-muted-foreground">
                Requester: {deleteConfirm.requestedByName || 'Unknown'} | Amount: SDG {deleteConfirm.requestedAmount.toLocaleString()}
              </div>
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  This will permanently delete this request and all its approval history. Are you sure?
                </AlertDescription>
              </Alert>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!deleteConfirm) return;
                const targetId = deleteConfirm.id;
                setDeleteConfirm(null);
                deleteRequest(targetId);
              }}
              data-testid="button-confirm-delete"
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialog.open} onOpenChange={(open) => { if (!open) setEditDialog(prev => ({ ...prev, open: false })); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Edit Request / تعديل الطلب
            </DialogTitle>
            <DialogDescription>
              Modify request details. All changes are tracked with timestamps in the audit trail.
              {' / '}
              تعديل تفاصيل الطلب. يتم تتبع جميع التغييرات بالطوابع الزمنية في سجل التدقيق.
            </DialogDescription>
          </DialogHeader>
          {editDialog.request && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-3 rounded-md text-sm space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-medium">{editDialog.request.siteName}</span>
                  <Badge variant="secondary">{editDialog.request.status}</Badge>
                </div>
                <div className="text-muted-foreground text-xs">
                  ID: {editDialog.request.id.substring(0, 8).toUpperCase()} | Requester: {editDialog.request.requestedByName || 'Unknown'}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Site Name / اسم الموقع</Label>
                  <Input
                    value={editDialog.siteName}
                    onChange={e => setEditDialog(prev => ({ ...prev, siteName: e.target.value }))}
                    data-testid="input-edit-site-name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Requested Amount (SDG) / المبلغ المطلوب</Label>
                    <Input
                      type="number"
                      value={editDialog.requestedAmount}
                      onChange={e => setEditDialog(prev => ({ ...prev, requestedAmount: parseFloat(e.target.value) || 0 }))}
                      data-testid="input-edit-requested-amount"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Approved Amount (SDG) / المبلغ الموافق عليه</Label>
                    <Input
                      type="number"
                      value={editDialog.approvedAmount}
                      onChange={e => setEditDialog(prev => ({ ...prev, approvedAmount: parseFloat(e.target.value) || 0 }))}
                      data-testid="input-edit-approved-amount"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Justification / المبرر</Label>
                  <Textarea
                    value={editDialog.justification}
                    onChange={e => setEditDialog(prev => ({ ...prev, justification: e.target.value }))}
                    className="min-h-[60px]"
                    data-testid="input-edit-justification"
                  />
                </div>
                <Separator />
                <div>
                  <Label className="text-xs font-medium text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3 inline mr-1" />
                    Reason for Edit (Required) / سبب التعديل (مطلوب)
                  </Label>
                  <Textarea
                    value={editDialog.reason}
                    onChange={e => setEditDialog(prev => ({ ...prev, reason: e.target.value }))}
                    placeholder="Explain why this edit is needed... / اشرح سبب الحاجة لهذا التعديل..."
                    className="min-h-[60px]"
                    data-testid="input-edit-reason"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(prev => ({ ...prev, open: false }))} disabled={editDialog.processing} data-testid="button-cancel-edit">
              Cancel / إلغاء
            </Button>
            <Button
              onClick={handleEditSubmit}
              disabled={editDialog.processing || !editDialog.reason.trim()}
              data-testid="button-confirm-edit"
            >
              {editDialog.processing ? (
                <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Saving...</>
              ) : (
                <><Pencil className="h-4 w-4 mr-1" /> Save Changes / حفظ التغييرات</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Advance as Paid — mandatory receipt upload dialog */}
      <Dialog
        open={markAsPaidDialog.open}
        onOpenChange={(open) => {
          if (!open && !markAsPaidDialog.uploading) {
            if (markAsPaidDialog.proofPreviewUrl) URL.revokeObjectURL(markAsPaidDialog.proofPreviewUrl);
            setMarkAsPaidDialog({ open: false, request: null, proofFile: null, proofPreviewUrl: null, notes: '', uploading: false });
          }
        }}
      >
        <DialogContent className="max-w-md flex flex-col max-h-[90vh]">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-green-600" />
              Mark Advance as Paid / تحديد السلفة كمدفوعة
            </DialogTitle>
            <DialogDescription>
              Attach a payment receipt before confirming. A receipt is required. / أرفق إيصال الدفع قبل التأكيد. الإيصال مطلوب.
            </DialogDescription>
          </DialogHeader>

          {markAsPaidDialog.request && (
            <div className="flex-1 overflow-y-auto pr-1">
              <div className="space-y-4 py-1">
              <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
                <p className="font-medium">{markAsPaidDialog.request.siteName}</p>
                <p className="text-lg font-bold tabular-nums">
                  {(markAsPaidDialog.request.approvedAmount || markAsPaidDialog.request.requestedAmount).toLocaleString()} SDG
                </p>
                {markAsPaidDialog.request.stateName && (
                  <p className="text-muted-foreground text-xs">State: {markAsPaidDialog.request.stateName}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Payment Receipt / إيصال الدفع <span className="text-red-500">*</span>
                </Label>
                <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-4 text-center hover:border-green-400 transition-colors relative">
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    onChange={handleMarkAsPaidProofFileChange}
                    disabled={markAsPaidDialog.uploading}
                    data-testid="input-advance-payment-proof"
                  />
                  {markAsPaidDialog.proofFile ? (
                    <div className="space-y-2">
                      {markAsPaidDialog.proofPreviewUrl ? (
                        <img
                          src={markAsPaidDialog.proofPreviewUrl}
                          alt="Receipt preview"
                          className="max-h-32 mx-auto rounded object-contain"
                        />
                      ) : (
                        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                          <FileText className="h-8 w-8 text-red-500" />
                          <span>{markAsPaidDialog.proofFile.name}</span>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">Click to change / انقر للتغيير</p>
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      <ImageIcon className="h-8 w-8 mx-auto mb-1 opacity-40" />
                      <p className="text-sm">Upload receipt image or PDF / ارفع صورة أو PDF</p>
                      <p className="text-xs opacity-60">Click to browse / انقر للتصفح</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Notes / ملاحظات <span className="text-muted-foreground font-normal">(optional / اختياري)</span>
                </Label>
                <Textarea
                  value={markAsPaidDialog.notes}
                  onChange={(e) => setMarkAsPaidDialog(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. Bank transfer ref: TXN123... / مثال: رقم التحويل: TXN123..."
                  className="resize-none h-20 text-sm"
                  disabled={markAsPaidDialog.uploading}
                  data-testid="input-advance-payment-notes"
                />
              </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex-shrink-0 pt-3 border-t gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (markAsPaidDialog.proofPreviewUrl) URL.revokeObjectURL(markAsPaidDialog.proofPreviewUrl);
                setMarkAsPaidDialog({ open: false, request: null, proofFile: null, proofPreviewUrl: null, notes: '', uploading: false });
              }}
              disabled={markAsPaidDialog.uploading}
              data-testid="button-cancel-advance-mark-paid"
            >
              Cancel / إلغاء
            </Button>
            <Button
              type="button"
              onClick={handleConfirmAdvanceMarkAsPaid}
              disabled={markAsPaidDialog.uploading || !markAsPaidDialog.proofFile}
              className="bg-green-600 hover:bg-green-700 text-white"
              data-testid="button-confirm-advance-mark-paid"
            >
              {markAsPaidDialog.uploading ? (
                <><RefreshCw className="h-4 w-4 mr-1.5 animate-spin" /> Uploading...</>
              ) : (
                <><CheckCircle2 className="h-4 w-4 mr-1.5" /> Confirm Payment / تأكيد الدفع</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Pay — one shared receipt for multiple requests */}
      <Dialog
        open={batchPayDialog.open}
        onOpenChange={(open) => {
          if (!open && !batchPayDialog.uploading) {
            batchPayDialog.proofPreviewUrls.forEach(u => { if (u) URL.revokeObjectURL(u); });
            setBatchPayDialog({ open: false, requests: [], proofFiles: [], proofPreviewUrls: [], notes: '', uploading: false, partialPercent: null, preFundId: null, preFunds: [] });
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-emerald-600" />
              Batch Payment / دفع جماعي
            </DialogTitle>
            <DialogDescription>
              One receipt covers all selected requests. The same receipt will be attached to every request below.
            </DialogDescription>
          </DialogHeader>

          {batchPayDialog.requests.length > 0 && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    {batchPayDialog.requests.length} Request{batchPayDialog.requests.length > 1 ? 's' : ''}
                  </span>
                  <span className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    SDG {batchPayDialog.requests.reduce((s, r) => s + (r.approvedAmount || r.requestedAmount), 0).toLocaleString()}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">Total covered by this single receipt</div>
              </div>

              {/* Breakdown */}
              <div className="rounded-lg border divide-y max-h-48 overflow-y-auto">
                {batchPayDialog.requests.map((req) => (
                  <div key={req.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{req.siteName}</p>
                      <p className="text-xs text-muted-foreground truncate">{req.requestedByName || req.requestedBy}</p>
                    </div>
                    <span className="font-semibold tabular-nums shrink-0 ml-2">
                      {(req.approvedAmount || req.requestedAmount).toLocaleString()} SDG
                    </span>
                  </div>
                ))}
              </div>

              {/* Receipt upload — multiple allowed */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    Receipts / الإيصالات <span className="text-red-500">*</span>
                  </Label>
                  {batchPayDialog.proofFiles.length > 0 && (
                    <span className="text-xs text-muted-foreground">{batchPayDialog.proofFiles.length} file{batchPayDialog.proofFiles.length !== 1 ? 's' : ''} added</span>
                  )}
                </div>

                {/* Existing receipts list */}
                {batchPayDialog.proofFiles.length > 0 && (
                  <div className="space-y-2">
                    {batchPayDialog.proofFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-muted/30">
                        {batchPayDialog.proofPreviewUrls[idx] ? (
                          <img src={batchPayDialog.proofPreviewUrls[idx]} alt={`Receipt ${idx + 1}`} className="h-10 w-10 object-cover rounded border shrink-0" />
                        ) : (
                          <FileText className="h-8 w-8 text-red-500 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{file.name}</p>
                          <p className="text-[10px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveBatchProofFile(idx)}
                          disabled={batchPayDialog.uploading}
                          data-testid={`button-remove-batch-receipt-${idx}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add receipt drop zone */}
                <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-3 text-center hover:border-emerald-400 transition-colors relative">
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    onChange={handleBatchPayProofFileChange}
                    disabled={batchPayDialog.uploading}
                    data-testid="input-batch-payment-proof"
                  />
                  <div className="text-muted-foreground pointer-events-none">
                    <ImageIcon className="h-6 w-6 mx-auto mb-1 opacity-40" />
                    <p className="text-xs">
                      {batchPayDialog.proofFiles.length === 0
                        ? 'Upload receipts (image or PDF)'
                        : 'Add more receipts / أضف المزيد'}
                    </p>
                    <p className="text-[10px] opacity-50 mt-0.5">Click or drag — multiple files allowed</p>
                  </div>
                </div>
              </div>

              {/* Partial payment (patches) toggle */}
              <div className="space-y-2 border rounded-md p-3 bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="partial-payment-toggle"
                    checked={batchPayDialog.partialPercent !== null}
                    onCheckedChange={(checked) => {
                      setBatchPayDialog(prev => ({ ...prev, partialPercent: checked ? 50 : null }));
                    }}
                    disabled={batchPayDialog.uploading}
                    data-testid="checkbox-partial-payment"
                  />
                  <Label htmlFor="partial-payment-toggle" className="text-sm font-medium cursor-pointer">
                    Partial Payment / دفع جزئي
                    <span className="ml-2 text-xs text-muted-foreground font-normal">Pay a percentage now — leaves remainder as &quot;Partially Paid&quot;</span>
                  </Label>
                </div>
                {batchPayDialog.partialPercent !== null && (
                  <div className="flex items-center gap-3 mt-2">
                    <Label className="text-sm text-muted-foreground min-w-fit">Pay %:</Label>
                    <input
                      type="range"
                      min={5}
                      max={95}
                      step={5}
                      value={batchPayDialog.partialPercent}
                      onChange={(e) => setBatchPayDialog(prev => ({ ...prev, partialPercent: Number(e.target.value) }))}
                      className="flex-1 accent-amber-600"
                      disabled={batchPayDialog.uploading}
                      data-testid="slider-partial-percent"
                    />
                    <span className="font-bold text-amber-700 dark:text-amber-400 min-w-[3rem] text-center">
                      {batchPayDialog.partialPercent}%
                    </span>
                  </div>
                )}
                {batchPayDialog.partialPercent !== null && (
                  <div className="mt-1 space-y-0.5">
                    {batchPayDialog.requests.slice(0, 5).map(r => {
                      const approved = r.approvedAmount || r.requestedAmount;
                      const paying = Math.round(approved * (batchPayDialog.partialPercent! / 100));
                      return (
                        <p key={r.id} className="text-xs text-muted-foreground">
                          {r.siteName}: pay <span className="font-semibold text-foreground">{paying.toLocaleString()} SDG</span> / leave {(approved - paying).toLocaleString()} SDG
                        </p>
                      );
                    })}
                    {batchPayDialog.requests.length > 5 && (
                      <p className="text-xs text-muted-foreground">…and {batchPayDialog.requests.length - 5} more</p>
                    )}
                  </div>
                )}
              </div>

              {/* Pre-Fund selector — links payment to a specific fund and updates its balance */}
              {batchPayDialog.preFunds.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Charge to Pre-Fund / خصم من التمويل المسبق
                    <span className="text-muted-foreground font-normal ml-1">(optional — updates fund balance)</span>
                  </Label>
                  <Select
                    value={batchPayDialog.preFundId ?? 'none'}
                    onValueChange={v => setBatchPayDialog(prev => ({ ...prev, preFundId: v === 'none' ? null : v }))}
                    disabled={batchPayDialog.uploading}
                  >
                    <SelectTrigger className="h-9 text-sm" data-testid="select-batch-pre-fund">
                      <SelectValue placeholder="Select a pre-fund (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— No pre-fund —</SelectItem>
                      {batchPayDialog.preFunds.map(f => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name} · {f.currency} {f.available_balance.toLocaleString()} available
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {batchPayDialog.preFundId && (() => {
                    const f = batchPayDialog.preFunds.find(x => x.id === batchPayDialog.preFundId);
                    const total = batchPayDialog.requests.reduce((s, r) => s + (r.approvedAmount || r.requestedAmount), 0);
                    const isPartial = batchPayDialog.partialPercent !== null && batchPayDialog.partialPercent > 0 && batchPayDialog.partialPercent < 100;
                    const paying = isPartial ? Math.round(total * (batchPayDialog.partialPercent! / 100)) : total;
                    const afterBalance = (f?.available_balance ?? 0) - paying;
                    return (
                      <p className={`text-xs ${afterBalance < 0 ? 'text-rose-600 font-medium' : 'text-muted-foreground'}`}>
                        After payment: {f?.currency} {afterBalance.toLocaleString()} remaining
                        {afterBalance < 0 && ' ⚠ Exceeds available balance'}
                      </p>
                    );
                  })()}
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Notes / ملاحظات <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Textarea
                  value={batchPayDialog.notes}
                  onChange={(e) => setBatchPayDialog(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. Bank transfer batch ref: TXN-BATCH-001..."
                  className="resize-none h-20 text-sm"
                  disabled={batchPayDialog.uploading}
                  data-testid="input-batch-payment-notes"
                />
              </div>

              <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                Each requester will receive a single consolidated payment notification listing all their paid advances.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                batchPayDialog.proofPreviewUrls.forEach(u => { if (u) URL.revokeObjectURL(u); });
                setBatchPayDialog({ open: false, requests: [], proofFiles: [], proofPreviewUrls: [], notes: '', uploading: false, partialPercent: null, preFundId: null, preFunds: [] });
              }}
              disabled={batchPayDialog.uploading}
              data-testid="button-cancel-batch-pay"
            >
              Cancel / إلغاء
            </Button>
            <Button
              type="button"
              onClick={handleConfirmBatchPay}
              disabled={batchPayDialog.uploading || batchPayDialog.proofFiles.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="button-confirm-batch-pay"
            >
              {batchPayDialog.uploading ? (
                <><RefreshCw className="h-4 w-4 mr-1.5 animate-spin" /> Processing...</>
              ) : batchPayDialog.partialPercent !== null ? (
                <><CheckCircle2 className="h-4 w-4 mr-1.5" /> Pay {batchPayDialog.partialPercent}% of {batchPayDialog.requests.length} Request{batchPayDialog.requests.length > 1 ? 's' : ''}</>
              ) : (
                <><CheckCircle2 className="h-4 w-4 mr-1.5" /> Pay {batchPayDialog.requests.length} Request{batchPayDialog.requests.length > 1 ? 's' : ''}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
