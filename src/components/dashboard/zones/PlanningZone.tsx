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
    <div className="min-h-screen bg-background p-3 sm:p-4 md:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Planning Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-purple-500/10 border border-purple-500/20 flex-shrink-0">
            <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold truncate">Planning & Scheduling</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">Strategic field operations planning</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 max-w-3xl h-auto p-1 bg-muted/30 mx-auto">
          <TabsTrigger value="calendar" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm min-h-[44px] sm:min-h-[40px] px-2 py-2 sm:py-1.5">
            <Calendar className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span className="text-xs sm:text-xs">Calendar</span>
          </TabsTrigger>
          <TabsTrigger value="site-visits" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm min-h-[44px] sm:min-h-[40px] px-2 py-2 sm:py-1.5">
            <MapPin className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span className="text-xs sm:text-xs">Site Visits</span>
          </TabsTrigger>
          <TabsTrigger value="mmps" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm min-h-[44px] sm:min-h-[40px] px-2 py-2 sm:py-1.5">
            <FileText className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span className="text-xs sm:text-xs">MMPs</span>
          </TabsTrigger>
          <TabsTrigger value="forwarded" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm min-h-[44px] sm:min-h-[40px] px-2 py-2 sm:py-1.5">
            <Share2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span className="text-xs sm:text-xs">Forwarded</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-4">
          <DashboardCalendar />
        </TabsContent>

        <TabsContent value="site-visits" className="mt-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h3 className="text-lg sm:text-xl font-semibold">Planned Site Visits</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMap(!showMap)}
              data-testid="button-toggle-map"
              className="h-9 px-4 text-xs gap-1.5 active:scale-95 transition-all self-start"
            >
              <MapPin className="h-4 w-4" />
              {showMap ? 'Hide Map' : 'Show Map'}
            </Button>
          </div>

          {showMap && <PlanningSiteVisitsMap siteVisits={siteVisits || []} teamMembers={users || []} />}
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
