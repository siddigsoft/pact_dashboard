import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart3, TrendingUp, TrendingDown, Minus
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

interface CycleComparisonTabProps {
  closedCycles: ClosedCycleRecord[];
  comparisonCycle1: string;
  comparisonCycle2: string;
  setComparisonCycle1: (id: string) => void;
  setComparisonCycle2: (id: string) => void;
  getReasonLabel: (reason: string | null) => string;
}

export function CycleComparisonTab({
  closedCycles,
  comparisonCycle1,
  comparisonCycle2,
  setComparisonCycle1,
  setComparisonCycle2,
  getReasonLabel,
}: CycleComparisonTabProps) {
  return (
    <div className="space-y-4">
      <Card data-testid="card-comparison">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Cycle Comparison
          </CardTitle>
          <CardDescription>Select two closed cycles to compare side-by-side</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <label className="text-xs text-gray-500">Cycle A</label>
              <Select value={comparisonCycle1} onValueChange={setComparisonCycle1}>
                <SelectTrigger data-testid="select-comparison-cycle-1">
                  <SelectValue placeholder="Select cycle..." />
                </SelectTrigger>
                <SelectContent>
                  {closedCycles.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({c.month}/{c.year})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1 min-w-[200px]">
              <label className="text-xs text-gray-500">Cycle B</label>
              <Select value={comparisonCycle2} onValueChange={setComparisonCycle2}>
                <SelectTrigger data-testid="select-comparison-cycle-2">
                  <SelectValue placeholder="Select cycle..." />
                </SelectTrigger>
                <SelectContent>
                  {closedCycles.filter(c => c.id !== comparisonCycle1).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({c.month}/{c.year})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {comparisonCycle1 && comparisonCycle2 && (() => {
            const c1 = closedCycles.find(c => c.id === comparisonCycle1);
            const c2 = closedCycles.find(c => c.id === comparisonCycle2);
            if (!c1 || !c2) return null;
            const rate1 = c1.totalSites > 0 ? Math.round(((c1.totalSites - c1.uncoveredSites) / c1.totalSites) * 100) : 0;
            const rate2 = c2.totalSites > 0 ? Math.round(((c2.totalSites - c2.uncoveredSites) / c2.totalSites) * 100) : 0;
            const allReasons = new Set([...Object.keys(c1.reasonBreakdown || {}), ...Object.keys(c2.reasonBreakdown || {})]);

            return (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="text-sm font-medium text-gray-500">Metric</div>
                  <div className="text-sm font-medium">{c1.name}</div>
                  <div className="text-sm font-medium">{c2.name}</div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="text-sm text-gray-600 dark:text-gray-400">Coverage Rate</div>
                  <div className="text-lg font-bold">{rate1}%</div>
                  <div className="text-lg font-bold flex items-center justify-center gap-1">
                    {rate2}%
                    {rate2 > rate1 ? <TrendingUp className="h-4 w-4 text-green-500" /> : rate2 < rate1 ? <TrendingDown className="h-4 w-4 text-red-500" /> : <Minus className="h-4 w-4 text-gray-400" />}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="text-sm text-gray-600 dark:text-gray-400">Uncovered Sites</div>
                  <div className="text-lg font-bold text-red-600">{c1.uncoveredSites}</div>
                  <div className="text-lg font-bold text-red-600 flex items-center justify-center gap-1">
                    {c2.uncoveredSites}
                    {c2.uncoveredSites < c1.uncoveredSites ? <TrendingDown className="h-4 w-4 text-green-500" /> : c2.uncoveredSites > c1.uncoveredSites ? <TrendingUp className="h-4 w-4 text-red-500" /> : <Minus className="h-4 w-4 text-gray-400" />}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="text-sm text-gray-600 dark:text-gray-400">Total Sites</div>
                  <div className="text-lg font-bold">{c1.totalSites}</div>
                  <div className="text-lg font-bold">{c2.totalSites}</div>
                </div>

                {allReasons.size > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Reason Breakdown Comparison</h4>
                    {Array.from(allReasons).map(reason => {
                      const v1 = (c1.reasonBreakdown || {})[reason] || 0;
                      const v2 = (c2.reasonBreakdown || {})[reason] || 0;
                      const diff = v2 - v1;
                      return (
                        <div key={reason} className="grid grid-cols-3 gap-4 text-sm items-center">
                          <span className="text-gray-600 dark:text-gray-400">{getReasonLabel(reason)}</span>
                          <span className="text-center font-medium">{v1}</span>
                          <span className="text-center font-medium flex items-center justify-center gap-1">
                            {v2}
                            {diff !== 0 && (
                              <span className={`text-xs ${diff > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                ({diff > 0 ? '+' : ''}{diff})
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {closedCycles.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-4">
              No closed cycles yet. Once you fully close an MMP cycle it will appear here.
            </p>
          )}
          {closedCycles.length === 1 && (
            <p className="text-gray-500 text-sm text-center py-4">
              Only one closed cycle available ({closedCycles[0].name}). Close a second MMP cycle to enable side-by-side comparison.
            </p>
          )}
          {closedCycles.length >= 2 && (!comparisonCycle1 || !comparisonCycle2) && (
            <p className="text-gray-500 text-sm text-center py-4">Select two cycles above to see the comparison.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
