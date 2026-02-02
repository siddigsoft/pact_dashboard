import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { 
  Target, 
  TrendingUp, 
  TrendingDown, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  MapPin,
  DollarSign,
  Users,
  FileText
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import { cn } from '@/lib/utils';
import type { MMPFile } from '@/types';

interface SiteVisit {
  id: string;
  status: string;
  dueDate?: string;
  completedAt?: string;
  fees?: { total?: number };
  mmpDetails?: { mmpId?: string };
  siteName?: string;
  assignedTo?: string;
  state?: string;
  locality?: string;
}

interface MMPPerformanceCardProps {
  mmp: MMPFile;
  siteVisits: SiteVisit[];
  className?: string;
}

interface PerformanceMetrics {
  totalPlanned: number;
  completed: number;
  inProgress: number;
  pending: number;
  overdue: number;
  completionRate: number;
  totalBudget: number;
  spentAmount: number;
  budgetUtilization: number;
  averageCompletionTime: number;
  sitesByState: Record<string, number>;
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

export const MMPPerformanceCard: React.FC<MMPPerformanceCardProps> = ({
  mmp,
  siteVisits,
  className,
}) => {
  const mmpVisits = useMemo(() => {
    return siteVisits.filter(visit => visit.mmpDetails?.mmpId === mmp.id);
  }, [siteVisits, mmp.id]);

  const metrics: PerformanceMetrics = useMemo(() => {
    const now = new Date();
    
    const completed = mmpVisits.filter(v => v.status === 'completed');
    const inProgress = mmpVisits.filter(v => 
      ['assigned', 'inProgress'].includes(v.status)
    );
    const pending = mmpVisits.filter(v => v.status === 'pending');
    const overdue = mmpVisits.filter(v => {
      if (v.status === 'completed') return false;
      if (!v.dueDate) return false;
      return new Date(v.dueDate) < now;
    });

    const totalBudget = mmp.financial?.budgetAllocation || 
      (mmpVisits.length * 50000);
    const spentAmount = mmpVisits.reduce((sum, v) => 
      sum + (v.fees?.total || 0), 0
    );

    const sitesByState: Record<string, number> = {};
    mmpVisits.forEach(visit => {
      const state = visit.state || 'Unknown';
      sitesByState[state] = (sitesByState[state] || 0) + 1;
    });

    return {
      totalPlanned: mmpVisits.length,
      completed: completed.length,
      inProgress: inProgress.length,
      pending: pending.length,
      overdue: overdue.length,
      completionRate: mmpVisits.length > 0 
        ? Math.round((completed.length / mmpVisits.length) * 100)
        : 0,
      totalBudget,
      spentAmount,
      budgetUtilization: totalBudget > 0 
        ? Math.round((spentAmount / totalBudget) * 100)
        : 0,
      averageCompletionTime: 0,
      sitesByState,
    };
  }, [mmpVisits, mmp]);

  const statusData = [
    { name: 'Completed', value: metrics.completed, color: COLORS[0] },
    { name: 'In Progress', value: metrics.inProgress, color: COLORS[1] },
    { name: 'Pending', value: metrics.pending, color: COLORS[2] },
    { name: 'Overdue', value: metrics.overdue, color: COLORS[3] },
  ].filter(d => d.value > 0);

  const getVersionDisplay = () => {
    if (mmp.version) {
      return `v${mmp.version.major}.${mmp.version.minor}`;
    }
    return 'v1.0';
  };

  const getClassificationBadge = () => {
    const classification = mmp.classification || 'original';
    const colors: Record<string, string> = {
      original: 'bg-blue-100 text-blue-800',
      revised: 'bg-amber-100 text-amber-800',
      additional: 'bg-green-100 text-green-800',
      supplementary: 'bg-purple-100 text-purple-800',
    };
    return (
      <Badge variant="outline" className={colors[classification]}>
        {classification}
      </Badge>
    );
  };

  return (
    <Card className={className} data-testid="mmp-performance-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">{mmp.name}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{getVersionDisplay()}</Badge>
            {getClassificationBadge()}
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
          {mmp.hub && <span>Hub: {mmp.hub}</span>}
          {mmp.region && <span>Region: {mmp.region}</span>}
          {mmp.month && mmp.year && (
            <span>Period: {mmp.month}/{mmp.year}</span>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="visits" data-testid="tab-visits">Site Visits</TabsTrigger>
            <TabsTrigger value="financial" data-testid="tab-financial">Financial</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 text-center">
                <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto mb-1" />
                <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                  {metrics.completed}
                </div>
                <div className="text-xs text-green-600">Completed</div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-center">
                <Clock className="h-5 w-5 text-blue-600 mx-auto mb-1" />
                <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                  {metrics.inProgress}
                </div>
                <div className="text-xs text-blue-600">In Progress</div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 text-center">
                <FileText className="h-5 w-5 text-amber-600 mx-auto mb-1" />
                <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                  {metrics.pending}
                </div>
                <div className="text-xs text-amber-600">Pending</div>
              </div>

              <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3 text-center">
                <AlertTriangle className="h-5 w-5 text-red-600 mx-auto mb-1" />
                <div className="text-2xl font-bold text-red-700 dark:text-red-400">
                  {metrics.overdue}
                </div>
                <div className="text-xs text-red-600">Overdue</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-medium mb-3">Completion Progress</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Overall Completion</span>
                    <span className="text-sm font-medium">{metrics.completionRate}%</span>
                  </div>
                  <Progress value={metrics.completionRate} className="h-3" />
                  <p className="text-xs text-muted-foreground">
                    {metrics.completed} of {metrics.totalPlanned} site visits completed
                  </p>
                </div>
              </div>

              {statusData.length > 0 && (
                <div className="h-[150px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={55}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend 
                        iconSize={8}
                        wrapperStyle={{ fontSize: '11px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="visits" className="mt-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Sites by State/Region</h4>
                <Badge variant="outline">
                  {Object.keys(metrics.sitesByState).length} states
                </Badge>
              </div>

              <ScrollArea className="h-[200px]">
                <div className="space-y-2">
                  {Object.entries(metrics.sitesByState)
                    .sort(([, a], [, b]) => b - a)
                    .map(([state, count]) => (
                      <div 
                        key={state}
                        className="flex items-center justify-between p-2 bg-muted/30 rounded-md"
                      >
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{state}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{count}</span>
                          <span className="text-xs text-muted-foreground">
                            sites
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </ScrollArea>

              {metrics.overdue > 0 && (
                <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-lg">
                  <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      {metrics.overdue} overdue visits require attention
                    </span>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="financial" className="mt-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Total Budget
                    </span>
                  </div>
                  <div className="text-xl font-bold">
                    {metrics.totalBudget.toLocaleString()} SDG
                  </div>
                </div>

                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Amount Spent
                    </span>
                  </div>
                  <div className="text-xl font-bold">
                    {metrics.spentAmount.toLocaleString()} SDG
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm">Budget Utilization</span>
                  <span className="text-sm font-medium">
                    {metrics.budgetUtilization}%
                  </span>
                </div>
                <Progress 
                  value={metrics.budgetUtilization} 
                  className={cn(
                    "h-3",
                    metrics.budgetUtilization > 90 && "bg-red-200"
                  )}
                />
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-muted-foreground">
                    Remaining: {(metrics.totalBudget - metrics.spentAmount).toLocaleString()} SDG
                  </span>
                  {metrics.budgetUtilization > 80 && (
                    <span className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Budget alert
                    </span>
                  )}
                </div>
              </div>

              <div className="p-3 bg-muted/30 rounded-lg">
                <h4 className="text-sm font-medium mb-2">Cost per Visit</h4>
                <div className="text-lg font-bold">
                  {metrics.completed > 0 
                    ? Math.round(metrics.spentAmount / metrics.completed).toLocaleString()
                    : 0} SDG
                </div>
                <p className="text-xs text-muted-foreground">
                  Average cost per completed site visit
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default MMPPerformanceCard;
