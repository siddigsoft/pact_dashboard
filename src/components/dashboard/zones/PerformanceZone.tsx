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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            Performance & Analytics
          </h2>
          <p className="text-sm text-muted-foreground">Goals, achievements, and activity tracking</p>
        </div>
        <Badge variant="secondary" className="gap-2">
          <Trophy className="h-3 w-3" />
          {thisMonthVisits} This Month
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="achievements" className="gap-2">
            <Trophy className="h-4 w-4" />
            Achievements
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <Activity className="h-4 w-4" />
            Activity Feed
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
