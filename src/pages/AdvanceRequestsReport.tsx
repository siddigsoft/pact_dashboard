import { useState, useMemo, useCallback } from 'react';
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
  Truck
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, subMonths, isWithinInterval } from 'date-fns';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

function AdvanceRequestsReportContent() {
  const { requests, loading, refreshRequests } = useDownPayment();
  const { currentUser, users } = useUser();
  const { isSuperAdmin } = useSuperAdmin();
  const navigate = useNavigate();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [hubFilter, setHubFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('overview');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 200;

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
      return true;
    });
  }, [requests, debouncedSearchTerm, statusFilter, hubFilter, dateFilter, dateRanges, getProfileName]);

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
    
    return { totalRequested, totalApproved, totalPending, totalRejected, totalPaid, pendingCount, approvedCount, rejectedCount, totalCount: filteredRequests.length };
  }, [filteredRequests]);

  const byTeamMember = useMemo(() => {
    if (activeTab !== 'team') return [];
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
  }, [filteredRequests, activeTab, getProfileName]);

  const byHub = useMemo(() => {
    if (activeTab !== 'hub') return [];
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
  }, [filteredRequests, activeTab]);

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
    if (activeTab !== 'status') return [];
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
  }, [filteredRequests, activeTab]);

  const byState = useMemo(() => {
    if (activeTab !== 'state') return [];
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
  }, [filteredRequests, activeTab]);

  const byProject = useMemo(() => {
    if (activeTab !== 'project') return [];
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
  }, [filteredRequests, activeTab]);

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

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('PACT Field Operations System', 14, yPos);
    doc.text(`Generated: ${format(new Date(), 'PPP')}`, 140, yPos);
    
    yPos += 15;
    doc.setFontSize(20);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text('Transportation Advance Cost Report', 14, yPos);
    
    yPos += 15;
    doc.setDrawColor(200);
    doc.line(14, yPos, 196, yPos);
    yPos += 10;

    doc.setFontSize(14);
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
      headStyles: { fillColor: [59, 130, 246] },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;

    doc.setFontSize(14);
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
      headStyles: { fillColor: [59, 130, 246], fontSize: 8 },
      bodyStyles: { fontSize: 7 },
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

  // Helper function to add PACT header to PDF
  const addPdfHeader = (doc: jsPDF, title: string) => {
    let yPos = 15;
    doc.setFillColor(245, 247, 250);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setFontSize(18);
    doc.setTextColor(30, 64, 175);
    doc.setFont('helvetica', 'bold');
    doc.text('PACT', 14, yPos + 5);
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    doc.text('Field Operations Command Center', 14, yPos + 12);
    doc.setFontSize(8);
    doc.text(`Generated: ${format(new Date(), 'PPP p')}`, 150, yPos + 5);
    yPos += 30;
    doc.setDrawColor(30, 64, 175);
    doc.setLineWidth(0.5);
    doc.line(14, yPos, 196, yPos);
    yPos += 10;
    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 14, yPos);
    return yPos + 10;
  };

  // Export By Team Member
  const exportTeamToExcel = () => {
    const summaryData = byTeamMember.map(m => ({
      'Team Member': m.name,
      'Total Requests': m.requests,
      'Total Requested (SDG)': m.totalRequested,
      'Total Approved (SDG)': m.totalApproved,
      'Pending Requests': m.pending,
    }));
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
    autoTable(doc, {
      startY: yPos,
      head: [['Team Member', 'Requests', 'Requested (SDG)', 'Approved (SDG)', 'Pending']],
      body: byTeamMember.map(m => [m.name, m.requests, m.totalRequested.toLocaleString(), m.totalApproved.toLocaleString(), m.pending]),
      theme: 'striped',
      headStyles: { fillColor: [30, 64, 175], fontSize: 9 },
      bodyStyles: { fontSize: 8 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Detailed Requests', 14, yPos);
    yPos += 5;
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
      headStyles: { fillColor: [30, 64, 175], fontSize: 7 },
      bodyStyles: { fontSize: 6 },
    });
    doc.save(`advance_by_team_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  // Export By Hub
  const exportHubToExcel = () => {
    const summaryData = byHub.map(h => ({
      'Hub': h.name,
      'Total Requests': h.requests,
      'Total Requested (SDG)': h.totalRequested,
      'Total Approved (SDG)': h.totalApproved,
      'Pending Requests': h.pending,
    }));
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
    autoTable(doc, {
      startY: yPos,
      head: [['Hub', 'Requests', 'Requested (SDG)', 'Approved (SDG)', 'Pending']],
      body: byHub.map(h => [h.name, h.requests, h.totalRequested.toLocaleString(), h.totalApproved.toLocaleString(), h.pending]),
      theme: 'striped',
      headStyles: { fillColor: [30, 64, 175], fontSize: 9 },
      bodyStyles: { fontSize: 8 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Detailed Requests', 14, yPos);
    yPos += 5;
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
      headStyles: { fillColor: [30, 64, 175], fontSize: 7 },
      bodyStyles: { fontSize: 6 },
    });
    doc.save(`advance_by_hub_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  // Export By Status
  const exportStatusToExcel = () => {
    const summaryData = byStatus.map(s => ({
      'Status': s.name,
      'Total Requests': s.requests,
      'Total Requested (SDG)': s.totalRequested,
      'Total Approved (SDG)': s.totalApproved,
    }));
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
    autoTable(doc, {
      startY: yPos,
      head: [['Status', 'Requests', 'Requested (SDG)', 'Approved (SDG)']],
      body: byStatus.map(s => [s.name, s.requests, s.totalRequested.toLocaleString(), s.totalApproved.toLocaleString()]),
      theme: 'striped',
      headStyles: { fillColor: [30, 64, 175], fontSize: 9 },
      bodyStyles: { fontSize: 8 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Detailed Requests', 14, yPos);
    yPos += 5;
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
      headStyles: { fillColor: [30, 64, 175], fontSize: 7 },
      bodyStyles: { fontSize: 6 },
    });
    doc.save(`advance_by_status_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  // Export By State
  const exportStateToExcel = () => {
    const summaryData = byState.map(s => ({
      'State': s.name,
      'Total Requests': s.requests,
      'Total Requested (SDG)': s.totalRequested,
      'Total Approved (SDG)': s.totalApproved,
      'Pending': s.pending,
    }));
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
    autoTable(doc, {
      startY: yPos,
      head: [['State', 'Requests', 'Requested (SDG)', 'Approved (SDG)', 'Pending']],
      body: byState.map(s => [s.name, s.requests, s.totalRequested.toLocaleString(), s.totalApproved.toLocaleString(), s.pending]),
      theme: 'striped',
      headStyles: { fillColor: [30, 64, 175], fontSize: 9 },
      bodyStyles: { fontSize: 8 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Detailed Requests', 14, yPos);
    yPos += 5;
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
      headStyles: { fillColor: [30, 64, 175], fontSize: 7 },
      bodyStyles: { fontSize: 6 },
    });
    doc.save(`advance_by_state_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  // Export By Project
  const exportProjectToExcel = () => {
    const summaryData = byProject.map(p => ({
      'Project': p.name,
      'Total Requests': p.requests,
      'Total Requested (SDG)': p.totalRequested,
      'Total Approved (SDG)': p.totalApproved,
      'Pending': p.pending,
    }));
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
    autoTable(doc, {
      startY: yPos,
      head: [['Project', 'Requests', 'Requested (SDG)', 'Approved (SDG)', 'Pending']],
      body: byProject.map(p => [p.name, p.requests, p.totalRequested.toLocaleString(), p.totalApproved.toLocaleString(), p.pending]),
      theme: 'striped',
      headStyles: { fillColor: [30, 64, 175], fontSize: 9 },
      bodyStyles: { fontSize: 8 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Detailed Requests', 14, yPos);
    yPos += 5;
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
      headStyles: { fillColor: [30, 64, 175], fontSize: 7 },
      bodyStyles: { fontSize: 6 },
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

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by site, user, or hub..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
            data-testid="input-search-requests"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
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
        <Select value={hubFilter} onValueChange={setHubFilter}>
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
        <Select value={dateFilter} onValueChange={setDateFilter}>
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
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
                      {filteredRequests.slice(0, 50).map(req => {
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
          {filteredRequests.length > 50 && (
            <p className="text-sm text-muted-foreground text-center">
              Showing first 50 of {filteredRequests.length} requests. Export to Excel to see all.
            </p>
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
                        <TableRow key={idx} data-testid={`row-team-${idx}`}>
                          <TableCell className="font-medium">{member.name}</TableCell>
                          <TableCell className="text-right">{member.requests}</TableCell>
                          <TableCell className="text-right font-mono">{member.totalRequested.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-green-600">{member.totalApproved.toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            {member.pending > 0 && <Badge variant="outline" className="border-amber-500 text-amber-600">{member.pending}</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
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
                    {filteredRequests.slice(0, 50).map(req => {
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
                    {filteredRequests.slice(0, 50).map(req => {
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
                    {filteredRequests.slice(0, 50).map(req => {
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
                    {filteredRequests.slice(0, 50).map(req => {
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
                    {filteredRequests.slice(0, 50).map(req => {
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
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AdvanceRequestsReport() {
  // DownPaymentProvider is already provided by AppContext.tsx - no need to wrap again
  return <AdvanceRequestsReportContent />;
}
