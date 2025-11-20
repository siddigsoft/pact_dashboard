
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SiteVisit } from '@/types';
import { User } from '@/types';

interface SiteVisitsSummaryProps {
  activeSiteVisits: SiteVisit[];
  pendingSiteVisits: SiteVisit[];
  users: User[];
}

const SiteVisitsSummary: React.FC<SiteVisitsSummaryProps> = ({
  activeSiteVisits,
  pendingSiteVisits,
  users
}) => {
  const navigate = useNavigate();
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Active Site Visits</CardTitle>
          <CardDescription>Ongoing and assigned site visits</CardDescription>
        </CardHeader>
        <CardContent>
          {activeSiteVisits.length > 0 ? (
            <div className="space-y-3">
              {activeSiteVisits.slice(0, 5).map((visit) => (
                <div key={visit.id} className="flex justify-between items-center border-b pb-2">
                  <div>
                    <div className="font-medium">{visit.siteName}</div>
                    <div className="text-sm text-muted-foreground">
                      {visit.location.address}
                    </div>
                    <Badge
                      variant={visit.status === 'inProgress' ? 'secondary' : 'outline'}
                      className="mt-1"
                    >
                      {visit.status === 'inProgress' ? 'In Progress' : 'Assigned'}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <div className="text-sm">
                      {users.find((u) => u.id === visit.assignedTo)?.name || 'Unassigned'}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center justify-end">
                      <Clock className="h-3 w-3 mr-1" />
                      Due {format(new Date(visit.dueDate), 'MMM d')}
                    </div>
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 h-auto text-xs"
                      onClick={() => navigate(`/site-visits/${visit.id}`)}
                    >
                      View Details
                    </Button>
                  </div>
                </div>
              ))}
              
              {activeSiteVisits.length > 5 && (
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => navigate('/site-visits?status=inProgress')}
                >
                  View All ({activeSiteVisits.length})
                </Button>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-muted-foreground">No active site visits found</div>
            </div>
          )}
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Pending Assignments</CardTitle>
          <CardDescription>Site visits that need to be assigned</CardDescription>
        </CardHeader>
        <CardContent>
          {pendingSiteVisits.length > 0 ? (
            <div className="space-y-3">
              {pendingSiteVisits.slice(0, 5).map((visit) => (
                <div key={visit.id} className="flex justify-between items-center border-b pb-2">
                  <div>
                    <div className="font-medium">{visit.siteName}</div>
                    <div className="text-sm text-muted-foreground">
                      {visit.location.address}
                    </div>
                    <Badge
                      variant="destructive"
                      className="mt-1"
                    >
                      Needs Assignment
                    </Badge>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground flex items-center justify-end">
                      <Clock className="h-3 w-3 mr-1" />
                      Due {format(new Date(visit.dueDate), 'MMM d')}
                    </div>
                    <Button
                      variant="default"
                      size="sm"
                      className="mt-1"
                      onClick={() => navigate(`/site-visits/${visit.id}`)}
                    >
                      Assign
                    </Button>
                  </div>
                </div>
              ))}
              
              {pendingSiteVisits.length > 5 && (
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => navigate('/site-visits?status=pending')}
                >
                  View All ({pendingSiteVisits.length})
                </Button>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-muted-foreground">No pending assignments</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SiteVisitsSummary;
