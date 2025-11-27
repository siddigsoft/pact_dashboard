import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SiteVisit } from '@/types';
import { MapPin, Clock, CheckCircle, AlertCircle, CalendarClock, AlertTriangle, ChevronRight } from 'lucide-react';
import { isOverdue } from '@/utils/siteVisitUtils';
import { sudanStates } from '@/data/sudanStates';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link } from 'react-router-dom';
import { format, isValid } from 'date-fns';
import { getStatusColor, getStatusLabel } from '@/utils/siteVisitUtils';

interface FOMSiteVisitsDashboardProps {
  visits: SiteVisit[];
}

type StatusFilter = 'all' | 'pending' | 'inProgress' | 'completed' | 'assigned' | 'scheduled' | 'overdue';

const FOMSiteVisitsDashboard: React.FC<FOMSiteVisitsDashboardProps> = ({ visits }) => {
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Group visits by state
  const stateGroups = useMemo(() => {
    const groups: Record<string, SiteVisit[]> = {};

    // Initialize all states
    sudanStates.forEach(state => {
      groups[state.name] = [];
    });

    // Group visits by state
    visits.forEach(visit => {
      const stateName = visit.state || 'Unknown';
      if (!groups[stateName]) {
        groups[stateName] = [];
      }
      groups[stateName].push(visit);
    });

    // Convert to array and sort by count
    return Object.entries(groups)
      .filter(([_, visits]) => visits.length > 0)
      .map(([stateName, stateVisits]) => ({
        stateName,
        visits: stateVisits,
        total: stateVisits.length,
        pending: stateVisits.filter(v => v.status?.toLowerCase() === 'pending').length,
        inProgress: stateVisits.filter(v => v.status?.toLowerCase() === 'inprogress' || v.status?.toLowerCase() === 'in_progress').length,
        completed: stateVisits.filter(v => v.status?.toLowerCase() === 'completed').length,
        assigned: stateVisits.filter(v => v.status?.toLowerCase() === 'assigned').length,
        scheduled: stateVisits.filter(v => ['assigned', 'permitverified'].includes(v.status?.toLowerCase() || '')).length,
        overdue: stateVisits.filter(v => isOverdue(v.dueDate, v.status)).length,
      }))
      .sort((a, b) => {
        if (b.total !== a.total) {
          return b.total - a.total;
        }
        return a.stateName.localeCompare(b.stateName);
      });
  }, [visits]);

  // Filter visits based on selected state and status
  const filteredVisits = useMemo(() => {
    if (!selectedState) return [];

    const stateGroup = stateGroups.find(g => g.stateName === selectedState);
    if (!stateGroup) return [];

    let filtered = stateGroup.visits;

    // Apply status filter
    if (statusFilter === 'pending') {
      filtered = filtered.filter(v => v.status?.toLowerCase() === 'pending');
    } else if (statusFilter === 'inProgress') {
      filtered = filtered.filter(v => v.status?.toLowerCase() === 'inprogress' || v.status?.toLowerCase() === 'in_progress');
    } else if (statusFilter === 'completed') {
      filtered = filtered.filter(v => v.status?.toLowerCase() === 'completed');
    } else if (statusFilter === 'assigned') {
      filtered = filtered.filter(v => v.status?.toLowerCase() === 'assigned');
    } else if (statusFilter === 'scheduled') {
      filtered = filtered.filter(v => ['assigned', 'permitverified'].includes(v.status?.toLowerCase() || ''));
    } else if (statusFilter === 'overdue') {
      filtered = filtered.filter(v => isOverdue(v.dueDate, v.status));
    }

    return filtered;
  }, [selectedState, statusFilter, stateGroups]);

  const totalVisits = visits.length;

  // Auto-select first state if none selected
  React.useEffect(() => {
    if (!selectedState && stateGroups.length > 0) {
      setSelectedState(stateGroups[0].stateName);
    }
  }, [selectedState, stateGroups]);

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Sites</p>
                <p className="text-2xl font-bold">{totalVisits}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <MapPin className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">States</p>
                <p className="text-2xl font-bold">{stateGroups.length}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                <MapPin className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-amber-600">
                  {visits.filter(v => v.status?.toLowerCase() === 'pending').length}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-green-600">
                  {visits.filter(v => v.status?.toLowerCase() === 'completed').length}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* States List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              States
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {stateGroups.map((state) => (
                <Button
                  key={state.stateName}
                  variant={selectedState === state.stateName ? 'default' : 'outline'}
                  className={`w-full justify-between h-auto py-4 px-4 ${
                    selectedState === state.stateName
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                  onClick={() => {
                    setSelectedState(state.stateName);
                    setStatusFilter('all'); // Reset status filter when changing state
                  }}
                >
                  <div className="flex items-center gap-3 flex-1 text-left">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <MapPin className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{state.stateName}</div>
                      <div className="text-xs opacity-80">
                        {state.total} {state.total === 1 ? 'site' : 'sites'}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 flex-shrink-0" />
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Sites List */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {selectedState ? `Sites in ${selectedState}` : 'Select a State'}
              </CardTitle>
              {selectedState && (
                <Badge variant="secondary">
                  {filteredVisits.length} {filteredVisits.length === 1 ? 'site' : 'sites'}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {selectedState ? (
              <>
                {/* Status Tabs */}
                <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)} className="mb-6">
                  <TabsList className="grid w-full grid-cols-6">
                    <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                    <TabsTrigger value="pending" className="text-xs">Pending</TabsTrigger>
                    <TabsTrigger value="inProgress" className="text-xs">In Progress</TabsTrigger>
                    <TabsTrigger value="completed" className="text-xs">Completed</TabsTrigger>
                    <TabsTrigger value="scheduled" className="text-xs">Scheduled</TabsTrigger>
                    <TabsTrigger value="overdue" className="text-xs">Overdue</TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Sites Grid */}
                {filteredVisits.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto">
                    {filteredVisits.map((visit) => (
                      <Card
                        key={visit.id}
                        className="hover:shadow-lg transition-all duration-200 cursor-pointer border-l-4 border-l-primary"
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-base truncate">{visit.siteName}</h3>
                              <p className="text-sm text-muted-foreground truncate">
                                {visit.siteCode || 'N/A'}
                              </p>
                            </div>
                            <Badge
                              variant="outline"
                              className={`${getStatusColor(visit.status, visit.dueDate)} flex-shrink-0 ml-2`}
                            >
                              {getStatusLabel(visit.status, visit.dueDate)}
                            </Badge>
                          </div>

                          <div className="space-y-2 mt-3">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <MapPin className="h-4 w-4" />
                              <span className="truncate">
                                {visit.locality || 'N/A'}, {visit.state || 'N/A'}
                              </span>
                            </div>

                            {visit.dueDate && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <CalendarClock className="h-4 w-4" />
                                <span>
                                  Due: {(() => {
                                    const d = new Date(visit.dueDate);
                                    return isValid(d) ? format(d, 'MMM d, yyyy') : 'N/A';
                                  })()}
                                </span>
                              </div>
                            )}

                            {visit.hub && (
                              <div className="text-xs text-muted-foreground">
                                Hub: <span className="font-medium">{visit.hub}</span>
                              </div>
                            )}

                            {visit.priority && (
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className={
                                    visit.priority === 'high'
                                      ? 'bg-red-50 text-red-700 border-red-200'
                                      : visit.priority === 'medium'
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-green-50 text-green-700 border-green-200'
                                  }
                                >
                                  {visit.priority.charAt(0).toUpperCase() + visit.priority.slice(1)} Priority
                                </Badge>
                              </div>
                            )}
                          </div>

                          <div className="mt-4 pt-3 border-t">
                            <Button
                              asChild
                              variant="outline"
                              size="sm"
                              className="w-full"
                            >
                              <Link to={`/site-visits/${visit.id}`}>
                                View Details
                              </Link>
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                      <MapPin className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground">
                      No sites found with status "{statusFilter}" in {selectedState}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                  <MapPin className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">Select a state to view sites</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default FOMSiteVisitsDashboard;

