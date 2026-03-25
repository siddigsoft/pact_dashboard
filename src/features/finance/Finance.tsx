
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "@/shared/context/AppContext";
import { DataFreshnessBadge } from "@/components/realtime";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getLatestExchangeRate, convertSdgToUsd, formatUsd } from "@/utils/exchange-rate-service";
import { FinancialDashboard } from "@/features/finance/components/FinancialDashboard";
import { SiteVisitFinancialTracker } from "@/features/siteVisit/components/SiteVisitFinancialTracker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/shared/hooks/use-toast";
import { 
  BadgePercent, ClipboardList, DollarSign, ReceiptText, ShieldCheck, 
  CreditCard, ArrowUpDown, FileBarChart, AlertTriangle, FileText,
  DatabaseBackup, ChevronDown, ArrowLeft, TrendingUp, TrendingDown, RefreshCw,
  Wallet, Clock, CheckCircle2, Info, Download, Loader2, FileSpreadsheet, Activity
} from "lucide-react";
import { FraudDetection } from "@/features/finance/components/FraudDetection";
import { ApprovalTierAnalytics } from "@/features/approval/components/ApprovalTierAnalytics";
import { BudgetForecast } from "@/features/budget/components/BudgetForecast";
import { FraudPreventionDashboard } from "@/features/finance/components/FraudPreventionDashboard";
import { RetainerProcessingCard } from "@/features/admin/components/RetainerProcessingCard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useWallet } from "@/features/wallet/context/WalletContext";
import { useBudget } from "@/features/budget/context/BudgetContext";
import { useUser } from "@/features/user/context/UserContext";
import type { AdminWithdrawalRequest } from "@/types/wallet";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, startOfMonth, endOfMonth } from "date-fns";
import * as XLSX from "xlsx";
import {
  fetchWalletsForConsolidatedStatement,
  fetchDownPaymentRequestsReceivableForConsolidatedStatement,
  fetchWalletTransactionsForConsolidatedStatement,
  fetchOperationalCostSubmissionsForConsolidatedStatement,
  fetchDownPaymentRequestsForConsolidatedStatement,
  fetchCostSubmissionsForConsolidatedStatement,
  fetchOperationalCostSubmissionsForExpenseCategories,
  fetchWalletsForWalletSummary,
  fetchWalletTransactionsForWalletSummary,
  fetchAuditLogsForFinanceSummary,
  fetchOperationalCostsPaidForAuditSummary,
  fetchDownPaymentRequestsForAuditSummary,
  countPendingOperationalCostSubmissions,
  countPendingDownPaymentRequests,
} from "@/features/finance/repository/financeRepository";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-SD', {
    style: 'currency',
    currency: 'SDG',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatCurrencyCents = (cents: number) => {
  return formatCurrency(cents / 100);
};

