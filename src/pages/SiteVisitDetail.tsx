
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { SiteVisit } from "@/types";
import { SiteVisitHeader } from "@/components/site-visit/SiteVisitHeader";
import { SiteVisitInfo } from "@/components/site-visit/SiteVisitInfo";
import { SiteVisitDates } from "@/components/site-visit/SiteVisitDates";
import AssignCollectorButton from "@/components/site-visit/AssignCollectorButton";
import { useSiteVisitContext } from "@/context/siteVisit/SiteVisitContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Users, Navigation, ArrowRight, BarChart3, Trash2, DollarSign } from "lucide-react";
import { useUser } from "@/context/user/UserContext";
import { Badge } from "@/components/ui/badge";
import { calculateDistance } from "@/utils/collectorUtils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogDescription, 
  AlertDialogTrigger 
} from "@/components/ui/alert-dialog";
import { SiteVisitCostDialog } from "@/components/wallet/SiteVisitCostDialog";
import { useAuthorization } from "@/hooks/use-authorization";

const SiteVisitDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [siteVisit, setSiteVisit] = useState<SiteVisit | null>(null);
  const { siteVisits, deleteSiteVisit } = useSiteVisitContext();
  const { users } = useUser();
  const [showMap, setShowMap] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [costDialogOpen, setCostDialogOpen] = useState(false);
  const { hasAnyRole } = useAuthorization();
  
  useEffect(() => {
    const fetchSiteVisit = () => {
      if (id && siteVisits.length > 0) {
        const foundSiteVisit = siteVisits.find(visit => visit.id === id);
        if (foundSiteVisit) {
          setSiteVisit(foundSiteVisit);
          setLoading(false);
          return;
        }
      }
      
      // Fallback to mock data if not found
      const timer = setTimeout(() => {
        setSiteVisit({
          id: id || '',
          siteName: "Sample Site",
          siteCode: "SC-001",
          status: "pending",
          locality: "Al-Fashir",
          state: "North Darfur",
          activity: "Food Distribution",
          priority: "medium",
          dueDate: new Date().toISOString(),
          assignedTo: "",
          fees: {
            total: 500,
            currency: "SDG",
            distanceFee: 100,
            complexityFee: 50,
            urgencyFee: 0
          },
          scheduledDate: new Date().toISOString(),
          description: "Sample description",
          permitDetails: {
            federal: true,
            state: true,
            locality: false,
            verifiedBy: "Authorization Team"
          },
          location: {
            address: "123 Distribution Center, North Darfur",
            latitude: 13.6295,
            longitude: 25.3517,
            region: "North Darfur"
          },
          coordinates: {
            latitude: 13.6295,
            longitude: 25.3517
          },
          mmpDetails: {
            mmpId: "MMP-2025-001",
            projectName: "Emergency Response 2025",
            uploadedBy: "System Admin",
            uploadedAt: new Date().toISOString(),
            region: "North Darfur",
            approvedBy: "Regional Manager",
            approvedAt: new Date().toISOString()
          },
          complexity: "medium",
          visitType: "regular",
          mainActivity: "Food Distribution",
          projectActivities: ["Food Distribution", "Health Assessment"],
          hub: "Al-Fashir Hub",
          team: {
            coordinator: "Jane Smith",
            supervisor: "Mike Johnson",
            fieldOfficer: "Ahmed Hassan"
          },
          resources: ["Vehicle", "GPS Device", "Camera"],
          risks: "Medium security risk in the area",
          estimatedDuration: "4 hours",
          visitHistory: [
            {
              date: new Date().toISOString(),
              status: "created",
              by: "Previous Team"
            }
          ]
        });
        setLoading(false);
      }, 500);
      
      return () => clearTimeout(timer);
    };
    
    fetchSiteVisit();
  }, [id, siteVisits]);

  const handleAssignSuccess = () => {
    // Refresh site visit data after assignment
    if (id) {
      const updatedSiteVisit = siteVisits.find(visit => visit.id === id);
      if (updatedSiteVisit) {
        setSiteVisit(updatedSiteVisit);
      }
    }
  };

  const handleConfirmDelete = async () => {
    if (!siteVisit) return;
    try {
      setIsDeleting(true);
      const ok = await deleteSiteVisit(siteVisit.id);
      if (ok) {
        navigate('/site-visits');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // Get all data collectors
  const getNearbyCollectors = () => {
    if (!siteVisit) return [];
    
    return users.filter(user => {
      // Check if user is a data collector
      return user.role === 'dataCollector' || user.role === 'datacollector';
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-[spin_3s_linear_infinite]"></div>
            <div className="absolute inset-[6px] rounded-full border-4 border-t-primary animate-[spin_2s_linear_infinite]"></div>
          </div>
          <p className="text-muted-foreground animate-pulse">Loading site visit details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-8">
      <div className="bg-gradient-to-r from-background to-muted p-6 rounded-lg shadow-sm">
        <SiteVisitHeader />
      </div>

      {siteVisit && (
        <div className="space-y-6">
          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 justify-end">
            {hasAnyRole(['admin', 'ict']) && (
              <Button 
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setCostDialogOpen(true)}
                data-testid="button-assign-cost"
              >
                <DollarSign className="h-4 w-4" />
                Assign Cost
              </Button>
            )}

            {siteVisit.status === "pending" || siteVisit.status === "permitVerified" ? (
              <AssignCollectorButton 
                siteVisit={siteVisit} 
                onSuccess={handleAssignSuccess} 
              />
            ) : null}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  size="sm"
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this site visit?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. The site visit and its related data will be permanently removed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleConfirmDelete} disabled={isDeleting}>
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* Cost Assignment Dialog */}
          {id && (
            <SiteVisitCostDialog
              open={costDialogOpen}
              onOpenChange={setCostDialogOpen}
              siteVisitId={id}
              siteName={siteVisit.siteName}
            />
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              <div className="bg-card rounded-lg p-6 shadow-sm border">
                <SiteVisitInfo siteVisit={siteVisit} />
              </div>
              <div className="bg-card rounded-lg p-6 shadow-sm border">
                <SiteVisitDates siteVisit={siteVisit} />
              </div>
            </div>
            
            <div className="space-y-6">
              <Card className="border-none shadow-md bg-gradient-to-br from-card to-muted">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      Location Map
                    </CardTitle>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="h-8 px-2 text-xs hover:bg-background/50"
                      onClick={() => setShowMap(!showMap)}
                    >
                      {showMap ? 'Hide' : 'Show'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {showMap ? (
                    <div className="h-[250px] bg-muted/30 flex items-center justify-center rounded-b-lg backdrop-blur-sm">
                      <p className="text-muted-foreground">Map view is temporarily unavailable</p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center p-4 h-[100px] text-center text-muted-foreground">
                      Map view is hidden
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card className="border-none shadow-md bg-gradient-to-br from-card to-muted">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    Nearby Collectors
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[200px] pr-4">
                    <div className="space-y-3">
                      {getNearbyCollectors().map(collector => (
                        <div key={collector.id} 
                          className="flex justify-between items-center p-3 rounded-lg bg-background/50 backdrop-blur-sm border border-border/50 hover:bg-background/80 transition-colors"
                        >
                          <div>
                            <div className="font-medium text-sm">{collector.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {collector.availability === 'online' ? (
                                <span className="flex items-center">
                                  <span className="h-2 w-2 bg-green-500 rounded-full mr-1"></span>
                                  Available
                                </span>
                              ) : (
                                <span className="flex items-center">
                                  <span className="h-2 w-2 bg-amber-500 rounded-full mr-1"></span>
                                  Busy
                                </span>
                              )}
                            </div>
                          </div>
                          <Button 
                            variant="secondary" 
                            size="sm"
                            className="text-xs"
                            onClick={() => navigate(`/users/${collector.id}`)}
                          >
                            View Profile
                          </Button>
                        </div>
                      ))}
                      
                      {getNearbyCollectors().length === 0 && (
                        <div className="text-center text-sm text-muted-foreground py-6">
                          <Users className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
                          No available collectors nearby
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
              
              <Card className="border-none shadow-md bg-gradient-to-br from-card to-muted">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Related Documents
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Button
                      variant="secondary" 
                      className="w-full justify-start text-sm hover:bg-background/50"
                      onClick={() => navigate(`/mmp/${siteVisit.mmpDetails.mmpId}`)}
                    >
                      <ArrowRight className="h-4 w-4 mr-2" />
                      View MMP Details
                    </Button>
                    
                    <Button
                      variant="secondary" 
                      className="w-full justify-start text-sm hover:bg-background/50"
                      onClick={() => {}}
                    >
                      <ArrowRight className="h-4 w-4 mr-2" />
                      Financial Reports
                    </Button>
                    
                    <Button
                      variant="secondary" 
                      className="w-full justify-start text-sm hover:bg-background/50"
                      onClick={() => navigate(`/reports?siteVisit=${siteVisit.id}`)}
                    >
                      <ArrowRight className="h-4 w-4 mr-2" />
                      Generate Reports
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SiteVisitDetail;
