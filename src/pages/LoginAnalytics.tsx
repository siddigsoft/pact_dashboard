import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft, Monitor, Smartphone, Tablet, Clock, Users, 
  Activity, Calendar, Globe, RefreshCw, Download, Search,
  Check, X, Shield
} from 'lucide-react';
import { formatDistanceToNow, format, differenceInMinutes } from 'date-fns';
import { getLoginHistory, getLoginStats, getActiveSessions, type LoginEvent } from '@/lib/login-tracking';
import { useUser } from '@/context/user/UserContext';

const LoginAnalytics = () => {
  const navigate = useNavigate();
  const { currentUser } = useAppContext();
  const { users } = useUser();
  const [loginEvents, setLoginEvents] = useState<LoginEvent[]>([]);
  const [activeSessions, setActiveSessions] = useState<LoginEvent[]>([]);
  const [stats, setStats] = useState<{
    totalLogins: number;
    webLogins: number;
    androidLogins: number;
    iosLogins: number;
    uniqueDevices: number;
    avgSessionDuration: number | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');

  // Check if user has admin access
  const hasAccess = useMemo(() => {
    if (!currentUser) return false;
    const userRoles = currentUser.roles?.map(r => r.toLowerCase()) || [];
    return userRoles.includes('admin') || 
           userRoles.includes('ict') || 
           userRoles.includes('projectmanager');
  }, [currentUser]);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [historyResult, statsResult, sessionsResult] = await Promise.all([
          getLoginHistory(undefined, { limit: 100 }),
          getLoginStats(),
          getActiveSessions(),
        ]);
        
        setLoginEvents(historyResult.data);
        setStats(statsResult);
        setActiveSessions(sessionsResult);
      } catch (err) {
        console.error('Error fetching login analytics:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    if (hasAccess) {
      fetchData();
    }
  }, [hasAccess]);

  // Get user name from ID
  const getUserName = (userId: string): string => {
    const user = users.find(u => u.id === userId);
    return user?.name || user?.fullName || userId.slice(0, 8) + '...';
  };

  // Filter login events
  const filteredEvents = useMemo(() => {
    return loginEvents.filter(event => {
      // Search filter
      if (searchTerm) {
        const userName = getUserName(event.user_id).toLowerCase();
        const deviceModel = (event.device_model || '').toLowerCase();
        const browser = (event.browser || '').toLowerCase();
        const searchLower = searchTerm.toLowerCase();
        
        if (!userName.includes(searchLower) && 
            !deviceModel.includes(searchLower) && 
            !browser.includes(searchLower)) {
          return false;
        }
      }
      
      // Platform filter
      if (platformFilter !== 'all' && event.platform !== platformFilter) {
        return false;
      }
      
      // Date filter
      if (dateFilter !== 'all') {
        const loginDate = new Date(event.login_at);
        const now = new Date();
        
        if (dateFilter === 'today') {
          if (loginDate.toDateString() !== now.toDateString()) return false;
        } else if (dateFilter === 'week') {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (loginDate < weekAgo) return false;
        } else if (dateFilter === 'month') {
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          if (loginDate < monthAgo) return false;
        }
      }
      
      return true;
    });
  }, [loginEvents, searchTerm, platformFilter, dateFilter, users]);

  // Calculate session duration
  const getSessionDuration = (event: LoginEvent): string => {
    if (!event.logout_at) {
      return 'Active';
    }
    
    const mins = differenceInMinutes(new Date(event.logout_at), new Date(event.login_at));
    
    if (mins < 1) return '< 1 min';
    if (mins < 60) return `${mins} min`;
    
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    
    if (hours < 24) return `${hours}h ${remainingMins}m`;
    
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  };

  // Get platform icon
  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'android':
        return <Smartphone className="h-4 w-4 text-green-500" />;
      case 'ios':
        return <Tablet className="h-4 w-4 text-blue-500" />;
      default:
        return <Monitor className="h-4 w-4 text-purple-500" />;
    }
  };

  // Handle refresh
  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      const [historyResult, statsResult, sessionsResult] = await Promise.all([
        getLoginHistory(undefined, { limit: 100 }),
        getLoginStats(),
        getActiveSessions(),
      ]);
      
      setLoginEvents(historyResult.data);
      setStats(statsResult);
      setActiveSessions(sessionsResult);
    } catch (err) {
      console.error('Error refreshing:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!hasAccess) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Shield className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
            <p className="text-muted-foreground text-center mb-4">
              You don't have permission to view login analytics.
              <br />
              Please contact an administrator for access.
            </p>
            <Button onClick={() => navigate(-1)} data-testid="button-go-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate(-1)}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Login Analytics</h1>
            <p className="text-muted-foreground">
              Track login activity, devices, and session duration
            </p>
          </div>
        </div>
        <Button 
          variant="outline" 
          onClick={handleRefresh}
          disabled={isLoading}
          data-testid="button-refresh-analytics"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-500" />
              <span className="text-sm text-muted-foreground">Total Logins</span>
            </div>
            <div className="text-2xl font-bold mt-2" data-testid="stat-total-logins">
              {stats?.totalLogins ?? '-'}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-purple-500" />
              <span className="text-sm text-muted-foreground">Web</span>
            </div>
            <div className="text-2xl font-bold mt-2" data-testid="stat-web-logins">
              {stats?.webLogins ?? '-'}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-green-500" />
              <span className="text-sm text-muted-foreground">Android</span>
            </div>
            <div className="text-2xl font-bold mt-2" data-testid="stat-android-logins">
              {stats?.androidLogins ?? '-'}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Tablet className="h-5 w-5 text-blue-500" />
              <span className="text-sm text-muted-foreground">iOS</span>
            </div>
            <div className="text-2xl font-bold mt-2" data-testid="stat-ios-logins">
              {stats?.iosLogins ?? '-'}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-orange-500" />
              <span className="text-sm text-muted-foreground">Devices</span>
            </div>
            <div className="text-2xl font-bold mt-2" data-testid="stat-unique-devices">
              {stats?.uniqueDevices ?? '-'}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-cyan-500" />
              <span className="text-sm text-muted-foreground">Avg Session</span>
            </div>
            <div className="text-2xl font-bold mt-2" data-testid="stat-avg-session">
              {stats?.avgSessionDuration 
                ? `${Math.round(stats.avgSessionDuration)}m` 
                : '-'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="history" className="space-y-4">
        <TabsList>
          <TabsTrigger value="history" data-testid="tab-history">
            Login History
          </TabsTrigger>
          <TabsTrigger value="active" data-testid="tab-active">
            Active Sessions ({activeSessions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by user, device, or browser..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                      data-testid="input-search-logins"
                    />
                  </div>
                </div>
                
                <Select value={platformFilter} onValueChange={setPlatformFilter}>
                  <SelectTrigger className="w-[150px]" data-testid="select-platform-filter">
                    <SelectValue placeholder="Platform" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Platforms</SelectItem>
                    <SelectItem value="web">Web</SelectItem>
                    <SelectItem value="android">Android</SelectItem>
                    <SelectItem value="ios">iOS</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="w-[150px]" data-testid="select-date-filter">
                    <SelectValue placeholder="Date Range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Login History Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Login History</CardTitle>
              <CardDescription>
                Showing {filteredEvents.length} login events
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Device / Browser</TableHead>
                      <TableHead>Login Time</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEvents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No login events found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredEvents.map((event, index) => (
                        <TableRow key={event.id || index} data-testid={`row-login-${index}`}>
                          <TableCell>
                            <div className="font-medium">{getUserName(event.user_id)}</div>
                            <div className="text-xs text-muted-foreground">
                              {event.login_method || 'password'}
                              {event.mfa_used && (
                                <Badge variant="outline" className="ml-2 text-xs">
                                  <Shield className="h-3 w-3 mr-1" />
                                  MFA
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getPlatformIcon(event.platform)}
                              <span className="capitalize">{event.platform}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {event.platform === 'web' ? (
                                <>
                                  {event.browser} {event.browser_version}
                                  <div className="text-xs text-muted-foreground">{event.os_version}</div>
                                </>
                              ) : (
                                <>
                                  {event.device_manufacturer} {event.device_model}
                                  <div className="text-xs text-muted-foreground">{event.os_version}</div>
                                </>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {format(new Date(event.login_at), 'MMM d, yyyy')}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(event.login_at), 'HH:mm:ss')}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={!event.logout_at ? 'text-green-600 font-medium' : ''}>
                              {getSessionDuration(event)}
                            </span>
                          </TableCell>
                          <TableCell>
                            {event.success ? (
                              <Badge variant="default" className="bg-green-500/10 text-green-700 border-green-500/30">
                                <Check className="h-3 w-3 mr-1" />
                                Success
                              </Badge>
                            ) : (
                              <Badge variant="destructive">
                                <X className="h-3 w-3 mr-1" />
                                Failed
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="active" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5 text-green-500" />
                Active Sessions
              </CardTitle>
              <CardDescription>
                Users currently logged into the system
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Device / Browser</TableHead>
                      <TableHead>Logged In</TableHead>
                      <TableHead>Session Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeSessions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No active sessions
                        </TableCell>
                      </TableRow>
                    ) : (
                      activeSessions.map((session, index) => (
                        <TableRow key={session.id || index} data-testid={`row-active-${index}`}>
                          <TableCell>
                            <div className="font-medium">{getUserName(session.user_id)}</div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getPlatformIcon(session.platform)}
                              <span className="capitalize">{session.platform}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {session.platform === 'web' ? (
                                `${session.browser} ${session.browser_version || ''}`
                              ) : (
                                `${session.device_manufacturer || ''} ${session.device_model || ''}`
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {session.os_version}
                            </div>
                          </TableCell>
                          <TableCell>
                            {formatDistanceToNow(new Date(session.login_at), { addSuffix: true })}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/30">
                              Active
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default LoginAnalytics;
