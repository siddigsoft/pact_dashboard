import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { SiteVisit } from "@/types";
import AssignCollectorButton from "@/components/site-visit/AssignCollectorButton";
import { useSiteVisitContext } from "@/context/siteVisit/SiteVisitContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  MapPin, 
  Users, 
  ArrowLeft, 
  Trash2, 
  DollarSign, 
  RefreshCw,
  Calendar,
  Clock,
  Building2,
  CheckCircle2,
  AlertCircle,
  Navigation,
  FileText,
  Shield,
  ChevronRight,
  User,
  Tag,
  Activity
} from "lucide-react";
import { useUser } from "@/context/user/UserContext";
import { Badge } from "@/components/ui/badge";
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
import { getStateName, getLocalityName } from "@/data/sudanStates";
import { isOverdue, getStatusLabel } from "@/utils/siteVisitUtils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

const SiteVisitDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [siteVisit, setSiteVisit] = useState<SiteVisit | null>(null);
  const { siteVisits, deleteSiteVisit } = useSiteVisitContext();
  const { users } = useUser();
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
      setLoading(false);
      setSiteVisit(null);
    };
    
    fetchSiteVisit();
  }, [id, siteVisits]);

  const handleAssignSuccess = () => {
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

  const resolveUserName = (userId?: string) => {
    if (!userId) return null;
    const user = users.find(u => u.id === userId);
    return user?.name || (user as any)?.fullName || (user as any)?.username;
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getStatusConfig = (status: string, dueDate?: string) => {
    const overdue = isOverdue(dueDate, status);
    if (overdue) {
      return { 
        color: 'bg-red-500', 
        textColor: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-500/10',
        icon: AlertCircle,
        label: 'Overdue'
      };
    }
    
    switch(status?.toLowerCase()) {
      case 'completed': 
        return { 
          color: 'bg-emerald-500', 
          textColor: 'text-emerald-600 dark:text-emerald-400',
          bgColor: 'bg-emerald-500/10',
          icon: CheckCircle2,
          label: 'Completed'
        };
      case 'inprogress': 
        return { 
          color: 'bg-blue-500', 
          textColor: 'text-blue-600 dark:text-blue-400',
          bgColor: 'bg-blue-500/10',
          icon: Activity,
          label: 'In Progress'
        };
      case 'assigned': 
        return { 
          color: 'bg-purple-500', 
          textColor: 'text-purple-600 dark:text-purple-400',
          bgColor: 'bg-purple-500/10',
          icon: User,
          label: 'Assigned'
        };
      case 'permitverified': 
        return { 
          color: 'bg-cyan-500', 
          textColor: 'text-cyan-600 dark:text-cyan-400',
          bgColor: 'bg-cyan-500/10',
          icon: Shield,
          label: 'Permit Verified'
        };
      case 'cancelled': 
        return { 
          color: 'bg-gray-500', 
          textColor: 'text-gray-600 dark:text-gray-400',
          bgColor: 'bg-gray-500/10',
          icon: AlertCircle,
          label: 'Cancelled'
        };
      default: 
        return { 
          color: 'bg-amber-500', 
          textColor: 'text-amber-600 dark:text-amber-400',
          bgColor: 'bg-amber-500/10',
          icon: Clock,
          label: 'Pending'
        };
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Not set';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return 'Invalid date';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="text-center space-y-4">
          <div className="relative w-12 h-12 mx-auto">
            <div className="absolute inset-0 rounded-full border-4 border-muted-foreground/20"></div>
            <div className="absolute inset-0 rounded-full border-4 border-t-primary animate-spin"></div>
          </div>
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!siteVisit) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="text-center space-y-4 max-w-sm mx-auto px-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
            <MapPin className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-bold">Site Visit Not Found</h2>
          <p className="text-muted-foreground text-sm">
            The site visit you're looking for doesn't exist or has been removed.
          </p>
          <Button onClick={() => navigate('/site-visits')} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Site Visits
          </Button>
        </div>
      </div>
    );
  }

  const statusConfig = getStatusConfig(siteVisit.status, siteVisit.dueDate);
  const StatusIcon = statusConfig.icon;
  const stateName = siteVisit.state ? getStateName(siteVisit.state) : null;
  const localityName = siteVisit.state && siteVisit.locality ? getLocalityName(siteVisit.state, siteVisit.locality) : null;
  const assignedToName = resolveUserName(siteVisit.assignedTo);

  return (
    <div className="min-h-screen pb-24 lg:pb-8">
      {/* Top Navigation Bar */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => navigate('/site-visits')}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="font-semibold text-sm">Site Visit Details</span>
          <div className="w-9" />
        </div>
      </div>

      <div className="px-4 py-6 space-y-6 max-w-5xl mx-auto">
        {/* Hero Card - Site Summary */}
        <Card className="overflow-hidden" data-testid="card-hero">
          <div className={`h-2 ${statusConfig.color}`} />
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary" className={`${statusConfig.bgColor} ${statusConfig.textColor} border-0`}>
                    <StatusIcon className="h-3 w-3 mr-1" />
                    {statusConfig.label}
                  </Badge>
                  {siteVisit.priority && (
                    <Badge variant="outline" className="capitalize text-xs">
                      {siteVisit.priority}
                    </Badge>
                  )}
                </div>
                <h1 className="text-2xl font-bold tracking-tight mb-1" data-testid="text-site-name">
                  {siteVisit.siteName}
                </h1>
                <p className="text-muted-foreground text-sm flex items-center gap-1">
                  <Tag className="h-3 w-3" />
                  {siteVisit.siteCode}
                </p>
              </div>
            </div>

            {/* Location Pills */}
            <div className="flex flex-wrap gap-2 mt-4">
              {siteVisit.hub && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-full text-sm">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{siteVisit.hub}</span>
                </div>
              )}
              {stateName && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-full text-sm">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{stateName}</span>
                </div>
              )}
              {localityName && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-full text-sm">
                  <Navigation className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{localityName}</span>
                </div>
              )}
            </div>

            {/* Assigned Person */}
            {assignedToName && (
              <div className="flex items-center gap-3 mt-5 p-3 bg-muted/50 rounded-lg">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary/10 text-primary font-medium">
                    {getInitials(assignedToName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Assigned to</p>
                  <p className="font-medium truncate">{assignedToName}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Info Grid */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="hover-elevate" data-testid="card-visit-date">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Visit Date</p>
                  <p className="font-semibold text-sm truncate">{formatDate(siteVisit.visitDate)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate" data-testid="card-due-date">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Due Date</p>
                  <p className="font-semibold text-sm truncate">{formatDate(siteVisit.dueDate)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate" data-testid="card-visit-type">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Visit Type</p>
                  <p className="font-semibold text-sm truncate">{siteVisit.visitTypeRaw || siteVisit.visitType || 'N/A'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate" data-testid="card-activity">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Activity</p>
                  <p className="font-semibold text-sm truncate">{siteVisit.activity || 'N/A'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* CP & Description */}
        {(siteVisit.cpName || siteVisit.description) && (
          <Card data-testid="card-details">
            <CardContent className="p-5 space-y-4">
              {siteVisit.cpName && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">CP Name</p>
                  <p className="font-medium">{siteVisit.cpName}</p>
                </div>
              )}
              {siteVisit.description && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Description</p>
                  <p className="text-sm text-muted-foreground">{siteVisit.description}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* GPS Coordinates */}
        {siteVisit.coordinates && (
          <Card className="hover-elevate" data-testid="card-coordinates">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center">
                    <Navigation className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">GPS Coordinates</p>
                    <p className="font-mono text-sm">
                      {siteVisit.coordinates.latitude.toFixed(6)}, {siteVisit.coordinates.longitude.toFixed(6)}
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a 
                    href={`https://www.google.com/maps?q=${siteVisit.coordinates.latitude},${siteVisit.coordinates.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="button-open-map"
                  >
                    Open Map
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Permit Status */}
        {siteVisit.permitDetails && (
          <Card data-testid="card-permit">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Permit Status</h3>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {['federal', 'state', 'locality'].map((permit) => {
                  const isVerified = siteVisit.permitDetails?.[permit as keyof typeof siteVisit.permitDetails];
                  return (
                    <div 
                      key={permit}
                      className={`flex flex-col items-center p-3 rounded-lg border-2 transition-colors ${
                        isVerified 
                          ? 'border-emerald-500 bg-emerald-500/5' 
                          : 'border-muted bg-muted/30'
                      }`}
                    >
                      <CheckCircle2 className={`h-6 w-6 mb-1 ${isVerified ? 'text-emerald-500' : 'text-muted-foreground/30'}`} />
                      <span className="text-xs font-medium capitalize">{permit}</span>
                    </div>
                  );
                })}
              </div>
              {siteVisit.permitDetails.verifiedBy && (
                <p className="text-xs text-muted-foreground mt-3">
                  Verified by: <span className="font-medium">{siteVisit.permitDetails.verifiedBy}</span>
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Separator />

        {/* Desktop: Two Column Layout for Costs & Audit */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                  description: "Use the Assign button to complete the assignment process.",
                });
              }}
            />
          )}
        </div>

        <SiteVisitAuditTrail 
          siteVisitId={siteVisit.id}
          siteCode={siteVisit.siteCode}
        />
      </div>

      {/* Mobile Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t p-4 lg:hidden z-50">
        <div className="flex items-center gap-2 max-w-lg mx-auto">
          {hasAnyRole(['admin', 'ict']) && (
            <Button 
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setCostDialogOpen(true)}
              data-testid="button-assign-cost-mobile"
            >
              <DollarSign className="h-4 w-4 mr-1" />
              Cost
            </Button>
          )}

          {hasAnyRole(['admin', 'ict']) && siteVisit.status === "completed" && (
            <Button 
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleReconcileFee}
              disabled={isReconciling}
              data-testid="button-reconcile-mobile"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isReconciling ? 'animate-spin' : ''}`} />
              Reconcile
            </Button>
          )}

          {hasAnyRole(['admin', 'ict']) && (siteVisit.status === "pending" || siteVisit.status === "permitVerified") && (
            <div className="flex-1">
              <AssignCollectorButton 
                siteVisit={siteVisit} 
                onSuccess={handleAssignSuccess} 
              />
            </div>
          )}

          {hasAnyRole(['admin', 'ict']) && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  size="icon"
                  data-testid="button-delete-mobile"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this site visit?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone.
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
      </div>

      {/* Desktop Action Buttons - Hidden on Mobile */}
      <div className="hidden lg:block fixed bottom-6 right-6 z-50">
        <div className="flex items-center gap-2 bg-background/95 backdrop-blur border rounded-lg p-2 shadow-lg">
          {hasAnyRole(['admin', 'ict']) && (
            <Button 
              variant="outline"
              size="sm"
              onClick={() => setCostDialogOpen(true)}
              data-testid="button-assign-cost"
            >
              <DollarSign className="h-4 w-4 mr-1" />
              Assign Cost
            </Button>
          )}

          {hasAnyRole(['admin', 'ict']) && siteVisit.status === "completed" && (
            <Button 
              variant="outline"
              size="sm"
              onClick={handleReconcileFee}
              disabled={isReconciling}
              data-testid="button-reconcile-fee"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isReconciling ? 'animate-spin' : ''}`} />
              {isReconciling ? 'Processing...' : 'Reconcile Fee'}
            </Button>
          )}

          {hasAnyRole(['admin', 'ict']) && (siteVisit.status === "pending" || siteVisit.status === "permitVerified") && (
            <AssignCollectorButton 
              siteVisit={siteVisit} 
              onSuccess={handleAssignSuccess} 
            />
          )}

          {hasAnyRole(['admin', 'ict']) && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  size="sm"
                  data-testid="button-delete"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
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
    </div>
  );
};

export default SiteVisitDetail;
