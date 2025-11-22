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
import { ZoneHeader } from '../ZoneHeader';

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
      {/* Enterprise Header */}
      <ZoneHeader
        title="Performance & Analytics"
        subtitle="Goals and achievement tracking"
        color="purple"
      >
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">This Month</p>
          <p className="text-2xl font-bold tabular-nums">{thisMonthVisits}</p>
        </div>
      </ZoneHeader>

      {/* Professional Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="achievements" data-testid="tab-achievements">
            Achievements
          </TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity">
            Activity Feed
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
