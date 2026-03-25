import React, { useMemo } from 'react';
import { format, subMonths, startOfMonth, endOfMonth, subYears } from 'date-fns';
import { Calendar, Filter, X, ChevronDown, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { MMPFile, MMPClassification } from '@/types';

export interface DashboardFilterState {
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
  selectedMonth: string | null;
  selectedYear: number | null;
  selectedMmpIds: string[];
  mmpClassification: MMPClassification | 'all';
  showActiveOnly: boolean;
  quickFilter: 'thisMonth' | 'lastMonth' | 'last3Months' | 'thisYear' | 'custom' | null;
  hub: string | null;
  region: string | null;
}

export const defaultFilterState: DashboardFilterState = {
  dateRange: { start: null, end: null },
  selectedMonth: null,
  selectedYear: null,
  selectedMmpIds: [],
  mmpClassification: 'all',
  showActiveOnly: false,
  quickFilter: null,
  hub: null,
  region: null,
};

interface DashboardFiltersProps {
  filters: DashboardFilterState;
  onFilterChange: (filters: DashboardFilterState) => void;
  mmpFiles?: MMPFile[];
  hubs?: string[];
  regions?: string[];
  showMmpFilter?: boolean;
  showClassificationFilter?: boolean;
  showHubFilter?: boolean;
  showRegionFilter?: boolean;
  compact?: boolean;
  className?: string;
}

export const DashboardFilters: React.FC<DashboardFiltersProps> = ({
  filters,
  onFilterChange,
  mmpFiles = [],
  hubs = [],
  regions = [],
  showMmpFilter = true,
  showClassificationFilter = true,
  showHubFilter = true,
  showRegionFilter = true,
  compact = false,
  className,
}) => {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const months = [
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
  ];

  const classificationOptions: { value: MMPClassification | 'all'; label: string }[] = [
    { value: 'all', label: 'All Types' },
    { value: 'original', label: 'Original' },
    { value: 'revised', label: 'Revised' },
    { value: 'additional', label: 'Additional' },
    { value: 'supplementary', label: 'Supplementary' },
  ];

  const uniqueHubs = useMemo(() => {
    const hubSet = new Set(hubs);
    mmpFiles.forEach(mmp => mmp.hub && hubSet.add(mmp.hub));
    return Array.from(hubSet).sort();
  }, [hubs, mmpFiles]);

  const uniqueRegions = useMemo(() => {
    const regionSet = new Set(regions);
    mmpFiles.forEach(mmp => mmp.region && regionSet.add(mmp.region));
    return Array.from(regionSet).sort();
  }, [regions, mmpFiles]);

  const filteredMmpOptions = useMemo(() => {
    let filtered = [...mmpFiles];
    
    if (filters.selectedMonth && filters.selectedYear) {
      filtered = filtered.filter(mmp => 
        mmp.month === filters.selectedMonth && mmp.year === filters.selectedYear
      );
    }
    
    if (filters.mmpClassification !== 'all') {
      filtered = filtered.filter(mmp => 
        mmp.classification === filters.mmpClassification
      );
    }
    
    if (filters.showActiveOnly) {
      filtered = filtered.filter(mmp => 
        mmp.versionStatus === 'active' || !mmp.versionStatus
      );
    }
    
    return filtered;
  }, [mmpFiles, filters.selectedMonth, filters.selectedYear, filters.mmpClassification, filters.showActiveOnly]);

  const applyQuickFilter = (quickFilter: DashboardFilterState['quickFilter']) => {
    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = null;
    let month: string | null = null;
    let year: number | null = null;

    switch (quickFilter) {
      case 'thisMonth':
        start = startOfMonth(now);
        end = endOfMonth(now);
        month = format(now, 'MM');
        year = now.getFullYear();
        break;
      case 'lastMonth':
        const lastMonth = subMonths(now, 1);
        start = startOfMonth(lastMonth);
        end = endOfMonth(lastMonth);
        month = format(lastMonth, 'MM');
        year = lastMonth.getFullYear();
        break;
      case 'last3Months':
        start = startOfMonth(subMonths(now, 2));
        end = endOfMonth(now);
        break;
      case 'thisYear':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
        year = now.getFullYear();
        break;
      case 'custom':
        break;
    }

    onFilterChange({
      ...filters,
      quickFilter,
      dateRange: { start, end },
      selectedMonth: month,
      selectedYear: year,
    });
  };

  const clearFilters = () => {
    onFilterChange(defaultFilterState);
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.selectedMonth || filters.selectedYear) count++;
    if (filters.selectedMmpIds.length > 0) count++;
    if (filters.mmpClassification !== 'all') count++;
    if (filters.hub) count++;
    if (filters.region) count++;
    return count;
  }, [filters]);

  if (compact) {
    return (
      <div className={cn("flex flex-wrap items-center gap-2", className)} data-testid="dashboard-filters-compact">
        <div className="flex gap-1">
          {['thisMonth', 'lastMonth', 'last3Months'].map((qf) => (
            <Button
              key={qf}
              size="sm"
              variant={filters.quickFilter === qf ? 'default' : 'outline'}
              onClick={() => applyQuickFilter(qf as DashboardFilterState['quickFilter'])}
              data-testid={`filter-quick-${qf}`}
            >
              {qf === 'thisMonth' ? 'This Month' : qf === 'lastMonth' ? 'Last Month' : 'Last 3 Months'}
            </Button>
          ))}
        </div>
        
        {showMmpFilter && filteredMmpOptions.length > 0 && (
          <Select
            value={filters.selectedMmpIds[0] || 'all'}
            onValueChange={(value) => 
              onFilterChange({
                ...filters,
                selectedMmpIds: value === 'all' ? [] : [value],
              })
            }
          >
            <SelectTrigger className="w-[180px]" data-testid="filter-mmp-select">
              <SelectValue placeholder="Select MMP" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All MMPs</SelectItem>
              {filteredMmpOptions.map((mmp) => (
                <SelectItem key={mmp.id} value={mmp.id}>
                  {mmp.name}
                  {mmp.classification && mmp.classification !== 'original' && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({mmp.classification})
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {activeFilterCount > 0 && (
          <Button size="sm" variant="ghost" onClick={clearFilters} data-testid="filter-clear">
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card className={cn("mb-4", className)} data-testid="dashboard-filters">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters</span>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {activeFilterCount} active
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 border rounded-md p-1">
              {[
                { key: 'thisMonth', label: 'This Month' },
                { key: 'lastMonth', label: 'Last Month' },
                { key: 'last3Months', label: '3 Months' },
                { key: 'thisYear', label: 'This Year' },
              ].map(({ key, label }) => (
                <Button
                  key={key}
                  size="sm"
                  variant={filters.quickFilter === key ? 'default' : 'ghost'}
                  onClick={() => applyQuickFilter(key as DashboardFilterState['quickFilter'])}
                  className="text-xs"
                  data-testid={`filter-quick-${key}`}
                >
                  {label}
                </Button>
              ))}
            </div>

            <Select
              value={filters.selectedMonth || 'all'}
              onValueChange={(value) =>
                onFilterChange({
                  ...filters,
                  selectedMonth: value === 'all' ? null : value,
                  quickFilter: 'custom',
                })
              }
            >
              <SelectTrigger className="w-[130px]" data-testid="filter-month-select">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Months</SelectItem>
                {months.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.selectedYear?.toString() || 'all'}
              onValueChange={(value) =>
                onFilterChange({
                  ...filters,
                  selectedYear: value === 'all' ? null : parseInt(value),
                  quickFilter: 'custom',
                })
              }
            >
              <SelectTrigger className="w-[100px]" data-testid="filter-year-select">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={y.toString()}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {showClassificationFilter && (
              <Select
                value={filters.mmpClassification}
                onValueChange={(value) =>
                  onFilterChange({
                    ...filters,
                    mmpClassification: value as MMPClassification | 'all',
                  })
                }
              >
                <SelectTrigger className="w-[140px]" data-testid="filter-classification-select">
                  <SelectValue placeholder="MMP Type" />
                </SelectTrigger>
                <SelectContent>
                  {classificationOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {showMmpFilter && filteredMmpOptions.length > 0 && (
              <Select
                value={filters.selectedMmpIds[0] || 'all'}
                onValueChange={(value) =>
                  onFilterChange({
                    ...filters,
                    selectedMmpIds: value === 'all' ? [] : [value],
                  })
                }
              >
                <SelectTrigger className="w-[180px]" data-testid="filter-mmp-select">
                  <SelectValue placeholder="Select MMP" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All MMPs</SelectItem>
                  {filteredMmpOptions.map((mmp) => (
                    <SelectItem key={mmp.id} value={mmp.id}>
                      <div className="flex items-center gap-2">
                        <span>{mmp.name}</span>
                        {mmp.version && (
                          <span className="text-xs text-muted-foreground">
                            v{mmp.version.major}.{mmp.version.minor}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {showHubFilter && uniqueHubs.length > 0 && (
              <Select
                value={filters.hub || 'all'}
                onValueChange={(value) =>
                  onFilterChange({ ...filters, hub: value === 'all' ? null : value })
                }
              >
                <SelectTrigger className="w-[130px]" data-testid="filter-hub-select">
                  <SelectValue placeholder="Hub" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Hubs</SelectItem>
                  {uniqueHubs.map((hub) => (
                    <SelectItem key={hub} value={hub}>
                      {hub}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {showRegionFilter && uniqueRegions.length > 0 && (
              <Select
                value={filters.region || 'all'}
                onValueChange={(value) =>
                  onFilterChange({ ...filters, region: value === 'all' ? null : value })
                }
              >
                <SelectTrigger className="w-[130px]" data-testid="filter-region-select">
                  <SelectValue placeholder="Region" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Regions</SelectItem>
                  {uniqueRegions.map((region) => (
                    <SelectItem key={region} value={region}>
                      {region}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="flex items-center gap-2 ml-2">
              <Checkbox
                id="activeOnly"
                checked={filters.showActiveOnly}
                onCheckedChange={(checked) =>
                  onFilterChange({ ...filters, showActiveOnly: !!checked })
                }
                data-testid="filter-active-only"
              />
              <Label htmlFor="activeOnly" className="text-sm cursor-pointer">
                Active only
              </Label>
            </div>

            {activeFilterCount > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={clearFilters}
                className="text-muted-foreground"
                data-testid="filter-clear"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Reset
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DashboardFilters;
