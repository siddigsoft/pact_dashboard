import React, { useState, useMemo, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, MapPin, MessageSquare, UserCircle, LayoutGrid, Table as TableIcon, Building2 } from 'lucide-react';
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
import { useAppContext } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';

export const TeamZone: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [selectedMember, setSelectedMember] = useState<User | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [hubName, setHubName] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const { users } = useUser();
  const { siteVisits } = useSiteVisitContext();
  const { currentUser, roles } = useAppContext();

  // Check if current user is a supervisor (not admin/ict)
  const isSupervisor = useMemo(() => {
    if (!roles) return false;
    const normalizedRoles = roles.map(r => r.toLowerCase());
    const isAdmin = normalizedRoles.includes('admin') || normalizedRoles.includes('ict');
    return normalizedRoles.includes('supervisor') && !isAdmin;
  }, [roles]);

  // Get supervisor's hub ID for filtering
  const supervisorHubId = currentUser?.hubId;

  // Fetch hub name for supervisor
  useEffect(() => {
    if (!isSupervisor || !supervisorHubId) {
      setHubName(null);
      return;
    }
    const fetchHubName = async () => {
      const { data } = await supabase
        .from('hubs')
        .select('name')
        .eq('id', supervisorHubId)
        .maybeSingle();
      if (data) setHubName(data.name);
    };
    fetchHubName();
  }, [isSupervisor, supervisorHubId]);

  // Filter and sort team members who can be assigned to site visits (coordinators and data collectors only)
  // For supervisors: only show team members in their hub
  // Sort: Online first, then by last login (most recent first)
  const assignableTeamMembers = useMemo(() => {
    if (!users) return [];
    
    let filtered = users.filter(user => 
      user.roles?.some(role => {
        const normalizedRole = role.toLowerCase();
        return normalizedRole === 'coordinator' || normalizedRole === 'datacollector';
      })
    );

    // If supervisor, filter to only show team members in their hub
    if (isSupervisor && supervisorHubId) {
      filtered = filtered.filter(user => user.hubId === supervisorHubId);
    }
    
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
  }, [users, isSupervisor, supervisorHubId]);

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
    <div className="min-h-screen bg-background p-3 sm:p-4 md:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Modern Tech Header */}
      <div className="relative overflow-hidden rounded-lg border border-border/50 bg-gradient-to-r from-green-500/5 via-blue-500/5 to-background p-4 shadow-sm">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-green-500/10 border border-green-500/20 flex-shrink-0">
              <Users className="h-5 w-5 sm:h-6 sm:w-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold truncate">Team Coordination</h2>
              <p className="text-xs sm:text-sm text-muted-foreground uppercase tracking-wide">
                {isSupervisor && hubName ? `${hubName} Hub - ` : ''}Field team locations and communication
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center flex-wrap">
            {isSupervisor && hubName && (
              <Badge variant="outline" className="gap-1.5 text-xs h-7 bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300 self-start">
                <Building2 className="h-3 w-3" />
                {hubName}
              </Badge>
            )}
            <Badge variant="secondary" className="gap-2 text-xs h-7 self-start">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              {onlineMembers}/{activeFieldTeam} Online
            </Badge>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate('/field-team')}
              data-testid="button-view-full-team"
              className="h-8 px-4 text-xs active:scale-95 transition-all self-start"
            >
              View Full Team
            </Button>
          </div>
        </div>
        <div className="absolute inset-0 bg-grid-pattern opacity-5" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-2xl h-auto p-1 bg-muted/30 mx-auto">
          <TabsTrigger value="overview" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm min-h-[44px] sm:min-h-[40px] px-2 py-2 sm:py-1.5">
            <UserCircle className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span className="text-xs sm:text-xs">Team Overview</span>
          </TabsTrigger>
          <TabsTrigger value="map" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm min-h-[44px] sm:min-h-[40px] px-2 py-2 sm:py-1.5">
            <MapPin className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span className="text-xs sm:text-xs">Live Map</span>
          </TabsTrigger>
          <TabsTrigger value="communication" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm min-h-[44px] sm:min-h-[40px] px-2 py-2 sm:py-1.5">
            <MessageSquare className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span className="text-xs sm:text-xs">Communication</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-3">
          {assignableTeamMembers && assignableTeamMembers.length > 0 ? (
            <>
              {/* View Toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Team Members ({assignableTeamMembers.length})
                </h3>
                <div className="flex gap-1 bg-muted/30 p-1 rounded-lg self-start">
                  <Button
                    variant={viewMode === 'cards' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('cards')}
                    data-testid="button-view-cards"
                    className="h-9 px-4 text-xs gap-1.5 active:scale-95 transition-all min-h-[36px]"
                  >
                    <LayoutGrid className="h-4 w-4" />
                    Cards
                  </Button>
                  <Button
                    variant={viewMode === 'table' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('table')}
                    data-testid="button-view-table"
                    className="h-9 px-4 text-xs gap-1.5 active:scale-95 transition-all min-h-[36px]"
                  >
                    <TableIcon className="h-4 w-4" />
                    Table
                  </Button>
                </div>
              </div>

              {/* Card or Table View */}
              {viewMode === 'cards' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
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
