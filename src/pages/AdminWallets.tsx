import React, { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@/context/wallet/WalletContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GradientStatCard } from '@/components/ui/gradient-stat-card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { WalletCard } from '@/components/wallet/WalletCard';
import { supabase } from '@/integrations/supabase/client';
import { adminListWallets } from '@/context/wallet/supabase';
import { Search, RefreshCw, Wallet as WalletIcon, Zap, TrendingUp, Activity, DollarSign, Grid3x3, Table2, ChevronDown, ChevronRight, MapPin, Calendar, Settings, Download, FileSpreadsheet } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { BalanceAdjustmentDialog } from '@/components/wallet/BalanceAdjustmentDialog';
import { exportTransactionsToCSV, exportTransactionsToPDF } from '@/lib/wallet/export';
import { useToast } from '@/hooks/use-toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const fmt = (c: number, cur: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'NGN', currencyDisplay: 'narrowSymbol' }).format((c||0)/100);

const AdminWallets: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [currency, setCurrency] = useState('SDG');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [expandedWallets, setExpandedWallets] = useState<Set<string>>(new Set());
  const [transactionDetails, setTransactionDetails] = useState<Record<string, any[]>>({});
  const [adjustmentDialog, setAdjustmentDialog] = useState<{
    open: boolean;
    userId: string;
    userName: string;
    currentBalance: number;
  }>({ open: false, userId: '', userName: '', currentBalance: 0 });
  const navigate = useNavigate();
  const { toast } = useToast();

  const load = async () => {
    const data = await adminListWallets();
    setRows(data || []);
    const c = data && data[0]?.balances ? Object.keys(data[0].balances)[0] : 'SDG';
    setCurrency(c);
  };

  const loadTransactionDetails = async (walletId: string) => {
    if (transactionDetails[walletId]) return; // Already loaded

    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*, mmp_site_entries!wallet_transactions_site_visit_id_fkey(id, site_name, site_code, locality, state, completed_at)')
      .eq('wallet_id', walletId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setTransactionDetails(prev => ({ ...prev, [walletId]: data }));
    }
  };

  const toggleWalletExpansion = async (walletId: string) => {
    const newExpanded = new Set(expandedWallets);
    if (newExpanded.has(walletId)) {
      newExpanded.delete(walletId);
    } else {
      newExpanded.add(walletId);
      await loadTransactionDetails(walletId);
    }
    setExpandedWallets(newExpanded);
  };

  const handleAdjustBalance = (wallet: any) => {
    const balance = wallet.balances?.[currency] || 0;
    setAdjustmentDialog({
      open: true,
      userId: wallet.user_id,
      userName: wallet.owner_name || wallet.profiles?.full_name || 'Unknown',
      currentBalance: balance,
    });
  };

  const handleExportCSV = async (wallet: any) => {
    try {
      const transactions = transactionDetails[wallet.id] || [];
      if (transactions.length === 0) {
        await loadTransactionDetails(wallet.id);
      }
      // Transform Supabase snake_case to camelCase WalletTransaction format
      const txs = (transactionDetails[wallet.id] || []).map((tx: any) => ({
        id: tx.id,
        walletId: tx.wallet_id,
        userId: tx.user_id,
        type: tx.type,
        amount: parseFloat(tx.amount),
        currency: tx.currency,
        siteVisitId: tx.site_visit_id,
        withdrawalRequestId: tx.withdrawal_request_id,
        description: tx.description,
        metadata: tx.metadata,
        balanceBefore: tx.balance_before ? parseFloat(tx.balance_before) : undefined,
        balanceAfter: tx.balance_after ? parseFloat(tx.balance_after) : undefined,
        createdBy: tx.created_by,
        createdAt: tx.created_at,
      }));
      const walletObj = {
        id: wallet.id,
        userId: wallet.user_id,
        balances: wallet.balances || {},
        totalEarned: Number(wallet.total_earned || 0),
        totalWithdrawn: Number(wallet.total_withdrawn || 0),
        createdAt: wallet.created_at,
        updatedAt: wallet.updated_at,
      };
      exportTransactionsToCSV(txs, walletObj, `wallet_${wallet.owner_name || 'user'}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
      toast({
        title: 'Export Successful',
        description: 'Wallet statement exported to CSV',
      });
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: 'Failed to export wallet statement',
        variant: 'destructive',
      });
    }
  };

  const handleExportPDF = async (wallet: any) => {
    try {
      const transactions = transactionDetails[wallet.id] || [];
      if (transactions.length === 0) {
        await loadTransactionDetails(wallet.id);
      }
      // Transform Supabase snake_case to camelCase WalletTransaction format
      const txs = (transactionDetails[wallet.id] || []).map((tx: any) => ({
        id: tx.id,
        walletId: tx.wallet_id,
        userId: tx.user_id,
        type: tx.type,
        amount: parseFloat(tx.amount),
        currency: tx.currency,
        siteVisitId: tx.site_visit_id,
        withdrawalRequestId: tx.withdrawal_request_id,
        description: tx.description,
        metadata: tx.metadata,
        balanceBefore: tx.balance_before ? parseFloat(tx.balance_before) : undefined,
        balanceAfter: tx.balance_after ? parseFloat(tx.balance_after) : undefined,
        createdBy: tx.created_by,
        createdAt: tx.created_at,
      }));
      const walletObj = {
        id: wallet.id,
        userId: wallet.user_id,
        balances: wallet.balances || {},
        totalEarned: Number(wallet.total_earned || 0),
        totalWithdrawn: Number(wallet.total_withdrawn || 0),
        createdAt: wallet.created_at,
        updatedAt: wallet.updated_at,
      };
      exportTransactionsToPDF(txs, walletObj, currency, `wallet_${wallet.owner_name || 'user'}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast({
        title: 'Export Successful',
        description: 'Wallet statement exported to PDF',
      });
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: 'Failed to export wallet statement',
        variant: 'destructive',
      });
    }
  };
  

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const id = setInterval(() => { load(); }, 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const ch = supabase
      .channel('admin_wallets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, () => load());
    ch.subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, []);

  const filtered = useMemo(() => {
    // Filter out wallets with no balance and no earnings
    let filtered = rows.filter(r => {
      const balance = r.balances?.[currency] || 0;
      const earned = Number(r.total_earned || 0);
      return balance > 0 || earned > 0;
    });
    
    // Apply search filter
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(r => 
        (r.owner_name || '').toString().toLowerCase().includes(s) ||
        (r.user_id || '').toString().toLowerCase().includes(s) ||
        (r.profiles?.email || '').toString().toLowerCase().includes(s)
      );
    }
    
    return filtered;
  }, [rows, search, currency]);

  const getBalance = (wallet: any, curr: string) => (wallet.balances?.[curr] || 0) * 100;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center">
            <WalletIcon className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Wallets Management</h1>
            <p className="text-sm text-muted-foreground">
              Financial Operations Command Center
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GradientStatCard
          title="Total Platform Earnings"
          value={fmt(filtered.reduce((a,b)=>a+(Number(b.totalEarned)||0)*100,0), currency)}
          subtitle={`${filtered.length} active wallets`}
          icon={TrendingUp}
          color="blue"
          data-testid="card-stat-total-earnings"
        />

        <GradientStatCard
          title="Total Withdrawals"
          value={fmt(filtered.reduce((a,b)=>a+(Number(b.totalWithdrawn)||0)*100,0), currency)}
          subtitle="Paid to enumerators"
          icon={Activity}
          color="purple"
          data-testid="card-stat-total-withdrawals"
        />

        <GradientStatCard
          title="Current Balances"
          value={fmt(filtered.reduce((a,b)=>a+getBalance(b, currency),0), currency)}
          subtitle="Available for withdrawal"
          icon={WalletIcon}
          color="cyan"
          data-testid="card-stat-current-balances"
        />
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
          <Input 
            placeholder="Search by name, email, or user ID..." 
            value={search} 
            onChange={e=>setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search-wallets"
          />
        </div>
        <div className="flex items-center gap-2 border rounded-lg p-1 bg-muted/50">
          <Button 
            variant={viewMode === 'table' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('table')}
            data-testid="button-view-table"
            className="h-8"
          >
            <Table2 className="w-4 h-4 mr-2" />
            Table
          </Button>
          <Button 
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('grid')}
            data-testid="button-view-grid"
            className="h-8"
          >
            <Grid3x3 className="w-4 h-4 mr-2" />
            Grid
          </Button>
        </div>
        <Button 
          variant="outline" 
          onClick={load} 
          data-testid="button-refresh-wallets"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Wallets Display */}
      {filtered.length === 0 ? (
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-2xl blur-xl"></div>
          <Card className="relative bg-gradient-to-br from-slate-900/90 to-blue-900/50 backdrop-blur-xl border border-blue-500/30">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="p-4 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl mb-6">
                <WalletIcon className="w-16 h-16 text-blue-400" />
              </div>
              <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-3">
                No Wallets Detected
              </h3>
              <p className="text-blue-300/70 text-center max-w-md text-lg">
                {search ? 'Adjust search parameters' : 'Wallet data will synchronize once enumerators complete site visits'}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : viewMode === 'table' ? (
        <Card className="border-blue-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Table2 className="w-5 h-5" />
              Detailed Wallet Balances
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-blue-500/20 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="font-bold">User</TableHead>
                    <TableHead className="font-bold">Email</TableHead>
                    <TableHead className="font-bold text-right">Current Balance</TableHead>
                    <TableHead className="font-bold text-right">
                      <div className="flex flex-col">
                        <span>Earnings Breakdown</span>
                        <span className="text-xs font-normal text-muted-foreground">(Site Visits / Retainer)</span>
                      </div>
                    </TableHead>
                    <TableHead className="font-bold text-right">Total Withdrawn</TableHead>
                    <TableHead className="font-bold text-center">Status</TableHead>
                    <TableHead className="font-bold">Last Updated</TableHead>
                    <TableHead className="font-bold text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(wallet => {
                    const balance = (wallet.balances?.[currency] || 0);
                    const earned = Number(wallet.total_earned || 0);
                    const withdrawn = Number(wallet.total_withdrawn || 0);
                    const isActive = balance > 0 || earned > 0;
                    const isExpanded = expandedWallets.has(wallet.id);
                    const transactions = transactionDetails[wallet.id] || [];
                    
                    // Calculate breakdown from transactions
                    const breakdown = wallet.breakdown || {};
                    const siteVisitFees = Number(breakdown.site_visit_fee || 0);
                    const bonuses = Number(breakdown.bonus || 0);
                    const adjustments = Number(breakdown.adjustment || 0);
                    const penalties = Number(breakdown.penalty || 0);
                    const withdrawals = Number(breakdown.withdrawal || 0);
                    
                    return (
                      <React.Fragment key={wallet.id}>
                        <TableRow 
                          className="hover-elevate"
                          data-testid={`wallet-row-${wallet.user_id}`}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleWalletExpansion(wallet.id);
                                }}
                              >
                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </Button>
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                                {(wallet.owner_name || wallet.profiles?.full_name || 'U')[0].toUpperCase()}
                              </div>
                              <span>{wallet.owner_name || wallet.profiles?.full_name || wallet.profiles?.username || 'Unknown'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {wallet.profiles?.email || '-'}
                          </TableCell>
                          <TableCell className="text-right font-bold">
                            <span className={balance > 0 ? 'text-green-600 dark:text-green-400' : ''}>
                              {fmt(balance * 100, currency)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col gap-1 items-end">
                              {siteVisitFees > 0 && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Site Visits:</span>
                                  <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                                    {fmt(siteVisitFees * 100, currency)}
                                  </span>
                                </div>
                              )}
                              {bonuses > 0 && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Bonuses:</span>
                                  <span className="text-sm font-medium text-green-600 dark:text-green-400">
                                    {fmt(bonuses * 100, currency)}
                                  </span>
                                </div>
                              )}
                              {adjustments !== 0 && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Adjustments:</span>
                                  <span className={`text-sm font-medium ${adjustments > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                    {fmt(adjustments * 100, currency)}
                                  </span>
                                </div>
                              )}
                              {penalties < 0 && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Penalties:</span>
                                  <span className="text-sm font-medium text-red-600 dark:text-red-400">
                                    {fmt(penalties * 100, currency)}
                                  </span>
                                </div>
                              )}
                              {withdrawals < 0 && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Withdrawals:</span>
                                  <span className="text-sm font-medium text-orange-600 dark:text-orange-400">
                                    {fmt(withdrawals * 100, currency)}
                                  </span>
                                </div>
                              )}
                              {/* Fallback: show total_earned when no transaction breakdown available */}
                              {earned > 0 && siteVisitFees === 0 && bonuses === 0 && adjustments === 0 && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Total Earned:</span>
                                  <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                                    {fmt(earned * 100, currency)}
                                  </span>
                                </div>
                              )}
                              {earned === 0 && <span className="text-sm text-muted-foreground">No earnings yet</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-purple-600 dark:text-purple-400">
                              {fmt(withdrawn * 100, currency)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge 
                              variant={isActive ? 'default' : 'secondary'}
                              className={isActive ? 'bg-green-500/90 hover:bg-green-600' : ''}
                            >
                              {isActive ? 'ACTIVE' : 'INACTIVE'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {wallet.updated_at ? format(new Date(wallet.updated_at), 'MMM dd, yyyy') : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  data-testid={`button-actions-${wallet.user_id}`}
                                >
                                  <Settings className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => handleAdjustBalance(wallet)}
                                  data-testid={`button-adjust-balance-${wallet.user_id}`}
                                >
                                  <DollarSign className="w-4 h-4 mr-2" />
                                  Adjust Balance
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleExportCSV(wallet)}
                                  data-testid={`button-export-csv-${wallet.user_id}`}
                                >
                                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                                  Export CSV
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleExportPDF(wallet)}
                                  data-testid={`button-export-pdf-${wallet.user_id}`}
                                >
                                  <Download className="w-4 h-4 mr-2" />
                                  Export PDF
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                        
                        {/* Expandable Transaction Details */}
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={8} className="bg-muted/30 p-0">
                              <div className="p-4 space-y-3">
                                <h4 className="font-semibold text-sm flex items-center gap-2">
                                  <Activity className="w-4 h-4" />
                                  Transaction History ({transactions.length} transactions)
                                </h4>
                                
                                {transactions.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">No transactions recorded</p>
                                ) : (
                                  <div className="space-y-2 max-h-96 overflow-y-auto">
                                    {transactions.map((tx: any) => (
                                      <div 
                                        key={tx.id} 
                                        className="flex items-start justify-between p-3 bg-background rounded-lg border"
                                      >
                                        <div className="flex-1 space-y-1">
                                          <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="capitalize">
                                              {tx.type.replace(/_/g, ' ')}
                                            </Badge>
                                            {tx.mmp_site_entries && (
                                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <MapPin className="w-3 h-3" />
                                                <span>{tx.mmp_site_entries.site_name} - {tx.mmp_site_entries.locality}, {tx.mmp_site_entries.state}</span>
                                              </div>
                                            )}
                                          </div>
                                          <p className="text-sm text-muted-foreground">
                                            {tx.description || 'No description'}
                                          </p>
                                          {tx.mmp_site_entries?.completed_at && (
                                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                              <Calendar className="w-3 h-3" />
                                              <span>{format(new Date(tx.mmp_site_entries.completed_at), 'MMM dd, yyyy')}</span>
                                            </div>
                                          )}
                                          <p className="text-xs text-muted-foreground">
                                            {format(new Date(tx.created_at), 'MMM dd, yyyy HH:mm')}
                                          </p>
                                        </div>
                                        <div className="text-right">
                                          <p className={`text-lg font-bold ${tx.amount > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                            {tx.amount > 0 ? '+' : ''}{fmt(Number(tx.amount) * 100, tx.currency || currency)}
                                          </p>
                                          <p className="text-xs text-muted-foreground">
                                            Balance: {fmt((Number(tx.balance_after) || 0) * 100, tx.currency || currency)}
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            
            {/* Summary Footer */}
            <div className="mt-4 p-4 bg-muted/50 rounded-lg border border-blue-500/20">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">Total Wallets</p>
                  <p className="text-xl font-bold">{filtered.length}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Total Balance</p>
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">
                    {fmt(filtered.reduce((a,b)=>a+getBalance(b, currency),0), currency)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Total Earned</p>
                  <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                    {fmt(filtered.reduce((a,b)=>a+(Number(b.totalEarned)||0)*100,0), currency)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Total Withdrawn</p>
                  <p className="text-xl font-bold text-purple-600 dark:text-purple-400">
                    {fmt(filtered.reduce((a,b)=>a+(Number(b.totalWithdrawn)||0)*100,0), currency)}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(wallet => (
            <WalletCard
              key={wallet.id}
              wallet={{
                id: wallet.id,
                userId: wallet.user_id,
                userName: wallet.owner_name || wallet.profiles?.full_name || wallet.profiles?.username,
                userEmail: wallet.profiles?.email,
                balances: wallet.balances || {},
                totalEarned: wallet.total_earned,
                totalWithdrawn: wallet.total_withdrawn,
                updatedAt: wallet.updated_at,
                pendingPayouts: (Number(wallet.total_earned)||0) - (Number(wallet.total_withdrawn)||0) - (wallet.balances?.[currency] || 0),
              }}
              currency={currency}
              onClick={(userId) => navigate(`/admin/wallets/${userId}`)}
            />
          ))}
        </div>
      )}

      {/* Balance Adjustment Dialog */}
      <BalanceAdjustmentDialog
        open={adjustmentDialog.open}
        onOpenChange={(open) => setAdjustmentDialog({ ...adjustmentDialog, open })}
        userId={adjustmentDialog.userId}
        userName={adjustmentDialog.userName}
        currentBalance={adjustmentDialog.currentBalance}
        currency={currency}
        onSuccess={() => load()}
      />
    </div>
  );
};

export default AdminWallets;
