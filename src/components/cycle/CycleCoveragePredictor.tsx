import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, BarChart3, Calendar, Target } from 'lucide-react';

interface SiteVisitCounts {
  total: number;
  statusCounts: Record<string, number>;
}

interface CycleCoveragePredictorProps {
  activeMmps: any[];
  siteVisitCounts: Record<string, SiteVisitCounts>;
}

function getDaysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

function getDaysElapsedInCycle(mmp: any): { daysElapsed: number; totalDays: number; daysRemaining: number } {
  const now = new Date();
  const mmpMonth = mmp.month || now.getMonth() + 1;
  const mmpYear = mmp.year || now.getFullYear();
  const totalDays = getDaysInMonth(mmpMonth, mmpYear);
  const cycleStart = new Date(mmpYear, mmpMonth - 1, 1);
  const cycleEnd = new Date(mmpYear, mmpMonth, 0);

  const createdAt = (mmp as any).created_at ? new Date((mmp as any).created_at) : cycleStart;
  const effectiveStart = createdAt > cycleStart ? createdAt : cycleStart;

  const daysElapsed = Math.max(1, Math.ceil((Math.min(now.getTime(), cycleEnd.getTime()) - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)));
  const daysRemaining = Math.max(0, Math.ceil((cycleEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  return { daysElapsed, totalDays, daysRemaining };
}

export function CycleCoveragePredictor({ activeMmps, siteVisitCounts }: CycleCoveragePredictorProps) {
  const activeOnlyMmps = activeMmps.filter(m => {
    const cs = (m as any).cycle_status || 'active';
    return cs === 'active';
  });

  const predictions = useMemo(() => {
    return activeOnlyMmps.map(mmp => {
      const counts = siteVisitCounts[mmp.id];
      const totalSites = counts?.total || 0;
      const sc = counts?.statusCounts ?? {};
      const completedSites = sc['completed'] ?? 0;
      const pendingSites = sc['pending'] ?? 0;
      const assignedSites = sc['assigned'] ?? 0;
      const dispatchedSites = sc['dispatched'] ?? 0;
      const coverageRate = totalSites > 0 ? Math.round((completedSites / totalSites) * 100) : 0;

      const { daysElapsed, totalDays, daysRemaining } = getDaysElapsedInCycle(mmp);
      const dailyRate = completedSites / daysElapsed;
      const projectedTotal = completedSites + (dailyRate * daysRemaining);
      const projectedCoverage = totalSites > 0 ? Math.min(100, Math.round((projectedTotal / totalSites) * 100)) : 0;
      const isAtRisk = totalSites > 0 && projectedCoverage < 80;
      const hasData = totalSites > 0;

      return {
        mmp,
        totalSites,
        completedSites,
        pendingSites,
        assignedSites,
        dispatchedSites,
        coverageRate,
        daysElapsed,
        totalDays,
        daysRemaining,
        dailyRate,
        projectedCoverage,
        isAtRisk,
        hasData,
      };
    });
  }, [activeOnlyMmps, siteVisitCounts]);

  const summary = useMemo(() => {
    const withData = predictions.filter(p => p.hasData);
    const totalMmps = predictions.length;
    const avgCoverage = withData.length > 0 ? Math.round(withData.reduce((sum, p) => sum + p.coverageRate, 0) / withData.length) : 0;
    const atRiskCount = predictions.filter(p => p.isAtRisk).length;
    const onTrackCount = predictions.filter(p => p.hasData && !p.isAtRisk).length;
    const noDataCount = predictions.filter(p => !p.hasData).length;
    return { totalMmps, avgCoverage, atRiskCount, onTrackCount, noDataCount };
  }, [predictions]);

  if (activeOnlyMmps.length === 0) return null;

  return (
    <Card className="mt-4" data-testid="card-coverage-prediction">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Coverage Prediction
          <span dir="rtl" className="font-normal text-sm text-muted-foreground">/ توقعات التغطية</span>
        </CardTitle>
        <CardDescription>
          Projected coverage based on current visit progress
          <span dir="rtl" className="block text-muted-foreground/70 mt-0.5">التغطية المتوقعة بناء على تقدم الزيارات الحالي</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center h-7 w-7 rounded-md bg-blue-500/10 mx-auto mb-1">
              <BarChart3 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-lg font-bold" data-testid="text-prediction-total-mmps">{summary.totalMmps}</div>
            <div className="text-xs text-muted-foreground">Total MMPs</div>
            <div dir="rtl" className="text-[10px] text-muted-foreground/70">اجمالي</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center h-7 w-7 rounded-md bg-emerald-500/10 mx-auto mb-1">
              <Target className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-lg font-bold" data-testid="text-prediction-avg-coverage">{summary.avgCoverage}%</div>
            <div className="text-xs text-muted-foreground">Avg Coverage</div>
            <div dir="rtl" className="text-[10px] text-muted-foreground/70">متوسط التغطية</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center h-7 w-7 rounded-md bg-red-500/10 mx-auto mb-1">
              <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
            </div>
            <div className="text-lg font-bold text-red-600 dark:text-red-400" data-testid="text-prediction-at-risk">{summary.atRiskCount}</div>
            <div className="text-xs text-muted-foreground">At Risk</div>
            <div dir="rtl" className="text-[10px] text-muted-foreground/70">في خطر</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center h-7 w-7 rounded-md bg-green-500/10 mx-auto mb-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-lg font-bold text-green-600 dark:text-green-400" data-testid="text-prediction-on-track">{summary.onTrackCount}</div>
            <div className="text-xs text-muted-foreground">On Track</div>
            <div dir="rtl" className="text-[10px] text-muted-foreground/70">على المسار</div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {predictions.map(pred => {
            if (!pred.hasData) {
              return (
                <div key={pred.mmp.id} className="rounded-lg border p-3" data-testid={`prediction-${pred.mmp.id}`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-medium truncate">{pred.mmp.name}</span>
                    <Badge variant="secondary">No Data <span dir="rtl" className="text-muted-foreground/70 mr-1">لا بيانات</span></Badge>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3" />
                    No site visits found for this MMP
                    <span dir="rtl" className="text-muted-foreground/70">/ لا توجد زيارات</span>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={pred.mmp.id}
                className={`rounded-lg border p-3 ${pred.isAtRisk ? 'border-red-200 bg-red-50/50 dark:bg-red-950/30 dark:border-red-800' : 'border-green-200 bg-green-50/50 dark:bg-green-950/30 dark:border-green-800'}`}
                data-testid={`prediction-${pred.mmp.id}`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm font-medium truncate">{pred.mmp.name}</span>
                  {pred.isAtRisk ? (
                    <Badge variant="destructive">
                      <TrendingDown className="h-3 w-3 mr-1" /> At Risk
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <TrendingUp className="h-3 w-3 mr-1" /> On Track
                    </Badge>
                  )}
                </div>

                <div className="space-y-2">
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">
                        Current Coverage <span dir="rtl" className="text-muted-foreground/70">/ التغطية الحالية</span>
                      </span>
                      <span className="font-semibold">{pred.coverageRate}%</span>
                    </div>
                    <Progress value={pred.coverageRate} className="h-2" />
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-muted-foreground">Timeline <span dir="rtl" className="text-muted-foreground/70">الفترة</span>:</span>
                      <span className="font-medium">{pred.daysElapsed}/{pred.totalDays}d</span>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-muted-foreground">Remaining <span dir="rtl" className="text-muted-foreground/70">متبقي</span>:</span>
                      <span className="font-medium">{pred.daysRemaining}d</span>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-muted-foreground">Done <span dir="rtl" className="text-muted-foreground/70">مكتمل</span>:</span>
                      <span className="font-medium">{pred.completedSites}/{pred.totalSites}</span>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-muted-foreground">Rate <span dir="rtl" className="text-muted-foreground/70">المعدل</span>:</span>
                      <span className="font-medium">{pred.dailyRate.toFixed(1)}/day</span>
                    </div>
                  </div>

                  <div className={`flex items-center justify-between text-xs rounded-md px-2 py-1 ${pred.isAtRisk ? 'bg-red-100 dark:bg-red-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                    <span className="text-muted-foreground">
                      Projected <span dir="rtl" className="text-muted-foreground/70">/ متوقع</span>
                    </span>
                    <span className={`font-bold ${pred.isAtRisk ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                      {pred.projectedCoverage}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
