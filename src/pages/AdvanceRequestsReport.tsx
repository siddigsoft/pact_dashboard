import { useState, useMemo, useCallback, Fragment } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useUser } from '@/context/user/UserContext';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { useDownPayment } from '@/context/downPayment/DownPaymentContext';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  DollarSign, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Download,
  Search,
  Filter,
  Users,
  Building2,
  Calendar,
  FileSpreadsheet,
  PieChart,
  BarChart3,
  RefreshCw,
  Receipt,
  ExternalLink,
  Plus,
  FileText,
  MapPin,
  FolderKanban,
  Truck,
  Banknote,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, subMonths, isWithinInterval } from 'date-fns';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { supabase } from '@/integrations/supabase/client';
import { generateTransportAdvanceCertificatePdf, generateTransportAdvanceCertificateBase64 } from '@/utils/transportAdvanceCertificatePdf';
import { useToast } from '@/hooks/use-toast';
import type { DownPaymentRequest } from '@/types/down-payment';
import { EmailNotificationService } from '@/services/email-notification.service';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Mail, Wallet as WalletIcon } from 'lucide-react';

function AdvanceRequestsReportContent() {
  const { requests, loading, refreshRequests } = useDownPayment();
  const { currentUser, users } = useUser();
  const { isSuperAdmin } = useSuperAdmin();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [hubFilter, setHubFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [paidFilter, setPaidFilter] = useState<string>('all');
  const [reconciledFilter, setReconciledFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('overview');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const PAGE_SIZE = 25;

  const [paymentRequestDialog, setPaymentRequestDialog] = useState<{
    open: boolean;
    request: DownPaymentRequest | null;
    isBulk: boolean;
    bulkRequests: DownPaymentRequest[];
    bulkGroupBy: string;
    bulkGroupValue: string;
    availableRecipients: Array<{ id: string; email: string; name: string; role: string }>;
    selectedRecipientIds: string[];
    loading: boolean;
    sending: boolean;
  }>({ open: false, request: null, isBulk: false, bulkRequests: [], bulkGroupBy: '', bulkGroupValue: '', availableRecipients: [], selectedRecipientIds: [], loading: false, sending: false });
  const [markPaidProcessing, setMarkPaidProcessing] = useState(false);

  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);

  const userRole = currentUser?.role?.toLowerCase();
  const isAdmin = userRole === 'admin' || userRole === 'financialadmin' || userRole === 'superadmin' || userRole === 'ict' || isSuperAdmin;
  const isSupervisor = userRole === 'supervisor' || userRole === 'hubsupervisor';
  const isFOM = userRole === 'fom' || userRole === 'field operation manager';

  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach(u => {
      map.set(u.id, u.fullName || u.email || 'Unknown User');
    });
    return map;
  }, [users]);

  const getProfileName = useCallback((userId: string) => {
    return userMap.get(userId) || 'Unknown User';
  }, [userMap]);

  const handleDownloadCertificate = async (req: DownPaymentRequest) => {
    const requester = users.find(u => u.id === req.requestedBy);
    const supervisorApprover = req.supervisorApprovedBy ? users.find(u => u.id === req.supervisorApprovedBy) : null;
    const adminApprover = req.adminProcessedBy ? users.find(u => u.id === req.adminProcessedBy) : null;

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

    await generateTransportAdvanceCertificatePdf({
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
        name: requester?.fullName || requester?.email || getProfileName(req.requestedBy),
        email: requester?.email || '',
        role: req.requesterRole || null,
      },
      tier1: {
        approverName: supervisorApprover?.fullName || supervisorApprover?.email || getProfileName(req.supervisorApprovedBy || '') || 'N/A',
        status: req.supervisorStatus || 'approved',
        approvedAt: req.supervisorApprovedAt || '',
        notes: req.supervisorNotes || null,
      },
      tier2: {
        approverName: adminApprover?.fullName || adminApprover?.email || getProfileName(req.adminProcessedBy || '') || 'N/A',
        status: req.adminStatus || 'approved',
        approvedAt: req.adminProcessedAt || '',
        notes: req.adminNotes || null,
        signatureImageData,
      },
    });

    toast({
      title: 'Certificate Downloaded / تم تحميل الشهادة',
      description: 'The approval certificate PDF has been saved. / تم حفظ شهادة الموافقة.',
    });
  };

  const getSignatureAndCertData = async (req: DownPaymentRequest) => {
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
    const requester = users.find(u => u.id === req.requestedBy);
    const supervisorApprover = req.supervisorApprovedBy ? users.find(u => u.id === req.supervisorApprovedBy) : null;
    const adminApprover = req.adminProcessedBy ? users.find(u => u.id === req.adminProcessedBy) : null;
    const getName = (u: any) => u?.fullName || u?.full_name || u?.name || u?.email || 'Unknown';
    return {
      request: {
        id: req.id, siteName: req.siteName, stateName: req.stateName, localityName: req.localityName,
        projectName: req.projectName, hubName: req.hubName, activityType: req.activityType,
        requestedAmount: req.requestedAmount,
        approvedAmount: req.approvedAmount || req.adminApprovedAmount || req.supervisorApprovedAmount,
        totalPaidAmount: req.totalPaidAmount || 0,
        remainingAmount: req.remainingAmount || (req.requestedAmount - (req.totalPaidAmount || 0)),
        justification: req.justification, requestedAt: req.requestedAt, status: req.status,
        paymentType: req.paymentType, approvalType: req.approvalType, approvalPercentage: req.approvalPercentage,
      },
      requester: { name: getName(requester), email: requester?.email || '', role: req.requesterRole || null },
      tier1: { approverName: getName(supervisorApprover) || 'N/A', status: req.supervisorStatus || 'approved', approvedAt: req.supervisorApprovedAt || '', notes: req.supervisorNotes || null },
      tier2: { approverName: getName(adminApprover) || 'N/A', status: req.adminStatus || 'approved', approvedAt: req.adminProcessedAt || '', notes: req.adminNotes || null, signatureImageData },
    };
  };

  const approvedForPayment = useMemo(() => {
    return requests.filter(r => r.status === 'approved');
  }, [requests]);

  const bulkUniqueStates = useMemo(() => [...new Set(approvedForPayment.map(r => r.stateName).filter(Boolean))], [approvedForPayment]);
  const bulkUniqueHubs = useMemo(() => [...new Set(approvedForPayment.map(r => r.hubName).filter(Boolean))], [approvedForPayment]);
  const bulkUniqueLocalities = useMemo(() => [...new Set(approvedForPayment.map(r => r.localityName).filter(Boolean))], [approvedForPayment]);
  const bulkUniqueSites = useMemo(() => [...new Set(approvedForPayment.map(r => r.siteName).filter(Boolean))], [approvedForPayment]);
  const bulkUniqueSupervisors = useMemo(() => {
    const map = new Map<string, string>();
    approvedForPayment.forEach(r => {
      if (r.supervisorApprovedBy) {
        map.set(r.supervisorApprovedBy, getProfileName(r.supervisorApprovedBy));
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [approvedForPayment, getProfileName]);

  const openBulkPaymentRequestDialog = async (bulkReqs: DownPaymentRequest[], groupBy: string, groupValue: string) => {
    setPaymentRequestDialog(prev => ({ ...prev, open: true, request: null, isBulk: true, bulkRequests: bulkReqs, bulkGroupBy: groupBy, bulkGroupValue: groupValue, loading: true, selectedRecipientIds: [], availableRecipients: [] }));
    try {
      const { data: financeUsers } = await supabase
        .from('profiles')
        .select('id, email, full_name, role')
        .in('role', ['finance_admin', 'Finance Admin', 'superAdmin', 'SuperAdmin', 'super_admin', 'admin', 'Admin', 'Administrator'])
        .eq('status', 'approved');
      const recipients = (financeUsers || []).filter((u: any) => u.email).map((u: any) => ({ id: u.id, email: u.email, name: u.full_name || u.email, role: u.role }));
      setPaymentRequestDialog(prev => ({ ...prev, availableRecipients: recipients, selectedRecipientIds: recipients.map((r: any) => r.id), loading: false }));
    } catch {
      setPaymentRequestDialog(prev => ({ ...prev, loading: false }));
      toast({ title: "Error / خطأ", description: "Failed to load recipients. / فشل في تحميل المستلمين.", variant: "destructive" });
    }
  };

  const openPaymentRequestDialog = async (req: DownPaymentRequest) => {
    setPaymentRequestDialog(prev => ({ ...prev, open: true, request: req, isBulk: false, bulkRequests: [], bulkGroupBy: '', bulkGroupValue: '', loading: true, selectedRecipientIds: [], availableRecipients: [] }));
    try {
      const { data: financeUsers } = await supabase
        .from('profiles')
        .select('id, email, full_name, role')
        .in('role', ['finance_admin', 'Finance Admin', 'superAdmin', 'SuperAdmin', 'super_admin', 'admin', 'Admin', 'Administrator'])
        .eq('status', 'approved');
      const recipients = (financeUsers || []).filter((u: any) => u.email).map((u: any) => ({ id: u.id, email: u.email, name: u.full_name || u.email, role: u.role }));
      setPaymentRequestDialog(prev => ({ ...prev, availableRecipients: recipients, selectedRecipientIds: recipients.map((r: any) => r.id), loading: false }));
    } catch {
      setPaymentRequestDialog(prev => ({ ...prev, loading: false }));
      toast({ title: "Error / خطأ", description: "Failed to load recipients. / فشل في تحميل المستلمين.", variant: "destructive" });
    }
  };

  const handleSendPaymentRequest = async () => {
    const { request: req, selectedRecipientIds, availableRecipients, isBulk, bulkRequests, bulkGroupBy, bulkGroupValue } = paymentRequestDialog;
    if ((!req && !isBulk) || !currentUser?.id || selectedRecipientIds.length === 0) return;
    if (isBulk && bulkRequests.length === 0) return;
    setPaymentRequestDialog(prev => ({ ...prev, sending: true }));
    try {
      const selectedRecipients = availableRecipients.filter(r => selectedRecipientIds.includes(r.id)).map(r => ({ email: r.email, name: r.name }));
      const approverName = (currentUser as any).fullName || (currentUser as any).full_name || currentUser.email || 'Approver';
      const approverEmail = currentUser.email || '';

      if (isBulk) {
        const totalAmount = bulkRequests.reduce((s, r) => s + (r.approvedAmount || r.requestedAmount), 0);
        const requestDetails = bulkRequests.map(r => {
          const requester = users.find(u => u.id === r.requestedBy);
          const rName = (requester as any)?.fullName || (requester as any)?.full_name || requester?.email || 'Unknown';
          return `${r.siteName} - ${rName}: SDG ${(r.approvedAmount || r.requestedAmount).toLocaleString()}`;
        }).join('\n');

        const groupLabel = bulkGroupBy ? `${bulkGroupBy}: ${bulkGroupValue}` : 'All Approved';

        const pdfAttachments: Array<{ base64: string; filename: string }> = [];
        for (const bReq of bulkRequests) {
          try {
            const sig = await getSignatureAndCertData(bReq);
            const pdf = await generateTransportAdvanceCertificateBase64(buildCertData(bReq, sig));
            if (pdf) pdfAttachments.push(pdf);
          } catch { /* skip individual PDF errors */ }
        }

        const firstPdf = pdfAttachments.length > 0 ? pdfAttachments[0] : undefined;
        const additionalPdfs = pdfAttachments.length > 1 ? pdfAttachments.slice(1) : undefined;

        const result = await EmailNotificationService.sendPaymentRequestToFinanceWithRecipients(
          selectedRecipients, approverName, approverEmail, `${bulkRequests.length} staff members`,
          `Bulk Transport Advance Payment - ${groupLabel} (${bulkRequests.length} requests)`,
          `BULK-${Date.now().toString(36).toUpperCase()}`, 'Transportation Advance (Bulk)',
          totalAmount, 'advance', bulkRequests[0]?.projectName || 'N/A', 'SDG',
          `\n\n--- BULK REQUEST DETAILS ---\nGroup: ${groupLabel}\nTotal Requests: ${bulkRequests.length}\nTotal Amount: SDG ${totalAmount.toLocaleString()}\n\n${requestDetails}\n\nRECONCILIATION NOTICE: All recipients must submit receipts and return any unused funds within 5 working days.\nملاحظة تسوية: يجب على جميع المستلمين تقديم الإيصالات وإرجاع أي أموال غير مستخدمة خلال 5 أيام عمل.`,
          '/advance-requests-report', firstPdf, additionalPdfs
        );

        if (result.success) {
          toast({ title: "Bulk Payment Request Sent / تم إرسال طلب الدفع الجماعي", description: `Email sent to ${selectedRecipients.length} recipient(s) for ${bulkRequests.length} advance(s) with ${pdfAttachments.length} PDF(s). / تم إرسال البريد إلى ${selectedRecipients.length} مستلم(ين) لـ ${bulkRequests.length} سلفة مع ${pdfAttachments.length} مرفق(ات).` });
        } else {
          toast({ title: "Email Failed / فشل الإرسال", description: result.error || "Could not send. / تعذر الإرسال.", variant: "destructive" });
        }
      } else if (req) {
        const requester = users.find(u => u.id === req.requestedBy);
        const requesterName = (requester as any)?.fullName || (requester as any)?.full_name || requester?.email || 'Unknown';
        const requestId = req.id?.slice(0, 8)?.toUpperCase() || 'N/A';

        let pdfAttachment: { base64: string; filename: string } | undefined;
        try {
          const sig = await getSignatureAndCertData(req);
          pdfAttachment = await generateTransportAdvanceCertificateBase64(buildCertData(req, sig));
        } catch { /* continue without PDF */ }

        const result = await EmailNotificationService.sendPaymentRequestToFinanceWithRecipients(
          selectedRecipients, approverName, approverEmail, requesterName,
          `Transport Advance - ${req.siteName}`, requestId, 'Transportation Advance',
          req.approvedAmount || req.requestedAmount, 'advance', req.projectName || 'N/A', 'SDG', '', '/down-payment-approval', pdfAttachment
        );

        if (result.success) {
          toast({ title: "Payment Request Sent / تم إرسال طلب الدفع", description: `Email sent to ${selectedRecipients.length} recipient(s). / تم إرسال البريد إلى ${selectedRecipients.length} مستلم(ين).` });
        } else {
          toast({ title: "Email Failed / فشل الإرسال", description: result.error || "Could not send. / تعذر الإرسال.", variant: "destructive" });
        }
      }
    } catch {
      toast({ title: "Error / خطأ", description: "Failed to send payment request. / فشل في إرسال طلب الدفع.", variant: "destructive" });
    } finally {
      setPaymentRequestDialog({ open: false, request: null, isBulk: false, bulkRequests: [], bulkGroupBy: '', bulkGroupValue: '', availableRecipients: [], selectedRecipientIds: [], loading: false, sending: false });
    }
  };

  const handleMarkAsPaid = async (req: DownPaymentRequest) => {
    if (!currentUser?.id) return;
    setMarkPaidProcessing(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('down_payment_requests')
        .update({
          status: 'fully_paid',
          total_paid_amount: req.approvedAmount || req.requestedAmount,
          remaining_amount: 0,
          updated_at: now,
        } as any)
        .eq('id', req.id);
      if (error) {
        toast({ title: "Failed / فشل", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Marked as Paid / تم التحديد كمدفوع", description: "The advance has been marked as fully paid. / تم تحديد السلفة كمدفوعة بالكامل." });
        refreshRequests();
      }
    } catch {
      toast({ title: "Error / خطأ", description: "Failed to mark as paid. / فشل في التحديد كمدفوع.", variant: "destructive" });
    } finally {
      setMarkPaidProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline', label: string, className: string }> = {
      'pending_supervisor': { variant: 'outline', label: 'Pending Supervisor', className: 'border-amber-500 text-amber-600' },
      'pending_admin': { variant: 'outline', label: 'Pending Admin', className: 'border-blue-500 text-blue-600' },
      'approved': { variant: 'default', label: 'Approved', className: 'bg-green-500' },
      'rejected': { variant: 'destructive', label: 'Rejected', className: '' },
      'partially_paid': { variant: 'secondary', label: 'Partially Paid', className: 'bg-purple-100 text-purple-700' },
      'fully_paid': { variant: 'default', label: 'Fully Paid', className: 'bg-emerald-500' },
      'cancelled': { variant: 'secondary', label: 'Cancelled', className: 'bg-gray-100 text-gray-600' },
    };
    const config = statusConfig[status] || { variant: 'outline' as const, label: status, className: '' };
    return <Badge variant={config.variant} className={config.className}>{config.label}</Badge>;
  };

  const dateRanges = useMemo(() => {
    const now = new Date();
    return {
      thisMonth: { start: startOfMonth(now), end: endOfMonth(now) },
      lastMonth: { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) },
      last3Months: { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) },
    };
  }, []);

  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      if (debouncedSearchTerm) {
        const term = debouncedSearchTerm.toLowerCase();
        const matchesSite = req.siteName?.toLowerCase().includes(term);
        const matchesUser = getProfileName(req.requestedBy).toLowerCase().includes(term);
        const matchesHub = req.hubName?.toLowerCase().includes(term);
        if (!matchesSite && !matchesUser && !matchesHub) return false;
      }
      if (statusFilter !== 'all' && req.status !== statusFilter) return false;
      if (hubFilter !== 'all' && req.hubId !== hubFilter) return false;
      if (dateFilter !== 'all') {
        const reqDate = parseISO(req.requestedAt);
        const range = dateRanges[dateFilter as keyof typeof dateRanges];
        if (range && !isWithinInterval(reqDate, range)) return false;
      }
      if (paidFilter !== 'all') {
        const isPaid = (req.totalPaidAmount || 0) > 0;
        if (paidFilter === 'paid' && !isPaid) return false;
        if (paidFilter === 'not_paid' && isPaid) return false;
      }
      if (reconciledFilter !== 'all') {
        const isReconciled = (req as any).isReconciled === true || 
          (req.metadata as any)?.isReconciled === true || 
          req.status === 'fully_paid';
        if (reconciledFilter === 'reconciled' && !isReconciled) return false;
        if (reconciledFilter === 'not_reconciled' && isReconciled) return false;
      }
      return true;
    });
  }, [requests, debouncedSearchTerm, statusFilter, hubFilter, dateFilter, dateRanges, getProfileName, paidFilter, reconciledFilter]);

  const paginatedRequests = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredRequests.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredRequests, currentPage]);

  const totalPages = Math.ceil(filteredRequests.length / PAGE_SIZE);

  const stats = useMemo(() => {
    const totalRequested = filteredRequests.reduce((sum, r) => sum + r.requestedAmount, 0);
    const totalApproved = filteredRequests.filter(r => ['approved', 'partially_paid', 'fully_paid'].includes(r.status)).reduce((sum, r) => sum + r.requestedAmount, 0);
    const totalPending = filteredRequests.filter(r => ['pending_supervisor', 'pending_admin'].includes(r.status)).reduce((sum, r) => sum + r.requestedAmount, 0);
    const totalRejected = filteredRequests.filter(r => r.status === 'rejected').reduce((sum, r) => sum + r.requestedAmount, 0);
    const totalPaid = filteredRequests.reduce((sum, r) => sum + (r.totalPaidAmount || 0), 0);
    
    const pendingCount = filteredRequests.filter(r => ['pending_supervisor', 'pending_admin'].includes(r.status)).length;
    const approvedCount = filteredRequests.filter(r => ['approved', 'partially_paid', 'fully_paid'].includes(r.status)).length;
    const rejectedCount = filteredRequests.filter(r => r.status === 'rejected').length;
    const paidCount = filteredRequests.filter(r => (r.totalPaidAmount || 0) > 0).length;
    const remainingBalance = totalApproved - totalPaid;
    
    return { totalRequested, totalApproved, totalPending, totalRejected, totalPaid, pendingCount, approvedCount, rejectedCount, paidCount, remainingBalance, totalCount: filteredRequests.length };
  }, [filteredRequests]);

  const byTeamMember = useMemo(() => {
    const grouped: Record<string, { id: string, name: string, requests: number, totalRequested: number, totalApproved: number, pending: number, items: typeof filteredRequests }> = {};
    filteredRequests.forEach(req => {
      if (!grouped[req.requestedBy]) {
        grouped[req.requestedBy] = { id: req.requestedBy, name: getProfileName(req.requestedBy), requests: 0, totalRequested: 0, totalApproved: 0, pending: 0, items: [] };
      }
      grouped[req.requestedBy].requests++;
      grouped[req.requestedBy].totalRequested += req.requestedAmount;
      grouped[req.requestedBy].items.push(req);
      if (['approved', 'partially_paid', 'fully_paid'].includes(req.status)) {
        grouped[req.requestedBy].totalApproved += req.requestedAmount;
      }
      if (['pending_supervisor', 'pending_admin'].includes(req.status)) {
        grouped[req.requestedBy].pending++;
      }
    });
    return Object.values(grouped).sort((a, b) => b.totalRequested - a.totalRequested);
  }, [filteredRequests, getProfileName]);

  const byHub = useMemo(() => {
    const grouped: Record<string, { id: string, name: string, requests: number, totalRequested: number, totalApproved: number, pending: number, items: typeof filteredRequests }> = {};
    filteredRequests.forEach(req => {
      const hubKey = req.hubId || 'unknown';
      if (!grouped[hubKey]) {
        grouped[hubKey] = { id: hubKey, name: req.hubName || 'Unknown Hub', requests: 0, totalRequested: 0, totalApproved: 0, pending: 0, items: [] };
      }
      grouped[hubKey].requests++;
      grouped[hubKey].totalRequested += req.requestedAmount;
      grouped[hubKey].items.push(req);
      if (['approved', 'partially_paid', 'fully_paid'].includes(req.status)) {
        grouped[hubKey].totalApproved += req.requestedAmount;
      }
      if (['pending_supervisor', 'pending_admin'].includes(req.status)) {
        grouped[hubKey].pending++;
      }
    });
    return Object.values(grouped).sort((a, b) => b.totalRequested - a.totalRequested);
  }, [filteredRequests]);

  const statusLabels: Record<string, string> = {
    'pending_supervisor': 'Pending Supervisor',
    'pending_admin': 'Pending Admin',
    'approved': 'Approved',
    'partially_paid': 'Partially Paid',
    'fully_paid': 'Fully Paid',
    'rejected': 'Rejected',
    'cancelled': 'Cancelled',
  };

  const byStatus = useMemo(() => {
    const grouped: Record<string, { id: string, name: string, requests: number, totalRequested: number, totalApproved: number, pending: number, items: typeof filteredRequests }> = {};
    filteredRequests.forEach(req => {
      const statusKey = req.status;
      if (!grouped[statusKey]) {
        grouped[statusKey] = { id: statusKey, name: statusLabels[statusKey] || statusKey, requests: 0, totalRequested: 0, totalApproved: 0, pending: 0, items: [] };
      }
      grouped[statusKey].requests++;
      grouped[statusKey].totalRequested += req.requestedAmount;
      grouped[statusKey].items.push(req);
      if (['approved', 'partially_paid', 'fully_paid'].includes(req.status)) {
        grouped[statusKey].totalApproved += req.requestedAmount;
      }
      if (['pending_supervisor', 'pending_admin'].includes(req.status)) {
        grouped[statusKey].pending++;
      }
    });
    return Object.values(grouped).sort((a, b) => b.totalRequested - a.totalRequested);
  }, [filteredRequests]);

  const byState = useMemo(() => {
    const grouped: Record<string, { id: string, name: string, requests: number, totalRequested: number, totalApproved: number, pending: number, items: typeof filteredRequests }> = {};
    filteredRequests.forEach(req => {
      const stateKey = req.stateName || 'Unknown';
      if (!grouped[stateKey]) {
        grouped[stateKey] = { id: stateKey, name: stateKey, requests: 0, totalRequested: 0, totalApproved: 0, pending: 0, items: [] };
      }
      grouped[stateKey].requests++;
      grouped[stateKey].totalRequested += req.requestedAmount;
      grouped[stateKey].items.push(req);
      if (['approved', 'partially_paid', 'fully_paid'].includes(req.status)) {
        grouped[stateKey].totalApproved += req.requestedAmount;
      }
      if (['pending_supervisor', 'pending_admin'].includes(req.status)) {
        grouped[stateKey].pending++;
      }
    });
    return Object.values(grouped).sort((a, b) => b.totalRequested - a.totalRequested);
  }, [filteredRequests]);

  const byProject = useMemo(() => {
    const grouped: Record<string, { id: string, name: string, requests: number, totalRequested: number, totalApproved: number, pending: number, items: typeof filteredRequests }> = {};
    filteredRequests.forEach(req => {
      const projectKey = req.projectName || 'Unknown';
      if (!grouped[projectKey]) {
        grouped[projectKey] = { id: projectKey, name: projectKey, requests: 0, totalRequested: 0, totalApproved: 0, pending: 0, items: [] };
      }
      grouped[projectKey].requests++;
      grouped[projectKey].totalRequested += req.requestedAmount;
      grouped[projectKey].items.push(req);
      if (['approved', 'partially_paid', 'fully_paid'].includes(req.status)) {
        grouped[projectKey].totalApproved += req.requestedAmount;
      }
      if (['pending_supervisor', 'pending_admin'].includes(req.status)) {
        grouped[projectKey].pending++;
      }
    });
    return Object.values(grouped).sort((a, b) => b.totalRequested - a.totalRequested);
  }, [filteredRequests]);

  const uniqueHubs = useMemo(() => {
    const hubs = new Map<string, string>();
    requests.forEach(req => {
      if (req.hubId && req.hubName) {
        hubs.set(req.hubId, req.hubName);
      }
    });
    return Array.from(hubs.entries()).map(([id, name]) => ({ id, name }));
  }, [requests]);

  const exportToExcel = () => {
    const data = filteredRequests.map(req => ({
      'Request Date': format(parseISO(req.requestedAt), 'yyyy-MM-dd HH:mm'),
      'Requested By': getProfileName(req.requestedBy),
      'Site Name': req.siteName,
      'Hub': req.hubName || 'N/A',
      'Requested Amount (SDG)': req.requestedAmount,
      'Status': req.status.replace(/_/g, ' ').toUpperCase(),
      'Paid Amount (SDG)': req.totalPaidAmount || 0,
      'Remaining (SDG)': req.remainingAmount || 0,
      'Payment Type': req.paymentType === 'full_advance' ? 'Full Advance' : 'Installments',
      'Justification': req.justification || '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Advance Requests');
    
    const summaryData = [
      { Metric: 'Total Requests', Value: stats.totalCount },
      { Metric: 'Total Requested (SDG)', Value: stats.totalRequested },
      { Metric: 'Total Approved (SDG)', Value: stats.totalApproved },
      { Metric: 'Total Pending (SDG)', Value: stats.totalPending },
      { Metric: 'Total Rejected (SDG)', Value: stats.totalRejected },
      { Metric: 'Total Paid (SDG)', Value: stats.totalPaid },
    ];
    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    XLSX.writeFile(wb, `transportation_advance_cost_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    let yPos = 20;

    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'bold');
    doc.text('PACT Field Operations System', 14, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${format(new Date(), 'PPP')}`, 135, yPos);
    
    yPos += 15;
    doc.setFontSize(22);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text('Transportation Advance Cost Report', 14, yPos);
    
    yPos += 15;
    doc.setDrawColor(200);
    doc.line(14, yPos, 196, yPos);
    yPos += 10;

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary', 14, yPos);
    yPos += 8;

    autoTable(doc, {
      startY: yPos,
      head: [['Metric', 'Value']],
      body: [
        ['Total Requests', stats.totalCount.toString()],
        ['Total Requested (SDG)', stats.totalRequested.toLocaleString()],
        ['Total Approved (SDG)', stats.totalApproved.toLocaleString()],
        ['Total Pending (SDG)', stats.totalPending.toLocaleString()],
        ['Total Rejected (SDG)', stats.totalRejected.toLocaleString()],
        ['Total Paid (SDG)', stats.totalPaid.toLocaleString()],
      ],
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246], fontSize: 11, fontStyle: 'bold' },
      bodyStyles: { fontSize: 10 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Advance Requests', 14, yPos);
    yPos += 8;

    const tableData = filteredRequests.slice(0, 100).map(req => [
      format(parseISO(req.requestedAt), 'MMM dd, yyyy'),
      getProfileName(req.requestedBy),
      req.siteName.substring(0, 25) + (req.siteName.length > 25 ? '...' : ''),
      req.hubName || 'N/A',
      req.requestedAmount.toLocaleString(),
      req.status.replace(/_/g, ' '),
      (req.totalPaidAmount || 0).toLocaleString(),
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'Requested By', 'Site', 'Hub', 'Amount', 'Status', 'Paid']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246], fontSize: 10, fontStyle: 'bold' },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 30 },
        2: { cellWidth: 35 },
        3: { cellWidth: 25 },
        4: { cellWidth: 22 },
        5: { cellWidth: 28 },
        6: { cellWidth: 20 },
      },
    });

    doc.save(`transportation_advance_cost_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const addPdfHeader = (doc: jsPDF, title: string) => {
    let yPos = 15;
    doc.setFillColor(245, 247, 250);
    doc.rect(0, 0, 210, 42, 'F');
    doc.setFontSize(20);
    doc.setTextColor(30, 64, 175);
    doc.setFont('helvetica', 'bold');
    doc.text('PACT', 14, yPos + 5);
    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.setFont('helvetica', 'normal');
    doc.text('Field Operations Command Center', 14, yPos + 13);
    doc.setFontSize(9);
    doc.text(`Generated: ${format(new Date(), 'PPP p')}`, 140, yPos + 5);
    yPos += 32;
    doc.setDrawColor(30, 64, 175);
    doc.setLineWidth(0.5);
    doc.line(14, yPos, 196, yPos);
    yPos += 10;
    doc.setFontSize(18);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 14, yPos);
    return yPos + 12;
  };

  // Export By Team Member
  const exportTeamToExcel = () => {
    const summaryData: Record<string, string | number>[] = byTeamMember.map(m => ({
      'Team Member': m.name,
      'Total Requests': m.requests,
      'Total Requested (SDG)': m.totalRequested,
      'Total Approved (SDG)': m.totalApproved,
      'Pending Requests': m.pending,
    }));
    const teamTotalsExcel = byTeamMember.reduce((acc, m) => ({
      requests: acc.requests + m.requests,
      totalRequested: acc.totalRequested + m.totalRequested,
      totalApproved: acc.totalApproved + m.totalApproved,
      pending: acc.pending + m.pending,
    }), { requests: 0, totalRequested: 0, totalApproved: 0, pending: 0 });
    summaryData.push({
      'Team Member': 'SUBTOTAL',
      'Total Requests': teamTotalsExcel.requests,
      'Total Requested (SDG)': teamTotalsExcel.totalRequested,
      'Total Approved (SDG)': teamTotalsExcel.totalApproved,
      'Pending Requests': teamTotalsExcel.pending,
    });
    const detailData = filteredRequests.map(req => ({
      'Team Member': getProfileName(req.requestedBy),
      'Request Date': format(parseISO(req.requestedAt), 'yyyy-MM-dd'),
      'Site': req.siteName,
      'Hub': req.hubName || 'N/A',
      'Amount (SDG)': req.requestedAmount,
      'Status': req.status.replace(/_/g, ' ').toUpperCase(),
      'Paid (SDG)': req.totalPaidAmount || 0,
      'Remaining (SDG)': req.remainingAmount || 0,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Summary by Team');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailData), 'All Requests');
    XLSX.writeFile(wb, `advance_by_team_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const exportTeamToPDF = () => {
    const doc = new jsPDF();
    let yPos = addPdfHeader(doc, 'Advance Requests by Team Member');
    const teamTotals = byTeamMember.reduce((acc, m) => ({
      requests: acc.requests + m.requests,
      totalRequested: acc.totalRequested + m.totalRequested,
      totalApproved: acc.totalApproved + m.totalApproved,
      pending: acc.pending + m.pending,
    }), { requests: 0, totalRequested: 0, totalApproved: 0, pending: 0 });
    autoTable(doc, {
      startY: yPos,
      head: [['Team Member', 'Requests', 'Requested (SDG)', 'Approved (SDG)', 'Pending']],
      body: byTeamMember.map(m => [m.name, m.requests, m.totalRequested.toLocaleString(), m.totalApproved.toLocaleString(), m.pending]),
      foot: [['SUBTOTAL', teamTotals.requests.toString(), teamTotals.totalRequested.toLocaleString(), teamTotals.totalApproved.toLocaleString(), teamTotals.pending.toString()]],
      theme: 'striped',
      headStyles: { fillColor: [30, 64, 175], fontSize: 11, fontStyle: 'bold' },
      bodyStyles: { fontSize: 10 },
      footStyles: { fillColor: [230, 235, 245], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 11 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Detailed Requests', 14, yPos);
    yPos += 6;
    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'Team Member', 'Site', 'Hub', 'Amount', 'Status', 'Paid']],
      body: filteredRequests.slice(0, 100).map(r => [
        format(parseISO(r.requestedAt), 'MMM dd'),
        getProfileName(r.requestedBy).substring(0, 20),
        r.siteName.substring(0, 20),
        (r.hubName || 'N/A').substring(0, 15),
        r.requestedAmount.toLocaleString(),
        r.status.replace(/_/g, ' '),
        (r.totalPaidAmount || 0).toLocaleString()
      ]),
      theme: 'striped',
      headStyles: { fillColor: [30, 64, 175], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
    });
    doc.save(`advance_by_team_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  // Export By Hub
  const exportHubToExcel = () => {
    const summaryData: Record<string, string | number>[] = byHub.map(h => ({
      'Hub': h.name,
      'Total Requests': h.requests,
      'Total Requested (SDG)': h.totalRequested,
      'Total Approved (SDG)': h.totalApproved,
      'Pending Requests': h.pending,
    }));
    const hubTotalsExcel = byHub.reduce((acc, h) => ({
      requests: acc.requests + h.requests,
      totalRequested: acc.totalRequested + h.totalRequested,
      totalApproved: acc.totalApproved + h.totalApproved,
      pending: acc.pending + h.pending,
    }), { requests: 0, totalRequested: 0, totalApproved: 0, pending: 0 });
    summaryData.push({
      'Hub': 'SUBTOTAL',
      'Total Requests': hubTotalsExcel.requests,
      'Total Requested (SDG)': hubTotalsExcel.totalRequested,
      'Total Approved (SDG)': hubTotalsExcel.totalApproved,
      'Pending Requests': hubTotalsExcel.pending,
    });
    const detailData = filteredRequests.map(req => ({
      'Hub': req.hubName || 'N/A',
      'Request Date': format(parseISO(req.requestedAt), 'yyyy-MM-dd'),
      'Requested By': getProfileName(req.requestedBy),
      'Site': req.siteName,
      'Amount (SDG)': req.requestedAmount,
      'Status': req.status.replace(/_/g, ' ').toUpperCase(),
      'Paid (SDG)': req.totalPaidAmount || 0,
      'Remaining (SDG)': req.remainingAmount || 0,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Summary by Hub');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailData), 'All Requests');
    XLSX.writeFile(wb, `advance_by_hub_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const exportHubToPDF = () => {
    const doc = new jsPDF();
    let yPos = addPdfHeader(doc, 'Advance Requests by Hub');
    const hubTotals = byHub.reduce((acc, h) => ({
      requests: acc.requests + h.requests,
      totalRequested: acc.totalRequested + h.totalRequested,
      totalApproved: acc.totalApproved + h.totalApproved,
      pending: acc.pending + h.pending,
    }), { requests: 0, totalRequested: 0, totalApproved: 0, pending: 0 });
    autoTable(doc, {
      startY: yPos,
      head: [['Hub', 'Requests', 'Requested (SDG)', 'Approved (SDG)', 'Pending']],
      body: byHub.map(h => [h.name, h.requests, h.totalRequested.toLocaleString(), h.totalApproved.toLocaleString(), h.pending]),
      foot: [['SUBTOTAL', hubTotals.requests.toString(), hubTotals.totalRequested.toLocaleString(), hubTotals.totalApproved.toLocaleString(), hubTotals.pending.toString()]],
      theme: 'striped',
      headStyles: { fillColor: [30, 64, 175], fontSize: 11, fontStyle: 'bold' },
      bodyStyles: { fontSize: 10 },
      footStyles: { fillColor: [230, 235, 245], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 11 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Detailed Requests', 14, yPos);
    yPos += 6;
    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'Hub', 'Team Member', 'Site', 'Amount', 'Status', 'Paid']],
      body: filteredRequests.slice(0, 100).map(r => [
        format(parseISO(r.requestedAt), 'MMM dd'),
        (r.hubName || 'N/A').substring(0, 15),
        getProfileName(r.requestedBy).substring(0, 20),
        r.siteName.substring(0, 20),
        r.requestedAmount.toLocaleString(),
        r.status.replace(/_/g, ' '),
        (r.totalPaidAmount || 0).toLocaleString()
      ]),
      theme: 'striped',
      headStyles: { fillColor: [30, 64, 175], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
    });
    doc.save(`advance_by_hub_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  // Export By Status
  const exportStatusToExcel = () => {
    const summaryData: Record<string, string | number>[] = byStatus.map(s => ({
      'Status': s.name,
      'Total Requests': s.requests,
      'Total Requested (SDG)': s.totalRequested,
      'Total Approved (SDG)': s.totalApproved,
    }));
    const statusTotalsExcel = byStatus.reduce((acc, s) => ({
      requests: acc.requests + s.requests,
      totalRequested: acc.totalRequested + s.totalRequested,
      totalApproved: acc.totalApproved + s.totalApproved,
    }), { requests: 0, totalRequested: 0, totalApproved: 0 });
    summaryData.push({
      'Status': 'SUBTOTAL',
      'Total Requests': statusTotalsExcel.requests,
      'Total Requested (SDG)': statusTotalsExcel.totalRequested,
      'Total Approved (SDG)': statusTotalsExcel.totalApproved,
    });
    const detailData = filteredRequests.map(req => ({
      'Status': req.status.replace(/_/g, ' ').toUpperCase(),
      'Request Date': format(parseISO(req.requestedAt), 'yyyy-MM-dd'),
      'Requested By': getProfileName(req.requestedBy),
      'Site': req.siteName,
      'Hub': req.hubName || 'N/A',
      'Amount (SDG)': req.requestedAmount,
      'Paid (SDG)': req.totalPaidAmount || 0,
      'Remaining (SDG)': req.remainingAmount || 0,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Summary by Status');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailData), 'All Requests');
    XLSX.writeFile(wb, `advance_by_status_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const exportStatusToPDF = () => {
    const doc = new jsPDF();
    let yPos = addPdfHeader(doc, 'Advance Requests by Status');
    const statusTotals = byStatus.reduce((acc, s) => ({
      requests: acc.requests + s.requests,
      totalRequested: acc.totalRequested + s.totalRequested,
      totalApproved: acc.totalApproved + s.totalApproved,
    }), { requests: 0, totalRequested: 0, totalApproved: 0 });
    autoTable(doc, {
      startY: yPos,
      head: [['Status', 'Requests', 'Requested (SDG)', 'Approved (SDG)']],
      body: byStatus.map(s => [s.name, s.requests, s.totalRequested.toLocaleString(), s.totalApproved.toLocaleString()]),
      foot: [['SUBTOTAL', statusTotals.requests.toString(), statusTotals.totalRequested.toLocaleString(), statusTotals.totalApproved.toLocaleString()]],
      theme: 'striped',
      headStyles: { fillColor: [30, 64, 175], fontSize: 11, fontStyle: 'bold' },
      bodyStyles: { fontSize: 10 },
      footStyles: { fillColor: [230, 235, 245], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 11 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Detailed Requests', 14, yPos);
    yPos += 6;
    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'Status', 'Team Member', 'Site', 'Amount', 'Paid']],
      body: filteredRequests.slice(0, 100).map(r => [
        format(parseISO(r.requestedAt), 'MMM dd'),
        r.status.replace(/_/g, ' '),
        getProfileName(r.requestedBy).substring(0, 20),
        r.siteName.substring(0, 20),
        r.requestedAmount.toLocaleString(),
        (r.totalPaidAmount || 0).toLocaleString()
      ]),
      theme: 'striped',
      headStyles: { fillColor: [30, 64, 175], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
    });
    doc.save(`advance_by_status_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  // Export By State
  const exportStateToExcel = () => {
    const summaryData: Record<string, string | number>[] = byState.map(s => ({
      'State': s.name,
      'Total Requests': s.requests,
      'Total Requested (SDG)': s.totalRequested,
      'Total Approved (SDG)': s.totalApproved,
      'Pending': s.pending,
    }));
    const stateTotalsExcel = byState.reduce((acc, s) => ({
      requests: acc.requests + s.requests,
      totalRequested: acc.totalRequested + s.totalRequested,
      totalApproved: acc.totalApproved + s.totalApproved,
      pending: acc.pending + s.pending,
    }), { requests: 0, totalRequested: 0, totalApproved: 0, pending: 0 });
    summaryData.push({
      'State': 'SUBTOTAL',
      'Total Requests': stateTotalsExcel.requests,
      'Total Requested (SDG)': stateTotalsExcel.totalRequested,
      'Total Approved (SDG)': stateTotalsExcel.totalApproved,
      'Pending': stateTotalsExcel.pending,
    });
    const detailData = filteredRequests.map(req => ({
      'State': req.stateName || 'Unknown',
      'Request Date': format(parseISO(req.requestedAt), 'yyyy-MM-dd'),
      'Requested By': getProfileName(req.requestedBy),
      'Site': req.siteName,
      'Hub': req.hubName || 'N/A',
      'Amount (SDG)': req.requestedAmount,
      'Status': req.status.replace(/_/g, ' ').toUpperCase(),
      'Paid (SDG)': req.totalPaidAmount || 0,
      'Remaining (SDG)': req.remainingAmount || 0,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Summary by State');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailData), 'All Requests');
    XLSX.writeFile(wb, `advance_by_state_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const exportStateToPDF = () => {
    const doc = new jsPDF();
    let yPos = addPdfHeader(doc, 'Advance Requests by State');
    const stateTotals = byState.reduce((acc, s) => ({
      requests: acc.requests + s.requests,
      totalRequested: acc.totalRequested + s.totalRequested,
      totalApproved: acc.totalApproved + s.totalApproved,
      pending: acc.pending + s.pending,
    }), { requests: 0, totalRequested: 0, totalApproved: 0, pending: 0 });
    autoTable(doc, {
      startY: yPos,
      head: [['State', 'Requests', 'Requested (SDG)', 'Approved (SDG)', 'Pending']],
      body: byState.map(s => [s.name, s.requests, s.totalRequested.toLocaleString(), s.totalApproved.toLocaleString(), s.pending]),
      foot: [['SUBTOTAL', stateTotals.requests.toString(), stateTotals.totalRequested.toLocaleString(), stateTotals.totalApproved.toLocaleString(), stateTotals.pending.toString()]],
      theme: 'striped',
      headStyles: { fillColor: [30, 64, 175], fontSize: 11, fontStyle: 'bold' },
      bodyStyles: { fontSize: 10 },
      footStyles: { fillColor: [230, 235, 245], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 11 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Detailed Requests', 14, yPos);
    yPos += 6;
    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'State', 'Team Member', 'Site', 'Hub', 'Amount', 'Status', 'Paid']],
      body: filteredRequests.slice(0, 100).map(r => [
        format(parseISO(r.requestedAt), 'MMM dd'),
        (r.stateName || 'Unknown').substring(0, 15),
        getProfileName(r.requestedBy).substring(0, 20),
        r.siteName.substring(0, 20),
        (r.hubName || 'N/A').substring(0, 10),
        r.requestedAmount.toLocaleString(),
        r.status.replace(/_/g, ' '),
        (r.totalPaidAmount || 0).toLocaleString()
      ]),
      theme: 'striped',
      headStyles: { fillColor: [30, 64, 175], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
    });
    doc.save(`advance_by_state_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  // Export By Project
  const exportProjectToExcel = () => {
    const summaryData: Record<string, string | number>[] = byProject.map(p => ({
      'Project': p.name,
      'Total Requests': p.requests,
      'Total Requested (SDG)': p.totalRequested,
      'Total Approved (SDG)': p.totalApproved,
      'Pending': p.pending,
    }));
    const projectTotalsExcel = byProject.reduce((acc, p) => ({
      requests: acc.requests + p.requests,
      totalRequested: acc.totalRequested + p.totalRequested,
      totalApproved: acc.totalApproved + p.totalApproved,
      pending: acc.pending + p.pending,
    }), { requests: 0, totalRequested: 0, totalApproved: 0, pending: 0 });
    summaryData.push({
      'Project': 'SUBTOTAL',
      'Total Requests': projectTotalsExcel.requests,
      'Total Requested (SDG)': projectTotalsExcel.totalRequested,
      'Total Approved (SDG)': projectTotalsExcel.totalApproved,
      'Pending': projectTotalsExcel.pending,
    });
    const detailData = filteredRequests.map(req => ({
      'Project': req.projectName || 'Unknown',
      'Request Date': format(parseISO(req.requestedAt), 'yyyy-MM-dd'),
      'Requested By': getProfileName(req.requestedBy),
      'Site': req.siteName,
      'Hub': req.hubName || 'N/A',
      'Amount (SDG)': req.requestedAmount,
      'Status': req.status.replace(/_/g, ' ').toUpperCase(),
      'Paid (SDG)': req.totalPaidAmount || 0,
      'Remaining (SDG)': req.remainingAmount || 0,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Summary by Project');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailData), 'All Requests');
    XLSX.writeFile(wb, `advance_by_project_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const exportProjectToPDF = () => {
    const doc = new jsPDF();
    let yPos = addPdfHeader(doc, 'Advance Requests by Project');
    const projectTotals = byProject.reduce((acc, p) => ({
      requests: acc.requests + p.requests,
      totalRequested: acc.totalRequested + p.totalRequested,
      totalApproved: acc.totalApproved + p.totalApproved,
      pending: acc.pending + p.pending,
    }), { requests: 0, totalRequested: 0, totalApproved: 0, pending: 0 });
    autoTable(doc, {
      startY: yPos,
      head: [['Project', 'Requests', 'Requested (SDG)', 'Approved (SDG)', 'Pending']],
      body: byProject.map(p => [p.name, p.requests, p.totalRequested.toLocaleString(), p.totalApproved.toLocaleString(), p.pending]),
      foot: [['SUBTOTAL', projectTotals.requests.toString(), projectTotals.totalRequested.toLocaleString(), projectTotals.totalApproved.toLocaleString(), projectTotals.pending.toString()]],
      theme: 'striped',
      headStyles: { fillColor: [30, 64, 175], fontSize: 11, fontStyle: 'bold' },
      bodyStyles: { fontSize: 10 },
      footStyles: { fillColor: [230, 235, 245], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 11 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Detailed Requests', 14, yPos);
    yPos += 6;
    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'Project', 'Team Member', 'Site', 'Hub', 'Amount', 'Status', 'Paid']],
      body: filteredRequests.slice(0, 100).map(r => [
        format(parseISO(r.requestedAt), 'MMM dd'),
        (r.projectName || 'Unknown').substring(0, 15),
        getProfileName(r.requestedBy).substring(0, 20),
        r.siteName.substring(0, 20),
        (r.hubName || 'N/A').substring(0, 10),
        r.requestedAmount.toLocaleString(),
        r.status.replace(/_/g, ' '),
        (r.totalPaidAmount || 0).toLocaleString()
      ]),
      theme: 'striped',
      headStyles: { fillColor: [30, 64, 175], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
    });
    doc.save(`advance_by_project_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  if (!isAdmin && !isSupervisor && !isFOM) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <AlertTriangle className="h-12 w-12 text-destructive" />
              <h2 className="text-xl font-semibold">Access Denied</h2>
              <p className="text-muted-foreground max-w-md">
                You don't have permission to access advance request reports.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)} data-testid="button-back">
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <img src="/pact-logo.png" alt="PACT" className="h-12 w-auto" />
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Truck className="h-6 w-6 text-primary" />
                  Transportation Advance Cost
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                  Track and analyze transportation advance costs from your team
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" asChild data-testid="button-request-advance">
                <Link to="/site-visits?status=accepted">
                  <Plus className="h-4 w-4 mr-1" />
                  Request Advance
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild data-testid="button-goto-reconciliation">
                <Link to="/cost-submission?tab=outstanding">
                  <Receipt className="h-4 w-4 mr-1" />
                  Cost Submission
                </Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => refreshRequests()} data-testid="button-refresh-report">
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <PageInfoBanner
        title="Transport Advance Report - Outstanding & Reconciled"
        description="This page shows REPORTS on all transportation advance (down-payment) requests. Track which advances are still outstanding (not yet deducted), which have been reconciled (automatically deducted when work was completed), and total advance costs by hub, project, or time period. This is a REPORTING page only -- to request or approve advances, use the Down-Payment Approval page. This is DIFFERENT from the Wallet Reports page, which tracks wallet withdrawals (earned money going out)."
        descriptionAr="تعرض هذه الصفحة تقارير عن جميع طلبات السلف المسبقة للنقل (الدفعات المقدمة). تتبّع السلف التي لا تزال معلقة (لم تُخصم بعد)، والتي تمت تسويتها (خُصمت تلقائياً عند إنجاز العمل)، وإجمالي تكاليف السلف حسب المحور أو المشروع أو الفترة الزمنية. هذه صفحة تقارير فقط -- لطلب أو الموافقة على السلف، استخدم صفحة الموافقة على الدفعات المقدمة. هذه الصفحة مختلفة عن صفحة تقارير المحفظة التي تتتبع عمليات سحب المحفظة (أموال مكتسبة يتم سحبها)."
        workflowSteps={[
          { step: 1, role: 'Data Collector', action: 'Requested advance', description: 'Staff requested upfront money for transportation on the Down-Payment Approval page.' },
          { step: 2, role: 'Supervisor & Admin', action: 'Approved advance', description: 'The advance was approved through the Tier 1 and Tier 2 process on the Down-Payment Approval page.' },
          { step: 3, role: 'Finance Admin', action: 'Sent payment', description: 'Finance sent the advance money to the staff member.' },
          { step: 4, role: 'System', action: 'Reconciles automatically', description: 'When work is completed and fees are credited, advances are auto-deducted. This report tracks that status.' },
        ]}
        workflowStepsAr={[
          { step: 1, role: 'جامع بيانات', action: 'طلب سلفة', description: 'طلب الموظف أموالاً مقدمة للنقل في صفحة الموافقة على الدفعات المقدمة.' },
          { step: 2, role: 'المشرف والمدير', action: 'وافقوا على السلفة', description: 'تمت الموافقة على السلفة عبر عملية المستوى الأول والثاني في صفحة الموافقة على الدفعات المقدمة.' },
          { step: 3, role: 'مدير المالية', action: 'أرسل الدفعة', description: 'قام قسم المالية بإرسال مبلغ السلفة للموظف.' },
          { step: 4, role: 'النظام', action: 'يُسوّي تلقائياً', description: 'عند اكتمال العمل وإضافة الأتعاب، تُخصم السلف تلقائياً. يتتبع هذا التقرير تلك الحالة.' },
        ]}
      />

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by site, user, or hub..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="pl-9"
            data-testid="input-search-requests"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
            <SelectValue placeholder="Status" />
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
        <Select value={hubFilter} onValueChange={(v) => { setHubFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-[180px]" data-testid="select-hub-filter">
            <SelectValue placeholder="Hub" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Hubs</SelectItem>
            {uniqueHubs.map(hub => (
              <SelectItem key={hub.id} value={hub.id}>{hub.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={dateFilter} onValueChange={(v) => { setDateFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-[180px]" data-testid="select-date-filter">
            <SelectValue placeholder="Date Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="thisMonth">This Month</SelectItem>
            <SelectItem value="lastMonth">Last Month</SelectItem>
            <SelectItem value="last3Months">Last 3 Months</SelectItem>
          </SelectContent>
        </Select>
        <Select value={paidFilter} onValueChange={(v) => { setPaidFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-[150px]" data-testid="select-paid-filter">
            <SelectValue placeholder="Payment Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payments</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="not_paid">Not Paid</SelectItem>
          </SelectContent>
        </Select>
        <Select value={reconciledFilter} onValueChange={(v) => { setReconciledFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-[150px]" data-testid="select-reconciled-filter">
            <SelectValue placeholder="Reconciliation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="reconciled">Reconciled</SelectItem>
            <SelectItem value="not_reconciled">Not Reconciled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Requested</p>
                <p className="text-2xl font-bold">{loading ? <Skeleton className="h-8 w-24" /> : `SDG ${stats.totalRequested.toLocaleString()}`}</p>
                <p className="text-xs text-muted-foreground">{stats.totalCount} requests</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Approved</p>
                <p className="text-2xl font-bold text-green-600">{loading ? <Skeleton className="h-8 w-24" /> : `SDG ${stats.totalApproved.toLocaleString()}`}</p>
                <p className="text-xs text-muted-foreground">{stats.approvedCount} requests</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-amber-600">{loading ? <Skeleton className="h-8 w-24" /> : `SDG ${stats.totalPending.toLocaleString()}`}</p>
                <p className="text-xs text-muted-foreground">{stats.pendingCount} requests</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Rejected</p>
                <p className="text-2xl font-bold text-red-600">{loading ? <Skeleton className="h-8 w-24" /> : `SDG ${stats.totalRejected.toLocaleString()}`}</p>
                <p className="text-xs text-muted-foreground">{stats.rejectedCount} requests</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Paid</p>
                <p className="text-2xl font-bold text-blue-600">{loading ? <Skeleton className="h-8 w-24" /> : `SDG ${stats.totalPaid.toLocaleString()}`}</p>
                <p className="text-xs text-muted-foreground">{stats.paidCount} payments made</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Banknote className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200 bg-purple-50/50 dark:bg-purple-950/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Remaining Balance</p>
                <p className="text-2xl font-bold text-purple-600">{loading ? <Skeleton className="h-8 w-24" /> : `SDG ${stats.remainingBalance.toLocaleString()}`}</p>
                <p className="text-xs text-muted-foreground">Outstanding amount</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Payment Rate</p>
                <p className="text-2xl font-bold text-emerald-600">{loading ? <Skeleton className="h-8 w-24" /> : `${stats.totalApproved > 0 ? Math.round((stats.totalPaid / stats.totalApproved) * 100) : 0}%`}</p>
                <p className="text-xs text-muted-foreground">Of approved amount paid</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <PieChart className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setCurrentPage(1); }} className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview" className="gap-1" data-testid="tab-overview">
            <FileSpreadsheet className="h-4 w-4" />
            All Requests
          </TabsTrigger>
          <TabsTrigger value="byTeam" className="gap-1" data-testid="tab-by-team">
            <Users className="h-4 w-4" />
            By Team Member
          </TabsTrigger>
          <TabsTrigger value="byHub" className="gap-1" data-testid="tab-by-hub">
            <Building2 className="h-4 w-4" />
            By Hub
          </TabsTrigger>
          <TabsTrigger value="byStatus" className="gap-1" data-testid="tab-by-status">
            <Clock className="h-4 w-4" />
            By Status
          </TabsTrigger>
          <TabsTrigger value="byState" className="gap-1" data-testid="tab-by-state">
            <MapPin className="h-4 w-4" />
            By State
          </TabsTrigger>
          <TabsTrigger value="byProject" className="gap-1" data-testid="tab-by-project">
            <FolderKanban className="h-4 w-4" />
            By Project
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {isAdmin && approvedForPayment.length > 0 && (
            <Card>
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Bulk Payment Request / طلب دفع جماعي
                </CardTitle>
                <CardDescription className="text-xs">Send payment request for multiple approved advances grouped by category.</CardDescription>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                  {bulkUniqueStates.length > 0 && (
                    <Select onValueChange={(val) => {
                      const reqs = approvedForPayment.filter(r => r.stateName === val);
                      if (reqs.length > 0) openBulkPaymentRequestDialog(reqs, 'State', val);
                    }}>
                      <SelectTrigger data-testid="select-report-bulk-state"><SelectValue placeholder="By State" /></SelectTrigger>
                      <SelectContent>
                        {bulkUniqueStates.map(s => {
                          const count = approvedForPayment.filter(r => r.stateName === s).length;
                          return <SelectItem key={s} value={s!}>{s} ({count})</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  )}
                  {bulkUniqueHubs.length > 0 && (
                    <Select onValueChange={(val) => {
                      const reqs = approvedForPayment.filter(r => r.hubName === val);
                      if (reqs.length > 0) openBulkPaymentRequestDialog(reqs, 'Hub', val);
                    }}>
                      <SelectTrigger data-testid="select-report-bulk-hub"><SelectValue placeholder="By Hub" /></SelectTrigger>
                      <SelectContent>
                        {bulkUniqueHubs.map(h => {
                          const count = approvedForPayment.filter(r => r.hubName === h).length;
                          return <SelectItem key={h} value={h!}>{h} ({count})</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  )}
                  {bulkUniqueLocalities.length > 0 && (
                    <Select onValueChange={(val) => {
                      const reqs = approvedForPayment.filter(r => r.localityName === val);
                      if (reqs.length > 0) openBulkPaymentRequestDialog(reqs, 'Locality', val);
                    }}>
                      <SelectTrigger data-testid="select-report-bulk-locality"><SelectValue placeholder="By Locality" /></SelectTrigger>
                      <SelectContent>
                        {bulkUniqueLocalities.map(l => {
                          const count = approvedForPayment.filter(r => r.localityName === l).length;
                          return <SelectItem key={l} value={l!}>{l} ({count})</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  )}
                  {bulkUniqueSupervisors.length > 0 && (
                    <Select onValueChange={(val) => {
                      const reqs = approvedForPayment.filter(r => r.supervisorApprovedBy === val);
                      if (reqs.length > 0) {
                        const sup = bulkUniqueSupervisors.find(s => s.id === val);
                        openBulkPaymentRequestDialog(reqs, 'Supervisor', sup?.name || val);
                      }
                    }}>
                      <SelectTrigger data-testid="select-report-bulk-supervisor"><SelectValue placeholder="By Supervisor" /></SelectTrigger>
                      <SelectContent>
                        {bulkUniqueSupervisors.map(s => {
                          const count = approvedForPayment.filter(r => r.supervisorApprovedBy === s.id).length;
                          return <SelectItem key={s.id} value={s.id}>{s.name} ({count})</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  )}
                  {bulkUniqueSites.length > 0 && (
                    <Select onValueChange={(val) => {
                      const reqs = approvedForPayment.filter(r => r.siteName === val);
                      if (reqs.length > 0) openBulkPaymentRequestDialog(reqs, 'Site', val);
                    }}>
                      <SelectTrigger data-testid="select-report-bulk-site"><SelectValue placeholder="By Site" /></SelectTrigger>
                      <SelectContent>
                        {bulkUniqueSites.map(s => {
                          const count = approvedForPayment.filter(r => r.siteName === s).length;
                          return <SelectItem key={s} value={s!}>{s} ({count})</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => openBulkPaymentRequestDialog(approvedForPayment, '', 'All Approved')} data-testid="button-report-bulk-request-all">
                    <Mail className="h-3.5 w-3.5 mr-1" />
                    Request All ({approvedForPayment.length})
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Total: SDG {approvedForPayment.reduce((s, r) => s + (r.approvedAmount || r.requestedAmount), 0).toLocaleString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3">
                  {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="p-12 text-center">
                  <DollarSign className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
                  <p className="mt-4 text-muted-foreground">No advance requests found matching your filters</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Requested By</TableHead>
                        <TableHead>Site</TableHead>
                        <TableHead>Hub</TableHead>
                        <TableHead className="text-right">Amount (SDG)</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Remaining</TableHead>
                        <TableHead className="text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedRequests.map(req => {
                        const remaining = req.remainingAmount || (req.requestedAmount - (req.totalPaidAmount || 0));
                        const needsReconciliation = ['approved', 'partially_paid', 'fully_paid'].includes(req.status) && remaining > 0;
                        return (
                          <TableRow key={req.id} data-testid={`row-request-${req.id}`}>
                            <TableCell className="text-sm">{format(parseISO(req.requestedAt), 'MMM dd, yyyy')}</TableCell>
                            <TableCell className="font-medium">{getProfileName(req.requestedBy)}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{req.siteName}</TableCell>
                            <TableCell>{req.hubName || 'N/A'}</TableCell>
                            <TableCell className="text-right font-mono">{req.requestedAmount.toLocaleString()}</TableCell>
                            <TableCell>{getStatusBadge(req.status)}</TableCell>
                            <TableCell className="text-right font-mono text-green-600">{(req.totalPaidAmount || 0).toLocaleString()}</TableCell>
                            <TableCell className="text-right font-mono">
                              {remaining > 0 ? (
                                <span className="text-amber-600">{remaining.toLocaleString()}</span>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                {needsReconciliation && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs gap-1"
                                    onClick={() => navigate('/cost-submission?tab=reconciliation')}
                                    data-testid={`button-reconcile-${req.id}`}
                                  >
                                    <Receipt className="h-3 w-3" />
                                    Reconcile
                                  </Button>
                                )}
                                {['approved', 'partially_paid', 'fully_paid'].includes(req.status) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs gap-1"
                                    onClick={() => handleDownloadCertificate(req)}
                                    data-testid={`button-download-cert-${req.id}`}
                                  >
                                    <Download className="h-3 w-3" />
                                    PDF
                                  </Button>
                                )}
                                {isAdmin && ['approved', 'partially_paid', 'fully_paid'].includes(req.status) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs gap-1"
                                    onClick={() => openPaymentRequestDialog(req)}
                                    data-testid={`button-request-payment-${req.id}`}
                                  >
                                    <Mail className="h-3 w-3" />
                                    Request Payment
                                  </Button>
                                )}
                                {isAdmin && req.status === 'approved' && (
                                  <Button
                                    size="sm"
                                    variant="default"
                                    className="h-7 text-xs gap-1"
                                    onClick={() => handleMarkAsPaid(req)}
                                    disabled={markPaidProcessing}
                                    data-testid={`button-mark-paid-${req.id}`}
                                  >
                                    <WalletIcon className="h-3 w-3" />
                                    Mark Paid
                                  </Button>
                                )}
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => navigate('/down-payment-approval')}
                                  data-testid={`button-view-${req.id}`}
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                              </div>
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
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 px-2">
              <p className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * PAGE_SIZE) + 1}-{Math.min(currentPage * PAGE_SIZE, filteredRequests.length)} of {filteredRequests.length} requests
              </p>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage(1)} data-testid="button-first-page">
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} data-testid="button-prev-page">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm px-3 font-medium">Page {currentPage} of {totalPages}</span>
                <Button size="icon" variant="outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} data-testid="button-next-page">
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)} data-testid="button-last-page">
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="byTeam" className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={exportTeamToPDF} data-testid="button-team-pdf">
              <FileText className="h-4 w-4 mr-1" />
              PDF
            </Button>
            <Button size="sm" onClick={exportTeamToExcel} data-testid="button-team-excel">
              <Download className="h-4 w-4 mr-1" />
              Excel
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Summary by Team Member
              </CardTitle>
              <CardDescription>Breakdown of advance requests per team member</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : byTeamMember.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">No data available</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Team Member</TableHead>
                        <TableHead className="text-right">Requests</TableHead>
                        <TableHead className="text-right">Total Requested (SDG)</TableHead>
                        <TableHead className="text-right">Total Approved (SDG)</TableHead>
                        <TableHead className="text-right">Pending</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {byTeamMember.map((member, idx) => (
                        <Fragment key={member.id}>
                          <TableRow data-testid={`row-team-${idx}`} className="cursor-pointer hover:bg-muted/50" onClick={() => setExpandedMember(expandedMember === member.id ? null : member.id)}>
                            <TableCell className="font-medium">
                              <button className="flex items-center gap-2 text-left text-primary hover:underline" data-testid={`button-expand-member-${idx}`}>
                                <ChevronRight className={`w-4 h-4 transition-transform ${expandedMember === member.id ? 'rotate-90' : ''}`} />
                                {member.name}
                              </button>
                            </TableCell>
                            <TableCell className="text-right">{member.requests}</TableCell>
                            <TableCell className="text-right font-mono">{member.totalRequested.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-mono text-green-600">{member.totalApproved.toLocaleString()}</TableCell>
                            <TableCell className="text-right">
                              {member.pending > 0 && <Badge variant="outline" className="border-amber-500 text-amber-600">{member.pending}</Badge>}
                            </TableCell>
                          </TableRow>
                          {expandedMember === member.id && (
                            <TableRow key={`${idx}-detail`}>
                              <TableCell colSpan={5} className="p-0 bg-muted/30">
                                <div className="p-4">
                                  <p className="text-sm font-semibold mb-3 text-muted-foreground">Requests by {member.name}</p>
                                  <div className="overflow-x-auto rounded-lg border">
                                    <Table>
                                      <TableHeader>
                                        <TableRow className="bg-muted/40">
                                          <TableHead className="text-xs">Date</TableHead>
                                          <TableHead className="text-xs">Site</TableHead>
                                          <TableHead className="text-xs">Hub</TableHead>
                                          <TableHead className="text-xs text-right">Amount (SDG)</TableHead>
                                          <TableHead className="text-xs">Status</TableHead>
                                          <TableHead className="text-xs text-right">Paid</TableHead>
                                          <TableHead className="text-xs text-right">Remaining</TableHead>
                                          <TableHead className="text-xs text-center">Actions</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {member.items.map(req => {
                                          const remaining = req.remainingAmount || (req.requestedAmount - (req.totalPaidAmount || 0));
                                          return (
                                            <TableRow key={req.id} data-testid={`row-member-detail-${req.id}`}>
                                              <TableCell className="text-xs whitespace-nowrap">{format(parseISO(req.createdAt), 'MMM dd, yyyy')}</TableCell>
                                              <TableCell className="text-xs max-w-[150px] truncate">{req.siteName}</TableCell>
                                              <TableCell className="text-xs">{req.hubName}</TableCell>
                                              <TableCell className="text-xs text-right font-mono">{req.requestedAmount.toLocaleString()}</TableCell>
                                              <TableCell className="text-xs">{getStatusBadge(req.status)}</TableCell>
                                              <TableCell className="text-xs text-right font-mono">{(req.totalPaidAmount || 0).toLocaleString()}</TableCell>
                                              <TableCell className="text-xs text-right font-mono">{remaining > 0 ? remaining.toLocaleString() : '—'}</TableCell>
                                              <TableCell className="text-center">
                                                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); navigate(`/down-payment-approval`); }} data-testid={`button-view-request-${req.id}`}>
                                                  <ExternalLink className="w-3.5 h-3.5" />
                                                </Button>
                                              </TableCell>
                                            </TableRow>
                                          );
                                        })}
                                        <TableRow className="bg-muted/40 font-semibold border-t">
                                          <TableCell colSpan={3} className="text-xs">Subtotal ({member.items.length} requests)</TableCell>
                                          <TableCell className="text-xs text-right font-mono">{member.totalRequested.toLocaleString()}</TableCell>
                                          <TableCell />
                                          <TableCell className="text-xs text-right font-mono">{member.items.reduce((s, r) => s + (r.totalPaidAmount || 0), 0).toLocaleString()}</TableCell>
                                          <TableCell className="text-xs text-right font-mono">{member.items.reduce((s, r) => s + (r.remainingAmount || (r.requestedAmount - (r.totalPaidAmount || 0))), 0).toLocaleString()}</TableCell>
                                          <TableCell />
                                        </TableRow>
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      ))}
                    </TableBody>
                    <tfoot>
                      <TableRow className="bg-muted/50 font-bold border-t-2">
                        <TableCell className="font-bold">Subtotal</TableCell>
                        <TableCell className="text-right font-bold">{byTeamMember.reduce((sum, m) => sum + m.requests, 0)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{byTeamMember.reduce((sum, m) => sum + m.totalRequested, 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-green-600">{byTeamMember.reduce((sum, m) => sum + m.totalApproved, 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right font-bold">{byTeamMember.reduce((sum, m) => sum + m.pending, 0)}</TableCell>
                      </TableRow>
                    </tfoot>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">All Requests (Detailed)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Team Member</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>Hub</TableHead>
                      <TableHead className="text-right">Amount (SDG)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Remaining</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRequests.map(req => {
                      const remaining = req.remainingAmount || (req.requestedAmount - (req.totalPaidAmount || 0));
                      return (
                        <TableRow key={req.id}>
                          <TableCell className="text-sm">{format(parseISO(req.requestedAt), 'MMM dd, yyyy')}</TableCell>
                          <TableCell className="font-medium">{getProfileName(req.requestedBy)}</TableCell>
                          <TableCell className="max-w-[180px] truncate">{req.siteName}</TableCell>
                          <TableCell>{req.hubName || 'N/A'}</TableCell>
                          <TableCell className="text-right font-mono">{req.requestedAmount.toLocaleString()}</TableCell>
                          <TableCell>{getStatusBadge(req.status)}</TableCell>
                          <TableCell className="text-right font-mono text-green-600">{(req.totalPaidAmount || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono">{remaining > 0 ? <span className="text-amber-600">{remaining.toLocaleString()}</span> : '0'}</TableCell>
                          <TableCell className="text-center">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigate('/down-payment-approval')}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 px-2">
              <p className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * PAGE_SIZE) + 1}-{Math.min(currentPage * PAGE_SIZE, filteredRequests.length)} of {filteredRequests.length}
              </p>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage(1)}><ChevronsLeft className="h-4 w-4" /></Button>
                <Button size="icon" variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="text-sm px-3 font-medium">Page {currentPage} / {totalPages}</span>
                <Button size="icon" variant="outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
                <Button size="icon" variant="outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}><ChevronsRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="byHub" className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={exportHubToPDF} data-testid="button-hub-pdf">
              <FileText className="h-4 w-4 mr-1" />
              PDF
            </Button>
            <Button size="sm" onClick={exportHubToExcel} data-testid="button-hub-excel">
              <Download className="h-4 w-4 mr-1" />
              Excel
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Summary by Hub
              </CardTitle>
              <CardDescription>Breakdown of advance requests per hub/location</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : byHub.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">No data available</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hub</TableHead>
                        <TableHead className="text-right">Requests</TableHead>
                        <TableHead className="text-right">Total Requested (SDG)</TableHead>
                        <TableHead className="text-right">Total Approved (SDG)</TableHead>
                        <TableHead className="text-right">Pending</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {byHub.map((hub, idx) => (
                        <TableRow key={idx} data-testid={`row-hub-${idx}`}>
                          <TableCell className="font-medium">{hub.name}</TableCell>
                          <TableCell className="text-right">{hub.requests}</TableCell>
                          <TableCell className="text-right font-mono">{hub.totalRequested.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-green-600">{hub.totalApproved.toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            {hub.pending > 0 && <Badge variant="outline" className="border-amber-500 text-amber-600">{hub.pending}</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <tfoot>
                      <TableRow className="bg-muted/50 font-bold border-t-2">
                        <TableCell className="font-bold">Subtotal</TableCell>
                        <TableCell className="text-right font-bold">{byHub.reduce((sum, h) => sum + h.requests, 0)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{byHub.reduce((sum, h) => sum + h.totalRequested, 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-green-600">{byHub.reduce((sum, h) => sum + h.totalApproved, 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right font-bold">{byHub.reduce((sum, h) => sum + h.pending, 0)}</TableCell>
                      </TableRow>
                    </tfoot>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">All Requests (Detailed)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Hub</TableHead>
                      <TableHead>Team Member</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead className="text-right">Amount (SDG)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Remaining</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRequests.map(req => {
                      const remaining = req.remainingAmount || (req.requestedAmount - (req.totalPaidAmount || 0));
                      return (
                        <TableRow key={req.id}>
                          <TableCell className="text-sm">{format(parseISO(req.requestedAt), 'MMM dd, yyyy')}</TableCell>
                          <TableCell className="font-medium">{req.hubName || 'N/A'}</TableCell>
                          <TableCell>{getProfileName(req.requestedBy)}</TableCell>
                          <TableCell className="max-w-[180px] truncate">{req.siteName}</TableCell>
                          <TableCell className="text-right font-mono">{req.requestedAmount.toLocaleString()}</TableCell>
                          <TableCell>{getStatusBadge(req.status)}</TableCell>
                          <TableCell className="text-right font-mono text-green-600">{(req.totalPaidAmount || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono">{remaining > 0 ? <span className="text-amber-600">{remaining.toLocaleString()}</span> : '0'}</TableCell>
                          <TableCell className="text-center">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigate('/down-payment-approval')}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 px-2">
              <p className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * PAGE_SIZE) + 1}-{Math.min(currentPage * PAGE_SIZE, filteredRequests.length)} of {filteredRequests.length}
              </p>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage(1)}><ChevronsLeft className="h-4 w-4" /></Button>
                <Button size="icon" variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="text-sm px-3 font-medium">Page {currentPage} / {totalPages}</span>
                <Button size="icon" variant="outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
                <Button size="icon" variant="outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}><ChevronsRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="byStatus" className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={exportStatusToPDF} data-testid="button-status-pdf">
              <FileText className="h-4 w-4 mr-1" />
              PDF
            </Button>
            <Button size="sm" onClick={exportStatusToExcel} data-testid="button-status-excel">
              <Download className="h-4 w-4 mr-1" />
              Excel
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Summary by Status
              </CardTitle>
              <CardDescription>Breakdown of advance requests by approval status</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : byStatus.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">No data available</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Requests</TableHead>
                        <TableHead className="text-right">Total Requested (SDG)</TableHead>
                        <TableHead className="text-right">Total Approved (SDG)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {byStatus.map((status, idx) => (
                        <TableRow key={idx} data-testid={`row-status-${idx}`}>
                          <TableCell className="font-medium">{status.name}</TableCell>
                          <TableCell className="text-right">{status.requests}</TableCell>
                          <TableCell className="text-right font-mono">{status.totalRequested.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-green-600">{status.totalApproved.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <tfoot>
                      <TableRow className="bg-muted/50 font-bold border-t-2">
                        <TableCell className="font-bold">Subtotal</TableCell>
                        <TableCell className="text-right font-bold">{byStatus.reduce((sum, s) => sum + s.requests, 0)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{byStatus.reduce((sum, s) => sum + s.totalRequested, 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-green-600">{byStatus.reduce((sum, s) => sum + s.totalApproved, 0).toLocaleString()}</TableCell>
                      </TableRow>
                    </tfoot>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">All Requests (Detailed)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Team Member</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>Hub</TableHead>
                      <TableHead className="text-right">Amount (SDG)</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Remaining</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRequests.map(req => {
                      const remaining = req.remainingAmount || (req.requestedAmount - (req.totalPaidAmount || 0));
                      return (
                        <TableRow key={req.id}>
                          <TableCell className="text-sm">{format(parseISO(req.requestedAt), 'MMM dd, yyyy')}</TableCell>
                          <TableCell>{getStatusBadge(req.status)}</TableCell>
                          <TableCell className="font-medium">{getProfileName(req.requestedBy)}</TableCell>
                          <TableCell className="max-w-[180px] truncate">{req.siteName}</TableCell>
                          <TableCell>{req.hubName || 'N/A'}</TableCell>
                          <TableCell className="text-right font-mono">{req.requestedAmount.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-green-600">{(req.totalPaidAmount || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono">{remaining > 0 ? <span className="text-amber-600">{remaining.toLocaleString()}</span> : '0'}</TableCell>
                          <TableCell className="text-center">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigate('/down-payment-approval')}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 px-2">
              <p className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * PAGE_SIZE) + 1}-{Math.min(currentPage * PAGE_SIZE, filteredRequests.length)} of {filteredRequests.length}
              </p>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage(1)}><ChevronsLeft className="h-4 w-4" /></Button>
                <Button size="icon" variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="text-sm px-3 font-medium">Page {currentPage} / {totalPages}</span>
                <Button size="icon" variant="outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
                <Button size="icon" variant="outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}><ChevronsRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="byState" className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={exportStateToPDF} data-testid="button-state-pdf">
              <FileText className="h-4 w-4 mr-1" />
              PDF
            </Button>
            <Button size="sm" onClick={exportStateToExcel} data-testid="button-state-excel">
              <Download className="h-4 w-4 mr-1" />
              Excel
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Summary by State
              </CardTitle>
              <CardDescription>Breakdown of advance requests per state/region</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : byState.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">No data available</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>State</TableHead>
                        <TableHead className="text-right">Requests</TableHead>
                        <TableHead className="text-right">Total Requested (SDG)</TableHead>
                        <TableHead className="text-right">Total Approved (SDG)</TableHead>
                        <TableHead className="text-right">Pending</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {byState.map((state, idx) => (
                        <TableRow key={idx} data-testid={`row-state-${idx}`}>
                          <TableCell className="font-medium">{state.name}</TableCell>
                          <TableCell className="text-right">{state.requests}</TableCell>
                          <TableCell className="text-right font-mono">{state.totalRequested.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-green-600">{state.totalApproved.toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            {state.pending > 0 && <Badge variant="outline" className="border-amber-500 text-amber-600">{state.pending}</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <tfoot>
                      <TableRow className="bg-muted/50 font-bold border-t-2">
                        <TableCell className="font-bold">Subtotal</TableCell>
                        <TableCell className="text-right font-bold">{byState.reduce((sum, s) => sum + s.requests, 0)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{byState.reduce((sum, s) => sum + s.totalRequested, 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-green-600">{byState.reduce((sum, s) => sum + s.totalApproved, 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right font-bold">{byState.reduce((sum, s) => sum + s.pending, 0)}</TableCell>
                      </TableRow>
                    </tfoot>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">All Requests (Detailed)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Team Member</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>Hub</TableHead>
                      <TableHead className="text-right">Amount (SDG)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Remaining</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRequests.map(req => {
                      const remaining = req.remainingAmount || (req.requestedAmount - (req.totalPaidAmount || 0));
                      return (
                        <TableRow key={req.id}>
                          <TableCell className="text-sm">{format(parseISO(req.requestedAt), 'MMM dd, yyyy')}</TableCell>
                          <TableCell className="font-medium">{req.stateName || 'Unknown'}</TableCell>
                          <TableCell>{getProfileName(req.requestedBy)}</TableCell>
                          <TableCell className="max-w-[180px] truncate">{req.siteName}</TableCell>
                          <TableCell>{req.hubName || 'N/A'}</TableCell>
                          <TableCell className="text-right font-mono">{req.requestedAmount.toLocaleString()}</TableCell>
                          <TableCell>{getStatusBadge(req.status)}</TableCell>
                          <TableCell className="text-right font-mono text-green-600">{(req.totalPaidAmount || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono">{remaining > 0 ? <span className="text-amber-600">{remaining.toLocaleString()}</span> : '0'}</TableCell>
                          <TableCell className="text-center">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigate('/down-payment-approval')}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 px-2">
              <p className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * PAGE_SIZE) + 1}-{Math.min(currentPage * PAGE_SIZE, filteredRequests.length)} of {filteredRequests.length}
              </p>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage(1)}><ChevronsLeft className="h-4 w-4" /></Button>
                <Button size="icon" variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="text-sm px-3 font-medium">Page {currentPage} / {totalPages}</span>
                <Button size="icon" variant="outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
                <Button size="icon" variant="outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}><ChevronsRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="byProject" className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={exportProjectToPDF} data-testid="button-project-pdf">
              <FileText className="h-4 w-4 mr-1" />
              PDF
            </Button>
            <Button size="sm" onClick={exportProjectToExcel} data-testid="button-project-excel">
              <Download className="h-4 w-4 mr-1" />
              Excel
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderKanban className="h-5 w-5" />
                Summary by Project
              </CardTitle>
              <CardDescription>Breakdown of advance requests per cooperating partner/project</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : byProject.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">No data available</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead className="text-right">Requests</TableHead>
                        <TableHead className="text-right">Total Requested (SDG)</TableHead>
                        <TableHead className="text-right">Total Approved (SDG)</TableHead>
                        <TableHead className="text-right">Pending</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {byProject.map((project, idx) => (
                        <TableRow key={idx} data-testid={`row-project-${idx}`}>
                          <TableCell className="font-medium">{project.name}</TableCell>
                          <TableCell className="text-right">{project.requests}</TableCell>
                          <TableCell className="text-right font-mono">{project.totalRequested.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-green-600">{project.totalApproved.toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            {project.pending > 0 && <Badge variant="outline" className="border-amber-500 text-amber-600">{project.pending}</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <tfoot>
                      <TableRow className="bg-muted/50 font-bold border-t-2">
                        <TableCell className="font-bold">Subtotal</TableCell>
                        <TableCell className="text-right font-bold">{byProject.reduce((sum, p) => sum + p.requests, 0)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{byProject.reduce((sum, p) => sum + p.totalRequested, 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-green-600">{byProject.reduce((sum, p) => sum + p.totalApproved, 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right font-bold">{byProject.reduce((sum, p) => sum + p.pending, 0)}</TableCell>
                      </TableRow>
                    </tfoot>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">All Requests (Detailed)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Team Member</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>Hub</TableHead>
                      <TableHead className="text-right">Amount (SDG)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Remaining</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRequests.map(req => {
                      const remaining = req.remainingAmount || (req.requestedAmount - (req.totalPaidAmount || 0));
                      return (
                        <TableRow key={req.id}>
                          <TableCell className="text-sm">{format(parseISO(req.requestedAt), 'MMM dd, yyyy')}</TableCell>
                          <TableCell className="font-medium">{req.projectName || 'Unknown'}</TableCell>
                          <TableCell>{getProfileName(req.requestedBy)}</TableCell>
                          <TableCell className="max-w-[180px] truncate">{req.siteName}</TableCell>
                          <TableCell>{req.hubName || 'N/A'}</TableCell>
                          <TableCell className="text-right font-mono">{req.requestedAmount.toLocaleString()}</TableCell>
                          <TableCell>{getStatusBadge(req.status)}</TableCell>
                          <TableCell className="text-right font-mono text-green-600">{(req.totalPaidAmount || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono">{remaining > 0 ? <span className="text-amber-600">{remaining.toLocaleString()}</span> : '0'}</TableCell>
                          <TableCell className="text-center">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigate('/down-payment-approval')}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 px-2">
              <p className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * PAGE_SIZE) + 1}-{Math.min(currentPage * PAGE_SIZE, filteredRequests.length)} of {filteredRequests.length}
              </p>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage(1)}><ChevronsLeft className="h-4 w-4" /></Button>
                <Button size="icon" variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="text-sm px-3 font-medium">Page {currentPage} / {totalPages}</span>
                <Button size="icon" variant="outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
                <Button size="icon" variant="outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}><ChevronsRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={paymentRequestDialog.open} onOpenChange={(open) => { if (!open) setPaymentRequestDialog({ open: false, request: null, isBulk: false, bulkRequests: [], bulkGroupBy: '', bulkGroupValue: '', availableRecipients: [], selectedRecipientIds: [], loading: false, sending: false }); }}>
        <DialogContent className={paymentRequestDialog.isBulk ? "max-w-2xl max-h-[90vh] overflow-y-auto" : "max-w-lg max-h-[90vh] overflow-y-auto"}>
          <DialogHeader>
            <DialogTitle>{paymentRequestDialog.isBulk ? 'Bulk Payment Request / طلب دفع جماعي' : 'Request Payment / طلب دفع'}</DialogTitle>
            <DialogDescription>
              {paymentRequestDialog.isBulk
                ? `Send bulk payment request for ${paymentRequestDialog.bulkRequests.length} approved advance(s) to finance team. PDF certificates will be attached.`
                : 'Send payment request email to finance team with the approval certificate attached.'}
            </DialogDescription>
          </DialogHeader>
          {paymentRequestDialog.loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {paymentRequestDialog.isBulk && paymentRequestDialog.bulkRequests.length > 0 && (
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
                        <p className="font-semibold">{paymentRequestDialog.bulkRequests.length}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total Amount</p>
                        <p className="font-semibold">SDG {paymentRequestDialog.bulkRequests.reduce((s, r) => s + (r.approvedAmount || r.requestedAmount), 0).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                  <ScrollArea className="h-[200px] border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs py-1.5">Requester</TableHead>
                          <TableHead className="text-xs py-1.5">Site</TableHead>
                          <TableHead className="text-xs py-1.5">Hub</TableHead>
                          <TableHead className="text-xs py-1.5">State</TableHead>
                          <TableHead className="text-xs py-1.5 text-right">Requested</TableHead>
                          <TableHead className="text-xs py-1.5 text-right">Approved</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paymentRequestDialog.bulkRequests.map(r => (
                          <TableRow key={r.id} className="text-xs">
                            <TableCell className="py-1.5 max-w-[120px] truncate">{getProfileName(r.requestedBy)}</TableCell>
                            <TableCell className="py-1.5 max-w-[100px] truncate">{r.siteName}</TableCell>
                            <TableCell className="py-1.5 max-w-[80px] truncate">{r.hubName || '-'}</TableCell>
                            <TableCell className="py-1.5 max-w-[80px] truncate">{r.stateName || '-'}</TableCell>
                            <TableCell className="py-1.5 text-right font-mono">SDG {r.requestedAmount.toLocaleString()}</TableCell>
                            <TableCell className="py-1.5 text-right font-mono font-semibold">SDG {(r.approvedAmount || r.requestedAmount).toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                  <div className="p-2 bg-destructive/10 rounded text-xs text-destructive flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">Reconciliation Required / التسوية مطلوبة</p>
                      <p>Recipients must submit receipts and return unused funds within 5 working days.</p>
                      <p>يجب على المستلمين تقديم الإيصالات وإرجاع الأموال غير المستخدمة خلال 5 أيام عمل.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    <span>Individual PDF approval certificates will be generated and attached to the email.</span>
                  </div>
                </div>
              )}
              {!paymentRequestDialog.isBulk && paymentRequestDialog.request && (() => {
                const req = paymentRequestDialog.request!;
                return (
                  <div className="bg-muted/50 p-3 rounded-md text-sm space-y-2">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      <div><p className="text-xs text-muted-foreground">Requester / مقدم الطلب</p><p className="font-medium text-sm">{getProfileName(req.requestedBy)}</p></div>
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
                          checked={paymentRequestDialog.selectedRecipientIds.includes(r.id)}
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
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPaymentRequestDialog({ open: false, request: null, isBulk: false, bulkRequests: [], bulkGroupBy: '', bulkGroupValue: '', availableRecipients: [], selectedRecipientIds: [], loading: false, sending: false })}
              data-testid="button-cancel-payment-request"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendPaymentRequest}
              disabled={paymentRequestDialog.sending || paymentRequestDialog.selectedRecipientIds.length === 0}
              data-testid="button-send-payment-request"
            >
              {paymentRequestDialog.sending ? (
                <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Sending...</>
              ) : (
                <><Mail className="h-4 w-4 mr-1" /> Send Request</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdvanceRequestsReport() {
  // DownPaymentProvider is already provided by AppContext.tsx - no need to wrap again
  return <AdvanceRequestsReportContent />;
}
