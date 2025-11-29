
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
import { MapPin, Users, Navigation, ArrowRight, BarChart3, Trash2, DollarSign, RefreshCw } from "lucide-react";
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
import { SiteVisitCostsUnified } from "@/components/site-visit/SiteVisitCostsUnified";
import { SiteVisitAuditTrail } from "@/components/site-visit/SiteVisitAuditTrail";
import { NearestEnumeratorsCard } from "@/components/site-visit/NearestEnumeratorsCard";
import { useWallet } from "@/context/wallet/WalletContext";

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
  const [isReconciling, setIsReconciling] = useState(false);
  const { hasAnyRole } = useAuthorization();
  const { reconcileSiteVisitFee } = useWallet();
  
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
      
      // No site visit found
      setLoading(false);
      setSiteVisit(null);
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

  const handleReconcileFee = async () => {
    if (!siteVisit) return;
    try {
      setIsReconciling(true);
      const result = await reconcileSiteVisitFee(siteVisit.id);
      
      toast({
        title: result.success ? "Fee Reconciled" : "Reconciliation Failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reconcile fee",
        variant: "destructive",
      });
    } finally {
      setIsReconciling(false);
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

  if (!siteVisit) {
    return (
      <div className="space-y-6 animate-fade-in pb-8">
        <div className="bg-gradient-to-r from-background to-muted p-6 rounded-lg shadow-sm">
          <SiteVisitHeader />
        </div>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-4">
            <p className="text-lg font-semibold">Site Visit Not Found</p>
            <p className="text-muted-foreground">The site visit you're looking for doesn't exist or has been removed.</p>
            <Button onClick={() => navigate('/site-visits')} variant="outline">
              Back to Site Visits
            </Button>
          </div>
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

            {hasAnyRole(['admin', 'ict']) && siteVisit.status === "completed" && (
              <Button 
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleReconcileFee}
                disabled={isReconciling}
                data-testid="button-reconcile-fee"
              >
                <RefreshCw className={`h-4 w-4 ${isReconciling ? 'animate-spin' : ''}`} />
                {isReconciling ? 'Processing...' : 'Reconcile Fee'}
              </Button>
            )}

            {hasAnyRole(['admin', 'ict']) && (siteVisit.status === "pending" || siteVisit.status === "permitVerified") ? (
              <AssignCollectorButton 
                siteVisit={siteVisit} 
                onSuccess={handleAssignSuccess} 
              />
            ) : null}

            {hasAnyRole(['admin', 'ict']) && (
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
            )}
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <SiteVisitInfo siteVisit={siteVisit} />
              
              <SiteVisitDates siteVisit={siteVisit} />
              
              <SiteVisitAuditTrail 
                siteVisitId={siteVisit.id}
                siteCode={siteVisit.siteCode}
              />
            </div>
            
            <div className="space-y-6">
              <SiteVisitCostsUnified 
                siteVisitId={siteVisit.id}
                siteCode={siteVisit.siteCode}
              />
              
              {hasAnyRole(['admin', 'ict', 'fom']) && siteVisit.coordinates && (
                <NearestEnumeratorsCard
                  siteVisit={siteVisit}
                  allUsers={users}
                  showAssignButton={siteVisit.status === "pending" || siteVisit.status === "permitVerified"}
                  onAssign={(userId) => {
                    toast({
                      title: "Assignment started",
                      description: "Use the Assign button above to complete the assignment process.",
                    });
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SiteVisitDetail;
