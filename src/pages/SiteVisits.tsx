
import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAppContext } from "@/context/AppContext";
import { SiteVisit } from "@/types";
import { Link } from "react-router-dom";
import { Plus, ChevronLeft, Search, MapPin, Clock } from "lucide-react";
import { useSiteVisitContext } from "@/context/siteVisit/SiteVisitContext";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import ApprovedMMPList from '@/components/site-visit/ApprovedMMPList';
import SiteVisitStats from '@/components/site-visit/SiteVisitStats';
import VisitFilters from '@/components/site-visit/VisitFilters';
import ViewToggle from '@/components/site-visit/ViewToggle';
import AssignmentMap from '@/components/site-visit/AssignmentMap';
import { Skeleton } from "@/components/ui/skeleton";
import { getStatusColor, getStatusLabel, getStatusDescription } from "@/utils/siteVisitUtils";
import { useToast } from "@/hooks/use-toast";
import FloatingMessenger from "@/components/communication/FloatingMessenger";
import { useMMP } from "@/context/mmp/MMPContext";
import LeafletMapContainer from '@/components/map/LeafletMapContainer';

const SiteVisits = () => {
  const { currentUser, hasPermission, hasRole } = useAppContext();
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

  // Filter for approved MMPs
  const approvedMMPs = mmpFiles?.filter(mmp => mmp.status === 'approved') || [];

  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const canViewAll = (typeof hasPermission === 'function' && hasPermission('view_all_site_visits'))
      || ['admin','ict','supervisor','fom'].includes(currentUser?.role || '');
    let filtered = canViewAll
      ? siteVisits
      : siteVisits.filter(visit => visit.assignedTo === currentUser?.id);

    if (statusFilter !== "all") {
      filtered = filtered.filter(visit => visit.status === statusFilter);
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
      const pendingVisit = filtered.find(v => v.status === 'pending');
      setSelectedVisit(pendingVisit || null);
    }
  }, [currentUser, siteVisits, statusFilter, searchTerm, sortBy, view]);

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
                defaultCenter={[15.5007, 32.5599]}
                defaultZoom={6}
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
              <h3 className="text-lg font-medium">Select a site visit to assign</h3>
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {filteredVisits
                  .filter(visit => visit.status === 'pending')
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
                
                {filteredVisits.filter(visit => visit.status === 'pending').length === 0 && (
                  <div className="col-span-full flex items-center justify-center p-8 bg-muted/20 rounded-lg">
                    <p className="text-muted-foreground">No pending site visits to assign</p>
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
                <div className={`px-2 py-1 text-xs rounded-full transition-colors ${getStatusColor(visit.status)}`}>
                  {getStatusLabel(visit.status)}
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
                    Due: {format(new Date(visit.dueDate), 'MMM d, yyyy')}
                  </div>
                </div>
                <div className="mt-2 text-muted-foreground line-clamp-1">
                  {visit.activity || visit.mainActivity || 'No activity specified'}
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
                  {visit.priority.charAt(0).toUpperCase() + visit.priority.slice(1)} Priority
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

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-background to-muted p-6 rounded-lg shadow-sm">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/dashboard")}
            className="hover:bg-background/50"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Site Visits
            </h1>
            <p className="text-muted-foreground">
              Manage and track all site visits
            </p>
          </div>
        </div>
        {['admin', 'ict'].includes(currentUser?.role || '') && (
          <Button 
            className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300" 
            asChild
          >
            <Link to="/site-visits/create" className="gap-2">
              <Plus className="h-4 w-4" />
              Create Site Visit
            </Link>
          </Button>
        )}
      </div>

      <SiteVisitStats visits={siteVisits} />

      <ApprovedMMPList 
        mmps={approvedMMPs} // Pass the filtered MMP files
        onSelectMMP={(mmp) => navigate(`/site-visits/create/mmp/${mmp.id}`)}
      />

      <div className="flex flex-col gap-4">
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

        {renderContent()}
      </div>
      
      <FloatingMessenger />
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
