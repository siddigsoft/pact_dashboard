import { useState, useEffect, useMemo } from 'react';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ClipboardCheck,
  Clock,
  DollarSign,
  CheckCircle,
  AlertTriangle,
  Download,
  Search,
  ChevronLeft,
  CalendarCheck,
  Sparkles,
  Zap
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/shared/hooks/use-toast';
import { useUser } from '@/features/user/context/UserContext';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, isValid, differenceInDays, startOfMonth, subDays } from 'date-fns';
import * as XLSX from 'xlsx';

interface OpCostRow {
  id: string;
  project_id: string | null;
  expense_category: string;
  amount_cents: number;
  currency: string;
  description: string | null;
  submitted_by: string;
  paid_at: string | null;
  reconciled_at: string | null;
  reconciled_amount_cents: number | null;
  created_at: string;
}

type MatchConfidence = 'high' | 'medium' | 'low' | null;

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const safeFormatDate = (dateStr: string | null) => {
  if (!dateStr) return '-';
  try {
    const d = parseISO(dateStr);
    return isValid(d) ? format(d, 'dd MMM yyyy') : '-';
  } catch {
    return '-';
  }
};

const ReconciliationDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { users } = useUser();

  const [submissions, setSubmissions] = useState<OpCostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reconcilingIds, setReconcilingIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [matchResults, setMatchResults] = useState<Map<string, MatchConfidence>>(new Map());
  const [autoMatchRunning, setAutoMatchRunning] = useState(false);

  const fetchData = async () => {
    try {
      const { data, error } = await supabase
        .from('operational_cost_submissions')
        .select('id, project_id, expense_category, amount_cents, currency, description, submitted_by, paid_at, reconciled_at, reconciled_amount_cents, created_at')
        .order('paid_at', { ascending: true });
      if (error) throw error;
      setSubmissions((data as OpCostRow[]) || []);
    } catch (err) {
      console.error('Failed to fetch submissions:', err);
      toast({ title: 'Error', description: 'Failed to load reconciliation data.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getUserName = (userId: string) => {
    const u = users.find(u => u.id === userId);
    return u?.name || u?.email || userId.slice(0, 8);
  };

  const pendingItems = useMemo(() => {
    return submissions.filter(s => s.paid_at && !s.reconciled_at);
  }, [submissions]);

  const recentlyReconciled = useMemo(() => {
    const thirtyDaysAgo = subDays(new Date(), 30);
    return submissions
      .filter(s => {
        if (!s.reconciled_at) return false;
        try {
          const d = parseISO(s.reconciled_at);
          return isValid(d) && d >= thirtyDaysAgo;
        } catch {
          return false;
        }
      })
      .sort((a, b) => (b.reconciled_at || '').localeCompare(a.reconciled_at || ''));
  }, [submissions]);

  const reconciledThisMonth = useMemo(() => {
    const monthStart = startOfMonth(new Date());
    return submissions.filter(s => {
      if (!s.reconciled_at) return false;
      try {
        const d = parseISO(s.reconciled_at);
        return isValid(d) && d >= monthStart;
      } catch {
        return false;
      }
    }).length;
  }, [submissions]);

  const totalUnreconciledAmount = useMemo(() => {
    return pendingItems.reduce((sum, s) => sum + (s.amount_cents || 0), 0) / 100;
  }, [pendingItems]);

  const avgDaysToReconcile = useMemo(() => {
    const reconciled = submissions.filter(s => s.paid_at && s.reconciled_at);
    if (reconciled.length === 0) return 0;
    const totalDays = reconciled.reduce((sum, s) => {
      try {
        const paid = parseISO(s.paid_at!);
        const recon = parseISO(s.reconciled_at!);
        if (isValid(paid) && isValid(recon)) {
          return sum + differenceInDays(recon, paid);
        }
      } catch {}
      return sum;
    }, 0);
    return Math.round(totalDays / reconciled.length);
  }, [submissions]);

  const categories = useMemo(() => {
    const cats = new Set(submissions.map(s => s.expense_category).filter(Boolean));
    return Array.from(cats).sort();
  }, [submissions]);

  const projects = useMemo(() => {
    const projs = new Set(submissions.map(s => s.project_id).filter(Boolean) as string[]);
    return Array.from(projs).sort();
  }, [submissions]);

  const filteredPending = useMemo(() => {
    return pendingItems.filter(item => {
      if (searchQuery) {
        const name = getUserName(item.submitted_by).toLowerCase();
        const ref = item.id.slice(0, 8).toLowerCase();
        if (!name.includes(searchQuery.toLowerCase()) && !ref.includes(searchQuery.toLowerCase())) {
          return false;
        }
      }
      if (categoryFilter !== 'all' && item.expense_category !== categoryFilter) return false;
      if (projectFilter !== 'all' && item.project_id !== projectFilter) return false;
      return true;
    });
  }, [pendingItems, searchQuery, categoryFilter, projectFilter, users]);

  const handleReconcile = async (id: string, amountCents: number) => {
    setReconcilingIds(prev => new Set(prev).add(id));
    try {
      const { error } = await supabase
        .from('operational_cost_submissions')
        .update({
          reconciled_at: new Date().toISOString(),
          reconciled_amount_cents: amountCents,
        })
        .eq('id', id);
      if (error) throw error;
      toast({ title: 'Reconciled', description: 'Item has been reconciled successfully.' });
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await fetchData();
    } catch (err) {
      console.error('Failed to reconcile:', err);
      toast({ title: 'Error', description: 'Failed to reconcile item.', variant: 'destructive' });
    } finally {
      setReconcilingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleReconcileAll = async () => {
    if (selectedIds.size === 0) {
      toast({ title: 'No items selected', description: 'Please select items to reconcile.', variant: 'destructive' });
      return;
    }
    const items = filteredPending.filter(i => selectedIds.has(i.id));
    const allIds = new Set(selectedIds);
    setReconcilingIds(allIds);
    try {
      const now = new Date().toISOString();
      const promises = items.map(item =>
        supabase
          .from('operational_cost_submissions')
          .update({
            reconciled_at: now,
            reconciled_amount_cents: item.amount_cents,
          })
          .eq('id', item.id)
      );
      const results = await Promise.all(promises);
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        toast({ title: 'Partial Success', description: `${items.length - errors.length} of ${items.length} items reconciled.`, variant: 'destructive' });
      } else {
        toast({ title: 'Bulk Reconciliation Complete', description: `${items.length} items reconciled successfully.` });
      }
      setSelectedIds(new Set());
      await fetchData();
    } catch (err) {
      console.error('Bulk reconcile failed:', err);
      toast({ title: 'Error', description: 'Bulk reconciliation failed.', variant: 'destructive' });
    } finally {
      setReconcilingIds(new Set());
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredPending.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPending.map(i => i.id)));
    }
  };

  const getDaysSincePayment = (paidAt: string | null) => {
    if (!paidAt) return 0;
    try {
      const d = parseISO(paidAt);
      return isValid(d) ? differenceInDays(new Date(), d) : 0;
    } catch {
      return 0;
    }
  };

  const runAutoMatch = () => {
    setAutoMatchRunning(true);
    const reconciledItems = submissions.filter(s => s.reconciled_at);
    const newMatchResults = new Map<string, MatchConfidence>();

    for (const pending of pendingItems) {
      let bestConfidence: MatchConfidence = null;

      for (const reconciled of reconciledItems) {
        const reconciledAmount = reconciled.reconciled_amount_cents || reconciled.amount_cents;
        const exactAmount = pending.amount_cents === reconciledAmount;
        const approxAmount = Math.abs(pending.amount_cents - reconciledAmount) / reconciledAmount <= 0.05;
        const sameProject = pending.project_id && reconciled.project_id && pending.project_id === reconciled.project_id;
        let sameWeek = false;
        if (pending.paid_at && reconciled.paid_at) {
          try {
            const paidDate = parseISO(pending.paid_at);
            const reconDate = parseISO(reconciled.paid_at);
            if (isValid(paidDate) && isValid(reconDate)) {
              sameWeek = Math.abs(differenceInDays(paidDate, reconDate)) <= 7;
            }
          } catch {}
        }

        if (exactAmount && sameProject && sameWeek) {
          bestConfidence = 'high';
          break;
        } else if (exactAmount && sameProject && bestConfidence !== 'high') {
          bestConfidence = 'medium';
        } else if (approxAmount && !bestConfidence) {
          bestConfidence = 'low';
        }
      }

      if (!bestConfidence) {
        for (const other of pendingItems) {
          if (other.id === pending.id) continue;
          const sameProject = pending.project_id && other.project_id && pending.project_id === other.project_id;
          const sameCategory = pending.expense_category === other.expense_category;
          const exactAmount = pending.amount_cents === other.amount_cents;
          const approxAmount = other.amount_cents > 0 && Math.abs(pending.amount_cents - other.amount_cents) / other.amount_cents <= 0.05;
          let sameWeek = false;
          if (pending.paid_at && other.paid_at) {
            try {
              const d1 = parseISO(pending.paid_at);
              const d2 = parseISO(other.paid_at);
              if (isValid(d1) && isValid(d2)) {
                sameWeek = Math.abs(differenceInDays(d1, d2)) <= 7;
              }
            } catch {}
          }

          if (exactAmount && sameProject && sameWeek) {
            bestConfidence = 'high';
            break;
          } else if (exactAmount && (sameProject || sameCategory) && bestConfidence !== 'high') {
            bestConfidence = 'medium';
          } else if (approxAmount && !bestConfidence) {
            bestConfidence = 'low';
          }
        }
      }

      if (bestConfidence) {
        newMatchResults.set(pending.id, bestConfidence);
      }
    }

    setMatchResults(newMatchResults);
    setAutoMatchRunning(false);

    const highCount = Array.from(newMatchResults.values()).filter(v => v === 'high').length;
    const medCount = Array.from(newMatchResults.values()).filter(v => v === 'medium').length;
    const lowCount = Array.from(newMatchResults.values()).filter(v => v === 'low').length;

    toast({
      title: 'Auto-Match Complete',
      description: `Found ${highCount} high, ${medCount} medium, and ${lowCount} low confidence matches.`,
    });
  };

  const handleReconcileAllMatched = async () => {
    const highConfidenceIds = filteredPending
      .filter(item => matchResults.get(item.id) === 'high')
      .map(item => item);
    if (highConfidenceIds.length === 0) {
      toast({ title: 'No matches', description: 'No high-confidence matches to reconcile.', variant: 'destructive' });
      return;
    }
    const allIds = new Set(highConfidenceIds.map(i => i.id));
    setReconcilingIds(allIds);
    try {
      const now = new Date().toISOString();
      const promises = highConfidenceIds.map(item =>
        supabase
          .from('operational_cost_submissions')
          .update({
            reconciled_at: now,
            reconciled_amount_cents: item.amount_cents,
          })
          .eq('id', item.id)
      );
      const results = await Promise.all(promises);
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        toast({ title: 'Partial Success', description: `${highConfidenceIds.length - errors.length} of ${highConfidenceIds.length} matched items reconciled.`, variant: 'destructive' });
      } else {
        toast({ title: 'Matched Reconciliation Complete', description: `${highConfidenceIds.length} high-confidence items reconciled successfully.` });
      }
      setMatchResults(new Map());
      setSelectedIds(new Set());
      await fetchData();
    } catch (err) {
      console.error('Matched reconcile failed:', err);
      toast({ title: 'Error', description: 'Matched reconciliation failed.', variant: 'destructive' });
    } finally {
      setReconcilingIds(new Set());
    }
  };

  const getConfidenceBadge = (confidence: MatchConfidence) => {
    if (!confidence) return null;
    const variants: Record<string, { className: string; label: string }> = {
      high: { className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', label: 'High' },
      medium: { className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', label: 'Medium' },
      low: { className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200', label: 'Low' },
    };
    const v = variants[confidence];
    return (
      <Badge variant="secondary" className={v.className}>
        {v.label}
      </Badge>
    );
  };

  const highMatchCount = useMemo(() => {
    return filteredPending.filter(item => matchResults.get(item.id) === 'high').length;
  }, [filteredPending, matchResults]);

  const handleExport = () => {
    const data = filteredPending.map(item => ({
      'Ref #': item.id.slice(0, 8).toUpperCase(),
      'Staff Name': getUserName(item.submitted_by),
      'Category': item.expense_category,
      'Amount (SDG)': (item.amount_cents / 100).toFixed(2),
      'Paid Date': safeFormatDate(item.paid_at),
      'Days Since Payment': getDaysSincePayment(item.paid_at),
      'Project': item.project_id || 'General',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pending Reconciliation');

    const reconData = recentlyReconciled.map(item => ({
      'Ref #': item.id.slice(0, 8).toUpperCase(),
      'Staff Name': getUserName(item.submitted_by),
      'Category': item.expense_category,
      'Amount (SDG)': (item.amount_cents / 100).toFixed(2),
      'Reconciled Amount (SDG)': ((item.reconciled_amount_cents || 0) / 100).toFixed(2),
      'Paid Date': safeFormatDate(item.paid_at),
      'Reconciled Date': safeFormatDate(item.reconciled_at),
    }));
    const ws2 = XLSX.utils.json_to_sheet(reconData);
    XLSX.utils.book_append_sheet(wb, ws2, 'Recently Reconciled');

    XLSX.writeFile(wb, `Reconciliation_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast({ title: 'Exported', description: 'Reconciliation data exported to Excel.' });
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4 md:p-6 space-y-4" data-testid="reconciliation-loading">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4" data-testid="reconciliation-dashboard">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} data-testid="button-back">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2" data-testid="text-reconciliation-title">
              <ClipboardCheck className="h-6 w-6 md:h-8 md:w-8 text-primary" />
              Reconciliation Dashboard
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Match payments against receipts and submissions
            </p>
          </div>
        </div>
        <Button size="sm" onClick={handleExport} data-testid="button-export-excel">
          <Download className="h-4 w-4 mr-2" />
          Export to Excel
        </Button>
      </div>

      <PageInfoBanner
        title="Reconciliation Dashboard"
        description="This page allows finance staff to systematically reconcile payments against submitted receipts. Items appear here once they have been marked as paid but have not yet been reconciled. Use the Reconcile button to confirm that payment has been verified against the original submission. Bulk reconciliation is available for processing multiple items at once."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="kpi-cards">
        <Card data-testid="kpi-pending-reconciliation">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Reconciliation</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="value-pending-count">{pendingItems.length}</div>
            <p className="text-xs text-muted-foreground">Paid but not reconciled</p>
          </CardContent>
        </Card>

        <Card data-testid="kpi-reconciled-this-month">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reconciled This Month</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="value-reconciled-month">{reconciledThisMonth}</div>
            <p className="text-xs text-muted-foreground">Items reconciled</p>
          </CardContent>
        </Card>

        <Card data-testid="kpi-unreconciled-amount">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Unreconciled Amount</CardTitle>
            <DollarSign className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="value-unreconciled-amount">SDG {formatCurrency(totalUnreconciledAmount)}</div>
            <p className="text-xs text-muted-foreground">Pending verification</p>
          </CardContent>
        </Card>

        <Card data-testid="kpi-avg-days">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Days to Reconcile</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="value-avg-days">{avgDaysToReconcile}</div>
            <p className="text-xs text-muted-foreground">Average processing time</p>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="section-pending-reconciliation">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg">Pending Reconciliation</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={runAutoMatch}
              disabled={autoMatchRunning || pendingItems.length === 0}
              data-testid="button-auto-match"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {autoMatchRunning ? 'Matching...' : 'Auto-Match'}
            </Button>
            {highMatchCount > 0 && (
              <Button
                size="sm"
                onClick={handleReconcileAllMatched}
                disabled={reconcilingIds.size > 0}
                data-testid="button-reconcile-all-matched"
              >
                <Zap className="h-4 w-4 mr-2" />
                Reconcile All Matched ({highMatchCount})
              </Button>
            )}
            {selectedIds.size > 0 && (
              <Button
                size="sm"
                onClick={handleReconcileAll}
                disabled={reconcilingIds.size > 0}
                data-testid="button-reconcile-all"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Reconcile All ({selectedIds.size})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or ref..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-48" data-testid="select-category-filter">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-full sm:w-48" data-testid="select-project-filter">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects.map(proj => (
                  <SelectItem key={proj} value={proj}>{proj.slice(0, 8)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table data-testid="table-pending">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filteredPending.length > 0 && selectedIds.size === filteredPending.length}
                      onCheckedChange={toggleSelectAll}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead>Ref #</TableHead>
                  <TableHead>Staff Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount (SDG)</TableHead>
                  <TableHead>Paid Date</TableHead>
                  <TableHead>Days Since Payment</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPending.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8" data-testid="text-no-pending">
                      No pending reconciliation items found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPending.map(item => {
                    const daysSince = getDaysSincePayment(item.paid_at);
                    return (
                      <TableRow key={item.id} data-testid={`row-pending-${item.id}`}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(item.id)}
                            onCheckedChange={() => toggleSelect(item.id)}
                            data-testid={`checkbox-select-${item.id}`}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs" data-testid={`text-ref-${item.id}`}>
                          {item.id.slice(0, 8).toUpperCase()}
                        </TableCell>
                        <TableCell data-testid={`text-staff-${item.id}`}>
                          {getUserName(item.submitted_by)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" data-testid={`badge-category-${item.id}`}>
                            {item.expense_category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium" data-testid={`text-amount-${item.id}`}>
                          SDG {formatCurrency(item.amount_cents / 100)}
                        </TableCell>
                        <TableCell data-testid={`text-paid-date-${item.id}`}>
                          {safeFormatDate(item.paid_at)}
                        </TableCell>
                        <TableCell data-testid={`text-days-since-${item.id}`}>
                          <Badge
                            variant={daysSince > 14 ? 'destructive' : daysSince > 7 ? 'secondary' : 'secondary'}
                          >
                            {daysSince} days
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs" data-testid={`text-project-${item.id}`}>
                          {item.project_id ? item.project_id.slice(0, 8) : 'General'}
                        </TableCell>
                        <TableCell data-testid={`badge-match-confidence-${item.id}`}>
                          {getConfidenceBadge(matchResults.get(item.id) || null)}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            onClick={() => handleReconcile(item.id, item.amount_cents)}
                            disabled={reconcilingIds.has(item.id)}
                            data-testid={`button-reconcile-${item.id}`}
                          >
                            <CalendarCheck className="h-4 w-4 mr-1" />
                            {reconcilingIds.has(item.id) ? 'Processing...' : 'Reconcile'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {filteredPending.length > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="text-pending-count">
              Showing {filteredPending.length} of {pendingItems.length} pending items
            </p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="section-recently-reconciled">
        <CardHeader>
          <CardTitle className="text-lg">Recently Reconciled (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table data-testid="table-reconciled">
              <TableHeader>
                <TableRow>
                  <TableHead>Ref #</TableHead>
                  <TableHead>Staff Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount (SDG)</TableHead>
                  <TableHead className="text-right">Reconciled Amount (SDG)</TableHead>
                  <TableHead>Paid Date</TableHead>
                  <TableHead>Reconciled Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentlyReconciled.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8" data-testid="text-no-reconciled">
                      No recently reconciled items.
                    </TableCell>
                  </TableRow>
                ) : (
                  recentlyReconciled.map(item => (
                    <TableRow key={item.id} data-testid={`row-reconciled-${item.id}`}>
                      <TableCell className="font-mono text-xs" data-testid={`text-recon-ref-${item.id}`}>
                        {item.id.slice(0, 8).toUpperCase()}
                      </TableCell>
                      <TableCell data-testid={`text-recon-staff-${item.id}`}>
                        {getUserName(item.submitted_by)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{item.expense_category}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium" data-testid={`text-recon-amount-${item.id}`}>
                        SDG {formatCurrency(item.amount_cents / 100)}
                      </TableCell>
                      <TableCell className="text-right font-medium" data-testid={`text-recon-reconciled-amount-${item.id}`}>
                        SDG {formatCurrency((item.reconciled_amount_cents || 0) / 100)}
                      </TableCell>
                      <TableCell data-testid={`text-recon-paid-date-${item.id}`}>
                        {safeFormatDate(item.paid_at)}
                      </TableCell>
                      <TableCell data-testid={`text-recon-date-${item.id}`}>
                        {safeFormatDate(item.reconciled_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {recentlyReconciled.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2" data-testid="text-reconciled-count">
              {recentlyReconciled.length} items reconciled in the last 30 days
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReconciliationDashboard;