const Finance: React.FC = () => {
  const appContext = useAppContext();
  const [activeTab, setActiveTab] = useState("financial-tracking");
  const transactions: any[] = (appContext as any).transactions ?? [];
  const { toast } = useToast();
  const navigate = useNavigate();

  const { adminListWithdrawalRequests, adminProcessWithdrawal, adminRejectWithdrawal } = useWallet();
  const { projectBudgets, stats: budgetStats, budgetAlerts, loading: budgetLoading } = useBudget();
  const { users } = useUser();

  const [pendingWithdrawals, setPendingWithdrawals] = useState<AdminWithdrawalRequest[]>([]);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(true);

  const [expenseCategories, setExpenseCategories] = useState<{ category: string; total_cents: number; count: number }[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(true);

  const [walletSummary, setWalletSummary] = useState<{ totalWallets: number; totalBalance: number; totalWithdrawn: number; pendingCount: number; pendingAmount: number }>({ totalWallets: 0, totalBalance: 0, totalWithdrawn: 0, pendingCount: 0, pendingAmount: 0 });

  const [walletTrends, setWalletTrends] = useState<{ balanceChange: number | null; withdrawnChange: number | null; pendingChange: number | null }>({ balanceChange: null, withdrawnChange: null, pendingChange: null });
  const [expenseTrends, setExpenseTrends] = useState<Record<string, number | null>>({});

  const now = new Date();
  const [csStartDate, setCsStartDate] = useState(format(startOfMonth(now), 'yyyy-MM-dd'));
  const [csEndDate, setCsEndDate] = useState(format(endOfMonth(now), 'yyyy-MM-dd'));
  const [csIncludeTransport, setCsIncludeTransport] = useState(true);
  const [csIncludeOperational, setCsIncludeOperational] = useState(true);
  const [csIncludeWallet, setCsIncludeWallet] = useState(true);
  const [csIncludeAdvances, setCsIncludeAdvances] = useState(true);
  const [csCurrency] = useState('SDG');
  const [csLoading, setCsLoading] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<{rate: number; fetchedAt: string; stale: boolean} | null>(null);
  const [csData, setCsData] = useState<{
    totalAssets: number;
    advancesReceivable: number;
    totalLiabilities: number;
    netPosition: number;
    inflowCategories: { category: string; amount: number }[];
    expenseCategories: { category: string; amount: number }[];
    projectBreakdown: { project: string; inflow: number; outflow: number; net: number }[];
    hubBreakdown: { hub: string; inflow: number; outflow: number; net: number }[];
    totalInflow: number;
    totalOutflow: number;
  } | null>(null);

  const fetchConsolidatedData = useCallback(async () => {
    setCsLoading(true);
    try {
      const fromDate = csStartDate ? `${csStartDate}T00:00:00` : undefined;
      const toDate = csEndDate ? `${csEndDate}T23:59:59` : undefined;

      const walletsData = await fetchWalletsForConsolidatedStatement();
      let walletBalances = 0;
      (walletsData || []).forEach((w: any) => {
        const bal = typeof w.balances === 'object' ? (w.balances?.SDG || 0) : 0;
        walletBalances += Number(bal) || 0;
      });

      const advancesData = await fetchDownPaymentRequestsReceivableForConsolidatedStatement();
      let advancesReceivable = 0;
      (advancesData || []).forEach((dp: any) => {
        const meta = dp.metadata;
        const isReconciled = meta && (meta.reconciled === true || meta.reconciled_at);
        if (!isReconciled) {
          advancesReceivable += Math.abs(Number(dp.requested_amount) || 0);
        }
      });

      let totalAssets = walletBalances + advancesReceivable;

      let inflowMap: Record<string, number> = {};
      let expenseMap: Record<string, number> = {};
      let projectMap: Record<string, { inflow: number; outflow: number }> = {};
      let hubMap: Record<string, { inflow: number; outflow: number }> = {};
      let totalLiabilities = 0;

      if (csIncludeWallet) {
        const wtData = await fetchWalletTransactionsForConsolidatedStatement({ fromDate, toDate });
        (wtData || []).forEach((tx: any) => {
          const amt = Math.abs(Number(tx.amount) || 0);
          const txType = (tx.type || tx.transaction_type || '').toLowerCase();
          if (txType === 'credit' || txType === 'deposit' || txType === 'earning' || txType === 'top_up') {
            const cat = tx.category || tx.description || 'Wallet Credit';
            inflowMap[cat] = (inflowMap[cat] || 0) + amt;
          } else if (txType === 'debit' || txType === 'withdrawal' || txType === 'payment') {
            const cat = tx.category || tx.description || 'Wallet Withdrawal';
            expenseMap[cat] = (expenseMap[cat] || 0) + amt;
          }
          if (tx.project_id) {
            const pKey = tx.project_id;
            if (!projectMap[pKey]) projectMap[pKey] = { inflow: 0, outflow: 0 };
            if (txType === 'credit' || txType === 'deposit' || txType === 'earning' || txType === 'top_up') {
              projectMap[pKey].inflow += amt;
            } else {
              projectMap[pKey].outflow += amt;
            }
          }
        });
      }

      if (csIncludeOperational) {
        const ocData = await fetchOperationalCostSubmissionsForConsolidatedStatement({ fromDate, toDate });
        (ocData || []).forEach((oc: any) => {
          const amt = Math.abs(Number(oc.amount_cents || 0)) / 100;
          const cat = oc.expense_category || 'Operational Cost';
          expenseMap[cat] = (expenseMap[cat] || 0) + amt;
          if (oc.project_id) {
            if (!projectMap[oc.project_id]) projectMap[oc.project_id] = { inflow: 0, outflow: 0 };
            projectMap[oc.project_id].outflow += amt;
          }
          if (oc.hub) {
            if (!hubMap[oc.hub]) hubMap[oc.hub] = { inflow: 0, outflow: 0 };
            hubMap[oc.hub].outflow += amt;
          }
          if (oc.status === 'pending' || oc.tier1_status === 'pending' || oc.tier2_status === 'pending') {
            totalLiabilities += amt;
          }
        });
      }

      if (csIncludeAdvances) {
        const dpData = await fetchDownPaymentRequestsForConsolidatedStatement({ fromDate, toDate });
        (dpData || []).forEach((dp: any) => {
          const amt = Math.abs(Number(dp.amount) || Number(dp.requested_amount) || 0);
          expenseMap['Transportation Advance'] = (expenseMap['Transportation Advance'] || 0) + amt;
          if (dp.project_id) {
            if (!projectMap[dp.project_id]) projectMap[dp.project_id] = { inflow: 0, outflow: 0 };
            projectMap[dp.project_id].outflow += amt;
          }
          if (dp.hub) {
            if (!hubMap[dp.hub]) hubMap[dp.hub] = { inflow: 0, outflow: 0 };
            hubMap[dp.hub].outflow += amt;
          }
          if (dp.status === 'pending' || dp.status === 'pending_supervisor' || dp.status === 'pending_admin') {
            totalLiabilities += amt;
          }
        });
      }

      if (csIncludeTransport) {
        const costData = await fetchCostSubmissionsForConsolidatedStatement({ fromDate, toDate });
        (costData || []).forEach((cs: any) => {
          const amt = Math.abs(Number(cs.amount) || Number(cs.amount_cents || 0) / 100 || 0);
          const cat = cs.category || cs.cost_type || 'Transportation Cost';
          expenseMap[cat] = (expenseMap[cat] || 0) + amt;
          if (cs.project_id) {
            if (!projectMap[cs.project_id]) projectMap[cs.project_id] = { inflow: 0, outflow: 0 };
            projectMap[cs.project_id].outflow += amt;
          }
          if (cs.hub) {
            if (!hubMap[cs.hub]) hubMap[cs.hub] = { inflow: 0, outflow: 0 };
            hubMap[cs.hub].outflow += amt;
          }
        });
      }

      const inflowCategories = Object.entries(inflowMap).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
      const expenseCats = Object.entries(expenseMap).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
      const totalInflow = inflowCategories.reduce((s, c) => s + c.amount, 0);
      const totalOutflow = expenseCats.reduce((s, c) => s + c.amount, 0);
      const netPosition = totalAssets - totalLiabilities;

      const projectBreakdown = Object.entries(projectMap).map(([project, vals]) => ({
        project,
        inflow: vals.inflow,
        outflow: vals.outflow,
        net: vals.inflow - vals.outflow,
      })).sort((a, b) => b.outflow - a.outflow);

      const hubBreakdown = Object.entries(hubMap).map(([hub, vals]) => ({
        hub,
        inflow: vals.inflow,
        outflow: vals.outflow,
        net: vals.inflow - vals.outflow,
      })).sort((a, b) => b.outflow - a.outflow);

      setCsData({
        totalAssets,
        advancesReceivable,
        totalLiabilities,
        netPosition,
        inflowCategories,
        expenseCategories: expenseCats,
        projectBreakdown,
        hubBreakdown,
        totalInflow,
        totalOutflow,
      });
    } catch (err) {
      console.error('Failed to fetch consolidated data:', err);
      toast({ title: 'Error', description: 'Failed to load consolidated statement data.', variant: 'destructive' });
    } finally {
      setCsLoading(false);
    }
  }, [csStartDate, csEndDate, csIncludeTransport, csIncludeOperational, csIncludeWallet, csIncludeAdvances, toast]);

  const generateConsolidatedPdf = () => {
    if (!csData) return;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pw = doc.internal.pageSize.width;
    const ph = doc.internal.pageSize.height;
    const ml = 14;
    const mr = 14;
    const cw = pw - ml - mr;

    doc.setFillColor(15, 32, 65);
    doc.rect(0, 0, pw, 34, 'F');
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('PACT', ml + 4, 16);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Consolidated Financial Statement', ml + 4, 23);
    doc.setFontSize(8);
    doc.setTextColor(190, 205, 225);
    doc.text(`Period: ${csStartDate} to ${csEndDate}`, ml + 4, 29);
    doc.setFontSize(8);
    doc.text(format(new Date(), 'MMM d, yyyy | HH:mm'), pw - mr, 16, { align: 'right' });

    let y = 40;

    doc.setFontSize(12);
    doc.setTextColor(15, 32, 65);
    doc.setFont('helvetica', 'bold');
    doc.text('Organization Summary', ml, y);
    y += 7;

    const fmtUsdPdf = (sdg: number) => exchangeRate ? formatUsd(convertSdgToUsd(sdg, exchangeRate.rate)) : '-';
    const walletBal = csData.totalAssets - csData.advancesReceivable;
    const summaryRows = [
      ['Total Assets', `${csCurrency} ${csData.totalAssets.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, fmtUsdPdf(csData.totalAssets)],
      ['  Wallet Balances', `${csCurrency} ${walletBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, fmtUsdPdf(walletBal)],
      ['  Advances Receivable', `${csCurrency} ${csData.advancesReceivable.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, fmtUsdPdf(csData.advancesReceivable)],
      ['Total Liabilities (Pending Payments)', `${csCurrency} ${csData.totalLiabilities.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, fmtUsdPdf(csData.totalLiabilities)],
      ['Net Position', `${csCurrency} ${csData.netPosition.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, fmtUsdPdf(csData.netPosition)],
      ['Total Inflows', `${csCurrency} ${csData.totalInflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, fmtUsdPdf(csData.totalInflow)],
      ['Total Outflows', `${csCurrency} ${csData.totalOutflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, fmtUsdPdf(csData.totalOutflow)],
    ];

    autoTable(doc, {
      startY: y,
      head: [['Item', 'Amount (SDG)', 'Amount (USD)']],
      body: summaryRows,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [15, 32, 65], textColor: [255, 255, 255] },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      margin: { left: ml, right: mr },
    });
    y = (doc as any).lastAutoTable?.finalY + 8 || y + 40;

    if (csData.expenseCategories.length > 0) {
      doc.setFontSize(12);
      doc.setTextColor(15, 32, 65);
      doc.setFont('helvetica', 'bold');
      doc.text('Expense/Outflow by Category', ml, y);
      y += 7;

      const catRows = csData.expenseCategories.map(c => [
        c.category.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()),
        `${csCurrency} ${c.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        fmtUsdPdf(c.amount),
      ]);
      catRows.push(['TOTAL', `${csCurrency} ${csData.totalOutflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, fmtUsdPdf(csData.totalOutflow)]);

      autoTable(doc, {
        startY: y,
        head: [['Category', 'Amount (SDG)', 'Amount (USD)']],
        body: catRows,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [15, 32, 65], textColor: [255, 255, 255] },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
        margin: { left: ml, right: mr },
        didParseCell: (data: any) => {
          if (data.row.index === catRows.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [245, 247, 252];
          }
        },
      });
      y = (doc as any).lastAutoTable?.finalY + 8 || y + 30;
    }

    if (csData.projectBreakdown.length > 0 && y < ph - 50) {
      doc.setFontSize(12);
      doc.setTextColor(15, 32, 65);
      doc.setFont('helvetica', 'bold');
      doc.text('Project-Level Breakdown', ml, y);
      y += 7;

      const projRows = csData.projectBreakdown.map(p => [
        p.project,
        `${csCurrency} ${p.inflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        `${csCurrency} ${p.outflow.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        `${csCurrency} ${p.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        fmtUsdPdf(p.net),
      ]);

      autoTable(doc, {
        startY: y,
        head: [['Project', 'Inflow (SDG)', 'Outflow (SDG)', 'Net (SDG)', 'Net (USD)']],
        body: projRows,
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: [15, 32, 65], textColor: [255, 255, 255] },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
        margin: { left: ml, right: mr },
      });
      y = (doc as any).lastAutoTable?.finalY + 8 || y + 30;
    }

    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFillColor(15, 32, 65);
      doc.rect(0, ph - 12, pw, 12, 'F');
      doc.setFontSize(7);
      doc.setTextColor(180, 195, 220);
      doc.text(`Page ${i} of ${totalPages}  |  Generated: ${format(new Date(), 'MMM d, yyyy HH:mm:ss')}`, pw / 2, ph - 5, { align: 'center' });
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text('PACT Command Center', pw - mr, ph - 5, { align: 'right' });
    }

    doc.save(`PACT-Consolidated-Statement-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast({ title: 'PDF Generated', description: 'Consolidated statement PDF has been downloaded.' });
  };

  const exportConsolidatedExcel = () => {
    if (!csData) return;
    const wb = XLSX.utils.book_new();

    const fmtUsdXl = (sdg: number) => exchangeRate ? convertSdgToUsd(sdg, exchangeRate.rate) : '';
    const xlWalletBal = csData.totalAssets - csData.advancesReceivable;
    const summarySheet = XLSX.utils.aoa_to_sheet([
      ['PACT Consolidated Financial Statement'],
      [`Period: ${csStartDate} to ${csEndDate}`],
      ...(exchangeRate ? [[`Exchange Rate: 1 USD = ${exchangeRate.rate.toLocaleString()} SDG (as of ${exchangeRate.fetchedAt})`]] : []),
      [],
      ['Item', 'Amount (SDG)', 'Amount (USD)'],
      ['Total Assets', csData.totalAssets, fmtUsdXl(csData.totalAssets)],
      ['  Wallet Balances', xlWalletBal, fmtUsdXl(xlWalletBal)],
      ['  Advances Receivable', csData.advancesReceivable, fmtUsdXl(csData.advancesReceivable)],
      ['Total Liabilities (Pending Payments)', csData.totalLiabilities, fmtUsdXl(csData.totalLiabilities)],
      ['Net Position', csData.netPosition, fmtUsdXl(csData.netPosition)],
      ['Total Inflows', csData.totalInflow, fmtUsdXl(csData.totalInflow)],
      ['Total Outflows', csData.totalOutflow, fmtUsdXl(csData.totalOutflow)],
    ]);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    if (csData.inflowCategories.length > 0) {
      const inflowRows = [['Category', 'Amount (SDG)', 'Amount (USD)'], ...csData.inflowCategories.map(c => [c.category, c.amount, fmtUsdXl(c.amount)])];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(inflowRows), 'Inflows');
    }

    if (csData.expenseCategories.length > 0) {
      const expenseRows = [['Category', 'Amount (SDG)', 'Amount (USD)'], ...csData.expenseCategories.map(c => [c.category, c.amount, fmtUsdXl(c.amount)])];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expenseRows), 'Expenses');
    }

    if (csData.projectBreakdown.length > 0) {
      const projRows = [['Project', 'Inflow (SDG)', 'Outflow (SDG)', 'Net (SDG)', 'Net (USD)'], ...csData.projectBreakdown.map(p => [p.project, p.inflow, p.outflow, p.net, fmtUsdXl(p.net)])];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(projRows), 'Projects');
    }

    if (csData.hubBreakdown.length > 0) {
      const hubRows = [['Hub', 'Inflow (SDG)', 'Outflow (SDG)', 'Net (SDG)', 'Net (USD)'], ...csData.hubBreakdown.map(h => [h.hub, h.inflow, h.outflow, h.net, fmtUsdXl(h.net)])];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hubRows), 'Hubs');
    }

    XLSX.writeFile(wb, `PACT-Consolidated-Statement-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast({ title: 'Excel Exported', description: 'Consolidated statement Excel file has been downloaded.' });
  };

  const fetchWithdrawals = useCallback(async () => {
    setWithdrawalsLoading(true);
    try {
      const requests = await adminListWithdrawalRequests();
      setPendingWithdrawals(requests.filter(r => r.status === 'supervisor_approved'));
      setWalletSummary(prev => ({
        ...prev,
        pendingCount: requests.filter(r => r.status === 'supervisor_approved').length,
        pendingAmount: requests.filter(r => r.status === 'supervisor_approved').reduce((s, r) => s + r.amount, 0),
      }));
    } catch (err) {
      console.error('Failed to fetch withdrawals:', err);
    } finally {
      setWithdrawalsLoading(false);
    }
  }, [adminListWithdrawalRequests]);

  const fetchExpenseCategories = useCallback(async () => {
    setExpensesLoading(true);
    try {
      const data = await fetchOperationalCostSubmissionsForExpenseCategories();

      const currentMonthStart = startOfMonth(new Date());
      const currentMonthEnd = endOfMonth(new Date());
      const prevMonth = new Date();
      prevMonth.setMonth(prevMonth.getMonth() - 1);
      const prevMonthStart = startOfMonth(prevMonth);
      const prevMonthEnd = endOfMonth(prevMonth);

      const grouped: Record<string, { total_cents: number; count: number }> = {};
      const curMonthByCategory: Record<string, number> = {};
      const prevMonthByCategory: Record<string, number> = {};

      (data || []).forEach((row: any) => {
        const cat = row.expense_category || 'Other';
        const isApproved = row.tier2_status === 'approved' || (row.tier1_status === 'approved' && !row.tier2_status);
        if (!isApproved) return;
        if (!grouped[cat]) grouped[cat] = { total_cents: 0, count: 0 };
        grouped[cat].total_cents += Math.abs(row.amount_cents || 0);
        grouped[cat].count++;

        if (row.created_at) {
          const rowDate = new Date(row.created_at);
          const amt = Math.abs(row.amount_cents || 0);
          if (rowDate >= currentMonthStart && rowDate <= currentMonthEnd) {
            curMonthByCategory[cat] = (curMonthByCategory[cat] || 0) + amt;
          } else if (rowDate >= prevMonthStart && rowDate <= prevMonthEnd) {
            prevMonthByCategory[cat] = (prevMonthByCategory[cat] || 0) + amt;
          }
        }
      });

      setExpenseCategories(
        Object.entries(grouped).map(([category, vals]) => ({ category, ...vals }))
          .sort((a, b) => b.total_cents - a.total_cents)
      );

      const trends: Record<string, number | null> = {};
      const allCats = new Set([...Object.keys(curMonthByCategory), ...Object.keys(prevMonthByCategory)]);
      allCats.forEach(cat => {
        const cur = curMonthByCategory[cat] || 0;
        const prev = prevMonthByCategory[cat] || 0;
        if (prev === 0 && cur === 0) { trends[cat] = 0; }
        else if (prev === 0) { trends[cat] = 100; }
        else { trends[cat] = ((cur - prev) / prev) * 100; }
      });
      setExpenseTrends(trends);
    } catch (err) {
      console.error('Failed to fetch expense categories:', err);
    } finally {
      setExpensesLoading(false);
    }
  }, []);

  const fetchWalletSummary = useCallback(async () => {
    try {
      const data = await fetchWalletsForWalletSummary();

      let totalBalance = 0;
      let totalWithdrawn = 0;
      (data || []).forEach((w: any) => {
        const bal = typeof w.balances === 'object' ? (w.balances?.SDG || 0) : 0;
        totalBalance += Number(bal) || 0;
        totalWithdrawn += parseFloat(w.total_withdrawn || 0);
      });

      setWalletSummary(prev => ({
        ...prev,
        totalWallets: (data || []).length,
        totalBalance,
        totalWithdrawn,
      }));

      const currentMonthStart = format(startOfMonth(new Date()), "yyyy-MM-dd'T'00:00:00");
      const currentMonthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd'T'23:59:59");
      const prevMonth = new Date();
      prevMonth.setMonth(prevMonth.getMonth() - 1);
      const prevMonthStart = format(startOfMonth(prevMonth), "yyyy-MM-dd'T'00:00:00");
      const prevMonthEnd = format(endOfMonth(prevMonth), "yyyy-MM-dd'T'23:59:59");

      const {
        curCredits: curTxRows,
        prevCredits: prevTxRows,
        curDebits: curWdRows,
        prevDebits: prevWdRows,
      } = await fetchWalletTransactionsForWalletSummary({
        currentMonthStart,
        currentMonthEnd,
        prevMonthStart,
        prevMonthEnd,
      });

      const sumCredits = (rows: any[]) => rows.reduce((s, tx) => {
        const txType = (tx.type || tx.transaction_type || '').toLowerCase();
        if (txType === 'credit' || txType === 'deposit' || txType === 'earning' || txType === 'top_up') {
          return s + Math.abs(Number(tx.amount) || 0);
        }
        return s;
      }, 0);

      const sumDebits = (rows: any[]) => rows.reduce((s, tx) => s + Math.abs(Number(tx.amount) || 0), 0);

      const curCredits = sumCredits(curTxRows || []);
      const prevCredits = sumCredits(prevTxRows || []);
      const curDebits = sumDebits(curWdRows || []);
      const prevDebits = sumDebits(prevWdRows || []);

      const calcChange = (cur: number, prev: number): number | null => {
        if (prev === 0 && cur === 0) return 0;
        if (prev === 0) return cur > 0 ? 100 : -100;
        return ((cur - prev) / prev) * 100;
      };

      setWalletTrends({
        balanceChange: calcChange(curCredits, prevCredits),
        withdrawnChange: calcChange(curDebits, prevDebits),
        pendingChange: null,
      });
    } catch (err) {
      console.error('Failed to fetch wallet summary:', err);
    }
  }, []);

  interface AuditLogEntry {
    id: string;
    module: string;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    entity_name: string | null;
    actor_id: string | null;
    actor_name: string | null;
    actor_role: string | null;
    timestamp: string;
    severity: string | null;
    description: string | null;
    details: any;
    metadata: any;
  }

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditKpis, setAuditKpis] = useState({
    totalActions: 0,
    avgApprovalDays: 0,
    approvalRate: 0,
    pendingCount: 0,
  });

  const fetchAuditSummary = useCallback(async () => {
    setAuditLoading(true);
    try {
      const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd'T'00:00:00");
      const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd'T'23:59:59");

      const logs = await fetchAuditLogsForFinanceSummary({ monthStart, monthEnd });
      const allLogs = (logs || []) as AuditLogEntry[];
      const actionPattern = /approve|reject|process|period_close|period_reopen/i;
      const filteredLogs = allLogs.filter(l => actionPattern.test(l.action));

      const approved = filteredLogs.filter(l => /approve/i.test(l.action)).length;
      const rejected = filteredLogs.filter(l => /reject/i.test(l.action)).length;
      const totalDecisions = approved + rejected;
      const approvalRate = totalDecisions > 0 ? (approved / totalDecisions) * 100 : 0;

      const ocData = await fetchOperationalCostsPaidForAuditSummary();

      const dpData = await fetchDownPaymentRequestsForAuditSummary();

      let totalDays = 0;
      let countTimed = 0;

      (ocData || []).forEach((oc: any) => {
        if (oc.created_at && oc.paid_at) {
          const diff = (new Date(oc.paid_at).getTime() - new Date(oc.created_at).getTime()) / (1000 * 60 * 60 * 24);
          if (diff >= 0 && diff < 365) {
            totalDays += diff;
            countTimed++;
          }
        }
      });

      (dpData || []).forEach((dp: any) => {
        if (dp.created_at && dp.updated_at) {
          const diff = (new Date(dp.updated_at).getTime() - new Date(dp.created_at).getTime()) / (1000 * 60 * 60 * 24);
          if (diff >= 0 && diff < 365) {
            totalDays += diff;
            countTimed++;
          }
        }
      });

      const avgDays = countTimed > 0 ? totalDays / countTimed : 0;

      const pendingOcCount = await countPendingOperationalCostSubmissions();
      const pendingDpCount = await countPendingDownPaymentRequests();

      setAuditLogs(filteredLogs.slice(0, 50));
      setAuditKpis({
        totalActions: filteredLogs.length,
        avgApprovalDays: Math.round(avgDays * 10) / 10,
        approvalRate: Math.round(approvalRate),
        pendingCount: (pendingOcCount || 0) + (pendingDpCount || 0),
      });
    } catch (err) {
      console.error('Failed to fetch audit summary:', err);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWithdrawals();
    fetchExpenseCategories();
    fetchWalletSummary();
    fetchAuditSummary();
    getLatestExchangeRate().then(rate => setExchangeRate(rate));
  }, [fetchWithdrawals, fetchExpenseCategories, fetchWalletSummary, fetchAuditSummary]);

  const siteVisitTransactions = transactions.filter(
    transaction => transaction.siteVisitId
  );

  const getUserName = (userId: string, request?: AdminWithdrawalRequest) => {
    if (request?.requesterName) return request.requesterName;
    const user = users.find(u => u.id === userId);
    return user?.name || 'Unknown User';
  };

  const handleApprovePayment = async (requestId: string) => {
    try {
      await adminProcessWithdrawal(requestId, 'Approved from finance page');
      toast({
        title: "Payment approved",
        description: "The payment has been processed and funds released.",
      });
      fetchWithdrawals();
    } catch {
      toast({
        title: "Error",
        description: "Failed to process payment.",
        variant: "destructive",
      });
    }
  };

  const handleRejectPayment = async (requestId: string) => {
    try {
      await adminRejectWithdrawal(requestId, 'Rejected from finance page');
      toast({
        title: "Payment rejected",
        description: "The withdrawal request has been rejected.",
      });
      fetchWithdrawals();
    } catch {
      toast({
        title: "Error",
        description: "Failed to reject payment.",
        variant: "destructive",
      });
    }
  };
  
  const handleExportReport = (format: string) => {
    toast({
      title: `Exporting as ${format.toUpperCase()}`,
      description: `Your financial report is being prepared for download in ${format.toUpperCase()} format.`,
    });
  };

  const activeAlerts = budgetAlerts.filter(a => a.status === 'active');

  const totalBudgetCents = projectBudgets.reduce((s, b) => s + b.totalBudgetCents, 0);
  const totalSpentCents = projectBudgets.reduce((s, b) => s + b.spentBudgetCents, 0);
  const totalRemainingCents = projectBudgets.reduce((s, b) => s + b.remainingBudgetCents, 0);
  const utilizationRate = totalBudgetCents > 0 ? ((totalSpentCents / totalBudgetCents) * 100) : 0;

  const totalExpenseCents = expenseCategories.reduce((s, c) => s + c.total_cents, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/dashboard')}
          data-testid="button-back-to-dashboard"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/budget')}
            data-testid="button-goto-budget"
          >
            <BadgePercent className="h-4 w-4 mr-2" />
            Budget
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/cost-submission')}
            data-testid="button-goto-cost-submissions"
          >
            <ReceiptText className="h-4 w-4 mr-2" />
            Cost Submissions
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/wallet')}
            data-testid="button-goto-wallet"
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Wallet
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/admin/wallets')}
            data-testid="button-goto-admin-wallets"
          >
            <DollarSign className="h-4 w-4 mr-2" />
            Admin Wallets
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/down-payment-approval')}
            data-testid="button-goto-down-payment"
          >
            <ArrowUpDown className="h-4 w-4 mr-2" />
            Down-Payments
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/financial-operations')}
            data-testid="button-financial-operations"
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            Financial Operations
          </Button>
        </div>
      </div>

      <div className="bg-blue-50 p-6 rounded-lg shadow-sm border animate-fade-in">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-blue-700">
              Financial Management
            </h1>
            <p className="text-muted-foreground mt-2">
              Track site visit finances, manage budgets, and view financial reports
            </p>
          </div>
          <DataFreshnessBadge />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-6 gap-2 p-1 h-auto">
          <TabsTrigger value="financial-tracking" className="py-2 data-[state=active]:bg-blue-50">
            <span className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              <span className="hidden sm:inline">Site Visit Finances</span>
              <span className="sm:hidden">Finances</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="py-2 data-[state=active]:bg-blue-50">
            <span className="flex items-center gap-2">
              <FileBarChart className="h-4 w-4" />
              <span className="hidden sm:inline">Financial Dashboard</span>
              <span className="sm:hidden">Dashboard</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="budget" className="py-2 data-[state=active]:bg-blue-50">
            <span className="flex items-center gap-2">
              <BadgePercent className="h-4 w-4" />
              <span className="hidden sm:inline">Budget Management</span>
              <span className="sm:hidden">Budget</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="payments" className="py-2 data-[state=active]:bg-blue-50">
            <span className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              <span className="hidden sm:inline">Payment Processing</span>
              <span className="sm:hidden">Payments</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="py-2 data-[state=active]:bg-blue-50">
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Reports & Audit</span>
              <span className="sm:hidden">Reports</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="consolidated-statement" className="py-2 data-[state=active]:bg-blue-50" data-testid="tab-consolidated-statement">
            <span className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              <span className="hidden sm:inline">Statement</span>
              <span className="sm:hidden">Statement</span>
            </span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="financial-tracking" className="mt-4">
          <div className="grid gap-6">
            <h2 className="text-xl font-bold tracking-tight">Site Visit Financial Tracking</h2>
            <SiteVisitFinancialTracker transactions={siteVisitTransactions} />
          </div>
        </TabsContent>

        <TabsContent value="dashboard" className="mt-4">
          <div className="grid gap-6">
            <h2 className="text-xl font-bold tracking-tight">Financial Dashboard</h2>
            
            <ApprovalTierAnalytics />
            
            <BudgetForecast />
            
            <FinancialDashboard transactions={transactions} />
          </div>
        </TabsContent>

        <TabsContent value="budget" className="mt-4">
          <div className="grid gap-6">
            <h2 className="text-xl font-bold tracking-tight">Budget Management</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-primary" />
                    Budget Overview
                  </CardTitle>
                  <CardDescription>Summary across all project budgets</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {budgetLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-6 w-1/2" />
                    </div>
                  ) : projectBudgets.length === 0 ? (
                    <div className="text-center py-6">
                      <Info className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">No project budgets have been created yet.</p>
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('/budget')}>
                        Go to Budget Page
                      </Button>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Total Budget</p>
                          <p className="text-muted-foreground text-sm">Across {projectBudgets.length} project{projectBudgets.length !== 1 ? 's' : ''}</p>
                        </div>
                        <p className="text-xl font-bold" data-testid="text-total-budget">{formatCurrencyCents(totalBudgetCents)}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">Spent</p>
                        <p className="text-sm font-medium">{formatCurrencyCents(totalSpentCents)}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">Remaining</p>
                        <p className="text-sm font-medium text-green-600">{formatCurrencyCents(totalRemainingCents)}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">Utilization</p>
                        <p className="text-sm font-medium">{utilizationRate.toFixed(1)}%</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" onClick={() => navigate('/budget')}>
                          <BadgePercent className="h-4 w-4 mr-2" />
                          Manage Budgets
                        </Button>
                        <Button variant="outline" onClick={() => navigate('/budget')}>
                          <FileBarChart className="h-4 w-4 mr-2" />
                          View Details
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Budget Alerts
                  </CardTitle>
                  <CardDescription>Active budget notifications</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {budgetLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-5 w-full" />
                      <Skeleton className="h-5 w-full" />
                      <Skeleton className="h-5 w-3/4" />
                    </div>
                  ) : activeAlerts.length === 0 ? (
                    <div className="flex flex-col items-center py-6 text-center">
                      <ShieldCheck className="h-8 w-8 text-green-500 mb-2" />
                      <p className="text-sm font-medium text-green-600">All budgets are healthy</p>
                      <p className="text-xs text-muted-foreground mt-1">No active alerts at this time.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {activeAlerts.slice(0, 5).map((alert) => (
                        <div key={alert.id} className={`flex items-center gap-2 ${alert.severity === 'critical' ? 'text-red-500' : alert.severity === 'warning' ? 'text-amber-500' : 'text-blue-500'}`}>
                          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                          <p className="text-sm font-medium">{alert.title || alert.message}</p>
                        </div>
                      ))}
                      {activeAlerts.length > 5 && (
                        <p className="text-xs text-muted-foreground">+{activeAlerts.length - 5} more alerts</p>
                      )}
                    </div>
                  )}
                  <Button variant="secondary" className="w-full" onClick={() => navigate('/budget')}>
                    View All Budget Alerts
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-primary" />
                  Expense Allocation by Category
                </CardTitle>
                <CardDescription>Approved cost submissions grouped by expense category</CardDescription>
              </CardHeader>
              <CardContent>
                {expensesLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => (
                      <Card key={i} className="p-3">
                        <Skeleton className="h-4 w-24 mb-2" />
                        <Skeleton className="h-6 w-20 mb-1" />
                        <Skeleton className="h-3 w-16" />
                      </Card>
                    ))}
                  </div>
                ) : expenseCategories.length === 0 ? (
                  <div className="text-center py-6">
                    <Info className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">No approved cost submissions found.</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('/cost-submission')}>
                      Go to Cost Submissions
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {expenseCategories.slice(0, 8).map((cat) => {
                      const trend = expenseTrends[cat.category];
                      return (
                        <Card key={cat.category} className="p-3">
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-muted-foreground capitalize">{cat.category.replace(/_/g, ' ')}</p>
                            <p className="text-lg font-bold" data-testid={`text-expense-${cat.category}`}>{formatCurrencyCents(cat.total_cents)}</p>
                            <p className="text-xs text-muted-foreground">
                              {totalExpenseCents > 0 ? ((cat.total_cents / totalExpenseCents) * 100).toFixed(0) : 0}% of total ({cat.count} submission{cat.count !== 1 ? 's' : ''})
                            </p>
                            {trend !== null && trend !== undefined && trend !== 0 && (
                              <div className={`flex items-center gap-1 text-xs ${trend > 0 ? 'text-red-500' : 'text-green-600'}`} data-testid={`trend-expense-${cat.category}`}>
                                {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                <span>{trend > 0 ? '+' : ''}{trend.toFixed(1)}% vs last month</span>
                              </div>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <div className="grid gap-6">
            <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-blue-600" />
              Payment Processing
            </h2>

            <RetainerProcessingCard />
          
            <FraudPreventionDashboard />
            
            <Card className="border-t-4 border-t-green-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  Pending Withdrawal Approvals
                </CardTitle>
                <CardDescription>Supervisor-approved withdrawal requests ready for finance processing</CardDescription>
              </CardHeader>
              <CardContent>
                {withdrawalsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="p-3 border rounded">
                        <div className="flex justify-between">
                          <div className="space-y-2">
                            <Skeleton className="h-5 w-32" />
                            <Skeleton className="h-3 w-24" />
                          </div>
                          <Skeleton className="h-5 w-20" />
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Skeleton className="h-8 w-20" />
                          <Skeleton className="h-8 w-20" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : pendingWithdrawals.length === 0 ? (
                  <div className="flex flex-col items-center py-8 text-center">
                    <CheckCircle2 className="h-10 w-10 text-green-500 mb-3" />
                    <p className="font-medium">No pending withdrawals</p>
                    <p className="text-sm text-muted-foreground mt-1">All withdrawal requests have been processed.</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('/finance-approval')}>
                      View Finance Approval Page
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingWithdrawals.slice(0, 10).map((request) => {
                      const userName = getUserName(request.userId, request);
                      return (
                        <div key={request.id} className="p-3 border rounded hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors" data-testid={`card-withdrawal-${request.id}`}>
                          <div className="flex justify-between flex-wrap gap-2">
                            <div>
                              <p className="font-medium">{userName}</p>
                              <p className="text-xs text-muted-foreground">
                                {request.paymentMethod && <span className="capitalize">{request.paymentMethod}</span>}
                                {request.requestReason && <span> - {request.requestReason}</span>}
                              </p>
                              {request.createdAt && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  <Clock className="h-3 w-3 inline mr-1" />
                                  {new Date(request.createdAt).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                            <span className="text-sm font-bold">{formatCurrency(request.amount)}</span>
                          </div>
                          <div className="flex gap-2 mt-2">
                            <Button size="sm" onClick={() => handleApprovePayment(request.id)} data-testid={`button-approve-${request.id}`}>Approve</Button>
                            <Button size="sm" variant="outline" onClick={() => handleRejectPayment(request.id)} data-testid={`button-reject-${request.id}`}>Reject</Button>
                            <Button size="sm" variant="ghost" onClick={() => navigate('/finance-approval')}>Details</Button>
                          </div>
                        </div>
                      );
                    })}
                    {pendingWithdrawals.length > 10 && (
                      <div className="text-center pt-2">
                        <Button variant="outline" size="sm" onClick={() => navigate('/finance-approval')}>
                          View all {pendingWithdrawals.length} pending withdrawals
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-t-4 border-t-indigo-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Wallet className="h-5 w-5 text-primary" />
                  Wallet Summary
                </CardTitle>
                <CardDescription>Overview of all wallet balances and withdrawal activity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30">
                        <Wallet className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium">Total Wallets</p>
                        <p className="text-lg font-bold" data-testid="text-total-wallets">{walletSummary.totalWallets}</p>
                        <p className="text-sm text-muted-foreground">Active user wallets</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/30">
                        <DollarSign className="h-4 w-4 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium">Total Balance</p>
                        <p className="text-lg font-bold" data-testid="text-total-balance">{formatCurrency(walletSummary.totalBalance)}</p>
                        {walletTrends.balanceChange !== null && walletTrends.balanceChange !== 0 ? (
                          <div className={`flex items-center gap-1 text-xs mt-1 ${walletTrends.balanceChange > 0 ? 'text-green-600' : 'text-red-500'}`} data-testid="trend-balance-change">
                            {walletTrends.balanceChange > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            <span>{walletTrends.balanceChange > 0 ? '+' : ''}{walletTrends.balanceChange.toFixed(1)}% from last month</span>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Combined SDG balance</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/30">
                        <ArrowUpDown className="h-4 w-4 text-amber-600" />
                      </div>
                      <div>
                        <p className="font-medium">Total Withdrawn</p>
                        <p className="text-lg font-bold" data-testid="text-total-withdrawn">{formatCurrency(walletSummary.totalWithdrawn)}</p>
                        {walletTrends.withdrawnChange !== null && walletTrends.withdrawnChange !== 0 ? (
                          <div className={`flex items-center gap-1 text-xs mt-1 ${walletTrends.withdrawnChange > 0 ? 'text-red-500' : 'text-green-600'}`} data-testid="trend-withdrawn-change">
                            {walletTrends.withdrawnChange > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            <span>{walletTrends.withdrawnChange > 0 ? '+' : ''}{walletTrends.withdrawnChange.toFixed(1)}% from last month</span>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">All-time withdrawals</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-full bg-purple-100 dark:bg-purple-900/30">
                        <Clock className="h-4 w-4 text-purple-600" />
                      </div>
                      <div>
                        <p className="font-medium">Pending Payments</p>
                        <p className="text-lg font-bold" data-testid="text-pending-payments">{walletSummary.pendingCount}</p>
                        {walletTrends.pendingChange !== null && walletTrends.pendingChange !== 0 ? (
                          <div className={`flex items-center gap-1 text-xs mt-1 ${walletTrends.pendingChange > 0 ? 'text-red-500' : 'text-green-600'}`} data-testid="trend-pending-change">
                            {walletTrends.pendingChange > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            <span>{walletTrends.pendingChange > 0 ? '+' : ''}{walletTrends.pendingChange.toFixed(1)}% from last month</span>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">{formatCurrency(walletSummary.pendingAmount)} awaiting</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="reports" className="mt-4">
          <div className="grid gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Financial Reports & Audits
              </h2>
              
              <div className="flex gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="flex items-center gap-1">
                      Generate Report
                      <ChevronDown className="h-4 w-4 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleExportReport("pdf")}>PDF Report</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExportReport("excel")}>Excel Spreadsheet</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExportReport("csv")}>CSV Export</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Wallet Reports
                  </CardTitle>
                  <CardDescription>Transaction history and withdrawal reports</CardDescription>
                </CardHeader>
                <CardContent className="flex-grow">
                  <p className="text-sm text-muted-foreground">Export wallet transactions, earnings breakdowns, and withdrawal history from the Wallet page.</p>
                </CardContent>
                <div className="p-4 pt-0 mt-auto">
                  <Button className="w-full" onClick={() => navigate('/wallet')} data-testid="button-goto-wallet-reports">Go to Wallet</Button>
                </div>
              </Card>
              <Card className="flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-primary" />
                    Budget Reports
                  </CardTitle>
                  <CardDescription>Budget allocations, spending, and forecasts</CardDescription>
                </CardHeader>
                <CardContent className="flex-grow">
                  <p className="text-sm text-muted-foreground">Generate PDF, Excel, or CSV reports of budget allocations versus actual spending from the Budget page.</p>
                </CardContent>
                <div className="p-4 pt-0 mt-auto">
                  <Button className="w-full" onClick={() => navigate('/budget')} data-testid="button-goto-budget-reports">Go to Budget</Button>
                </div>
              </Card>
              <Card className="flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-primary" />
                    Cost Submission Reports
                  </CardTitle>
                  <CardDescription>Operational cost submission history</CardDescription>
                </CardHeader>
                <CardContent className="flex-grow">
                  <p className="text-sm text-muted-foreground">View and export cost submission records, approval status, and payment details from the Cost Submission page.</p>
                </CardContent>
                <div className="p-4 pt-0 mt-auto">
                  <Button className="w-full" onClick={() => navigate('/cost-submission')} data-testid="button-goto-cost-reports">Go to Cost Submissions</Button>
                </div>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <DatabaseBackup className="h-5 w-5 text-primary" />
                      Report Generation
                    </CardTitle>
                    <CardDescription>Reports can be generated and exported from their respective pages</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Reports are generated from specific pages</p>
                      <ul className="text-sm text-blue-600 dark:text-blue-400 space-y-1 list-disc list-inside">
                        <li><strong>Wallet page</strong> - Export transaction history, monthly statements, and withdrawal reports</li>
                        <li><strong>Budget page</strong> - Generate budget vs. actual spending reports in PDF, Excel, or CSV</li>
                        <li><strong>Cost Submission page</strong> - Export cost submission records and approval summaries</li>
                        <li><strong>Finance Approval page</strong> - View payment processing history and audit trails</li>
                        <li><strong>Down-Payment page</strong> - Export advance request records</li>
                      </ul>
                      <p className="text-xs text-blue-500 dark:text-blue-400 mt-2">
                        Navigate to the relevant page using the buttons above to generate and download reports.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileBarChart className="h-5 w-5 text-primary" />
                  Quick Navigation
                </CardTitle>
                <CardDescription>Jump to specific financial pages for detailed reports</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Button variant="outline" className="h-auto py-3 flex flex-col items-center gap-1" onClick={() => navigate('/wallet')} data-testid="button-nav-wallet">
                    <Wallet className="h-5 w-5" />
                    <span>Wallet & Transactions</span>
                  </Button>
                  <Button variant="outline" className="h-auto py-3 flex flex-col items-center gap-1" onClick={() => navigate('/budget')} data-testid="button-nav-budget">
                    <BadgePercent className="h-5 w-5" />
                    <span>Budget Management</span>
                  </Button>
                  <Button variant="outline" className="h-auto py-3 flex flex-col items-center gap-1" onClick={() => navigate('/cost-submission')} data-testid="button-nav-costs">
                    <ReceiptText className="h-5 w-5" />
                    <span>Cost Submissions</span>
                  </Button>
                  <Button variant="outline" className="h-auto py-3 flex flex-col items-center gap-1" onClick={() => navigate('/down-payment-approval')} data-testid="button-nav-advances">
                    <ArrowUpDown className="h-5 w-5" />
                    <span>Down-Payments</span>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-approval-audit-summary">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2" data-testid="title-approval-audit-summary">
                      <Activity className="h-5 w-5 text-primary" />
                      Approval Audit Summary
                    </CardTitle>
                    <CardDescription data-testid="desc-approval-audit-summary">Unified view of all financial approval actions across workflows this month</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchAuditSummary} disabled={auditLoading} data-testid="button-refresh-audit">
                    {auditLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {auditLoading ? (
                  <div className="flex flex-col items-center gap-3 py-8" data-testid="loading-audit-summary">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Loading audit summary...</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="section-audit-kpis">
                      <div className="p-4 border rounded-lg" data-testid="kpi-total-actions">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30">
                            <Activity className="h-4 w-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Total Actions</p>
                            <p className="text-lg font-bold" data-testid="text-audit-total-actions">{auditKpis.totalActions}</p>
                            <p className="text-xs text-muted-foreground">This month</p>
                          </div>
                        </div>
                      </div>
                      <div className="p-4 border rounded-lg" data-testid="kpi-avg-approval-time">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/30">
                            <Clock className="h-4 w-4 text-amber-600" />
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Avg Approval Time</p>
                            <p className="text-lg font-bold" data-testid="text-audit-avg-approval-time">{auditKpis.avgApprovalDays} days</p>
                            <p className="text-xs text-muted-foreground">Submission to approval</p>
                          </div>
                        </div>
                      </div>
                      <div className="p-4 border rounded-lg" data-testid="kpi-approval-rate">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/30">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Approval Rate</p>
                            <p className="text-lg font-bold" data-testid="text-audit-approval-rate">{auditKpis.approvalRate}%</p>
                            <p className="text-xs text-muted-foreground">Approved / total decisions</p>
                          </div>
                        </div>
                      </div>
                      <div className="p-4 border rounded-lg" data-testid="kpi-pending-actions">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-full bg-purple-100 dark:bg-purple-900/30">
                            <AlertTriangle className="h-4 w-4 text-purple-600" />
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Pending Actions</p>
                            <p className="text-lg font-bold" data-testid="text-audit-pending-count">{auditKpis.pendingCount}</p>
                            <p className="text-xs text-muted-foreground">Awaiting approval</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div data-testid="section-audit-log-table">
                      <h3 className="text-sm font-semibold mb-3" data-testid="title-recent-actions">Recent Approval Actions</h3>
                      {auditLogs.length === 0 ? (
                        <div className="bg-muted/50 border rounded-lg p-6 text-center" data-testid="empty-audit-logs">
                          <Activity className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">No approval actions recorded this month yet.</p>
                          <p className="text-xs text-muted-foreground mt-1">Actions will appear here as approvals, rejections, and processing events are logged.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <Table data-testid="table-audit-logs">
                            <TableHeader>
                              <TableRow>
                                <TableHead data-testid="th-audit-datetime">Date/Time</TableHead>
                                <TableHead data-testid="th-audit-module">Module</TableHead>
                                <TableHead data-testid="th-audit-action">Action</TableHead>
                                <TableHead data-testid="th-audit-actor">Actor</TableHead>
                                <TableHead data-testid="th-audit-entity">Entity</TableHead>
                                <TableHead data-testid="th-audit-description">Description</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {auditLogs.map((log, idx) => {
                                const moduleLabel = (() => {
                                  switch (log.module) {
                                    case 'cost_approval': return 'Cost';
                                    case 'down_payment': return 'Advance';
                                    case 'withdrawal': return 'Withdrawal';
                                    case 'retainer': return 'Retainer';
                                    case 'wallet': return 'Wallet';
                                    case 'financial_operations': return 'Finance';
                                    default: return log.module;
                                  }
                                })();
                                const actionVariant = /approve/i.test(log.action) ? 'default' as const
                                  : /reject/i.test(log.action) ? 'destructive' as const
                                  : 'secondary' as const;
                                const actionLabel = log.action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

                                return (
                                  <TableRow key={log.id} data-testid={`row-audit-log-${idx}`}>
                                    <TableCell className="whitespace-nowrap text-sm" data-testid={`cell-audit-datetime-${idx}`}>
                                      {format(new Date(log.timestamp), 'MMM d, yyyy HH:mm')}
                                    </TableCell>
                                    <TableCell data-testid={`cell-audit-module-${idx}`}>
                                      <Badge variant="outline" className="text-xs">{moduleLabel}</Badge>
                                    </TableCell>
                                    <TableCell data-testid={`cell-audit-action-${idx}`}>
                                      <Badge variant={actionVariant} className="text-xs">{actionLabel}</Badge>
                                    </TableCell>
                                    <TableCell className="text-sm" data-testid={`cell-audit-actor-${idx}`}>
                                      {log.actor_name || log.actor_id || 'System'}
                                    </TableCell>
                                    <TableCell className="text-sm max-w-[200px] truncate" data-testid={`cell-audit-entity-${idx}`}>
                                      {log.entity_name || log.entity_type || '-'}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground max-w-[250px] truncate" data-testid={`cell-audit-desc-${idx}`}>
                                      {log.description || '-'}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="consolidated-statement" className="mt-4" data-testid="tabcontent-consolidated-statement">
          <div className="grid gap-6">
            <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Consolidated Financial Statement
            </h2>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-primary" />
                  Statement Configuration
                </CardTitle>
                <CardDescription>Configure the period and categories for the consolidated statement</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="cs-start-date">Start Date</Label>
                    <Input
                      id="cs-start-date"
                      type="date"
                      value={csStartDate}
                      onChange={(e) => setCsStartDate(e.target.value)}
                      data-testid="input-cs-start-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cs-end-date">End Date</Label>
                    <Input
                      id="cs-end-date"
                      type="date"
                      value={csEndDate}
                      onChange={(e) => setCsEndDate(e.target.value)}
                      data-testid="input-cs-end-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Input value={csCurrency} disabled data-testid="input-cs-currency" />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="cs-transport"
                      checked={csIncludeTransport}
                      onCheckedChange={setCsIncludeTransport}
                      data-testid="switch-cs-transport"
                    />
                    <Label htmlFor="cs-transport" className="text-sm">Transportation Costs</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="cs-operational"
                      checked={csIncludeOperational}
                      onCheckedChange={setCsIncludeOperational}
                      data-testid="switch-cs-operational"
                    />
                    <Label htmlFor="cs-operational" className="text-sm">Operational Costs</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="cs-wallet"
                      checked={csIncludeWallet}
                      onCheckedChange={setCsIncludeWallet}
                      data-testid="switch-cs-wallet"
                    />
                    <Label htmlFor="cs-wallet" className="text-sm">Wallet Transactions</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="cs-advances"
                      checked={csIncludeAdvances}
                      onCheckedChange={setCsIncludeAdvances}
                      data-testid="switch-cs-advances"
                    />
                    <Label htmlFor="cs-advances" className="text-sm">Advances</Label>
                  </div>
                </div>

                <div className="flex gap-2 mt-6 flex-wrap">
                  <Button onClick={fetchConsolidatedData} disabled={csLoading} data-testid="button-load-statement">
                    {csLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    Load Statement Data
                  </Button>
                  <Button variant="outline" onClick={generateConsolidatedPdf} disabled={!csData || csLoading} data-testid="button-generate-pdf">
                    <Download className="h-4 w-4 mr-2" />
                    Generate PDF
                  </Button>
                  <Button variant="outline" onClick={exportConsolidatedExcel} disabled={!csData || csLoading} data-testid="button-export-excel">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export Excel
                  </Button>
                </div>
              </CardContent>
            </Card>

            {csLoading && (
              <Card data-testid="loading-consolidated">
                <CardContent className="py-8">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Loading consolidated statement data...</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {csData && !csLoading && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="section-org-summary">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/30">
                          <DollarSign className="h-4 w-4 text-green-600" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Total Assets</p>
                          <p className="text-lg font-bold" data-testid="text-cs-total-assets">{formatCurrency(csData.totalAssets)}</p>
                          {exchangeRate && <p className="text-xs text-muted-foreground" data-testid="text-cs-total-assets-usd">{formatUsd(convertSdgToUsd(csData.totalAssets, exchangeRate.rate))}</p>}
                          <div className="mt-1 space-y-0.5">
                            <p className="text-xs text-muted-foreground" data-testid="text-cs-wallet-balances">Wallet balances: {formatCurrency(csData.totalAssets - csData.advancesReceivable)}</p>
                            <p className="text-xs text-muted-foreground" data-testid="text-cs-advances-receivable">Advances receivable: {formatCurrency(csData.advancesReceivable)}</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/30">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Total Liabilities</p>
                          <p className="text-lg font-bold" data-testid="text-cs-total-liabilities">{formatCurrency(csData.totalLiabilities)}</p>
                          {exchangeRate && <p className="text-xs text-muted-foreground" data-testid="text-cs-total-liabilities-usd">{formatUsd(convertSdgToUsd(csData.totalLiabilities, exchangeRate.rate))}</p>}
                          <p className="text-xs text-muted-foreground">Pending payments</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30">
                          <TrendingUp className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Net Position</p>
                          <p className="text-lg font-bold" data-testid="text-cs-net-position">{formatCurrency(csData.netPosition)}</p>
                          {exchangeRate && <p className="text-xs text-muted-foreground" data-testid="text-cs-net-position-usd">{formatUsd(convertSdgToUsd(csData.netPosition, exchangeRate.rate))}</p>}
                          <p className="text-xs text-muted-foreground">Assets - Liabilities</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card data-testid="section-inflows">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-green-600" />
                        Revenue / Inflows
                      </CardTitle>
                      <CardDescription>Wallet credits by category</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {csData.inflowCategories.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-inflows">No inflow data for the selected period.</p>
                      ) : (
                        <div className="space-y-2">
                          {csData.inflowCategories.map((cat, idx) => (
                            <div key={cat.category} className="flex items-center justify-between gap-2 py-1 border-b last:border-b-0" data-testid={`row-inflow-${idx}`}>
                              <span className="text-sm capitalize">{cat.category.replace(/_/g, ' ')}</span>
                              <div className="text-right">
                                <span className="text-sm font-medium text-green-600">{formatCurrency(cat.amount)}</span>
                                {exchangeRate && <p className="text-xs text-muted-foreground">{formatUsd(convertSdgToUsd(cat.amount, exchangeRate.rate))}</p>}
                              </div>
                            </div>
                          ))}
                          <div className="flex items-center justify-between gap-2 pt-2 font-bold">
                            <span className="text-sm">Total Inflows</span>
                            <div className="text-right">
                              <span className="text-sm text-green-700" data-testid="text-cs-total-inflow">{formatCurrency(csData.totalInflow)}</span>
                              {exchangeRate && <p className="text-xs text-muted-foreground" data-testid="text-cs-total-inflow-usd">{formatUsd(convertSdgToUsd(csData.totalInflow, exchangeRate.rate))}</p>}
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card data-testid="section-expenses">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <ArrowUpDown className="h-5 w-5 text-red-600" />
                        Expenses / Outflows
                      </CardTitle>
                      <CardDescription>Cost submissions and withdrawals by category</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {csData.expenseCategories.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-expenses">No expense data for the selected period.</p>
                      ) : (
                        <div className="space-y-2">
                          {csData.expenseCategories.map((cat, idx) => (
                            <div key={cat.category} className="flex items-center justify-between gap-2 py-1 border-b last:border-b-0" data-testid={`row-expense-${idx}`}>
                              <span className="text-sm capitalize">{cat.category.replace(/_/g, ' ')}</span>
                              <div className="text-right">
                                <span className="text-sm font-medium text-red-600">{formatCurrency(cat.amount)}</span>
                                {exchangeRate && <p className="text-xs text-muted-foreground">{formatUsd(convertSdgToUsd(cat.amount, exchangeRate.rate))}</p>}
                              </div>
                            </div>
                          ))}
                          <div className="flex items-center justify-between gap-2 pt-2 font-bold">
                            <span className="text-sm">Total Outflows</span>
                            <div className="text-right">
                              <span className="text-sm text-red-700" data-testid="text-cs-total-outflow">{formatCurrency(csData.totalOutflow)}</span>
                              {exchangeRate && <p className="text-xs text-muted-foreground" data-testid="text-cs-total-outflow-usd">{formatUsd(convertSdgToUsd(csData.totalOutflow, exchangeRate.rate))}</p>}
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {csData.projectBreakdown.length > 0 && (
                  <Card data-testid="section-project-breakdown">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileBarChart className="h-5 w-5 text-primary" />
                        Project-Level Breakdown
                      </CardTitle>
                      <CardDescription>Financial summary per project</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 px-2 font-medium text-muted-foreground">Project</th>
                              <th className="text-right py-2 px-2 font-medium text-muted-foreground">Inflow (SDG)</th>
                              <th className="text-right py-2 px-2 font-medium text-muted-foreground">Outflow (SDG)</th>
                              <th className="text-right py-2 px-2 font-medium text-muted-foreground">Net (SDG)</th>
                              {exchangeRate && <th className="text-right py-2 px-2 font-medium text-muted-foreground">Net (USD)</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {csData.projectBreakdown.map((p, idx) => (
                              <tr key={p.project} className="border-b last:border-b-0" data-testid={`row-project-${idx}`}>
                                <td className="py-2 px-2">{p.project}</td>
                                <td className="py-2 px-2 text-right text-green-600">{formatCurrency(p.inflow)}</td>
                                <td className="py-2 px-2 text-right text-red-600">{formatCurrency(p.outflow)}</td>
                                <td className="py-2 px-2 text-right font-medium">{formatCurrency(p.net)}</td>
                                {exchangeRate && <td className="py-2 px-2 text-right text-muted-foreground text-xs">{formatUsd(convertSdgToUsd(p.net, exchangeRate.rate))}</td>}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {csData.hubBreakdown.length > 0 && (
                  <Card data-testid="section-hub-breakdown">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <DatabaseBackup className="h-5 w-5 text-primary" />
                        Hub-Level Breakdown
                      </CardTitle>
                      <CardDescription>Financial summary per hub</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 px-2 font-medium text-muted-foreground">Hub</th>
                              <th className="text-right py-2 px-2 font-medium text-muted-foreground">Inflow (SDG)</th>
                              <th className="text-right py-2 px-2 font-medium text-muted-foreground">Outflow (SDG)</th>
                              <th className="text-right py-2 px-2 font-medium text-muted-foreground">Net (SDG)</th>
                              {exchangeRate && <th className="text-right py-2 px-2 font-medium text-muted-foreground">Net (USD)</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {csData.hubBreakdown.map((h, idx) => (
                              <tr key={h.hub} className="border-b last:border-b-0" data-testid={`row-hub-${idx}`}>
                                <td className="py-2 px-2">{h.hub}</td>
                                <td className="py-2 px-2 text-right text-green-600">{formatCurrency(h.inflow)}</td>
                                <td className="py-2 px-2 text-right text-red-600">{formatCurrency(h.outflow)}</td>
                                <td className="py-2 px-2 text-right font-medium">{formatCurrency(h.net)}</td>
                                {exchangeRate && <td className="py-2 px-2 text-right text-muted-foreground text-xs">{formatUsd(convertSdgToUsd(h.net, exchangeRate.rate))}</td>}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {!csData && !csLoading && (
              <Card data-testid="section-cs-empty">
                <CardContent className="py-8">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <Info className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Click "Load Statement Data" to generate a consolidated financial statement for the selected period.</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Finance;
