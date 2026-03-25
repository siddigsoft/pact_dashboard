
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectActivity } from '@/types/project';
import { Badge } from '@/components/ui/badge';
import { Circle, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { format, isValid, parseISO } from 'date-fns';

interface ActivityTimelineProps {
  activities: ProjectActivity[];
}

const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ activities }) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'inProgress':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'cancelled':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Circle className="h-4 w-4 text-gray-500" />;
    }
  };

  // Helper function to safely format dates
  const formatDate = (dateString: string) => {
    try {
      const date = parseISO(dateString);
      return isValid(date) ? format(date, 'PP') : 'Invalid date';
    } catch {
      return 'Invalid date';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Activity Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {activities.map((activity, index) => (
            <div key={activity.id} className="mb-8 flex gap-4">
              <div className="flex flex-col items-center">
                <div className="rounded-full p-1 bg-muted">
                  {getStatusIcon(activity.status)}
                </div>
                {index < activities.length - 1 && (
                  <div className="w-0.5 h-full bg-muted mt-2" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">{activity.name}</h4>
                  <Badge variant={activity.status === 'completed' ? 'default' : 'outline'}>
                    {activity.status}
                  </Badge>
                </div>
                {activity.description && (
                  <p className="text-sm text-muted-foreground mb-2">{activity.description}</p>
                )}
                <div className="text-sm text-muted-foreground">
                  {formatDate(activity.startDate)} - {formatDate(activity.endDate)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default ActivityTimeline;
