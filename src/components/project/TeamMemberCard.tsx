
import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from 'date-fns';
import { ProjectTeamMember } from '@/types/project';
import UserCalendarAvailability from './team/UserCalendarAvailability';
import UserProjectHistory from './team/UserProjectHistory';

interface TeamMemberCardProps {
  member: ProjectTeamMember;
  calculatedWorkload?: number;
}

const AVATAR_COLORS = [
  'bg-indigo-500', 'bg-violet-500', 'bg-cyan-600', 'bg-emerald-600',
  'bg-rose-500', 'bg-amber-500', 'bg-teal-600', 'bg-sky-600',
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const TeamMemberCard: React.FC<TeamMemberCardProps> = ({ member, calculatedWorkload }) => {
  const workload = calculatedWorkload ?? member.workload ?? 0;

  const wlColor = workload > 80 ? 'bg-red-500' : workload > 60 ? 'bg-amber-500' : 'bg-green-500';
  const wlLabel = workload > 80 ? 'Overloaded' : workload > 60 ? 'High' : workload > 0 ? 'Normal' : 'Available';
  const wlTextColor = workload > 80 ? 'text-red-600 dark:text-red-400' : workload > 60 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400';

  let joinedText = '';
  try {
    if (member.joinedAt) joinedText = format(parseISO(member.joinedAt), 'd MMM yyyy');
  } catch { /* ignore */ }

  return (
    <Card className="overflow-hidden hover:shadow-md transition-all duration-200 border-border/70">
      {/* Coloured top strip */}
      <div className={`h-1 w-full ${avatarColor(member.name)}`} />
      <CardContent className="p-4">
        {/* Avatar + name row */}
        <div className="flex items-start gap-3 mb-3">
          <div className={`h-11 w-11 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${avatarColor(member.name)}`}>
            {initials(member.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate leading-tight">{member.name}</p>
            <Badge variant="outline" className="mt-1 text-[10px] px-1.5 py-0 h-auto">
              {member.role}
            </Badge>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
          {member.allocation != null && (
            <div className="rounded-md bg-muted/40 px-2 py-1.5">
              <p className="text-muted-foreground leading-none mb-0.5">Allocation</p>
              <p className="font-semibold">{member.allocation}%</p>
            </div>
          )}
          {joinedText && (
            <div className="rounded-md bg-muted/40 px-2 py-1.5">
              <p className="text-muted-foreground leading-none mb-0.5">Joined</p>
              <p className="font-semibold">{joinedText}</p>
            </div>
          )}
        </div>

        {/* Workload bar */}
        <div className="space-y-1 mb-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Workload</span>
            <span className={`font-semibold ${wlTextColor}`}>{wlLabel} · {workload}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className={`h-full ${wlColor} transition-all`} style={{ width: `${workload}%` }} />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-1.5">
          <UserProjectHistory userId={member.userId} />
          <UserCalendarAvailability userId={member.userId} busy={workload > 80} />
        </div>
      </CardContent>
    </Card>
  );
};

export default TeamMemberCard;
