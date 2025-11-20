
import React from 'react';
import { 
  Card, 
  CardHeader, 
  CardContent, 
  CardTitle 
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, Navigation2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { SiteVisit } from '@/types';

interface UpcomingSiteVisitsCardProps {
  siteVisits: SiteVisit[];
}

const UpcomingSiteVisitsCard = ({ siteVisits }: UpcomingSiteVisitsCardProps) => {
  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <Card className="border-t-4 border-t-purple-500 overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-purple-50 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-purple-500" />
            <CardTitle>Upcoming Site Visits</CardTitle>
          </div>
          {siteVisits.length > 0 && (
            <Badge variant="outline" className="bg-white">
              {siteVisits.length} visits
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {siteVisits.length > 0 ? (
          <div className="space-y-3">
            {siteVisits.map((visit) => (
              <div
                key={visit.id}
                className="p-3 rounded-lg border bg-white hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm truncate">{visit.siteName}</h4>
                    <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                      <MapPin className="h-4 w-4" />
                      <span className="truncate">
                        {visit.locality}, {visit.state}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className={getPriorityColor(visit.priority)}>
                        {visit.priority} priority
                      </Badge>
                      <Badge variant="outline" className="bg-purple-50">
                        {format(new Date(visit.dueDate), 'MMM dd')}
                      </Badge>
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline" className="shrink-0">
                    <Link to={`/site-visits/${visit.id}`}>
                      <Navigation2 className="h-4 w-4 mr-1" />
                      View
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-gray-500">
            <Calendar className="h-12 w-12 mx-auto mb-3 text-gray-400" />
            <p>No upcoming site visits</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default UpcomingSiteVisitsCard;
