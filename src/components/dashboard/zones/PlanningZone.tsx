import React, { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, FileText, Share2, MapPin, GitBranch, BarChart3 } from 'lucide-react';
import { DashboardCalendar } from '../DashboardCalendar';
import { MMPOverviewCard } from '../MMPOverviewCard';
import ForwardedMMPsCard from '../ForwardedMMPsCard';
import PlanningSiteVisitsMap from '../PlanningSiteVisitsMap';
import PlanningSiteVisitsList from '../PlanningSiteVisitsList';
import { Button } from '@/components/ui/button';
import { useSiteVisitContext } from '@/features/siteVisit/context/SiteVisitContext';
import { useAppContext } from '@/shared/context/AppContext';
import { useMMP } from '@/features/mmp/context/MMPContext';
import { useDashboardMmpFilter } from '@/features/dashboard/context/DashboardMmpFilterContext';
import { 
  DashboardFilters, 
  defaultFilterState,
  MMPVersionSelector,
  type DashboardFilterState 
} from '../filters';
import { MonthlyComparisonCard, MMPPerformanceCard } from '../analytics';
import { MMPVersionHistoryCard } from '@/features/mmp/components/MMPVersionHistoryCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isWithinInterval, format } from 'date-fns';
import type { MMPFile, MMPClassification } from '@/types';

