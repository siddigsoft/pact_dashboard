import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAppContext } from "@/context/AppContext";
import { useAuthorization } from "@/hooks/use-authorization";
import { SiteVisit } from "@/types";
import { Link } from "react-router-dom";
import { Plus, ChevronLeft, Search, MapPin, Clock } from "lucide-react";
import { useSiteVisitContext } from "@/context/siteVisit/SiteVisitContext";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { format, isValid } from "date-fns";
import { CalendarIcon } from "lucide-react";
import ApprovedMMPList from '@/components/site-visit/ApprovedMMPList';
import SiteVisitStats from '@/components/site-visit/SiteVisitStats';
import SiteVisitsByState from '@/components/site-visit/SiteVisitsByState';
import FOMSiteVisitsDashboard from '@/components/site-visit/FOMSiteVisitsDashboard';
import VisitFilters from '@/components/site-visit/VisitFilters';
import ViewToggle from '@/components/site-visit/ViewToggle';
import AssignmentMap from '@/components/site-visit/AssignmentMap';
import { Skeleton } from "@/components/ui/skeleton";
import { getStatusColor, getStatusLabel, getStatusDescription, isOverdue } from "@/utils/siteVisitUtils";
import { useToast } from "@/hooks/use-toast";
import FloatingMessenger from "@/components/communication/FloatingMessenger";
import { useMMP } from "@/context/mmp/MMPContext";
import LeafletMapContainer from '@/components/map/LeafletMapContainer';

