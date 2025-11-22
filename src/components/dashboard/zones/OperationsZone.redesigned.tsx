import React, { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ClipboardList,
  Calendar,
  DollarSign,
  MapPin,
  Activity,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  X,
  Filter
} from 'lucide-react';
import SiteVisitsOverview from '../SiteVisitsOverview';
import UpcomingSiteVisitsCard from '../UpcomingSiteVisitsCard';
import { SiteVisitCostSummary } from '../SiteVisitCostSummary';
import { DashboardCalendar } from '../DashboardCalendar';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { isAfter, addDays } from 'date-fns';

interface Filters {
  status: string;
}

// KPI Card Component with professional design
interface KPICardProps {
  label: string;
  value: number;
  icon: React.FC<{ className?: string }>;
  color: 'blue' | 'green' | 'orange' | 'red' | 'purple';
  trend?: 'up' | 'down' | 'neutral';
  onClick?: () => void;
  selected?: boolean;
  testId?: string;
}

const KPICard: React.FC<KPICardProps> = ({
  label,
  value,
  icon: Icon,
  color,
  trend,
  onClick,
  selected,
  testId
}) => {
  const colorMap = {
    blue: 'border-t-blue-500',
    green: 'border-t-green-500',
    orange: 'border-t-orange-500',
    red: 'border-t-red-500',
    purple: 'border-t-purple-500'
  };

  const iconColorMap = {
    blue: 'text-blue-600 dark:text-blue-400',
    green: 'text-green-600 dark:text-green-400',
    orange: 'text-orange-600 dark:text-orange-400',
    red: 'text-red-600 dark:text-red-400',
    purple: 'text-purple-600 dark:text-purple-400'
  };

  const trendIconMap = {
    up: <TrendingUp className="h-3 w-3 text-green-600 dark:text-green-400" />,
    down: <TrendingDown className="h-3 w-3 text-red-600 dark:text-red-400" />,
    neutral: <Minus className="h-3 w-3 text-muted-foreground" />
  };

  return (
    <Card
      className={`border-t-2 ${colorMap[color]} ${selected ? 'ring-2 ring-primary' : ''} ${onClick ? 'cursor-pointer hover-elevate' : ''}`}
      onClick={onClick}
      data-testid={testId}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${iconColorMap[color]}`} />
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              {label}
            </span>
          </div>
          {trend && (
            <div className="flex items-center gap-1">
              {trendIconMap[trend]}
            </div>
          )}
        </div>
        <div className="text-3xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
};

export const OperationsZone: React.FC = () => {
  const { siteVisits } = useSiteVisitContext();
  const [activeTab, setActiveTab] = useState('overview');
  const [filters, setFilters] = useState<Filters>({ status: '' });

  const upcomingVisits = siteVisits
    .filter(v => {
      const dueDate = new Date(v.dueDate);
      const today = new Date();
      const twoWeeksFromNow = addDays(today, 14);
      return isAfter(dueDate, today) && isAfter(twoWeeksFromNow, dueDate);
    })
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 5);

  // Calculate metrics
  const totalVisits = siteVisits.length;
  const completedVisits = siteVisits.filter(v => v.status === 'completed').length;
  const pendingVisits = siteVisits.filter(v => v.status === 'pending' || v.status === 'permitVerified').length;
  const assignedVisits = siteVisits.filter(v => v.status === 'assigned' || v.status === 'inProgress').length;
  const overdueVisits = siteVisits.filter(v => {
    const dueDate = new Date(v.dueDate);
    const today = new Date();
    return dueDate < today && v.status !== 'completed';
  }).length;
  const completionRate = totalVisits > 0 ? Math.round((completedVisits / totalVisits) * 100) : 0;

  const clearFilter = () => {
    setFilters({ status: '' });
  };

  return (
    <div className="space-y-4">
      {/* Enterprise Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Field Operations</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time monitoring and site visit management
          </p>
        </div>
      </div>

      {/* KPI Ribbon - Professional 6-metric layout */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <KPICard
          label="Total Operations"
          value={totalVisits}
          icon={Activity}
          color="blue"
          trend="neutral"
          testId="kpi-total-operations"
        />
        <KPICard
          label="Completed"
          value={completedVisits}
          icon={CheckCircle2}
          color="green"
          trend="up"
          testId="kpi-completed"
        />
        <KPICard
          label="Active"
          value={assignedVisits}
          icon={ClipboardList}
          color="purple"
          trend="neutral"
          testId="kpi-active"
        />
        <KPICard
          label="Pending"
          value={pendingVisits}
          icon={Clock}
          color="orange"
          trend="down"
          testId="kpi-pending"
        />
        <KPICard
          label="Overdue"
          value={overdueVisits}
          icon={AlertCircle}
          color="red"
          trend={overdueVisits > 0 ? 'up' : 'neutral'}
          testId="kpi-overdue"
        />
        <KPICard
          label="Performance"
          value={completionRate}
          icon={TrendingUp}
          color="green"
          trend={completionRate >= 75 ? 'up' : completionRate >= 50 ? 'neutral' : 'down'}
          testId="kpi-performance"
        />
      </div>

      {/* Filter Toolbar */}
      {filters.status && (
        <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Active Filters:</span>
          <Badge variant="secondary" className="gap-1.5">
            Status: {filters.status}
            <Button
              variant="ghost"
              size="icon"
              className="h-3 w-3 p-0 hover:bg-transparent"
              onClick={clearFilter}
            >
              <X className="h-2 w-2" />
            </Button>
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilter}
            className="ml-auto text-xs"
          >
            Clear All
          </Button>
        </div>
      )}

      {/* Professional Tab System */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start border-b bg-transparent h-auto p-0 rounded-none">
          <TabsTrigger
            value="overview"
            className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-4 py-3"
            data-testid="tab-overview"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="upcoming"
            className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-4 py-3"
            data-testid="tab-upcoming"
          >
            Upcoming Visits
          </TabsTrigger>
          <TabsTrigger
            value="financial"
            className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-4 py-3"
            data-testid="tab-financial"
          >
            Financial
          </TabsTrigger>
          <TabsTrigger
            value="calendar"
            className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent px-4 py-3"
            data-testid="tab-calendar"
          >
            Calendar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <SiteVisitsOverview />
        </TabsContent>

        <TabsContent value="upcoming" className="mt-4 space-y-4">
          {upcomingVisits.length > 0 ? (
            <UpcomingSiteVisitsCard visits={upcomingVisits} />
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No Upcoming Visits</p>
                <p className="text-sm text-muted-foreground mt-2">
                  All site visits are either completed or scheduled beyond the next 2 weeks
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="financial" className="mt-4 space-y-4">
          <SiteVisitCostSummary visits={siteVisits} />
        </TabsContent>

        <TabsContent value="calendar" className="mt-4 space-y-4">
          <DashboardCalendar />
        </TabsContent>
      </Tabs>
    </div>
  );
};