export const PlanningZone: React.FC = () => {
  const [activeTab, setActiveTab] = useState('calendar');
  const [showMap, setShowMap] = useState(true);
  const { siteVisits: allSiteVisits } = useSiteVisitContext();
  const { users, roles } = useAppContext();
  const { mmpFiles } = useMMP();
  const { filterSiteVisitsByMmp, selectedMmpIds } = useDashboardMmpFilter();
  const siteVisits = useMemo(() => filterSiteVisitsByMmp(allSiteVisits || []), [allSiteVisits, filterSiteVisitsByMmp]);
  
  const [filters, setFilters] = useState<DashboardFilterState>(defaultFilterState);
  const [selectedMmpId, setSelectedMmpId] = useState<string | null>(null);
  const [mmpSubTab, setMmpSubTab] = useState('overview');

  const isAdmin = roles?.some(r => 
    ['admin', 'superadmin', 'countrydirector'].includes(r.toLowerCase())
  );
  const isFinance = roles?.some(r => 
    ['financialadmin', 'finance'].includes(r.toLowerCase())
  );
  const canAccessVersioning = isAdmin || isFinance;

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
      const monthNum = parseInt(filters.selectedMonth, 10);
      filtered = filtered.filter(mmp => {
        if (mmp.month && mmp.year) {
          const mmpMonth = typeof mmp.month === 'string' ? parseInt(mmp.month, 10) : mmp.month;
          return mmpMonth === monthNum && mmp.year === filters.selectedYear;
        }
        if (mmp.uploadedAt) {
          const date = new Date(mmp.uploadedAt);
          return date.getMonth() + 1 === monthNum && 
                 date.getFullYear() === filters.selectedYear;
        }
        return true;
      });
    } else if (filters.selectedYear) {
      filtered = filtered.filter(mmp => {
        if (mmp.year) return mmp.year === filters.selectedYear;
        if (mmp.uploadedAt) {
          return new Date(mmp.uploadedAt).getFullYear() === filters.selectedYear;
        }
        return true;
      });
    }
    
    if (filters.hub) {
      filtered = filtered.filter(mmp => mmp.hub === filters.hub);
    }
    
    if (filters.region) {
      filtered = filtered.filter(mmp => mmp.region === filters.region);
    }

    if (filters.mmpClassification && filters.mmpClassification !== 'all') {
      filtered = filtered.filter(mmp => 
        (mmp as any).classification === filters.mmpClassification
      );
    }
    
    if (filters.showActiveOnly) {
      filtered = filtered.filter(mmp => mmp.status !== 'deleted');
    }
    
    return filtered;
  }, [mmpFiles, filters]);

  const selectedMmp = useMemo(() => {
    if (!selectedMmpId) return null;
    return filteredMmpFiles.find(m => m.id === selectedMmpId) || null;
  }, [selectedMmpId, filteredMmpFiles]);

  const filteredSiteVisits = useMemo(() => {
    if (!siteVisits) return [];
    
    let filtered = [...siteVisits];
    
    if (selectedMmpId) {
      filtered = filtered.filter(sv => {
        const mmpId = sv.mmpDetails?.mmpId;
        return mmpId === selectedMmpId;
      });
    }
    
    if (filters.hub) {
      filtered = filtered.filter(sv => sv.hub === filters.hub);
    }
    
    if (filters.region) {
      filtered = filtered.filter(sv => sv.region === filters.region);
    }
    
    return filtered;
  }, [siteVisits, selectedMmpId, filters.hub, filters.region]);

  const mmpStats = useMemo(() => {
    const total = filteredMmpFiles.length;
    const approved = filteredMmpFiles.filter(m => m.status === 'approved').length;
    const pending = filteredMmpFiles.filter(m => m.status === 'pending').length;
    const verified = filteredMmpFiles.filter(m => m.status === 'verified').length;
    
    const byClassification = {
      original: filteredMmpFiles.filter(m => (m as any).classification === 'original').length,
      revised: filteredMmpFiles.filter(m => (m as any).classification === 'revised').length,
      additional: filteredMmpFiles.filter(m => (m as any).classification === 'additional').length,
      supplementary: filteredMmpFiles.filter(m => (m as any).classification === 'supplementary').length,
    };

    return { total, approved, pending, verified, byClassification };
  }, [filteredMmpFiles]);

  const handleFilterChange = (newFilters: DashboardFilterState) => {
    setFilters(newFilters);
  };

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4 md:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-purple-500/10 border border-purple-500/20 flex-shrink-0">
            <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold truncate">Planning & Scheduling</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">Strategic field operations planning</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 max-w-3xl h-auto p-1 bg-muted/30 mx-auto rounded-xl border border-border/40">
          <TabsTrigger value="calendar" className="gap-1.5 text-muted-foreground data-[state=active]:text-foreground data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border/60 min-h-[44px] sm:min-h-[40px] px-2 py-2 sm:py-1.5">
            <Calendar className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span className="text-xs sm:text-xs">Calendar</span>
          </TabsTrigger>
          <TabsTrigger value="site-visits" className="gap-1.5 text-muted-foreground data-[state=active]:text-foreground data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border/60 min-h-[44px] sm:min-h-[40px] px-2 py-2 sm:py-1.5">
            <MapPin className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span className="text-xs sm:text-xs">Site Visits</span>
          </TabsTrigger>
          <TabsTrigger value="mmps" className="gap-1.5 text-muted-foreground data-[state=active]:text-foreground data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border/60 min-h-[44px] sm:min-h-[40px] px-2 py-2 sm:py-1.5">
            <FileText className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span className="text-xs sm:text-xs">MMPs</span>
          </TabsTrigger>
          <TabsTrigger value="forwarded" className="gap-1.5 text-muted-foreground data-[state=active]:text-foreground data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border/60 min-h-[44px] sm:min-h-[40px] px-2 py-2 sm:py-1.5">
            <Share2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span className="text-xs sm:text-xs">Forwarded</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-4">
          <DashboardCalendar />
        </TabsContent>

        <TabsContent value="site-visits" className="mt-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h3 className="text-lg sm:text-xl font-semibold">Planned Site Visits</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMap(!showMap)}
              data-testid="button-toggle-map"
              className="h-9 px-4 text-xs gap-1.5 active:scale-95 transition-all self-start"
            >
              <MapPin className="h-4 w-4" />
              {showMap ? 'Hide Map' : 'Show Map'}
            </Button>
          </div>

          {showMap && <PlanningSiteVisitsMap siteVisits={siteVisits || []} teamMembers={users || []} />}
          <PlanningSiteVisitsList siteVisits={siteVisits || []} />
        </TabsContent>

        <TabsContent value="mmps" className="mt-4 space-y-4">
          <DashboardFilters
            filters={filters}
            onFilterChange={handleFilterChange}
            mmpFiles={mmpFiles || []}
            hubs={uniqueHubs}
            regions={uniqueRegions}
          />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-3">
              <div className="text-2xl font-bold">{mmpStats.total}</div>
              <div className="text-xs text-muted-foreground">Total MMPs</div>
            </Card>
            <Card className="p-3">
              <div className="text-2xl font-bold text-green-600">{mmpStats.approved}</div>
              <div className="text-xs text-muted-foreground">Approved</div>
            </Card>
            <Card className="p-3">
              <div className="text-2xl font-bold text-amber-600">{mmpStats.pending}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </Card>
            <Card className="p-3">
              <div className="text-2xl font-bold text-blue-600">{mmpStats.verified}</div>
              <div className="text-xs text-muted-foreground">Verified</div>
            </Card>
          </div>

          <Tabs value={mmpSubTab} onValueChange={setMmpSubTab} className="w-full">
            <TabsList className="w-full max-w-2xl rounded-lg border border-border/40 bg-muted/30 p-1">
              <TabsTrigger value="overview" className="flex-1 gap-1.5 text-muted-foreground data-[state=active]:text-foreground data-[state=active]:bg-background data-[state=active]:border data-[state=active]:border-border/60">
                <FileText className="h-3.5 w-3.5" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="analytics" className="flex-1 gap-1.5 text-muted-foreground data-[state=active]:text-foreground data-[state=active]:bg-background data-[state=active]:border data-[state=active]:border-border/60">
                <BarChart3 className="h-3.5 w-3.5" />
                Analytics
              </TabsTrigger>
              {canAccessVersioning && (
                <TabsTrigger value="versions" className="flex-1 gap-1.5 text-muted-foreground data-[state=active]:text-foreground data-[state=active]:bg-background data-[state=active]:border data-[state=active]:border-border/60">
                  <GitBranch className="h-3.5 w-3.5" />
                  Versions
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="overview" className="mt-4 space-y-4">
              <MMPVersionSelector
                mmpFiles={filteredMmpFiles}
                selectedMmpId={selectedMmpId}
                onSelectMmp={setSelectedMmpId}
              />
              
              {filteredMmpFiles.length > 0 ? (
                <div className="grid gap-4">
                  {filteredMmpFiles.slice(0, 10).map(mmp => (
                    <Card 
                      key={mmp.id} 
                      className={`cursor-pointer transition-all ${selectedMmpId === mmp.id ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
                      onClick={() => setSelectedMmpId(selectedMmpId === mmp.id ? null : mmp.id)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">{mmp.name || mmp.mmpId}</div>
                            <div className="text-sm text-muted-foreground">
                              {mmp.hub && <span>{mmp.hub}</span>}
                              {mmp.month && mmp.year && (
                                <span className="ml-2">{format(new Date(mmp.year, (typeof mmp.month === 'string' ? parseInt(mmp.month, 10) : mmp.month) - 1), 'MMMM yyyy')}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {(mmp as any).classification && (
                              <Badge variant="outline" className="text-xs">
                                {(mmp as any).classification}
                              </Badge>
                            )}
                            <Badge variant={
                              mmp.status === 'approved' ? 'default' :
                              mmp.status === 'pending' ? 'secondary' : 'outline'
                            }>
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
                <MonthlyComparisonCard 
                  mmpFiles={filteredMmpFiles}
                  siteVisits={filteredSiteVisits}
                />
                {selectedMmp && (
                  <MMPPerformanceCard 
                    mmp={selectedMmp}
                    siteVisits={filteredSiteVisits.filter(sv => sv.mmpDetails?.mmpId === selectedMmp.id)}
                  />
                )}
              </div>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Classification Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                      <div className="text-2xl font-bold text-blue-600">{mmpStats.byClassification.original}</div>
                      <div className="text-xs text-muted-foreground">Original</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30">
                      <div className="text-2xl font-bold text-amber-600">{mmpStats.byClassification.revised}</div>
                      <div className="text-xs text-muted-foreground">Revised</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950/30">
                      <div className="text-2xl font-bold text-green-600">{mmpStats.byClassification.additional}</div>
                      <div className="text-xs text-muted-foreground">Additional</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30">
                      <div className="text-2xl font-bold text-purple-600">{mmpStats.byClassification.supplementary}</div>
                      <div className="text-xs text-muted-foreground">Supplementary</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {canAccessVersioning && (
              <TabsContent value="versions" className="mt-4 space-y-4">
                <Card className="p-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-sm font-medium">Filter by Classification:</span>
                    <Select 
                      value={filters.mmpClassification} 
                      onValueChange={(val) => handleFilterChange({
                        ...filters, 
                        mmpClassification: val as MMPClassification | 'all'
                      })}
                    >
                      <SelectTrigger className="w-[180px]" data-testid="select-classification">
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
                    onSelectVersion={(id) => setSelectedMmpId(id)}
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
        </TabsContent>

        <TabsContent value="forwarded" className="mt-4">
          <ForwardedMMPsCard />
        </TabsContent>
      </Tabs>
    </div>
  );
};
