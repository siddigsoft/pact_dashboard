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
import { ZoneHeader } from '../ZoneHeader';

export const PlanningZone: React.FC = () => {
  const [activeTab, setActiveTab] = useState('calendar');
  const [showMap, setShowMap] = useState(true);
  const { siteVisits } = useSiteVisitContext();
  const { users } = useAppContext();

  return (
    <div className="space-y-4">
      {/* Enterprise Header */}
      <ZoneHeader
        title="Planning & Scheduling"
        subtitle="Strategic operations management and planning"
        color="purple"
      />

      {/* Professional Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="calendar" data-testid="tab-calendar">
            Calendar
          </TabsTrigger>
          <TabsTrigger value="site-visits" data-testid="tab-site-visits">
            Site Visits
          </TabsTrigger>
          <TabsTrigger value="mmps" data-testid="tab-mmps">
            MMPs
          </TabsTrigger>
          <TabsTrigger value="forwarded" data-testid="tab-forwarded">
            Forwarded
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
