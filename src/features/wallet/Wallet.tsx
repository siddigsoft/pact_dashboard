import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '@/features/wallet/context/WalletContext';
import { useAppContext } from '@/shared/context/AppContext';
import { useDownPayment } from '@/features/downPayment/context/DownPaymentContext';
import { fetchPaymentMethodsForUser } from '@/features/wallet/repository/paymentMethodsRepository';
import {
  confirmOperationalCostReceipt,
  fetchPaidOperationalCostSubmissionsBySubmittedBy,
} from '@/features/costApproval/repository/operationalCostSubmissionsRepository';
import { DataFreshnessBadge } from '@/components/realtime';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import TransactionSearch, { type SearchFilters } from '@/components/wallet/TransactionSearch';
import PaymentMethodsCard from '@/components/wallet/PaymentMethodsCard';
import { exportTransactionsToCSV, exportTransactionsToPDF, exportWithdrawalsToCSV, exportWithdrawalsToPDF } from '@/features/wallet/lib/export';
import { 
  Wallet as WalletIcon, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Check, 
  X, 
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
  Calendar,
  Filter,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Activity,
  Zap,
  ArrowLeft,
  Menu,
  Bell,
  Settings,
  FileText,
  Banknote,
  ChevronDown,
  ChevronUp,
  Truck,
  MapPin,
  AlertTriangle,
  Info,
  ClipboardCheck,
  Tag
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval } from 'date-fns';
import { DEFAULT_CURRENCY } from '@/types/wallet';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { WalletSignatureIntegration } from '@/components/wallet/WalletSignatureIntegration';
import { SignatureConfirmationModal } from '@/components/signatures/SignatureConfirmationModal';

