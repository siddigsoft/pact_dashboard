import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { MmpFilterBar } from '@/components/mmp/MmpFilterBar';
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
import { ensureValidSession } from '@/lib/session-health';
import { ReasonPickerDialog } from '@/components/audit/ReasonPickerDialog';
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
  Archive,
  Send,
  Undo2,
  Pencil,
  Check,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

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
  hub_office?: string;
  mmp_file_id?: string;
  mmp_name?: string;
}

interface ClaimedSiteData {
  id: string;
  site_name: string;
  site_code: string;
  state: string;
  locality: string;
  status: string;
  claimed_by?: string;
  accepted_by?: string;
  claimed_by_name?: string;
  accepted_by_name?: string;
  dispatched_at?: string;
  enumerator_fee?: number;
  transport_fee?: number;
  main_activity?: string;
  mmp_id?: string;
  mmp_name?: string;
}

interface DispatchedSiteData {
  id: string;
  site_name: string;
  site_code: string;
  state: string;
  locality: string;
  status: string;
  dispatched_by: string;
  dispatched_by_name?: string;
  dispatched_at?: string;
  accepted_at?: string;
  main_activity?: string;
  hub_office?: string;
  transport_fee?: number | null;
  enumerator_fee?: number | null;
  mmp_file_id?: string | null;
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
  hub_office?: string;
  state?: string;
  locality?: string;
  mmp_id?: string;
  mmp_name?: string;
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

interface ClickableStatsCardProps extends StatsCardProps {
  onClick?: () => void;
  isActive?: boolean;
}

function StatsCard({ title, value, subtitle, icon: Icon, trend, trendValue, color = 'primary', onClick, isActive }: ClickableStatsCardProps) {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-green-500/10 text-green-600 dark:text-green-400',
    warning: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
    danger: 'bg-red-500/10 text-red-600 dark:text-red-400',
  };

  const borderClasses = {
    primary: 'border-primary/50',
    success: 'border-green-500/50',
    warning: 'border-yellow-500/50',
    danger: 'border-red-500/50',
  };

