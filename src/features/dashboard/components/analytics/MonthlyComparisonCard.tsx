import React, { useMemo } from 'react';
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { TrendingUp, TrendingDown, Minus, ArrowRight, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
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
}

interface MonthlyComparisonCardProps {
  mmpFiles: MMPFile[];
  siteVisits: SiteVisit[];
  currentMonth?: Date;
  className?: string;
}

interface MonthlyStats {
  month: string;
  monthLabel: string;
  totalMmps: number;
  approvedMmps: number;
  totalVisits: number;
  completedVisits: number;
  pendingVisits: number;
  completionRate: number;
  totalCost: number;
}

export const MonthlyComparisonCard: React.FC<MonthlyComparisonCardProps> = ({
  mmpFiles,
  siteVisits,
  currentMonth = new Date(),
  className,
}) => {
  const monthlyStats = useMemo(() => {
    const stats: MonthlyStats[] = [];
    
    for (let i = 0; i < 6; i++) {
      const monthDate = subMonths(currentMonth, i);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      const monthKey = format(monthDate, 'yyyy-MM');
      
      const monthMmps = mmpFiles.filter(mmp => {
        if (mmp.periodKey) return mmp.periodKey === monthKey;
        if (mmp.year && mmp.month) {
          return `${mmp.year}-${mmp.month.padStart(2, '0')}` === monthKey;
        }
        if (mmp.uploadedAt) {
          const uploadDate = new Date(mmp.uploadedAt);
          return isWithinInterval(uploadDate, { start: monthStart, end: monthEnd });
        }
        return false;
      });
      
      const monthVisits = siteVisits.filter(visit => {
        if (!visit.dueDate) return false;
        const visitDate = new Date(visit.dueDate);
        return isWithinInterval(visitDate, { start: monthStart, end: monthEnd });
      });
      
      const completedVisits = monthVisits.filter(v => v.status === 'completed');
      const pendingVisits = monthVisits.filter(v => 
        ['pending', 'assigned', 'inProgress'].includes(v.status)
      );
      
      stats.push({
        month: monthKey,
        monthLabel: format(monthDate, 'MMM yyyy'),
        totalMmps: monthMmps.length,
        approvedMmps: monthMmps.filter(m => m.status === 'approved').length,
        totalVisits: monthVisits.length,
        completedVisits: completedVisits.length,
        pendingVisits: pendingVisits.length,
        completionRate: monthVisits.length > 0 
          ? Math.round((completedVisits.length / monthVisits.length) * 100)
          : 0,
        totalCost: monthVisits.reduce((sum, v) => sum + (v.fees?.total || 0), 0),
      });
    }
    
    return stats.reverse();
  }, [mmpFiles, siteVisits, currentMonth]);

  const currentMonthStats = monthlyStats[monthlyStats.length - 1];
  const previousMonthStats = monthlyStats[monthlyStats.length - 2];

  const getChangeIndicator = (current: number, previous: number) => {
    if (!previous || previous === 0) return { icon: Minus, color: 'text-gray-500', change: 0 };
    const change = Math.round(((current - previous) / previous) * 100);
    if (change > 0) return { icon: TrendingUp, color: 'text-green-500', change };
    if (change < 0) return { icon: TrendingDown, color: 'text-red-500', change };
    return { icon: Minus, color: 'text-gray-500', change: 0 };
  };

  const visitsChange = getChangeIndicator(
    currentMonthStats?.completedVisits || 0,
    previousMonthStats?.completedVisits || 0
  );

  const completionChange = getChangeIndicator(
    currentMonthStats?.completionRate || 0,
    previousMonthStats?.completionRate || 0
  );

  const chartData = monthlyStats.map(stat => ({
    name: stat.monthLabel,
    'Completed Visits': stat.completedVisits,
    'Pending Visits': stat.pendingVisits,
    'MMPs': stat.totalMmps,
  }));

  return (
    <Card className={className} data-testid="monthly-comparison-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Monthly Comparison
          </CardTitle>
          <Badge variant="outline">Last 6 Months</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Completed Visits</span>
              <div className={cn("flex items-center gap-1", visitsChange.color)}>
                <visitsChange.icon className="h-4 w-4" />
                <span className="text-xs font-medium">
                  {visitsChange.change > 0 ? '+' : ''}{visitsChange.change}%
                </span>
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">
                {currentMonthStats?.completedVisits || 0}
              </span>
              <span className="text-sm text-muted-foreground">
                vs {previousMonthStats?.completedVisits || 0} last month
              </span>
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Completion Rate</span>
              <div className={cn("flex items-center gap-1", completionChange.color)}>
                <completionChange.icon className="h-4 w-4" />
                <span className="text-xs font-medium">
                  {completionChange.change > 0 ? '+' : ''}{completionChange.change}%
                </span>
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">
                {currentMonthStats?.completionRate || 0}%
              </span>
              <Progress 
                value={currentMonthStats?.completionRate || 0} 
                className="w-20 h-2" 
              />
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Active MMPs</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">
                {currentMonthStats?.approvedMmps || 0}
              </span>
              <span className="text-sm text-muted-foreground">
                of {currentMonthStats?.totalMmps || 0} total
              </span>
            </div>
          </div>
        </div>

        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={0} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 12 }}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Bar 
                dataKey="Completed Visits" 
                fill="hsl(var(--primary))" 
                radius={[4, 4, 0, 0]}
              />
              <Bar 
                dataKey="Pending Visits" 
                fill="hsl(var(--muted-foreground))" 
                radius={[4, 4, 0, 0]}
                opacity={0.6}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 pt-4 border-t">
          <h4 className="text-sm font-medium mb-3">Month-over-Month Summary</h4>
          <div className="space-y-2">
            {monthlyStats.slice(-3).reverse().map((stat, index) => (
              <div 
                key={stat.month}
                className="flex items-center justify-between p-2 rounded-md bg-muted/30"
              >
                <span className="font-medium">{stat.monthLabel}</span>
                <div className="flex items-center gap-4 text-sm">
                  <span>
                    <strong>{stat.completedVisits}</strong>/{stat.totalVisits} visits
                  </span>
                  <Badge 
                    variant={stat.completionRate >= 80 ? 'default' : 'secondary'}
                  >
                    {stat.completionRate}% complete
                  </Badge>
                  <span className="text-muted-foreground">
                    {stat.totalMmps} MMPs
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MonthlyComparisonCard;
