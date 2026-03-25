import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, CheckCircle2, Clock, AlertCircle, GitBranch } from 'lucide-react';
import type { MMPStats } from '@/features/mmp/hooks/use-zone-mmp-analytics';

interface ZoneMmpStatsCardsProps {
  stats: MMPStats;
  showClassification?: boolean;
  compact?: boolean;
}

export const ZoneMmpStatsCards: React.FC<ZoneMmpStatsCardsProps> = ({
  stats,
  showClassification = false,
  compact = false,
}) => {
  if (compact) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-muted-foreground">Total MMPs</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
          <div className="text-xs text-muted-foreground">Approved</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
          <div className="text-xs text-muted-foreground">Pending</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold text-blue-600">{stats.verified}</div>
          <div className="text-xs text-muted-foreground">Verified</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total MMPs</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">All plans</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
            <p className="text-xs text-muted-foreground">
              {stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0}% of total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">Awaiting review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Verified</CardTitle>
            <AlertCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.verified}</div>
            <p className="text-xs text-muted-foreground">Fully verified</p>
          </CardContent>
        </Card>
      </div>

      {showClassification && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              Classification Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                <div className="text-2xl font-bold text-blue-600">{stats.byClassification.original}</div>
                <div className="text-xs text-muted-foreground">Original</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30">
                <div className="text-2xl font-bold text-amber-600">{stats.byClassification.revised}</div>
                <div className="text-xs text-muted-foreground">Revised</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950/30">
                <div className="text-2xl font-bold text-green-600">{stats.byClassification.additional}</div>
                <div className="text-xs text-muted-foreground">Additional</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30">
                <div className="text-2xl font-bold text-purple-600">{stats.byClassification.supplementary}</div>
                <div className="text-xs text-muted-foreground">Supplementary</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
