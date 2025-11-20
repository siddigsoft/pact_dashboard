
import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Activity } from 'lucide-react';
import { ProjectTeamMember } from '@/types/project';
import UserCalendarAvailability from './team/UserCalendarAvailability';
import UserProjectHistory from './team/UserProjectHistory';

interface TeamMemberCardProps {
  member: ProjectTeamMember;
}

const TeamMemberCard: React.FC<TeamMemberCardProps> = ({ member }) => {
  const getWorkloadColor = (workload?: number) => {
    if (!workload) return 'bg-gray-200';
    if (workload > 80) return 'bg-red-500';
    if (workload > 60) return 'bg-amber-500';
    return 'bg-green-500';
  };

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="pt-6">
        <div className="flex items-center space-x-4 mb-4">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-medium">{member.name}</p>
            <Badge variant="outline" className="mt-1">
              {member.role}
            </Badge>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className={`h-full ${getWorkloadColor(member.workload)} transition-all`}
                style={{ width: `${member.workload || 0}%` }}
              />
            </div>
            <span className="text-sm text-muted-foreground">{member.workload || 0}%</span>
          </div>

          <div className="flex gap-2">
            <UserProjectHistory userId={member.userId} />
            <UserCalendarAvailability userId={member.userId} busy={member.workload ? member.workload > 80 : false} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TeamMemberCard;
