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
import { Search, RefreshCw, Wallet as WalletIcon, Zap, TrendingUp, Activity, DollarSign, Grid3x3, Table2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';

const fmt = (c: number, cur: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'NGN', currencyDisplay: 'narrowSymbol' }).format((c||0)/100);

const AdminWallets: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [currency, setCurrency] = useState('SDG');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const navigate = useNavigate();

  const load = async () => {
    const data = await adminListWallets();
    setRows(data || []);
    const c = data && data[0]?.balances ? Object.keys(data[0].balances)[0] : 'SDG';
    setCurrency(c);
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(wallet => {
                    const balance = (wallet.balances?.[currency] || 0);
                    const earned = Number(wallet.total_earned || 0);
                    const withdrawn = Number(wallet.total_withdrawn || 0);
                    const isActive = balance > 0 || earned > 0;
                    
                    // Calculate breakdown from transactions
                    const breakdown = wallet.breakdown || {};
                    const siteVisitFees = Number(breakdown.site_visit_fee || 0);
                    const retainerFees = Number(breakdown.retainer || 0);
                    const bonuses = Number(breakdown.bonus || 0);
                    const adjustments = Number(breakdown.adjustment || 0);
                    
                    return (
                      <TableRow 
                        key={wallet.id}
                        className="hover-elevate cursor-pointer"
                        onClick={() => navigate(`/admin/wallets/${wallet.user_id}`)}
                        data-testid={`wallet-row-${wallet.user_id}`}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
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
                            {retainerFees > 0 && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Retainer:</span>
                                <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
                                  {fmt(retainerFees * 100, currency)}
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
                      </TableRow>
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
    </div>
  );
};

export default AdminWallets;
