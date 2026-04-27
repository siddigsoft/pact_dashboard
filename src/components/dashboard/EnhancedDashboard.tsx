import React, { useState, useMemo } from 'react';
import { format, isWithinInterval, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { isTerminalCompletionRawStatus } from '@/utils/siteCompletionStatus';
import { useAppContext } from '@/context/AppContext';
import { useMMP } from '@/context/mmp/MMPContext';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { 
  DashboardFilters, 
  defaultFilterState,
  MMPVersionSelector,
  type DashboardFilterState 
} from './filters';
import { MonthlyComparisonCard, MMPPerformanceCard } from './analytics';
import { DashboardStatsOverview } from './DashboardStatsOverview';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  LayoutDashboard, 
  BarChart3, 
  FileText, 
  TrendingUp,
  Calendar,
  GitBranch
} from 'lucide-react';
import type { MMPFile } from '@/types';

interface EnhancedDashboardProps {
  className?: string;
}

export const EnhancedDashboard: React.FC<EnhancedDashboardProps> = ({
  className,
}) => {
  const { currentUser, roles } = useAppContext();
  const { mmpFiles } = useMMP();
  const { siteVisits } = useSiteVisitContext();
  
  const [filters, setFilters] = useState<DashboardFilterState>(defaultFilterState);
  const [selectedMmpId, setSelectedMmpId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  const isAdmin = roles?.some(r => 
    ['admin', 'superadmin', 'countrydirector'].includes(r.toLowerCase())
  );
  const isFinance = roles?.some(r => 
    ['financialadmin', 'finance'].includes(r.toLowerCase())
  );
  const isFieldOps = roles?.some(r => 
    ['fom', 'fieldoperationsmanager', 'coordinator'].includes(r.toLowerCase())
  );

  const uniqueHubs = useMemo(() => {
    const hubs = new Set<string>();
    (mmpFiles || []).forEach(mmp => mmp.hub && hubs.add(mmp.hub));
    return Array.from(hubs).sort();
  }, [mmpFiles]);

  const uniqueRegions = useMemo(() => {
    const regions = new Set<string>();
    (mmpFiles || []).forEach(mmp => mmp.region && regions.add(mmp.region));
    return Array.from(regions).sort();
  }, [mmpFiles]);

  const filteredMmpFiles = useMemo(() => {
    let filtered = [...(mmpFiles || [])];
    
    if (filters.dateRange.start && filters.dateRange.end) {
      filtered = filtered.filter(mmp => {
        const mmpDate = mmp.uploadedAt ? new Date(mmp.uploadedAt) : null;
        if (!mmpDate) return true;
        return isWithinInterval(mmpDate, {
          start: filters.dateRange.start!,
          end: filters.dateRange.end!,
        });
      });
    }
    
    if (filters.selectedMonth && filters.selectedYear) {
      filtered = filtered.filter(mmp => {
        if (mmp.month && mmp.year) {
          return mmp.month === filters.selectedMonth && 
                 mmp.year === filters.selectedYear;
        }
        return true;
      });
    } else if (filters.selectedYear) {
      filtered = filtered.filter(mmp => mmp.year === filters.selectedYear);
    }
    
    if (filters.mmpClassification !== 'all') {
      filtered = filtered.filter(mmp => 
        (mmp.classification || 'original') === filters.mmpClassification
      );
    }
    
    if (filters.showActiveOnly) {
      filtered = filtered.filter(mmp => 
        !mmp.versionStatus || mmp.versionStatus === 'active'
      );
    }
    
    if (filters.hub) {
      filtered = filtered.filter(mmp => mmp.hub === filters.hub);
    }
    
    if (filters.region) {
      filtered = filtered.filter(mmp => mmp.region === filters.region);
    }
    
    if (filters.selectedMmpIds.length > 0) {
      filtered = filtered.filter(mmp => 
        filters.selectedMmpIds.includes(mmp.id)
      );
    }
    
    return filtered;
  }, [mmpFiles, filters]);

  const filteredSiteVisits = useMemo(() => {
    let filtered = [...(siteVisits || [])];
    
    if (filters.dateRange.start && filters.dateRange.end) {
      filtered = filtered.filter(visit => {
        const visitDate = visit.dueDate ? new Date(visit.dueDate) : null;
        if (!visitDate) return true;
        return isWithinInterval(visitDate, {
          start: filters.dateRange.start!,
          end: filters.dateRange.end!,
        });
      });
    }
    
    if (filters.selectedMmpIds.length > 0) {
      filtered = filtered.filter(visit => {
        const visitMmpId = visit.mmpDetails?.mmpId;
        return visitMmpId && filters.selectedMmpIds.includes(visitMmpId);
      });
    }
    
    return filtered;
  }, [siteVisits, filters]);

  const selectedMmp = useMemo(() => {
    if (!selectedMmpId) return null;
    return (mmpFiles || []).find(mmp => mmp.id === selectedMmpId) || null;
  }, [mmpFiles, selectedMmpId]);

  const getFilterSummary = () => {
    const parts: string[] = [];
    if (filters.quickFilter === 'thisMonth') parts.push('This Month');
    else if (filters.quickFilter === 'lastMonth') parts.push('Last Month');
    else if (filters.quickFilter === 'last3Months') parts.push('Last 3 Months');
    else if (filters.quickFilter === 'thisYear') parts.push('This Year');
    else if (filters.selectedMonth && filters.selectedYear) {
      parts.push(`${filters.selectedMonth}/${filters.selectedYear}`);
    }
    if (filters.mmpClassification !== 'all') {
      parts.push(filters.mmpClassification);
    }
    if (filters.hub) parts.push(filters.hub);
    if (filters.region) parts.push(filters.region);
    return parts.join(' | ') || 'All Data';
  };

  return (
    <div className={className} data-testid="enhanced-dashboard">
      <DashboardFilters
        filters={filters}
        onFilterChange={setFilters}
        mmpFiles={mmpFiles || []}
        hubs={uniqueHubs}
        regions={uniqueRegions}
        showMmpFilter={true}
        showClassificationFilter={true}
        showHubFilter={true}
        showRegionFilter={true}
      />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Dashboard</h2>
          <Badge variant="outline" className="ml-2">
            {getFilterSummary()}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{filteredMmpFiles.length} MMPs</span>
          <span>|</span>
          <span>{filteredSiteVisits.length} Site Visits</span>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">
            <LayoutDashboard className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="monthly" data-testid="tab-monthly">
            <Calendar className="h-4 w-4 mr-2" />
            Monthly
          </TabsTrigger>
          <TabsTrigger value="mmp" data-testid="tab-mmp">
            <FileText className="h-4 w-4 mr-2" />
            By MMP
          </TabsTrigger>
          {(isAdmin || isFinance) && (
            <TabsTrigger value="versions" data-testid="tab-versions">
              <GitBranch className="h-4 w-4 mr-2" />
              Versions
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <DashboardStatsOverview />
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MonthlyComparisonCard
              mmpFiles={filteredMmpFiles}
              siteVisits={filteredSiteVisits}
            />
            
            {filteredMmpFiles.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Top Performing MMPs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {filteredMmpFiles
                      .map(mmp => {
                        const mmpVisits = filteredSiteVisits.filter(
                          v => v.mmpDetails?.mmpId === mmp.id
                        );
                        const completed = mmpVisits.filter(
                          v => isTerminalCompletionRawStatus(v.status)
                        ).length;
                        const rate = mmpVisits.length > 0 
                          ? Math.round((completed / mmpVisits.length) * 100)
                          : 0;
                        return { mmp, completed, total: mmpVisits.length, rate };
                      })
                      .sort((a, b) => b.rate - a.rate)
                      .slice(0, 5)
                      .map(({ mmp, completed, total, rate }) => (
                        <div 
                          key={mmp.id}
                          className="flex items-center justify-between p-2 bg-muted/30 rounded-md cursor-pointer hover:bg-muted/50"
                          onClick={() => {
                            setSelectedMmpId(mmp.id);
                            setActiveTab('mmp');
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{mmp.name}</span>
                            {mmp.classification && mmp.classification !== 'original' && (
                              <Badge variant="outline" className="text-xs">
                                {mmp.classification}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm">
                              {completed}/{total}
                            </span>
                            <Badge variant={rate >= 80 ? 'default' : 'secondary'}>
                              {rate}%
                            </Badge>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="monthly" className="space-y-4">
          <MonthlyComparisonCard
            mmpFiles={mmpFiles || []}
            siteVisits={siteVisits || []}
            className="col-span-full"
          />
        </TabsContent>

        <TabsContent value="mmp" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Select MMP</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {filteredMmpFiles.map(mmp => (
                      <div
                        key={mmp.id}
                        className={`p-2 rounded-md cursor-pointer transition-colors ${
                          selectedMmpId === mmp.id 
                            ? 'bg-primary/10 border border-primary/30' 
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => setSelectedMmpId(mmp.id)}
                        data-testid={`select-mmp-${mmp.id}`}
                      >
                        <div className="font-medium">{mmp.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          {mmp.month && mmp.year && (
                            <span>{mmp.month}/{mmp.year}</span>
                          )}
                          {mmp.classification && (
                            <Badge variant="outline" className="text-xs">
                              {mmp.classification}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    {filteredMmpFiles.length === 0 && (
                      <div className="text-center py-4 text-muted-foreground">
                        No MMPs match the current filters
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <div className="lg:col-span-2">
              {selectedMmp ? (
                <MMPPerformanceCard
                  mmp={selectedMmp}
                  siteVisits={siteVisits || []}
                />
              ) : (
                <Card className="h-full flex items-center justify-center">
                  <CardContent className="text-center py-12">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">
                      Select an MMP to view detailed performance metrics
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {(isAdmin || isFinance) && (
          <TabsContent value="versions" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <MMPVersionSelector
                mmpFiles={mmpFiles || []}
                selectedMmpId={selectedMmpId || undefined}
                onSelectMmp={(id) => {
                  setSelectedMmpId(id);
                  setActiveTab('mmp');
                }}
                showCompareMode={isAdmin || isFinance}
                onCompareMmps={(ids) => {
                  console.log('Compare MMPs:', ids);
                }}
              />
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Version Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4">
                    <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                      {(mmpFiles || []).filter(m => 
                        !m.classification || m.classification === 'original'
                      ).length}
                    </div>
                    <div className="text-sm text-blue-600">Original MMPs</div>
                  </div>
                  
                  <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-4">
                    <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                      {(mmpFiles || []).filter(m => 
                        m.classification === 'revised'
                      ).length}
                    </div>
                    <div className="text-sm text-amber-600">Revised</div>
                  </div>
                  
                  <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-4">
                    <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                      {(mmpFiles || []).filter(m => 
                        m.classification === 'additional'
                      ).length}
                    </div>
                    <div className="text-sm text-green-600">Additional</div>
                  </div>
                  
                  <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg p-4">
                    <div className="text-2xl font-bold text-purple-700 dark:text-purple-400">
                      {(mmpFiles || []).filter(m => 
                        m.classification === 'supplementary'
                      ).length}
                    </div>
                    <div className="text-sm text-purple-600">Supplementary</div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t">
                  <h4 className="text-sm font-medium mb-3">Active vs Superseded</h4>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm">Active</span>
                        <span className="text-sm font-medium">
                          {(mmpFiles || []).filter(m => 
                            !m.versionStatus || m.versionStatus === 'active'
                          ).length}
                        </span>
                      </div>
                      <div className="h-2 bg-green-200 dark:bg-green-900 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-green-500" 
                          style={{ 
                            width: `${((mmpFiles || []).filter(m => 
                              !m.versionStatus || m.versionStatus === 'active'
                            ).length / Math.max((mmpFiles || []).length, 1)) * 100}%` 
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm">Superseded</span>
                        <span className="text-sm font-medium">
                          {(mmpFiles || []).filter(m => 
                            m.versionStatus === 'superseded'
                          ).length}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gray-500" 
                          style={{ 
                            width: `${((mmpFiles || []).filter(m => 
                              m.versionStatus === 'superseded'
                            ).length / Math.max((mmpFiles || []).length, 1)) * 100}%` 
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default EnhancedDashboard;
