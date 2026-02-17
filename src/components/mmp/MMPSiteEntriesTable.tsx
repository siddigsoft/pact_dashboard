
import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Eye, ChevronLeft, ChevronRight, Play, CalendarDays, CheckCircle, Loader2, Filter, X } from 'lucide-react';
import SiteDetailDialog from './SiteDetailDialog';
import { PostponementDialog } from './PostponementDialog';
import { AcceptSiteButton } from '@/components/site-visit/AcceptSiteButton';
import { RequestDownPaymentButton } from '@/components/site-visit/RequestDownPaymentButton';
import { calculateEnumeratorFeeForUser } from '@/hooks/use-claim-fee-calculation';
import { PostponementHistoryEntry } from '@/types/mmp/site';
import { useUser } from '@/context/user/UserContext';

interface MMPSiteEntriesTableProps {
  siteEntries: any[];
  onViewSiteDetail?: (site: any) => void;
  editable?: boolean;
  onUpdateSites?: (sites: any[]) => Promise<boolean> | void;
  onAcceptSite?: (site: any) => void;
  onRejectSite?: (site: any, comments: string) => void;
  currentUserId?: string;
  showAcceptRejectForAssigned?: boolean;
  onAcknowledgeCost?: (site: any) => void;
  onStartVisit?: (site: any) => void;
  onCompleteVisit?: (site: any) => void;
  showVisitActions?: boolean;
  onSendBackToCoordinator?: (site: any, comments: string) => void;
  showClaimButton?: boolean;
  onSiteClaimed?: () => void;
  onDateChange?: (siteEntryId: string, postponement: PostponementHistoryEntry) => Promise<void>;
  onDirectDateChange?: (siteEntryId: string, newDate: string, newDateTo?: string, reason?: string) => Promise<void>;
  showDateChangeButton?: boolean;
  onApproveForCosting?: (site: any) => Promise<void>;
  showApproveButton?: boolean;
}

