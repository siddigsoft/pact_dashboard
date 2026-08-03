import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DollarSign,
  Users,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Download,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  History,
  FileText,
  Loader2,
  Banknote,
  BarChart3,
  ClipboardList,
  ArrowLeft
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { usePageManageOverride } from '@/hooks/usePageManageOverride';
import { useWallet } from '@/context/wallet/WalletContext';
import { useToast } from '@/hooks/use-toast';
import type { CurrentUserClassificationRow } from '@/types/hr-finance-tables';
import { useNavigate } from 'react-router-dom';
import { format, subMonths } from 'date-fns';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { exportToExcel } from '@/utils/report-export';

interface RetainerTransaction {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  description: string;
  metadata: { type: string; period: string; base_currency?: string | null; fx_rate?: number | null } | null;
  balance_before: number;
  balance_after: number;
  created_at: string;
  created_by: string | null;
}

interface EligibleUser {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  classification_level: string;
  role_scope: string;
  has_retainer: boolean;
  retainer_amount_cents: number;
  retainer_currency: string;
  retainer_payout_currency?: string;
  retainer_frequency: string;
  is_active: boolean;
}

interface FxWarning {
  fromCurrency: string;
  toCurrency: string;
  affectedUsers: Array<{ name: string; email: string }>;
}

interface PaymentGridEntry {
  userId: string;
  userName: string;
  email: string;
  level: string;
  retainerAmount: number;
  currency: string;
  months: Record<string, { paid: boolean; amount: number; date: string; fallback: boolean }>;
}

