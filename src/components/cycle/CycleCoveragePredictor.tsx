import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp } from 'lucide-react';

interface SiteVisitCounts {
  total: number;
  completed: number;
  pending: number;
  assigned: number;
  dispatched: number;
}

interface CycleCoveragePredictorProps {
  activeMmps: any[];
  siteVisitCounts: Record<string, SiteVisitCounts>;
}

export function CycleCoveragePredictor({ activeMmps, siteVisitCounts }: CycleCoveragePredictorProps) {
  const activeOnlyMmps = activeMmps.filter(m => {
    const cs = (m as any).cycle_status || 'active';
    return cs === 'active';
  });

  if (activeOnlyMmps.length === 0) return null;

  return (
    <Card className="mt-4" data-testid="card-coverage-prediction">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Coverage Prediction
        </CardTitle>
        <CardDescription>Projected coverage based on current visit progress</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2">
          {activeOnlyMmps.map(mmp => {
            const counts = siteVisitCounts[mmp.id];
            const totalSites = counts?.total || 0;
            const completedSites = counts?.completed || 0;
            const pendingSites = totalSites - completedSites;

            if (totalSites === 0) {
              return (
                <div key={mmp.id} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700" data-testid={`prediction-${mmp.id}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium truncate">{mmp.name}</span>
                    <Badge variant="secondary" className="text-xs">No Data</Badge>
                  </div>
                  <div className="text-xs text-gray-500">No site visits found for this MMP.</div>
                </div>
              );
            }

            const createdAt = (mmp as any).created_at ? new Date((mmp as any).created_at) : new Date();
            const daysElapsed = Math.max(1, Math.ceil((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)));
            const expectedDuration = 30;
            const dailyRate = completedSites / daysElapsed;
            const daysRemaining = Math.max(0, expectedDuration - daysElapsed);
            const projectedTotal = completedSites + (dailyRate * daysRemaining);
            const projectedCoverage = Math.min(100, Math.round((projectedTotal / totalSites) * 100));
            const isAtRisk = projectedCoverage < 80;

            return (
              <div key={mmp.id} className={`p-3 rounded-lg border ${isAtRisk ? 'border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800' : 'border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800'}`} data-testid={`prediction-${mmp.id}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium truncate">{mmp.name}</span>
                  {isAtRisk ? (
                    <Badge variant="destructive" className="text-xs">At Risk</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">On Track</Badge>
                  )}
                </div>
                <div className="text-xs text-gray-500 space-y-1">
                  <div className="flex justify-between"><span>Days elapsed:</span><span>{daysElapsed}/{expectedDuration}</span></div>
                  <div className="flex justify-between"><span>Completed:</span><span>{completedSites}/{totalSites}</span></div>
                  <div className="flex justify-between"><span>Remaining:</span><span>{pendingSites}</span></div>
                  <div className="flex justify-between"><span>Daily rate:</span><span>{dailyRate.toFixed(1)} visits/day</span></div>
                  <div className="flex justify-between"><span>Projected coverage:</span><span className={isAtRisk ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>{projectedCoverage}%</span></div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
