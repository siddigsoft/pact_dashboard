import { useState, useEffect, useMemo } from 'react';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DollarSign,
  Award,
  TrendingUp,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  ExternalLink,
  Wallet,
  FileText,
  BarChart3,
  FolderKanban,
  AlertTriangle,
  Receipt,
  ChevronLeft,
  TrendingDown,
  Activity,
  Lock,
  Unlock,
  CalendarCheck,
  CalendarDays
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useAuthorization } from '@/hooks/use-authorization';
import { useCostSubmissions } from '@/context/costApproval/CostSubmissionContext';
import { useClassification } from '@/context/classification/ClassificationContext';
import { useWallet } from '@/context/wallet/WalletContext';
import { useBudget } from '@/context/budget/BudgetContext';
import { useProjectContext } from '@/context/project/ProjectContext';
import { useUser } from '@/context/user/UserContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { WorkflowRail } from '@/components/financial/WorkflowRail';
import { GradientStatCard, GRADIENT_PRESETS } from '@/components/dashboard/GradientStatCard';
import { PageLoader } from '@/components/ui/loading-badge';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, isValid, subMonths, addMonths, startOfMonth, endOfMonth } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { ConsolidatedFinancialTab } from '@/components/financial/ConsolidatedFinancialTab';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const formatCurrency = (amount: number, currency: string = 'SDG') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency === 'SDG' ? 'USD' : currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount).replace('$', currency === 'SDG' ? 'SDG ' : '$');
};

interface OpCostRow {
  id: string;
  project_id: string | null;
  expense_category: string;
  amount_cents: number;
  currency: string;
  description: string | null;
  submitted_by: string;
  submitted_at: string | null;
  status: string;
  tier1_status: string | null;
  tier2_status: string | null;
  paid_at: string | null;
  reconciled_at: string | null;
  reconciled_amount_cents: number | null;
  created_at: string;
}

const getOpDerivedStatus = (oc: OpCostRow): string => {
  if (oc.reconciled_at) return 'reconciled';
  if (oc.paid_at) return 'paid';
  if (oc.tier2_status === 'approved') return 'approved';
  if (oc.tier2_status === 'rejected' || oc.tier1_status === 'rejected') return 'rejected';
  if (oc.tier1_status === 'approved') return 'under_review';
  return 'pending';
};

