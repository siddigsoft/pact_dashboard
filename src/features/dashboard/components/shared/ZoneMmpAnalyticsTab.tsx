import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, BarChart3, GitBranch } from 'lucide-react';
import { format } from 'date-fns';
import { ZoneMmpStatsCards } from './ZoneMmpStatsCards';
import { DashboardFilters, type DashboardFilterState } from '@/features/dashboard/components/filters/DashboardFilters';
import { MMPVersionSelector } from '@/features/dashboard/components/filters/MMPVersionSelector';
import { MonthlyComparisonCard } from '@/features/dashboard/components/analytics/MonthlyComparisonCard';
import { MMPPerformanceCard } from '@/features/dashboard/components/analytics/MMPPerformanceCard';
import { MMPVersionHistoryCard } from '@/features/mmp/components/MMPVersionHistoryCard';
import type { MMPFile, MMPClassification, SiteVisit } from '@/types';
import type { MMPStats } from '@/features/mmp/hooks/use-zone-mmp-analytics';

interface ZoneMmpAnalyticsTabProps {
  filters: DashboardFilterState;
  onFilterChange: (filters: DashboardFilterState) => void;
  filteredMmpFiles: MMPFile[];
  filteredSiteVisits: SiteVisit[];
  mmpStats: MMPStats;
  uniqueHubs: string[];
  uniqueRegions: string[];
  selectedMmpId: string | null;
  onSelectMmp: (id: string | null) => void;
  selectedMmp: MMPFile | null;
  canAccessVersioning: boolean;
  zoneColor?: string;
}

export const ZoneMmpAnalyticsTab: React.FC<ZoneMmpAnalyticsTabProps> = ({
  filters,
  onFilterChange,
  filteredMmpFiles,
  filteredSiteVisits,
  mmpStats,
  uniqueHubs,
  uniqueRegions,
  selectedMmpId,
  onSelectMmp,
  selectedMmp,
  canAccessVersioning,
  zoneColor = 'primary',
}) => {
  const [subTab, setSubTab] = React.useState('overview');

  const handleFilterChange = (newFilters: DashboardFilterState) => {
    onFilterChange(newFilters);
  };

  return (
    <div className="space-y-4">
      <DashboardFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        mmpFiles={filteredMmpFiles}
        hubs={uniqueHubs}
        regions={uniqueRegions}
      />

      <ZoneMmpStatsCards stats={mmpStats} compact />

      <Tabs value={subTab} onValueChange={setSubTab} className="w-full">
        <TabsList className="w-full max-w-2xl">
          <TabsTrigger value="overview" className="flex-1 gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex-1 gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Analytics
          </TabsTrigger>
          {canAccessVersioning && (
            <TabsTrigger value="versions" className="flex-1 gap-1.5">
              <GitBranch className="h-3.5 w-3.5" />
              Versions
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <MMPVersionSelector
            mmpFiles={filteredMmpFiles}
            selectedMmpId={selectedMmpId}
            onSelectMmp={onSelectMmp}
          />

          {filteredMmpFiles.length > 0 ? (
            <div className="grid gap-4">
              {filteredMmpFiles.slice(0, 10).map(mmp => (
                <Card
                  key={mmp.id}
                  className={`cursor-pointer transition-all ${selectedMmpId === mmp.id ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
                  onClick={() => onSelectMmp(selectedMmpId === mmp.id ? null : mmp.id)}
                  data-testid={`card-mmp-${mmp.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{mmp.name || mmp.mmpId}</div>
                        <div className="text-sm text-muted-foreground">
                          {mmp.hub && <span>{mmp.hub}</span>}
                          {mmp.month && mmp.year && (
                            <span className="ml-2">
                              {format(
                                new Date(
                                  mmp.year,
                                  (typeof mmp.month === 'string' ? parseInt(mmp.month, 10) : mmp.month) - 1
                                ),
                                'MMMM yyyy'
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {(mmp as any).classification && (
                          <Badge variant="outline" className="text-xs">
                            {(mmp as any).classification}
                          </Badge>
                        )}
                        <Badge
                          variant={
                            mmp.status === 'approved'
                              ? 'default'
                              : mmp.status === 'pending'
                                ? 'secondary'
                                : 'outline'
                          }
                        >
                          {mmp.status}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredMmpFiles.length > 10 && (
                <div className="text-center text-sm text-muted-foreground">
                  Showing 10 of {filteredMmpFiles.length} MMPs
                </div>
              )}
            </div>
          ) : (
            <Card className="p-8 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
              <div className="text-muted-foreground">No MMPs match the current filters</div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <MonthlyComparisonCard mmpFiles={filteredMmpFiles} siteVisits={filteredSiteVisits} />
            {selectedMmp && (
              <MMPPerformanceCard
                mmp={selectedMmp}
                siteVisits={filteredSiteVisits.filter(sv => sv.mmpDetails?.mmpId === selectedMmp.id)}
              />
            )}
          </div>

          <ZoneMmpStatsCards stats={mmpStats} showClassification />
        </TabsContent>

        {canAccessVersioning && (
          <TabsContent value="versions" className="mt-4 space-y-4">
            <Card className="p-4">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-sm font-medium">Filter by Classification:</span>
                <Select
                  value={filters.mmpClassification}
                  onValueChange={val =>
                    onFilterChange({
                      ...filters,
                      mmpClassification: val as MMPClassification | 'all',
                    })
                  }
                >
                  <SelectTrigger className="w-[180px]" data-testid="select-classification-filter">
                    <SelectValue placeholder="All Classifications" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classifications</SelectItem>
                    <SelectItem value="original">Original</SelectItem>
                    <SelectItem value="revised">Revised</SelectItem>
                    <SelectItem value="additional">Additional</SelectItem>
                    <SelectItem value="supplementary">Supplementary</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Card>

            {selectedMmp ? (
              <MMPVersionHistoryCard
                mmp={selectedMmp}
                allMmps={filteredMmpFiles}
                onSelectVersion={id => onSelectMmp(id)}
              />
            ) : (
              <Card className="p-8 text-center">
                <GitBranch className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <div className="text-muted-foreground">Select an MMP to view version history</div>
              </Card>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};
