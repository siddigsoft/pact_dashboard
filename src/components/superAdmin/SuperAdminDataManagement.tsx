import { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { useUser } from '@/context/user/UserContext';
import { supabase } from '@/integrations/supabase/client';
import { 
  Shield, 
  RotateCcw, 
  Trash2, 
  Wallet, 
  MapPin, 
  AlertTriangle, 
  Search,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Users,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Activity,
  Download,
  Filter,
  Calendar,
  Eye,
  Archive
} from 'lucide-react';
import { format } from 'date-fns';

interface SiteVisitData {
  id: string;
  site_name: string;
  site_code: string;
  status: string;
  accepted_by: string;
  accepted_by_name?: string;
  visit_completed_by?: string;
  completed_by_name?: string;
  visit_completed_at?: string;
  enumerator_fee?: number;
  state?: string;
  locality?: string;
}

interface ClaimedSiteData {
  id: string;
  site_name: string;
  site_code: string;
  state: string;
  locality: string;
  status: string;
  accepted_by: string;
  accepted_by_name?: string;
  accepted_at?: string;
  enumerator_fee?: number;
  transport_fee?: number;
}

interface WalletData {
  id: string;
  user_id: string;
  user_name?: string;
  balances: Record<string, number>;
  total_earned: number;
  total_withdrawn: number;
  transaction_count?: number;
}

interface TransactionData {
  id: string;
  wallet_id: string;
  user_id: string;
  user_name?: string;
  type: string;
  amount: number;
  currency: string;
  description?: string;
  site_visit_id?: string;
  created_at: string;
}

interface MMPData {
  id: string;
  name: string;
  month: string;
  year: number;
  status: string;
  project_name?: string;
  total_sites?: number;
  dispatched_sites?: number;
  completed_sites?: number;
  created_at: string;
}

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: any;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  color?: 'primary' | 'success' | 'warning' | 'danger';
}

