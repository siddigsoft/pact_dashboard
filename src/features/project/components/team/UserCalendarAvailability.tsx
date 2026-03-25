
import React from 'react';
import { Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { ProjectTeamMember } from '@/types/project';

interface UserCalendarAvailabilityProps {
  userId: string;
  busy?: boolean;
}

const UserCalendarAvailability: React.FC<UserCalendarAvailabilityProps> = ({
  userId,
  busy = false,
}) => {
  // This would ideally come from a calendar service
  // For now we'll simulate some busy days
  const busyDays = [
    new Date().toLocaleDateString(),
    new Date(Date.now() + 86400000).toLocaleDateString(), // Tomorrow
    new Date(Date.now() + 86400000 * 3).toLocaleDateString(), // 3 days from now
  ];

  return (
    <HoverCard>
      <HoverCardTrigger>
        <Badge 
          variant={busy ? "destructive" : "secondary"}
          className="cursor-help"
        >
          <Calendar className="h-3 w-3 mr-1" />
          {busy ? 'Calendar Busy' : 'Available'}
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Calendar Availability</h4>
          {busy ? (
            <p className="text-sm text-muted-foreground">
              This user has conflicting assignments on:
              <ul className="mt-2 space-y-1">
                {busyDays.map((day) => (
                  <li key={day} className="text-destructive">• {day}</li>
                ))}
              </ul>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              User is available for new assignments
            </p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

export default UserCalendarAvailability;
