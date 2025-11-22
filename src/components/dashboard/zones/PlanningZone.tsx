import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, FileText, Share2, MapPin } from 'lucide-react';
import { DashboardCalendar } from '../DashboardCalendar';
import { MMPOverviewCard } from '../MMPOverviewCard';
import ForwardedMMPsCard from '../ForwardedMMPsCard';
import PlanningSiteVisitsMap from '../PlanningSiteVisitsMap';
import PlanningSiteVisitsList from '../PlanningSiteVisitsList';
import { Button } from '@/components/ui/button';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { useAppContext } from '@/context/AppContext';

export const PlanningZone: React.FC = () => {
  const [activeTab, setActiveTab] = useState('calendar');
  const [showMap, setShowMap] = useState(true);
  const { siteVisits } = useSiteVisitContext();
  const { users } = useAppContext();

  return (
    <div className="space-y-3">
      {/* Professional Tech Header */}
      <div className="relative overflow-hidden rounded-lg border border-border/50 bg-gradient-to-r from-purple-500/5 via-indigo-500/5 to-background p-3 shadow-sm">
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex items-center justify-center w-11 h-11 rounded-lg bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/30 shadow-sm">
            <Calendar className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Planning & Scheduling</h2>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Strategic Operations Management</p>
          </div>
        </div>
        <div className="absolute inset-0 bg-grid-pattern opacity-5" />
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-500/10 to-transparent rounded-full blur-2xl" />
      </div>

      {/* Modern Tab System */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-auto p-0.5 bg-gradient-to-r from-muted/30 via-background to-muted/30 border border-border/30">
          <TabsTrigger 
            value="calendar" 
            className="gap-1.5 px-3 py-2 data-[state=active]:bg-purple-500/10 data-[state=active]:border-purple-500/20 data-[state=active]:shadow-sm border border-transparent"
            data-testid="tab-calendar"
          >
            <div className="w-5 h-5 rounded bg-purple-500/10 flex items-center justify-center">
              <Calendar className="h-3 w-3 text-purple-600 dark:text-purple-400" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wide">Calendar</span>
          </TabsTrigger>
          <TabsTrigger 
            value="site-visits" 
            className="gap-1.5 px-3 py-2 data-[state=active]:bg-blue-500/10 data-[state=active]:border-blue-500/20 data-[state=active]:shadow-sm border border-transparent"
            data-testid="tab-site-visits"
          >
            <div className="w-5 h-5 rounded bg-blue-500/10 flex items-center justify-center">
              <MapPin className="h-3 w-3 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wide">Site Visits</span>
          </TabsTrigger>
          <TabsTrigger 
            value="mmps" 
            className="gap-1.5 px-3 py-2 data-[state=active]:bg-green-500/10 data-[state=active]:border-green-500/20 data-[state=active]:shadow-sm border border-transparent"
            data-testid="tab-mmps"
          >
            <div className="w-5 h-5 rounded bg-green-500/10 flex items-center justify-center">
              <FileText className="h-3 w-3 text-green-600 dark:text-green-400" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wide">MMPs</span>
          </TabsTrigger>
          <TabsTrigger 
            value="forwarded" 
            className="gap-1.5 px-3 py-2 data-[state=active]:bg-orange-500/10 data-[state=active]:border-orange-500/20 data-[state=active]:shadow-sm border border-transparent"
            data-testid="tab-forwarded"
          >
            <div className="w-5 h-5 rounded bg-orange-500/10 flex items-center justify-center">
              <Share2 className="h-3 w-3 text-orange-600 dark:text-orange-400" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wide">Forwarded</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-3">
          <DashboardCalendar />
        </TabsContent>

        <TabsContent value="site-visits" className="mt-3 space-y-3">
          <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <h3 className="text-sm font-bold uppercase tracking-wide">Planned Site Visits</h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMap(!showMap)}
              data-testid="button-toggle-map"
              className="h-7 text-xs gap-1.5"
            >
              <MapPin className="h-3.5 w-3.5" />
              {showMap ? 'Hide Map' : 'Show Map'}
            </Button>
          </div>

          {showMap && <PlanningSiteVisitsMap siteVisits={siteVisits || []} teamMembers={users || []} />}
          <PlanningSiteVisitsList siteVisits={siteVisits || []} />
        </TabsContent>

        <TabsContent value="mmps" className="mt-3">
          <MMPOverviewCard />
        </TabsContent>

        <TabsContent value="forwarded" className="mt-3">
          <ForwardedMMPsCard />
        </TabsContent>
      </Tabs>
    </div>
  );
};
