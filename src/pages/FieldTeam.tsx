import React, { useState, useMemo } from 'react';
import { useUser } from '@/context/user/UserContext';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { useNavigate } from 'react-router-dom';
import { calculateUserWorkload } from '@/utils/collectorUtils';
import SimpleFieldTeamMap from '@/components/map/SimpleFieldTeamMap';
import SiteVisitsSummary from '@/components/field-team/SiteVisitsSummary';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import GpsLocationCapture from '@/components/GpsLocationCapture';
import { useUserProjects } from '@/hooks/useUserProjects';
import { getUserStatus } from '@/utils/userStatusUtils';
import {
  Users,
  MapPin,
  Search,
  RefreshCw,
  UserCheck,
  Briefcase,
  Phone,
  Mail,
  Clock,
  Navigation,
  Sparkles,
  Map,
  List,
  Filter,
  Eye,
  ChevronRight,
  Globe2,
  Wifi,
  WifiOff,
  Activity
} from 'lucide-react';
import { User } from '@/types';

const FieldTeam = () => {
  const { users, currentUser, refreshUsers, updateUserLocation } = useUser();
  const { siteVisits, assignSiteVisit } = useSiteVisitContext();
  const [activeTab, setActiveTab] = useState('map');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { checkPermission, hasAnyRole } = useAuthorization();

  const canAccess = checkPermission('users', 'read') || hasAnyRole(['admin']);
  
  if (!canAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to access this page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => navigate('/dashboard')}
              className="w-full"
              data-testid="button-return-dashboard"
            >
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshUsers();
    } finally {
      setTimeout(() => setIsRefreshing(false), 1000);
    }
  };

  const fieldTeamUsers = useMemo(() => {
    return users.filter((user) => {
      const role = user.role?.toLowerCase() || '';
      return ['coordinator', 'datacollector', 'enumerator', 'data_collector'].includes(role);
    });
  }, [users]);

  const filteredUsers = useMemo(() => {
    return fieldTeamUsers.filter((user) => {
      const matchesSearch = 
        user.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.phone && user.phone.includes(searchTerm));
      
      const role = user.role?.toLowerCase() || '';
      const isDataCollector = ['datacollector', 'data_collector', 'enumerator'].includes(role);
      const matchesRole = roleFilter === 'all' || 
        (roleFilter === 'datacollector' && isDataCollector) ||
        user.role?.toLowerCase() === roleFilter.toLowerCase();
      const userStatus = getUserStatus(user);
      const matchesStatus = statusFilter === 'all' || 
        (statusFilter === 'online' && userStatus.type === 'online') ||
        (statusFilter === 'offline' && userStatus.type === 'offline') ||
        (statusFilter === 'busy' && userStatus.type === 'same-day');
      
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [fieldTeamUsers, searchTerm, roleFilter, statusFilter]);

  const coordinators = useMemo(() => 
    fieldTeamUsers.filter(u => u.role?.toLowerCase() === 'coordinator'), 
    [fieldTeamUsers]
  );
  
  const dataCollectors = useMemo(() => 
    fieldTeamUsers.filter(u => ['datacollector', 'data_collector', 'enumerator'].includes(u.role?.toLowerCase() || '')), 
    [fieldTeamUsers]
  );

  const usersWithLocation = useMemo(() => 
    filteredUsers.filter(u => u.location?.latitude && u.location?.longitude),
    [filteredUsers]
  );

  const onlineUsers = useMemo(() => 
    fieldTeamUsers.filter(u => getUserStatus(u).type === 'online'),
    [fieldTeamUsers]
  );

  const activeSiteVisits = useMemo(() => {
    return siteVisits.filter(
      (visit) => visit.status === 'assigned' || visit.status === 'inProgress'
    );
  }, [siteVisits]);

  const pendingSiteVisits = useMemo(() => {
    return siteVisits.filter(
      (visit) => visit.status === 'pending' || visit.status === 'permitVerified'
    );
  }, [siteVisits]);

  const handleAssignFromMap = (siteVisitId: string) => {
    navigate(`/site-visits/${siteVisitId}`);
  };

  const getRoleBadgeColor = (role: string) => {
    const r = role?.toLowerCase() || '';
    if (r === 'coordinator') return 'bg-purple-500';
    if (['datacollector', 'data_collector', 'enumerator'].includes(r)) return 'bg-green-500';
    return 'bg-gray-500';
  };
  
  const getDisplayRole = (role: string) => {
    const r = role?.toLowerCase() || '';
    if (['datacollector', 'data_collector', 'enumerator'].includes(r)) return 'Data Collector';
    if (r === 'coordinator') return 'Coordinator';
    return role;
  };

  const getStatusColor = (status: string) => {
    if (status === 'online') return 'bg-green-500';
    if (status === 'busy') return 'bg-amber-500';
    return 'bg-gray-400';
  };

  const formatCoordinates = (lat?: number, lng?: number) => {
    if (!lat || !lng) return 'No GPS Data';
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  };

  const TeamMemberCard = ({ user }: { user: User }) => {
    const workload = calculateUserWorkload(user.id, siteVisits);
    const hasLocation = user.location?.latitude && user.location?.longitude;
    const userStatus = getUserStatus(user);
    
    const statusColorClass = userStatus.type === 'online' ? 'bg-green-500' :
                            userStatus.type === 'same-day' ? 'bg-amber-500' : 'bg-gray-400';
    
    return (
      <Card className="hover-elevate overflow-hidden" data-testid={`card-team-member-${user.id}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <div className="relative">
              <Avatar className="h-14 w-14 border-2 border-background shadow-md">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className={`${getRoleBadgeColor(user.role)} text-white font-semibold`}>
                  {user.name?.substring(0, 2).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <span className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white ${statusColorClass}`} />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-base truncate">{user.name}</h3>
                <Badge variant="secondary" className={`${getRoleBadgeColor(user.role)} text-white text-xs`}>
                  {getDisplayRole(user.role)}
                </Badge>
              </div>
              
              <div className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                {user.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </div>
                )}
                
                {user.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{user.phone}</span>
                  </div>
                )}
                
                <div className={`flex items-center gap-2 ${hasLocation ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                  <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="font-mono text-xs">
                    {formatCoordinates(user.location?.latitude, user.location?.longitude)}
                  </span>
                </div>
              </div>
              
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">
                  <Briefcase className="h-3 w-3 mr-1" />
                  {workload} Tasks
                </Badge>
                
                <Badge 
                  variant={userStatus.type === 'online' ? 'default' : 'secondary'} 
                  className="text-xs"
                >
                  {userStatus.type === 'online' ? (
                    <><Wifi className="h-3 w-3 mr-1" /> Online</>
                  ) : userStatus.type === 'same-day' ? (
                    <><Activity className="h-3 w-3 mr-1" /> Active Today</>
                  ) : (
                    <><WifiOff className="h-3 w-3 mr-1" /> Offline</>
                  )}
                </Badge>
                
                {user.lastActive && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(user.lastActive).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
            
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate(`/users/${user.id}`)}
              data-testid={`button-view-user-${user.id}`}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="h-8 w-8 text-blue-600" />
            Field Team
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Monitor and manage your field team in real-time
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {currentUser && (
            <GpsLocationCapture
              user={currentUser}
              onLocationCapture={(lat, lng, accuracy) => {
                updateUserLocation(lat, lng, accuracy);
              }}
            />
          )}
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            data-testid="button-refresh-team"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card 
          className="hover-elevate active-elevate-2 cursor-pointer overflow-hidden relative bg-gradient-to-br from-blue-500 to-blue-700 text-white border-0"
          onClick={() => setRoleFilter('all')}
          data-testid="card-total-team"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">
              Total Field Team
            </CardTitle>
            <Users className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{fieldTeamUsers.length}</div>
            <p className="text-xs text-white/80 mt-1">
              {onlineUsers.length} currently online
            </p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
        </Card>

        <Card 
          className="hover-elevate active-elevate-2 cursor-pointer overflow-hidden relative bg-gradient-to-br from-purple-500 to-purple-700 text-white border-0"
          onClick={() => setRoleFilter('coordinator')}
          data-testid="card-coordinators"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">
              Coordinators
            </CardTitle>
            <UserCheck className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{coordinators.length}</div>
            <p className="text-xs text-white/80 mt-1">
              {coordinators.filter(u => u.location?.latitude).length} with GPS
            </p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
        </Card>

        <Card 
          className="hover-elevate active-elevate-2 cursor-pointer overflow-hidden relative bg-gradient-to-br from-green-500 to-emerald-700 text-white border-0"
          onClick={() => setRoleFilter('datacollector')}
          data-testid="card-data-collectors"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">
              Data Collectors
            </CardTitle>
            <Navigation className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{dataCollectors.length}</div>
            <p className="text-xs text-white/80 mt-1">
              {dataCollectors.filter(u => u.location?.latitude).length} with GPS
            </p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
        </Card>
      </div>

      <Card className="border shadow-sm">
        <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900/50 dark:to-slate-800/50 border-b pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-500 rounded-lg">
                <Globe2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg">Team Location Tracker</CardTitle>
                <CardDescription>
                  {usersWithLocation.length} of {filteredUsers.length} team members have GPS data
                </CardDescription>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search team members..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  data-testid="input-search-team"
                />
              </div>
              
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[160px]" data-testid="select-role-filter">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="coordinator">Coordinators</SelectItem>
                  <SelectItem value="datacollector">Data Collectors</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="busy">Busy</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="border-b px-4">
              <TabsList className="h-12 bg-transparent">
                <TabsTrigger value="map" className="flex items-center gap-2" data-testid="tab-map">
                  <Map className="h-4 w-4" />
                  Map View
                </TabsTrigger>
                <TabsTrigger value="list" className="flex items-center gap-2" data-testid="tab-list">
                  <List className="h-4 w-4" />
                  Team List ({filteredUsers.length})
                </TabsTrigger>
                <TabsTrigger value="gps" className="flex items-center gap-2" data-testid="tab-gps">
                  <MapPin className="h-4 w-4" />
                  GPS Coordinates
                </TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="map" className="m-0">
              <SimpleFieldTeamMap
                users={filteredUsers}
                siteVisits={[...activeSiteVisits, ...pendingSiteVisits]}
                onAssign={handleAssignFromMap}
                height={isMobile ? "350px" : "500px"}
              />
            </TabsContent>
            
            <TabsContent value="list" className="m-0 p-4">
              {filteredUsers.length > 0 ? (
                <ScrollArea className={isMobile ? "h-[400px]" : "h-[500px]"}>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pr-4">
                    {filteredUsers.map(user => (
                      <TeamMemberCard key={user.id} user={user} />
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <Users className="h-16 w-16 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No Team Members Found</p>
                  <p className="text-muted-foreground">Try adjusting your filters</p>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="gps" className="m-0 p-4">
              <ScrollArea className={isMobile ? "h-[400px]" : "h-[500px]"}>
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-muted/50 rounded-lg font-medium text-sm">
                    <div className="col-span-1"></div>
                    <div className="col-span-3">Name</div>
                    <div className="col-span-2">Role</div>
                    <div className="col-span-3">GPS Coordinates</div>
                    <div className="col-span-2">Status</div>
                    <div className="col-span-1"></div>
                  </div>
                  
                  {filteredUsers.map(user => {
                    const hasGPS = user.location?.latitude && user.location?.longitude;
                    const rowUserStatus = getUserStatus(user);
                    const rowStatusColor = rowUserStatus.type === 'online' ? 'bg-green-500' :
                                          rowUserStatus.type === 'same-day' ? 'bg-amber-500' : 'bg-gray-400';
                    return (
                      <div 
                        key={user.id} 
                        className="grid grid-cols-12 gap-2 px-4 py-3 items-center rounded-lg hover:bg-muted/30 transition-colors"
                        data-testid={`row-gps-${user.id}`}
                      >
                        <div className="col-span-1">
                          <div className="relative">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={user.avatar} />
                              <AvatarFallback className={`${getRoleBadgeColor(user.role)} text-white text-xs`}>
                                {user.name?.substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${rowStatusColor}`} />
                          </div>
                        </div>
                        
                        <div className="col-span-3">
                          <p className="font-medium truncate">{user.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        </div>
                        
                        <div className="col-span-2">
                          <Badge variant="secondary" className={`${getRoleBadgeColor(user.role)} text-white text-xs`}>
                            {getDisplayRole(user.role)}
                          </Badge>
                        </div>
                        
                        <div className="col-span-3">
                          {hasGPS ? (
                            <div className="flex items-center gap-1.5">
                              <MapPin className="h-4 w-4 text-green-500 flex-shrink-0" />
                              <code className="text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 px-2 py-0.5 rounded">
                                {user.location?.latitude?.toFixed(6)}, {user.location?.longitude?.toFixed(6)}
                              </code>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <MapPin className="h-4 w-4 text-gray-400" />
                              <span className="text-xs">No GPS Data</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="col-span-2">
                          <Badge 
                            variant={rowUserStatus.type === 'online' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {rowUserStatus.type === 'online' ? 'Online' : rowUserStatus.type === 'same-day' ? 'Active Today' : 'Offline'}
                          </Badge>
                        </div>
                        
                        <div className="col-span-1 flex justify-end">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => navigate(`/users/${user.id}`)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  
                  {filteredUsers.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      No team members match your filters
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <SiteVisitsSummary 
        activeSiteVisits={activeSiteVisits}
        pendingSiteVisits={pendingSiteVisits}
        users={users}
      />
    </div>
  );
};

export default FieldTeam;