const MMPSiteEntriesTable = ({ 
  siteEntries, 
  onViewSiteDetail, 
  editable = false, 
  onUpdateSites,
  onAcceptSite,
  onRejectSite,
  currentUserId,
  showAcceptRejectForAssigned = false,
  onAcknowledgeCost,
  onStartVisit,
  onCompleteVisit,
  showVisitActions = false,
  onSendBackToCoordinator,
  showClaimButton = false,
  onSiteClaimed,
  onDateChange,
  onDirectDateChange,
  showDateChangeButton = true,
  onApproveForCosting,
  showApproveButton = false
}: MMPSiteEntriesTableProps) => {
  const { currentUser, users } = useUser();

  const resolveUserName = (userId: string | undefined): string | null => {
    if (!userId) return null;
    const user = users?.find(u => u.id === userId);
    return user?.fullName || user?.name || user?.username || null;
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<any | null>(null);
  const [calculatedFees, setCalculatedFees] = useState<Record<string, number>>({});
  const [postponementOpen, setPostponementOpen] = useState(false);
  const [postponementSite, setPostponementSite] = useState<any | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [hubFilter, setHubFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [localityFilter, setLocalityFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState("all");
  const [enumeratorFilter, setEnumeratorFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  // Debounce search query to reduce filtering operations
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setCurrentPage(1); // Reset to first page when search changes
    }, 300); // 300ms debounce delay

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const loadFees = async () => {
      const newFees: Record<string, number> = {};
      let viewerFee: number | null = null;

      // Always recalculate fees to ensure they reflect current fee structure
      const needsViewerFee = Boolean(
        currentUserId && siteEntries.some((site) => {
          const acceptedBy = site.accepted_by || site.acceptedBy;
          const status = (site.status || '').toString().toLowerCase();
          const isDispatched = status === 'dispatched';
          return !acceptedBy && isDispatched;
        })
      );

      try {
        if (needsViewerFee && currentUserId) {
          const result = await calculateEnumeratorFeeForUser(currentUserId);
          viewerFee = result.fee;
        }
      } catch (err) {
        console.error('Error calculating viewer classification fee:', err);
        viewerFee = null;
      }

      for (const site of siteEntries) {
        const acceptedBy = site.accepted_by || site.acceptedBy;
        const status = (site.status || '').toString().toLowerCase();
        const isDispatched = status === 'dispatched';

        try {
          if (acceptedBy) {
            const result = await calculateEnumeratorFeeForUser(acceptedBy);
            newFees[site.id] = result.fee;
          } else if (isDispatched && viewerFee !== null) {
            // Show the viewer's expected payout on claim (matches dialog behavior)
            newFees[site.id] = viewerFee;
          }
        } catch (err) {
          console.error('Error calculating fee for site:', site.id, err);
        }
      }

      // Always update calculated fees to reflect current fee structure
      setCalculatedFees(newFees);
    };

    loadFees();
  }, [siteEntries, currentUserId]);

  // Normalize a row from either MMP siteEntries (camelCase) or mmp_site_entries (snake_case)
  const normalizeSite = (site: any) => {
    // visit_data may be stored as JSON or stringified JSON
    const vd = site?.visit_data
      ? (typeof site.visit_data === 'string' ? (() => { try { return JSON.parse(site.visit_data); } catch { return undefined; } })() : site.visit_data)
      : undefined;

    // additionalData may contain the actual uploaded data
    const ad = site?.additionalData || {};

    // Monitoring Plan Structure Fields - check multiple sources including additionalData
    const hubOffice = site.hub_name || site.hubName || site.hubOffice || site.hub_office || vd?.hubOffice || ad['Hub Office'] || ad['Hub Office:'] || '—';
    const state = site.state || site.state_name || vd?.state || ad['State'] || ad['State:'] || '—';
    const locality = site.locality || site.locality_name || vd?.locality || ad['Locality'] || ad['Locality:'] || '—';
    const siteCode = site.siteCode || site.site_code || vd?.siteCode || ad['Site Code'] || ad['Site Code:'] || '—';
    const siteName = site.siteName || site.site_name || vd?.siteName || ad['Site Name'] || ad['Site Name:'] || '—';
    const cpName = site.cpName || site.cp_name || vd?.cpName || ad['CP Name'] || ad['CP name'] || ad['CP Name:'] || '—';
    const siteActivity = site.siteActivity || site.activity_at_site || site.activity || vd?.siteActivity || ad['Activity at the site'] || ad['Activity at Site'] || ad['Activity at the site:'] || '—';
    const monitoringBy = site.monitoringBy || site.monitoring_by || vd?.monitoringBy || ad['monitoring by'] || ad['monitoring by:'] || ad['Monitoring By'] || '—';
    const surveyTool = site.surveyTool || site.survey_tool || vd?.surveyTool || ad['Survey under Master tool'] || ad['Survey under Master tool:'] || ad['Survey Tool'] || '—';
    const useMarketDiversion = site.useMarketDiversion || site.use_market_diversion || vd?.useMarketDiversion || 
      (ad['Use Market Diversion Monitoring'] === 'Yes' || ad['Use Market Diversion Monitoring'] === 'true' || ad['Use Market Diversion Monitoring'] === '1') || false;
    const useWarehouseMonitoring = site.useWarehouseMonitoring || site.use_warehouse_monitoring || vd?.useWarehouseMonitoring || 
      (ad['Use Warehouse Monitoring'] === 'Yes' || ad['Use Warehouse Monitoring'] === 'true' || ad['Use Warehouse Monitoring'] === '1') || false;

    // Additional fields
    const mainActivity = site.main_activity || site.mainActivity || vd?.mainActivity || '—';
    const visitType = site.visitType || vd?.visitType || '—';
    const mmpName = site.mmpName || site.mmp_name || vd?.mmpName || ad['MMP Name'] || ad['mmp_name'] || (site.mmpFiles ? site.mmpFiles.name : undefined) || '—';

    const rawDate = site.due_date || site.visitDate || '';
    let visitDate = '—';
    if (rawDate) {
      const d = new Date(rawDate);
      visitDate = isNaN(d.getTime()) ? String(rawDate) : d.toISOString().split('T')[0];
    }

    const comments = site.comments || site.notes || '—';
    const enumeratorFee = site.enumerator_fee;
    const transportFee = site.transport_fee;
    const cost = site.cost;
    const totalCost = (enumeratorFee !== undefined && enumeratorFee !== null && transportFee !== undefined && transportFee !== null)
      ? Number(enumeratorFee) + Number(transportFee)
      : (cost !== undefined && cost !== null ? Number(cost) : undefined);
    
    // Read from new columns first, then fallback to additional_data for backward compatibility
    const verifiedBy = site.verified_by || ad['Verified By'] || ad['Verified By:'] || undefined;
    const verifiedAt = site.verified_at || (ad['Verified At'] ? new Date(ad['Verified At']).toISOString() : undefined) || (ad['verified_at'] ? new Date(ad['verified_at']).toISOString() : undefined) || undefined;
    const verificationNotes = site.verification_notes || ad['Verification Notes'] || ad['Verification Notes:'] || undefined;
    const status = site.status || ad['Status'] || ad['Status:'] || 'Pending';
    
    // Dispatch information - read from new columns first
    const dispatchedAt = site.dispatched_at || (ad['dispatched_at'] ? new Date(ad['dispatched_at']).toISOString() : undefined) || (ad['Dispatched At'] ? new Date(ad['Dispatched At']).toISOString() : undefined) || undefined;
    const dispatchedBy = site.dispatched_by || ad['dispatched_by'] || ad['Dispatched By'] || undefined;
    
    // Acceptance information - read from new columns first
    const acceptedAt = site.accepted_at || (ad['accepted_at'] ? new Date(ad['accepted_at']).toISOString() : undefined) || (ad['Accepted At'] ? new Date(ad['Accepted At']).toISOString() : undefined) || undefined;
    const acceptedBy = site.accepted_by || site.acceptedBy || ad['accepted_by'] || ad['Accepted By'] || undefined;
    
    // Rejection information - read from new columns first, then fallback to additional_data
    const rejectionComments = site.rejection_comments || ad['rejection_comments'] || ad['rejection_reason'] || undefined;
    const rejectedBy = site.rejected_by || ad['rejected_by'] || undefined;
    const rejectedAt = site.rejected_at || (ad['rejected_at'] ? new Date(ad['rejected_at']).toISOString() : undefined) || undefined;
    
    // Timestamps
    const createdAt = site.created_at || undefined;
    const updatedAt = site.updated_at || site.last_modified || undefined;

    const acceptedByName = resolveUserName(acceptedBy) || null;

    return { 
      hubOffice, state, locality, siteCode, mmpName, siteName, cpName, siteActivity, 
      monitoringBy, surveyTool, useMarketDiversion, useWarehouseMonitoring,
      mainActivity, visitType, visitDate, comments, 
      enumeratorFee: enumeratorFee, transportFee: transportFee, cost: totalCost,
      verifiedBy, verifiedAt, verificationNotes, status,
      dispatchedAt, dispatchedBy, acceptedAt, acceptedBy, acceptedByName,
      rejectionComments, rejectedBy, rejectedAt,
      createdAt, updatedAt
    };
  };

  const handleView = (site: any) => {
    // Check if this is an accepted/claimed/assigned site that needs Start Visit
    const siteStatus = site.status?.toLowerCase() || '';
    const siteOwner = site.accepted_by || site.acceptedBy || site.assigned_to || site.assignedTo;
    const isAcceptedSite = showVisitActions && 
                          ['accepted', 'claimed', 'assigned'].includes(siteStatus) && 
                          siteOwner === currentUserId;
    
    if (isAcceptedSite && onStartVisit) {
      onStartVisit(site);
      return;
    }

    // Check if this is an ongoing site that needs Complete Visit
    const isOngoingSite = showVisitActions && 
                         ['ongoing', 'in_progress', 'inprogress', 'in progress'].includes(siteStatus) && 
                         siteOwner === currentUserId;
    
    if (isOngoingSite && onCompleteVisit) {
      onCompleteVisit(site);
      return;
    }
    
    // Show detail dialog for all other cases
    if (onViewSiteDetail) {
      onViewSiteDetail(site);
      return;
    }
    setSelectedSite(site);
    setDetailOpen(true);
  };

  const normalizedEntries = useMemo(() => {
    return siteEntries.map(site => ({ raw: site, norm: normalizeSite(site) }));
  }, [siteEntries, users]);

  const filterOptions = useMemo(() => {
    const hubs = new Set<string>();
    const states = new Set<string>();
    const localities = new Set<string>();
    const activities = new Set<string>();
    const enumerators = new Set<string>();
    for (const { norm } of normalizedEntries) {
      if (norm.hubOffice && norm.hubOffice !== '—') hubs.add(norm.hubOffice);
      if (norm.state && norm.state !== '—') states.add(norm.state);
      if (norm.locality && norm.locality !== '—') localities.add(norm.locality);
      if (norm.siteActivity && norm.siteActivity !== '—') activities.add(norm.siteActivity);
      if (norm.acceptedByName && norm.acceptedByName !== '—') enumerators.add(norm.acceptedByName);
      else if (norm.monitoringBy && norm.monitoringBy !== '—') enumerators.add(norm.monitoringBy);
    }
    return {
      hubs: Array.from(hubs).sort((a, b) => a.localeCompare(b)),
      states: Array.from(states).sort((a, b) => a.localeCompare(b)),
      localities: Array.from(localities).sort((a, b) => a.localeCompare(b)),
      activities: Array.from(activities).sort((a, b) => a.localeCompare(b)),
      enumerators: Array.from(enumerators).sort((a, b) => a.localeCompare(b)),
    };
  }, [normalizedEntries]);

  const activeFilterCount = [hubFilter, stateFilter, localityFilter, activityFilter, enumeratorFilter].filter(f => f !== 'all').length;

  const clearAllFilters = () => {
    setHubFilter("all");
    setStateFilter("all");
    setLocalityFilter("all");
    setActivityFilter("all");
    setEnumeratorFilter("all");
    setCurrentPage(1);
  };

  const filteredSites = useMemo(() => {
    let results = normalizedEntries;

    if (hubFilter !== 'all') {
      results = results.filter(({ norm }) => norm.hubOffice === hubFilter);
    }
    if (stateFilter !== 'all') {
      results = results.filter(({ norm }) => norm.state === stateFilter);
    }
    if (localityFilter !== 'all') {
      results = results.filter(({ norm }) => norm.locality === localityFilter);
    }
    if (activityFilter !== 'all') {
      results = results.filter(({ norm }) => norm.siteActivity === activityFilter);
    }
    if (enumeratorFilter !== 'all') {
      results = results.filter(({ norm }) => norm.acceptedByName === enumeratorFilter || norm.monitoringBy === enumeratorFilter);
    }

    if (debouncedSearchQuery.trim() !== "") {
      const q = debouncedSearchQuery.toLowerCase();
      results = results.filter(({ norm }) => {
        return [norm.hubOffice, norm.state, norm.locality, norm.mmpName, norm.siteName, norm.cpName, norm.siteActivity, norm.monitoringBy, norm.acceptedByName, norm.surveyTool, norm.visitDate, norm.comments]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      });
    }

    return results.map(({ raw }) => raw);
  }, [normalizedEntries, debouncedSearchQuery, hubFilter, stateFilter, localityFilter, activityFilter, enumeratorFilter]);

  // Paginate filtered results
  const paginatedSites = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredSites.slice(startIndex, endIndex);
  }, [filteredSites, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredSites.length / itemsPerPage);

  const toBool = (v: any) => {
    if (typeof v === 'boolean') return v;
    const s = String(v || '').toLowerCase();
    return s === 'yes' || s === 'true' || s === '1';
  };


  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle>MMP Site Entries</CardTitle>
            <CardDescription>
              Showing {paginatedSites.length} of {filteredSites.length} sites
              {(debouncedSearchQuery || activeFilterCount > 0) && ` (filtered from ${siteEntries.length} total)`}
              {!debouncedSearchQuery && activeFilterCount === 0 && ` (${siteEntries.length} total)`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={showFilters ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              data-testid="button-toggle-filters"
            >
              <Filter className="h-4 w-4 mr-1" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 bg-white/20 text-xs">{activeFilterCount}</Badge>
              )}
            </Button>
            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search sites..."
                className="pl-8 w-full sm:w-[300px]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-sites"
              />
            </div>
          </div>
        </div>
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-border/50">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Hub</label>
                <Select value={hubFilter} onValueChange={(val) => { setHubFilter(val); setCurrentPage(1); }}>
                  <SelectTrigger className="w-full" data-testid="select-hub-filter">
                    <SelectValue placeholder="All Hubs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Hubs</SelectItem>
                    {filterOptions.hubs.map(hub => (
                      <SelectItem key={hub} value={hub}>{hub}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">State</label>
                <Select value={stateFilter} onValueChange={(val) => { setStateFilter(val); setLocalityFilter("all"); setCurrentPage(1); }}>
                  <SelectTrigger className="w-full" data-testid="select-state-filter">
                    <SelectValue placeholder="All States" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All States</SelectItem>
                    {filterOptions.states.map(state => (
                      <SelectItem key={state} value={state}>{state}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Locality</label>
                <Select value={localityFilter} onValueChange={(val) => { setLocalityFilter(val); setCurrentPage(1); }}>
                  <SelectTrigger className="w-full" data-testid="select-locality-filter">
                    <SelectValue placeholder="All Localities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Localities</SelectItem>
                    {(stateFilter !== 'all'
                      ? filterOptions.localities.filter(loc => 
                          normalizedEntries.some(({ norm }) => norm.state === stateFilter && norm.locality === loc)
                        )
                      : filterOptions.localities
                    ).map(loc => (
                      <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Activity</label>
                <Select value={activityFilter} onValueChange={(val) => { setActivityFilter(val); setCurrentPage(1); }}>
                  <SelectTrigger className="w-full" data-testid="select-activity-filter">
                    <SelectValue placeholder="All Activities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Activities</SelectItem>
                    {filterOptions.activities.map(activity => (
                      <SelectItem key={activity} value={activity}>{activity}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Data Collector</label>
                <Select value={enumeratorFilter} onValueChange={(val) => { setEnumeratorFilter(val); setCurrentPage(1); }}>
                  <SelectTrigger className="w-full" data-testid="select-enumerator-filter">
                    <SelectValue placeholder="All Data Collectors" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Data Collectors</SelectItem>
                    {filterOptions.enumerators.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {activeFilterCount > 0 && (
              <div className="flex items-center gap-2 mt-3">
                <div className="flex flex-wrap gap-1.5">
                  {hubFilter !== 'all' && (
                    <Badge variant="secondary" className="gap-1">
                      Hub: {hubFilter}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => { setHubFilter("all"); setCurrentPage(1); }} />
                    </Badge>
                  )}
                  {stateFilter !== 'all' && (
                    <Badge variant="secondary" className="gap-1">
                      State: {stateFilter}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => { setStateFilter("all"); setLocalityFilter("all"); setCurrentPage(1); }} />
                    </Badge>
                  )}
                  {localityFilter !== 'all' && (
                    <Badge variant="secondary" className="gap-1">
                      Locality: {localityFilter}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => { setLocalityFilter("all"); setCurrentPage(1); }} />
                    </Badge>
                  )}
                  {activityFilter !== 'all' && (
                    <Badge variant="secondary" className="gap-1">
                      Activity: {activityFilter}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => { setActivityFilter("all"); setCurrentPage(1); }} />
                    </Badge>
                  )}
                  {enumeratorFilter !== 'all' && (
                    <Badge variant="secondary" className="gap-1">
                      Data Collector: {enumeratorFilter}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => { setEnumeratorFilter("all"); setCurrentPage(1); }} />
                    </Badge>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={clearAllFilters} data-testid="button-clear-filters">
                  Clear All
                </Button>
              </div>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {/* List View */}
        {paginatedSites.length > 0 ? (
          <div className="space-y-3">
              {paginatedSites.map((site, idx) => {
                const row = normalizeSite(site);
                return (
                  <Card key={site.id ?? site.siteCode ?? site._key ?? idx} className="p-4 hover:shadow-md transition-shadow">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-lg">{row.siteName || 'Unnamed Site'}</h3>
                              {row.mmpName && row.mmpName !== '—' && (
                                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-300">
                                  {row.mmpName}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{row.siteCode || '—'} • {row.state || '—'}, {row.locality || '—'}</p>
                          </div>
                          {(() => {
                            const rawStatus = (row.status || '').toLowerCase();
                            const acceptedBy = row.acceptedBy || (site as any).accepted_by;
                            const displayStatus = acceptedBy && (!rawStatus || rawStatus === 'pending' || rawStatus === 'dispatched' || rawStatus === 'assigned' || rawStatus === 'claimed')
                              ? 'accepted' : rawStatus;
                            return (
                              <Badge 
                                className={
                                  displayStatus === 'verified' ? 'bg-green-100 text-green-700' :
                                  displayStatus === 'rejected' ? 'bg-red-100 text-red-700' :
                                  displayStatus === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                  displayStatus === 'approved' ? 'bg-blue-100 text-blue-700' :
                                  displayStatus === 'accepted' ? 'bg-purple-100 text-purple-700' :
                                  displayStatus === 'dispatched' ? 'bg-indigo-100 text-indigo-700' :
                                  displayStatus === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                                  'bg-gray-100 text-gray-700'
                                }
                              >
                                {displayStatus || 'Pending'}
                              </Badge>
                            );
                          })()}
                        </div>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                          <div>
                            <span className="text-muted-foreground">CP Name:</span>
                            <p className="font-medium">{row.cpName || '—'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Activity:</span>
                            <p className="font-medium">{row.siteActivity || '—'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Visit Date:</span>
                            <p className="font-medium">{row.visitDate || '—'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Total Cost:</span>
                            <p className="font-medium text-green-600">
                              {(() => {
                                // Only show cost after site has been claimed/accepted
                                // Check if site has been claimed: acceptedBy is set OR status indicates claimed
                                const status = (row.status || '').toLowerCase();
                                const acceptedBy = row.acceptedBy || (site as any).accepted_by;
                                const costVisibleStatuses = ['accepted', 'ongoing', 'inprogress', 'in_progress', 'in progress', 'completed', 'approved and costed', 'costed', 'claimed', 'acknowledged', 'cost and acknowledged', 'dispatched'];
                                const hasCostStatus = costVisibleStatuses.some(s => status.includes(s));
                                
                                if (!hasCostStatus && !acceptedBy) {
                                  return 'Pending Claim';
                                }
                                
                                const calculatedFee = calculatedFees[site.id];
                                const transportFee = Number(row.transportFee || 0);
                                
                                // Use calculated fee if available
                                if (calculatedFee !== undefined && calculatedFee > 0) {
                                  const total = calculatedFee + transportFee;
                                  return `SDG ${Number(total).toLocaleString()}`;
                                }
                                
                                // Otherwise use stored cost
                                if (row.cost !== undefined && row.cost !== null && String(row.cost) !== '' && String(row.cost) !== '—') {
                                  return `SDG ${Number(row.cost).toLocaleString()}`;
                                }
                                
                                return '—';
                              })()}
                            </p>
                          </div>
                        </div>

                        {(() => {
                          const st = (row.status || '').toLowerCase();
                          const postClaimStatuses = ['claimed', 'accepted', 'acknowledged', 'cost and acknowledged', 'ongoing', 'inprogress', 'in_progress', 'in progress', 'completed'];
                          const isPostClaim = postClaimStatuses.some(s => st.includes(s));
                          if (row.acceptedByName && isPostClaim) {
                            return (
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-muted-foreground">Claimed By:</span>
                                <span className="font-medium text-purple-700">{row.acceptedByName}</span>
                                {row.acceptedAt && (
                                  <span className="text-xs text-muted-foreground">
                                    ({new Date(row.acceptedAt).toLocaleDateString()})
                                  </span>
                                )}
                              </div>
                            );
                          }
                          return null;
                        })()}

                        {row.comments && row.comments !== '—' && (
                          <div>
                            <span className="text-muted-foreground text-sm">Comments:</span>
                            <p className="text-sm mt-1 line-clamp-2">{row.comments}</p>
                          </div>
                        )}

                        {row.status?.toLowerCase() === 'rejected' && row.rejectionComments && (
                          <div className="bg-red-50 p-2 rounded border border-red-200">
                            <span className="text-red-700 font-medium text-xs">Rejection: </span>
                            <span className="text-sm text-gray-900 line-clamp-1">{row.rejectionComments}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        {showClaimButton && site.status?.toLowerCase() === 'dispatched' && !site.accepted_by && currentUserId && (
                          <AcceptSiteButton
                            site={site}
                            userId={currentUserId}
                            onAccepted={onSiteClaimed}
                            size="default"
                            className="w-full min-h-[44px] text-base font-semibold shadow-md bg-primary hover:bg-primary/90"
                          />
                        )}
                        {showAcceptRejectForAssigned && site.status?.toLowerCase() === 'assigned' && site.accepted_by === currentUserId && currentUserId && (
                          <AcceptSiteButton
                            site={site}
                            userId={currentUserId}
                            onAccepted={onSiteClaimed}
                            size="default"
                            isSmartAssigned={true}
                            className="w-full bg-blue-600 hover:bg-blue-700"
                          />
                        )}
                        {/* Show Request Advance button for claimed/accepted/ongoing/in-progress sites with transport budget */}
                        {(site.status?.toLowerCase() === 'claimed' || 
                          site.status?.toLowerCase() === 'accepted' || 
                          site.status?.toLowerCase() === 'ongoing' || 
                          site.status?.toLowerCase() === 'in progress' || 
                          site.status?.toLowerCase() === 'in_progress') && 
                         (site.accepted_by === currentUserId || site.acceptedBy === currentUserId) && 
                         ((site.transport_fee && site.transport_fee > 0) || (site.transportFee && site.transportFee > 0)) && (
                          <RequestDownPaymentButton
                            site={site}
                            size="sm"
                            className="w-full min-h-[44px]"
                          />
                        )}
                        {showVisitActions ? (
                          <>
                            {['claimed', 'accepted', 'assigned', 'verified', 'approved', 'dispatched'].includes(site.status?.toLowerCase()) && onStartVisit && (
                              <Button 
                                size="sm" 
                                onClick={() => onStartVisit(site)} 
                                className="w-full min-h-[44px] rounded-full bg-black dark:bg-white text-white dark:text-black font-bold text-base active:scale-95 hover:bg-black/90 dark:hover:bg-white/90"
                                data-testid={`button-start-visit-${site.id}`}
                                aria-label={`Start visit for ${site.site_name || site.siteName || 'site'}`}
                              >
                                <Play className="h-5 w-5 mr-2" /> Start Visit
                              </Button>
                            )}
                            {(site.status?.toLowerCase() === 'ongoing' || site.status?.toLowerCase() === 'in progress' || site.status?.toLowerCase() === 'in_progress') && onCompleteVisit && (
                              <Button 
                                variant="default" 
                                size="sm" 
                                onClick={() => onCompleteVisit(site)} 
                                className="w-full min-h-[44px] bg-green-600 hover:bg-green-700"
                                data-testid={`button-complete-visit-${site.id}`}
                              >
                                Complete Site Visit
                              </Button>
                            )}
                          </>
                        ) : null}
                        {showDateChangeButton && (onDateChange || onDirectDateChange) && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => {
                              setPostponementSite(site);
                              setPostponementOpen(true);
                            }}
                            className="w-full min-h-[44px] flex items-center justify-center gap-2"
                            data-testid={`button-date-change-${site.id}`}
                          >
                            <CalendarDays className="h-4 w-4" />
                            Change Date
                          </Button>
                        )}
                        {showApproveButton && onApproveForCosting && (
                          <Button 
                            variant="default" 
                            size="sm" 
                            disabled={approvingId === site.id}
                            onClick={async () => {
                              setApprovingId(site.id);
                              try {
                                await onApproveForCosting(site);
                              } finally {
                                setApprovingId(null);
                              }
                            }}
                            className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700"
                            data-testid={`button-approve-${site.id}`}
                          >
                            {approvingId === site.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle className="h-4 w-4" />
                            )}
                            {approvingId === site.id ? 'Approving...' : 'Approve'}
                          </Button>
                        )}
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => {
                            setSelectedSite(site);
                            setDetailOpen(true);
                          }}
                          className="w-full min-h-[44px] flex items-center justify-center gap-2"
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            No results.
          </div>
        )}
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 px-2">
            <div className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <div className="text-sm">
                {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredSites.length)} of {filteredSites.length}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {/* Site Detail Dialog */}
      <SiteDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        site={selectedSite}
        editable={editable}
        onUpdateSite={onUpdateSites}
        onAcceptSite={onAcceptSite}
        onSendBackToCoordinator={onSendBackToCoordinator}
        currentUserId={currentUserId}
        onStartVisit={onStartVisit}
      />

      {/* Date Change/Postponement Dialog */}
      {postponementSite && currentUser && (onDateChange || onDirectDateChange) && (
        <PostponementDialog
          open={postponementOpen}
          onOpenChange={setPostponementOpen}
          siteEntry={{
            id: postponementSite.id,
            siteName: postponementSite.siteName || postponementSite.site_name,
            siteCode: postponementSite.siteCode || postponementSite.site_code,
            visitDate: postponementSite.visitDate || postponementSite.visit_date,
            visitDateFrom: postponementSite.visitDateFrom || postponementSite.visit_date_from,
            visitDateTo: postponementSite.visitDateTo || postponementSite.visit_date_to,
            mainActivity: postponementSite.siteActivity || postponementSite.activity_at_site,
            postponementHistory: postponementSite.postponementHistory || postponementSite.additional_data?.postponementHistory || [],
            verificationStarted: ['verified', 'approved', 'dispatched', 'completed'].includes(postponementSite.status?.toLowerCase())
          }}
          currentUser={{
            id: currentUser.id,
            full_name: currentUser.fullName || currentUser.email,
            name: currentUser.fullName,
            role: currentUser.role
          }}
          onSubmit={onDateChange || (async (_id: string, _postponement: PostponementHistoryEntry) => {})}
          onDirectChange={onDirectDateChange}
        />
      )}

    </Card>
  );
};

export default MMPSiteEntriesTable;

