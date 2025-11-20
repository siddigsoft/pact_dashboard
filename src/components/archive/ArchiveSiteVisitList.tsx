
import React from 'react';
import { useArchive } from '@/context/archive/ArchiveContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { Map, MoreHorizontal, Eye, Download, FileText, MapPin } from 'lucide-react';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { useNavigate } from 'react-router-dom';
import { SiteVisit } from '@/types';

const ArchiveSiteVisitList = () => {
  const { archivedSiteVisits, loading, currentArchive } = useArchive();
  const navigate = useNavigate();
  
  const viewSiteVisitDetail = (visitId: string) => {
    navigate(`/site-visits/${visitId}`);
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'cancelled':
      case 'canceled':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'inProgress':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'assigned':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'permitVerified':
        return 'bg-teal-100 text-teal-800 border-teal-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusLabel = (status: SiteVisit['status']) => {
    switch (status) {
      case 'inProgress':
        return 'In Progress';
      case 'permitVerified':
        return 'Permit Verified';
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };
  
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/3" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
  
  const filteredVisits = currentArchive 
    ? archivedSiteVisits.filter(visit => {
        const visitDate = new Date(visit.archiveDate);
        return visitDate.getFullYear() === currentArchive.year && 
               (visitDate.getMonth() + 1) === currentArchive.month;
      })
    : archivedSiteVisits;
  
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Map className="h-5 w-5 text-primary" />
          Archived Site Visits
        </CardTitle>
        <Button variant="outline" size="sm">
          <FileText className="h-4 w-4 mr-2" /> Export List
        </Button>
      </CardHeader>
      <CardContent>
        {filteredVisits.length > 0 ? (
          <div className="space-y-4">
            {filteredVisits.map((visit) => (
              <div 
                key={visit.id} 
                className="border rounded-lg p-4 transition-all hover:shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex items-center justify-between md:justify-start md:gap-3">
                    <h3 className="font-medium text-base truncate">
                      {visit.siteName}
                      <span className="text-xs text-muted-foreground ml-2">({visit.siteCode})</span>
                    </h3>
                    <Badge className={`ml-2 ${getStatusColor(visit.status)}`}>
                      {getStatusLabel(visit.status)}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 mr-1" />
                    {visit.state}, {visit.locality}
                  </div>
                  
                  <div className="flex flex-col sm:flex-row sm:items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Visit Date:</span>
                      <span>{format(new Date(visit.scheduledDate), 'MMM d, yyyy')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Activity:</span>
                      <span className="truncate max-w-[150px]">{visit.mainActivity}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Assigned To:</span>
                      <span>{visit.assignedTo}</span>
                    </div>
                  </div>
                  
                  {visit.documents.length > 0 && (
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" />
                      {visit.documents.length} document{visit.documents.length > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-2 self-end md:self-center">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => viewSiteVisitDetail(visit.id)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View
                  </Button>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Map className="h-4 w-4 mr-2" />
                        View Location
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-muted-foreground">
            {currentArchive 
              ? `No site visits found for ${currentArchive.label}`
              : 'No archived site visits found'}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ArchiveSiteVisitList;
