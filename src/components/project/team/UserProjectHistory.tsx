
import React from 'react';
import { Briefcase } from 'lucide-react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Badge } from '@/components/ui/badge';
import { useProjectContext } from '@/context/project/ProjectContext';

interface UserProjectHistoryProps {
  userId: string;
}

const UserProjectHistory: React.FC<UserProjectHistoryProps> = ({ userId }) => {
  const { projects } = useProjectContext();
  
  const userProjects = projects.filter(project => 
    project.team?.members?.includes(userId) ||
    project.team?.teamComposition?.some(member => member.userId === userId)
  );

  if (userProjects.length === 0) return null;

  return (
    <HoverCard>
      <HoverCardTrigger>
        <Badge 
          variant={userProjects.length > 2 ? "warning" : "secondary"}
          className="cursor-help"
        >
          <Briefcase className="h-3 w-3 mr-1" />
          {userProjects.length} Project{userProjects.length !== 1 ? 's' : ''}
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Project History</h4>
          <div className="space-y-1">
            {userProjects.map((project) => (
              <div key={project.id} className="text-sm">
                <span className="font-medium">{project.name}</span>
                <span className="text-muted-foreground"> - {project.status}</span>
              </div>
            ))}
          </div>
          {userProjects.length > 2 && (
            <p className="text-sm text-amber-600 mt-2">
              ⚠️ User is assigned to multiple projects
            </p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

export default UserProjectHistory;
