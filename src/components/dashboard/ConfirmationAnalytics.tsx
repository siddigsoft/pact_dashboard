import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  BarChart3, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  TrendingUp,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { differenceInHours } from 'date-fns';

interface ConfirmationStats {
  totalConfirmations: number;
  totalAutoReleased: number;
  totalPending: number;
  avgConfirmationTimeHours: number;
  onTimeConfirmationRate: number;
  autoReleaseRate: number;
}

interface SiteVisitData {
  confirmation_deadline?: string;
  confirmation_status?: 'pending' | 'confirmed' | 'auto_released';
  acknowledged_at?: string;
  autorelease_executed_at?: string;
  [key: string]: unknown;
}

export function ConfirmationAnalytics() {
  const { siteVisits, loading: siteVisitsLoading } = useSiteVisitContext();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Calculate analytics from context data
  const stats = useMemo(() => {
    if (!siteVisits || siteVisits.length === 0) {
      return {
        totalConfirmations: 0,
        totalAutoReleased: 0,
        totalPending: 0,
        avgConfirmationTimeHours: 0,
        onTimeConfirmationRate: 100,
        autoReleaseRate: 0,
      };
    }

    let totalConfirmations = 0;
    let totalAutoReleased = 0;
    let totalPending = 0;
    let totalConfirmationTimeHours = 0;
    let confirmationsWithTime = 0;
    let onTimeConfirmations = 0;

    // Process site visits from context
    // Note: visit_data might be in additionalData or visitData field depending on structure
    for (const visit of siteVisits) {
      // Try different possible locations for visit_data
      const visitData = (visit as any).visit_data || 
                       (visit as any).visitData || 
                       (visit as any).additionalData?.visit_data ||
                       (visit as any).additionalData?.visitData as SiteVisitData | null;
      
      if (!visitData?.confirmation_status) continue;

      const status = visitData.confirmation_status;
      const createdAt = visit.createdAt || visit.created_at || new Date();
      
      if (status === 'confirmed') {
        totalConfirmations++;
        
        if (visitData.acknowledged_at && visitData.confirmation_deadline) {
          const acknowledgedAt = new Date(visitData.acknowledged_at);
          const deadline = new Date(visitData.confirmation_deadline);
          const createdDate = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
          
          const hoursToConfirm = differenceInHours(acknowledgedAt, createdDate);
          if (hoursToConfirm >= 0) {
            totalConfirmationTimeHours += hoursToConfirm;
            confirmationsWithTime++;
          }
          
          if (acknowledgedAt <= deadline) {
            onTimeConfirmations++;
          }
        } else {
          onTimeConfirmations++;
        }
      } else if (status === 'auto_released') {
        totalAutoReleased++;
      } else if (status === 'pending') {
        totalPending++;
      }
    }

    const totalProcessed = totalConfirmations + totalAutoReleased;
    
    return {
      totalConfirmations,
      totalAutoReleased,
      totalPending,
      avgConfirmationTimeHours: confirmationsWithTime > 0 
        ? Math.round(totalConfirmationTimeHours / confirmationsWithTime) 
        : 0,
      onTimeConfirmationRate: totalConfirmations > 0 
        ? Math.round((onTimeConfirmations / totalConfirmations) * 100) 
        : 100,
      autoReleaseRate: totalProcessed > 0 
        ? Math.round((totalAutoReleased / totalProcessed) * 100) 
        : 0,
    };
  }, [siteVisits]);

  const isLoading = siteVisitsLoading;
  
  const handleRefresh = () => {
    setIsRefreshing(true);
    // Context will automatically refresh via real-time subscriptions
    setTimeout(() => setIsRefreshing(false), 500);
  };

  if (isLoading) {
    return (
      <Card data-testid="card-confirmation-analytics-loading">
        <CardHeader className="py-3 px-4 pb-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Confirmation Analytics</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="py-4 px-4">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card data-testid="card-confirmation-analytics-error">
        <CardHeader className="py-3 px-4 pb-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-sm font-medium">Confirmation Analytics</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="py-3 px-4">
          <p className="text-sm text-muted-foreground">Unable to load analytics data.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-confirmation-analytics">
      <CardHeader className="py-3 px-4 pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <CardTitle className="text-sm font-medium">Confirmation Analytics</CardTitle>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleRefresh}
            disabled={isRefreshing}
            data-testid="button-refresh-analytics"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="py-3 px-4 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2 rounded-md bg-green-50 dark:bg-green-950/30">
            <div className="text-2xl font-bold text-green-700 dark:text-green-400">
              {stats.totalConfirmations}
            </div>
            <div className="text-xs text-muted-foreground">Confirmed</div>
          </div>
          <div className="text-center p-2 rounded-md bg-amber-50 dark:bg-amber-950/30">
            <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">
              {stats.totalPending}
            </div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </div>
          <div className="text-center p-2 rounded-md bg-red-50 dark:bg-red-950/30">
            <div className="text-2xl font-bold text-red-700 dark:text-red-400">
              {stats.totalAutoReleased}
            </div>
            <div className="text-xs text-muted-foreground">Auto-Released</div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                <span>On-Time Confirmation Rate</span>
              </div>
              <span className="font-medium">{stats.onTimeConfirmationRate}%</span>
            </div>
            <Progress 
              value={stats.onTimeConfirmationRate} 
              className="h-2"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                <span>Auto-Release Rate</span>
              </div>
              <span className="font-medium">{stats.autoReleaseRate}%</span>
            </div>
            <Progress 
              value={stats.autoReleaseRate} 
              className="h-2"
            />
          </div>
        </div>

        <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Avg. Confirmation Time</span>
          </div>
          <Badge variant="secondary">
            {stats.avgConfirmationTimeHours}h
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export default ConfirmationAnalytics;