const FinancialOperations = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canManageFinances } = useAuthorization();
  const [activeTab, setActiveTab] = useState('consolidated');

  const { submissions: costSubmissions, isLoading: submissionsLoading } = useCostSubmissions();
  const { userClassifications, feeStructures, loading: classificationsLoading } = useClassification();
  const { loading: walletLoading } = useWallet();
  const { projectBudgets } = useBudget();
  const { projects } = useProjectContext();
  const { users, currentUser } = useUser();

  interface ClosedPeriodRecord {
    month: string;
    status: 'closed' | 'locked';
    closedBy: string;
    closedByName: string;
    closedAt: string;
  }

  interface PeriodData {
    month: string;
    label: string;
    walletTxCount: number;
    opCostCount: number;
    totalCount: number;
    totalAmount: number;
    pendingCount: number;
    status: 'open' | 'closed' | 'locked';
    closedBy: string | null;
    closedByName: string | null;
    closedAt: string | null;
  }

  const [periodCloseData, setPeriodCloseData] = useState<PeriodData[]>([]);
  const [periodCloseLoading, setPeriodCloseLoading] = useState(false);
  const [closedPeriods, setClosedPeriods] = useState<Record<string, ClosedPeriodRecord>>(() => {
    try {
      const stored = localStorage.getItem('pact_closed_periods');
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });
  const [periodCloseDialog, setPeriodCloseDialog] = useState<{ open: boolean; month: string; label: string; pendingCount: number }>({ open: false, month: '', label: '', pendingCount: 0 });
  const [periodReopenDialog, setPeriodReopenDialog] = useState<{ open: boolean; month: string; label: string }>({ open: false, month: '', label: '' });

  const isSuperAdmin = currentUser?.role === 'superAdmin' || currentUser?.roles?.includes('superAdmin' as any);

  const saveClosedPeriods = (updated: Record<string, ClosedPeriodRecord>) => {
    setClosedPeriods(updated);
    localStorage.setItem('pact_closed_periods', JSON.stringify(updated));
  };

  const handleClosePeriod = (month: string, label: string, pendingCount: number) => {
    setPeriodCloseDialog({ open: true, month, label, pendingCount });
  };

  const confirmClosePeriod = () => {
    const { month } = periodCloseDialog;
    const updated = {
      ...closedPeriods,
      [month]: {
        month,
        status: 'closed' as const,
        closedBy: currentUser?.id || 'unknown',
        closedByName: currentUser?.name || currentUser?.email || 'Unknown',
        closedAt: new Date().toISOString(),
      },
    };
    saveClosedPeriods(updated);
    setPeriodCloseDialog({ open: false, month: '', label: '', pendingCount: 0 });
    toast({ title: 'Period Closed', description: `${periodCloseDialog.label} has been closed successfully.` });
  };

  const handleReopenPeriod = (month: string, label: string) => {
    setPeriodReopenDialog({ open: true, month, label });
  };

  const confirmReopenPeriod = () => {
    const { month } = periodReopenDialog;
    const updated = { ...closedPeriods };
    delete updated[month];
    saveClosedPeriods(updated);
    setPeriodReopenDialog({ open: false, month: '', label: '' });
    toast({ title: 'Period Reopened', description: `${periodReopenDialog.label} has been reopened.` });
  };

  useEffect(() => {
    if (activeTab !== 'periodClose') return;
    const fetchPeriodData = async () => {
      setPeriodCloseLoading(true);
      try {
        const now = new Date();
        const projectStart = startOfMonth(new Date('2025-01-01'));
        const currentMonth = startOfMonth(now);
        const months: string[] = [];
        let cursor = projectStart;
        while (cursor <= currentMonth) {
          months.push(format(cursor, 'yyyy-MM'));
          cursor = addMonths(cursor, 1);
        }

        const fromDate = format(projectStart, 'yyyy-MM-dd');

        const [walletRes, opCostRes] = await Promise.all([
          supabase
            .from('wallet_transactions')
            .select('amount, created_at, type')
            .gte('created_at', fromDate),
          supabase
            .from('operational_cost_submissions')
            .select('amount_cents, created_at, status, tier1_status, tier2_status')
            .gte('created_at', fromDate),
        ]);

        const walletByMonth: Record<string, { count: number; amount: number }> = {};
        const opCostByMonth: Record<string, { count: number; amount: number; pendingCount: number }> = {};

        months.forEach(m => {
          walletByMonth[m] = { count: 0, amount: 0 };
          opCostByMonth[m] = { count: 0, amount: 0, pendingCount: 0 };
        });

        (walletRes.data || []).forEach((tx: any) => {
          try {
            const key = format(parseISO(tx.created_at), 'yyyy-MM');
            if (walletByMonth[key]) {
              walletByMonth[key].count++;
              walletByMonth[key].amount += Math.abs(tx.amount || 0);
            }
          } catch {}
        });

        (opCostRes.data || []).forEach((oc: any) => {
          try {
            const key = format(parseISO(oc.created_at), 'yyyy-MM');
            if (opCostByMonth[key]) {
              opCostByMonth[key].count++;
              opCostByMonth[key].amount += (oc.amount_cents || 0) / 100;
              const isPending = !oc.tier2_status || (oc.tier2_status !== 'approved' && oc.tier2_status !== 'rejected');
              if (isPending && oc.status !== 'rejected') {
                opCostByMonth[key].pendingCount++;
              }
            }
          } catch {}
        });

        const storedPeriods = closedPeriods;
        const periodRows: PeriodData[] = months.map(m => {
          const wallet = walletByMonth[m] || { count: 0, amount: 0 };
          const opCost = opCostByMonth[m] || { count: 0, amount: 0, pendingCount: 0 };
          const closed = storedPeriods[m];
          return {
            month: m,
            label: format(parseISO(m + '-01'), 'MMMM yyyy'),
            walletTxCount: wallet.count,
            opCostCount: opCost.count,
            totalCount: wallet.count + opCost.count,
            totalAmount: wallet.amount + opCost.amount,
            pendingCount: opCost.pendingCount,
            status: closed ? closed.status : 'open',
            closedBy: closed?.closedBy || null,
            closedByName: closed?.closedByName || null,
            closedAt: closed?.closedAt || null,
          };
        });

        setPeriodCloseData(periodRows.reverse());
      } catch (err) {
        console.error('Failed to fetch period close data:', err);
      } finally {
        setPeriodCloseLoading(false);
      }
    };
    fetchPeriodData();
  }, [activeTab, closedPeriods]);

  const periodKpis = useMemo(() => {
    const total = periodCloseData.length;
    const closed = periodCloseData.filter(p => p.status === 'closed' || p.status === 'locked').length;
    const open = total - closed;
    const latestClosed = periodCloseData.find(p => p.status === 'closed' || p.status === 'locked');
    return { total, open, closed, latestClosedLabel: latestClosed?.label || 'None' };
  }, [periodCloseData]);

  const [opCosts, setOpCosts] = useState<OpCostRow[]>([]);
  const [opCostsLoaded, setOpCostsLoaded] = useState(false);

  useEffect(() => {
    const fetchOpCosts = async () => {
      try {
        const { data, error } = await supabase
          .from('operational_cost_submissions')
          .select('id, project_id, expense_category, amount_cents, currency, description, submitted_by, submitted_at, status, tier1_status, tier2_status, paid_at, reconciled_at, reconciled_amount_cents, created_at')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setOpCosts((data as OpCostRow[]) || []);
      } catch (err) {
        console.error('Failed to fetch operational costs:', err);
      } finally {
        setOpCostsLoaded(true);
      }
    };
    fetchOpCosts();
  }, []);

  interface CashFlowMonth {
    month: string;
    label: string;
    inflows: number;
    outflows: number;
    net: number;
    runningBalance: number;
    isProjected: boolean;
  }

  const [cashFlowData, setCashFlowData] = useState<CashFlowMonth[]>([]);
  const [cashFlowLoading, setCashFlowLoading] = useState(false);

  useEffect(() => {
    if (activeTab !== 'cashflow') return;
    const fetchCashFlow = async () => {
      setCashFlowLoading(true);
      try {
        const now = new Date();
        const sixMonthsAgo = startOfMonth(subMonths(now, 5));
        const fromDate = format(sixMonthsAgo, 'yyyy-MM-dd');

        const [creditsRes, debitsRes, paidCostsRes] = await Promise.all([
          supabase
            .from('wallet_transactions')
            .select('amount, created_at')
            .eq('type', 'credit')
            .gte('created_at', fromDate),
          supabase
            .from('wallet_transactions')
            .select('amount, created_at')
            .eq('type', 'debit')
            .gte('created_at', fromDate),
          supabase
            .from('operational_cost_submissions')
            .select('amount_cents, paid_at')
            .not('paid_at', 'is', null)
            .gte('paid_at', fromDate),
        ]);

        const monthlyMap: Record<string, { inflows: number; outflows: number }> = {};

        for (let i = 5; i >= 0; i--) {
          const key = format(subMonths(now, i), 'yyyy-MM');
          monthlyMap[key] = { inflows: 0, outflows: 0 };
        }

        (creditsRes.data || []).forEach((tx: any) => {
          const key = format(parseISO(tx.created_at), 'yyyy-MM');
          if (monthlyMap[key]) monthlyMap[key].inflows += Math.abs(tx.amount || 0);
        });

        (debitsRes.data || []).forEach((tx: any) => {
          const key = format(parseISO(tx.created_at), 'yyyy-MM');
          if (monthlyMap[key]) monthlyMap[key].outflows += Math.abs(tx.amount || 0);
        });

        (paidCostsRes.data || []).forEach((oc: any) => {
          const key = format(parseISO(oc.paid_at), 'yyyy-MM');
          if (monthlyMap[key]) monthlyMap[key].outflows += (oc.amount_cents || 0) / 100;
        });

        const pastMonths = Object.entries(monthlyMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, data]) => ({
            month,
            label: format(parseISO(month + '-01'), 'MMM yyyy'),
            inflows: data.inflows,
            outflows: data.outflows,
            net: data.inflows - data.outflows,
            runningBalance: 0,
            isProjected: false,
          }));

        const last3 = pastMonths.slice(-3);
        const avgInflows = last3.reduce((s, m) => s + m.inflows, 0) / (last3.length || 1);
        const avgOutflows = last3.reduce((s, m) => s + m.outflows, 0) / (last3.length || 1);

        const projectedMonths: CashFlowMonth[] = [];
        for (let i = 1; i <= 3; i++) {
          const futureDate = addMonths(now, i);
          const key = format(futureDate, 'yyyy-MM');
          projectedMonths.push({
            month: key,
            label: format(futureDate, 'MMM yyyy'),
            inflows: avgInflows,
            outflows: avgOutflows,
            net: avgInflows - avgOutflows,
            runningBalance: 0,
            isProjected: true,
          });
        }

        const allMonths = [...pastMonths, ...projectedMonths];
        let balance = 0;
        allMonths.forEach(m => {
          balance += m.net;
          m.runningBalance = balance;
        });

        setCashFlowData(allMonths);
      } catch (err) {
        console.error('Failed to fetch cash flow data:', err);
      } finally {
        setCashFlowLoading(false);
      }
    };
    fetchCashFlow();
  }, [activeTab]);

  const cashFlowKpis = useMemo(() => {
    if (cashFlowData.length === 0) return { currentPosition: 0, avgBurnRate: 0, projectedRunway: 0 };
    const pastMonths = cashFlowData.filter(m => !m.isProjected);
    const lastMonth = pastMonths[pastMonths.length - 1];
    const currentPosition = lastMonth?.runningBalance || 0;
    const avgBurnRate = pastMonths.length > 0
      ? pastMonths.reduce((s, m) => s + m.outflows, 0) / pastMonths.length
      : 0;
    const avgNetInflow = pastMonths.length > 0
      ? pastMonths.reduce((s, m) => s + m.inflows, 0) / pastMonths.length
      : 0;
    const monthlyNetBurn = avgBurnRate - avgNetInflow;
    const projectedRunway = monthlyNetBurn > 0 && currentPosition > 0
      ? currentPosition / monthlyNetBurn
      : monthlyNetBurn <= 0 ? 999 : 0;
    return { currentPosition, avgBurnRate, projectedRunway: Math.min(projectedRunway, 999) };
  }, [cashFlowData]);

  const cashFlowSummary = useMemo(() => {
    if (cashFlowData.length === 0) return null;
    const totalInflows = cashFlowData.reduce((s, m) => s + m.inflows, 0);
    const totalOutflows = cashFlowData.reduce((s, m) => s + m.outflows, 0);
    const netCashFlow = totalInflows - totalOutflows;
    const openingBalance = 0;
    const closingBalance = cashFlowData[cashFlowData.length - 1]?.runningBalance || 0;
    return { openingBalance, totalInflows, totalOutflows, netCashFlow, closingBalance };
  }, [cashFlowData]);

  const projectCostBreakdown = useMemo(() => {
    const grouped: Record<string, { projectId: string; projectName: string; totalSubmitted: number; totalApproved: number; totalPaid: number; count: number; pendingCount: number }> = {};
    opCosts.forEach(oc => {
      const pid = oc.project_id || '__general__';
      if (!grouped[pid]) {
        const proj = projects.find(p => p.id === pid);
        grouped[pid] = { projectId: pid, projectName: proj?.name || (pid === '__general__' ? 'PACT (General)' : 'PACT'), totalSubmitted: 0, totalApproved: 0, totalPaid: 0, count: 0, pendingCount: 0 };
      }
      const status = getOpDerivedStatus(oc);
      grouped[pid].count++;
      grouped[pid].totalSubmitted += oc.amount_cents;
      if (['approved', 'paid', 'reconciled'].includes(status)) grouped[pid].totalApproved += oc.amount_cents;
      if (['paid', 'reconciled'].includes(status)) grouped[pid].totalPaid += oc.amount_cents;
      if (['pending', 'under_review'].includes(status)) grouped[pid].pendingCount++;
    });
    return Object.values(grouped).sort((a, b) => b.totalSubmitted - a.totalSubmitted);
  }, [opCosts, projects]);

  const budgetVsActual = useMemo(() => {
    return projectBudgets.map(budget => {
      const pid = (budget as any).projectId || (budget as any).project_id;
      const proj = projects.find(p => p.id === pid);
      const costData = projectCostBreakdown.find(pc => pc.projectId === pid);
      const totalBudgetCents = (budget as any).totalBudgetCents || (budget as any).total_budget_cents || 0;
      const actualSpend = costData?.totalApproved || 0;
      const utilization = totalBudgetCents > 0 ? (actualSpend / totalBudgetCents) * 100 : 0;
      return {
        projectId: pid,
        projectName: proj?.name || 'Unknown',
        budgetCents: totalBudgetCents,
        actualSpendCents: actualSpend,
        paidCents: costData?.totalPaid || 0,
        varianceCents: totalBudgetCents - actualSpend,
        utilization: Math.min(utilization, 100),
        submissionCount: costData?.count || 0,
        pendingCount: costData?.pendingCount || 0,
      };
    }).sort((a, b) => b.utilization - a.utilization);
  }, [projectBudgets, projectCostBreakdown, projects]);

  const recentPaidCosts = useMemo(() => {
    return opCosts
      .filter(oc => oc.paid_at || oc.reconciled_at)
      .sort((a, b) => {
        const dateA = a.paid_at || a.reconciled_at || a.created_at;
        const dateB = b.paid_at || b.reconciled_at || b.created_at;
        return dateB.localeCompare(dateA);
      })
      .slice(0, 20);
  }, [opCosts]);

  const getUserName = (userId: string) => {
    const u = users.find(u => u.id === userId);
    return u?.name || u?.email || userId.slice(0, 8);
  };

  const safeFormatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try { const d = parseISO(dateStr); return isValid(d) ? format(d, 'dd MMM yyyy') : '-'; } catch { return '-'; }
  };

  const canAccess = canManageFinances();

  if (!canAccess) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-5 w-5" />
          <AlertDescription>
            Access Denied: You do not have permission to view Financial Operations. This page is restricted to administrators and financial admins.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const isLoading = submissionsLoading || classificationsLoading || walletLoading;

  const totalSubmissions = costSubmissions?.length || 0;
  const pendingCount = costSubmissions?.filter(s => s.status === 'pending').length || 0;
  const approvedCount = costSubmissions?.filter(s => s.status === 'approved').length || 0;
  const rejectedCount = costSubmissions?.filter(s => s.status === 'rejected').length || 0;
  const paidCount = costSubmissions?.filter(s => s.status === 'paid').length || 0;

  const totalPendingAmount = costSubmissions
    ?.filter(s => s.status === 'pending')
    .reduce((sum, s) => sum + (s.totalCostCents || 0), 0) || 0;

  const totalApprovedAmount = costSubmissions
    ?.filter(s => s.status === 'approved')
    .reduce((sum, s) => sum + (s.totalCostCents || 0), 0) || 0;

  const totalPaidAmount = costSubmissions
    ?.filter(s => s.status === 'paid')
    .reduce((sum, s) => sum + (s.paidAmountCents || s.totalCostCents || 0), 0) || 0;

  const approvalRate = totalSubmissions > 0 ? Math.round((approvedCount / totalSubmissions) * 100) : 0;

  const levelASubmissions = costSubmissions?.filter(s => s.classificationLevel === 'A').length || 0;
  const levelBSubmissions = costSubmissions?.filter(s => s.classificationLevel === 'B').length || 0;
  const levelCSubmissions = costSubmissions?.filter(s => s.classificationLevel === 'C').length || 0;

  if (isLoading) {
    return <PageLoader message="Loading Financial Operations..." />;
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} data-testid="button-back">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2" data-testid="text-financial-ops-title">
              <DollarSign className="h-6 w-6 md:h-8 md:w-8 text-primary" />
              Financial Operations
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Unified dashboard for cost management and approvals
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => navigate('/cost-submission')}
          data-testid="button-new-submission"
        >
          <Receipt className="h-4 w-4 mr-2" />
          New Submission
        </Button>
      </div>

      <PageInfoBanner
        title="Financial Operations - Overview & Reporting"
        description="This is the CENTRAL HUB for viewing all financial activity across the organization. It brings together transportation costs, operational cost submissions, and a consolidated overview in one place. This page is for VIEWING and REPORTING only -- to submit new costs, use the Cost Submission page. To approve costs, use the Tier 1 or Tier 2 Approval pages. Use this page to track spending trends, compare costs across projects, and export reports."
        descriptionAr="هذا هو المركز الرئيسي لعرض جميع الأنشطة المالية في المنظمة. يجمع تكاليف النقل وطلبات التكاليف التشغيلية ونظرة عامة موحدة في مكان واحد. هذه الصفحة للعرض والتقارير فقط -- لتقديم تكاليف جديدة، استخدم صفحة تقديم التكاليف. للموافقة على التكاليف، استخدم صفحات الموافقات المستوى الأول أو الثاني. استخدم هذه الصفحة لتتبع اتجاهات الإنفاق، ومقارنة التكاليف بين المشاريع، وتصدير التقارير."
        workflowSteps={[
          { step: 1, role: 'Field Staff', action: 'Submits costs', description: 'Team members submit operational expenses through the Cost Submission page, or incur transportation costs via site visits.' },
          { step: 2, role: 'Supervisor', action: 'Approves (Tier 1)', description: 'Supervisors review and approve cost submissions -- those approved costs appear in this dashboard.' },
          { step: 3, role: 'Admin', action: 'Final Approval (Tier 2)', description: 'Admin gives final sign-off. Fully approved costs are reflected in spending totals here.' },
          { step: 4, role: 'System', action: 'Credits wallet & reconciles', description: 'Approved amounts are credited to wallets. Any transportation advances are automatically deducted.' },
          { step: 5, role: 'Finance Admin', action: 'Reviews reports here', description: 'Finance uses this page to view consolidated spending, compare projects, spot trends, and export reports.' },
        ]}
        workflowStepsAr={[
          { step: 1, role: 'موظف ميداني', action: 'يقدم التكاليف', description: 'يقدم أعضاء الفريق المصاريف التشغيلية عبر صفحة تقديم التكاليف، أو تُسجَّل تكاليف النقل من خلال الزيارات الميدانية.' },
          { step: 2, role: 'المشرف', action: 'يوافق (المستوى الأول)', description: 'يراجع المشرفون طلبات التكاليف ويوافقون عليها -- تظهر التكاليف المعتمدة في لوحة المعلومات هذه.' },
          { step: 3, role: 'المدير', action: 'الموافقة النهائية (المستوى الثاني)', description: 'يمنح المدير الاعتماد النهائي. تنعكس التكاليف المعتمدة بالكامل في إجمالي الإنفاق هنا.' },
          { step: 4, role: 'النظام', action: 'يُضيف للمحفظة ويُسوّي', description: 'تُضاف المبالغ المعتمدة للمحافظ. تُخصم أي سلف نقل مسبقة تلقائياً.' },
          { step: 5, role: 'مدير المالية', action: 'يراجع التقارير هنا', description: 'يستخدم قسم المالية هذه الصفحة لعرض الإنفاق الموحد، ومقارنة المشاريع، ورصد الاتجاهات، وتصدير التقارير.' },
        ]}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="inline-flex w-auto min-w-full md:w-full h-auto p-1 gap-1">
            <TabsTrigger value="consolidated" className="text-xs md:text-sm px-3" data-testid="tab-consolidated">Consolidated</TabsTrigger>
            <TabsTrigger value="overview" className="text-xs md:text-sm px-3" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="workflow" className="text-xs md:text-sm px-3" data-testid="tab-workflow">Workflow</TabsTrigger>
            <TabsTrigger value="classifications" className="text-xs md:text-sm px-3" data-testid="tab-classifications">Classifications</TabsTrigger>
            <TabsTrigger value="budget" className="text-xs md:text-sm px-3" data-testid="tab-budget">Budget</TabsTrigger>
            <TabsTrigger value="payments" className="text-xs md:text-sm px-3" data-testid="tab-payments">Payments</TabsTrigger>
            <TabsTrigger value="cashflow" className="text-xs md:text-sm px-3" data-testid="tab-cashflow">Cash Flow</TabsTrigger>
            <TabsTrigger value="periodClose" className="text-xs md:text-sm px-3" data-testid="tab-period-close">Period Close</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="consolidated">
          <ConsolidatedFinancialTab
            opCosts={opCosts}
            costSubmissions={costSubmissions || []}
            totalPendingAmount={totalPendingAmount}
            totalApprovedAmount={totalApprovedAmount}
            totalPaidAmount={totalPaidAmount}
          />
        </TabsContent>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <GradientStatCard
              title="Pending"
              value={pendingCount}
              subtitle={formatCurrency(totalPendingAmount / 100, 'SDG')}
              icon={Clock}
              gradient={GRADIENT_PRESETS.blue}
              onClick={() => setActiveTab('workflow')}
              testId="card-pending-approvals"
            />
            <GradientStatCard
              title="Approved & Paid"
              value={approvedCount + paidCount}
              subtitle={`${approvalRate}% rate`}
              icon={CheckCircle}
              gradient={GRADIENT_PRESETS.green}
              testId="card-approved"
            />
            <GradientStatCard
              title="Classified Users"
              value={userClassifications?.length || 0}
              subtitle={`${feeStructures?.length || 0} fee structures`}
              icon={Users}
              gradient={GRADIENT_PRESETS.purple}
              onClick={() => setActiveTab('classifications')}
              testId="card-classifications"
            />
            <GradientStatCard
              title="Total Paid"
              value={formatCurrency(totalPaidAmount / 100, 'SDG')}
              subtitle={`${paidCount} payments`}
              icon={Wallet}
              gradient={GRADIENT_PRESETS.red}
              onClick={() => setActiveTab('payments')}
              testId="card-payments"
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-muted-foreground" />
                  Submission Workflow Status
                </CardTitle>
                <CardDescription>Current state of cost submissions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-orange-500" />
                      Pending Review
                    </span>
                    <Badge variant="secondary">{pendingCount}</Badge>
                  </div>
                  <Progress value={totalSubmissions > 0 ? (pendingCount / totalSubmissions) * 100 : 0} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      Approved
                    </span>
                    <Badge variant="secondary">{approvedCount}</Badge>
                  </div>
                  <Progress value={totalSubmissions > 0 ? (approvedCount / totalSubmissions) * 100 : 0} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      Paid
                    </span>
                    <Badge variant="secondary">{paidCount}</Badge>
                  </div>
                  <Progress value={totalSubmissions > 0 ? (paidCount / totalSubmissions) * 100 : 0} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      Rejected
                    </span>
                    <Badge variant="secondary">{rejectedCount}</Badge>
                  </div>
                  <Progress value={totalSubmissions > 0 ? (rejectedCount / totalSubmissions) * 100 : 0} className="h-2" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  Submissions by Classification
                </CardTitle>
                <CardDescription>Cost distribution across levels</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      Level A (Senior)
                    </span>
                    <Badge variant="secondary">{levelASubmissions}</Badge>
                  </div>
                  <Progress value={totalSubmissions > 0 ? (levelASubmissions / totalSubmissions) * 100 : 0} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      Level B (Regular)
                    </span>
                    <Badge variant="secondary">{levelBSubmissions}</Badge>
                  </div>
                  <Progress value={totalSubmissions > 0 ? (levelBSubmissions / totalSubmissions) * 100 : 0} className="h-2" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-orange-500" />
                      Level C (Junior)
                    </span>
                    <Badge variant="secondary">{levelCSubmissions}</Badge>
                  </div>
                  <Progress value={totalSubmissions > 0 ? (levelCSubmissions / totalSubmissions) * 100 : 0} className="h-2" />
                </div>
              </CardContent>
            </Card>
          </div>

          {projectCostBreakdown.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderKanban className="h-5 w-5 text-muted-foreground" />
                  Spending by Project
                </CardTitle>
                <CardDescription>Top projects by operational cost submissions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {projectCostBreakdown.slice(0, 5).map(pc => {
                  const maxAmount = projectCostBreakdown[0]?.totalSubmitted || 1;
                  return (
                    <div key={pc.projectId} className="flex items-center gap-3" data-testid={`project-cost-${pc.projectId}`}>
                      <Button
                        variant="link"
                        className="p-0 h-auto text-sm font-medium min-w-[140px] text-left justify-start truncate"
                        onClick={() => pc.projectId !== '__general__' && navigate(`/projects/${pc.projectId}`)}
                        data-testid={`link-overview-project-${pc.projectId}`}
                      >
                        {pc.projectName}
                      </Button>
                      <div className="flex-1">
                        <Progress value={(pc.totalSubmitted / maxAmount) * 100} className="h-2" />
                      </div>
                      <span className="font-mono text-sm min-w-[100px] text-right">{formatCurrency(pc.totalSubmitted / 100)}</span>
                      {pc.pendingCount > 0 && (
                        <Badge variant="secondary" className="text-xs">{pc.pendingCount} pending</Badge>
                      )}
                    </div>
                  );
                })}
                {projectCostBreakdown.length > 5 && (
                  <p className="text-muted-foreground text-xs text-center pt-2">+ {projectCostBreakdown.length - 5} more projects</p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Navigate to detailed views</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Button
                  variant="outline"
                  className="justify-start h-auto py-4"
                  onClick={() => navigate('/cost-approval')}
                  data-testid="button-review-pending"
                >
                  <div className="flex items-center gap-3 w-full">
                    <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    <div className="text-left flex-1">
                      <div className="font-semibold">Review Pending</div>
                      <div className="text-xs text-muted-foreground">{pendingCount} awaiting review</div>
                    </div>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="justify-start h-auto py-4"
                  onClick={() => navigate('/classifications')}
                  data-testid="button-manage-classifications"
                >
                  <div className="flex items-center gap-3 w-full">
                    <Award className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    <div className="text-left flex-1">
                      <div className="font-semibold">Manage Classifications</div>
                      <div className="text-xs text-muted-foreground">{userClassifications?.length} users</div>
                    </div>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="justify-start h-auto py-4"
                  onClick={() => navigate('/finance')}
                  data-testid="button-view-payments"
                >
                  <div className="flex items-center gap-3 w-full">
                    <Wallet className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <div className="text-left flex-1">
                      <div className="font-semibold">View Payments</div>
                      <div className="text-xs text-muted-foreground">{paidCount} transactions</div>
                    </div>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="justify-start h-auto py-4"
                  onClick={() => navigate('/budget')}
                  data-testid="button-view-budgets"
                >
                  <div className="flex items-center gap-3 w-full">
                    <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <div className="text-left flex-1">
                      <div className="font-semibold">Budget Overview</div>
                      <div className="text-xs text-muted-foreground">{projectBudgets?.length || 0} budgets</div>
                    </div>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workflow" className="space-y-4 mt-4">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">Cost Approval Workflow</h2>
                <p className="text-muted-foreground">Review and approve cost submissions in the workflow pipeline</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/cost-submission')}
                data-testid="button-new-submission-workflow"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                New Submission
              </Button>
            </div>
            <WorkflowRail
              onNavigateToSubmission={(id) => {
                toast({
                  title: 'Viewing Submission',
                  description: `Opening details for submission ${id.slice(0, 8)}...`,
                });
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="classifications" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Classification Impact on Costs</CardTitle>
              <CardDescription>View full classifications page for detailed management</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate('/classifications')}>
                <ExternalLink className="h-4 w-4 mr-2" />
                View Classifications Page
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="budget" className="space-y-4 mt-4" data-testid="tab-content-budget">
          {budgetVsActual.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="budget-summary-cards">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs text-muted-foreground">Total Budgeted</span>
                  </div>
                  <p className="text-xl font-bold font-mono" data-testid="text-total-budgeted">
                    {formatCurrency(budgetVsActual.reduce((s, i) => s + i.budgetCents, 0) / 100)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <span className="text-xs text-muted-foreground">Total Actual Spent</span>
                  </div>
                  <p className="text-xl font-bold font-mono" data-testid="text-total-actual-spent">
                    {formatCurrency(budgetVsActual.reduce((s, i) => s + i.actualSpendCents, 0) / 100)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <BarChart3 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    <span className="text-xs text-muted-foreground">Total Variance</span>
                  </div>
                  {(() => {
                    const totalVariance = budgetVsActual.reduce((s, i) => s + i.varianceCents, 0);
                    return (
                      <p className={`text-xl font-bold font-mono ${totalVariance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} data-testid="text-total-variance">
                        {totalVariance >= 0 ? '+' : ''}{formatCurrency(totalVariance / 100)}
                      </p>
                    );
                  })()}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Award className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    <span className="text-xs text-muted-foreground">Avg Utilization</span>
                  </div>
                  <p className="text-xl font-bold font-mono" data-testid="text-avg-utilization">
                    {budgetVsActual.length > 0
                      ? (budgetVsActual.reduce((s, i) => s + i.utilization, 0) / budgetVsActual.length).toFixed(1)
                      : '0.0'}%
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                Budget vs Actual Comparison
              </CardTitle>
              <CardDescription>Compare project budgets against actual operational cost submissions</CardDescription>
            </CardHeader>
            <CardContent>
              {budgetVsActual.length === 0 ? (
                <div className="text-center py-8">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
                  <p className="text-muted-foreground">No project budgets found. Create budgets on the Budget page to see comparisons.</p>
                  <Button variant="outline" className="mt-4" onClick={() => navigate('/budget')} data-testid="button-goto-budget">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Go to Budget Page
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto" data-testid="budget-vs-actual-table-wrapper">
                  <Table data-testid="budget-vs-actual-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project Name</TableHead>
                        <TableHead className="text-right">Budgeted Amount</TableHead>
                        <TableHead className="text-right">Actual Spent</TableHead>
                        <TableHead className="text-right">Variance</TableHead>
                        <TableHead className="text-right">Utilization %</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {budgetVsActual.map(item => {
                        const statusColor = item.utilization > 95
                          ? 'text-red-600 dark:text-red-400'
                          : item.utilization >= 80
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-green-600 dark:text-green-400';
                        const statusLabel = item.utilization > 95
                          ? 'Critical'
                          : item.utilization >= 80
                            ? 'Warning'
                            : 'On Track';
                        const badgeVariant = item.utilization > 95
                          ? 'destructive' as const
                          : 'secondary' as const;

                        return (
                          <TableRow key={item.projectId} data-testid={`budget-vs-actual-row-${item.projectId}`}>
                            <TableCell>
                              <Button
                                variant="link"
                                className="p-0 h-auto font-medium"
                                onClick={() => item.projectId !== '__general__' && navigate(`/projects/${item.projectId}`)}
                                data-testid={`link-budget-project-${item.projectId}`}
                              >
                                <FolderKanban className="h-4 w-4 mr-1.5" />
                                {item.projectName}
                              </Button>
                              {item.pendingCount > 0 && (
                                <span className="block text-xs text-muted-foreground mt-0.5">{item.pendingCount} pending</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm" data-testid={`text-budgeted-${item.projectId}`}>
                              {formatCurrency(item.budgetCents / 100)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm" data-testid={`text-actual-spent-${item.projectId}`}>
                              {formatCurrency(item.actualSpendCents / 100)}
                            </TableCell>
                            <TableCell className="text-right" data-testid={`text-variance-${item.projectId}`}>
                              <span className={`font-mono text-sm font-medium ${item.varianceCents >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {item.varianceCents >= 0 ? '+' : ''}{formatCurrency(item.varianceCents / 100)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right" data-testid={`text-utilization-${item.projectId}`}>
                              <span className={`font-mono text-sm font-medium ${statusColor}`}>
                                {item.utilization.toFixed(1)}%
                              </span>
                            </TableCell>
                            <TableCell className="min-w-[120px]" data-testid={`progress-bar-${item.projectId}`}>
                              <Progress value={item.utilization} className="h-2" />
                            </TableCell>
                            <TableCell data-testid={`status-indicator-${item.projectId}`}>
                              <Badge variant={badgeVariant}>
                                {item.utilization > 95 && <AlertTriangle className="h-3 w-3 mr-1" />}
                                {statusLabel}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {(() => {
                        const totBudget = budgetVsActual.reduce((s, i) => s + i.budgetCents, 0);
                        const totActual = budgetVsActual.reduce((s, i) => s + i.actualSpendCents, 0);
                        const totVariance = totBudget - totActual;
                        const totUtilization = totBudget > 0 ? (totActual / totBudget) * 100 : 0;
                        const totStatusColor = totUtilization > 95
                          ? 'text-red-600 dark:text-red-400'
                          : totUtilization >= 80
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-green-600 dark:text-green-400';
                        return (
                          <TableRow className="border-t-2 font-semibold bg-muted/50" data-testid="budget-vs-actual-summary-row">
                            <TableCell>
                              Total ({budgetVsActual.length} projects)
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm" data-testid="text-total-budgeted-summary">
                              {formatCurrency(totBudget / 100)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm" data-testid="text-total-actual-summary">
                              {formatCurrency(totActual / 100)}
                            </TableCell>
                            <TableCell className="text-right" data-testid="text-total-variance-summary">
                              <span className={`font-mono text-sm ${totVariance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {totVariance >= 0 ? '+' : ''}{formatCurrency(totVariance / 100)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right" data-testid="text-total-utilization-summary">
                              <span className={`font-mono text-sm ${totStatusColor}`}>
                                {totUtilization.toFixed(1)}%
                              </span>
                            </TableCell>
                            <TableCell>
                              <Progress value={Math.min(totUtilization, 100)} className="h-2" />
                            </TableCell>
                            <TableCell />
                          </TableRow>
                        );
                      })()}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <span className="text-xs text-muted-foreground">Total Paid</span>
                </div>
                <p className="text-xl font-bold">
                  {formatCurrency(opCosts.filter(oc => oc.paid_at || oc.reconciled_at).reduce((s, oc) => s + oc.amount_cents, 0) / 100)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs text-muted-foreground">Awaiting Payment</span>
                </div>
                <p className="text-xl font-bold">
                  {formatCurrency(opCosts.filter(oc => getOpDerivedStatus(oc) === 'approved').reduce((s, oc) => s + oc.amount_cents, 0) / 100)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Receipt className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  <span className="text-xs text-muted-foreground">Reconciled</span>
                </div>
                <p className="text-xl font-bold">
                  {formatCurrency(opCosts.filter(oc => oc.reconciled_at).reduce((s, oc) => s + (oc.reconciled_amount_cents || oc.amount_cents), 0) / 100)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-muted-foreground" />
                    Recent Payments
                  </CardTitle>
                  <CardDescription>Most recent paid and reconciled cost submissions</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate('/cost-submission')} data-testid="button-view-all-submissions">
                    <ExternalLink className="h-4 w-4 mr-1.5" />
                    All Submissions
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate('/finance')} data-testid="button-view-finance-detail">
                    <ExternalLink className="h-4 w-4 mr-1.5" />
                    Finance Details
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {recentPaidCosts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Wallet className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p>No payments recorded yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Paid To</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentPaidCosts.map(oc => {
                        const proj = oc.project_id ? projects.find(p => p.id === oc.project_id) : null;
                        const isReconciled = !!oc.reconciled_at;
                        return (
                          <TableRow key={oc.id} data-testid={`row-payment-${oc.id}`}>
                            <TableCell className="text-sm whitespace-nowrap">
                              {safeFormatDate(oc.paid_at || oc.reconciled_at)}
                            </TableCell>
                            <TableCell>
                              {proj ? (
                                <Button
                                  variant="link"
                                  className="p-0 h-auto text-sm"
                                  onClick={() => navigate(`/projects/${proj.id}`)}
                                  data-testid={`link-payment-project-${oc.id}`}
                                >
                                  {proj.name}
                                </Button>
                              ) : (
                                <span className="text-muted-foreground text-sm">General</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm capitalize">
                              {(oc.expense_category || '').replace(/_/g, ' ')}
                            </TableCell>
                            <TableCell className="text-sm">{getUserName(oc.submitted_by)}</TableCell>
                            <TableCell className="text-right font-mono text-sm font-medium">
                              {formatCurrency(oc.amount_cents / 100)}
                            </TableCell>
                            <TableCell>
                              {isReconciled ? (
                                <Badge variant="secondary">Reconciled</Badge>
                              ) : (
                                <Badge variant="default">Paid</Badge>
                              )}
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

        <TabsContent value="cashflow" className="space-y-4 mt-4" data-testid="tab-content-cashflow">
          {cashFlowLoading ? (
            <div className="space-y-4" data-testid="cashflow-loading">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                  <Card key={i}>
                    <CardContent className="p-4 space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-8 w-32" />
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Card>
                <CardContent className="p-4 space-y-3">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Skeleton key={i} className="h-6 w-full" />
                  ))}
                </CardContent>
              </Card>
            </div>
          ) : cashFlowData.length === 0 ? (
            <Card data-testid="cashflow-empty">
              <CardContent className="py-12">
                <div className="text-center">
                  <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
                  <p className="text-muted-foreground">No cash flow data available. Transactions will appear here once wallet credits and payments are recorded.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="cashflow-kpi-cards">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Wallet className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-xs text-muted-foreground">Current Cash Position</span>
                    </div>
                    <p className={`text-xl font-bold font-mono ${cashFlowKpis.currentPosition >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} data-testid="text-current-cash-position">
                      {formatCurrency(cashFlowKpis.currentPosition)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingDown className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      <span className="text-xs text-muted-foreground">Avg Monthly Burn Rate</span>
                    </div>
                    <p className="text-xl font-bold font-mono" data-testid="text-avg-burn-rate">
                      {formatCurrency(cashFlowKpis.avgBurnRate)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <span className="text-xs text-muted-foreground">Projected Runway</span>
                    </div>
                    <p className="text-xl font-bold font-mono" data-testid="text-projected-runway">
                      {cashFlowKpis.projectedRunway >= 999 ? 'Sustainable' : `${cashFlowKpis.projectedRunway.toFixed(1)} months`}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-muted-foreground" />
                    Cash Flow Forecast
                  </CardTitle>
                  <CardDescription>Monthly cash flow for the past 6 months and projected next 3 months</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto" data-testid="cashflow-table-wrapper">
                    <Table data-testid="cashflow-table">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Month</TableHead>
                          <TableHead className="text-right">Inflows (SDG)</TableHead>
                          <TableHead className="text-right">Outflows (SDG)</TableHead>
                          <TableHead className="text-right">Net (SDG)</TableHead>
                          <TableHead className="text-right">Running Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cashFlowData.map(m => (
                          <TableRow key={m.month} className={m.isProjected ? 'bg-muted/30' : ''} data-testid={`cashflow-row-${m.month}`}>
                            <TableCell className="text-sm font-medium">
                              {m.label}
                              {m.isProjected && (
                                <Badge variant="secondary" className="ml-2 text-[10px]">Projected</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-green-600 dark:text-green-400" data-testid={`cashflow-inflow-${m.month}`}>
                              {formatCurrency(m.inflows)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-red-600 dark:text-red-400" data-testid={`cashflow-outflow-${m.month}`}>
                              {formatCurrency(m.outflows)}
                            </TableCell>
                            <TableCell className="text-right" data-testid={`cashflow-net-${m.month}`}>
                              <span className={`font-mono text-sm font-medium ${m.net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {m.net >= 0 ? '+' : ''}{formatCurrency(m.net)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right" data-testid={`cashflow-balance-${m.month}`}>
                              <span className={`font-mono text-sm font-medium ${m.runningBalance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {formatCurrency(m.runningBalance)}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                        {cashFlowSummary && (
                          <TableRow className="border-t-2 font-semibold bg-muted/50" data-testid="cashflow-summary-row">
                            <TableCell>
                              <div className="space-y-1">
                                <div className="text-xs text-muted-foreground">Opening Balance: {formatCurrency(cashFlowSummary.openingBalance)}</div>
                                <div className="text-xs text-muted-foreground">Closing Balance: <span className={cashFlowSummary.closingBalance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>{formatCurrency(cashFlowSummary.closingBalance)}</span></div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-green-600 dark:text-green-400" data-testid="text-total-inflows">
                              {formatCurrency(cashFlowSummary.totalInflows)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-red-600 dark:text-red-400" data-testid="text-total-outflows">
                              {formatCurrency(cashFlowSummary.totalOutflows)}
                            </TableCell>
                            <TableCell className="text-right" data-testid="text-net-cashflow">
                              <span className={`font-mono text-sm ${cashFlowSummary.netCashFlow >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {cashFlowSummary.netCashFlow >= 0 ? '+' : ''}{formatCurrency(cashFlowSummary.netCashFlow)}
                              </span>
                            </TableCell>
                            <TableCell />
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="periodClose" className="space-y-4 mt-4" data-testid="tab-content-period-close">
          {periodCloseLoading ? (
            <div className="space-y-4" data-testid="period-close-loading">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => (
                  <Card key={i}>
                    <CardContent className="p-4 space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-8 w-16" />
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Card>
                <CardContent className="p-4 space-y-3">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Skeleton key={i} className="h-6 w-full" />
                  ))}
                </CardContent>
              </Card>
            </div>
          ) : (
            <>
              <Alert data-testid="period-close-warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Closing a financial period prevents backdated entries and modifications to transactions within that period. Only close periods after all transactions have been reviewed and reconciled. Super admins can reopen closed periods if needed.
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="period-close-kpi-cards">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <CalendarDays className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-xs text-muted-foreground">Total Periods</span>
                    </div>
                    <p className="text-xl font-bold" data-testid="text-total-periods">{periodKpis.total}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Unlock className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <span className="text-xs text-muted-foreground">Open Periods</span>
                    </div>
                    <p className="text-xl font-bold text-green-600 dark:text-green-400" data-testid="text-open-periods">{periodKpis.open}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Lock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                      <span className="text-xs text-muted-foreground">Closed Periods</span>
                    </div>
                    <p className="text-xl font-bold text-orange-600 dark:text-orange-400" data-testid="text-closed-periods">{periodKpis.closed}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <CalendarCheck className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                      <span className="text-xs text-muted-foreground">Latest Closed</span>
                    </div>
                    <p className="text-sm font-bold truncate" data-testid="text-latest-closed-period">{periodKpis.latestClosedLabel}</p>
                  </CardContent>
                </Card>
              </div>

              {periodCloseData.length === 0 ? (
                <Card data-testid="period-close-empty">
                  <CardContent className="py-12">
                    <div className="text-center">
                      <CalendarDays className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
                      <p className="text-muted-foreground">No financial periods found. Periods will appear here once transactions are recorded.</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lock className="h-5 w-5 text-muted-foreground" />
                      Financial Period Management
                    </CardTitle>
                    <CardDescription>Review and close financial periods. Each period represents one calendar month.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto" data-testid="period-close-table-wrapper">
                      <Table data-testid="period-close-table">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Period</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Transactions</TableHead>
                            <TableHead className="text-right">Total Amount</TableHead>
                            <TableHead>Closed By</TableHead>
                            <TableHead>Closed At</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {periodCloseData.map(period => (
                            <TableRow key={period.month} data-testid={`period-row-${period.month}`}>
                              <TableCell className="font-medium text-sm" data-testid={`period-label-${period.month}`}>
                                {period.label}
                              </TableCell>
                              <TableCell data-testid={`period-status-${period.month}`}>
                                {period.status === 'open' && (
                                  <Badge variant="secondary">
                                    <Unlock className="h-3 w-3 mr-1" />
                                    Open
                                  </Badge>
                                )}
                                {period.status === 'closed' && (
                                  <Badge variant="default">
                                    <Lock className="h-3 w-3 mr-1" />
                                    Closed
                                  </Badge>
                                )}
                                {period.status === 'locked' && (
                                  <Badge variant="destructive">
                                    <Lock className="h-3 w-3 mr-1" />
                                    Locked
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right text-sm" data-testid={`period-tx-count-${period.month}`}>
                                <span className="font-mono">{period.totalCount}</span>
                                <span className="text-muted-foreground text-xs ml-1">
                                  ({period.walletTxCount}W / {period.opCostCount}OC)
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm" data-testid={`period-amount-${period.month}`}>
                                {formatCurrency(period.totalAmount)}
                              </TableCell>
                              <TableCell className="text-sm" data-testid={`period-closed-by-${period.month}`}>
                                {period.closedByName || <span className="text-muted-foreground">-</span>}
                              </TableCell>
                              <TableCell className="text-sm" data-testid={`period-closed-at-${period.month}`}>
                                {period.closedAt ? safeFormatDate(period.closedAt) : <span className="text-muted-foreground">-</span>}
                              </TableCell>
                              <TableCell data-testid={`period-actions-${period.month}`}>
                                {period.status === 'open' && (
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() => handleClosePeriod(period.month, period.label, period.pendingCount)}
                                    data-testid={`button-close-period-${period.month}`}
                                  >
                                    <Lock className="h-3 w-3 mr-1" />
                                    Close Period
                                  </Button>
                                )}
                                {(period.status === 'closed' || period.status === 'locked') && isSuperAdmin && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleReopenPeriod(period.month, period.label)}
                                    data-testid={`button-reopen-period-${period.month}`}
                                  >
                                    <Unlock className="h-3 w-3 mr-1" />
                                    Reopen
                                  </Button>
                                )}
                                {(period.status === 'closed' || period.status === 'locked') && !isSuperAdmin && (
                                  <span className="text-xs text-muted-foreground">Super admin required</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          <AlertDialog open={periodCloseDialog.open} onOpenChange={(open) => !open && setPeriodCloseDialog({ open: false, month: '', label: '', pendingCount: 0 })}>
            <AlertDialogContent data-testid="dialog-close-period">
              <AlertDialogHeader>
                <AlertDialogTitle>Close Financial Period</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to close <strong>{periodCloseDialog.label}</strong>? This will prevent any backdated entries or modifications to transactions within this period.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {periodCloseDialog.pendingCount > 0 && (
                <Alert variant="destructive" data-testid="dialog-pending-warning">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    There are <strong>{periodCloseDialog.pendingCount}</strong> pending/unapproved cost submissions in this period. Consider reviewing them before closing.
                  </AlertDescription>
                </Alert>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-close-period">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmClosePeriod} data-testid="button-confirm-close-period">
                  Close Period
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={periodReopenDialog.open} onOpenChange={(open) => !open && setPeriodReopenDialog({ open: false, month: '', label: '' })}>
            <AlertDialogContent data-testid="dialog-reopen-period">
              <AlertDialogHeader>
                <AlertDialogTitle>Reopen Financial Period</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to reopen <strong>{periodReopenDialog.label}</strong>? This will allow modifications and new entries for this period.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-reopen-period">Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmReopenPeriod} data-testid="button-confirm-reopen-period">
                  Reopen Period
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FinancialOperations;