function StatsCard({ title, value, subtitle, icon: Icon, trend, trendValue, color = 'primary' }: StatsCardProps) {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-green-500/10 text-green-600 dark:text-green-400',
    warning: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
    danger: 'bg-red-500/10 text-red-600 dark:text-red-400',
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold">{value}</p>
            {subtitle && (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            )}
            {trend && trendValue && (
              <div className="flex items-center gap-1">
                {trend === 'up' ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : trend === 'down' ? (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                ) : (
                  <Activity className="h-4 w-4 text-muted-foreground" />
                )}
                <span className={`text-sm ${trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-muted-foreground'}`}>
                  {trendValue}
                </span>
              </div>
            )}
          </div>
          <div className={`p-3 rounded-full ${colorClasses[color]}`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function SuperAdminDataManagement() {
  const { currentUser, users } = useUser();
  const { isSuperAdmin, resetSiteVisit, deleteWalletTransaction, resetWallet, reclaimSite } = useSuperAdmin();

  const [activeTab, setActiveTab] = useState('site-visits');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [siteVisits, setSiteVisits] = useState<SiteVisitData[]>([]);
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [claimedSites, setClaimedSites] = useState<ClaimedSiteData[]>([]);
  const [mmps, setMMPs] = useState<MMPData[]>([]);

  const [selectedSiteVisit, setSelectedSiteVisit] = useState<SiteVisitData | null>(null);
  const [selectedClaimedSite, setSelectedClaimedSite] = useState<ClaimedSiteData | null>(null);
  const [showReclaimSiteDialog, setShowReclaimSiteDialog] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<WalletData | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionData | null>(null);
  const [selectedMMP, setSelectedMMP] = useState<MMPData | null>(null);

  const [showResetSiteVisitDialog, setShowResetSiteVisitDialog] = useState(false);
  const [showResetWalletDialog, setShowResetWalletDialog] = useState(false);
  const [showDeleteTransactionDialog, setShowDeleteTransactionDialog] = useState(false);
  const [showArchiveMMPDialog, setShowArchiveMMPDialog] = useState(false);

  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const loadSiteVisits = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('mmp_site_entries')
        .select('id, site_name, site_code, status, accepted_by, visit_completed_at, visit_completed_by, enumerator_fee, state, locality')
        .in('status', ['completed', 'verified'])
        .order('visit_completed_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      const enriched = (data || []).map(sv => {
        const collector = users.find(u => u.id === sv.accepted_by);
        const completedBy = users.find(u => u.id === sv.visit_completed_by);
        return {
          ...sv,
          accepted_by_name: collector?.name || 'Unknown',
          completed_by_name: completedBy?.name || 'N/A',
        };
      });

      setSiteVisits(enriched);
    } catch (error) {
      console.error('Failed to load site visits:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadWallets = async () => {
    setLoading(true);
    try {
      const { data: walletsData, error: walletsError } = await supabase
        .from('wallets')
        .select('*')
        .order('updated_at', { ascending: false });

      if (walletsError) throw walletsError;

      const { data: txnCounts } = await supabase
        .from('wallet_transactions')
        .select('wallet_id');

      const countMap: Record<string, number> = {};
      (txnCounts || []).forEach((t: any) => {
        countMap[t.wallet_id] = (countMap[t.wallet_id] || 0) + 1;
      });

      const enriched = (walletsData || []).map(w => {
        const user = users.find(u => u.id === w.user_id);
        return {
          id: w.id,
          user_id: w.user_id,
          user_name: user?.name || 'Unknown',
          balances: w.balances || {},
          total_earned: parseFloat(w.total_earned) || 0,
          total_withdrawn: parseFloat(w.total_withdrawn) || 0,
          transaction_count: countMap[w.id] || 0,
        };
      });

      setWallets(enriched);
    } catch (error) {
      console.error('Failed to load wallets:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);

      if (error) throw error;

      const enriched = (data || []).map(t => {
        const user = users.find(u => u.id === t.user_id);
        return {
          id: t.id,
          wallet_id: t.wallet_id,
          user_id: t.user_id,
          user_name: user?.name || 'Unknown',
          type: t.type,
          amount: parseFloat(t.amount),
          currency: t.currency,
          description: t.description,
          site_visit_id: t.site_visit_id,
          created_at: t.created_at,
        };
      });

      setTransactions(enriched);
    } catch (error) {
      console.error('Failed to load transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadClaimedSites = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('mmp_site_entries')
        .select('id, site_name, site_code, state, locality, status, accepted_by, accepted_at, enumerator_fee, transport_fee')
        .not('accepted_by', 'is', null)
        .order('accepted_at', { ascending: false })
        .limit(300);

      if (error) throw error;

      const enriched = (data || []).map(site => {
        const collector = users.find(u => u.id === site.accepted_by);
        return {
          ...site,
          accepted_by_name: collector?.name || 'Unknown',
        };
      });

      setClaimedSites(enriched);
    } catch (error) {
      console.error('Failed to load claimed sites:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMMPs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('mmp_files')
        .select(`
          id,
          name,
          month,
          year,
          status,
          project_id,
          created_at,
          projects(name)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const { data: siteCounts } = await supabase
        .from('mmp_site_entries')
        .select('mmp_id, status');

      const mmpStats: Record<string, { total: number; dispatched: number; completed: number }> = {};
      (siteCounts || []).forEach((s: any) => {
        if (!mmpStats[s.mmp_id]) {
          mmpStats[s.mmp_id] = { total: 0, dispatched: 0, completed: 0 };
        }
        mmpStats[s.mmp_id].total++;
        if (s.status === 'dispatched' || s.status === 'assigned') mmpStats[s.mmp_id].dispatched++;
        if (s.status === 'completed' || s.status === 'verified') mmpStats[s.mmp_id].completed++;
      });

      const enriched = (data || []).map((m: any) => ({
        id: m.id,
        name: m.name,
        month: m.month,
        year: m.year,
        status: m.status,
        project_name: m.projects?.name || 'Unknown',
        total_sites: mmpStats[m.id]?.total || 0,
        dispatched_sites: mmpStats[m.id]?.dispatched || 0,
        completed_sites: mmpStats[m.id]?.completed || 0,
        created_at: m.created_at,
      }));

      setMMPs(enriched);
    } catch (error) {
      console.error('Failed to load MMPs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      if (activeTab === 'site-visits') loadSiteVisits();
      else if (activeTab === 'wallets') loadWallets();
      else if (activeTab === 'transactions') loadTransactions();
      else if (activeTab === 'claimed-sites') loadClaimedSites();
      else if (activeTab === 'mmps') loadMMPs();
    }
  }, [activeTab, isSuperAdmin, users]);

  const handleResetSiteVisit = async () => {
    if (!selectedSiteVisit || !currentUser || !reason.trim()) return;

    setProcessing(true);
    const success = await resetSiteVisit({
      siteVisitId: selectedSiteVisit.id,
      reason: reason.trim(),
      deletedBy: currentUser.id,
      deletedByName: currentUser.name || currentUser.email || 'Super Admin',
      deletedByRole: currentUser.role || 'superadmin',
    });

    setProcessing(false);
    if (success) {
      setShowResetSiteVisitDialog(false);
      setSelectedSiteVisit(null);
      setReason('');
      loadSiteVisits();
    }
  };

  const handleResetWallet = async () => {
    if (!selectedWallet || !currentUser || !reason.trim()) return;

    setProcessing(true);
    const success = await resetWallet({
      userId: selectedWallet.user_id,
      walletId: selectedWallet.id,
      reason: reason.trim(),
      deletedBy: currentUser.id,
      deletedByName: currentUser.name || currentUser.email || 'Super Admin',
      deletedByRole: currentUser.role || 'superadmin',
    });

    setProcessing(false);
    if (success) {
      setShowResetWalletDialog(false);
      setSelectedWallet(null);
      setReason('');
      loadWallets();
    }
  };

  const handleDeleteTransaction = async () => {
    if (!selectedTransaction || !currentUser || !reason.trim()) return;

    setProcessing(true);
    const success = await deleteWalletTransaction({
      transactionId: selectedTransaction.id,
      reason: reason.trim(),
      deletedBy: currentUser.id,
      deletedByName: currentUser.name || currentUser.email || 'Super Admin',
      deletedByRole: currentUser.role || 'superadmin',
    });

    setProcessing(false);
    if (success) {
      setShowDeleteTransactionDialog(false);
      setSelectedTransaction(null);
      setReason('');
      loadTransactions();
    }
  };

  const handleReclaimSite = async () => {
    if (!selectedClaimedSite || !currentUser || !reason.trim()) return;

    setProcessing(true);
    const success = await reclaimSite({
      siteEntryId: selectedClaimedSite.id,
      reason: reason.trim(),
      reclaimedBy: currentUser.id,
      reclaimedByName: currentUser.name || currentUser.email || 'Super Admin',
      reclaimedByRole: currentUser.role || 'superadmin',
    });

    setProcessing(false);
    if (success) {
      setShowReclaimSiteDialog(false);
      setSelectedClaimedSite(null);
      setReason('');
      loadClaimedSites();
    }
  };

  const handleArchiveMMP = async () => {
    if (!selectedMMP || !currentUser || !reason.trim()) return;

    setProcessing(true);
    try {
      const { error } = await supabase
        .from('mmp_files')
        .update({ status: 'archived' })
        .eq('id', selectedMMP.id);

      if (error) throw error;

      setShowArchiveMMPDialog(false);
      setSelectedMMP(null);
      setReason('');
      loadMMPs();
    } catch (error) {
      console.error('Failed to archive MMP:', error);
    } finally {
      setProcessing(false);
    }
  };

  const openResetSiteVisitDialog = (sv: SiteVisitData) => {
    setSelectedSiteVisit(sv);
    setReason('');
    setShowResetSiteVisitDialog(true);
  };

  const openResetWalletDialog = (w: WalletData) => {
    setSelectedWallet(w);
    setReason('');
    setShowResetWalletDialog(true);
  };

  const openDeleteTransactionDialog = (t: TransactionData) => {
    setSelectedTransaction(t);
    setReason('');
    setShowDeleteTransactionDialog(true);
  };

  const openReclaimSiteDialog = (site: ClaimedSiteData) => {
    setSelectedClaimedSite(site);
    setReason('');
    setShowReclaimSiteDialog(true);
  };

  const openArchiveMMPDialog = (mmp: MMPData) => {
    setSelectedMMP(mmp);
    setReason('');
    setShowArchiveMMPDialog(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return <Badge className="gap-1 bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle className="h-3 w-3" /> Completed</Badge>;
      case 'verified':
        return <Badge className="gap-1 bg-blue-500/10 text-blue-600 border-blue-500/20"><CheckCircle className="h-3 w-3" /> Verified</Badge>;
      case 'assigned':
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Assigned</Badge>;
      case 'dispatched':
        return <Badge className="gap-1 bg-yellow-500/10 text-yellow-600 border-yellow-500/20"><Activity className="h-3 w-3" /> Dispatched</Badge>;
      case 'pending':
        return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
      case 'archived':
        return <Badge variant="outline" className="gap-1 bg-gray-500/10"><Archive className="h-3 w-3" /> Archived</Badge>;
      case 'active':
        return <Badge className="gap-1 bg-green-500/10 text-green-600 border-green-500/20"><Activity className="h-3 w-3" /> Active</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const stats = useMemo(() => {
    const totalSiteVisits = siteVisits.length;
    const completedVisits = siteVisits.filter(sv => sv.status === 'completed').length;
    const verifiedVisits = siteVisits.filter(sv => sv.status === 'verified').length;
    
    const totalWallets = wallets.length;
    const totalBalance = wallets.reduce((sum, w) => sum + Object.values(w.balances).reduce((a, b) => a + b, 0), 0);
    const totalEarned = wallets.reduce((sum, w) => sum + w.total_earned, 0);
    
    const totalTransactions = transactions.length;
    const creditTransactions = transactions.filter(t => t.amount > 0).length;
    const debitTransactions = transactions.filter(t => t.amount < 0).length;
    
    const totalClaimedSites = claimedSites.length;
    const assignedSites = claimedSites.filter(s => s.status === 'assigned').length;
    
    const totalMMPs = mmps.length;
    const activeMMPs = mmps.filter(m => m.status === 'active').length;
    
    return {
      totalSiteVisits,
      completedVisits,
      verifiedVisits,
      totalWallets,
      totalBalance,
      totalEarned,
      totalTransactions,
      creditTransactions,
      debitTransactions,
      totalClaimedSites,
      assignedSites,
      totalMMPs,
      activeMMPs,
    };
  }, [siteVisits, wallets, transactions, claimedSites, mmps]);

  const filteredSiteVisits = useMemo(() => {
    return siteVisits.filter(sv => {
      const matchesSearch = 
        sv.site_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sv.site_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sv.accepted_by_name?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || sv.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [siteVisits, searchQuery, statusFilter]);

  const filteredWallets = useMemo(() => {
    return wallets.filter(w => {
      const matchesSearch = w.user_name?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = statusFilter === 'all' || 
        (statusFilter === 'has-balance' && Object.values(w.balances).some(b => b > 0)) ||
        (statusFilter === 'no-balance' && Object.values(w.balances).every(b => b <= 0));
      return matchesSearch && matchesFilter;
    });
  }, [wallets, searchQuery, statusFilter]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchesSearch = 
        t.user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.type?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesType = statusFilter === 'all' || t.type === statusFilter;
      
      return matchesSearch && matchesType;
    });
  }, [transactions, searchQuery, statusFilter]);

  const filteredClaimedSites = useMemo(() => {
    return claimedSites.filter(site => {
      const matchesSearch = 
        site.site_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        site.site_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        site.accepted_by_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        site.state?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        site.locality?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || site.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [claimedSites, searchQuery, statusFilter]);

  const filteredMMPs = useMemo(() => {
    return mmps.filter(mmp => {
      const matchesSearch = 
        mmp.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        mmp.project_name?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || mmp.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [mmps, searchQuery, statusFilter]);

  const getFilterOptions = () => {
    switch (activeTab) {
      case 'site-visits':
        return [
          { value: 'all', label: 'All Statuses' },
          { value: 'completed', label: 'Completed' },
          { value: 'verified', label: 'Verified' },
        ];
      case 'wallets':
        return [
          { value: 'all', label: 'All Wallets' },
          { value: 'has-balance', label: 'Has Balance' },
          { value: 'no-balance', label: 'No Balance' },
        ];
      case 'transactions':
        return [
          { value: 'all', label: 'All Types' },
          { value: 'credit', label: 'Credits' },
          { value: 'debit', label: 'Debits' },
          { value: 'withdrawal', label: 'Withdrawals' },
        ];
      case 'claimed-sites':
        return [
          { value: 'all', label: 'All Statuses' },
          { value: 'assigned', label: 'Assigned' },
          { value: 'dispatched', label: 'Dispatched' },
          { value: 'completed', label: 'Completed' },
        ];
      case 'mmps':
        return [
          { value: 'all', label: 'All Statuses' },
          { value: 'active', label: 'Active' },
          { value: 'approved', label: 'Approved' },
          { value: 'archived', label: 'Archived' },
        ];
      default:
        return [];
    }
  };

  const refreshCurrentTab = () => {
    if (activeTab === 'site-visits') loadSiteVisits();
    else if (activeTab === 'wallets') loadWallets();
    else if (activeTab === 'transactions') loadTransactions();
    else if (activeTab === 'claimed-sites') loadClaimedSites();
    else if (activeTab === 'mmps') loadMMPs();
  };

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center space-y-4">
            <Shield className="h-16 w-16 text-destructive mx-auto" />
            <h2 className="text-2xl font-bold">Access Denied</h2>
            <p className="text-muted-foreground">
              Only super-admins can access this page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6" data-testid="page-super-admin-data-management">
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            Data Management Center
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Comprehensive data management for site visits, wallets, transactions, claimed sites, and MMPs. 
            All actions are logged and audited for compliance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" data-testid="button-export">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      <Card className="border-yellow-300/50 dark:border-yellow-900/50 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-950/20 dark:to-orange-950/20">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <div className="p-2 rounded-full bg-yellow-500/10">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
            </div>
            <div>
              <p className="font-semibold text-yellow-800 dark:text-yellow-200">
                Administrative Actions Dashboard
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                All modifications are permanently logged in the audit trail. Affected users receive automatic notifications.
                Deleted data remains accessible in the deletion audit log for compliance review.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Completed Site Visits"
          value={stats.totalSiteVisits}
          subtitle={`${stats.verifiedVisits} verified`}
          icon={MapPin}
          color="success"
        />
        <StatsCard
          title="Active Wallets"
          value={stats.totalWallets}
          subtitle={`${stats.totalEarned.toLocaleString()} SDG earned`}
          icon={Wallet}
          color="primary"
        />
        <StatsCard
          title="Total Transactions"
          value={stats.totalTransactions}
          subtitle={`${stats.creditTransactions} credits, ${stats.debitTransactions} debits`}
          icon={DollarSign}
          color="warning"
        />
        <StatsCard
          title="Claimed Sites"
          value={stats.totalClaimedSites}
          subtitle={`${stats.assignedSites} actively assigned`}
          icon={Users}
          color="danger"
        />
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[250px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, code, or user..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>
        
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            {getFilterOptions().map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          onClick={refreshCurrentTab}
          disabled={loading}
          data-testid="button-refresh"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); setStatusFilter('all'); }}>
        <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
          <TabsTrigger value="site-visits" className="gap-2" data-testid="tab-site-visits">
            <MapPin className="h-4 w-4" />
            <span className="hidden sm:inline">Site Visits</span>
            <Badge variant="secondary" className="ml-1 hidden lg:inline-flex">{filteredSiteVisits.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="wallets" className="gap-2" data-testid="tab-wallets">
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">Wallets</span>
            <Badge variant="secondary" className="ml-1 hidden lg:inline-flex">{filteredWallets.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="transactions" className="gap-2" data-testid="tab-transactions">
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Transactions</span>
            <Badge variant="secondary" className="ml-1 hidden lg:inline-flex">{filteredTransactions.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="claimed-sites" className="gap-2" data-testid="tab-claimed-sites">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Claimed Sites</span>
            <Badge variant="secondary" className="ml-1 hidden lg:inline-flex">{filteredClaimedSites.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="mmps" className="gap-2" data-testid="tab-mmps">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">MMPs</span>
            <Badge variant="secondary" className="ml-1 hidden lg:inline-flex">{filteredMMPs.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="site-visits" className="mt-6">
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-green-600" />
                    Completed Site Visits
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Reset completed visits back to assigned status. This removes associated earnings.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-lg px-3 py-1">
                  {filteredSiteVisits.length} records
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredSiteVisits.length === 0 ? (
                <div className="text-center py-16">
                  <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No completed site visits found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">Site</TableHead>
                        <TableHead className="font-semibold">Location</TableHead>
                        <TableHead className="font-semibold">Data Collector</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="font-semibold">Completed</TableHead>
                        <TableHead className="font-semibold">Fee</TableHead>
                        <TableHead className="text-right font-semibold">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSiteVisits.slice(0, 50).map((sv) => (
                        <TableRow key={sv.id} className="hover:bg-muted/30">
                          <TableCell>
                            <div>
                              <p className="font-medium">{sv.site_name}</p>
                              <p className="text-sm text-muted-foreground">{sv.site_code}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{sv.state || '—'}</div>
                              <div className="text-muted-foreground">{sv.locality || '—'}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <Users className="h-4 w-4 text-primary" />
                              </div>
                              <span>{sv.accepted_by_name}</span>
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(sv.status)}</TableCell>
                          <TableCell>
                            {sv.visit_completed_at 
                              ? format(new Date(sv.visit_completed_at), 'MMM d, yyyy')
                              : 'N/A'}
                          </TableCell>
                          <TableCell className="font-medium">
                            {sv.enumerator_fee ? `${sv.enumerator_fee.toLocaleString()} SDG` : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => openResetSiteVisitDialog(sv)}
                              data-testid={`button-reset-site-visit-${sv.id}`}
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Reset
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {filteredSiteVisits.length > 50 && (
                    <div className="text-center py-4 text-sm text-muted-foreground border-t">
                      Showing 50 of {filteredSiteVisits.length} results. Use search to find specific records.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wallets" className="mt-6">
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-blue-600" />
                    User Wallets
                  </CardTitle>
                  <CardDescription className="mt-1">
                    View and reset user wallet balances. Reset removes all transactions.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-lg px-3 py-1">
                  {filteredWallets.length} wallets
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredWallets.length === 0 ? (
                <div className="text-center py-16">
                  <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No wallets found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">User</TableHead>
                        <TableHead className="font-semibold">Current Balance</TableHead>
                        <TableHead className="font-semibold">Total Earned</TableHead>
                        <TableHead className="font-semibold">Withdrawn</TableHead>
                        <TableHead className="font-semibold">Transactions</TableHead>
                        <TableHead className="text-right font-semibold">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredWallets.map((w) => (
                        <TableRow key={w.id} className="hover:bg-muted/30">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                                <Users className="h-4 w-4 text-blue-600" />
                              </div>
                              <span className="font-medium">{w.user_name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {Object.entries(w.balances).map(([currency, amount]) => (
                              <div key={currency} className="font-medium text-green-600">
                                {Number(amount).toLocaleString()} {currency}
                              </div>
                            ))}
                            {Object.keys(w.balances).length === 0 && <span className="text-muted-foreground">0</span>}
                          </TableCell>
                          <TableCell className="font-medium">{w.total_earned.toLocaleString()} SDG</TableCell>
                          <TableCell className="text-red-600">{w.total_withdrawn.toLocaleString()} SDG</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{w.transaction_count}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => openResetWalletDialog(w)}
                              disabled={(w.transaction_count || 0) === 0}
                              data-testid={`button-reset-wallet-${w.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Reset
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="mt-6">
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-yellow-600" />
                    Wallet Transactions
                  </CardTitle>
                  <CardDescription className="mt-1">
                    View and delete individual transactions. Wallet balances are adjusted automatically.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-lg px-3 py-1">
                  {filteredTransactions.length} transactions
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="text-center py-16">
                  <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No transactions found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">User</TableHead>
                        <TableHead className="font-semibold">Type</TableHead>
                        <TableHead className="font-semibold">Amount</TableHead>
                        <TableHead className="font-semibold">Description</TableHead>
                        <TableHead className="font-semibold">Date</TableHead>
                        <TableHead className="text-right font-semibold">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTransactions.slice(0, 50).map((t) => (
                        <TableRow key={t.id} className="hover:bg-muted/30">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-yellow-500/10 flex items-center justify-center">
                                <Users className="h-4 w-4 text-yellow-600" />
                              </div>
                              <span className="font-medium">{t.user_name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">{t.type}</Badge>
                          </TableCell>
                          <TableCell>
                            <span className={`font-bold ${t.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {t.amount >= 0 ? '+' : ''}{t.amount.toLocaleString()} {t.currency}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-muted-foreground">
                            {t.description || '—'}
                          </TableCell>
                          <TableCell>{format(new Date(t.created_at), 'MMM d, yyyy HH:mm')}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => openDeleteTransactionDialog(t)}
                              data-testid={`button-delete-transaction-${t.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Delete
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {filteredTransactions.length > 50 && (
                    <div className="text-center py-4 text-sm text-muted-foreground border-t">
                      Showing 50 of {filteredTransactions.length} results. Use search to find specific records.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="claimed-sites" className="mt-6">
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-red-600" />
                    Claimed Sites
                  </CardTitle>
                  <CardDescription className="mt-1">
                    View all sites claimed by data collectors. Reclaim sites to release them back to the dispatch pool.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-lg px-3 py-1">
                  {filteredClaimedSites.length} sites
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredClaimedSites.length === 0 ? (
                <div className="text-center py-16">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No claimed sites found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">Site</TableHead>
                        <TableHead className="font-semibold">Location</TableHead>
                        <TableHead className="font-semibold">Claimed By</TableHead>
                        <TableHead className="font-semibold">Claimed At</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="font-semibold">Fees</TableHead>
                        <TableHead className="text-right font-semibold">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredClaimedSites.slice(0, 50).map((site) => (
                        <TableRow key={site.id} className="hover:bg-muted/30" data-testid={`row-claimed-site-${site.id}`}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{site.site_name}</p>
                              <p className="text-sm text-muted-foreground">{site.site_code}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{site.state || '—'}</div>
                              <div className="text-muted-foreground">{site.locality || '—'}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-red-500/10 flex items-center justify-center">
                                <Users className="h-4 w-4 text-red-600" />
                              </div>
                              <span>{site.accepted_by_name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {site.accepted_at ? format(new Date(site.accepted_at), 'MMM d, yyyy HH:mm') : '—'}
                          </TableCell>
                          <TableCell>{getStatusBadge(site.status)}</TableCell>
                          <TableCell>
                            <div className="text-sm space-y-1">
                              <div className="flex items-center gap-1">
                                <span className="text-muted-foreground">Enum:</span>
                                <span className="font-medium">{site.enumerator_fee?.toLocaleString() || '—'} SDG</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-muted-foreground">Trans:</span>
                                <span className="font-medium">{site.transport_fee?.toLocaleString() || '—'} SDG</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => openReclaimSiteDialog(site)}
                              data-testid={`button-reclaim-${site.id}`}
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Reclaim
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {filteredClaimedSites.length > 50 && (
                    <div className="text-center py-4 text-sm text-muted-foreground border-t">
                      Showing 50 of {filteredClaimedSites.length} results. Use search to find specific records.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mmps" className="mt-6">
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-purple-600" />
                    Monthly Monitoring Plans
                  </CardTitle>
                  <CardDescription className="mt-1">
                    View and archive MMP files. Archived MMPs are hidden from regular views.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-lg px-3 py-1">
                  {filteredMMPs.length} MMPs
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredMMPs.length === 0 ? (
                <div className="text-center py-16">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No MMPs found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">MMP Name</TableHead>
                        <TableHead className="font-semibold">Project</TableHead>
                        <TableHead className="font-semibold">Period</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="font-semibold">Sites</TableHead>
                        <TableHead className="font-semibold">Progress</TableHead>
                        <TableHead className="text-right font-semibold">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMMPs.map((mmp) => (
                        <TableRow key={mmp.id} className="hover:bg-muted/30">
                          <TableCell>
                            <div>
                              <p className="font-medium">{mmp.name}</p>
                              <p className="text-sm text-muted-foreground">
                                Created {format(new Date(mmp.created_at), 'MMM d, yyyy')}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>{mmp.project_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="gap-1">
                              <Calendar className="h-3 w-3" />
                              {mmp.month} {mmp.year}
                            </Badge>
                          </TableCell>
                          <TableCell>{getStatusBadge(mmp.status)}</TableCell>
                          <TableCell>
                            <div className="text-sm space-y-1">
                              <div>Total: <span className="font-medium">{mmp.total_sites}</span></div>
                              <div className="text-muted-foreground">
                                {mmp.dispatched_sites} dispatched, {mmp.completed_sites} completed
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="w-full bg-muted rounded-full h-2">
                              <div 
                                className="bg-green-500 h-2 rounded-full" 
                                style={{ width: `${mmp.total_sites ? (mmp.completed_sites! / mmp.total_sites) * 100 : 0}%` }}
                              />
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {mmp.total_sites ? Math.round((mmp.completed_sites! / mmp.total_sites) * 100) : 0}% complete
                            </p>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                data-testid={`button-view-mmp-${mmp.id}`}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                View
                              </Button>
                              {mmp.status !== 'archived' && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => openArchiveMMPDialog(mmp)}
                                  data-testid={`button-archive-mmp-${mmp.id}`}
                                >
                                  <Archive className="h-4 w-4 mr-1" />
                                  Archive
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showReclaimSiteDialog} onOpenChange={setShowReclaimSiteDialog}>
        <DialogContent className="max-w-md" data-testid="dialog-reclaim-site">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-destructive" />
              Reclaim Site
            </DialogTitle>
            <DialogDescription>
              Release this site back to the dispatch pool for other collectors.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-destructive/5 border border-destructive/20 p-4 rounded-lg">
              <p className="font-semibold">{selectedClaimedSite?.site_name}</p>
              <p className="text-sm text-muted-foreground">{selectedClaimedSite?.site_code}</p>
              <div className="mt-2 pt-2 border-t border-destructive/10">
                <p className="text-sm">
                  <span className="text-muted-foreground">Claimed by:</span> {selectedClaimedSite?.accepted_by_name}
                </p>
                {selectedClaimedSite?.accepted_at && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Since:</span> {format(new Date(selectedClaimedSite.accepted_at), 'MMM d, yyyy HH:mm')}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reclaim-reason">Reason for Reclaim <span className="text-destructive">*</span></Label>
              <Textarea
                id="reclaim-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this site is being reclaimed..."
                rows={3}
                data-testid="textarea-reclaim-reason"
              />
            </div>

            <div className="bg-muted/50 p-3 rounded-lg">
              <p className="text-sm font-medium mb-2">This action will:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-green-500" /> Release site to dispatch pool</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-green-500" /> Notify the former assignee</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-green-500" /> Log action for audit</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReclaimSiteDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReclaimSite}
              disabled={processing || !reason.trim()}
              data-testid="button-confirm-reclaim"
            >
              {processing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              {processing ? 'Reclaiming...' : 'Reclaim Site'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showResetSiteVisitDialog} onOpenChange={setShowResetSiteVisitDialog}>
        <DialogContent className="max-w-md" data-testid="dialog-reset-site-visit">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-destructive" />
              Reset Site Visit
            </DialogTitle>
            <DialogDescription>
              Reset this completed visit back to assigned status.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-destructive/5 border border-destructive/20 p-4 rounded-lg">
              <p className="font-semibold">{selectedSiteVisit?.site_name}</p>
              <p className="text-sm text-muted-foreground">{selectedSiteVisit?.site_code}</p>
              <div className="mt-2 pt-2 border-t border-destructive/10">
                <p className="text-sm">
                  <span className="text-muted-foreground">Collector:</span> {selectedSiteVisit?.accepted_by_name}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reset-reason">Reason for Reset <span className="text-destructive">*</span></Label>
              <Textarea
                id="reset-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this visit is being reset..."
                rows={3}
                data-testid="textarea-reset-reason"
              />
            </div>

            <div className="bg-muted/50 p-3 rounded-lg">
              <p className="text-sm font-medium mb-2">This action will:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-center gap-2"><XCircle className="h-3 w-3 text-red-500" /> Change status to "assigned"</li>
                <li className="flex items-center gap-2"><XCircle className="h-3 w-3 text-red-500" /> Delete associated wallet transaction</li>
                <li className="flex items-center gap-2"><XCircle className="h-3 w-3 text-red-500" /> Adjust wallet balance</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-green-500" /> Notify collector and supervisor</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetSiteVisitDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleResetSiteVisit}
              disabled={processing || !reason.trim()}
              data-testid="button-confirm-reset"
            >
              {processing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              {processing ? 'Resetting...' : 'Reset Visit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showResetWalletDialog} onOpenChange={setShowResetWalletDialog}>
        <DialogContent className="max-w-md" data-testid="dialog-reset-wallet">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Reset Wallet
            </DialogTitle>
            <DialogDescription>
              Delete all transactions and reset balance to zero.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-destructive/5 border border-destructive/20 p-4 rounded-lg">
              <p className="font-semibold">{selectedWallet?.user_name}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Transactions:</span>
                  <span className="ml-1 font-medium">{selectedWallet?.transaction_count}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Earned:</span>
                  <span className="ml-1 font-medium">{selectedWallet?.total_earned.toLocaleString()} SDG</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="wallet-reset-reason">Reason for Reset <span className="text-destructive">*</span></Label>
              <Textarea
                id="wallet-reset-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this wallet is being reset..."
                rows={3}
                data-testid="textarea-wallet-reset-reason"
              />
            </div>

            <div className="bg-muted/50 p-3 rounded-lg">
              <p className="text-sm font-medium mb-2">This action will:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-center gap-2"><XCircle className="h-3 w-3 text-red-500" /> Delete all transactions</li>
                <li className="flex items-center gap-2"><XCircle className="h-3 w-3 text-red-500" /> Reset balance to zero</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-green-500" /> Notify the user</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-green-500" /> Log for audit</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetWalletDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleResetWallet}
              disabled={processing || !reason.trim()}
              data-testid="button-confirm-wallet-reset"
            >
              {processing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              {processing ? 'Resetting...' : 'Reset Wallet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteTransactionDialog} onOpenChange={setShowDeleteTransactionDialog}>
        <DialogContent className="max-w-md" data-testid="dialog-delete-transaction">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Delete Transaction
            </DialogTitle>
            <DialogDescription>
              Remove this transaction and adjust the wallet balance.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-destructive/5 border border-destructive/20 p-4 rounded-lg">
              <p className="font-semibold">{selectedTransaction?.user_name}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Amount:</span>
                  <span className={`ml-1 font-medium ${selectedTransaction?.amount && selectedTransaction.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {selectedTransaction?.amount} {selectedTransaction?.currency}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Type:</span>
                  <span className="ml-1 font-medium capitalize">{selectedTransaction?.type}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="transaction-delete-reason">Reason for Deletion <span className="text-destructive">*</span></Label>
              <Textarea
                id="transaction-delete-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this transaction is being deleted..."
                rows={3}
                data-testid="textarea-transaction-delete-reason"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteTransactionDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteTransaction}
              disabled={processing || !reason.trim()}
              data-testid="button-confirm-transaction-delete"
            >
              {processing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              {processing ? 'Deleting...' : 'Delete Transaction'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showArchiveMMPDialog} onOpenChange={setShowArchiveMMPDialog}>
        <DialogContent className="max-w-md" data-testid="dialog-archive-mmp">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5 text-destructive" />
              Archive MMP
            </DialogTitle>
            <DialogDescription>
              Archive this MMP to hide it from regular views.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-destructive/5 border border-destructive/20 p-4 rounded-lg">
              <p className="font-semibold">{selectedMMP?.name}</p>
              <p className="text-sm text-muted-foreground">{selectedMMP?.project_name}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Period:</span>
                  <span className="ml-1 font-medium">{selectedMMP?.month} {selectedMMP?.year}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Sites:</span>
                  <span className="ml-1 font-medium">{selectedMMP?.total_sites}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="archive-reason">Reason for Archiving <span className="text-destructive">*</span></Label>
              <Textarea
                id="archive-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this MMP is being archived..."
                rows={3}
                data-testid="textarea-archive-reason"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowArchiveMMPDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleArchiveMMP}
              disabled={processing || !reason.trim()}
              data-testid="button-confirm-archive"
            >
              {processing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Archive className="h-4 w-4 mr-2" />}
              {processing ? 'Archiving...' : 'Archive MMP'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
