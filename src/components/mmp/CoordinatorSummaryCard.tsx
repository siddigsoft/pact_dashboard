import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Users, User, MapPin, ChevronDown, ChevronRight, CheckCircle2, AlertCircle, Clock, XCircle, Wallet, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useDownPayment } from '@/context/downPayment/DownPaymentContext';
import { useUser } from '@/context/user/UserContext';

interface AdvanceInfo {
  status: string;
  requestedAmount: number;
  approvedAmount: number;
  totalPaid: number;
}

interface SiteStatusDetail {
  id: string;
  name: string;
  siteCode: string;
  status: string;
  statusLabel: string;
  statusCategory: 'verified' | 'returned' | 'rejected' | 'in_progress' | 'pending';
  locality: string;
  stateName: string;
  hubName: string;
  transportBudget?: number;
  reason: string;
  actionBy: string;
  actionAt: string;
  claimedBy: string;
}

interface CoordinatorInfo {
  id: string;
  name: string;
  sitesAssigned: number;
  sitesVerified: number;
  sitesReturned: number;
  sitesInProgress: number;
  sitesPending: number;
  receivedAt?: string;
  siteDetails: SiteStatusDetail[];
}

interface StateCoordinatorGroup {
  state: string;
  coordinators: CoordinatorInfo[];
  totalSites: number;
  verifiedSites: number;
  returnedSites: number;
}

interface CoordinatorSummaryCardProps {
  siteEntries: any[];
  mmpId?: string;
}

