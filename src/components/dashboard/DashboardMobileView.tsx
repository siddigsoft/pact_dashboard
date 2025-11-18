import React, { Suspense, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import { useGestures } from '@/hooks/use-gestures';
import { QuickActionButtons } from './QuickActionButtons';
import { EnhancedMoDaCountdown } from './EnhancedMoDaCountdown';
import { AchievementTracker } from './AchievementTracker';
import { MMPStage } from '@/types';
import { Activity, Calendar, Users, Layout, Target } from 'lucide-react';
import { MMPStageIndicator } from '@/components/MMPStageIndicator';
import ForwardedMMPsCard from './ForwardedMMPsCard';
import { useAppContext } from '@/context/AppContext';

const DashboardCalendar = React.lazy(() => 
  import(/* webpackChunkName: "dashboard-calendar" */ '@/components/dashboard/DashboardCalendar')
    .then(module => ({ default: module.DashboardCalendar }))
);

const SiteVisitsOverview = React.lazy(() => import('@/components/dashboard/SiteVisitsOverview'));
const ActivityFeed = React.lazy(() => import('@/components/dashboard/ActivityFeed'));
const DashboardLocationSharingCard = React.lazy(() => import('@/components/DashboardLocationSharingCard'));
const LiveTeamMapWidget = React.lazy(() => import('@/components/dashboard/LiveTeamMapWidget'));

const LoadingCard = () => (
  <Card className="animate-pulse">
    <CardHeader>
      <Skeleton className="h-6 w-24" />
    </CardHeader>
    <CardContent>
      <Skeleton className="h-32 w-full" />
    </CardContent>
  </Card>
);

export const DashboardMobileView = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const { roles } = useAppContext();
  
  useGestures({
    onSwipeLeft: () => {
      if (activeTab === 'overview') setActiveTab('activity');
      else if (activeTab === 'activity') setActiveTab('team');
      else if (activeTab === 'team') setActiveTab('progress');
    },
    onSwipeRight: () => {
      if (activeTab === 'progress') setActiveTab('team');
      else if (activeTab === 'team') setActiveTab('activity');
      else if (activeTab === 'activity') setActiveTab('overview');
    }
  });
  
  const mmpStageProps = {
    stage: 'draft' as MMPStage,
    mmpId: 'mmp-demo',
    lastUpdated: new Date().toISOString()
  };

  const tabContentVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
  };

  return (
    <div className="space-y-4">
      <div className="mb-6 overflow-auto pb-2 -mx-2 px-2">
        <QuickActionButtons />
      </div>
      
      <Tabs 
        defaultValue="overview" 
        value={activeTab} 
        onValueChange={setActiveTab} 
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-4 mb-6 sticky top-0 z-10 bg-background/80 backdrop-blur-sm">
          <TabsTrigger value="overview" className="flex items-center gap-1">
            <Layout className="h-4 w-4" />
            <span className="truncate">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center gap-1">
            <Activity className="h-4 w-4" />
            <span className="truncate">Activity</span>
          </TabsTrigger>
          <TabsTrigger value="team" className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span className="truncate">Team</span>
          </TabsTrigger>
          <TabsTrigger value="progress" className="flex items-center gap-1">
            <Target className="h-4 w-4" />
            <span className="truncate">Goals</span>
          </TabsTrigger>
        </TabsList>

        <div className="scroll-container pb-safe">
          <TabsContent value="overview" className="space-y-4 min-h-[200px] mt-0">
            <motion.div
              key="overview-content"
              variants={tabContentVariants}
              initial="hidden"
              animate="visible"
              className="space-y-4"
            >
              {(roles?.includes('fom' as any) || roles?.includes('fieldOpManager' as any)) && (
                <Suspense fallback={<LoadingCard />}>
                  <ForwardedMMPsCard />
                </Suspense>
              )}
              <Suspense fallback={<LoadingCard />}>
                <EnhancedMoDaCountdown />
              </Suspense>
              
              <Suspense fallback={<LoadingCard />}>
                <Card className="relative transform transition-all duration-200 hover:shadow-md">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-blue-500" />
                      Calendar
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DashboardCalendar />
                  </CardContent>
                </Card>
              </Suspense>
              
              <Suspense fallback={<LoadingCard />}>
                <Card className="transform transition-all duration-200 hover:shadow-md">
                  <CardHeader className="bg-gradient-to-r from-emerald-50 to-transparent">
                    <CardTitle className="flex items-center gap-2">
                      <Layout className="h-4 w-4 text-emerald-500" />
                      Site Visits
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SiteVisitsOverview />
                  </CardContent>
                </Card>
              </Suspense>
            </motion.div>
          </TabsContent>

          <TabsContent value="activity" className="space-y-4 min-h-[200px] mt-0">
            <motion.div
              key="activity-content"
              variants={tabContentVariants}
              initial="hidden"
              animate="visible"
              className="space-y-4"
            >
              <Suspense fallback={<LoadingCard />}>
                <Card className="border-t-4 border-t-emerald-500">
                  <CardHeader className="bg-gradient-to-r from-emerald-50 to-transparent">
                    <CardTitle>Team Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ActivityFeed />
                  </CardContent>
                </Card>
              </Suspense>
              <Suspense fallback={<LoadingCard />}>
                <Card className="border-t-4 border-t-violet-500">
                  <CardHeader className="bg-gradient-to-r from-violet-50 to-transparent">
                    <CardTitle>MMP Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <MMPStageIndicator {...mmpStageProps} />
                  </CardContent>
                </Card>
              </Suspense>
            </motion.div>
          </TabsContent>

          <TabsContent value="team" className="space-y-4 min-h-[200px] mt-0">
            <motion.div
              key="team-content"
              variants={tabContentVariants}
              initial="hidden"
              animate="visible"
              className="space-y-4"
            >
              <Suspense fallback={<LoadingCard />}>
                <Card className="overflow-hidden transform transition-all duration-200 hover:shadow-md border-t-4 border-t-blue-500">
                  <CardHeader className="bg-gradient-to-r from-blue-50 to-transparent">
                    <CardTitle>Team Map</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <LiveTeamMapWidget />
                  </CardContent>
                </Card>
              </Suspense>
              
              <Suspense fallback={<LoadingCard />}>
                <DashboardLocationSharingCard />
              </Suspense>
              
              {/* <Suspense fallback={<LoadingCard />}>
                <Card className="border-t-4 border-t-violet-500">
                  <CardHeader className="bg-gradient-to-r from-violet-50 to-transparent">
                    <CardTitle>Team Communication</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChatIndicatorWidget />
                  </CardContent>
                </Card>
              </Suspense> */}
            </motion.div>
          </TabsContent>
          
          {/* <TabsContent value="progress" className="space-y-4 min-h-[200px] mt-0">
            <motion.div
              key="progress-content"
              variants={tabContentVariants}
              initial="hidden"
              animate="visible"
              className="space-y-4"
            >
              <Suspense fallback={<LoadingCard />}>
                <AchievementTracker />
              </Suspense>
            </motion.div>
          </TabsContent> */}
        </div>
      </Tabs>
    </div>
  );
};
