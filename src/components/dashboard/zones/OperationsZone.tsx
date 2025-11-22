import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClipboardList, Calendar, DollarSign, MapPin } from 'lucide-react';
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

  return (
    <div className="space-y-4">
      {/* Modern Tech Header */}
      <div className="relative overflow-hidden rounded-lg border border-border/50 bg-gradient-to-r from-primary/5 via-blue-500/5 to-background p-4 shadow-sm">
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 border border-primary/20">
              <ClipboardList className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Operations Command</h2>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Daily field operations management</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right hidden lg:block">
              <p className="text-xs text-muted-foreground">Active Visits</p>
              <p className="text-2xl font-bold text-primary tabular-nums">{siteVisits.length}</p>
            </div>
          </div>
        </div>
        <div className="absolute inset-0 bg-grid-pattern opacity-5" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl h-auto p-1 bg-muted/30">
          <TabsTrigger value="overview" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <ClipboardList className="h-3.5 w-3.5" />
            <span className="text-xs">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Calendar className="h-3.5 w-3.5" />
            <span className="text-xs">Upcoming</span>
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <MapPin className="h-3.5 w-3.5" />
            <span className="text-xs">Calendar</span>
          </TabsTrigger>
          <TabsTrigger value="costs" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <DollarSign className="h-3.5 w-3.5" />
            <span className="text-xs">Costs</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <SiteVisitsOverview />
        </TabsContent>

        <TabsContent value="upcoming" className="mt-4">
          <UpcomingSiteVisitsCard siteVisits={upcomingVisits} />
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <DashboardCalendar />
        </TabsContent>

        <TabsContent value="costs" className="mt-4">
          <SiteVisitCostSummary />
        </TabsContent>
      </Tabs>
    </div>
  );
};
