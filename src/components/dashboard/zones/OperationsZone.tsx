import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  ClipboardList, 
  Calendar, 
  DollarSign, 
  MapPin, 
  Activity,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  Users,
  Zap,
  Target,
  BarChart3
} from 'lucide-react';
import SiteVisitsOverview from '../SiteVisitsOverview';
import UpcomingSiteVisitsCard from '../UpcomingSiteVisitsCard';
import { SiteVisitCostSummary } from '../SiteVisitCostSummary';
import { DashboardCalendar } from '../DashboardCalendar';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { isAfter, addDays } from 'date-fns';

export const OperationsZone: React.FC = () => {
  const { siteVisits } = useSiteVisitContext();
  const [activeTab, setActiveTab] = useState('overview');

  const upcomingVisits = siteVisits
    .filter(v => {
      const dueDate = new Date(v.dueDate);
      const today = new Date();
      const twoWeeksFromNow = addDays(today, 14);
      return isAfter(dueDate, today) && isAfter(twoWeeksFromNow, dueDate);
    })
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 5);

  // Calculate metrics
  const totalVisits = siteVisits.length;
  const completedVisits = siteVisits.filter(v => v.status === 'completed').length;
  const pendingVisits = siteVisits.filter(v => v.status === 'pending' || v.status === 'permitVerified').length;
  const assignedVisits = siteVisits.filter(v => v.status === 'assigned' || v.status === 'inProgress').length;
  const overdueVisits = siteVisits.filter(v => {
    const dueDate = new Date(v.dueDate);
    const today = new Date();
    return dueDate < today && v.status !== 'completed';
  }).length;
  const completionRate = totalVisits > 0 ? Math.round((completedVisits / totalVisits) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* Compact IT-Style Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
        {/* Total Operations Card */}
        <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-background hover-elevate">
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Activity className="h-3 w-3 text-primary" />
                  </div>
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold truncate">Total</span>
                </div>
                <p className="text-2xl font-bold text-primary tabular-nums leading-none">{totalVisits}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Operations</p>
              </div>
              <div className="h-full flex items-end">
                <Badge variant="outline" className="text-[8px] px-1 py-0 h-4">ALL</Badge>
              </div>
            </div>
            <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          </CardContent>
        </Card>

        {/* Completed Card */}
        <Card className="relative overflow-hidden border-green-500/20 bg-gradient-to-br from-green-500/10 via-green-500/5 to-background hover-elevate">
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-6 h-6 rounded bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
                  </div>
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold truncate">Done</span>
                </div>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400 tabular-nums leading-none">{completedVisits}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{completionRate}% Rate</p>
              </div>
              <div className="h-full flex items-end">
                <TrendingUp className="h-3 w-3 text-green-600/50 dark:text-green-400/50" />
              </div>
            </div>
            <Progress value={completionRate} className="h-1 mt-2" />
          </CardContent>
        </Card>

        {/* Assigned Card */}
        <Card className="relative overflow-hidden border-blue-500/20 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-background hover-elevate">
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-6 h-6 rounded bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <Users className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold truncate">Active</span>
                </div>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 tabular-nums leading-none">{assignedVisits}</p>
                <p className="text-[10px] text-muted-foreground mt-1">In Progress</p>
              </div>
              <div className="h-full flex items-end">
                <Zap className="h-3 w-3 text-blue-600/50 dark:text-blue-400/50 animate-pulse" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pending Card */}
        <Card className="relative overflow-hidden border-orange-500/20 bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-background hover-elevate">
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-6 h-6 rounded bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                    <Clock className="h-3 w-3 text-orange-600 dark:text-orange-400" />
                  </div>
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold truncate">Queue</span>
                </div>
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 tabular-nums leading-none">{pendingVisits}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Awaiting</p>
              </div>
              <div className="h-full flex items-end">
                <Target className="h-3 w-3 text-orange-600/50 dark:text-orange-400/50" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Overdue Card */}
        <Card className="relative overflow-hidden border-red-500/20 bg-gradient-to-br from-red-500/10 via-red-500/5 to-background hover-elevate">
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-6 h-6 rounded bg-red-500/20 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="h-3 w-3 text-red-600 dark:text-red-400" />
                  </div>
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold truncate">Alert</span>
                </div>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums leading-none">{overdueVisits}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Overdue</p>
              </div>
              <div className="h-full flex items-end">
                {overdueVisits > 0 && (
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Performance Card */}
        <Card className="relative overflow-hidden border-purple-500/20 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-background hover-elevate">
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-6 h-6 rounded bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <BarChart3 className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                  </div>
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold truncate">Score</span>
                </div>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 tabular-nums leading-none">{completionRate}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Efficiency</p>
              </div>
              <div className="h-full flex items-end">
                <Badge 
                  variant={completionRate >= 75 ? "default" : "secondary"} 
                  className="text-[8px] px-1 py-0 h-4"
                >
                  {completionRate >= 75 ? "HIGH" : completionRate >= 50 ? "MED" : "LOW"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* IT-Style Tab Navigation */}
      <Card className="border-border/50 bg-gradient-to-r from-muted/30 via-background to-muted/30">
        <CardContent className="p-2">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 h-auto p-0.5 bg-transparent border border-border/30">
              <TabsTrigger 
                value="overview" 
                className="gap-1 px-2 py-1.5 data-[state=active]:bg-primary/10 data-[state=active]:border-primary/20 data-[state=active]:shadow-sm border border-transparent"
                data-testid="tab-overview"
              >
                <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center">
                  <ClipboardList className="h-3 w-3 text-primary" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide">Overview</span>
              </TabsTrigger>
              <TabsTrigger 
                value="upcoming" 
                className="gap-1 px-2 py-1.5 data-[state=active]:bg-blue-500/10 data-[state=active]:border-blue-500/20 data-[state=active]:shadow-sm border border-transparent"
                data-testid="tab-upcoming"
              >
                <div className="w-5 h-5 rounded bg-blue-500/10 flex items-center justify-center">
                  <Calendar className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide">Upcoming</span>
              </TabsTrigger>
              <TabsTrigger 
                value="calendar" 
                className="gap-1 px-2 py-1.5 data-[state=active]:bg-green-500/10 data-[state=active]:border-green-500/20 data-[state=active]:shadow-sm border border-transparent"
                data-testid="tab-calendar"
              >
                <div className="w-5 h-5 rounded bg-green-500/10 flex items-center justify-center">
                  <MapPin className="h-3 w-3 text-green-600 dark:text-green-400" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide">Calendar</span>
              </TabsTrigger>
              <TabsTrigger 
                value="costs" 
                className="gap-1 px-2 py-1.5 data-[state=active]:bg-orange-500/10 data-[state=active]:border-orange-500/20 data-[state=active]:shadow-sm border border-transparent"
                data-testid="tab-costs"
              >
                <div className="w-5 h-5 rounded bg-orange-500/10 flex items-center justify-center">
                  <DollarSign className="h-3 w-3 text-orange-600 dark:text-orange-400" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide">Costs</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-3 space-y-3">
              <SiteVisitsOverview />
            </TabsContent>

            <TabsContent value="upcoming" className="mt-3">
              <UpcomingSiteVisitsCard siteVisits={upcomingVisits} />
            </TabsContent>

            <TabsContent value="calendar" className="mt-3">
              <DashboardCalendar />
            </TabsContent>

            <TabsContent value="costs" className="mt-3">
              <SiteVisitCostSummary />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
