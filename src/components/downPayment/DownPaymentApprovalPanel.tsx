import { useState, useMemo, useRef, useEffect } from 'react';
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
  Eye,
  Banknote,
  Pencil,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { filterDownPayments, exportToCSV, exportToExcel, exportToPDF, getDownPaymentStats } from '@/utils/downPaymentExport';
import { generateFinancialStatementPdf, type StatementRow, type StatementConfig } from '@/utils/financialStatementPdf';
import { generateFinancialStatementExcel } from '@/utils/financialStatementExcel';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { SignatureConfirmationModal } from '@/components/signatures/SignatureConfirmationModal';
import { supabase } from '@/integrations/supabase/client';
import { generateTransportAdvanceCertificatePdf, generateTransportAdvanceCertificateBase64, generateBulkPaymentPdf, generateBulkPaymentPdfBase64 } from '@/utils/transportAdvanceCertificatePdf';
import { EmailNotificationService } from '@/services/email-notification.service';
import { EmailCCInput } from '@/components/EmailCCInput';
import { useToast } from '@/hooks/use-toast';
import { Mail, Wallet } from 'lucide-react';

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
  const { currentUser, users } = useUser();
  const { isSuperAdmin } = useSuperAdmin();
  const { requests, loading, refreshRequests, supervisorApprove, supervisorReject, adminApprove, adminReject, processPayment, bulkApprove, revertToPending, confirmReceipt, deleteRequest, editRequest } = useDownPayment();
  const { toast } = useToast();

  const [selectedRequest, setSelectedRequest] = useState<DownPaymentRequest | null>(null);
  const [action, setAction] = useState<'approve' | 'reject' | 'pay' | 'view_audit' | 'revert' | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DownPaymentRequest | null>(null);
  const [deleteProcessing, setDeleteProcessing] = useState(false);
  const [signatureRequest, setSignatureRequest] = useState<DownPaymentRequest | null>(null);
  const [notes, setNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
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
  }>({ open: false, request: null, bulkRequests: [], isBulk: false, availableRecipients: [], selectedRecipientIds: [], ccEmails: [], loading: false, sending: false, bulkGroupBy: '', bulkGroupValue: '' });
  const [markPaidProcessing, setMarkPaidProcessing] = useState(false);
  const [bulkPaymentIds, setBulkPaymentIds] = useState<Set<string>>(new Set());

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

  const uniqueHubs = useMemo(() => [...new Set(requests.map(r => r.hubName).filter(Boolean))], [requests]);
  const uniqueStates = useMemo(() => [...new Set(requests.map(r => r.stateName).filter(Boolean))], [requests]);
  const uniqueLocalities = useMemo(() => [...new Set(requests.map(r => r.localityName).filter(Boolean))], [requests]);
  const uniqueSites = useMemo(() => [...new Set(requests.filter(r => ['approved', 'partially_paid', 'fully_paid'].includes(r.status)).map(r => r.siteName).filter(Boolean))].sort(), [requests]);
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
    const enumeratorIds = [...new Set(approvedReqs.map(r => r.requestedBy).filter(Boolean))];
    return enumeratorIds.map(id => {
      const u = users?.find(u => u.id === id);
      return { id: id!, name: (u as any)?.fullName || (u as any)?.full_name || u?.email || 'Unknown' };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [requests, users]);

  const filteredRequests = useMemo(() => filterDownPayments(requests, filters), [requests, filters]);

  const approvedForPayment = useMemo(() =>
    filteredRequests.filter(r => r.status === 'approved'),
    [filteredRequests]
  );
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
          rejectedByName: currentUser.fullName || currentUser.email,
          rejectionReason,
        })
      : await adminReject({
          requestId: selectedRequest.id,
          rejectedBy: currentUser.id,
          rejectedByName: currentUser.fullName || currentUser.email,
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
      processedByName: currentUser.fullName || currentUser.email,
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
      approvedByName: currentUser.fullName || currentUser.email,
    });
    setProcessing(false);
    setSelectedIds(new Set());
    closeDialog();
  };

  const handleRevert = async () => {
    if (!selectedRequest || !currentUser) return;

    setProcessing(true);
    const success = await revertToPending({
      requestId: selectedRequest.id,
      revertedBy: currentUser.id,
      revertedByName: currentUser.fullName || currentUser.email,
      reason: notes || undefined,
      targetStatus: revertTarget,
    });

    setProcessing(false);
    if (success) {
      closeDialog();
    }
  };

  const handleBulkRevert = async (targetStatus: 'pending_supervisor' | 'pending_admin') => {
    if (!currentUser || selectedIds.size === 0) return;
    setProcessing(true);
    let successCount = 0;
    let failCount = 0;
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      const success = await revertToPending({
        requestId: id,
        revertedBy: currentUser.id,
        revertedByName: currentUser.fullName || currentUser.email,
        reason: `Bulk revert to ${targetStatus === 'pending_supervisor' ? 'Pending Supervisor' : 'Pending Admin'}`,
        targetStatus,
      });
      if (success) successCount++; else failCount++;
    }
    setProcessing(false);
    setSelectedIds(new Set());
    toast({
      title: `Bulk Revert Complete / اكتمال الإرجاع الجماعي`,
      description: `${successCount} reverted${failCount > 0 ? `, ${failCount} failed` : ''}`,
    });
  };

  const handleBulkMarkPaid = async () => {
    if (!currentUser || selectedIds.size === 0) return;
    setProcessing(true);
    let successCount = 0;
    let failCount = 0;
    const now = new Date().toISOString();
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      const req = requests.find(r => r.id === id);
      if (!req || req.status !== 'approved') { failCount++; continue; }
      try {
        const { error } = await supabase
          .from('down_payment_requests')
          .update({
            status: 'fully_paid',
            total_paid_amount: req.approvedAmount || req.requestedAmount,
            remaining_amount: 0,
            updated_at: now,
          } as any)
          .eq('id', id);
        if (error) failCount++; else successCount++;
      } catch { failCount++; }
    }
    setProcessing(false);
    setSelectedIds(new Set());
    await refreshRequests();
    toast({
      title: `Bulk Mark Paid Complete / اكتمال التحديد كمدفوع`,
      description: `${successCount} marked as paid${failCount > 0 ? `, ${failCount} failed` : ''}`,
    });
  };

  const handleBulkDelete = async () => {
    if (!currentUser || selectedIds.size === 0) return;
    setProcessing(true);
    let successCount = 0;
    let failCount = 0;
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      try {
        const { error } = await supabase
          .from('down_payment_requests')
          .delete()
          .eq('id', id);
        if (error) failCount++; else successCount++;
      } catch { failCount++; }
    }
    setSelectedIds(new Set());
    await refreshRequests();
    setProcessing(false);
    toast({
      title: `Bulk Delete Complete / اكتمال الحذف الجماعي`,
      description: `${successCount} deleted, they can now submit new requests. / تم حذف ${successCount}، يمكنهم الآن تقديم طلبات جديدة.${failCount > 0 ? ` ${failCount} failed / فشل` : ''}`,
    });
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
    setRevertTarget('pending_supervisor');
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
    return {
      refId: `PACT-TA-${req.id.substring(0, 8).toUpperCase()}`,
      date: req.requestedAt,
      description: req.justification || req.siteName,
      requester: req.requestedByName || getName(reqUser),
      site: req.siteName,
      hub: req.hubName || '',
      state: req.stateName || '',
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
    const dataToExport = filteredRequests;
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
    } else {
      setEditDialog(prev => ({ ...prev, processing: false }));
    }
  };

  const cachedRecipientsRef = useRef<Array<{ id: string; email: string; name: string; role: string }> | null>(null);
  const [ccContacts, setCcContacts] = useState<Array<{ id: string; email: string; name: string; role: string }>>([]);

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
    const cached = cachedRecipientsRef.current;
    if (cached && cached.length > 0) {
      setPaymentRequestDialog(prev => ({ ...prev, open: true, request: null, bulkRequests: reqs, isBulk: true, loading: false, selectedRecipientIds: cached.map(r => r.id), availableRecipients: cached, ccEmails: [], bulkGroupBy: groupBy, bulkGroupValue: groupValue }));
      loadFinanceRecipients(true).then(fresh => {
        setPaymentRequestDialog(prev => ({ ...prev, availableRecipients: fresh, selectedRecipientIds: fresh.map(r => r.id) }));
      }).catch(() => {});
    } else {
      setPaymentRequestDialog(prev => ({ ...prev, open: true, request: null, bulkRequests: reqs, isBulk: true, loading: true, selectedRecipientIds: [], availableRecipients: [], ccEmails: [], bulkGroupBy: groupBy, bulkGroupValue: groupValue }));
      try {
        const recipients = await loadFinanceRecipients();
        setPaymentRequestDialog(prev => ({ ...prev, availableRecipients: recipients, selectedRecipientIds: recipients.map(r => r.id), loading: false }));
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

  const handleSendPaymentRequest = async () => {
    const { request: req, bulkRequests, isBulk, selectedRecipientIds, availableRecipients, ccEmails, bulkGroupBy, bulkGroupValue } = paymentRequestDialog;
    if (!currentUser?.id || selectedRecipientIds.length === 0) return;
    if (!isBulk && !req) return;

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

        let summaryPdf: { base64: string; filename: string } | undefined;
        try {
          const certDataList = await Promise.all(
            bulkRequests.map(async (bReq) => {
              const sig = await getSignatureImageData(bReq);
              return buildCertData(bReq, sig);
            })
          );
          summaryPdf = await generateBulkPaymentPdfBase64(certDataList, groupLabel || 'All Approved');
        } catch { /* continue without PDF */ }

        const result = await EmailNotificationService.sendPaymentRequestToFinanceWithRecipients(
          selectedRecipients,
          approverName,
          approverEmail,
          requesterNames.length > 60 ? requesterNames.slice(0, 57) + '...' : requesterNames,
          `Bulk Transport Advance (${bulkRequests.length} requests)${groupLabel ? ` - ${groupLabel}` : ''}`,
          requestIds.length > 40 ? requestIds.slice(0, 37) + '...' : requestIds,
          'Transportation Advance (Bulk)',
          totalAmount,
          'advance',
          bulkRequests[0]?.projectName || 'N/A',
          'SDG',
          `Bulk payment request for ${bulkRequests.length} approved advances${groupLabel ? ` grouped by ${groupLabel}` : ''}. Total: SDG ${totalAmount.toLocaleString()}. Individual requests: ${bulkRequests.map(r => `${r.siteName} (SDG ${(r.approvedAmount || r.requestedAmount).toLocaleString()})`).join('; ')}.\n\nRECONCILIATION NOTICE: All recipients must submit receipts and return any unused funds within 5 working days.\nملاحظة تسوية: يجب على جميع المستلمين تقديم الإيصالات وإرجاع أي أموال غير مستخدمة خلال 5 أيام عمل.`,
          '/down-payment-approval',
          summaryPdf,
          undefined,
          ccEmails.length > 0 ? ccEmails : undefined
        );

        if (result.success) {
          toast({
            title: "Bulk Payment Request Sent / تم إرسال طلبات الدفع الجماعية",
            description: `${bulkRequests.length} requests sent to ${selectedRecipients.length} recipient(s) with summary PDF attached. / تم إرسال ${bulkRequests.length} طلب إلى ${selectedRecipients.length} مستلم(ين) مع ملف PDF ملخص مرفق.`,
          });
        } else {
          toast({ title: "Email Failed / فشل الإرسال", description: result.error || "Could not send. / تعذر الإرسال.", variant: "destructive" });
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
          `Transport Advance - ${req.siteName}`, requestId, 'Transportation Advance',
          req.approvedAmount || req.requestedAmount, 'advance', req.projectName || 'N/A',
          'SDG', '', '/down-payment-approval', pdfAttachment,
          undefined, ccEmails.length > 0 ? ccEmails : undefined
        );

        if (result.success) {
          toast({
            title: "Payment Request Sent / تم إرسال طلب الدفع",
            description: `Email sent to ${selectedRecipients.length} recipient(s). / تم إرسال البريد إلى ${selectedRecipients.length} مستلم(ين).`,
          });
        } else {
          toast({ title: "Email Failed / فشل الإرسال", description: result.error || "Could not send. / تعذر الإرسال.", variant: "destructive" });
        }
      }
    } catch {
      toast({ title: "Error / خطأ", description: "Failed to send payment request. / فشل في إرسال طلب الدفع.", variant: "destructive" });
    } finally {
      setPaymentRequestDialog({ open: false, request: null, bulkRequests: [], isBulk: false, availableRecipients: [], selectedRecipientIds: [], ccEmails: [], loading: false, sending: false, bulkGroupBy: '', bulkGroupValue: '' });
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
        toast({
          title: "Marked as Paid / تم التحديد كمدفوع",
          description: "The advance has been marked as fully paid. / تم تحديد السلفة كمدفوعة بالكامل.",
        });
        refreshRequests();
      }
    } catch {
      toast({ title: "Error / خطأ", description: "Failed to mark as paid. / فشل في التحديد كمدفوع.", variant: "destructive" });
    } finally {
      setMarkPaidProcessing(false);
    }
  };

  const isApprovedOrPaid = (status: string) => ['approved', 'partially_paid', 'fully_paid'].includes(status);

  const getStatusBadge = (status: string) => {
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
  };

  const WorkflowTimeline = ({ request }: { request: DownPaymentRequest }) => {
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
  };

  const RequestCard = ({ request, showCheckbox = false }: { request: DownPaymentRequest; showCheckbox?: boolean }) => {
    const [showAuditDetails, setShowAuditDetails] = useState(false);
    const shortId = request.id.substring(0, 8).toUpperCase();

    return (
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
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {request.requestedByName || 'Unknown'}
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
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <span className="text-lg font-bold" data-testid={`text-amount-${request.id}`}>
                SDG {(request.approvedAmount || request.requestedAmount).toLocaleString()}
              </span>
              {getStatusBadge(request.status)}
            </div>
          </div>

          <div className="mt-2">
            <WorkflowTimeline request={request} />
          </div>

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

            {(request.metadata as any)?.receipt_confirmation?.confirmed && (
              <Badge variant="default" className="gap-1" data-testid={`badge-receipt-confirmed-${request.id}`}>
                <CheckCircle2 className="h-3 w-3" />
                Receipt Confirmed / تم التأكيد
              </Badge>
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
      </CardContent>
    </Card>
    );
  };

  const StatsCards = () => (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4" data-testid="stats-cards-container">
      <Card data-testid="card-stats-total">
        <CardContent className="p-4">
          <div className="text-2xl font-bold" data-testid="text-stats-total-count">{stats.counts.total}</div>
          <div className="text-sm text-muted-foreground">Total Requests</div>
        </CardContent>
      </Card>
      <Card data-testid="card-stats-pending">
        <CardContent className="p-4">
          <div className="text-2xl font-bold text-yellow-600" data-testid="text-stats-pending-count">{stats.counts.pendingSupervisor + stats.counts.pendingAdmin}</div>
          <div className="text-sm text-muted-foreground">Pending</div>
        </CardContent>
      </Card>
      <Card data-testid="card-stats-paid">
        <CardContent className="p-4">
          <div className="text-2xl font-bold text-green-600" data-testid="text-stats-paid-amount">{stats.amounts.totalPaid.toLocaleString()}</div>
          <div className="text-sm text-muted-foreground">Total Paid (SDG)</div>
        </CardContent>
      </Card>
      <Card data-testid="card-stats-remaining">
        <CardContent className="p-4">
          <div className="text-2xl font-bold text-orange-600" data-testid="text-stats-remaining-amount">{stats.amounts.totalRemaining.toLocaleString()}</div>
          <div className="text-sm text-muted-foreground">Remaining (SDG)</div>
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
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                  <Select
                    value={filters.stateName || 'all'}
                    onValueChange={(val) => {
                      setFilters(f => ({ ...f, stateName: val === 'all' ? undefined : val }));
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
                      setFilters(f => ({ ...f, hubId: val === 'all' ? undefined : val }));
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
                  <Button size="sm" variant="outline" onClick={handleBulkMarkPaid} disabled={approvedCount === 0 || processing} data-testid="button-selected-mark-paid">
                    <Wallet className="h-4 w-4 mr-1" />
                    Mark Paid ({approvedCount})
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    if (selectedProcessing.length > 0) handleDownloadBulkPdf(selectedProcessing, `${selectedProcessing.length} Selected`);
                  }} disabled={processing} data-testid="button-selected-bulk-pdf">
                    <FileText className="h-4 w-4 mr-1" />
                    PDF ({selectedIds.size})
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
            <div className="space-y-3">
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
              {processingRequests.map(request => (
                <RequestCard key={request.id} request={request} showCheckbox />
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

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel-reject">
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleReject} 
              disabled={processing || !rejectionReason.trim()} 
              data-testid="button-confirm-reject"
            >
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
            <Button variant="default" onClick={handleProcessPayment} disabled={processing} data-testid="button-confirm-payment">
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
            setSignatureRequest(null);
          }}
          onCancel={() => setSignatureRequest(null)}
        />
      )}

      <Dialog open={paymentRequestDialog.open} onOpenChange={(open) => { if (!open) setPaymentRequestDialog({ open: false, request: null, bulkRequests: [], isBulk: false, availableRecipients: [], selectedRecipientIds: [], ccEmails: [], loading: false, sending: false, bulkGroupBy: '', bulkGroupValue: '' }); }}>
        <DialogContent className={paymentRequestDialog.isBulk ? "max-w-2xl max-h-[90vh] overflow-y-auto" : "max-w-lg max-h-[90vh] overflow-y-auto"}>
          <DialogHeader>
            <DialogTitle>{paymentRequestDialog.isBulk ? 'Bulk Payment Request / طلب دفع جماعي' : 'Request Payment / طلب دفع'}</DialogTitle>
            <DialogDescription>
              {paymentRequestDialog.isBulk
                ? `Send one email with a summary PDF for ${paymentRequestDialog.bulkRequests.length} approved advance(s) to finance team.`
                : 'Send payment request email to finance team with the approval certificate attached.'}
            </DialogDescription>
            {paymentRequestDialog.isBulk && paymentRequestDialog.bulkRequests.length > 0 && (
              <div className="mt-2 flex items-center gap-3 text-sm">
                <Badge variant="secondary" className="font-semibold">{paymentRequestDialog.bulkRequests.length} request(s)</Badge>
                <span className="font-semibold text-green-600 dark:text-green-400">SDG {paymentRequestDialog.bulkRequests.reduce((s, r) => s + (r.approvedAmount || r.requestedAmount), 0).toLocaleString()}</span>
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
                        {paymentRequestDialog.bulkRequests.map(r => {
                          const requester = users?.find(u => u.id === r.requestedBy);
                          const rName = (requester as any)?.fullName || (requester as any)?.full_name || requester?.email || 'Unknown';
                          return (
                            <TableRow key={r.id} className="text-xs">
                              <TableCell className="py-1.5 max-w-[120px] truncate">{rName}</TableCell>
                              <TableCell className="py-1.5 max-w-[100px] truncate">{r.siteName}</TableCell>
                              <TableCell className="py-1.5 max-w-[80px] truncate">{r.hubName || '-'}</TableCell>
                              <TableCell className="py-1.5 max-w-[80px] truncate">{r.stateName || '-'}</TableCell>
                              <TableCell className="py-1.5 text-right font-mono">SDG {r.requestedAmount.toLocaleString()}</TableCell>
                              <TableCell className="py-1.5 text-right font-mono font-semibold">SDG {(r.approvedAmount || r.requestedAmount).toLocaleString()}</TableCell>
                            </TableRow>
                          );
                        })}
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
                    <span>A single summary PDF with all requests will be generated and attached to the email.</span>
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

              <div className="border-t pt-3">
                <EmailCCInput
                  ccEmails={paymentRequestDialog.ccEmails}
                  onChange={(emails) => setPaymentRequestDialog(prev => ({ ...prev, ccEmails: emails }))}
                  contacts={ccContacts.filter(c => !paymentRequestDialog.selectedRecipientIds.includes(c.id))}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPaymentRequestDialog({ open: false, request: null, bulkRequests: [], isBulk: false, availableRecipients: [], selectedRecipientIds: [], ccEmails: [], loading: false, sending: false, bulkGroupBy: '', bulkGroupValue: '' })}
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
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={deleteProcessing} data-testid="button-cancel-delete">
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteProcessing}
              onClick={async () => {
                if (!deleteConfirm) return;
                setDeleteProcessing(true);
                const success = await deleteRequest(deleteConfirm.id);
                setDeleteProcessing(false);
                if (success) setDeleteConfirm(null);
              }}
              data-testid="button-confirm-delete"
            >
              {deleteProcessing ? (
                <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Deleting...</>
              ) : (
                <><Trash2 className="h-4 w-4 mr-1" /> Delete Permanently</>
              )}
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
    </>
  );
}
