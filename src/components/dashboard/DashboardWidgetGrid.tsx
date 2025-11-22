import React, { useState, useMemo } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from '@/components/ui/badge';
import { 
  ClipboardList, 
  Users, 
  Calendar, 
  Shield, 
  TrendingUp,
  DollarSign,
  BarChart3
} from 'lucide-react';
import SiteVisitsOverview from './SiteVisitsOverview';
import UpcomingSiteVisitsCard from './UpcomingSiteVisitsCard';
import { TeamCommunication } from './TeamCommunication';
import LiveTeamMapWidget from './LiveTeamMapWidget';
import { MMPOverviewCard } from './MMPOverviewCard';
import ForwardedMMPsCard from './ForwardedMMPsCard';
import FraudDetectionWidget from './FraudDetectionWidget';
import FraudPreventionDashboardWidget from './FraudPreventionDashboardWidget';
import { AchievementTracker } from './AchievementTracker';
import { EnhancedActivityFeed } from './EnhancedActivityFeed';
import { SiteVisitCostSummary } from './SiteVisitCostSummary';
import { DashboardStatsOverview } from './DashboardStatsOverview';
import { CalendarAndVisits } from './CalendarAndVisits';
import { QuickActionButtons } from './QuickActionButtons';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { isAfter, addDays } from 'date-fns';

export const DashboardWidgetGrid: React.FC = () => {
  const [openSections, setOpenSections] = useState<string[]>(['overview', 'operations', 'field-activity']);
  const { siteVisits } = useSiteVisitContext();

  const upcomingVisits = useMemo(() => {
    return siteVisits
      .filter(v => {
        const dueDate = new Date(v.dueDate);
        const today = new Date();
        const twoWeeksFromNow = addDays(today, 14);
        return isAfter(dueDate, today) && isAfter(twoWeeksFromNow, dueDate);
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 5);
  }, [siteVisits]);

  return (
    <div className="space-y-4 p-4 lg:p-6">
      {/* Quick Actions */}
      <QuickActionButtons />

      <Accordion 
        type="multiple" 
        value={openSections} 
        onValueChange={setOpenSections}
        className="space-y-4"
      >
        {/* Overview & Analytics */}
        <AccordionItem value="overview" className="border rounded-lg">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <span className="text-lg font-semibold">Overview & Analytics</span>
              <Badge variant="secondary" className="ml-2">Detailed Metrics</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="mt-4">
              <DashboardStatsOverview />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Operations Section */}
        <AccordionItem value="operations" className="border rounded-lg">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-3">
              <ClipboardList className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <span className="text-lg font-semibold">Field Operations</span>
              <Badge variant="secondary" className="ml-2">
                {siteVisits?.length || 0} Total Visits
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              <div className="lg:col-span-2">
                <SiteVisitsOverview />
              </div>
              <UpcomingSiteVisitsCard siteVisits={upcomingVisits} />
              <CalendarAndVisits />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Field Activity & Team */}
        <AccordionItem value="field-activity" className="border rounded-lg">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              <span className="text-lg font-semibold">Field Activity & Team</span>
              <Badge variant="secondary" className="ml-2">Live</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              <div className="h-[500px]">
                <LiveTeamMapWidget />
              </div>
              <div>
                <TeamCommunication />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Planning & MMPs */}
        <AccordionItem value="planning" className="border rounded-lg">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-green-600 dark:text-green-400" />
              <span className="text-lg font-semibold">Planning & Monitoring Plans</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              <MMPOverviewCard />
              <ForwardedMMPsCard />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Compliance & Risk */}
        <AccordionItem value="compliance" className="border rounded-lg">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <span className="text-lg font-semibold">Compliance & Risk Management</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              <FraudDetectionWidget />
              <FraudPreventionDashboardWidget />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Performance & Achievements */}
        <AccordionItem value="performance" className="border rounded-lg">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <span className="text-lg font-semibold">Performance & Achievements</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              <AchievementTracker />
              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <EnhancedActivityFeed />
                </CardContent>
              </Card>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Financial Overview */}
        <AccordionItem value="financial" className="border rounded-lg">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-3">
              <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-lg font-semibold">Financial Overview</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="grid grid-cols-1 gap-4 mt-4">
              <SiteVisitCostSummary />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};