const SiteVisits = () => {
  const { currentUser, hasRole } = useAppContext();
  const { canViewAllSiteVisits, checkPermission, hasAnyRole } = useAuthorization();
  const { siteVisits } = useSiteVisitContext();
  const { mmpFiles } = useMMP();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [filteredVisits, setFilteredVisits] = useState<SiteVisit[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");
  const [sortBy, setSortBy] = useState("dueDate");
  const [activeFilters, setActiveFilters] = useState({
    status: statusFilter,
    date: undefined as Date | undefined,
    priority: undefined as string | undefined,
  });
  const [view, setView] = useState<'grid' | 'map' | 'calendar'>('grid');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedVisit, setSelectedVisit] = useState<SiteVisit | null>(null);
  const countryParam = (searchParams.get("country") || "").toUpperCase();
  const regionParam = searchParams.get("region") || "";
  const hubParam = searchParams.get("hub") || "";
  const monthParam = searchParams.get("month") || "";
  const countryCenters: Record<string, { center: [number, number]; zoom: number }> = {
    SD: { center: [15.5007, 32.5599], zoom: 5 },
    SS: { center: [6.8769, 31.3069], zoom: 5 },
    UG: { center: [1.3733, 32.2903], zoom: 6 },
    RW: { center: [-1.9403, 29.8739], zoom: 7 },
    QA: { center: [25.3548, 51.1839], zoom: 7 },
    US: { center: [39.8283, -98.5795], zoom: 4 }
  };
  let mapDefaultCenter: [number, number] = [20, 0];
  let mapDefaultZoom = 3;
  if (countryParam && countryCenters[countryParam]) {
    mapDefaultCenter = countryCenters[countryParam].center;
    mapDefaultZoom = countryCenters[countryParam].zoom;
  }

  // Page-level access guard: require read permission or admin
  const canAccess = checkPermission('site_visits', 'read') || hasAnyRole(['admin']);
  if (!canAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to access this page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => navigate('/dashboard')}
              className="w-full"
            >
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Keep status filter in sync with URL query param
    const urlStatus = searchParams.get("status") || "all";
    if (urlStatus !== statusFilter) {
      setStatusFilter(urlStatus);
      setActiveFilters(prev => ({ ...prev, status: urlStatus }));
    }
  }, [searchParams]);

  // Check if user is a data collector
  const isDataCollector = useMemo(() => {
    if (!currentUser) return false;
    const role = (currentUser.role || '').toLowerCase();
    return role === 'datacollector' || role === 'data collector';
  }, [currentUser]);

  // Check if user is FOM (Field Operations Manager)
  const isFOM = useMemo(() => {
    if (!currentUser) return false;
    const role = (currentUser.role || '').toLowerCase();
    return hasAnyRole(['fom', 'Field Operation Manager (FOM)', 'Field Operations Manager']) || 
           role === 'fom' || 
           role === 'field operation manager (fom)' ||
           role === 'field operations manager';
  }, [currentUser]);

  // Filter for approved MMPs (only for non-FOM users)
  const approvedMMPs = useMemo(() => {
    return !isFOM ? (mmpFiles?.filter(mmp => mmp.status === 'approved') || []) : [];
  }, [isFOM, mmpFiles]);

  useEffect(() => {
    const canViewAll = canViewAllSiteVisits();
    
    // For data collectors, apply special filtering logic:
    // - "dispatched" status: show ALL dispatched visits (not filtered by user)
    // - "assigned", "accepted", "ongoing", "completed": filter by assignedTo === currentUser.id
    // - Other statuses or "all": filter by assignedTo === currentUser.id
    let filtered: SiteVisit[];
    
    if (isDataCollector && currentUser?.id) {
      // Check if we're filtering by a specific status
      if (statusFilter === "dispatched") {
        // For dispatched status, show ALL dispatched visits regardless of assignedTo
        filtered = siteVisits.filter(visit => 
          visit.status?.toLowerCase() === 'dispatched'
        );
      } else if (statusFilter === "all") {
        // For "all", show dispatched (all) + assigned/accepted/ongoing/completed (filtered by user)
        const dispatchedVisits = siteVisits.filter(visit => 
          visit.status?.toLowerCase() === 'dispatched'
        );
        const userAssignedVisits = siteVisits.filter(visit => {
          const status = visit.status?.toLowerCase();
          return visit.assignedTo === currentUser.id && 
                 (status === 'assigned' || status === 'accepted' || 
                  status === 'ongoing' || status === 'completed');
        });
        filtered = [...dispatchedVisits, ...userAssignedVisits];
      } else {
        // For specific statuses (assigned, accepted, ongoing, completed), filter by user
        const statusesToFilterByUser = ['assigned', 'accepted', 'ongoing', 'completed'];
        if (statusesToFilterByUser.includes(statusFilter.toLowerCase())) {
          filtered = siteVisits.filter(visit => 
            visit.assignedTo === currentUser.id && 
            visit.status?.toLowerCase() === statusFilter.toLowerCase()
          );
        } else {
          // For other statuses, still filter by user
          filtered = siteVisits.filter(visit => visit.assignedTo === currentUser.id);
        }
      }
    } else {
      // For non-data collectors, use existing logic
      filtered = canViewAll
        ? siteVisits
        : siteVisits.filter(visit => visit.assignedTo === currentUser?.id);
    }

    if (statusFilter !== "all") {
      if (statusFilter === "overdue") {
        filtered = filtered.filter(visit => isOverdue(visit.dueDate, visit.status));
      } else if (statusFilter === "scheduled") {
        // Scheduled includes both assigned and permitVerified
        filtered = filtered.filter(visit => 
          visit.status === 'assigned' || visit.status === 'permitVerified'
        );
      } else if (statusFilter === "dispatched") {
        // For dispatched status, only apply filter if user is NOT a data collector
        // (data collectors already have all dispatched visits from above)
        if (!isDataCollector) {
          filtered = filtered.filter(visit => visit.status?.toLowerCase() === 'dispatched');
        }
      } else {
        // For other statuses, only apply filter if:
        // - User is NOT a data collector, OR
        // - User is a data collector but the status is not one we already filtered (assigned, accepted, ongoing, completed)
        const statusesAlreadyFiltered = ['assigned', 'accepted', 'ongoing', 'completed'];
        if (!isDataCollector || !statusesAlreadyFiltered.includes(statusFilter.toLowerCase())) {
          filtered = filtered.filter(visit => visit.status?.toLowerCase() === statusFilter.toLowerCase());
        }
      }
    }

    // Apply dashboard query filters if present
    if (hubParam) {
      filtered = filtered.filter(v => (v.hub || "").toLowerCase() === hubParam.toLowerCase());
    }
    if (regionParam) {
      filtered = filtered.filter(v => {
        const r = (v.location?.region || v.region || v.state || "").toString().toLowerCase();
        return r === regionParam.toLowerCase();
      });
    }
    if (monthParam) {
      filtered = filtered.filter(v => (v.dueDate || "").startsWith(monthParam));
    }

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(
        visit => 
          visit.siteName.toLowerCase().includes(search) ||
          (visit.siteCode && visit.siteCode.toLowerCase().includes(search)) ||
          (visit.locality && visit.locality.toLowerCase().includes(search)) ||
          (visit.state && visit.state.toLowerCase().includes(search))
      );
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case "dueDate":
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        case "priority":
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        case "siteName":
          return a.siteName.localeCompare(b.siteName);
        case "createdAt":
          return new Date(b.createdAt || "").getTime() - new Date(a.createdAt || "").getTime();
        default:
          return 0;
      }
    });

    setFilteredVisits(filtered);
    
    if (view === 'map' && filtered.length > 0) {
      // For data collectors viewing dispatched, select first dispatched visit
      // Otherwise, select first pending visit
      let selected: SiteVisit | undefined;
      if (isDataCollector && statusFilter === 'dispatched') {
        selected = filtered.find(v => v.status?.toLowerCase() === 'dispatched');
      } else {
        selected = filtered.find(v => v.status === 'pending');
      }
      setSelectedVisit(selected || null);
    }
  }, [currentUser, siteVisits, statusFilter, searchTerm, sortBy, view, hubParam, regionParam, monthParam, isDataCollector, canViewAllSiteVisits]);

  const handleRemoveFilter = (filterType: string) => {
    setActiveFilters(prev => ({
      ...prev,
      [filterType]: filterType === 'status' ? 'all' : undefined,
    }));
    if (filterType === 'status') {
      setStatusFilter('all');
      setSearchParams({});
    }
  };

  const handleDateSelect = (date: Date | undefined) => {
    setActiveFilters(prev => ({
      ...prev,
      date,
    }));
  };

  const handleStatusClick = (status: string) => {
    // Handle special case for scheduled status (which includes multiple statuses)
    if (status === 'scheduled') {
      // For scheduled, we use a special filter that will show both assigned and permitVerified
      setStatusFilter('scheduled');
      setActiveFilters(prev => ({
        ...prev,
        status: 'scheduled',
      }));
      setSearchParams({ status: 'scheduled' });
    } else {
      setStatusFilter(status);
      setActiveFilters(prev => ({
        ...prev,
        status,
      }));
      setSearchParams({ status });
    }

    // Scroll to the filtered results
    setTimeout(() => {
      const resultsElement = document.querySelector('[data-results-section]');
      if (resultsElement) {
        resultsElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };
  
  const handleVisitSelection = (visit: SiteVisit) => {
    setSelectedVisit(visit);
  };
  
  const handleAssignmentSuccess = () => {
    toast({
      title: "Site visit assigned",
      description: "Assignment successful. Refreshing visits...",
      variant: "success",
    });
    
    setTimeout(() => {
      setSelectedVisit(null);
      navigate('/site-visits');
    }, 2000);
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[125px] w-full" />
          ))}
        </div>
      </div>
    );
  }

  const renderContent = () => {
    if (view === 'map') {
      // Build map locations for all filtered visits
      const siteLocations = filteredVisits
        .map(v => {
          const lat = (v as any)?.coordinates?.latitude ?? (v as any)?.location?.latitude;
          const lng = (v as any)?.coordinates?.longitude ?? (v as any)?.location?.longitude;
          if (!lat || !lng || isNaN(lat) || isNaN(lng)) return null;
          return {
            id: v.id,
            name: v.siteName,
            latitude: lat as number,
            longitude: lng as number,
            type: 'site' as const,
            status: v.status,
          };
        })
        .filter(Boolean) as Array<{id:string;name:string;latitude:number;longitude:number;type:'site';status:string}>;

      return (
        <div className="space-y-6">
          {siteLocations.length > 0 && (
            <div className="h-[500px] w-full rounded-lg overflow-hidden">
              <LeafletMapContainer
                locations={siteLocations}
                height="500px"
                defaultCenter={mapDefaultCenter}
                defaultZoom={mapDefaultZoom}
                onLocationClick={(id) => {
                  const v = filteredVisits.find(x => x.id === id);
                  if (v) setSelectedVisit(v);
                }}
              />
            </div>
          )}

          {selectedVisit ? (
            <>
              <div className="flex items-center justify-between bg-muted/30 p-4 rounded-lg">
                <div>
                  <h3 className="text-lg font-medium">{selectedVisit.siteName}</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedVisit.locality}, {selectedVisit.state}
                  </p>
                  {selectedVisit.hub && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Hub: <span className="font-medium">{selectedVisit.hub}</span>
                    </div>
                  )}
                  {(selectedVisit.visitTypeRaw || selectedVisit.visitType) && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Visit Type: <span className="font-medium">{selectedVisit.visitTypeRaw || selectedVisit.visitType}</span>
                    </div>
                  )}
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setSelectedVisit(null)}
                >
                  Change Site
                </Button>
              </div>
              
              <AssignmentMap 
                siteVisit={selectedVisit} 
                onAssignSuccess={handleAssignmentSuccess}
              />
            </>
          ) : (
            <div className="space-y-4">
              <h3 className="text-lg font-medium">
                {isDataCollector && statusFilter === 'dispatched' 
                  ? 'Select a dispatched site visit to accept' 
                  : 'Select a site visit to assign'}
              </h3>
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {filteredVisits
                  .filter(visit => {
                    // For data collectors viewing dispatched, show dispatched visits
                    if (isDataCollector && statusFilter === 'dispatched') {
                      return visit.status?.toLowerCase() === 'dispatched';
                    }
                    // Otherwise, show pending visits
                    return visit.status === 'pending';
                  })
                  .slice(0, 6)
                  .map(visit => (
                    <Card 
                      key={visit.id} 
                      className="cursor-pointer hover:border-primary transition-colors"
                      onClick={() => handleVisitSelection(visit)}
                    >
                      <CardContent className="p-4">
                        <div className="flex justify-between items-center">
                          <h4 className="font-medium">{visit.siteName}</h4>
                          <Badge variant="outline">{visit.priority} priority</Badge>
                        </div>
                        <div className="flex items-center text-sm text-muted-foreground mt-2">
                          <MapPin className="h-4 w-4 mr-1" />
                          {visit.locality}, {visit.state}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                
                {filteredVisits.filter(visit => {
                  if (isDataCollector && statusFilter === 'dispatched') {
                    return visit.status?.toLowerCase() === 'dispatched';
                  }
                  return visit.status === 'pending';
                }).length === 0 && (
                  <div className="col-span-full flex items-center justify-center p-8 bg-muted/20 rounded-lg">
                    <p className="text-muted-foreground">
                      {isDataCollector && statusFilter === 'dispatched'
                        ? 'No dispatched site visits available'
                        : 'No pending site visits to assign'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      );
    }
    
    return (
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {filteredVisits.map((visit) => (
          <Card 
            key={visit.id} 
            className="overflow-hidden transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 bg-gradient-to-b from-card to-background border-none group hover:border-primary/30 hover:border hover:scale-[1.02]"
          >
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <CardTitle className="text-md font-semibold group-hover:text-primary transition-colors">
                  {visit.siteName}
                </CardTitle>
                <div className={`px-2 py-1 text-xs rounded-full transition-colors ${getStatusColor(visit.status, visit.dueDate)}`}>
                  {getStatusLabel(visit.status, visit.dueDate)}
                </div>
              </div>
              <CardDescription className="flex items-center mt-1">
                <MapPin className="h-3 w-3 mr-1 text-primary/70" />
                {visit.locality || 'N/A'}, {visit.state || 'N/A'}
              </CardDescription>
              <div className="text-xs border-l-2 border-primary/30 pl-2 mt-2 py-2 bg-primary/5 rounded-r-sm group-hover:bg-primary/10 group-hover:border-primary transition-all">
                <div className="font-medium text-muted-foreground">
                  Status Details:
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {getStatusDescription(visit.status, visit.permitDetails)}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pb-2">
              <div className="text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center text-muted-foreground">
                    <Clock className="h-3 w-3 mr-1 text-primary/70" />
                    Code: {visit.siteCode || 'N/A'}
                  </div>
                  <div className="flex items-center text-muted-foreground">
                    <CalendarIcon className="h-3 w-3 mr-1 text-primary/70" />
                    Due: {(() => { const d = new Date(visit.dueDate || ''); return isValid(d) ? format(d, 'MMM d, yyyy') : 'N/A'; })()}
                  </div>
                </div>
                <div className="mt-2 text-muted-foreground line-clamp-1">
                  {visit.activity || visit.mainActivity || 'No activity specified'}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="text-xs text-muted-foreground">
                    Hub: <span className="font-medium">{visit.hub || 'N/A'}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Visit Type: <span className="font-medium">{visit.visitTypeRaw || visit.visitType || 'N/A'}</span>
                  </div>
                </div>
                <div className="mt-1 text-xs text-muted-foreground line-clamp-1">
                  CP: <span className="font-medium">{visit.cpName || 'N/A'}</span>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-border/50">
                <div className={`text-xs px-2 py-0.5 rounded-full ${
                  visit.priority === 'high' 
                    ? 'bg-red-100 text-red-800 border border-red-200' 
                    : visit.priority === 'medium'
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : 'bg-green-100 text-green-800 border border-green-200'
                }`}>
                  {(visit.priority ? visit.priority.charAt(0).toUpperCase() + visit.priority.slice(1) : 'Unknown')} Priority
                </div>
                <div className="font-medium">
                  ${visit.fees?.total || 'N/A'}
                </div>
              </div>
            </CardContent>
            <CardFooter className="bg-muted/20">
              <Button 
                asChild 
                className="w-full shadow-sm hover:shadow-md transition-all" 
                variant={
                  ['pending', 'approved'].includes(visit.status) ? 'outline' :
                  ['inProgress', 'assigned'].includes(visit.status) ? 'default' :
                  'secondary'
                }
              >
                <Link to={`/site-visits/${visit.id}`}>
                  {visit.status === 'completed' ? 'View Details' : 'Manage Visit'}
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
        
        {filteredVisits.length === 0 && (
          <div className="text-center py-20 col-span-full">
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="h-20 w-20 rounded-full bg-muted/50 backdrop-blur-sm flex items-center justify-center">
                <NoVisitsIcon className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium">No site visits found</h3>
              <p className="text-muted-foreground">
                {searchTerm || statusFilter !== "all"
                  ? "Try adjusting your filters"
                  : "No site visits have been created yet"}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (isFOM) {
    const canViewAll = canViewAllSiteVisits();
    const fomVisits = canViewAll 
      ? siteVisits 
      : siteVisits.filter(visit => visit.assignedTo === currentUser?.id);

    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2" data-testid="text-page-title-fom">
              <MapPin className="h-8 w-8 text-primary" />
              Site Visits Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Browse sites by state and filter by status
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/dashboard")}
            data-testid="button-back-dashboard-fom"
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Dashboard
          </Button>
        </div>

        <FOMSiteVisitsDashboard visits={fomVisits} />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header - Matching Hub Operations Style */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2" data-testid="text-page-title-site-visits">
            <MapPin className="h-8 w-8 text-primary" />
            Site Visits
          </h1>
          <p className="text-muted-foreground mt-1">
            {isDataCollector 
              ? "View and manage your assigned site visits" 
              : "Manage and track all site visits across all projects"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/dashboard")}
            data-testid="button-back-dashboard"
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Dashboard
          </Button>
          {!isDataCollector && (checkPermission('site_visits', 'create') || hasAnyRole(['admin'])) && (
            <Button 
              size="sm"
              asChild
              data-testid="button-create-site-visit"
            >
              <Link to="/site-visits/create" className="gap-2">
                <Plus className="h-4 w-4" />
                Create Site Visit
              </Link>
            </Button>
          )}
        </div>
      </div>

      <SiteVisitStats 
        visits={(() => {
          // For data collectors, show:
          // - All dispatched visits (for dispatched stat)
          // - Their assigned/accepted/ongoing/completed visits (for other stats)
          if (isDataCollector && currentUser?.id) {
            const dispatchedVisits = siteVisits.filter(visit => 
              visit.status?.toLowerCase() === 'dispatched'
            );
            const userAssignedVisits = siteVisits.filter(visit => {
              const status = visit.status?.toLowerCase();
              return visit.assignedTo === currentUser.id && 
                     (status === 'assigned' || status === 'accepted' || 
                      status === 'ongoing' || status === 'completed');
            });
            return [...dispatchedVisits, ...userAssignedVisits];
          }
          // For other users, show all visits they can view
          const canViewAll = canViewAllSiteVisits();
          return canViewAll 
            ? siteVisits 
            : siteVisits.filter(visit => visit.assignedTo === currentUser?.id);
        })()}
        onStatusClick={handleStatusClick}
        isDataCollector={isDataCollector}
      />

      {/* Hide MMP section for data collectors - they don't create visits from MMPs */}
      {!isDataCollector && (
        <ApprovedMMPList 
          mmps={approvedMMPs} // Pass the filtered MMP files
          onSelectMMP={(mmp) => navigate(`/site-visits/create/mmp/${mmp.id}`)}
        />
      )}

      <div className="flex flex-col gap-4" data-results-section>
        <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by site name, code, locality..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full bg-background/50 backdrop-blur-sm"
            />
          </div>
          
          <div className="flex gap-2 items-center">
            <ViewToggle view={view} onViewChange={setView} />
            
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[180px] bg-background/50 backdrop-blur-sm">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt">Newest First</SelectItem>
                <SelectItem value="dueDate">Due Date</SelectItem>
                <SelectItem value="priority">Priority</SelectItem>
                <SelectItem value="siteName">Site Name</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <VisitFilters
          activeFilters={activeFilters}
          onRemoveFilter={handleRemoveFilter}
          onDateSelect={handleDateSelect}
        />

        {/* Show active filter indicator */}
        {statusFilter !== 'all' && (
          <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="text-sm font-medium text-primary">
              Showing {statusFilter === 'scheduled' 
                ? 'scheduled (assigned & permit verified)' 
                : statusFilter === 'overdue' 
                ? 'overdue' 
                : statusFilter} visits
              {isDataCollector && currentUser?.id && (
                <span className="text-xs text-muted-foreground ml-2">
                  {statusFilter.toLowerCase() === 'dispatched' 
                    ? '(All dispatched sites)' 
                    : '(Your assignments only)'}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatusFilter('all');
                setActiveFilters(prev => ({ ...prev, status: 'all' }));
                setSearchParams({});
              }}
              className="text-primary hover:text-primary/80"
            >
              Clear filter
            </Button>
          </div>
        )}

        {renderContent()}
      </div>
      
      {/* <FloatingMessenger /> */}
    </div>
  );
};

const NoVisitsIcon = ({ className }: { className?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  );
};

export default SiteVisits;
