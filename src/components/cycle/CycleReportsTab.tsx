import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  AlertTriangle, BarChart3, MapPin, Star, Shield
} from 'lucide-react';

interface CycleStats {
  totalSites: number;
  completedSites: number;
  uncoveredSites: number;
  reasonedSites: number;
  pendingReasonSites: number;
  coverageRate: number;
}

interface FollowUpRecord {
  id: string;
  siteId: string;
  siteName: string;
  reason: string;
  suggestedAction: string;
  createdAt: string;
  mmpName?: string;
}

interface CycleReportsTabProps {
  reasonBreakdown: Record<string, number>;
  hubBreakdown: Record<string, { total: number; reasoned: number; pending: number }>;
  cycleStats: CycleStats;
  followUps: FollowUpRecord[];
  qualityData: { hub: string; avgScore: number; count: number }[];
  uncoveredSitesCount: number;
  getReasonLabel: (reason: string | null) => string;
}

export function CycleReportsTab({
  reasonBreakdown,
  hubBreakdown,
  cycleStats,
  followUps,
  qualityData,
  uncoveredSitesCount,
  getReasonLabel,
}: CycleReportsTabProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card data-testid="card-reason-breakdown">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Reason Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(reasonBreakdown).length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">No data available</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(reasonBreakdown).sort((a, b) => b[1] - a[1]).map(([reason, count]) => (
                  <div key={reason} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 dark:text-gray-300">
                      {reason === 'pending' ? 'Pending Reason' : getReasonLabel(reason)}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${reason === 'pending' ? 'bg-red-500' : 'bg-blue-500'}`}
                          style={{ width: `${(count / uncoveredSitesCount) * 100}%` }}
                        />
                      </div>
                      <span className="font-medium w-8 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-hub-breakdown">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Hub Accountability
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(hubBreakdown).length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">No data available</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(hubBreakdown).sort((a, b) => b[1].total - a[1].total).map(([hub, data]) => (
                  <div key={hub} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-700 dark:text-gray-300">{hub}</span>
                      <span className="text-xs text-gray-500">
                        {data.reasoned}/{data.total} reasoned
                      </span>
                    </div>
                    <Progress value={data.total > 0 ? (data.reasoned / data.total) * 100 : 0} className="h-1.5" />
                    {data.pending > 0 && (
                      <span className="text-xs text-red-500">{data.pending} pending</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{cycleStats.uncoveredSites}</div>
              <div className="text-xs text-gray-500">Total Uncovered</div>
            </div>
            <div className="bg-green-50 dark:bg-green-950 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-600">{cycleStats.reasonedSites}</div>
              <div className="text-xs text-gray-500">Reasons Assigned</div>
            </div>
            <div className="bg-red-50 dark:bg-red-950 rounded-lg p-4">
              <div className="text-2xl font-bold text-red-600">{cycleStats.pendingReasonSites}</div>
              <div className="text-xs text-gray-500">Pending Reasons</div>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-600">{cycleStats.coverageRate}%</div>
              <div className="text-xs text-gray-500">Completion Rate</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {followUps.length > 0 && (
        <Card data-testid="card-follow-ups">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Follow-up Actions ({followUps.length})
            </CardTitle>
            <CardDescription>High-priority reasons requiring follow-up for the next cycle</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {followUps.map(fu => (
                <div key={fu.id} className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800" data-testid={`follow-up-${fu.id}`}>
                  <Shield className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{fu.siteName}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      <Badge variant="outline" className="text-xs mr-2">{getReasonLabel(fu.reason)}</Badge>
                      {fu.mmpName && <span>{fu.mmpName}</span>}
                    </div>
                    <div className="text-xs text-amber-700 dark:text-amber-300 mt-1">{fu.suggestedAction}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {qualityData.length > 0 && (
        <Card data-testid="card-visit-quality">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="h-4 w-4" /> Visit Quality Scores
            </CardTitle>
            <CardDescription>Average quality scores per hub from completed site visits</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {qualityData.sort((a, b) => b.avgScore - a.avgScore).map(q => (
                <div key={q.hub} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-300">{q.hub}</span>
                    <div className="flex items-center gap-2">
                      <div className="flex">
                        {[1, 2, 3, 4, 5].map(i => (
                          <Star key={i} className={`h-3 w-3 ${i <= Math.round(q.avgScore) ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`} />
                        ))}
                      </div>
                      <span className="text-xs text-gray-500">{q.avgScore}/5 ({q.count} visits)</span>
                    </div>
                  </div>
                  <Progress value={(q.avgScore / 5) * 100} className="h-1.5" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
