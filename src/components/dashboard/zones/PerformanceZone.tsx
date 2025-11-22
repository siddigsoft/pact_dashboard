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
    <div className="space-y-3">
      {/* Professional Tech Header */}
      <div className="relative overflow-hidden rounded-lg border border-border/50 bg-gradient-to-r from-purple-500/5 via-indigo-500/5 to-background p-3 shadow-sm">
        <div className="relative z-10 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-11 h-11 rounded-lg bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/30 shadow-sm">
              <TrendingUp className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Performance & Analytics</h2>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Goals & Achievement Tracking</p>
            </div>
          </div>
          <Badge variant="secondary" className="gap-2 h-7 text-xs px-3 tabular-nums">
            <Trophy className="h-3 w-3" />
            {thisMonthVisits} This Month
          </Badge>
        </div>
        <div className="absolute inset-0 bg-grid-pattern opacity-5" />
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-500/10 to-transparent rounded-full blur-2xl" />
      </div>

      {/* Modern Tab System */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-auto p-0.5 bg-gradient-to-r from-muted/30 via-background to-muted/30 border border-border/30">
          <TabsTrigger 
            value="achievements" 
            className="gap-1.5 px-3 py-2 data-[state=active]:bg-purple-500/10 data-[state=active]:border-purple-500/20 data-[state=active]:shadow-sm border border-transparent"
            data-testid="tab-achievements"
          >
            <div className="w-5 h-5 rounded bg-purple-500/10 flex items-center justify-center">
              <Trophy className="h-3 w-3 text-purple-600 dark:text-purple-400" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wide">Achievements</span>
          </TabsTrigger>
          <TabsTrigger 
            value="activity" 
            className="gap-1.5 px-3 py-2 data-[state=active]:bg-blue-500/10 data-[state=active]:border-blue-500/20 data-[state=active]:shadow-sm border border-transparent"
            data-testid="tab-activity"
          >
            <div className="w-5 h-5 rounded bg-blue-500/10 flex items-center justify-center">
              <Activity className="h-3 w-3 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wide">Activity Feed</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="achievements" className="mt-3">
          <AchievementTracker />
        </TabsContent>

        <TabsContent value="activity" className="mt-3">
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