const formatCurrency = (amount: number, currency: string = 'SDG') => {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const getLevelLabel = (level: string) => {
  switch (level) {
    case 'A': return 'Level A (Senior)';
    case 'B': return 'Level B (Mid)';
    case 'C': return 'Level C (Junior)';
    default: return level;
  }
};

const getLevelBadgeClass = (level: string) => {
  switch (level) {
    case 'A': return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300';
    case 'B': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300';
    case 'C': return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
    default: return '';
  }
};

/**
 * Returns true when a retainer with the given frequency is due in the given
 * calendar month (1–12).
 *
 * - monthly (default / null): every month
 * - quarterly: months 3, 6, 9, 12  (Q1–Q4 end months)
 * - annual / yearly: month 12 (December)
 */
const isRetainerDueThisMonth = (frequency: string | null | undefined, calendarMonth: number): boolean => {
  const freq = (frequency ?? 'monthly').toLowerCase();
  if (freq === 'quarterly') return [3, 6, 9, 12].includes(calendarMonth);
  if (freq === 'annual' || freq === 'yearly') return calendarMonth === 12;
  return true;
};

const getFrequencyLabel = (frequency: string | null | undefined): string => {
  const freq = (frequency ?? 'monthly').toLowerCase();
  if (freq === 'quarterly') return 'Quarterly';
  if (freq === 'annual' || freq === 'yearly') return 'Annual';
  return 'Monthly';
};

const getNextDueMonths = (frequency: string | null | undefined, currentMonth: number): string => {
  const freq = (frequency ?? 'monthly').toLowerCase();
  if (freq === 'quarterly') {
    const quarterMonths = [3, 6, 9, 12];
    const next = quarterMonths.find(m => m > currentMonth) ?? quarterMonths[0];
    return `Next: month ${next}`;
  }
  if (freq === 'annual' || freq === 'yearly') {
    return currentMonth === 12 ? 'Due this month' : 'Next: December';
  }
  return 'Every month';
};

const RetainerManagement = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentUser, users } = useAppContext();
  const { hasAnyRole } = useAuthorization();
  const { processMonthlyRetainers, reprocessFallbackRetainers } = useWallet();

  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<RetainerTransaction[]>([]);
  const [eligibleUsers, setEligibleUsers] = useState<EligibleUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [periodFilter, setPeriodFilter] = useState<string>('all');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [showProcessDialog, setShowProcessDialog] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<{ processed: number; failed: number; total: number; fallbackCount: number; fallbackUserIds: string[] } | null>(null);
  const [showReprocessDialog, setShowReprocessDialog] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [historySort, setHistorySort] = useState<'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'>('date_desc');
  const [fxWarnings, setFxWarnings] = useState<FxWarning[]>([]);
  const [fxCheckLoading, setFxCheckLoading] = useState(false);
  const [reprocessTargetUserIds, setReprocessTargetUserIds] = useState<string[]>([]);

  const isSuperAdmin = hasAnyRole(['super_admin', 'SuperAdmin', 'Super Admin']);
  const isAdmin = hasAnyRole(['admin', 'Admin']);
  const isFinancialAdmin = hasAnyRole(['finance_admin', 'Finance Admin']);
  const roleCanManage = isSuperAdmin || isAdmin || isFinancialAdmin;
  const overrideCanManage = usePageManageOverride('retainer-management', roleCanManage);
  const canManage = roleCanManage || overrideCanManage;

  const getCurrentPeriod = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };

  const getLast12Months = (): string[] => {
    const months: string[] = [];
    for (let i = 0; i < 12; i++) {
      const d = subMonths(new Date(), i);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return months;
  };

  const fetchData = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    try {
      const [txResult, classResult] = await Promise.all([
        supabase
          .from('wallet_transactions')
          .select('*')
          .eq('metadata->>type', 'retainer')
          .order('created_at', { ascending: false }),
        supabase
          .from('current_user_classifications' as any)
          .select('*')
          .eq('has_retainer', true)
          .eq('is_active', true) as unknown as Promise<{ data: CurrentUserClassificationRow[] | null }>,
      ]);

      if (txResult.data) {
        setTransactions(txResult.data as RetainerTransaction[]);
      }
      if (classResult.data) {
        // Guard against a missing retainer_amount_cents (e.g. incomplete classification
        // record) turning every downstream /100 calc into NaN.
        const normalized = (classResult.data as unknown as EligibleUser[]).map(u => ({
          ...u,
          retainer_amount_cents: u.retainer_amount_cents ?? 0,
        }));
        setEligibleUsers(normalized);
      }
    } catch (error) {
      console.error('Failed to fetch retainer data:', error);
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const userNameMap = useMemo(() => {
    const map: Record<string, { name: string; email: string }> = {};
    users.forEach(u => {
      map[u.id] = { name: u.name || u.email, email: u.email };
    });
    eligibleUsers.forEach(eu => {
      if (!map[eu.user_id]) {
        map[eu.user_id] = { name: eu.full_name || eu.email, email: eu.email };
      }
    });
    return map;
  }, [users, eligibleUsers]);

  const availablePeriods = useMemo(() => {
    const periods = new Set<string>();
    transactions.forEach(t => {
      const period = t.metadata?.period;
      if (period) periods.add(period);
    });
    return Array.from(periods).sort().reverse();
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    let filtered = [...transactions];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(t => {
        const user = userNameMap[t.user_id];
        return user?.name.toLowerCase().includes(q) || user?.email.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
      });
    }
    if (periodFilter !== 'all') {
      filtered = filtered.filter(t => t.metadata?.period === periodFilter);
    }
    switch (historySort) {
      case 'date_asc': filtered.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); break;
      case 'amount_desc': filtered.sort((a, b) => b.amount - a.amount); break;
      case 'amount_asc': filtered.sort((a, b) => a.amount - b.amount); break;
      default: filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return filtered;
  }, [transactions, searchQuery, periodFilter, historySort, userNameMap]);

  const filteredEligible = useMemo(() => {
    let filtered = [...eligibleUsers];
    if (searchQuery && activeTab === 'eligible') {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(u => u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
    }
    if (levelFilter !== 'all') {
      filtered = filtered.filter(u => u.classification_level === levelFilter);
    }
    return filtered;
  }, [eligibleUsers, searchQuery, levelFilter, activeTab]);

  const paymentGrid = useMemo((): PaymentGridEntry[] => {
    const months = getLast12Months();
    const grid: Record<string, PaymentGridEntry> = {};

    eligibleUsers.forEach(eu => {
      grid[eu.user_id] = {
        userId: eu.user_id,
        userName: eu.full_name || userNameMap[eu.user_id]?.name || 'Unknown',
        email: eu.email || userNameMap[eu.user_id]?.email || '',
        level: eu.classification_level,
        retainerAmount: eu.retainer_amount_cents / 100,
        currency: eu.retainer_currency || 'SDG',
        months: Object.fromEntries(months.map(m => [m, { paid: false, amount: 0, date: '', fallback: false }])),
      };
    });

    transactions.forEach(tx => {
      const period = tx.metadata?.period;
      if (period && grid[tx.user_id] && grid[tx.user_id].months[period] !== undefined) {
        const isFallback = !!(tx.metadata?.base_currency && !tx.metadata?.fx_rate);
        grid[tx.user_id].months[period] = {
          paid: true,
          amount: tx.amount,
          date: tx.created_at,
          fallback: isFallback,
        };
      }
    });

    return Object.values(grid);
  }, [eligibleUsers, transactions, userNameMap]);

  // Detect fallback-paid members for the current period from already-fetched transactions.
  // Fallback signature: metadata.base_currency is set AND metadata.fx_rate is absent/null.
  const persistentFallback = useMemo(() => {
    const currentPeriod = getCurrentPeriod();
    const fallbackTxs = transactions.filter(
      t =>
        t.metadata?.period === currentPeriod &&
        t.metadata?.base_currency &&
        !t.metadata?.fx_rate,
    );
    const userIds = [...new Set(fallbackTxs.map(t => t.user_id))];
    return { count: userIds.length, userIds };
  }, [transactions]);

  const kpis = useMemo(() => {
    const currentPeriod = getCurrentPeriod();
    const prevPeriod = (() => {
      const d = subMonths(new Date(), 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    })();

    const currentPeriodTx = transactions.filter(t => t.metadata?.period === currentPeriod);
    const prevPeriodTx = transactions.filter(t => t.metadata?.period === prevPeriod);
    const totalPaidThisMonth = currentPeriodTx.reduce((sum, t) => sum + t.amount, 0);
    const totalPaidLastMonth = prevPeriodTx.reduce((sum, t) => sum + t.amount, 0);
    const paidThisMonthCount = currentPeriodTx.length;
    const totalEligible = eligibleUsers.length;
    const unpaidThisMonth = totalEligible - paidThisMonthCount;
    const monthlyBudget = eligibleUsers.reduce((sum, u) => sum + (u.retainer_amount_cents / 100), 0);
    const totalAllTime = transactions.reduce((sum, t) => sum + t.amount, 0);
    const uniquePeriods = new Set(transactions.map(t => t.metadata?.period).filter(Boolean));
    const trend = totalPaidLastMonth > 0 ? ((totalPaidThisMonth - totalPaidLastMonth) / totalPaidLastMonth * 100) : 0;

    return {
      totalEligible,
      paidThisMonth: paidThisMonthCount,
      unpaidThisMonth: Math.max(0, unpaidThisMonth),
      totalPaidThisMonth,
      totalPaidLastMonth,
      monthlyBudget,
      totalAllTime,
      totalPeriods: uniquePeriods.size,
      totalTransactions: transactions.length,
      trend,
      currentPeriod,
    };
  }, [transactions, eligibleUsers]);

  const handleProcess = async () => {
    setProcessing(true);
    setProcessResult(null);
    try {
      const result = await processMonthlyRetainers();
      setProcessResult(result);
      await fetchData();
      toast({
        title: 'Processing Complete',
        description: `Processed ${result.processed} of ${result.total} retainers${result.failed > 0 ? ` (${result.failed} failed)` : ''}${result.fallbackCount > 0 ? ` — ${result.fallbackCount} paid in base currency (no FX rate found)` : ''}`,
        variant: result.fallbackCount > 0 ? 'destructive' : 'default',
      });
    } catch (error) {
      console.error('Retainer processing failed:', error);
      toast({
        title: 'Processing Failed',
        description: 'An error occurred while processing retainers',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReprocess = async () => {
    if (reprocessTargetUserIds.length === 0) return;
    const period = getCurrentPeriod();
    setReprocessing(true);
    try {
      const result = await reprocessFallbackRetainers(reprocessTargetUserIds, period);
      await fetchData();
      // Use explicit failedUserIds to keep only users that genuinely still need correction
      setProcessResult(prev =>
        prev
          ? {
              ...prev,
              fallbackCount: result.failedUserIds.length,
              fallbackUserIds: result.failedUserIds,
            }
          : prev
      );
    } catch (error) {
      console.error('Reprocess fallback retainers failed:', error);
      toast({
        title: 'Reprocessing Failed',
        description: 'An unexpected error occurred. Check console for details.',
        variant: 'destructive',
      });
    } finally {
      setReprocessing(false);
      setShowReprocessDialog(false);
    }
  };

  const exportPaymentHistory = () => {
    const headers = ['Date', 'Period', 'User', 'Email', 'Amount', 'Currency', 'Balance Before', 'Balance After', 'Description'];
    const rows = filteredTransactions.map(t => {
      const user = userNameMap[t.user_id];
      return [
        format(new Date(t.created_at), 'yyyy-MM-dd HH:mm'),
        t.metadata?.period || '',
        user?.name || '',
        user?.email || '',
        t.amount.toString(),
        t.currency || 'SDG',
        t.balance_before?.toString() || '0',
        t.balance_after?.toString() || '0',
        t.description,
      ];
    });

    const csv = [headers, ...rows].map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `retainer-payments-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast({ title: 'Export Complete', description: 'Payment history has been exported to CSV' });
  };

  const exportPaymentHistoryExcel = () => {
    const rows = filteredTransactions.map(t => {
      const user = userNameMap[t.user_id];
      return {
        'Date': format(new Date(t.created_at), 'yyyy-MM-dd HH:mm'),
        'Period': t.metadata?.period || '',
        'User': user?.name || '',
        'Email': user?.email || '',
        'Amount': t.amount,
        'Currency': t.currency || 'SDG',
        'Balance Before': t.balance_before || 0,
        'Balance After': t.balance_after || 0,
        'Description': t.description,
      };
    });
    exportToExcel(rows, 'Retainer Payment History', `retainer-payments-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast({ title: 'Export Complete', description: 'Payment history has been exported to Excel' });
  };

  const exportTrackingGrid = () => {
    const months = getLast12Months().reverse();
    const headers = ['User', 'Email', 'Level', 'Retainer Amount', ...months.map(m => {
      const [y, mo] = m.split('-');
      return format(new Date(parseInt(y), parseInt(mo) - 1), 'MMM yyyy');
    })];
    const rows = paymentGrid.map(entry => [
      entry.userName,
      entry.email,
      entry.level,
      `${entry.currency} ${entry.retainerAmount}`,
      ...months.map(m => entry.months[m]?.paid ? `Paid (${entry.months[m].amount})` : 'Not Paid'),
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `retainer-tracking-grid-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast({ title: 'Export Complete', description: 'Tracking grid has been exported to CSV' });
  };

  const exportTrackingGridExcel = () => {
    const months = getLast12Months().reverse();
    const rows = paymentGrid.map(entry => {
      const row: Record<string, any> = {
        'User': entry.userName,
        'Email': entry.email,
        'Level': entry.level,
        'Retainer Amount': `${entry.currency} ${entry.retainerAmount}`,
      };
      months.forEach(m => {
        const [y, mo] = m.split('-');
        const label = format(new Date(parseInt(y), parseInt(mo) - 1), 'MMM yyyy');
        row[label] = entry.months[m]?.paid ? `Paid (${entry.months[m].amount})` : 'Not Paid';
      });
      return row;
    });
    exportToExcel(rows, 'Retainer Tracking Grid', `retainer-tracking-grid-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast({ title: 'Export Complete', description: 'Tracking grid has been exported to Excel' });
  };

  const exportEligibleUsers = () => {
    const headers = ['Name', 'Email', 'Level', 'Role Scope', 'Retainer Amount', 'Currency', 'Frequency', 'Active'];
    const rows = filteredEligible.map(u => [
      u.full_name || '',
      u.email || '',
      u.classification_level,
      u.role_scope || '',
      (u.retainer_amount_cents / 100).toString(),
      u.retainer_currency || 'SDG',
      u.retainer_frequency || 'monthly',
      u.is_active ? 'Yes' : 'No',
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `retainer-eligible-users-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast({ title: 'Export Complete', description: 'Eligible users list has been exported to CSV' });
  };

  const exportEligibleUsersExcel = () => {
    const rows = filteredEligible.map(u => ({
      'Name': u.full_name || '',
      'Email': u.email || '',
      'Level': u.classification_level,
      'Role Scope': u.role_scope || '',
      'Retainer Amount': u.retainer_amount_cents / 100,
      'Currency': u.retainer_currency || 'SDG',
      'Frequency': u.retainer_frequency || 'monthly',
      'Active': u.is_active ? 'Yes' : 'No',
    }));
    exportToExcel(rows, 'Eligible Retainer Users', `retainer-eligible-users-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast({ title: 'Export Complete', description: 'Eligible users list has been exported to Excel' });
  };

  const exportMonthlySummary = () => {
    const months = getLast12Months().reverse();
    const headers = ['Period', 'Users Paid', 'Total Amount', 'Currency'];
    const rows = months.map(m => {
      const monthTx = transactions.filter(t => t.metadata?.period === m);
      const total = monthTx.reduce((sum, t) => sum + t.amount, 0);
      return [
        m,
        monthTx.length.toString(),
        total.toFixed(2),
        'SDG',
      ];
    });

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `retainer-monthly-summary-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast({ title: 'Export Complete', description: 'Monthly summary has been exported to CSV' });
  };

  const exportMonthlySummaryExcel = () => {
    const months = getLast12Months().reverse();
    const rows = months.map(m => {
      const monthTx = transactions.filter(t => t.metadata?.period === m);
      const total = monthTx.reduce((sum, t) => sum + t.amount, 0);
      return {
        'Period': m,
        'Users Paid': monthTx.length,
        'Total Amount': total,
        'Currency': 'SDG',
      };
    });
    exportToExcel(rows, 'Monthly Retainer Summary', `retainer-monthly-summary-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast({ title: 'Export Complete', description: 'Monthly summary has been exported to Excel' });
  };

  // Pre-flight: check that every FX pair needed by active retainer users has a
  // rate configured in acct_exchange_rates.  Runs whenever the "process" tab is
  // active so the admin sees the warning before they click the button.
  const checkExchangeRates = useCallback(async () => {
    const fxUsers = eligibleUsers.filter(
      u => u.retainer_payout_currency && u.retainer_payout_currency !== u.retainer_currency,
    );
    if (fxUsers.length === 0) {
      setFxWarnings([]);
      return;
    }

    setFxCheckLoading(true);
    try {
      const todayIso = new Date().toISOString().slice(0, 10);

      // Group users by their from→to pair
      const pairMap = new Map<string, EligibleUser[]>();
      fxUsers.forEach(u => {
        const key = `${u.retainer_currency}|${u.retainer_payout_currency}`;
        if (!pairMap.has(key)) pairMap.set(key, []);
        pairMap.get(key)!.push(u);
      });

      const warnings: FxWarning[] = [];
      for (const [pairKey, users] of pairMap.entries()) {
        const [fromCurrency, toCurrency] = pairKey.split('|');
        const { data: rateRow } = await supabase
          .from('acct_exchange_rates')
          .select('rate')
          .eq('from_currency', fromCurrency)
          .eq('to_currency', toCurrency)
          .lte('effective_date', todayIso)
          .order('effective_date', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!rateRow) {
          warnings.push({
            fromCurrency,
            toCurrency,
            affectedUsers: users.map(u => ({ name: u.full_name || u.email, email: u.email })),
          });
        }
      }
      setFxWarnings(warnings);
    } catch (err) {
      console.error('[RetainerManagement] FX pre-flight check failed:', err);
    } finally {
      setFxCheckLoading(false);
    }
  }, [eligibleUsers]);

  useEffect(() => {
    if (activeTab === 'process' && eligibleUsers.length > 0) {
      checkExchangeRates();
    }
  }, [activeTab, eligibleUsers, checkExchangeRates]);

  if (!canManage) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-5 w-5" />
          <AlertDescription>
            Access Denied: You do not have permission to view retainer management. This page is restricted to administrators and financial admins.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const months12 = getLast12Months();

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-[1400px]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/hr?tab=retainer')} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-page-title">
              <Banknote className="h-6 w-6 text-primary" />
              Retainer Management
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track, review, and process monthly retainer payments for classified team members
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-sm" data-testid="badge-current-period">
            <Calendar className="h-3 w-3 mr-1" />
            {getCurrentPeriod()}
          </Badge>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} data-testid="button-refresh">
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <PageInfoBanner
        title="Retainer Management - Monthly Fixed Payments"
        description="This page handles RETAINER PAYMENTS -- fixed monthly amounts paid to classified team members as part of their ongoing engagement. This is DIFFERENT from cost submissions (reimbursement for expenses), wallet withdrawals (taking out earned money), and transportation advances (upfront travel money). Retainers are regular, recurring payments that go directly into team members' wallets each month. The system prevents duplicate payments for the same period."
        descriptionAr="تتعامل هذه الصفحة مع مدفوعات المكافآت الشهرية -- مبالغ شهرية ثابتة تُدفع لأعضاء الفريق المصنفين كجزء من ارتباطهم المستمر. هذه الصفحة مختلفة عن طلبات التكاليف (استرداد المصاريف)، وسحب المحفظة (سحب الأموال المكتسبة)، والسلف المسبقة للنقل (أموال مقدمة للسفر). المكافآت الشهرية هي مدفوعات منتظمة ومتكررة تُضاف مباشرة لمحافظ أعضاء الفريق كل شهر. يمنع النظام تكرار الدفع لنفس الفترة."
        workflowSteps={[
          { step: 1, role: 'Admin', action: 'Reviews eligible members', description: 'Check which team members are classified for retainer payments and eligible this month.' },
          { step: 2, role: 'Finance Admin', action: 'Previews payment batch', description: 'Review the list of recipients and amounts before processing -- verify everything looks correct.' },
          { step: 3, role: 'Finance Admin', action: 'Processes batch payment', description: 'Execute the batch payment, which credits the retainer amount to each eligible member\'s wallet.' },
          { step: 4, role: 'System', action: 'Records & prevents duplicates', description: 'Each payment is logged with a full audit trail. The system blocks duplicate payments for the same month.' },
        ]}
        workflowStepsAr={[
          { step: 1, role: 'المدير', action: 'يراجع الأعضاء المؤهلين', description: 'يتحقق من أعضاء الفريق المصنفين لاستحقاق المكافآت الشهرية والمؤهلين لهذا الشهر.' },
          { step: 2, role: 'مدير المالية', action: 'يعاين دفعة المدفوعات', description: 'يراجع قائمة المستفيدين والمبالغ قبل المعالجة -- يتحقق من صحة كل شيء.' },
          { step: 3, role: 'مدير المالية', action: 'يعالج الدفعة الجماعية', description: 'ينفذ الدفعة الجماعية التي تُضيف مبلغ المكافأة الشهرية لمحفظة كل عضو مؤهل.' },
          { step: 4, role: 'النظام', action: 'يسجّل ويمنع التكرار', description: 'يُسجَّل كل دفعة مع مسار تدقيق كامل. يمنع النظام تكرار الدفع لنفس الشهر.' },
        ]}
      />

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i}><CardContent className="p-6"><Skeleton className="h-4 w-24 mb-2" /><Skeleton className="h-8 w-32" /></CardContent></Card>
            ))}
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card data-testid="card-kpi-eligible">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Eligible Users</p>
                    <p className="text-2xl font-bold mt-1" data-testid="text-eligible-count">{kpis.totalEligible}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Monthly budget: {formatCurrency(kpis.monthlyBudget)}
                    </p>
                  </div>
                  <div className="h-11 w-11 rounded-full bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
                    <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-kpi-paid-this-month">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Paid This Month</p>
                    <p className="text-2xl font-bold mt-1" data-testid="text-paid-count">{kpis.paidThisMonth}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatCurrency(kpis.totalPaidThisMonth)}
                    </p>
                  </div>
                  <div className="h-11 w-11 rounded-full bg-green-50 dark:bg-green-950 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-kpi-unpaid">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Not Yet Paid</p>
                    <p className="text-2xl font-bold mt-1" data-testid="text-unpaid-count">{kpis.unpaidThisMonth}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {kpis.totalEligible > 0 ? Math.round((kpis.unpaidThisMonth / kpis.totalEligible) * 100) : 0}% remaining
                    </p>
                  </div>
                  <div className="h-11 w-11 rounded-full bg-amber-50 dark:bg-amber-950 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-kpi-total">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total All Time</p>
                    <p className="text-2xl font-bold mt-1" data-testid="text-total-amount">{formatCurrency(kpis.totalAllTime)}</p>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      {kpis.trend > 0 ? (
                        <><TrendingUp className="h-3 w-3 text-green-500" /><span className="text-green-600">+{kpis.trend.toFixed(0)}%</span></>
                      ) : kpis.trend < 0 ? (
                        <><TrendingDown className="h-3 w-3 text-red-500" /><span className="text-red-600">{kpis.trend.toFixed(0)}%</span></>
                      ) : (
                        <span>vs last month</span>
                      )}
                      <span className="text-muted-foreground">vs last month</span>
                    </p>
                  </div>
                  <div className="h-11 w-11 rounded-full bg-purple-50 dark:bg-purple-950 flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {kpis.unpaidThisMonth > 0 && (
            <Card className="border-amber-200 dark:border-amber-800" data-testid="card-process-prompt">
              <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">{kpis.unpaidThisMonth} team members have not been paid their retainer for {kpis.currentPeriod}</p>
                    <p className="text-xs text-muted-foreground">Click "Review & Process" to preview and run the monthly payment batch</p>
                  </div>
                </div>
                <Button size="sm" onClick={() => { setActiveTab('process'); setShowProcessDialog(false); }} data-testid="button-go-to-process">
                  Review & Process
                </Button>
              </CardContent>
            </Card>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex flex-wrap h-auto gap-1" data-testid="tabs-retainer">
              <TabsTrigger value="overview" className="text-xs sm:text-sm" data-testid="tab-overview">
                <BarChart3 className="h-4 w-4 mr-1" />Overview
              </TabsTrigger>
              {/* Review & Process moved up — it's the primary action tab */}
              <TabsTrigger value="process" className="text-xs sm:text-sm relative" data-testid="tab-process">
                <Banknote className="h-4 w-4 mr-1" />Review & Process
                {kpis.unpaidThisMonth > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[9px] font-bold min-w-[16px] h-4 px-1">
                    {kpis.unpaidThisMonth}
                  </span>
                )}
                {persistentFallback.count > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold min-w-[16px] h-4 px-1" title="Wrong-currency payments need correction">
                    {persistentFallback.count}⚠
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="eligible" className="text-xs sm:text-sm" data-testid="tab-eligible">
                <Users className="h-4 w-4 mr-1" />Eligible Users
              </TabsTrigger>
              <TabsTrigger value="tracking" className="text-xs sm:text-sm" data-testid="tab-tracking">
                <Calendar className="h-4 w-4 mr-1" />Tracking Grid
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs sm:text-sm" data-testid="tab-history">
                <History className="h-4 w-4 mr-1" />Payment History
              </TabsTrigger>
              <TabsTrigger value="audit" className="text-xs sm:text-sm" data-testid="tab-audit">
                <ClipboardList className="h-4 w-4 mr-1" />Audit Trail
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 space-y-4" data-testid="content-overview">
              {persistentFallback.count > 0 && (
                <Alert variant="destructive" data-testid="alert-overview-fallback">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <span>
                      <span className="font-medium">{persistentFallback.count} member{persistentFallback.count !== 1 ? 's' : ''} were paid in base currency</span> for {getCurrentPeriod()} — their configured payout currency had no exchange rate at processing time.
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => {
                        setReprocessTargetUserIds(persistentFallback.userIds);
                        setActiveTab('process');
                        setShowReprocessDialog(true);
                      }}
                      data-testid="button-overview-reprocess"
                    >
                      <RefreshCw className="h-3 w-3 mr-1.5" />Go to Reprocess
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Monthly Payment Summary (Last 12 Months)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {months12.map(month => {
                        const monthTx = transactions.filter(t => t.metadata?.period === month);
                        const total = monthTx.reduce((sum, t) => sum + t.amount, 0);
                        const percentage = kpis.monthlyBudget > 0 ? (total / kpis.monthlyBudget) * 100 : 0;
                        const [y, mo] = month.split('-');
                        const label = format(new Date(parseInt(y), parseInt(mo) - 1), 'MMM yyyy');

                        return (
                          <div key={month} className="space-y-1" data-testid={`summary-month-${month}`}>
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium">{label}</span>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-xs">{monthTx.length} users</Badge>
                                <span className="text-muted-foreground">{formatCurrency(total)}</span>
                              </div>
                            </div>
                            <Progress value={Math.min(percentage, 100)} className="h-2" />
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Retainer by Classification Level
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {['A', 'B', 'C'].map(level => {
                        const levelUsers = eligibleUsers.filter(u => u.classification_level === level);
                        const levelBudget = levelUsers.reduce((s, u) => s + u.retainer_amount_cents / 100, 0);
                        const percentage = kpis.totalEligible > 0 ? (levelUsers.length / kpis.totalEligible) * 100 : 0;

                        return (
                          <div key={level} className="border rounded-lg p-3" data-testid={`level-breakdown-${level}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Badge className={`text-xs border-0 ${getLevelBadgeClass(level)}`}>{getLevelLabel(level)}</Badge>
                                <span className="text-sm font-medium">{levelUsers.length} users</span>
                              </div>
                              <span className="text-sm text-muted-foreground">{formatCurrency(levelBudget)}/month</span>
                            </div>
                            <Progress value={percentage} className="h-2" />
                          </div>
                        );
                      })}

                      <div className="border-t pt-3 mt-3 flex justify-between text-sm font-medium">
                        <span>Total Monthly Budget</span>
                        <span>{formatCurrency(kpis.monthlyBudget)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Quick Stats
                    </CardTitle>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={exportMonthlySummary} data-testid="button-export-summary-csv">
                        <Download className="h-4 w-4 mr-1" />CSV
                      </Button>
                      <Button variant="outline" size="sm" onClick={exportMonthlySummaryExcel} data-testid="button-export-summary-excel">
                        <Download className="h-4 w-4 mr-1" />Excel
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-3 border rounded-lg" data-testid="stat-total-transactions">
                      <p className="text-2xl font-bold">{kpis.totalTransactions}</p>
                      <p className="text-xs text-muted-foreground">Total Payments Made</p>
                    </div>
                    <div className="text-center p-3 border rounded-lg" data-testid="stat-periods-processed">
                      <p className="text-2xl font-bold">{kpis.totalPeriods}</p>
                      <p className="text-xs text-muted-foreground">Periods Processed</p>
                    </div>
                    <div className="text-center p-3 border rounded-lg" data-testid="stat-avg-per-month">
                      <p className="text-2xl font-bold">
                        {kpis.totalPeriods > 0 ? formatCurrency(kpis.totalAllTime / kpis.totalPeriods) : formatCurrency(0)}
                      </p>
                      <p className="text-xs text-muted-foreground">Avg per Month</p>
                    </div>
                    <div className="text-center p-3 border rounded-lg" data-testid="stat-completion-rate">
                      <p className="text-2xl font-bold">
                        {kpis.totalEligible > 0 ? Math.round((kpis.paidThisMonth / kpis.totalEligible) * 100) : 0}%
                      </p>
                      <p className="text-xs text-muted-foreground">This Month Completion</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="mt-4" data-testid="content-history">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <History className="h-4 w-4" />
                        Payment History
                        <Badge variant="secondary">{filteredTransactions.length}</Badge>
                      </CardTitle>
                      <CardDescription>Complete record of all retainer payments</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={exportPaymentHistory} data-testid="button-export-history-csv">
                        <Download className="h-4 w-4 mr-1" />CSV
                      </Button>
                      <Button variant="outline" size="sm" onClick={exportPaymentHistoryExcel} data-testid="button-export-history-excel">
                        <Download className="h-4 w-4 mr-1" />Excel
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name or email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                        data-testid="input-search-history"
                      />
                    </div>
                    <Select value={periodFilter} onValueChange={setPeriodFilter}>
                      <SelectTrigger className="w-[160px]" data-testid="select-period-filter">
                        <SelectValue placeholder="Period" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Periods</SelectItem>
                        {availablePeriods.map(p => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={historySort} onValueChange={(v) => setHistorySort(v as any)}>
                      <SelectTrigger className="w-[160px]" data-testid="select-sort">
                        <SelectValue placeholder="Sort" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="date_desc">Newest First</SelectItem>
                        <SelectItem value="date_asc">Oldest First</SelectItem>
                        <SelectItem value="amount_desc">Highest Amount</SelectItem>
                        <SelectItem value="amount_asc">Lowest Amount</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {filteredTransactions.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground" data-testid="empty-history">
                      <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p className="font-medium">No retainer payments found</p>
                      <p className="text-sm">Payments will appear here after processing monthly retainers</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[500px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Period</TableHead>
                            <TableHead>User</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Balance After</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredTransactions.map(tx => {
                            const user = userNameMap[tx.user_id];
                            return (
                              <TableRow key={tx.id} data-testid={`row-tx-${tx.id}`}>
                                <TableCell className="text-sm">
                                  {format(new Date(tx.created_at), 'MMM d, yyyy')}
                                  <span className="block text-xs text-muted-foreground">
                                    {format(new Date(tx.created_at), 'HH:mm')}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs">{tx.metadata?.period || '-'}</Badge>
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <span className="font-medium text-sm">{user?.name || 'Unknown'}</span>
                                    <span className="block text-xs text-muted-foreground">{user?.email || ''}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-medium text-sm text-green-600 dark:text-green-400">
                                  +{formatCurrency(tx.amount, tx.currency || 'SDG')}
                                </TableCell>
                                <TableCell className="text-right text-sm text-muted-foreground">
                                  {formatCurrency(tx.balance_after, tx.currency || 'SDG')}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="tracking" className="mt-4" data-testid="content-tracking">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Payment Tracking Grid
                        <Badge variant="secondary">{paymentGrid.length} users</Badge>
                      </CardTitle>
                      <CardDescription>
                        Month-by-month view of retainer payment status per user
                        <span className="ml-3 inline-flex items-center gap-2 text-xs">
                          <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" />Paid</span>
                          <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-500" />Wrong currency</span>
                          <span className="inline-flex items-center gap-1"><XCircle className="h-3 w-3 text-red-300" />Not paid</span>
                        </span>
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={exportTrackingGrid} data-testid="button-export-grid-csv">
                        <Download className="h-4 w-4 mr-1" />CSV
                      </Button>
                      <Button variant="outline" size="sm" onClick={exportTrackingGridExcel} data-testid="button-export-grid-excel">
                        <Download className="h-4 w-4 mr-1" />Excel
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {paymentGrid.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground" data-testid="empty-grid">
                      <Calendar className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p className="font-medium">No retainer-eligible users</p>
                      <p className="text-sm">Assign retainers through Classifications to see the tracking grid</p>
                    </div>
                  ) : (
                    <ScrollArea className="w-full">
                      <div className="min-w-[800px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="sticky left-0 bg-background z-10 min-w-[200px]">User</TableHead>
                              <TableHead className="text-center min-w-[80px]">Level</TableHead>
                              {months12.map(m => {
                                const [y, mo] = m.split('-');
                                return (
                                  <TableHead key={m} className="text-center min-w-[80px]">
                                    {format(new Date(parseInt(y), parseInt(mo) - 1), 'MMM yy')}
                                  </TableHead>
                                );
                              })}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paymentGrid.map(entry => (
                              <TableRow key={entry.userId} data-testid={`grid-row-${entry.userId}`}>
                                <TableCell className="sticky left-0 bg-background z-10">
                                  <div>
                                    <span className="font-medium text-sm">{entry.userName}</span>
                                    <span className="block text-xs text-muted-foreground">{formatCurrency(entry.retainerAmount, entry.currency)}/mo</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge className={`text-xs border-0 ${getLevelBadgeClass(entry.level)}`}>{entry.level}</Badge>
                                </TableCell>
                                {months12.map(m => {
                                  const status = entry.months[m];
                                  return (
                                    <TableCell key={m} className="text-center">
                                      {status?.paid ? (
                                        status.fallback ? (
                                          <div
                                            className="flex flex-col items-center gap-0.5"
                                            title="Paid in base currency (FX rate was unavailable)"
                                            data-testid={`grid-cell-fallback-${entry.userId}-${m}`}
                                          >
                                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">{status.amount.toFixed(0)}</span>
                                          </div>
                                        ) : (
                                          <div className="flex flex-col items-center gap-0.5" data-testid={`grid-cell-paid-${entry.userId}-${m}`}>
                                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                                            <span className="text-[10px] text-muted-foreground">{status.amount.toFixed(0)}</span>
                                          </div>
                                        )
                                      ) : (
                                        <div className="flex justify-center" data-testid={`grid-cell-unpaid-${entry.userId}-${m}`}>
                                          <XCircle className="h-5 w-5 text-red-300 dark:text-red-800" />
                                        </div>
                                      )}
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="eligible" className="mt-4" data-testid="content-eligible">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Eligible Team Members
                        <Badge variant="secondary">{filteredEligible.length}</Badge>
                      </CardTitle>
                      <CardDescription>All users with active retainer classifications</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => navigate('/classifications')} data-testid="button-go-classifications">
                        Manage Classifications
                      </Button>
                      <Button variant="outline" size="sm" onClick={exportEligibleUsers} data-testid="button-export-eligible-csv">
                        <Download className="h-4 w-4 mr-1" />CSV
                      </Button>
                      <Button variant="outline" size="sm" onClick={exportEligibleUsersExcel} data-testid="button-export-eligible-excel">
                        <Download className="h-4 w-4 mr-1" />Excel
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name or email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                        data-testid="input-search-eligible"
                      />
                    </div>
                    <Select value={levelFilter} onValueChange={setLevelFilter}>
                      <SelectTrigger className="w-[160px]" data-testid="select-level-filter">
                        <SelectValue placeholder="Level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Levels</SelectItem>
                        <SelectItem value="A">Level A (Senior)</SelectItem>
                        <SelectItem value="B">Level B (Mid)</SelectItem>
                        <SelectItem value="C">Level C (Junior)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {filteredEligible.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground" data-testid="empty-eligible">
                      <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p className="font-medium">No eligible users found</p>
                      <p className="text-sm">Assign retainer classifications to team members to see them here</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[500px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead>Level</TableHead>
                            <TableHead>Role Scope</TableHead>
                            <TableHead className="text-right">Retainer Amount</TableHead>
                            <TableHead>Frequency</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredEligible.map(user => {
                            const currentMonth  = new Date().getMonth() + 1;
                            const dueThisMonth  = isRetainerDueThisMonth(user.retainer_frequency, currentMonth);
                            const paidThisMonth = transactions.some(
                              t => t.user_id === user.user_id && t.metadata?.period === getCurrentPeriod()
                            );
                            return (
                              <TableRow key={user.id} data-testid={`row-eligible-${user.user_id}`}>
                                <TableCell>
                                  <div>
                                    <span className="font-medium text-sm">{user.full_name || 'Unknown'}</span>
                                    <span className="block text-xs text-muted-foreground">{user.email}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge className={`text-xs border-0 ${getLevelBadgeClass(user.classification_level)}`}>
                                    {getLevelLabel(user.classification_level)}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm capitalize">{user.role_scope || '-'}</TableCell>
                                <TableCell className="text-right font-medium text-sm">
                                  {formatCurrency(user.retainer_amount_cents / 100, user.retainer_currency || 'SDG')}
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <span className="text-sm">{getFrequencyLabel(user.retainer_frequency)}</span>
                                    <span className="block text-xs text-muted-foreground">
                                      {getNextDueMonths(user.retainer_frequency, currentMonth)}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {paidThisMonth ? (
                                    <Badge className="text-xs border-0 bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
                                      <CheckCircle2 className="h-3 w-3 mr-1" />Paid
                                    </Badge>
                                  ) : !dueThisMonth ? (
                                    <Badge className="text-xs border-0 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                      <XCircle className="h-3 w-3 mr-1" />Not due
                                    </Badge>
                                  ) : (
                                    <Badge className="text-xs border-0 bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                                      <Clock className="h-3 w-3 mr-1" />Pending
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="audit" className="mt-4" data-testid="content-audit">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <ClipboardList className="h-4 w-4" />
                        Audit Trail
                        <Badge variant="secondary">{transactions.length}</Badge>
                      </CardTitle>
                      <CardDescription>Full audit log of all retainer processing actions</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={exportPaymentHistory} data-testid="button-export-audit">
                      <Download className="h-4 w-4 mr-1" />Export
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {transactions.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground" data-testid="empty-audit">
                      <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p className="font-medium">No audit records yet</p>
                      <p className="text-sm">Processing actions will be recorded here</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[500px]">
                      <div className="space-y-3">
                        {transactions.map(tx => {
                          const user = userNameMap[tx.user_id];
                          const processedBy = tx.created_by ? userNameMap[tx.created_by] : null;

                          return (
                            <div key={tx.id} className="border rounded-lg p-3" data-testid={`audit-entry-${tx.id}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3">
                                  <div className="h-8 w-8 rounded-full bg-green-50 dark:bg-green-950 flex items-center justify-center shrink-0 mt-0.5">
                                    <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium">
                                      Retainer payment to <span className="text-primary">{user?.name || 'Unknown'}</span>
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{tx.description}</p>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                                      <span className="flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        {format(new Date(tx.created_at), 'MMM d, yyyy HH:mm')}
                                      </span>
                                      {processedBy && (
                                        <span className="flex items-center gap-1">
                                          <Users className="h-3 w-3" />
                                          Processed by {processedBy.name}
                                        </span>
                                      )}
                                      <span className="flex items-center gap-1">
                                        Balance: {formatCurrency(tx.balance_before)} → {formatCurrency(tx.balance_after)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <span className="text-sm font-bold text-green-600 dark:text-green-400 shrink-0">
                                  +{formatCurrency(tx.amount, tx.currency || 'SDG')}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="process" className="mt-4 space-y-4" data-testid="content-process">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Banknote className="h-4 w-4" />
                    Review & Process Monthly Retainers
                  </CardTitle>
                  <CardDescription>
                    Preview eligible users before processing retainer payments for {getCurrentPeriod()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="border rounded-lg p-4 space-y-2 bg-muted/30">
                    <h4 className="font-medium text-sm">Processing Steps:</h4>
                    <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>System checks all users with active retainer classifications</li>
                      <li>Verifies each user hasn't already been paid for {getCurrentPeriod()}</li>
                      <li>Adds retainer amount to each eligible member's wallet</li>
                      <li>Creates a transaction record for full audit trail</li>
                      <li>Skips users already paid this month (no duplicates)</li>
                    </ol>
                  </div>

                  {processResult && (
                    <Alert variant={processResult.failed > 0 ? 'destructive' : 'default'}>
                      {processResult.failed > 0 ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                      <AlertDescription>
                        <span className="font-medium">Processing Complete: </span>
                        Successfully processed {processResult.processed} of {processResult.total} retainers
                        {processResult.failed > 0 && <span className="text-destructive"> ({processResult.failed} failed)</span>}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Persistent fallback alert — shown whenever fallback payments are detected
                      for the current period, even if the admin navigated away and came back. */}
                  {persistentFallback.count > 0 && (
                    <Alert variant="destructive" data-testid="alert-persistent-fallback">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <span className="font-medium">{persistentFallback.count} retainer{persistentFallback.count !== 1 ? 's' : ''} paid in base currency</span> — no exchange rate was found for their configured payout currency at the time of processing. Add the missing rate in Exchange Rates, then click "Reprocess" to correct only these payments.
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                            onClick={() => {
                              setReprocessTargetUserIds(persistentFallback.userIds);
                              setShowReprocessDialog(true);
                            }}
                            disabled={reprocessing}
                            data-testid="button-reprocess-fallback"
                          >
                            {reprocessing ? (
                              <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Reprocessing...</>
                            ) : (
                              <><RefreshCw className="h-3 w-3 mr-1.5" />Reprocess {persistentFallback.count} Payment{persistentFallback.count !== 1 ? 's' : ''}</>
                            )}
                          </Button>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Session-scoped fallback alert (only when processResult has a different count) */}
                  {processResult && processResult.fallbackCount > 0 && processResult.fallbackCount !== persistentFallback.count && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <span className="font-medium">{processResult.fallbackCount} retainer(s) just paid in base currency</span> — refresh the page or wait a moment for the persistent warning above to update.
                          </div>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}

                  {(() => {
                    const currentPeriod = getCurrentPeriod();
                    const currentMonth  = new Date().getMonth() + 1;
                    // Split into due-this-month vs not-due (frequency not scheduled this month)
                    const dueUsers      = eligibleUsers.filter(u => isRetainerDueThisMonth(u.retainer_frequency, currentMonth));
                    const notDueUsers   = eligibleUsers.filter(u => !isRetainerDueThisMonth(u.retainer_frequency, currentMonth));
                    const pendingUsers  = dueUsers.filter(u => !transactions.some(t => t.user_id === u.user_id && t.metadata?.period === currentPeriod));
                    const paidUsers     = dueUsers.filter(u =>  transactions.some(t => t.user_id === u.user_id && t.metadata?.period === currentPeriod));
                    const pendingTotal  = pendingUsers.reduce((s, u) => s + u.retainer_amount_cents / 100, 0);
                    // Due-pending first, due-paid second, not-due last
                    const sortedUsers   = [...pendingUsers, ...paidUsers, ...notDueUsers];

                    return (
                      <>
                        {/* Summary bar */}
                        <div className="flex items-center gap-4 rounded-lg border p-3 bg-muted/20 text-sm flex-wrap">
                          <span className="flex items-center gap-1.5 font-medium">
                            <span className="h-2 w-2 rounded-full bg-amber-500" />
                            {pendingUsers.length} pending payment
                          </span>
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="h-2 w-2 rounded-full bg-green-500" />
                            {paidUsers.length} already paid
                          </span>
                          {notDueUsers.length > 0 && (
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <span className="h-2 w-2 rounded-full bg-slate-400" />
                              {notDueUsers.length} not due this month
                            </span>
                          )}
                          <span className="ml-auto font-semibold">
                            Total to process: {formatCurrency(pendingTotal)}
                          </span>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-medium text-sm">All Eligible Users — {currentPeriod}</h4>
                            <Badge variant="secondary">{eligibleUsers.length} users</Badge>
                          </div>

                          {eligibleUsers.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground border rounded-lg" data-testid="empty-process">
                              <Users className="h-10 w-10 mx-auto mb-2 opacity-20" />
                              <p className="font-medium">No eligible users</p>
                              <p className="text-sm">No active retainer classifications found</p>
                            </div>
                          ) : (
                            <ScrollArea className="h-[400px]">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>User</TableHead>
                                    <TableHead>Level</TableHead>
                                    <TableHead>Frequency</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead>{currentPeriod} Status</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {sortedUsers.map((user, idx) => {
                                    const isDue       = isRetainerDueThisMonth(user.retainer_frequency, currentMonth);
                                    const alreadyPaid = isDue && paidUsers.some(p => p.user_id === user.user_id);
                                    const showPaidDivider   = idx === pendingUsers.length && paidUsers.length > 0 && pendingUsers.length > 0;
                                    const showNotDueDivider = idx === pendingUsers.length + paidUsers.length && notDueUsers.length > 0;
                                    return (
                                      <>
                                        {showPaidDivider && (
                                          <TableRow key="divider-paid">
                                            <TableCell colSpan={5} className="py-1.5 px-3 bg-muted/30 text-[10px] uppercase font-semibold tracking-wide text-muted-foreground border-y">
                                              Already paid this month
                                            </TableCell>
                                          </TableRow>
                                        )}
                                        {showNotDueDivider && (
                                          <TableRow key="divider-not-due">
                                            <TableCell colSpan={5} className="py-1.5 px-3 bg-muted/30 text-[10px] uppercase font-semibold tracking-wide text-muted-foreground border-y">
                                              Not due this month — will be skipped
                                            </TableCell>
                                          </TableRow>
                                        )}
                                        <TableRow
                                          key={user.id}
                                          className={alreadyPaid || !isDue ? 'opacity-50' : ''}
                                          data-testid={`process-row-${user.user_id}`}
                                        >
                                          <TableCell>
                                            <div>
                                              <span className="font-medium text-sm">{user.full_name || 'Unknown'}</span>
                                              <span className="block text-xs text-muted-foreground">{user.email}</span>
                                            </div>
                                          </TableCell>
                                          <TableCell>
                                            <Badge className={`text-xs border-0 ${getLevelBadgeClass(user.classification_level)}`}>
                                              {user.classification_level}
                                            </Badge>
                                          </TableCell>
                                          <TableCell>
                                            <span className="text-xs text-muted-foreground">
                                              {getFrequencyLabel(user.retainer_frequency)}
                                            </span>
                                          </TableCell>
                                          <TableCell className="text-right font-medium text-sm">
                                            {formatCurrency(user.retainer_amount_cents / 100, user.retainer_currency || 'SDG')}
                                          </TableCell>
                                          <TableCell>
                                            {!isDue ? (
                                              <Badge className="text-xs border-0 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                                <XCircle className="h-3 w-3 mr-1" />Not due
                                              </Badge>
                                            ) : alreadyPaid ? (
                                              <Badge className="text-xs border-0 bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
                                                <CheckCircle2 className="h-3 w-3 mr-1" />Paid
                                              </Badge>
                                            ) : (
                                              <Badge className="text-xs border-0 bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                                                <Clock className="h-3 w-3 mr-1" />Will be processed
                                              </Badge>
                                            )}
                                          </TableCell>
                                        </TableRow>
                                      </>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </ScrollArea>
                          )}
                        </div>

                        {/* FX pre-flight warning — shown whenever one or more pairs lack a rate */}
                        {fxCheckLoading && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="fx-check-loading">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Checking exchange rates…
                          </div>
                        )}
                        {!fxCheckLoading && fxWarnings.length > 0 && (
                          <Alert variant="destructive" data-testid="alert-fx-missing">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>
                              <p className="font-medium mb-1">
                                Missing exchange rate{fxWarnings.length !== 1 ? 's' : ''} — {fxWarnings.reduce((s, w) => s + w.affectedUsers.length, 0)} member{fxWarnings.reduce((s, w) => s + w.affectedUsers.length, 0) !== 1 ? 's' : ''} will fall back to base currency if you proceed
                              </p>
                              <ul className="space-y-1.5 mt-2">
                                {fxWarnings.map(w => (
                                  <li key={`${w.fromCurrency}-${w.toCurrency}`} className="text-sm">
                                    <span className="font-semibold">{w.fromCurrency} → {w.toCurrency}</span>
                                    {' — '}
                                    {w.affectedUsers.map(u => u.name).join(', ')}
                                  </li>
                                ))}
                              </ul>
                              <p className="text-xs mt-2 opacity-80">
                                Add the missing rate in Exchange Rates, then refresh this page before processing — or proceed and use "Reprocess" afterwards.
                              </p>
                            </AlertDescription>
                          </Alert>
                        )}

                        <div className="border-t pt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">
                              {pendingUsers.length > 0
                                ? `${pendingUsers.length} member${pendingUsers.length !== 1 ? 's' : ''} will receive payment`
                                : 'All due members have been paid for this month'}
                            </p>
                            {pendingUsers.length > 0 && (
                              <p className="text-xs text-muted-foreground">Total: {formatCurrency(pendingTotal)}</p>
                            )}
                            {notDueUsers.length > 0 && (
                              <p className="text-xs text-muted-foreground">
                                {notDueUsers.length} quarterly/annual member{notDueUsers.length !== 1 ? 's' : ''} not scheduled this month
                              </p>
                            )}
                          </div>
                          <Button
                            onClick={() => setShowProcessDialog(true)}
                            disabled={processing || pendingUsers.length === 0}
                            data-testid="button-start-processing"
                          >
                            {processing ? (
                              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</>
                            ) : pendingUsers.length === 0 ? (
                              <><CheckCircle2 className="h-4 w-4 mr-2" />All Due Members Paid</>
                            ) : (
                              <><Banknote className="h-4 w-4 mr-2" />Process {pendingUsers.length} Retainer{pendingUsers.length !== 1 ? 's' : ''}</>
                            )}
                          </Button>
                        </div>
                      </>
                    );
                  })()}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      <Dialog open={showReprocessDialog} onOpenChange={setShowReprocessDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-amber-500" />
              Reprocess Fallback Payments
            </DialogTitle>
            <DialogDescription>
              This will reverse the base-currency payments and re-issue them in the correct payout currency for {reprocessTargetUserIds.length} member{reprocessTargetUserIds.length !== 1 ? 's' : ''}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="border rounded-lg p-3 bg-muted/30 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Members to correct:</span>
                <span className="font-medium">{reprocessTargetUserIds.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Period:</span>
                <span className="font-medium">{getCurrentPeriod()}</span>
              </div>
            </div>
            <Alert>
              <AlertDescription className="text-sm">
                Each fallback payment will be reversed and re-issued at the current exchange rate. Make sure the exchange rate for the affected currencies has been saved in Exchange Rates before proceeding.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowReprocessDialog(false)} data-testid="button-cancel-reprocess">
              Cancel
            </Button>
            <Button
              onClick={handleReprocess}
              disabled={reprocessing}
              data-testid="button-confirm-reprocess"
            >
              {reprocessing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Reprocessing...</>
              ) : (
                <><RefreshCw className="h-4 w-4 mr-2" />Confirm & Reprocess</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showProcessDialog} onOpenChange={setShowProcessDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Retainer Processing
            </DialogTitle>
            <DialogDescription>
              You are about to process monthly retainer payments for {getCurrentPeriod()}.
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const cp           = getCurrentPeriod();
            const currentMonth = new Date().getMonth() + 1;
            const dueInDialog     = eligibleUsers.filter(u =>  isRetainerDueThisMonth(u.retainer_frequency, currentMonth));
            const notDueInDialog  = eligibleUsers.filter(u => !isRetainerDueThisMonth(u.retainer_frequency, currentMonth));
            const pendingInDialog = dueInDialog.filter(u => !transactions.some(t => t.user_id === u.user_id && t.metadata?.period === cp));
            const alreadyPaidCount = dueInDialog.length - pendingInDialog.length;
            const pendingTotalAmt  = pendingInDialog.reduce((s, u) => s + u.retainer_amount_cents / 100, 0);
            return (
              <div className="space-y-3 py-2">
                <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Total eligible users:</span>
                    <span className="font-medium">{eligibleUsers.length}</span>
                  </div>
                  {notDueInDialog.length > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Not due this month (quarterly/annual):</span>
                      <span className="font-medium">{notDueInDialog.length} — will be skipped</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Already paid this month:</span>
                    <span className="font-medium">{alreadyPaidCount} — will be skipped</span>
                  </div>
                  <div className="flex justify-between text-sm border-t pt-2">
                    <span className="font-semibold text-amber-700 dark:text-amber-400">Pending — will be paid now:</span>
                    <span className="font-bold">{pendingInDialog.length} users</span>
                  </div>
                  <div className="flex justify-between text-sm border-t pt-2">
                    <span className="font-medium">Total amount:</span>
                    <span className="font-bold text-green-700 dark:text-green-400">{formatCurrency(pendingTotalAmt)}</span>
                  </div>
                </div>
                {fxWarnings.length > 0 && (
                  <Alert variant="destructive" data-testid="dialog-alert-fx-missing">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      <p className="font-medium mb-1">Exchange rate missing for {fxWarnings.length} pair{fxWarnings.length !== 1 ? 's' : ''}:</p>
                      <ul className="space-y-0.5">
                        {fxWarnings.map(w => (
                          <li key={`${w.fromCurrency}-${w.toCurrency}`}>
                            <span className="font-semibold">{w.fromCurrency} → {w.toCurrency}</span>
                            {' — '}
                            {w.affectedUsers.map(u => u.name).join(', ')} will be paid in base currency
                          </li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
                <Alert>
                  <AlertDescription className="text-sm">
                    Retainer amounts will be added to each due member's wallet. Already-paid and not-yet-due members are automatically skipped — no duplicates.
                  </AlertDescription>
                </Alert>
              </div>
            );
          })()}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowProcessDialog(false)} data-testid="button-cancel-process">
              Cancel
            </Button>
            <Button
              onClick={() => { setShowProcessDialog(false); handleProcess(); }}
              disabled={processing}
              data-testid="button-confirm-process"
            >
              {processing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</>
              ) : (
                <><CheckCircle2 className="h-4 w-4 mr-2" />Confirm & Process</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RetainerManagement;
