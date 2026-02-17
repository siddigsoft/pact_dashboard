import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart3, MapPin, TrendingUp, TrendingDown
} from 'lucide-react';

interface ClosedCycleRecord {
  id: string;
  name: string;
  month: number | null;
  year: number | null;
  region: string | null;
  cycle_status: string;
  cycle_closed_at: string | null;
  totalSites: number;
  completedSites: number;
  uncoveredSites: number;
  reasonBreakdown?: Record<string, number>;
}

interface CycleScorecardTabProps {
  closedCycles: ClosedCycleRecord[];
  getReasonLabel: (reason: string | null) => string;
}

export function CycleScorecardTab({ closedCycles, getReasonLabel }: CycleScorecardTabProps) {
  return (
    <div className="space-y-4">
      <Card data-testid="card-scorecard">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Performance Scorecard
          </CardTitle>
          <CardDescription>Hub performance across closed cycles</CardDescription>
        </CardHeader>
        <CardContent>
          {closedCycles.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">No closed cycles available for scoring.</p>
          ) : (() => {
            const hubPerf: Record<string, {
              cycles: { name: string; rate: number; month: number | null; year: number | null }[];
              totalUncovered: number;
              totalSites: number;
              reasons: Record<string, number>;
            }> = {};

            closedCycles.forEach(c => {
              const hub = c.region || 'Unknown';
              if (!hubPerf[hub]) hubPerf[hub] = { cycles: [], totalUncovered: 0, totalSites: 0, reasons: {} };
              const rate = c.totalSites > 0 ? Math.round(((c.totalSites - c.uncoveredSites) / c.totalSites) * 100) : 100;
              hubPerf[hub].cycles.push({ name: c.name, rate, month: c.month, year: c.year });
              hubPerf[hub].totalUncovered += c.uncoveredSites;
              hubPerf[hub].totalSites += c.totalSites;
              if (c.reasonBreakdown) {
                Object.entries(c.reasonBreakdown).forEach(([r, count]) => {
                  hubPerf[hub].reasons[r] = (hubPerf[hub].reasons[r] || 0) + count;
                });
              }
            });

            return (
              <div className="space-y-6">
                {Object.entries(hubPerf).sort((a, b) => {
                  const avgA = a[1].cycles.reduce((s, c) => s + c.rate, 0) / a[1].cycles.length;
                  const avgB = b[1].cycles.reduce((s, c) => s + c.rate, 0) / b[1].cycles.length;
                  return avgB - avgA;
                }).map(([hub, data]) => {
                  const avgRate = Math.round(data.cycles.reduce((s, c) => s + c.rate, 0) / data.cycles.length);
                  const sortedCycles = [...data.cycles].sort((a, b) => (a.year || 0) - (b.year || 0) || (a.month || 0) - (b.month || 0));
                  const lastTwo = sortedCycles.slice(-2);
                  const improving = lastTwo.length === 2 && lastTwo[1].rate >= lastTwo[0].rate;
                  const declining = lastTwo.length === 2 && lastTwo[1].rate < lastTwo[0].rate;
                  const topReasons = Object.entries(data.reasons).sort((a, b) => b[1] - a[1]).slice(0, 3);

                  return (
                    <div key={hub} className="p-4 border rounded-lg space-y-3" data-testid={`scorecard-hub-${hub}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-gray-400" />
                          <span className="font-medium text-gray-900 dark:text-white">{hub}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={avgRate >= 80 ? 'secondary' : 'destructive'} className="text-xs">
                            Avg: {avgRate}%
                          </Badge>
                          {improving && <Badge variant="secondary" className="text-xs text-green-600"><TrendingUp className="h-3 w-3 mr-1" /> Improving</Badge>}
                          {declining && <Badge variant="secondary" className="text-xs text-red-600"><TrendingDown className="h-3 w-3 mr-1" /> Declining</Badge>}
                        </div>
                      </div>

                      <div className="text-xs text-gray-500">
                        <span className="font-medium">Coverage trend: </span>
                        {sortedCycles.map((c, i) => (
                          <span key={i}>
                            {c.name}: {c.rate}%{i < sortedCycles.length - 1 ? ' → ' : ''}
                          </span>
                        ))}
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
                          <div className="font-bold text-sm">{data.cycles.length}</div>
                          <div className="text-gray-500">Cycles</div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
                          <div className="font-bold text-sm">{data.totalSites}</div>
                          <div className="text-gray-500">Total Sites</div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
                          <div className="font-bold text-sm text-red-600">{data.totalUncovered}</div>
                          <div className="text-gray-500">Uncovered</div>
                        </div>
                      </div>

                      {topReasons.length > 0 && (
                        <div className="text-xs">
                          <span className="text-gray-500 font-medium">Top gap reasons: </span>
                          {topReasons.map(([r, count], i) => (
                            <Badge key={r} variant="outline" className="text-xs mr-1">
                              {getReasonLabel(r)} ({count})
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