const formatCurrency = (amount: number, currency: string = DEFAULT_CURRENCY) => {
  return new Intl.NumberFormat('en-SD', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const WalletPage = () => {
  const navigate = useNavigate();
  const { currentUser } = useAppContext();
  const { 
    wallet, 
    transactions, 
    withdrawalRequests, 
    stats, 
    loading, 
    lastRefresh,
    createWithdrawalRequest,
    cancelWithdrawalRequest,
    confirmFundReceipt,
    getBalance,
    refreshWallet,
    refreshTransactions,
    refreshWithdrawalRequests
  } = useWallet();

  const {
    requests: advanceRequests,
    loading: advanceLoading,
    confirmReceipt: confirmAdvanceReceipt,
  } = useDownPayment();

  useEffect(() => {
    if (currentUser?.id) {
      fetchPaymentMethods();
      fetchMyCostPayments();
    }
  }, [currentUser?.id]);

  const fetchPaymentMethods = async () => {
    try {
      if (!currentUser?.id) return;
      const { data, error } = await fetchPaymentMethodsForUser(currentUser.id);

      if (error) throw error;
      setPaymentMethods(data || []);
    } catch (error) {
      console.error('Error fetching payment methods:', error);
    }
  };

  const [withdrawalDialogOpen, setWithdrawalDialogOpen] = useState(false);
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalReason, setWithdrawalReason] = useState('');
  const [withdrawalMethod, setWithdrawalMethod] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  
  const [signatureWithdrawalRequest, setSignatureWithdrawalRequest] = useState<typeof withdrawalRequests[0] | null>(null);
  const [signatureAdvanceRequest, setSignatureAdvanceRequest] = useState<typeof advanceRequests[0] | null>(null);
  const [signatureCostPayment, setSignatureCostPayment] = useState<any | null>(null);
  const [myCostPayments, setMyCostPayments] = useState<any[]>([]);
  const [costPaymentsLoading, setCostPaymentsLoading] = useState(false);

  const [transactionTypeFilter, setTransactionTypeFilter] = useState<string>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<string>('all');
  const [withdrawalStatusFilter, setWithdrawalStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [allAdvancesStatusFilter, setAllAdvancesStatusFilter] = useState<string>('all');
  const [allAdvancesSearch, setAllAdvancesSearch] = useState('');
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({});

  const currentBalance = getBalance(DEFAULT_CURRENCY);

  const myAdvances = useMemo(() => {
    if (!currentUser?.id) return [];
    return advanceRequests.filter(r => r.requestedBy === currentUser.id || r.metadata?.requestedById === currentUser.id);
  }, [advanceRequests, currentUser?.id]);

  const isAdminUser = useMemo(() => {
    const role = currentUser?.role?.toLowerCase() ?? '';
    return ['admin', 'superadmin', 'ict', 'financialadmin', 'supervisor', 'data_team'].includes(role);
  }, [currentUser?.role]);

  const pendingAdvanceConfirmations = useMemo(() =>
    myAdvances.filter(r =>
      (r.status === 'partially_paid' || r.status === 'fully_paid') &&
      !(r.metadata as any)?.receipt_confirmation?.confirmed
    ),
    [myAdvances]
  );

  const pendingWithdrawalConfirmations = useMemo(() =>
    withdrawalRequests.filter(r => r.status === 'approved' && !r.fundReceiptConfirmed),
    [withdrawalRequests]
  );

  const pendingCostPaymentConfirmations = useMemo(() =>
    myCostPayments.filter(c => !c.fund_receipt_confirmed),
    [myCostPayments]
  );

  const fetchMyCostPayments = async () => {
    if (!currentUser?.id) return;
    setCostPaymentsLoading(true);
    try {
      const data = await fetchPaidOperationalCostSubmissionsBySubmittedBy(currentUser.id);
      setMyCostPayments(data || []);
    } catch {
      setMyCostPayments([]);
    } finally {
      setCostPaymentsLoading(false);
    }
  };

  const confirmCostPaymentReceipt = async (costId: string, signature: { signatureId?: string; signatureHash?: string; method?: string; signedAt?: string }) => {
    try {
      await confirmOperationalCostReceipt({ costId, signatureId: signature.signatureId || null });
      await fetchMyCostPayments();
    } catch {
      throw new Error('Failed to confirm cost payment receipt');
    }
  };

  const handleWithdrawalRequest = async () => {
    const amount = parseFloat(withdrawalAmount);
    if (amount <= 0 || amount > currentBalance) {
      return;
    }

    await createWithdrawalRequest(amount, withdrawalReason, withdrawalMethod);
    setWithdrawalDialogOpen(false);
    setWithdrawalAmount('');
    setWithdrawalReason('');
    setWithdrawalMethod('');
  };

  const handleRefresh = async () => {
    await Promise.all([
      refreshWallet(),
      refreshTransactions(),
      refreshWithdrawalRequests()
    ]);
  };

  const handleClearAllFilters = () => {
    setSearchFilters({});
    setTransactionTypeFilter('all');
    setDateRangeFilter('all');
    setWithdrawalStatusFilter('all');
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'earning':
      case 'site_visit_fee':
        return <ArrowUpRight className="w-4 h-4 text-green-600" />;
      case 'down_payment':
        return <Banknote className="w-4 h-4 text-amber-500" />;
      case 'withdrawal':
        return <ArrowDownRight className="w-4 h-4 text-red-600" />;
      case 'adjustment':
        return <Activity className="w-4 h-4 text-purple-500" />;
      case 'bonus':
        return <TrendingUp className="w-4 h-4 text-blue-600" />;
      case 'penalty':
        return <TrendingDown className="w-4 h-4 text-orange-600" />;
      default:
        return <DollarSign className="w-4 h-4 text-gray-600" />;
    }
  };


  const getWithdrawalStatusBadge = (status: string, request?: any) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" />Pending</Badge>;
      case 'approved':
        if (request?.fundReceiptConfirmed) {
          return <Badge variant="default" className="gap-1 bg-emerald-600"><CheckCircle2 className="w-3 h-3" />Received</Badge>;
        }
        return <Badge variant="default" className="gap-1 bg-green-600"><Check className="w-3 h-3" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="gap-1"><X className="w-3 h-3" />Rejected</Badge>;
      case 'cancelled':
        return <Badge variant="secondary" className="gap-1">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredTransactions = useMemo(() => {
    let filtered = [...transactions];

    // Apply advanced search filters
    if (searchFilters.searchTerm) {
      const term = searchFilters.searchTerm.toLowerCase();
      filtered = filtered.filter(t => 
        t.description?.toLowerCase().includes(term) ||
        t.id.toLowerCase().includes(term) ||
        t.siteVisitId?.toLowerCase().includes(term)
      );
    }
    
    if (searchFilters.type) {
      filtered = filtered.filter(t => t.type === searchFilters.type);
    }
    
    if (searchFilters.minAmount !== undefined) {
      filtered = filtered.filter(t => Math.abs(t.amount) >= searchFilters.minAmount!);
    }
    
    if (searchFilters.maxAmount !== undefined) {
      filtered = filtered.filter(t => Math.abs(t.amount) <= searchFilters.maxAmount!);
    }
    
    if (searchFilters.startDate) {
      const startDate = new Date(searchFilters.startDate);
      filtered = filtered.filter(t => new Date(t.createdAt) >= startDate);
    }
    
    if (searchFilters.endDate) {
      const endDate = new Date(searchFilters.endDate);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(t => new Date(t.createdAt) <= endDate);
    }

    // Legacy quick filters
    if (transactionTypeFilter !== 'all' && !searchFilters.type) {
      // Handle both 'earning' and 'site_visit_fee' types when filtering for site visit fees
      if (transactionTypeFilter === 'earning') {
        filtered = filtered.filter(t => t.type === 'earning' || t.type === 'site_visit_fee');
      } else {
        filtered = filtered.filter(t => t.type === transactionTypeFilter);
      }
    }

    if (dateRangeFilter !== 'all' && !searchFilters.startDate && !searchFilters.endDate) {
      const now = new Date();
      let startDate: Date;
      let endDate: Date = now;

      switch (dateRangeFilter) {
        case 'this_month':
          startDate = startOfMonth(now);
          endDate = endOfMonth(now);
          break;
        case 'last_month':
          startDate = startOfMonth(subMonths(now, 1));
          endDate = endOfMonth(subMonths(now, 1));
          break;
        case 'last_3_months':
          startDate = subMonths(now, 3);
          break;
        default:
          return filtered;
      }

      filtered = filtered.filter(t => 
        isWithinInterval(new Date(t.createdAt), { start: startDate, end: endDate })
      );
    }

    return filtered;
  }, [transactions, transactionTypeFilter, dateRangeFilter, searchFilters]);

  const earningsByMonth = useMemo(() => {
    const monthlyData: Record<string, number> = {};
    
    transactions
      .filter(t => t.type === 'earning' || t.type === 'site_visit_fee')
      .forEach(t => {
        const month = format(new Date(t.createdAt), 'MMM yyyy');
        monthlyData[month] = (monthlyData[month] || 0) + t.amount;
      });

    return Object.entries(monthlyData)
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
      .slice(-6);
  }, [transactions]);

  const siteVisitEarnings = useMemo(() => {
    return transactions
      .filter(t => (t.type === 'earning' || t.type === 'site_visit_fee') && t.siteVisitId)
      .slice(0, 10);
  }, [transactions]);

  const pendingWithdrawals = withdrawalRequests.filter(r => r.status === 'pending');
  const completedWithdrawals = withdrawalRequests.filter(r => r.status === 'approved');
  const rejectedWithdrawals = withdrawalRequests.filter(r => r.status === 'rejected');

  const [selectedStatementMonth, setSelectedStatementMonth] = useState<string>(() => format(new Date(), 'yyyy-MM'));

  const availableMonths = useMemo(() => {
    const monthSet = new Set<string>();
    transactions.forEach(t => {
      monthSet.add(format(new Date(t.createdAt), 'yyyy-MM'));
    });
    return Array.from(monthSet).sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  const monthlyStatement = useMemo(() => {
    if (!selectedStatementMonth || transactions.length === 0) return null;
    const [year, month] = selectedStatementMonth.split('-').map(Number);
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = endOfMonth(monthStart);

    const monthTxns = transactions
      .filter(t => {
        const d = new Date(t.createdAt);
        return isWithinInterval(d, { start: monthStart, end: monthEnd });
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const allSorted = [...transactions].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const beforeMonth = allSorted.filter(t => new Date(t.createdAt) < monthStart);

    // Use balanceBefore of first month transaction or balanceAfter of last prior transaction
    let openingBalance = 0;
    if (monthTxns.length > 0 && monthTxns[0].balanceBefore !== undefined) {
      openingBalance = monthTxns[0].balanceBefore;
    } else if (beforeMonth.length > 0) {
      openingBalance = beforeMonth[beforeMonth.length - 1].balanceAfter ?? 0;
    }

    const rows = monthTxns.map(t => {
      const credit = t.amount > 0 ? t.amount : 0;
      const debit = t.amount < 0 ? Math.abs(t.amount) : 0;
      const runningBalance = t.balanceAfter ?? 0;
      return { ...t, credit, debit, runningBalance };
    });

    const totalCredits = rows.reduce((s, r) => s + r.credit, 0);
    const totalDebits = rows.reduce((s, r) => s + r.debit, 0);
    const closingBalance = rows.length > 0 ? rows[rows.length - 1].runningBalance : openingBalance;

    return { openingBalance, closingBalance, totalCredits, totalDebits, rows, monthLabel: format(monthStart, 'MMMM yyyy') };
  }, [transactions, selectedStatementMonth]);

  const withdrawalSuccessRate = withdrawalRequests.length > 0
    ? (completedWithdrawals.length / withdrawalRequests.length) * 100
    : 0;

  const displayWithdrawals = useMemo(() => {
    switch (withdrawalStatusFilter) {
      case 'pending':
        return pendingWithdrawals;
      case 'approved':
        return completedWithdrawals;
      case 'rejected':
        return rejectedWithdrawals;
      default:
        return withdrawalRequests;
    }
  }, [withdrawalStatusFilter, withdrawalRequests, pendingWithdrawals, completedWithdrawals, rejectedWithdrawals]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
          <p className="text-blue-300/70">Synchronizing wallet data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-full">
      {/* Black App Bar - scoped to the content area, not the full viewport */}
      <div
        className="sticky top-0 bg-black text-white flex items-center justify-between px-4 z-50"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)', paddingBottom: '12px' }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold">My Wallet</h1>
            <p className="text-white/60 text-xs">Your personal payment account</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleRefresh}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => navigate('/notifications')}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors relative"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Cyber Background with Animated Grid - scoped to wallet content */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-blue-950 to-purple-950 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.05)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000,transparent)]"></div>
        <div className="absolute top-20 left-20 w-96 h-96 bg-blue-500/20 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-500/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      <div className="relative space-y-6 p-3 sm:p-4 md:p-6 lg:p-8">
        <PageInfoBanner
          title="My Wallet - Your Earnings & Withdrawals"
          description="This is YOUR personal wallet showing money you have EARNED from completed site visits, approved cost submissions, and retainer payments. From here you can request to WITHDRAW your earned funds. This is DIFFERENT from cost submissions (requesting reimbursement for expenses you spent -- use the Cost Submission page) and transportation advances (getting money upfront before a trip -- use the Down-Payment Approval page). Withdrawals requested here go through Tier 1 (Supervisor) and Tier 2 (Admin) approvals before Finance releases the payment."
          descriptionAr="هذه هي محفظتك الشخصية التي تعرض الأموال التي كسبتها من الزيارات الميدانية المكتملة، وطلبات التكاليف المعتمدة، ومدفوعات المكافآت الشهرية. من هنا يمكنك طلب سحب أموالك المكتسبة. هذه الصفحة مختلفة عن طلبات التكاليف (طلب استرداد المصاريف التي أنفقتها -- استخدم صفحة تقديم التكاليف) وعن السلف المسبقة للنقل (الحصول على أموال مقدماً قبل الرحلة -- استخدم صفحة الموافقة على الدفعات المقدمة). طلبات السحب المقدمة هنا تمر عبر الموافقة الأولى (المشرف) والموافقة الثانية (المدير) قبل أن يقوم قسم المالية بصرف الدفعة."
          workflowSteps={[
            { step: 1, role: 'System', action: 'Credits your wallet', description: 'Money is added to your wallet when site visit fees are paid, cost submissions are approved, or retainers are processed.' },
            { step: 2, role: 'Field Staff', action: 'Requests withdrawal (YOU ARE HERE)', description: 'You request to withdraw funds from your wallet balance to your bank account or mobile wallet.' },
            { step: 3, role: 'Supervisor', action: 'Approves (Tier 1)', description: 'Your supervisor reviews the withdrawal request on the Tier 1 Approvals page.' },
            { step: 4, role: 'Admin', action: 'Authorizes (Tier 2)', description: 'Admin gives final authorization on the Tier 2 Approvals page.' },
            { step: 5, role: 'Finance Admin', action: 'Sends payment', description: 'Finance releases the money to you on the Finance Processing page.' },
          ]}
          workflowStepsAr={[
            { step: 1, role: 'النظام', action: 'يُضيف رصيداً لمحفظتك', description: 'تُضاف الأموال إلى محفظتك عند صرف أتعاب الزيارات الميدانية، أو اعتماد طلبات التكاليف، أو معالجة المكافآت الشهرية.' },
            { step: 2, role: 'موظف ميداني', action: 'يطلب السحب (أنت هنا)', description: 'تقوم بطلب سحب الأموال من رصيد محفظتك إلى حسابك البنكي أو محفظتك الإلكترونية.' },
            { step: 3, role: 'المشرف', action: 'يوافق (المستوى الأول)', description: 'يراجع مشرفك طلب السحب في صفحة الموافقات - المستوى الأول.' },
            { step: 4, role: 'المدير', action: 'يعتمد (المستوى الثاني)', description: 'يمنح المدير الاعتماد النهائي في صفحة الموافقات - المستوى الثاني.' },
            { step: 5, role: 'مدير المالية', action: 'يُرسل الدفعة', description: 'يقوم قسم المالية بصرف الأموال لك عبر صفحة المعالجة المالية.' },
          ]}
        />

        {/* Cyber Header */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-cyan-500/10 rounded-2xl blur-xl"></div>
          <div className="relative bg-gradient-to-r from-slate-900/90 via-blue-900/90 to-purple-900/90 backdrop-blur-xl border border-blue-500/30 rounded-2xl p-6 shadow-[0_0_30px_rgba(59,130,246,0.3)]">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-lg shadow-blue-500/50">
                  <WalletIcon className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-3">
                    My Wallet
                    <Badge className="bg-gradient-to-r from-green-500 to-emerald-600 text-white border-0 animate-pulse">
                      <Zap className="w-3 h-3 mr-1" />
                      ACTIVE
                    </Badge>
                  </h1>
                  <p className="text-blue-300/80 mt-1 text-lg">
                    Your personal payment account
                  </p>
                  <DataFreshnessBadge lastUpdated={lastRefresh} className="mt-2" />
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
                <button
                  type="button"
                  onClick={() => navigate('/finance')}
                  className="px-3 py-2 text-sm rounded-md bg-gradient-to-r from-slate-900/50 to-blue-900/50 border border-blue-500/30 text-blue-300 transition-all backdrop-blur-xl inline-flex items-center focus:outline-none focus:ring-2 focus:ring-blue-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px] w-full sm:w-auto"
                  data-testid="button-goto-finance"
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  <span className="hidden xs:inline">FINANCE</span>
                  <span className="xs:hidden">$</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/budget')}
                  className="px-3 py-2 text-sm rounded-md bg-gradient-to-r from-slate-900/50 to-blue-900/50 border border-blue-500/30 text-blue-300 transition-all backdrop-blur-xl inline-flex items-center focus:outline-none focus:ring-2 focus:ring-blue-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px] w-full sm:w-auto"
                  data-testid="button-goto-budget"
                >
                  <Activity className="w-4 h-4 mr-2" />
                  <span className="hidden xs:inline">BUDGET</span>
                  <span className="xs:hidden">B</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/cost-submission')}
                  className="px-3 py-2 text-sm rounded-md bg-gradient-to-r from-slate-900/50 to-blue-900/50 border border-blue-500/30 text-blue-300 transition-all backdrop-blur-xl inline-flex items-center focus:outline-none focus:ring-2 focus:ring-blue-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px] w-full sm:w-auto"
                  data-testid="button-goto-cost-submissions"
                >
                  <Receipt className="w-4 h-4 mr-2" />
                  <span className="hidden xs:inline">COSTS</span>
                  <span className="xs:hidden">C</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/down-payment-approval')}
                  className="px-3 py-2 text-sm rounded-md bg-gradient-to-r from-slate-900/50 to-blue-900/50 border border-blue-500/30 text-blue-300 transition-all backdrop-blur-xl inline-flex items-center focus:outline-none focus:ring-2 focus:ring-blue-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px] w-full sm:w-auto"
                  data-testid="button-goto-advances"
                >
                  <Banknote className="w-4 h-4 mr-2" />
                  <span className="hidden xs:inline">ADVANCES</span>
                  <span className="xs:hidden">A</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/withdrawal-approval')}
                  className="px-3 py-2 text-sm rounded-md bg-gradient-to-r from-slate-900/50 to-blue-900/50 border border-blue-500/30 text-blue-300 transition-all backdrop-blur-xl inline-flex items-center focus:outline-none focus:ring-2 focus:ring-blue-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px] w-full sm:w-auto"
                  data-testid="button-goto-withdrawal-approval"
                >
                  <ArrowUpRight className="w-4 h-4 mr-2" />
                  <span className="hidden xs:inline">WITHDRAWALS</span>
                  <span className="xs:hidden">W</span>
                </button>
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="px-3 py-2 text-sm rounded-md bg-gradient-to-r from-slate-900/50 to-blue-900/50 border border-blue-500/30 text-blue-300 transition-all backdrop-blur-xl inline-flex items-center focus:outline-none focus:ring-2 focus:ring-blue-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px] w-full sm:w-auto"
                  data-testid="button-refresh-wallet"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  <span className="hidden xs:inline">REFRESH</span>
                  <span className="xs:hidden">↻</span>
                </button>
                <button
                  type="button"
                  onClick={() => exportTransactionsToCSV(filteredTransactions, wallet)}
                  className="px-3 py-2 text-sm rounded-md bg-gradient-to-r from-green-900/50 to-emerald-900/50 border border-green-500/30 text-green-300 hover:border-green-400 hover:shadow-[0_0_15px_rgba(34,197,94,0.3)] transition-all backdrop-blur-xl inline-flex items-center focus:outline-none focus:ring-2 focus:ring-green-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px] w-full sm:w-auto"
                  data-testid="button-export-csv"
                >
                  <Download className="w-4 h-4 mr-2" />
                  <span className="hidden xs:inline">CSV</span>
                  <span className="xs:hidden">CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => exportTransactionsToPDF(filteredTransactions, wallet, DEFAULT_CURRENCY)}
                  className="px-3 py-2 text-sm rounded-md bg-gradient-to-r from-red-900/50 to-pink-900/50 border border-red-500/30 text-red-300 hover:border-red-400 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-all backdrop-blur-xl inline-flex items-center focus:outline-none focus:ring-2 focus:ring-red-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px] w-full sm:w-auto"
                  data-testid="button-export-pdf"
                >
                  <Download className="w-4 h-4 mr-2" />
                  <span className="hidden xs:inline">PDF</span>
                  <span className="xs:hidden">PDF</span>
                </button>
                <button
                  type="button"
                  onClick={handleClearAllFilters}
                  className="px-3 py-2 text-sm rounded-md bg-gradient-to-r from-orange-900/50 to-amber-900/50 border border-orange-500/30 text-orange-300 hover:border-orange-400 hover:shadow-[0_0_15px_rgba(249,115,22,0.3)] transition-all backdrop-blur-xl inline-flex items-center focus:outline-none focus:ring-2 focus:ring-orange-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px] w-full sm:w-auto"
                  data-testid="button-clear-filters"
                >
                  <X className="w-4 h-4 mr-2" />
                  <span className="hidden xs:inline">CLEAR FILTERS</span>
                  <span className="xs:hidden">✕</span>
                </button>
            {!currentUser?.bankAccount?.accountNumber && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 text-xs">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Add your <a href="/settings" className="underline font-semibold hover:text-amber-100">bank account</a> in Settings before requesting a withdrawal.</span>
              </div>
            )}
            <Dialog open={withdrawalDialogOpen} onOpenChange={setWithdrawalDialogOpen}>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="px-4 py-2 rounded-md bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white border-0 shadow-[0_0_20px_rgba(168,85,247,0.5)] transition-all inline-flex items-center focus:outline-none focus:ring-2 focus:ring-purple-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
                  data-testid="button-request-withdrawal"
                  disabled={!currentUser?.bankAccount?.accountNumber}
                  title={!currentUser?.bankAccount?.accountNumber ? 'Add bank account in Settings first' : undefined}
                >
                  <TrendingDown className="w-4 h-4 mr-2" />
                  REQUEST WITHDRAWAL
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md mx-4 max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Request Withdrawal</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  {/* Bank Account Destination Info */}
                  {currentUser?.bankAccount?.accountNumber && (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-start gap-2">
                      <Banknote className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                      <div className="text-xs space-y-0.5">
                        <p className="font-semibold text-emerald-300">Funds will be sent to / سيتم إرسال المبلغ إلى:</p>
                        <p className="text-emerald-200"><span className="text-emerald-400">Account Name:</span> {currentUser.bankAccount.accountName}</p>
                        <p className="text-emerald-200"><span className="text-emerald-400">Account No:</span> {currentUser.bankAccount.accountNumber}</p>
                        <p className="text-emerald-200"><span className="text-emerald-400">Branch:</span> {currentUser.bankAccount.branch}</p>
                      </div>
                    </div>
                  )}
                  <div className="grid gap-2">
                    <Label htmlFor="amount">Amount ({DEFAULT_CURRENCY})</Label>
                    <Input
                      id="amount"
                      type="number"
                      min="0"
                      step="0.01"
                      max={currentBalance}
                      value={withdrawalAmount}
                      onChange={(e) => setWithdrawalAmount(e.target.value)}
                      placeholder="Enter amount"
                      className="h-11"
                      data-testid="input-withdrawal-amount"
                    />
                    <p className={`text-sm ${parseFloat(withdrawalAmount || '0') > currentBalance ? 'text-red-500' : 'text-muted-foreground'}`}>
                      Available balance: {formatCurrency(currentBalance)}
                      {parseFloat(withdrawalAmount || '0') > currentBalance && (
                        <span className="ml-2 font-medium">(Insufficient funds)</span>
                      )}
                    </p>
                    {currentBalance === 0 && (
                      <p className="text-sm text-amber-500 mt-1">
                        You need earnings in your wallet before you can request a withdrawal.
                      </p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="reason">Reason</Label>
                    <Textarea
                      id="reason"
                      value={withdrawalReason}
                      onChange={(e) => setWithdrawalReason(e.target.value)}
                      placeholder="Transportation costs, accommodation, etc."
                      className="min-h-[80px]"
                      data-testid="input-withdrawal-reason"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="method">Payment Method</Label>
                    <Select value={withdrawalMethod} onValueChange={setWithdrawalMethod}>
                      <SelectTrigger data-testid="select-withdrawal-method">
                        <SelectValue placeholder="Select payment method" />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentMethods.map((method) => (
                          <SelectItem key={method.id} value={method.name}>
                            {method.name} ({method.type.replace('_', ' ')})
                          </SelectItem>
                        ))}
                        <SelectItem value="other">Other (specify in reason)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-3 justify-end pt-4 border-t border-purple-500/20">
                  <button
                    type="button"
                    onClick={() => setWithdrawalDialogOpen(false)}
                    className="px-4 py-2 rounded-md bg-slate-800/50 hover:bg-slate-800/70 text-purple-200 border border-purple-500/20 transition focus:outline-none focus:ring-2 focus:ring-purple-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px]"
                    data-testid="button-cancel-withdrawal"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleWithdrawalRequest}
                    disabled={!withdrawalAmount || parseFloat(withdrawalAmount) <= 0 || parseFloat(withdrawalAmount) > currentBalance}
                    className="px-4 py-2 rounded-md bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white border border-purple-400/50 shadow-[0_0_15px_rgba(168,85,247,0.3)] disabled:opacity-50 disabled:cursor-not-allowed transition focus:outline-none focus:ring-2 focus:ring-purple-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px]"
                    data-testid="button-submit-withdrawal"
                  >
                    Submit Request
                  </button>
                </div>
              </DialogContent>
            </Dialog>
              </div>
            </div>
          </div>
        </div>

        {/* Status Alerts */}
        {pendingWithdrawals.length > 0 && (
          <Card className="bg-gradient-to-r from-orange-900/50 to-red-900/50 border-orange-500/40 backdrop-blur-xl shadow-[0_0_20px_rgba(251,146,60,0.2)]">
            <CardContent className="flex items-center gap-3 p-4">
              <AlertCircle className="w-5 h-5 text-orange-400 animate-pulse" />
              <div className="flex-1">
                <p className="text-sm font-medium text-orange-200">
                  You have {pendingWithdrawals.length} pending withdrawal request{pendingWithdrawals.length !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-orange-300/70 mt-0.5">
                  Total amount: {formatCurrency(pendingWithdrawals.reduce((sum, r) => sum + r.amount, 0))}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="bg-gradient-to-br from-slate-900/80 to-blue-900/80 border-blue-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(59,130,246,0.2)]">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium uppercase tracking-wide text-blue-300">
              Current Balance
            </CardTitle>
            <WalletIcon className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-lg sm:text-xl lg:text-2xl font-bold tabular-nums bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent break-words leading-tight max-w-full">
              {formatCurrency(currentBalance)}
            </div>
            <p className="text-xs text-blue-300/70 mt-1">
              Available for withdrawal
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-slate-900/80 to-purple-900/80 border-purple-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(168,85,247,0.2)]">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium uppercase tracking-wide text-purple-300">
              Total Earned
            </CardTitle>
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-green-400" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-lg sm:text-xl lg:text-2xl font-bold tabular-nums bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent break-words leading-tight max-w-full">
              {formatCurrency(stats?.totalEarned || 0)}
            </div>
            <p className="text-xs text-purple-300/70 mt-1 flex items-center gap-1">
              <Receipt className="w-3 h-3" />
              {stats?.completedSiteVisits || 0} visits
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-slate-900/80 to-orange-900/80 border-orange-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(251,146,60,0.2)]">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium uppercase tracking-wide text-orange-300">
              Pending Withdrawals
            </CardTitle>
            <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400 animate-pulse" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-lg sm:text-xl lg:text-2xl font-bold tabular-nums bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent break-words leading-tight max-w-full">
              {formatCurrency(stats?.pendingWithdrawals || 0)}
            </div>
            <p className="text-xs text-orange-300/70 mt-1">
              {pendingWithdrawals.length} request{pendingWithdrawals.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-slate-900/80 to-cyan-900/80 border-cyan-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(34,211,238,0.2)]">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium uppercase tracking-wide text-cyan-300">
              Total Withdrawn
            </CardTitle>
            <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-lg sm:text-xl lg:text-2xl font-bold tabular-nums bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent break-words leading-tight max-w-full">
              {formatCurrency(stats?.totalWithdrawn || 0)}
            </div>
            <p className="text-xs text-cyan-300/70 mt-1">
              {completedWithdrawals.length} approved
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Weekly/Monthly Earnings Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Card className="bg-gradient-to-br from-slate-900/80 to-teal-900/80 border-teal-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(20,184,166,0.2)]">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium uppercase tracking-wide text-teal-300">
              This Week
            </CardTitle>
            <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-teal-400" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-lg sm:text-xl lg:text-2xl font-bold tabular-nums bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent break-words leading-tight max-w-full">
              {formatCurrency(stats?.weeklyEarnings || 0)}
            </div>
            <p className="text-xs text-teal-300/70 mt-1">
              {stats?.weeklySiteVisits || 0} site visit{(stats?.weeklySiteVisits || 0) !== 1 ? 's' : ''} completed
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-slate-900/80 to-rose-900/80 border-rose-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(244,63,94,0.2)]">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium uppercase tracking-wide text-rose-300">
              This Month
            </CardTitle>
            <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-rose-400" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-lg sm:text-xl lg:text-2xl font-bold tabular-nums bg-gradient-to-r from-rose-400 to-pink-400 bg-clip-text text-transparent break-words leading-tight max-w-full">
              {formatCurrency(stats?.monthlyEarnings || 0)}
            </div>
            <p className="text-xs text-rose-300/70 mt-1">
              {format(new Date(), 'MMMM yyyy')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-slate-900/80 to-green-900/80 border-green-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(34,197,94,0.2)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wide text-green-300">Withdrawal Success Rate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold tabular-nums bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">{withdrawalSuccessRate.toFixed(0)}%</span>
              {withdrawalSuccessRate >= 80 ? (
                <CheckCircle2 className="w-6 h-6 text-green-400 animate-pulse" />
              ) : (
                <AlertCircle className="w-6 h-6 text-orange-400 animate-pulse" />
              )}
            </div>
            <Progress value={withdrawalSuccessRate} className="h-2" />
            <p className="text-xs text-green-300/70">
              {completedWithdrawals.length} approved, {rejectedWithdrawals.length} rejected
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-slate-900/80 to-indigo-900/80 border-indigo-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(99,102,241,0.2)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wide text-indigo-300">Average Transaction</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg sm:text-xl lg:text-2xl font-bold tabular-nums bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              {transactions.length > 0
                ? formatCurrency(transactions.reduce((sum, t) => sum + t.amount, 0) / transactions.length)
                : formatCurrency(0)}
            </div>
            <p className="text-xs text-indigo-300/70 mt-1">
              Across {stats?.totalTransactions || 0} transactions
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-slate-900/80 to-emerald-900/80 border-emerald-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(16,185,129,0.2)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wide text-emerald-300">Activity Status</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Activity className="w-8 h-8 text-emerald-400 animate-pulse" />
            <div>
              <p className="text-lg font-semibold text-emerald-300">ACTIVE</p>
              <p className="text-xs text-emerald-300/70">
                Last transaction: {transactions.length > 0 ? format(new Date(transactions[0].createdAt), 'MMM dd, yyyy') : 'Never'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Advanced Transaction Search */}
      <TransactionSearch
        onSearch={(filters) => setSearchFilters(filters)}
        onClear={() => setSearchFilters({})}
        filters={searchFilters}
      />

      {/* Main Content Section */}
      <Card className="bg-gradient-to-br from-slate-900/90 to-blue-900/90 border border-blue-500/30 backdrop-blur-xl shadow-[0_0_30px_rgba(59,130,246,0.3)]">
        <CardContent className="p-3 sm:p-4 md:p-6 lg:p-8">
          {/* Main Content Tabs */}
          <Tabs defaultValue="overview" className="w-full">
            <div className="overflow-x-auto mb-6">
              <TabsList className="inline-flex w-max bg-gradient-to-r from-slate-900/80 to-blue-900/80 border border-blue-500/30 backdrop-blur-xl p-1 min-h-[44px]">
                <TabsTrigger 
                  value="overview" 
                  data-testid="tab-overview"
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-[0_0_15px_rgba(59,130,246,0.5)] text-blue-300 min-h-[44px] text-xs sm:text-sm flex-shrink-0 whitespace-nowrap"
                >
                  OVERVIEW
                </TabsTrigger>
                <TabsTrigger 
                  value="transactions" 
                  data-testid="tab-transactions"
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-[0_0_15px_rgba(59,130,246,0.5)] text-blue-300 min-h-[44px] text-xs sm:text-sm flex-shrink-0 whitespace-nowrap"
                >
                  TRANSACTIONS
                </TabsTrigger>
                <TabsTrigger 
                  value="withdrawals" 
                  data-testid="tab-withdrawals"
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-[0_0_15px_rgba(59,130,246,0.5)] text-blue-300 min-h-[44px] text-xs sm:text-sm flex-shrink-0 whitespace-nowrap"
                >
                  WITHDRAWALS
                </TabsTrigger>
                <TabsTrigger 
                  value="earnings" 
                  data-testid="tab-earnings"
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-[0_0_15px_rgba(59,130,246,0.5)] text-blue-300 min-h-[44px] text-xs sm:text-sm flex-shrink-0 whitespace-nowrap"
                >
                  EARNINGS
                </TabsTrigger>
                <TabsTrigger 
                  value="activity" 
                  data-testid="tab-activity"
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-[0_0_15px_rgba(59,130,246,0.5)] text-blue-300 min-h-[44px] text-xs sm:text-sm flex-shrink-0 whitespace-nowrap"
                >
                  ACTIVITY
                </TabsTrigger>
                <TabsTrigger 
                  value="statements" 
                  data-testid="tab-statements"
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-[0_0_15px_rgba(59,130,246,0.5)] text-blue-300 min-h-[44px] text-xs sm:text-sm flex-shrink-0 whitespace-nowrap"
                >
                  STATEMENTS
                </TabsTrigger>
                <TabsTrigger 
                  value="advances" 
                  data-testid="tab-advances"
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-600 data-[state=active]:to-orange-600 data-[state=active]:text-white data-[state=active]:shadow-[0_0_15px_rgba(245,158,11,0.5)] text-blue-300 min-h-[44px] text-xs sm:text-sm flex-shrink-0 whitespace-nowrap relative"
                >
                  MY ADVANCES
                  {pendingAdvanceConfirmations.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {pendingAdvanceConfirmations.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="cost-payments"
                  data-testid="tab-cost-payments"
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-[0_0_15px_rgba(16,185,129,0.5)] text-blue-300 min-h-[44px] text-xs sm:text-sm flex-shrink-0 whitespace-nowrap relative"
                >
                  COST PAYMENTS
                  {pendingCostPaymentConfirmations.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {pendingCostPaymentConfirmations.length}
                    </span>
                  )}
                </TabsTrigger>
                {isAdminUser && (
                  <TabsTrigger
                    value="all-advances"
                    data-testid="tab-all-advances"
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-[0_0_15px_rgba(139,92,246,0.5)] text-blue-300 min-h-[44px] text-xs sm:text-sm flex-shrink-0 whitespace-nowrap relative"
                  >
                    ALL ADVANCES
                    <span className="ml-1 text-[10px] bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded-full">
                      {advanceRequests.length}
                    </span>
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            {/* Transaction Search moved inside the section */}
            <div className="mb-6">
              <TransactionSearch
                onSearch={(filters) => setSearchFilters(filters)}
                onClear={() => setSearchFilters({})}
                filters={searchFilters}
              />
            </div>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">

          {/* Pending Receipt Confirmation Alerts */}
          {(pendingAdvanceConfirmations.length > 0 || pendingWithdrawalConfirmations.length > 0 || pendingCostPaymentConfirmations.length > 0) && (
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-300">
                  تأكيد استلام الأموال مطلوب / Fund Receipt Confirmation Required
                </p>
                <p className="text-xs text-amber-200/80 mt-0.5">
                  {pendingAdvanceConfirmations.length > 0 && (
                    <span>{pendingAdvanceConfirmations.length} transport advance{pendingAdvanceConfirmations.length !== 1 ? 's' : ''} awaiting your receipt confirmation. </span>
                  )}
                  {pendingWithdrawalConfirmations.length > 0 && (
                    <span>{pendingWithdrawalConfirmations.length} withdrawal{pendingWithdrawalConfirmations.length !== 1 ? 's' : ''} awaiting your receipt confirmation. </span>
                  )}
                  {pendingCostPaymentConfirmations.length > 0 && (
                    <span>{pendingCostPaymentConfirmations.length} cost payment{pendingCostPaymentConfirmations.length !== 1 ? 's' : ''} awaiting your receipt confirmation. </span>
                  )}
                  Please confirm in the respective tab below.
                </p>
              </div>
              <div className="flex gap-2 flex-wrap flex-shrink-0">
                {pendingAdvanceConfirmations.length > 0 && (
                  <button
                    onClick={() => {
                      const el = document.querySelector('[data-testid="tab-advances"]') as HTMLButtonElement;
                      el?.click();
                    }}
                    className="text-xs text-amber-300 underline underline-offset-2 hover:text-amber-100"
                  >
                    View Advances
                  </button>
                )}
                {pendingWithdrawalConfirmations.length > 0 && (
                  <button
                    onClick={() => {
                      const el = document.querySelector('[data-testid="tab-withdrawals"]') as HTMLButtonElement;
                      el?.click();
                    }}
                    className="text-xs text-amber-300 underline underline-offset-2 hover:text-amber-100"
                  >
                    View Withdrawals
                  </button>
                )}
                {pendingCostPaymentConfirmations.length > 0 && (
                  <button
                    onClick={() => {
                      const el = document.querySelector('[data-testid="tab-cost-payments"]') as HTMLButtonElement;
                      el?.click();
                    }}
                    className="text-xs text-amber-300 underline underline-offset-2 hover:text-amber-100"
                  >
                    View Cost Payments
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Recent Transactions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="w-4 h-4" />
                  Recent Transactions
                </CardTitle>
                <CardDescription>Your latest 5 transactions</CardDescription>
              </CardHeader>
              <CardContent>
                {transactions.slice(0, 5).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No transactions yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {transactions.slice(0, 5).map((transaction) => (
                      <div key={transaction.id} className="flex items-center justify-between p-3 rounded-md border">
                        <div className="flex items-center gap-3">
                          {getTransactionIcon(transaction.type)}
                          <div>
                            <p className="text-sm font-medium capitalize">
                              {transaction.type.replace('_', ' ')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(transaction.createdAt), 'MMM dd, yyyy HH:mm')}
                            </p>
                          </div>
                        </div>
                        <div className={`text-sm font-semibold tabular-nums ${transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {transaction.amount >= 0 ? '+' : ''}
                          {formatCurrency(transaction.amount, transaction.currency)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Monthly Earnings Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Earnings by Month
                </CardTitle>
                <CardDescription>Last 6 months earnings trend</CardDescription>
              </CardHeader>
              <CardContent>
                {earningsByMonth.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No earnings data yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {earningsByMonth.map(([month, amount]) => {
                      const maxAmount = Math.max(...earningsByMonth.map(([, amt]) => amt));
                      const percentage = (amount / maxAmount) * 100;
                      return (
                        <div key={month} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{month}</span>
                            <span className="font-semibold tabular-nums">{formatCurrency(amount)}</span>
                          </div>
                          <Progress value={percentage} className="h-2" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Payment Methods Card */}
            <PaymentMethodsCard />
          </div>

          {/* Site Visit Earnings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="w-4 h-4" />
                Recent Site Visit Earnings
              </CardTitle>
              <CardDescription>Fees earned from your latest site visits</CardDescription>
            </CardHeader>
            <CardContent>
              {siteVisitEarnings.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No site visit earnings yet</p>
                </div>
              ) : (
                <>
                  {/* Mobile Card Layout */}
                  <div className="block sm:hidden space-y-3">
                    {siteVisitEarnings.map((transaction) => (
                      <div key={transaction.id} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-200 truncate">
                              {transaction.description || 'Site visit fee'}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">
                              ID: {transaction.siteVisitId?.slice(0, 8)}...
                            </p>
                          </div>
                          <div className="text-right ml-2">
                            <p className="text-lg font-bold text-green-400 tabular-nums">
                              +{formatCurrency(transaction.amount, transaction.currency)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>{format(new Date(transaction.createdAt), 'MMM dd, yyyy')}</span>
                          {transaction.balanceAfter !== undefined && (
                            <span>Balance: {formatCurrency(transaction.balanceAfter, transaction.currency)}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table Layout */}
                  <div className="hidden sm:block rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Site Visit ID</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {siteVisitEarnings.map((transaction) => (
                          <TableRow key={transaction.id}>
                            <TableCell className="font-mono text-sm">
                              {transaction.siteVisitId?.slice(0, 8)}...
                            </TableCell>
                            <TableCell className="max-w-xs truncate">
                              {transaction.description || 'Site visit fee'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(transaction.createdAt), 'MMM dd, yyyy')}
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums text-green-600">
                              +{formatCurrency(transaction.amount, transaction.currency)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle>Transaction History</CardTitle>
                  <CardDescription>All your wallet transactions</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={transactionTypeFilter} onValueChange={setTransactionTypeFilter}>
                    <SelectTrigger className="w-[160px] min-h-[44px]" data-testid="select-transaction-type">
                      <Filter className="w-4 h-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="earning">Site Visit Fees</SelectItem>
                      <SelectItem value="down_payment">Transport Advances</SelectItem>
                      <SelectItem value="withdrawal">Withdrawals</SelectItem>
                      <SelectItem value="adjustment">Adjustments</SelectItem>
                      <SelectItem value="bonus">Bonuses</SelectItem>
                      <SelectItem value="penalty">Penalties</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={dateRangeFilter} onValueChange={setDateRangeFilter}>
                    <SelectTrigger className="w-[160px] min-h-[44px]" data-testid="select-date-range">
                      <Calendar className="w-4 h-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="this_month">This Month</SelectItem>
                      <SelectItem value="last_month">Last Month</SelectItem>
                      <SelectItem value="last_3_months">Last 3 Months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredTransactions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No transactions found</p>
                </div>
              ) : (
                <>
                  {/* Mobile Card Layout */}
                  <div className="block sm:hidden space-y-3">
                    {filteredTransactions.map((transaction) => (
                      <div key={transaction.id} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {getTransactionIcon(transaction.type)}
                            <span className="text-sm font-medium capitalize text-slate-200">
                              {transaction.type.replace('_', ' ')}
                            </span>
                          </div>
                          <div className={`text-lg font-bold tabular-nums ${transaction.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {transaction.amount >= 0 ? '+' : ''}
                            {formatCurrency(transaction.amount, transaction.currency)}
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <p className="text-sm text-slate-300 leading-relaxed">
                            {transaction.description || '-'}
                          </p>
                          
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span>{format(new Date(transaction.createdAt), 'MMM dd, yyyy HH:mm')}</span>
                            {transaction.balanceAfter !== undefined && (
                              <span className="font-medium">
                                Balance: {formatCurrency(transaction.balanceAfter, transaction.currency)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table Layout */}
                  <div className="hidden sm:block rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[120px]">Type</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Balance After</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTransactions.map((transaction) => (
                          <TableRow key={transaction.id} data-testid={`row-transaction-${transaction.id}`}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getTransactionIcon(transaction.type)}
                                <span className="text-sm capitalize">
                                  {transaction.type.replace('_', ' ')}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="max-w-md truncate">
                              {transaction.description || '-'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(transaction.createdAt), 'MMM dd, yyyy HH:mm')}
                            </TableCell>
                            <TableCell className={`text-right font-semibold tabular-nums ${transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {transaction.amount >= 0 ? '+' : ''}
                              {formatCurrency(transaction.amount, transaction.currency)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium">
                              {transaction.balanceAfter !== undefined
                                ? formatCurrency(transaction.balanceAfter, transaction.currency)
                                : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Withdrawals Tab */}
        <TabsContent value="withdrawals" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle>Withdrawal Requests</CardTitle>
                  <CardDescription>Manage and track your withdrawal requests</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => exportWithdrawalsToCSV(displayWithdrawals, withdrawalStatusFilter)}
                    className="px-3 py-1.5 text-sm rounded-md bg-gradient-to-r from-green-900/50 to-emerald-900/50 border border-green-500/30 text-green-300 hover:border-green-400 hover:shadow-[0_0_15px_rgba(34,197,94,0.3)] transition-all backdrop-blur-xl inline-flex items-center focus:outline-none focus:ring-2 focus:ring-green-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px]"
                    data-testid="button-export-withdrawals-csv"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => exportWithdrawalsToPDF(displayWithdrawals, withdrawalStatusFilter)}
                    className="px-3 py-1.5 text-sm rounded-md bg-gradient-to-r from-red-900/50 to-pink-900/50 border border-red-500/30 text-red-300 hover:border-red-400 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-all backdrop-blur-xl inline-flex items-center focus:outline-none focus:ring-2 focus:ring-red-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px]"
                    data-testid="button-export-withdrawals-pdf"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    PDF
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs value={withdrawalStatusFilter} onValueChange={(value: any) => setWithdrawalStatusFilter(value)} className="mb-4">
                <TabsList className="grid w-full max-w-md grid-cols-2 sm:grid-cols-4">
                  <TabsTrigger value="all" data-testid="tab-withdrawals-all" className="min-h-[44px] text-xs sm:text-sm">
                    All ({withdrawalRequests.length})
                  </TabsTrigger>
                  <TabsTrigger value="pending" data-testid="tab-withdrawals-pending" className="min-h-[44px] text-xs sm:text-sm">
                    Pending ({pendingWithdrawals.length})
                  </TabsTrigger>
                  <TabsTrigger value="approved" data-testid="tab-withdrawals-approved" className="min-h-[44px] text-xs sm:text-sm">
                    Approved ({completedWithdrawals.length})
                  </TabsTrigger>
                  <TabsTrigger value="rejected" data-testid="tab-withdrawals-rejected" className="min-h-[44px] text-xs sm:text-sm">
                    Rejected ({rejectedWithdrawals.length})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              
              {displayWithdrawals.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No {withdrawalStatusFilter !== 'all' ? withdrawalStatusFilter : ''} withdrawal requests found</p>
                </div>
              ) : (
                <>
                  {/* Mobile Card Layout */}
                  <div className="block sm:hidden space-y-3">
                    {displayWithdrawals.map((request) => (
                      <div key={request.id} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            {getWithdrawalStatusBadge(request.status, request)}
                            {currentUser && (request.status === 'pending' || request.status === 'supervisor_approved') && (
                              <WalletSignatureIntegration
                                transaction={{
                                  id: request.id,
                                  walletId: wallet?.id,
                                  type: 'withdrawal',
                                  amount: request.amount,
                                  currency: request.currency || DEFAULT_CURRENCY,
                                  description: request.requestReason,
                                  createdAt: request.createdAt,
                                  signatureStatus: (request as any).signatureStatus,
                                }}
                                userId={currentUser.id}
                                userName={currentUser.name || currentUser.email || 'User'}
                                userEmail={currentUser.email}
                                userRole={currentUser.role}
                                showBadgeOnly
                              />
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold tabular-nums text-slate-200">
                              {formatCurrency(request.amount, request.currency)}
                            </p>
                            <p className="text-xs text-slate-400">
                              {format(new Date(request.createdAt), 'MMM dd, yyyy')}
                            </p>
                          </div>
                        </div>
                        
                        <div className="space-y-2 mb-3">
                          {request.requestReason && (
                            <div>
                              <p className="text-xs font-medium text-slate-400 mb-1">Reason</p>
                              <p className="text-sm text-slate-300">{request.requestReason}</p>
                            </div>
                          )}
                          
                          {request.paymentMethod && (
                            <div>
                              <p className="text-xs font-medium text-slate-400 mb-1">Payment Method</p>
                              <p className="text-sm text-slate-300">{request.paymentMethod}</p>
                            </div>
                          )}
                          
                          {request.supervisorNotes && (
                            <div>
                              <p className="text-xs font-medium text-slate-400 mb-1">Supervisor Notes</p>
                              <p className="text-sm text-slate-300">{request.supervisorNotes}</p>
                            </div>
                          )}

                          {request.fundReceiptConfirmed && request.fundReceiptConfirmedAt && (
                            <div>
                              <p className="text-xs font-medium text-emerald-400 mb-1">✓ تم تأكيد الاستلام / Receipt Confirmed</p>
                              <p className="text-xs text-slate-400">{format(new Date(request.fundReceiptConfirmedAt), 'MMM dd, yyyy HH:mm')}</p>
                              {request.fundReceiptNotes && <p className="text-xs text-slate-400 mt-1">{request.fundReceiptNotes}</p>}
                            </div>
                          )}
                        </div>
                        
                        <div className="space-y-2">
                          {request.status === 'pending' && (
                            <button
                              type="button"
                              onClick={() => cancelWithdrawalRequest(request.id)}
                              className="w-full px-3 py-2 text-sm rounded-md bg-red-900/20 hover:bg-red-900/30 text-red-300 border border-red-500/30 transition inline-flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-red-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px]"
                              data-testid={`button-cancel-${request.id}`}
                            >
                              <X className="w-3 h-3 mr-1" />
                              Cancel Request
                            </button>
                          )}
                          
                          {request.status === 'approved' && !request.fundReceiptConfirmed && (
                            <button
                              type="button"
                              onClick={() => setSignatureWithdrawalRequest(request)}
                              className="w-full px-3 py-2 text-sm rounded-md bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-300 border border-emerald-500/30 transition inline-flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px]"
                              data-testid={`button-confirm-receipt-${request.id}`}
                            >
                              <CheckCircle2 className="w-4 h-4 mr-2" />
                              تأكيد الاستلام / Confirm Received
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table Layout */}
                  <div className="hidden sm:block rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Status</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Requested</TableHead>
                          <TableHead>Supervisor Notes</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {displayWithdrawals.map((request) => (
                          <TableRow key={request.id} data-testid={`row-withdrawal-${request.id}`}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getWithdrawalStatusBadge(request.status, request)}
                                {currentUser && (request.status === 'pending' || request.status === 'supervisor_approved') && (
                                  <WalletSignatureIntegration
                                    transaction={{
                                      id: request.id,
                                      walletId: wallet?.id,
                                      type: 'withdrawal',
                                      amount: request.amount,
                                      currency: request.currency || DEFAULT_CURRENCY,
                                      description: request.requestReason,
                                      createdAt: request.createdAt,
                                      signatureStatus: (request as any).signatureStatus,
                                    }}
                                    userId={currentUser.id}
                                    userName={currentUser.name || currentUser.email || 'User'}
                                    userEmail={currentUser.email}
                                    userRole={currentUser.role}
                                    showBadgeOnly
                                  />
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-semibold tabular-nums">
                              {formatCurrency(request.amount, request.currency)}
                            </TableCell>
                            <TableCell className="max-w-xs truncate">
                              {request.requestReason || '-'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {request.paymentMethod || '-'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(request.createdAt), 'MMM dd, yyyy HH:mm')}
                            </TableCell>
                            <TableCell className="max-w-xs truncate">
                              {request.supervisorNotes || '-'}
                              {request.fundReceiptConfirmed && request.fundReceiptConfirmedAt && (
                                <div className="mt-1">
                                  <span className="text-xs text-emerald-400">✓ Received {format(new Date(request.fundReceiptConfirmedAt), 'MMM dd')}</span>
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                {request.status === 'pending' && (
                                  <button
                                    type="button"
                                    onClick={() => cancelWithdrawalRequest(request.id)}
                                    className="px-3 py-1.5 text-sm rounded-md bg-red-900/20 hover:bg-red-900/30 text-red-300 border border-red-500/30 transition inline-flex items-center focus:outline-none focus:ring-2 focus:ring-red-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px]"
                                    data-testid={`button-cancel-${request.id}`}
                                  >
                                    <X className="w-3 h-3 mr-1" />
                                    Cancel
                                  </button>
                                )}
                                {request.status === 'approved' && !request.fundReceiptConfirmed && (
                                  <button
                                    type="button"
                                    onClick={() => setSignatureWithdrawalRequest(request)}
                                    className="px-3 py-1.5 text-sm rounded-md bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-300 border border-emerald-500/30 transition inline-flex items-center focus:outline-none focus:ring-2 focus:ring-emerald-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 min-h-[44px]"
                                    data-testid={`button-confirm-receipt-desktop-${request.id}`}
                                  >
                                    <CheckCircle2 className="w-3 h-3 mr-1" />
                                    Confirm Received
                                  </button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Earnings Tab */}
        <TabsContent value="earnings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Site Visit Earnings Breakdown</CardTitle>
              <CardDescription>Detailed earnings from all completed site visits</CardDescription>
            </CardHeader>
            <CardContent>
              {siteVisitEarnings.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No site visit earnings yet</p>
                </div>
              ) : (
                <>
                  {/* Mobile Card Layout */}
                  <div className="block sm:hidden space-y-3">
                    {siteVisitEarnings.map((transaction) => (
                      <div key={transaction.id} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Receipt className="w-4 h-4 text-green-500" />
                            <span className="text-sm font-medium text-slate-200">Site Visit Fee</span>
                          </div>
                          <div className="text-lg font-bold tabular-nums text-green-400">
                            +{formatCurrency(transaction.amount, transaction.currency)}
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span className="font-mono bg-slate-700/50 px-2 py-1 rounded text-slate-300">
                              {transaction.siteVisitId?.slice(0, 8)}...
                            </span>
                          </div>
                          
                          <p className="text-sm text-slate-300 leading-relaxed">
                            {transaction.description || 'Site visit fee'}
                          </p>
                          
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span>{format(new Date(transaction.createdAt), 'MMM dd, yyyy HH:mm')}</span>
                            {transaction.balanceAfter !== undefined && (
                              <span className="font-medium">
                                Balance: {formatCurrency(transaction.balanceAfter, transaction.currency)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table Layout */}
                  <div className="hidden sm:block rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Site Visit ID</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Date Earned</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Balance After</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {siteVisitEarnings.map((transaction) => (
                          <TableRow key={transaction.id}>
                            <TableCell className="font-mono text-sm">
                              {transaction.siteVisitId?.slice(0, 12)}...
                            </TableCell>
                            <TableCell className="max-w-md truncate">
                              {transaction.description || 'Site visit fee'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(transaction.createdAt), 'MMM dd, yyyy HH:mm')}
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums text-green-600">
                              +{formatCurrency(transaction.amount, transaction.currency)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium">
                              {transaction.balanceAfter !== undefined
                                ? formatCurrency(transaction.balanceAfter, transaction.currency)
                                : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Activity Summary</CardTitle>
                <CardDescription>Your wallet activity overview</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-md border">
                  <div className="flex items-center gap-3">
                    <Receipt className="w-5 h-5 text-blue-600" />
                    <span className="text-sm font-medium">Total Transactions</span>
                  </div>
                  <span className="text-lg font-bold tabular-nums">{stats?.totalTransactions || 0}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-md border">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                    <span className="text-sm font-medium">Site Visits Completed</span>
                  </div>
                  <span className="text-lg font-bold tabular-nums">{stats?.completedSiteVisits || 0}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-md border">
                  <div className="flex items-center gap-3">
                    <TrendingDown className="w-5 h-5 text-orange-600" />
                    <span className="text-sm font-medium">Withdrawal Requests</span>
                  </div>
                  <span className="text-lg font-bold tabular-nums">{withdrawalRequests.length}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-md border">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <span className="text-sm font-medium">Approved Withdrawals</span>
                  </div>
                  <span className="text-lg font-bold tabular-nums">{completedWithdrawals.length}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Performance Metrics</CardTitle>
                <CardDescription>Key performance indicators</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Earnings Growth</span>
                    <span className="text-sm font-semibold tabular-nums">
                      {stats?.totalEarned && stats.totalEarned > 0 ? '100%' : '0%'}
                    </span>
                  </div>
                  <Progress value={stats?.totalEarned && stats.totalEarned > 0 ? 100 : 0} className="h-2" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Withdrawal Rate</span>
                    <span className="text-sm font-semibold tabular-nums">
                      {stats?.totalEarned && stats.totalEarned > 0
                        ? ((stats.totalWithdrawn / stats.totalEarned) * 100).toFixed(0)
                        : 0}%
                    </span>
                  </div>
                  <Progress 
                    value={stats?.totalEarned && stats.totalEarned > 0
                      ? (stats.totalWithdrawn / stats.totalEarned) * 100
                      : 0} 
                    className="h-2" 
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Approval Success</span>
                    <span className="text-sm font-semibold tabular-nums">{withdrawalSuccessRate.toFixed(0)}%</span>
                  </div>
                  <Progress value={withdrawalSuccessRate} className="h-2" />
                </div>
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Account Status: <span className="font-semibold text-green-600">Active & Healthy</span>
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Statements Tab - Bank-like monthly statements */}
        <TabsContent value="statements" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-400" />
                  <div>
                    <CardTitle>Monthly Statement</CardTitle>
                    <CardDescription>Bank-style account statement</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={selectedStatementMonth} onValueChange={setSelectedStatementMonth}>
                    <SelectTrigger className="w-[180px] min-h-[44px]" data-testid="select-statement-month">
                      <Calendar className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMonths.map(m => {
                        const [y, mo] = m.split('-').map(Number);
                        return (
                          <SelectItem key={m} value={m}>
                            {format(new Date(y, mo - 1, 1), 'MMMM yyyy')}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {monthlyStatement && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!monthlyStatement) return;
                        const csvRows = [
                          ['Date', 'Type', 'Description', 'Credit (SDG)', 'Debit (SDG)', 'Balance (SDG)'],
                          ['', '', 'Opening Balance', '', '', monthlyStatement.openingBalance.toFixed(2)],
                          ...monthlyStatement.rows.map(r => [
                            format(new Date(r.createdAt), 'yyyy-MM-dd HH:mm'),
                            r.type,
                            (r.description || '').replace(/,/g, ';'),
                            r.credit > 0 ? r.credit.toFixed(2) : '',
                            r.debit > 0 ? r.debit.toFixed(2) : '',
                            r.runningBalance.toFixed(2),
                          ]),
                          ['', '', 'Closing Balance', monthlyStatement.totalCredits.toFixed(2), monthlyStatement.totalDebits.toFixed(2), monthlyStatement.closingBalance.toFixed(2)],
                        ];
                        const csv = csvRows.map(r => r.join(',')).join('\n');
                        const blob = new Blob([csv], { type: 'text/csv' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `wallet-statement-${selectedStatementMonth}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="px-3 py-2 text-sm rounded-md bg-gradient-to-r from-green-900/50 to-emerald-900/50 border border-green-500/30 text-green-300 transition-all backdrop-blur-xl inline-flex items-center min-h-[44px]"
                      data-testid="button-export-statement-csv"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export CSV
                    </button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!monthlyStatement || monthlyStatement.rows.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p>No transactions for this month</p>
                  <p className="text-xs mt-1">Select a different month to view its statement</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Statement Header Summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-md border bg-slate-800/30">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Opening Balance</p>
                      <p className="text-lg font-bold tabular-nums text-blue-300 mt-1">
                        {formatCurrency(monthlyStatement.openingBalance)}
                      </p>
                    </div>
                    <div className="p-3 rounded-md border bg-slate-800/30">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Credits</p>
                      <p className="text-lg font-bold tabular-nums text-green-400 mt-1">
                        +{formatCurrency(monthlyStatement.totalCredits)}
                      </p>
                    </div>
                    <div className="p-3 rounded-md border bg-slate-800/30">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Debits</p>
                      <p className="text-lg font-bold tabular-nums text-red-400 mt-1">
                        -{formatCurrency(monthlyStatement.totalDebits)}
                      </p>
                    </div>
                    <div className="p-3 rounded-md border bg-slate-800/30">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Closing Balance</p>
                      <p className="text-lg font-bold tabular-nums text-blue-300 mt-1">
                        {formatCurrency(monthlyStatement.closingBalance)}
                      </p>
                    </div>
                  </div>

                  {/* Mobile Statement View */}
                  <div className="block sm:hidden space-y-2">
                    <div className="p-3 rounded-md border border-dashed border-blue-500/30 bg-blue-900/10 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Opening Balance</span>
                      <span className="text-sm font-semibold tabular-nums text-blue-300">{formatCurrency(monthlyStatement.openingBalance)}</span>
                    </div>
                    {monthlyStatement.rows.map((row) => (
                      <div key={row.id} className="p-3 rounded-md border border-slate-700/50 bg-slate-800/30">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getTransactionIcon(row.type)}
                            <div>
                              <span className="text-xs font-medium capitalize text-slate-300">
                                {row.type === 'earning' ? 'Site Visit Fee' : row.type === 'down_payment' ? 'Transport Advance' : row.type.replace('_', ' ')}
                              </span>
                              <p className="text-xs text-slate-500">{format(new Date(row.createdAt), 'dd MMM HH:mm')}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            {row.credit > 0 && <p className="text-sm font-semibold tabular-nums text-green-400">+{formatCurrency(row.credit)}</p>}
                            {row.debit > 0 && <p className="text-sm font-semibold tabular-nums text-red-400">-{formatCurrency(row.debit)}</p>}
                          </div>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed mb-1">{row.description || '-'}</p>
                        <div className="text-right">
                          <span className="text-xs text-muted-foreground">Balance: </span>
                          <span className="text-xs font-semibold tabular-nums text-blue-300">{formatCurrency(row.runningBalance)}</span>
                        </div>
                      </div>
                    ))}
                    <div className="p-3 rounded-md border border-dashed border-blue-500/30 bg-blue-900/10 flex items-center justify-between">
                      <span className="text-xs font-medium text-blue-300">Closing Balance</span>
                      <span className="text-sm font-bold tabular-nums text-blue-300">{formatCurrency(monthlyStatement.closingBalance)}</span>
                    </div>
                  </div>

                  {/* Desktop Statement Table */}
                  <div className="hidden sm:block rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-800/50">
                          <TableHead className="text-xs uppercase tracking-wide">Date</TableHead>
                          <TableHead className="text-xs uppercase tracking-wide">Type</TableHead>
                          <TableHead className="text-xs uppercase tracking-wide min-w-[200px]">Description</TableHead>
                          <TableHead className="text-xs uppercase tracking-wide text-right">Credit</TableHead>
                          <TableHead className="text-xs uppercase tracking-wide text-right">Debit</TableHead>
                          <TableHead className="text-xs uppercase tracking-wide text-right">Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow className="border-b border-dashed border-blue-500/20 bg-blue-900/5">
                          <TableCell colSpan={5} className="text-sm font-medium text-muted-foreground">Opening Balance</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-blue-300">{formatCurrency(monthlyStatement.openingBalance)}</TableCell>
                        </TableRow>
                        {monthlyStatement.rows.map((row) => (
                          <TableRow key={row.id} data-testid={`row-stmt-${row.id}`}>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {format(new Date(row.createdAt), 'dd MMM HH:mm')}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getTransactionIcon(row.type)}
                                <span className="text-sm capitalize whitespace-nowrap">
                                  {row.type === 'earning' ? 'Site Visit Fee' : row.type === 'down_payment' ? 'Transport Advance' : row.type.replace('_', ' ')}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm max-w-xs">
                              <p className="truncate" title={row.description || ''}>{row.description || '-'}</p>
                              {row.metadata?.advance_deducted && (
                                <p className="text-xs text-orange-400 mt-0.5">Advance deducted: -{formatCurrency(row.metadata.advance_deducted)}</p>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium text-green-400">
                              {row.credit > 0 ? `+${formatCurrency(row.credit)}` : ''}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium text-red-400">
                              {row.debit > 0 ? `-${formatCurrency(row.debit)}` : ''}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-semibold text-blue-300">
                              {formatCurrency(row.runningBalance)}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="border-t-2 border-blue-500/30 bg-blue-900/10">
                          <TableCell colSpan={3} className="text-sm font-bold text-blue-300">Closing Balance</TableCell>
                          <TableCell className="text-right tabular-nums font-bold text-green-400">+{formatCurrency(monthlyStatement.totalCredits)}</TableCell>
                          <TableCell className="text-right tabular-nums font-bold text-red-400">-{formatCurrency(monthlyStatement.totalDebits)}</TableCell>
                          <TableCell className="text-right tabular-nums font-bold text-blue-300">{formatCurrency(monthlyStatement.closingBalance)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>

                  <p className="text-xs text-muted-foreground text-center">
                    Statement for {monthlyStatement.monthLabel} &middot; {monthlyStatement.rows.length} transaction{monthlyStatement.rows.length !== 1 ? 's' : ''}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* My Advances Tab */}
        <TabsContent value="advances" className="space-y-4">
          <Card className="border-amber-500/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-amber-400" />
                My Transport Advances / سلفات النقل الخاصة بي
              </CardTitle>
              <CardDescription>
                Transport advances you have requested. Confirm receipt for paid advances below.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingAdvanceConfirmations.length > 0 && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 mb-4">
                  <Info className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-amber-300">
                      {pendingAdvanceConfirmations.length} transport advance{pendingAdvanceConfirmations.length !== 1 ? 's' : ''} awaiting your receipt confirmation
                      {' / '}
                      {pendingAdvanceConfirmations.length} سلفة نقل تنتظر تأكيد الاستلام
                    </p>
                    <p className="text-xs text-amber-300/70 mt-0.5">
                      Please view the receipt image and sign to confirm — scroll down to find the highlighted items.
                    </p>
                  </div>
                </div>
              )}
              {advanceLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading advances...</span>
                </div>
              ) : myAdvances.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Truck className="w-8 h-8 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No transport advance requests found.</p>
                  <p className="text-xs mt-1 text-slate-500">Advances are created when you request funds for a site visit.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {myAdvances.map((advance) => {
                    const receiptConfirmed = (advance.metadata as any)?.receipt_confirmation?.confirmed;
                    const confirmedAt = (advance.metadata as any)?.receipt_confirmation?.confirmedAt;
                    const canConfirm = (advance.status === 'partially_paid' || advance.status === 'fully_paid') && !receiptConfirmed;
                    const disbursedAmount = advance.approvedAmount ?? advance.requestedAmount;

                    const statusColors: Record<string, string> = {
                      pending_supervisor: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
                      pending_admin: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
                      approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
                      rejected: 'bg-red-500/10 text-red-400 border-red-500/30',
                      partially_paid: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
                      fully_paid: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
                      cancelled: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
                    };

                    const statusLabels: Record<string, string> = {
                      pending_supervisor: 'Pending Supervisor',
                      pending_admin: 'Pending Admin',
                      approved: 'Approved',
                      rejected: 'Rejected',
                      partially_paid: 'Partially Paid',
                      fully_paid: 'Fully Paid',
                      cancelled: 'Cancelled',
                    };

                    return (
                      <div
                        key={advance.id}
                        data-testid={`advance-card-${advance.id}`}
                        className={`rounded-lg border p-4 space-y-2 transition-all ${canConfirm ? 'border-amber-500/50 bg-amber-500/5' : 'border-border bg-card'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2 min-w-0">
                            <MapPin className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{advance.siteName}</p>
                              {advance.mmpName && (
                                <p className="text-xs text-muted-foreground">MMP: {advance.mmpName}</p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(advance.createdAt), 'MMM dd, yyyy')}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusColors[advance.status] || 'bg-slate-500/10 text-slate-400 border-slate-500/30'}`}>
                              {statusLabels[advance.status] || advance.status}
                            </span>
                            <span className="text-sm font-bold tabular-nums text-amber-300">
                              {formatCurrency(disbursedAmount)}
                            </span>
                          </div>
                        </div>

                        {/* Receipt status */}
                        {receiptConfirmed && confirmedAt && (
                          <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 rounded px-2 py-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>تم تأكيد الاستلام / Receipt confirmed on {format(new Date(confirmedAt), 'MMM dd, yyyy HH:mm')}</span>
                          </div>
                        )}

                        {/* Payment proof attached by finance */}
                        {advance.paymentProofUrl && (
                          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 space-y-1.5">
                            <p className="text-xs font-medium text-amber-300 flex items-center gap-1.5">
                              <Receipt className="w-3.5 h-3.5" />
                              Payment Receipt / إيصال الدفع
                            </p>
                            {advance.paymentProofUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                              <a href={advance.paymentProofUrl} target="_blank" rel="noopener noreferrer">
                                <img
                                  src={advance.paymentProofUrl}
                                  alt="Payment receipt"
                                  className="max-h-40 w-full rounded object-contain border border-amber-500/20 cursor-pointer hover:opacity-90 transition-opacity"
                                />
                              </a>
                            ) : (
                              <a
                                href={advance.paymentProofUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs text-amber-300 underline"
                              >
                                View Payment Receipt / عرض الإيصال
                              </a>
                            )}
                            {advance.paymentProofNotes && (
                              <p className="text-xs text-muted-foreground italic">"{advance.paymentProofNotes}"</p>
                            )}
                          </div>
                        )}

                        {canConfirm && (
                          <div className="pt-1">
                            <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 rounded px-2 py-1 mb-2">
                              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                              <span>Funds have been disbursed. Please confirm you received them / تم صرف المبلغ، يرجى تأكيد استلامه</span>
                            </div>
                            <button
                              data-testid={`confirm-advance-receipt-${advance.id}`}
                              onClick={() => setSignatureAdvanceRequest(advance)}
                              className="w-full py-2 px-4 rounded-md text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-black transition-colors"
                            >
                              ✓ تأكيد الاستلام / Confirm Receipt
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* COST PAYMENTS Tab */}
        <TabsContent value="cost-payments" className="space-y-4">
          <Card className="border-emerald-500/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-emerald-400" />
                My Cost Payments / مدفوعات التكاليف الخاصة بي
              </CardTitle>
              <CardDescription>
                Operational cost reimbursements paid by finance. Please confirm receipt for each paid item below. / تسديدات التكاليف التشغيلية المدفوعة من المالية. يرجى تأكيد الاستلام لكل بند مدفوع.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {costPaymentsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading cost payments...</span>
                </div>
              ) : myCostPayments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ClipboardCheck className="w-8 h-8 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No cost payments found.</p>
                  <p className="text-xs mt-1 text-slate-500">When finance marks a cost submission as paid, it will appear here for your confirmation.</p>
                  <p className="text-xs text-slate-500 mt-0.5">عند قيام المالية بتحديد تقديم تكلفة كمدفوع، سيظهر هنا لتأكيدك.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {myCostPayments.map((cost) => {
                    const receiptConfirmed = cost.fund_receipt_confirmed;
                    const confirmedAt = cost.fund_receipt_confirmed_at;
                    const canConfirm = !receiptConfirmed;
                    const amountSdg = (cost.amount_cents || 0) / 100;
                    const categoryLabels: Record<string, string> = {
                      permits: 'Permits & Licenses', incentives: 'Incentives & Allowances',
                      communications: 'Internet & Comms', training: 'Training',
                      transport: 'Transportation', general_transport: 'Transportation',
                      equipment: 'Equipment & Supplies', printing: 'Printing & Stationery',
                      meetings: 'Meetings', office_admin: 'Office Admin', other: 'Other',
                    };
                    const categoryLabel = categoryLabels[cost.expense_category] || cost.expense_category || 'Cost Submission';

                    return (
                      <div
                        key={cost.id}
                        data-testid={`cost-payment-card-${cost.id}`}
                        className={`rounded-lg border p-4 space-y-2 transition-all ${canConfirm ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-border bg-card'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2 min-w-0">
                            <Receipt className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{categoryLabel}</p>
                              {cost.description && (
                                <p className="text-xs text-muted-foreground truncate">{cost.description}</p>
                              )}
                              <div className="flex items-center gap-2 mt-0.5">
                                <Tag className="w-3 h-3 text-muted-foreground" />
                                <p className="text-xs text-muted-foreground font-mono">
                                  REF: {cost.id.slice(0, 8).toUpperCase()}
                                </p>
                              </div>
                              {cost.expense_date && (
                                <p className="text-xs text-muted-foreground">
                                  Date: {format(new Date(cost.expense_date), 'MMM dd, yyyy')}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-purple-500/10 text-purple-400 border-purple-500/30">
                              Paid / مدفوع
                            </span>
                            <span className="text-sm font-bold tabular-nums text-emerald-300">
                              {formatCurrency(amountSdg)}
                            </span>
                            {cost.paid_at && (
                              <span className="text-[10px] text-muted-foreground">
                                Paid {format(new Date(cost.paid_at), 'MMM d, yyyy')}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Receipt status */}
                        {receiptConfirmed && confirmedAt && (
                          <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 rounded px-2 py-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>تم تأكيد الاستلام / Receipt confirmed on {format(new Date(confirmedAt), 'MMM dd, yyyy HH:mm')}</span>
                          </div>
                        )}

                        {/* Payment proof attached by finance */}
                        {cost.payment_proof_url && (
                          <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 space-y-1.5">
                            <p className="text-xs font-medium text-purple-300 flex items-center gap-1.5">
                              <Receipt className="w-3.5 h-3.5" />
                              Payment Receipt / إيصال الدفع
                            </p>
                            {cost.payment_proof_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                              <a href={cost.payment_proof_url} target="_blank" rel="noopener noreferrer">
                                <img
                                  src={cost.payment_proof_url}
                                  alt="Payment receipt"
                                  className="max-h-40 w-full rounded object-contain border border-purple-500/20 cursor-pointer hover:opacity-90 transition-opacity"
                                />
                              </a>
                            ) : (
                              <a
                                href={cost.payment_proof_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs text-purple-300 underline"
                              >
                                View Payment Receipt / عرض الإيصال
                              </a>
                            )}
                            {cost.payment_proof_notes && (
                              <p className="text-xs text-muted-foreground italic">"{cost.payment_proof_notes}"</p>
                            )}
                          </div>
                        )}

                        {canConfirm && (
                          <div className="pt-1">
                            <div className="flex items-start gap-2 text-xs text-emerald-300 bg-emerald-500/10 rounded px-2 py-1 mb-2">
                              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                              <span>Finance has processed this payment. Please confirm you received the funds / قامت المالية بمعالجة هذه الدفعة. يرجى تأكيد استلام الأموال</span>
                            </div>
                            <button
                              data-testid={`confirm-cost-receipt-${cost.id}`}
                              type="button"
                              onClick={() => setSignatureCostPayment(cost)}
                              className="w-full py-2 px-4 rounded-md text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                            >
                              ✓ تأكيد الاستلام / Confirm Receipt
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ALL ADVANCES — admin only */}
        {isAdminUser && (
          <TabsContent value="all-advances" className="space-y-4">
            <Card className="border-violet-500/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="w-5 h-5 text-violet-400" />
                  All Transport Advances / جميع سلفات النقل
                  <span className="ml-auto text-xs font-normal text-muted-foreground">{advanceRequests.length} total</span>
                </CardTitle>
                <CardDescription>
                  All transportation advance requests across all users and hubs.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <input
                    type="text"
                    placeholder="Search by name, site, hub..."
                    value={allAdvancesSearch}
                    onChange={e => setAllAdvancesSearch(e.target.value)}
                    className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <select
                    value={allAdvancesStatusFilter}
                    onChange={e => setAllAdvancesStatusFilter(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending_supervisor">Pending Supervisor</option>
                    <option value="pending_admin">Pending Admin</option>
                    <option value="approved">Approved</option>
                    <option value="partially_paid">Partially Paid</option>
                    <option value="fully_paid">Fully Paid</option>
                    <option value="rejected">Rejected</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                {advanceLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Loading advances...</span>
                  </div>
                ) : (() => {
                  const filtered = advanceRequests.filter(r => {
                    const matchesStatus = allAdvancesStatusFilter === 'all' || r.status === allAdvancesStatusFilter;
                    const q = allAdvancesSearch.toLowerCase();
                    const matchesSearch = !q || 
                      r.siteName?.toLowerCase().includes(q) ||
                      r.hubName?.toLowerCase().includes(q) ||
                      r.mmpName?.toLowerCase().includes(q) ||
                      (r as any).requestedByName?.toLowerCase().includes(q);
                    return matchesStatus && matchesSearch;
                  });

                  const statusColors: Record<string, string> = {
                    pending_supervisor: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
                    pending_admin: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
                    approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
                    rejected: 'bg-red-500/10 text-red-400 border-red-500/30',
                    partially_paid: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
                    fully_paid: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
                    cancelled: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
                  };
                  const statusLabels: Record<string, string> = {
                    pending_supervisor: 'Pending Supervisor',
                    pending_admin: 'Pending Admin',
                    approved: 'Approved',
                    rejected: 'Rejected',
                    partially_paid: 'Partially Paid',
                    fully_paid: 'Fully Paid',
                    cancelled: 'Cancelled',
                  };

                  if (filtered.length === 0) {
                    return (
                      <div className="text-center py-12 text-muted-foreground">
                        <Truck className="w-8 h-8 mx-auto mb-3 opacity-40" />
                        <p className="text-sm">No advances found matching your filters.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      {filtered.map(advance => {
                        const disbursedAmount = advance.approvedAmount ?? advance.requestedAmount;
                        const receiptConfirmed = (advance.metadata as any)?.receipt_confirmation?.confirmed;
                        const requesterName = (advance as any).requestedByName || advance.requestedBy?.slice(0, 8) + '…';
                        return (
                          <div
                            key={advance.id}
                            data-testid={`all-advance-card-${advance.id}`}
                            className="rounded-lg border border-border bg-card p-4 space-y-2"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2 min-w-0">
                                <MapPin className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{advance.siteName}</p>
                                  <p className="text-xs text-muted-foreground">
                                    Requested by: <span className="text-violet-300">{requesterName}</span>
                                    {advance.hubName && <span className="ml-1">· {advance.hubName}</span>}
                                  </p>
                                  {advance.mmpName && (
                                    <p className="text-xs text-muted-foreground">MMP: {advance.mmpName}</p>
                                  )}
                                  <p className="text-xs text-muted-foreground">
                                    {format(new Date(advance.createdAt), 'MMM dd, yyyy')}
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusColors[advance.status] || 'bg-slate-500/10 text-slate-400 border-slate-500/30'}`}>
                                  {statusLabels[advance.status] || advance.status}
                                </span>
                                <span className="text-sm font-bold tabular-nums text-violet-300">
                                  {formatCurrency(disbursedAmount)}
                                </span>
                              </div>
                            </div>
                            {receiptConfirmed && (
                              <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 rounded px-2 py-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Receipt confirmed by user</span>
                              </div>
                            )}
                            {(advance.status === 'partially_paid' || advance.status === 'fully_paid') && !receiptConfirmed && (
                              <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 rounded px-2 py-1">
                                <Info className="w-3.5 h-3.5" />
                                <span>Awaiting receipt confirmation from user</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>
        )}

      </Tabs>
        </CardContent>
      </Card>

      {signatureWithdrawalRequest && currentUser && (
        <SignatureConfirmationModal
          open={!!signatureWithdrawalRequest}
          onOpenChange={(open) => { if (!open) setSignatureWithdrawalRequest(null); }}
          transaction={{
            id: signatureWithdrawalRequest.id,
            type: 'withdrawal',
            title: 'تأكيد استلام الأموال / Confirm Fund Receipt',
            description: `أؤكد أنني استلمت كامل المبلغ المسحوب. / I confirm that I have received the full withdrawal amount.`,
            amount: signatureWithdrawalRequest.amount,
            currency: signatureWithdrawalRequest.currency || DEFAULT_CURRENCY,
            counterparty: 'Finance / المالية',
            date: new Date().toISOString(),
            reference: signatureWithdrawalRequest.id,
          }}
          userId={currentUser.id}
          userName={currentUser.fullName || currentUser.email || ''}
          userEmail={currentUser.email}
          userRole={currentUser.role}
          allowedMethods={['handwriting', 'uuid']}
          onSignatureComplete={async (signature) => {
            await confirmFundReceipt(signatureWithdrawalRequest.id, {
              signatureId: signature.signatureId,
              signatureHash: signature.signatureHash,
              signatureMethod: signature.method,
              signedAt: signature.signedAt,
            });
            setSignatureWithdrawalRequest(null);
          }}
          onCancel={() => setSignatureWithdrawalRequest(null)}
        />
      )}

      {signatureAdvanceRequest && currentUser && (
        <SignatureConfirmationModal
          open={!!signatureAdvanceRequest}
          onOpenChange={(open) => { if (!open) setSignatureAdvanceRequest(null); }}
          transaction={{
            id: signatureAdvanceRequest.id,
            type: 'advance',
            title: 'تأكيد استلام سلفة النقل / Confirm Transport Advance Receipt',
            description: `أؤكد أنني استلمت كامل مبلغ سلفة النقل لموقع ${signatureAdvanceRequest.siteName}. / I confirm that I have received the full transport advance for site ${signatureAdvanceRequest.siteName}.`,
            amount: signatureAdvanceRequest.approvedAmount ?? signatureAdvanceRequest.requestedAmount,
            currency: DEFAULT_CURRENCY,
            counterparty: 'Finance / المالية',
            date: new Date().toISOString(),
            reference: signatureAdvanceRequest.id,
          }}
          userId={currentUser.id}
          userName={currentUser.fullName || currentUser.email || ''}
          userEmail={currentUser.email}
          userRole={currentUser.role}
          allowedMethods={['handwriting', 'uuid']}
          onSignatureComplete={async (signature) => {
            await confirmAdvanceReceipt({
              requestId: signatureAdvanceRequest.id,
              userId: currentUser.id,
              userName: currentUser.fullName || currentUser.email || '',
              signatureId: signature.signatureId,
              signatureHash: signature.signatureHash,
              signatureMethod: signature.method,
              signedAt: signature.signedAt,
            });
            setSignatureAdvanceRequest(null);
          }}
          onCancel={() => setSignatureAdvanceRequest(null)}
        />
      )}

      {signatureCostPayment && currentUser && (
        <SignatureConfirmationModal
          open={!!signatureCostPayment}
          onOpenChange={(open) => { if (!open) setSignatureCostPayment(null); }}
          transaction={{
            id: signatureCostPayment.id,
            type: 'payment',
            title: 'تأكيد استلام دفعة التكاليف / Confirm Cost Payment Receipt',
            description: `أؤكد أنني استلمت كامل مبلغ دفعة التكاليف. / I confirm that I have received the cost payment of ${formatCurrency((signatureCostPayment.amount_cents || 0) / 100)}.`,
            amount: (signatureCostPayment.amount_cents || 0) / 100,
            currency: DEFAULT_CURRENCY,
            counterparty: 'Finance / المالية',
            date: new Date().toISOString(),
            reference: signatureCostPayment.id,
          }}
          userId={currentUser.id}
          userName={currentUser.fullName || currentUser.email || ''}
          userEmail={currentUser.email}
          userRole={currentUser.role}
          allowedMethods={['handwriting', 'uuid']}
          onSignatureComplete={async (signature) => {
            await confirmCostPaymentReceipt(signatureCostPayment.id, {
              signatureId: signature.signatureId,
              signatureHash: signature.signatureHash,
              method: signature.method,
              signedAt: signature.signedAt,
            });
            setSignatureCostPayment(null);
          }}
          onCancel={() => setSignatureCostPayment(null)}
        />
      )}
    </div>
  );
};

export default WalletPage;
