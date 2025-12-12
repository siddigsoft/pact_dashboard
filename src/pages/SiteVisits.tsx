import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAppContext } from "@/context/AppContext";
import { useAuthorization } from "@/hooks/use-authorization";
import { SiteVisit } from "@/types";
import { Link } from "react-router-dom";
import { Plus, ChevronLeft, Search, MapPin, Clock, AlertTriangle, Building2, FileText, Wallet, History, ExternalLink, User, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from 'date-fns';
import { DataFreshnessBadge } from "@/components/realtime";
import { queryClient } from "@/lib/queryClient";
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
import { sudanStates, getStateName, getLocalityName } from '@/data/sudanStates';
import { supabase } from '@/integrations/supabase/client';
import { useUserProjects } from '@/hooks/useUserProjects';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';

const SiteVisits = () => {
  const { currentUser, hasRole } = useAppContext();
  const { canViewAllSiteVisits, checkPermission, hasAnyRole } = useAuthorization();
  const { isSuperAdmin } = useSuperAdmin();
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

  // Check if user is a data collector based on role name (for access check)
  const isDataCollectorForAccess = useMemo(() => {
    if (!currentUser) return false;
    const role = (currentUser.role || '').toLowerCase().replace(/[\s_-]/g, '');
    return role === 'datacollector' || role.includes('datacollector');
  }, [currentUser]);

  // Check if user is a coordinator based on role name (for access check)
  const isCoordinatorForAccess = useMemo(() => {
    if (!currentUser) return false;
    const role = (currentUser.role || '').toLowerCase().replace(/[\s_-]/g, '');
    return role === 'coordinator' || role.includes('coordinator');
  }, [currentUser]);

  // Page-level access guard: require read permission, admin, data collector, or coordinator role
  // Data Collectors and Coordinators are field workers who MUST have access to site visits
  const canAccess = checkPermission('site_visits', 'read') || 
                   hasAnyRole(['admin', 'Admin', 'DataCollector', 'Data Collector', 'Coordinator', 'ict', 'ICT', 'Supervisor', 'supervisor']) ||
                   isDataCollectorForAccess ||
                   isCoordinatorForAccess;
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

  // Check if user is a coordinator
  const isCoordinator = useMemo(() => {
    if (!currentUser) return false;
    const role = (currentUser.role || '').toLowerCase();
    return role === 'coordinator';
  }, [currentUser]);

  // Check if user is a field worker who can claim sites (data collector OR coordinator)
  // Coordinators can monitor and claim sites within their locality just like data collectors
  const isFieldWorker = useMemo(() => {
    return isDataCollector || isCoordinator;
  }, [isDataCollector, isCoordinator]);

  // Check if user is FOM (Field Operations Manager)
  const isFOM = useMemo(() => {
    if (!currentUser) return false;
    const role = (currentUser.role || '').toLowerCase();
    return hasAnyRole(['fom', 'Field Operation Manager (FOM)', 'Field Operations Manager']) || 
           role === 'fom' || 
           role === 'field operation manager (fom)' ||
           role === 'field operations manager';
  }, [currentUser]);

  // Check if user is a supervisor (not admin/ict)
  const isSupervisor = useMemo(() => {
    if (!currentUser) return false;
    const role = (currentUser.role || '').toLowerCase();
    const isAdmin = hasAnyRole(['admin', 'ict']);
    return (hasAnyRole(['supervisor', 'Supervisor']) || role === 'supervisor') && !isAdmin;
  }, [currentUser]);

  // Get supervisor's hub ID for filtering
  const supervisorHubId = currentUser?.hubId;
  
  // State for supervisor's hub name (fetched from database)
  const [supervisorHubName, setSupervisorHubName] = useState<string | null>(null);

  // Fetch hub name for supervisor
  useEffect(() => {
    if (!isSupervisor || !supervisorHubId) {
      setSupervisorHubName(null);
      return;
    }
    const fetchHubName = async () => {
      const { data } = await supabase
        .from('hubs')
        .select('name')
        .eq('id', supervisorHubId)
        .maybeSingle();
      if (data) setSupervisorHubName(data.name);
    };
    fetchHubName();
  }, [isSupervisor, supervisorHubId]);

  // Get user's project team memberships from projects table (team.members, team.teamComposition)
  const { userProjectIds, isAdminOrSuperUser } = useUserProjects();

  // Check if user can view all projects (admins, ICT, FOM, super admins don't need team membership filter)
  const canViewAllProjects = useMemo(() => {
    if (isAdminOrSuperUser) return true;
    return hasAnyRole(['admin', 'Admin', 'ict', 'ICT', 'fom', 'Field Operation Manager (FOM)', 'Field Operations Manager']);
  }, [hasAnyRole, isAdminOrSuperUser]);

  // Get user's geographic assignment from profile (state and locality)
  // Works for both data collectors and coordinators who can claim sites within their locality
  const userGeographicInfo = useMemo(() => {
    if (!currentUser || !isFieldWorker) return null;
    
    const userStateId = currentUser.stateId;
    const userLocalityId = currentUser.localityId;
    
    if (!userStateId) {
      const roleType = isCoordinator ? 'Coordinator' : 'Data collector';
      console.warn(`${roleType} has no state assigned in profile`);
      return { hasGeo: false, stateName: null, localityName: null, stateId: null, localityId: null };
    }
    
    // Get state name from ID
    const stateName = getStateName(userStateId);
    
    // Get locality name from IDs (if locality is assigned)
    const localityName = userLocalityId ? getLocalityName(userStateId, userLocalityId) : null;
    
    const roleType = isCoordinator ? 'Coordinator' : 'Data Collector';
    console.log(`📍 ${roleType} Geographic Info:`, {
      userId: currentUser.id,
      stateId: userStateId,
      stateName,
      localityId: userLocalityId,
      localityName
    });
    
    return { 
      hasGeo: true, 
      stateName, 
      localityName, 
      stateId: userStateId, 
      localityId: userLocalityId 
    };
  }, [currentUser, isFieldWorker, isCoordinator]);

  // Helper function to check if a site matches the user's geographic location
  const siteMatchesUserGeography = (visit: SiteVisit): boolean => {
    if (!userGeographicInfo?.hasGeo) return false;
    
    const visitState = (visit.state || '').toLowerCase().trim();
    const visitLocality = (visit.locality || '').toLowerCase().trim();
    const userState = (userGeographicInfo.stateName || '').toLowerCase().trim();
    const userLocality = (userGeographicInfo.localityName || '').toLowerCase().trim();
    
    // Must match state
    const stateMatches = visitState === userState || 
                         visitState.includes(userState) || 
                         userState.includes(visitState);
    
    if (!stateMatches) return false;
    
    // If user has locality assigned, must also match locality
    if (userGeographicInfo.localityId && userLocality) {
      const localityMatches = visitLocality === userLocality || 
                              visitLocality.includes(userLocality) || 
                              userLocality.includes(visitLocality);
      return localityMatches;
    }
    
    // If no locality assigned, only check state
    return true;
  };

  // Filter for approved MMPs (only for non-FOM users)
  const approvedMMPs = useMemo(() => {
    return !isFOM ? (mmpFiles?.filter(mmp => mmp.status === 'approved') || []) : [];
  }, [isFOM, mmpFiles]);

  useEffect(() => {
    const canViewAll = canViewAllSiteVisits();
    
    // SuperAdmin can see ALL site visits without any restrictions
    if (isSuperAdmin) {
      let filtered = [...siteVisits];
      
      // Apply status filter if set
      if (statusFilter && statusFilter !== "all") {
        filtered = filtered.filter(visit => 
          visit.status?.toLowerCase() === statusFilter.toLowerCase()
        );
      }
      
      // Apply search filter
      if (searchTerm.trim()) {
        const search = searchTerm.toLowerCase();
        filtered = filtered.filter(visit =>
          (visit.siteName && visit.siteName.toLowerCase().includes(search)) ||
          (visit.siteCode && visit.siteCode.toLowerCase().includes(search)) ||
          (visit.locality && visit.locality.toLowerCase().includes(search)) ||
          (visit.state && visit.state.toLowerCase().includes(search))
        );
      }
      
      // Sort filtered visits
      filtered.sort((a, b) => {
        if (sortBy === "dueDate") {
          return new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime();
        } else if (sortBy === "priority") {
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          return (priorityOrder[a.priority as keyof typeof priorityOrder] || 2) - 
                 (priorityOrder[b.priority as keyof typeof priorityOrder] || 2);
        }
        return 0;
      });
      
      setFilteredVisits(filtered);
      return;
    }
    
    // For field workers (data collectors and coordinators), apply special filtering logic:
    // - "dispatched" status: show ONLY dispatched visits matching user's state AND locality
    //   This is where geographic filtering applies - users can only SEE and CLAIM sites in their locality
    // - "assigned", "accepted", "ongoing", "completed": filter by assignedTo === currentUser.id
    //   No additional geo filter here - users must see work assigned to them regardless of location
    //   (ClaimSiteButton/AcceptSiteButton enforce locality rules at claim time, not view time)
    // - Other statuses or "all": filter by assignedTo === currentUser.id
    let filtered: SiteVisit[];
    
    if (isFieldWorker && currentUser?.id) {
      // Check if we're filtering by a specific status
      if (statusFilter === "dispatched") {
        // For dispatched status, show ONLY dispatched visits in user's state AND locality
        filtered = siteVisits.filter(visit => {
          if (visit.status?.toLowerCase() !== 'dispatched') return false;
          
          // Geographic filtering: must match user's state AND locality from profile
          const matches = siteMatchesUserGeography(visit);
          if (!matches) {
            console.log(`🚫 Site "${visit.siteName}" filtered out - does not match user's location (${visit.state}/${visit.locality})`);
          }
          return matches;
        });
        
        console.log(`📊 Dispatched sites matching user geography: ${filtered.length} of ${siteVisits.filter(v => v.status?.toLowerCase() === 'dispatched').length}`);
      } else if (statusFilter === "all") {
        // For "all", show dispatched (geo-filtered) + assigned/accepted/ongoing/completed (filtered by user)
        const dispatchedVisits = siteVisits.filter(visit => {
          if (visit.status?.toLowerCase() !== 'dispatched') return false;
          return siteMatchesUserGeography(visit);
        });
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
    } else if (isSupervisor) {
      // For supervisors, filter by their assigned hub
      if (supervisorHubName) {
        const hubName = supervisorHubName.toLowerCase().trim();
        filtered = siteVisits.filter(visit => {
          const visitHub = (visit.hub || '').toLowerCase().trim();
          // Skip sites with no hub assignment - supervisors should only see sites from their hub
          if (!visitHub) return false;
          // Match by hub name (exact match or contains for variations like "Dongola" vs "Dongola Hub")
          return visitHub === hubName || 
                 visitHub.includes(hubName) ||
                 (visitHub.length > 0 && hubName.includes(visitHub));
        });
        console.log(`📊 Supervisor hub filter: showing ${filtered.length} sites from hub "${supervisorHubName}"`);
      } else {
        // Supervisor without hub assignment - show no sites until assigned
        console.warn('⚠️ Supervisor has no hub assigned - cannot show sites');
        filtered = [];
      }
    } else {
      // For non-data collectors (admin, FOM, etc.), use existing logic
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
        // For dispatched status, only apply filter if user is NOT a field worker
        // (field workers already have all dispatched visits from above)
        if (!isFieldWorker) {
          filtered = filtered.filter(visit => visit.status?.toLowerCase() === 'dispatched');
        }
      } else {
        // For other statuses, only apply filter if:
        // - User is NOT a field worker, OR
        // - User is a field worker but the status is not one we already filtered (assigned, accepted, ongoing, completed)
        const statusesAlreadyFiltered = ['assigned', 'accepted', 'ongoing', 'completed'];
        if (!isFieldWorker || !statusesAlreadyFiltered.includes(statusFilter.toLowerCase())) {
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

    // Apply project team membership filter
    // Users can only see sites from projects they're team members of (unless they can view all projects)
    // Exception: Field workers (data collectors, coordinators) can see dispatched sites in their locality even without project membership
    if (!canViewAllProjects) {
      const beforeCount = filtered.length;
      filtered = filtered.filter(visit => {
        const projectId = visit.mmpDetails?.projectId;
        const isDispatched = visit.status?.toLowerCase() === 'dispatched';
        
        // Field workers can see dispatched sites in their locality (already filtered by geography)
        // This is the ONLY exception to the project membership rule
        if (isFieldWorker && isDispatched) return true;
        
        // All other sites require project membership
        // If visit has no project ID, we can't verify membership, so hide it
        if (!projectId) return false;
        
        // Check if user is a team member of this project
        return userProjectIds.includes(projectId);
      });
      console.log(`👥 Project team filter: ${filtered.length} of ${beforeCount} sites visible (user is in ${userProjectIds.length} projects)`);
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
      // For field workers viewing dispatched, select first dispatched visit
      // Otherwise, select first pending visit
      let selected: SiteVisit | undefined;
      if (isFieldWorker && statusFilter === 'dispatched') {
        selected = filtered.find(v => v.status?.toLowerCase() === 'dispatched');
      } else {
        selected = filtered.find(v => v.status === 'pending');
      }
      setSelectedVisit(selected || null);
    }
  }, [currentUser, siteVisits, statusFilter, searchTerm, sortBy, view, hubParam, regionParam, monthParam, isFieldWorker, canViewAllSiteVisits, isSupervisor, supervisorHubName, canViewAllProjects, userProjectIds, isSuperAdmin]);

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
                {isFieldWorker && statusFilter === 'dispatched' 
                  ? 'Select a dispatched site visit to accept' 
                  : 'Select a site visit to assign'}
              </h3>
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {filteredVisits
                  .filter(visit => {
                    // For field workers viewing dispatched, show dispatched visits
                    if (isFieldWorker && statusFilter === 'dispatched') {
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
                  if (isFieldWorker && statusFilter === 'dispatched') {
                    return visit.status?.toLowerCase() === 'dispatched';
                  }
                  return visit.status === 'pending';
                }).length === 0 && (
                  <div className="col-span-full flex items-center justify-center p-8 bg-muted/20 rounded-lg">
                    <p className="text-muted-foreground">
                      {isFieldWorker && statusFilter === 'dispatched'
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
      <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {filteredVisits.map((visit) => (
          <Card 
            key={visit.id} 
            className="overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-1 active:scale-[0.98] bg-gradient-to-b from-card to-background border-none group hover:border-primary/30 hover:border hover:scale-[1.02]"
          >
            <CardHeader className="pb-3 sm:pb-2">
              <div className="flex justify-between items-start gap-2">
                <CardTitle className="text-base sm:text-md font-semibold group-hover:text-primary transition-colors leading-tight">
                  {visit.siteName}
                </CardTitle>
                <div className={`px-2 py-1 text-xs rounded-full transition-colors shrink-0 ${getStatusColor(visit.status, visit.dueDate)}`}>
                  {getStatusLabel(visit.status, visit.dueDate)}
                </div>
              </div>
              <CardDescription className="flex items-center mt-1 text-sm">
                <MapPin className="h-3 w-3 mr-1 text-primary/70 flex-shrink-0" />
                <span className="truncate">{visit.locality || 'N/A'}, {visit.state || 'N/A'}</span>
              </CardDescription>
              
              {/* Mobile status details - more compact */}
              <div className="text-xs border-l-2 border-primary/30 pl-2 mt-2 py-1.5 sm:py-2 bg-primary/5 rounded-r-sm group-hover:bg-primary/10 group-hover:border-primary transition-all">
                <div className="font-medium text-muted-foreground text-xs">
                  Status:
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                  {getStatusDescription(visit.status, visit.permitDetails)}
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-3 sm:space-y-3 pb-2">
              <div className="text-sm space-y-2">
                {/* Mobile-optimized grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="flex items-center text-muted-foreground text-xs sm:text-sm">
                    <Clock className="h-3 w-3 mr-1 text-primary/70 flex-shrink-0" />
                    <span className="truncate">Code: {visit.siteCode || 'N/A'}</span>
                  </div>
                  <div className="flex items-center text-muted-foreground text-xs sm:text-sm">
                    <CalendarIcon className="h-3 w-3 mr-1 text-primary/70 flex-shrink-0" />
                    <span className="truncate">
                      Due: {(() => { const d = new Date(visit.dueDate || ''); return isValid(d) ? format(d, 'MMM d, yyyy') : 'N/A'; })()}
                    </span>
                  </div>
                </div>
                
                {/* Activity - mobile friendly */}
                <div className="text-muted-foreground text-xs sm:text-sm line-clamp-2 min-h-[2rem] sm:min-h-[1rem]">
                  {visit.activity || visit.mainActivity || 'No activity specified'}
                </div>
                
                {/* Additional info - stacked on mobile */}
                <div className="space-y-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs text-muted-foreground">
                    <div className="truncate">
                      Hub: <span className="font-medium">{visit.hub || 'N/A'}</span>
                    </div>
                    <div className="truncate">
                      Visit Type: <span className="font-medium">{visit.visitTypeRaw || visit.visitType || 'N/A'}</span>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    CP: <span className="font-medium">{visit.cpName || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Priority and fees - mobile optimized */}
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 pt-2 border-t border-border/50">
                <div className={`text-xs px-2 py-1 rounded-full self-start sm:self-center ${
                  visit.priority === 'high' 
                    ? 'bg-red-100 text-red-800 border border-red-200' 
                    : visit.priority === 'medium'
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : 'bg-green-100 text-green-800 border border-green-200'
                }`}>
                  {(visit.priority ? visit.priority.charAt(0).toUpperCase() + visit.priority.slice(1) : 'Unknown')} Priority
                </div>
                <div className="font-medium text-sm sm:text-base">
                  {visit.fees?.total ? `SDG ${Number(visit.fees.total).toLocaleString()}` : 'N/A'}
                </div>
              </div>
            </CardContent>
            
            {/* Mobile-optimized footer with larger touch target */}
            <CardFooter className="bg-muted/20 p-3 sm:p-4">
              <Button 
                asChild 
                className="w-full shadow-sm hover:shadow-md transition-all min-h-[44px] text-sm sm:text-base py-3 active:scale-95" 
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
          <div className="text-center py-12 sm:py-20 col-span-full">
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-muted/50 backdrop-blur-sm flex items-center justify-center">
                <NoVisitsIcon className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
              </div>
              <h3 className="text-lg sm:text-xl font-medium">No site visits found</h3>
              <p className="text-muted-foreground text-center px-4">
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
            asChild
            data-testid="button-back-dashboard-fom"
          >
            <Link to="/dashboard">
              <ChevronLeft className="h-4 w-4 mr-2" />
              Dashboard
            </Link>
          </Button>
        </div>

        <FOMSiteVisitsDashboard visits={fomVisits} />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Warning banner for field workers without geographic profile */}
      {isFieldWorker && userGeographicInfo && !userGeographicInfo.hasGeo && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950" data-testid="alert-no-geographic-profile">
          <CardContent className="flex items-start gap-4 p-4">
            <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-amber-800 dark:text-amber-200">Geographic Profile Not Configured</h3>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Your profile does not have a state and locality assigned. You will not be able to see or claim any dispatched sites until your administrator configures your geographic assignment.
              </p>
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
                Please contact your supervisor or administrator to update your profile with your assigned state and locality.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Geographic info banner for field workers (data collectors and coordinators) */}
      {isFieldWorker && userGeographicInfo?.hasGeo && (
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950" data-testid="alert-geographic-profile">
          <CardContent className="flex items-center gap-4 p-4">
            <MapPin className="h-6 w-6 text-blue-600 dark:text-blue-400 shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                <span className="font-semibold">Your assigned area:</span>{' '}
                {userGeographicInfo.localityName 
                  ? `${userGeographicInfo.localityName}, ${userGeographicInfo.stateName}`
                  : userGeographicInfo.stateName
                }
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                You can only see and claim dispatched sites within your assigned area.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header - Matching Hub Operations Style */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2" data-testid="text-page-title-site-visits">
              <MapPin className="h-8 w-8 text-primary" />
              Site Visits
            </h1>
            <DataFreshnessBadge 
              lastUpdated={siteVisits.length > 0 ? new Date() : null}
              onRefresh={async () => { await queryClient.invalidateQueries({ queryKey: ['site-visits'] }); }}
              staleThresholdMinutes={5}
              variant="badge"
            />
          </div>
          <p className="text-muted-foreground mt-1">
            {isFieldWorker 
              ? "View and manage your assigned site visits" 
              : "Manage and track all site visits across all projects"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            asChild
            data-testid="button-back-dashboard"
          >
            <Link to="/dashboard">
              <ChevronLeft className="h-4 w-4 mr-2" />
              Dashboard
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild data-testid="link-documents">
            <Link to="/documents">
              <FileText className="h-4 w-4 mr-2" />
              Documents
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild data-testid="link-wallet-reports">
            <Link to="/wallet-reports">
              <Wallet className="h-4 w-4 mr-2" />
              Wallet Reports
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild data-testid="link-audit-logs">
            <Link to="/audit-logs">
              <History className="h-4 w-4 mr-2" />
              Audit Logs
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild data-testid="link-map">
            <Link to="/map">
              <MapPin className="h-4 w-4 mr-2" />
              Map
            </Link>
          </Button>
          {!isFieldWorker && (checkPermission('site_visits', 'create') || hasAnyRole(['admin'])) && (
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
          // For field workers (data collectors and coordinators), show:
          // - All dispatched visits (for dispatched stat)
          // - Their assigned/accepted/ongoing/completed visits (for other stats)
          if (isFieldWorker && currentUser?.id) {
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
        isDataCollector={isFieldWorker}
      />

      {/* Hide MMP section for field workers - they don't create visits from MMPs */}
      {!isFieldWorker && (
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
              {isFieldWorker && currentUser?.id && (
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