  return (
    <Card 
      className={`transition-all duration-200 ${onClick ? 'cursor-pointer hover-elevate' : ''} ${isActive ? `ring-2 ring-offset-2 ${borderClasses[color]}` : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-bold tabular-nums">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
            )}
            {trend && trendValue && (
              <div className="flex items-center gap-1 mt-1">
                {trend === 'up' ? (
                  <TrendingUp className="h-3 w-3 text-green-500" />
                ) : trend === 'down' ? (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                ) : (
                  <Activity className="h-3 w-3 text-muted-foreground" />
                )}
                <span className={`text-xs ${trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-muted-foreground'}`}>
                  {trendValue}
                </span>
              </div>
            )}
          </div>
          <div className={`p-2.5 rounded-xl ${colorClasses[color]} shrink-0`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const normalizeStatus = (s: string): string => {
  const l = (s || '').toLowerCase().replace(/\s+/g, '_');
  if (['inprogress', 'in_progress', 'inprogress', 'ongoing'].includes(l)) return 'ongoing';
  if (['wfp_confirmed', 'wfp_confirmed'].includes(l)) return 'wfp_confirmed';
  if (['not_covered'].includes(l)) return 'not_covered';
  if (['approved_and_costed'].includes(l)) return 'costed';
  if (['declined'].includes(l)) return 'rejected';
  return l;
};

const STATUS_LABELS: Record<string, string> = {
  accepted: 'Accepted',
  assigned: 'Assigned',
  ongoing: 'Ongoing',
  completed: 'Completed',
  submitted: 'Submitted',
  wfp_confirmed: 'WFP Confirmed',
  not_covered: 'Not Covered',
  verified: 'Verified',
  rejected: 'Rejected',
  costed: 'Costed',
  returned_to_fom: 'Returned to FOM',
  recalled: 'Recalled',
  forwarded_to_coordinator: 'Forwarded to Coordinator',
};

// Module-level status lists (also used for quick HEAD count queries)
const POST_DISPATCH_STATUSES = [
  'accepted', 'Accepted',
  'assigned', 'Assigned',
  'inprogress', 'in_progress', 'ongoing', 'Ongoing', 'inProgress',
  'completed', 'Completed',
  'submitted', 'Submitted',
  'wfp_confirmed', 'WFP_Confirmed',
  'not_covered', 'Not_Covered',
  'verified', 'Verified',
  'rejected', 'Rejected', 'declined',
  'costed', 'approved and costed',
  'returned_to_fom', 'recalled', 'forwarded_to_coordinator',
];

const DISPATCHED_STATUSES = ['dispatched', 'Dispatched', 'smart_assigned', 'Smart_Assigned'];

// All correctable target statuses exposed in the Change Status dialog
const CLAIMED_PAGE_SIZE = 200; // rows shown at a time in the Claimed Sites table

const ALL_CORRECTABLE_STATUSES = [
  { value: 'accepted',                label: 'Accepted' },
  { value: 'inProgress',              label: 'In Progress (Ongoing)' },
  { value: 'completed',               label: 'Completed' },
  { value: 'submitted',               label: 'Submitted' },
  { value: 'wfp_confirmed',           label: 'WFP Confirmed' },
  { value: 'not_covered',             label: 'Not Covered' },
  { value: 'verified',                label: 'Verified' },
  { value: 'rejected',                label: 'Rejected' },
  { value: 'returned_to_fom',         label: 'Returned to FOM' },
  { value: 'recalled',                label: 'Recalled' },
  { value: 'forwarded_to_coordinator',label: 'Forwarded to Coordinator' },
  { value: 'dispatched',              label: 'Dispatched (back to pool)' },
];

export function SuperAdminDataManagement() {
  const { currentUser, users } = useUser();
  const { isSuperAdmin, resetSiteVisit, deleteWalletTransaction, resetWallet, reclaimSite } = useSuperAdmin();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('site-visits');
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [loadingWallets, setLoadingWallets] = useState(false);
  const [loadingClaimed, setLoadingClaimed] = useState(false);
  const [loadingDispatched, setLoadingDispatched] = useState(false);
  const [loadingMMPs, setLoadingMMPs] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [localityFilter, setLocalityFilter] = useState('all');
  const [activityFilter, setActivityFilter] = useState('all');
  const [claimedByFilter, setClaimedByFilter] = useState('all');
  const [claimedMmpFilter, setClaimedMmpFilter] = useState('all');
  const [hubFilter, setHubFilter] = useState('all');

  // Site-visits-tab filters
  const [svStateFilter, setSvStateFilter] = useState('all');
  const [svLocalityFilter, setSvLocalityFilter] = useState('all');
  const [svHubFilter, setSvHubFilter] = useState('all');
  const [svMmpFilter, setSvMmpFilter] = useState('all');

  // Dispatched-tab filters — kept separate so they never bleed into the Claimed tab
  const [dispatchedStateFilter, setDispatchedStateFilter] = useState('all');
  const [dispatchedLocalityFilter, setDispatchedLocalityFilter] = useState('all');
  const [dispatchedActivityFilter, setDispatchedActivityFilter] = useState('all');
  const [dispatchedHubFilter, setDispatchedHubFilter] = useState('all');
  const [dispatchedMmpFilter, setDispatchedMmpFilter] = useState('all');
  const [dispatchedNoCostFilter, setDispatchedNoCostFilter] = useState(false);
  const [claimedSiteSearch, setClaimedSiteSearch] = useState('');
  const [debouncedClaimedSiteSearch, setDebouncedClaimedSiteSearch] = useState('');

  // Declared early — used in useEffect dependency array below (avoids TDZ in production build)
  const [claimedNoCostFilter, setClaimedNoCostFilter] = useState(false);
  // Claimed-sites pagination — declared early for same reason
  const [claimedVisibleCount, setClaimedVisibleCount] = useState(CLAIMED_PAGE_SIZE);

  // Transaction-specific state
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  // Transaction-specific filters
  const [txSearch, setTxSearch] = useState('');
  const [debouncedTxSearch, setDebouncedTxSearch] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState('all');
  const [txAmountFilter, setTxAmountFilter] = useState('all');
  const [txUserFilter, setTxUserFilter] = useState('all');
  const [txWalletFilter, setTxWalletFilter] = useState('all');
  const [txHubFilter, setTxHubFilter] = useState('all');
  const [txStateFilter, setTxStateFilter] = useState('all');
  const [txLocalityFilter, setTxLocalityFilter] = useState('all');
  const [txMmpFilter, setTxMmpFilter] = useState('all');
  const [txDateFrom, setTxDateFrom] = useState('');
  const [txDateTo, setTxDateTo] = useState('');

  // Cache for loaded tabs to avoid reloading
  const loadedTabsRef = useRef<Set<string>>(new Set());

  // Create userMap for O(1) lookups instead of O(n) array.find()
  const userMap = useMemo(() => {
    const map = new Map<string, { name: string; email?: string }>();
    users.forEach(u => map.set(u.id, { name: u.name || 'Unknown', email: u.email }));
    return map;
  }, [users]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedClaimedSiteSearch(claimedSiteSearch), 300);
    return () => clearTimeout(timer);
  }, [claimedSiteSearch]);

  // Reset claimed-sites page whenever any filter changes
  useEffect(() => {
    setClaimedVisibleCount(CLAIMED_PAGE_SIZE);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedClaimedSiteSearch, debouncedSearch, statusFilter, stateFilter, localityFilter, activityFilter, claimedByFilter, claimedMmpFilter, claimedNoCostFilter]);

  // Clear bulk-reclaim selection whenever any Claimed Sites filter changes so
  // stale IDs from a previous filter set are never accidentally reclaimed.
  useEffect(() => {
    setSelectedClaimedSiteIds(new Set());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedClaimedSiteSearch, debouncedSearch, statusFilter, stateFilter, localityFilter, activityFilter, claimedByFilter, claimedMmpFilter, claimedNoCostFilter]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTxSearch(txSearch), 300);
    return () => clearTimeout(timer);
  }, [txSearch]);

  const [siteVisits, setSiteVisits] = useState<SiteVisitData[]>([]);
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [claimedSites, setClaimedSites] = useState<ClaimedSiteData[]>([]);
  const [dispatchedSites, setDispatchedSites] = useState<DispatchedSiteData[]>([]);
  const [mmps, setMMPs] = useState<MMPData[]>([]);

  const [selectedSiteVisit, setSelectedSiteVisit] = useState<SiteVisitData | null>(null);
  const [selectedClaimedSite, setSelectedClaimedSite] = useState<ClaimedSiteData | null>(null);
  const [selectedDispatchedSite, setSelectedDispatchedSite] = useState<DispatchedSiteData | null>(null);
  const [showReclaimSiteDialog, setShowReclaimSiteDialog] = useState(false);
  const [showReturnToApprovedDialog, setShowReturnToApprovedDialog] = useState(false);
  const [reclaimAdvanceInfo, setReclaimAdvanceInfo] = useState<{ pending: any[]; disbursed: any[] } | null>(null);
  const [reclaimAdvanceLoading, setReclaimAdvanceLoading] = useState(false);
  const [cancelPendingAdvances, setCancelPendingAdvances] = useState(true);
  const [showReturnToFOMDialog, setShowReturnToFOMDialog] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<WalletData | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionData | null>(null);
  const [selectedMMP, setSelectedMMP] = useState<MMPData | null>(null);

  const [showResetSiteVisitDialog, setShowResetSiteVisitDialog] = useState(false);
  const [showResetWalletDialog, setShowResetWalletDialog] = useState(false);
  const [showDeleteTransactionDialog, setShowDeleteTransactionDialog] = useState(false);
  const [showReverseEarningDialog, setShowReverseEarningDialog] = useState(false);
  const [selectedEarningTx, setSelectedEarningTx] = useState<TransactionData | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reverseProcessing, setReverseProcessing] = useState(false);
  const [showArchiveMMPDialog, setShowArchiveMMPDialog] = useState(false);

  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [resetTargetStatus, setResetTargetStatus] = useState<'new' | 'approved' | 'assigned' | 'dispatched'>('dispatched');
  const [editingTransportFee, setEditingTransportFee] = useState<{ siteId: string; value: string; saving: boolean } | null>(null);

  // Quick HEAD-count queries — populate stats cards before full data is fetched
  const [quickCounts, setQuickCounts] = useState<{ claimed: number | null; transactions: number | null; dispatched: number | null } | null>(null);

  // Transaction pagination
  const TX_PAGE_SIZE = 500;
  const [txOffset, setTxOffset] = useState(0);
  const [txHasMore, setTxHasMore] = useState(false);
  const [txLoadingMore, setTxLoadingMore] = useState(false);

  // Status-correction dialog (Claimed Sites tab)
  const [showChangeStatusDialog, setShowChangeStatusDialog] = useState(false);
  const [changeStatusSite, setChangeStatusSite] = useState<ClaimedSiteData | null>(null);
  const [changeStatusTarget, setChangeStatusTarget] = useState('');
  const [changeStatusReason, setChangeStatusReason] = useState('');
  const [changeStatusProcessing, setChangeStatusProcessing] = useState(false);
  const [changeStatusReverseWallet, setChangeStatusReverseWallet] = useState(false);

  // Bulk-reclaim state (Claimed Sites tab)
  const [selectedClaimedSiteIds, setSelectedClaimedSiteIds] = useState<Set<string>>(new Set());
  const [showBulkReclaimDialog, setShowBulkReclaimDialog] = useState(false);
  const [bulkReclaimReason, setBulkReclaimReason] = useState('');
  const [bulkReclaimProcessing, setBulkReclaimProcessing] = useState(false);
  const [bulkReclaimProgress, setBulkReclaimProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkReclaimAdvanceInfo, setBulkReclaimAdvanceInfo] = useState<{ siteId: string; siteName: string; disbursed: any[] }[]>([]);
  const [bulkReclaimAdvanceLoading, setBulkReclaimAdvanceLoading] = useState(false);
  const [excludeDisbursedFromBulk, setExcludeDisbursedFromBulk] = useState(false);
  const [bulkDisbursedExpanded, setBulkDisbursedExpanded] = useState(false);

  // Bulk change-status state (Claimed Sites tab)
  const [showBulkChangeStatusDialog, setShowBulkChangeStatusDialog] = useState(false);
  const [bulkChangeStatusTarget, setBulkChangeStatusTarget] = useState('');
  const [bulkChangeStatusReason, setBulkChangeStatusReason] = useState('');
  const [bulkChangeStatusProcessing, setBulkChangeStatusProcessing] = useState(false);
  const [bulkChangeStatusProgress, setBulkChangeStatusProgress] = useState<{ done: number; total: number } | null>(null);

  const loadSiteVisits = async () => {
    setLoadingVisits(true);
    try {
      const PAGE_SIZE = 1000;
      let allSiteVisits: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('mmp_site_entries')
          .select('id, site_name, site_code, status, accepted_by, visit_completed_at, visit_completed_by, enumerator_fee, state, locality, hub_office, mmp_file_id')
          .in('status', ['completed', 'verified'])
          .order('visit_completed_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        allSiteVisits = [...allSiteVisits, ...(data || [])];
        if ((data || []).length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      // Resolve MMP names via SECURITY DEFINER RPC — bypasses RLS on mmp_files so super_admin
      // always gets names without needing a permissive policy.
      const uniqueMmpIds = [...new Set(allSiteVisits.map((sv: any) => sv.mmp_file_id).filter(Boolean))] as string[];
      const mmpNameMap: Record<string, string> = {};
      if (uniqueMmpIds.length > 0) {
        const rpcArgs = uniqueMmpIds.length > 0 ? { p_ids: uniqueMmpIds } : {};
        const { data: mmpRows } = await supabase.rpc('get_mmp_names', rpcArgs);
        (mmpRows || []).forEach((m: any) => {
          mmpNameMap[m.id] = m.name || m.project_name || `MMP ${m.month ?? '?'}/${m.year ?? '?'}`;
        });
      }

      const enriched = allSiteVisits.map(sv => ({
        ...sv,
        accepted_by_name: userMap.get(sv.accepted_by)?.name || 'Unknown',
        completed_by_name: sv.visit_completed_by ? userMap.get(sv.visit_completed_by)?.name || 'N/A' : 'N/A',
        mmp_name: sv.mmp_file_id ? (mmpNameMap[sv.mmp_file_id] || null) : null,
      }));

      setSiteVisits(enriched);
      loadedTabsRef.current.add('site-visits');
    } catch (error) {
      console.error('Failed to load site visits:', error);
    } finally {
      setLoadingVisits(false);
    }
  };

  const loadWallets = async () => {
    setLoadingWallets(true);
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

      const enriched = (walletsData || []).map(w => ({
        id: w.id,
        user_id: w.user_id,
        user_name: userMap.get(w.user_id)?.name || 'Unknown',
        balances: w.balances || {},
        total_earned: parseFloat(w.total_earned) || 0,
        total_withdrawn: parseFloat(w.total_withdrawn) || 0,
        transaction_count: countMap[w.id] || 0,
      }));

      setWallets(enriched);
      loadedTabsRef.current.add('wallets');
    } catch (error) {
      console.error('Failed to load wallets:', error);
    } finally {
      setLoadingWallets(false);
    }
  };

  const loadTransactions = async (offset = 0, append = false) => {
    if (append) setTxLoadingMore(true);
    else { setTxLoading(true); setTxOffset(0); }
    setTxError(null);
    try {
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + TX_PAGE_SIZE - 1);

      if (error) throw error;

      const rawData = data || [];
      setTxHasMore(rawData.length === TX_PAGE_SIZE);
      if (append) setTxOffset(offset);

      const base: TransactionData[] = rawData.map((t: any) => ({
        id: t.id,
        wallet_id: t.wallet_id,
        user_id: t.user_id,
        user_name: userMap.get(t.user_id)?.name || 'Unknown',
        type: t.type,
        amount: parseFloat(t.amount) || 0,
        currency: t.currency,
        description: t.description,
        site_visit_id: t.site_visit_id,
        hub_office: undefined,
        state: undefined,
        locality: undefined,
        mmp_id: undefined,
        mmp_name: undefined,
        created_at: t.created_at,
      }));

      if (append) {
        setTransactions(prev => [...prev, ...base]);
      } else {
        setTransactions(base);
      }
      loadedTabsRef.current.add('transactions');

      // Enrich with hub/state/locality/mmp using both site_visit_id and related_site_visit_id
      const siteVisitIds = [...new Set(
        rawData.map((t: any) => t.site_visit_id || t.related_site_visit_id).filter(Boolean)
      )] as string[];

      if (siteVisitIds.length > 0) {
        try {
          const { data: entries } = await supabase
            .from('mmp_site_entries')
            .select('id, state, locality, hub_office, mmp_file_id')
            .in('id', siteVisitIds);

          const entryMap: Record<string, any> = {};
          (entries || []).forEach((e: any) => { entryMap[e.id] = e; });

          const mmpIds = [...new Set((entries || []).map((e: any) => e.mmp_file_id).filter(Boolean))] as string[];
          const mmpNameMap: Record<string, string> = {};
          if (mmpIds.length > 0) {
            const { data: mmpFiles } = await supabase
              .from('mmp_files').select('id, name').in('id', mmpIds);
            (mmpFiles || []).forEach((m: any) => { mmpNameMap[m.id] = m.name; });
          }

          const enriched = base.map((t, idx) => {
            const raw = rawData[idx];
            const entryId = raw?.site_visit_id || raw?.related_site_visit_id;
            const e = entryId ? entryMap[entryId] : undefined;
            return { ...t, hub_office: e?.hub_office, state: e?.state, locality: e?.locality, mmp_id: e?.mmp_file_id, mmp_name: e?.mmp_file_id ? mmpNameMap[e.mmp_file_id] : undefined };
          });
          if (append) {
            setTransactions(prev => [...prev.slice(0, offset), ...enriched]);
          } else {
            setTransactions(enriched);
          }
        } catch (enrichErr) {
          console.warn('[Transactions] Enrichment failed, showing base data:', enrichErr);
        }
      }
    } catch (err: any) {
      console.error('Failed to load transactions:', err);
      setTxError(err?.message || 'Failed to load transactions. Please try again.');
    } finally {
      setTxLoading(false);
      setTxLoadingMore(false);
    }
  };

  const loadClaimedSites = async () => {
    setLoadingClaimed(true);
    try {
      // Paginated fetch — bypasses Supabase 1000-row default cap
      const PAGE_SIZE = 1000;
      let allData: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('mmp_site_entries')
          .select('id, site_name, site_code, state, locality, status, accepted_by, accepted_at, dispatched_at, enumerator_fee, transport_fee, main_activity, activity_at_site, mmp_file_id, additional_data, hub_office')
          .in('status', POST_DISPATCH_STATUSES)
          .order('created_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (error) { console.error('Claimed sites query error (page', from, '):', error); throw error; }
        allData = [...allData, ...(data || [])];
        if ((data || []).length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      // Resolve MMP names — three-layer fallback:
      //   1. RPC with NO params (SECURITY DEFINER, returns all MMPs, avoids uuid[] cast issue)
      //   2. Direct mmp_files full fetch (works if bypass policy was applied)
      //   3. Direct mmp_files filtered by IDs (last resort)
      const uniqueMmpIds = [...new Set(allData.map((s: any) => s.mmp_file_id).filter(Boolean))] as string[];
      const mmpNameMap: Record<string, string> = {};
      const fillMap = (rows: any[]) => rows.forEach((m: any) => {
        if (m.id) mmpNameMap[String(m.id)] = m.name || m.project_name || `MMP ${m.month ?? '?'}/${m.year ?? '?'}`;
      });
      // Layer 1: RPC without p_ids — avoids uuid[] JSON cast, returns all MMPs via SECURITY DEFINER
      {
        const { data: rpcRows, error: rpcErr } = await supabase.rpc('get_mmp_names');
        if (!rpcErr && (rpcRows || []).length > 0) { fillMap(rpcRows); }
        else if (rpcErr) console.warn('[MMP] RPC get_mmp_names failed:', rpcErr.message);
      }
      // Layer 2: direct full table fetch (if RPC not deployed yet, works with bypass policy)
      if (Object.keys(mmpNameMap).length === 0) {
        const { data: allMmpRows } = await supabase
          .from('mmp_files').select('id, name, project_name, month, year')
          .order('created_at', { ascending: false }).limit(500);
        if ((allMmpRows || []).length > 0) { fillMap(allMmpRows!); }
      }
      // Layer 3: filtered by specific IDs (last resort)
      if (Object.keys(mmpNameMap).length === 0 && uniqueMmpIds.length > 0) {
        const { data: directRows } = await supabase
          .from('mmp_files').select('id, name, project_name, month, year')
          .in('id', uniqueMmpIds);
        if ((directRows || []).length > 0) { fillMap(directRows!); }
      }

      const enriched = allData.map((site: any) => {
        const claimerUid = site.accepted_by
          || site.additional_data?.claimed_by
          || site.additional_data?.assigned_to;
        const resolvedName = claimerUid
          ? (userMap.get(claimerUid)?.name || `UID:${String(claimerUid).slice(0, 8)}`)
          : 'Not assigned';
        return {
          ...site,
          claimed_by_name: resolvedName,
          accepted_by_name: resolvedName,
          main_activity: site.main_activity || site.activity_at_site || null,
          mmp_id: site.mmp_file_id,
          mmp_name: mmpNameMap[site.mmp_file_id] || null,
        };
      });

      setClaimedSites(enriched);
      loadedTabsRef.current.add('claimed-sites');
    } catch (error) {
      console.error('Failed to load claimed sites:', error);
    } finally {
      setLoadingClaimed(false);
    }
  };

  const loadDispatchedSites = async () => {
    setLoadingDispatched(true);
    try {
      const PAGE_SIZE = 1000;
      let allDispatched: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('mmp_site_entries')
          .select('id, site_name, site_code, state, locality, status, dispatched_by, dispatched_at, accepted_at, main_activity, activity_at_site, hub_office, accepted_by, transport_fee, enumerator_fee, mmp_file_id')
          .in('status', DISPATCHED_STATUSES)
          .order('dispatched_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        allDispatched = [...allDispatched, ...(data || [])];
        if ((data || []).length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      // Resolve MMP names — same layered approach as claimed sites.
      const uniqueDispatchedMmpIds = [...new Set(allDispatched.map((s: any) => s.mmp_file_id).filter(Boolean))] as string[];
      const dispatchedMmpNameMap: Record<string, string> = {};
      const fillDispMap = (rows: any[]) => rows.forEach((m: any) => {
        if (m.id) dispatchedMmpNameMap[String(m.id)] = m.name || m.project_name || `MMP ${m.month ?? '?'}/${m.year ?? '?'}`;
      });
      // Layer 1: RPC without p_ids (SECURITY DEFINER, no uuid[] cast needed)
      {
        const { data: rpcRows, error: rpcErr } = await supabase.rpc('get_mmp_names');
        if (!rpcErr && (rpcRows || []).length > 0) { fillDispMap(rpcRows); }
      }
      // Layer 2: direct full table fetch
      if (Object.keys(dispatchedMmpNameMap).length === 0) {
        const { data: allMmpRows } = await supabase
          .from('mmp_files').select('id, name, project_name, month, year')
          .order('created_at', { ascending: false }).limit(500);
        if ((allMmpRows || []).length > 0) { fillDispMap(allMmpRows!); }
      }
      // Layer 3: filtered by IDs
      if (Object.keys(dispatchedMmpNameMap).length === 0 && uniqueDispatchedMmpIds.length > 0) {
        const { data: directRows } = await supabase
          .from('mmp_files').select('id, name, project_name, month, year')
          .in('id', uniqueDispatchedMmpIds);
        if ((directRows || []).length > 0) { fillDispMap(directRows!); }
      }

      const enriched = allDispatched.map(site => ({
        ...site,
        dispatched_by_name: userMap.get(site.dispatched_by)?.name || 'Unknown',
        main_activity: site.main_activity || site.activity_at_site || null,
        mmp_name: dispatchedMmpNameMap[site.mmp_file_id] || null,
      }));

      setDispatchedSites(enriched);
      loadedTabsRef.current.add('dispatched-sites');
    } catch (error) {
      console.error('Failed to load dispatched sites:', error);
    } finally {
      setLoadingDispatched(false);
    }
  };

  const loadMMPs = async () => {
    setLoadingMMPs(true);
    try {
      // Primary: join projects table to get real name when mmp_files.name is null
      let data: any[] | null = null;
      const { data: d1, error: e1 } = await supabase
        .from('mmp_files')
        .select('id, name, month, year, status, project_id, project_name, created_at, project:projects(name)')
        .order('created_at', { ascending: false });
      if (!e1 && d1 && d1.length > 0) {
        data = d1;
      } else {
        // Fallback: derive MMP list from mmp_file_ids in mmp_site_entries (always accessible)
        console.warn('[MMPs] Direct query empty/failed (e1=', e1?.message, '), deriving from site entries');
        const { data: idRows } = await supabase
          .from('mmp_site_entries')
          .select('mmp_file_id')
          .not('mmp_file_id', 'is', null);
        const uniqueIds = [...new Set((idRows || []).map((r: any) => r.mmp_file_id).filter(Boolean))] as string[];
        if (uniqueIds.length > 0) {
          const BATCH = 100;
          const allMmpFiles: any[] = [];
          for (let i = 0; i < uniqueIds.length; i += BATCH) {
            const { data: batchData } = await supabase
              .from('mmp_files')
              .select('id, name, month, year, status, project_id, project_name, created_at, project:projects(name)')
              .in('id', uniqueIds.slice(i, i + BATCH));
            allMmpFiles.push(...(batchData || []));
          }
          data = allMmpFiles;
        } else {
          data = [];
        }
      }

      // IDs come from the fetched mmp_files rows (or from the fallback batch already in `data`)
      const allMmpIds: string[] = (data || []).map((m: any) => m.id).filter(Boolean);

      // Parallel COUNT queries per MMP — fast, avoids loading all 3000+ site-entry rows.
      // Three HEAD queries per MMP (total / dispatched / completed), all fired concurrently.
      const mmpStats: Record<string, { total: number; dispatched: number; completed: number }> = {};
      if (allMmpIds.length > 0) {
        const countResults = await Promise.all(
          allMmpIds.flatMap(id => [
            supabase.from('mmp_site_entries').select('*', { count: 'exact', head: true }).eq('mmp_file_id', id),
            supabase.from('mmp_site_entries').select('*', { count: 'exact', head: true }).eq('mmp_file_id', id).in('status', ['dispatched', 'assigned']),
            supabase.from('mmp_site_entries').select('*', { count: 'exact', head: true }).eq('mmp_file_id', id).in('status', ['completed', 'verified']),
          ])
        );
        allMmpIds.forEach((id, i) => {
          mmpStats[id] = {
            total:      countResults[i * 3]?.count     ?? 0,
            dispatched: countResults[i * 3 + 1]?.count ?? 0,
            completed:  countResults[i * 3 + 2]?.count ?? 0,
          };
        });
      }

      // If mmp_files returned 0 rows (RLS blocks super_admin — apply fix_mmp_files_superadmin_access.sql),
      // synthesize MMP entries from the known IDs (names will fall back to UUID short-form below).
      const mmpSource = (data && data.length > 0)
        ? data
        : Object.keys(mmpStats).map(id => ({
            id,
            name: null,
            month: null,
            year: null,
            status: null,
            project_name: null,
            created_at: null,
          }));

      const enriched = mmpSource.map((m: any) => ({
        id: m.id,
        name: m.name || m.project?.name || m.project_name || (m.month && m.year ? `MMP ${m.month}/${m.year}` : null) || `MMP-${m.id.slice(0, 8).toUpperCase()}`,
        month: m.month,
        year: m.year,
        status: m.status,
        project_name: m.project_name || 'Unknown',
        total_sites: mmpStats[m.id]?.total || 0,
        dispatched_sites: mmpStats[m.id]?.dispatched || 0,
        completed_sites: mmpStats[m.id]?.completed || 0,
        created_at: m.created_at,
      }));

      setMMPs(enriched);
      loadedTabsRef.current.add('mmps');
    } catch (error) {
      console.error('Failed to load MMPs:', error);
    } finally {
      setLoadingMMPs(false);
    }
  };

  // Quick HEAD counts — show stats card numbers immediately, before full data is loaded
  const loadQuickCounts = useCallback(async () => {
    try {
      const [claimedRes, txRes, dispatchedRes] = await Promise.all([
        supabase.from('mmp_site_entries').select('*', { count: 'exact', head: true }).in('status', POST_DISPATCH_STATUSES),
        supabase.from('wallet_transactions').select('*', { count: 'exact', head: true }),
        supabase.from('mmp_site_entries').select('*', { count: 'exact', head: true }).in('status', DISPATCHED_STATUSES),
      ]);
      setQuickCounts({
        claimed: claimedRes.count ?? null,
        transactions: txRes.count ?? null,
        dispatched: dispatchedRes.count ?? null,
      });
    } catch { /* non-critical */ }
  }, []);

  // Force refresh function for manual refresh button
  const forceRefreshCurrentTab = useCallback(() => {
    loadedTabsRef.current.delete(activeTab);
    if (activeTab === 'site-visits') loadSiteVisits();
    else if (activeTab === 'wallets') loadWallets();
    else if (activeTab === 'transactions') { setTxError(null); loadTransactions(); }
    else if (activeTab === 'claimed-sites') loadClaimedSites();
    else if (activeTab === 'dispatched-sites') loadDispatchedSites();
    else if (activeTab === 'mmps') loadMMPs();
  }, [activeTab, userMap]);

  // On mount: load quick stats cards + MMP list immediately (both are fast).
  // All heavy tab data (site visits, claimed, dispatched, wallets, transactions)
  // is loaded lazily per-tab via the on-demand useEffect below.
  const hasPreloadedRef = useRef(false);
  useEffect(() => {
    if (!isSuperAdmin || userMap.size === 0 || hasPreloadedRef.current) return;
    hasPreloadedRef.current = true;
    loadQuickCounts(); // fast HEAD queries — populate stats card numbers immediately
    loadMMPs();        // fast: mmp_files + parallel COUNT queries per MMP (9 MMPs ≈ 27 parallel HEAD requests)
  }, [isSuperAdmin, userMap]);

  // Fallback: load a tab on-demand if it was somehow missed
  useEffect(() => {
    if (!isSuperAdmin || userMap.size === 0) return;
    if (!loadedTabsRef.current.has(activeTab)) {
      if (activeTab === 'site-visits') loadSiteVisits();
      else if (activeTab === 'wallets') loadWallets();
      else if (activeTab === 'transactions') loadTransactions();
      else if (activeTab === 'claimed-sites') loadClaimedSites();
      else if (activeTab === 'dispatched-sites') loadDispatchedSites();
      else if (activeTab === 'mmps') loadMMPs();
    }
  }, [activeTab, isSuperAdmin, userMap]);

  const handleResetSiteVisit = async () => {
    if (!selectedSiteVisit || !currentUser || !reason.trim()) return;

    setProcessing(true);
    const success = await resetSiteVisit({
      siteVisitId: selectedSiteVisit.id,
      reason: reason.trim(),
      deletedBy: currentUser.id,
      deletedByName: currentUser.name || currentUser.email || 'Super Admin',
      deletedByRole: currentUser.role || 'superadmin',
      targetStatus: resetTargetStatus,
    });

    setProcessing(false);
    if (success) {
      setShowResetSiteVisitDialog(false);
      setSelectedSiteVisit(null);
      setReason('');
      setResetTargetStatus('dispatched');
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
      cancelPendingAdvances,
    });

    setProcessing(false);
    if (success) {
      setShowReclaimSiteDialog(false);
      setSelectedClaimedSite(null);
      setReason('');
      loadClaimedSites();
    }
  };

  const handleBulkReclaimSites = async () => {
    if (!currentUser || !bulkReclaimReason.trim() || selectedClaimedSiteIds.size === 0) return;

    setBulkReclaimProcessing(true);
    const disbursedSiteIds = new Set(bulkReclaimAdvanceInfo.map(s => s.siteId));
    const ids = Array.from(selectedClaimedSiteIds).filter(
      id => !excludeDisbursedFromBulk || !disbursedSiteIds.has(id)
    );
    if (ids.length === 0) {
      setBulkReclaimProcessing(false);
      return;
    }
    setBulkReclaimProgress({ done: 0, total: ids.length });

    let successCount = 0;
    let failCount = 0;

    for (const siteId of ids) {
      const ok = await reclaimSite({
        siteEntryId: siteId,
        reason: bulkReclaimReason.trim(),
        reclaimedBy: currentUser.id,
        reclaimedByName: currentUser.name || currentUser.email || 'Super Admin',
        reclaimedByRole: currentUser.role || 'superadmin',
        cancelPendingAdvances: true,
      });
      if (ok) successCount++; else failCount++;
      setBulkReclaimProgress(prev => prev ? { ...prev, done: prev.done + 1 } : null);
    }

    setBulkReclaimProcessing(false);
    setBulkReclaimProgress(null);

    if (successCount > 0) {
      toast({
        title: `Bulk Reclaim Complete`,
        description: `${successCount} site${successCount !== 1 ? 's' : ''} reclaimed${failCount > 0 ? `, ${failCount} failed` : ''}.`,
        variant: failCount > 0 ? 'destructive' : 'default',
      });
      setShowBulkReclaimDialog(false);
      setBulkReclaimReason('');
      setSelectedClaimedSiteIds(new Set());
      loadClaimedSites();
    }
  };

  const handleReturnToApproved = async () => {
    if (!selectedDispatchedSite || !currentUser || !reason.trim()) return;

    setProcessing(true);
    try {
      const session = await ensureValidSession();
      if (!session.success) { setProcessing(false); return; }

      const { error } = await supabase
        .from('mmp_site_entries')
        .update({
          status: 'verified',
          // Clear dispatch fields
          dispatched_by: null,
          dispatched_at: null,
          // Clear cost fields - must go through costing approval again
          cost: null,
          enumerator_fee: null,
          transport_fee: null,
          accepted_by: null,
          accepted_at: null,
          additional_data: null,
        })
        .eq('id', selectedDispatchedSite.id);

      if (error) throw error;

      await supabase.from('super_admin_audit_logs').insert({
        action_type: 'return_to_new_sites',
        entity_type: 'mmp_site_entry',
        entity_id: selectedDispatchedSite.id,
        performed_by: currentUser.id,
        performed_by_name: currentUser.name || currentUser.email || 'Super Admin',
        performed_by_role: currentUser.role || 'superadmin',
        reason: reason.trim(),
        details: {
          site_name: selectedDispatchedSite.site_name,
          site_code: selectedDispatchedSite.site_code,
          previous_status: 'dispatched',
          new_status: 'verified',
        },
      });

      setShowReturnToApprovedDialog(false);
      setSelectedDispatchedSite(null);
      setReason('');
      loadDispatchedSites();
    } catch (error) {
      console.error('Failed to return site to approved:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleReturnToFOM = async (pickedReason: string, comment?: string) => {
    if (!selectedDispatchedSite || !currentUser || !pickedReason.trim()) return;
    const reason = [pickedReason, comment].filter(Boolean).join(' | ');

    setProcessing(true);
    try {
      const session = await ensureValidSession();
      if (!session.success) { setProcessing(false); return; }

      const { error } = await supabase
        .from('mmp_site_entries')
        .update({
          status: 'returned_to_fom',
          dispatched_by: null,
          dispatched_at: null,
          cost: null,
          enumerator_fee: null,
          transport_fee: null,
          accepted_by: null,
          accepted_at: null,
        })
        .eq('id', selectedDispatchedSite.id);

      if (error) throw error;

      await supabase.from('super_admin_audit_logs').insert({
        action_type: 'return_to_fom',
        entity_type: 'mmp_site_entry',
        entity_id: selectedDispatchedSite.id,
        performed_by: currentUser.id,
        performed_by_name: currentUser.name || currentUser.email || 'Super Admin',
        performed_by_role: currentUser.role || 'superadmin',
        reason: reason.trim(),
        details: {
          site_name: selectedDispatchedSite.site_name,
          site_code: selectedDispatchedSite.site_code,
          previous_status: 'dispatched',
          new_status: 'returned_to_fom',
        },
      });

      setShowReturnToFOMDialog(false);
      setSelectedDispatchedSite(null);
      setReason('');
      loadDispatchedSites();
    } catch (error) {
      console.error('Failed to return site to FOM:', error);
    } finally {
      setProcessing(false);
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

  const openReverseEarningDialog = (t: TransactionData) => {
    setSelectedEarningTx(t);
    setReverseReason('');
    setShowReverseEarningDialog(true);
  };

  const handleReverseEarning = async () => {
    if (!selectedEarningTx || !currentUser || !reverseReason.trim()) return;
    setReverseProcessing(true);
    try {
      const reversalAmount = -Math.abs(selectedEarningTx.amount);
      const now = new Date().toISOString();

      // Insert counterpart negative adjustment transaction
      const { error: insertError } = await supabase
        .from('wallet_transactions')
        .insert({
          wallet_id: selectedEarningTx.wallet_id,
          user_id: selectedEarningTx.user_id,
          type: 'adjustment',
          amount: reversalAmount,
          currency: selectedEarningTx.currency,
          description: `Reversal of earning: ${reverseReason.trim()} (original tx: ${selectedEarningTx.id.slice(0, 8)})`,
          created_at: now,
        });

      if (insertError) throw new Error(`Failed to insert reversal: ${insertError.message}`);

      // Update wallet balance
      const { data: wallet } = await supabase
        .from('wallets')
        .select('balances, total_earned')
        .eq('id', selectedEarningTx.wallet_id)
        .single();

      if (wallet) {
        const cur = selectedEarningTx.currency;
        const newBal = Math.max(0, (wallet.balances?.[cur] || 0) + reversalAmount);
        await supabase
          .from('wallets')
          .update({
            balances: { ...wallet.balances, [cur]: newBal },
            total_earned: Math.max(0, (parseFloat(wallet.total_earned) || 0) - Math.abs(selectedEarningTx.amount)),
            updated_at: now,
          })
          .eq('id', selectedEarningTx.wallet_id);
      }

      toast({ title: 'Earning Reversed', description: `A reversal adjustment of ${reversalAmount.toLocaleString()} ${selectedEarningTx.currency} has been applied to ${selectedEarningTx.user_name}'s wallet.` });
      setShowReverseEarningDialog(false);
      setSelectedEarningTx(null);
      loadTransactions();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to reverse earning', variant: 'destructive' });
    } finally {
      setReverseProcessing(false);
    }
  };

  const handleSaveTransportFee = async (siteId: string, newFee: number, source: 'claimed' | 'dispatched') => {
    setEditingTransportFee(prev => prev ? { ...prev, saving: true } : null);
    try {
      const { error } = await supabase
        .from('mmp_site_entries')
        .update({ transport_fee: newFee })
        .eq('id', siteId);
      if (error) throw error;
      toast({ title: 'Transport Cost Updated', description: `Transport fee set to ${newFee.toLocaleString()} SDG.` });
      setEditingTransportFee(null);
      if (source === 'claimed') loadClaimedSites();
      else loadDispatchedSites();
    } catch (err: any) {
      toast({ title: 'Update Failed', description: err.message || 'Could not update transport fee.', variant: 'destructive' });
      setEditingTransportFee(prev => prev ? { ...prev, saving: false } : null);
    }
  };

  const openReclaimSiteDialog = async (site: ClaimedSiteData) => {
    setSelectedClaimedSite(site);
    setReason('');
    setReclaimAdvanceInfo(null);
    setCancelPendingAdvances(true);
    setShowReclaimSiteDialog(true);

    // Fetch linked advance requests to warn admin
    setReclaimAdvanceLoading(true);
    try {
      const { data } = await supabase
        .from('down_payment_requests')
        .select('id, requested_amount, currency, status, created_at')
        .eq('mmp_site_entry_id', site.id);

      if (data) {
        const pending = data.filter(r => r.status === 'pending_supervisor' || r.status === 'pending_admin');
        const disbursed = data.filter(r => r.status === 'approved');
        setReclaimAdvanceInfo({ pending, disbursed });
      }
    } catch {
      // Non-critical — warnings just won't show
    } finally {
      setReclaimAdvanceLoading(false);
    }
  };

  const openBulkReclaimDialog = async () => {
    setBulkReclaimReason('');
    setBulkReclaimAdvanceInfo([]);
    setExcludeDisbursedFromBulk(false);
    setBulkDisbursedExpanded(false);
    setShowBulkReclaimDialog(true);

    const ids = Array.from(selectedClaimedSiteIds);
    if (ids.length === 0) return;

    setBulkReclaimAdvanceLoading(true);
    try {
      const { data } = await supabase
        .from('down_payment_requests')
        .select('id, mmp_site_entry_id, requested_amount, currency, status')
        .in('mmp_site_entry_id', ids)
        .in('status', ['approved', 'partially_paid', 'fully_paid']);

      if (data && data.length > 0) {
        const siteMap = new Map<string, any[]>();
        data.forEach((r: any) => {
          if (!siteMap.has(r.mmp_site_entry_id)) siteMap.set(r.mmp_site_entry_id, []);
          siteMap.get(r.mmp_site_entry_id)!.push(r);
        });
        const result = Array.from(siteMap.entries()).map(([siteId, rows]) => {
          const site = claimedSites.find(s => s.id === siteId);
          return { siteId, siteName: site?.site_name || siteId, disbursed: rows };
        });
        setBulkReclaimAdvanceInfo(result);
      }
    } catch {
      // Non-critical — warning panel just won't show
    } finally {
      setBulkReclaimAdvanceLoading(false);
    }
  };

  const openArchiveMMPDialog = (mmp: MMPData) => {
    setSelectedMMP(mmp);
    setReason('');
    setShowArchiveMMPDialog(true);
  };

  const openChangeStatusDialog = (site: ClaimedSiteData) => {
    setChangeStatusSite(site);
    setChangeStatusTarget('');
    setChangeStatusReason('');
    setChangeStatusReverseWallet(false);
    setShowChangeStatusDialog(true);
  };

  const handleChangeStatus = async () => {
    if (!changeStatusSite || !currentUser || !changeStatusTarget || !changeStatusReason.trim()) return;
    setChangeStatusProcessing(true);
    try {
      const session = await ensureValidSession();
      if (!session.success) { setChangeStatusProcessing(false); return; }

      // 1. Update the site status
      const { error } = await supabase
        .from('mmp_site_entries')
        .update({ status: changeStatusTarget })
        .eq('id', changeStatusSite.id);

      if (error) throw error;

      // 2. Optionally reverse wallet transactions linked to this site
      let walletErrors: string[] = [];
      let reversedTxCount = 0;
      if (changeStatusReverseWallet) {
        const { data: transactions } = await supabase
          .from('wallet_transactions')
          .select('*')
          .or(`site_visit_id.eq.${changeStatusSite.id},related_site_visit_id.eq.${changeStatusSite.id}`);

        if (transactions && transactions.length > 0) {
          for (const txn of transactions) {
            try {
              // Get wallet and deduct balance
              const { data: wallet } = await supabase
                .from('wallets')
                .select('*')
                .eq('id', txn.wallet_id)
                .single();

              if (wallet) {
                const currentBalance = wallet.balances?.[txn.currency] || 0;
                const newBalance = Math.max(0, currentBalance - txn.amount);
                await supabase
                  .from('wallets')
                  .update({
                    balances: { ...wallet.balances, [txn.currency]: newBalance },
                    total_earned: Math.max(0, (parseFloat(wallet.total_earned) || 0) - txn.amount),
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', wallet.id);
              }

              // Delete the transaction
              const { error: deleteErr } = await supabase
                .from('wallet_transactions')
                .delete()
                .eq('id', txn.id);

              if (deleteErr) {
                walletErrors.push(`TX ${txn.id.slice(0, 8)}: ${deleteErr.message}`);
              } else {
                reversedTxCount++;
              }
            } catch (txErr: any) {
              walletErrors.push(txErr.message);
            }
          }
        }

        // Cancel any pending advance requests for this site
        const { data: pendingAdv } = await supabase
          .from('down_payment_requests')
          .select('id')
          .eq('mmp_site_entry_id', changeStatusSite.id)
          .in('status', ['pending_supervisor', 'pending_admin']);

        if (pendingAdv && pendingAdv.length > 0) {
          await supabase
            .from('down_payment_requests')
            .update({
              status: 'cancelled',
              updated_at: new Date().toISOString(),
            })
            .in('id', pendingAdv.map((a: any) => a.id));
        }
      }

      // 3. Audit log
      await supabase.from('super_admin_audit_logs').insert({
        action_type: 'status_correction',
        entity_type: 'mmp_site_entry',
        entity_id: changeStatusSite.id,
        performed_by: currentUser.id,
        performed_by_name: currentUser.name || currentUser.email || 'Super Admin',
        performed_by_role: currentUser.role || 'superadmin',
        reason: changeStatusReason.trim(),
        details: {
          site_name: changeStatusSite.site_name,
          site_code: changeStatusSite.site_code,
          previous_status: changeStatusSite.status,
          new_status: changeStatusTarget,
          wallet_reversed: changeStatusReverseWallet,
          transactions_reversed: reversedTxCount,
          wallet_errors: walletErrors.length > 0 ? walletErrors : undefined,
        },
      });

      const desc = changeStatusReverseWallet
        ? `"${changeStatusSite.site_name}": ${changeStatusSite.status} → ${changeStatusTarget}. ${reversedTxCount} transaction(s) reversed.${walletErrors.length ? ` (${walletErrors.length} wallet error(s))` : ''}`
        : `"${changeStatusSite.site_name}": ${changeStatusSite.status} → ${changeStatusTarget}. Wallet not touched.`;

      toast({ title: 'Status Updated', description: desc });
      setShowChangeStatusDialog(false);
      setChangeStatusSite(null);
      setChangeStatusTarget('');
      setChangeStatusReason('');
      setChangeStatusReverseWallet(false);
      loadClaimedSites();
      if (changeStatusReverseWallet) loadTransactions();
    } catch (error: any) {
      toast({ title: 'Update Failed', description: error.message || 'Could not update status.', variant: 'destructive' });
    } finally {
      setChangeStatusProcessing(false);
    }
  };

  const handleBulkChangeStatus = async () => {
    if (!currentUser || !bulkChangeStatusTarget || !bulkChangeStatusReason.trim()) return;
    setBulkChangeStatusProcessing(true);
    setBulkChangeStatusProgress({ done: 0, total: selectedClaimedSiteIds.size });
    const ids = Array.from(selectedClaimedSiteIds);
    let successCount = 0;
    let errorCount = 0;
    try {
      const session = await ensureValidSession();
      if (!session.success) { setBulkChangeStatusProcessing(false); return; }

      for (let i = 0; i < ids.length; i++) {
        const siteId = ids[i];
        try {
          const { error: updateError } = await supabase
            .from('mmp_site_entries')
            .update({ status: bulkChangeStatusTarget, updated_at: new Date().toISOString() })
            .eq('id', siteId);

          if (updateError) {
            errorCount++;
          } else {
            successCount++;
            // Only audit-log after a confirmed successful update
            try {
              await supabase.from('super_admin_audit_logs').insert({
                action_type: 'status_correction',
                entity_type: 'mmp_site_entry',
                entity_id: siteId,
                performed_by: currentUser.id,
                performed_by_name: currentUser.name || currentUser.email || 'Super Admin',
                performed_by_role: currentUser.role || 'superadmin',
                reason: bulkChangeStatusReason.trim(),
                details: {
                  new_status: bulkChangeStatusTarget,
                  bulk_operation: true,
                  wallet_reversed: false,
                },
              });
            } catch {
              // Audit insert failed — status was still updated; surface as a partial warning
              console.warn(`Audit log insert failed for site ${siteId} after successful status update`);
            }
          }
        } catch {
          errorCount++;
        }
        setBulkChangeStatusProgress({ done: i + 1, total: ids.length });
      }

      toast({
        title: 'Bulk Status Updated',
        description: `${successCount} site${successCount !== 1 ? 's' : ''} updated to "${ALL_CORRECTABLE_STATUSES.find(s => s.value === bulkChangeStatusTarget)?.label || bulkChangeStatusTarget}"${errorCount > 0 ? `. ${errorCount} failed.` : '.'}`,
        variant: errorCount > 0 ? 'destructive' : 'default',
      });
      setShowBulkChangeStatusDialog(false);
      setBulkChangeStatusTarget('');
      setBulkChangeStatusReason('');
      setBulkChangeStatusProgress(null);
      setSelectedClaimedSiteIds(new Set());
      loadClaimedSites();
    } catch (error: any) {
      toast({ title: 'Bulk Update Failed', description: error.message || 'Could not update statuses.', variant: 'destructive' });
    } finally {
      setBulkChangeStatusProcessing(false);
    }
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
    const assignedSites = claimedSites.filter(s => s.status === 'accepted').length;
    
    const totalDispatchedSites = dispatchedSites.length;
    const dispatchedByState = dispatchedSites.reduce((acc, s) => {
      acc[s.state] = (acc[s.state] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const uniqueStatesDispatched = Object.keys(dispatchedByState).length;
    
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
      totalDispatchedSites,
      uniqueStatesDispatched,
      totalMMPs,
      activeMMPs,
    };
  }, [siteVisits, wallets, transactions, claimedSites, dispatchedSites, mmps]);

  // Fast id→MMP lookup used in claimed sites table and filter options
  const mmpById = useMemo(() => {
    const map: Record<string, { id: string; name: string; month?: number; year?: number }> = {};
    mmps.forEach(m => { if (m.id) map[m.id] = m; });
    return map;
  }, [mmps]);

  const svFilterOptions = useMemo(() => {
    const states = [...new Set(siteVisits.map(s => s.state).filter(Boolean))].sort() as string[];
    const stateFiltered = siteVisits.filter(s => svStateFilter === 'all' || s.state === svStateFilter);
    const localities = [...new Set(stateFiltered.map(s => s.locality).filter(Boolean))].sort() as string[];
    const hubs = [...new Set(siteVisits.map(s => s.hub_office).filter(Boolean))].sort() as string[];
    // Derive MMP options directly from visit data — avoids dependency on mmps state (which may be
    // empty due to RLS) and ensures the filter only shows MMPs that actually have site visits.
    const mmpSeen = new Map<string, string>();
    siteVisits.forEach(sv => {
      if (sv.mmp_file_id && !mmpSeen.has(sv.mmp_file_id)) {
        mmpSeen.set(sv.mmp_file_id, sv.mmp_name || sv.mmp_file_id);
      }
    });
    const mmpOptions = [...mmpSeen.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, label]) => ({ id, label }));
    return { states, localities, hubs, mmpOptions };
  }, [siteVisits, svStateFilter]);

  const filteredSiteVisits = useMemo(() => {
    return siteVisits.filter(sv => {
      const matchesSearch = 
        sv.site_name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        sv.site_code?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        sv.accepted_by_name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        sv.mmp_name?.toLowerCase().includes(debouncedSearch.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || sv.status === statusFilter;
      const matchesState    = svStateFilter    === 'all' || sv.state      === svStateFilter;
      const matchesLocality = svLocalityFilter === 'all' || sv.locality   === svLocalityFilter;
      const matchesHub      = svHubFilter      === 'all' || sv.hub_office === svHubFilter;
      const matchesMmp      = svMmpFilter      === 'all' || sv.mmp_file_id === svMmpFilter;
      
      return matchesSearch && matchesStatus && matchesState && matchesLocality && matchesHub && matchesMmp;
    });
  }, [siteVisits, debouncedSearch, statusFilter, svStateFilter, svLocalityFilter, svHubFilter, svMmpFilter]);

  const filteredWallets = useMemo(() => {
    return wallets.filter(w => {
      const matchesSearch = w.user_name?.toLowerCase().includes(debouncedSearch.toLowerCase());
      const matchesFilter = statusFilter === 'all' || 
        (statusFilter === 'has-balance' && Object.values(w.balances).some(b => b > 0)) ||
        (statusFilter === 'no-balance' && Object.values(w.balances).every(b => b <= 0));
      return matchesSearch && matchesFilter;
    });
  }, [wallets, debouncedSearch, statusFilter]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const q = debouncedTxSearch.toLowerCase();
      const matchesSearch = !q ||
        t.user_name?.toLowerCase().includes(q) ||
        t.type?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.hub_office?.toLowerCase().includes(q) ||
        t.state?.toLowerCase().includes(q) ||
        t.locality?.toLowerCase().includes(q) ||
        t.mmp_name?.toLowerCase().includes(q);

      const matchesType = txTypeFilter === 'all' || t.type === txTypeFilter;

      const matchesAmount =
        txAmountFilter === 'all' ||
        (txAmountFilter === 'credit' && t.amount > 0) ||
        (txAmountFilter === 'debit' && t.amount < 0);

      const matchesUser = txUserFilter === 'all' || t.user_id === txUserFilter;
      const matchesWallet = txWalletFilter === 'all' || t.wallet_id === txWalletFilter;
      const matchesHub = txHubFilter === 'all' || t.hub_office === txHubFilter;
      const matchesState = txStateFilter === 'all' || t.state === txStateFilter;
      const matchesLocality = txLocalityFilter === 'all' || t.locality === txLocalityFilter;
      const matchesMmp = txMmpFilter === 'all' || t.mmp_id === txMmpFilter;

      const txDate = new Date(t.created_at);
      const matchesDateFrom = !txDateFrom || txDate >= new Date(txDateFrom);
      const matchesDateTo = !txDateTo || txDate <= new Date(txDateTo + 'T23:59:59');

      return matchesSearch && matchesType && matchesAmount && matchesUser && matchesWallet &&
        matchesHub && matchesState && matchesLocality && matchesMmp &&
        matchesDateFrom && matchesDateTo;
    });
  }, [transactions, debouncedTxSearch, txTypeFilter, txAmountFilter, txUserFilter, txWalletFilter,
      txHubFilter, txStateFilter, txLocalityFilter, txMmpFilter, txDateFrom, txDateTo]);

  const txUniqueTypes = useMemo(() => {
    return [...new Set(transactions.map(t => t.type).filter(Boolean))].sort();
  }, [transactions]);

  const txUniqueUsers = useMemo(() => {
    const seen = new Map<string, string>();
    transactions.forEach(t => { if (t.user_id && t.user_name) seen.set(t.user_id, t.user_name); });
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [transactions]);

  const txUniqueWallets = useMemo(() => {
    const seen = new Map<string, string>();
    transactions.forEach(t => {
      if (t.wallet_id && !seen.has(t.wallet_id)) {
        seen.set(t.wallet_id, t.user_name ? `${t.user_name} (wallet)` : t.wallet_id.substring(0, 8).toUpperCase());
      }
    });
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [transactions]);

  const txUniqueHubs = useMemo(() =>
    [...new Set(transactions.map(t => t.hub_office).filter(Boolean))].sort() as string[],
  [transactions]);

  const txUniqueStates = useMemo(() =>
    [...new Set(transactions.map(t => t.state).filter(Boolean))].sort() as string[],
  [transactions]);

  const txUniqueLocalities = useMemo(() =>
    [...new Set(transactions.map(t => t.locality).filter(Boolean))].sort() as string[],
  [transactions]);

  const txUniqueMmps = useMemo(() => {
    const seen = new Map<string, string>();
    transactions.forEach(t => { if (t.mmp_id && t.mmp_name) seen.set(t.mmp_id, t.mmp_name); });
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [transactions]);

  const txActiveFilterCount = [
    txSearch,
    txTypeFilter !== 'all' ? txTypeFilter : '',
    txAmountFilter !== 'all' ? txAmountFilter : '',
    txUserFilter !== 'all' ? txUserFilter : '',
    txWalletFilter !== 'all' ? txWalletFilter : '',
    txHubFilter !== 'all' ? txHubFilter : '',
    txStateFilter !== 'all' ? txStateFilter : '',
    txLocalityFilter !== 'all' ? txLocalityFilter : '',
    txMmpFilter !== 'all' ? txMmpFilter : '',
    txDateFrom, txDateTo,
  ].filter(Boolean).length;

  const filteredClaimedSites = useMemo(() => {
    return claimedSites.filter(site => {
      const globalSearch = debouncedSearch.toLowerCase();
      const localSearch = debouncedClaimedSiteSearch.toLowerCase();
      
      const resolvedMmpName = mmpById[site.mmp_id!]?.name || site.mmp_name || '';

      const matchesGlobalSearch = !globalSearch ||
        site.site_name?.toLowerCase().includes(globalSearch) ||
        site.site_code?.toLowerCase().includes(globalSearch) ||
        site.accepted_by_name?.toLowerCase().includes(globalSearch) ||
        site.state?.toLowerCase().includes(globalSearch) ||
        site.locality?.toLowerCase().includes(globalSearch) ||
        resolvedMmpName.toLowerCase().includes(globalSearch);
      
      const matchesLocalSearch = !localSearch ||
        site.site_name?.toLowerCase().includes(localSearch) ||
        site.site_code?.toLowerCase().includes(localSearch);
      
      const matchesStatus = statusFilter === 'all' || normalizeStatus(site.status) === statusFilter;
      const matchesState = stateFilter === 'all' || site.state === stateFilter;
      const matchesLocality = localityFilter === 'all' || site.locality === localityFilter;
      const matchesActivity = activityFilter === 'all' || site.main_activity === activityFilter;
      const matchesClaimedBy = claimedByFilter === 'all' || site.accepted_by_name === claimedByFilter;
      // claimedMmpFilter stores the UUID (mmp_file_id) — compare directly for reliability
      const matchesMmp = claimedMmpFilter === 'all' || site.mmp_id === claimedMmpFilter;
      
      const matchesNoCost = !claimedNoCostFilter || (site.transport_fee == null || site.transport_fee === 0);
      return matchesGlobalSearch && matchesLocalSearch && matchesStatus && matchesState && matchesLocality && matchesActivity && matchesClaimedBy && matchesMmp && matchesNoCost;
    });
  }, [claimedSites, debouncedSearch, debouncedClaimedSiteSearch, statusFilter, stateFilter, localityFilter, activityFilter, claimedByFilter, claimedMmpFilter, claimedNoCostFilter, mmpById]);

  // Get unique values for claimed sites filters
  const claimedSitesFilterOptions = useMemo(() => {
    const states = [...new Set(claimedSites.map(s => s.state).filter(Boolean))].sort();

    const stateFiltered = claimedSites.filter(s => stateFilter === 'all' || s.state === stateFilter);

    const localities = [...new Set(
      stateFiltered.map(s => s.locality).filter(Boolean)
    )].sort();

    const stateLocalityFiltered = stateFiltered.filter(s => localityFilter === 'all' || s.locality === localityFilter);

    const activities = [...new Set(
      stateLocalityFiltered.map(s => s.main_activity).filter(Boolean)
    )].sort();

    const claimedByUsers = [...new Set(
      stateLocalityFiltered
        .filter(s => activityFilter === 'all' || s.main_activity === activityFilter)
        .map(s => s.accepted_by_name)
        .filter(Boolean)
    )].sort();

    // Dynamic status options — built from actual data so nothing is ever missing
    const statusOptions = [...new Set(
      claimedSites.map(s => normalizeStatus(s.status)).filter(Boolean)
    )].sort((a, b) => (STATUS_LABELS[a] || a).localeCompare(STATUS_LABELS[b] || b));

    // Derive MMP options from the mmps state (same source as MMP Management page).
    // Key = UUID (mmp_file_id), label = real MMP name. Falls back to inline-resolved name
    // or raw UUID for any ID not yet in the mmps state (e.g. before loadMMPs finishes).
    const claimedMmpIds = new Set(claimedSites.map(s => s.mmp_id).filter(Boolean));
    const mmpOptionMap = new Map<string, string>(); // id → label
    // Primary: use mmps state (has real names, same data source as MMP Management page)
    mmps.forEach(m => {
      if (m.id && claimedMmpIds.has(m.id)) {
        mmpOptionMap.set(m.id, m.name || `MMP ${m.month ?? '?'}/${m.year ?? '?'}`);
      }
    });
    // Fallback: for any IDs not yet in mmps, use inline-resolved name or short UUID
    claimedSites.forEach(s => {
      if (s.mmp_id && !mmpOptionMap.has(s.mmp_id)) {
        const label = mmpById[s.mmp_id]?.name || s.mmp_name || `MMP-${String(s.mmp_id).slice(0, 8).toUpperCase()}`;
        mmpOptionMap.set(s.mmp_id, label);
      }
    });
    const mmpOptions = [...mmpOptionMap.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return { states, localities, activities, claimedByUsers, mmpOptions, statusOptions };
  }, [claimedSites, stateFilter, localityFilter, activityFilter, mmpById, mmps]);

  const filteredDispatchedSites = useMemo(() => {
    return dispatchedSites.filter(site => {
      const matchesSearch = 
        site.site_name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        site.site_code?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        site.dispatched_by_name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        site.state?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        site.locality?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        site.hub_office?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (site as any).mmp_name?.toLowerCase().includes(debouncedSearch.toLowerCase());

      const matchesState    = dispatchedStateFilter    === 'all' || site.state         === dispatchedStateFilter;
      const matchesLocality = dispatchedLocalityFilter === 'all' || site.locality      === dispatchedLocalityFilter;
      const matchesActivity = dispatchedActivityFilter === 'all' || site.main_activity === dispatchedActivityFilter;
      const matchesHub      = dispatchedHubFilter      === 'all' || site.hub_office    === dispatchedHubFilter;
      const matchesMmp      = dispatchedMmpFilter      === 'all' || site.mmp_file_id   === dispatchedMmpFilter;
      const matchesNoCost   = !dispatchedNoCostFilter  || (site.transport_fee == null && site.enumerator_fee == null);

      return matchesSearch && matchesState && matchesLocality && matchesActivity && matchesHub && matchesMmp && matchesNoCost;
    });
  }, [dispatchedSites, debouncedSearch, dispatchedStateFilter, dispatchedLocalityFilter, dispatchedActivityFilter, dispatchedHubFilter, dispatchedMmpFilter, dispatchedNoCostFilter]);

  // Get unique values for dispatched sites filters
  const dispatchedSitesFilterOptions = useMemo(() => {
    const states = [...new Set(dispatchedSites.map(s => s.state).filter(Boolean))].sort() as string[];
    const localities = [...new Set(
      dispatchedSites
        .filter(s => dispatchedStateFilter === 'all' || s.state === dispatchedStateFilter)
        .map(s => s.locality)
        .filter(Boolean)
    )].sort() as string[];
    const activities = [...new Set(dispatchedSites.map(s => s.main_activity).filter(Boolean))].sort() as string[];
    const hubs = [...new Set(dispatchedSites.map(s => s.hub_office).filter(Boolean))].sort() as string[];
    // Derive MMP options from dispatched sites data (mmp_name now baked in at load time).
    // Use mmp_file_id as the filter key so the comparison in filteredDispatchedSites stays correct.
    const mmpEntries = new Map<string, string>();
    dispatchedSites.forEach(s => {
      if (s.mmp_file_id) mmpEntries.set(s.mmp_file_id, (s as any).mmp_name || s.mmp_file_id);
    });
    const mmpOptions = [...mmpEntries.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return { states, localities, activities, hubs, mmpOptions };
  }, [dispatchedSites, dispatchedStateFilter]);

  const filteredMMPs = useMemo(() => {
    return mmps.filter(mmp => {
      const matchesSearch = 
        mmp.name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        mmp.project_name?.toLowerCase().includes(debouncedSearch.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || mmp.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [mmps, debouncedSearch, statusFilter]);

  const getFilterOptions = () => {
    switch (activeTab) {
      case 'site-visits':
        // Flow: New → Approved → Dispatched → Accepted → Ongoing → Completed (+ Rejected)
        return [
          { value: 'all', label: 'All Statuses' },
          { value: 'new', label: 'New Sites' },
          { value: 'approved', label: 'Approved' },
          { value: 'dispatched', label: 'Dispatched' },
          { value: 'accepted', label: 'Accepted' },
          { value: 'ongoing', label: 'Ongoing' },
          { value: 'completed', label: 'Completed' },
          { value: 'rejected', label: 'Rejected' },
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
        // Flow: Accepted → Ongoing → Completed (sites that have been claimed)
        return [
          { value: 'all', label: 'All Statuses' },
          { value: 'accepted', label: 'Accepted' },
          { value: 'ongoing', label: 'Ongoing' },
          { value: 'completed', label: 'Completed' },
          { value: 'submitted', label: 'Submitted' },
          { value: 'wfp_confirmed', label: 'WFP Confirmed' },
          { value: 'not_covered', label: 'Not Covered' },
          { value: 'verified', label: 'Verified' },
          { value: 'rejected', label: 'Rejected' },
          { value: 'returned_to_fom', label: 'Returned to FOM' },
        ];
      case 'dispatched-sites':
        // Flow: Dispatched → Assigned (sites ready for claiming)
        return [
          { value: 'all', label: 'All Statuses' },
          { value: 'dispatched', label: 'Dispatched' },
          { value: 'assigned', label: 'Assigned' },
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
    else if (activeTab === 'transactions') { loadedTabsRef.current.delete('transactions'); setTxError(null); loadTransactions(); }
    else if (activeTab === 'claimed-sites') loadClaimedSites();
    else if (activeTab === 'dispatched-sites') loadDispatchedSites();
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
    <div className="space-y-5 p-4 md:p-6" data-testid="page-super-admin-data-management">
      {/* Compact Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Data Management Center</h1>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Manage site visits, wallets, transactions & MMPs
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={refreshCurrentTab}
            disabled={
              activeTab === 'transactions' ? txLoading :
              activeTab === 'site-visits' ? loadingVisits :
              activeTab === 'wallets' ? loadingWallets :
              activeTab === 'claimed-sites' ? loadingClaimed :
              activeTab === 'dispatched-sites' ? loadingDispatched :
              activeTab === 'mmps' ? loadingMMPs : false
            }
            data-testid="button-refresh"
          >
            <RefreshCw className={`h-4 w-4 ${(
              activeTab === 'transactions' ? txLoading :
              activeTab === 'site-visits' ? loadingVisits :
              activeTab === 'wallets' ? loadingWallets :
              activeTab === 'claimed-sites' ? loadingClaimed :
              activeTab === 'dispatched-sites' ? loadingDispatched :
              activeTab === 'mmps' ? loadingMMPs : false
            ) ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline ml-2">Refresh</span>
          </Button>
          <Button variant="outline" data-testid="button-export">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline ml-2">Export</span>
          </Button>
        </div>
      </div>

      {/* Compact Warning Banner */}
      <div className="flex items-center gap-3 p-3 rounded-lg border border-yellow-300/50 dark:border-yellow-900/50 bg-gradient-to-r from-yellow-50/80 to-orange-50/80 dark:from-yellow-950/20 dark:to-orange-950/20">
        <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 shrink-0" />
        <p className="text-xs text-yellow-700 dark:text-yellow-300">
          <span className="font-medium">Admin Mode:</span> All actions are logged. Affected users receive notifications.
        </p>
      </div>

      {/* Clickable Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatsCard
          title="Site Visits"
          value={stats.totalSiteVisits}
          subtitle={`${stats.verifiedVisits} verified`}
          icon={MapPin}
          color="success"
          onClick={() => setActiveTab('site-visits')}
          isActive={activeTab === 'site-visits'}
        />
        <StatsCard
          title="Wallets"
          value={stats.totalWallets}
          subtitle={`${stats.totalEarned.toLocaleString()} SDG`}
          icon={Wallet}
          color="primary"
          onClick={() => setActiveTab('wallets')}
          isActive={activeTab === 'wallets'}
        />
        <StatsCard
          title="Transactions"
          value={transactions.length > 0 ? transactions.length : (quickCounts?.transactions ?? 0)}
          subtitle={transactions.length > 0 ? `${stats.creditTransactions} cr / ${stats.debitTransactions} db` : (quickCounts?.transactions != null ? 'Loading details…' : '0 cr / 0 db')}
          icon={DollarSign}
          color="warning"
          onClick={() => setActiveTab('transactions')}
          isActive={activeTab === 'transactions'}
        />
        <StatsCard
          title="Claimed Sites"
          value={claimedSites.length > 0 ? stats.totalClaimedSites : (quickCounts?.claimed ?? 0)}
          subtitle={claimedSites.length > 0 ? `${stats.assignedSites} accepted` : (quickCounts?.claimed != null ? 'Loading details…' : '0 accepted')}
          icon={Users}
          color="danger"
          onClick={() => setActiveTab('claimed-sites')}
          isActive={activeTab === 'claimed-sites'}
        />
        <StatsCard
          title="Dispatched Sites"
          value={dispatchedSites.length > 0 ? stats.totalDispatchedSites : (quickCounts?.dispatched ?? 0)}
          subtitle={dispatchedSites.length > 0 ? `${stats.uniqueStatesDispatched} states` : (quickCounts?.dispatched != null ? 'Loading details…' : '0 states')}
          icon={Send}
          color="warning"
          onClick={() => setActiveTab('dispatched-sites')}
          isActive={activeTab === 'dispatched-sites'}
        />
      </div>

      {/* Search and Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
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
          <SelectTrigger className="w-full sm:w-[160px]" data-testid="select-status-filter">
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
      </div>

      {/* Tabs with horizontal scroll on mobile */}
      <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); setStatusFilter('all'); }}>
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="inline-flex w-auto min-w-full md:min-w-0 h-10 p-1 bg-muted/50">
            <TabsTrigger value="site-visits" className="gap-1.5 px-3 text-xs sm:text-sm whitespace-nowrap" data-testid="tab-site-visits">
              <MapPin className="h-3.5 w-3.5" />
              <span>Visits</span>
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{filteredSiteVisits.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="wallets" className="gap-1.5 px-3 text-xs sm:text-sm whitespace-nowrap" data-testid="tab-wallets">
              <Wallet className="h-3.5 w-3.5" />
              <span>Wallets</span>
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{filteredWallets.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="transactions" className="gap-1.5 px-3 text-xs sm:text-sm whitespace-nowrap" data-testid="tab-transactions">
              <DollarSign className="h-3.5 w-3.5" />
              <span>Transactions</span>
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{filteredTransactions.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="claimed-sites" className="gap-1.5 px-3 text-xs sm:text-sm whitespace-nowrap" data-testid="tab-claimed-sites">
              <Users className="h-3.5 w-3.5" />
              <span>Claimed</span>
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{filteredClaimedSites.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="dispatched-sites" className="gap-1.5 px-3 text-xs sm:text-sm whitespace-nowrap" data-testid="tab-dispatched-sites">
              <Send className="h-3.5 w-3.5" />
              <span>Dispatched</span>
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{filteredDispatchedSites.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="mmps" className="gap-1.5 px-3 text-xs sm:text-sm whitespace-nowrap" data-testid="tab-mmps">
              <FileText className="h-3.5 w-3.5" />
              <span>MMPs</span>
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{filteredMMPs.length}</Badge>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="site-visits" className="mt-4">
          <MmpFilterBar
            title="Filter Site Visits"
            mmpOptions={svFilterOptions.mmpOptions}
            mmpFilter={svMmpFilter}
            onMmpFilterChange={setSvMmpFilter}
            statusOptions={[...new Set(siteVisits.map(s => s.status).filter(Boolean))].sort()}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            hubOptions={svFilterOptions.hubs}
            hubFilter={svHubFilter}
            onHubFilterChange={setSvHubFilter}
            stateOptions={svFilterOptions.states}
            stateFilter={svStateFilter}
            onStateFilterChange={(val) => { setSvStateFilter(val); setSvLocalityFilter('all'); }}
            localityOptions={svFilterOptions.localities}
            localityFilter={svLocalityFilter}
            onLocalityFilterChange={setSvLocalityFilter}
            totalCount={siteVisits.length}
            filteredCount={filteredSiteVisits.length}
            onClearAll={() => {
              setSvMmpFilter('all');
              setSvStateFilter('all');
              setSvLocalityFilter('all');
              setSvHubFilter('all');
              setStatusFilter('all');
            }}
          />
          <Card>
            <CardHeader className="border-b py-3 px-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-green-500/10">
                    <MapPin className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Completed Site Visits</CardTitle>
                    <CardDescription className="text-xs">
                      Reset visits to remove associated earnings
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="text-sm px-2 py-0.5">
                  {filteredSiteVisits.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingVisits ? (
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
                        <TableHead className="font-semibold">MMP</TableHead>
                        <TableHead className="font-semibold">Data Collector</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="font-semibold">Completed</TableHead>
                        <TableHead className="font-semibold">Fee</TableHead>
                        <TableHead className="text-right font-semibold">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSiteVisits.map((sv) => (
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
                          <TableCell className="text-sm">
                            {sv.mmp_name || '—'}
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
                  {false && (
                    <div className="text-center py-4 text-sm text-muted-foreground border-t">
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wallets" className="mt-4">
          <Card>
            <CardHeader className="border-b py-3 px-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10">
                    <Wallet className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">User Wallets</CardTitle>
                    <CardDescription className="text-xs">
                      Reset balances removes all transactions
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="text-sm px-2 py-0.5">
                  {filteredWallets.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingWallets ? (
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

        <TabsContent value="transactions" className="mt-4">
          <Card>
            <CardHeader className="border-b py-3 px-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-yellow-500/10">
                    <DollarSign className="h-4 w-4 text-yellow-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Wallet Transactions</CardTitle>
                    <CardDescription className="text-xs">
                      Delete transactions to adjust wallet balances
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {txActiveFilterCount > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {txActiveFilterCount} filter{txActiveFilterCount > 1 ? 's' : ''} active
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-sm px-2 py-0.5">
                    {filteredTransactions.length}
                  </Badge>
                </div>
              </div>

              {/* Filter bar */}
              <div className="mt-3 flex flex-wrap gap-2">
                {/* Search */}
                <div className="relative flex-1 min-w-[160px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    value={txSearch}
                    onChange={e => setTxSearch(e.target.value)}
                    placeholder="Search user, type, description…"
                    className="pl-8 h-8 text-xs"
                    data-testid="input-tx-search"
                  />
                </div>

                {/* Type */}
                <Select value={txTypeFilter} onValueChange={setTxTypeFilter}>
                  <SelectTrigger className="h-8 text-xs w-[130px]" data-testid="select-tx-type">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {txUniqueTypes.map(type => (
                      <SelectItem key={type} value={type} className="capitalize">{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Amount direction */}
                <Select value={txAmountFilter} onValueChange={setTxAmountFilter}>
                  <SelectTrigger className="h-8 text-xs w-[120px]" data-testid="select-tx-amount">
                    <SelectValue placeholder="All amounts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All amounts</SelectItem>
                    <SelectItem value="credit">Credits (+)</SelectItem>
                    <SelectItem value="debit">Debits (−)</SelectItem>
                  </SelectContent>
                </Select>

                {/* User */}
                <Select value={txUserFilter} onValueChange={setTxUserFilter}>
                  <SelectTrigger className="h-8 text-xs w-[150px]" data-testid="select-tx-user">
                    <SelectValue placeholder="All users" />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    <SelectItem value="all">All users</SelectItem>
                    {txUniqueUsers.map(([uid, uname]) => (
                      <SelectItem key={uid} value={uid}>{uname}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Wallet */}
                <Select value={txWalletFilter} onValueChange={setTxWalletFilter}>
                  <SelectTrigger className="h-8 text-xs w-[160px]" data-testid="select-tx-wallet">
                    <SelectValue placeholder="All wallets" />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    <SelectItem value="all">All wallets</SelectItem>
                    {txUniqueWallets.map(([wid, wname]) => (
                      <SelectItem key={wid} value={wid}>{wname}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Hub */}
                <Select value={txHubFilter} onValueChange={setTxHubFilter}>
                  <SelectTrigger className="h-8 text-xs w-[140px]" data-testid="select-tx-hub">
                    <SelectValue placeholder="All hubs" />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    <SelectItem value="all">All hubs</SelectItem>
                    {txUniqueHubs.map(hub => (
                      <SelectItem key={hub} value={hub}>{hub}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* State */}
                <Select value={txStateFilter} onValueChange={setTxStateFilter}>
                  <SelectTrigger className="h-8 text-xs w-[140px]" data-testid="select-tx-state">
                    <SelectValue placeholder="All states" />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    <SelectItem value="all">All states</SelectItem>
                    {txUniqueStates.map(state => (
                      <SelectItem key={state} value={state}>{state}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Locality */}
                <Select value={txLocalityFilter} onValueChange={setTxLocalityFilter}>
                  <SelectTrigger className="h-8 text-xs w-[150px]" data-testid="select-tx-locality">
                    <SelectValue placeholder="All localities" />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    <SelectItem value="all">All localities</SelectItem>
                    {txUniqueLocalities.map(loc => (
                      <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* MMP */}
                <Select value={txMmpFilter} onValueChange={setTxMmpFilter}>
                  <SelectTrigger className="h-8 text-xs w-[160px]" data-testid="select-tx-mmp">
                    <SelectValue placeholder="All MMPs" />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    <SelectItem value="all">All MMPs</SelectItem>
                    {txUniqueMmps.map(([mid, mname]) => (
                      <SelectItem key={mid} value={mid}>{mname}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Date from */}
                <div className="relative">
                  <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    type="date"
                    value={txDateFrom}
                    onChange={e => setTxDateFrom(e.target.value)}
                    className="pl-7 h-8 text-xs w-[140px]"
                    data-testid="input-tx-date-from"
                  />
                </div>

                {/* Date to */}
                <div className="relative">
                  <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    type="date"
                    value={txDateTo}
                    onChange={e => setTxDateTo(e.target.value)}
                    className="pl-7 h-8 text-xs w-[140px]"
                    data-testid="input-tx-date-to"
                  />
                </div>

                {/* Clear filters */}
                {txActiveFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs text-muted-foreground"
                    onClick={() => {
                      setTxSearch('');
                      setTxTypeFilter('all');
                      setTxAmountFilter('all');
                      setTxUserFilter('all');
                      setTxWalletFilter('all');
                      setTxHubFilter('all');
                      setTxStateFilter('all');
                      setTxLocalityFilter('all');
                      setTxMmpFilter('all');
                      setTxDateFrom('');
                      setTxDateTo('');
                    }}
                    data-testid="button-tx-clear-filters"
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {txLoading ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : txError ? (
                <div className="text-center py-16">
                  <DollarSign className="h-12 w-12 text-destructive mx-auto mb-4" />
                  <p className="text-destructive font-medium mb-2">Failed to load transactions</p>
                  <p className="text-muted-foreground text-sm mb-4">{txError}</p>
                  <button onClick={() => { loadedTabsRef.current.delete('transactions'); loadTransactions(); }} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
                    Retry
                  </button>
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="text-center py-16">
                  <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No transactions found</p>
                  {transactions.length === 0 && (
                    <button onClick={() => { loadedTabsRef.current.delete('transactions'); loadTransactions(); }} className="mt-4 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
                      Load Transactions
                    </button>
                  )}
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
                      {filteredTransactions.map((t) => (
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
                            <div className="flex items-center justify-end gap-1.5">
                              {t.amount > 0 && (t.type === 'earning' || t.type === 'site_visit_fee' || t.type === 'adjustment') && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openReverseEarningDialog(t)}
                                  className="border-orange-500 text-orange-600 hover:bg-orange-50"
                                  data-testid={`button-reverse-earning-${t.id}`}
                                >
                                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                                  Reverse
                                </Button>
                              )}
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => openDeleteTransactionDialog(t)}
                                data-testid={`button-delete-transaction-${t.id}`}
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {txHasMore && (
                    <div className="text-center py-4 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={txLoadingMore}
                        onClick={() => loadTransactions(txOffset + TX_PAGE_SIZE, true)}
                        data-testid="button-tx-load-more"
                      >
                        {txLoadingMore ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                        {txLoadingMore ? 'Loading…' : `Load more transactions (showing ${transactions.length})`}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="claimed-sites" className="mt-4">
          <Card>
            <CardHeader className="border-b py-3 px-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-red-500/10">
                    <Users className="h-4 w-4 text-red-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Claimed Sites</CardTitle>
                    <CardDescription className="text-xs">
                      Reclaim to release back to dispatch pool
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedClaimedSiteIds.size > 0 && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="gap-1.5"
                      onClick={openBulkReclaimDialog}
                      data-testid="button-bulk-reclaim"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reclaim {selectedClaimedSiteIds.size} selected
                    </Button>
                  )}
                  <Badge variant="outline" className="text-sm px-2 py-0.5">
                    {filteredClaimedSites.length}
                  </Badge>
                </div>
              </div>
              
              {/* Search by Site Name */}
              <div className="mt-3 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by site name or code..."
                  value={claimedSiteSearch}
                  onChange={(e) => setClaimedSiteSearch(e.target.value)}
                  className="pl-10"
                  data-testid="input-claimed-site-search"
                />
              </div>

              {/* ── Unified Filter Claimed Sites panel ── */}
              {(() => {
                const activeCount = [
                  claimedMmpFilter !== 'all',
                  statusFilter !== 'all',
                  stateFilter !== 'all',
                  localityFilter !== 'all',
                  activityFilter !== 'all',
                  claimedByFilter !== 'all',
                  claimedNoCostFilter,
                ].filter(Boolean).length;
                const clearAll = () => {
                  setClaimedMmpFilter('all');
                  setStatusFilter('all');
                  setStateFilter('all');
                  setLocalityFilter('all');
                  setActivityFilter('all');
                  setClaimedByFilter('all');
                  setClaimedNoCostFilter(false);
                };
                return (
                  <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/60 dark:bg-blue-950/20 dark:border-blue-800 p-3 space-y-3">
                    {/* Header row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Filter className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                        <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">Filter Claimed Sites</span>
                        <span className="text-xs text-blue-600/70 dark:text-blue-400/70">
                          — {filteredClaimedSites.length} of {claimedSites.length} sites
                        </span>
                        {activeCount > 0 && (
                          <span className="rounded-full bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 leading-none">
                            {activeCount} active
                          </span>
                        )}
                      </div>
                      {activeCount > 0 && (
                        <button
                          type="button"
                          onClick={clearAll}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                        >
                          <X className="h-3 w-3" /> Clear All
                        </button>
                      )}
                    </div>

                    {/* Filter grid: 2 cols mobile → 3 cols md */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {/* MMP */}
                      <div className="space-y-1">
                        <Label className="text-[11px] font-medium text-blue-700 dark:text-blue-300">MMP</Label>
                        <Select value={claimedMmpFilter} onValueChange={setClaimedMmpFilter}>
                          <SelectTrigger className="h-8 text-xs" data-testid="select-claimed-mmp-filter">
                            <SelectValue placeholder="All MMPs" />
                          </SelectTrigger>
                          <SelectContent className="max-h-64">
                            <SelectItem value="all">All MMPs</SelectItem>
                            {claimedSitesFilterOptions.mmpOptions.map(mmp => (
                              <SelectItem key={mmp.id} value={mmp.id}>{mmp.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Status */}
                      <div className="space-y-1">
                        <Label className="text-[11px] font-medium text-blue-700 dark:text-blue-300">Status</Label>
                        <Select
                          value={statusFilter !== 'all' ? (STATUS_LABELS[statusFilter] || statusFilter) : 'all'}
                          onValueChange={(val) => {
                            if (val === 'all') { setStatusFilter('all'); return; }
                            const key = Object.entries(STATUS_LABELS).find(([, v]) => v === val)?.[0] || val;
                            setStatusFilter(key);
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs" data-testid="select-claimed-status-filter">
                            <SelectValue placeholder="All Statuses" />
                          </SelectTrigger>
                          <SelectContent className="max-h-64">
                            <SelectItem value="all">All Statuses</SelectItem>
                            {claimedSitesFilterOptions.statusOptions.map(s => (
                              <SelectItem key={s} value={STATUS_LABELS[s] || s}>{STATUS_LABELS[s] || s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* State */}
                      <div className="space-y-1">
                        <Label className="text-[11px] font-medium text-blue-700 dark:text-blue-300">State</Label>
                        <Select value={stateFilter} onValueChange={(val) => { setStateFilter(val); setLocalityFilter('all'); }}>
                          <SelectTrigger className="h-8 text-xs" data-testid="select-claimed-state-filter">
                            <SelectValue placeholder="All States" />
                          </SelectTrigger>
                          <SelectContent className="max-h-64">
                            <SelectItem value="all">All States</SelectItem>
                            {claimedSitesFilterOptions.states.map(s => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Locality */}
                      <div className="space-y-1">
                        <Label className="text-[11px] font-medium text-blue-700 dark:text-blue-300">Locality</Label>
                        <Select value={localityFilter} onValueChange={setLocalityFilter}>
                          <SelectTrigger className="h-8 text-xs" data-testid="select-claimed-locality-filter">
                            <SelectValue placeholder="All Localities" />
                          </SelectTrigger>
                          <SelectContent className="max-h-64">
                            <SelectItem value="all">All Localities</SelectItem>
                            {claimedSitesFilterOptions.localities.map(l => (
                              <SelectItem key={l} value={l}>{l}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Activity */}
                      <div className="space-y-1">
                        <Label className="text-[11px] font-medium text-blue-700 dark:text-blue-300">Activity</Label>
                        <Select value={activityFilter} onValueChange={(val) => { setActivityFilter(val); setClaimedByFilter('all'); }}>
                          <SelectTrigger className="h-8 text-xs" data-testid="select-activity-filter">
                            <SelectValue placeholder="All Activities" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Activities</SelectItem>
                            {claimedSitesFilterOptions.activities.map(a => (
                              <SelectItem key={a} value={a}>{a}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Enumerator */}
                      <div className="space-y-1">
                        <Label className="text-[11px] font-medium text-blue-700 dark:text-blue-300">Enumerator</Label>
                        <Select value={claimedByFilter} onValueChange={setClaimedByFilter}>
                          <SelectTrigger className="h-8 text-xs" data-testid="select-claimed-by-filter">
                            <SelectValue placeholder="All Enumerators" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Enumerators</SelectItem>
                            {claimedSitesFilterOptions.claimedByUsers.map(user => (
                              <SelectItem key={user} value={user}>{user}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* No-transport-cost quick toggle */}
                    <button
                      type="button"
                      onClick={() => setClaimedNoCostFilter(v => !v)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        claimedNoCostFilter
                          ? 'bg-amber-500 border-amber-500 text-white'
                          : 'border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:border-amber-400 hover:text-amber-600'
                      }`}
                      data-testid="button-claimed-no-cost-filter"
                    >
                      <span className="h-2 w-2 rounded-full bg-current" />
                      No Transport Cost
                    </button>
                  </div>
                );
              })()}
            </CardHeader>
            <CardContent className="p-0">
              {loadingClaimed ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredClaimedSites.length === 0 ? (
                <div className="text-center py-16">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No claimed sites found</p>
                </div>
              ) : (
                <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-10 pr-0">
                          <input
                            type="checkbox"
                            className="rounded border-border"
                            aria-label="Select all filtered sites"
                            data-testid="checkbox-select-all-claimed"
                            checked={
                              filteredClaimedSites.slice(0, claimedVisibleCount).length > 0 &&
                              filteredClaimedSites.slice(0, claimedVisibleCount).every(s => selectedClaimedSiteIds.has(s.id))
                            }
                            onChange={(e) => {
                              const visible = filteredClaimedSites.slice(0, claimedVisibleCount);
                              if (e.target.checked) {
                                setSelectedClaimedSiteIds(prev => {
                                  const next = new Set(prev);
                                  visible.forEach(s => next.add(s.id));
                                  return next;
                                });
                              } else {
                                setSelectedClaimedSiteIds(prev => {
                                  const next = new Set(prev);
                                  visible.forEach(s => next.delete(s.id));
                                  return next;
                                });
                              }
                            }}
                          />
                        </TableHead>
                        <TableHead className="font-semibold">MMP</TableHead>
                        <TableHead className="font-semibold">Hub</TableHead>
                        <TableHead className="font-semibold">State</TableHead>
                        <TableHead className="font-semibold">Locality</TableHead>
                        <TableHead className="font-semibold">Site</TableHead>
                        <TableHead className="font-semibold">Claimed By</TableHead>
                        <TableHead className="font-semibold">Claimed At</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="font-semibold">Fees</TableHead>
                        <TableHead className="text-right font-semibold">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredClaimedSites.slice(0, claimedVisibleCount).map((site) => (
                        <TableRow key={site.id} className={`hover:bg-muted/30 ${selectedClaimedSiteIds.has(site.id) ? 'bg-destructive/5' : ''}`} data-testid={`row-claimed-site-${site.id}`}>
                          <TableCell className="pr-0">
                            <input
                              type="checkbox"
                              className="rounded border-border"
                              aria-label={`Select ${site.site_name}`}
                              data-testid={`checkbox-claimed-site-${site.id}`}
                              checked={selectedClaimedSiteIds.has(site.id)}
                              onChange={(e) => {
                                setSelectedClaimedSiteIds(prev => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(site.id); else next.delete(site.id);
                                  return next;
                                });
                              }}
                            />
                          </TableCell>
                          {/* MMP */}
                          <TableCell>
                            {(() => {
                              const mmp = site.mmp_id ? mmpById[site.mmp_id] : null;
                              const label = mmp
                                ? (mmp.name || (mmp as any).project_name || (mmp.month && mmp.year ? `MMP ${mmp.month}/${mmp.year}` : null) || `MMP-${site.mmp_id!.slice(0,8).toUpperCase()}`)
                                : (site.mmp_name || null);
                              return label ? (
                                <Badge variant="secondary" className="whitespace-nowrap text-xs max-w-[140px] truncate block">
                                  {label}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              );
                            })()}
                          </TableCell>
                          {/* Hub */}
                          <TableCell>
                            <span className="text-sm">{site.hub_office || '—'}</span>
                          </TableCell>
                          {/* State */}
                          <TableCell>
                            <span className="text-sm">{site.state || '—'}</span>
                          </TableCell>
                          {/* Locality */}
                          <TableCell>
                            <span className="text-sm text-muted-foreground">{site.locality || '—'}</span>
                          </TableCell>
                          {/* Site */}
                          <TableCell>
                            <div>
                              <p className="font-medium">{site.site_name}</p>
                              <p className="text-xs text-muted-foreground font-mono">
                                {site.site_code && site.site_code.length > 12
                                  ? site.site_code.slice(0, 8) + '…'
                                  : (site.site_code || '—')}
                              </p>
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
                            {(() => {
                              const ts = site.accepted_at || site.dispatched_at || (site as any).created_at;
                              return ts ? format(new Date(ts), 'MMM d, yyyy') : '—';
                            })()}
                          </TableCell>
                          <TableCell>{getStatusBadge(site.status)}</TableCell>
                          <TableCell>
                            <div className="text-sm space-y-1">
                              <div className="flex items-center gap-1">
                                <span className="text-muted-foreground">Enum:</span>
                                <span className="font-medium">
                                  {site.enumerator_fee != null ? site.enumerator_fee.toLocaleString() : '—'} SDG
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-muted-foreground">Trans:</span>
                                {editingTransportFee?.siteId === site.id ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min="0"
                                      className="w-20 h-6 border rounded px-1 text-xs bg-background"
                                      value={editingTransportFee.value}
                                      onChange={e => setEditingTransportFee(prev => prev ? { ...prev, value: e.target.value } : null)}
                                      disabled={editingTransportFee.saving}
                                      autoFocus
                                      data-testid={`input-transport-fee-${site.id}`}
                                    />
                                    <button
                                      className="h-5 w-5 flex items-center justify-center rounded text-green-600 hover:bg-green-50 disabled:opacity-40"
                                      disabled={editingTransportFee.saving || !editingTransportFee.value}
                                      onClick={() => handleSaveTransportFee(site.id, Number(editingTransportFee.value), 'claimed')}
                                      data-testid={`button-save-transport-fee-${site.id}`}
                                    >
                                      {editingTransportFee.saving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                    </button>
                                    <button
                                      className="h-5 w-5 flex items-center justify-center rounded text-red-500 hover:bg-red-50 disabled:opacity-40"
                                      disabled={editingTransportFee.saving}
                                      onClick={() => setEditingTransportFee(null)}
                                      data-testid={`button-cancel-transport-fee-${site.id}`}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <span className={`font-medium ${site.transport_fee == null || site.transport_fee === 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                                      {site.transport_fee != null ? `${site.transport_fee.toLocaleString()} SDG` : '—'}
                                    </span>
                                    <button
                                      className="h-4 w-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
                                      onClick={() => setEditingTransportFee({ siteId: site.id, value: String(site.transport_fee ?? ''), saving: false })}
                                      title="Edit transport fee"
                                      data-testid={`button-edit-transport-fee-${site.id}`}
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {selectedClaimedSiteIds.size > 0 ? (
                                <>
                                  <button
                                    type="button"
                                    title="Change Status"
                                    className="h-7 w-7 flex items-center justify-center rounded border border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950 transition-colors"
                                    onClick={() => openChangeStatusDialog(site)}
                                    data-testid={`button-change-status-${site.id}`}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Reclaim Site"
                                    className="h-7 w-7 flex items-center justify-center rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                                    onClick={() => openReclaimSiteDialog(site)}
                                    data-testid={`button-reclaim-${site.id}`}
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1 text-blue-600 border-blue-300 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-700 dark:hover:bg-blue-950"
                                    onClick={() => openChangeStatusDialog(site)}
                                    data-testid={`button-change-status-${site.id}`}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Change Status
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => openReclaimSiteDialog(site)}
                                    data-testid={`button-reclaim-${site.id}`}
                                  >
                                    <RotateCcw className="h-4 w-4 mr-1" />
                                    Reclaim
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination footer */}
                  {filteredClaimedSites.length > claimedVisibleCount && (
                    <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
                      <span className="text-xs text-muted-foreground">
                        Showing {claimedVisibleCount.toLocaleString()} of {filteredClaimedSites.length.toLocaleString()} sites
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-8"
                        onClick={() => setClaimedVisibleCount(c => c + CLAIMED_PAGE_SIZE)}
                        data-testid="button-claimed-load-more"
                      >
                        Show {Math.min(CLAIMED_PAGE_SIZE, filteredClaimedSites.length - claimedVisibleCount).toLocaleString()} more
                      </Button>
                    </div>
                  )}
                  {filteredClaimedSites.length > 0 && filteredClaimedSites.length <= claimedVisibleCount && filteredClaimedSites.length > CLAIMED_PAGE_SIZE && (
                    <div className="px-4 py-2 border-t bg-muted/20 text-center">
                      <span className="text-xs text-muted-foreground">All {filteredClaimedSites.length.toLocaleString()} sites shown</span>
                    </div>
                  )}
                </div>

                {/* Sticky bulk-action bar — outside overflow-x-auto so sticky positioning
                    attaches to the page scroll context, not the horizontal scroll wrapper */}
                {selectedClaimedSiteIds.size > 0 && (
                  <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-border bg-background/95 backdrop-blur px-4 py-2.5 shadow-[0_-2px_8px_rgba(0,0,0,0.08)]" data-testid="bulk-action-bar">
                    <span className="text-sm font-medium text-foreground">
                      {selectedClaimedSiteIds.size} site{selectedClaimedSiteIds.size !== 1 ? 's' : ''} selected
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-blue-600 border-blue-300 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-700 dark:hover:bg-blue-950"
                        onClick={() => {
                          setBulkChangeStatusTarget('');
                          setBulkChangeStatusReason('');
                          setBulkChangeStatusProgress(null);
                          setShowBulkChangeStatusDialog(true);
                        }}
                        data-testid="button-bulk-change-status"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Change Status
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="gap-1.5"
                        onClick={openBulkReclaimDialog}
                        data-testid="button-bulk-reclaim-bar"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reclaim Selected
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-muted-foreground hover:text-foreground"
                        onClick={() => setSelectedClaimedSiteIds(new Set())}
                        data-testid="button-deselect-all"
                      >
                        <X className="h-3.5 w-3.5" />
                        Deselect All
                      </Button>
                    </div>
                  </div>
                )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dispatched-sites" className="mt-4">
          <Card>
            <CardHeader className="border-b py-3 px-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-orange-500/10">
                    <Send className="h-4 w-4 text-orange-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Dispatched Sites</CardTitle>
                    <CardDescription className="text-xs">Sites awaiting data collector claims</CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="text-sm px-2 py-0.5">
                  {filteredDispatchedSites.length}
                </Badge>
              </div>
              
              {/* MMP-style filter bar for Dispatched Sites */}
              <div className="mt-3">
                <MmpFilterBar
                  title="Filter Dispatched Sites"
                  mmpOptions={dispatchedSitesFilterOptions.mmpOptions}
                  mmpFilter={dispatchedMmpFilter}
                  onMmpFilterChange={setDispatchedMmpFilter}
                  hubOptions={dispatchedSitesFilterOptions.hubs}
                  hubFilter={dispatchedHubFilter}
                  onHubFilterChange={setDispatchedHubFilter}
                  stateOptions={dispatchedSitesFilterOptions.states}
                  stateFilter={dispatchedStateFilter}
                  onStateFilterChange={(val) => { setDispatchedStateFilter(val); setDispatchedLocalityFilter('all'); setDispatchedActivityFilter('all'); }}
                  localityOptions={dispatchedSitesFilterOptions.localities}
                  localityFilter={dispatchedLocalityFilter}
                  onLocalityFilterChange={setDispatchedLocalityFilter}
                  totalCount={dispatchedSites.length}
                  filteredCount={filteredDispatchedSites.length}
                  onClearAll={() => { setDispatchedMmpFilter('all'); setDispatchedStateFilter('all'); setDispatchedLocalityFilter('all'); setDispatchedHubFilter('all'); setDispatchedActivityFilter('all'); }}
                />
              </div>
              {/* Extra filter: Activity */}
              <div className="mt-2 max-w-xs">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Activity</Label>
                  <Select value={dispatchedActivityFilter} onValueChange={setDispatchedActivityFilter}>
                    <SelectTrigger data-testid="select-dispatched-activity-filter">
                      <SelectValue placeholder="All Activities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Activities</SelectItem>
                      {dispatchedSitesFilterOptions.activities.map(activity => (
                        <SelectItem key={activity} value={activity}>{activity}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* No-cost quick filter */}
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDispatchedNoCostFilter(v => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    dispatchedNoCostFilter
                      ? 'bg-amber-500 border-amber-500 text-white'
                      : 'border-border text-muted-foreground hover:border-amber-400 hover:text-amber-600'
                  }`}
                  data-testid="button-dispatched-no-cost-filter"
                >
                  <span className="h-2 w-2 rounded-full bg-current" />
                  No Transport Cost
                </button>
                {dispatchedNoCostFilter && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    Showing {filteredDispatchedSites.length} site{filteredDispatchedSites.length !== 1 ? 's' : ''} without cost set
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingDispatched ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredDispatchedSites.length === 0 ? (
                <div className="text-center py-16">
                  <Send className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No dispatched sites found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">Site</TableHead>
                        <TableHead className="font-semibold">MMP</TableHead>
                        <TableHead className="font-semibold">Location</TableHead>
                        <TableHead className="font-semibold">Hub</TableHead>
                        <TableHead className="font-semibold">Dispatched At</TableHead>
                        <TableHead className="font-semibold">Fees</TableHead>
                        <TableHead className="text-right font-semibold">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDispatchedSites.map((site) => (
                        <TableRow key={site.id} className="hover:bg-muted/30" data-testid={`row-dispatched-site-${site.id}`}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{site.site_name}</p>
                              <p className="text-sm text-muted-foreground">{site.site_code}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const mmp = site.mmp_file_id ? mmpById[site.mmp_file_id] : null;
                              const label = mmp
                                ? (mmp.name || `MMP ${mmp.month ?? '?'}/${mmp.year ?? '?'}`)
                                : ((site as any).mmp_name || null);
                              return label ? (
                                <Badge variant="secondary" className="whitespace-nowrap text-xs max-w-[120px] truncate block">
                                  {label}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <p>{site.state}</p>
                              <p className="text-muted-foreground">{site.locality}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm">{site.hub_office || 'N/A'}</p>
                          </TableCell>
                          <TableCell>
                            {site.dispatched_at ? format(new Date(site.dispatched_at), 'MMM d, yyyy h:mm a') : 'N/A'}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm space-y-0.5">
                              <div className="flex items-center gap-1">
                                <span className="text-muted-foreground text-xs">Enum:</span>
                                <span className={`font-medium text-xs ${site.enumerator_fee == null ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                                  {site.enumerator_fee != null ? `${site.enumerator_fee.toLocaleString()} SDG` : '—'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-muted-foreground text-xs">Trans:</span>
                                {editingTransportFee?.siteId === site.id ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min="0"
                                      className="w-20 h-6 border rounded px-1 text-xs bg-background"
                                      value={editingTransportFee.value}
                                      onChange={e => setEditingTransportFee(prev => prev ? { ...prev, value: e.target.value } : null)}
                                      disabled={editingTransportFee.saving}
                                      autoFocus
                                      data-testid={`input-transport-fee-${site.id}`}
                                    />
                                    <button
                                      className="h-5 w-5 flex items-center justify-center rounded text-green-600 hover:bg-green-50 disabled:opacity-40"
                                      disabled={editingTransportFee.saving || !editingTransportFee.value}
                                      onClick={() => handleSaveTransportFee(site.id, Number(editingTransportFee.value), 'dispatched')}
                                      data-testid={`button-save-transport-fee-${site.id}`}
                                    >
                                      {editingTransportFee.saving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                    </button>
                                    <button
                                      className="h-5 w-5 flex items-center justify-center rounded text-red-500 hover:bg-red-50 disabled:opacity-40"
                                      disabled={editingTransportFee.saving}
                                      onClick={() => setEditingTransportFee(null)}
                                      data-testid={`button-cancel-transport-fee-${site.id}`}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <span className={`font-medium text-xs ${site.transport_fee == null || site.transport_fee === 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                                      {site.transport_fee != null ? `${site.transport_fee.toLocaleString()} SDG` : '—'}
                                    </span>
                                    <button
                                      className="h-4 w-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
                                      onClick={() => setEditingTransportFee({ siteId: site.id, value: String(site.transport_fee ?? ''), saving: false })}
                                      title="Edit transport fee"
                                      data-testid={`button-edit-transport-fee-${site.id}`}
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5"
                                onClick={() => {
                                  setSelectedDispatchedSite(site);
                                  setShowReturnToApprovedDialog(true);
                                }}
                                data-testid={`button-return-to-approved-${site.id}`}
                              >
                                <Undo2 className="h-3.5 w-3.5" />
                                Return to New Sites
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 text-orange-600 border-orange-300 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-700 dark:hover:bg-orange-950"
                                onClick={() => {
                                  setSelectedDispatchedSite(site);
                                  setShowReturnToFOMDialog(true);
                                }}
                                data-testid={`button-return-to-fom-${site.id}`}
                              >
                                <Undo2 className="h-3.5 w-3.5" />
                                Return to FOM
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {false && (
                    <div className="text-center py-4 text-sm text-muted-foreground border-t">
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mmps" className="mt-4">
          <Card>
            <CardHeader className="border-b py-3 px-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-purple-500/10">
                    <FileText className="h-4 w-4 text-purple-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Monthly Monitoring Plans</CardTitle>
                    <CardDescription className="text-xs">
                      Archive MMPs to hide from regular views
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="text-sm px-2 py-0.5">
                  {filteredMMPs.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingMMPs ? (
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
            {/* Site info */}
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

            {/* Advance request warnings */}
            {reclaimAdvanceLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Checking linked advance requests…
              </div>
            )}

            {!reclaimAdvanceLoading && reclaimAdvanceInfo && (reclaimAdvanceInfo.pending.length > 0 || reclaimAdvanceInfo.disbursed.length > 0) && (
              <div className="space-y-2">
                {/* Pending advances — can be auto-cancelled */}
                {reclaimAdvanceInfo.pending.length > 0 && (
                  <div className="bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-lg space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                          {reclaimAdvanceInfo.pending.length} pending advance request{reclaimAdvanceInfo.pending.length > 1 ? 's' : ''} found
                        </p>
                        <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-0.5">
                          Total: {reclaimAdvanceInfo.pending.reduce((s, r) => s + Number(r.requested_amount), 0).toLocaleString()} {reclaimAdvanceInfo.pending[0]?.currency || 'SDG'} — not yet disbursed
                        </p>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={cancelPendingAdvances}
                        onChange={e => setCancelPendingAdvances(e.target.checked)}
                        className="rounded"
                        data-testid="checkbox-cancel-pending-advances"
                      />
                      <span className="text-xs font-medium text-yellow-800 dark:text-yellow-300">
                        Automatically cancel these pending requests
                      </span>
                    </label>
                    {!cancelPendingAdvances && (
                      <p className="text-xs text-yellow-700 dark:text-yellow-400 pl-5">
                        Warning: leaving these open may allow approval and disbursement after the site is reclaimed.
                      </p>
                    )}
                  </div>
                )}

                {/* Already disbursed advances — cannot be auto-cancelled */}
                {reclaimAdvanceInfo.disbursed.length > 0 && (
                  <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-red-700 dark:text-red-400">
                          {reclaimAdvanceInfo.disbursed.length} already-disbursed advance{reclaimAdvanceInfo.disbursed.length > 1 ? 's' : ''}
                        </p>
                        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                          Total paid: {reclaimAdvanceInfo.disbursed.reduce((s, r) => s + Number(r.requested_amount), 0).toLocaleString()} {reclaimAdvanceInfo.disbursed[0]?.currency || 'SDG'} — cannot be automatically reversed. Manual reconciliation required.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Completed site warning */}
            {selectedClaimedSite?.status === 'completed' && (
              <div className="bg-orange-500/10 border border-orange-500/30 p-3 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-orange-700 dark:text-orange-400">Site is marked as completed</p>
                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
                      Wallet earnings already credited for this site will NOT be reversed. The site will be reverted to "Ongoing" status.
                    </p>
                  </div>
                </div>
              </div>
            )}

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
                <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-green-500" /> Clear enumerator fee (re-agreed with next assignee)</li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  {selectedClaimedSite?.transport_fee != null
                    ? <>Keep transport fee pre-filled at <span className="font-semibold text-foreground">{selectedClaimedSite.transport_fee.toLocaleString()} SDG</span></>
                    : 'Transport fee preserved for next dispatch'}
                </li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-green-500" /> Notify the former assignee</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-green-500" /> Log action for audit</li>
                {cancelPendingAdvances && reclaimAdvanceInfo && reclaimAdvanceInfo.pending.length > 0 && (
                  <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-green-500" /> Cancel {reclaimAdvanceInfo.pending.length} pending advance request{reclaimAdvanceInfo.pending.length > 1 ? 's' : ''}</li>
                )}
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

      {/* Bulk Reclaim Dialog */}
      <Dialog open={showBulkReclaimDialog} onOpenChange={(open) => { if (!bulkReclaimProcessing) setShowBulkReclaimDialog(open); }}>
        <DialogContent className="max-w-md" data-testid="dialog-bulk-reclaim">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-destructive" />
              Reclaim {selectedClaimedSiteIds.size} Sites
            </DialogTitle>
            <DialogDescription>
              Release all selected sites back to the dispatch pool. Pending advances will be automatically cancelled.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-destructive/5 border border-destructive/20 p-4 rounded-lg">
              <p className="text-sm font-semibold">{selectedClaimedSiteIds.size} site{selectedClaimedSiteIds.size !== 1 ? 's' : ''} selected</p>
              <p className="text-xs text-muted-foreground mt-1">
                Each site will be returned to the dispatch pool. Any pending advance requests for these sites will be cancelled automatically.
              </p>
            </div>

            {/* Disbursed advances panel */}
            {bulkReclaimAdvanceLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 border rounded-lg">
                <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
                Checking for disbursed advances…
              </div>
            ) : bulkReclaimAdvanceInfo.length > 0 ? (
              <div className="border border-yellow-500/40 rounded-lg overflow-hidden">
                <div className="bg-yellow-500/10 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-400">
                          {bulkReclaimAdvanceInfo.length} site{bulkReclaimAdvanceInfo.length !== 1 ? 's' : ''} have disbursed advances
                        </p>
                        <p className="text-xs text-yellow-700/80 dark:text-yellow-400/80 mt-0.5">
                          These cannot be automatically reversed and will require manual reconciliation.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="text-xs text-yellow-700 dark:text-yellow-400 underline underline-offset-2 shrink-0 hover:opacity-80"
                      onClick={() => setBulkDisbursedExpanded(v => !v)}
                    >
                      {bulkDisbursedExpanded ? 'Hide' : 'Show'} sites
                    </button>
                  </div>

                  {bulkDisbursedExpanded && (
                    <ul className="mt-2 space-y-1 max-h-36 overflow-y-auto pr-1">
                      {bulkReclaimAdvanceInfo.map(s => (
                        <li key={s.siteId} className="text-xs text-yellow-800 dark:text-yellow-300 flex items-center gap-1.5">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {s.siteName}
                          <span className="text-yellow-600 dark:text-yellow-500">
                            ({s.disbursed.length} disbursed)
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="bg-muted/30 px-3 py-2 flex items-center gap-2 border-t border-yellow-500/20">
                  <input
                    type="checkbox"
                    id="exclude-disbursed"
                    checked={excludeDisbursedFromBulk}
                    onChange={e => setExcludeDisbursedFromBulk(e.target.checked)}
                    disabled={bulkReclaimProcessing}
                    className="h-3.5 w-3.5 accent-destructive"
                  />
                  <label htmlFor="exclude-disbursed" className="text-xs cursor-pointer select-none">
                    Exclude these {bulkReclaimAdvanceInfo.length} site{bulkReclaimAdvanceInfo.length !== 1 ? 's' : ''} from this bulk reclaim
                  </label>
                </div>
              </div>
            ) : (
              <div className="bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-yellow-700 dark:text-yellow-400">
                    Already-disbursed advances cannot be automatically reversed and will require manual reconciliation.
                  </p>
                </div>
              </div>
            )}

            {bulkReclaimProgress && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Processing…</span>
                  <span>{bulkReclaimProgress.done} / {bulkReclaimProgress.total}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-destructive transition-all duration-300"
                    style={{ width: `${(bulkReclaimProgress.done / bulkReclaimProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="bulk-reclaim-reason">Reason for Reclaim <span className="text-destructive">*</span></Label>
              <Textarea
                id="bulk-reclaim-reason"
                value={bulkReclaimReason}
                onChange={(e) => setBulkReclaimReason(e.target.value)}
                placeholder="Explain why these sites are being reclaimed..."
                rows={3}
                disabled={bulkReclaimProcessing}
                data-testid="textarea-bulk-reclaim-reason"
              />
            </div>

            {(() => {
              const disbursedIds = new Set(bulkReclaimAdvanceInfo.map(s => s.siteId));
              const effectiveCount = excludeDisbursedFromBulk
                ? Array.from(selectedClaimedSiteIds).filter(id => !disbursedIds.has(id)).length
                : selectedClaimedSiteIds.size;
              return (
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-sm font-medium mb-2">This action will:</p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-green-500" /> Release {effectiveCount} site{effectiveCount !== 1 ? 's' : ''} to dispatch pool</li>
                    <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-green-500" /> Notify each former assignee</li>
                    <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-green-500" /> Cancel pending advances per site</li>
                    <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-green-500" /> Log all actions for audit</li>
                  </ul>
                </div>
              );
            })()}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowBulkReclaimDialog(false)}
              disabled={bulkReclaimProcessing}
            >
              Cancel
            </Button>
            {(() => {
              const disbursedIds = new Set(bulkReclaimAdvanceInfo.map(s => s.siteId));
              const effectiveCount = excludeDisbursedFromBulk
                ? Array.from(selectedClaimedSiteIds).filter(id => !disbursedIds.has(id)).length
                : selectedClaimedSiteIds.size;
              return (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleBulkReclaimSites}
                  disabled={bulkReclaimProcessing || !bulkReclaimReason.trim() || effectiveCount === 0}
                  data-testid="button-confirm-bulk-reclaim"
                >
                  {bulkReclaimProcessing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                  {bulkReclaimProcessing
                    ? `Reclaiming… (${bulkReclaimProgress?.done ?? 0}/${bulkReclaimProgress?.total ?? effectiveCount})`
                    : `Reclaim ${effectiveCount} Site${effectiveCount !== 1 ? 's' : ''}`}
                </Button>
              );
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return to New Sites Dialog */}
      <Dialog open={showReturnToApprovedDialog} onOpenChange={setShowReturnToApprovedDialog}>
        <DialogContent className="max-w-md" data-testid="dialog-return-to-approved">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo2 className="h-5 w-5 text-orange-600" />
              Return Site to New Sites
            </DialogTitle>
            <DialogDescription>
              Reset this dispatched site back to verified status. It will appear in the New Sites tab and go through the full workflow again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-orange-500/5 border border-orange-500/20 p-4 rounded-lg">
              <p className="font-semibold">{selectedDispatchedSite?.site_name}</p>
              <p className="text-sm text-muted-foreground">{selectedDispatchedSite?.site_code}</p>
              <div className="mt-2 pt-2 border-t border-orange-500/10">
                <p className="text-sm">
                  <span className="text-muted-foreground">Location:</span> {selectedDispatchedSite?.state}, {selectedDispatchedSite?.locality}
                </p>
                {selectedDispatchedSite?.dispatched_at && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Dispatched:</span> {format(new Date(selectedDispatchedSite.dispatched_at), 'MMM d, yyyy HH:mm')}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="return-reason">Reason for Return <span className="text-destructive">*</span></Label>
              <Textarea
                id="return-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this site is being returned to New Sites..."
                rows={3}
                data-testid="textarea-return-reason"
              />
            </div>

            <div className="bg-muted/50 p-3 rounded-lg">
              <p className="text-sm font-medium mb-2">This action will:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-green-500" /> Change status to "verified" (New Sites tab)</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-green-500" /> Clear all dispatch and cost information</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-green-500" /> Clear acceptance/claim data</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-green-500" /> Log action for audit trail</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReturnToApprovedDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={handleReturnToApproved}
              disabled={processing || !reason.trim()}
              data-testid="button-confirm-return-to-approved"
            >
              {processing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Undo2 className="h-4 w-4 mr-2" />}
              {processing ? 'Returning...' : 'Return to New Sites'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReasonPickerDialog
        open={showReturnToFOMDialog}
        onOpenChange={setShowReturnToFOMDialog}
        mode="reject"
        workflowType="site_visit"
        title="Return Site to FOM"
        description={
          selectedDispatchedSite ? (
            <div className="space-y-2">
              <p>This will return the site to the Field Operations Manager. All dispatch and cost fields will be cleared.</p>
              <div className="rounded-lg bg-muted/50 p-3 space-y-1 mt-2">
                <p className="font-semibold text-sm">{selectedDispatchedSite.site_name}</p>
                <p className="text-xs text-muted-foreground">{selectedDispatchedSite.site_code}</p>
                <p className="text-xs"><span className="text-muted-foreground">Location:</span> {selectedDispatchedSite.state}, {selectedDispatchedSite.locality}</p>
              </div>
            </div>
          ) : undefined
        }
        rejectLabel="Return to FOM"
        onConfirm={handleReturnToFOM}
        loading={processing}
      />

      <Dialog open={showResetSiteVisitDialog} onOpenChange={setShowResetSiteVisitDialog}>
        <DialogContent className="max-w-md" data-testid="dialog-reset-site-visit">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-destructive" />
              Reset Site Visit
            </DialogTitle>
            <DialogDescription>
              Reset this completed visit back to a previous status.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-destructive/5 border border-destructive/20 p-4 rounded-lg">
              <p className="font-semibold">{selectedSiteVisit?.site_name}</p>
              <p className="text-sm text-muted-foreground">{selectedSiteVisit?.site_code}</p>
              <p className="text-sm text-muted-foreground">MMP: {selectedSiteVisit?.mmp_name || '—'}</p>
              <div className="mt-2 pt-2 border-t border-destructive/10">
                <p className="text-sm">
                  <span className="text-muted-foreground">Collector:</span> {selectedSiteVisit?.accepted_by_name}
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Current Status:</span> {selectedSiteVisit?.status}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reset-target-status">Reset To <span className="text-destructive">*</span></Label>
              <Select value={resetTargetStatus} onValueChange={(v) => setResetTargetStatus(v as any)}>
                <SelectTrigger data-testid="select-reset-target-status">
                  <SelectValue placeholder="Select target status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New (unprocessed)</SelectItem>
                  <SelectItem value="approved">Approved (ready for dispatch)</SelectItem>
                  <SelectItem value="dispatched">Dispatched (awaiting claim)</SelectItem>
                  <SelectItem value="assigned">Assigned (claimed by collector)</SelectItem>
                </SelectContent>
              </Select>
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
                <li className="flex items-center gap-2"><XCircle className="h-3 w-3 text-red-500" /> Change status to "{resetTargetStatus}"</li>
                {(resetTargetStatus === 'new' || resetTargetStatus === 'approved') && (
                  <li className="flex items-center gap-2"><XCircle className="h-3 w-3 text-red-500" /> Remove collector assignment</li>
                )}
                <li className="flex items-center gap-2"><XCircle className="h-3 w-3 text-red-500" /> Clear completion data</li>
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

      {/* Reverse Earning Dialog */}
      <Dialog open={showReverseEarningDialog} onOpenChange={setShowReverseEarningDialog}>
        <DialogContent className="max-w-md" data-testid="dialog-reverse-earning">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-orange-600" />
              Reverse Earning
            </DialogTitle>
            <DialogDescription>
              Creates a negative adjustment transaction to offset this earning.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-orange-500/5 border border-orange-500/20 p-4 rounded-lg space-y-1">
              <p className="text-sm font-semibold">{selectedEarningTx?.user_name}</p>
              <p className="text-sm text-muted-foreground capitalize">{selectedEarningTx?.type?.replace(/_/g, ' ')}</p>
              <p className="text-sm font-bold text-green-600">
                +{selectedEarningTx?.amount?.toLocaleString()} {selectedEarningTx?.currency}
              </p>
              {selectedEarningTx?.description && (
                <p className="text-xs text-muted-foreground">{selectedEarningTx.description}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {selectedEarningTx?.created_at && format(new Date(selectedEarningTx.created_at), 'MMM d, yyyy HH:mm')}
              </p>
            </div>

            <div className="bg-muted/50 p-3 rounded-lg">
              <p className="text-sm font-medium mb-1">Effect of reversal:</p>
              <p className="text-sm text-red-600 font-bold">
                −{selectedEarningTx?.amount?.toLocaleString()} {selectedEarningTx?.currency} adjustment
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                A new "adjustment" transaction will be inserted. The original earning is kept for audit purposes.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reverse-reason">Reason for Reversal <span className="text-destructive">*</span></Label>
              <Textarea
                id="reverse-reason"
                value={reverseReason}
                onChange={e => setReverseReason(e.target.value)}
                placeholder="e.g. Site was reclaimed before work was completed..."
                rows={3}
                data-testid="textarea-reverse-reason"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReverseEarningDialog(false)}>Cancel</Button>
            <Button
              onClick={handleReverseEarning}
              disabled={reverseProcessing || !reverseReason.trim()}
              className="bg-orange-600 hover:bg-orange-700 text-white"
              data-testid="button-confirm-reverse-earning"
            >
              {reverseProcessing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              {reverseProcessing ? 'Reversing…' : 'Confirm Reversal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Status Dialog — status correction for Claimed Sites */}
      <Dialog open={showChangeStatusDialog} onOpenChange={setShowChangeStatusDialog}>
        <DialogContent className="max-w-md" data-testid="dialog-change-status">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-blue-600" />
              Change Site Status
            </DialogTitle>
            <DialogDescription>
              Admin correction — override the site's current status. This is logged for audit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-blue-500/5 border border-blue-500/20 p-4 rounded-lg">
              <p className="font-semibold">{changeStatusSite?.site_name}</p>
              <p className="text-sm text-muted-foreground">{changeStatusSite?.site_code}</p>
              <div className="mt-2 pt-2 border-t border-blue-500/10 flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Current:</span>
                <Badge variant="outline">{changeStatusSite?.status}</Badge>
                {changeStatusTarget && (
                  <>
                    <span className="text-muted-foreground">→</span>
                    <Badge className="bg-blue-500/10 text-blue-700 border-blue-500/20">
                      {ALL_CORRECTABLE_STATUSES.find(s => s.value === changeStatusTarget)?.label || changeStatusTarget}
                    </Badge>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="change-status-target">New Status <span className="text-destructive">*</span></Label>
              <Select value={changeStatusTarget} onValueChange={setChangeStatusTarget}>
                <SelectTrigger id="change-status-target" data-testid="select-change-status-target">
                  <SelectValue placeholder="Select target status…" />
                </SelectTrigger>
                <SelectContent>
                  {ALL_CORRECTABLE_STATUSES.filter(s => s.value !== changeStatusSite?.status).map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="change-status-reason">Reason <span className="text-destructive">*</span></Label>
              <Textarea
                id="change-status-reason"
                value={changeStatusReason}
                onChange={e => setChangeStatusReason(e.target.value)}
                placeholder="Explain why this status correction is needed (e.g. system error, data entry mistake)…"
                rows={3}
                data-testid="textarea-change-status-reason"
              />
            </div>

            {/* Wallet reversal option */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Wallet Transactions</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setChangeStatusReverseWallet(false)}
                  data-testid="btn-wallet-keep"
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-sm transition-all ${
                    !changeStatusReverseWallet
                      ? 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300'
                      : 'border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground/40'
                  }`}
                >
                  <DollarSign className={`h-5 w-5 ${!changeStatusReverseWallet ? 'text-blue-500' : 'text-muted-foreground'}`} />
                  <span className="font-medium">Keep Wallet</span>
                  <span className="text-xs text-center leading-tight opacity-75">Status change only — wallet untouched</span>
                </button>
                <button
                  type="button"
                  onClick={() => setChangeStatusReverseWallet(true)}
                  data-testid="btn-wallet-reverse"
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-sm transition-all ${
                    changeStatusReverseWallet
                      ? 'border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-300'
                      : 'border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground/40'
                  }`}
                >
                  <RotateCcw className={`h-5 w-5 ${changeStatusReverseWallet ? 'text-orange-500' : 'text-muted-foreground'}`} />
                  <span className="font-medium">Reverse Wallet</span>
                  <span className="text-xs text-center leading-tight opacity-75">Delete transactions &amp; cancel advances</span>
                </button>
              </div>
            </div>

            <div className={`p-3 rounded-lg ${changeStatusReverseWallet ? 'bg-orange-500/5 border border-orange-500/20' : 'bg-muted/50'}`}>
              <p className="text-sm font-medium mb-2">This action will:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-blue-500" /> Update the site's status in the database</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-blue-500" /> Log the change in the audit trail</li>
                {changeStatusReverseWallet ? (
                  <>
                    <li className="flex items-center gap-2"><AlertTriangle className="h-3 w-3 text-orange-500" /> Delete all wallet transactions for this site</li>
                    <li className="flex items-center gap-2"><AlertTriangle className="h-3 w-3 text-orange-500" /> Cancel any pending advance requests</li>
                    <li className="flex items-center gap-2"><AlertTriangle className="h-3 w-3 text-orange-500" /> Deduct reversed amounts from the enumerator's wallet balance</li>
                  </>
                ) : (
                  <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-muted-foreground/50" /> Wallet transactions are NOT touched</li>
                )}
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowChangeStatusDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleChangeStatus}
              disabled={changeStatusProcessing || !changeStatusTarget || !changeStatusReason.trim()}
              className={changeStatusReverseWallet ? 'bg-orange-600 hover:bg-orange-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}
              data-testid="button-confirm-change-status"
            >
              {changeStatusProcessing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Pencil className="h-4 w-4 mr-2" />}
              {changeStatusProcessing
                ? (changeStatusReverseWallet ? 'Reversing & Updating…' : 'Updating…')
                : (changeStatusReverseWallet ? 'Update + Reverse Wallet' : 'Update Status Only')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Change Status Dialog */}
      <Dialog open={showBulkChangeStatusDialog} onOpenChange={(open) => { if (!bulkChangeStatusProcessing) setShowBulkChangeStatusDialog(open); }}>
        <DialogContent className="max-w-md" data-testid="dialog-bulk-change-status">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-blue-600" />
              Change Status for {selectedClaimedSiteIds.size} Site{selectedClaimedSiteIds.size !== 1 ? 's' : ''}
            </DialogTitle>
            <DialogDescription>
              Apply the same status to all selected sites. This is logged for audit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-blue-500/5 border border-blue-500/20 p-4 rounded-lg">
              <p className="text-sm font-semibold">{selectedClaimedSiteIds.size} site{selectedClaimedSiteIds.size !== 1 ? 's' : ''} will be updated</p>
              {bulkChangeStatusTarget && (
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">→</span>
                  <Badge className="bg-blue-500/10 text-blue-700 border-blue-500/20">
                    {ALL_CORRECTABLE_STATUSES.find(s => s.value === bulkChangeStatusTarget)?.label || bulkChangeStatusTarget}
                  </Badge>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk-change-status-target">New Status <span className="text-destructive">*</span></Label>
              <Select value={bulkChangeStatusTarget} onValueChange={setBulkChangeStatusTarget} disabled={bulkChangeStatusProcessing}>
                <SelectTrigger id="bulk-change-status-target" data-testid="select-bulk-change-status-target">
                  <SelectValue placeholder="Select target status…" />
                </SelectTrigger>
                <SelectContent>
                  {ALL_CORRECTABLE_STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk-change-status-reason">Reason <span className="text-destructive">*</span></Label>
              <Textarea
                id="bulk-change-status-reason"
                value={bulkChangeStatusReason}
                onChange={e => setBulkChangeStatusReason(e.target.value)}
                placeholder="Explain why this bulk status correction is needed…"
                rows={3}
                disabled={bulkChangeStatusProcessing}
                data-testid="textarea-bulk-change-status-reason"
              />
            </div>

            {bulkChangeStatusProgress && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Processing…</span>
                  <span>{bulkChangeStatusProgress.done} / {bulkChangeStatusProgress.total}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${(bulkChangeStatusProgress.done / bulkChangeStatusProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <div className="bg-muted/50 p-3 rounded-lg">
              <p className="text-sm font-medium mb-2">This action will:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-blue-500" /> Update status for all {selectedClaimedSiteIds.size} selected site{selectedClaimedSiteIds.size !== 1 ? 's' : ''}</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-blue-500" /> Log each change in the audit trail</li>
                <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-muted-foreground/50" /> Wallet transactions are NOT touched</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowBulkChangeStatusDialog(false)}
              disabled={bulkChangeStatusProcessing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleBulkChangeStatus}
              disabled={bulkChangeStatusProcessing || !bulkChangeStatusTarget || !bulkChangeStatusReason.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="button-confirm-bulk-change-status"
            >
              {bulkChangeStatusProcessing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Pencil className="h-4 w-4 mr-2" />}
              {bulkChangeStatusProcessing
                ? `Updating… (${bulkChangeStatusProgress?.done ?? 0}/${bulkChangeStatusProgress?.total ?? selectedClaimedSiteIds.size})`
                : `Update ${selectedClaimedSiteIds.size} Site${selectedClaimedSiteIds.size !== 1 ? 's' : ''}`}
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
