import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, Trophy, Activity, DollarSign } from 'lucide-react';
import { AchievementTracker } from '../AchievementTracker';
import { EnhancedActivityFeed } from '../EnhancedActivityFeed';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAppContext } from '@/context/AppContext';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { startOfMonth } from 'date-fns';

export const PerformanceZone: React.FC = () => {
  const [activeTab, setActiveTab] = useState('achievements');
  const { roles } = useAppContext();
  const { siteVisits } = useSiteVisitContext();

  const isFinanceOrAdmin = roles?.some(r => r.toLowerCase() === 'admin' || r.toLowerCase() === 'financialadmin');

  const thisMonthVisits = siteVisits?.filter(v => {
    const visitDate = v.completedAt ? new Date(v.completedAt) : null;
    return visitDate && visitDate >= startOfMonth(new Date());
  }).length || 0;

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4 md:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Modern Tech Header */}
      <div className="relative overflow-hidden rounded-lg border border-border/50 bg-gradient-to-r from-purple-500/5 via-pink-500/5 to-background p-4 shadow-sm">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-purple-500/10 border border-purple-500/20 flex-shrink-0">
              <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold truncate">Performance & Analytics</h2>
              <p className="text-xs sm:text-sm text-muted-foreground uppercase tracking-wide">Goals, achievements, and activity tracking</p>
            </div>
          </div>
          <Badge variant="secondary" className="gap-2 h-8 px-3 text-xs self-start">
            <Trophy className="h-3 w-3" />
            {thisMonthVisits} This Month
          </Badge>
        </div>
        <div className="absolute inset-0 bg-grid-pattern opacity-5" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto h-auto p-1 bg-muted/30">
          <TabsTrigger value="achievements" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm min-h-[44px] sm:min-h-[40px] px-3 py-2 sm:py-1.5">
            <Trophy className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span className="text-xs sm:text-xs">Achievements</span>
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm min-h-[44px] sm:min-h-[40px] px-3 py-2 sm:py-1.5">
            <Activity className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span className="text-xs sm:text-xs">Activity Feed</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="achievements" className="mt-4">
          <AchievementTracker />
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <EnhancedActivityFeed />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
