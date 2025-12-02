import React, { useState, useMemo } from 'react';
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
import { useUserProjects } from '@/hooks/useUserProjects';
import { useMMP } from '@/context/mmp/MMPContext';

export const PlanningZone: React.FC = () => {
  const [activeTab, setActiveTab] = useState('calendar');
  const [showMap, setShowMap] = useState(true);
  const { siteVisits } = useSiteVisitContext();
  const { mmpFiles } = useMMP();
  const { userProjectIds, isAdminOrSuperUser } = useUserProjects();
  const { users } = useAppContext();

  // Project-filtered site visits: filter by user's project membership (admin bypass)
  const filteredSiteVisits = useMemo(() => {
    if (isAdminOrSuperUser) return siteVisits || [];
    
    // Build set of MMP IDs that belong to user's projects
    const userProjectMmpIds = new Set(
      mmpFiles
        .filter(mmp => mmp.projectId && userProjectIds.includes(mmp.projectId))
        .map(mmp => mmp.id)
    );
    
    // Filter site visits by MMP project membership (use mmpDetails.mmpId)
    return (siteVisits || []).filter(visit => {
      const visitMmpId = visit.mmpDetails?.mmpId;
      if (!visitMmpId) return false;
      return userProjectMmpIds.has(visitMmpId);
    });
  }, [siteVisits, mmpFiles, userProjectIds, isAdminOrSuperUser]);

  return (
    <div className="space-y-4">
      {/* Planning Header */}
      <div className="flex items-center justify-between pb-4 border-b">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <Calendar className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Planning & Scheduling</h2>
            <p className="text-xs text-muted-foreground">Strategic field operations planning</p>
          </div>
        </div>
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

          {showMap && <PlanningSiteVisitsMap siteVisits={filteredSiteVisits} teamMembers={users || []} />}
          <PlanningSiteVisitsList siteVisits={filteredSiteVisits} />
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
