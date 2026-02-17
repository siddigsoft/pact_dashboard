import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp } from 'lucide-react';

interface UncoveredSite {
  id: string;
  mmp_id: string;
}

interface CycleCoveragePredictorProps {
  activeMmps: any[];
  uncoveredSites: UncoveredSite[];
}

export function CycleCoveragePredictor({ activeMmps, uncoveredSites }: CycleCoveragePredictorProps) {
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
            const mmpSitesTotal = uncoveredSites.filter(s => s.mmp_id === mmp.id).length;
            const totalSitesForMmp = mmpSitesTotal;
            const createdAt = (mmp as any).created_at ? new Date((mmp as any).created_at) : new Date();
            const daysElapsed = Math.max(1, Math.ceil((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)));
            const expectedDuration = 30;
            const visitedSoFar = totalSitesForMmp > 0 ? Math.max(0, totalSitesForMmp - mmpSitesTotal) : 0;
            const dailyRate = visitedSoFar / daysElapsed;
            const daysRemaining = Math.max(0, expectedDuration - daysElapsed);
            const projectedTotal = visitedSoFar + (dailyRate * daysRemaining);
            const projectedCoverage = totalSitesForMmp > 0 ? Math.min(100, Math.round((projectedTotal / (totalSitesForMmp + visitedSoFar)) * 100)) : 100;
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
                  <div className="flex justify-between"><span>Pending visits:</span><span>{mmpSitesTotal}</span></div>
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
