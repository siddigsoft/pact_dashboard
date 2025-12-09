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
import { supabase } from '@/integrations/supabase/client';
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
  const [stats, setStats] = useState<ConfirmationStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchAnalytics = async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    
    try {
      const { data: siteVisits, error } = await supabase
        .from('site_visits')
        .select('visit_data, created_at')
        .not('visit_data', 'is', null)
        .limit(1000);

      if (error) throw error;

      let totalConfirmations = 0;
      let totalAutoReleased = 0;
      let totalPending = 0;
      let totalConfirmationTimeHours = 0;
      let confirmationsWithTime = 0;
      let onTimeConfirmations = 0;

      for (const visit of siteVisits || []) {
        const visitData = visit.visit_data as SiteVisitData | null;
        if (!visitData?.confirmation_status) continue;

        const status = visitData.confirmation_status;
        
        if (status === 'confirmed') {
          totalConfirmations++;
          
          if (visitData.acknowledged_at && visitData.confirmation_deadline) {
            const acknowledgedAt = new Date(visitData.acknowledged_at);
            const deadline = new Date(visitData.confirmation_deadline);
            const createdAt = visit.created_at ? new Date(visit.created_at) : acknowledgedAt;
            
            const hoursToConfirm = differenceInHours(acknowledgedAt, createdAt);
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
      
      setStats({
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
      });
    } catch (error) {
      console.error('Error fetching confirmation analytics:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

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
            onClick={() => fetchAnalytics(true)}
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
