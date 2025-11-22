import React, { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, MapPin, MessageSquare, UserCircle, LayoutGrid, Table as TableIcon } from 'lucide-react';
import { TeamCommunication } from '../TeamCommunication';
import TeamLocationMap from '../TeamLocationMap';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@/context/user/UserContext';
import { Badge } from '@/components/ui/badge';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { TeamMemberCard } from '../TeamMemberCard';
import { TeamMemberTable } from '../TeamMemberTable';
import { TeamMemberDetailModal } from '../TeamMemberDetailModal';
import { User } from '@/types/user';

export const TeamZone: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [selectedMember, setSelectedMember] = useState<User | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  
  const navigate = useNavigate();
  const { users } = useUser();
  const { siteVisits } = useSiteVisitContext();

  // Filter and sort team members who can be assigned to site visits (coordinators and data collectors only)
  // Sort: Online first, then by last login (most recent first)
  const assignableTeamMembers = useMemo(() => {
    if (!users) return [];
    
    const filtered = users.filter(user => 
      user.roles?.some(role => {
        const normalizedRole = role.toLowerCase();
        return normalizedRole === 'coordinator' || normalizedRole === 'datacollector';
      })
    );
    
    // Sort by online status first, then by last login
    return filtered.sort((a, b) => {
      const aOnline = a.availability === 'online' || (a.location?.isSharing && a.location?.latitude && a.location?.longitude);
      const bOnline = b.availability === 'online' || (b.location?.isSharing && b.location?.latitude && b.location?.longitude);
      
      // Online users first
      if (aOnline && !bOnline) return -1;
      if (!aOnline && bOnline) return 1;
      
      // Then sort by last login (most recent first)
      const aLastLogin = new Date(a.location?.lastUpdated || a.lastActive || 0).getTime();
      const bLastLogin = new Date(b.location?.lastUpdated || b.lastActive || 0).getTime();
      
      return bLastLogin - aLastLogin;
    });
  }, [users]);

  const activeFieldTeam = assignableTeamMembers.length;

  const onlineMembers = assignableTeamMembers.filter(u => 
    u.availability === 'online' || (u.location?.latitude && u.location?.longitude)
  ).length;

  // Calculate workload for each user
  const userWorkloads = useMemo(() => {
    if (!users || !siteVisits) return new Map();

    const workloadMap = new Map<string, {
      active: number;
      completed: number;
      pending: number;
      overdue: number;
    }>();

    users.forEach(user => {
      const userTasks = siteVisits.filter(visit => visit.assignedTo === user.id || visit.assignedTo === user.name);
      const now = new Date();

      const active = userTasks.filter(t => t.status === 'assigned' || t.status === 'inProgress').length;
      const completed = userTasks.filter(t => t.status === 'completed').length;
      const pending = userTasks.filter(t => t.status === 'pending' || t.status === 'permitVerified').length;
      const overdue = userTasks.filter(t => {
        const dueDate = new Date(t.dueDate);
        return dueDate < now && t.status !== 'completed';
      }).length;

      workloadMap.set(user.id, { active, completed, pending, overdue });
    });

    return workloadMap;
  }, [users, siteVisits]);

  // Get tasks for selected member
  const selectedMemberTasks = useMemo(() => {
    if (!selectedMember || !siteVisits) return [];
    return siteVisits.filter(visit => 
      visit.assignedTo === selectedMember.id || visit.assignedTo === selectedMember.name
    );
  }, [selectedMember, siteVisits]);

  const handleMemberClick = (user: User) => {
    setSelectedMember(user);
    setIsDetailModalOpen(true);
  };

  const handleModalClose = () => {
    setIsDetailModalOpen(false);
    setSelectedMember(null);
  };

  return (
    <div className="space-y-4">
      {/* Modern Tech Header */}
      <div className="relative overflow-hidden rounded-lg border border-border/50 bg-gradient-to-r from-green-500/5 via-blue-500/5 to-background p-4 shadow-sm">
        <div className="relative z-10 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-green-500/10 border border-green-500/20">
              <Users className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Team Coordination</h2>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Field team locations and communication</p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <Badge variant="secondary" className="gap-2 text-xs h-7">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              {onlineMembers}/{activeFieldTeam} Online
            </Badge>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate('/field-team')}
              data-testid="button-view-full-team"
              className="h-7 text-xs"
            >
              View Full Team
            </Button>
          </div>
        </div>
        <div className="absolute inset-0 bg-grid-pattern opacity-5" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-2xl h-auto p-1 bg-muted/30">
          <TabsTrigger value="overview" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <UserCircle className="h-3.5 w-3.5" />
            <span className="text-xs">Team Overview</span>
          </TabsTrigger>
          <TabsTrigger value="map" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <MapPin className="h-3.5 w-3.5" />
            <span className="text-xs">Live Map</span>
          </TabsTrigger>
          <TabsTrigger value="communication" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="text-xs">Communication</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-3">
          {assignableTeamMembers && assignableTeamMembers.length > 0 ? (
            <>
              {/* View Toggle */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Team Members ({assignableTeamMembers.length})
                </h3>
                <div className="flex gap-1 bg-muted/30 p-1 rounded-lg">
                  <Button
                    variant={viewMode === 'cards' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('cards')}
                    data-testid="button-view-cards"
                    className="h-7 text-xs gap-1.5"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    Cards
                  </Button>
                  <Button
                    variant={viewMode === 'table' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('table')}
                    data-testid="button-view-table"
                    className="h-7 text-xs gap-1.5"
                  >
                    <TableIcon className="h-3.5 w-3.5" />
                    Table
                  </Button>
                </div>
              </div>

              {/* Card or Table View */}
              {viewMode === 'cards' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {assignableTeamMembers.map(user => (
                    <TeamMemberCard
                      key={user.id}
                      user={user}
                      workload={userWorkloads.get(user.id) || { active: 0, completed: 0, pending: 0, overdue: 0 }}
                      onClick={() => handleMemberClick(user)}
                    />
                  ))}
                </div>
              ) : (
                <TeamMemberTable
                  users={assignableTeamMembers}
                  workloads={userWorkloads}
                  onRowClick={handleMemberClick}
                />
              )}
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mb-3 opacity-50" />
                <p>No assignable team members found</p>
                <p className="text-xs mt-1">Only Coordinators and Data Collectors are shown</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="map" className="mt-4">
          <TeamLocationMap 
            users={assignableTeamMembers} 
            siteVisits={siteVisits || []}
          />
        </TabsContent>

        <TabsContent value="communication" className="mt-4">
          <TeamCommunication />
        </TabsContent>
      </Tabs>

      {/* Team Member Detail Modal */}
      <TeamMemberDetailModal
        open={isDetailModalOpen}
        onOpenChange={handleModalClose}
        user={selectedMember}
        userTasks={selectedMemberTasks}
      />
    </div>
  );
};
