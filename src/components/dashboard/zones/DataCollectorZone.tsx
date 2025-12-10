import React, { useState, useMemo, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { GradientStatCard } from '@/components/ui/gradient-stat-card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  MapPin, 
  Calendar, 
  DollarSign, 
  Activity,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  Play,
  Navigation,
  Camera,
  FileText,
  Wallet,
  Target,
  Zap,
  ExternalLink,
  Filter,
  X,
  Phone,
  Mail,
  HelpCircle,
  Award,
  Flame,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { format, isToday, isPast, addDays, differenceInDays, parseISO, isValid } from 'date-fns';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { useWallet } from '@/context/wallet/WalletContext';
import { useNavigate } from 'react-router-dom';
import { DashboardCalendar } from '../DashboardCalendar';
import { useToast } from '@/hooks/use-toast';

interface Filters {
  status: string;
  priority: string;
  dateRange: string;
}

export const DataCollectorZone: React.FC = () => {
  const { currentUser, updateUserLocation } = useAppContext();
  const { siteVisits, startSiteVisit } = useSiteVisitContext();
  const { wallet, transactions, stats, getBalance } = useWallet();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('my-visits');
  const [filters, setFilters] = useState<Filters>({
    status: '',
    priority: '',
    dateRange: ''
  });
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);
  const [locationLastUpdated, setLocationLastUpdated] = useState<string | null>(null);

  // Get current location info
  const currentLocation = useMemo(() => {
    if (!currentUser?.location) return null;
    const loc = typeof currentUser.location === 'string' 
      ? JSON.parse(currentUser.location) 
      : currentUser.location;
    return {
      latitude: loc?.latitude || loc?.lat,
      longitude: loc?.longitude || loc?.lng || loc?.lon
    };
  }, [currentUser?.location]);

  const hasLocation = currentLocation?.latitude && currentLocation?.longitude;

  // Get location last updated time
  useEffect(() => {
    if (currentUser?.location) {
      // Try to get last updated from profile
      const fetchLastUpdated = async () => {
        try {
          const { data } = await supabase
            .from('profiles')
            .select('location_updated_at')
            .eq('id', currentUser.id)
            .single();
          if (data?.location_updated_at) {
            setLocationLastUpdated(data.location_updated_at);
          }
        } catch (error) {
          console.error('Error fetching location update time:', error);
        }
      };
      fetchLastUpdated();
    }
  }, [currentUser?.id, currentUser?.location]);

  // Handle location update
  const handleUpdateLocation = async () => {
    if (!navigator.geolocation) {
      toast({
        title: 'Location Not Supported',
        description: 'Geolocation is not supported by your browser.',
        variant: 'destructive'
      });
      return;
    }

    setIsUpdatingLocation(true);
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        try {
          const success = await updateUserLocation(latitude, longitude, accuracy);
          if (success) {
            toast({
              title: 'Location Updated',
              description: `Location saved with accuracy: ±${accuracy.toFixed(1)}m`,
              variant: 'default'
            });
            setLocationLastUpdated(new Date().toISOString());
          } else {
            throw new Error('Failed to update location');
          }
        } catch (error: any) {
          console.error('Error updating location:', error);
          toast({
            title: 'Location Update Failed',
            description: error?.message || 'Failed to save your location. Please try again.',
            variant: 'destructive'
          });
        } finally {
          setIsUpdatingLocation(false);
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        let errorMsg = 'Failed to get your location';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = 'Location permission denied. Please enable location access in your browser settings.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = 'Location information is unavailable.';
            break;
          case error.TIMEOUT:
            errorMsg = 'Location request timed out. Please try again.';
            break;
        }
        toast({
          title: 'Location Error',
          description: errorMsg,
          variant: 'destructive'
        });
        setIsUpdatingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Get visits assigned to this data collector
  const myVisits = useMemo(() => {
    if (!currentUser?.id || !siteVisits) return [];
    return siteVisits.filter(visit => visit.assignedTo === currentUser.id);
  }, [siteVisits, currentUser?.id]);

  // Categorize visits
  const todaysVisits = useMemo(() => {
    return myVisits.filter(visit => {
      if (!visit.dueDate) return false;
      const dueDate = parseISO(visit.dueDate);
      return isValid(dueDate) && isToday(dueDate);
    });
  }, [myVisits]);

  const upcomingVisits = useMemo(() => {
    return myVisits.filter(visit => {
      if (!visit.dueDate) return false;
      const dueDate = parseISO(visit.dueDate);
      if (!isValid(dueDate)) return false;
      const today = new Date();
      const sevenDaysLater = addDays(today, 7);
      return dueDate > today && dueDate <= sevenDaysLater;
    }).sort((a, b) => {
      const dateA = parseISO(a.dueDate);
      const dateB = parseISO(b.dueDate);
      return dateA.getTime() - dateB.getTime();
    });
  }, [myVisits]);

  const overdueVisits = useMemo(() => {
    return myVisits.filter(visit => {
      if (!visit.dueDate) return false;
      const dueDate = parseISO(visit.dueDate);
      return isValid(dueDate) && isPast(dueDate) && visit.status !== 'completed';
    });
  }, [myVisits]);

  const inProgressVisits = useMemo(() => {
    return myVisits.filter(visit => visit.status === 'inProgress');
  }, [myVisits]);

  const completedVisits = useMemo(() => {
    return myVisits.filter(visit => visit.status === 'completed');
  }, [myVisits]);

  const assignedVisits = useMemo(() => {
    return myVisits.filter(visit => visit.status === 'assigned' || visit.status === 'permitVerified');
  }, [myVisits]);

  // Calculate metrics
  const totalAssigned = myVisits.length;
  const completedCount = completedVisits.length;
  const completionRate = totalAssigned > 0 ? Math.round((completedCount / totalAssigned) * 100) : 0;
  const overdueCount = overdueVisits.length;
  const inProgressCount = inProgressVisits.length;

  // Calculate earnings
  const walletBalance = getBalance('SDG');
  const thisMonthEarnings = useMemo(() => {
    if (!transactions) return 0;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return transactions
      .filter(tx => {
        const txDate = parseISO(tx.createdAt);
        return isValid(txDate) && txDate >= startOfMonth && tx.type === 'earning';
      })
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [transactions]);

  // Calculate average visit time (if we have completedAt data)
  const averageVisitTime = useMemo(() => {
    const visitsWithTime = completedVisits.filter(v => v.completedAt && v.assignedAt);
    if (visitsWithTime.length === 0) return null;
    
    const totalMinutes = visitsWithTime.reduce((sum, v) => {
      const start = parseISO(v.assignedAt!);
      const end = parseISO(v.completedAt!);
      if (!isValid(start) || !isValid(end)) return sum;
      return sum + (end.getTime() - start.getTime()) / (1000 * 60);
    }, 0);
    
    return Math.round(totalMinutes / visitsWithTime.length);
  }, [completedVisits]);

  // Calculate streak (consecutive days with completed visits)
  const streak = useMemo(() => {
    if (completedVisits.length === 0) return 0;
    
    const completedDates = completedVisits
      .map(v => {
        if (!v.completedAt) return null;
        const date = parseISO(v.completedAt);
        return isValid(date) ? format(date, 'yyyy-MM-dd') : null;
      })
      .filter(Boolean)
      .sort()
      .reverse();
    
    if (completedDates.length === 0) return 0;
    
    const uniqueDates = [...new Set(completedDates)];
    let currentStreak = 0;
    const today = format(new Date(), 'yyyy-MM-dd');
    
    for (let i = 0; i < uniqueDates.length; i++) {
      const expectedDate = format(addDays(new Date(), -i), 'yyyy-MM-dd');
      if (uniqueDates[i] === expectedDate || (i === 0 && uniqueDates[i] === today)) {
        currentStreak++;
      } else {
        break;
      }
    }
    
    return currentStreak;
  }, [completedVisits]);

  // Get filtered visits
  const getFilteredVisits = (visits: any[]) => {
    return visits.filter(visit => {
      if (filters.status && visit.status !== filters.status) return false;
      if (filters.priority && visit.priority !== filters.priority) return false;
      return true;
    });
  };

  const filteredTodaysVisits = useMemo(() => getFilteredVisits(todaysVisits), [todaysVisits, filters]);
  const filteredUpcomingVisits = useMemo(() => getFilteredVisits(upcomingVisits), [upcomingVisits, filters]);
  const filteredOverdueVisits = useMemo(() => getFilteredVisits(overdueVisits), [overdueVisits, filters]);

  // Handle starting a visit
  const handleStartVisit = async (visit: any) => {
    try {
      // Check location permissions first
      if (!navigator.geolocation) {
        toast({
          title: 'Location Not Supported',
          description: 'Geolocation is not supported by this browser.',
          variant: 'destructive'
        });
        return;
      }

      // Use the context method to start the visit
      const success = await startSiteVisit(visit.id);
      
      if (success) {
        // Navigate to visit detail page
        navigate(`/site-visits/${visit.id}`);
      }
    } catch (error: any) {
      console.error('Error starting visit:', error);
      toast({
        title: 'Failed to Start Visit',
        description: error?.message || 'Unknown error occurred',
        variant: 'destructive'
      });
    }
  };

  // Get distance to site (if location available)
  const getDistanceToSite = (visit: any) => {
    // This would require current user location - placeholder for now
    return null;
  };

  // Open navigation
  const openNavigation = (visit: any) => {
    if (!visit.coordinates?.latitude || !visit.coordinates?.longitude) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${visit.coordinates.latitude},${visit.coordinates.longitude}`;
    window.open(url, '_blank');
  };

  const clearAllFilters = () => {
    setFilters({
      status: '',
      priority: '',
      dateRange: ''
    });
  };

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length;

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center">
            <MapPin className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Data Collector Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Manage your site visits and track your performance
            </p>
          </div>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <GradientStatCard
          title="Assigned"
          value={totalAssigned}
          subtitle="Total visits"
          icon={Target}
          color="blue"
          onClick={() => navigate('/site-visits?status=assigned')}
        />

        <GradientStatCard
          title="Today"
          value={todaysVisits.length}
          subtitle="Due today"
          icon={Calendar}
          color="orange"
          onClick={() => navigate('/site-visits?status=assigned')}
        />

        <GradientStatCard
          title="In Progress"
          value={inProgressCount}
          subtitle="Active now"
          icon={Play}
          color="cyan"
          onClick={() => navigate('/site-visits?status=inProgress')}
        />

        <GradientStatCard
          title="Completed"
          value={completedCount}
          subtitle={`${completionRate}% rate`}
          icon={CheckCircle2}
          color="green"
          onClick={() => navigate('/site-visits?status=completed')}
        />

        <GradientStatCard
          title="Overdue"
          value={overdueCount}
          subtitle={overdueCount > 0 ? "Needs attention" : "All on time"}
          icon={AlertCircle}
          color={overdueCount > 0 ? "orange" : "green"}
          onClick={() => navigate('/site-visits?status=overdue')}
        />

        <GradientStatCard
          title="Earnings"
          value={`${walletBalance.toLocaleString()} SDG`}
          subtitle={`${thisMonthEarnings.toLocaleString()} this month`}
          icon={Wallet}
          color="purple"
          onClick={() => navigate('/wallet')}
        />
      </div>

      {/* Location Update Card */}
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                <MapPin className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
                  <h3 className="font-semibold text-blue-900 dark:text-blue-100">Location Sharing</h3>
                  {hasLocation ? (
                    <Badge variant="default" className="bg-green-600 w-fit">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Enabled
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="w-fit">Not Set</Badge>
                  )}
                </div>
                <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                  Share your location to appear on the team map and receive nearby site visit assignments.
                </p>
                {hasLocation && currentLocation && (
                  <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                    <div>
                      <span className="font-medium">Current Location:</span>{' '}
                      Lat: {currentLocation.latitude.toFixed(6)}, Lng: {currentLocation.longitude.toFixed(6)}
                    </div>
                    {locationLastUpdated && (
                      <div>
                        <span className="font-medium">Last Updated:</span>{' '}
                        {format(parseISO(locationLastUpdated), 'MMM dd, yyyy h:mm:ss a')}
                      </div>
                    )}
                  </div>
                )}
                {!hasLocation && (
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Your location will be visible to supervisors and coordinators for assignment purposes.
                  </p>
                )}
              </div>
            </div>
            <Button
              onClick={handleUpdateLocation}
              disabled={isUpdatingLocation}
              className="flex-shrink-0 gap-2 min-h-[44px] px-4"
              variant={hasLocation ? "default" : "default"}
            >
              {isUpdatingLocation ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  {hasLocation ? 'Update Location' : 'Share Location'}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Streak & Performance Banner */}
      {(streak > 0 || completionRate > 0) && (
        <Card className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20 border-orange-200 dark:border-orange-800">
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                {streak > 0 && (
                  <div className="flex items-center gap-2">
                    <Flame className="h-5 w-5 text-orange-600" />
                    <div>
                      <div className="text-sm font-medium text-orange-900 dark:text-orange-100">
                        {streak} Day Streak
                      </div>
                      <div className="text-xs text-orange-700 dark:text-orange-300">
                        Keep it up!
                      </div>
                    </div>
                  </div>
                )}
                {averageVisitTime && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-blue-600" />
                    <div>
                      <div className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        Avg: {averageVisitTime} min
                      </div>
                      <div className="text-xs text-blue-700 dark:text-blue-300">
                        Per visit
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="text-center sm:text-right">
                <div className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                  {completionRate}%
                </div>
                <div className="text-xs text-orange-700 dark:text-orange-300">
                  Completion Rate
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content Tabs */}
      <Card className="border-border/50 bg-gradient-to-r from-muted/30 via-background to-muted/30">
        <CardContent className="p-2">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5 h-auto p-0.5 bg-transparent border border-border/30 gap-1 mx-auto">
              <TabsTrigger 
                value="my-visits" 
                className="gap-1 px-2 py-2 sm:py-1.5 data-[state=active]:bg-primary/10 data-[state=active]:border-primary/20 data-[state=active]:shadow-sm border border-transparent min-h-[44px] sm:min-h-[40px]"
              >
                <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <MapPin className="h-3 w-3 sm:h-2.5 sm:w-2.5 text-primary" />
                </div>
                <span className="text-[10px] sm:text-[9px] font-semibold uppercase tracking-wide text-center">Visits</span>
              </TabsTrigger>
              <TabsTrigger 
                value="schedule" 
                className="gap-1 px-2 py-2 sm:py-1.5 data-[state=active]:bg-blue-500/10 data-[state=active]:border-blue-500/20 data-[state=active]:shadow-sm border border-transparent min-h-[44px] sm:min-h-[40px]"
              >
                <div className="w-5 h-5 rounded bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <Calendar className="h-3 w-3 sm:h-2.5 sm:w-2.5 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="text-[10px] sm:text-[9px] font-semibold uppercase tracking-wide text-center hidden sm:inline">Schedule</span>
                <span className="text-[10px] sm:text-[9px] font-semibold uppercase tracking-wide text-center sm:hidden">Cal</span>
              </TabsTrigger>
              <TabsTrigger 
                value="performance" 
                className="gap-1 px-2 py-2 sm:py-1.5 data-[state=active]:bg-green-500/10 data-[state=active]:border-green-500/20 data-[state=active]:shadow-sm border border-transparent min-h-[44px] sm:min-h-[40px]"
              >
                <div className="w-5 h-5 rounded bg-green-500/10 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="h-3 w-3 sm:h-2.5 sm:w-2.5 text-green-600 dark:text-green-400" />
                </div>
                <span className="text-[10px] sm:text-[9px] font-semibold uppercase tracking-wide text-center hidden sm:inline">Stats</span>
                <span className="text-[10px] sm:text-[9px] font-semibold uppercase tracking-wide text-center sm:hidden">Stats</span>
              </TabsTrigger>
              <TabsTrigger 
                value="wallet" 
                className="gap-1 px-2 py-2 sm:py-1.5 data-[state=active]:bg-purple-500/10 data-[state=active]:border-purple-500/20 data-[state=active]:shadow-sm border border-transparent min-h-[44px] sm:min-h-[40px]"
              >
                <div className="w-5 h-5 rounded bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                  <Wallet className="h-3 w-3 sm:h-2.5 sm:w-2.5 text-purple-600 dark:text-purple-400" />
                </div>
                <span className="text-[10px] sm:text-[9px] font-semibold uppercase tracking-wide text-center hidden sm:inline">Wallet</span>
                <span className="text-[10px] sm:text-[9px] font-semibold uppercase tracking-wide text-center sm:hidden">Pay</span>
              </TabsTrigger>
              <TabsTrigger 
                value="help" 
                className="gap-1 px-2 py-2 sm:py-1.5 data-[state=active]:bg-amber-500/10 data-[state=active]:border-amber-500/20 data-[state=active]:shadow-sm border border-transparent min-h-[44px] sm:min-h-[40px]"
              >
                <div className="w-5 h-5 rounded bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                  <HelpCircle className="h-3 w-3 sm:h-2.5 sm:w-2.5 text-amber-600 dark:text-amber-400" />
                </div>
                <span className="text-[10px] sm:text-[9px] font-semibold uppercase tracking-wide text-center hidden sm:inline">Help</span>
                <span className="text-[10px] sm:text-[9px] font-semibold uppercase tracking-wide text-center sm:hidden">?</span>
              </TabsTrigger>
            </TabsList>

            {/* My Visits Tab */}
            <TabsContent value="my-visits" className="mt-3 space-y-4">
              {/* Overdue Alerts */}
              {filteredOverdueVisits.length > 0 && (
                <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2 text-red-900 dark:text-red-100">
                      <AlertCircle className="h-5 w-5" />
                      Overdue Visits ({filteredOverdueVisits.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {filteredOverdueVisits.slice(0, 5).map((visit) => {
                        const daysOverdue = differenceInDays(new Date(), parseISO(visit.dueDate));
                        return (
                          <Card key={visit.id} className="p-4 border-red-200 bg-white dark:bg-gray-900">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex-1">
                                <div className="font-medium text-sm">{visit.siteName}</div>
                                <div className="text-sm text-muted-foreground">
                                  {visit.locality}, {visit.state} • {daysOverdue} day{daysOverdue !== 1 ? 's' : ''} overdue
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button 
                                  size="sm" 
                                  onClick={() => handleStartVisit(visit)}
                                  className="gap-1 min-h-[44px] px-4"
                                >
                                  <Play className="h-3 w-3" />
                                  Start
                                </Button>
                                {visit.coordinates?.latitude && (
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => openNavigation(visit)}
                                    className="min-h-[44px] px-3"
                                  >
                                    <Navigation className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Today's Visits */}
              {filteredTodaysVisits.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-orange-600" />
                      Today's Visits ({filteredTodaysVisits.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {filteredTodaysVisits.map((visit) => (
                        <Card key={visit.id} className="p-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex-1">
                              <div className="font-medium text-sm">{visit.siteName}</div>
                              <div className="text-sm text-muted-foreground">
                                {visit.locality}, {visit.state}
                                {visit.siteCode && ` • ${visit.siteCode}`}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {visit.status === 'assigned' || visit.status === 'permitVerified' ? (
                                <Button 
                                  size="sm" 
                                  onClick={() => handleStartVisit(visit)}
                                  className="gap-1 min-h-[44px] px-4"
                                >
                                  <Play className="h-3 w-3" />
                                  Start
                                </Button>
                              ) : visit.status === 'inProgress' ? (
                                <Button 
                                  size="sm" 
                                  variant="default"
                                  onClick={() => navigate(`/site-visits/${visit.id}`)}
                                  className="min-h-[44px] px-4"
                                >
                                  Continue
                                </Button>
                              ) : (
                                <Badge variant="outline" className="min-h-[44px] px-3 flex items-center">Completed</Badge>
                              )}
                              {visit.coordinates?.latitude && (
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => openNavigation(visit)}
                                  className="min-h-[44px] px-3"
                                >
                                  <Navigation className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Upcoming Visits */}
              {filteredUpcomingVisits.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Clock className="h-5 w-5 text-blue-600" />
                      Upcoming Visits ({filteredUpcomingVisits.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {filteredUpcomingVisits.slice(0, 10).map((visit) => {
                        const dueDate = parseISO(visit.dueDate);
                        const daysUntil = differenceInDays(dueDate, new Date());
                        return (
                          <Card key={visit.id} className="p-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex-1">
                                <div className="font-medium text-sm">{visit.siteName}</div>
                                <div className="text-sm text-muted-foreground">
                                  {visit.locality}, {visit.state} • {format(dueDate, 'MMM dd, yyyy')} ({daysUntil} day{daysUntil !== 1 ? 's' : ''})
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => navigate(`/site-visits/${visit.id}`)}
                                  className="min-h-[44px] px-4"
                                >
                                  View
                                </Button>
                                {visit.coordinates?.latitude && (
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => openNavigation(visit)}
                                    className="min-h-[44px] px-3"
                                  >
                                    <Navigation className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* No Visits Message */}
              {filteredTodaysVisits.length === 0 && filteredUpcomingVisits.length === 0 && filteredOverdueVisits.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No visits assigned at the moment.</p>
                    <p className="text-sm text-muted-foreground mt-2">Check back later for new assignments.</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Schedule Tab */}
            <TabsContent value="schedule" className="mt-3">
              <DashboardCalendar />
            </TabsContent>

            {/* Performance Tab */}
            <TabsContent value="performance" className="mt-3 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Completion Stats</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Completion Rate</span>
                        <span className="font-bold">{completionRate}%</span>
                      </div>
                      <Progress value={completionRate} className="h-3" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-2xl font-bold">{completedCount}</div>
                        <div className="text-sm text-muted-foreground">Completed</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{totalAssigned}</div>
                        <div className="text-sm text-muted-foreground">Total Assigned</div>
                      </div>
                    </div>
                    {averageVisitTime && (
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Average Visit Time</div>
                        <div className="text-2xl font-bold">{averageVisitTime} minutes</div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Recent Completions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {completedVisits.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-4 text-center">
                        No completed visits yet.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {completedVisits.slice(0, 5).map((visit) => (
                          <div key={visit.id} className="flex items-center justify-between p-2 border rounded">
                            <div>
                              <div className="font-medium text-sm">{visit.siteName}</div>
                              <div className="text-xs text-muted-foreground">
                                {visit.completedAt && format(parseISO(visit.completedAt), 'MMM dd, yyyy')}
                              </div>
                            </div>
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Wallet Tab */}
            <TabsContent value="wallet" className="mt-3 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Wallet className="h-5 w-5" />
                      Wallet Balance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold mb-2">
                      {walletBalance.toLocaleString()} SDG
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Available for withdrawal
                    </div>
                    <Button 
                      className="mt-4 w-full min-h-[44px]" 
                      onClick={() => navigate('/wallet')}
                    >
                      View Wallet Details
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">This Month Earnings</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold mb-2">
                      {thisMonthEarnings.toLocaleString()} SDG
                    </div>
                    <div className="text-sm text-muted-foreground">
                      From {completedCount} completed visit{completedCount !== 1 ? 's' : ''}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {transactions && transactions.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Recent Transactions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {transactions.slice(0, 10).map((tx) => (
                        <Card key={tx.id} className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="font-medium text-sm">{tx.description || 'Site Visit Payment'}</div>
                              <div className="text-xs text-muted-foreground">
                                {format(parseISO(tx.createdAt), 'MMM dd, yyyy HH:mm')}
                              </div>
                            </div>
                            <div className={`font-bold text-sm ${tx.type === 'earning' || tx.type === 'bonus' ? 'text-green-600' : 'text-red-600'}`}>
                              {tx.type === 'earning' || tx.type === 'bonus' ? '+' : '-'}{tx.amount.toLocaleString()} {tx.currency}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                    <Button 
                      variant="outline" 
                      className="mt-4 w-full min-h-[44px]"
                      onClick={() => navigate('/wallet')}
                    >
                      View All Transactions
                    </Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Help Tab */}
            <TabsContent value="help" className="mt-3 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <HelpCircle className="h-5 w-5" />
                      Quick Guide
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-3 bg-muted/50 rounded">
                      <div className="font-medium mb-2 text-sm">Starting a Visit</div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <div>1. Find your assigned visit</div>
                        <div>2. Click "Start" button</div>
                        <div>3. Enable location permissions</div>
                        <div>4. Complete the visit report</div>
                      </div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded">
                      <div className="font-medium mb-2 text-sm">Completing a Visit</div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <div>1. Fill in all required fields</div>
                        <div>2. Add photos if needed</div>
                        <div>3. Submit the report</div>
                        <div>4. Wait for verification</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Phone className="h-5 w-5" />
                      Support
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <div className="font-medium mb-2 text-sm">Need Help?</div>
                      <div className="text-sm text-muted-foreground">
                        Contact your coordinator or supervisor for assistance with:
                      </div>
                      <ul className="text-sm text-muted-foreground mt-3 list-disc list-inside space-y-1">
                        <li>Visit assignments</li>
                        <li>Technical issues</li>
                        <li>Payment questions</li>
                        <li>Report problems</li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

    </div>
  );
};

