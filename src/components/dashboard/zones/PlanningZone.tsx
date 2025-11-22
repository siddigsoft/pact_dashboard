import React, { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, FileText, FolderOpen, Share2, MapPin, Clock, AlertCircle, TrendingUp } from 'lucide-react';
import { DashboardCalendar } from '../DashboardCalendar';
import { MMPOverviewCard } from '../MMPOverviewCard';
import ForwardedMMPsCard from '../ForwardedMMPsCard';
import PlanningSiteVisitsMap from '../PlanningSiteVisitsMap';
import PlanningSiteVisitsList from '../PlanningSiteVisitsList';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useProjectContext } from '@/context/project/ProjectContext';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { Badge } from '@/components/ui/badge';
import { isWithinInterval, addDays, format, isPast } from 'date-fns';

export const PlanningZone: React.FC = () => {
  const [activeTab, setActiveTab] = useState('calendar');
  const [showMap, setShowMap] = useState(true);
  const navigate = useNavigate();
  const { projects } = useProjectContext();
  const { siteVisits } = useSiteVisitContext();

  const activeProjects = projects?.filter(p => p.status === 'active').length || 0;

  // Planning metrics calculations
  const planningMetrics = useMemo(() => {
    if (!siteVisits) return {
      totalPlanned: 0,
      upcoming7Days: 0,
      upcoming30Days: 0,
      overdue: 0,
      pendingVisits: 0,
    };

    const now = new Date();
    now.setHours(0, 0, 0, 0); // Start of today
    const plannedVisits = siteVisits.filter(v => v.status !== 'completed' && v.status !== 'cancelled');
    
    return {
      totalPlanned: plannedVisits.length,
      upcoming7Days: plannedVisits.filter(v => {
        if (!v.scheduledDate) return false;
        const schedDate = new Date(v.scheduledDate);
        schedDate.setHours(0, 0, 0, 0);
        return schedDate >= now && isWithinInterval(schedDate, { start: now, end: addDays(now, 7) });
      }).length,
      upcoming30Days: plannedVisits.filter(v => {
        if (!v.scheduledDate) return false;
        const schedDate = new Date(v.scheduledDate);
        schedDate.setHours(0, 0, 0, 0);
        return schedDate >= now && isWithinInterval(schedDate, { start: now, end: addDays(now, 30) });
      }).length,
      overdue: plannedVisits.filter(v => {
        if (!v.scheduledDate) return false;
        const schedDate = new Date(v.scheduledDate);
        schedDate.setHours(0, 0, 0, 0);
        return schedDate < now;
      }).length,
      pendingVisits: siteVisits.filter(v => v.status === 'pending').length,
    };
  }, [siteVisits]);

  // Get next monitoring dates
  const nextMonitoringDates = useMemo(() => {
    if (!siteVisits) return [];
    const now = new Date();
    return siteVisits
      .filter(v => v.scheduledDate && new Date(v.scheduledDate) > now && v.status !== 'completed')
      .sort((a, b) => new Date(a.scheduledDate!).getTime() - new Date(b.scheduledDate!).getTime())
      .slice(0, 5)
      .map(v => ({
        date: format(new Date(v.scheduledDate!), 'MMM dd, yyyy'),
        siteName: v.siteName,
        priority: v.priority,
      }));
  }, [siteVisits]);

  return (
    <div className="space-y-4">
      {/* Modern Tech Header with Planning Metrics */}
      <div className="relative overflow-hidden rounded-lg border border-border/50 bg-gradient-to-r from-purple-500/5 via-blue-500/5 to-background p-4 shadow-sm">
        <div className="relative z-10 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <Calendar className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Planning & Scheduling</h2>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Strategic planning and monitoring coordination</p>
              </div>
            </div>
            <Badge variant="secondary" className="gap-2 text-xs h-7">
              <TrendingUp className="h-3 w-3" />
              {activeProjects} Active Projects
            </Badge>
          </div>

          {/* Planning Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Planned</p>
                    <p className="text-2xl font-bold tabular-nums mt-1">{planningMetrics.totalPlanned}</p>
                  </div>
                  <MapPin className="h-8 w-8 text-blue-500/50" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Next 7 Days</p>
                    <p className="text-2xl font-bold tabular-nums mt-1">{planningMetrics.upcoming7Days}</p>
                  </div>
                  <Clock className="h-8 w-8 text-green-500/50" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border-cyan-500/20">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Next 30 Days</p>
                    <p className="text-2xl font-bold tabular-nums mt-1">{planningMetrics.upcoming30Days}</p>
                  </div>
                  <Calendar className="h-8 w-8 text-cyan-500/50" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Overdue</p>
                    <p className="text-2xl font-bold tabular-nums mt-1">{planningMetrics.overdue}</p>
                  </div>
                  <AlertCircle className="h-8 w-8 text-red-500/50" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Pending</p>
                    <p className="text-2xl font-bold tabular-nums mt-1">{planningMetrics.pendingVisits}</p>
                  </div>
                  <FileText className="h-8 w-8 text-orange-500/50" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Next Monitoring Dates */}
          {nextMonitoringDates.length > 0 && (
            <Card className="bg-muted/30 border-border/50">
              <CardContent className="p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Upcoming Monitoring Dates
                </h4>
                <div className="flex gap-2 flex-wrap">
                  {nextMonitoringDates.map((item, idx) => (
                    <Badge 
                      key={idx} 
                      variant="outline" 
                      className={`text-xs gap-1.5 ${
                        item.priority === 'high' ? 'border-red-500/50 bg-red-500/5' :
                        item.priority === 'medium' ? 'border-yellow-500/50 bg-yellow-500/5' :
                        'border-border bg-background'
                      }`}
                    >
                      <Calendar className="h-3 w-3" />
                      {item.date}
                      <span className="opacity-60">•</span>
                      {item.siteName}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        <div className="absolute inset-0 bg-grid-pattern opacity-5" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-3xl h-auto p-1 bg-muted/30">
          <TabsTrigger value="calendar" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Calendar className="h-3.5 w-3.5" />
            <span className="text-xs">Calendar</span>
          </TabsTrigger>
          <TabsTrigger value="site-visits" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <MapPin className="h-3.5 w-3.5" />
            <span className="text-xs">Site Visits</span>
          </TabsTrigger>
          <TabsTrigger value="mmps" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <FileText className="h-3.5 w-3.5" />
            <span className="text-xs">MMPs</span>
          </TabsTrigger>
          <TabsTrigger value="forwarded" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Share2 className="h-3.5 w-3.5" />
            <span className="text-xs">Forwarded</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-4">
          <DashboardCalendar />
        </TabsContent>

        <TabsContent value="site-visits" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Planned Site Visits</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMap(!showMap)}
              data-testid="button-toggle-map"
              className="h-8 text-xs gap-1.5"
            >
              <MapPin className="h-3.5 w-3.5" />
              {showMap ? 'Hide Map' : 'Show Map'}
            </Button>
          </div>

          {showMap && <PlanningSiteVisitsMap siteVisits={siteVisits || []} />}
          <PlanningSiteVisitsList siteVisits={siteVisits || []} />
        </TabsContent>

        <TabsContent value="mmps" className="mt-4">
          <MMPOverviewCard />
        </TabsContent>

        <TabsContent value="forwarded" className="mt-4">
          <ForwardedMMPsCard />
        </TabsContent>
      </Tabs>
    </div>
  );
};
