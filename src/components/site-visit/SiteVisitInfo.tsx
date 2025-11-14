
import { Building, MapPin, Tag, Shield, Calendar, Users, FileText, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { SiteVisit } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getStateName, getLocalityName } from "@/data/sudanStates";
import { useUser } from "@/context/user/UserContext";
import { isOverdue, getStatusLabel, getStatusColor } from "@/utils/siteVisitUtils";

interface SiteVisitInfoProps {
  siteVisit: SiteVisit;
}

export const SiteVisitInfo = ({ siteVisit }: SiteVisitInfoProps) => {
  const { users } = useUser();
  const stateName = siteVisit.state ? getStateName(siteVisit.state) : 'Not specified';
  const localityName = siteVisit.state && siteVisit.locality ? getLocalityName(siteVisit.state, siteVisit.locality) : 'Not specified';

  const resolveUserName = (id?: string) => {
    if (!id) return undefined;
    const u = (users || []).find(u => u.id === id);
    return u?.name || (u as any)?.fullName || (u as any)?.username;
  };

  // Helper function to determine badge variant based on status and overdue state
  const getStatusVariant = (status: string, dueDate?: string) => {
    // Check if overdue first
    if (isOverdue(dueDate, status)) {
      return { variant: "outline", className: "bg-red-50 text-red-700 border-red-300" };
    }
    
    switch(status?.toLowerCase()) {
      case 'pending': return { variant: "outline", className: "bg-yellow-50 text-yellow-700 border-yellow-300" };
      case 'completed': return { variant: "outline", className: "bg-green-50 text-green-700 border-green-300" };
      case 'cancelled': return { variant: "outline", className: "bg-red-50 text-red-700 border-red-300" };
      case 'permitVerified': return { variant: "outline", className: "bg-blue-50 text-blue-700 border-blue-300" };
      case 'assigned': return { variant: "outline", className: "bg-purple-50 text-purple-700 border-purple-300" };
      case 'inProgress': return { variant: "outline", className: "bg-indigo-50 text-indigo-700 border-indigo-300" };
      default: return { variant: "outline", className: "bg-gray-50 text-gray-700 border-gray-300" };
    }
  };

  const statusBadge = getStatusVariant(siteVisit.status, siteVisit.dueDate);

  return (
    <div className="space-y-6">
      {/* Main Info Card */}
      <Card>
        <CardHeader className="bg-muted/30">
          <CardTitle className="text-xl flex items-center gap-2">
            <Building className="h-5 w-5 text-primary" />
            Essential Information
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Site Details */}
            <div className="space-y-4">
              <h3 className="font-medium text-lg flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Site Info
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Name:</span>
                  <span className="font-semibold">{siteVisit.siteName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Code:</span>
                  <span className="font-semibold">{siteVisit.siteCode}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Hub:</span>
                  <span className="font-semibold">{siteVisit.hub || 'Not specified'}</span>
                </div>
                {siteVisit.cpName && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">CP Name:</span>
                    <span className="font-semibold">{siteVisit.cpName}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Visit Type:</span>
                  <span className="font-semibold">{siteVisit.visitTypeRaw || siteVisit.visitType || 'Not specified'}</span>
                </div>
              </div>
            </div>

            {/* Status Section */}
            <div className="space-y-4">
              <h3 className="font-medium text-lg flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Status
              </h3>
              <div className="space-y-3">
                <Badge className={statusBadge.className} variant={statusBadge.variant as any}>
                  {getStatusLabel(siteVisit.status, siteVisit.dueDate)}
                </Badge>
                
                <div className="text-sm space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Priority:</span>
                    <Badge variant="outline" className="capitalize">
                      {siteVisit.priority || 'Not set'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Activity:</span>
                    <span className="font-semibold">{siteVisit.activity || 'Not specified'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Assignment Info */}
            <div className="space-y-4">
              <h3 className="font-medium text-lg flex items-center gap-2">
                <Users className="h-4 w-4" />
                Assignment
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Assigned to:</span>
                  <span className="font-semibold">{resolveUserName(siteVisit.assignedTo) || 'Not assigned'}</span>
                </div>
                {siteVisit.assignedBy && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Assigned by:</span>
                    <span className="font-semibold">{resolveUserName(siteVisit.assignedBy) || 'Unknown'}</span>
                  </div>
                )}
                {siteVisit.scheduledDate && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Scheduled for:</span>
                    <span className="font-semibold">
                      {new Date(siteVisit.scheduledDate).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Location & Details Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Location Card */}
        <Card>
          <CardHeader className="bg-muted/30">
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Location Details
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/50 p-3 rounded-md">
                    <p className="text-xs text-muted-foreground">State</p>
                    <p className="font-medium">{stateName}</p>
                  </div>
                  <div className="bg-muted/50 p-3 rounded-md">
                    <p className="text-xs text-muted-foreground">Locality</p>
                    <p className="font-medium">{localityName}</p>
                  </div>
                </div>
              </div>

              {siteVisit.location?.address && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Address</h4>
                  <p className="text-sm">{siteVisit.location.address}</p>
                </div>
              )}

              {siteVisit.coordinates && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">GPS Coordinates</h4>
                  <p className="text-sm flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                    {siteVisit.coordinates.latitude}, {siteVisit.coordinates.longitude}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Permit Details Card (conditionally rendered) */}
        {siteVisit.permitDetails ? (
          <Card>
            <CardHeader className="bg-muted/30">
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Permit Status
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="flex flex-col items-center p-3 border rounded-md">
                  <Shield className={`h-5 w-5 ${siteVisit.permitDetails.federal ? "text-green-500" : "text-muted-foreground"}`} />
                  <p className="text-sm font-medium mt-1">Federal</p>
                  <CheckCircle2 className={`h-3.5 w-3.5 mt-1 ${siteVisit.permitDetails.federal ? "text-green-500" : "text-muted-foreground opacity-30"}`} />
                </div>
                <div className="flex flex-col items-center p-3 border rounded-md">
                  <Shield className={`h-5 w-5 ${siteVisit.permitDetails.state ? "text-green-500" : "text-muted-foreground"}`} />
                  <p className="text-sm font-medium mt-1">State</p>
                  <CheckCircle2 className={`h-3.5 w-3.5 mt-1 ${siteVisit.permitDetails.state ? "text-green-500" : "text-muted-foreground opacity-30"}`} />
                </div>
                <div className="flex flex-col items-center p-3 border rounded-md">
                  <Shield className={`h-5 w-5 ${siteVisit.permitDetails.locality ? "text-green-500" : "text-muted-foreground"}`} />
                  <p className="text-sm font-medium mt-1">Local</p>
                  <CheckCircle2 className={`h-3.5 w-3.5 mt-1 ${siteVisit.permitDetails.locality ? "text-green-500" : "text-muted-foreground opacity-30"}`} />
                </div>
              </div>
              
              {siteVisit.permitDetails.verifiedBy && (
                <div className="mt-3 text-sm">
                  <span className="text-muted-foreground">Verified by:</span>
                  <span className="font-medium ml-2">{siteVisit.permitDetails.verifiedBy}</span>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="bg-muted/30">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Description
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-sm">
                {siteVisit.description || 'No description provided'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Description Card (conditionally rendered if not already shown) */}
      {siteVisit.permitDetails && (
        <Card>
          <CardHeader className="bg-muted/30">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Description
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <p className="text-sm">
              {siteVisit.description || 'No description provided'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
