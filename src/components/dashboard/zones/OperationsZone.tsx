import React, { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { GradientStatCard } from '@/components/ui/gradient-stat-card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  ClipboardList, 
  Calendar, 
  DollarSign, 
  MapPin, 
  Activity,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  Users,
  Zap,
  Target,
  BarChart3,
  ExternalLink,
  Filter,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import SiteVisitsOverview from '../SiteVisitsOverview';
import UpcomingSiteVisitsCard from '../UpcomingSiteVisitsCard';
import { SiteVisitCostSummary } from '../SiteVisitCostSummary';
import { DashboardCalendar } from '../DashboardCalendar';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { isAfter, addDays } from 'date-fns';

type MetricCardType = 'total' | 'completed' | 'assigned' | 'pending' | 'overdue' | 'performance' | null;

interface Filters {
  hub: string;
  state: string;
  locality: string;
  coordinator: string;
  enumerator: string;
  status: string;
}

export const OperationsZone: React.FC = () => {
  const { siteVisits } = useSiteVisitContext();
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedCard, setSelectedCard] = useState<MetricCardType>(null);
  const [filters, setFilters] = useState<Filters>({
    hub: '',
    state: '',
    locality: '',
    coordinator: '',
    enumerator: '',
    status: ''
  });

  const upcomingVisits = siteVisits
    .filter(v => {
      const dueDate = new Date(v.dueDate);
      const today = new Date();
      const twoWeeksFromNow = addDays(today, 14);
      return isAfter(dueDate, today) && isAfter(twoWeeksFromNow, dueDate);
    })
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 5);

  // Calculate metrics
  const totalVisits = siteVisits.length;
  const completedVisits = siteVisits.filter(v => v.status === 'completed').length;
  const pendingVisits = siteVisits.filter(v => v.status === 'pending' || v.status === 'permitVerified').length;
  const assignedVisits = siteVisits.filter(v => v.status === 'assigned' || v.status === 'inProgress').length;
  const overdueVisits = siteVisits.filter(v => {
    const dueDate = new Date(v.dueDate);
    const today = new Date();
    return dueDate < today && v.status !== 'completed';
  }).length;
  const completionRate = totalVisits > 0 ? Math.round((completedVisits / totalVisits) * 100) : 0;

  // Get filtered visits based on selected card
  const getFilteredVisits = (cardType: MetricCardType) => {
    switch (cardType) {
      case 'total':
        return siteVisits;
      case 'completed':
        return siteVisits.filter(v => v.status === 'completed');
      case 'assigned':
        return siteVisits.filter(v => v.status === 'assigned' || v.status === 'inProgress');
      case 'pending':
        return siteVisits.filter(v => v.status === 'pending' || v.status === 'permitVerified');
      case 'overdue':
        return siteVisits.filter(v => {
          const dueDate = new Date(v.dueDate);
          const today = new Date();
          return dueDate < today && v.status !== 'completed';
        });
      case 'performance':
        return siteVisits.filter(v => v.status === 'completed');
      default:
        return [];
    }
  };

  const getCardTitle = (cardType: MetricCardType) => {
    switch (cardType) {
      case 'total': return 'All Operations';
      case 'completed': return 'Completed Visits';
      case 'assigned': return 'Active Operations';
      case 'pending': return 'Pending Queue';
      case 'overdue': return 'Overdue Alerts';
      case 'performance': return 'Performance Metrics';
      default: return '';
    }
  };

  const baseFilteredVisits = getFilteredVisits(selectedCard);

  // Extract unique values for filter dropdowns with counts
  const hubsWithCounts = useMemo(() => {
    const hubs = [...new Set(baseFilteredVisits.map(v => v.hub).filter(Boolean))];
    return hubs.map(hub => ({
      value: hub,
      count: baseFilteredVisits.filter(v => v.hub === hub).length
    })).sort((a, b) => a.value.localeCompare(b.value));
  }, [baseFilteredVisits]);

  const statesWithCounts = useMemo(() => {
    const states = [...new Set(baseFilteredVisits.map(v => v.state).filter(Boolean))];
    return states.map(state => ({
      value: state,
      count: baseFilteredVisits.filter(v => v.state === state).length
    })).sort((a, b) => a.value.localeCompare(b.value));
  }, [baseFilteredVisits]);

  const localitiesWithCounts = useMemo(() => {
    const localities = [...new Set(baseFilteredVisits.map(v => v.locality).filter(Boolean))];
    return localities.map(locality => ({
      value: locality,
      count: baseFilteredVisits.filter(v => v.locality === locality).length
    })).sort((a, b) => a.value.localeCompare(b.value));
  }, [baseFilteredVisits]);

  const coordinatorsWithCounts = useMemo(() => {
    const coordinators = [...new Set(baseFilteredVisits.map(v => v.team?.coordinator).filter(Boolean))];
    return coordinators.map(coordinator => ({
      value: coordinator,
      count: baseFilteredVisits.filter(v => v.team?.coordinator === coordinator).length
    })).sort((a, b) => a.value.localeCompare(b.value));
  }, [baseFilteredVisits]);

  const enumeratorsWithCounts = useMemo(() => {
    const enumerators = [...new Set(baseFilteredVisits.map(v => v.assignedTo).filter(Boolean))];
    return enumerators.map(enumerator => ({
      value: enumerator,
      count: baseFilteredVisits.filter(v => v.assignedTo === enumerator).length
    })).sort((a, b) => a.value.localeCompare(b.value));
  }, [baseFilteredVisits]);

  const statusesWithCounts = useMemo(() => {
    const statuses = [...new Set(baseFilteredVisits.map(v => v.status).filter(Boolean))];
    return statuses.map(status => ({
      value: status,
      count: baseFilteredVisits.filter(v => v.status === status).length
    })).sort((a, b) => a.value.localeCompare(b.value));
  }, [baseFilteredVisits]);

  // Apply filters to data
  const filteredVisits = useMemo(() => {
    return baseFilteredVisits.filter(visit => {
      if (filters.hub && visit.hub !== filters.hub) return false;
      if (filters.state && visit.state !== filters.state) return false;
      if (filters.locality && visit.locality !== filters.locality) return false;
      if (filters.coordinator && visit.team?.coordinator !== filters.coordinator) return false;
      if (filters.enumerator && visit.assignedTo !== filters.enumerator) return false;
      if (filters.status && visit.status !== filters.status) return false;
      return true;
    });
  }, [baseFilteredVisits, filters]);

  // Reset filters when card changes
  const handleCardClick = (cardType: MetricCardType) => {
    setSelectedCard(cardType);
    setFilters({
      hub: '',
      state: '',
      locality: '',
      coordinator: '',
      enumerator: '',
      status: ''
    });
  };

  // Clear all filters
  const clearAllFilters = () => {
    setFilters({
      hub: '',
      state: '',
      locality: '',
      coordinator: '',
      enumerator: '',
      status: ''
    });
  };

  // Count active filters
  const activeFilterCount = Object.values(filters).filter(v => v !== '').length;

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
            <ClipboardList className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Operations Center</h1>
            <p className="text-sm text-muted-foreground">
              Field operations command and control
            </p>
          </div>
        </div>
      </div>

      {/* Users Management Style Gradient Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <GradientStatCard
          title="Total Operations"
          value={totalVisits}
          subtitle="All site visits"
          icon={Activity}
          color="blue"
          onClick={() => handleCardClick('total')}
          data-testid="card-metric-total"
        />

        <GradientStatCard
          title="Completed Visits"
          value={completedVisits}
          subtitle={`${completionRate}% completion rate`}
          icon={CheckCircle2}
          color="green"
          onClick={() => handleCardClick('completed')}
          data-testid="card-metric-completed"
        />

        <GradientStatCard
          title="Active Operations"
          value={assignedVisits}
          subtitle="In progress now"
          icon={Users}
          color="cyan"
          onClick={() => handleCardClick('assigned')}
          data-testid="card-metric-assigned"
        />

        <GradientStatCard
          title="Pending Queue"
          value={pendingVisits}
          subtitle="Awaiting assignment"
          icon={Clock}
          color="orange"
          onClick={() => handleCardClick('pending')}
          data-testid="card-metric-pending"
        />

        <GradientStatCard
          title="Overdue Alerts"
          value={overdueVisits}
          subtitle={overdueVisits > 0 ? "Requires attention" : "All on schedule"}
          icon={AlertCircle}
          color="orange"
          onClick={() => handleCardClick('overdue')}
          data-testid="card-metric-overdue"
        />

        <GradientStatCard
          title="Performance Score"
          value={`${completionRate}%`}
          subtitle={completionRate >= 75 ? "Excellent efficiency" : "Room for improvement"}
          icon={BarChart3}
          color="purple"
          onClick={() => handleCardClick('performance')}
          data-testid="card-metric-performance"
        />
      </div>

      {/* IT-Style Tab Navigation */}
      <Card className="border-border/50 bg-gradient-to-r from-muted/30 via-background to-muted/30">
        <CardContent className="p-2">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 h-auto p-0.5 bg-transparent border border-border/30">
              <TabsTrigger 
                value="overview" 
                className="gap-1 px-2 py-1.5 data-[state=active]:bg-primary/10 data-[state=active]:border-primary/20 data-[state=active]:shadow-sm border border-transparent"
                data-testid="tab-overview"
              >
                <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center">
                  <ClipboardList className="h-3 w-3 text-primary" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide">Overview</span>
              </TabsTrigger>
              <TabsTrigger 
                value="upcoming" 
                className="gap-1 px-2 py-1.5 data-[state=active]:bg-blue-500/10 data-[state=active]:border-blue-500/20 data-[state=active]:shadow-sm border border-transparent"
                data-testid="tab-upcoming"
              >
                <div className="w-5 h-5 rounded bg-blue-500/10 flex items-center justify-center">
                  <Calendar className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide">Upcoming</span>
              </TabsTrigger>
              <TabsTrigger 
                value="calendar" 
                className="gap-1 px-2 py-1.5 data-[state=active]:bg-green-500/10 data-[state=active]:border-green-500/20 data-[state=active]:shadow-sm border border-transparent"
                data-testid="tab-calendar"
              >
                <div className="w-5 h-5 rounded bg-green-500/10 flex items-center justify-center">
                  <MapPin className="h-3 w-3 text-green-600 dark:text-green-400" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide">Calendar</span>
              </TabsTrigger>
              <TabsTrigger 
                value="costs" 
                className="gap-1 px-2 py-1.5 data-[state=active]:bg-orange-500/10 data-[state=active]:border-orange-500/20 data-[state=active]:shadow-sm border border-transparent"
                data-testid="tab-costs"
              >
                <div className="w-5 h-5 rounded bg-orange-500/10 flex items-center justify-center">
                  <DollarSign className="h-3 w-3 text-orange-600 dark:text-orange-400" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide">Costs</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-3 space-y-3">
              <SiteVisitsOverview />
            </TabsContent>

            <TabsContent value="upcoming" className="mt-3">
              <UpcomingSiteVisitsCard siteVisits={upcomingVisits} />
            </TabsContent>

            <TabsContent value="calendar" className="mt-3">
              <DashboardCalendar />
            </TabsContent>

            <TabsContent value="costs" className="mt-3">
              <SiteVisitCostSummary />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={selectedCard !== null} onOpenChange={(open) => !open && setSelectedCard(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedCard === 'total' && <Activity className="h-5 w-5 text-primary" />}
              {selectedCard === 'completed' && <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />}
              {selectedCard === 'assigned' && <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
              {selectedCard === 'pending' && <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400" />}
              {selectedCard === 'overdue' && <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />}
              {selectedCard === 'performance' && <BarChart3 className="h-5 w-5 text-purple-600 dark:text-purple-400" />}
              <span>{getCardTitle(selectedCard)}</span>
              <Badge variant="outline" className="ml-auto">
                {filteredVisits.length} {filteredVisits.length === 1 ? 'visit' : 'visits'}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Detailed breakdown of {getCardTitle(selectedCard).toLowerCase()}
            </DialogDescription>
          </DialogHeader>

          {/* Filter Bar */}
          <div className="space-y-2 border-b pb-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters</span>
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="h-5 text-[10px]">
                  {activeFilterCount} active
                </Badge>
              )}
              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                  className="ml-auto h-7 px-2 text-xs"
                  data-testid="button-clear-filters"
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear all
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              {/* Hub Filter */}
              <Select
                value={filters.hub}
                onValueChange={(value) => setFilters(prev => ({ ...prev, hub: value === 'all' ? '' : value }))}
              >
                <SelectTrigger className="h-8 text-xs" data-testid="select-filter-hub">
                  <SelectValue placeholder="Hub" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Hubs ({baseFilteredVisits.length})</SelectItem>
                  {hubsWithCounts.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.value} ({item.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* State Filter */}
              <Select
                value={filters.state}
                onValueChange={(value) => setFilters(prev => ({ ...prev, state: value === 'all' ? '' : value }))}
              >
                <SelectTrigger className="h-8 text-xs" data-testid="select-filter-state">
                  <SelectValue placeholder="State" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States ({baseFilteredVisits.length})</SelectItem>
                  {statesWithCounts.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.value} ({item.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Locality Filter */}
              <Select
                value={filters.locality}
                onValueChange={(value) => setFilters(prev => ({ ...prev, locality: value === 'all' ? '' : value }))}
              >
                <SelectTrigger className="h-8 text-xs" data-testid="select-filter-locality">
                  <SelectValue placeholder="Locality" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Localities ({baseFilteredVisits.length})</SelectItem>
                  {localitiesWithCounts.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.value} ({item.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Coordinator Filter */}
              <Select
                value={filters.coordinator}
                onValueChange={(value) => setFilters(prev => ({ ...prev, coordinator: value === 'all' ? '' : value }))}
              >
                <SelectTrigger className="h-8 text-xs" data-testid="select-filter-coordinator">
                  <SelectValue placeholder="Coordinator" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Coordinators ({baseFilteredVisits.length})</SelectItem>
                  {coordinatorsWithCounts.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.value} ({item.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Enumerator Filter */}
              <Select
                value={filters.enumerator}
                onValueChange={(value) => setFilters(prev => ({ ...prev, enumerator: value === 'all' ? '' : value }))}
              >
                <SelectTrigger className="h-8 text-xs" data-testid="select-filter-enumerator">
                  <SelectValue placeholder="Enumerator" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Enumerators ({baseFilteredVisits.length})</SelectItem>
                  {enumeratorsWithCounts.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.value} ({item.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Status Filter */}
              <Select
                value={filters.status}
                onValueChange={(value) => setFilters(prev => ({ ...prev, status: value === 'all' ? '' : value }))}
              >
                <SelectTrigger className="h-8 text-xs" data-testid="select-filter-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses ({baseFilteredVisits.length})</SelectItem>
                  {statusesWithCounts.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.value} ({item.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto border rounded-md">
            {filteredVisits.length > 0 ? (
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>MMP Name</TableHead>
                    <TableHead className="w-[200px]">Site Name</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVisits.map((visit) => {
                    const dueDate = new Date(visit.dueDate);
                    const isOverdue = dueDate < new Date() && visit.status !== 'completed';
                    
                    return (
                      <TableRow key={visit.id} className="hover:bg-muted/50">
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-xs font-medium text-primary">
                              {visit.mmpDetails?.mmpId || visit.projectName || 'N/A'}
                            </span>
                            {visit.mmpDetails?.projectName && visit.mmpDetails.mmpId && (
                              <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                                {visit.mmpDetails.projectName}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex flex-col">
                            <span className="text-sm">{visit.siteName}</span>
                            {visit.siteCode && (
                              <span className="text-xs text-muted-foreground">{visit.siteCode}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs">{visit.locality}, {visit.state}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className={`text-xs ${isOverdue ? 'text-red-600 dark:text-red-400 font-semibold' : ''}`}>
                              {format(dueDate, 'MMM dd, yyyy')}
                            </span>
                            {isOverdue && (
                              <span className="text-[10px] text-red-600 dark:text-red-400">Overdue</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              visit.status === 'completed' ? 'default' : 
                              visit.status === 'assigned' || visit.status === 'inProgress' ? 'secondary' : 
                              'outline'
                            }
                            className="text-[10px]"
                          >
                            {visit.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {visit.assignedTo || 'Unassigned'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => window.location.href = `/site-visits/${visit.id}`}
                            data-testid={`button-view-visit-${visit.id}`}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Activity className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No visits found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  There are no site visits in this category
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
