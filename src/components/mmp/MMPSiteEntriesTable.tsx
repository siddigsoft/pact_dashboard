
import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import SiteDetailDialog from './SiteDetailDialog';
import { AcceptSiteButton } from '@/components/site-visit/AcceptSiteButton';
import { RequestDownPaymentButton } from '@/components/site-visit/RequestDownPaymentButton';
import { calculateEnumeratorFeeForUser } from '@/hooks/use-claim-fee-calculation';

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
  onSiteClaimed
}: MMPSiteEntriesTableProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<any | null>(null);
  const [calculatedFees, setCalculatedFees] = useState<Record<string, number>>({}); // Map of siteId -> calculatedFee

  // Debounce search query to reduce filtering operations
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setCurrentPage(1); // Reset to first page when search changes
    }, 300); // 300ms debounce delay

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Calculate fees for sites with accepted_by users
  useEffect(() => {
    const loadFees = async () => {
      const newFees: Record<string, number> = {};
      
      for (const site of siteEntries) {
        const acceptedBy = site.accepted_by || site.acceptedBy;
        if (acceptedBy && !calculatedFees[site.id]) {
          try {
            const result = await calculateEnumeratorFeeForUser(acceptedBy);
            newFees[site.id] = result.fee;
          } catch (err) {
            console.error('Error calculating fee for site:', site.id, err);
          }
        }
      }
      
      if (Object.keys(newFees).length > 0) {
        setCalculatedFees(prev => ({ ...prev, ...newFees }));
      }
    };
    
    loadFees();
  }, [siteEntries]);

  // Normalize a row from either MMP siteEntries (camelCase) or mmp_site_entries (snake_case)
  const normalizeSite = (site: any) => {
    // visit_data may be stored as JSON or stringified JSON
    const vd = site?.visit_data
      ? (typeof site.visit_data === 'string' ? (() => { try { return JSON.parse(site.visit_data); } catch { return undefined; } })() : site.visit_data)
      : undefined;

    // additionalData may contain the actual uploaded data
    const ad = site?.additionalData || {};

    // Monitoring Plan Structure Fields - check multiple sources including additionalData
    const hubOffice = site.hubOffice || site.hub_office || vd?.hubOffice || ad['Hub Office'] || ad['Hub Office:'] || '—';
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
    const acceptedBy = site.accepted_by || ad['accepted_by'] || ad['Accepted By'] || undefined;
    
    // Rejection information - read from new columns first, then fallback to additional_data
    const rejectionComments = site.rejection_comments || ad['rejection_comments'] || ad['rejection_reason'] || undefined;
    const rejectedBy = site.rejected_by || ad['rejected_by'] || undefined;
    const rejectedAt = site.rejected_at || (ad['rejected_at'] ? new Date(ad['rejected_at']).toISOString() : undefined) || undefined;
    
    // Timestamps
    const createdAt = site.created_at || undefined;
    const updatedAt = site.updated_at || site.last_modified || undefined;

    return { 
      hubOffice, state, locality, siteCode, mmpName, siteName, cpName, siteActivity, 
      monitoringBy, surveyTool, useMarketDiversion, useWarehouseMonitoring,
      mainActivity, visitType, visitDate, comments, 
      enumeratorFee: enumeratorFee, transportFee: transportFee, cost: totalCost,
      verifiedBy, verifiedAt, verificationNotes, status,
      dispatchedAt, dispatchedBy, acceptedAt, acceptedBy, 
      rejectionComments, rejectedBy, rejectedAt,
      createdAt, updatedAt
    };
  };

  const handleView = (site: any) => {
    // Check if this is an accepted site that needs Start Visit
    const isAcceptedSite = showVisitActions && 
                          site.status?.toLowerCase() === 'accepted' && 
                          site.accepted_by === currentUserId;
    
    if (isAcceptedSite && onStartVisit) {
      onStartVisit(site);
      return;
    }

    // Check if this is an ongoing site that needs Complete Visit
    const isOngoingSite = showVisitActions && 
                         site.status?.toLowerCase() === 'ongoing' && 
                         site.accepted_by === currentUserId;
    
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

  // Memoize filtered sites for performance
  const filteredSites = useMemo(() => {
    if (debouncedSearchQuery.trim() === "") {
      return siteEntries;
    }
    const q = debouncedSearchQuery.toLowerCase();
    return siteEntries.filter(site => {
      const s = normalizeSite(site);
      return [s.hubOffice, s.state, s.locality, s.mmpName, s.siteName, s.cpName, s.siteActivity, s.monitoringBy, s.surveyTool, s.visitDate, s.comments]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [siteEntries, debouncedSearchQuery]);

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
              {debouncedSearchQuery && ` (filtered from ${siteEntries.length} total)`}
              {!debouncedSearchQuery && ` (${siteEntries.length} total)`}
            </CardDescription>
          </div>
          <div className="w-full sm:w-auto">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search sites..."
                className="pl-8 w-full sm:w-[300px]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border w-full">
          {/* List View */}
          {paginatedSites.length > 0 ? (
            <div className="space-y-3 p-4">
              {paginatedSites.map((site, idx) => {
                const row = normalizeSite(site);
                return (
                  <Card key={site.id ?? site.siteCode ?? site._key ?? idx} className="p-4 hover:shadow-md transition-shadow">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="font-semibold text-lg">{row.siteName || 'Unnamed Site'}</h3>
                            <p className="text-sm text-muted-foreground">{row.siteCode || '—'} • {row.state || '—'}, {row.locality || '—'}</p>
                          </div>
                          <Badge 
                            className={
                              row.status?.toLowerCase() === 'verified' ? 'bg-green-100 text-green-700' :
                              row.status?.toLowerCase() === 'rejected' ? 'bg-red-100 text-red-700' :
                              row.status?.toLowerCase() === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                              row.status?.toLowerCase() === 'approved' ? 'bg-blue-100 text-blue-700' :
                              row.status?.toLowerCase() === 'accepted' ? 'bg-purple-100 text-purple-700' :
                              row.status?.toLowerCase() === 'dispatched' ? 'bg-indigo-100 text-indigo-700' :
                              row.status?.toLowerCase() === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                              'bg-gray-100 text-gray-700'
                            }
                          >
                            {row.status || 'Pending'}
                          </Badge>
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
                                const calculatedFee = calculatedFees[site.id];
                                const transportFee = row.transportFee || 0;
                                
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

                      <div className="flex gap-2 sm:flex-col">
                        {showClaimButton && site.status?.toLowerCase() === 'dispatched' && !site.accepted_by && currentUserId && (
                          <AcceptSiteButton
                            site={site}
                            userId={currentUserId}
                            onAccepted={onSiteClaimed}
                            size="default"
                            className="w-full sm:w-auto min-h-[44px] text-base font-semibold shadow-md bg-primary hover:bg-primary/90"
                          />
                        )}
                        {showAcceptRejectForAssigned && site.status?.toLowerCase() === 'assigned' && site.accepted_by === currentUserId && currentUserId && (
                          <AcceptSiteButton
                            site={site}
                            userId={currentUserId}
                            onAccepted={onSiteClaimed}
                            size="default"
                            isSmartAssigned={true}
                            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
                          />
                        )}
                        {/* Show Request Advance button for accepted/ongoing/in-progress sites with transport budget */}
                        {(site.status?.toLowerCase() === 'accepted' || 
                          site.status?.toLowerCase() === 'ongoing' || 
                          site.status?.toLowerCase() === 'in progress' || 
                          site.status?.toLowerCase() === 'in_progress') && 
                         (site.accepted_by === currentUserId || site.acceptedBy === currentUserId) && 
                         ((site.transport_fee && site.transport_fee > 0) || (site.transportFee && site.transportFee > 0)) && (
                          <RequestDownPaymentButton
                            site={site}
                            size="sm"
                            className="w-full sm:w-auto"
                          />
                        )}
                        {showVisitActions ? (
                          <>
                            {(site.status?.toLowerCase() === 'accepted' || site.status?.toLowerCase() === 'assigned') && onStartVisit && (
                              <Button 
                                variant="default" 
                                size="sm" 
                                onClick={() => onStartVisit(site)} 
                                className="bg-blue-600 hover:bg-blue-700"
                                data-testid={`button-start-visit-${site.id}`}
                              >
                                <Eye className="h-4 w-4 mr-1" /> Start Visit
                              </Button>
                            )}
                            {(site.status?.toLowerCase() === 'ongoing' || site.status?.toLowerCase() === 'in progress' || site.status?.toLowerCase() === 'in_progress') && onCompleteVisit && (
                              <Button 
                                variant="default" 
                                size="sm" 
                                onClick={() => onCompleteVisit(site)} 
                                className="bg-green-600 hover:bg-green-700"
                                data-testid={`button-complete-visit-${site.id}`}
                              >
                                Complete Visit
                              </Button>
                            )}
                          </>
                        ) : null}
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => {
                            setSelectedSite(site);
                            setDetailOpen(true);
                          }}
                          className="flex items-center gap-2"
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
        </div>
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

    </Card>
  );
};

export default MMPSiteEntriesTable;