const ADVANCE_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending_supervisor: { label: 'Advance: Pending Supervisor', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  pending_admin:      { label: 'Advance: Pending Admin',      color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  approved:           { label: 'Advance: Approved',           color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  finance_processing: { label: 'Advance: Finance Processing', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  fully_paid:         { label: 'Advance: Fully Paid',         color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  partially_paid:     { label: 'Advance: Partially Paid',     color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' },
  cancelled:          { label: 'Advance: Cancelled',          color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  rejected:           { label: 'Advance: Rejected',           color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

function SiteDetailRow({ site, userNames, advance, onRequestFund }: { site: SiteStatusDetail; userNames: Record<string, string>; advance?: AdvanceInfo; onRequestFund?: (site: SiteStatusDetail) => void }) {
  const categoryColors: Record<string, string> = {
    verified: 'bg-green-50/80 dark:bg-green-900/15 border-green-100 dark:border-green-900/30',
    returned: 'bg-orange-50/80 dark:bg-orange-900/15 border-orange-100 dark:border-orange-900/30',
    rejected: 'bg-red-50/80 dark:bg-red-900/15 border-red-100 dark:border-red-900/30',
    in_progress: 'bg-blue-50/80 dark:bg-blue-900/15 border-blue-100 dark:border-blue-900/30',
    pending: 'bg-muted/50 border-border',
  };
  const badgeColors: Record<string, string> = {
    verified: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    returned: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    pending: 'bg-muted text-muted-foreground',
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) return format(d, 'MMM d, yyyy HH:mm');
    } catch { /* ignore */ }
    return '';
  };

  const resolvedActionBy = site.actionBy
    ? (userNames[site.actionBy] || site.actionBy)
    : '';

  const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

  const advanceCfg = advance ? ADVANCE_STATUS_CONFIG[advance.status] : null;

  return (
    <div className={`flex items-start gap-2 p-1.5 rounded border text-xs ${categoryColors[site.statusCategory]}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{site.name}</span>
          {site.siteCode && <span className="text-muted-foreground">({site.siteCode})</span>}
          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${badgeColors[site.statusCategory]}`}>
            {site.statusLabel}
          </Badge>
          {advance && advanceCfg ? (
            <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 flex items-center gap-1 ${advanceCfg.color}`}>
              <Wallet className="h-2.5 w-2.5" />
              {advanceCfg.label}
              {advance.requestedAmount > 0 && (
                <span className="ml-0.5 opacity-80">
                  {advance.totalPaid > 0
                    ? `(${advance.totalPaid.toLocaleString()} / ${advance.requestedAmount.toLocaleString()} SDG)`
                    : advance.approvedAmount > 0
                      ? `(${advance.approvedAmount.toLocaleString()} SDG)`
                      : `(${advance.requestedAmount.toLocaleString()} SDG)`}
                </span>
              )}
            </Badge>
          ) : (
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex items-center gap-1 text-muted-foreground border-dashed">
                <Wallet className="h-2.5 w-2.5" />
                No Advance Request
              </Badge>
              {onRequestFund && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRequestFund(site); }}
                  className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
                  title="Request transport advance for this site"
                >
                  <Plus className="h-2.5 w-2.5" />
                  Request Fund
                </button>
              )}
            </div>
          )}
        </div>
        {site.reason && (
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
            {site.reason}
          </p>
        )}
        {(resolvedActionBy || site.actionAt) && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {resolvedActionBy && !isUuid(resolvedActionBy) && <>By: {resolvedActionBy}</>}
            {site.actionAt && <>{resolvedActionBy ? ' ' : ''}{formatDate(site.actionAt)}</>}
          </p>
        )}
        {site.claimedBy && (
          <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <User className="h-2.5 w-2.5 shrink-0" />
            DC: {userNames[site.claimedBy] || (isUuid(site.claimedBy) ? site.claimedBy.slice(0, 8) + '…' : site.claimedBy)}
          </p>
        )}
      </div>
    </div>
  );
}

function LocalityGroup({ locality, sites, userNames, advanceMap, onRequestFund }: { locality: string; sites: SiteStatusDetail[]; userNames: Record<string, string>; advanceMap: Record<string, AdvanceInfo>; onRequestFund?: (site: SiteStatusDetail) => void }) {
  return (
    <div className="ml-2" data-testid={`locality-group-${locality}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <MapPin className="h-3 w-3 text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground">{locality}</span>
        <span className="text-[10px] text-muted-foreground">({sites.length})</span>
      </div>
      <div className="space-y-1 ml-4">
        {sites.map((site) => (
          <SiteDetailRow key={site.id} site={site} userNames={userNames} advance={advanceMap[site.id]} onRequestFund={onRequestFund} />
        ))}
      </div>
    </div>
  );
}

function StatusCategorySection({ 
  category, 
  sites, 
  userNames,
  advanceMap,
  onRequestFund,
}: { 
  category: 'verified' | 'returned' | 'rejected' | 'in_progress' | 'pending'; 
  sites: SiteStatusDetail[]; 
  userNames: Record<string, string>;
  advanceMap: Record<string, AdvanceInfo>;
  onRequestFund?: (site: SiteStatusDetail) => void;
}) {
  if (sites.length === 0) return null;

  const categoryConfig: Record<string, { label: string; icon: any; colorClass: string }> = {
    verified: { label: 'Verified', icon: CheckCircle2, colorClass: 'text-green-700 dark:text-green-400' },
    returned: { label: 'Returned', icon: XCircle, colorClass: 'text-orange-700 dark:text-orange-400' },
    rejected: { label: 'Rejected', icon: XCircle, colorClass: 'text-red-700 dark:text-red-400' },
    in_progress: { label: 'In Progress', icon: Clock, colorClass: 'text-blue-700 dark:text-blue-400' },
    pending: { label: 'Pending', icon: AlertCircle, colorClass: 'text-muted-foreground' },
  };

  const config = categoryConfig[category];
  const Icon = config.icon;

  const byLocality = new Map<string, SiteStatusDetail[]>();
  sites.forEach(site => {
    const loc = site.locality || 'Unknown Locality';
    if (!byLocality.has(loc)) byLocality.set(loc, []);
    byLocality.get(loc)!.push(site);
  });

  const sortedLocalities = Array.from(byLocality.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div>
      <p className={`text-[11px] font-semibold mb-1.5 flex items-center gap-1 ${config.colorClass}`}>
        <Icon className="h-3 w-3" /> {config.label} ({sites.length})
      </p>
      <div className="space-y-2">
        {sortedLocalities.map(([locality, locSites]) => (
          <LocalityGroup key={locality} locality={locality} sites={locSites} userNames={userNames} advanceMap={advanceMap} onRequestFund={onRequestFund} />
        ))}
      </div>
    </div>
  );
}

export default function CoordinatorSummaryCard({ siteEntries, mmpId }: CoordinatorSummaryCardProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [coordinatorNames, setCoordinatorNames] = useState<Record<string, string>>({});
  const [actionByNames, setActionByNames] = useState<Record<string, string>>({});
  const [advanceMap, setAdvanceMap] = useState<Record<string, AdvanceInfo>>({});

  const { createRequest } = useDownPayment();
  const { currentUser } = useUser();

  const [fundDialog, setFundDialog] = useState<{ open: boolean; site: SiteStatusDetail | null }>({ open: false, site: null });
  const [fundAmount, setFundAmount] = useState('');
  const [fundJustification, setFundJustification] = useState('');
  const [fundSubmitting, setFundSubmitting] = useState(false);

  const handleOpenRequestFund = (site: SiteStatusDetail) => {
    setFundDialog({ open: true, site });
    setFundAmount('');
    setFundJustification('');
  };

  const handleSubmitFundRequest = async () => {
    const site = fundDialog.site;
    if (!site || !currentUser) return;
    const amount = parseFloat(fundAmount);
    const budget = site.transportBudget && site.transportBudget > 0 ? site.transportBudget : amount;
    if (!amount || amount <= 0) return;
    if (!fundJustification.trim()) return;
    setFundSubmitting(true);
    try {
      const enumeratorId = site.claimedBy || currentUser.id;
      await createRequest({
        mmpSiteEntryId: site.id,
        siteName: site.name,
        requestedBy: enumeratorId,
        requesterRole: 'dataCollector',
        hubName: site.hubName || '',
        stateName: site.stateName || '',
        localityName: site.locality || '',
        totalTransportationBudget: budget,
        requestedAmount: amount,
        paymentType: 'full_advance',
        justification: fundJustification.trim(),
      });
      setFundDialog({ open: false, site: null });
      // Refresh advance map to show updated status
      const entryIds = siteEntries.map((e: any) => e.id).filter((id: any) => typeof id === 'string' && id.length > 0);
      if (entryIds.length > 0) {
        const { data } = await supabase.from('down_payment_requests').select('mmp_site_entry_id, status, requested_amount, approved_amount, total_paid_amount').in('mmp_site_entry_id', entryIds);
        if (data) {
          const map: Record<string, AdvanceInfo> = {};
          data.forEach((row: any) => {
            const eid = row.mmp_site_entry_id;
            if (!eid) return;
            const existing = map[eid];
            const isCancelled = row.status === 'cancelled' || row.status === 'rejected';
            if (!existing || (!isCancelled && (existing.status === 'cancelled' || existing.status === 'rejected'))) {
              map[eid] = { status: row.status || 'pending_supervisor', requestedAmount: Number(row.requested_amount) || 0, approvedAmount: Number(row.approved_amount) || 0, totalPaid: Number(row.total_paid_amount) || 0 };
            }
          });
          setAdvanceMap(map);
        }
      }
    } finally {
      setFundSubmitting(false);
    }
  };

  const coordinatorsByState = useMemo(() => {
    if (!siteEntries || siteEntries.length === 0) return [];

    const stateMap = new Map<string, StateCoordinatorGroup>();

    // Normalise status to lowercase for reliable matching regardless of DB casing
    // (DB stores: 'Accepted', 'Pending', 'Completed', 'Approved and Costed', 'In Progress', etc.)
    const verifiedStatuses = new Set([
      'verified', 'approved', 'approved and costed', 'costed',
      'dispatched', 'completed', 'partially_paid', 'fully_paid',
      'pending_admin', 'pending_supervisor',
    ]);
    const returnedStatuses = new Set([
      'returned_to_fom', 'returned', 'recalled', 'sent_back', 'sent_back_to_fom',
    ]);
    const rejectedStatuses = new Set(['rejected']);
    const inProgressStatuses = new Set([
      'in_progress', 'accepted', 'permits_attached', 'assigned',
      'forwarded', 'forwarded_to_fom', 'forwarded_to_coordinator', 'forwarded_to_coordinators',
    ]);

    // Human-readable labels for every known status (keyed by normalised lowercase)
    const statusLabels: Record<string, string> = {
      verified: 'Verified',
      approved: 'Approved',
      'approved and costed': 'Approved & Costed',
      costed: 'Costed',
      dispatched: 'Dispatched',
      completed: 'Completed',
      partially_paid: 'Partially Paid',
      fully_paid: 'Fully Paid',
      pending_admin: 'Pending Admin',
      pending_supervisor: 'Pending Supervisor',
      returned_to_fom: 'Returned to FOM',
      returned: 'Returned',
      rejected: 'Rejected',
      recalled: 'Recalled',
      sent_back: 'Sent Back',
      sent_back_to_fom: 'Sent Back to FOM',
      in_progress: 'In Progress',
      accepted: 'Accepted',
      permits_attached: 'Permits Attached',
      assigned: 'Assigned',
      forwarded: 'Forwarded',
      forwarded_to_fom: 'With FOM',
      forwarded_to_coordinator: 'With Coordinator',
      forwarded_to_coordinators: 'With Coordinators',
      pending: 'Pending',
    };

    siteEntries.forEach((entry: any) => {
      const stateName = entry.state || entry.stateName || 'Unknown State';
      
      if (!stateMap.has(stateName)) {
        stateMap.set(stateName, {
          state: stateName,
          coordinators: [],
          totalSites: 0,
          verifiedSites: 0,
          returnedSites: 0,
        });
      }

      const stateData = stateMap.get(stateName)!;
      stateData.totalSites++;

      const coordId = entry.additional_data?.assigned_to || 
                     entry.additionalData?.assigned_to ||
                     entry.forwarded_to_user_id || 
                     entry.forwardedToUserId;
      const coordName = entry.additional_data?.assigned_to_name || 
                       entry.additionalData?.assigned_to_name ||
                       entry.coordinator_name || 
                       entry.coordinatorName;
      const receivedAt = entry.forwarded_at || entry.forwardedAt || entry.dispatched_at || entry.dispatchedAt;
      
      // Normalise to lowercase for all set lookups
      const entryStatus = (entry.status || '').toLowerCase().trim();
      const isVerified = verifiedStatuses.has(entryStatus);
      const isReturned = returnedStatuses.has(entryStatus);
      const isRejected = rejectedStatuses.has(entryStatus);
      const isInProgress = inProgressStatuses.has(entryStatus);
      
      if (isVerified) stateData.verifiedSites++;
      if (isReturned || isRejected) stateData.returnedSites++;

      const ad = entry.additional_data || entry.additionalData || {};
      const statusCategory: SiteStatusDetail['statusCategory'] = isVerified
        ? 'verified'
        : isRejected
          ? 'rejected'
          : isReturned
            ? 'returned'
            : isInProgress
              ? 'in_progress'
              : 'pending';

      const actionByRaw = isVerified 
        ? (entry.verified_by || '') 
        : (isReturned || isRejected)
          ? (entry.verified_by || ad.sent_back_by || entry.rejected_by || ad.rejected_by || '') 
          : '';

      const siteDetail: SiteStatusDetail = {
        id: entry.id || '',
        name: entry.site_name || entry.siteName || 'Unknown',
        siteCode: entry.site_code || entry.siteCode || '',
        status: entryStatus,
        statusLabel: statusLabels[entryStatus] || (entry.status || entryStatus).replace(/_/g, ' '),
        statusCategory,
        locality: entry.locality || entry.localityName || '',
        stateName: entry.state || entry.stateName || stateName,
        hubName: entry.hub_office || entry.hub_name || entry.hubName || '',
        transportBudget: entry.transport_budget_total != null ? Number(entry.transport_budget_total) : (ad.transport_budget_total != null ? Number(ad.transport_budget_total) : undefined),
        reason: entry.verification_notes || ad.rejection_comments || ad.rejection_reason || ad.return_reason || entry.rejection_comments || '',
        actionBy: actionByRaw,
        actionAt: isVerified
          ? (entry.verified_at || '')
          : isReturned
            ? (entry.verified_at || entry.rejected_at || ad.rejected_at || ad.sent_back_at || '')
            : (entry.dispatched_at || entry.forwarded_at || ''),
        claimedBy: ad.claimed_by || entry.claimed_by || entry.accepted_by || '',
      };

      if (coordId) {
        const existingCoord = stateData.coordinators.find(c => c.id === coordId);
        
        if (existingCoord) {
          existingCoord.sitesAssigned++;
          if (isVerified) existingCoord.sitesVerified++;
          if (isReturned || isRejected) existingCoord.sitesReturned++;
          if (isInProgress) existingCoord.sitesInProgress++;
          if (!isVerified && !isReturned && !isRejected && !isInProgress) existingCoord.sitesPending++;
          existingCoord.siteDetails.push(siteDetail);
        } else {
          stateData.coordinators.push({ 
            id: coordId, 
            name: coordName || coordinatorNames[coordId] || coordId.substring(0, 8),
            sitesAssigned: 1,
            sitesVerified: isVerified ? 1 : 0,
            sitesReturned: (isReturned || isRejected) ? 1 : 0,
            sitesInProgress: isInProgress ? 1 : 0,
            sitesPending: (!isVerified && !isReturned && !isRejected && !isInProgress) ? 1 : 0,
            receivedAt: receivedAt,
            siteDetails: [siteDetail],
          });
        }
      }
    });

    return Array.from(stateMap.values())
      .filter(state => state.coordinators.length > 0)
      .sort((a, b) => a.state.localeCompare(b.state));
  }, [siteEntries, coordinatorNames]);

  useEffect(() => {
    const fetchNames = async () => {
      const coordIds = new Set<string>();
      const actionByIds = new Set<string>();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      siteEntries.forEach((entry: any) => {
        const coordId = entry.additional_data?.assigned_to || 
                       entry.additionalData?.assigned_to ||
                       entry.forwarded_to_user_id || 
                       entry.forwardedToUserId;
        if (coordId && !entry.additional_data?.assigned_to_name && !entry.coordinator_name) {
          coordIds.add(coordId);
        }

        const actionFields = [
          entry.verified_by,
          entry.rejected_by,
          entry.additional_data?.sent_back_by,
          entry.additional_data?.rejected_by,
          entry.additionalData?.sent_back_by,
          entry.additionalData?.rejected_by,
          entry.additional_data?.claimed_by,
          entry.additionalData?.claimed_by,
          entry.claimed_by,
          entry.accepted_by,
        ];
        actionFields.forEach(id => {
          if (id && uuidRegex.test(id)) {
            actionByIds.add(id);
          }
        });
      });

      const allIds = new Set([...coordIds, ...actionByIds]);
      if (allIds.size === 0) return;

      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', Array.from(allIds));

      if (data) {
        const coordNameMap: Record<string, string> = {};
        const actionNameMap: Record<string, string> = {};
        data.forEach((p: any) => {
          const name = p.full_name || p.id.substring(0, 8);
          if (coordIds.has(p.id)) coordNameMap[p.id] = name;
          if (actionByIds.has(p.id)) actionNameMap[p.id] = name;
          actionNameMap[p.id] = name;
        });
        setCoordinatorNames(coordNameMap);
        setActionByNames(actionNameMap);
      }
    };

    if (siteEntries.length > 0) {
      fetchNames();
    }
  }, [siteEntries]);

  // Fetch advance/down-payment status for all site entries in this MMP
  useEffect(() => {
    const fetchAdvanceStatus = async () => {
      const entryIds = siteEntries
        .map((e: any) => e.id)
        .filter((id: any) => typeof id === 'string' && id.length > 0);

      if (entryIds.length === 0) return;

      // Supabase .in() with many IDs is sent as POST (no URL limit issues for reasonable sizes)
      const { data, error } = await supabase
        .from('down_payment_requests')
        .select('mmp_site_entry_id, status, requested_amount, approved_amount, total_paid_amount')
        .in('mmp_site_entry_id', entryIds);

      if (error || !data) return;

      // Build a map: site_entry_id → most-relevant advance record
      // If there are multiple requests per site, prefer the one that is not cancelled/rejected
      const map: Record<string, AdvanceInfo> = {};
      data.forEach((row: any) => {
        const eid = row.mmp_site_entry_id;
        if (!eid) return;
        const existing = map[eid];
        // Prefer active/pending records over cancelled ones
        const isCancelled = row.status === 'cancelled' || row.status === 'rejected';
        if (!existing || (!isCancelled && (existing.status === 'cancelled' || existing.status === 'rejected'))) {
          map[eid] = {
            status: row.status || 'pending_supervisor',
            requestedAmount: Number(row.requested_amount) || 0,
            approvedAmount: Number(row.approved_amount) || 0,
            totalPaid: Number(row.total_paid_amount) || 0,
          };
        }
      });

      setAdvanceMap(map);
    };

    if (siteEntries.length > 0) {
      fetchAdvanceStatus();
    }
  }, [siteEntries]);

  const totalCoordinators = useMemo(() => {
    const uniqueCoords = new Set<string>();
    coordinatorsByState.forEach(state => {
      state.coordinators.forEach(c => uniqueCoords.add(c.id));
    });
    return uniqueCoords.size;
  }, [coordinatorsByState]);

  const totalAssigned = useMemo(() => {
    return coordinatorsByState.reduce((sum, state) => 
      sum + state.coordinators.reduce((s, c) => s + c.sitesAssigned, 0), 0);
  }, [coordinatorsByState]);

  const totalVerified = useMemo(() => {
    return coordinatorsByState.reduce((sum, state) => 
      sum + state.coordinators.reduce((s, c) => s + c.sitesVerified, 0), 0);
  }, [coordinatorsByState]);

  const totalReturned = useMemo(() => {
    return coordinatorsByState.reduce((sum, state) => 
      sum + state.coordinators.reduce((s, c) => s + c.sitesReturned, 0), 0);
  }, [coordinatorsByState]);

  if (coordinatorsByState.length === 0) {
    return (
      <Card className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/30 dark:to-slate-800/20 border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            Coordinator Assignments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            No coordinators assigned yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/20 border-purple-200 dark:border-purple-800">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            Coordinator Assignments
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-purple-100 dark:bg-purple-900/50">
              {totalCoordinators} coordinator{totalCoordinators !== 1 ? 's' : ''}
            </Badge>
            <Badge variant="outline" className="border-purple-300 dark:border-purple-700">
              {coordinatorsByState.length} state{coordinatorsByState.length !== 1 ? 's' : ''}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-2 text-sm flex-wrap">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-muted-foreground">{totalAssigned} assigned</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-muted-foreground">{totalVerified} verified</span>
          </div>
          {totalReturned > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-muted-foreground">{totalReturned} returned</span>
            </div>
          )}
          <div className="flex-1 min-w-[80px] max-w-[120px]">
            <div className="flex h-2 rounded-full overflow-hidden bg-muted">
              {totalAssigned > 0 && (
                <>
                  <div 
                    className="bg-green-500 transition-all" 
                    style={{ width: `${(totalVerified / totalAssigned) * 100}%` }} 
                  />
                  <div 
                    className="bg-red-500 transition-all" 
                    style={{ width: `${(totalReturned / totalAssigned) * 100}%` }} 
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger 
            className="flex items-center gap-2 text-sm font-medium hover-elevate rounded px-2 py-1 -mx-2 w-full"
            data-testid="trigger-coordinator-summary"
          >
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span>View by State</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-3">
            {coordinatorsByState.map((stateData) => (
              <div 
                key={stateData.state} 
                className="border border-purple-200 dark:border-purple-800 rounded-md p-3 bg-background/80"
                data-testid={`coordinator-state-${stateData.state}`}
              >
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    <span className="font-medium text-sm">{stateData.state}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {stateData.verifiedSites}/{stateData.totalSites} verified
                    </Badge>
                    {stateData.returnedSites > 0 && (
                      <Badge className="text-xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                        {stateData.returnedSites} returned
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {stateData.coordinators.length} coordinator{stateData.coordinators.length !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                </div>
                
                <div className="flex h-1.5 rounded-full overflow-hidden bg-muted mb-3">
                  {stateData.totalSites > 0 && (
                    <>
                      <div 
                        className="bg-green-500 transition-all" 
                        style={{ width: `${(stateData.verifiedSites / stateData.totalSites) * 100}%` }} 
                      />
                      <div 
                        className="bg-red-500 transition-all" 
                        style={{ width: `${(stateData.returnedSites / stateData.totalSites) * 100}%` }} 
                      />
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  {stateData.coordinators.map((coord) => {
                    const verifiedSites = coord.siteDetails.filter(s => s.statusCategory === 'verified');
                    const returnedSites = coord.siteDetails.filter(s => s.statusCategory === 'returned');
                    const rejectedSites = coord.siteDetails.filter(s => s.statusCategory === 'rejected');
                    const inProgressSites = coord.siteDetails.filter(s => s.statusCategory === 'in_progress');
                    const pendingSites = coord.siteDetails.filter(s => s.statusCategory === 'pending');

                    return (
                    <Collapsible 
                      key={coord.id}
                      data-testid={`coordinator-${coord.id}`}
                    >
                      <CollapsibleTrigger className="w-full rounded-md bg-muted/50 text-sm hover-elevate">
                        <div className="flex items-center justify-between gap-2 p-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-purple-200 dark:bg-purple-800 flex items-center justify-center flex-shrink-0">
                              <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div className="min-w-0 text-left">
                              <p className="font-medium truncate">
                                {coordinatorNames[coord.id] || coord.name}
                              </p>
                              {coord.receivedAt && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {(() => {
                                    try {
                                      const date = new Date(coord.receivedAt);
                                      if (!isNaN(date.getTime())) {
                                        return format(date, 'MMM d, yyyy');
                                      }
                                    } catch {
                                      return null;
                                    }
                                    return '';
                                  })()}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="flex items-center gap-1.5 flex-wrap justify-end">
                              {coord.sitesVerified > 0 && (
                                <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                  {coord.sitesVerified} verified
                                </Badge>
                              )}
                              {coord.sitesInProgress > 0 && (
                                <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                  {coord.sitesInProgress} active
                                </Badge>
                              )}
                              {coord.sitesPending > 0 && (
                                <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                  {coord.sitesPending} pending
                                </Badge>
                              )}
                              {coord.sitesReturned > 0 && (
                                <Badge variant="secondary" className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                  {coord.sitesReturned} returned
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {coord.sitesAssigned} sites
                            </span>
                            <div className="w-12">
                              <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
                                <div className="bg-green-500 transition-all" style={{ width: `${coord.sitesAssigned > 0 ? (coord.sitesVerified / coord.sitesAssigned) * 100 : 0}%` }} />
                                <div className="bg-blue-400 transition-all" style={{ width: `${coord.sitesAssigned > 0 ? (coord.sitesInProgress / coord.sitesAssigned) * 100 : 0}%` }} />
                                <div className="bg-amber-400 transition-all" style={{ width: `${coord.sitesAssigned > 0 ? (coord.sitesPending / coord.sitesAssigned) * 100 : 0}%` }} />
                                <div className="bg-red-500 transition-all" style={{ width: `${coord.sitesAssigned > 0 ? (coord.sitesReturned / coord.sitesAssigned) * 100 : 0}%` }} />
                              </div>
                            </div>
                            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-2 pb-2 space-y-3 mt-2">
                          <StatusCategorySection category="in_progress" sites={inProgressSites} userNames={actionByNames} advanceMap={advanceMap} onRequestFund={handleOpenRequestFund} />
                          <StatusCategorySection category="pending" sites={pendingSites} userNames={actionByNames} advanceMap={advanceMap} onRequestFund={handleOpenRequestFund} />
                          <StatusCategorySection category="verified" sites={verifiedSites} userNames={actionByNames} advanceMap={advanceMap} onRequestFund={handleOpenRequestFund} />
                          <StatusCategorySection category="returned" sites={returnedSites} userNames={actionByNames} advanceMap={advanceMap} onRequestFund={handleOpenRequestFund} />
                          <StatusCategorySection category="rejected" sites={rejectedSites} userNames={actionByNames} advanceMap={advanceMap} onRequestFund={handleOpenRequestFund} />
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                    );
                  })}
                </div>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>

      {/* Request Fund Dialog */}
      <Dialog open={fundDialog.open} onOpenChange={(open) => !open && setFundDialog({ open: false, site: null })}>
        <DialogContent className="max-w-md" data-testid="dialog-request-fund">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Request Transport Advance
            </DialogTitle>
            <DialogDescription>
              Submit an advance fund request for this site visit.
            </DialogDescription>
          </DialogHeader>

          {fundDialog.site && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted/50 p-3 space-y-1 text-sm">
                <p><span className="font-medium">Site:</span> {fundDialog.site.name}</p>
                {fundDialog.site.stateName && <p><span className="font-medium">State:</span> {fundDialog.site.stateName}</p>}
                {fundDialog.site.locality && <p><span className="font-medium">Locality:</span> {fundDialog.site.locality}</p>}
                {fundDialog.site.hubName && <p><span className="font-medium">Hub:</span> {fundDialog.site.hubName}</p>}
                {fundDialog.site.claimedBy && (
                  <p><span className="font-medium">Data Collector:</span> {actionByNames[fundDialog.site.claimedBy] || coordinatorNames[fundDialog.site.claimedBy] || fundDialog.site.claimedBy.slice(0, 8) + '…'}</p>
                )}
              </div>

              {fundDialog.site.transportBudget != null && fundDialog.site.transportBudget > 0 && (
                <div className="flex items-center justify-between rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2 text-sm">
                  <span className="text-muted-foreground font-medium">Transportation Budget</span>
                  <span className="font-semibold text-blue-700 dark:text-blue-300">
                    {fundDialog.site.transportBudget.toLocaleString()} SDG
                  </span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="fund-amount">Requested Amount (SDG) <span className="text-destructive">*</span></Label>
                <Input
                  id="fund-amount"
                  type="number"
                  min="1"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  placeholder="e.g. 50000"
                  data-testid="input-fund-amount"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fund-justification">Justification <span className="text-destructive">*</span></Label>
                <Textarea
                  id="fund-justification"
                  value={fundJustification}
                  onChange={(e) => setFundJustification(e.target.value)}
                  placeholder="Reason for transport advance request…"
                  rows={3}
                  data-testid="textarea-fund-justification"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setFundDialog({ open: false, site: null })} disabled={fundSubmitting} data-testid="button-cancel-fund-request">
              Cancel
            </Button>
            <Button
              onClick={handleSubmitFundRequest}
              disabled={fundSubmitting || !fundAmount || parseFloat(fundAmount) <= 0 || !fundJustification.trim()}
              data-testid="button-submit-fund-request"
            >
              {fundSubmitting ? 'Submitting…' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}